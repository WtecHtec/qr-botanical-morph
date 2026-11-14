"""
Core Live Photo & Motion Photo Processing Engine
Inspired by AIGC-LivePhoto-Maker & Apple Live Photo Specifications

Features:
1. Apple iOS Live Photo (.JPG + .MOV paired with identical 36-char ContentIdentifier UUID)
2. Apple MakerNote Tag 0x0011 binary injection + ExifTool QuickTime keys tagging
3. Android Motion Photo (.JPG with GCamera MicroVideo XMP + appended MP4)
4. Clean temporary job lifecycle and packaging (.zip / .pvt)
"""

import os
import shutil
import struct
import subprocess
import uuid
import zipfile
from pathlib import Path
from typing import Dict, Optional, Tuple


def find_binary(name: str) -> Optional[str]:
    """Locate binary in system PATH or workspace fallbacks."""
    # 1. System PATH
    found = shutil.which(name)
    if found:
        return found

    # 2. Workspace root node_modules fallback (e.g. exiftool vendored)
    workspace_root = Path(__file__).resolve().parent.parent
    candidates = [
        workspace_root / "node_modules" / ".pnpm" / "node_modules" / ".bin" / name,
        workspace_root / "node_modules" / ".bin" / name,
    ]
    for candidate in candidates:
        if candidate.exists() and os.access(candidate, os.X_OK):
            return str(candidate)

    return None


FFMPEG_BIN = find_binary("ffmpeg") or "ffmpeg"
EXIFTOOL_BIN = find_binary("exiftool")


def ascii_bytes(s: str) -> bytes:
    return s.encode("latin1")


def make_tiff_entry(tag: int, typ: int, count: int, val_or_offset: int) -> bytes:
    """TIFF IFD Entry (12 bytes Big-Endian)."""
    return struct.pack(">HHI I", tag, typ, count, val_or_offset)


def inject_apple_live_photo_exif(jpeg_bytes: bytes, uuid_str: str) -> bytes:
    """
    Injects an Apple-compatible EXIF APP1 block directly into JPEG bytes:
    - IFD0: Make="Apple", Model="iPhone", Orientation=1, ExifIFDPointer
    - ExifIFD: ExifVersion="0232", MakerNote ("Apple iOS\\0\\0\\x01MM" + Tag 0x0011 ContentIdentifier = UUID)
    This creates a genuine Apple MakerNotes structure that iOS Photos requires.
    """
    if len(jpeg_bytes) < 4 or jpeg_bytes[0] != 0xFF or jpeg_bytes[1] != 0xD8:
        raise ValueError("Invalid JPEG data: missing SOI marker (0xFFD8)")

    offset = 2
    rest_chunks = []

    while offset + 4 <= len(jpeg_bytes):
        if jpeg_bytes[offset] != 0xFF:
            rest_chunks.append(jpeg_bytes[offset:])
            break
        marker = jpeg_bytes[offset + 1]
        if marker in (0xDA, 0xD9):
            rest_chunks.append(jpeg_bytes[offset:])
            break
        if marker in (0x00, 0x01) or (0xD0 <= marker <= 0xD7):
            rest_chunks.append(jpeg_bytes[offset : offset + 2])
            offset += 2
            continue
        seg_len = struct.unpack(">H", jpeg_bytes[offset + 2 : offset + 4])[0]
        seg_end = offset + 2 + seg_len
        # Strip existing APP1 Exif so we replace it with our structured Apple Exif
        if marker != 0xE1:
            rest_chunks.append(jpeg_bytes[offset:seg_end])
        offset = seg_end

    uuid_bytes = ascii_bytes(f"{uuid_str}\0")
    # "Apple iOS\0\0\x01MM"
    maker_header = bytes(
        [
            0x41,
            0x70,
            0x70,
            0x6C,
            0x65,
            0x20,
            0x69,
            0x4F,
            0x53,
            0x00,
            0x00,
            0x01,
            0x4D,
            0x4D,
        ]
    )
    maker_val_offset = 14 + 2 + 12 + 4
    maker_ifd_entry = make_tiff_entry(0x0011, 2, len(uuid_bytes), maker_val_offset)
    maker_note = (
        maker_header
        + struct.pack(">H", 1)
        + maker_ifd_entry
        + b"\x00\x00\x00\x00"
        + uuid_bytes
    )

    tiff_header = bytes([0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08])
    make_bytes = ascii_bytes("Apple\0")
    model_bytes = ascii_bytes("iPhone\0\0")

    make_offset = 8 + 54
    model_offset = make_offset + len(make_bytes)
    exif_ifd_offset = model_offset + len(model_bytes)

    ifd0 = (
        struct.pack(">H", 4)
        + make_tiff_entry(0x010F, 2, len(make_bytes), make_offset)
        + make_tiff_entry(0x0110, 2, 7, model_offset)
        + make_tiff_entry(0x0112, 3, 1, 0x00010000)
        + make_tiff_entry(0x8769, 4, 1, exif_ifd_offset)
        + b"\x00\x00\x00\x00"
    )

    maker_note_offset = exif_ifd_offset + 30
    exif_ifd = (
        struct.pack(">H", 2)
        + make_tiff_entry(0x9000, 7, 4, 0x30323332)
        + make_tiff_entry(0x927C, 7, len(maker_note), maker_note_offset)
        + b"\x00\x00\x00\x00"
    )

    app1_payload = (
        ascii_bytes("Exif\0\0")
        + tiff_header
        + ifd0
        + make_bytes
        + model_bytes
        + exif_ifd
        + maker_note
    )
    app1_header = bytes([0xFF, 0xE1]) + struct.pack(">H", len(app1_payload) + 2)

    return jpeg_bytes[:2] + app1_header + app1_payload + b"".join(rest_chunks)


