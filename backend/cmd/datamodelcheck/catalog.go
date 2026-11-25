package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// catalog.go — 불변식 2(카탈로그 ↔ 코드 쿼리 지점)의 양쪽 파싱.
//
// 대상: docs/data-model/query-patterns.md (패턴 표 · 수동 형태 표 · 미사용 인덱스 표)
// 코드: scope − exclude 안의 site ERE에 걸리는 줄 → (호출 지점, 형태) 또는 (호출 지점, 추출 불가 사유)

type patternRow struct {
	ID      string
	Shape   string
	Support string
	Sites   []string
}

type manualRow struct {
	Site      string
	PatternID string
	SQL       string
	Reason    string
}

type catalog struct {
	Patterns []patternRow
	Manual   []manualRow
}

// ---------------------------------------------------------------- 문서 파싱

// sectionBody returns the body of a "## <name>" section.
func sectionBody(text, name string) (string, bool) {
	lines := strings.Split(text, "\n")
	var b strings.Builder
	found := false
	for _, l := range lines {
		if strings.HasPrefix(l, "## ") {
			if found {
				break
			}
			if strings.TrimSpace(strings.TrimPrefix(l, "## ")) == name {
				found = true
			}
			continue
		}
		if found {
			b.WriteString(l)
			b.WriteString("\n")
		}
	}
	return b.String(), found
}

// splitTableRow splits a markdown table row on unescaped pipes.
func splitTableRow(line string) []string {
	line = strings.TrimSpace(line)
	line = strings.TrimPrefix(line, "|")
	line = strings.TrimSuffix(line, "|")
	var cells []string
	var cur strings.Builder
	esc := false
	for _, r := range line {
		switch {
		case esc:
			if r != '|' {
				cur.WriteRune('\\')
			}
			cur.WriteRune(r)
			esc = false
		case r == '\\':
			esc = true
		case r == '|':
			cells = append(cells, strings.TrimSpace(cur.String()))
			cur.Reset()
		default:
			cur.WriteRune(r)
		}
	}
	cells = append(cells, strings.TrimSpace(cur.String()))
	return cells
}

func isSeparatorRow(cells []string) bool {
	if len(cells) == 0 {
		return false
	}
	for _, c := range cells {
		if c == "" {
			return false
		}
		for _, r := range c {
			if r != '-' && r != ':' && r != ' ' {
				return false
			}
		}
	}
	return true
}

// tableRows returns the data rows of the first markdown table in body.
func tableRows(body string) ([][]string, error) {
	lines := strings.Split(body, "\n")
	for i := 0; i < len(lines); i++ {
		if !strings.HasPrefix(strings.TrimSpace(lines[i]), "|") {
			continue
		}
		header := splitTableRow(lines[i])
		if len(header) == 0 {
			return nil, fmt.Errorf("표 머리줄이 비었다")
		}
		if i+1 >= len(lines) || !isSeparatorRow(splitTableRow(lines[i+1])) {
			return nil, fmt.Errorf("표 머리줄 뒤에 구분 줄이 없다")
		}
		var rows [][]string
		for j := i + 2; j < len(lines); j++ {
			trimmed := strings.TrimSpace(lines[j])
			if !strings.HasPrefix(trimmed, "|") {
				break
			}
			rows = append(rows, splitTableRow(trimmed))
		}
		return rows, nil
	}
	return nil, fmt.Errorf("표를 찾지 못했다")
}

func cell(s string) string {
	s = strings.TrimSpace(s)
	s = strings.Trim(s, "`")
	return s
}

// canonShape normalizes a 「형태」 cell to the canonical comparison form.
func canonShape(s string) string {
	parts := strings.Split(s, "|")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		out = append(out, strings.Join(strings.Fields(p), " "))
	}
	return strings.Join(out, " | ")
}

