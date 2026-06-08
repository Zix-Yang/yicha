<script setup lang="ts">
import { ref, computed } from 'vue'
import type { SupportedLanguage } from '~/types/review'

const { loading, error, result, ask, reset } = useRag()

const question = ref('')
const langFilter = ref<SupportedLanguage | ''>('')
const sentimentFilter = ref<'positive' | 'negative' | 'neutral' | ''>('')
const showFilters = ref(false)
const submitted = ref(false)

const LANG_LABELS: Record<string, string> = {
  en: 'EN', es: 'ES', zh: 'ZH', de: 'DE', fr: 'FR', ja: 'JA',
}

const SENTIMENT_COLOR: Record<string, string> = {
  positive: 'var(--positive)',
  negative: 'var(--negative)',
  neutral: 'var(--neutral)',
}

const confidencePct = computed(() =>
  result.value ? Math.round(result.value.confidence * 100) : 0,
)

const latency = computed(() =>
  result.value?.latency_ms ? `${(result.value.latency_ms / 1000).toFixed(2)}s` : '',
)

async function submit() {
  if (!question.value.trim() || loading.value) return
  submitted.value = true
  await ask({
    question: question.value,
    language_filter: langFilter.value || undefined,
    sentiment_filter: (sentimentFilter.value as 'positive' | 'negative' | 'neutral') || undefined,
  })
}

function handleKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
}

function clear() {
  question.value = ''
  submitted.value = false
  reset()
}
</script>

