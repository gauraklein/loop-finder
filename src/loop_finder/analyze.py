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


# Local chunk tempo must beat the whole-track grid by this factor to be used
LOCAL_TEMPO_MARGIN = 1.10


def _track_chunk(
    onset_env: np.ndarray,
    a: int,
    s: int,
    step: int,
    pad: int,
    bpm: float,
    sr: int,
    hop_length: int,
) -> np.ndarray:
    """Beats at a fixed tempo for chunk [s, s+step), tracked with padding."""
    _, b = librosa.beat.beat_track(
        onset_envelope=onset_env[a : s + step + pad],
        sr=sr,
        hop_length=hop_length,
        bpm=bpm,
        trim=False,
        units="frames",
    )
    b = b + a
    return b[(b >= s) & (b < s + step)]


def _onset_at(onset_env: np.ndarray, beats: np.ndarray) -> float:
    """Mean onset strength at beats (±2 frames), i.e. how well a grid fits."""
    if len(beats) == 0:
        return 0.0
    return float(np.mean([onset_env[max(0, f - 2) : f + 3].max() for f in beats]))


def _track_beats_local(
    onset_env: np.ndarray, sr: int, hop_length: int
) -> np.ndarray:
    """Beat frames from overlapping chunks, each seeded with its local tempo."""
    fps = sr / hop_length
    local_bpm = librosa.feature.tempo(
        onset_envelope=onset_env, sr=sr, hop_length=hop_length, aggregate=None
    )
    # Whole-track tempo picks the octave (e.g. 70 vs 140); every chunk is
    # folded into [anchor/√2, anchor·√2]. Folding against the previous chunk
    # instead lets small steps ratchet up a whole octave.
    # ponytail: sets that drift more than ~2x overall get folded back down
    anchor = float(np.atleast_1d(librosa.beat.beat_track(
        onset_envelope=onset_env, sr=sr, hop_length=hop_length
    )[0])[0])
    step, pad = int(CHUNK_S * fps), int(CHUNK_PAD_S * fps)
    kept: list[np.ndarray] = []
    tempos: list[np.ndarray] = []
    for s in range(0, len(onset_env), step):
        bpm = float(np.median(local_bpm[s : s + step]))
        while bpm > anchor * 1.414:
            bpm /= 2
        while bpm < anchor / 1.414:
            bpm *= 2
        a = max(0, s - pad)
        b = _track_chunk(onset_env, a, s, step, pad, bpm, sr, hop_length)
        # Local tempo can be a 4:3 or half-time misread on steady songs.
        # Keep it only if its beats land clearly harder on onsets than the
        # whole-track grid does; real slow sections win by 15–45%.
        if bpm != anchor:
            b_anchor = _track_chunk(onset_env, a, s, step, pad, anchor, sr, hop_length)
            if _onset_at(onset_env, b) < LOCAL_TEMPO_MARGIN * _onset_at(onset_env, b_anchor):
                b, bpm = b_anchor, anchor
        kept.append(b)
        tempos.append(np.full(len(b), bpm))

    # Drop duplicate beats where neighbouring chunks overlap at a seam
    frames: list[int] = []
    for f, bpm in zip(np.concatenate(kept), np.concatenate(tempos)):
        if not frames or f - frames[-1] >= 0.5 * fps * 60.0 / bpm:
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

    # Median aggregation matches what beat_track(y=...) uses internally
    onset_env = librosa.onset.onset_strength(
        y=y_analysis, sr=sr_analysis, hop_length=hop_length, aggregate=np.median
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
        # Median over 16-beat spans: single beats are quantized to one
        # analysis frame (~23ms), which reads 120 BPM as 117.5 or 123
        t = beat_frames * hop_length / sr_analysis
        n = min(16, len(t) - 1)
        bpm = float(np.median(60.0 * n / (t[n:] - t[:-n]))) if n > 0 else 0.0

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
