"""Load audio and detect BPM / beat positions."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import librosa
import numpy as np


ANALYSIS_SR = 22050


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

    y_export, sr_export = librosa.load(path, sr=None, mono=True)
    y_analysis, sr_analysis = librosa.load(path, sr=ANALYSIS_SR, mono=True)

    tempo, beat_frames = librosa.beat.beat_track(
        y=y_analysis,
        sr=sr_analysis,
        hop_length=hop_length,
        units="frames",
    )
    bpm = float(np.atleast_1d(tempo)[0])

    if bpm_override is not None:
        bpm = float(bpm_override)
        # Re-track beats locked to the overridden tempo
        _, beat_frames = librosa.beat.beat_track(
            y=y_analysis,
            sr=sr_analysis,
            hop_length=hop_length,
            bpm=bpm,
            units="frames",
        )

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