def sanitize_filename_stem(raw: Optional[str], default: str = "IMG_LIVE_PHOTO") -> str:
    if not raw:
        return default
    cleaned = "".join(c for c in raw if c.isalnum() or c in ("-", "_"))[:48]
    return cleaned if cleaned else default


def process_apple_live_photo(
    jpg_input: bytes,
    mov_input: bytes,
    work_dir: Path,
    stem: str = "IMG_LIVE_PHOTO",
    output_bundle: str = "zip",
) -> Dict[str, str]:
    """
    Produces an Apple-compliant Live Photo pair (.JPG + .MOV) and packages it into a ZIP or .pvt bundle.
    Returns dictionary with file paths and metadata.
    """
    work_dir.mkdir(parents=True, exist_ok=True)
    live_uuid = str(uuid.uuid4()).upper()

    raw_jpg_path = work_dir / "raw_cover.jpg"
    raw_mov_path = work_dir / "raw_video.bin"
    norm_jpg_path = work_dir / "norm_cover.jpg"
    final_jpg_path = work_dir / f"{stem}.JPG"
    final_mov_path = work_dir / f"{stem}.MOV"

    raw_jpg_path.write_bytes(jpg_input)
    raw_mov_path.write_bytes(mov_input)

    # 1. Normalize cover image with FFmpeg (ensure standard baseline JPEG yuvj420p)
    subprocess.run(
        [
            FFMPEG_BIN,
            "-y",
            "-i",
            str(raw_jpg_path),
            "-frames:v",
            "1",
            "-q:v",
            "2",
            "-pix_fmt",
            "yuvj420p",
            str(norm_jpg_path),
        ],
        check=True,
        capture_output=True,
    )

    # 2. Inject genuine Apple MakerNote (Tag 0x0011 ContentIdentifier = UUID)
    clean_jpg_bytes = norm_jpg_path.read_bytes()
    injected_bytes = inject_apple_live_photo_exif(clean_jpg_bytes, live_uuid)
    final_jpg_path.write_bytes(injected_bytes)

    # 3. Normalize & transcode video with FFmpeg:
    #    H.264 high profile, yuv420p, no B-frames (for deterministic timestamps),
    #    QuickTime container with +faststart and content identifier metadata tag
    subprocess.run(
        [
            FFMPEG_BIN,
            "-y",
            "-i",
            str(raw_mov_path),
            "-an",
            "-c:v",
            "libx264",
            "-profile:v",
            "high",
            "-level",
            "4.0",
            "-pix_fmt",
            "yuv420p",
            "-vf",
            "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-bf",
            "0",
            "-g",
            "30",
            "-movflags",
            "+faststart",
            "-metadata",
            f"com.apple.quicktime.content.identifier={live_uuid}",
            "-f",
            "mov",
            str(final_mov_path),
        ],
        check=True,
        capture_output=True,
    )

    # 4. If ExifTool is available, apply comprehensive multi-group QuickTime tagging (AIGC-LivePhoto-Maker standard)
    if EXIFTOOL_BIN:
        try:
            subprocess.run(
                [
                    EXIFTOOL_BIN,
                    "-overwrite_original",
                    "-Keys:Make=Apple",
                    "-Keys:Model=iPhone",
                    f"-Keys:ContentIdentifier={live_uuid}",
                    f"-QuickTime:ContentIdentifier={live_uuid}",
                    f"-UserData:ContentIdentifier={live_uuid}",
                    str(final_mov_path),
                ],
                check=False,
                capture_output=True,
            )
        except Exception as e:
            print(f"[Warning] ExifTool MOV tagging skipped: {e}")

    # 5. Packaging
    zip_filename = f"{stem}_LivePhoto.zip"
    zip_path = work_dir / zip_filename

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_STORED) as zf:
        if output_bundle == "pvt":
            # Apple .pvt bundle directory format
            pvt_prefix = f"{stem}.pvt"
            zf.write(final_jpg_path, arcname=f"{pvt_prefix}/{stem}.JPG")
            zf.write(final_mov_path, arcname=f"{pvt_prefix}/{stem}.MOV")
        else:
            # Standard root pairing
            zf.write(final_jpg_path, arcname=f"{stem}.JPG")
            zf.write(final_mov_path, arcname=f"{stem}.MOV")

    return {
        "uuid": live_uuid,
        "stem": stem,
        "jpg_path": str(final_jpg_path),
        "jpg_filename": f"{stem}.JPG",
        "mov_path": str(final_mov_path),
        "mov_filename": f"{stem}.MOV",
        "zip_path": str(zip_path),
        "zip_filename": zip_filename,
    }


