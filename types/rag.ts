import type { SupportedLanguage } from './review'

export type QuestionType = 'sentiment_query' | 'product_review' | 'comparison' | 'general'
export type AspectType = 'quality' | 'price' | 'shipping' | 'service' | 'durability' | 'general'

export interface QueryRewriteResult {
  rewritten_queries: string[]
  detected_aspect: AspectType
  question_type: QuestionType
  language_filter?: SupportedLanguage
  sentiment_filter?: 'positive' | 'negative' | 'neutral'
  confidence: number
}

export interface EvidenceReview {
  review_id: string
  language: SupportedLanguage
  label_text: string
  quote: string
  score?: number
}

export interface RagResponse {
  answer: string
  summary: string
  evidence_reviews: EvidenceReview[]
  confidence: number
  query_rewrite?: QueryRewriteResult
  latency_ms?: number
}

export interface RagRequest {
  question: string
  language_filter?: SupportedLanguage
  sentiment_filter?: 'positive' | 'negative' | 'neutral'
  top_k?: number
}

export interface IngestRequest {
  subset?: string
  split?: string
  max_records?: number
  batch_size?: number
}

export interface IngestResponse {
  success: boolean
  ingested: number
  skipped: number
  errors: number
  duration_ms: number
}
