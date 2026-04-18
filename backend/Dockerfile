FROM python:3.12-slim

# Create non-root user
RUN addgroup --system atlas && adduser --system --ingroup atlas atlas

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Ensure data directory exists and is writable by the unprivileged user
RUN mkdir -p /data && chown -R atlas:atlas /data

USER atlas

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/').raise_for_status()" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
