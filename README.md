# loop-finder

CLI that analyzes a local audio file or **YouTube URL**, detects BPM/beats, and exports the best **4-bar** and **2-bar** loops as WAV files (8-bar still available via `--bars`).

Assumes **4/4** time. YouTube downloads use `yt-dlp` and need `ffmpeg` on your PATH.

## Install

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

Optional stem separation (Demucs — downloads a model on first use):

```bash
pip install -e ".[stems]"
```

Requires Python 3.11+.

## Usage

```bash
loop-finder path/to/track.wav
loop-finder "https://www.youtube.com/watch?v=VIDEO_ID"
loop-finder https://youtu.be/VIDEO_ID
loop-finder track.mp3 --bars 4,2 --top 5 --out ./loops
loop-finder track.wav --bars 8
loop-finder track.wav --stems --out ./loops
loop-finder track.wav --bpm 120
loop-finder track.wav --json
```

On zsh, quote `youtube.com/watch?v=...` URLs — the `?` is a glob character and will fail if unquoted. `youtu.be/...` links are fine without quotes.

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--bars` | `4,2` | Bar lengths to search (`2`, `4`, `8`, or a list like `4,2`) |
| `--top` | `5` | How many candidates per bar length |
| `--out` | `./loops` | Output directory |
| `--bpm` | auto | Override detected tempo |
| `--min-score` | `0.0` | Drop weak candidates |
| `--stems` | off | Split each loop into Demucs stems (drums/bass/other/vocals) |
| `--json` | off | Print full report JSON to stdout |

### Output

For `song.wav`, writes files like:

```
loops/song_4bar_01.wav
loops/song_2bar_01.wav
...
loops/report.json
```

With `--stems`:

```
loops/song_4bar_01.wav
loops/song_4bar_01_stems/
  drums.wav
  bass.wav
  other.wav
  vocals.wav
```

Each export is beat-aligned. Ranking uses boundary chroma match (seamless join), bar-to-bar coherence, loudness, and energy stability.

## How it works

1. Load audio (analysis at 22.05 kHz; export at the original sample rate)
2. Detect tempo and beat times (`librosa`)
3. Slide 4- and 2-bar windows across beats (by default)
4. Score each window and keep a diversified top-N
5. Cut and write WAVs (short crossfade only when the boundary match is weak)
6. Optionally run Demucs on each exported loop for stems
