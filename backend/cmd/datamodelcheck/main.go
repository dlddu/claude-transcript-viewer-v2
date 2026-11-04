package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime/debug"
	"sort"
	"strconv"
	"strings"

	"github.com/dlddu/claude-transcript-viewer-v2/backend/migrations"
	_ "modernc.org/sqlite"
)

const (
	exitOK        = 0
	exitViolation = 1
	exitUndecided = 2
)

type violation struct {
	Invariant int    `json:"invariant"`
	Kind      string `json:"kind"`
	Item      string `json:"item"`
	Expected  string `json:"expected,omitempty"`
}

type site struct {
	File string `json:"file"`
	Text string `json:"text"`
}

type report struct {
	Engine     string      `json:"engine"`
	Tables     int         `json:"tables"`
	Violations []violation `json:"violations"`
	Sites      []site      `json:"sites"`
	Status     string      `json:"status"`
}

type scope struct {
	migrations, checker, site, sql, exclude, schemaExclude string
	paths                                                  []string
}

type element struct {
	key, row string
}

func main() {
	root := flag.String("root", "..", "repository root")
	asJSON := flag.Bool("json", false, "machine-readable report")
	flag.Parse()

	rep, err := run(*root)
	if err != nil {
		fmt.Fprintf(os.Stderr, "datamodelcheck: undecidable: %v\n", err)
		os.Exit(exitUndecided)
	}
	if *asJSON {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		enc.Encode(rep)
	} else {
		printReport(os.Stdout, rep)
	}
	if len(rep.Violations) > 0 {
		os.Exit(exitViolation)
	}
	os.Exit(exitOK)
}

func run(root string) (*report, error) {
	dir := filepath.Join(root, "docs", "data-model")
	readme, err := os.ReadFile(filepath.Join(dir, "README.md"))
	if err != nil {
		return nil, fmt.Errorf("README: %w", err)
	}
	sc, err := parseScope(string(readme))
	if err != nil {
		return nil, err
	}
	if _, err := os.Stat(filepath.Join(root, sc.migrations)); err != nil {
		return nil, fmt.Errorf("migrations dir: %w", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "fullscan-criteria.md")); err != nil {
		return nil, fmt.Errorf("fullscan-criteria.md: %w", err)
	}

	schemaExclude, err := regexp.Compile(sc.schemaExclude)
	if err != nil {
		return nil, fmt.Errorf("schema-exclude: %w", err)
	}
	actual, tables, err := observeSchema(schemaExclude)
	if err != nil {
		return nil, err
	}

	rep := &report{Engine: engineVersion(), Tables: len(tables)}
	erd, err := os.ReadFile(filepath.Join(dir, "erd.md"))
	if err != nil {
		return nil, fmt.Errorf("erd.md: %w", err)
	}
	documented, err := parseERD(root, dir, string(erd))
	if err != nil {
		return nil, err
	}
	rep.Violations = append(rep.Violations, diffElements(actual, documented)...)

	rep.Sites, err = findSites(root, sc)
	if err != nil {
		return nil, err
	}
	rep.Violations = append(rep.Violations,
		violation{2, "unimplemented", "query-patterns.md comparison", fmt.Sprintf("%d site candidate(s) have no catalog check yet", len(rep.Sites))},
		violation{3, "unimplemented", "query-plan comparison", ""},
	)
	sort.SliceStable(rep.Violations, func(i, j int) bool {
		a, b := rep.Violations[i], rep.Violations[j]
		if a.Invariant != b.Invariant {
			return a.Invariant < b.Invariant
		}
		if a.Kind != b.Kind {
			return a.Kind < b.Kind
		}
		return a.Item < b.Item
	})
	if len(rep.Violations) == 0 {
		rep.Status = "ok"
	} else {
		rep.Status = "violation"
	}
	return rep, nil
}

