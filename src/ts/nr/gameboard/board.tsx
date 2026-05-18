// Gameboard: main game view with corp/runner boards, hand, log, prompts.
// Mirrors: src/cljs/nr/gameboard/board.cljs
import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  type ReactElement,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { create } from "zustand";

import {
  useGameBoard,
  notSpectator,
  type CardState,
  type PlayerState,
  type GameStateData,
  type PromptState,
} from "./state";
import { useAppState, currentGameID } from "../appstate";
import { wsSend } from "../ws";
import { sendCommand } from "./actions";
import {
  putGameCardInChannel,
  zoomChannelPut,
  setZoomChannelCallback,
  cardPreviewMouseOver,
  cardPreviewMouseOut,
  cardHighlightMouseOver,
  cardHighlightMouseOut,
} from "./card_preview";
import { PlayerStats } from "./player_stats";
import makeContentPane from "./right_pane";
import EndOfGameStats from "../end_of_game_stats";
import {
  tr,
  trSpan,
  trElement,
  trSide,
  trGamePrompt,
  trData,
} from "../translations";
import {
  bannedSpan,
  condButton,
  checkboxButton,
  getImagePath,
  imageOrFace,
  renderIcons,
  renderMessage,
  mapLongest,
} from "../utils";
import {
  addCostToLabel,
  isTagged,
  selectNonNilKeys,
  strToInt,
  otherSide,
  type Ability as JinAbility,
} from "../../jinteki/utils";
import { AllCards } from "../../jinteki/cards";
import { CardBacks } from "../../jinteki/card_backs";

// ──────────────────────────────────────────────────────────────────
// Local module state (mirrors CLJS atoms outside React)
// ──────────────────────────────────────────────────────────────────

interface CardMenuStore {
  source: string | null;
  ghost: boolean | null;
  keepMenuOpen: string | null;
  open: (source: string, ghost?: boolean | null) => void;
  close: () => void;
  setKeepMenuOpen: (k: string | null) => void;
}

const useCardMenu = create<CardMenuStore>((set) => ({
  source: null,
  ghost: null,
  keepMenuOpen: null,
  open: (source, ghost = null) => set({ source, ghost }),
  close: () => set({ source: null, ghost: null, keepMenuOpen: null }),
  setKeepMenuOpen: (k) => set({ keepMenuOpen: k }),
}));

interface IconHoverStore {
  hovered: string | null;
  set: (v: string | null) => void;
}
const useIconHovered = create<IconHoverStore>((set) => ({
  hovered: null,
  set: (v) => set({ hovered: v }),
}));

// Mirrors button-channel — a callback queue for button card highlighting.
let buttonCallback: ((v: unknown) => void) | null = null;
export function setButtonChannelCallback(cb: (v: unknown) => void): void {
  buttonCallback = cb;
}
function buttonChannelPut(v: unknown): void {
  buttonCallback?.(v);
}

// Mirrors board-dom — used for popup DOM refs.
const boardDom: Record<string, HTMLElement | null> = {};

// ──────────────────────────────────────────────────────────────────
// Utility helpers
// ──────────────────────────────────────────────────────────────────

type CardLike = CardState & Record<string, unknown>;

function lowerCase(s: string | undefined): string {
  return (s ?? "").toLowerCase();
}

function getCounters(card: CardLike | null | undefined, counter: string): number {
  if (!card) return 0;
  const counters = card.counter as Record<string, number> | undefined;
  return counters?.[counter] ?? 0;
}

function getTitle(card: CardLike | null | undefined): string | undefined {
  return card?.title as string | undefined;
}

function rezzed(card: CardLike | null | undefined): boolean {
  return !!card?.rezzed;
}

function faceup(card: CardLike | null | undefined): boolean {
  if (!card) return false;
  if (card.facedown === true) return false;
  if (card.rezzed === false) return false;
  return true;
}

function facedown(card: CardLike | null | undefined): boolean {
  if (!card) return false;
  return card.facedown === true;
}

function isCorp(card: CardLike | null | undefined): boolean {
  return (card?.side as string)?.toLowerCase() === "corp";
}

function isRunner(card: CardLike | null | undefined): boolean {
  return (card?.side as string)?.toLowerCase() === "runner";
}

function isType(card: CardLike | null | undefined, type: string): boolean {
  return (card?.type as string) === type;
}

function isIce(card: CardLike | null | undefined): boolean {
  return isType(card, "ICE");
}

function isAsset(card: CardLike | null | undefined): boolean {
  return isType(card, "Asset");
}

function isOperation(card: CardLike | null | undefined): boolean {
  return isType(card, "Operation");
}

function isProgram(card: CardLike | null | undefined): boolean {
  return isType(card, "Program") && !facedown(card);
}

function conditionCounter(card: CardLike | null | undefined): boolean {
  return isType(card, "Condition Counter");
}

function hasSubtype(card: CardLike | null | undefined, subtype: string): boolean {
  const subtypes = (card?.subtypes as string[] | undefined) ?? [];
  return subtypes.some((s) => s.toLowerCase() === subtype.toLowerCase());
}

function active(card: CardLike | null | undefined): boolean {
  if (!card) return false;
  // Simplified: rezzed/installed-faceup or in scored/play-area
  const zone = (card.zone as string[] | undefined) ?? [];
  const z0 = zone[0];
  if (rezzed(card)) return true;
  if (isType(card, "Identity") && !facedown(card)) return true;
  if (z0 === "current") return true;
  if (z0 === "scored") return faceup(card);
  if (z0 === "play-area") return true;
  if (conditionCounter(card)) return true;
  if (isRunner(card) && z0 === "rig" && !facedown(card)) return true;
  return false;
}

function sameCard(c1: CardLike | null | undefined, c2: CardLike | null | undefined): boolean {
  if (!c1 || !c2) return false;
  return c1.cid !== undefined && c1.cid === c2.cid;
}

// ──────────────────────────────────────────────────────────────────
// State accessors
// ──────────────────────────────────────────────────────────────────

function gameState(): GameStateData | null {
  return useGameBoard.getState().gameState;
}

function appState(): ReturnType<typeof useAppState.getState> {
  return useAppState.getState();
}

function isReplay(): boolean {
  return appState().currentGame?.gameid === "local-replay";
}

function promptEid(side: string): unknown {
  const gs = gameState();
  const ps = gs?.[side as keyof GameStateData] as PlayerState | undefined;
  return ps?.["prompt-state"]?.["eid" as keyof PromptState] as unknown;
}

function anyPromptOpen(side: string): boolean {
  const gs = gameState();
  const ps = gs?.[side as keyof GameStateData] as PlayerState | undefined;
  return !!ps?.["prompt-state"];
}

function spectatorViewHidden(): boolean {
  const gs = gameState();
  const options = gs?.["options" as keyof GameStateData] as
    | { spectatorhands?: boolean }
    | undefined;
  return !!options?.spectatorhands && !notSpectator(gs);
}

function spectateSide(): "corp" | "runner" | null {
  const cg = appState().currentGame as Record<string, unknown> | null;
  if (!cg) return null;
  const corpSpecs = cg["corp-spectators"] as Array<{ user?: { username?: string } }> | undefined;
  const runnerSpecs = cg["runner-spectators"] as Array<{ user?: { username?: string } }> | undefined;
  const me = appState().user as { username?: string } | null;
  if (corpSpecs?.some((s) => s.user?.username === me?.username)) return "corp";
  if (runnerSpecs?.some((s) => s.user?.username === me?.username)) return "runner";
  return null;
}

// ──────────────────────────────────────────────────────────────────
// Image URL resolution (mirrors image-url)
// ──────────────────────────────────────────────────────────────────

interface ImageOpts { zoom?: boolean }

function imageUrl(card: CardLike, opts?: ImageOpts): string | null {
  const gs = gameState();
  const lang = (appState().options["card-language"] as string | undefined) ?? "en";
  const res = (appState().options["card-resolution"] as string | undefined) ?? "default";
  const sideKey = lowerCase(card.side as string) as "corp" | "runner";
  const sidePlayer = gs?.[sideKey] as PlayerState | undefined;
  const sideUser = sidePlayer?.user as
    | { special?: unknown; options?: Record<string, unknown> }
    | undefined;
  const specialUser = !!sideUser?.special;
  const userOpts = sideUser?.options ?? {};
  const specialWantsArt = !!userOpts["show-alt-art"];
  const viewerWantsArt =
    !!appState().options["show-alt-art"] &&
    !(opts?.zoom && appState().options["pin-base-art"]);
  const showArt = specialUser && specialWantsArt && viewerWantsArt;
  const altArts = userOpts["alt-arts"] as Record<string, unknown> | undefined;
  const art = showArt && card.code
    ? (altArts?.[card.code as string] ?? "stock")
    : "stock";

  const fullCard =
    card.face !== undefined || card.images !== undefined
      ? card
      : ((AllCards as Record<string, CardLike>)[card.title as string] ?? card);
  const images = imageOrFace(fullCard as Record<string, unknown>);

  if (Array.isArray(art)) {
    const artUrls = getImagePath(
      images as Record<string, unknown>,
      lang,
      res,
      art[0] as string,
    ) as string[] | string | null;
    if (Array.isArray(artUrls) && artUrls.length > 0) {
      const safeIdx = Math.min(art[1] as number, artUrls.length - 1);
      return artUrls[safeIdx] ?? null;
    }
    return null;
  }
  const path = getImagePath(
    images as Record<string, unknown>,
    lang,
    res,
    art as string,
  );
  if (Array.isArray(path)) return path[0] ?? null;
  return (path as string | null) ?? null;
}

// ──────────────────────────────────────────────────────────────────
// Card menu helpers
// ──────────────────────────────────────────────────────────────────

const clickCardKeys = ["cid", "side", "host", "type", "zone", "ghost", "flashback-fake-in-hand"];

function cardForClick(card: CardLike): Record<string, unknown> {
  const c = card.host
    ? { ...card, host: cardForClick(card.host as CardLike) }
    : card;
  return selectNonNilKeys(c as Record<string, unknown>, clickCardKeys);
}

function playable(action: unknown): boolean {
  return !!(action as { playable?: boolean } | null | undefined)?.playable;
}

// ──────────────────────────────────────────────────────────────────
// Action list — possible actions on a card
// ──────────────────────────────────────────────────────────────────

function actionList(card: CardLike): string[] {
  const actions: string[] = [];
  const zone = (card.zone as string[] | undefined) ?? [];
  const z0 = zone[0];
  const type = card.type as string | undefined;
  const advanceable = card.advanceable as string | undefined;
  const rzd = !!card.rezzed;
  const gs = gameState();
  const activePlayer = gs?.["active-player"] as string | undefined;
  const side = gs?.side as string | undefined;

  if (
    (type === "Agenda" && (z0 === "servers" || z0 === "onhost")) ||
    advanceable === "always" ||
    (rzd && advanceable === "while-rezzed") ||
    (!rzd && advanceable === "while-unrezzed")
  ) {
    actions.unshift("advance");
  }
  const required = (card["current-advancement-requirement"] ?? card.advancementcost) as
    | number
    | undefined;
  if (
    type === "Agenda" &&
    (z0 === "servers" || z0 === "onhost") &&
    activePlayer === side &&
    getCounters(card, "advancement") >= (required ?? 0)
  ) {
    actions.unshift("score");
  }
  if (type === "ICE" || type === "Program") actions.unshift("trash");
  if ((type === "Asset" || type === "ICE" || type === "Upgrade") && !rzd) {
    actions.unshift("rez");
  }
  if ((type === "Asset" || type === "ICE" || type === "Upgrade") && rzd) {
    actions.unshift("derez");
  }
  return actions;
}

function graveyardHighlightCard(card: CardLike): boolean {
  const zone = (card.zone as string[] | undefined) ?? [];
  return zone[0] === "discard" && (
    card.type === "Agenda" ||
    !!card.poison ||
    !!card["highlight-in-discard"]
  );
}

