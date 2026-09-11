"""Typer CLI entrypoint for loop-finder."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Optional

import typer

from loop_finder.analyze import load_and_analyze
from loop_finder.download import download_audio, looks_like_url, normalize_url
from loop_finder.export import (
    build_report,
    export_loops,
    format_text_report,
    write_report_json,
)
from loop_finder.score import find_candidates

ALLOWED_BARS = (2, 4, 8)


def _parse_bars(value: str) -> list[int]:
    parts = [p.strip() for p in value.split(",") if p.strip()]
    if not parts:
        raise typer.BadParameter("Provide at least one bar length, e.g. 4,2")
    bars: list[int] = []
    for part in parts:
        try:
            n = int(part)
        except ValueError as exc:
            raise typer.BadParameter(f"Invalid bar length: {part}") from exc
        if n not in ALLOWED_BARS:
            raise typer.BadParameter(
                f"Bar lengths must be one of {', '.join(map(str, ALLOWED_BARS))}"
            )
        if n not in bars:
            bars.append(n)
    return bars


def _resolve_audio(source: str, tmp_dir: Path) -> tuple[Path, str | None]:
    """Return (local audio path, optional source URL)."""
    source = source.strip()
    if looks_like_url(source):
        source = normalize_url(source)
        typer.echo(f"Downloading audio from {source} ...", err=True)
        try:
            path = download_audio(source, tmp_dir)
        except Exception as exc:  # noqa: BLE001 — surface yt-dlp errors cleanly
            raise typer.BadParameter(f"Download failed: {exc}") from exc
        typer.echo(f"Downloaded: {path.name}", err=True)
        return path, source

    path = Path(source).expanduser()
    if not path.exists():
        raise typer.BadParameter(f"File not found: {path}")
    if not path.is_file():
        raise typer.BadParameter(f"Not a file: {path}")
    return path, None


def main(
    source: str = typer.Argument(
        ...,
        help="Audio file path or YouTube URL (quote watch?v= links in zsh)",
    ),
    bars: str = typer.Option(
        "4,2",
        "--bars",
        help="Bar lengths to find (2, 4, 8, or a comma list like 4,2)",
    ),
    top: int = typer.Option(5, "--top", min=1, help="Top candidates per bar length"),
    out: Path = typer.Option(Path("./loops"), "--out", help="Output directory"),
    bpm: Optional[float] = typer.Option(
        None, "--bpm", help="Override detected tempo (BPM)"
    ),
    min_score: float = typer.Option(
        0.0, "--min-score", help="Discard candidates below this score"
    ),
    stems: bool = typer.Option(
        False,
        "--stems",
        help="Also split each loop into Demucs stems (requires optional stems extra)",
    ),
    as_json: bool = typer.Option(
        False, "--json", help="Print machine-readable report to stdout"
    ),
) -> None:
    """Analyze a local audio file or YouTube URL and export the best loops."""
    bar_lengths = _parse_bars(bars)

    with tempfile.TemporaryDirectory(prefix="loop-finder-") as tmp:
        audio, source_url = _resolve_audio(source, Path(tmp))

        typer.echo(f"Analyzing {audio.name} ...", err=True)
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
        track_dir, rows = export_loops(analysis, candidates, out)

        if stems:
            from loop_finder.stems import separate_loops

            typer.echo("Separating stems with Demucs ...", err=True)
            try:
                separate_loops(
                    rows,
                    track_dir=track_dir,
                    on_progress=lambda name: typer.echo(f"  stems: {name}", err=True),
                )
            except RuntimeError as exc:
                typer.echo(str(exc), err=True)
                raise typer.Exit(code=1) from exc

        report = build_report(analysis, rows)
        if source_url:
            report["source_url"] = source_url
        if stems:
            report["stems"] = True

        report_path = track_dir / "report.json"
        write_report_json(report, report_path)

        if as_json:
            typer.echo(json.dumps(report, indent=2))
        else:
            typer.echo(format_text_report(report))
            typer.echo(f"\nWrote {len(rows)} loop(s) to {track_dir / 'loops'}", err=True)
            if stems:
                typer.echo(f"Stems written to {track_dir / 'stems'}", err=True)
            typer.echo(f"Report: {report_path}", err=True)


def app() -> None:
    """Console script entrypoint."""
    typer.run(main)


if __name__ == "__main__":
    app()
