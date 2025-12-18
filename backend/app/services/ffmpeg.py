"""
FFmpeg service for video processing operations.
Provides functionality for muxing subtitles into video containers.
"""
import subprocess
import shutil
from pathlib import Path
from dataclasses import dataclass
from typing import Optional
import re


@dataclass
class MuxResult:
    """Result of a muxing operation"""
    success: bool
    output_path: Optional[str] = None
    error: Optional[str] = None


def is_available() -> bool:
    """Check if FFmpeg is available on the system"""
    return shutil.which("ffmpeg") is not None


def get_ffmpeg_path() -> Optional[str]:
    """Get the path to FFmpeg executable"""
    return shutil.which("ffmpeg")


def detect_subtitle_language(subtitle_path: Path) -> Optional[str]:
    """
    Try to detect subtitle language from filename.
    Common patterns: .en.srt, .eng.srt, .english.srt, etc.
    """
    stem = subtitle_path.stem.lower()

    # Common language codes and their ISO 639-2 equivalents
    lang_patterns = {
        r'\.en$|\.eng$|\.english$': 'eng',
        r'\.es$|\.spa$|\.spanish$': 'spa',
        r'\.fr$|\.fre$|\.french$': 'fre',
        r'\.de$|\.ger$|\.german$': 'ger',
        r'\.it$|\.ita$|\.italian$': 'ita',
        r'\.pt$|\.por$|\.portuguese$': 'por',
        r'\.ru$|\.rus$|\.russian$': 'rus',
        r'\.ja$|\.jpn$|\.japanese$': 'jpn',
        r'\.ko$|\.kor$|\.korean$': 'kor',
        r'\.zh$|\.chi$|\.chinese$': 'chi',
        r'\.ar$|\.ara$|\.arabic$': 'ara',
        r'\.nl$|\.dut$|\.dutch$': 'dut',
        r'\.pl$|\.pol$|\.polish$': 'pol',
        r'\.sv$|\.swe$|\.swedish$': 'swe',
        r'\.no$|\.nor$|\.norwegian$': 'nor',
        r'\.da$|\.dan$|\.danish$': 'dan',
        r'\.fi$|\.fin$|\.finnish$': 'fin',
    }

    for pattern, lang_code in lang_patterns.items():
        if re.search(pattern, stem):
            return lang_code

    # Default to English if no language detected
    return 'eng'


def get_subtitle_codec(subtitle_path: Path) -> str:
    """Get the appropriate subtitle codec based on file extension"""
    ext = subtitle_path.suffix.lower()
    codec_map = {
        '.srt': 'srt',
        '.ass': 'ass',
        '.ssa': 'ass',
        '.sub': 'dvdsub',
        '.vtt': 'webvtt',
    }
    return codec_map.get(ext, 'srt')


