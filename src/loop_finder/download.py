"""Download audio from YouTube (and other yt-dlp sources)."""

from __future__ import annotations

import re
from pathlib import Path

import yt_dlp

_URL_RE = re.compile(r"^https?://", re.IGNORECASE)


def looks_like_url(value: str) -> bool:
    return bool(_URL_RE.match(value.strip()))


def normalize_url(url: str) -> str:
    """Strip shell over-escaping (e.g. watch\\?v\\=...) from a URL."""
    url = url.strip()
    # Common zsh/tab-completion escapes inside quoted strings
    for escaped, raw in (
        ("\\?", "?"),
        ("\\=", "="),
        ("\\&", "&"),
        ("\\#", "#"),
        ("\\:", ":"),
        ("\\/", "/"),
    ):
        url = url.replace(escaped, raw)
    return url


def download_audio(url: str, dest_dir: Path) -> Path:
    """Download best audio from URL into dest_dir; return path to a WAV file."""
    url = normalize_url(url)
    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    outtmpl = str(dest_dir / "%(id)s.%(ext)s")

    ydl_opts: dict = {
        "format": "bestaudio/best",
        "outtmpl": outtmpl,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "wav",
            }
        ],
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        if info is None:
            raise RuntimeError(f"Could not download audio from {url}")
        # Playlists shouldn't happen with noplaylist, but be safe
        if "entries" in info:
            entries = [e for e in info["entries"] if e]
            if not entries:
                raise RuntimeError(f"No video found at {url}")
            info = entries[0]
        video_id = info.get("id")
        if not video_id:
            raise RuntimeError("Download succeeded but video id is missing")

    wav_path = dest_dir / f"{video_id}.wav"
    if not wav_path.exists():
        # Fallback: find any audio file yt-dlp wrote for this id
        matches = list(dest_dir.glob(f"{video_id}.*"))
        if not matches:
            raise RuntimeError(f"Downloaded audio not found in {dest_dir}")
        wav_path = matches[0]

    # Prefer a readable title-based name for exported loop stems
    title = (info.get("title") or video_id).strip()
    safe = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", title).strip(" .") or video_id
    named = dest_dir / f"{safe}{wav_path.suffix}"
    if named != wav_path:
        if named.exists():
            named.unlink()
        wav_path.rename(named)
        wav_path = named

    return wav_path
