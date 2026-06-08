from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from FlagEmbedding import BGEM3FlagModel
import torch, logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="YICHA Embedding Service")

DEVICE = "cpu"
logger.info(f"Loading BGE-M3 on {DEVICE} ...")
model = BGEM3FlagModel("BAAI/bge-m3", use_fp16=DEVICE=="cuda")
logger.info("Model loaded.")

class EmbedRequest(BaseModel):
    text: str

class EmbedBatchRequest(BaseModel):
    texts: list[str]

@app.get("/health")
def health():
    return {"status": "ok", "device": DEVICE}

@app.post("/embed")
def embed(req: EmbedRequest):
    out = model.encode([req.text], batch_size=1, max_length=512, return_dense=True, return_sparse=False, return_colbert_vecs=False)
    return {"vector": out["dense_vecs"][0].tolist()}

@app.post("/embed/batch")
def embed_batch(req: EmbedBatchRequest):
    if not req.texts:
        return {"vectors": []}
    out = model.encode(req.texts, batch_size=32, max_length=512, return_dense=True, return_sparse=False, return_colbert_vecs=False)
    return {"vectors": out["dense_vecs"].tolist()}