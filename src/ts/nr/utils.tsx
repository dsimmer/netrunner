// Shared UI utilities: icon/card rendering, dots, faction icons, format maps, date helpers.
// Mirrors: src/cljs/nr/utils.cljs
import React from "react";
import ReactDOMServer from "react-dom/server";
import { format as jsFormat, parse, ZoneId, DateTimeFormatter, Locale } from "@js-joda/core";
import { enUS } from "@js-joda/locale_en-us";
import { useAppState } from "./appstate";
import { tr, trSpan, trData } from "./translations";
import { regexEscape } from "../../jinteki/utils";

// ---------------------------------------------------------------------------
// Zero-width space dot characters
// ---------------------------------------------------------------------------
export const zws = "\u200B";
export const influenceDot = `\u25CF${zws}`;
export const bannedDot = `\u2718${zws}`;
export const restrictedDot = `\uD83E\uDD84${zws}`;
export const allianceDot = `\u25CB${zws}`;
export const rotatedDot = `\u21BB${zws}`;
export const deckPointsDot = `\u2756${zws}`;

// ---------------------------------------------------------------------------
// Format maps
// ---------------------------------------------------------------------------
export const slugToFormat: Record<string, string> = {
  standard: "Standard",
  throwback: "Throwback",
  startup: "Startup",
  "quick-draft": "Quick Draft",
  "system-gateway": "System Gateway",
  core: "Core",
  preconstructed: "Preconstructed",
  chimera: "Chimera",
  eternal: "Eternal",
  casual: "Casual",
};

export const slugToBuildableFormat: Record<string, string> = Object.fromEntries(
  Object.entries(slugToFormat).filter(([k]) => k !== "preconstructed" && k !== "chimera"),
);

export const formatToSlug: Record<string, string> = Object.fromEntries(
  Object.entries(slugToFormat).map(([k, v]) => [v, k]),
);

export const buildableFormatToSlug: Record<string, string> = Object.fromEntries(
  Object.entries(formatToSlug).filter(([k]) => k !== "Preconstructed" && k !== "Chimera"),
);

// ---------------------------------------------------------------------------
// Dot / faction span components
// ---------------------------------------------------------------------------
export function bannedSpan(): React.ReactElement {
  return (
    <span className="invalid" title={tr(["card-browser_removed", "Removed"])}>
      {" "}
      {bannedDot}
    </span>
  );
}

export function restrictedSpan(): React.ReactElement {
  return (
    <span className="" title={tr(["card-browser_restricted", "Restricted"])}>
      {" "}
      {restrictedDot}
    </span>
  );
}

export function rotatedSpan(): React.ReactElement {
  return (
    <span className="casual" title={tr(["card-browser_rotated", "Rotated"])}>
      {" "}
      {rotatedDot}
    </span>
  );
}

