"""Typer CLI entrypoint for loop-finder."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import typer

from loop_finder.analyze import load_and_analyze
from loop_finder.export import (
    build_report,
    export_loops,
    format_text_report,
    write_report_json,
)
from loop_finder.score import find_candidates


def _parse_bars(value: str) -> list[int]:
    parts = [p.strip() for p in value.split(",") if p.strip()]
    if not parts:
        raise typer.BadParameter("Provide at least one bar length, e.g. 4,8")
    bars: list[int] = []
    for part in parts:
        try:
            n = int(part)
        except ValueError as exc:
            raise typer.BadParameter(f"Invalid bar length: {part}") from exc
        if n not in (4, 8):
            raise typer.BadParameter("Bar lengths must be 4 and/or 8")
        if n not in bars:
            bars.append(n)
    return bars


def main(
    audio: Path = typer.Argument(
        ...,
        exists=True,
        readable=True,
        help="Input audio file",
    ),
    bars: str = typer.Option("4,8", "--bars", help="Bar lengths to find (4, 8, or 4,8)"),
    top: int = typer.Option(5, "--top", min=1, help="Top candidates per bar length"),
    out: Path = typer.Option(Path("./loops"), "--out", help="Output directory"),
    bpm: Optional[float] = typer.Option(
        None, "--bpm", help="Override detected tempo (BPM)"
    ),
    min_score: float = typer.Option(
        0.0, "--min-score", help="Discard candidates below this score"
    ),
    as_json: bool = typer.Option(
        False, "--json", help="Print machine-readable report to stdout"
    ),
) -> None:
    """Analyze AUDIO and export the best 4/8-bar loops."""
    bar_lengths = _parse_bars(bars)

    typer.echo(f"Analyzing {audio} ...", err=True)
    analysis = load_and_analyze(audio, bpm_override=bpm)
    typer.echo(
        f"Detected BPM: {analysis.bpm:.2f}  beats: {len(analysis.beat_times)}",
        err=True,
    )

    candidates = find_candidates(
        analysis,
        bar_lengths=bar_lengths,
        top=top,
        min_score=min_score,
    )
    rows = export_loops(analysis, candidates, out)
    report = build_report(analysis, rows)

    report_path = out / "report.json"
    write_report_json(report, report_path)

    if as_json:
        typer.echo(json.dumps(report, indent=2))
    else:
        typer.echo(format_text_report(report))
        typer.echo(f"\nWrote {len(rows)} loop(s) to {out}", err=True)
        typer.echo(f"Report: {report_path}", err=True)


def app() -> None:
    """Console script entrypoint."""
    typer.run(main)


if __name__ == "__main__":
    app()
