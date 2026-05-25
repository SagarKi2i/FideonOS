FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONPATH=/app

RUN groupadd --gid 1001 appuser \
    && useradd --uid 1001 --gid 1001 --create-home --shell /bin/bash appuser

WORKDIR /app

COPY requirements.txt .

# uvicorn[standard] is already pinned in requirements.txt; only gunicorn (the
# production process manager) needs to be added on top.
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir gunicorn \
    && rm -rf /root/.cache/pip

COPY . .

RUN mkdir -p logs && chown -R appuser:appuser /app

USER appuser

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/api/health')" || exit 1

EXPOSE 8080

# Entrypoint is main.py's `app` (FastAPI instance), matching `uvicorn main:app` used in dev.
CMD ["gunicorn", "main:app", "--bind", "0.0.0.0:8080", "--workers", "2", "--threads", "2", "--worker-class", "uvicorn.workers.UvicornWorker", "--access-logfile", "-", "--error-logfile", "-", "--log-level", "info"]

