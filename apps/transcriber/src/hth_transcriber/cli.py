"""Command line entry point.

Keeps the shape of the upstream CLI — a URL in, a file out — so anyone used to
recipe-extractor can drive this. `--serve` starts the HTTP API instead.
"""

from __future__ import annotations

import argparse
import json
import sys

from .config import get_settings
from .errors import ImportError_
from .markdown import to_markdown
from .pipeline import import_recipe


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="hth-transcribe",
        description="Turn a cooking video link into a Standard HTH Recipe Object.",
        epilog=(
            "Examples:\n"
            '  hth-transcribe "https://youtube.com/watch?v=abc123"\n'
            '  hth-transcribe "https://youtube.com/watch?v=abc123" -f markdown\n'
            "  hth-transcribe --serve\n"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("url", nargs="?", help="Video URL (YouTube, Instagram, TikTok)")
    parser.add_argument(
        "--language", "-l", default="english", help="Output language (default: english)"
    )
    parser.add_argument(
        "--format", "-f", choices=["json", "markdown"], default="json", help="Output format"
    )
    parser.add_argument("--output", "-o", help="Write to this file instead of stdout")
    parser.add_argument("--serve", action="store_true", help="Run the HTTP API instead")

    args = parser.parse_args(argv)

    if args.serve:
        from .api import run

        run()
        return 0

    if not args.url:
        parser.error("a url is required (or use --serve)")

    def progress(stage: str) -> None:
        print(f"… {stage.replace('_', ' ')}", file=sys.stderr)

    try:
        recipe = import_recipe(args.url, args.language, get_settings(), progress)
    except ImportError_ as e:
        print(f"{e.code}: {e.message}", file=sys.stderr)
        if e.detail:
            print(e.detail, file=sys.stderr)
        return 1

    if args.format == "markdown":
        rendered = to_markdown(recipe, args.language)
    else:
        rendered = json.dumps(
            recipe.model_dump(by_alias=True, exclude_none=False), indent=2, ensure_ascii=False
        )

    if args.output:
        with open(args.output, "w", encoding="utf-8") as fh:
            fh.write(rendered)
        print(f"Wrote {args.output}", file=sys.stderr)
    else:
        print(rendered)

    if recipe.missing_information:
        print(
            "Note: the video did not state "
            + ", ".join(recipe.missing_information)
            + " — this recipe will not be auto-planned.",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
