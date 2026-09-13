"""
FastAPI backend for loop-finder UI.
Provides API endpoints for file upload, YouTube processing,
audio analysis, and loop detection.
"""

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
import uuid
import shutil
from pathlib import Path
from typing import Optional, List
import asyncio
import json

# Import existing loop-finder functionality
import sys
sys.path.append(str(Path(__file__).parent.parent / "src"))

from loop_finder.analyze import load_and_analyze
from loop_finder.download import download_audio, looks_like_url, normalize_url
from loop_finder.score import find_candidates
from loop_finder.export import export_loops, build_report, write_report_json
from loop_finder.stems import separate_loops

app = FastAPI(title="Loop-Finder API", version="0.1.0")

# Configure CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Storage directories
UPLOAD_DIR = Path("uploads")
RESULTS_DIR = Path("results")
UPLOAD_DIR.mkdir(exist_ok=True)
RESULTS_DIR.mkdir(exist_ok=True)

# In-memory storage for task status (use Redis/database in production)
tasks = {}

@app.get("/")
async def root():
    return {"message": "Loop-Finder API is running"}

@app.post("/upload")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    bars: str = Form("4,2"),
    top: int = Form(5),
    out_dir: Optional[str] = Form(None)
):
    """
    Upload an audio file and start analysis.
    Returns a task ID for tracking progress.
    """
    # Generate unique task ID
    task_id = str(uuid.uuid4())

    # Save uploaded file
    file_extension = Path(file.filename).suffix if file.filename else ".wav"
    filename = f"{task_id}{file_extension}"
    file_path = UPLOAD_DIR / filename

    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Initialize task status
    tasks[task_id] = {
        "status": "uploaded",
        "file_path": str(file_path),
        "filename": file.filename,
        "bars": bars,
        "top": top,
        "out_dir": out_dir or str(RESULTS_DIR / task_id),
        "result": None,
        "error": None
    }

    # Start processing in background
    background_tasks.add_task(process_audio_task, task_id)

    return {"task_id": task_id, "status": "uploaded"}

@app.post("/analyze-url")
async def analyze_url(
    background_tasks: BackgroundTasks,
    url: str = Form(...),
    bars: str = Form("4,2"),
    top: int = Form(5),
    out_dir: Optional[str] = Form(None)
):
    """
    Analyze a YouTube URL or direct audio URL.
    Returns a task ID for tracking progress.
    """
    # Generate unique task ID
    task_id = str(uuid.uuid4())

    # Initialize task status
    tasks[task_id] = {
        "status": "processing_url",
        "url": url,
        "bars": bars,
        "top": top,
        "out_dir": out_dir or str(RESULTS_DIR / task_id),
        "result": None,
        "error": None
    }

    # Start processing in background
    background_tasks.add_task(process_url_task, task_id)

    return {"task_id": task_id, "status": "processing_url"}

async def process_audio_task(task_id: str):
    """Background task to process uploaded audio file."""
    try:
        task = tasks[task_id]
        task["status"] = "analyzing"

        # Parse bars parameter
        bar_lengths = [int(b.strip()) for b in task["bars"].split(",") if b.strip()]

        # Run analysis (this is where we'd call the actual loop-finder logic)
        # For now, we'll simulate the process
        await asyncio.sleep(2)  # Simulate processing time

        # TODO: Replace this with actual loop-finder processing
        # This would involve:
        # 1. load_and_analyze(task["file_path"])
        # 2. find_candidates(...)
        # 3. export_loops(...)
        # 4. Build results

        # Mock result for demonstration
        task["result"] = {
            "task_id": task_id,
            "filename": task["filename"],
            "file_path": task["file_path"],
            "analysis_complete": True,
            "loops": [
                {
                    "id": f"{task_id}_loop_1",
                    "filename": f"loop_1.wav",
                    "bars": 4,
                    "rank": 1,
                    "score": 0.95,
                    "start_time": 0.0,
                    "end_time": 4.0,
                    "duration": 4.0,
                    "preview_url": f"/api/preview/{task_id}_loop_1"
                },
                {
                    "id": f"{task_id}_loop_2",
                    "filename": f"loop_2.wav",
                    "bars": 2,
                    "rank": 2,
                    "score": 0.87,
                    "start_time": 5.0,
                    "end_time": 9.0,
                    "duration": 4.0,
                    "preview_url": f"/api/preview/{task_id}_loop_2"
                }
            ]
        }
        task["status"] = "completed"

    except Exception as e:
        task["status"] = "failed"
        task["error"] = str(e)

async def process_url_task(task_id: str):
    """Background task to process URL (YouTube or direct)."""
    try:
        task = tasks[task_id]
        task["status"] = "downloading"

        # TODO: Implement actual YouTube/download logic using yt-dlp
        # For now, simulate
        await asyncio.sleep(3)  # Simulate download time

        # Then process like uploaded file
        await process_audio_task(task_id)

    except Exception as e:
        task["status"] = "failed"
        task["error"] = str(e)

@app.get("/task/{task_id}")
async def get_task_status(task_id: str):
    """Get the status and results of a processing task."""
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    return tasks[task_id]

@app.get("/api/preview/{loop_id}")
async def get_loop_preview(loop_id: str):
    """
    Serve a preview snippet of a loop for audio playback.
    In a real implementation, this would serve the actual audio file.
    """
    # This would serve the actual loop WAV file
    # For now, return a placeholder
    return {"message": f"Preview for loop {loop_id} would be served here"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)