<template>
  <div class="shell">
    <!-- Header -->
    <header class="header">
      <span class="logo mono">YICHA</span>
      <span class="tagline dim">multilingual review intelligence</span>
    </header>

    <!-- Main input area -->
    <main class="main" :class="{ 'has-result': submitted }">
      <!-- Hero (before any search) -->
      <div v-if="!submitted" class="hero">
        <div class="hero-label mono dim">/ ask anything about products</div>
        <div class="examples">
          <button
            v-for="ex in EXAMPLES"
            :key="ex"
            class="example-chip"
            @click="question = ex"
          >{{ ex }}</button>
        </div>
      </div>

      <!-- Input box -->
      <div class="input-wrap">
        <textarea
          v-model="question"
          class="input mono"
          :placeholder="submitted ? 'Ask another question...' : 'What do users say about battery life?'"
          rows="3"
          @keydown="handleKey"
        />
        <div class="input-footer">
          <div class="filter-row">
            <button class="filter-toggle dim mono" @click="showFilters = !showFilters">
              {{ showFilters ? '↑ hide filters' : '↓ filters' }}
            </button>
            <Transition name="fade">
              <div v-if="showFilters" class="filters">
                <select v-model="langFilter" class="select mono">
                  <option value="">all languages</option>
                  <option v-for="(label, code) in LANG_LABELS" :key="code" :value="code">{{ label }}</option>
                </select>
                <select v-model="sentimentFilter" class="select mono">
                  <option value="">all sentiment</option>
                  <option value="positive">positive</option>
                  <option value="negative">negative</option>
                  <option value="neutral">neutral</option>
                </select>
              </div>
            </Transition>
          </div>

          <div class="input-actions">
            <span class="hint dim mono">⌘↵ to send</span>
            <button v-if="submitted" class="btn-ghost mono" @click="clear">clear</button>
            <button
              class="btn-send mono"
              :disabled="!question.trim() || loading"
              @click="submit"
            >
              <span v-if="!loading">search</span>
              <span v-else class="loading-dots">searching</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Error state -->
      <div v-if="error" class="error-box mono">
        <span class="error-icon">!</span> {{ error }}
      </div>

      <!-- Loading skeleton -->
      <div v-if="loading" class="skeleton-wrap">
        <div class="skeleton-line" style="width:80%" />
        <div class="skeleton-line" style="width:60%" />
        <div class="skeleton-line" style="width:72%" />
        <div class="skeleton-label mono dim">retrieving reviews · reranking · generating</div>
      </div>

      <!-- Result -->
      <Transition name="slide-up">
        <div v-if="result && !loading" class="result">

          <!-- Answer -->
          <section class="answer-section">
            <div class="section-label mono dim">answer</div>
            <p class="answer-text">{{ result.answer }}</p>
            <p class="summary-text dim">{{ result.summary }}</p>
          </section>

          <!-- Meta bar -->
          <div class="meta-bar mono dim">
            <span>confidence <strong class="accent">{{ confidencePct }}%</strong></span>
            <span class="sep">·</span>
            <span>{{ result.evidence_reviews.length }} sources</span>
            <span v-if="latency" class="sep">·</span>
            <span v-if="latency">{{ latency }}</span>
            <span v-if="result.query_rewrite" class="sep">·</span>
            <span v-if="result.query_rewrite">{{ result.query_rewrite.detected_aspect }}</span>
          </div>

          <!-- Evidence reviews -->
          <section class="evidence-section">
            <div class="section-label mono dim">evidence reviews</div>
            <div class="evidence-list">
              <div
                v-for="(ev, i) in result.evidence_reviews"
                :key="ev.review_id"
                class="evidence-card"
              >
                <div class="evidence-header">
                  <span class="ev-index mono dim">{{ String(i + 1).padStart(2, '0') }}</span>
                  <span class="ev-lang mono">{{ ev.language.toUpperCase() }}</span>
                  <span
                    class="ev-sentiment mono"
                    :style="{ color: SENTIMENT_COLOR[ev.label_text] ?? 'var(--text-dim)' }"
                  >{{ ev.label_text }}</span>
                  <span class="ev-id mono dim">{{ ev.review_id }}</span>
                </div>
                <blockquote class="ev-quote">"{{ ev.quote }}"</blockquote>
              </div>
            </div>
          </section>

          <!-- Query rewrite debug (collapsed) -->
          <details v-if="result.query_rewrite" class="debug-details mono dim">
            <summary>query rewrite debug</summary>
            <div class="debug-body">
              <div v-for="q in result.query_rewrite.rewritten_queries" :key="q" class="debug-query">→ {{ q }}</div>
              <div class="debug-meta">
                type: {{ result.query_rewrite.question_type }}
                · aspect: {{ result.query_rewrite.detected_aspect }}
                <template v-if="result.query_rewrite.language_filter">
                  · lang: {{ result.query_rewrite.language_filter }}
                </template>
                <template v-if="result.query_rewrite.sentiment_filter">
                  · sentiment: {{ result.query_rewrite.sentiment_filter }}
                </template>
              </div>
            </div>
          </details>

        </div>
      </Transition>
    </main>

    <!-- Footer -->
    <footer class="footer mono dim">
      <span>BGE-M3 · BGE Reranker · Qwen3 · Qdrant</span>
      <span class="sep">·</span>
      <span>mteb/amazon_reviews_multi</span>
    </footer>
  </div>
</template>

<script lang="ts">
const EXAMPLES = [
  'What do users say about battery life?',
  '这款产品的质量如何？',
  '¿Qué opinan los usuarios sobre el envío?',
  'Are there complaints about durability?',
]
</script>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  max-width: 720px;
  margin: 0 auto;
  padding: 0 24px;
}

/* ── Header ── */
.header {
  display: flex;
  align-items: baseline;
  gap: 16px;
  padding: 36px 0 24px;
  border-bottom: 1px solid var(--border);
}

.logo {
  font-size: 18px;
  font-weight: 500;
  letter-spacing: 0.12em;
  color: var(--accent);
}

.tagline {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: lowercase;
}

