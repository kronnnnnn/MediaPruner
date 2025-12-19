"""
MediaInfo Service - Extracts technical metadata from video files using pymediainfo
"""
import json
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field, asdict
import logging

try:
    from pymediainfo import MediaInfo
    MEDIAINFO_AVAILABLE = True
except ImportError:
    MEDIAINFO_AVAILABLE = False

logger = logging.getLogger(__name__)


@dataclass
class AudioTrack:
    """Audio track information"""
    track_id: int
    codec: str
    channels: str
    bitrate: Optional[int] = None
    language: Optional[str] = None
    title: Optional[str] = None
    default: bool = False


@dataclass
class SubtitleTrack:
    """Subtitle track information"""
    track_id: int
    codec: str
    language: Optional[str] = None
    title: Optional[str] = None
    forced: bool = False
    default: bool = False


@dataclass
class MediaInfoResult:
    """Complete media info analysis result"""
    # General info
    container: Optional[str] = None
    duration: Optional[int] = None  # in seconds
    overall_bitrate: Optional[int] = None  # in kbps
    file_size: int = 0

    # Video info
    video_codec: Optional[str] = None
    video_codec_profile: Optional[str] = None
    video_width: Optional[int] = None
    video_height: Optional[int] = None
    video_resolution: Optional[str] = None
    video_aspect_ratio: Optional[str] = None
    video_bitrate: Optional[int] = None  # in kbps
    video_framerate: Optional[str] = None
    video_hdr: Optional[str] = None

    # Primary audio info
    audio_codec: Optional[str] = None
    audio_channels: Optional[str] = None
    audio_bitrate: Optional[int] = None
    audio_language: Optional[str] = None

    # All audio tracks
    audio_tracks: list[AudioTrack] = field(default_factory=list)

    # Subtitles
    subtitle_tracks: list[SubtitleTrack] = field(default_factory=list)
    subtitle_count: int = 0
    subtitle_languages: list[str] = field(default_factory=list)

    # Error info
    success: bool = True
    error: Optional[str] = None


def _get_channel_layout(
        channels: int,
        channel_layout: Optional[str] = None) -> str:
    """Convert channel count to friendly format"""
    channel_map = {
        1: "Mono",
        2: "Stereo",
        3: "2.1",
        6: "5.1",
        8: "7.1",
    }

    # First try to get from channel count
    friendly = channel_map.get(channels)
    if friendly:
        return friendly

    # If we have a channel layout string, use it
    if channel_layout:
        # Map common layouts to friendly names
        layout_map = {
            "L R": "Stereo",
            "C": "Mono",
            "L R C LFE Ls Rs": "5.1",
            "L R C LFE Ls Rs Lb Rb": "7.1",
        }
        return layout_map.get(channel_layout, channel_layout)

    return f"{channels}ch"


def _detect_hdr(video_track) -> Optional[str]:
    """Detect HDR format from video track"""
    hdr_format = getattr(video_track, 'hdr_format', None)
    if hdr_format:
        return hdr_format

    # Check for HDR indicators
    color_primaries = getattr(video_track, 'color_primaries', '') or ''
    transfer = getattr(video_track, 'transfer_characteristics', '') or ''

    if 'BT.2020' in color_primaries or 'BT.2100' in color_primaries:
        if 'PQ' in transfer or 'SMPTE ST 2084' in transfer:
            return 'HDR10'
        elif 'HLG' in transfer:
            return 'HLG'

    # Check for Dolby Vision
    hdr_format_commercial = getattr(
        video_track, 'hdr_format_commercial', '') or ''
    if 'Dolby Vision' in hdr_format_commercial:
        return 'Dolby Vision'

    return None


