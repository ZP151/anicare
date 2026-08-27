#!/usr/bin/env python3
"""Reject malformed UUID-shaped SQL string literals before pgTAP parses them."""

from __future__ import annotations

import pathlib
import re
import sys

UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)
STRING_LITERAL = re.compile(r"'((?:''|[^'])*)'")
UUID_SHAPED = re.compile(r"^[0-9a-f-]+$", re.IGNORECASE)


def malformed_literals(path: pathlib.Path) -> list[tuple[int, str]]:
    source = path.read_text(encoding="utf-8")
    malformed: list[tuple[int, str]] = []
    for match in STRING_LITERAL.finditer(source):
        value = match.group(1)
        if "-" in value and UUID_SHAPED.fullmatch(value) and not UUID.fullmatch(value):
            malformed.append((source.count("\n", 0, match.start()) + 1, value))
    return malformed


def main(arguments: list[str]) -> int:
    if len(arguments) != 1:
        print("usage: validate_sql_uuid_literals.py TEST.sql", file=sys.stderr)
        return 2
    path = pathlib.Path(arguments[0])
    failures = malformed_literals(path)
    for line, value in failures:
        print(f"{path}:{line}: malformed UUID literal {value}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
