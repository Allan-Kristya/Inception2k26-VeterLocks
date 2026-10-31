from __future__ import annotations

import hmac
import json
import os
import re
import tempfile
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field

SERVICE_TOKEN = os.getenv("AI_SERVICE_TOKEN", "")
MODEL_PATH = os.getenv("INDOBERTWEET_MODEL_PATH", "/models/indobertweet")
WHISPER_PATH = os.getenv("WHISPER_MODEL_PATH", "/models/whisper-large-v3")
CONFIDENCE_THRESHOLD = float(os.getenv("AI_CONFIDENCE_THRESHOLD", "0.70"))
MAX_AUDIO_BYTES = int(os.getenv("MAX_AUDIO_BYTES", str(25 * 1024 * 1024)))
ALLOWED_OPD = {"pu", "hub", "dlh", "kes", "duk", "sos", "ins", "pen"}

runtime = None  # assigned before the application lifespan starts


@asynccontextmanager
async def lifespan(_app):
    runtime.load_text_model()
    runtime.load_whisper()
    yield


app = FastAPI(
    title="LaporAman AI Inference Service",
    version="1.0.0",
    description="Internal, opt-in NLP and ASR API. Plaintext is processed transiently and is not persisted.",
    lifespan=lifespan,
)
app.openapi_version = "3.1.0"


class TriageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    text: str = Field(min_length=10, max_length=20_000)
    language: str = Field(default="id", pattern="^id$")


class LabelResult(BaseModel):
    opd_id: str
    confidence: float = Field(ge=0.0, le=1.0)


class TriageResponse(BaseModel):
    labels: list[LabelResult]
    confidence_score: float = Field(ge=0.0, le=1.0)
    human_in_the_loop: bool
    location_entities: list[dict]
    model_version: str
    processing_mode: str = "ephemeral_opt_in"


class InferenceRuntime:
    def __init__(self):
        self.tokenizer = None
        self.model = None
        self.model_version = "not-loaded"
        self.whisper = None

    def load_text_model(self):
        if not Path(MODEL_PATH).is_dir():
            return
        try:
            from transformers import AutoModelForSequenceClassification, AutoTokenizer
            self.tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, local_files_only=True)
            self.model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH, local_files_only=True)
            self.model.eval()
            self.model_version = str(getattr(self.model.config, "_name_or_path", Path(MODEL_PATH).name))
        except ImportError:
            self.model_version = "ml-dependencies-not-installed"
        except Exception:
            self.model_version = "model-load-failed"

    def load_whisper(self):
        if not Path(WHISPER_PATH).exists():
            return
        try:
            from faster_whisper import WhisperModel
            device = os.getenv("WHISPER_DEVICE", "cpu")
            compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
            self.whisper = WhisperModel(WHISPER_PATH, device=device, compute_type=compute_type)
        except ImportError:
            self.whisper = None

    def classify(self, content: str) -> tuple[list[dict], float]:
        if self.model is None or self.tokenizer is None:
            raise HTTPException(status_code=503, detail="IndoBERTweet belum dimuat. Tempatkan model hasil training pada INDOBERTWEET_MODEL_PATH dan build image dengan INSTALL_ML=1.")
        import torch
        inputs = self.tokenizer(content, return_tensors="pt", truncation=True, max_length=512)
        with torch.inference_mode():
            logits = self.model(**inputs).logits[0]
        problem_type = getattr(self.model.config, "problem_type", None)
        scores = torch.sigmoid(logits) if problem_type == "multi_label_classification" else torch.softmax(logits, dim=-1)
        id2label = getattr(self.model.config, "id2label", {}) or {}
        label_map = json.loads(os.getenv("AI_LABEL_MAP_JSON", "{}"))
        candidates: list[dict] = []
        for i, score_tensor in enumerate(scores):
            raw_name = str(id2label.get(i, id2label.get(str(i), ""))).strip().lower()
            opd_id = str(label_map.get(str(i), raw_name)).strip().lower()
            if opd_id not in ALLOWED_OPD:
                continue
            candidates.append({"opd_id": opd_id, "confidence": float(score_tensor.item())})
        candidates.sort(key=lambda item: item["confidence"], reverse=True)
        if not candidates:
            raise HTTPException(status_code=503, detail="Label model tidak dipetakan ke OPD resmi. Atur AI_LABEL_MAP_JSON.")
        threshold = float(os.getenv("AI_LABEL_THRESHOLD", "0.35"))
        selected = [x for x in candidates if x["confidence"] >= threshold][:4]
        if not selected:
            selected = candidates[:1]
        return selected, candidates[0]["confidence"]


