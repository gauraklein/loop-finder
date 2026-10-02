"""Beat tracking should follow a tempo that drifts (e.g. live kirtan)."""

import numpy as np
import soundfile as sf
import librosa

from loop_finder.analyze import load_and_analyze


def test_follows_accelerating_tempo(tmp_path):
    sr = 22050
    # 3 minutes of clicks accelerating linearly from 90 to 140 BPM
    bpm = np.linspace(90, 140, 400)
    times = np.cumsum(60.0 / bpm)
    times = times[times < 180]
    y = librosa.clicks(times=times, sr=sr, length=180 * sr)
    path = tmp_path / "ramp.wav"
    sf.write(path, y, sr)

    a = load_and_analyze(path)
    local = 60.0 / np.diff(a.beat_times)
    assert abs(np.median(local[a.beat_times[:-1] < 30]) - 95) < 8
    assert abs(np.median(local[a.beat_times[:-1] > 150]) - 135) < 8


if __name__ == "__main__":
    import pathlib, tempfile

    with tempfile.TemporaryDirectory() as d:
        test_follows_accelerating_tempo(pathlib.Path(d))
    print("ok")
