import type { SupportedLanguage } from '~/types/review'

const SUBSET_TO_LANG: Record<string, SupportedLanguage> = {
  en: 'en',
  es: 'es',
  zh: 'zh',
  de: 'de',
  fr: 'fr',
  ja: 'ja',
}

const ID_PREFIX_TO_LANG: Record<string, SupportedLanguage> = {
  en: 'en',
  es: 'es',
  zh: 'zh',
  de: 'de',
  fr: 'fr',
  ja: 'ja',
}

/**
 * Detect language from the dataset subset name.
 * e.g. "en" → "en", "all_languages" → undefined (needs other detection)
 */
export function detectLangFromSubset(subset: string): SupportedLanguage | undefined {
  return SUBSET_TO_LANG[subset.toLowerCase()]
}

/**
 * Detect language from review id prefix (some HF datasets prefix ids with lang code).
 * e.g. "en_12345" → "en"
 */
export function detectLangFromId(id: string): SupportedLanguage | undefined {
  const prefix = id.split('_')[0]?.toLowerCase()
  if (prefix && prefix in ID_PREFIX_TO_LANG) {
    return ID_PREFIX_TO_LANG[prefix]
  }
  return undefined
}

/**
 * Resolve language with fallback chain:
 * 1. From id prefix
 * 2. From subset name
 * 3. Default to 'en'
 */
export function resolveLanguage(
  id: string,
  subset: string,
  fallback: SupportedLanguage = 'en',
): SupportedLanguage {
  return detectLangFromId(id) ?? detectLangFromSubset(subset) ?? fallback
}
