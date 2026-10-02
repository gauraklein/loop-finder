"""Load audio and detect BPM / beat positions."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import librosa
import numpy as np


ANALYSIS_SR = 22050
EXPORT_SR = 48000


# Beat tracking runs per chunk so tempo can drift (live kirtan, qawwali).
CHUNK_S = 30.0
CHUNK_PAD_S = 10.0  # overlap so the tracker has settled phase at kept beats


def _track_beats_local(
    onset_env: np.ndarray, sr: int, hop_length: int
) -> np.ndarray:
    """Beat frames from overlapping chunks, each seeded with its local tempo."""
    fps = sr / hop_length
    local_bpm = librosa.feature.tempo(
        onset_envelope=onset_env, sr=sr, hop_length=hop_length, aggregate=None
    )
    step, pad = int(CHUNK_S * fps), int(CHUNK_PAD_S * fps)
    kept: list[np.ndarray] = []
    for s in range(0, len(onset_env), step):
        a = max(0, s - pad)
        _, b = librosa.beat.beat_track(
            onset_envelope=onset_env[a : s + step + pad],
            sr=sr,
            hop_length=hop_length,
            start_bpm=float(np.median(local_bpm[s : s + step])),
            trim=False,
            units="frames",
        )
        b = b + a
        kept.append(b[(b >= s) & (b < s + step)])

    # Drop duplicate beats where neighbouring chunks overlap at a seam
    frames: list[int] = []
    for f in np.concatenate(kept):
        if not frames or f - frames[-1] >= 0.5 * fps * 60.0 / local_bpm[f]:
            frames.append(int(f))
    return np.asarray(frames)


@dataclass
class AnalysisResult:
    """Audio analysis used for loop scoring and export."""

    path: Path
    y_analysis: np.ndarray
    sr_analysis: int
    y_export: np.ndarray
    sr_export: int
    bpm: float
    beat_times: np.ndarray  # seconds, analysis timeline
    chroma: np.ndarray  # shape (12, n_frames)
    rms: np.ndarray  # shape (n_frames,)
    hop_length: int


def load_and_analyze(
    path: Path,
    bpm_override: float | None = None,
    hop_length: int = 512,
) -> AnalysisResult:
    """Load audio, detect beats, and compute features for scoring."""
    path = Path(path)

    y_export, sr_export = librosa.load(path, sr=EXPORT_SR, mono=True)
    y_analysis, sr_analysis = librosa.load(path, sr=ANALYSIS_SR, mono=True)

    onset_env = librosa.onset.onset_strength(
        y=y_analysis, sr=sr_analysis, hop_length=hop_length
    )
    if bpm_override is not None:
        # User asserts a constant tempo: one global track locked to it
        bpm = float(bpm_override)
        _, beat_frames = librosa.beat.beat_track(
            onset_envelope=onset_env,
            sr=sr_analysis,
            hop_length=hop_length,
            bpm=bpm,
            units="frames",
        )
    else:
        beat_frames = _track_beats_local(onset_env, sr_analysis, hop_length)
        ibi = np.diff(beat_frames) * hop_length / sr_analysis
        bpm = float(60.0 / np.median(ibi)) if ibi.size else 0.0

    beat_times = librosa.frames_to_time(
        beat_frames, sr=sr_analysis, hop_length=hop_length
    )

    chroma = librosa.feature.chroma_cqt(
        y=y_analysis, sr=sr_analysis, hop_length=hop_length
    )
    rms = librosa.feature.rms(y=y_analysis, hop_length=hop_length)[0]

    return AnalysisResult(
        path=path,
        y_analysis=y_analysis,
        sr_analysis=sr_analysis,
        y_export=y_export,
        sr_export=sr_export,
        bpm=bpm,
        beat_times=np.asarray(beat_times, dtype=float),
        chroma=chroma,
        rms=rms,
        hop_length=hop_length,
    )