def _get_codec_name(codec_id: str, format_name: str) -> str:
    """Get friendly codec name"""
    codec_id = (codec_id or '').upper()
    format_name = (format_name or '').upper()

    # Video codecs
    if 'HEVC' in format_name or 'H265' in codec_id or 'X265' in codec_id or 'HEVC' in codec_id:
        return 'HEVC'
    elif 'AVC' in format_name or 'H264' in codec_id or 'X264' in codec_id or 'AVC' in codec_id:
        return 'AVC/H.264'
    elif 'VP9' in format_name or 'VP9' in codec_id:
        return 'VP9'
    elif 'AV1' in format_name or 'AV1' in codec_id:
        return 'AV1'
    elif 'MPEG-4' in format_name:
        return 'MPEG-4'

    # Audio codecs
    if 'AAC' in format_name:
        return 'AAC'
    elif 'AC-3' in format_name or 'AC3' in format_name:
        return 'AC3'
    elif 'E-AC-3' in format_name or 'EAC3' in format_name:
        return 'E-AC3'
    elif 'DTS' in format_name:
        if 'DTS-HD MA' in format_name or 'DTS-HD Master' in format_name:
            return 'DTS-HD MA'
        elif 'DTS-HD' in format_name:
            return 'DTS-HD'
        return 'DTS'
    elif 'TRUEHD' in format_name.upper() or 'TrueHD' in format_name:
        return 'TrueHD'
    elif 'FLAC' in format_name:
        return 'FLAC'
    elif 'OPUS' in format_name.upper():
        return 'Opus'
    elif 'MP3' in format_name or 'MPEG Audio' in format_name:
        return 'MP3'
    elif 'PCM' in format_name:
        return 'PCM'

    return format_name or codec_id or 'Unknown'


