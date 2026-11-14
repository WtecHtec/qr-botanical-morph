"""
FastAPI Server for Apple Live Photo & Android Motion Photo Generation
Run with: uv run python main.py or uv run uvicorn main:app --host 0.0.0.0 --port 8000
"""

import os
import shutil
import socket
import tempfile
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from live_photo_maker import (
    EXIFTOOL_BIN,
    FFMPEG_BIN,
    process_android_motion_photo,
    process_apple_live_photo,
    sanitize_filename_stem,
)

PORT = int(os.getenv("PORT", "8000"))
JOBS_ROOT = Path(tempfile.gettempdir()) / "qr-livephoto-python-jobs"
JOB_TTL_SECONDS = 1800  # 30 minutes

JOBS_ROOT.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="AIGC Live Photo Maker API",
    description="High-performance backend for Apple Live Photos & Android Motion Photos pairing",
    version="1.0.0",
)

# Enable CORS for all local/network dev clients and origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


def get_local_ip_addresses():
    """Retrieve all accessible IPv4 LAN addresses."""
    addresses = []
    try:
        # Standard socket trick to find the preferred outbound IP
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            preferred = s.getsockname()[0]
            if preferred and not preferred.startswith("127."):
                addresses.append(preferred)
    except Exception:
        pass

    # Fallback to gethostbyname_ex
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if ip not in addresses and not ip.startswith("127."):
                addresses.append(ip)
    except Exception:
        pass

    return addresses


def cleanup_expired_jobs():
    """Purge temporary folders older than TTL."""
    now = time.time()
    try:
        for job_dir in JOBS_ROOT.iterdir():
            if job_dir.is_dir():
                mtime = job_dir.stat().st_mtime
                if now - mtime > JOB_TTL_SECONDS:
                    shutil.rmtree(job_dir, ignore_errors=True)
    except Exception:
        pass


@app.get("/")
@app.get("/api/health")
async def health_check():
    """Health check endpoint displaying engine and LAN IP information."""
    lan_ips = get_local_ip_addresses()
    return {
        "status": "ok",
        "service": "AIGC LivePhoto Maker (Python Engine)",
        "ffmpeg": FFMPEG_BIN,
        "exiftool": EXIFTOOL_BIN or "not found (fallback mode)",
        "localUrl": f"http://localhost:{PORT}",
        "networkUrls": [f"http://{ip}:{PORT}" for ip in lan_ips],
    }


@app.post("/api/live-photo")
async def create_live_photo(
    jpg: UploadFile = File(..., description="Cover JPEG image"),
    mov: UploadFile = File(..., description="Companion video (MOV or MP4)"),
    stem: Optional[str] = Form(None, description="Base filename stem"),
    direction: Optional[str] = Form("tree-to-qr", description="Transition direction"),
    platform: str = Form("apple", description="Target platform: apple | android"),
    bundle_format: str = Form("zip", description="Packaging: zip | pvt"),
    direct_download: bool = Query(False, description="Directly return file response"),
):
    """
    Main Live Photo generation endpoint.
    Receives JPG cover and MOV/MP4 video clip, produces an Apple Live Photo pair
    or Android Motion Photo with proper binary & XMP/MakerNote metadata binding.
    """
    cleanup_expired_jobs()

    # Determine default file stem based on direction
    default_stem = (
        "IMG_TREE_TO_QR"
        if direction == "tree-to-qr"
        else "IMG_QR_TO_TREE"
        if direction == "qr-to-tree"
        else "IMG_LIVE_PHOTO"
    )
    safe_stem = sanitize_filename_stem(stem, default=default_stem)

    job_id = str(uuid.uuid4())
    job_dir = JOBS_ROOT / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    try:
        jpg_bytes = await jpg.read()
        mov_bytes = await mov.read()

        if len(jpg_bytes) == 0 or len(mov_bytes) == 0:
            raise HTTPException(status_code=400, detail="上传的文件不能为空")

        if platform == "android":
            res = process_android_motion_photo(
                jpg_input=jpg_bytes,
                mov_input=mov_bytes,
                work_dir=job_dir,
                stem=safe_stem,
            )
            motion_photo_filename = res["filename"]
            download_url = f"/api/live-photo/download/{job_id}/{motion_photo_filename}"

            if direct_download:
                return FileResponse(
                    path=res["motion_photo_path"],
                    filename=motion_photo_filename,
                    media_type="image/jpeg",
                )

            return {
                "ok": True,
                "jobId": job_id,
                "platform": "android",
                "stem": safe_stem,
                "filename": motion_photo_filename,
                "downloadUrl": download_url,
                "mp4Size": res["mp4_size"],
            }

        # Apple Live Photo processing
        res = process_apple_live_photo(
            jpg_input=jpg_bytes,
            mov_input=mov_bytes,
            work_dir=job_dir,
            stem=safe_stem,
            output_bundle=bundle_format,
        )

        zip_filename = res["zip_filename"]
        jpg_filename = res["jpg_filename"]
        mov_filename = res["mov_filename"]

        if direct_download:
            return FileResponse(
                path=res["zip_path"],
                filename=zip_filename,
                media_type="application/zip",
            )

        return {
            "ok": True,
            "jobId": job_id,
            "platform": "apple",
            "uuid": res["uuid"],
            "stem": safe_stem,
            "jpgFilename": jpg_filename,
            "movFilename": mov_filename,
            "zipFilename": zip_filename,
            "jpgUrl": f"/api/live-photo/download/{job_id}/{jpg_filename}",
            "movUrl": f"/api/live-photo/download/{job_id}/{mov_filename}",
            "zipUrl": f"/api/live-photo/download/{job_id}/{zip_filename}",
        }

    except Exception as e:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"实况照片生成失败: {str(e)}")


@app.get("/api/live-photo/download/{job_id}/{filename}")
async def download_file(job_id: str, filename: str):
    """Serve generated Live Photo assets with proper MIME types."""
    safe_name = Path(filename).name
    file_path = JOBS_ROOT / job_id / safe_name

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="文件不存在或已过期，请重新生成")

    lower = safe_name.lower()
    if lower.endswith(".jpg") or lower.endswith(".jpeg"):
        media_type = "image/jpeg"
    elif lower.endswith(".mov"):
        media_type = "video/quicktime"
    elif lower.endswith(".mp4"):
        media_type = "video/mp4"
    elif lower.endswith(".zip"):
        media_type = "application/zip"
    else:
        media_type = "application/octet-stream"

    return FileResponse(
        path=str(file_path),
        filename=safe_name,
        media_type=media_type,
    )


def print_startup_banner():
    lan_ips = get_local_ip_addresses()
    print("=" * 60)
    print("🚀 AIGC LivePhoto Maker (Python Engine) Started!")
    print(f"👉 Local:   http://localhost:{PORT}")
    for ip in lan_ips:
        print(f"📱 Mobile:  http://{ip}:{PORT} (在同一局域网/WiFi下手机可访问)")
    print(f"📄 Docs:    http://localhost:{PORT}/docs")
    print("=" * 60)


if __name__ == "__main__":
    import uvicorn

    print_startup_banner()
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
