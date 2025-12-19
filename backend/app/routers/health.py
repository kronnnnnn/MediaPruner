from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    from app.services import mediainfo

    return {
        "status": "healthy",
        "mediainfo_available": mediainfo.is_available()
    }