def process_android_motion_photo(
    jpg_input: bytes,
    mov_input: bytes,
    work_dir: Path,
    stem: str = "IMG_MOTION_PHOTO",
) -> Dict[str, str]:
    """
    Produces a Google Camera / Android-compliant Motion Photo:
    Single .jpg file containing GCamera MicroVideo XMP tags with the MP4 appended at the end.
    """
    work_dir.mkdir(parents=True, exist_ok=True)
    raw_jpg_path = work_dir / "raw_android.jpg"
    raw_vid_path = work_dir / "raw_android_vid.bin"
    norm_mp4_path = work_dir / "norm_motion.mp4"
    final_jpg_path = work_dir / f"{stem}_MotionPhoto.jpg"

    raw_jpg_path.write_bytes(jpg_input)
    raw_vid_path.write_bytes(mov_input)

    # 1. Transcode video to standard MP4 H.264
    subprocess.run(
        [
            FFMPEG_BIN,
            "-y",
            "-i",
            str(raw_vid_path),
            "-an",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(norm_mp4_path),
        ],
        check=True,
        capture_output=True,
    )

    mp4_bytes = norm_mp4_path.read_bytes()
    mp4_size = len(mp4_bytes)

    # 2. Normalize JPEG
    tagged_jpg_path = work_dir / "tagged_base.jpg"
    subprocess.run(
        [
            FFMPEG_BIN,
            "-y",
            "-i",
            str(raw_jpg_path),
            "-frames:v",
            "1",
            "-q:v",
            "2",
            "-pix_fmt",
            "yuvj420p",
            str(tagged_jpg_path),
        ],
        check=True,
        capture_output=True,
    )

    # 3. Inject XMP-GCamera MicroVideo tags with ExifTool if available
    if EXIFTOOL_BIN:
        subprocess.run(
            [
                EXIFTOOL_BIN,
                "-overwrite_original",
                "-XMP-GCamera:MicroVideo=1",
                "-XMP-GCamera:MicroVideoVersion=1",
                f"-XMP-GCamera:MicroVideoOffset={mp4_size}",
                "-XMP-GCamera:MicroVideoPresentationTimestampUs=1000000",
                str(tagged_jpg_path),
            ],
            check=True,
            capture_output=True,
        )

    # 4. Binary concatenation: [Tagged JPEG] + [MP4 Video Stream]
    with open(final_jpg_path, "wb") as f_out:
        f_out.write(tagged_jpg_path.read_bytes())
        f_out.write(mp4_bytes)

    return {
        "stem": stem,
        "motion_photo_path": str(final_jpg_path),
        "filename": f"{stem}_MotionPhoto.jpg",
        "mp4_size": str(mp4_size),
    }