func parseCatalog(path string) (*catalog, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("query-patterns.md: %w", err)
	}
	text := string(raw)
	cat := &catalog{}

	patBody, ok := sectionBody(text, "패턴")
	if !ok {
		return nil, fmt.Errorf("query-patterns.md: 「패턴」 절이 없다")
	}
	patRows, err := tableRows(patBody)
	if err != nil {
		return nil, fmt.Errorf("query-patterns.md 패턴 표: %w", err)
	}
	for _, r := range patRows {
		if len(r) < 4 {
			return nil, fmt.Errorf("query-patterns.md 패턴 행의 칸이 4개보다 적다: %v", r)
		}
		row := patternRow{ID: cell(r[0]), Shape: canonShape(cell(r[1])), Support: cell(r[2])}
		for _, s := range strings.Split(r[3], ",") {
			if s = cell(s); s != "" {
				row.Sites = append(row.Sites, s)
			}
		}
		cat.Patterns = append(cat.Patterns, row)
	}

	manBody, ok := sectionBody(text, "수동 형태")
	if !ok {
		return nil, fmt.Errorf("query-patterns.md: 「수동 형태」 절이 없다")
	}
	manRows, err := tableRows(manBody)
	if err != nil {
		return nil, fmt.Errorf("query-patterns.md 수동 형태 표: %w", err)
	}
	for _, r := range manRows {
		if len(r) < 4 {
			return nil, fmt.Errorf("query-patterns.md 수동 형태 행의 칸이 4개보다 적다: %v", r)
		}
		cat.Manual = append(cat.Manual, manualRow{
			Site:      cell(r[0]),
			PatternID: cell(r[1]),
			SQL:       cell(r[2]),
			Reason:    cell(r[3]),
		})
	}
	return cat, nil
}

// ---------------------------------------------------------------- 코드 지점

type codeSite struct {
	File   string `json:"file"`
	Line   int    `json:"line"`
	Text   string `json:"text"`
	Call   string `json:"call"`
	Shape  string `json:"shape,omitempty"`
	SQL    string `json:"sql,omitempty"`
	Reason string `json:"reason,omitempty"`
}

// execGit runs a git command and returns its stdout.
func execGit(args ...string) ([]byte, error) {
	out, err := exec.Command("git", args...).Output()
	if err != nil {
		return nil, fmt.Errorf("git %s: %w", strings.Join(args, " "), err)
	}
	return out, nil
}

var (
	reFuncDecl = regexp.MustCompile(`^func\s+(?:\(\s*\w+\s+\*?([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(`)
	reSQLLead  = regexp.MustCompile(`(?i)^\s*(select|insert|replace|update|delete|with)\b`)
)

// funcContexts maps a line index to its enclosing declaration ("Type::Method" or "Func").
func funcContexts(lines []string) map[int]string {
	ctx := map[int]string{}
	cur := ""
	for i, l := range lines {
		if m := reFuncDecl.FindStringSubmatch(strings.TrimSpace(l)); m != nil {
			if m[1] != "" {
				cur = m[1] + "::" + m[2]
			} else {
				cur = m[2]
			}
		}
		ctx[i] = cur
	}
	return ctx
}

// extractCallSQL scans the argument list of the call whose '(' is at openIdx and returns
// the first SQL-looking string literal. found is false when the argument list holds no
// string literal at all (SQL passed as a variable).
func extractCallSQL(src string, openIdx int) (sql string, found bool, hasLiteral bool) {
	depth := 0
	var literals []string
	for i := openIdx; i < len(src); {
		c := src[i]
		switch c {
		case '"', '`':
			quote := c
			i++
			start := i
			for i < len(src) && src[i] != quote {
				if quote == '"' && src[i] == '\\' {
					i++
				}
				i++
			}
			literals = append(literals, src[start:i])
			if i < len(src) {
				i++
			}
			continue
		case '(':
			depth++
		case ')':
			depth--
			if depth == 0 {
				for _, l := range literals {
					if reSQLLead.MatchString(l) {
						return l, true, true
					}
				}
				return "", false, len(literals) > 0
			}
		}
		i++
	}
	for _, l := range literals {
		if reSQLLead.MatchString(l) {
			return l, true, true
		}
	}
	return "", false, len(literals) > 0
}

