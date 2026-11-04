#!/usr/bin/env python3
"""docs/comment-policy/ledger.md 를 실측과 대조한다. 정책: docs/comment-policy/README.md."""
import hashlib
import os
import re
import subprocess
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LEDGER = os.path.join(ROOT, "docs/comment-policy/ledger.md")
SURFACES = {"L": "## 줄머리 주석 (L)", "E": "## 줄 끝 주석 (E)", "D": "## docstring (D)"}
VERDICTS = ("완료", "—")
READING = "## 읽는 법"


def measure():
    res = subprocess.run(
        ["bash", os.path.join(ROOT, "scripts/comment-policy/extract.sh")],
        cwd=ROOT, capture_output=True, text=True, check=True,
    )
    lines = defaultdict(lambda: defaultdict(list))
    unclassified, unparsed = [], []
    for raw in res.stdout.splitlines():
        kind, _, rest = raw.partition(":")
        if kind == "U":
            unclassified.append(rest)
        elif kind == "X":
            unparsed.append(rest)
        elif kind in SURFACES:
            path, _, body = rest.partition(":")
            lines[kind][path].append(body)
    return lines, unclassified, unparsed


def fingerprint(bodies):
    return hashlib.sha256("\n".join(sorted(bodies)).encode()).hexdigest()[:12]


def parse_ledger(errors):
    rows = {k: [] for k in SURFACES}
    section = None
    for n, raw in enumerate(open(LEDGER, encoding="utf-8").read().splitlines(), 1):
        line = raw.rstrip()
        if line.startswith("## "):
            section = next((k for k, h in SURFACES.items() if line == h), "READ" if line == READING else None)
            if section is None:
                errors.append(f"ledger.md:{n}: 알 수 없는 절 '{line}'")
            continue
        if section in rows and line.startswith("|"):
            cells = [c.strip() for c in line.strip("|").split("|")]
            if cells[0] in ("판정일", "") or set(cells[0]) <= set("-: "):
                continue
            if len(cells) != 6:
                errors.append(f"ledger.md:{n}: 열이 6개가 아니다")
                continue
            rows[section].append((n, cells))
        elif line and section in rows:
            errors.append(f"ledger.md:{n}: 표 밖 산문")
        elif line and section is None and not line.startswith("# "):
            errors.append(f"ledger.md:{n}: 절 밖 산문")
    return rows


def main():
    errors = []
    measured, unclassified, unparsed = measure()
    rows = parse_ledger(errors)
    for kind, name in SURFACES.items():
        seen = {}
        prev = None
        done_rows = done_lines = total_lines = 0
        for n, (date, scope, count, fp, verdict, _result) in rows[kind]:
            files = [f.strip("` ") for f in scope.split(",")]
            if prev is not None and files[0] < prev:
                errors.append(f"ledger.md:{n}: 행 순서가 범위 첫 파일 경로의 사전순이 아니다")
            prev = files[0]
            if verdict not in VERDICTS:
                errors.append(f"ledger.md:{n}: 판정 칸 '{verdict}' 은 {VERDICTS} 만 유효하다")
            bodies = []
            for f in files:
                if f in seen:
                    errors.append(f"ledger.md:{n}: {f} 가 두 행에 속한다")
                seen[f] = n
                bodies += measured[kind].get(f, [])
            if str(len(bodies)) != count:
                errors.append(f"ledger.md:{n}: {scope} 줄 수 {count} != 실측 {len(bodies)}")
            if fingerprint(bodies) != fp.strip("` "):
                errors.append(f"ledger.md:{n}: {scope} 지문 불일치 (실측 {fingerprint(bodies)})")
            total_lines += len(bodies)
            if verdict == "완료":
                done_rows += 1
                done_lines += len(bodies)
        for f in sorted(set(measured[kind]) - set(seen)):
            errors.append(f"{name}: {f} ({len(measured[kind][f])}줄) 가 어느 행에도 없다")
        for f in sorted(set(seen) - set(measured[kind])):
            errors.append(f"{name}: {f} 는 실측에 주석이 없는데 행에 있다")
        print(f"{kind}: 행 {len(rows[kind])} (판정 완료 {done_rows}) · 줄 {total_lines} (판정 완료 {done_lines}, 미판정 {total_lines - done_lines})")
    if unclassified:
        errors.append("미분류 파일: " + ", ".join(unclassified))
    if unparsed:
        errors.append("파싱 실패 파일: " + ", ".join(unparsed))
    for e in errors:
        print("FAIL " + e)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
