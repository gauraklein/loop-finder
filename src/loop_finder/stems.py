"""Separate exported loops into stems with Demucs."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

STEM_NAMES = ("drums", "bass", "other", "vocals")


def _require_separator():
    try:
        from demucs.api import Separator
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            'Stem separation requires the optional stems extra.\n'
            'Install with: pip install -e ".[stems]"'
        ) from exc
    return Separator


class StemSeparator:
    """Lazy-loaded Demucs separator reused across loops."""

    def __init__(self, model: str = "htdemucs") -> None:
        Separator = _require_separator()
        self._separator = Separator(model=model)

    def separate_file(self, loop_path: Path, out_dir: Path) -> dict[str, Path]:
        """
        Run Demucs on a loop WAV and write stem WAVs into out_dir.

        Returns a map of stem name -> output path.
        """
        loop_path = Path(loop_path)
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)

        _origin, stems = self._separator.separate_audio_file(loop_path)
        written: dict[str, Path] = {}

        # Demucs tensors are (channels, samples); soundfile wants (samples,) or (samples, ch)
        sr = int(self._separator.samplerate)
        for name in STEM_NAMES:
            if name not in stems:
                continue
            audio = stems[name].detach().cpu().numpy()
            if audio.ndim == 2:
                audio = audio.T  # (samples, channels)
            path = out_dir / f"{name}.wav"
            sf.write(path, audio.astype(np.float32, copy=False), sr)
            written[name] = path

        if not written:
            raise RuntimeError(f"Demucs returned no stems for {loop_path}")
        return written


def separate_loops(
    loop_rows: list[dict],
    model: str = "htdemucs",
    on_progress: callable | None = None,
) -> list[dict]:
    """
    For each exported loop row, write `<stem>_stems/{drums,bass,other,vocals}.wav`.

    Mutates and returns the rows, adding a `stems_dir` field.
    """
    if not loop_rows:
        return loop_rows

    separator = StemSeparator(model=model)
    for row in loop_rows:
        loop_path = Path(row["file"])
        stems_dir = loop_path.with_name(f"{loop_path.stem}_stems")
        if on_progress:
            on_progress(loop_path.name)
        written = separator.separate_file(loop_path, stems_dir)
        row["stems_dir"] = str(stems_dir)
        row["stems"] = {name: str(path) for name, path in written.items()}
    return loop_rows
