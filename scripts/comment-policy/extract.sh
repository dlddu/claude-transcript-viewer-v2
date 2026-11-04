#!/usr/bin/env bash
# reconciler 모델 tbm_claude-transcript-viewer-v2-comment-necessity 의 as-is versionScript 에서 지문 계산만 뺀 사본이다. 범위·표면 규칙의 SSOT 는 그 모델이고, 이 사본은 지문 대신 주석 줄을 출력한다.
set -euo pipefail
export LC_ALL=C

FIXED_EXCLUDE='^docs/|\.md$|(^|/)(vendor|node_modules|dist|build|target|\.venv|venv|__pycache__|\.next|coverage)/|(^|/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|go\.sum|uv\.lock|poetry\.lock|Cargo\.lock|Pipfile\.lock)$'
REPO_EXCLUDE=$(git show HEAD:docs/comment-policy/README.md 2>/dev/null \
  | awk '/^```comment-scope-exclude[[:space:]]*$/{f=1;next} f&&/^```/{f=0} f&&NF' | paste -sd'|' - || true)
EXCLUDE="$FIXED_EXCLUDE${REPO_EXCLUDE:+|$REPO_EXCLUDE}"
rc=0; printf '' | grep -E -- "$EXCLUDE" >/dev/null 2>&1 || rc=$?
[ "$rc" -ne 2 ] || { echo "invalid ERE in comment-scope-exclude block" >&2; exit 1; }

DIRECTIVE=':#!|//go:|nolint|eslint-|@ts-|prettier-ignore|/// <reference|istanbul ignore|c8 ignore|# ?noqa|# ?type:|# ?pragma|# ?pylint:|# ?fmt:|shellcheck |# ?syntax=|yaml-language-server:|mock-exception:'

SUF='(\.(example|sample|template|tmpl|tpl|dist|in|j2))?$'
C_FILES='\.(go|rs|java|kt|kts|scala|groovy|gradle|swift|c|h|cc|cpp|hpp|cs|m|js|jsx|mjs|cjs|ts|tsx|mts|cts|css|scss|less|proto|jsonc)'"$SUF"'|(^|/)(go\.mod|go\.work|tsconfig[^/]*\.json|jsconfig[^/]*\.json|\.devcontainer/[^/]*\.json)$'
C_PATTERN='^[[:space:]]*(//|/\*|\*([[:space:]]|$)|\{/\*)'
HASH_FILES='\.(py|pyi|rb|sh|bash|zsh|fish|pl|r|ya?ml|toml|tf|tfvars|hcl|cfg|conf|ini|properties|pro|mk|dockerfile|nix|awk|sed)'"$SUF"'|(^|/)(Makefile|GNUmakefile|Dockerfile[^/]*|Containerfile|Caddyfile|\.gitignore|\.dockerignore|\.gitattributes|\.helmignore|\.editorconfig|\.env[^/]*|CODEOWNERS|requirements[^/]*\.txt|Gemfile|Podfile|Rakefile|Brewfile|Fastfile|Appfile|Matchfile|Pluginfile)$'
HASH_PATTERN='^[[:space:]]*#'
DASH_FILES='\.(sql|lua|hs|elm|ada|adb)'"$SUF"
DASH_PATTERN='^[[:space:]]*--'
MIXED_FILES='\.(html?|vue|svelte|astro)'"$SUF"
MIXED_PATTERN='^[[:space:]]*(<!--|//|/\*|\*([[:space:]]|$)|\{/\*)'
MARKUP_FILES='\.(xml|svg|xhtml|plist|entitlements|xsd|xsl)'"$SUF"
MARKUP_PATTERN='^[[:space:]]*<!--'
NONE_FILES='\.(json|jsonl|ndjson|csv|tsv|txt|avsc|snap|golden|pem|crt|key|pub|patch|diff|log|lock|sum|mod|map|http)'"$SUF"'|(^|/)(LICENSE[^/]*|NOTICE|AUTHORS|\.nvmrc|\.node-version|\.python-version|\.tool-versions|\.gitkeep|py\.typed)$'

