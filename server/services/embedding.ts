/**
 * BGE-M3 Embedding Service
 * Calls a Python FastAPI service that wraps the BGE-M3 model.
 *
 * Expected FastAPI routes:
 *   POST /embed       { text: string }                  → { vector: number[] }
 *   POST /embed/batch { texts: string[] }               → { vectors: number[][] }
 */

function getEmbeddingServiceUrl(): string {
  const config = useRuntimeConfig()
  return config.embeddingServiceUrl ?? 'http://localhost:8001'
}

export async function embedText(text: string): Promise<number[]> {
  const baseUrl = getEmbeddingServiceUrl()
  const res = await fetch(`${baseUrl}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })

  if (!res.ok) {
    throw new Error(`Embedding service error: ${res.status} ${await res.text()}`)
  }

  const data = await res.json() as { vector: number[] }
  return data.vector
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const baseUrl = getEmbeddingServiceUrl()
  const res = await fetch(`${baseUrl}/embed/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts }),
  })

  if (!res.ok) {
    throw new Error(`Embedding batch service error: ${res.status} ${await res.text()}`)
  }

  const data = await res.json() as { vectors: number[][] }
  return data.vectors
}