func parseScope(readme string) (*scope, error) {
	var body []string
	in := false
	for _, line := range strings.Split(readme, "\n") {
		switch {
		case !in && (line == "```data-model-scope" || strings.HasPrefix(line, "```data-model-scope ")):
			in = true
		case in && strings.HasPrefix(line, "```"):
			in = false
		case in && strings.TrimSpace(line) != "":
			body = append(body, line)
		}
	}
	if len(body) == 0 {
		return nil, fmt.Errorf("README has no data-model-scope block")
	}
	vals := map[string][]string{}
	for _, line := range body {
		k, v, ok := strings.Cut(line, ":")
		if !ok {
			return nil, fmt.Errorf("data-model-scope: malformed line %q", line)
		}
		vals[k] = append(vals[k], strings.TrimSpace(v))
	}
	one := func(k string) (string, error) {
		if len(vals[k]) == 0 || vals[k][0] == "" {
			return "", fmt.Errorf("data-model-scope: missing key %q", k)
		}
		return vals[k][0], nil
	}
	joined := func(k string) string { return strings.Join(vals[k], "|") }
	sc := &scope{site: joined("site"), sql: joined("sql"), exclude: joined("exclude"), schemaExclude: joined("schema-exclude")}
	var err error
	if sc.migrations, err = one("migrations"); err != nil {
		return nil, err
	}
	if sc.checker, err = one("checker"); err != nil {
		return nil, err
	}
	sc.paths = strings.Fields(strings.Join(vals["scope"], " "))
	if len(sc.paths) == 0 || sc.site == "" || sc.sql == "" {
		return nil, fmt.Errorf("data-model-scope: scope, site and sql are required")
	}
	if sc.exclude == "" {
		sc.exclude = "^$"
	}
	if sc.schemaExclude == "" {
		sc.schemaExclude = "^$"
	}
	for _, re := range []string{sc.site, sc.sql, sc.exclude} {
		if _, err := regexp.Compile(re); err != nil {
			return nil, fmt.Errorf("data-model-scope: bad ERE %q: %w", re, err)
		}
	}
	return sc, nil
}

func engineVersion() string {
	if info, ok := debug.ReadBuildInfo(); ok {
		for _, d := range info.Deps {
			if d.Path == "modernc.org/sqlite" {
				return "modernc.org/sqlite " + d.Version
			}
		}
	}
	return "modernc.org/sqlite"
}

