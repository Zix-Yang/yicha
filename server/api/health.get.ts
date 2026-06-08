import { defineEventHandler } from 'h3'
import { getCollectionInfo } from '~/server/services/retriever'

async function checkService(url: string, name: string) {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) })
    return { name, ok: res.ok, status: res.status }
  }
  catch {
    return { name, ok: false, status: 0 }
  }
}

export default defineEventHandler(async () => {
  const config = useRuntimeConfig()

  const [embeddingCheck, rerankerCheck] = await Promise.allSettled([
    checkService(config.embeddingServiceUrl ?? 'http://localhost:8001', 'embedding'),
    checkService(config.rerankerServiceUrl ?? 'http://localhost:8002', 'reranker'),
  ])

  let qdrantOk = false
  let vectorCount = 0
  try {
    const info = await getCollectionInfo()
    qdrantOk = info.status === 'green' || info.status === 'ok'
    vectorCount = info.vectors_count
  }
  catch { qdrantOk = false }

  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      qdrant: { ok: qdrantOk, vectors_count: vectorCount },
      embedding: embeddingCheck.status === 'fulfilled' ? embeddingCheck.value : { ok: false },
      reranker: rerankerCheck.status === 'fulfilled' ? rerankerCheck.value : { ok: false },
    },
  }
})
