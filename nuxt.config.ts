export default defineNuxtConfig({
  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    qwen3ApiUrl: process.env.QWEN3_API_URL || 'http://localhost:11434',
    qwen3ApiKey: process.env.QWEN3_API_KEY || '',
    qwen3Model: process.env.QWEN3_MODEL || 'qwen3:8b',
    embeddingServiceUrl: process.env.EMBEDDING_SERVICE_URL || 'http://localhost:8001',
    rerankerServiceUrl: process.env.RERANKER_SERVICE_URL || 'http://localhost:8002',
    qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
    qdrantApiKey: process.env.QDRANT_API_KEY || '',
    qdrantCollection: process.env.QDRANT_COLLECTION || 'amazon_reviews',
    hfToken: process.env.HF_TOKEN || '',

    public: {
      appName: 'YICHA',
    },
  },

  typescript: {
    strict: true,
  },
})