FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements.txt /app/requirements.txt
COPY backend/requirements-postgres.txt /app/requirements-postgres.txt
RUN pip install --no-cache-dir -r /app/requirements-postgres.txt
COPY backend/app /app/backend/app
COPY frontend /app/frontend
RUN addgroup --system laporaman && adduser --system --ingroup laporaman laporaman \
    && chown -R laporaman:laporaman /app
USER laporaman
ENV PYTHONPATH=/app/backend
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