def analyze_file(file_path: str) -> MediaInfoResult:
    """
    Analyze a video file and extract technical metadata.

    Args:
        file_path: Path to the video file

    Returns:
        MediaInfoResult with all extracted metadata
    """
    result = MediaInfoResult()

    if not MEDIAINFO_AVAILABLE:
        result.success = False
        result.error = "pymediainfo not installed"
        return result

    path = Path(file_path)
    if not path.exists():
        result.success = False
        result.error = f"File not found: {file_path}"
        return result

    try:
        media_info = MediaInfo.parse(str(path))
    except Exception as e:
        result.success = False
        result.error = f"Failed to parse file: {str(e)}"
        logger.error(f"MediaInfo parse error for {file_path}: {e}")
        return result

    # Debug: log track types and key attributes for diagnosis
    try:
        track_summaries = []
        for t in media_info.tracks:
            summary = {
                'type': getattr(t, 'track_type', None),
                'format': getattr(t, 'format', None),
                'codec_id': getattr(t, 'codec_id', None),
                'width': getattr(t, 'width', None),
                'height': getattr(t, 'height', None),
                'frame_rate': getattr(t, 'frame_rate', None),
            }
            track_summaries.append(summary)
        logger.debug(f"MediaInfo tracks for {file_path}: {track_summaries}")
    except Exception as e:
        logger.debug(
            f"Failed to build MediaInfo track summary for {file_path}: {e}")

    try:
        result.file_size = path.stat().st_size

        # Process General track
        for track in media_info.tracks:
            if track.track_type == 'General':
                result.container = track.format
                if track.duration:
                    result.duration = int(
                        float(
                            track.duration) /
                        1000)  # ms to seconds
                if track.overall_bit_rate:
                    result.overall_bitrate = int(
                        track.overall_bit_rate / 1000)  # bps to kbps
                break

        # Process Video track (first one)
        video_tracks = [
            t for t in media_info.tracks if t.track_type == 'Video']
        if video_tracks:
            video = video_tracks[0]

            codec_id = getattr(video, 'codec_id', '') or ''
            format_name = getattr(video, 'format', '') or ''
            result.video_codec = _get_codec_name(codec_id, format_name)

            result.video_codec_profile = getattr(video, 'format_profile', None)
            result.video_width = getattr(video, 'width', None)
            result.video_height = getattr(video, 'height', None)

            if result.video_width and result.video_height:
                result.video_resolution = f"{
                    result.video_width}x{
                    result.video_height}"

            # Aspect ratio
            dar = getattr(video, 'display_aspect_ratio', None)
            if dar:
                result.video_aspect_ratio = str(dar)

            # Bitrate
            if video.bit_rate:
                result.video_bitrate = int(video.bit_rate / 1000)

            # Frame rate
            if video.frame_rate:
                result.video_framerate = str(video.frame_rate)

            # HDR detection
            result.video_hdr = _detect_hdr(video)

        # Process Audio tracks
        audio_tracks = [
            t for t in media_info.tracks if t.track_type == 'Audio']
        for idx, audio in enumerate(audio_tracks):
            channels = getattr(audio, 'channel_s', 2) or 2
            channel_layout = getattr(audio, 'channel_layout', None)

            codec_id = getattr(audio, 'codec_id', '') or ''
            format_name = getattr(audio, 'format', '') or ''

            track = AudioTrack(
                track_id=idx + 1,
                codec=_get_codec_name(codec_id, format_name),
                channels=_get_channel_layout(channels, channel_layout),
                bitrate=int(audio.bit_rate / 1000) if audio.bit_rate else None,
                language=getattr(audio, 'language', None),
                title=getattr(audio, 'title', None),
                default=getattr(audio, 'default', 'Yes') == 'Yes'
            )
            result.audio_tracks.append(track)

            # Set primary audio info from first track
            if idx == 0:
                result.audio_codec = track.codec
                result.audio_channels = track.channels
                result.audio_bitrate = track.bitrate
                result.audio_language = track.language

        # If no video _and_ no audio detected, consider this a failed analysis
        # - file may be corrupt or unsupported
        if not video_tracks and not audio_tracks:
            result.success = False
            result.error = "No audio or video tracks found - file may be corrupted or unsupported"
            # Include the track summary in the warning to help troubleshooting
            try:
                summaries = [{
                    'type': getattr(t, 'track_type', None),
                    'format': getattr(t, 'format', None),
                    'codec_id': getattr(t, 'codec_id', None),
                } for t in media_info.tracks]
                logger.warning(
                    f"MediaInfo found no audio/video tracks for {file_path}. Tracks: {summaries}")
            except Exception:
                logger.warning(
                    f"MediaInfo found no audio/video tracks for {file_path}.")
            return result

        # Process Subtitle/Text tracks
        text_tracks = [t for t in media_info.tracks if t.track_type == 'Text']
        for idx, text in enumerate(text_tracks):
            track = SubtitleTrack(
                track_id=idx + 1,
                codec=getattr(text, 'format', 'Unknown') or 'Unknown',
                language=getattr(text, 'language', None),
                title=getattr(text, 'title', None),
                forced=getattr(text, 'forced', 'No') == 'Yes',
                default=getattr(text, 'default', 'No') == 'Yes'
            )
            result.subtitle_tracks.append(track)

            if track.language:
                result.subtitle_languages.append(track.language)

        result.subtitle_count = len(result.subtitle_tracks)

    except Exception as e:
        result.success = False
        result.error = f"Error processing media info: {str(e)}"
        logger.error(f"MediaInfo processing error for {file_path}: {e}")

    return result


def get_audio_tracks_json(result: MediaInfoResult) -> str:
    """Convert audio tracks to JSON string for storage"""
    tracks = [asdict(t) for t in result.audio_tracks]
    return json.dumps(tracks)


def get_subtitle_languages_json(result: MediaInfoResult) -> str:
    """Convert subtitle languages to JSON string for storage"""
    return json.dumps(result.subtitle_languages)


def is_available() -> bool:
    """Check if MediaInfo library is available"""
    if not MEDIAINFO_AVAILABLE:
        return False

    try:
        # Try to parse something to ensure the native library is installed
        MediaInfo.can_parse()
        return True
    except Exception:
        return False