func observeSchema(skip *regexp.Regexp) (map[string]element, []string, error) {
	ctx := context.Background()
	db, err := sql.Open("sqlite", filepath.Join(mustTempDir(), "check.db"))
	if err != nil {
		return nil, nil, err
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	if _, err := db.ExecContext(ctx, "PRAGMA foreign_keys=ON"); err != nil {
		return nil, nil, err
	}
	if err := migrations.Apply(ctx, db); err != nil {
		return nil, nil, fmt.Errorf("apply migrations: %w", err)
	}

	var tables []string
	rows, err := db.QueryContext(ctx, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name")
	if err != nil {
		return nil, nil, err
	}
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			rows.Close()
			return nil, nil, err
		}
		if !skip.MatchString(n) {
			tables = append(tables, n)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}
	rows.Close()

	out := map[string]element{}
	add := func(key, row string) { out[key] = element{key, row} }
	for _, t := range tables {
		add("table:"+t, "### `"+t+"`")
		if err := observeTable(ctx, db, t, add); err != nil {
			return nil, nil, err
		}
	}
	return out, tables, nil
}

func observeTable(ctx context.Context, db *sql.DB, t string, add func(key, row string)) error {
	type col struct {
		name, typ string
		notnull   bool
		pk        int
	}
	var cols []col
	rows, err := db.QueryContext(ctx, fmt.Sprintf("PRAGMA table_info(%q)", t))
	if err != nil {
		return err
	}
	for rows.Next() {
		var cid, nn, pk int
		var name, typ string
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &typ, &nn, &dflt, &pk); err != nil {
			rows.Close()
			return err
		}
		cols = append(cols, col{name, strings.Join(strings.Fields(strings.ToUpper(typ)), " "), nn == 1, pk})
	}
	rows.Close()

	pkCols := 0
	for _, c := range cols {
		if c.pk > 0 {
			pkCols++
		}
	}
	for _, c := range cols {
		null := "YES"
		if c.notnull {
			null = "NO"
		}
		key := ""
		if c.pk > 0 {
			key = "PK"
			if pkCols > 1 {
				key = fmt.Sprintf("PK(%d)", c.pk)
			}
		}
		add(fmt.Sprintf("col:%s.%s|%s|%s", t, c.name, c.typ, null), fmt.Sprintf("| %s | %s | %s | %s |", c.name, c.typ, null, key))
		if c.pk > 0 {
			add(fmt.Sprintf("pk:%s.%s@%d", t, c.name, c.pk), "")
		}
	}

	fks := map[int][]string{}
	fkRef := map[int]string{}
	rows, err = db.QueryContext(ctx, fmt.Sprintf("PRAGMA foreign_key_list(%q)", t))
	if err != nil {
		return err
	}
	for rows.Next() {
		var id, seq int
		var ref, from, to, onU, onD, match string
		if err := rows.Scan(&id, &seq, &ref, &from, &to, &onU, &onD, &match); err != nil {
			rows.Close()
			return err
		}
		fks[id] = append(fks[id], from)
		fkRef[id] += strings.ToLower(ref) + "." + to + ","
	}
	rows.Close()
	type idx struct {
		name, origin string
		unique       bool
		partial      bool
	}
	rows, err = db.QueryContext(ctx, fmt.Sprintf("PRAGMA index_list(%q)", t))
	if err != nil {
		return err
	}
	var idxs []idx
	unique := map[string]bool{}
	for rows.Next() {
		var seq, unique, partial int
		var name, origin string
		if err := rows.Scan(&seq, &name, &unique, &origin, &partial); err != nil {
			rows.Close()
			return err
		}
		if origin != "pk" {
			idxs = append(idxs, idx{name, origin, unique == 1, partial == 1})
		}
	}
	rows.Close()
	for _, ix := range idxs {
		var icols []string
		r, err := db.QueryContext(ctx, fmt.Sprintf("PRAGMA index_info(%q)", ix.name))
		if err != nil {
			return err
		}
		for r.Next() {
			var seqno, cid int
			var name sql.NullString
			if err := r.Scan(&seqno, &cid, &name); err != nil {
				r.Close()
				return err
			}
			icols = append(icols, name.String)
		}
		r.Close()
		cond := "-"
		if ix.partial {
			var ddl string
			if err := db.QueryRowContext(ctx, "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?", ix.name).Scan(&ddl); err != nil {
				return err
			}
			if _, w, ok := strings.Cut(strings.ToUpper(ddl), " WHERE "); ok {
				cond = strings.Join(strings.Fields(ddl[len(ddl)-len(w):]), " ")
			}
		}
		label := ix.name
		if ix.origin == "u" {
			label = fmt.Sprintf("UNIQUE(%s.%s)", t, strings.Join(icols, ","))
		}
		u := "NO"
		if ix.unique {
			u = "YES"
		}
		add(fmt.Sprintf("idx:%s|%s|%s|%s|%s", t, label, strings.Join(icols, ","), u, cond),
			fmt.Sprintf("| %s | %s | %s | %s |", label, strings.Join(icols, ", "), u, cond))
		if ix.unique && len(icols) == 1 {
			unique[icols[0]] = true
		}
	}
	if pkCols == 1 {
		for _, c := range cols {
			if c.pk > 0 {
				unique[c.name] = true
			}
		}
	}

	for id, from := range fks {
		ref := strings.TrimSuffix(fkRef[id], ",")
		add(fmt.Sprintf("fk:%s(%s)->%s", t, strings.Join(from, ","), ref), "| "+strings.Join(from, ",")+" | FK → "+ref+" |")
		if len(from) != 1 {
			continue
		}
		parent, _, _ := strings.Cut(ref, ".")
		parentEnd, childEnd := "||", "o{"
		for _, c := range cols {
			if c.name == from[0] && !c.notnull {
				parentEnd = "|o"
			}
		}
		if unique[from[0]] {
			childEnd = "o|"
		}
		rel := fmt.Sprintf("%s %s--%s %s : %s", parent, parentEnd, childEnd, t, from[0])
		add("rel:"+rel, rel)
	}
	return nil
}

