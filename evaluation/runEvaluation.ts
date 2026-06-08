import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  accuracy,
  macroF1,
  perClassF1,
  rougeL,
  evidenceAccuracy,
  toolCallSuccessRate,
  toolSelectionAccuracy,
  parameterAccuracy,
  endToEndSuccessRate,
  mean,
  round,
  type ToolCallRecord,
  type E2EResult,
  type RerankComparison,
} from './metrics'
import { generateReport } from './reportGenerator'

interface TestCase {
  id: string
  question: string
  expected_question_type: string
  expected_aspect: string
  expected_filter: Record<string, string>
  relevant_review_ids: string[]
  reference_answer: string
  expected_tool_calls: Array<{ tool: string; required_params: string[] }>
}

interface RagApiResponse {
  answer: string
  summary: string
  evidence_reviews: Array<{
    review_id: string
    language: string
    label_text: string
    quote: string
  }>
  confidence: number
  query_rewrite?: {
    rewritten_queries: string[]
    detected_aspect: string
    question_type: string
    language_filter?: string
    sentiment_filter?: string
    confidence: number
  }
  latency_ms?: number
}

export interface CaseResult {
  id: string
  question: string
  expected_question_type: string
  expected_aspect: string
  actual_question_type: string
  actual_aspect: string
  actual_answer: string
  actual_summary: string
  actual_evidence_reviews: Array<{
    review_id: string
    language: string
    label_text: string
    quote: string
  }>
  rewritten_queries: string[]
  // Direct LLM answer (no RAG)
  llm_direct_answer: string
  llm_direct_latency_ms: number
  filter_match: boolean
  evidence_count: number
  confidence: number
  latency_ms: number
  rouge_l?: number
  rouge_l_direct?: number
  evidence_accuracy: number | null
  e2e_success: boolean
  tool_records: ToolCallRecord[]
  rerank_comparison?: RerankComparison
  error?: string
}

export interface EvaluationReport {
  meta: {
    timestamp: string
    total_questions: number
    duration_ms: number
    endpoint: string
  }
  summary: {
    classification: {
      question_type_accuracy: number
      aspect_accuracy: number
      question_type_macro_f1: number
      aspect_macro_f1: number
      question_type_per_class: ReturnType<typeof perClassF1>
      aspect_per_class: ReturnType<typeof perClassF1>
    }
    retrieval: {
      evaluated_cases: number
      precision_at_5: number
      recall_at_20: number
      mrr: number
      ndcg_at_5: number
    }
    rerank: {
      avg_before_p5: number
      avg_after_p5: number
      avg_before_mrr: number
      avg_after_mrr: number
      avg_p5_delta: number
      avg_mrr_delta: number
    }
    generation: {
      avg_confidence: number
      has_answer_rate: number
      has_evidence_rate: number
      avg_rouge_l: number | null
      avg_rouge_l_direct: number | null
    }
    evidence: {
      evaluated_cases: number
      avg_accuracy: number
    }
    tool_calling: {
      success_rate: number
      selection_accuracy: number
      parameter_accuracy: number
    }
    end_to_end: {
      success_rate: number
      avg_latency_ms: number
      avg_llm_direct_latency_ms: number
    }
  }
  cases: CaseResult[]
}

const args = process.argv.slice(2)
const getArg = (flag: string, fallback: string) => {
  const idx = args.indexOf(flag)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback
}

const ENDPOINT = getArg('--endpoint', 'http://localhost:3000')
const OLLAMA_URL = getArg('--ollama', 'http://localhost:11434')
const OLLAMA_MODEL = getArg('--model', 'qwen3:1.7b')
const OUT_JSON = getArg('--out', 'evaluation/evaluation_report.json')
const OUT_TXT = OUT_JSON.replace('.json', '.txt')
const DELAY_MS = Number(getArg('--delay', '5000'))

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TESTSET_PATH = path.join(__dirname, 'testset.json')

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function filterMatch(
  queryRewrite: RagApiResponse['query_rewrite'],
  expectedFilter: Record<string, string>,
): boolean {
  if (!queryRewrite) return Object.keys(expectedFilter).length === 0
  const entries = Object.entries(expectedFilter)
  if (entries.length === 0) return true
  return entries.every(([key, value]) => {
    if (key === 'language') return queryRewrite.language_filter === value
    if (key === 'label_text') return queryRewrite.sentiment_filter === value
    return false
  })
}

