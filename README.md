# loop-finder

CLI that analyzes a local audio file or **YouTube URL**, detects BPM/beats, and exports the best **4-bar** and **8-bar** loops as WAV files.

Assumes **4/4** time. YouTube downloads use `yt-dlp` and need `ffmpeg` on your PATH.

## Install

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

Requires Python 3.11+.

## Usage

```bash
loop-finder path/to/track.wav
loop-finder "https://www.youtube.com/watch?v=VIDEO_ID"
loop-finder https://youtu.be/VIDEO_ID
loop-finder track.mp3 --bars 4,8 --top 5 --out ./loops
loop-finder track.wav --bars 8 --min-score 0.6
loop-finder track.wav --bpm 120
loop-finder track.wav --json
```

On zsh, quote `youtube.com/watch?v=...` URLs — the `?` is a glob character and will fail if unquoted. `youtu.be/...` links are fine without quotes.
### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--bars` | `4,8` | Bar lengths to search (`4`, `8`, or `4,8`) |
| `--top` | `5` | How many candidates per bar length |
| `--out` | `./loops` | Output directory |
| `--bpm` | auto | Override detected tempo |
| `--min-score` | `0.0` | Drop weak candidates |
| `--json` | off | Print full report JSON to stdout |

### Output

For `song.wav`, writes files like:

```
loops/song_4bar_01.wav
loops/song_8bar_01.wav
...
loops/report.json
```

Each export is beat-aligned. Ranking uses boundary chroma match (seamless join), bar-to-bar coherence, and energy stability.

## How it works

1. Load audio (analysis at 22.05 kHz; export at the original sample rate)
2. Detect tempo and beat times (`librosa`)
3. Slide 4- and 8-bar windows across beats
4. Score each window and keep a diversified top-N
5. Cut and write WAVs (short crossfade only when the boundary match is weak)