// collectSites finds every site candidate and computes its call site and form.
func collectSites(root string, sc *scope) ([]codeSite, error) {
	siteRE := regexp.MustCompile(sc.site)
	excl := regexp.MustCompile(sc.exclude)
	args := append([]string{"-C", root, "ls-files", "--"}, sc.paths...)
	listed, err := execGit(args...)
	if err != nil {
		return nil, err
	}
	var out []codeSite
	for _, f := range strings.Split(strings.TrimSpace(string(listed)), "\n") {
		if f == "" || excl.MatchString(f) {
			continue
		}
		body, err := os.ReadFile(filepath.Join(root, f))
		if err != nil {
			return nil, err
		}
		src := string(body)
		lines := strings.Split(src, "\n")
		ctx := funcContexts(lines)
		offset := 0
		for i, line := range lines {
			lineStart := offset
			offset += len(line) + 1
			loc := siteRE.FindStringIndex(line)
			if loc == nil {
				continue
			}
			call := f
			if c := ctx[i]; c != "" {
				call += "::" + c
			}
			s := codeSite{File: f, Line: i + 1, Text: strings.Join(strings.Fields(line), " "), Call: call}
			sql, ok, hasLiteral := extractCallSQL(src, lineStart+loc[1]-1)
			switch {
			case !hasLiteral:
				s.Reason = "SQL 인자가 문자열 리터럴이 아니라 변수 — 형태를 정적으로 뽑을 수 없다"
			case !ok:
				s.Reason = "호출의 인자에 SQL 형태의 문자열 리터럴이 없다"
			default:
				s.SQL = strings.Join(strings.Fields(sql), " ")
				shape, ok := parseShape(s.SQL)
				if !ok {
					s.Reason = "SQL 형태를 계산할 수 없다"
				} else {
					s.Shape = shape
				}
			}
			out = append(out, s)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].File != out[j].File {
			return out[i].File < out[j].File
		}
		if out[i].Line != out[j].Line {
			return out[i].Line < out[j].Line
		}
		return out[i].Text < out[j].Text
	})
	return out, nil
}

// ---------------------------------------------------------------- 형태 계산

var (
	reShapeInsert = regexp.MustCompile(`(?i)^insert\s+into\s+([a-z_][a-z0-9_]*)`)
	reShapeUpdate = regexp.MustCompile(`(?i)^update\s+([a-z_][a-z0-9_]*)`)
	reShapeDelete = regexp.MustCompile(`(?i)^delete\s+from\s+([a-z_][a-z0-9_]*)`)
	reShapeSelect = regexp.MustCompile(`(?i)^select\b`)
	reShapeFrom   = regexp.MustCompile(`(?i)\bfrom\s+([a-z_][a-z0-9_]*(?:\s*,\s*[a-z_][a-z0-9_]*)*)`)
	reShapeJoin   = regexp.MustCompile(`(?i)\bjoin\s+([a-z_][a-z0-9_]*)`)
	reShapeWhere  = regexp.MustCompile(`(?i)\bwhere\b(.*?)(?:\border\s+by\b|\blimit\b|$)`)
	reShapeOrder  = regexp.MustCompile(`(?i)\border\s+by\s+(.+?)(?:\blimit\b|\boffset\b|$)`)
	reShapeUpsert = regexp.MustCompile(`(?i)\bon\s+conflict\s*\(([^)]*)\)`)
	reCmp         = regexp.MustCompile(`(?i)\b([a-z_][a-z0-9_.]*)\s*(=|<>|!=|<=|>=|<|>)\s*(\?|:\w+|\$\d+|[a-z_][a-z0-9_.]*)`)
	reIsIn        = regexp.MustCompile(`(?i)\b([a-z_][a-z0-9_.]*)\s*(?:\bis\b|\bin\s*\()`)
	reRangeCmp    = regexp.MustCompile(`(?i)\b([a-z_][a-z0-9_.]*)\s*(?:<=|>=|<|>|between\b|like\b)`)
	reIdent       = regexp.MustCompile(`^[a-z_][a-z0-9_.]*$`)
)