def mux_subtitle_into_video(
    video_path: Path,
    subtitle_path: Path,
    output_path: Optional[Path] = None,
    delete_originals: bool = True,
    subtitle_language: Optional[str] = None,
    subtitle_title: Optional[str] = None
) -> MuxResult:
    """
    Mux an external subtitle file into a video container.

    This uses FFmpeg to copy all existing streams and add the subtitle track.
    The output is always an MKV container as it has the best subtitle support.

    Args:
        video_path: Path to the source video file
        subtitle_path: Path to the subtitle file (.srt, .ass, .ssa, .sub, .vtt)
        output_path: Path for the output file. If None, will use video name with .mkv extension
        delete_originals: If True, delete the original video and subtitle files after successful mux
        subtitle_language: Language code for the subtitle (e.g., 'eng', 'spa'). Auto-detected if None.
        subtitle_title: Title/name for the subtitle track (e.g., 'English', 'Spanish SDH')

    Returns:
        MuxResult with success status and output path or error message
    """
    if not is_available():
        return MuxResult(
            success=False,
            error="FFmpeg is not installed or not in PATH")

    if not video_path.exists():
        return MuxResult(
            success=False,
            error=f"Video file not found: {video_path}")

    if not subtitle_path.exists():
        return MuxResult(
            success=False,
            error=f"Subtitle file not found: {subtitle_path}")

    # Determine output path (always .mkv for best subtitle support)
    if output_path is None:
        output_path = video_path.with_suffix('.mkv')

    # If output would be same as input, use temp name
    temp_output = None
    if output_path == video_path:
        temp_output = video_path.with_suffix('.temp.mkv')
        actual_output = temp_output
    else:
        actual_output = output_path

    # Auto-detect language if not provided
    if subtitle_language is None:
        subtitle_language = detect_subtitle_language(subtitle_path)

    # Build FFmpeg command
    # -i video: input video
    # -i subtitle: input subtitle
    # -c copy: copy all streams without re-encoding
    # -c:s srt/ass: set subtitle codec
    # -metadata:s:s:0: set metadata for the first subtitle stream we're adding
    cmd = [
        'ffmpeg',
        '-i', str(video_path),
        '-i', str(subtitle_path),
        '-map', '0',          # Map all streams from first input (video)
        '-map', '1:0',        # Map first stream from second input (subtitle)
        '-c', 'copy',         # Copy all codecs (no re-encoding)
        '-c:s', 'srt',        # Convert subtitle to SRT format in container
    ]

    # Add subtitle language metadata
    if subtitle_language:
        cmd.extend(['-metadata:s:s:0', f'language={subtitle_language}'])

    # Add subtitle title if provided
    if subtitle_title:
        cmd.extend(['-metadata:s:s:0', f'title={subtitle_title}'])
    else:
        # Default title based on language
        lang_names = {
            'eng': 'English',
            'spa': 'Spanish',
            'fre': 'French',
            'ger': 'German',
            'ita': 'Italian',
            'por': 'Portuguese',
            'rus': 'Russian',
            'jpn': 'Japanese',
            'kor': 'Korean',
            'chi': 'Chinese',
            'ara': 'Arabic',
            'dut': 'Dutch',
            'pol': 'Polish',
            'swe': 'Swedish',
            'nor': 'Norwegian',
            'dan': 'Danish',
            'fin': 'Finnish'}
        title = lang_names.get(subtitle_language, 'Subtitles')
        cmd.extend(['-metadata:s:s:0', f'title={title}'])

    # Output file
    cmd.extend(['-y', str(actual_output)])  # -y to overwrite

    try:
        # Run FFmpeg
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600  # 10 minute timeout
        )

        if result.returncode != 0:
            return MuxResult(
                success=False,
                error=f"FFmpeg failed: {result.stderr[-500:] if result.stderr else 'Unknown error'}"
            )

        # If we used a temp file, rename it
        if temp_output:
            # Delete original video
            video_path.unlink()
            # Rename temp to final
            temp_output.rename(output_path)

        # Delete originals if requested
        if delete_originals:
            # Delete original video if it still exists and is different from
            # output
            if video_path.exists() and video_path != output_path:
                video_path.unlink()
            # Delete subtitle file
            if subtitle_path.exists():
                subtitle_path.unlink()

        return MuxResult(success=True, output_path=str(output_path))

    except subprocess.TimeoutExpired:
        # Clean up temp file if it exists
        if temp_output and temp_output.exists():
            temp_output.unlink()
        return MuxResult(
            success=False,
            error="FFmpeg timed out after 10 minutes")
    except Exception as e:
        # Clean up temp file if it exists
        if temp_output and temp_output.exists():
            temp_output.unlink()
        return MuxResult(success=False, error=str(e))


def get_mux_preview(video_path: Path, subtitle_path: Path) -> dict:
    """
    Get a preview of what the mux operation will do.

    Returns information about the files and the expected output.
    """
    video_size = video_path.stat().st_size if video_path.exists() else 0
    subtitle_size = subtitle_path.stat().st_size if subtitle_path.exists() else 0

    output_path = video_path.with_suffix('.mkv')
    will_replace = output_path == video_path or video_path.suffix.lower() == '.mkv'

    return {
        'video_file': video_path.name,
        'video_size': video_size,
        'video_path': str(video_path),
        'subtitle_file': subtitle_path.name,
        'subtitle_size': subtitle_size,
        'subtitle_path': str(subtitle_path),
        'output_file': output_path.name,
        'output_path': str(output_path),
        'will_replace_original': will_replace,
        'detected_language': detect_subtitle_language(subtitle_path),
        'ffmpeg_available': is_available(),
    }
