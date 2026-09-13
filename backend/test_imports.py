#!/usr/bin/env python3
"""
Test script to verify that loop_finder imports work correctly.
Run this to diagnose import issues.
"""

import sys
from pathlib import Path

print("=== Import Test ===")
print(f"Python version: {sys.version}")
print(f"Current working directory: {Path.cwd()}")

# Try to find the project structure
current_file = Path(__file__).resolve()
print(f"This file: {current_file}")

backend_dir = current_file.parent
project_root = backend_dir.parent
src_dir = project_root / "src"

print(f"Backend dir: {backend_dir}")
print(f"Project root: {project_root}")
print(f"Src dir: {src_dir}")
print(f"Src exists: {src_dir.exists()}")

if src_dir.exists():
    loop_finder_dir = src_dir / "loop_finder"
    print(f"Loop finder dir: {loop_finder_dir}")
    print(f"Loop finder exists: {loop_finder_dir.exists()}")

    if loop_finder_dir.exists():
        init_file = loop_finder_dir / "__init__.py"
        print(f"Init file: {init_file}")
        print(f"Init file exists: {init_file.exists()}")

# Test the path addition
print("\n=== Testing Path Addition ===")
print(f"Original sys.path[0:3]: {sys.path[:3]}")

# Add src to Python path
src_path_str = str(src_dir)
if src_path_str not in sys.path:
    sys.path.insert(0, src_path_str)
    print(f"Added {src_path_str} to sys.path")
else:
    print(f"{src_path_str} already in sys.path")

print(f"Updated sys.path[0:3]: {sys.path[:3]}")

# Try the import
print("\n=== Testing Import ===")
try:
    from loop_finder.analyze import load_and_analyze
    print("✓ Successfully imported load_and_analyze")
except ImportError as e:
    print(f"✗ Failed to import load_and_analyze: {e}")
    print(f"  Error type: {type(e).__name__}")

try:
    from loop_finder.download import download_audio, looks_like_url, normalize_url
    print("✓ Successfully imported download functions")
except ImportError as e:
    print(f"✗ Failed to import download functions: {e}")

try:
    from loop_finder.score import find_candidates
    print("✓ Successfully imported find_candidates")
except ImportError as e:
    print(f"✗ Failed to import find_candidates: {e}")

try:
    from loop_finder.export import export_loops, build_report, write_report_json
    print("✓ Successfully imported export functions")
except ImportError as e:
    print(f"✗ Failed to import export functions: {e}")

try:
    from loop_finder.stems import separate_loops, StemSeparator
    print("✓ Successfully imported stem functions")
except ImportError as e:
    print(f"✗ Failed to import stem functions: {e}")

print("\n=== Test Complete ===")