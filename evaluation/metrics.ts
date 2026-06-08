/**
 * YICHA Evaluation Metrics
 * Pure functions — no side effects, no I/O.
 */

// ─── Classification ────────────────────────────────────────────────────────────

export function accuracy(predictions: string[], labels: string[]): number {
  if (predictions.length === 0) return 0
  const correct = predictions.filter((p, i) => p === labels[i]).length
  return correct / predictions.length
}

export function macroF1(predictions: string[], labels: string[]): number {
  const classes = [...new Set([...predictions, ...labels])]
  const f1s = classes.map(cls => {
    const tp = predictions.filter((p, i) => p === cls && labels[i] === cls).length
    const fp = predictions.filter((p, i) => p === cls && labels[i] !== cls).length
    const fn = predictions.filter((p, i) => p !== cls && labels[i] === cls).length
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
    return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  })
  return f1s.reduce((a, b) => a + b, 0) / f1s.length
}

export function perClassF1(
  predictions: string[],
  labels: string[],
): Record<string, { precision: number; recall: number; f1: number; support: number }> {
  const classes = [...new Set([...predictions, ...labels])]
  const result: Record<string, { precision: number; recall: number; f1: number; support: number }> = {}
  for (const cls of classes) {
    const tp = predictions.filter((p, i) => p === cls && labels[i] === cls).length
    const fp = predictions.filter((p, i) => p === cls && labels[i] !== cls).length
    const fn = predictions.filter((p, i) => p !== cls && labels[i] === cls).length
    const support = labels.filter(l => l === cls).length
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
    result[cls] = { precision: round(precision), recall: round(recall), f1: round(f1), support }
  }
  return result
}

// ─── Retrieval ─────────────────────────────────────────────────────────────────

/**
 * Precision@K: fraction of top-K retrieved docs that are relevant.
 * relevantIds: ground truth relevant review IDs
 * retrievedIds: ordered list of retrieved IDs (pre or post rerank)
 */
export function precisionAtK(retrievedIds: string[], relevantIds: string[], k: number): number {
  if (relevantIds.length === 0) return 0
  const topK = retrievedIds.slice(0, k)
  const hits = topK.filter(id => relevantIds.includes(id)).length
  return hits / k
}

/**
 * Recall@K: fraction of relevant docs found in top-K.
 */
export function recallAtK(retrievedIds: string[], relevantIds: string[], k: number): number {
  if (relevantIds.length === 0) return 0
  const topK = retrievedIds.slice(0, k)
  const hits = topK.filter(id => relevantIds.includes(id)).length
  return hits / relevantIds.length
}

/**
 * Mean Reciprocal Rank: 1/rank of first relevant result.
 */
export function mrr(retrievedIds: string[], relevantIds: string[]): number {
  if (relevantIds.length === 0) return 0
  for (let i = 0; i < retrievedIds.length; i++) {
    if (relevantIds.includes(retrievedIds[i])) {
      return 1 / (i + 1)
    }
  }
  return 0
}

/**
 * nDCG@K: normalized Discounted Cumulative Gain.
 */
export function ndcgAtK(retrievedIds: string[], relevantIds: string[], k: number): number {
  if (relevantIds.length === 0) return 0
  const topK = retrievedIds.slice(0, k)

  const dcg = topK.reduce((sum, id, i) => {
    const rel = relevantIds.includes(id) ? 1 : 0
    return sum + rel / Math.log2(i + 2)
  }, 0)

  const idealK = Math.min(k, relevantIds.length)
  const idcg = Array.from({ length: idealK }, (_, i) => 1 / Math.log2(i + 2)).reduce(
    (a, b) => a + b,
    0,
  )

  return idcg === 0 ? 0 : dcg / idcg
}

// ─── Rerank Comparison ─────────────────────────────────────────────────────────

export interface RerankComparison {
  before_p5: number
  after_p5: number
  before_mrr: number
  after_mrr: number
  p5_delta: number
  mrr_delta: number
}

