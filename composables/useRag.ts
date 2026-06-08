import { ref } from 'vue'
import type { RagResponse, RagRequest } from '~/types/rag'

export function useRag() {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const result = ref<RagResponse | null>(null)

  async function ask(request: RagRequest) {
    loading.value = true
    error.value = null
    result.value = null

    try {
      const data = await $fetch<RagResponse>('/api/rag', {
        method: 'POST',
        body: request,
      })
      result.value = data
    }
    catch (err: unknown) {
      const e = err as { data?: { message?: string }; message?: string }
      error.value = e?.data?.message ?? e?.message ?? 'Unknown error'
    }
    finally {
      loading.value = false
    }
  }

  function reset() {
    result.value = null
    error.value = null
  }

  return { loading, error, result, ask, reset }
}