export function deckPointsCardSpan(points: number | undefined): React.ReactElement {
  const title = points != null ? `${tr(["deck-builder_deck-points", "Deck points"])}: ${points}` : undefined;
  return (
    <span className="legal" title={title}>
      {" "}
      {deckPointsDot}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Influence / alliance dots
// ---------------------------------------------------------------------------
function makeDots(dot: string, n: number): string {
  if (n <= 20) return `${n}${dot}`;
  return dot.repeat(n);
}

export function influenceDots(num: number): string {
  return makeDots(influenceDot, num);
}

export function allianceDots(num: number): string {
  return makeDots(allianceDot, num);
}

export interface CostMap {
  [key: string]: number;
}

export function dotsHtml(dot: string, costMap: CostMap): React.ReactElement[] {
  return Object.keys(costMap)
    .sort()
    .map((factionKey) => (
      <span key={factionKey} className={`influence ${factionKey}`}>
        {makeDots(dot, costMap[factionKey] ?? 0)}
      </span>
    ));
}

// ---------------------------------------------------------------------------
// Faction icon
// ---------------------------------------------------------------------------
export function factionIcon(faction: string, id: string): React.ReactElement {
  const cssClass = (() => {
    switch (faction) {
      case "Adam": return "adam";
      case "Anarch": return "anarch";
      case "Apex": return "apex";
      case "Criminal": return "criminal";
      case "Haas-Bioroid": return "hb";
      case "Jinteki": return "jinteki";
      case "NBN": return "nbn";
      case "Shaper": return "shaper";
      case "Sunny Lebeau": return "sunny";
      case "Weyland Consortium": return "weyland";
      default: return null;
    }
  })();

  if (cssClass) {
    return <span className={`faction-icon ${cssClass}`} title={`${faction} - ${id}`} />;
  }
  if (faction === "Neutral") {
    return <span className="side" />;
  }
  return <span className="side">(Unknown)</span>;
}

// ---------------------------------------------------------------------------
// Toastr helpers
// ---------------------------------------------------------------------------
export interface ToastrOptions {
  "close-button"?: boolean;
  "prevent-duplicates"?: boolean;
  "time-out"?: number;
  "tap-to-dismiss"?: boolean;
  [key: string]: unknown;
}

export function toastrOptions(options: ToastrOptions): object {
  return {
    closeButton: options["close-button"] ?? false,
    debug: false,
    newestOnTop: false,
    progressBar: false,
    positionClass: "toast-card",
    preventDuplicates: options["prevent-duplicates"] ?? true,
    onclick: null,
    showDuration: 300,
    hideDuration: 1000,
    timeOut: options["time-out"] ?? 3000,
    extendedTimeOut: options["time-out"] ?? 1000,
    showEasing: "swing",
    hideEasing: "linear",
    showMethod: "fadeIn",
    hideMethod: "fadeOut",
    tapToDismiss: options["tap-to-dismiss"] ?? true,
  };
}

export function nonGameToast(msg: string, toastType: string, options?: object): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).toastr.options = toastrOptions(options as ToastrOptions ?? {});
  const f = (window as any).toastr[toastType];
  if (typeof f === "function") f(msg);
}

export function trNonGameToast(
  trVec: string[],
  toastType: string,
  options?: object,
): void;
export function trNonGameToast(
  trVec: string[],
  trParams: Record<string, unknown> | undefined,
  toastType: string,
  options?: object,
): void;
export function trNonGameToast(
  trVec: string[],
  maybeParams: Record<string, unknown> | string | object | undefined,
  toastType?: string,
  options?: object,
): void {
  let trParams: Record<string, unknown> | undefined;
  let actualToastType: string;
  let actualOptions: object | undefined;

  if (typeof maybeParams === "string") {
    // (tr-non-game-toast tr-vec toast-type)
    actualToastType = toastType!;
    trParams = undefined;
    actualOptions = maybeParams;
  } else if (Array.isArray(maybeParams)) {
    // (tr-non-game-toast tr-vec toast-type options)
    actualToastType = maybeParams as unknown as string; // shouldn't happen
    actualToastType = toastType!;
    trParams = undefined;
    actualOptions = maybeParams as unknown as object;
  } else {
    // (tr-non-game-toast tr-vec tr-params toast-type options)
    trParams = maybeParams as Record<string, unknown> | undefined;
    actualToastType = toastType!;
    actualOptions = options;
  }

  // Re-interpret with correct overloads
  // Actually the cljs has 3 overloads:
  //   ([tr-vec toast-type])
  //   ([tr-vec toast-type options])
  //   ([tr-vec tr-params toast-type options])
  // Let's redo this properly with function overloading

  const opts = actualOptions ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).toastr.options = toastrOptions(opts as ToastrOptions);
  const f = (window as any).toastr[actualToastType];
  let msg: string;
  if (trParams) {
    msg = ReactDOMServer.renderToString(trSpan(trVec, trParams));
  } else {
    msg = ReactDOMServer.renderToString(trSpan(trVec));
  }
  if (typeof f === "function") f(msg);
}

