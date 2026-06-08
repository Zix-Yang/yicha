export type SupportedLanguage = 'en' | 'es' | 'zh' | 'de' | 'fr' | 'ja'

export interface ReviewDocument {
  review_id: string
  text: string
  label: number
  label_text: string
  language: SupportedLanguage
  source: 'mteb/amazon_reviews_multi'
}

export interface ReviewMetadata {
  review_id: string
  language: SupportedLanguage
  label: number
  label_text: string
  source: 'mteb/amazon_reviews_multi'
  text: string
}

export interface ReviewChunk {
  chunk_id: string
  parent_id: string
  chunk_index: number
  text: string
  metadata: ReviewMetadata
}