LIST=$(git ls-files | grep -vE "$EXCLUDE" | sort | xargs -r -d '\n' grep -Il '' 2>/dev/null | sort || true)
GENERATED=$(printf '%s\n' "$LIST" | sed '/^$/d' | while IFS= read -r f; do
  head -n5 -- "$f" | grep -E 'DO NOT EDIT|@generated' >/dev/null && printf '%s\n' "$f"; done || true)
[ -n "$GENERATED" ] && LIST=$(comm -23 <(printf '%s\n' "$LIST") <(printf '%s\n' "$GENERATED"))

REST="$LIST"; OUT=""; TAGGED=""
scan() {
  local take; take=$(printf '%s\n' "$REST" | grep -E "$1" || true)
  REST=$(printf '%s\n' "$REST" | grep -vE "$1" || true)
  [ -n "$2" ] && [ -n "$take" ] && OUT+=$(printf '%s\n' "$take" | xargs -r -d '\n' grep -EH -e "$2" || true)$'\n'
  [ -n "${3:-}" ] && [ -n "$take" ] && TAGGED+=$(printf '%s\n' "$take" | sed "s/^/$3\t/")$'\n'
  return 0
}
scan "$C_FILES" "$C_PATTERN" C
scan "$HASH_FILES" "$HASH_PATTERN" HASH
scan "$DASH_FILES" "$DASH_PATTERN" DASH
scan "$MIXED_FILES" "$MIXED_PATTERN"
scan "$MARKUP_FILES" "$MARKUP_PATTERN"
scan "$NONE_FILES" ""
SHEBANG=$(printf '%s\n' "$REST" | sed '/^$/d' | while IFS= read -r f; do
  head -c2 -- "$f" | grep '^#!' >/dev/null && printf '%s\n' "$f"; done || true)
if [ -n "$SHEBANG" ]; then
  OUT+=$(printf '%s\n' "$SHEBANG" | xargs -r -d '\n' grep -EH -e "$HASH_PATTERN" || true)$'\n'
  TAGGED+=$(printf '%s\n' "$SHEBANG" | sed 's/^/SHEBANG\t/')$'\n'
  REST=$(comm -23 <(printf '%s\n' "$REST" | sed '/^$/d') <(printf '%s\n' "$SHEBANG"))
fi
UNCLASSIFIED=$(printf '%s\n' "$REST" | sed '/^$/d')

