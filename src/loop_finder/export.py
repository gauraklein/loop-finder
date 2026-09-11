"""Cut and write loop WAVs plus a report."""

from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
import soundfile as sf

from loop_finder.analyze import AnalysisResult
from loop_finder.score import LoopCandidate


def sanitize_track_name(name: str) -> str:
    """Make a filesystem-safe folder / file stem from a track title."""
    safe = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip(" .")
    return safe or "track"


def track_output_dir(out_dir: Path, track_name: str) -> Path:
    return Path(out_dir) / sanitize_track_name(track_name)


def _slice_audio(
    y: np.ndarray,
    sr: int,
    start_time: float,
    end_time: float,
    boundary_score: float,
    crossfade_ms: float = 8.0,
) -> np.ndarray:
    """Extract a loop segment; light crossfade only if boundary is weak."""
    start = int(round(start_time * sr))
    end = int(round(end_time * sr))
    start = max(0, min(start, len(y) - 1))
    end = max(start + 1, min(end, len(y)))
    segment = y[start:end].copy()

    # Prefer hard cuts when boundary match is strong
    if boundary_score >= 0.75 or len(segment) < 64:
        return segment

    n = int(round(crossfade_ms / 1000.0 * sr))
    n = min(n, len(segment) // 4)
    if n < 2:
        return segment

    fade_out = np.linspace(1.0, 0.0, n)
    fade_in = np.linspace(0.0, 1.0, n)
    # Blend end into start so cyclic playback joins cleanly
    blended = segment[:n] * fade_in + segment[-n:] * fade_out
    segment[:n] = blended
    segment[-n:] = blended
    return segment


def export_loops(
    analysis: AnalysisResult,
    candidates_by_bars: dict[int, list[LoopCandidate]],
    out_dir: Path,
) -> tuple[Path, list[dict]]:
    """
    Write ranked WAV files under ``{out}/{track}/loops/``.

    Filenames are number-first for small screens, e.g. ``01_2bar_Track.wav``.
    Returns ``(track_dir, rows)``.
    """
    out_dir = Path(out_dir)
    stem = sanitize_track_name(analysis.path.stem)
    track_dir = track_output_dir(out_dir, stem)
    loops_dir = track_dir / "loops"
    loops_dir.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []

    for bars, candidates in sorted(candidates_by_bars.items()):
        for rank, cand in enumerate(candidates, start=1):
            audio = _slice_audio(
                analysis.y_export,
                analysis.sr_export,
                cand.start_time,
                cand.end_time,
                cand.boundary,
            )
            basename = f"{rank:02d}_{bars}bar_{stem}"
            filename = f"{basename}.wav"
            path = loops_dir / filename
            sf.write(path, audio, analysis.sr_export)

            row = {
                "file": str(path),
                "basename": basename,
                "bars": bars,
                "rank": rank,
                "score": round(cand.score, 4),
                "boundary": round(cand.boundary, 4),
                "coherence": round(cand.coherence, 4),
                "energy": round(cand.energy, 4),
                "loudness": round(cand.loudness, 4),
                "start_time": round(cand.start_time, 4),
                "end_time": round(cand.end_time, 4),
                "duration": round(cand.end_time - cand.start_time, 4),
                "start_beat": cand.start_beat,
                "end_beat": cand.end_beat,
            }
            rows.append(row)

    return track_dir, rows


def build_report(
    analysis: AnalysisResult,
    rows: list[dict],
) -> dict:
    """Assemble a machine-readable report."""
    return {
        "source": str(analysis.path),
        "bpm": round(analysis.bpm, 3),
        "sample_rate": analysis.sr_export,
        "num_beats": int(len(analysis.beat_times)),
        "loops": rows,
    }


def write_report_json(report: dict, path: Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


def format_text_report(report: dict) -> str:
    lines = [
        f"Source: {report['source']}",
    ]
    if report.get("source_url"):
        lines.append(f"URL:    {report['source_url']}")
    lines.extend(
        [
            f"BPM:    {report['bpm']}",
            f"Beats:  {report['num_beats']}",
            "",
        ]
    )
    if not report["loops"]:
        lines.append("No loops found.")
        return "\n".join(lines)

    lines.append(
        f"{'file':<40} {'bars':>4} {'rank':>4} {'score':>7} "
        f"{'start':>8} {'end':>8}"
    )
    lines.append("-" * 80)
    for row in report["loops"]:
        name = Path(row["file"]).name
        lines.append(
            f"{name:<40} {row['bars']:>4} {row['rank']:>4} {row['score']:>7.4f} "
            f"{row['start_time']:>8.2f} {row['end_time']:>8.2f}"
        )
    return "\n".join(lines)
