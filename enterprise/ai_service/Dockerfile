FROM python:3.12-slim
ARG INSTALL_ML=0
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
WORKDIR /srv/ai
COPY requirements.txt /srv/ai/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY requirements-ml.txt /srv/ai/requirements-ml.txt
RUN if [ "$INSTALL_ML" = "1" ]; then pip install --no-cache-dir -r requirements-ml.txt; fi
COPY main.py /srv/ai/main.py
RUN useradd --system --uid 10001 aiuser && chown -R aiuser:aiuser /srv/ai
USER aiuser
EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--no-access-log"]
