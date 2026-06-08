import type { ReviewChunk } from '~/types/review'
import type { ReviewMetadata } from '~/types/review'

const DEFAULT_CHUNK_SIZE = 512   // characters
const DEFAULT_CHUNK_OVERLAP = 64 // characters

/**
 * Split long review text into overlapping chunks.
 * Short reviews (< chunkSize) are returned as a single chunk.
 */
export function chunkText(
  text: string,
  metadata: ReviewMetadata,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_CHUNK_OVERLAP,
): ReviewChunk[] {
  if (text.length <= chunkSize) {
    return [
      {
        chunk_id: `${metadata.review_id}_0`,
        parent_id: metadata.review_id,
        chunk_index: 0,
        text,
        metadata,
      },
    ]
  }

  const chunks: ReviewChunk[] = []
  let start = 0
  let index = 0

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    const chunkText = text.slice(start, end)

    chunks.push({
      chunk_id: `${metadata.review_id}_${index}`,
      parent_id: metadata.review_id,
      chunk_index: index,
      text: chunkText,
      metadata,
    })

    if (end === text.length) break
    start = end - overlap
    index++
  }

  return chunks
}
