import type { ReviewDocument } from '~/types/review'
import { resolveLanguage } from '~/server/utils/langDetect'

interface HFDatasetRow {
  id: string
  text: string
  label: number
  label_text: string
}

interface LoadDatasetOptions {
  subset?: string
  split?: string
  maxRecords?: number
}

const LABEL_MAP: Record<number, string> = {
  0: 'negative',
  1: 'negative',
  2: 'neutral',
  3: 'positive',
  4: 'positive',
}

/**
 * Normalize label_text to positive / negative / neutral.
 * The dataset uses 1–5 star labels; we map to 3 sentiment classes.
 */
function normalizeLabelText(label: number, rawLabelText: string): string {
  return LABEL_MAP[label] ?? rawLabelText ?? 'neutral'
}

/**
 * Fetch rows from HuggingFace datasets-server API.
 * Docs: https://huggingface.co/docs/datasets-server/quick_start
 */
async function fetchHFRows(
  dataset: string,
  config: string,
  split: string,
  offset: number,
  length: number,
): Promise<{ rows: Array<{ row: HFDatasetRow }>; total: number }> {
  const url = new URL('https://datasets-server.huggingface.co/rows')
  url.searchParams.set('dataset', dataset)
  url.searchParams.set('config', config)
  url.searchParams.set('split', split)
  url.searchParams.set('offset', String(offset))
  url.searchParams.set('length', String(length))

  const config_ = useRuntimeConfig()
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  }
  if (config_.hfToken) {
    headers['Authorization'] = `Bearer ${config_.hfToken}`
  }

  const res = await fetch(url.toString(), { headers })
  if (!res.ok) {
    throw new Error(`HuggingFace API error: ${res.status} ${await res.text()}`)
  }
  const data = await res.json() as { rows: Array<{ row: HFDatasetRow }>; num_rows_total: number }
  return { rows: data.rows, total: data.num_rows_total }
}

/**
 * Load reviews from mteb/amazon_reviews_multi.
 * Yields batches of ReviewDocument for streaming ingestion.
 */
export async function* loadDataset(
  options: LoadDatasetOptions = {},
): AsyncGenerator<ReviewDocument[]> {
  const subset = options.subset ?? process.env.HF_DATASET_SUBSET ?? 'en'
  const split = options.split ?? process.env.HF_DATASET_SPLIT ?? 'train'
  const maxRecords = options.maxRecords ?? Number(process.env.HF_MAX_RECORDS ?? 10000)
  const pageSize = 100

  let offset = 0
  let total = Infinity
  let fetched = 0

  while (fetched < maxRecords && offset < total) {
    const length = Math.min(pageSize, maxRecords - fetched)
    const { rows, total: t } = await fetchHFRows(
      'mteb/amazon_reviews_multi',
      subset,
      split,
      offset,
      length,
    )
    total = t

    const batch: ReviewDocument[] = rows.map(({ row }) => ({
      review_id: row.id,
      text: row.text,
      label: row.label,
      label_text: normalizeLabelText(row.label, row.label_text),
      language: resolveLanguage(row.id, subset),
      source: 'mteb/amazon_reviews_multi',
    }))

    yield batch
    fetched += batch.length
    offset += batch.length

    if (batch.length === 0) break
  }
}
