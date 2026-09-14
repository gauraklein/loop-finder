"""
FastAPI backend for loop-finder UI.
Provides API endpoints for file upload, YouTube processing,
audio analysis, and loop detection.
"""

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
import uuid
import shutil
from pathlib import Path
from typing import Optional, List, Dict, Any
import asyncio
import json
import sys
import zipfile
import io

# ===== CRITICAL: Add src directory to Python path BEFORE any loop_finder imports =====
# This ensures we can import the local loop_finder package
current_dir = Path(__file__).parent
project_root = current_dir.parent
src_path = project_root / "src"

# Add src to Python path if not already there
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))
    print(f"Added {src_path} to Python path")

# Now import loop-finder functionality
try:
    from loop_finder.analyze import load_and_analyze
    from loop_finder.download import download_audio, looks_like_url, normalize_url
    from loop_finder.score import find_candidates
    from loop_finder.export import export_loops, build_report, write_report_json
    from loop_finder.stems import separate_loops, StemSeparator
    print("Successfully imported loop_finder modules")
except ImportError as e:
    print(f"Failed to import loop_finder modules: {e}")
    print(f"Current sys.path: {sys.path}")
    print(f"Looking for src at: {src_path}")
    print(f"Src exists: {src_path.exists()}")
    raise

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
BASE_DIR = project_root
UPLOAD_DIR = BASE_DIR / "uploads"
RESULTS_DIR = BASE_DIR / "results"
UPLOAD_DIR.mkdir(exist_ok=True)
RESULTS_DIR.mkdir(exist_ok=True)

# In-memory storage for task status (use Redis/database in production)
tasks: Dict[str, Dict[str, Any]] = {}

@app.get("/")
async def root():
    return {"message": "Loop-Finder API is running"}

@app.post("/upload")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    bars: str = Form("4,2"),
    top: int = Form(5),
    out_dir: Optional[str] = Form(None),
    stems: bool = Form(False)
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
        "stems": stems,
        "result": None,
        "error": None,
        "progress": 0
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
    out_dir: Optional[str] = Form(None),
    stems: bool = Form(False)
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
        "stems": stems,
        "result": None,
        "error": None,
        "progress": 0
    }

    # Start processing in background
    background_tasks.add_task(process_url_task, task_id)

    return {"task_id": task_id, "status": "processing_url"}

async def process_audio_task(task_id: str):
    """Background task to process uploaded audio file."""
    try:
        task = tasks[task_id]
        task["status"] = "analyzing"
        task["progress"] = 10

        # Parse bars parameter
        bar_lengths = [int(b.strip()) for b in task["bars"].split(",") if b.strip()]

        # Update progress
        task["progress"] = 20

        # Run actual analysis
        print(f"Analyzing {task['file_path']}...")
        analysis = load_and_analyze(task["file_path"])
        task["progress"] = 40
        print(f"Detected BPM: {analysis.bpm:.2f}")

        # Find candidates
        print("Finding loop candidates...")
        candidates_by_bars = find_candidates(
            analysis,
            bar_lengths=bar_lengths,
            top=task["top"],
            min_score=0.0
        )
        task["progress"] = 60
        print(f"Found candidates: {[len(v) for v in candidates_by_bars.values()]}")

        # Export loops
        print("Exporting loops...")
        track_dir, rows = export_loops(
            analysis,
            candidates_by_bars,
            Path(task["out_dir"])
        )
        task["progress"] = 80
        print(f"Exported {len(rows)} loops to {track_dir}")

        # Separate stems if requested
        if task["stems"]:
            print("Separating stems...")
            # Convert rows to the format expected by separate_loops
            loop_rows = []
            for row in rows:
                loop_rows.append({
                    "file": row["file"],
                    "basename": row.get("basename") or Path(row["file"]).stem
                })

            # Separate stems
            separated_rows = separate_loops(
                loop_rows,
                Path(task["out_dir"]),
                on_progress=lambda name: print(f"  stems: {name}")
            )
            # Update rows with stem information
            for i, row in enumerate(rows):
                row["stems_dir"] = separated_rows[i].get("stems_dir")
                row["stems"] = separated_rows[i].get("stems")
            task["progress"] = 90

        # Build final result
        report = build_report(analysis, rows)
        if task["stems"]:
            report["stems"] = True

        # Save report
        report_path = Path(task["out_dir"]) / "report.json"
        write_report_json(report, report_path)

        # Prepare result for frontend
        task["result"] = {
            "task_id": task_id,
            "filename": task["filename"],
            "file_path": task["file_path"],
            "analysis_complete": True,
            "report_path": str(report_path),
            "loops_dir": str(track_dir / "loops"),
            "stems_dir": str(track_dir / "stems") if task["stems"] else None,
            "loops": [
                {
                    "id": f"{task_id}_loop_{i}",
                    "filename": Path(row["file"]).name,
                    "basename": row.get("basename"),
                    "bars": row["bars"],
                    "rank": row["rank"],
                    "score": round(row["score"], 4),
                    "start_time": round(row["start_time"], 3),
                    "end_time": round(row["end_time"], 3),
                    "duration": round(row["end_time"] - row["start_time"], 3),
                    "preview_url": f"/api/loop/{task_id}/{Path(row['file']).name}",
                    "stems": row.get("stems", {})
                }
                for i, row in enumerate(rows)
            ]
        }
        task["status"] = "completed"
        task["progress"] = 100

    except Exception as e:
        import traceback
        print(f"Error in process_audio_task: {e}")
        traceback.print_exc()
        task["status"] = "failed"
        task["error"] = str(e)
        task["progress"] = 0

