import { defineEventHandler, readBody, createError } from 'h3'
import type { RagRequest, RagResponse } from '~/types/rag'
import { rewriteQuery } from '~/server/services/queryRewrite'
import { embedText } from '~/server/services/embedding'
import { searchReviews } from '~/server/services/retriever'
import { rerankAndSlice } from '~/server/services/reranker'
import { generateAnswer } from '~/server/services/answerGenerator'

export default defineEventHandler(async (event): Promise<RagResponse> => {
  const start = Date.now()

  const body = await readBody<RagRequest>(event)
  if (!body?.question?.trim()) {
    throw createError({ statusCode: 400, message: 'question is required' })
  }

  const { question, language_filter, sentiment_filter, top_k = 5 } = body

  // Step 1: Query Rewrite
  const queryRewrite = await rewriteQuery(question)

  // Merge explicit filters with detected ones (explicit takes priority)
  const effectiveLanguageFilter = language_filter ?? queryRewrite.language_filter
  const effectiveSentimentFilter = sentiment_filter ?? queryRewrite.sentiment_filter

  const searchFilter = {
    ...(effectiveLanguageFilter ? { language: effectiveLanguageFilter } : {}),
    ...(effectiveSentimentFilter ? { label_text: effectiveSentimentFilter } : {}),
  }

  // Step 2: Embed the primary rewritten query
  const primaryQuery = queryRewrite.rewritten_queries[0] ?? question
  const queryVector = await embedText(primaryQuery)

  // Step 3: Vector Search — retrieve top 20
  const searchResults = await searchReviews(queryVector, 20, Object.keys(searchFilter).length > 0 ? searchFilter : undefined)

  // Step 4: Rerank — keep top k
  const rerankCandidates = searchResults.map(r => ({
    id: r.id,
    text: r.payload.text,
    metadata: r.payload,
  }))
  const topReviews = await rerankAndSlice(primaryQuery, rerankCandidates, top_k)

  // Step 5: Generate Answer
  const answer = await generateAnswer(question, topReviews)

  return {
    ...answer,
    query_rewrite: queryRewrite,
    latency_ms: Date.now() - start,
  }
})