/* ── Main ── */
.main {
  flex: 1;
  padding: 40px 0 32px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

/* ── Hero ── */
.hero {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.hero-label {
  font-size: 11px;
  letter-spacing: 0.06em;
}

.examples {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.example-chip {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-dim);
  background: transparent;
  border: 1px solid var(--border);
  padding: 6px 12px;
  border-radius: var(--radius);
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1.4;
  text-align: left;
}

.example-chip:hover {
  border-color: var(--border-hover);
  color: var(--text);
}

/* ── Input ── */
.input-wrap {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  transition: border-color 0.15s;
}

.input-wrap:focus-within {
  border-color: var(--accent-border);
}

.input {
  background: transparent;
  border: none;
  outline: none;
  color: var(--text);
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.7;
  padding: 16px;
  resize: none;
  width: 100%;
}

.input::placeholder {
  color: var(--text-muted);
}

.input-footer {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 8px 12px 10px;
  border-top: 1px solid var(--border);
  gap: 12px;
  flex-wrap: wrap;
}

.filter-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-toggle {
  font-family: var(--mono);
  font-size: 11px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  padding: 0;
  transition: color 0.15s;
}

.filter-toggle:hover { color: var(--text-dim); }

.filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.select {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-dim);
  font-family: var(--mono);
  font-size: 11px;
  padding: 4px 8px;
  border-radius: var(--radius);
  outline: none;
  cursor: pointer;
}

.select:focus { border-color: var(--accent-border); }

.input-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.hint {
  font-size: 10px;
  letter-spacing: 0.04em;
}

.btn-ghost {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  transition: color 0.15s;
}

.btn-ghost:hover { color: var(--text); }

.btn-send {
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: #000;
  background: var(--accent);
  border: none;
  padding: 6px 16px;
  border-radius: var(--radius);
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-send:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.btn-send:not(:disabled):hover { opacity: 0.85; }

/* ── Loading ── */
.loading-dots::after {
  content: '';
  animation: dots 1.2s infinite;
}

@keyframes dots {
  0%, 20% { content: ''; }
  40% { content: '.'; }
  60% { content: '..'; }
  80%, 100% { content: '...'; }
}

.skeleton-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 24px 0 8px;
}

.skeleton-line {
  height: 12px;
  background: linear-gradient(90deg, var(--surface) 25%, var(--border) 50%, var(--surface) 75%);
  background-size: 200% 100%;
  border-radius: 2px;
  animation: shimmer 1.5s infinite;
}

.skeleton-label {
  font-size: 11px;
  margin-top: 8px;
  letter-spacing: 0.04em;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ── Error ── */
.error-box {
  font-size: 12px;
  color: var(--negative);
  border: 1px solid rgba(248, 113, 113, 0.2);
  padding: 12px 16px;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  gap: 10px;
}

.error-icon {
  width: 18px;
  height: 18px;
  border: 1px solid currentColor;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  flex-shrink: 0;
}

/* ── Result ── */
.result {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.section-label {
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 12px;
}

.answer-section {}

.answer-text {
  font-size: 15px;
  line-height: 1.75;
  color: var(--text);
  margin-bottom: 10px;
}

.summary-text {
  font-size: 13px;
  line-height: 1.6;
}

.meta-bar {
  font-size: 11px;
  letter-spacing: 0.04em;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 10px 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.sep { color: var(--border-hover); }

.accent { color: var(--accent); }

.evidence-section {}

.evidence-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.evidence-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  transition: border-color 0.15s;
}

.evidence-card:hover {
  border-color: var(--border-hover);
}

.evidence-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.ev-index {
  font-size: 11px;
  opacity: 0.4;
}

.ev-lang {
  font-size: 10px;
  letter-spacing: 0.1em;
  background: var(--surface);
  padding: 2px 6px;
  border-radius: var(--radius);
  color: var(--text-dim);
}

.ev-sentiment {
  font-size: 10px;
  letter-spacing: 0.06em;
}

.ev-id {
  font-size: 10px;
  margin-left: auto;
  opacity: 0.35;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ev-quote {
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-dim);
  font-style: italic;
  padding-left: 12px;
  border-left: 2px solid var(--border-hover);
}

/* ── Debug ── */
.debug-details {
  font-size: 11px;
  letter-spacing: 0.03em;
}

.debug-details summary {
  cursor: pointer;
  margin-bottom: 10px;
  user-select: none;
}

.debug-details summary:hover { color: var(--text); }

.debug-body {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.debug-query {
  color: var(--text-dim);
}

.debug-meta {
  color: var(--text-muted);
  margin-top: 4px;
}

/* ── Footer ── */
.footer {
  font-size: 10px;
  letter-spacing: 0.06em;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 20px 0 28px;
  border-top: 1px solid var(--border);
  margin-top: auto;
}

/* ── Transitions ── */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.slide-up-enter-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.slide-up-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
</style>