async def process_url_task(task_id: str):
    """Background task to process URL (YouTube or direct)."""
    try:
        task = tasks[task_id]
        task["status"] = "downloading"
        task["progress"] = 10

        # Download audio
        print(f"Downloading from {task['url']}...")
        audio_path = download_audio(task["url"], UPLOAD_DIR)
        task["file_path"] = str(audio_path)
        task["filename"] = audio_path.name
        task["progress"] = 40
        print(f"Downloaded to {audio_path}")

        # Then process like uploaded file
        await process_audio_task(task_id)

    except Exception as e:
        import traceback
        print(f"Error in process_url_task: {e}")
        traceback.print_exc()
        task["status"] = "failed"
        task["error"] = str(e)
        task["progress"] = 0

@app.get("/task/{task_id}")
async def get_task_status(task_id: str):
    """Get the status and results of a processing task."""
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    return tasks[task_id]

@app.get("/api/loop/{task_id}/{filename}")
async def get_loop_file(task_id: str, filename: str):
    """Serve a loop WAV file for audio playback."""
    # First check if task is in memory
    if task_id in tasks:
        task = tasks[task_id]
        if task["status"] != "completed":
            raise HTTPException(status_code=400, detail="Task not completed yet")

        # Construct file path from memory
        loops_dir = Path(task["result"]["loops_dir"]) if task["result"] and task["result"].get("loops_dir") else None
    else:
        # Fallback to checking filesystem for completed tasks
        task_dir = RESULTS_DIR / task_id
        if not task_dir.exists():
            raise HTTPException(status_code=404, detail="Task not found or not completed yet")

        # Find the loop file by searching in track subdirectories
        loop_files = list(task_dir.glob("*/loops/" + filename))
        if len(loop_files) != 1:
            raise HTTPException(status_code=404, detail="Task not found or not completed yet")

        file_path = loop_files[0]
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Loop file not found")

        # Verify it's a completed task by checking if report exists
        report_path = task_dir / "report.json"
        if not report_path.exists():
            raise HTTPException(status_code=404, detail="Task not found or not completed yet")

    return FileResponse(
        path=str(file_path),
        media_type="audio/wav",
        filename=filename
    )

@app.get("/api/stem/{task_id}/{loop_basename}/{stem_name}")
async def get_stem_file(task_id: str, loop_basename: str, stem_name: str):
    """Serve a stem WAV file for audio playback."""
    # First check if task is in memory
    if task_id in tasks:
        task = tasks[task_id]
        if task["status"] != "completed":
            raise HTTPException(status_code=400, detail="Task not completed yet")

        if not task.get("stems"):
            raise HTTPException(status_code=400, detail="Stems not generated for this task")

        # Construct file path from memory
        stems_base = Path(task["result"]["stems_dir"]) if task["result"] and task["result"].get("stems_dir") else None
    else:
        # Fallback to checking filesystem for completed tasks
        task_dir = RESULTS_DIR / task_id
        if not task_dir.exists():
            raise HTTPException(status_code=404, detail="Task not found, not completed yet, or no stems generated")

        # Find the stem file by searching in track subdirectories
        stem_files = list(task_dir.glob("*/stems/" + loop_basename + "/" + stem_name + ".wav"))
        if len(stem_files) != 1:
            raise HTTPException(status_code=404, detail="Task not found, not completed yet, or no stems generated")

        file_path = stem_files[0]
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Stem file not found")

        # Verify it's a completed task by checking if report and loops exist
        report_path = task_dir / "report.json"
        loops_dirs = list(task_dir.glob("*/loops"))
        if not report_path.exists() or len(loops_dirs) == 0:
            raise HTTPException(status_code=404, detail="Task not found or not completed yet")

    return FileResponse(
        path=str(file_path),
        media_type="audio/wav",
        filename=f"{loop_basename}_{stem_name}.wav"
    )