export function rerankComparison(
  beforeIds: string[],
  afterIds: string[],
  relevantIds: string[],
): RerankComparison {
  const before_p5 = precisionAtK(beforeIds, relevantIds, 5)
  const after_p5 = precisionAtK(afterIds, relevantIds, 5)
  const before_mrr = mrr(beforeIds, relevantIds)
  const after_mrr = mrr(afterIds, relevantIds)
  return {
    before_p5: round(before_p5),
    after_p5: round(after_p5),
    before_mrr: round(before_mrr),
    after_mrr: round(after_mrr),
    p5_delta: round(after_p5 - before_p5),
    mrr_delta: round(after_mrr - before_mrr),
  }
}

// ─── Generation ────────────────────────────────────────────────────────────────

/**
 * ROUGE-L: longest common subsequence recall between hypothesis and reference.
 */
export function rougeL(hypothesis: string, reference: string): number {
  if (!hypothesis || !reference) return 0
  const hyp = hypothesis.toLowerCase().split(/\s+/)
  const ref = reference.toLowerCase().split(/\s+/)
  const lcs = lcsLength(hyp, ref)
  const precision = lcs / hyp.length
  const recall = lcs / ref.length
  if (precision + recall === 0) return 0
  return round((2 * precision * recall) / (precision + recall))
}

function lcsLength(a: string[], b: string[]): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  )
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp[a.length][b.length]
}

// ─── Evidence ─────────────────────────────────────────────────────────────────

/**
 * Evidence accuracy: fraction of cited evidence_reviews that are in relevant_review_ids.
 * If relevant_review_ids is empty, returns null (cannot evaluate).
 */
export function evidenceAccuracy(
  evidenceIds: string[],
  relevantIds: string[],
): number | null {
  if (relevantIds.length === 0) return null
  if (evidenceIds.length === 0) return 0
  const hits = evidenceIds.filter(id => {
    // Match on review_id prefix (ignore chunk suffix _0, _1)
    const baseId = id.replace(/_\d+$/, '')
    return relevantIds.some(rid => rid === id || rid === baseId || id.startsWith(rid))
  }).length
  return round(hits / evidenceIds.length)
}

// ─── Tool Calling ─────────────────────────────────────────────────────────────

export interface ToolCallRecord {
  tool: string
  success: boolean
  params_present: string[]
  required_params: string[]
  latency_ms?: number
}

export function toolCallSuccessRate(records: ToolCallRecord[]): number {
  if (records.length === 0) return 0
  return round(records.filter(r => r.success).length / records.length)
}

export function toolSelectionAccuracy(
  calledTools: string[],
  expectedTools: string[],
): number {
  if (expectedTools.length === 0) return 1
  const hits = calledTools.filter(t => expectedTools.includes(t)).length
  return round(hits / expectedTools.length)
}

export function parameterAccuracy(records: ToolCallRecord[]): number {
  if (records.length === 0) return 0
  const scores = records.map(r => {
    if (r.required_params.length === 0) return 1
    const present = r.required_params.filter(p => r.params_present.includes(p)).length
    return present / r.required_params.length
  })
  return round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

// ─── End-to-End ───────────────────────────────────────────────────────────────

export interface E2EResult {
  success: boolean
  has_answer: boolean
  has_evidence: boolean
  confidence: number
}

export function endToEndSuccessRate(results: E2EResult[]): number {
  if (results.length === 0) return 0
  const successes = results.filter(
    r => r.success && r.has_answer && r.has_evidence && r.confidence > 0,
  ).length
  return round(successes / results.length)
}

// ─── Aggregate helpers ────────────────────────────────────────────────────────

export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return round(values.reduce((a, b) => a + b, 0) / values.length)
}

export function round(n: number, decimals = 4): number {
  return Math.round(n * 10 ** decimals) / 10 ** decimals
}