func uniqSort(in []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, s := range in {
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	sort.Strings(out)
	return out
}

// parseShape computes the canonical 「형태」 of one SQL statement.
// ok is false when the statement is not one this checker can read statically.
func parseShape(sql string) (string, bool) {
	s := strings.ToLower(strings.Join(strings.Fields(sql), " "))

	var op string
	var tables []string
	switch {
	case reShapeSelect.MatchString(s):
		op = "select"
	case reShapeInsert.MatchString(s):
		op = "insert"
		if reShapeUpsert.MatchString(s) {
			op = "upsert"
		}
	case reShapeUpdate.MatchString(s):
		op = "update"
	case reShapeDelete.MatchString(s):
		op = "delete"
	default:
		return "", false
	}

	switch op {
	case "select":
		if m := reShapeFrom.FindStringSubmatch(s); m != nil {
			for _, t := range strings.Split(m[1], ",") {
				tables = append(tables, strings.TrimSpace(t))
			}
		}
		for _, m := range reShapeJoin.FindAllStringSubmatch(s, -1) {
			tables = append(tables, m[1])
		}
	case "insert", "upsert":
		if m := reShapeInsert.FindStringSubmatch(s); m != nil {
			tables = append(tables, m[1])
		}
	case "update":
		if m := reShapeUpdate.FindStringSubmatch(s); m != nil {
			tables = append(tables, m[1])
		}
	case "delete":
		if m := reShapeDelete.FindStringSubmatch(s); m != nil {
			tables = append(tables, m[1])
		}
	}
	if len(tables) == 0 {
		return "", false
	}
	tables = uniqSort(tables)

	var eq, rng []string
	if m := reShapeWhere.FindStringSubmatch(s); m != nil {
		where := m[1]
		for _, c := range reCmp.FindAllStringSubmatch(where, -1) {
			left, opSym, right := c[1], c[2], c[3]
			switch opSym {
			case "=":
				if reIdent.MatchString(right) {
					eq = append(eq, left+"="+right)
				} else {
					eq = append(eq, left)
				}
			case "<", "<=", ">", ">=":
				rng = append(rng, left)
			}
		}
		for _, c := range reIsIn.FindAllStringSubmatch(where, -1) {
			eq = append(eq, c[1])
		}
		for _, c := range reRangeCmp.FindAllStringSubmatch(where, -1) {
			rng = append(rng, c[1])
		}
	}
	if op == "upsert" {
		if m := reShapeUpsert.FindStringSubmatch(s); m != nil {
			for _, c := range strings.Split(m[1], ",") {
				eq = append(eq, strings.TrimSpace(c))
			}
		}
	}
	eq = uniqSort(eq)
	rng = uniqSort(rng)

	var order []string
	if m := reShapeOrder.FindStringSubmatch(s); m != nil {
		for _, item := range strings.Split(m[1], ",") {
			item = strings.TrimSpace(item)
			if item == "" {
				continue
			}
			fields := strings.Fields(item)
			dir := "asc"
			if len(fields) > 1 && (fields[1] == "asc" || fields[1] == "desc") {
				dir = fields[1]
			}
			order = append(order, fields[0]+" "+dir)
		}
	}

	return fmt.Sprintf("%s %s | %s | %s | %s",
		op, strings.Join(tables, ","), eqCell(eq), rangeCell(rng), orderCell(order)), true
}

// eqCell / rangeCell / orderCell render one 「형태」 cell. An empty cell is "-".
func eqCell(items []string) string {
	if len(items) == 0 {
		return "-"
	}
	return "eq(" + strings.Join(items, ", ") + ")"
}

func rangeCell(items []string) string {
	if len(items) == 0 {
		return "-"
	}
	return "range(" + strings.Join(items, ", ") + ")"
}

func orderCell(items []string) string {
	if len(items) == 0 {
		return "-"
	}
	return "order(" + strings.Join(items, ", ") + ")"
}

// ---------------------------------------------------------------- 불변식 2 판정

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

// judgeCatalog compares the code's query sites with the catalog in both directions.
func judgeCatalog(cat *catalog, sites []codeSite) []violation {
	var vs []violation

	byShape := map[string][]patternRow{}
	byID := map[string]patternRow{}
	for _, p := range cat.Patterns {
		byShape[p.Shape] = append(byShape[p.Shape], p)
		byID[p.ID] = p
	}
	live := map[string][]codeSite{}
	for _, s := range sites {
		live[s.Call] = append(live[s.Call], s)
	}
	manualBySite := map[string]manualRow{}
	for _, m := range cat.Manual {
		manualBySite[m.Site] = m
	}

	// 코드 → 카탈로그
	for _, s := range sites {
		if s.Shape == "" {
			if _, ok := manualBySite[s.Call]; !ok {
				vs = append(vs, violation{2, "missing-manual-form", s.Call,
					fmt.Sprintf("| `%s` | — | (대표 SQL) | %s |", s.Call, s.Reason)})
			}
			continue
		}
		rows := byShape[s.Shape]
		switch {
		case len(rows) == 0:
			vs = append(vs, violation{2, "missing-in-catalog", s.Call,
				fmt.Sprintf("| (새 ID) | `%s` | (지원 칸) | `%s` |", s.Shape, s.Call)})
		case len(rows) > 1:
			vs = append(vs, violation{2, "ambiguous-shape", s.Shape,
				fmt.Sprintf("%d catalog rows share this form", len(rows))})
		default:
			row := rows[0]
			if !contains(row.Sites, s.Call) {
				vs = append(vs, violation{2, "site-not-listed", s.Call,
					fmt.Sprintf("%s: add `%s` to the call sites", row.ID, s.Call)})
			}
		}
	}

	// 카탈로그 → 코드
	for _, p := range cat.Patterns {
		alive := 0
		for _, call := range p.Sites {
			found := live[call]
			if len(found) == 0 {
				vs = append(vs, violation{2, "stale-site", fmt.Sprintf("%s %s", p.ID, call),
					"remove the call site from the pattern row"})
				continue
			}
			match := false
			for _, s := range found {
				if s.Shape == p.Shape {
					match = true
				}
			}
			if !match {
				vs = append(vs, violation{2, "stale-site-form", fmt.Sprintf("%s %s", p.ID, call),
					"the site does not have this form any more"})
				continue
			}
			alive++
		}
		if alive == 0 {
			vs = append(vs, violation{2, "stale-pattern", p.ID,
				"no live call site has this form"})
		}
	}

	// 수동 형태 ↔ 코드의 추출 불가 지점 (양방향)
	for _, m := range cat.Manual {
		found := false
		for _, s := range live[m.Site] {
			if s.Shape == "" {
				found = true
			}
		}
		if !found {
			vs = append(vs, violation{2, "stale-manual-form", m.Site,
				"the site is not reported as unextractable any more — remove the row"})
			continue
		}
		if m.Reason == "" {
			vs = append(vs, violation{2, "manual-form-without-reason", m.Site,
				"write why the form cannot be extracted statically"})
		}
		if m.PatternID != "—" && m.PatternID != "" {
			p, ok := byID[m.PatternID]
			if !ok {
				vs = append(vs, violation{2, "manual-form-unknown-pattern", m.Site,
					fmt.Sprintf("unknown pattern ID %s", m.PatternID)})
				continue
			}
			if !contains(p.Sites, m.Site) {
				vs = append(vs, violation{2, "manual-site-not-listed", m.Site,
					fmt.Sprintf("%s: add `%s` to the call sites", p.ID, m.Site)})
			}
		}
	}
	return vs
}