DE_PY=$(cat <<'PY'
import ast, io, os, re, sys, tokenize
DIR = re.compile(os.environ["DIRECTIVE"].replace(":#!|", "", 1))
SUF = re.compile(r"\.(example|sample|template|tmpl|tpl|dist|in|j2)$")
HASH_E_EXT = {"sh", "bash", "zsh", "fish", "rb", "pl", "r", "yaml", "yml", "toml", "tf", "tfvars", "hcl", "mk", "nix", "awk"}
MAKE = re.compile(r"^(Makefile|GNUmakefile)$|\.mk$")
RUBY_DSL = re.compile(r"^(Gemfile|Podfile|Rakefile|Brewfile|Fastfile|Appfile|Matchfile|Pluginfile)$")
OPEN_OK = set(" \t=([{,:")
out = []

def emit(kind, path, text):
    t = re.sub(r"\s+", " ", text).strip()
    if t and not ((kind == "E" and DIR.search(t)) or (kind == "D" and DIR.match(t))):
        out.append(f"{kind}:{path}:{t}")

def rescue(path, comment, tail):
    if DIR.search(comment):
        m = re.search(tail, comment[1:])
        if m:
            emit("E", path, comment[1 + m.start():])

def py(path, src):
    try:
        tree = ast.parse(src)
    except (SyntaxError, ValueError):
        out.append(f"X:{path}:ast"); tree = None
    if tree is not None:
        for n in ast.walk(tree):
            if isinstance(n, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
                for line in (ast.get_docstring(n, clean=True) or "").splitlines():
                    emit("D", path, line)
    lines = src.splitlines()
    try:
        for tok in tokenize.generate_tokens(io.StringIO(src).readline):
            if tok.type == tokenize.COMMENT:
                r, c = tok.start
                if lines[r - 1][:c].strip():
                    emit("E", path, tok.string)
                else:
                    rescue(path, tok.string, r"\s#\s")
    except (tokenize.TokenError, IndentationError, SyntaxError):
        out.append(f"X:{path}:tokenize")

def marker_lang(path, src, marker, quotes, make=False):
    for line in src.splitlines():
        s = line.lstrip()
        if s.startswith(marker):
            rescue(path, s, r"\s" + re.escape(marker) + r"\s")
            continue
        q = None; i = 0
        while i < len(line):
            ch = line[i]
            if q:
                if ch == "\\" and q == '"':
                    i += 2; continue
                if ch == q:
                    q = None
            elif ch in quotes and (i == 0 or line[i - 1] in OPEN_OK):
                q = ch
            elif line.startswith(marker, i) and (marker != "#" or line[i - 1] in " \t"):
                c = line[i:]
                if not (make and re.match(r"^##( |$)", c)):
                    emit("E", path, c)
                break
            i += 1

def slash_lang(path, src, line_comments):
    q = None; block = False
    for line in src.splitlines():
        s = line.lstrip()
        if q in ('"', "'"):
            q = None
        lead = not block and q is None and s.startswith(("//", "/*", "*", "{/*"))
        if lead and s.startswith("//"):
            rescue(path, s[1:], r"\s(--|//)\s")
        i = 0; code = False
        while i < len(line):
            ch = line[i]; nx = line[i + 1] if i + 1 < len(line) else ""
            if block:
                if ch == "*" and nx == "/":
                    block = False; i += 2; continue
                i += 1; continue
            if q:
                if ch == "\\":
                    i += 2; continue
                if ch == q:
                    q = None
                i += 1; continue
            if ch == "\\":
                i += 2; code = True; continue
            if line_comments and ch == "/" and nx == "/":
                if code and not lead:
                    emit("E", path, line[i:])
                break
            if ch == "/" and nx == "*":
                end = line.find("*/", i + 2)
                if code and not lead:
                    emit("E", path, line[i:] if end < 0 else line[i:end + 2])
                if end < 0:
                    block = True; break
                i = end + 2; continue
            if ch in "\"'`":
                q = ch
            if not ch.isspace() and ch != "{":
                code = True
            i += 1

for rec in sys.stdin.read().splitlines():
    if "\t" not in rec:
        continue
    tag, path = rec.split("\t", 1)
    try:
        src = open(path, encoding="utf-8").read()
    except (UnicodeDecodeError, OSError):
        out.append(f"X:{path}:read"); continue
    name = SUF.sub("", os.path.basename(path))
    ext = name.rsplit(".", 1)[1].lower() if "." in name else ""
    if tag == "C":
        n = len(out)
        slash_lang(path, src, ext != "css")
        if name in ("go.mod", "go.work"):
            out[n:] = [o for o in out[n:] if not o.endswith(":// indirect")]
    elif tag == "DASH":
        marker_lang(path, src, "--", "'\"")
    elif tag in ("HASH", "SHEBANG"):
        if ext in ("py", "pyi") or (tag == "SHEBANG" and "python" in src.split("\n", 1)[0]):
            py(path, src)
        elif tag == "SHEBANG" or ext in HASH_E_EXT or MAKE.search(name) or RUBY_DSL.search(name) or name.startswith("requirements"):
            marker_lang(path, src, "#", "'\"", make=bool(MAKE.search(name)))
print("\n".join(out))
PY
)
DE=$(printf '%s' "$TAGGED" | sed '/^$/d' | DIRECTIVE="$DIRECTIVE" python3 -c "$DE_PY" | sed '/^$/d' | sort)

HITS=$({ printf '%s' "$OUT" | sed '/^$/d' | grep -vE "$DIRECTIVE" || true; } \
  | sed 's/[[:space:]]\+/ /g' | sed 's/^ //; s/ $//' | sort)
UNCL_LINES=$(printf '%s\n' "$UNCLASSIFIED" | sed '/^$/d; s/^/unclassified:/')
printf '%s\n' "$HITS" | sed '/^$/d; s/^/L:/'
printf '%s\n' "$UNCLASSIFIED" | sed '/^$/d; s/^/U:/'
printf '%s\n' "$DE" | sed '/^$/d'
