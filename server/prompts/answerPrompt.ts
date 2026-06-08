import type { ReviewMetadata } from '~/types/review'

interface ReviewForPrompt {
  review_id: string
  text: string
  metadata: ReviewMetadata
}

export function buildAnswerPrompt(question: string, reviews: ReviewForPrompt[]): string {
  const reviewsBlock = reviews.map((r, i) => {
    return `[Review ${i + 1}]
ID: ${r.review_id}
Language: ${r.metadata.language}
Sentiment: ${r.metadata.label_text}
Text: ${r.text}`
  }).join('\n\n')

  return `You are YICHA, a multilingual Amazon Reviews RAG assistant.

User question: "${question}"

You have retrieved the following Amazon reviews as evidence:

${reviewsBlock}

Instructions:
- Answer the user's question based ONLY on the provided reviews
- Do NOT invent information not present in the reviews
- Quote specific phrases from reviews to support your answer
- If reviews are in different languages, you may translate briefly for context
- Respond in the same language as the user's question
- Be concise but informative

Respond ONLY with a valid JSON object in this exact format (no markdown, no preamble):
{
  "answer": "Your detailed answer here",
  "summary": "One sentence summary",
  "evidence_reviews": [
    {
      "review_id": "id from above",
      "language": "en|es|zh|de|fr|ja",
      "label_text": "positive|negative|neutral",
      "quote": "exact short quote from the review text"
    }
  ],
  "confidence": 0.0
}`
}