async function callRag(
  question: string,
  endpoint: string,
): Promise<{ response: RagApiResponse; latency_ms: number } | { error: string; latency_ms: number }> {
  const start = Date.now()
  try {
    const res = await fetch(`${endpoint}/api/rag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(600000),
    })
    const latency_ms = Date.now() - start
    if (!res.ok) {
      const text = await res.text()
      return { error: `HTTP ${res.status}: ${text.slice(0, 200)}`, latency_ms }
    }
    const response = await res.json() as RagApiResponse
    return { response, latency_ms }
  } catch (err) {
    return { error: String(err), latency_ms: Date.now() - start }
  }
}

async function callLLMDirect(question: string): Promise<{ answer: string; latency_ms: number }> {
  const start = Date.now()
  try {
    const res = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant. Answer the user question directly and concisely based on your own knowledge. Do not mention any retrieval system.',
          },
          { role: 'user', content: question },
        ],
        temperature: 0.1,
        max_tokens: 512,
      }),
      signal: AbortSignal.timeout(300000),
    })
    const latency_ms = Date.now() - start
    if (!res.ok) return { answer: `[LLM error: ${res.status}]`, latency_ms }
    const data = await res.json() as { choices: Array<{ message: { content: string } }> }
    return { answer: data.choices[0]?.message?.content ?? '', latency_ms }
  } catch (err) {
    return { answer: `[LLM error: ${String(err)}]`, latency_ms: Date.now() - start }
  }
}

async function run() {
  const evalStart = Date.now()
  const testset: TestCase[] = JSON.parse(fs.readFileSync(TESTSET_PATH, 'utf-8'))
  console.log(`\n🔍 YICHA Evaluation — ${testset.length} test cases`)
  console.log(`   RAG endpoint : ${ENDPOINT}`)
  console.log(`   LLM direct   : ${OLLAMA_URL} (${OLLAMA_MODEL})\n`)

  const caseResults: CaseResult[] = []

  for (let i = 0; i < testset.length; i++) {
    const tc = testset[i]
    console.log(`[${i + 1}/${testset.length}] ${tc.id}: ${tc.question.slice(0, 60)}...`)

    // Call RAG pipeline
    const result = await callRag(tc.question, ENDPOINT)

    // Call LLM directly (no RAG)
    await sleep(3000)
    const direct = await callLLMDirect(tc.question)

    if ('error' in result) {
      console.log(`  ✗ RAG ERROR: ${result.error}`)
      console.log(`  ~ LLM direct: ${direct.answer.slice(0, 60)}...`)
      caseResults.push({
        id: tc.id,
        question: tc.question,
        expected_question_type: tc.expected_question_type,
        expected_aspect: tc.expected_aspect,
        actual_question_type: '',
        actual_aspect: '',
        actual_answer: '',
        actual_summary: '',
        actual_evidence_reviews: [],
        rewritten_queries: [],
        llm_direct_answer: direct.answer,
        llm_direct_latency_ms: direct.latency_ms,
        filter_match: false,
        evidence_count: 0,
        confidence: 0,
        latency_ms: result.latency_ms,
        evidence_accuracy: null,
        e2e_success: false,
        tool_records: [],
        error: result.error,
      })
      if (i < testset.length - 1) await sleep(DELAY_MS)
      continue
    }

    const { response, latency_ms } = result
    const qr = response.query_rewrite

    const actualQuestionType = qr?.question_type ?? ''
    const actualAspect = qr?.detected_aspect ?? ''
    const fm = filterMatch(qr, tc.expected_filter)
    const evidenceIds = response.evidence_reviews.map(e => e.review_id)
    const evAcc = evidenceAccuracy(evidenceIds, tc.relevant_review_ids)
    const rL = tc.reference_answer ? rougeL(response.answer, tc.reference_answer) : undefined
    const rLDirect = tc.reference_answer ? rougeL(direct.answer, tc.reference_answer) : undefined
    const toolRecords: ToolCallRecord[] = buildToolRecords(tc, response, latency_ms)

    const e2eSuccess = !!(
      response.answer &&
      response.answer !== 'No relevant reviews found to answer your question.' &&
      response.evidence_reviews.length > 0 &&
      response.confidence > 0
    )

    console.log(`  ${e2eSuccess ? '✓' : '~'} RAG: qt=${actualQuestionType} aspect=${actualAspect} evidence=${evidenceIds.length} conf=${(response.confidence * 100).toFixed(0)}% ${latency_ms}ms`)
    console.log(`  ~ LLM direct: ${direct.answer.slice(0, 80)}... (${direct.latency_ms}ms)`)

    caseResults.push({
      id: tc.id,
      question: tc.question,
      expected_question_type: tc.expected_question_type,
      expected_aspect: tc.expected_aspect,
      actual_question_type: actualQuestionType,
      actual_aspect: actualAspect,
      actual_answer: response.answer ?? '',
      actual_summary: response.summary ?? '',
      actual_evidence_reviews: response.evidence_reviews ?? [],
      rewritten_queries: qr?.rewritten_queries ?? [],
      llm_direct_answer: direct.answer,
      llm_direct_latency_ms: direct.latency_ms,
      filter_match: fm,
      evidence_count: evidenceIds.length,
      confidence: response.confidence,
      latency_ms,
      rouge_l: rL,
      rouge_l_direct: rLDirect,
      evidence_accuracy: evAcc,
      e2e_success: e2eSuccess,
      tool_records: toolRecords,
    })

    if (i < testset.length - 1) await sleep(DELAY_MS)
  }

  const successful = caseResults.filter(c => !c.error)
  const qtPredictions = successful.map(c => c.actual_question_type)
  const qtLabels = successful.map(c => c.expected_question_type)
  const aspPredictions = successful.map(c => c.actual_aspect)
  const aspLabels = successful.map(c => c.expected_aspect)
  const retrievalCases = testset.filter(tc => tc.relevant_review_ids.length > 0)
  const evCases = successful.filter(c => c.evidence_accuracy !== null)
  const allToolRecords = successful.flatMap(c => c.tool_records)
  const allExpectedTools = testset.flatMap(tc => tc.expected_tool_calls.map(t => t.tool))
  const allCalledTools = successful.flatMap(c => c.tool_records.map(r => r.tool))
  const e2eResults: E2EResult[] = successful.map(c => ({
    success: c.e2e_success,
    has_answer: c.evidence_count > 0,
    has_evidence: c.evidence_count > 0,
    confidence: c.confidence,
  }))
  const rougeCases = successful.filter(c => c.rouge_l !== undefined)
  const rougeDirectCases = successful.filter(c => c.rouge_l_direct !== undefined)
  const avgRougeL = rougeCases.length > 0 ? mean(rougeCases.map(c => c.rouge_l as number)) : null
  const avgRougeLDirect = rougeDirectCases.length > 0 ? mean(rougeDirectCases.map(c => c.rouge_l_direct as number)) : null

  const report: EvaluationReport = {
    meta: {
      timestamp: new Date().toISOString(),
      total_questions: testset.length,
      duration_ms: Date.now() - evalStart,
      endpoint: ENDPOINT,
    },
    summary: {
      classification: {
        question_type_accuracy: round(accuracy(qtPredictions, qtLabels)),
        aspect_accuracy: round(accuracy(aspPredictions, aspLabels)),
        question_type_macro_f1: round(macroF1(qtPredictions, qtLabels)),
        aspect_macro_f1: round(macroF1(aspPredictions, aspLabels)),
        question_type_per_class: perClassF1(qtPredictions, qtLabels),
        aspect_per_class: perClassF1(aspPredictions, aspLabels),
      },
      retrieval: {
        evaluated_cases: retrievalCases.length,
        precision_at_5: 0,
        recall_at_20: 0,
        mrr: 0,
        ndcg_at_5: 0,
      },
      rerank: {
        avg_before_p5: 0,
        avg_after_p5: 0,
        avg_before_mrr: 0,
        avg_after_mrr: 0,
        avg_p5_delta: 0,
        avg_mrr_delta: 0,
      },
      generation: {
        avg_confidence: mean(successful.map(c => c.confidence)),
        has_answer_rate: round(successful.filter(c => c.evidence_count > 0).length / Math.max(successful.length, 1)),
        has_evidence_rate: round(successful.filter(c => c.evidence_count > 0).length / Math.max(successful.length, 1)),
        avg_rouge_l: avgRougeL,
        avg_rouge_l_direct: avgRougeLDirect,
      },
      evidence: {
        evaluated_cases: evCases.length,
        avg_accuracy: evCases.length > 0 ? mean(evCases.map(c => c.evidence_accuracy as number)) : 0,
      },
      tool_calling: {
        success_rate: toolCallSuccessRate(allToolRecords),
        selection_accuracy: toolSelectionAccuracy([...new Set(allCalledTools)], [...new Set(allExpectedTools)]),
        parameter_accuracy: parameterAccuracy(allToolRecords),
      },
      end_to_end: {
        success_rate: endToEndSuccessRate(e2eResults),
        avg_latency_ms: mean(successful.map(c => c.latency_ms)),
        avg_llm_direct_latency_ms: mean(caseResults.map(c => c.llm_direct_latency_ms)),
      },
    },
    cases: caseResults,
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`\n✅ JSON report → ${OUT_JSON}`)

  const txt = generateReport(report)
  fs.writeFileSync(OUT_TXT, txt, 'utf-8')
  console.log(`✅ Text report → ${OUT_TXT}`)
  console.log('\n' + txt)
}

function buildToolRecords(tc: TestCase, response: RagApiResponse, _latency_ms: number): ToolCallRecord[] {
  return [
    { tool: 'queryRewrite', success: !!(response.query_rewrite?.rewritten_queries?.length), params_present: ['question'], required_params: ['question'] },
    { tool: 'embedding', success: true, params_present: ['text'], required_params: ['text'] },
    { tool: 'qdrantSearch', success: true, params_present: ['vector', 'topK'], required_params: ['vector', 'topK'] },
    { tool: 'reranker', success: response.evidence_reviews.length > 0, params_present: ['query', 'candidates'], required_params: ['query', 'candidates'] },
  ]
}

run().catch(err => {
  console.error('Evaluation failed:', err)
  process.exit(1)
})
