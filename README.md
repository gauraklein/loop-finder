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

## Web UI

Needs Python 3.11+, Node, and `ffmpeg` (for YouTube). One command:

```bash
./start.sh
```

First run calls `./setup.sh` (venv, package with stems, frontend build). After that it rebuilds the frontend only if its source changed, then serves the UI and API at http://127.0.0.1:8000 and opens your browser. Re-run `./setup.sh` after changing dependencies.

For frontend development with hot reload, run both in separate terminals:

```bash
uvicorn loop_finder.server:app --reload --port 8000
cd frontend && npm start   # http://localhost:3000, talks to :8000 via .env.development
```

## Usage

```bash
loop-finder path/to/track.wav
loop-finder "https://www.youtube.com/watch?v=VIDEO_ID"
loop-finder "https://www.youtube.com/playlist?list=PLAYLIST_ID"  # every video in the playlist (--limit N for the first N)
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

With `--out ./loops` (default), each track gets its own folder. Filenames start with rank so they’re readable on small screens:

```
loops/
  song/
    loops/
      01_2bar_song.wav
      01_4bar_song.wav
      02_2bar_song.wav
    report.json
```

With `--stems`:

```
loops/
  song/
    loops/
      01_2bar_song.wav
    stems/
      01_2bar_song_drums.wav
      01_2bar_song_bass.wav
      01_2bar_song_other.wav
      01_2bar_song_vocals.wav
    report.json
```

Each export is beat-aligned. Ranking uses boundary chroma match (seamless join), bar-to-bar coherence, loudness, and energy stability.

## How it works

1. Load audio (analysis at 22.05 kHz; export at the original sample rate)
2. Detect tempo and beat times (`librosa`)
3. Slide 4- and 2-bar windows across beats (by default)
4. Score each window and keep a diversified top-N
5. Cut and write WAVs (short crossfade only when the boundary match is weak)
6. Optionally run Demucs on each exported loop for stems
