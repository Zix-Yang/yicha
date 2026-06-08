import type { RagResponse, EvidenceReview } from '~/types/rag'
import type { RerankResult } from '~/types/search'
import { buildAnswerPrompt } from '~/server/prompts/answerPrompt'
import { callQwen3 } from '~/server/services/queryRewrite'
function parseAnswerResponse(raw: string): Omit<RagResponse, 'query_rewrite' | 'latency_ms'> {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) {
    return { answer: raw, summary: '', evidence_reviews: [], confidence: 0.5 }
  }
  try {
    const parsed = JSON.parse(match[0])
    return {
      answer: parsed.answer ?? raw,
      summary: parsed.summary ?? '',
      evidence_reviews: (parsed.evidence_reviews ?? []) as EvidenceReview[],
      confidence: parsed.confidence ?? 0.5,
    }
  } catch {
    return { answer: raw, summary: '', evidence_reviews: [], confidence: 0.5 }
  }
}

export async function generateAnswer(
  question: string,
  topReviews: RerankResult[],
): Promise<Omit<RagResponse, 'query_rewrite' | 'latency_ms'>> {
  if (topReviews.length === 0) {
    return {
      answer: 'No relevant reviews found to answer your question.',
      summary: 'No results found.',
      evidence_reviews: [],
      confidence: 0,
    }
  }

  const reviewsForPrompt = topReviews.map(r => ({
    review_id: r.id,
    text: r.text,
    metadata: r.metadata,
  }))

  const prompt = buildAnswerPrompt(question, reviewsForPrompt)
  const raw = await callQwen3(prompt)
  return parseAnswerResponse(raw)
}
