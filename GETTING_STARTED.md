# Loop Finder - Working Backend Implementation

This document explains how to get the backend actually working with the real loop-finder functionality, and how to run the full React + FastAPI application.

## What's Working

The backend (`backend/app/main.py`) now contains the **actual loop-finder processing logic** instead of mock implementations. It:

1. ✅ Accepts file uploads and YouTube URLs
2. ✅ Uses the real `load_and_analyze()` function for audio analysis
3. ✅ Uses the real `find_candidates()` function for loop detection
4. ✅ Uses the real `export_loops()` function to generate WAV files
5. ✅ Optionally uses `separate_loops()` for stem separation (when requested)
6. ✅ Serves loop WAV files for audio preview in the frontend
7. ✅ Returns proper JSON responses with file paths and metadata

## How to Run the Application

### Step 1: Start the Backend Server

```bash
# Navigate to backend directory
cd /Users/gauraklein/code/loop-finder/backend

# Install dependencies (if not already installed)
pip install -r requirements.txt

# Start the FastAPI server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

You should see output like:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [12345] using statreload
INFO:     Started server process [12346]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

### Step 2: Start the Frontend Development Server

In a new terminal tab/window:

```bash
# Navigate to frontend directory
cd /Users/gauraklein/code/loop-finder/frontend

# Install dependencies (if not already installed)
npm install

# Start the React development server
npm start
```

The frontend will automatically open at http://localhost:3000

### Step 3: Configure the Frontend

The frontend needs to know where to find the backend. Create a `.env` file in the frontend directory:

```bash
cd /Users/gauraklein/code/loop-finder/frontend
echo "REACT_APP_API_URL=http://localhost:8000" > .env
```

Then restart the frontend if it's already running (`npm start`).

## Features Currently Working

### File Upload & Analysis
1. Select a local audio file (WAV, MP3, etc.) using the file picker
2. Or enter a YouTube URL or direct audio URL
3. Configure bar lengths (e.g., "4,2") and top candidates per bar
4. Click "Analyze Audio" to start processing

### Processing Pipeline
When you submit a file or URL:
1. **File Upload**: File is saved to `backend/uploads/`
2. **YouTube URL**: Audio is downloaded using yt-dlp to `backend/uploads/`
3. **Analysis**: Audio is analyzed using librosa to detect BPM and beats
4. **Loop Detection**: Sliding window algorithm finds 2-bar and 4-bar loop candidates
5. **Export**: Best loops are exported as WAV files to `backend/results/{task_id}/loops/`
6. **Stems** (if requested): Demucs separates each loop into drums/bass/other/vocals stems
7. **Report**: JSON report is generated with all metadata

### Results Display
After processing completes, you'll see:
- Number of loops detected
- For each loop:
  - Rank and score (confidence)
  - Bar length (2 or 4)
  - Duration in seconds
  - Start/end time positions
  - ▶️ **Preview button** - plays the loop audio

### Audio Preview
Clicking the ▶️ Preview button on any loop card will:
- Fetch the actual loop WAV file from the backend
- Play it in your browser using the Web Audio API
- Allow you to audition the loop before deciding to use it

## File Structure After Processing

When you process a file, the backend creates this structure:

```
backend/
├── uploads/                    # Uploaded/downloaded source files
│   └── {task_id}.{ext}
├── results/                    # Processing results
│   └── {task_id}/
│       ├── report.json         # Full analysis report
│       ├── loops/              # Exported loop WAV files
│       │   ├── 01_4bar_filename.wav
│       │   ├── 02_2bar_filename.wav
│       │   └── ...
│       └── stems/              # (if stems requested)
│           ├── 01_4bar_filename/
│           │   ├── drums.wav
│           │   ├── bass.wav
│           │   ├── other.wav
│           │   └── vocals.wav
│           ├── 02_2bar_filename/
│           │   ├── drums.wav
│           │   ├── bass.wav
│           │   ├── other.wav
│           │   └── vocals.wav
│           └── ...
```

## API Endpoints Available

### Core Processing
- `POST /upload` - Upload and analyze a local file
- `POST /analyze-url` - Analyze a YouTube or direct URL

### Status & Results
- `GET /task/{task_id}` - Get processing status and results
- `GET /api/loop/{task_id}/{filename}` - Serve loop WAV for preview
- `GET /api/stem/{task_id}/{loop_basename}/{stem_name}` - Serve stem WAV for preview

### Example Usage
After uploading a file and getting task_id `abc123`:
- Get status: `GET /task/abc123`
- Preview first loop: `GET /api/loop/abc123/01_4bar_sample.wav`
- Preview drums stem: `GET /api/stem/abc123/01_4bar_sample/drums.wav`

## Notes & Limitations

### Processing Time
- Audio analysis and loop detection is relatively fast (seconds)
- Stem separation with Demucs is much slower and requires GPU for reasonable speed
- First-time stem separation will download the Demucs model (~200MB)

### Supported Formats
- Accepts any audio format supported by librosa/ffmpeg (WAV, MP3, FLAC, M4A, etc.)
- YouTube URLs work via yt-dlp
- Direct HTTP(S) URLs to audio files also work

### Storage
- Uploaded files are stored indefinitely in `backend/uploads/`
- Results are stored indefinitely in `backend/results/`
- For production, you'd want to add cleanup policies or temporary storage

### Error Handling
- Basic error handling is included
- Processing failures show in the task status
- Invalid files/URLs return appropriate error messages

## Customization Options

You can modify the backend to:
- Change default bar lengths or top candidates
- Add additional analysis features
- Modify the loop ranking/scoring algorithm
- Add different stem separation models
- Implement batch processing
- Add user authentication and authorization

## Troubleshooting

### "Module not found" errors
Make sure you're in the correct directory when running commands:
- Backend: `/Users/gauraklein/code/loop-finder/backend`
- Frontend: `/Users/gauraklein/code/loop-finder/frontend`

### Port conflicts
If port 8000 is already in use, change the port in the uvicorn command:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```
Then update the frontend `.env` file to use `http://localhost:8001`

### CORS issues
If you're accessing the frontend from a different origin, you may need to adjust the CORS settings in `backend/app/main.py`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://your-domain.com"],  # Add your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Next Steps for Enhancement

Once you have this working, you might want to add:
1. **Stem Generation UI**: Buttons to generate and preview stems for each loop
2. **Waveform Visualization**: Using libraries like wavesurfer.js to show loop waveforms
3. **Batch Processing**: Ability to process multiple files at once
4. **Loop Editing**: Trim or adjust loop boundaries before export
5. **Project Management**: Save and load analysis sessions
6. **Export Options**: Different formats, bitrates, or metadata options
7. **Sharing Features**: Generate shareable links for specific loops or stem sets

The foundation is now in place with real audio processing powering a modern React interface. Happy loop finding! 🎵