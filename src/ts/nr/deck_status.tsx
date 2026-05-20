// Deck legality status display: status spans, format labels, violation details.
// Mirrors: src/cljs/nr/deck_status.cljs
import React from "react";
import { calculateDeckStatus, trustedDeckStatus, DeckStatus as ValidatorDeckStatus } from "../jinteki/validator";
import { Deck as DeckType } from "../jinteki/validator";
import { slugToFormat } from "./utils";
import { trSpan, trFormat } from "./translations";

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

interface StatusEntry {
  legal: boolean;
  reason?: string;
  description?: string;
}

type DeckStatusMap = Record<string, StatusEntry>;

interface ParsedDeckStatus extends ValidatorDeckStatus {
  [fmt: string]: StatusEntry | string | undefined;
}

// ──────────────────────────────────────────────────────────────────
// Simple memoize (mirrors clojure.core/memoize)
// ──────────────────────────────────────────────────────────────────

function memoize<T extends (...args: never[]) => unknown>(fn: T): T {
  const cache = new Map<string, ReturnType<T>>();
  const memoized = function (...args: Parameters<T>): ReturnType<T> {
    const key = JSON.stringify(args);
    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const result = fn(...args) as ReturnType<T>;
    cache.set(key, result);
    return result;
  };
  return memoized as T;
}

// ──────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────

function buildDeckStatusLabel(deckStatus: ParsedDeckStatus, violationDetails?: boolean): React.ReactElement {
  const formats = Object.keys(slugToFormat);
  return (
    <div className="status-tooltip blue-shade">
      {formats.map((fmt) => {
        const entry = deckStatus[fmt as keyof ParsedDeckStatus] as StatusEntry | undefined;
        const legal = entry?.legal ?? false;
        const reason = entry?.reason;
        const description = entry?.description;
        const slug = slugToFormat[fmt];
        return (
          <div
            key={fmt}
            className={legal ? "legal" : "invalid"}
            title={violationDetails && !legal ? (reason ?? "Unknown") : undefined}
          >
            <span className="tick">{legal ? "✔" : "✘"}</span>
            {trFormat(slug ?? fmt)} {description ?? ""}
          </div>
        );
      })}
    </div>
  );
}

function deckStatusDetails(deck: DeckType, useTrustedInfo?: boolean): ParsedDeckStatus {
  if (useTrustedInfo) {
    return trustedDeckStatus(deck) as unknown as ParsedDeckStatus;
  }
  return calculateDeckStatus(deck) as unknown as ParsedDeckStatus;
}

function checkDeckStatus(deckStatus: ParsedDeckStatus): string | null {
  const fmt = deckStatus.format;
  if (fmt) {
    const entry = deckStatus[fmt] as StatusEntry | undefined;
    if (entry?.legal) {
      return fmt;
    }
  }
  // Check if any format is legal
  if (deckStatus.format) {
    return "invalid";
  }
  return null;
}

function formatDeckStatusSpan(
  deckStatus: ParsedDeckStatus,
  tooltip?: boolean,
  violationDetails?: boolean,
): React.ReactElement {
  const format = deckStatus.format || "standard";
  const status = checkDeckStatus(deckStatus);
  const isInvalid = status === "invalid";

  const formatName = slugToFormat[format] || "Standard";
  const message = (
    <>
      {trFormat(formatName)}{" "}
      {isInvalid
        ? trSpan(["deck-builder_illegal"])
        : trSpan(["deck-builder_legal"])}
    </>
  );

  return (
    <>
      <span className={`deck-status shift-tooltip ${status || ""}`}>
        {message}
        {tooltip && buildDeckStatusLabel(deckStatus, violationDetails)}
      </span>
      {(() => {
        const formatEntry = deckStatus[format as keyof ParsedDeckStatus] as StatusEntry | undefined;
        const reason = formatEntry?.reason;
        if (reason && tooltip && isInvalid) {
          return (
            <span className="deck-status shift-tooltip invalid-explanation">
              {trSpan(["deck-builder_why"])}
              <span className="status-tooltip blue-shade">
                <span className="invalid">{reason}</span>
              </span>
            </span>
          );
        }
        return null;
      })()}
    </>
  );
}

function deckStatusSpanImpl(
  deck: DeckType,
  tooltip?: boolean,
  violationDetails?: boolean,
  useTrustedInfo?: boolean,
): React.ReactElement {
  return formatDeckStatusSpan(
    deckStatusDetails(deck, useTrustedInfo),
    tooltip,
    violationDetails,
  );
}

const deckStatusSpanMemoize = memoize(deckStatusSpanImpl);

// ──────────────────────────────────────────────────────────────────
// Public exports
// ──────────────────────────────────────────────────────────────────

export function DeckStatusSpan({
  deck,
  tooltip = false,
  violationDetails = false,
  useTrustedInfo = true,
}: {
  deck: DeckType;
  tooltip?: boolean;
  violationDetails?: boolean;
  useTrustedInfo?: boolean;
}): React.ReactElement {
  return deckStatusSpanMemoize(deck, tooltip, violationDetails, useTrustedInfo);
}

export function DeckFormatStatusSpan({
  deck,
  fmt,
  useTrustedInfo = false,
}: {
  deck: DeckType;
  fmt: string;
  useTrustedInfo?: boolean;
}): React.ReactElement {
  const deckWithFormat = { ...deck, format: fmt };
  const status = deckStatusDetails(deckWithFormat, useTrustedInfo);
  return formatDeckStatusSpan({ ...status, format: fmt }, false, false);
}