func mustTempDir() string {
	d, err := os.MkdirTemp("", "datamodelcheck")
	if err != nil {
		panic(err)
	}
	return d
}

var (
	entityHeading = regexp.MustCompile("^### `([^`]+)`\\s*$")
	relationLine  = regexp.MustCompile(`^\s*(\w+)\s+([|o}{]+--[|o}{]+)\s+(\w+)\s*:\s*(.+?)\s*$`)
	entityLine    = regexp.MustCompile(`^\s*(\w+)\s*(\{\s*\})?\s*$`)
	linkTarget    = regexp.MustCompile(`\]\(([^)#]+)(#[^)]*)?\)`)
)

func parseERD(root, dir, text string) (map[string]element, error) {
	out := map[string]element{}
	add := func(key string) { out[key] = element{key: key} }

	lines := strings.Split(text, "\n")
	inDiagram := false
	var table, header string
	entities := map[string]bool{}
	hasMeaning := map[string]bool{}
	var relations []string
	pkOrder := map[string][]string{}
	for _, line := range lines {
		trim := strings.TrimSpace(line)
		switch {
		case trim == "```mermaid":
			inDiagram = true
			continue
		case inDiagram && strings.HasPrefix(trim, "```"):
			inDiagram = false
			continue
		}
		if inDiagram {
			if trim == "" || trim == "erDiagram" {
				continue
			}
			if m := relationLine.FindStringSubmatch(line); m != nil {
				relations = append(relations, fmt.Sprintf("rel:%s %s %s : %s", m[1], m[2], m[3], m[4]))
			} else if m := entityLine.FindStringSubmatch(line); m != nil {
				entities[m[1]] = true
			} else {
				return nil, fmt.Errorf("erd.md: unsupported diagram line %q", trim)
			}
			continue
		}
		if m := entityHeading.FindStringSubmatch(line); m != nil {
			table, header = m[1], ""
			add("table:" + table)
			continue
		}
		if table == "" {
			continue
		}
		if strings.HasPrefix(trim, "의미:") {
			ok := false
			for _, m := range linkTarget.FindAllStringSubmatch(trim, -1) {
				if _, err := os.Stat(filepath.Join(dir, m[1])); err == nil {
					ok = true
				}
			}
			hasMeaning[table] = ok
			continue
		}
		if !strings.HasPrefix(trim, "|") {
			continue
		}
		cells := splitRow(trim)
		if len(cells) > 0 && (cells[0] == "컬럼" || cells[0] == "인덱스") {
			header = cells[0]
			continue
		}
		if len(cells) > 0 && strings.Trim(cells[0], "-: ") == "" {
			continue
		}
		switch header {
		case "컬럼":
			if len(cells) < 4 {
				return nil, fmt.Errorf("erd.md: %s column row needs 4 cells: %q", table, trim)
			}
			add(fmt.Sprintf("col:%s.%s|%s|%s", table, cells[0], strings.Join(strings.Fields(strings.ToUpper(cells[1])), " "), cells[2]))
			switch {
			case cells[3] == "PK":
				pkOrder[table] = append(pkOrder[table], cells[0]+"@1")
			case strings.HasPrefix(cells[3], "PK("):
				n, err := strconv.Atoi(strings.TrimSuffix(strings.TrimPrefix(cells[3], "PK("), ")"))
				if err != nil {
					return nil, fmt.Errorf("erd.md: %s.%s bad key %q", table, cells[0], cells[3])
				}
				pkOrder[table] = append(pkOrder[table], fmt.Sprintf("%s@%d", cells[0], n))
			case strings.HasPrefix(cells[3], "FK →"):
				ref := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(cells[3], "FK →")))
				add(fmt.Sprintf("fk:%s(%s)->%s", table, cells[0], ref))
			}
		case "인덱스":
			if len(cells) < 4 {
				return nil, fmt.Errorf("erd.md: %s index row needs 4 cells: %q", table, trim)
			}
			icols := strings.Join(strings.Split(strings.ReplaceAll(cells[1], " ", ""), ","), ",")
			add(fmt.Sprintf("idx:%s|%s|%s|%s|%s", table, cells[0], icols, cells[2], cells[3]))
		}
	}
	for t, list := range pkOrder {
		for _, e := range list {
			c, n, _ := strings.Cut(e, "@")
			add(fmt.Sprintf("pk:%s.%s@%s", t, c, n))
		}
	}
	for t := range hasMeaning {
		if hasMeaning[t] {
			out["meaning:"+t] = element{key: "meaning:" + t}
		}
	}
	for t := range entities {
		out["entity:"+t] = element{key: "entity:" + t}
	}
	for _, r := range relations {
		out[r] = element{key: r}
	}
	return out, nil
}

