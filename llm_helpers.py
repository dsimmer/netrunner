#!/usr/bin/env python3
"""Emit a copy of a template string for each file in a directory.

Placeholders replaced per file:
  :filename     - the file's base name
  :filepath     - the file's absolute path
  :filenoextname - the file's base name with the extension removed
"""

import argparse
import sys
from pathlib import Path


def expand_template(directory: Path, template: str, recursive: bool = False) -> list[str]:
    if not directory.is_dir():
        raise NotADirectoryError(f"{directory} is not a directory")
    iterator = directory.rglob("*") if recursive else directory.iterdir()
    files = sorted(p for p in iterator if p.is_file())
    return [
        template.replace(":filepath", str(f.resolve()))
        .replace(":filenoextname", f.stem)
        .replace(":filename", f.name)
        for f in files
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="Directory to scan for files")
    parser.add_argument(
        "template",
        nargs="?",
        help="Template string. Use ':filename' as the placeholder. "
        "If omitted, the template is read from stdin.",
    )
    parser.add_argument(
        "separator",
        nargs="?",
        default="\n",
        help="Separator between rendered copies (default: newline)",
    )
    parser.add_argument(
        "-r", "--recursive", action="store_true", help="Recurse into subdirectories"
    )
    args = parser.parse_args()

    template = args.template if args.template is not None else sys.stdin.read()
    outputs = expand_template(args.directory, template, recursive=args.recursive)
    sys.stdout.write(args.separator.join(outputs))
    if outputs and not args.separator.endswith("\n"):
        sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
