import type { SupportedLanguage } from './review'
import type { ReviewMetadata } from './review'

export interface SearchFilter {
  language?: SupportedLanguage
  label_text?: 'positive' | 'negative' | 'neutral'
}

export interface SearchRequest {
  query_vector: number[]
  filter?: SearchFilter
  top_k: number
  collection: string
}

export interface SearchResult {
  id: string
  score: number
  payload: ReviewMetadata
}

export interface RerankRequest {
  query: string
  candidates: Array<{
    id: string
    text: string
    metadata: ReviewMetadata
  }>
  top_k: number
}

export interface RerankResult {
  id: string
  score: number
  text: string
  metadata: ReviewMetadata
}
