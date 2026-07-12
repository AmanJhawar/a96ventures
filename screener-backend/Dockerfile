FROM python:3.11-slim

WORKDIR /app

# System deps for pandas/numpy wheel compilation
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (layer cache)
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ ./backend/
COPY core/ ./core/

ENV PYTHONPATH="/app/backend:/app/core"

WORKDIR /app/backend

EXPOSE 8080

# Default entrypoint: FastAPI server (Cloud Run Service)
# Cloud Run Job overrides this with: python -m app.main_job
CMD ["uvicorn", "app.server:app", "--host", "0.0.0.0", "--port", "8080"]
