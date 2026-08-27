# Use an official lightweight Python image
FROM python:3.11-slim

# Set working directory inside the container
WORKDIR /app

# Copy the dependencies file first to leverage Docker cache
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Run tests during build to catch issues early
RUN python -m unittest discover -s tests -v

# Expose port 8000 for FastAPI
EXPOSE 8000

# Set environment variable to ensure logs are output straight to terminal
ENV PYTHONUNBUFFERED=1

# Ensure Uvicorn's watchfiles reloader uses polling instead of inotify (critical for Windows volume mounts)
ENV WATCHFILES_FORCE_POLLING=true

# Set PYTHONPATH to ensure backend module is always findable during reloads
ENV PYTHONPATH=/app

# Healthcheck for container orchestration (Podman/Docker/K8s)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/rules', timeout=3)" || exit 1

# Command to run the application using python -m uvicorn with hot-reload enabled
# Only reload on backend changes to avoid scanning unnecessary files (like node_modules, .git)
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "backend"]
