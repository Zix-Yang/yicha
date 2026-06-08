import type { ReviewMetadata } from '~/types/review'
import type { SearchFilter, SearchResult } from '~/types/search'

function stringToUUID(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  const h = Math.abs(hash).toString(16).padStart(12, '0')
  return `${h.slice(0,8)}-${h.slice(0,4)}-4${h.slice(1,4)}-a${h.slice(1,4)}-${h.slice(0,12)}`
}

interface QdrantPoint {
  id: string
  vector: number[]
  payload: ReviewMetadata
}

interface QdrantSearchHit {
  id: string
  score: number
  payload: ReviewMetadata & { original_id?: string }
}

function getQdrantConfig() {
  const config = useRuntimeConfig()
  return {
    url: config.qdrantUrl ?? 'http://localhost:6333',
    apiKey: config.qdrantApiKey ?? '',
    collection: config.qdrantCollection ?? 'amazon_reviews',
  }
}

function qdrantHeaders(apiKey: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) h['api-key'] = apiKey
  return h
}

export async function ensureCollection(vectorSize: number = 1024): Promise<void> {
  const { url, apiKey, collection } = getQdrantConfig()
  const headers = qdrantHeaders(apiKey)

  const checkRes = await fetch(`${url}/collections/${collection}`, { headers })
  if (checkRes.ok) return

  const createRes = await fetch(`${url}/collections/${collection}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      vectors: { size: vectorSize, distance: 'Cosine' },
    }),
  })

  if (!createRes.ok) {
    throw new Error(`Failed to create Qdrant collection: ${await createRes.text()}`)
  }
}

export async function upsertPoints(points: QdrantPoint[]): Promise<void> {
  const { url, apiKey, collection } = getQdrantConfig()
  const headers = qdrantHeaders(apiKey)

  const res = await fetch(`${url}/collections/${collection}/points`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      points: points.map(p => ({
        id: stringToUUID(p.id),
        vector: p.vector,
        payload: { ...p.payload, original_id: p.id },
      })),
    }),
  })

  if (!res.ok) {
    throw new Error(`Qdrant upsert error: ${await res.text()}`)
  }
}

export async function searchReviews(
  queryVector: number[],
  topK: number = 20,
  filter?: SearchFilter,
): Promise<SearchResult[]> {
  const { url, apiKey, collection } = getQdrantConfig()
  const headers = qdrantHeaders(apiKey)

  const qdrantFilter = buildQdrantFilter(filter)

  const body: Record<string, unknown> = {
    vector: queryVector,
    limit: topK,
    with_payload: true,
    params: {
      exact: true,
    },
  }
  if (qdrantFilter) body.filter = qdrantFilter

  const res = await fetch(`${url}/collections/${collection}/points/search`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`Qdrant search error: ${await res.text()}`)
  }

  const data = await res.json() as { result: QdrantSearchHit[] }
  return data.result.map(hit => ({
    id: hit.payload.original_id ?? String(hit.id),
    score: hit.score,
    payload: hit.payload,
  }))
}

function buildQdrantFilter(filter?: SearchFilter): Record<string, unknown> | null {
  if (!filter) return null

  const must: Array<Record<string, unknown>> = []

  if (filter.language) {
    must.push({ key: 'language', match: { value: filter.language } })
  }

  if (filter.label_text) {
    must.push({ key: 'label_text', match: { value: filter.label_text } })
  }

  if (must.length === 0) return null
  return { must }
}

export async function getCollectionInfo(): Promise<{ vectors_count: number; status: string }> {
  const { url, apiKey, collection } = getQdrantConfig()
  const res = await fetch(`${url}/collections/${collection}`, {
    headers: qdrantHeaders(apiKey),
  })

  if (!res.ok) throw new Error('Qdrant collection not found')
  const data = await res.json() as { result: { vectors_count: number; status: string } }
  return data.result
}