// ---------------------------------------------------------------------------
// Lazy seq / map-longest analog
// ---------------------------------------------------------------------------
export function mapLongest<T, U>(
  f: (...args: T[]) => U,
  _default: T,
  ...colls: T[][]
): U[] {
  const result: U[] = [];
  // Find max length
  let maxLen = 0;
  for (const c of colls) {
    if (c.length > maxLen) maxLen = c.length;
  }
  for (let i = 0; i < maxLen; i++) {
    const args = colls.map((c) => (i < c.length ? c[i] : _default));
    result.push(f(...args as unknown as [...T[]]));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Regex helpers
// ---------------------------------------------------------------------------
export function regexEscapeJs(string: string): string {
  // Clojure (replace) does character-by-character map, same effect
  const specialChars = ".*+?[](){}^$";
  const escapedChars = specialChars.split("").map((ch) => `\\${ch}`);
  const smap = Object.fromEntries(
    specialChars.split("").map((ch, i) => [ch, escapedChars[i]])
  );
  return string.split("").map((ch) => smap[ch] ?? ch).join("");
}

// ---------------------------------------------------------------------------
// Icon patterns
// ---------------------------------------------------------------------------
export interface PatternPair {
  regex: RegExp;
  replacement: React.ReactElement;
}

function spanOf(icon: string): React.ReactElement {
  return (
    <span className={`anr-icon ${icon}`} title={` ${icon}`} aria-label={icon} role="img" />
  );
}

function regexOf(iconCode: string): RegExp {
  return new RegExp(`(?i)${regexEscapeJs(iconCode)}`);
}

const iconPatterns: PatternPair[] = (() => {
  const iconMap: Record<string, string> = {
    "[credit]": "credit",
    "[credits]": "credit",
    "[c]": "credit",
    "[recurring credit]": "recurring-credit",
    "[recurring credits]": "recurring-credit",
    "[recurring-credit]": "recurring-credit",
    "[recurring-credits]": "recurring-credit",
    "[click]": "click",
    "[clicks]": "click",
    "1[memory unit]": "mu1",
    "1[mu]": "mu1",
    "2[memory unit]": "mu2",
    "2[mu]": "mu2",
    "3[memory unit]": "mu3",
    "3[mu]": "mu3",
    "[memory unit]": "mu",
    "[mu]": "mu",
    "[link]": "link",
    "[l]": "link",
    "[subroutine]": "subroutine",
    "[trash]": "trash",
    "[t]": "trash",
    "[adam]": "adam",
    "[anarch]": "anarch",
    "[apex]": "apex",
    "[criminal]": "criminal",
    "[hb]": "haas-bioroid",
    "[haas-bioroid]": "haas-bioroid",
    "[jinteki]": "jinteki",
    "[nbn]": "nbn",
    "[shaper]": "shaper",
    "[sunny]": "sunny",
    "[weyland]": "weyland-consortium",
    "[weyland-consortium]": "weyland-consortium",
  };
  return Object.entries(iconMap)
    .map(([k, v]): PatternPair => ({ regex: regexOf(k), replacement: spanOf(v) }))
    .sort((a, b) => b.regex.source.length - a.regex.source.length);
})();

// ---------------------------------------------------------------------------
// Card patterns
// ---------------------------------------------------------------------------
interface CardLike {
  title?: string;
  replaced_by?: boolean;
  [key: string]: unknown;
}

export interface AllCardsMap {
  [key: string]: CardLike;
}

export interface AppStateCards {
  "all-cards-and-flips"?: AllCardsMap;
  "cards-loaded"?: boolean;
  [key: string]: unknown;
}

let _cardPatternsMemo: PatternPair[] | null = null;

function cardPatternsImpl(): PatternPair[] {
  const allCardsAndFlips = useAppState.getState() as unknown as {
    "all-cards-and-flips"?: AllCardsMap;
  }["all-cards-and-flips"];

  if (!allCardsAndFlips) return [];

  const cards = Object.values(allCardsAndFlips)
    .filter((c: CardLike) => !c.replaced_by && c.title)
    .map((c: CardLike) => ({
      title: c.title as string,
      trTitle: trData("title", c),
    }));

  const entries = [
    ...cards.map((c) => [c.title, spanOf(c.title, c.trTitle as string)] as PatternPair),
    ...cards.map((c) => [c.trTitle as string, spanOf(c.title as string, c.trTitle as string)] as PatternPair),
  ];

  // Deduplicate by regex source
  const seen = new Set<string>();
  const distinct = entries.filter((e) => {
    const key = e.regex.source;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return distinct.sort((a, b) => b.regex.source.length - a.regex.source.length);
}

function cardPatterns(): PatternPair[] {
  const cardsLoaded = useAppState.getState().cardsLoaded;
  // Memoize based on cards-loaded
  // For simplicity, re-read patterns each time cards loaded state changes
  // In practice the memoization in cljs is based on the argument
  const key = `${cardsLoaded}`;
  // Use a simple cache keyed by cardsLoaded
  if (!_cardPatternsMemo || !useAppState.getState()._cardPatternsCache?.has(key)) {
    const result = cardPatternsImpl();
    if (!useAppState.getState()._cardPatternsCache) {
      (useAppState.getState() as unknown as Record<string, unknown>)._cardPatternsCache = new Map();
    }
    (useAppState.getState() as unknown as Record<string, unknown>)._cardPatternsCache.set(key, result);
    _cardPatternsMemo = result;
  }
  return _cardPatternsMemo;
}

// ---------------------------------------------------------------------------
// Contains-card pattern (for early exit optimization)
// ---------------------------------------------------------------------------
let _containsPattern: RegExp | null = null;
let _containsPatternKey = "";

function containsCardPatternImpl(): RegExp {
  const allCardsAndFlips = useAppState.getState() as unknown as {
    "all-cards-and-flips"?: AllCardsMap;
  }["all-cards-and-flips"];

  if (!allCardsAndFlips) return /^(?:)$/;

  const patterns = Object.values(allCardsAndFlips)
    .filter((c: CardLike) => !c.replaced_by)
    .flatMap((c: CardLike) => {
      const titles: string[] = [];
      if (c.title) titles.push(c.title as string);
      const trTitle = trData("title", c);
      if (typeof trTitle === "string") titles.push(trTitle);
      return [...new Set(titles)].map(regexEscapeJs);
    });

  return new RegExp(`(?:${patterns.join("|")})`, "i");
}

function containsCardPattern(): RegExp {
  const cardsLoaded = useAppState.getState().cardsLoaded;
  const key = `${cardsLoaded}`;
  if (!_containsPattern || _containsPatternKey !== key) {
    _containsPattern = containsCardPatternImpl();
    _containsPatternKey = key;
  }
  return _containsPattern;
}

// ---------------------------------------------------------------------------
// Special patterns
// ---------------------------------------------------------------------------
const specialPatterns: PatternPair[] = (() => {
  const specialMap: Record<string, React.ReactElement> = {
    "[hr]": <hr />,
    "[br]": <br />,
    "[!]": <div className="smallwarning">!</div>,
  };
  return Object.entries(specialMap)
    .map(([k, v]): PatternPair => ({ regex: regexOf(k), replacement: v }))
    .sort((a, b) => b.regex.source.length - a.regex.source.length);
})();

// ---------------------------------------------------------------------------
// Render fragment infrastructure
// ---------------------------------------------------------------------------
type FragmentElement = string | React.ReactElement | [string, ...unknown[]] | null | undefined;

function replaceInElement(
  element: FragmentElement,
  [regex, replacement]: PatternPair,
): FragmentElement[] {
  if (typeof element !== "string") {
    return [element];
  }
  const parts = element.split(regex);
  const result: FragmentElement[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== "") {
      result.push(parts[i]);
    }
    if (i < parts.length - 1) {
      result.push(replacement);
    }
  }
  return result.filter((x) => x !== null && x !== undefined && x !== "");
}

function replaceInFragment(
  fragment: FragmentElement[],
  substitution: PatternPair,
): FragmentElement[] {
  return fragment.flatMap((el) => replaceInElement(el, substitution));
}

function setReactKey(n: number, elem: FragmentElement): FragmentElement {
  if (!Array.isArray(elem)) return elem;
  const head = elem[0] as string;
  const second = elem[1];
  const isMap = typeof second === "object" && second !== null && !React.isValidElement(second as React.ReactElement);
  const attr = isMap ? (second as Record<string, unknown>) : {};
  const tail = isMap ? elem.slice(2) : elem.slice(1);
  return [head, { ...attr, key: n }, ...tail];
}

let _renderFragmentCache: Map<string, FragmentElement[]> | null = null;
let _renderFragmentCacheKey = "";

function renderFragmentImpl(
  fragment: FragmentElement[],
  patterns: PatternPair[],
): FragmentElement[] {
  let counter = 0;
  const nextKey = (): number => counter++;

  let current = fragment;
  for (const pattern of patterns) {
    current = current.flatMap((el) => replaceInElement(el, pattern));
  }

  return current
    .map((el) => (Array.isArray(el) ? setReactKey(nextKey(), el) : el))
    .filter((x) => x !== null && x !== undefined);
}

function renderFragment(
  fragment: FragmentElement[],
  patterns: PatternPair[],
): FragmentElement[] {
  const key = JSON.stringify(fragment) + "|" + patterns.map((p) => p.regex.source).join("||");
  if (_renderFragmentCache && _renderFragmentCache.has(key)) {
    return _renderFragmentCache.get(key)!;
  }
  const result = renderFragmentImpl(fragment, patterns);
  if (!_renderFragmentCache) _renderFragmentCache = new Map();
  _renderFragmentCache.set(key, result);
  return result;
}

function renderInput(
  input: string | FragmentElement[],
  patterns: PatternPair[],
): FragmentElement[] {
  if (typeof input !== "string" && !Array.isArray(input)) {
    return [];
  }
  const fragment: FragmentElement[] = typeof input === "string" ? [null, input] : input;
  return renderFragment(fragment, patterns);
}

export function renderIcons(input: string | FragmentElement[]): FragmentElement[] {
  return renderInput(input, iconPatterns);
}

export function renderCards(input: string | FragmentElement[]): FragmentElement[] {
  return renderInput(input, cardPatterns());
}

export function renderSpecials(input: string | FragmentElement[]): FragmentElement[] {
  return renderInput(input, specialPatterns);
}

// ---------------------------------------------------------------------------
// HTML rendering (safe subset)
// ---------------------------------------------------------------------------
function applySingleTag(
  tagName: string,
  tagKw: string,
  renderFn: (text: string) => FragmentElement[],
  text: string,
): (FragmentElement | [string, FragmentElement[]])[] {
  const pattern = new RegExp(`(?s)<${tagName}>(.*?)</${tagName}>`);
  // Use a regex approach to split while capturing groups
  const parts: string[] = [];
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push("__TAG_CONTENT__");
    parts.push(match[1]);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  const result: (FragmentElement | [string, FragmentElement[]])[] = [];
  let isContent = false;
  for (const part of parts) {
    if (part === "__TAG_CONTENT__") {
      isContent = !isContent;
      continue;
    }
    if (isContent) {
      result.push([tagKw, renderFn(part)]);
    } else if (part) {
      result.push(part);
    }
  }
  return result;
}

function expandTag(
  tagName: string,
  tagKw: string,
  segs: (FragmentElement | [string, FragmentElement[]])[],
): (FragmentElement | [string, FragmentElement[]])[] {
  return segs.flatMap((seg) => {
    if (typeof seg === "string") {
      return applySingleTag(tagName, tagKw, renderIcons, seg);
    }
    return [seg];
  });
}

export function renderSafeHtml(text: string): FragmentElement[] | null {
  if (typeof text !== "string") return null;
  const ulRender = (inner: string): FragmentElement[] => {
    const liParts = applySingleTag("li", "li", renderIcons, inner);
    return [":ul", ...liParts];
  };
  let result = applySingleTag("ul", "ul", ulRender, text);
  result = expandTag("strong", "strong", result);
  result = expandTag("em", "em", result);
  result = result.map((seg) => {
    if (typeof seg === "string") {
      return renderIcons(seg);
    }
    return seg;
  });
  return [":<>", ...result.flat()];
}

export function renderMessage(input: string | FragmentElement[]): FragmentElement[] {
  const processed = renderIcons(typeof input === "string" ? [null, input] : input);
  return renderSpecials(renderCards(processed));
}

// ---------------------------------------------------------------------------
// Wrap timestamp
// ---------------------------------------------------------------------------
export function wrapTimestamp(
  element: React.ReactElement,
  timestamp: string | null | undefined,
): React.ReactElement {
  if (timestamp) {
    return (
      <div className="timestamp-wrapper-system">
        {element}
        <span className="timestamp timestamp-system">{timestamp}</span>
      </div>
    );
  }
  return element;
}

// ---------------------------------------------------------------------------
// Player highlight patterns
// ---------------------------------------------------------------------------
let _playerHighlightCache: { patterns: PatternPair[]; key: string } | null = null;

export function playerHighlightPatterns(
  corp: string,
  runner: string,
  timestamp?: string | null,
): PatternPair[] {
  const key = `${corp}||${runner}||${timestamp ?? ""}`;
  if (_playerHighlightCache && _playerHighlightCache.key === key) {
    return _playerHighlightCache.patterns;
  }

  const patterns: PatternPair[] = [];
  const entries: [string, string, string | undefined][] = [];
  if (corp) entries.push(["corp", corp, timestamp]);
  if (runner) entries.push(["runner", runner, timestamp]);

  const sorted = entries.sort((a, b) => b[1].length - a[1].length);

  for (const [player, name, ts] of sorted) {
    const wrapped = wrapTimestamp(
      <span className={`${player}-username`}>{name}</span>,
      ts ?? null,
    );
    patterns.push({
      regex: new RegExp(`^${regexEscapeJs(name)}`),
      replacement: wrapped,
    });
    patterns.push({
      regex: new RegExp(`^!${regexEscapeJs(name)}`),
      replacement: (
        <>
          <div className="smallwarning">!</div>
          {wrapped}
        </>
      ),
    });
  }

  patterns.sort((a, b) => b.regex.source.length - a.regex.source.length);
  _playerHighlightCache = { patterns, key };
  return patterns;
}

export function renderPlayerHighlight(
  message: string | FragmentElement[],
  corp: string,
  runner: string,
  timestamp?: string | null,
): FragmentElement[] {
  const patterns = playerHighlightPatterns(corp, runner, timestamp);
  return renderInput(message, patterns);
}

// ---------------------------------------------------------------------------
// Player highlight option class
// ---------------------------------------------------------------------------
export function playerHighlightOptionClass(): string | undefined {
  const options = useAppState.getState().options;
  if ((options.logPlayerHighlight as string) === "blue-red") {
    return "log-player-highlight-red-blue";
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Conditional button components
// ---------------------------------------------------------------------------
export function condButton(
  text: string,
  cond: boolean,
  f: () => void,
  attrs?: Record<string, unknown>,
): React.ReactElement {
  if (cond) {
    return <button onClick={f} key={text} {...attrs}>{text}</button>;
  }
  return <button className="disabled" key={text} {...attrs}>{text}</button>;
}

export function checkboxButton(
  onText: string,
  offText: string,
  onCond: boolean,
  f: () => void,
): React.ReactElement {
  if (onCond) {
    return <button className="on" onClick={f} key={onText}>{onText}</button>;
  }
  return <button className="off" onClick={f} key={offText}>{offText}</button>;
}

export function tristateButton(
  onText: string,
  offText: string,
  onCond: boolean,
  disableCond: boolean,
  f: () => void,
): React.ReactElement {
  const text = onCond ? onText : offText;
  if (disableCond) {
    return <button className="disabled" key={text}>{text}</button>;
  }
  if (onCond) {
    return <button className="on" onClick={f} key={text}>{text}</button>;
  }
  return <button className="off" onClick={f} key={text}>{text}</button>;
}

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------
export function notNumToZero(input: unknown): number {
  const n = typeof input === "number" ? input : parseInt(String(input), 10);
  return n > 0 ? n : 0;
}

export function safeDivide(num1: number, num2: number): number {
  return num2 > 0 ? num1 / num2 : 0;
}

export function numToPercent(num1: number, num2: number): string {
  if (num2 === 0) return "0";
  return `${Math.round((num1 / num2) * 100)}`;
}

// ---------------------------------------------------------------------------
// Scroll helpers
// ---------------------------------------------------------------------------
export function setScrollTop(node: HTMLElement | null, scrollTop: number): void {
  if (node) {
    node.scrollTop = scrollTop;
  }
}

export function storeScrollTop(
  node: HTMLElement | null,
  setter: (n: number) => void,
): void {
  if (node) {
    setter(node.scrollTop);
  }
}

// ---------------------------------------------------------------------------
// Image path helpers
// ---------------------------------------------------------------------------
export function getImagePath(
  images: Record<string, unknown>,
  lang: string,
  res: string,
  art: string,
  depth = 0,
): string[] | null {
  if (depth >= 4) return null;

  const result =
    (images[lang] as Record<string, unknown>)?.[res]?.[art] ??
    ((res !== "default" && getImagePath(images, lang, "default", art, depth + 1)) ??
     (lang !== "en" && getImagePath(images, "en", res, art, depth + 1)) ??
     (art !== "stock" && getImagePath(images, lang, res, "stock", depth + 1)) ??
     (depth === 0 ? "img/missing.png" : undefined));

  if (!result) return null;
  if (Array.isArray(result)) return result;
  return [result as string];
}

export function imageOrFace(card: Record<string, unknown>): unknown {
  if (card.images) return card.images;
  if (card.face) {
    const faceKey = String(card.face);
    const faces = card.faces as Record<string, unknown> | undefined;
    if (faces) return faces[faceKey]?.images;
  }
  return (card.faces as Record<string, unknown>)?.front?.images;
}

// ---------------------------------------------------------------------------
// Time span string
// ---------------------------------------------------------------------------
export function timeSpanString(delta: number): string {
  const days = Math.floor(delta / (60 * 60 * 24));
  let remaining = delta % (60 * 60 * 24);
  const hours = Math.floor(remaining / (60 * 60));
  remaining = remaining % (60 * 60);
  const minutes = Math.floor(remaining / 60);
  remaining = remaining % 60;
  const seconds = Math.floor(remaining);

  if (days > 0) return `${days} days, ${hours} hours`;
  if (hours > 0) return `${hours} hours, ${minutes} minutes`;
  if (minutes > 0) return `${minutes} minutes, ${seconds} seconds`;
  return `${seconds} seconds`;
}

// ---------------------------------------------------------------------------
// Date formatters using @js-joda
// ---------------------------------------------------------------------------
const _enUSLocale: Locale = (enUS as unknown as { Locale: Locale }).Locale;

const mdyFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM d YYYY")
  .withLocale(_enUSLocale);

const dayWordWithTimeFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE, MMM d, YYYY - HH:mm")
  .withLocale(_enUSLocale);

const iSOIshFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("YYYY-MM-dd, HH:mm")
  .withLocale(_enUSLocale);

export function formatZonedDateTime(formatter: DateTimeFormatter, date: string): string {
  return formatter.format(parse(date));
}

export function formatDateTime(formatter: DateTimeFormatter, date: string): string {
  try {
    const parsed = parse(date);
    const defaultZone = ZoneId.systemDefault();
    const localTime = parsed.withZoneSameInstant(defaultZone);
    return formatter.format(localTime);
  } catch {
    return "dunno";
  }
}

// Export formatters for use in other modules
export { mdyFormatter, dayWordWithTimeFormatter, iSOIshFormatter };
