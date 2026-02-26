# MUNSCCUL Core Banking System - Backend Dockerfile
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    libpq-dev \
    ca-certificates \
    curl \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-fra \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Set work directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download local SpaCy models (so they are baked into the image)
RUN pip install --no-cache-dir https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.7.1/en_core_web_sm-3.7.1.tar.gz

# Copy application code
COPY app/ ./app/

# Create directories for uploads, reports and static files
RUN mkdir -p /app/uploads/kyc /app/reports /app/app/static

# Download Swagger UI assets using curl (secure & reliable)
RUN curl -L -o /app/app/static/swagger-ui-bundle.js https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js && \
    curl -L -o /app/app/static/swagger-ui.css https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css && \
    curl -L -o /app/app/static/swagger-ui-standalone-preset.js https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js && \
    curl -L -o /app/app/static/redoc.standalone.js https://cdn.jsdelivr.net/npm/redoc@2.1.3/bundles/redoc.standalone.js

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]