runtime = InferenceRuntime()


def require_service_token(
    x_service_token: Annotated[str | None, Header()] = None,
) -> None:
    if not SERVICE_TOKEN or not x_service_token or not hmac.compare_digest(x_service_token, SERVICE_TOKEN):
        raise HTTPException(status_code=401, detail="Internal service authentication required")


ServiceAuth = Annotated[None, Depends(require_service_token)]


# Regex extraction is intentionally conservative. It returns candidate strings, not verified addresses.
LOCATION_PATTERNS = [
    ("street", re.compile(r"\b(?:jalan|jl\.?|gang|gg\.?)\s+([\w./ -]{3,80})", re.IGNORECASE)),
    ("district", re.compile(r"\b(?:kecamatan|kec\.?)\s+([\w -]{2,60})", re.IGNORECASE)),
    ("village", re.compile(r"\b(?:kelurahan|kel\.?|desa)\s+([\w -]{2,60})", re.IGNORECASE)),
    ("city", re.compile(r"\b(?:kota|kabupaten|kab\.?)\s+([\w -]{2,60})", re.IGNORECASE)),
    ("postal_code", re.compile(r"\b([1-9][0-9]{4})\b")),
]


def extract_location_entities(content: str) -> list[dict]:
    found: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for entity_type, pattern in LOCATION_PATTERNS:
        for match in pattern.finditer(content):
            value = match.group(1).strip(" .,;:-") if match.lastindex else match.group(0)
            if not value:
                continue
            item = (entity_type, value.casefold())
            if item not in seen:
                found.append({"type": entity_type, "text": value, "start": match.start(), "end": match.end()})
                seen.add(item)
    return found[:20]


def triage_content(content: str) -> TriageResponse:
    labels, best_score = runtime.classify(content)
    return TriageResponse(
        labels=labels,
        confidence_score=max(0.0, min(1.0, best_score)),
        human_in_the_loop=best_score < CONFIDENCE_THRESHOLD,
        location_entities=extract_location_entities(content),
        model_version=runtime.model_version,
    )


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "laporaman-ai",
        "indobertweet_loaded": runtime.model is not None,
        "whisper_loaded": runtime.whisper is not None,
        "model_version": runtime.model_version,
    }


@app.post("/triage", response_model=TriageResponse, dependencies=[Depends(require_service_token)])
def triage(payload: TriageRequest):
    # Do not log request body or persist plaintext. This endpoint is only for an explicit
    # opt-in processing path; it is NOT compatible with a strict server-zero-knowledge claim.
    return triage_content(payload.text)


@app.post("/asr/transcribe-and-triage", dependencies=[Depends(require_service_token)])
async def transcribe_and_triage(audio: UploadFile = File(...)):
    if audio.content_type not in {
        "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp4", "audio/webm", "audio/flac", "audio/ogg"
    }:
        raise HTTPException(status_code=415, detail="Format audio tidak didukung")
    if runtime.whisper is None:
        raise HTTPException(status_code=503, detail="Whisper belum dimuat. Tempatkan model lokal dan build image dengan INSTALL_ML=1.")
    raw = await audio.read(MAX_AUDIO_BYTES + 1)
    if len(raw) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Ukuran audio melebihi batas 25 MB")
    suffix = Path(audio.filename or "audio.wav").suffix[:10] or ".wav"
    transcript = ""
    try:
        with tempfile.NamedTemporaryFile(prefix="laporaman-asr-", suffix=suffix, delete=True) as handle:
            handle.write(raw)
            handle.flush()
            segments, info = runtime.whisper.transcribe(handle.name, language="id", vad_filter=True)
            transcript = " ".join(segment.text.strip() for segment in segments).strip()
    finally:
        # raw buffer is only in process memory; temp file is unlinked on close.
        del raw
    if len(transcript) < 5:
        raise HTTPException(status_code=422, detail="Audio tidak menghasilkan transkripsi yang dapat diproses")
    return {
        "transcript": transcript,
        "language": "id",
        "duration_seconds": getattr(info, "duration", None),
        "triage": triage_content(transcript).model_dump(),
        "processing_mode": "ephemeral_opt_in",
    }
