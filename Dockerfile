# Build stage for frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --silent
COPY frontend/ ./
RUN npm run build

# Production stage
FROM python:3.11-slim

# Install FFmpeg, mediainfo and tini for runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    mediainfo \
    tini \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./

# Copy built frontend to static directory
COPY --from=frontend-builder /app/frontend/dist ./static

# Create directories
RUN mkdir -p /app/data /app/logs

# Create non-root user for security (entrypoint will drop privileges at runtime)
RUN useradd -m -u 1000 mediapruner && \
    chown -R mediapruner:mediapruner /app

# Copy entrypoint and make it executable
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Environment variables
ENV MB_DEBUG=false \
    MB_LOG_LEVEL=INFO \
    MB_DATA_DIR=/app/data \
    MB_LOG_DIR=/app/logs \
    MB_MIGRATE=false \
    PYTHONUNBUFFERED=1

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

# Use tini as entrypoint to handle signals and ensure proper PID 1 behavior
ENTRYPOINT ["tini", "--", "/usr/local/bin/entrypoint.sh"]

# Default command
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