@app.get("/api/report/{task_id}")
async def get_report_file(task_id: str):
    """Serve the analysis report JSON file."""
    # First check if task is in memory
    if task_id in tasks:
        task = tasks[task_id]
        if task["status"] != "completed":
            raise HTTPException(status_code=400, detail="Task not completed yet")

        if not task.get("result") or not task["result"].get("report_path"):
            raise HTTPException(status_code=404, detail="Report not found")

        report_path = Path(task["result"]["report_path"])
    else:
        # Fallback to checking filesystem for completed tasks
        report_path = RESULTS_DIR / task_id / "report.json"
        if not report_path.exists():
            raise HTTPException(status_code=404, detail="Task not found or report not available")

        # Verify it's a completed task by checking if loops directory exists
        loops_dir = RESULTS_DIR / task_id / "loops"
        if not loops_dir.exists():
            raise HTTPException(status_code=400, detail="Task not completed yet")

    if not report_path.exists():
        raise HTTPException(status_code=404, detail="Report file not found")

    return FileResponse(
        path=str(report_path),
        media_type="application/json",
        filename=f"report-{task_id}.json"
    )

@app.get("/api/zip-loops/{task_id}")
async def get_loops_zip(task_id: str, stems: bool = False):
    """Generate and serve a ZIP file containing all loops (and optionally stems)."""
    # First check if task is in memory
    if task_id in tasks:
        task = tasks[task_id]
        if task["status"] != "completed":
            raise HTTPException(status_code=400, detail="Task not completed yet")

        if not task.get("result"):
            raise HTTPException(status_code=404, detail="Task result not found")
    else:
        # Fallback to checking filesystem for completed tasks
        # Verify it's a completed task by checking if report and loops directory exist
        report_path = RESULTS_DIR / task_id / "report.json"
        loops_dir = RESULTS_DIR / task_id / "loops"
        if not report_path.exists() or not loops_dir.exists():
            raise HTTPException(status_code=404, detail="Task not found or not completed yet")

        # Create a minimal task-like object for the ZIP generation logic
        task = {
            "result": {
                "report_path": str(report_path),
                "loops_dir": str(loops_dir),
                "stems_dir": str(RESULTS_DIR / task_id / "stems") if (RESULTS_DIR / task_id / "stems").exists() else None
            },
            "stems": (RESULTS_DIR / task_id / "stems").exists()
        }

    # Create a ZIP file in memory
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        # Add report file
        if task["result"].get("report_path"):
            report_path = Path(task["result"]["report_path"])
            if report_path.exists():
                zip_file.write(report_path, f"report-{task_id}.json")

        # Add loop files
        loops_dir = Path(task["result"]["loops_dir"]) if task["result"].get("loops_dir") else None
        if loops_dir and loops_dir.exists():
            for loop_file in loops_dir.glob("*.wav"):
                zip_file.write(loop_file, f"loops/{loop_file.name}")

        # Add stem files if requested and available
        if stems and task.get("stems") and task["result"].get("stems_dir"):
            stems_dir = Path(task["result"]["stems_dir"])
            if stems_dir.exists():
                for stem_dir in stems_dir.iterdir():
                    if stem_dir.is_dir():
                        for stem_file in stem_dir.glob("*.wav"):
                            # Store in ZIP as: stems/{loop_basename}/{stem_file}
                            arcname = f"stems/{stem_dir.name}/{stem_file.name}"
                            zip_file.write(stem_file, arcname)

    # Reset buffer position to beginning
    zip_buffer.seek(0)

    # Generate filename
    zip_filename = f"loop-finder-results-{task_id}"
    if stems:
        zip_filename += "-with-stems"
    zip_filename += ".zip"

    return StreamingResponse(
        io.BytesIO(zip_buffer.read()),
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename={zip_filename}"
        }
    )

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)