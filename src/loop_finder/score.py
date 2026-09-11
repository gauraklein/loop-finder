"""Generate and score beat-aligned loop candidates."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from loop_finder.analyze import AnalysisResult

BEATS_PER_BAR = 4


@dataclass
class LoopCandidate:
    """A scored beat-aligned loop window."""

    bars: int
    start_beat: int
    end_beat: int  # exclusive beat index (loop ends at this beat time)
    start_time: float
    end_time: float
    score: float
    boundary: float
    coherence: float
    energy: float


def _cosine_sim(a: NDArray[np.floating], b: NDArray[np.floating]) -> float:
    na = np.linalg.norm(a)
    nb = np.linalg.norm(b)
    if na < 1e-10 or nb < 1e-10:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def _mean_chroma(
    chroma: NDArray[np.floating],
    frame_start: int,
    frame_end: int,
) -> NDArray[np.floating]:
    frame_start = max(0, frame_start)
    frame_end = min(chroma.shape[1], max(frame_start + 1, frame_end))
    return np.mean(chroma[:, frame_start:frame_end], axis=1)


def _frames_for_time(time_s: float, sr: int, hop_length: int) -> int:
    return int(librosa_time_to_frames(time_s, sr, hop_length))


def librosa_time_to_frames(time_s: float, sr: int, hop_length: int) -> int:
    return int(np.round(time_s * sr / hop_length))


def score_candidate(
    analysis: AnalysisResult,
    start_beat: int,
    bars: int,
) -> LoopCandidate | None:
    """Score one beat-aligned window. Returns None if not enough beats."""
    beats_needed = bars * BEATS_PER_BAR
    end_beat = start_beat + beats_needed
    # Need one extra beat after the loop for wrap continuity
    if end_beat + 1 >= len(analysis.beat_times):
        return None

    start_time = float(analysis.beat_times[start_beat])
    end_time = float(analysis.beat_times[end_beat])
    wrap_time = float(analysis.beat_times[end_beat + 1])

    sr = analysis.sr_analysis
    hop = analysis.hop_length
    chroma = analysis.chroma
    rms = analysis.rms

    start_f = _frames_for_time(start_time, sr, hop)
    end_f = _frames_for_time(end_time, sr, hop)
    wrap_f = _frames_for_time(wrap_time, sr, hop)
    # Approximate one-beat duration in frames from first beat of window
    beat1_end = _frames_for_time(float(analysis.beat_times[start_beat + 1]), sr, hop)

    # Boundary: chroma of first beat vs chroma of the beat after the loop
    first_vec = _mean_chroma(chroma, start_f, beat1_end)
    wrap_vec = _mean_chroma(chroma, end_f, wrap_f)
    boundary = _cosine_sim(first_vec, wrap_vec)
    # Map [-1, 1] cosine to [0, 1]
    boundary = (boundary + 1.0) / 2.0

    # Internal coherence: successive bar chroma similarity
    bar_sims: list[float] = []
    for b in range(bars - 1):
        b0 = start_beat + b * BEATS_PER_BAR
        b1 = start_beat + (b + 1) * BEATS_PER_BAR
        b2 = start_beat + (b + 2) * BEATS_PER_BAR
        t0 = float(analysis.beat_times[b0])
        t1 = float(analysis.beat_times[b1])
        t2 = float(analysis.beat_times[b2])
        f0 = _frames_for_time(t0, sr, hop)
        f1 = _frames_for_time(t1, sr, hop)
        f2 = _frames_for_time(t2, sr, hop)
        v0 = _mean_chroma(chroma, f0, f1)
        v1 = _mean_chroma(chroma, f1, f2)
        sim = (_cosine_sim(v0, v1) + 1.0) / 2.0
        bar_sims.append(sim)
    coherence = float(np.mean(bar_sims)) if bar_sims else 1.0

    # Energy stability: prefer low RMS variance; also penalize silence
    rms_slice = rms[start_f:end_f]
    if rms_slice.size == 0:
        return None
    mean_rms = float(np.mean(rms_slice))
    std_rms = float(np.std(rms_slice))
    if mean_rms < 1e-6:
        energy = 0.0
    else:
        cv = std_rms / mean_rms
        energy = float(np.clip(1.0 - cv, 0.0, 1.0))
        # Quiet-section penalty
        if mean_rms < 0.02:
            energy *= mean_rms / 0.02

    # Weighted overall score
    score = 0.45 * boundary + 0.35 * coherence + 0.20 * energy

    return LoopCandidate(
        bars=bars,
        start_beat=start_beat,
        end_beat=end_beat,
        start_time=start_time,
        end_time=end_time,
        score=score,
        boundary=boundary,
        coherence=coherence,
        energy=energy,
    )


def find_candidates(
    analysis: AnalysisResult,
    bar_lengths: list[int],
    top: int = 5,
    min_score: float = 0.0,
) -> dict[int, list[LoopCandidate]]:
    """Slide over beats and return top-N candidates per bar length."""
    results: dict[int, list[LoopCandidate]] = {}
    n_beats = len(analysis.beat_times)

    for bars in bar_lengths:
        beats_needed = bars * BEATS_PER_BAR
        scored: list[LoopCandidate] = []
        # Leave room for wrap beat after the window
        max_start = n_beats - beats_needed - 1
        for start in range(max(0, max_start)):
            cand = score_candidate(analysis, start, bars)
            if cand is not None and cand.score >= min_score:
                scored.append(cand)

        scored.sort(key=lambda c: c.score, reverse=True)

        # Diversify: skip candidates that heavily overlap a higher-ranked one
        selected: list[LoopCandidate] = []
        min_gap_beats = max(BEATS_PER_BAR, beats_needed // 2)
        for cand in scored:
            if any(
                abs(cand.start_beat - s.start_beat) < min_gap_beats for s in selected
            ):
                continue
            selected.append(cand)
            if len(selected) >= top:
                break

        results[bars] = selected

    return results
