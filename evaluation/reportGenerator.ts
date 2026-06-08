import type { EvaluationReport } from './runEvaluation'

export function generateReport(report: EvaluationReport): string {
  const { summary, cases, meta } = report
  const lines: string[] = []
  const bar = '─'.repeat(60)
  const line = (s = '') => lines.push(s)

  line('╔' + '═'.repeat(58) + '╗')
  line('║' + '  YICHA RAG Evaluation Report'.padEnd(58) + '║')
  line('║' + `  ${meta.timestamp}`.padEnd(58) + '║')
  line('╚' + '═'.repeat(58) + '╝')
  line()

  line(bar)
  line('META')
  line(bar)
  line(`  Total questions       : ${meta.total_questions}`)
  line(`  Duration              : ${(meta.duration_ms / 1000).toFixed(2)}s`)
  line(`  RAG endpoint          : ${meta.endpoint}`)
  line()

  line(bar)
  line('CLASSIFICATION METRICS')
  line(bar)
  line(`  Question type accuracy : ${pct(summary.classification.question_type_accuracy)}`)
  line(`  Aspect accuracy        : ${pct(summary.classification.aspect_accuracy)}`)
  line(`  Macro F1 (question)    : ${pct(summary.classification.question_type_macro_f1)}`)
  line(`  Macro F1 (aspect)      : ${pct(summary.classification.aspect_macro_f1)}`)
  line()

  line(bar)
  line('RETRIEVAL METRICS  (only cases with relevant_review_ids)')
  line(bar)
  if (summary.retrieval.evaluated_cases === 0) {
    line('  No cases with relevant_review_ids — skipped.')
    line('  Tip: populate relevant_review_ids in testset.json to enable.')
  } else {
    line(`  Evaluated cases  : ${summary.retrieval.evaluated_cases}`)
    line(`  Precision@5      : ${pct(summary.retrieval.precision_at_5)}`)
    line(`  Recall@20        : ${pct(summary.retrieval.recall_at_20)}`)
    line(`  MRR              : ${fmt(summary.retrieval.mrr)}`)
    line(`  nDCG@5           : ${fmt(summary.retrieval.ndcg_at_5)}`)
  }
  line()

  line(bar)
  line('GENERATION METRICS — RAG vs LLM Direct')
  line(bar)
  line(`  Avg confidence (RAG)   : ${pct(summary.generation.avg_confidence)}`)
  line(`  Has answer rate        : ${pct(summary.generation.has_answer_rate)}`)
  line(`  Has evidence rate      : ${pct(summary.generation.has_evidence_rate)}`)
  if (summary.generation.avg_rouge_l !== null || summary.generation.avg_rouge_l_direct !== null) {
    line(`  ROUGE-L  RAG           : ${summary.generation.avg_rouge_l !== null ? fmt(summary.generation.avg_rouge_l) : 'n/a'}`)
    line(`  ROUGE-L  LLM Direct    : ${summary.generation.avg_rouge_l_direct !== null ? fmt(summary.generation.avg_rouge_l_direct) : 'n/a'}`)
  } else {
    line('  ROUGE-L                : skipped (no reference_answer in testset)')
  }
  line()

  line(bar)
  line('TOOL CALLING METRICS')
  line(bar)
  line(`  Tool call success rate  : ${pct(summary.tool_calling.success_rate)}`)
  line(`  Tool selection accuracy : ${pct(summary.tool_calling.selection_accuracy)}`)
  line(`  Parameter accuracy      : ${pct(summary.tool_calling.parameter_accuracy)}`)
  line()

  line(bar)
  line('END-TO-END')
  line(bar)
  line(`  RAG success rate       : ${pct(summary.end_to_end.success_rate)}`)
  line(`  RAG avg latency        : ${summary.end_to_end.avg_latency_ms.toFixed(0)}ms`)
  line(`  LLM Direct avg latency : ${summary.end_to_end.avg_llm_direct_latency_ms.toFixed(0)}ms`)
  line()

  line(bar)
  line('PER-CASE RESULTS')
  line(bar)

  for (const c of cases) {
    const status = c.error ? '✗' : c.e2e_success ? '✓' : '~'
    line()
    line(`  [${status}] ${c.id}  ${c.question.slice(0, 50)}${c.question.length > 50 ? '…' : ''}`)

    if (c.error) {
      line(`      RAG ERROR     : ${c.error.slice(0, 100)}`)
      if (c.llm_direct_answer) {
        line(`      LLM Direct    : ${c.llm_direct_answer.slice(0, 150)}${c.llm_direct_answer.length > 150 ? '…' : ''}`)
      }
      continue
    }

    line(`      Question type : expected=${c.expected_question_type}  got=${c.actual_question_type}  ${c.expected_question_type === c.actual_question_type ? '✓' : '✗'}`)
    line(`      Aspect        : expected=${c.expected_aspect}  got=${c.actual_aspect}  ${c.expected_aspect === c.actual_aspect ? '✓' : '✗'}`)
    line(`      Filter match  : ${c.filter_match ? '✓' : '✗'}`)
    line(`      Evidence      : ${c.evidence_count} reviews  |  Confidence: ${pct(c.confidence)}  |  Latency: ${c.latency_ms}ms`)

    if (c.rouge_l !== undefined || c.rouge_l_direct !== undefined) {
      line(`      ROUGE-L       : RAG=${c.rouge_l !== undefined ? fmt(c.rouge_l) : 'n/a'}  LLM Direct=${c.rouge_l_direct !== undefined ? fmt(c.rouge_l_direct) : 'n/a'}`)
    }

    if (c.rewritten_queries?.length) {
      line(`      Rewritten     : ${c.rewritten_queries[0].slice(0, 80)}`)
    }

    line()
    line(`      ┌─ RAG Answer (${c.latency_ms}ms) ${'─'.repeat(20)}`)
    if (c.actual_answer) {
      const lines2 = wrap(c.actual_answer, 70)
      for (const l of lines2) line(`      │  ${l}`)
    } else {
      line(`      │  (no answer)`)
    }
    if (c.actual_summary) {
      line(`      │  Summary: ${c.actual_summary.slice(0, 100)}`)
    }
    line(`      └${'─'.repeat(40)}`)

    line()
    line(`      ┌─ LLM Direct Answer (${c.llm_direct_latency_ms}ms) ${'─'.repeat(15)}`)
    if (c.llm_direct_answer) {
      const lines3 = wrap(c.llm_direct_answer, 70)
      for (const l of lines3) line(`      │  ${l}`)
    } else {
      line(`      │  (no answer)`)
    }
    line(`      └${'─'.repeat(40)}`)

    if (c.actual_evidence_reviews?.length) {
      line()
      line(`      Evidence reviews:`)
      for (const ev of c.actual_evidence_reviews.slice(0, 3)) {
        line(`        [${ev.language.toUpperCase()}][${ev.label_text}] ${ev.review_id}`)
        line(`          "${ev.quote.slice(0, 100)}${ev.quote.length > 100 ? '…' : ''}"`)
      }
    }
  }

  line()
  line(bar)
  line('END OF REPORT')
  line(bar)

  return lines.join('\n')
}

function wrap(text: string, width: number): string[] {
  const words = text.split(' ')
  const result: string[] = []
  let current = ''
  for (const word of words) {
    if ((current + ' ' + word).trim().length > width) {
      if (current) result.push(current)
      current = word
    } else {
      current = (current + ' ' + word).trim()
    }
  }
  if (current) result.push(current)
  return result.slice(0, 6) // max 6 lines per answer
}

function pct(n: number | null | undefined): string {
  if (n == null) return 'n/a'
  return (n * 100).toFixed(1) + '%'
}

function fmt(n: number | null | undefined): string {
  if (n == null) return 'n/a'
  return n.toFixed(4)
}
