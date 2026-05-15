// Mirrors: src/cljc/jinteki/i18n.cljc
import { FluentBundle, FluentResource, type FluentVariable } from "@fluent/bundle";

interface LangEntry {
  content: string;
  ftl: FluentBundle;
}

const fluentDictionary = new Map<string, LangEntry>();

// Mirrors: insert-lang!
// "la-pig" (Pig Latin) uses "en" locale for bundle but stored under "la-pig" key
export function insertLang(lang: string, content: string): void {
  const bundleLang = lang === "la-pig" ? "en" : lang;
  const bundle = new FluentBundle(bundleLang);
  const resource = new FluentResource(content);
  bundle.addResource(resource);
  fluentDictionary.set(lang, { content, ftl: bundle });
}

// Mirrors: get-content
export function getContent(lang: string): string | undefined {
  return fluentDictionary.get(lang)?.content;
}

// Mirrors: get-bundle
export function getBundle(lang: string): FluentBundle | undefined {
  return fluentDictionary.get(lang)?.ftl;
}

// Mirrors: get-translation
export function getTranslation(
  bundle: FluentBundle | undefined,
  id: string,
  params?: Record<string, FluentVariable>,
): string | null {
  if (!bundle) return null;
  const msg = bundle.getMessage(id);
  if (!msg?.value) return null;
  const result = bundle.formatPattern(msg.value, params ?? {});
  if (result === "undefined") return null;
  return result;
}

export interface FormatResult {
  translation: string | undefined;
  targetLanguage: boolean | null;
}

// Mirrors: format
// langCursor: getter returning current language code (mirrors @lang-cursor deref)
// resource: key string or [key, fallback] tuple
export function format(
  langCursor: () => string | null,
  resource: string | [string, string],
  params?: Record<string, FluentVariable>,
): FormatResult {
  const lang = langCursor() ?? "en";
  const [rawId, fallback] = Array.isArray(resource) ? resource : [resource, undefined];
  const id = rawId;
  const bundle = getBundle(lang);
  const targetTranslation = getTranslation(bundle, id, params);

  if (targetTranslation !== null) {
    return { translation: targetTranslation, targetLanguage: true };
  }
  if (fallback !== undefined) {
    return { translation: fallback, targetLanguage: null };
  }
  return { translation: getTranslation(getBundle("en"), id, params) ?? undefined, targetLanguage: null };
}
