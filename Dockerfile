# Build stage for Playwright
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV DEBIAN_FRONTEND noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libxml2-dev \
    libxslt-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir . redis

# Install Playwright and browsers
RUN pip install playwright && playwright install --with-deps chromium

# Copy application code
COPY . .

# Create data directory
RUN mkdir -p data

# Default command
CMD ["python", "api.py"]
