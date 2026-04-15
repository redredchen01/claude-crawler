# Deployment Guide

This guide covers deploying Cover Selector in various environments.

## Table of Contents
1. [Local Development](#local-development)
2. [Production Server](#production-server)
3. [Docker Deployment](#docker-deployment)
4. [Cloud Platforms](#cloud-platforms)
5. [Troubleshooting](#troubleshooting)

---

## Local Development

### Prerequisites
- Python 3.9+
- FFmpeg (for video processing)
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/redredchen01/cover-selector-mvp.git
cd cover-selector-mvp

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install in development mode
pip install -e ".[dev]"

# Verify installation
cover-selector --help
```

### Running Tests

```bash
# All tests
pytest tests/ -v

# With coverage
pytest tests/ --cov=src/cover_selector --cov-report=html

# Specific test file
pytest tests/test_composer_analyzer.py -v
```

### Running Locally

#### CLI Mode
```bash
cover-selector /path/to/video.mp4 --output /path/to/output/
```

#### Web UI Mode
```bash
python app.py
# Open http://localhost:8002 in browser
```

---

## Production Server

### System Requirements
- **OS:** Linux (Ubuntu 20.04+), macOS, or Windows Server 2019+
- **Python:** 3.9, 3.10, 3.11, or 3.12
- **FFmpeg:** Latest stable version
- **RAM:** Minimum 2GB (4GB+ recommended for batch processing)
- **Disk:** Sufficient space for input videos and output images

### Installation

```bash
# Install FFmpeg
sudo apt-get install ffmpeg  # Ubuntu/Debian
brew install ffmpeg           # macOS

# Clone and install
git clone https://github.com/redredchen01/cover-selector-mvp.git
cd cover-selector-mvp
python -m venv venv
source venv/bin/activate
pip install -e "."  # Install without dev dependencies
```

### Configuration

Create a `.env` file for environment variables:

```bash
# Video processing
MAX_VIDEO_SIZE_MB=5000
TEMP_DIR=/tmp/cover-selector
OUTPUT_DIR=/var/lib/cover-selector/output

# Performance
FRAME_SAMPLES_PER_SCENE=30
SCENE_DETECTION_THRESHOLD=25.0
ENABLE_CACHE=true
CACHE_DIR=/var/cache/cover-selector

# Logging
LOG_LEVEL=INFO
LOG_DIR=/var/log/cover-selector
```

### Running as Service

#### Using Systemd (Linux)

Create `/etc/systemd/system/cover-selector.service`:

```ini
[Unit]
Description=Cover Selector Web Service
After=network.target

[Service]
Type=simple
User=coversel
WorkingDirectory=/opt/cover-selector
Environment="PATH=/opt/cover-selector/venv/bin"
ExecStart=/opt/cover-selector/venv/bin/python app.py
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable cover-selector
sudo systemctl start cover-selector
```

#### Using Supervisor

Create `/etc/supervisor/conf.d/cover-selector.conf`:

```ini
[program:cover-selector]
directory=/opt/cover-selector
command=/opt/cover-selector/venv/bin/python app.py
user=coversel
autostart=true
autorestart=true
stderr_logfile=/var/log/cover-selector/stderr.log
stdout_logfile=/var/log/cover-selector/stdout.log
```

Then:
```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start cover-selector
```

---

## Docker Deployment

### Dockerfile

Create `Dockerfile`:

```dockerfile
FROM python:3.11-slim

# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

COPY src src
COPY app.py .

# Create non-root user
RUN useradd -m -u 1000 coversel && chown -R coversel:coversel /app
USER coversel

EXPOSE 8002

CMD ["python", "app.py"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  cover-selector:
    build: .
    ports:
      - "8002:8002"
    volumes:
      - ./input:/app/input
      - ./output:/app/output
    environment:
      - LOG_LEVEL=INFO
      - ENABLE_CACHE=true
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8002/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Building and Running

```bash
# Build image
docker build -t cover-selector:latest .

# Run container
docker run -p 8002:8002 -v $(pwd)/input:/app/input -v $(pwd)/output:/app/output cover-selector:latest

# Using docker-compose
docker-compose up -d
```

---

## Cloud Platforms

### AWS Deployment

#### Using EC2
```bash
# Launch Ubuntu 20.04 instance
# Connect via SSH, then:
sudo apt-get update
sudo apt-get install -y python3.11 python3.11-venv ffmpeg git
git clone https://github.com/redredchen01/cover-selector-mvp.git
cd cover-selector-mvp
python3.11 -m venv venv
source venv/bin/activate
pip install -e .
```

#### Using Lambda (for batch processing)
See [AWS Lambda deployment guide](https://docs.aws.amazon.com/lambda/latest/dg/python-handler.html) - requires packaging dependencies separately.

### Google Cloud Platform

```bash
# Deploy to Cloud Run
gcloud run deploy cover-selector \
  --source . \
  --platform managed \
  --region us-central1 \
  --memory 2Gi \
  --cpu 2 \
  --allow-unauthenticated
```

### Azure

```bash
# Using App Service
az webapp up --name cover-selector --runtime python:3.11
```

---

## Monitoring & Maintenance

### Health Checks

```bash
# Health endpoint
curl http://localhost:8002/health

# Readiness check
curl http://localhost:8002/ready
```

### Logging

Monitor logs in real-time:
```bash
# Systemd
sudo journalctl -u cover-selector -f

# Docker
docker logs -f cover-selector

# File logs
tail -f /var/log/cover-selector/app.log
```

### Performance Monitoring

Key metrics to track:
- Frame processing time (target: <100ms per frame)
- Memory usage during video processing
- Disk I/O for frame caching
- Web UI response time (target: <500ms)

### Backups

Backup important data:
```bash
# Backup output directory
tar -czf cover-selector-backups-$(date +%Y%m%d).tar.gz /var/lib/cover-selector/output/

# Backup configuration
cp /etc/cover-selector/.env /backup/cover-selector-.env.backup
```

---

## Troubleshooting

### FFmpeg Not Found
```bash
# Verify FFmpeg installation
ffmpeg -version

# Install if missing
sudo apt-get install ffmpeg  # Ubuntu
brew install ffmpeg          # macOS
```

### Video Processing Fails
1. Check video codec: `ffprobe video.mp4`
2. Verify sufficient disk space
3. Check error logs for details
4. Try with a smaller video file

### High Memory Usage
- Reduce `FRAME_SAMPLES_PER_SCENE` in config
- Enable disk caching
- Process videos serially instead of parallel
- Monitor memory: `watch -n 1 free -h`

### Permission Denied Errors
```bash
# Check service user permissions
sudo chown -R coversel:coversel /var/lib/cover-selector
sudo chmod -R 755 /var/lib/cover-selector
```

### Port Already in Use
```bash
# Find and kill process using port 8002
lsof -i :8002
kill -9 <PID>

# Or use different port
export COVER_SELECTOR_PORT=8003
```

---

## Security Considerations

1. **Run as non-root user** — Never run as root in production
2. **Restrict file access** — Limit input/output directory permissions
3. **Use HTTPS** — Deploy behind a reverse proxy (nginx, Apache)
4. **Monitor logs** — Watch for unusual activity or errors
5. **Keep dependencies updated** — Regularly update Python packages and FFmpeg

---

## Support

- 📖 [Documentation](README.md)
- 🐛 [Report issues](https://github.com/redredchen01/cover-selector-mvp/issues)
- 💬 [Discussions](https://github.com/redredchen01/cover-selector-mvp/discussions)

---

**Last Updated:** 2026-04-13