function promptButtonFromCard(
  clicked: CardLike,
  promptState: PromptState | undefined,
): string | null {
  if (!promptState) return null;
  const choices = promptState.choices as unknown;
  if (choices === "credit" || promptState["prompt-type" as keyof PromptState] === "trace") return null;
  if (Array.isArray(choices)) {
    for (const c of choices) {
      if (typeof c === "object" && c !== null) {
        const v = (c as { value?: { cid?: string }; uuid?: string }).value;
        if (v?.cid === clicked.cid) return (c as { uuid?: string }).uuid ?? null;
      }
    }
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────
// Click handlers
// ──────────────────────────────────────────────────────────────────

function sendPlayCommand(card: CardLike, shiftKeyHeld: boolean): void {
  const zone = (card.zone as string[] | undefined) ?? [];
  if (zone[0] === "discard" && card["flashback-fake-in-hand"]) {
    sendCommand("flashback", { card: cardForClick(card), "shift-key-held": shiftKeyHeld });
  } else {
    sendCommand("play", { card: cardForClick(card), "shift-key-held": shiftKeyHeld });
  }
}

function handleAbilities(side: string, card: CardLike): void {
  const actions = actionList(card);
  const abilities = (card.abilities as JinAbility[] | undefined) ?? [];
  const corpAbilities = (card["corp-abilities"] as JinAbility[] | undefined) ?? [];
  const runnerAbilities = (card["runner-abilities"] as JinAbility[] | undefined) ?? [];
  const subroutines = (card.subroutines as unknown[] | undefined) ?? [];
  const cardSide = lowerCase(card.side as string);
  const isFacedown = !!card.facedown;
  const totalCount = actions.length + abilities.length;

  useCardMenu.getState().setKeepMenuOpen(null);
  if (cardSide === "runner" && isFacedown) return;

  const hasMultiple =
    totalCount > 1 ||
    corpAbilities.length + runnerAbilities.length + subroutines.length > 0 ||
    actions.some((a) => ["rez", "derez", "advance", "trash"].includes(a)) ||
    (isCorp(card) && !faceup(card));

  if (hasMultiple) {
    const menu = useCardMenu.getState();
    const isSameSource = card.cid === menu.source && card.ghost === menu.ghost;
    if (side === cardSide) {
      if (isSameSource) menu.close();
      else menu.open(card.cid as string, !!card.ghost);
    }
    if (cardSide === "runner" && side === "corp" && corpAbilities.length > 0) {
      if (card.cid === menu.source) menu.close();
      else menu.open(card.cid as string, !!card.ghost);
    }
    if (cardSide === "corp" && side === "runner" && (subroutines.length > 0 || runnerAbilities.length > 0)) {
      if (card.cid === menu.source) menu.close();
      else menu.open(card.cid as string, !!card.ghost);
    }
  } else if (totalCount === 1 && side === cardSide) {
    if (abilities.length === 1) {
      if (playable(abilities[0])) {
        sendCommand("ability", { card: cardForClick(card), ability: 0 });
      }
    } else {
      sendCommand(actions[0]!, { card: cardForClick(card) });
    }
  }
}

function handleCardClick(card: CardLike, shiftKeyHeld: boolean): void {
  const gs = gameState();
  if (!gs) return;
  if (!notSpectator(gs)) return;
  const side = gs.side as string;
  const ps = (gs[side as keyof GameStateData] as PlayerState | undefined)?.["prompt-state"];
  const promptType = ps?.["prompt-type" as keyof PromptState] as string | undefined;
  const selectable = (ps?.["selectable" as keyof PromptState] as string[] | undefined) ?? [];
  const zone = (card.zone as string[] | undefined) ?? [];
  const z0 = zone[0];
  const type = card.type as string | undefined;

  if (promptType === "select") {
    sendCommand("select", {
      card: cardForClick(card),
      eid: promptEid(side),
      "shift-key-held": shiftKeyHeld,
    });
    return;
  }
  if (card.cid && selectable.includes(card.cid as string)) {
    sendCommand("choice", {
      eid: promptEid(side),
      choice: { uuid: promptButtonFromCard(card, ps) },
    });
    return;
  }
  if (type === "Identity" && side === lowerCase(card.side as string)) {
    handleAbilities(side, card);
    return;
  }
  if (
    side === "runner" &&
    card.side === "Runner" &&
    !anyPromptOpen(side) &&
    ((z0 === "hand" && playable(card)) ||
      card["playable-as-if-in-hand"] ||
      (z0 === "discard" && card["flashback-playable"]))
  ) {
    sendPlayCommand(card, shiftKeyHeld);
    return;
  }
  if (
    side === "corp" &&
    card.side === "Corp" &&
    !anyPromptOpen(side) &&
    ((z0 === "hand" && playable(card)) ||
      (z0 === "discard" && type === "Operation" && card["flashback-fake-in-hand"] && card["flashback-playable"]))
  ) {
    if (type === "Operation") {
      sendPlayCommand(card, shiftKeyHeld);
    } else {
      const menu = useCardMenu.getState();
      if (card.cid === menu.source) {
        sendCommand("generate-install-list");
        menu.close();
      } else {
        sendCommand("generate-install-list", {
          card: cardForClick(card),
          "shift-key-held": shiftKeyHeld,
        });
        menu.open(card.cid as string);
      }
    }
    return;
  }
  if (["current", "onhost", "play-area", "scored", "servers", "rig"].includes(z0 ?? "")) {
    handleAbilities(side, card);
  }
}

// ──────────────────────────────────────────────────────────────────
// Drag & drop
// ──────────────────────────────────────────────────────────────────

function handleDragStart(e: ReactDragEvent<HTMLElement>, card: CardLike): void {
  (e.target as HTMLElement).classList.add("dragged");
  e.dataTransfer.setData("card", JSON.stringify(card));
}

function handleDrop(e: ReactDragEvent<HTMLElement>, server: string): void {
  (e.target as HTMLElement).classList.remove("dragover");
  const raw = e.dataTransfer.getData("card");
  if (!raw) return;
  const card = JSON.parse(raw) as CardLike;
  if (card.type !== "Identity") {
    sendCommand("move", { card, server });
  }
}

function dropAreaProps(server: string): React.HTMLAttributes<HTMLDivElement> {
  return {
    onDrop: (e) => handleDrop(e as unknown as ReactDragEvent<HTMLElement>, server),
    onDragEnter: (e) => (e.target as HTMLElement).classList.add("dragover"),
    onDragLeave: (e) => (e.target as HTMLElement).classList.remove("dragover"),
    onDragOver: (e) => e.preventDefault(),
    "data-server": server,
  } as React.HTMLAttributes<HTMLDivElement>;
}

// ──────────────────────────────────────────────────────────────────
// Server / zone helpers
// ──────────────────────────────────────────────────────────────────

function remoteToNum(server: string | unknown): number {
  const s = String(server);
  const parts = s.split(":remote");
  return strToInt(parts[parts.length - 1] ?? "0");
}

function remoteToStrName(server: string | unknown): string {
  const num = remoteToNum(server);
  return tr(["game_server", "Server"], { num: String(num) });
}

function remoteToName(server: string | unknown): ReactElement {
  const num = remoteToNum(server);
  return trSpan(["game_server", "Server"], { num: String(num) });
}

function zoneSortKey(zone: string | unknown): number {
  const z = String(Array.isArray(zone) ? zone[zone.length - 1] : zone);
  switch (z) {
    case "archives": return -3;
    case "rd": return -2;
    case "hq": return -1;
    default: {
      const parts = z.split(":remote");
      return strToInt(parts[parts.length - 1] ?? "0");
    }
  }
}

function getRemotes(servers: Record<string, unknown> | undefined): Array<[string, unknown]> {
  if (!servers) return [];
  return Object.entries(servers)
    .filter(([k]) => !["hq", "rd", "archives"].includes(k))
    .sort(([a], [b]) => zoneSortKey(a) - zoneSortKey(b));
}

// ──────────────────────────────────────────────────────────────────
// Facedown card image
// ──────────────────────────────────────────────────────────────────

function facedownCardUrl(side: string): string {
  const gs = gameState();
  const mySide = gs?.side as string | undefined;
  const sideKey = lowerCase(side) as "corp" | "runner";
  const displayOption = (appState().options["card-back-display"] as string | undefined) ?? "them";
  const sleeveKey = sideKey === "corp" ? "corp-card-sleeve" : "runner-card-sleeve";

  let cardBack: string;
  if (sideKey === mySide) {
    const mySideState = gs?.[mySide as "corp" | "runner"] as PlayerState | undefined;
    const opts = mySideState?.user?.["options" as keyof typeof mySideState.user] as
      | Record<string, unknown>
      | undefined;
    cardBack = (opts?.[sleeveKey] as string) ?? "nsg-card-back";
  } else {
    switch (displayOption) {
      case "them": {
        const ps = gs?.[sideKey] as PlayerState | undefined;
        const opts = ps?.user?.["options" as keyof typeof ps.user] as
          | Record<string, unknown>
          | undefined;
        cardBack = (opts?.[sleeveKey] as string) ?? "nsg-card-back";
        break;
      }
      case "me": {
        const ps = gs?.[mySide as "corp" | "runner"] as PlayerState | undefined;
        const opts = ps?.user?.["options" as keyof typeof ps.user] as
          | Record<string, unknown>
          | undefined;
        cardBack = (opts?.[sleeveKey] as string) ?? "nsg-card-back";
        break;
      }
      case "ffg":
        cardBack = "ffg-card-back";
        break;
      case "nsg":
      default:
        cardBack = "nsg-card-back";
    }
  }
  if (!cardBack) cardBack = "nsg-card-back";
  const file = CardBacks[cardBack]?.file ?? "nsg";
  return `/img/card-backs/${lowerCase(side)}/${file}.png`;
}

function FacedownCard({
  side,
  classList = [],
  altText,
}: {
  side: string;
  classList?: string[];
  altText?: string | null;
}): ReactElement {
  const cls = ["card", ...classList].join(" ");
  return (
    <img
      className={cls}
      src={facedownCardUrl(side)}
      alt={altText ?? `Facedown ${lowerCase(side)} card`}
    />
  );
}

// ──────────────────────────────────────────────────────────────────
// Sorting helpers
// ──────────────────────────────────────────────────────────────────

function sortArchives(cards: CardLike[]): CardLike[] {
  return [...cards]
    .sort((a, b) => (getTitle(a) ?? "").localeCompare(getTitle(b) ?? ""))
    .sort((a, b) => (faceup(a) === faceup(b) ? 0 : faceup(a) ? -1 : 1));
}

function sortHeap(cards: CardLike[]): CardLike[] {
  return [...cards].sort((a, b) => (getTitle(a) ?? "").localeCompare(getTitle(b) ?? ""));
}

function shouldSortArchives(): boolean {
  return !!appState().options["archives-sorted"];
}
function shouldSortHeap(): boolean {
  return !!appState().options["heap-sorted"];
}

// ──────────────────────────────────────────────────────────────────
// Card preview image (small face-up only)
// ──────────────────────────────────────────────────────────────────

function CardImg({ card }: { card: CardLike }): ReactElement | null {
  if (!card.code) return null;
  const url = imageUrl(card);
  const title = getTitle(card);
  return (
    <div className="card-frame">
      <div
        className="blue-shade card"
        onMouseEnter={() => putGameCardInChannel(card)}
        onMouseLeave={() => zoomChannelPut(false)}
      >
        {url && (
          <div>
            <span className="cardname">{title}</span>
            <img
              className="card bg"
              src={url}
              alt={title ?? ""}
              onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Card zoom view
// ──────────────────────────────────────────────────────────────────

function CardImplementation({ card }: { card: CardLike | null }): ReactElement | null {
  const logWidth = useAppState((s) => s.options["log-width"]);
  if (!card) return null;
  const implemented = card.implementation as string | undefined;
  if (implemented === "full") return null;
  return (
    <div
      className="panel blue-shade implementation"
      style={{ right: logWidth as number | string }}
    >
      {implemented ? (
        <span className="impl-msg">{implemented}</span>
      ) : (
        trElement("span", ["game_unimplemented", "Unimplemented"])
      )}
    </div>
  );
}

function CardZoomDisplay({
  card,
  imgSide,
  setImgSide,
  onClose,
}: {
  card: CardLike;
  imgSide: boolean;
  setImgSide: (v: boolean) => void;
  onClose: () => void;
}): ReactElement {
  const pin = useAppState((s) => s.options["pin-zoom"]) as boolean | undefined;
  const zoomType = (useAppState((s) => s.options["card-zoom"]) as string | undefined) ?? "image";
  const url = imageUrl(card, { zoom: true });
  const showImg = zoomType === "image";
  const showImage = url && (showImg ? imgSide : !imgSide);

  return (
    <>
      <div className="card-preview blue-shade" onClick={() => setImgSide(!imgSide)}>
        {showImage ? (
          <img src={url!} alt={getTitle(card) ?? ""} />
        ) : (
          // Text fallback (mirrors card-as-text usage)
          <div className="card-text">
            <span className="cardname">{getTitle(card)}</span>
            {card.text ? <p>{String(card.text)}</p> : null}
          </div>
        )}
      </div>
      {pin && (
        <button className="win-right" onClick={onClose} type="button">
          ✘
        </button>
      )}
    </>
  );
}

function CardZoomView(): ReactElement | null {
  const [zoomCard, setZoomCard] = useState<CardLike | null>(null);
  const [imgSide, setImgSide] = useState(true);

  useEffect(() => {
    // Subscribe to zoom channel (mirrors core.async go block consuming from zoom-channel)
    setZoomChannelCallback((v) => {
      if (v === false || v == null) {
        const pin = appState().options["pin-zoom"];
        if (!pin) setZoomCard(null);
      } else {
        setZoomCard(v as CardLike);
        setImgSide(true);
      }
    });
  }, []);

  if (!zoomCard) return null;
  return (
    <>
      <div className="card-zoom fade">
        <CardZoomDisplay
          card={zoomCard}
          imgSide={imgSide}
          setImgSide={setImgSide}
          onClose={() => setZoomCard(null)}
        />
      </div>
      <CardImplementation card={zoomCard} />
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
// Card menu items / submenus
// ──────────────────────────────────────────────────────────────────

function CardMenuItem({
  label,
  onAction,
  enabled = true,
}: {
  label: ReactNode;
  onAction: () => void;
  enabled?: boolean;
}): ReactElement {
  if (!enabled) return <li className="disabled">{label}</li>;
  return (
    <li
      tabIndex={0}
      onClick={onAction}
      onKeyDown={(e: ReactKeyboardEvent<HTMLLIElement>) => {
        if (e.key === "Enter") onAction();
      }}
      onKeyUp={(e: ReactKeyboardEvent<HTMLLIElement>) => {
        if (e.key === " ") onAction();
      }}
    >
      {label}
    </li>
  );
}

function ServerMenu({ card }: { card: CardLike }): ReactElement | null {
  const corp = useGameBoard((s) => s.gameState?.corp) as PlayerState | undefined;
  const installList = corp?.["install-list"] as Array<CardLike | string> | undefined;
  const menuSrc = useCardMenu((s) => s.source);
  const active = card.cid === menuSrc;
  if (!installList || !active) return null;

  return (
    <div className="panel blue-shade servers-menu active-menu" style={{ display: "inline" }}>
      <ul>
        {installList.map((label, i) => {
          const lbl =
            typeof label === "object" && label !== null
              ? ((label as CardLike).title as string)
              : trGamePrompt(label as string);
          return (
            <CardMenuItem
              key={i}
              label={lbl}
              onAction={() => {
                useCardMenu.getState().close();
                if (label === "Expend") {
                  sendCommand("expend", { card, server: label });
                } else {
                  sendCommand("play", { card, server: label });
                }
              }}
            />
          );
        })}
      </ul>
    </div>
  );
}

type AbilityKind = "runner" | "corp" | "ability";

function listAbilities(
  kind: AbilityKind,
  card: CardLike,
  abilities: JinAbility[] | undefined,
): ReactElement[] {
  return (abilities ?? []).map((ab, i) => {
    const command =
      kind === "runner"
        ? "runner-ability"
        : kind === "corp"
          ? "corp-ability"
          : (ab as { dynamic?: boolean }).dynamic
            ? "dynamic-ability"
            : "ability";
    const args: Record<string, unknown> = { card };
    if ((ab as { dynamic?: boolean }).dynamic) {
      const dyn = ab as { dynamic?: boolean; source?: unknown; index?: number };
      args.dynamic = dyn.dynamic;
      args.source = dyn.source;
      args.index = dyn.index;
    } else {
      args.ability = i;
    }
    const labelText = addCostToLabel(ab as JinAbility);
    return (
      <CardMenuItem
        key={i}
        label={<>{renderIcons(labelText) as ReactNode}</>}
        enabled={!!(ab as { playable?: boolean }).playable}
        onAction={() => {
          sendCommand(command, args);
          const keep = (ab as { "keep-menu-open"?: string })["keep-menu-open"];
          if (keep) useCardMenu.getState().setKeepMenuOpen(keep);
          else useCardMenu.getState().close();
        }}
      />
    );
  });
}

function checkKeepMenuOpen(
  card: CardLike,
  player: PlayerState | undefined,
  keepMenuOpen: string | null,
): boolean {
  if (!keepMenuOpen) return false;
  const credit = player?.credit ?? 0;
  const click = player?.click ?? 0;
  const hand = player?.hand ?? [];
  switch (keepMenuOpen) {
    case "while-credits-left": return credit > 0;
    case "while-clicks-left": return click > 0;
    case "while-2-clicks-left": return click >= 2;
    case "while-3-clicks-left": return click >= 3;
    case "while-4-clicks-left": return click >= 4;
    case "while-cards-in-hand": return hand.length > 0;
    case "while-power-tokens-left": return getCounters(card, "power") > 0;
    case "while-2-power-tokens-left": return getCounters(card, "power") >= 2;
    case "while-3-power-tokens-left": return getCounters(card, "power") >= 3;
    case "while-5-power-tokens-left": return getCounters(card, "power") >= 5;
    case "while-advancement-tokens-left": return getCounters(card, "advancement") > 0;
    case "while-agenda-tokens-left": return getCounters(card, "agenda") > 0;
    case "while-virus-tokens-left": return getCounters(card, "virus") > 0;
    case "while-2-virus-tokens-left": return getCounters(card, "virus") >= 2;
    case "if-abilities-available": {
      const ca = (card["corp-abilities"] as JinAbility[] | undefined) ?? [];
      const ra = (card["runner-abilities"] as JinAbility[] | undefined) ?? [];
      const ab = (card.abilities as JinAbility[] | undefined) ?? [];
      const filtered = ab.filter((a) => {
        const lbl = ((a as { label?: string }).label ?? "");
        return !lbl.startsWith("Toggle auto-resolve on") && !lbl.endsWith("(start of turn)");
      });
      return ca.length + ra.length + filtered.length > 0;
    }
    case "for-agendas": {
      const actions = actionList(card);
      return actions.includes("score") || click > 0;
    }
    case "forever": return true;
    default: return false;
  }
}

interface SubroutineLike {
  label: string;
  broken?: boolean;
  fired?: boolean;
  resolve?: boolean;
}

function renderSub(sub: SubroutineLike, idx: number, asLi: boolean, onClick?: () => void): ReactElement {
  const className = sub.broken ? "disabled" : sub.resolve === false ? "dont-resolve" : "";
  const style: React.CSSProperties =
    sub.broken
      ? { fontStyle: "italic" }
      : sub.resolve === false
        ? { textDecoration: "line-through" }
        : {};
  const content = (
    <>
      <span className={className} style={style}>
        {renderIcons(` [Subroutine] ${sub.label}`) as ReactNode}
      </span>
      <span className="float-right">
        {sub.broken ? bannedSpan() : sub.fired ? "✅" : null}
      </span>
    </>
  );
  if (asLi) {
    return (
      <li
        key={idx}
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => e.key === "Enter" && onClick?.()}
        onKeyUp={(e) => e.key === " " && onClick?.()}
      >
        {content}
      </li>
    );
  }
  return (
    <div
      key={idx}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
      onKeyUp={(e) => e.key === " " && onClick?.()}
      style={{ display: "block" }}
    >
      {content}
    </div>
  );
}

function RunnerAbs({
  card,
  runnerAbilities,
  subroutines,
  title,
}: {
  card: CardLike;
  runnerAbilities: JinAbility[];
  subroutines: SubroutineLike[];
  title: string;
}): ReactElement | null {
  const menuSrc = useCardMenu((s) => s.source);
  if (card.cid !== menuSrc) return null;
  return (
    <div className="panel blue-shade runner-abilities active-menu" style={{ display: "inline" }}>
      <button className="win-right" onClick={() => useCardMenu.getState().close()} type="button">
        ✘
      </button>
      {(runnerAbilities.length > 0 || subroutines.length > 0) && (
        <span className="float-center">{trSpan(["game_abilities", "Abilities"])}:</span>
      )}
      <ul>
        {listAbilities("runner", card, runnerAbilities)}
        {subroutines.length > 0 && (
          <CardMenuItem
            label={trSpan(["game_let-subs-fire", "Let unbroken subroutines fire"])}
            onAction={() => {
              sendCommand("system-msg", {
                msg: `indicates to fire all unbroken subroutines on ${title}`,
              });
              useCardMenu.getState().close();
            }}
          />
        )}
      </ul>
      {subroutines.length > 0 && (
        <span className="float-center">{trSpan(["game_subs", "Subroutines"])}:</span>
      )}
      {subroutines.map((s, i) => renderSub(s, i, false))}
    </div>
  );
}

function CorpAbs({
  card,
  corpAbilities,
}: {
  card: CardLike;
  corpAbilities: JinAbility[];
}): ReactElement | null {
  const menuSrc = useCardMenu((s) => s.source);
  if (card.cid !== menuSrc) return null;
  return (
    <div className="panel blue-shade corp-abilities active-menu" style={{ display: "inline" }}>
      <button className="win-right" onClick={() => useCardMenu.getState().close()} type="button">
        ✘
      </button>
      {corpAbilities.length > 0 && (
        <span className="float-center">{trSpan(["game_abilities", "Abilities"])}:</span>
      )}
      <ul>{listAbilities("corp", card, corpAbilities)}</ul>
    </div>
  );
}

function EncounterInfoDiv({ ice }: { ice: CardLike }): ReactElement {
  const orderRank = (t: string): number => {
    if (t === "Mythic") return 1;
    if (["Barrier", "Code Gate", "Sentry"].includes(t)) return 2;
    if (["Bioroid", "Trap"].includes(t)) return 3;
    return 4;
  };
  const subtypes = [...((ice.subtypes as string[] | undefined) ?? [])].sort(
    (a, b) => orderRank(a) - orderRank(b),
  );
  const currentStrength = (ice["current-strength"] ?? ice.strength ?? 0) as number;
  const subroutines = (ice.subroutines as SubroutineLike[] | undefined) ?? [];

  return (
    <div className="panel blue-shade encounter-info" style={{ display: "inline" }}>
      <span className="active float-center">{getTitle(ice)}</span>
      <span className="info" style={{ display: "block" }}>{subtypes.join(" - ")}</span>
      {trElement("span", ["card-browser_strength", "Strength"], { strength: String(currentStrength) })}
      <hr />
      {subroutines.length > 0 && (
        <span className="float-center">{trSpan(["game_subs", "Subroutines"])}:</span>
      )}
      {subroutines.map((sub, i) => {
        const fireSub = () => {
          if (gameState()?.side === "corp") {
            sendCommand("subroutine", { card: ice, subroutine: i });
            useCardMenu.getState().close();
          }
        };
        return renderSub(sub, i, false, fireSub);
      })}
    </div>
  );
}

function CardAbilities({
  card,
  abilities,
  subroutines,
}: {
  card: CardLike;
  abilities: JinAbility[];
  subroutines: SubroutineLike[];
}): ReactElement | null {
  const menu = useCardMenu();
  const gs = useGameBoard((s) => s.gameState);
  const side = gs?.side as string | undefined;
  const player = side ? (gs?.[side as keyof GameStateData] as PlayerState | undefined) : undefined;

  if (card.cid !== menu.source) return null;
  if (card.ghost !== menu.ghost) return null;
  if (menu.keepMenuOpen != null && !checkKeepMenuOpen(card, player, menu.keepMenuOpen)) return null;

  const actions = actionList(card);
  const hasContent =
    actions.length + abilities.length + subroutines.length > 0 ||
    actions.some((a) => ["derez", "rez", "advance", "trash"].includes(a)) ||
    card.type === "ICE";
  if (!hasContent) return null;

  const unbrokenSubs = subroutines.filter((s) => !s.broken && !s.fired);

  return (
    <div className="panel blue-shade abilities active-menu" style={{ display: "inline" }}>
      <button className="win-right" onClick={() => menu.close()} type="button">✘</button>
      {actions.length > 0 && (
        <>
          <span className="float-center">{trSpan(["game_actions", "Actions"])}:</span>
          <ul>
            {actions.map((action) => {
              const keep =
                action === "rez" ? "if-abilities-available"
                : action === "advance" ? "for-agendas"
                : null;
              return (
                <CardMenuItem
                  key={action}
                  label={trGamePrompt(action)}
                  onAction={() => {
                    sendCommand(action, { card });
                    if (keep) menu.setKeepMenuOpen(keep);
                    else menu.close();
                  }}
                />
              );
            })}
          </ul>
        </>
      )}
      {(abilities.length > 0 || (active(card) && unbrokenSubs.length > 0)) && (
        <span className="float-center">{trSpan(["game_abilities", "Abilities"])}:</span>
      )}
      <ul>
        {abilities.length > 0 && listAbilities("ability", card, abilities)}
        {active(card) && unbrokenSubs.length > 0 && (
          <CardMenuItem
            label={trSpan(["game_fire-unbroken", "Fire unbroken subroutines"])}
            onAction={() => {
              sendCommand("unbroken-subroutines", { card });
              menu.close();
            }}
          />
        )}
      </ul>
      {subroutines.length > 0 && (
        <>
          <span className="float-center">{trSpan(["game_subs", "Subroutines"])}:</span>
          <ul>
            {subroutines.map((sub, i) =>
              renderSub(sub, i, true, () => {
                sendCommand("subroutine", { card, subroutine: i });
                menu.close();
              }),
            )}
          </ul>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Card view
// ──────────────────────────────────────────────────────────────────

function drawFacedown(card: CardLike): boolean {
  if (facedown(card)) return true;
  if (isCorp(card)) {
    const host = card.host as CardLike | undefined;
    return !(isOperation(card) || conditionCounter(card) || faceup(card) || host?.side === "Runner");
  }
  return false;
}

function CardView({
  card,
  flipped = false,
  disableClick = false,
}: {
  card: CardLike;
  flipped?: boolean;
  disableClick?: boolean;
}): ReactElement {
  const title = getTitle(card) ?? "";
  const gs = useGameBoard((s) => s.gameState);
  const iconHovered = useIconHovered((s) => s.hovered);
  const side = card.side as string | undefined;
  const sideKey = lowerCase(side ?? "");
  const ps = sideKey
    ? (gs?.[sideKey as keyof GameStateData] as PlayerState | undefined)?.["prompt-state"]
    : undefined;
  const selectable = new Set(
    ((ps as { selectable?: string[] } | undefined)?.selectable ?? []) as string[],
  );
  const gsSide = gs?.side as string | undefined;
  const stackedCards = appState().options["stacked-cards"] as boolean | undefined;

  const isFacedownShown = !card.code || flipped || facedown(card);
  const url = !isFacedownShown ? imageUrl(card) : null;

  const cssClass = [
    card.cid === iconHovered ? "icon-hovered" : "",
    card.selected ? "selected" : "",
    card.cid && selectable.has(card.cid as string) ? "selectable" : "",
    !anyPromptOpen(sideKey) && playable(card) ? "playable" : "",
    card.ghost ? "ghost" : "",
    card["flashback-fake-in-hand"] && card["flashback-playable"] && card.seen
      ? "playable flashback known"
      : "",
    card["flashback-fake-in-hand"] && card["flashback-playable"] && !card.seen
      ? "playable flashback unknown"
      : "",
    card["flashback-fake-in-hand"] && !card["flashback-playable"] ? "flashback" : "",
    graveyardHighlightCard(card) ? "graveyard-highlight" : "",
    card.new && selectable.size === 0 ? "new" : "",
  ].filter(Boolean).join(" ");

  const tabIndex = !disableClick && (active(card) || playable(card)) ? 0 : undefined;
  const isDraggable = notSpectator(gs) && !disableClick && !card["flashback-fake-in-hand"];

  const counter = card.counter as Record<string, number> | undefined;
  const counters = counter
    ? Object.entries(counter).filter(([, n]) => n > 0).sort()
    : [];
  const advanceCount = getCounters(card, "advancement");
  const subtypeTarget = card["subtype-target"] as string | undefined;
  const cardTarget = card["card-target"] as string | undefined;
  const icon = card.icon as Array<[string, string, string]> | undefined;
  const hosted = (card.hosted as CardLike[] | undefined) ?? [];

  const fullCard = (AllCards as Record<string, CardLike>)[card.title as string];
  const displayName = (trData("title", fullCard ?? card) as string) ?? title;

  return (
    <div className="card-frame menu-container">
      <div
        className={`blue-shade card ${cssClass}`}
        tabIndex={tabIndex}
        draggable={isDraggable}
        onDragStart={isDraggable ? (e) => handleDragStart(e, card) : undefined}
        onDragEnd={(e) => (e.target as HTMLElement).classList.remove("dragged")}
        onMouseEnter={() => {
          if (!isFacedownShown || spectatorViewHidden() || gsSide === sideKey) {
            putGameCardInChannel(card);
          }
        }}
        onMouseLeave={() => zoomChannelPut(false)}
        onClick={(e) => {
          if (!disableClick) handleCardClick(card, (e as ReactMouseEvent).shiftKey);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !disableClick) handleCardClick(card, e.shiftKey);
        }}
        onKeyUp={(e) => {
          if (e.key === " " && !disableClick) handleCardClick(card, e.shiftKey);
        }}
      >
        {isFacedownShown ? (
          <FacedownCard
            side={side ?? "corp"}
            classList={["bg"]}
            altText={
              !isFacedownShown || spectatorViewHidden() || gsSide === sideKey
                ? `Facedown ${title}`
                : null
            }
          />
        ) : url ? (
          <div>
            <img
              className="card bg"
              src={url}
              alt={title}
              onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
            />
          </div>
        ) : null}
        <span className="cardname">{displayName}</span>
        <div className="counters">
          {counters.map(([t, n]) => (
            <div key={t} className={`darkbg ${t.toLowerCase()}-counter counter`}>
              {n}
            </div>
          ))}
          {advanceCount > 0 && (
            <div key="adv" className="darkbg advance-counter counter">{advanceCount}</div>
          )}
        </div>
        {(card["current-strength"] != null || card.strength != null) &&
          (isIce(card) || hasSubtype(card, "Icebreaker")) &&
          active(card) && (
            <div className="darkbg strength">
              {(card["current-strength"] ?? card.strength) as number}
            </div>
          )}
        {icon && icon.length > 0 && (
          <div className="icon-bar">
            {icon.map(([ch, sourceCid, color]) => (
              <div
                key={sourceCid}
                className={`darkbg icon ${color}`}
                onMouseEnter={() => useIconHovered.getState().set(sourceCid)}
                onMouseLeave={() => useIconHovered.getState().set(null)}
              >
                {ch}
              </div>
            ))}
          </div>
        )}
        {cardTarget && <div className="darkbg card-target">{cardTarget}</div>}
        {subtypeTarget && <div className="darkbg subtype-target">{subtypeTarget}</div>}
        {active(card) && (() => {
          const serverCard = (AllCards as Record<string, CardLike>)[title];
          const baseSubtypes = new Set(((serverCard?.subtypes as string[] | undefined) ?? []));
          const cardSubtypes = (card.subtypes as string[] | undefined) ?? [];
          const extras = cardSubtypes.filter((s) => !baseSubtypes.has(s));
          return <div className="darkbg additional-subtypes">{extras.join(" - ")}</div>;
        })()}
      </div>

      {(() => {
        const zone = (card.zone as string[] | undefined) ?? [];
        if (zone[0] === "hand" && ["Agenda", "Asset", "ICE", "Upgrade"].includes(card.type as string)) {
          return <ServerMenu card={card} />;
        }
        const runnerAbs = (card["runner-abilities"] as JinAbility[] | undefined) ?? [];
        const corpAbs = (card["corp-abilities"] as JinAbility[] | undefined) ?? [];
        const subroutines = (card.subroutines as SubroutineLike[] | undefined) ?? [];
        if (gsSide === "runner" && runnerAbs.length + subroutines.length > 0) {
          return <RunnerAbs card={card} runnerAbilities={runnerAbs} subroutines={subroutines} title={title} />;
        }
        if (gsSide === "corp" && corpAbs.length > 0) {
          return <CorpAbs card={card} corpAbilities={corpAbs} />;
        }
        if (lowerCase(side ?? "") === gsSide) {
          const ab = (card.abilities as JinAbility[] | undefined) ?? [];
          return <CardAbilities card={card} abilities={ab} subroutines={subroutines} />;
        }
        return null;
      })()}

      {hosted.length > 0 && (
        <div className="hosted">
          {(!isIce(card) && (card.zone as string[] | undefined)?.[(card.zone as string[]).length - 1] !== "ices" && stackedCards) ? (
            <ShowDistinctCards distinctCards={groupByTitle(hosted)} />
          ) : (
            hosted.map((h) => {
              const flipped2 = drawFacedown(h);
              return <CardView key={h.cid as string} card={h} flipped={flipped2} />;
            })
          )}
        </div>
      )}
    </div>
  );
}

function groupByTitle(cards: CardLike[]): CardLike[][] {
  const groups = new Map<string, CardLike[]>();
  for (const c of cards) {
    const k = (c.title as string) ?? "";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(c);
  }
  return Array.from(groups.values());
}

function ShowDistinctCards({ distinctCards }: { distinctCards: CardLike[][] }): ReactElement {
  return (
    <>
      {distinctCards.flatMap((cards) => {
        const hosting = cards.filter((c) => ((c.hosted as CardLike[] | undefined) ?? []).length > 0);
        const others = cards.filter((c) => ((c.hosted as CardLike[] | undefined) ?? []).length === 0);
        const facedowns = others.filter(drawFacedown);
        const visible = others.filter((c) => !drawFacedown(c));
        return [
          ...hosting.map((c) => (
            <div key={c.cid as string} className={`card-wrapper${playable(c) ? " playable" : ""}`}>
              <CardView card={c} flipped={drawFacedown(c)} />
            </div>
          )),
          ...facedowns.map((c) => (
            <div key={c.cid as string} className={`card-wrapper${playable(c) ? " playable" : ""}`}>
              <CardView card={c} flipped={true} />
            </div>
          )),
          visible.length === 0 ? null : visible.length === 1 ? (
            <div key={visible[0]!.cid as string} className={`card-wrapper${playable(visible[0]!) ? " playable" : ""}`}>
              <CardView card={visible[0]!} flipped={drawFacedown(visible[0]!)} />
            </div>
          ) : (
            <StackedCardView key={visible[0]!.cid as string} cards={visible} />
          ),
        ];
      })}
    </>
  );
}

function StackedCardView({ cards }: { cards: CardLike[] }): ReactElement {
  return (
    <div className="stacked">
      {cards.map((c) => {
        const flipped = drawFacedown(c);
        return (
          <div key={c.cid as string} className={`card-wrapper${playable(c) ? " playable" : ""}`}>
            <CardView card={c} flipped={flipped} />
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Generic label component
// ──────────────────────────────────────────────────────────────────

interface LabelOpts {
  fn?: (cursor: unknown) => string | number;
  classes?: string;
  trVec?: [string, string] | string[];
  trParams?: Record<string, string>;
  name?: ReactNode | string;
  hideCursor?: boolean;
}

function Label({ cursor, opts }: { cursor: unknown[] | unknown; opts: LabelOpts }): ReactElement {
  const cursorArr = Array.isArray(cursor) ? cursor : [cursor];
  const fn = opts.fn ?? ((c: unknown) => (c as unknown[]).length);
  const classes = `${cursorArr.length > 0 ? "darkbg " : ""}${opts.classes ?? ""}`;
  return (
    <div className={`header ${classes}`}>
      {opts.trVec ? trSpan(opts.trVec as [string, string], opts.trParams) : opts.name}
      {!opts.hideCursor && ` (${fn(cursorArr)})`}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Hand views
// ──────────────────────────────────────────────────────────────────

function thisUser(user: { _id?: string } | undefined): boolean {
  const gs = gameState();
  if (gs?.replay) {
    const rs = useGameBoard.getState().replaySide;
    const u = gs?.[rs as keyof GameStateData] as PlayerState | undefined;
    return u?.user?._id === user?._id;
  }
  return user?._id === (appState().user?._id as string | undefined);
}

function buildHandCardView(
  hand: CardLike[],
  size: number,
  wrapperClass: string,
): ReactElement {
  return (
    <div>
      {hand.map((card, i) => (
        <div
          key={(card.cid as string) ?? i}
          className={wrapperClass}
          style={size > 1 ? { left: (320 / (size - 1)) * i } : undefined}
        >
          {spectatorViewHidden() ? (
            <CardView card={{ ...card, new: undefined, selected: undefined } as CardLike} />
          ) : card.cid ? (
            <CardView card={card} />
          ) : (
            <FacedownCard side={card.side as string} />
          )}
        </div>
      ))}
    </div>
  );
}

function HandView({
  side,
  hand,
  handSize,
  handCount,
  popup,
  popupDirection,
  discard,
}: {
  side: "corp" | "runner" | "spectator";
  hand: CardLike[];
  handSize: { total?: number } | undefined;
  handCount: number | undefined;
  popup: boolean;
  popupDirection?: string;
  discard?: CardLike[];
}): ReactElement {
  const [ordering, setOrdering] = useState<"natural" | "title" | "type">("natural");
  const popupRef = useRef<HTMLDivElement | null>(null);

  const flashbacks = discard
    ? discard.filter((d) => d["flashback-playable"]).map((d) => ({ ...d, "flashback-fake-in-hand": true } as CardLike))
    : [];
  const printedSize = handCount ?? hand.length;
  const size = printedSize + flashbacks.length;
  const sorted =
    ordering === "title"
      ? [...hand].sort((a, b) => (getTitle(a) ?? "").localeCompare(getTitle(b) ?? ""))
      : ordering === "type"
        ? [...hand].sort((a, b) => {
            const aT = (a.type as string) ?? "";
            const bT = (b.type as string) ?? "";
            const tCmp = aT.localeCompare(bT);
            return tCmp !== 0 ? tCmp : (getTitle(a) ?? "").localeCompare(getTitle(b) ?? "");
          })
        : hand;
  const filledHand: CardLike[] = [
    ...sorted.map((c) => ({ ...c, flashback: undefined } as CardLike)),
    ...flashbacks,
    ...Array.from({ length: Math.max(0, size - hand.length - flashbacks.length) }, () => ({
      side: side === "corp" ? "Corp" : "Runner",
    } as CardLike)),
  ];

  const togglePopup = () => {
    if (popupRef.current) {
      popupRef.current.style.display =
        popupRef.current.style.display === "block" ? "none" : "block";
    }
  };

  return (
    <div className="hand-container">
      <div className="hand-controls">
        <div
          {...dropAreaProps(side === "corp" ? "HQ" : "the Grip")}
          className={`panel blue-shade hand${size > 6 ? " squeeze" : ""}`}
        >
          {buildHandCardView(filledHand, size, "card-wrapper")}
          <Label
            cursor={filledHand}
            opts={{
              name: side === "corp"
                ? trSpan(["game_hq", "HQ"])
                : trSpan(["game_grip", "Grip"]),
              fn: () => `${printedSize}/${handSize?.total ?? 5}`,
            }}
          />
        </div>
        {popup && (
          <div className="hand-controls">
            <div className="panel blue-shade hand-expand" onClick={togglePopup}>+</div>
            <div
              className="panel blue-shade hand-sort"
              onClick={() =>
                setOrdering((o) => (o === "natural" ? "title" : o === "title" ? "type" : "natural"))
              }
            >
              {ordering === "natural" ? "#" : ordering === "title" ? "t" : "y"}
            </div>
          </div>
        )}
      </div>
      {popup && (
        <div
          className={`panel blue-shade popup ${popupDirection ?? ""}`}
          ref={popupRef}
          style={{ display: "none" }}
        >
          <div>
            <a onClick={togglePopup}>{trSpan(["game_close", "Close"])}</a>
            {trElement("label", ["game_card-count", ""], { cnt: String(size) })}
            {trElement("div", ["game_max-hand", "Max hand size"], {
              total: String(handSize?.total ?? 5),
            })}
            {buildHandCardView(filledHand, size, "card-popup-wrapper")}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Identity / deck / discard
// ──────────────────────────────────────────────────────────────────

function MeliesMarker({
  identity,
  serverName,
}: {
  identity: CardLike;
  serverName: string;
}): ReactElement | null {
  if ((identity as Record<string, unknown>)["melies-target"] !== serverName) return null;
  return <div className="melies-marker">M</div>;
}

function IdentityView({
  renderSide,
  identity,
  handCount,
}: {
  renderSide: "corp" | "runner";
  identity: CardLike;
  handCount: number;
}): ReactElement {
  const isRunner = renderSide === "runner";
  const trKey = isRunner ? "game_grip-count" : "game_hq-count";
  const fallback = isRunner ? `Grip (${handCount})` : `HQ (${handCount})`;
  return (
    <div className="blue-shade identity">
      <CardView card={identity} />
      <MeliesMarker identity={identity} serverName="HQ" />
      <div className="header darkbg server-label">
        {trSpan([trKey, fallback], { cnt: String(handCount) })}
      </div>
    </div>
  );
}

function DeckView({
  renderSide,
  playerSide,
  identity,
  deck,
  deckCount,
}: {
  renderSide: "corp" | "runner";
  playerSide: string;
  identity: CardLike;
  deck: CardLike[];
  deckCount: number | undefined;
}): ReactElement {
  const isRunner = renderSide === "runner";
  const count = deckCount ?? deck.length;
  const trKey = isRunner ? "game_stack-count" : "game_rnd-count";
  const fallback = isRunner ? `Stack (${count})` : `R&D (${count})`;
  const title = tr(isRunner ? ["game_stack", "Stack"] : ["game_rnd", "R&D"]);
  const ref = isRunner ? "stack" : "rd";
  const menuRef = `${ref}-menu`;
  const contentRef = `${ref}-content`;
  const isMine = renderSide === playerSide;
  const isRep = isReplay();

  const toggleMenu = () => {
    if (boardDom[contentRef] && boardDom[contentRef]!.style.display === "block") {
      sendCommand("close-deck");
      boardDom[contentRef]!.style.display = "none";
    } else if (boardDom[menuRef]) {
      boardDom[menuRef]!.style.display =
        boardDom[menuRef]!.style.display === "block" ? "none" : "block";
    }
  };

  return (
    <div className="deck-container" {...dropAreaProps(title)}>
      <div className="blue-shade deck" onClick={isMine && !isReplay() ? toggleMenu : undefined}>
        {count > 0 && <FacedownCard side={identity.side as string} classList={["bg"]} />}
        <MeliesMarker identity={identity} serverName="R&D" />
        <div className="header darkbg server-label">
          {trSpan([trKey, fallback], { cnt: String(count) })}
        </div>
      </div>
      {isMine && !isRep && (
        <div
          className="panel blue-shade menu"
          ref={(el) => { boardDom[menuRef] = el; }}
          style={{ display: "none" }}
        >
          <div
            onClick={() => {
              sendCommand("shuffle");
              if (boardDom[menuRef]) boardDom[menuRef]!.style.display = "none";
            }}
          >
            {trSpan(["game_shuffle", "Shuffle"])}
          </div>
          <div
            onClick={() => {
              sendCommand("view-deck");
              if (boardDom[contentRef]) boardDom[contentRef]!.style.display = "block";
              if (boardDom[menuRef]) boardDom[menuRef]!.style.display = "none";
            }}
          >
            {trSpan(["game_show", "Show"])}
          </div>
        </div>
      )}
      {isMine && !isRep && (
        <div
          className="panel blue-shade popup"
          ref={(el) => { boardDom[contentRef] = el; }}
          style={{ display: "none" }}
        >
          <div>
            <a
              onClick={() => {
                sendCommand("close-deck");
                if (boardDom[contentRef]) boardDom[contentRef]!.style.display = "none";
              }}
            >
              {trSpan(["game_close", "Close"])}
            </a>
            <a
              onClick={() => {
                sendCommand("shuffle", { close: "true" });
                if (boardDom[contentRef]) boardDom[contentRef]!.style.display = "none";
              }}
            >
              {trSpan(["game_close-shuffle", "Close & Shuffle"])}
            </a>
          </div>
          {deck.map((card) => (
            <CardView key={card.cid as string} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}

function DiscardViewRunner({
  playerSide,
  discard,
}: {
  playerSide: string;
  discard: CardLike[];
}): ReactElement {
  const popupRef = useRef<HTMLDivElement | null>(null);
  const togglePopup = () => {
    if (popupRef.current) {
      popupRef.current.style.display =
        popupRef.current.style.display === "block" ? "none" : "block";
    }
  };
  const highlight = discard.some(graveyardHighlightCard);
  const sortedDiscard = shouldSortHeap() ? sortHeap(discard) : discard;
  return (
    <div className="discard-container" {...dropAreaProps("Heap")}>
      <div className="blue-shade discard" onClick={togglePopup}>
        {discard.length > 0 && <CardView card={discard[discard.length - 1]!} disableClick={true} />}
        <div className={`header server-label ${highlight ? "graveyard-highlight-bg" : "darkbg"}`}>
          {trSpan(["game_heap", "Heap"], { cnt: String(discard.length) })}
        </div>
      </div>
      <div
        className={`panel blue-shade popup ${playerSide === "runner" ? "me" : "opponent"}`}
        ref={popupRef}
        style={{ display: "none" }}
      >
        <div>
          <a onClick={togglePopup}>{trSpan(["game_close", "Close"])}</a>
        </div>
        {sortedDiscard.map((c) => (
          <CardView key={c.cid as string} card={c} />
        ))}
      </div>
    </div>
  );
}

function DiscardViewCorp({
  playerSide,
  identity,
  discard,
}: {
  playerSide: string;
  identity: CardLike;
  discard: CardLike[];
}): ReactElement {
  const popupRef = useRef<HTMLDivElement | null>(null);
  const togglePopup = () => {
    if (popupRef.current) {
      popupRef.current.style.display =
        popupRef.current.style.display === "block" ? "none" : "block";
    }
  };
  const drawCard = (c: CardLike, disable: boolean) => {
    if (faceup(c)) return <CardView card={c} disableClick={disable} />;
    if (playerSide === "corp" || spectatorViewHidden()) {
      return (
        <div className="unseen">
          <CardView card={c} disableClick={disable} />
        </div>
      );
    }
    return <FacedownCard side="corp" />;
  };
  const total = discard.length;
  const faceupCount = discard.filter(faceup).length;
  const highlight = discard.some((c) =>
    (playerSide === "corp" || spectatorViewHidden())
      ? graveyardHighlightCard(c)
      : graveyardHighlightCard(c) && !!c.seen,
  );
  const sortedDiscard = shouldSortArchives() ? sortArchives(discard) : discard;
  return (
    <div className="discard-container" {...dropAreaProps("Archives")}>
      <div className="blue-shade discard" onClick={togglePopup}>
        {discard.length > 0 && (
          <React.Fragment key="discard">{drawCard(discard[discard.length - 1]!, true)}</React.Fragment>
        )}
        <MeliesMarker identity={identity} serverName="Archives" />
        <div className={`header server-label ${highlight ? "graveyard-highlight-bg" : "darkbg"}`}>
          {trSpan(["game_archives", "Archives"], {
            faceup: String(faceupCount),
            facedown: String(total - faceupCount),
          })}
        </div>
      </div>
      <div
        className={`panel blue-shade popup ${gameState()?.side === "runner" ? "opponent" : "me"}`}
        ref={popupRef}
        style={{ display: "none" }}
      >
        <div>
          <a onClick={togglePopup}>{trSpan(["game_close", "Close"])}</a>
          <label>
            {trSpan(["game_face-down-count", ""], {
              total: String(total),
              facedown: String(total - faceupCount),
            })}
          </label>
        </div>
        {sortedDiscard.map((c, idx) => (
          <div key={idx}>{drawCard(c, false)}</div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// RFG, play area, scored
// ──────────────────────────────────────────────────────────────────

function RfgView({
  cards,
  trVec,
  popup,
  noclick = false,
}: {
  cards: CardLike[];
  trVec: [string, string];
  popup: boolean;
  noclick?: boolean;
}): ReactElement | null {
  const popupRef = useRef<HTMLDivElement | null>(null);
  if (cards.length === 0) return null;
  const size = cards.length;
  const toggle = () => {
    if (popupRef.current) {
      popupRef.current.style.display =
        popupRef.current.style.display === "block" ? "none" : "block";
    }
  };
  return (
    <div
      className={`panel blue-shade rfg${size > 2 ? " squeeze" : ""}`}
      onClick={popup ? toggle : undefined}
    >
      {cards.map((card, i) => (
        <div
          key={i}
          className="card-wrapper"
          style={size > 1 ? { left: (128 / size) * i } : undefined}
        >
          <div>
            <CardView card={card} disableClick={noclick} />
          </div>
        </div>
      ))}
      <Label cursor={cards} opts={{ trVec }} />
      {popup && (
        <div className="panel blue-shade popup opponent" ref={popupRef} style={{ display: "none" }}>
          <div>
            <a onClick={toggle}>{trSpan(["game_close", "Close"])}</a>
            {trElement("label", ["game_card-count", ""], { cnt: String(size) })}
          </div>
          {cards.map((c) => <CardView key={c.cid as string} card={c} />)}
        </div>
      )}
    </div>
  );
}

function PlayAreaView({
  user,
  trVec,
  cards,
}: {
  user: { _id?: string } | undefined;
  trVec: [string, string];
  cards: CardLike[];
}): ReactElement | null {
  if (cards.length === 0) return null;
  return (
    <div className={`panel blue-shade rfg${cards.length > 2 ? " squeeze" : ""}`}>
      {cards.map((card, i) => (
        <div
          key={i}
          className="card-wrapper"
          style={cards.length > 1 ? { left: (128 / cards.length) * i } : undefined}
        >
          {(card.seen || thisUser(user)) ? (
            <CardView card={card} />
          ) : (
            <FacedownCard side={card.side as string} />
          )}
        </div>
      ))}
      <Label cursor={cards} opts={{ trVec }} />
    </div>
  );
}

function ScoredView({
  scored,
  agendaPoint,
  agendaPointReq,
  me,
}: {
  scored: CardLike[];
  agendaPoint: number;
  agendaPointReq: number;
  me: boolean;
}): ReactElement {
  void me;
  return (
    <div className="panel blue-shade scored squeeze">
      {scored.map((card, i) => (
        <div
          key={i}
          className="card-wrapper"
          style={scored.length > 1 ? { left: (128 / (scored.length - 1)) * i } : undefined}
        >
          <div>
            <CardView card={card} />
          </div>
        </div>
      ))}
      <Label cursor={scored} opts={{ trVec: ["game_scored-area", "Scored Area"] }} />
      <div className="stats-area">
        {agendaPointReq === 7
          ? trElement("div", ["game_agenda-count", ""], { "agenda-point": String(agendaPoint) })
          : trElement("div", ["game_agenda-count-with-req", ""], {
              "agenda-point": String(agendaPoint),
              "agenda-point-req": String(agendaPointReq),
            })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Server view
// ──────────────────────────────────────────────────────────────────

interface ServerData {
  content?: CardLike[];
  ices?: CardLike[];
}

interface ServerViewArgs {
  serverKey: string | number;
  server: ServerData;
  centralView?: ReactNode;
  run?: { phase?: string; position?: number; "source-card"?: CardLike } | null;
}

function RunArrow({ run }: { run: { phase?: string } | null | undefined }): ReactElement {
  const cls =
    run?.phase === "movement" ? "movement"
    : run?.phase === "approach-ice" ? "approach"
    : run?.phase === "encounter-ice" ? "encounter"
    : "";
  return (
    <div className="run-arrow">
      <div className={cls} />
    </div>
  );
}

function ServerView({ serverKey, server, centralView, run, opts }: ServerViewArgs & { opts?: LabelOpts }): ReactElement {
  const content = server.content ?? [];
  const ices = server.ices ?? [];
  const runPos = run?.position ?? 0;
  const currentIce = run && runPos > 0 && runPos <= ices.length ? ices[runPos - 1] : null;
  const maxHosted = Math.max(0, ...ices.map((i) => ((i.hosted as CardLike[] | undefined) ?? []).length));

  return (
    <div className="server">
      <div
        className="ices"
        style={maxHosted > 0 ? { width: 84 + 3 + 42 * (maxHosted - 1) } : undefined}
      >
        {run?.["source-card"] && (
          <div className="run-card"><CardImg card={run["source-card"]!} /></div>
        )}
        {[...ices].reverse().map((ice) => {
          const hosted = (ice.hosted as CardLike[] | undefined) ?? [];
          const flipped = !ice.rezzed;
          return (
            <div
              key={ice.cid as string}
              className={`ice${hosted.length > 0 ? " host" : ""}`}
              style={hosted.length > 0 ? { left: 21 * (hosted.length - 1) } : undefined}
            >
              <CardView card={ice} flipped={flipped} />
              {currentIce && currentIce.cid === ice.cid && <RunArrow run={run} />}
            </div>
          );
        })}
        {run && !currentIce && <RunArrow run={run} />}
      </div>
      <div className="content">
        {centralView}
        {content.length > 0 &&
          content.map((card, idx) => {
            const isFirst = idx === 0;
            const flipped = !faceup(card);
            const cls = `${centralView ? "central " : ""}${centralView || (content.length > 1 && !isFirst) ? "shift" : ""}`;
            return (
              <div key={card.cid as string} className={`server-card ${cls}`}>
                <CardView card={card} flipped={flipped} />
              </div>
            );
          })}
        {centralView ? (
          <Label cursor={content} opts={{ ...opts, classes: "server-label", hideCursor: true }} />
        ) : (
          <Label
            cursor={content}
            opts={{
              ...opts,
              classes: "server-label",
              hideCursor: true,
              name: tr(["game_server", "Server"], { num: String(serverKey) }),
              trVec: ["game_server", "Server"],
              trParams: { num: String(serverKey) },
            }}
          />
        )}
      </div>
    </div>
  );
}

function StackedLabel({
  cursor,
  similarServers,
  opts,
}: {
  cursor: CardLike[];
  similarServers: Array<[string, ServerData]>;
  opts: LabelOpts;
}): ReactElement {
  const names: string[] = [opts.name as string, ...similarServers.map(([k]) => remoteToStrName(k))].filter(Boolean) as string[];
  const numbers = names.map((n) => n.split(" ")[1] ?? "").filter(Boolean);
  return (
    <Label
      cursor={cursor}
      opts={{
        ...opts,
        classes: "server-label",
        name: `Servers ${numbers.join(", ")}`,
        trVec: ["game_server", "Server"],
        trParams: { num: numbers.join(", ") },
        hideCursor: true,
      }}
    />
  );
}

function StackedView({
  serverKey,
  server,
  similarServers,
  run,
  opts,
}: {
  serverKey: string | number;
  server: ServerData;
  similarServers: Array<[string, ServerData]>;
  run?: { phase?: string; position?: number; "source-card"?: CardLike } | null;
  opts: LabelOpts;
}): ReactElement {
  void serverKey;
  const baseContent = server.content ?? [];
  const similarContent = similarServers.map(([, s]) => s.content?.[0]).filter(Boolean) as CardLike[];
  const content = [...baseContent, ...similarContent];
  const ices = server.ices ?? [];
  const runPos = run?.position ?? 0;
  const currentIce = run && runPos > 0 && runPos <= ices.length ? ices[runPos - 1] : null;

  return (
    <div className="server">
      <div className="ices">
        {run?.["source-card"] && (
          <div className="run-card"><CardImg card={run["source-card"]!} /></div>
        )}
        {run && !currentIce && <RunArrow run={run} />}
      </div>
      <div className="content">
        <div className="stacked">
          {content.map((card, idx) => {
            const isFirst = idx === 0;
            const flipped = !faceup(card);
            return (
              <div
                key={card.cid as string}
                className={`server-card${content.length > 1 && !isFirst ? " shift" : ""}`}
              >
                <CardView card={card} flipped={flipped} />
              </div>
            );
          })}
          <StackedLabel cursor={content} similarServers={similarServers} opts={opts} />
        </div>
      </div>
    </div>
  );
}

function compareServersForStacking(s1: [string, ServerData]) {
  return (s2: [string, ServerData]): boolean => {
    const ss1 = s1[1];
    const ss2 = s2[1];
    if (s1 === s2) return false;
    if ((ss1.ices ?? []).length > 0 || (ss2.ices ?? []).length > 0) return false;
    if ((ss1.content ?? []).length !== 1 || (ss2.content ?? []).length !== 1) return false;
    const c1 = ss1.content![0]!;
    const c2 = ss2.content![0]!;
    if ((c1.normalizedtitle as string) !== (c2.normalizedtitle as string)) return false;
    if (!isAsset(c1) || !isAsset(c2)) return false;
    if (!c1.rezzed || !c2.rezzed) return false;
    if (((c1.hosted as CardLike[] | undefined) ?? []).length > 0) return false;
    if (((c2.hosted as CardLike[] | undefined) ?? []).length > 0) return false;
    return true;
  };
}

function BoardViewCorp({
  playerSide,
  identity,
  deck,
  deckCount,
  hand,
  handCount,
  discard,
  servers,
  run,
}: {
  playerSide: "corp" | "runner" | "spectator";
  identity: CardLike;
  deck: CardLike[];
  deckCount: number | undefined;
  hand: CardLike[];
  handCount: number | undefined;
  discard: CardLike[];
  servers: Record<string, ServerData> | undefined;
  run: { server?: unknown[] | null; phase?: string; position?: number } | null;
}): ReactElement {
  const rs = (run?.server as unknown[] | undefined) ?? [];
  const serverType = rs[0] as string | undefined;
  const sideClass = playerSide === "runner" ? "opponent" : "me";
  const handCountNum = handCount ?? hand.length;
  const overlap = appState().options["sides-overlap"];
  const stacked = !!appState().options["stacked-cards"];
  const remotes = (getRemotes(servers) as Array<[string, ServerData]>).reverse();

  return (
    <div className={`outer-corp-board ${sideClass} ${overlap ? "overlap" : ""}`}>
      <div className={`corp-board ${sideClass}`}>
        {remotes.map((server) => {
          const num = remoteToNum(server[0]);
          const similarServers = remotes.filter(compareServersForStacking(server as [string, ServerData]));
          if (
            !(similarServers.length > 0) ||
            !stacked ||
            num < remoteToNum((similarServers[0]?.[0] as string) ?? "")
          ) {
            if (!(similarServers.length > 0) || !stacked) {
              return (
                <ServerView
                  key={num}
                  serverKey={num}
                  server={server[1] as ServerData}
                  run={serverType === `remote${num}` ? run : null}
                  opts={{ name: remoteToStrName(server[0]) }}
                />
              );
            }
            const includesType = [server, ...similarServers].some(
              ([k]) => serverType === `remote${remoteToNum(k)}`,
            );
            return (
              <StackedView
                key={num}
                serverKey={num}
                server={server[1] as ServerData}
                similarServers={similarServers as Array<[string, ServerData]>}
                run={includesType && serverType === `remote${num}` ? run : null}
                opts={{ name: remoteToStrName(server[0]) }}
              />
            );
          }
          return null;
        })}
        <ServerView
          serverKey="hq"
          server={(servers?.hq as ServerData) ?? {}}
          centralView={<IdentityView renderSide="corp" identity={identity} handCount={handCountNum} />}
          run={serverType === "hq" ? run : null}
        />
        <ServerView
          serverKey="rd"
          server={(servers?.rd as ServerData) ?? {}}
          centralView={<DeckView renderSide="corp" playerSide={playerSide} identity={identity} deck={deck} deckCount={deckCount} />}
          run={serverType === "rd" ? run : null}
        />
        <ServerView
          serverKey="archives"
          server={(servers?.archives as ServerData) ?? {}}
          centralView={<DiscardViewCorp playerSide={playerSide} identity={identity} discard={discard} />}
          run={serverType === "archives" ? run : null}
        />
      </div>
    </div>
  );
}

function ghostCard(card: CardLike): CardLike {
  const hosted = ((card.hosted as CardLike[] | undefined) ?? []).map(ghostCard);
  return { ...card, ghost: true, hosted } as CardLike;
}

function findHostedPrograms(servers: Record<string, ServerData> | undefined): CardLike[] {
  if (!servers) return [];
  const all = [servers.archives, servers.rd, servers.hq, ...getRemotes(servers).map(([, s]) => s as ServerData)];
  const ices = all.flatMap((s) => s?.ices ?? []);
  const hosted = ices.flatMap((i) => (i.hosted as CardLike[] | undefined) ?? []);
  return hosted.filter(isProgram).map(ghostCard);
}

function BoardViewRunner({
  playerSide,
  identity,
  deck,
  deckCount,
  hand,
  handCount,
  discard,
  rig,
  run,
  servers,
}: {
  playerSide: "corp" | "runner" | "spectator";
  identity: CardLike;
  deck: CardLike[];
  deckCount: number | undefined;
  hand: CardLike[];
  handCount: number | undefined;
  discard: CardLike[];
  rig: Record<string, CardLike[]> | undefined;
  run: { server?: unknown[] | null; phase?: string; position?: number } | null;
  servers: Record<string, ServerData> | undefined;
}): ReactElement {
  const isMe = playerSide === "runner";
  const handCountNum = handCount ?? hand.length;
  const overlap = appState().options["sides-overlap"];
  const stacked = !!appState().options["stacked-cards"];

  const centrals = (
    <div className="runner-centrals">
      <DiscardViewRunner playerSide={playerSide} discard={discard} />
      <DeckView renderSide="runner" playerSide={playerSide} identity={identity} deck={deck} deckCount={deckCount} />
      <IdentityView renderSide="runner" identity={identity} handCount={handCountNum} />
    </div>
  );

  const runnerOrder = (!isMe && appState().options["runner-board-order"] === "irl")
    ? ([...["program", "hardware", "resource", "facedown"]].reverse() as Array<"program" | "hardware" | "resource" | "facedown">)
    : (["program", "hardware", "resource", "facedown"] as Array<"program" | "hardware" | "resource" | "facedown">);
  const hostedPrograms = appState().options["ghost-trojans"] ? findHostedPrograms(servers) : [];

  return (
    <div className={`runner-board ${isMe ? "me" : "opponent"} ${overlap ? "overlap" : ""}`}>
      {!isMe && centrals}
      {runnerOrder.map((zone) => {
        const baseCards = rig?.[zone] ?? [];
        const cards = zone === "program" ? [...baseCards, ...hostedPrograms] : baseCards;
        return (
          <div key={zone}>
            {stacked ? (
              <ShowDistinctCards distinctCards={groupByTitle(cards)} />
            ) : (
              cards.map((c) => (
                <div
                  key={c.cid as string}
                  className={`card-wrapper${playable(c) ? " playable" : ""}`}
                >
                  <CardView card={c} />
                </div>
              ))
            )}
          </div>
        );
      })}
      {isMe && centrals}
      {void run}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Win box, decklists, start box
// ──────────────────────────────────────────────────────────────────

function BuildWinBox(): ReactElement | null {
  const gs = useGameBoard((s) => s.gameState);
  const [winShown, setWinShown] = useState(false);
  if (!gs || !gs.winner || winShown) return null;
  const winner = gs.winner ?? "-";
  const winningUser = (gs as { "winning-user"?: string })["winning-user"] ?? "-";
  const turn = gs.turn ?? 0;
  const reason = ((gs as { reason?: string }).reason ?? gs["win-reason"] ?? "").toString();
  const reasonCap = reason ? reason.charAt(0).toUpperCase() + reason.slice(1) : "";
  const stats = gs.stats as { time?: { elapsed?: string }; corp?: unknown; runner?: unknown } | undefined;
  const time = stats?.time?.elapsed;
  const params = {
    winner: winningUser,
    side: winner,
    reason: reasonCap,
    turn: String(turn),
  };

  const reasonMsg = (() => {
    switch (reasonCap) {
      case "Decked": return trSpan(["game_win-decked", ""], params);
      case "Flatline": return trSpan(["game_win-flatlined", ""], params);
      case "Concede": return trSpan(["game_win-conceded", ""], params);
      case "Claim": return trSpan(["game_win-claimed", ""], params);
      case "Agenda": return trSpan(["game_win-points", ""], params);
      default: return trSpan(["game_win-other", ""], params);
    }
  })();

  return (
    <div className="win centered blue-shade">
      <div>{reasonMsg}</div>
      {trElement("div", ["game_time-taken", ""], { time: String(time ?? "") })}
      <br />
      <EndOfGameStats corp={stats?.corp as Record<string, unknown> ?? {}} runner={stats?.runner as Record<string, unknown> ?? {}} />

      {gs.side !== "spectator" && (
        <>
          <br />
          <div className="end-of-game-buttons">
            {gs.side === "corp" && (
              <button
                id="rez-all"
                onClick={() => {
                  const gameid = currentGameID();
                  if (gameid) wsSend("game/say", { gameid, msg: "/rez-all" });
                }}
              >
                {trSpan(["game_rez-all", "Rez All"])}
              </button>
            )}
            <button
              id="reveal-hand"
              onClick={() => {
                const gameid = currentGameID();
                if (gameid) wsSend("game/say", { gameid, msg: "/show-hand" });
              }}
            >
              {trSpan(["game_reveal-my-hand", "Reveal My Hand"])}
            </button>
          </div>
        </>
      )}
      <button className="win-right" onClick={() => setWinShown(true)} type="button">✘</button>
    </div>
  );
}

function BuildInGameDecklists({
  corpList,
  runnerList,
}: {
  corpList: Record<string, unknown>;
  runnerList: Record<string, unknown>;
}): ReactElement {
  const corpEntries = Object.entries(corpList);
  const runnerEntries = Object.entries(runnerList);
  const rows = mapLongest(
    (c: [string, unknown] | null, r: [string, unknown] | null) => [c, r] as [[string, unknown] | null, [string, unknown] | null],
    null as unknown as [string, unknown] | null,
    corpEntries as [string, unknown][],
    runnerEntries as [string, unknown][],
  );

  const isDivider = (c: [string, unknown] | null) => c && c[1] === "divider";
  const qty = (c: [string, unknown] | null) => (isDivider(c) ? "" : String(c?.[1] ?? ""));
  const name = (c: [string, unknown] | null): ReactNode => {
    if (!c) return null;
    if (isDivider(c)) return <div style={{ textAlign: "left" }}><strong>{renderMessage(c[0]) as ReactNode}</strong></div>;
    return (
      <div
        style={{ textAlign: "left" }}
        onMouseOver={(e) => cardPreviewMouseOver(e)}
        onMouseOut={(e) => cardPreviewMouseOut(e)}
      >
        {renderMessage(c[0]) as ReactNode}
      </div>
    );
  };

  return (
    <div>
      <table className="decklists table">
        <tbody>
          <tr className="win th">
            <td className="win th">{trSide("Corp")}</td><td className="win th" />
            <td className="win th">{trSide("Runner")}</td><td className="win th" />
          </tr>
          {rows.map((pair, i) => (
            <tr key={i}>
              <td>{qty(pair[0])}</td><td>{name(pair[0])}</td>
              <td>{qty(pair[1])}</td><td>{name(pair[1])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BuildDecksBox(): ReactElement | null {
  const gs = useGameBoard((s) => s.gameState);
  const showDecklists = useAppState((s) => s["display-decklists"]) as boolean | undefined;
  if (!showDecklists) return null;
  const decklists = (gs as { decklists?: { corp?: Record<string, unknown>; runner?: Record<string, unknown> } } | null)?.decklists;
  if (!decklists) return null;
  const corpList = decklists.corp ?? { "-": 1 };
  const runnerList = decklists.runner ?? { "-": 1 };
  return (
    <div className="decklists blue-shade">
      <br />
      <BuildInGameDecklists corpList={corpList} runnerList={runnerList} />
    </div>
  );
}

function BuildStartBox({
  myIdent,
  myUser,
  myHand,
  promptState,
  myKeep,
  opIdent,
  opUser,
  opKeep,
  meQuote,
  opQuote,
  mySide,
}: {
  myIdent: CardLike | undefined;
  myUser: { username?: string } | undefined;
  myHand: CardLike[] | undefined;
  promptState: PromptState | undefined;
  myKeep: string | undefined;
  opIdent: CardLike | undefined;
  opUser: { username?: string } | undefined;
  opKeep: string | undefined;
  meQuote: string | undefined;
  opQuote: string | undefined;
  mySide: "corp" | "runner" | "spectator";
}): ReactElement | null {
  const [visibleQuote, setVisibleQuote] = useState(true);
  const [mulliganed, setMulliganed] = useState(false);
  const startShown = useAppState((s) => s["start-shown"]) as boolean | undefined;
  const setStartShown = (v: boolean) => useAppState.setState({ "start-shown": v } as Partial<typeof useAppState.getState>);

  if (startShown || !opUser?.username || !(myHand && myHand.length > 0) || !myIdent || !opIdent) {
    return null;
  }
  const squeeze = myHand.length > 5;

  return (
    <div className="win centered blue-shade start-game">
      <div>
        <div className="box">
          <div className={`start-game ident column ${myKeep === "mulligan" ? "mulligan-me" : myKeep === "keep" ? "keep-me" : ""}`}>
            {(() => {
              const url = imageUrl(myIdent);
              return url ? (
                <img
                  src={url}
                  alt={getTitle(myIdent) ?? ""}
                  className={visibleQuote ? "selected" : ""}
                  onClick={() => setVisibleQuote(true)}
                />
              ) : null;
            })()}
          </div>
          <div className="column contestants">
            <div>{myUser?.username}</div>
            <div className="vs">VS</div>
            <div>{opUser?.username}</div>
            <div className="intro-blurb">{visibleQuote ? `"${meQuote}"` : `"${opQuote}"`}</div>
          </div>
          <div className={`start-game ident column ${opKeep === "mulligan" ? "mulligan-op" : opKeep === "keep" ? "keep-op" : ""}`}>
            {(() => {
              const url = imageUrl(opIdent);
              return url ? (
                <img
                  src={url}
                  alt={getTitle(opIdent) ?? ""}
                  className={!visibleQuote ? "selected" : ""}
                  onClick={() => setVisibleQuote(false)}
                />
              ) : null;
            })()}
          </div>
        </div>
        {mySide !== "spectator" && (
          <div className="start-hand">
            <div className={squeeze ? "squeeze" : ""}>
              {myHand.map((card, i) => (
                <div
                  key={`${card.cid as string}-${i}-${mulliganed}`}
                  className="start-card-frame"
                  id={`startcard${i}`}
                  style={squeeze ? { left: (610 / (myHand.length - 1)) * i, position: "absolute" } : undefined}
                >
                  <div className="flipper">
                    <div className="card-back">
                      <img className="start-card" src={facedownCardUrl(myIdent.side as string)} alt="" />
                    </div>
                    <div className="card-front">
                      {(() => {
                        const url = imageUrl(card);
                        return url ? (
                          <div
                            onMouseEnter={() => putGameCardInChannel(card)}
                            onMouseLeave={() => zoomChannelPut(false)}
                          >
                            <img className="start-card" src={url} alt={card.title as string} />
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mulligan">
          {mySide === "spectator" || (myKeep && opKeep)
            ? condButton(
                trSpan(mySide === "spectator" ? ["game_close", "Close"] : ["game_start", "Start Game"]),
                true,
                () => setStartShown(true),
              )
            : (
              <>
                {condButton(
                  trSpan(["game_keep", "Keep"]),
                  promptState?.["prompt-type" as keyof PromptState] === "mulligan",
                  () => {
                    const choices = (promptState?.choices as Array<{ value: unknown; uuid: string }> | undefined) ?? [];
                    const found = choices.find((c) => c.value === "Keep");
                    sendCommand("choice", { eid: promptEid(gameState()?.side as string), choice: { uuid: found?.uuid } });
                  },
                )}
                {condButton(
                  trSpan(["game_mulligan", "Mulligan"]),
                  promptState?.["prompt-type" as keyof PromptState] === "mulligan",
                  () => {
                    const choices = (promptState?.choices as Array<{ value: unknown; uuid: string }> | undefined) ?? [];
                    const found = choices.find((c) => c.value === "Mulligan");
                    sendCommand("choice", { eid: promptEid(gameState()?.side as string), choice: { uuid: found?.uuid } });
                    setMulliganed(true);
                  },
                )}
              </>
            )}
        </div>
      </div>
      <br />
      <button className="win-right" onClick={() => setStartShown(true)} type="button">✘</button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Run UI
// ──────────────────────────────────────────────────────────────────

function getRunIces(): CardLike[] {
  const gs = gameState();
  const run = gs?.run as { server?: unknown[] } | undefined;
  const serverKey = run?.server?.[0] as string | undefined;
  if (!serverKey) return [];
  const servers = gs?.corp?.servers as Record<string, ServerData> | undefined;
  return (servers?.[serverKey]?.ices as CardLike[]) ?? [];
}

function getCurrentIce(): CardLike | null {
  const gs = gameState();
  const run = gs?.run as { phase?: string; position?: number; "approached-ice-in-position?"?: boolean } | undefined;
  const runIce = getRunIces();
  const pos = run?.position ?? 0;
  const phase = run?.phase;
  const encounters = gs?.encounters as { ice?: CardLike } | undefined;
  const encounterIce = encounters?.ice;
  const getFromPos = phase === "movement" || !!run?.["approached-ice-in-position?"];
  return encounterIce || (getFromPos && pos > 0 && pos <= runIce.length ? runIce[pos - 1] ?? null : null);
}

function phaseToTitle(phase: string | undefined): [string, string] {
  switch (phase) {
    case "initiation": return ["game_initiation", "Initiation"];
    case "approach-ice": return ["game_approach-ice", "Approach ice"];
    case "approach-server": return ["game_approach-server", "Approach server"];
    case "encounter-ice": return ["game_encounter-ice", "Encounter ice"];
    case "movement": return ["game_movement", "Movement"];
    case "success": return ["game_success", "Success"];
    default: return ["game_unknown-phase", "Unknown phase"];
  }
}

function phaseToNextPhaseTitle(run: { phase?: string; position?: number }): string {
  switch (run?.phase) {
    case "initiation": return tr(["game_approach-ice", "Approach ice"]);
    case "approach-ice":
      return rezzed(getCurrentIce())
        ? tr(["game_encounter-ice", "Encounter ice"])
        : tr(["game_movement", "Movement"]);
    case "encounter-ice": return tr(["game_movement", "Movement"]);
    case "movement":
      return (run?.position ?? 0) === 0
        ? tr(["game_success", "Success"])
        : tr(["game_approach-ice", "Approach ice"]);
    case "success": return tr(["game_run-ends", "Run ends"]);
    default: return tr(["game_no-current-run", "No current run"]);
  }
}

function CorpRunDiv({
  run,
  encounters,
}: {
  run: { phase?: string; position?: number; "source-card"?: CardLike; "no-action"?: string; "corp-auto-no-action"?: boolean; "next-phase"?: string } | null;
  encounters: { ice?: CardLike; "encounter-count"?: number; "no-action"?: string } | null;
}): ReactElement {
  const ice = getCurrentIce();
  const button = useAppState((s) => s["button"]);
  const displayEncInfo = useAppState((s) => s.options["display-encounter-info"]) as boolean | undefined;
  const passOnRez = useAppState((s) => s.options["pass-on-rez"]) as boolean | undefined;

  return (
    <div className="panel blue-shade">
      {encounters && ice && (
        <>
          <div
            style={{ textAlign: "center" }}
            onMouseOver={(e) => cardHighlightMouseOver(e, ice)}
            onMouseOut={(e) => cardHighlightMouseOut(e, ice)}
          >
            {trSpan(["game_encounter-ice", "Encounter ice"])}: {renderMessage(getTitle(ice) ?? "") as ReactNode}
          </div>
          <hr />
          {(button || displayEncInfo) && <EncounterInfoDiv ice={ice} />}
        </>
      )}
      {run && (
        <h4>
          {trSpan(["game_current-phase", "Current phase"])}:
          <br />
          {trSpan(phaseToTitle(run.phase))}
        </h4>
      )}

      {run?.phase === "approach-ice" && ice && condButton(
        <span>{trSpan(["game_rez", "Rez"])} {getTitle(ice)}</span>,
        !rezzed(ice),
        () => sendCommand("rez", { card: ice, "press-continue": passOnRez }),
      )}

      {(run?.phase === "encounter-ice" || encounters) && (() => {
        const subs = (ice?.subroutines as SubroutineLike[] | undefined) ?? [];
        const enabled = subs.some((s) => !s.broken && !s.fired && s.resolve !== false);
        return condButton(
          trSpan(["game_fire-unbroken", "Fire unbroken subroutines"]),
          enabled,
          () => sendCommand("unbroken-subroutines", { card: ice ?? undefined }),
        );
      })()}

      {encounters
        ? (() => {
            const passIce =
              run?.phase === "encounter-ice" && encounters["encounter-count"] === 1;
            return condButton(
              passIce
                ? trSpan(["game_continue-to", "Continue to"], { phase: phaseToNextPhaseTitle(run!) })
                : trSpan(["game_continue", "Continue"]),
              encounters["no-action"] !== "corp",
              () => sendCommand("continue"),
            );
          })()
        : run?.phase === "initiation"
          ? condButton(
              trSpan(["game_continue-to", "Continue to"], {
                phase: (run.position ?? 0) === 0
                  ? tr(["game_approach-server", "Approach server"])
                  : tr(["game_approach-ice", "Approach ice"]),
              }),
              run["no-action"] !== "corp",
              () => sendCommand("continue"),
            )
          : condButton(
              run?.["next-phase"] || (run?.position ?? -1) === 0
                ? trSpan(["game_no-further", "No further actions"])
                : trSpan(["game_continue-to", "Continue to"], { phase: phaseToNextPhaseTitle(run!) }),
              run?.phase !== "initiation" && run?.phase !== "success" && run?.["no-action"] !== "corp",
              () => sendCommand("continue"),
            )}

      {run && (encounters?.["encounter-count"] ?? 0) <= 1 && run.phase !== "success" && (
        checkboxButton(
          tr(["game_stop-auto-pass", "Stop auto-passing priority"]),
          tr(["game_auto-pass", "Auto-pass priority"]),
          !!run["corp-auto-no-action"],
          () => sendCommand("toggle-auto-no-action"),
        )
      )}
    </div>
  );
}

function RunnerRunDiv({
  run,
  encounters,
}: {
  run: { phase?: string; position?: number; "no-action"?: string; "next-phase"?: string; "cannot-jack-out"?: boolean } | null;
  encounters: { ice?: CardLike; "encounter-count"?: number; "no-action"?: string } | null;
}): ReactElement {
  const ice = getCurrentIce();
  const button = useAppState((s) => s["button"]);
  const displayEncInfo = useAppState((s) => s.options["display-encounter-info"]) as boolean | undefined;
  const phase = run?.phase;
  const nextPhase = run?.["next-phase"];
  const passIce = phase === "encounter-ice" && encounters?.["encounter-count"] === 1;
  const forcedEncounter = (gameState() as { "forced-encounter"?: boolean } | null)?.["forced-encounter"];

  return (
    <div className="panel blue-shade">
      {encounters && ice && (
        <>
          <div
            style={{ textAlign: "center" }}
            onMouseOver={(e) => cardHighlightMouseOver(e, ice)}
            onMouseOut={(e) => cardHighlightMouseOut(e, ice)}
          >
            {trSpan(["game_encounter-ice", "Encounter ice"])}: {renderMessage(getTitle(ice) ?? "") as ReactNode}
          </div>
          <hr />
          {(button || displayEncInfo) && <EncounterInfoDiv ice={ice} />}
        </>
      )}
      {run && (
        <h4>
          {trSpan(["game_current-phase", "Current phase"])}:
          <br />
          {trSpan(phaseToTitle(phase))}
        </h4>
      )}

      {nextPhase && phase !== "initiation" && condButton(
        trSpan(phaseToTitle(nextPhase)),
        !!nextPhase && !run?.["no-action"],
        () => sendCommand("start-next-phase"),
      )}
      {phase === "initiation" && condButton(
        trSpan(["game_continue-to", "Continue to"], {
          phase: (run?.position ?? 0) === 0
            ? tr(["game_approach-server", "Approach server"])
            : tr(["game_approach-ice", "Approach ice"]),
        }),
        run?.["no-action"] !== "runner",
        () => sendCommand("continue"),
      )}
      {!nextPhase && (run?.position ?? 0) !== 0 && !encounters && condButton(
        trSpan(["game_continue-to", "Continue to"], { phase: phaseToNextPhaseTitle(run!) }),
        run?.["no-action"] !== "runner",
        () => sendCommand("continue"),
      )}
      {(run?.position ?? -1) === 0 && !encounters && phase === "movement" && condButton(
        trSpan(["game_breach-server", "Breach server"]),
        run?.["no-action"] !== "runner",
        () => sendCommand("continue"),
      )}

      {encounters && (() => {
        const subs = (ice?.subroutines as SubroutineLike[] | undefined) ?? [];
        const enabled = subs.some((s) => !s.broken && !s.fired && s.resolve !== false);
        return condButton(
          trSpan(["game_let-subs-fire", "Let unbroken subroutines fire"]),
          enabled,
          () =>
            sendCommand("system-msg", {
              msg: `indicates to fire all unbroken subroutines on ${getTitle(ice ?? undefined) ?? ""}`,
            }),
        );
      })()}
      {encounters && condButton(
        passIce
          ? trSpan(["game_continue-to", "Continue to"], { phase: phaseToNextPhaseTitle(run!) })
          : trSpan(["game_continue", "Continue"]),
        encounters?.["no-action"] !== "runner",
        () => sendCommand("continue"),
      )}
      {run && !forcedEncounter && phase !== "success" && condButton(
        trSpan(["game_jack-out", "Jack Out"]),
        phase === "movement" && !run?.["cannot-jack-out"] && run?.["no-action"] !== "runner",
        () => sendCommand("jack-out"),
      )}
    </div>
  );
}

function RunDiv({
  side,
  run,
  encounters,
}: {
  side: string;
  run: { phase?: string; position?: number; "source-card"?: CardLike; "no-action"?: string; "corp-auto-no-action"?: boolean; "next-phase"?: string; "cannot-jack-out"?: boolean } | null;
  encounters: { ice?: CardLike; "encounter-count"?: number; "no-action"?: string } | null;
}): ReactElement {
  return side === "corp" ? <CorpRunDiv run={run} encounters={encounters} /> : <RunnerRunDiv run={run} encounters={encounters} />;
}

// ──────────────────────────────────────────────────────────────────
// Trace
// ──────────────────────────────────────────────────────────────────

function TraceDiv({ promptState }: { promptState: PromptState & Record<string, unknown> }): ReactElement {
  const [value, setValue] = useState(0);
  const base = promptState.base as number | undefined;
  const strength = promptState.strength as number | undefined;
  const player = promptState.player as string | undefined;
  const link = promptState.link as number | undefined;
  const bonus = promptState.bonus as number | undefined;
  const choices = promptState.choices as unknown as number;
  const corpCredits = promptState["corp-credits"] as number | undefined;
  const runnerCredits = promptState["runner-credits"] as number | undefined;
  const unbeatable = promptState.unbeatable as number | undefined;
  const beatTrace = promptState["beat-trace"] as number | undefined;

  return (
    <div>
      {base != null && (
        strength == null ? (
          player === "corp" ? (
            <div className="info">
              {trSide("Runner")}: {link}<span className="anr-icon link" /> + {runnerCredits}<span className="anr-icon credit" />
            </div>
          ) : (
            <div className="info">
              {trSpan(["game_trace", "Trace"])}: {bonus ? base + bonus : base} + {corpCredits}<span className="anr-icon credit" />
            </div>
          )
        ) : (
          player === "corp" ? (
            <div className="info">vs Trace: {strength}</div>
          ) : (
            <div className="info">vs Runner: {strength}<span className="anr-icon link" /></div>
          )
        )
      )}
      <div className="credit-select">
        {base != null && (
          strength == null
            ? (player === "corp"
                ? <span>{(bonus ? base + bonus : base)} + </span>
                : <span>{link} <span className="anr-icon link" /> + </span>)
            : (player === "corp"
                ? <span>{link} <span className="anr-icon link" /> + </span>
                : <span>{(bonus ? base + bonus : base)} + </span>)
        )}
        <select
          id="credit"
          value={value}
          onChange={(e) => setValue(parseInt(e.target.value, 10))}
          onKeyUp={(e) => {
            if (e.key === "Enter") {
              document.getElementById("trace-submit")?.click();
              e.stopPropagation();
            }
          }}
        >
          {Array.from({ length: (choices ?? 0) + 1 }, (_, i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
        {trSpan(["game_credits", "credits"])}
      </div>
      {(unbeatable || beatTrace) && (
        <button id="trace-unbeatable" onClick={() => setValue((unbeatable || beatTrace) as number)}>
          <div>
            {trSpan(unbeatable ? ["game_unbeatable", "Make Unbeatable"] : ["game_beat-trace", "Beat Trace"])}
            {" ("}{unbeatable || beatTrace}<span className="anr-icon credit" />{")"}
          </div>
        </button>
      )}
      <button
        id="trace-submit"
        onClick={() => sendCommand("choice", { eid: promptEid(gameState()?.side as string), choice: value })}
      >
        {trSpan(["game_ok", "OK"])}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Prompt
// ──────────────────────────────────────────────────────────────────

function PromptDiv({ promptState }: { promptState: PromptState & Record<string, unknown> }): ReactElement {
  const card = promptState.card as CardLike | undefined;
  const msg = promptState.msg as string | undefined;
  const promptType = promptState["prompt-type"] as string | undefined;
  const choices = promptState.choices as unknown;
  const offerBadPub = promptState["offer-bad-pub?"] as number | undefined;
  const gs = gameState();
  const side = gs?.side as string | undefined;

  const numberCredit = useRef<HTMLSelectElement | null>(null);
  const cardTitleInput = useRef<HTMLInputElement | null>(null);

  const getNestedHost = (c: CardLike): CardLike => {
    if (c.host) return getNestedHost(c.host as CardLike);
    return c;
  };
  const installed = (c: CardLike): boolean => {
    const z = getNestedHost(c).zone as string[] | undefined;
    return !!c.installed || z?.[0] === "servers";
  };
  const inScored = (c: CardLike): boolean => {
    const z = getNestedHost(c).zone as string[] | undefined;
    return JSON.stringify(z) === JSON.stringify(["scored"]);
  };
  const inPlayArea = (c: CardLike): boolean => {
    const z = getNestedHost(c).zone as string[] | undefined;
    return JSON.stringify(z) === JSON.stringify(["play-area"]);
  };

  return (
    <div className="panel blue-shade">
      {card && card.type !== "Basic Action" && (
        <>
          {!card.side || installed(card) || inScored(card) || inPlayArea(card) ? (
            <div
              style={{ textAlign: "center" }}
              onMouseOver={(e) => cardHighlightMouseOver(e, card)}
              onMouseOut={(e) => cardHighlightMouseOut(e, card)}
            >
              {trSpan(["game_card", "Card"])}: {renderMessage(getTitle(card) ?? "") as ReactNode}
            </div>
          ) : (
            <div className="prompt-card-preview"><CardView card={card} disableClick={true} /></div>
          )}
          <hr />
        </>
      )}
      <h4>{renderMessage(msg ?? "") as ReactNode}</h4>

      {(() => {
        // Number prompt
        if (typeof choices === "object" && choices !== null && "number" in (choices as Record<string, unknown>)) {
          const ch = choices as { number: number; default?: number; minimum?: number };
          const min = ch.minimum ?? 0;
          return (
            <div>
              <div className="credit-select">
                <select
                  id="credit"
                  defaultValue={ch.default ?? 0}
                  ref={numberCredit}
                  onKeyUp={(e) => e.key === "Enter" && document.getElementById("number-submit")?.click()}
                >
                  {Array.from({ length: ch.number + 1 - min }, (_, i) => (
                    <option key={min + i} value={min + i}>{min + i}</option>
                  ))}
                </select>
              </div>
              <button
                id="number-submit"
                onClick={() =>
                  sendCommand("choice", {
                    eid: promptEid(side as string),
                    choice: strToInt((document.getElementById("credit") as HTMLSelectElement | null)?.value ?? "0"),
                  })
                }
              >
                {trSpan(["game_ok", "OK"])}
              </button>
            </div>
          );
        }
        if (promptType === "trace") {
          return <TraceDiv promptState={promptState} />;
        }
        if (choices === "credit") {
          const sidePlayer = gs?.[side as keyof GameStateData] as PlayerState | undefined;
          const n = sidePlayer?.credit ?? 0;
          return (
            <div>
              <div className="credit-select">
                <select id="credit" onKeyUp={(e) => e.key === "Enter" && document.getElementById("credit-submit")?.click()}>
                  {Array.from({ length: n + 1 }, (_, i) => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>
              </div>
              <button
                id="credit-submit"
                onClick={() =>
                  sendCommand("choice", {
                    eid: promptEid(side as string),
                    choice: strToInt((document.getElementById("credit") as HTMLSelectElement | null)?.value ?? "0"),
                  })
                }
              >
                {trSpan(["game_ok", "OK"])}
              </button>
            </div>
          );
        }
        if (typeof choices === "object" && choices !== null && "card-title" in (choices as Record<string, unknown>)) {
          return (
            <div>
              <div className="credit-select">
                <input
                  id="card-title"
                  ref={cardTitleInput}
                  placeholder="Enter a card title"
                  onKeyUp={(e) => e.key === "Enter" && document.getElementById("card-submit")?.click()}
                />
              </div>
              <button
                id="card-submit"
                onClick={() =>
                  sendCommand("choice", {
                    eid: promptEid(side as string),
                    choice: (document.getElementById("card-title") as HTMLInputElement | null)?.value ?? "",
                  })
                }
              >
                {trSpan(["game_ok", "OK"])}
              </button>
            </div>
          );
        }
        if (typeof choices === "object" && choices !== null && "counter" in (choices as Record<string, unknown>)) {
          const ch = choices as { counter: string };
          const counter = (promptState as { card?: { counter?: Record<string, number> } }).card?.counter?.[ch.counter] ?? 0;
          return (
            <div>
              <div className="credit-select">
                <select id="credit" onKeyUp={(e) => e.key === "Enter" && document.getElementById("counter-submit")?.click()}>
                  {Array.from({ length: counter + 1 }, (_, i) => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>
                {trSpan(["game_credits", "credits"])}
              </div>
              <button
                id="counter-submit"
                onClick={() =>
                  sendCommand("choice", {
                    eid: promptEid(side as string),
                    choice: strToInt((document.getElementById("credit") as HTMLSelectElement | null)?.value ?? "0"),
                  })
                }
              >
                {trSpan(["game_ok", "OK"])}
              </button>
            </div>
          );
        }
        return (
          <>
            {offerBadPub && (
              <button
                key="Bad Pub"
                onClick={(e) =>
                  sendCommand("bad-pub-choice", {
                    eid: promptEid(side as string),
                    "shift-key-held": (e as unknown as ReactMouseEvent).shiftKey,
                  })
                }
              >
                {`Bad Publicity (${offerBadPub} available)`}
              </button>
            )}
            {Array.isArray(choices) && (choices as Array<{ idx?: number; uuid?: string; value?: unknown }>).map((c, i) =>
              c.value === "Hide" ? null : (
                <button
                  key={c.idx ?? i}
                  onClick={(e) => {
                    sendCommand("choice", { eid: promptEid(side as string), choice: { uuid: c.uuid } });
                    cardHighlightMouseOut(e, c.value as CardLike);
                  }}
                  onMouseOver={(e) => cardHighlightMouseOver(e, c.value as CardLike)}
                  onMouseOut={(e) => cardHighlightMouseOut(e, c.value as CardLike)}
                >
                  {renderMessage(getTitle(c.value as CardLike) || String(c.value ?? "")) as ReactNode}
                </button>
              ),
            )}
          </>
        );
      })()}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Basic actions / button pane
// ──────────────────────────────────────────────────────────────────

function BasicActions({
  side,
  activePlayer,
  endTurn,
  runnerPhase12,
  corpPhase12,
  me,
  runnerPostDiscard,
  corpPostDiscard,
}: {
  side: "corp" | "runner" | "spectator";
  activePlayer: string | undefined;
  endTurn: boolean | undefined;
  runnerPhase12: { "requires-consent"?: boolean; corp?: boolean; runner?: boolean } | undefined;
  corpPhase12: { "requires-consent"?: boolean; corp?: boolean; runner?: boolean } | undefined;
  me: PlayerState | undefined;
  runnerPostDiscard: { "requires-consent"?: boolean; corp?: boolean; runner?: boolean } | undefined;
  corpPostDiscard: { "requires-consent"?: boolean; corp?: boolean; runner?: boolean } | undefined;
}): ReactElement {
  const phase12 = runnerPhase12 || corpPhase12;
  const postDiscard = corpPostDiscard || runnerPostDiscard;
  const phaseLocked = !!(phase12 || postDiscard);
  const sideKey = side as "corp" | "runner";
  const menuSrc = useCardMenu((s) => s.source);
  const isActiveTurn = activePlayer === side;
  const click = me?.click ?? 0;
  const basicCard = me?.["basic-action-card"] as { abilities?: JinAbility[] } | undefined;
  const abilities = basicCard?.abilities ?? [];

  return (
    <div className="panel blue-shade">
      {isActiveTurn
        ? (!phaseLocked && click === 0 && !endTurn) && (
            <button
              onClick={() => {
                useCardMenu.getState().close();
                sendCommand("end-turn");
              }}
            >
              {trSpan(["game_end-turn", "End Turn"])}
            </button>
          )
        : endTurn && !postDiscard && (
            <button
              onClick={() => {
                useAppState.setState({ "start-shown": true } as Partial<typeof useAppState.getState>);
                sendCommand("start-turn");
              }}
            >
              {trSpan(["game_start-turn", "Start Turn"])}
            </button>
          )}
      {isActiveTurn && postDiscard && condButton(
        trSpan(["game_continue-end-turn", "Continue End Turn"]),
        postDiscard["requires-consent"]
          ? !postDiscard[sideKey]
          : true,
        () => sendCommand(postDiscard["requires-consent"] ? "post-discard-pass-priority" : "end-post-discard"),
      )}
      {!isActiveTurn && postDiscard?.["requires-consent"] && condButton(
        trSpan(["game_allow-turn-end", "Allow Turn End"]),
        !postDiscard[sideKey],
        () => sendCommand("post-discard-pass-priority"),
      )}

      {isActiveTurn && phase12 && condButton(
        side === "corp"
          ? trSpan(["game_mandatory-draw", "Mandatory Draw"])
          : trSpan(["game_take-clicks", "Take Clicks"]),
        phase12["requires-consent"] ? !phase12[sideKey] : true,
        () => sendCommand(phase12["requires-consent"] ? "phase-12-pass-priority" : "end-phase-12"),
      )}
      {!isActiveTurn && phase12?.["requires-consent"] && condButton(
        side === "runner"
          ? trSpan(["game_allow-mandatory-draw", "Allow Mandatory Draw"])
          : trSpan(["game_allow-take-clicks", "Allow Take Clicks"]),
        !phase12[sideKey],
        () => sendCommand("phase-12-pass-priority"),
      )}

      {side === "runner" && (
        <div>
          {condButton(
            trSpan(["game_remove-tag", "Remove Tag"]),
            !phaseLocked &&
              playable(abilities[5]) &&
              ((me?.tag as { base?: number } | undefined)?.base ?? 0) > 0,
            () => sendCommand("remove-tag"),
          )}
          <div className="run-button menu-container">
            {condButton(
              trSpan(["game_run", "Run"]),
              !phaseLocked && click > 0,
              () => {
                sendCommand("generate-runnable-zones");
                if (menuSrc === "run-button") useCardMenu.getState().close();
                else useCardMenu.getState().open("run-button");
              },
            )}
            {menuSrc === "run-button" && (
              <div className="panel blue-shade servers-menu active-menu" style={{ display: "inline" }}>
                <ul>
                  {(((gameState()?.runner as PlayerState | undefined)?.["runnable-list"] ?? []) as string[]).map(
                    (label, i) => (
                      <CardMenuItem
                        key={i}
                        label={trGamePrompt(label)}
                        onAction={() => {
                          useCardMenu.getState().close();
                          sendCommand("run", { server: label });
                        }}
                      />
                    ),
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
      {side === "corp" && condButton(
        trSpan(["game_purge", "Purge"]),
        !phaseLocked && playable(abilities[6]),
        () => sendCommand("purge"),
      )}
      {side === "corp" && condButton(
        trSpan(["game_trash-resource", "Trash Resource"]),
        !phaseLocked && playable(abilities[5]) && isTagged(gameState() as Record<string, unknown>),
        () => sendCommand("trash-resource"),
      )}
      {condButton(
        trSpan(["game_draw", "Draw"]),
        !phaseLocked && playable(abilities[1]) && ((me?.["deck-count"] as number | undefined) ?? 0) > 0,
        () => sendCommand("draw"),
      )}
      {condButton(
        trSpan(["game_gain-credit", "Gain Credit"]),
        !phaseLocked && playable(abilities[0]),
        () => sendCommand("credit"),
      )}
    </div>
  );
}

function ButtonPane(props: {
  side: "corp" | "runner" | "spectator";
  activePlayer: string | undefined;
  run: ReactComponentPropsRun;
  encounters: ReactComponentPropsEncounters;
  endTurn: boolean | undefined;
  runnerPhase12: { "requires-consent"?: boolean; corp?: boolean; runner?: boolean } | undefined;
  corpPhase12: { "requires-consent"?: boolean; corp?: boolean; runner?: boolean } | undefined;
  runnerPostDiscard: { "requires-consent"?: boolean; corp?: boolean; runner?: boolean } | undefined;
  corpPostDiscard: { "requires-consent"?: boolean; corp?: boolean; runner?: boolean } | undefined;
  me: PlayerState | undefined;
  promptState: PromptState | undefined;
}): ReactElement {
  return (
    <div
      className="button-pane"
      onMouseOver={(e) => cardPreviewMouseOver(e)}
      onMouseOut={(e) => cardPreviewMouseOut(e)}
    >
      {(() => {
        const ps = props.promptState as (PromptState & Record<string, unknown>) | undefined;
        if (ps && (ps as { "prompt-type"?: string })["prompt-type"] !== "run") {
          return <PromptDiv promptState={ps} />;
        }
        if (props.run || props.encounters) {
          return <RunDiv side={props.side} run={props.run} encounters={props.encounters} />;
        }
        return (
          <BasicActions
            side={props.side}
            activePlayer={props.activePlayer}
            endTurn={props.endTurn}
            runnerPhase12={props.runnerPhase12}
            corpPhase12={props.corpPhase12}
            me={props.me}
            runnerPostDiscard={props.runnerPostDiscard}
            corpPostDiscard={props.corpPostDiscard}
          />
        );
      })()}
    </div>
  );
}

type ReactComponentPropsRun = {
  phase?: string;
  position?: number;
  "source-card"?: CardLike;
  "no-action"?: string;
  "corp-auto-no-action"?: boolean;
  "next-phase"?: string;
  "cannot-jack-out"?: boolean;
  server?: unknown[] | null;
} | null;

type ReactComponentPropsEncounters = {
  ice?: CardLike;
  "encounter-count"?: number;
  "no-action"?: string;
} | null;

// ──────────────────────────────────────────────────────────────────
// Timer components
// ──────────────────────────────────────────────────────────────────

interface TimeReadout {
  minutes: number;
  seconds: number;
  pos: boolean;
}

function timeUntil(end: Date): TimeReadout {
  const diff = (end.getTime() - Date.now()) / 1000;
  const total = Math.floor(Math.abs(diff));
  return {
    minutes: Math.floor(total / 60),
    seconds: total % 60,
    pos: diff > 0,
  };
}

function timeSince(start: Date): TimeReadout {
  const diff = (Date.now() - start.getTime()) / 1000;
  const total = Math.floor(Math.abs(diff));
  return {
    minutes: Math.floor(total / 60),
    seconds: total % 60,
    pos: diff >= 0,
  };
}

function warningClass(r: TimeReadout | null): string | undefined {
  if (!r) return undefined;
  if (!r.pos) return "danger";
  if (r.minutes <= 2) return "red";
  if (r.minutes <= 5) return "yellow";
  return undefined;
}

function TimeRemaining({
  startDate,
  timer,
  hidden,
}: {
  startDate: string;
  timer: number;
  hidden: boolean;
}): ReactElement | null {
  const [remaining, setRemaining] = useState<TimeReadout | null>(null);
  const endTime = useMemo(() => {
    const d = new Date(startDate);
    d.setMinutes(d.getMinutes() + timer);
    return d;
  }, [startDate, timer]);

  useEffect(() => {
    const i = window.setInterval(() => setRemaining(timeUntil(endTime)), 1000);
    return () => clearInterval(i);
  }, [endTime]);

  if (!remaining || hidden) return null;
  return (
    <span className={`float-center timer ${warningClass(remaining) ?? ""}`}>
      {!remaining.pos && "-"}
      {remaining.minutes}{trSpan(["game_minutes", "m:"])}
      {remaining.seconds}{trSpan(["game_seconds-remaining", "s remaining"])}
    </span>
  );
}

function MatchDuration({ startDate, hidden }: { startDate: string; hidden: boolean }): ReactElement | null {
  const [duration, setDuration] = useState<TimeReadout | null>(null);
  useEffect(() => {
    const i = window.setInterval(() => setDuration(timeSince(new Date(startDate))), 1000);
    return () => clearInterval(i);
  }, [startDate]);
  if (hidden || !duration) return null;
  return (
    <span className="float-center timer">
      {duration.minutes}{trSpan(["game_minutes", "m:"])}
      {duration.seconds}{trSpan(["game_seconds", "s"])}
    </span>
  );
}

function adjustedRoundEnd(): Date | null {
  const cg = appState().currentGame as Record<string, unknown> | null;
  if (!cg) return null;
  if (cg.room !== "competitive") return null;
  if (cg.excluded) return null;
  const ret = cg["round-end-time"] as string | number | null | undefined;
  if (!ret) return null;
  const ext = (cg["time-extension"] as number | undefined) ?? 0;
  const d = new Date(ret);
  d.setMinutes(d.getMinutes() + ext);
  return d;
}

function StartingTimestamp({ startDate, timer }: { startDate: string | undefined; timer: number | undefined }): ReactElement | null {
  const [hideTimer, setHideTimer] = useState(false);
  if (!startDate) return null;
  const roundEnd = adjustedRoundEnd();
  const extension = (appState().currentGame as { "time-extension"?: number } | null)?.["time-extension"] ?? 0;

  if (roundEnd) {
    return (
      <div className="panel blue-shade timestamp">
        {trElement("span", ["game_round-end", "Round end"], { timestamp: roundEnd.toLocaleTimeString() })}
        {extension > 0 && trElement(
          "span",
          ["game_round-extension", `(includes ${extension}m time extension)`],
          { extension: String(extension) },
        )}
      </div>
    );
  }
  return (
    <div className="panel blue-shade timestamp">
      {trElement("span", ["game_game-start", "Game start"], {
        timestamp: new Date(startDate).toLocaleTimeString(),
      })}
      <span className="pm" onClick={() => setHideTimer(!hideTimer)}>
        {hideTimer ? "+" : "-"}
      </span>
      {timer ? (
        <span onClick={() => setHideTimer(!hideTimer)}>
          <TimeRemaining startDate={startDate} timer={timer} hidden={hideTimer} />
        </span>
      ) : (
        <span onClick={() => setHideTimer(!hideTimer)}>
          <MatchDuration startDate={startDate} hidden={hideTimer} />
        </span>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Keyboard handlers
// ──────────────────────────────────────────────────────────────────

function getElementForNum(num: number): HTMLElement | null {
  const containers = document.getElementsByClassName("active-menu");
  const buttonPanes = document.getElementsByClassName("button-pane");
  const container =
    (containers[0] as HTMLElement | undefined) ?? (buttonPanes[0] as HTMLElement | undefined);
  if (!container) return null;
  const index = num === 0 ? 9 : num - 1;
  const elements = useCardMenu.getState().source
    ? Array.from(container.getElementsByTagName("li"))
    : Array.from(container.getElementsByTagName("button"));
  return elements[index] ?? null;
}

function focusLogInput(clearInput: boolean): void {
  const el = document.getElementById("log-input") as HTMLInputElement | null;
  if (!el) return;
  el.focus();
  if (clearInput) el.value = "";
}

function setupKeyboard(renderBoard: () => boolean): () => void {
  const handleClick = (e: globalThis.MouseEvent) => {
    if (!renderBoard()) return;
    if (!(e.target as HTMLElement).closest(".menu-container")) {
      useCardMenu.getState().close();
    }
  };
  const handleKeyDown = (e: globalThis.KeyboardEvent) => {
    if (!renderBoard()) return;
    const activeType = (document.activeElement as HTMLInputElement | null)?.type;
    const notText = activeType !== "text";
    const canFocus = (document.activeElement as HTMLElement | null)?.getAttribute("tabindex");
    switch (e.key) {
      case "Escape":
        (document.activeElement as HTMLElement | null)?.blur();
        useCardMenu.getState().close();
        break;
      case "Enter":
        if (!activeType && !canFocus) {
          focusLogInput(false);
          e.preventDefault();
        }
        break;
      case "/":
        if (notText) focusLogInput(true);
        break;
      default:
        if (notText && /^[0-9]$/.test(e.key)) {
          const el = getElementForNum(parseInt(e.key, 10));
          el?.focus();
        }
    }
  };
  const handleKeyUp = (e: globalThis.KeyboardEvent) => {
    if (!renderBoard()) return;
    if ((document.activeElement as HTMLInputElement | null)?.type === "text") return;
    const gs = gameState();
    const side = gs?.side as string | undefined;
    const sidePlayer = side ? (gs?.[side as keyof GameStateData] as PlayerState | undefined) : undefined;
    const clicks = sidePlayer?.click ?? 0;
    const activePlayer = gs?.["active-player"] as string | undefined;
    const promptState = sidePlayer?.["prompt-state"];
    const promptType = promptState?.["prompt-type" as keyof PromptState] as string | undefined;
    const run = gs?.run as { "no-action"?: string } | undefined;
    const encounters = gs?.encounters as { "no-action"?: string } | undefined;
    const noAction = run?.["no-action"] ?? encounters?.["no-action"];

    if (e.key === " ") {
      if ((document.activeElement as HTMLInputElement | null)?.type || (document.activeElement as HTMLElement | null)?.getAttribute("tabindex")) return;
      if (run || encounters) {
        if ((!promptState || promptType === "run") && side !== noAction) {
          sendCommand("continue");
          e.stopPropagation();
        }
      } else if (promptState) {
        // no action
      } else if (clicks > 0) {
        sendCommand("credit");
        e.stopPropagation();
      } else if (activePlayer === side && clicks === 0) {
        sendCommand("end-turn");
        useCardMenu.getState().close();
        e.stopPropagation();
      }
    } else if (e.key === "Alt") {
      e.preventDefault();
    } else if (/^[0-9]$/.test(e.key)) {
      const el = getElementForNum(parseInt(e.key, 10));
      if (el && el === document.activeElement) {
        (el as HTMLElement).click();
        (el as HTMLElement).blur();
      }
    }
  };

  document.addEventListener("click", handleClick);
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);
  return () => {
    document.removeEventListener("click", handleClick);
    document.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("keyup", handleKeyUp);
  };
}

// ──────────────────────────────────────────────────────────────────
// Main GameBoard
// ──────────────────────────────────────────────────────────────────

const ContentPane = makeContentPane(["log", "settings", "run-timing", "turn-timing"]);
const ReplayContentPane = makeContentPane(["log", "settings", "notes", "notes-shared"]);

export function GameBoard(_props?: { gameId?: string }): ReactElement | null {
  void _props;
  const gs = useGameBoard((s) => s.gameState);
  const replaySide = useGameBoard((s) => s.replaySide);
  const background = useAppState((s) => s.options["background"]) as string | undefined;
  const customBgUrl = useAppState((s) => s.options["custom-bg-url"]) as string | undefined;
  const labeledUnrezzed = useAppState((s) => s.options["labeled-unrezzed-cards"]) as boolean | undefined;
  const labeledCards = useAppState((s) => s.options["labeled-cards"]) as boolean | undefined;

  // Set up button channel
  useEffect(() => {
    setButtonChannelCallback((v) => useAppState.setState({ button: v } as Partial<ReturnType<typeof useAppState.getState>>));
  }, []);

  // Keyboard handlers
  useEffect(() => {
    const cleanup = setupKeyboard(() => {
      const s = useGameBoard.getState().gameState;
      return !!(s?.corp && s?.runner && s?.side);
    });
    return cleanup;
  }, []);

  if (!gs?.corp || !gs?.runner || !gs?.side) return null;
  const side = gs.side as "corp" | "runner" | "spectator";
  const meSide: "corp" | "runner" = side === "spectator" ? (spectateSide() ?? "corp") : (side as "corp" | "runner");
  const opSide: "corp" | "runner" = (otherSide(meSide) ?? (meSide === "corp" ? "runner" : "corp")) as "corp" | "runner";

  const me = gs[meSide] as PlayerState;
  const opponent = gs[opSide] as PlayerState;
  const corpServers = (gs.corp?.servers as Record<string, ServerData> | undefined);
  const runnerRig = gs.runner?.rig as Record<string, CardLike[]> | undefined;
  const run = gs.run as ReactComponentPropsRun;
  const encounters = gs.encounters as ReactComponentPropsEncounters;
  const activePlayer = gs["active-player"] as string | undefined;
  const startDate = (gs as Record<string, unknown>)["start-date"] as string | undefined;
  const options = (gs as Record<string, unknown>).options as { timer?: number } | undefined;
  const timer = options?.timer;
  const corpPhase12 = (gs as Record<string, unknown>)["corp-phase-12"] as { "requires-consent"?: boolean; corp?: boolean; runner?: boolean } | undefined;
  const runnerPhase12 = (gs as Record<string, unknown>)["runner-phase-12"] as { "requires-consent"?: boolean; corp?: boolean; runner?: boolean } | undefined;
  const endTurn = (gs as Record<string, unknown>)["end-turn"] as boolean | undefined;
  const corpPostDiscard = (gs as Record<string, unknown>)["corp-post-discard"] as { "requires-consent"?: boolean; corp?: boolean; runner?: boolean } | undefined;
  const runnerPostDiscard = (gs as Record<string, unknown>)["runner-post-discard"] as { "requires-consent"?: boolean; corp?: boolean; runner?: boolean } | undefined;

  const bgClass = (() => {
    if (gs.replay) {
      const ps = (gs[replaySide as keyof GameStateData] as PlayerState | undefined);
      const opts = ps?.user?.["options" as keyof typeof ps.user] as Record<string, unknown> | undefined;
      return (opts?.background as string | undefined) ?? background ?? "lobby-bg";
    }
    return background ?? "lobby-bg";
  })();
  const bgStyle: React.CSSProperties = background === "custom-bg" && customBgUrl
    ? { background: `url("${customBgUrl}")`, backgroundSize: "cover" }
    : {};

  return (
    <div className="gameview">
      <div
        className={`gameboard ${labeledUnrezzed ? "show-unrezzed-card-labels" : ""} ${labeledCards ? "show-card-labels" : ""}`}
      >
        <BuildStartBox
          myIdent={me.identity}
          myUser={me.user}
          myHand={me.hand}
          promptState={me["prompt-state"]}
          myKeep={me.keep as unknown as string | undefined}
          opIdent={opponent.identity}
          opUser={opponent.user}
          opKeep={opponent.keep as unknown as string | undefined}
          meQuote={me.quote}
          opQuote={opponent.quote}
          mySide={side}
        />

        <BuildDecksBox />
        <BuildWinBox />

        <div className={bgClass} style={bgStyle} />

        <div className="right-pane">
          <CardZoomView />
          {gs.replay ? <ReplayContentPane /> : <ContentPane />}
        </div>

        <div className="centralpane">
          {opSide === "corp" ? (
            <BoardViewCorp
              playerSide={side}
              identity={opponent.identity!}
              deck={opponent.deck ?? []}
              deckCount={opponent["deck-count"] as number | undefined}
              hand={opponent.hand ?? []}
              handCount={opponent["hand-count"] as number | undefined}
              discard={opponent.discard ?? []}
              servers={corpServers}
              run={run as { server?: unknown[] | null; phase?: string; position?: number } | null}
            />
          ) : (
            <BoardViewRunner
              playerSide={side}
              identity={opponent.identity!}
              deck={opponent.deck ?? []}
              deckCount={opponent["deck-count"] as number | undefined}
              hand={opponent.hand ?? []}
              handCount={opponent["hand-count"] as number | undefined}
              discard={opponent.discard ?? []}
              rig={opponent.rig as Record<string, CardLike[]> | undefined}
              run={run as { server?: unknown[] | null; phase?: string; position?: number } | null}
              servers={corpServers}
            />
          )}
          {meSide === "corp" ? (
            <BoardViewCorp
              playerSide={side}
              identity={me.identity!}
              deck={me.deck ?? []}
              deckCount={me["deck-count"] as number | undefined}
              hand={me.hand ?? []}
              handCount={me["hand-count"] as number | undefined}
              discard={me.discard ?? []}
              servers={corpServers}
              run={run as { server?: unknown[] | null; phase?: string; position?: number } | null}
            />
          ) : (
            <BoardViewRunner
              playerSide={side}
              identity={me.identity!}
              deck={me.deck ?? []}
              deckCount={me["deck-count"] as number | undefined}
              hand={me.hand ?? []}
              handCount={me["hand-count"] as number | undefined}
              discard={me.discard ?? []}
              rig={runnerRig}
              run={run as { server?: unknown[] | null; phase?: string; position?: number } | null}
              servers={corpServers}
            />
          )}
        </div>

        <div className="leftpane">
          <div className="opponent">
            <HandView
              side={opSide}
              hand={opponent.hand ?? []}
              handSize={opponent["hand-size"] as { total?: number } | undefined}
              handCount={opponent["hand-count"] as number | undefined}
              popup={side === "spectator"}
            />
          </div>

          <div className="inner-leftpane">
            <div className="left-inner-leftpane">
              <div>
                <PlayerStats side={opSide} />
                <ScoredView
                  scored={opponent.scored ?? []}
                  agendaPoint={opponent["agenda-point"] ?? 0}
                  agendaPointReq={opponent["agenda-point-req"] ?? 7}
                  me={false}
                />
              </div>
              <div>
                <ScoredView
                  scored={me.scored ?? []}
                  agendaPoint={me["agenda-point"] ?? 0}
                  agendaPointReq={me["agenda-point-req"] ?? 7}
                  me={true}
                />
                <PlayerStats side={meSide} />
              </div>
            </div>

            <div className="right-inner-leftpane">
              <div>
                {!gs.replay && <StartingTimestamp startDate={startDate} timer={timer} />}
                <RfgView cards={opponent.rfg ?? []} trVec={["game_rfg", "Removed from the game"]} popup={true} />
                <RfgView cards={me.rfg ?? []} trVec={["game_rfg", "Removed from the game"]} popup={true} />
                <RfgView cards={(opponent["set-aside"] as CardLike[] | undefined) ?? []} trVec={["game_set-aside", "Set aside"]} popup={false} />
                <RfgView cards={(me["set-aside"] as CardLike[] | undefined) ?? []} trVec={["game_set-aside", "Set aside"]} popup={false} />
                <RfgView cards={(opponent.destroyed as CardLike[] | undefined) ?? []} trVec={["game_destroyed", "Destroyed"]} popup={false} />
                <RfgView cards={(me.destroyed as CardLike[] | undefined) ?? []} trVec={["game_destroyed", "Destroyed"]} popup={false} />
                <PlayAreaView user={opponent.user} trVec={["game_play-area", "Play Area"]} cards={(opponent["play-area"] as CardLike[] | undefined) ?? []} />
                <PlayAreaView user={me.user} trVec={["game_play-area", "Play Area"]} cards={(me["play-area"] as CardLike[] | undefined) ?? []} />
                <RfgView cards={(opponent.current as CardLike[] | undefined) ?? []} trVec={["game_current", "Current"]} popup={false} />
                <RfgView cards={(me.current as CardLike[] | undefined) ?? []} trVec={["game_current", "Current"]} popup={false} />
                <RfgView
                  cards={(gs as Record<string, unknown>)["last-revealed"] as CardLike[] | undefined ?? []}
                  trVec={["game_last-revealed", "Last Revealed"]}
                  popup={false}
                  noclick={true}
                />
              </div>
              {(side !== "spectator" || (spectatorViewHidden() && spectateSide())) && (
                <ButtonPane
                  side={meSide}
                  activePlayer={activePlayer}
                  run={run}
                  encounters={encounters}
                  endTurn={endTurn}
                  runnerPhase12={runnerPhase12}
                  corpPhase12={corpPhase12}
                  runnerPostDiscard={runnerPostDiscard}
                  corpPostDiscard={corpPostDiscard}
                  me={me}
                  promptState={me["prompt-state"]}
                />
              )}
            </div>

            <div className="me">
              <HandView
                side={meSide}
                hand={me.hand ?? []}
                handSize={me["hand-size"] as { total?: number } | undefined}
                handCount={me["hand-count"] as number | undefined}
                popup={true}
                discard={me.discard ?? []}
              />
            </div>
          </div>
        </div>
      </div>
      {/* Replay panel intentionally omitted — replay.tsx exports default differently */}
    </div>
  );
}

export default GameBoard;
