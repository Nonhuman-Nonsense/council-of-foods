#!/usr/bin/env python3
"""Git textconv filter for the prompt JSON files.

JSON strings cannot contain literal newlines, so every prompt in
shared/prompts/*.json is one enormous line and `git diff` is unreadable.

This renders each file as flattened `path: value` lines, with multi-line
strings expanded into indented blocks, so git can diff them line by line.
Display only — these diffs are for reading, not for `git apply`.

Wired up via .gitattributes (committed) plus a one-off local git config:

    git config diff.jsonprompt.textconv scripts/json-prompt-textconv.py
"""
import json
import sys


def emit(node, path, out):
    if isinstance(node, dict):
        for key, value in node.items():
            emit(value, f"{path}.{key}" if path else key, out)
    elif isinstance(node, list):
        for index, value in enumerate(node):
            emit(value, f"{path}[{index}]", out)
    elif isinstance(node, str) and "\n" in node:
        out.append(f"{path}: |")
        out.extend(f"    {line}" for line in node.split("\n"))
    else:
        out.append(f"{path}: {node}")


def main() -> int:
    path = sys.argv[1]
    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        # Not readable as JSON — fall back to the raw bytes so git still diffs it.
        with open(path, "rb") as handle:
            sys.stdout.buffer.write(handle.read())
        return 0

    lines: list[str] = []
    emit(data, "", lines)
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