func splitRow(row string) []string {
	row = strings.TrimSuffix(strings.TrimPrefix(row, "|"), "|")
	var cells []string
	for _, c := range strings.Split(row, "|") {
		cells = append(cells, strings.Trim(strings.TrimSpace(c), "`"))
	}
	return cells
}

func diffElements(actual, documented map[string]element) []violation {
	var vs []violation
	for k, e := range actual {
		if _, ok := documented[k]; !ok {
			vs = append(vs, violation{1, "missing-in-erd", k, e.row})
		}
		if t, ok := strings.CutPrefix(k, "table:"); ok {
			if _, ok := documented["meaning:"+t]; !ok {
				vs = append(vs, violation{1, "missing-meaning-link", k, "의미: [`Type`](relative/path/to/doc-comment.go)"})
			}
			if _, ok := documented["entity:"+t]; !ok {
				vs = append(vs, violation{1, "missing-diagram-entity", k, "    " + t})
			}
		}
	}
	for k := range documented {
		if strings.HasPrefix(k, "meaning:") {
			continue
		}
		if t, ok := strings.CutPrefix(k, "entity:"); ok {
			if _, ok := actual["table:"+t]; !ok {
				vs = append(vs, violation{1, "stale-diagram-entity", k, "remove"})
			}
			continue
		}
		if _, ok := actual[k]; !ok {
			vs = append(vs, violation{1, "stale-in-erd", k, "remove"})
		}
	}
	return vs
}

func findSites(root string, sc *scope) ([]site, error) {
	siteRE := regexp.MustCompile(sc.site)
	excl := regexp.MustCompile(sc.exclude)
	args := append([]string{"-C", root, "ls-files", "--"}, sc.paths...)
	listed, err := exec.Command("git", args...).Output()
	if err != nil {
		return nil, fmt.Errorf("git ls-files: %w", err)
	}
	var out []site
	for _, f := range strings.Split(strings.TrimSpace(string(listed)), "\n") {
		if f == "" || excl.MatchString(f) {
			continue
		}
		body, err := os.ReadFile(filepath.Join(root, f))
		if err != nil {
			return nil, err
		}
		for _, line := range strings.Split(string(body), "\n") {
			if siteRE.MatchString(line) {
				out = append(out, site{f, strings.Join(strings.Fields(line), " ")})
			}
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].File != out[j].File {
			return out[i].File < out[j].File
		}
		return out[i].Text < out[j].Text
	})
	return out, nil
}

func printReport(w io.Writer, rep *report) {
	fmt.Fprintf(w, "engine: %s\ntables: %d\nsite candidates: %d\n", rep.Engine, rep.Tables, len(rep.Sites))
	for _, s := range rep.Sites {
		fmt.Fprintf(w, "  site %s: %s\n", s.File, s.Text)
	}
	fmt.Fprintf(w, "status: %s (%d violation(s))\n", rep.Status, len(rep.Violations))
	for _, v := range rep.Violations {
		fmt.Fprintf(w, "  [invariant %d] %s: %s", v.Invariant, v.Kind, v.Item)
		if v.Expected != "" {
			fmt.Fprintf(w, "  => %s", v.Expected)
		}
		fmt.Fprintln(w)
	}
}
