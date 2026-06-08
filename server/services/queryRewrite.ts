import type { QueryRewriteResult } from '~/types/rag'
import type { SupportedLanguage } from '~/types/review'
import { buildQueryRewritePrompt } from '~/server/prompts/queryRewritePrompt'

function getQwen3Config() {
  const config = useRuntimeConfig()
  return {
    apiUrl: config.qwen3ApiUrl ?? '',
    apiKey: config.qwen3ApiKey ?? '',
    model: config.qwen3Model ?? 'qwen3',
  }
}

async function callQwen3(prompt: string): Promise<string> {
  const { apiUrl, apiKey, model } = getQwen3Config()

  const res = await fetch(`${apiUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1024,
    }),
  })

  if (!res.ok) {
    throw new Error(`Qwen3 API error: ${res.status} ${await res.text()}`)
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>
  }
  return data.choices[0]?.message?.content ?? ''
}

function parseQueryRewriteResponse(raw: string): QueryRewriteResult {
  // 提取第一个完整 JSON 对象
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) {
    return {
      rewritten_queries: [raw.trim()],
      detected_aspect: 'general',
      question_type: 'general',
      confidence: 0.5,
    }
  }
  try {
    const parsed = JSON.parse(match[0])
    return {
      rewritten_queries: parsed.rewritten_queries ?? [],
      detected_aspect: parsed.detected_aspect ?? 'general',
      question_type: parsed.question_type ?? 'general',
      language_filter: parsed.language_filter === 'null' ? undefined : parsed.language_filter,
      sentiment_filter: parsed.sentiment_filter === 'null' ? undefined : parsed.sentiment_filter,
      confidence: parsed.confidence ?? 0.5,
    }
  } catch {
    return {
      rewritten_queries: [raw.trim()],
      detected_aspect: 'general',
      question_type: 'general',
      confidence: 0.5,
    }
  }
}

export async function rewriteQuery(
  question: string,
  langHint?: SupportedLanguage,
): Promise<QueryRewriteResult> {
  const prompt = buildQueryRewritePrompt(question, langHint)
  const raw = await callQwen3(prompt)
  return parseQueryRewriteResponse(raw)
}

// Re-export for use in other services
export { callQwen3 }
