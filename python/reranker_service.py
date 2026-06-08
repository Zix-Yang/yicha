from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from FlagEmbedding import FlagReranker
import torch, logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="YICHA Reranker Service")

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
logger.info(f"Loading BGE Reranker on {DEVICE} ...")
reranker = FlagReranker("BAAI/bge-reranker-v2-m3", use_fp16=DEVICE=="cuda")
logger.info("Model loaded.")

class Candidate(BaseModel):
    id: str
    text: str
    metadata: dict

class RerankRequest(BaseModel):
    query: str
    candidates: list[Candidate]
    top_k: int = 5

@app.get("/health")
def health():
    return {"status": "ok", "device": DEVICE}

@app.post("/rerank")
def rerank(req: RerankRequest):
    if not req.candidates:
        return {"results": []}
    pairs = [[req.query, c.text] for c in req.candidates]
    scores = reranker.compute_score(pairs, normalize=True)
    if isinstance(scores, float):
        scores = [scores]
    scored = sorted(zip(req.candidates, scores), key=lambda x: x[1], reverse=True)
    return {"results": [{"id": c.id, "score": round(float(s), 6), "text": c.text, "metadata": c.metadata} for c, s in scored[:req.top_k]]}