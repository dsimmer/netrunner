// i18n translation helpers: tr, tr-span, tr-element, tr-data, clean-input.
// Mirrors: src/cljs/nr/translations.cljs
import React from "react";
import { useAppState } from "./appstate";
import { format as i18nFormat } from "../jinteki/i18n";

// ---------------------------------------------------------------------------
// language-cursor: a getter that returns the current language from appstate
// ---------------------------------------------------------------------------
function getLanguage(): string | null {
  return useAppState.getState().options?.language ?? "en";
}

// ---------------------------------------------------------------------------
// tr-with-info: calls i18n.format with the language cursor
// ---------------------------------------------------------------------------
export function trWithInfo(
  resource: string | [string, string],
  params?: Record<string, string>,
): { translation: string; targetLanguage: boolean } {
  return i18nFormat(getLanguage, resource, params);
}

// ---------------------------------------------------------------------------
// tr: extracts just the translation string
// ---------------------------------------------------------------------------
export function tr(
  resource: string | [string, string],
  params?: Record<string, string>,
): string {
  return trWithInfo(resource, params).translation;
}

// ---------------------------------------------------------------------------
// i18n-keys: convert params to data-i18n-param-* attributes
// ---------------------------------------------------------------------------
function i18nKeys(params?: Record<string, string>): Record<string, string> {
  if (!params) return {};
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    result[`data-i18n-param-${k}`] = v;
  }
  return result;
}

// ---------------------------------------------------------------------------
// embed-content: replace [pattern] placeholders with React elements
// e.g. "visit our [link] page" + {:link [:a ...]} => "visit our" <a .../> " page"
// ---------------------------------------------------------------------------
function embedContent(
  translation: string,
  content?: Record<string, React.ReactElement>,
): React.ReactElement | null {
  if (!content || Object.keys(content).length === 0) {
    return null;
  }

  let elements: Array<string | React.ReactElement> = [translation];

  const patterns = Object.keys(content);
  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    const insert = content[pattern];
    const regex = new RegExp(`\\[${pattern}\\]`);

    const newElements: Array<string | React.ReactElement> = [];
    for (const el of elements) {
      if (typeof el !== "string") {
        newElements.push(el);
      } else {
        const parts = el.split(regex);
        for (let j = 0; j < parts.length; j++) {
          if (parts[j] !== "") {
            newElements.push(parts[j]);
          }
          if (j < parts.length - 1 && insert) {
            newElements.push(insert);
          }
        }
      }
    }
    elements = newElements;
  }

  return React.createElement("span", null, elements);
}

// ---------------------------------------------------------------------------
// tr-element-with-embedded-content
// ---------------------------------------------------------------------------
export function trElementWithEmbeddedContent(
  element: string,
  resource: string | [string, string],
  content?: Record<string, React.ReactElement>,
  params?: Record<string, string>,
): React.ReactElement {
  // Handle nil/empty resource (mirrors: if (seq resource))
  if ((typeof resource === "string" && resource.length === 0) ||
      (Array.isArray(resource) && resource.length === 0)) {
    return React.createElement(element, { "data-i18n-failure": true }, "[no resource]");
  }

  const { translation, targetLanguage } = trWithInfo(resource, params);
  const dataAttrs: Record<string, unknown> = {
    "data-i18n-key": typeof resource === "string" ? resource : resource[0],
    "data-i18n-success": targetLanguage,
  };
  const paramAttrs = i18nKeys(params);

  const embedded = embedContent(translation, content);
  const body = embedded ?? "-";

  return React.createElement(element, { ...dataAttrs, ...paramAttrs }, body);
}

// ---------------------------------------------------------------------------
// tr-element: wrapper that delegates to tr-element-with-embedded-content
// Mirrors CLJS arities: (tr-element element resource) and (tr-element element resource params)
// Both delegate to tr-element-with-embedded-content with content=nil
// ---------------------------------------------------------------------------
export function trElement(
  element: string,
  resource: string | [string, string],
  params?: Record<string, string>,
): React.ReactElement {
  return trElementWithEmbeddedContent(element, resource, undefined, params);
}

// ---------------------------------------------------------------------------
// tr-span: convenience wrapper
// ---------------------------------------------------------------------------
export function trSpan(
  resource: string | [string, string],
  params?: Record<string, string>,
): React.ReactElement {
  return trElement("span", resource, params);
}

// ---------------------------------------------------------------------------
// clean-input: sanitize strings for i18n keys
// ---------------------------------------------------------------------------
export function cleanInput(s: string): string {
  if (!s || s.length === 0) {
    throw new Error("Given empty string");
  }
  return s
    .replace(/ /g, "-")
    .replace(/&/g, "-")
    .replace(/'/g, "-")
    .replace(/\./g, "")
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// tr-fix-server-name: match "server-N" patterns
// ---------------------------------------------------------------------------
export function trFixServerName(s: string): { msg: string; num?: string } {
  const cleaned = cleanInput(s);
  const match = cleaned.match(/^server-(\d+)$/);
  if (match) {
    return { msg: "server-num", num: match[1] };
  }
  return { msg: cleaned };
}

// ---------------------------------------------------------------------------
// Convenience translation functions
// ---------------------------------------------------------------------------
export function trType(s: string): string {
  return tr(["card-type_name", s], { type: cleanInput(s) });
}

export function trSide(s: string): string {
  return tr(["side_name", s], { side: cleanInput(s) });
}

export function trFaction(s: string): string {
  return tr(["faction_name", s], { faction: cleanInput(s) });
}

export function trFormat(s: string): string {
  return tr(["format_name", s], { format: cleanInput(s) });
}

export function trRoomType(s: string): string {
  return tr(["lobby_type", s], { type: cleanInput(s) });
}

export function trPronouns(s: string): string {
  return tr(["pronouns", s], { pronoun: cleanInput(s) });
}

export function trSet(s: string): string {
  // If the first character is a digit, prepend "a"
  const normalized = /^[0-9]/.test(s) ? `a${s}` : s;
  return tr(["set_name", normalized], { name: cleanInput(s) });
}

export function trGamePrompt(s: string): string {
  return tr(["game_prompt", s], trFixServerName(s));
}

// ---------------------------------------------------------------------------
// tr-data: look up localized data from a record
// ---------------------------------------------------------------------------
export function trData(k: string, data: Record<string, unknown>): unknown {
  const localized = (data as Record<string, unknown>)["localized"] as Record<string, unknown> | undefined;
  return (localized?.[k] as unknown) ?? (data as Record<string, unknown>)[k];
}
