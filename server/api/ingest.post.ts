import { defineEventHandler, readBody } from 'h3'
import type { IngestRequest, IngestResponse } from '~/types/rag'
import { loadDataset } from '~/server/services/datasetLoader'
import { embedBatch } from '~/server/services/embedding'
import { ensureCollection, upsertPoints } from '~/server/services/retriever'
import { chunkText } from '~/server/utils/chunkText'

const VECTOR_SIZE = 1024 // BGE-M3 dimension
const UPSERT_BATCH_SIZE = 64

export default defineEventHandler(async (event): Promise<IngestResponse> => {
  const start = Date.now()
  const body = await readBody<IngestRequest>(event) ?? {}

  const subset = body.subset ?? process.env.HF_DATASET_SUBSET ?? 'en'
  const split = body.split ?? process.env.HF_DATASET_SPLIT ?? 'train'
  const maxRecords = body.max_records ?? Number(process.env.HF_MAX_RECORDS ?? 1000)

  await ensureCollection(VECTOR_SIZE)

  let ingested = 0
  let skipped = 0
  let errors = 0

  for await (const batch of loadDataset({ subset, split, maxRecords })) {
    // Collect all chunks from the batch
    const chunks = batch.flatMap(review => {
      if (!review.text?.trim()) { skipped++; return [] }
      return chunkText(review.text, {
        review_id: review.review_id,
        language: review.language,
        label: review.label,
        label_text: review.label_text,
        source: review.source,
        text: review.text,
      })
    })

    // Embed in sub-batches
    for (let i = 0; i < chunks.length; i += UPSERT_BATCH_SIZE) {
      const slice = chunks.slice(i, i + UPSERT_BATCH_SIZE)
      try {
        const texts = slice.map(c => c.text)
        const vectors = await embedBatch(texts)

        const points = slice.map((chunk, idx) => ({
          id: chunk.chunk_id,
          vector: vectors[idx],
          payload: chunk.metadata,
        }))

        await upsertPoints(points)
        ingested += slice.length
      }
      catch (err) {
        console.error('Ingest batch error:', err)
        errors += slice.length
      }
    }
  }

  return {
    success: errors === 0,
    ingested,
    skipped,
    errors,
    duration_ms: Date.now() - start,
  }
})
