import type { ReviewMetadata } from '~/types/review'
import type { RerankRequest, RerankResult } from '~/types/search'

/**
 * BGE Reranker Service
 * Calls a Python FastAPI service wrapping the BGE Reranker model.
 *
 * Expected FastAPI route:
 *   POST /rerank
 *   Body: { query: string, candidates: [{ id, text, metadata }], top_k: number }
 *   Response: { results: [{ id, score, text, metadata }] }
 */

function getRerankerUrl(): string {
  const config = useRuntimeConfig()
  return config.rerankerServiceUrl ?? 'http://localhost:8002'
}

export async function rerankReviews(request: RerankRequest): Promise<RerankResult[]> {
  const baseUrl = getRerankerUrl()

  const res = await fetch(`${baseUrl}/rerank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!res.ok) {
    throw new Error(`Reranker service error: ${res.status} ${await res.text()}`)
  }

  const data = await res.json() as { results: RerankResult[] }
  return data.results
}

/**
 * Convenience wrapper: rerank search results and return top-k.
 */
export async function rerankAndSlice(
  query: string,
  candidates: Array<{ id: string; text: string; metadata: ReviewMetadata }>,
  topK: number = 5,
): Promise<RerankResult[]> {
  if (candidates.length === 0) return []

  const results = await rerankReviews({ query, candidates, top_k: topK })
  return results.slice(0, topK)
}
