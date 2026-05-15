import * as core from "@/game/core";
import { initGame, type GameData } from "@/game/core/set_up";

export type Side = "corp" | "runner";
export type Zone =
  | "hand"
  | "deck"
  | "discard"
  | "scored"
  | "rfg"
  | "set-aside"
  | "play-area";
export type GameState = any;
export type Card = any;

// ============================================================
// State accessors
// ============================================================

export function getCorp(state: GameState): any {
  return state.corp;
}

export function getRunner(state: GameState): any {
  return state.runner;
}

export function getRun(state: GameState): any {
  return state.run;
}

export function getPromptMap(state: GameState, side: Side): any {
  return state[side]?.prompt?.[0];
}

// ============================================================
// Card helpers
// ============================================================

export function findCard(title: string, cards: Card[]): Card | undefined {
  return cards?.find(
    (c: Card) => c?.title === title || c?.printedTitle === title,
  );
}

export function refresh(state: GameState, card: Card): Card {
  return core.getCard(state, card);
}

export function getTitle(card: Card): string {
  return card?.title ?? "";
}

export function rezzed(card: Card): boolean | string {
  return card?.rezzed ?? false;
}

export function faceup(card: Card): boolean {
  return !!(card?.faceup || card?.rezzed);
}

export function getCounters(card: Card, counterType: string): number {
  return card?.counters?.[counterType] ?? 0;
}

export function sameCard(a: Card, b: Card): boolean {
  return a?.cid != null && a?.cid === b?.cid;
}

export function hasSubtype(card: Card, subtype: string): boolean {
  return core.hasSubtype(card, subtype);
}

export function installed(card: Card): boolean {
  return card?.installed != null && card.installed !== false;
}

// ============================================================
// Zone accessors
// ============================================================

export function getIce(state: GameState, server: string, pos?: number): any {
  const ices = state.corp?.servers?.[server]?.ices ?? [];
  return pos === undefined ? ices : ices[pos];
}

export function getContent(
  state: GameState,
  server: string,
  pos?: number,
): any {
  const content = state.corp?.servers?.[server]?.content ?? [];
  return pos === undefined ? content : content[pos];
}

export function getProgram(state: GameState, pos?: number): any {
  const programs = state.runner?.rig?.program ?? [];
  return pos === undefined ? programs : programs[pos];
}

export function getHardware(state: GameState, pos?: number): any {
  const hardware = state.runner?.rig?.hardware ?? [];
  return pos === undefined ? hardware : hardware[pos];
}

export function getResource(state: GameState, pos?: number): any {
  const resources = state.runner?.rig?.resource ?? [];
  return pos === undefined ? resources : resources[pos];
}

export function getRunnerFacedown(state: GameState, pos?: number): any {
  const facedowns = state.runner?.rig?.facedown ?? [];
  return pos === undefined ? facedowns : facedowns[pos];
}

export function getScored(
  state: GameState,
  side: Side,
  x?: number | string,
): any {
  const scored = state[side]?.scored ?? [];
  if (x === undefined) return scored;
  if (typeof x === "number") return scored[x];
  return findCard(x, scored);
}

export function getRfg(state: GameState, side: Side, pos?: number): any {
  const rfg = state[side]?.rfg ?? [];
  return pos === undefined ? rfg : rfg[pos];
}

export function getDiscarded(state: GameState, side: Side, pos?: number): any {
  const discard = state[side]?.discard ?? [];
  return discard[pos ?? discard.length - 1];
}

export function getRunEvent(state: GameState, pos?: number): any {
  const playArea = state.runner?.playArea ?? [];
  return pos === undefined ? playArea : playArea[pos];
}

export function getStrength(card: Card): number {
  return card?.currentStrength ?? card?.strength ?? 0;
}

// ============================================================
// Prompt helpers
// ============================================================

export function noPrompt(state: GameState, side: Side): boolean {
  const prompt = getPromptMap(state, side);
  return !prompt || prompt.promptType === "run";
}

export function waiting(state: GameState, side: Side): boolean {
  const prompt = getPromptMap(state, side);
  return prompt?.promptType === "waiting";
}

export function promptButtons(state: GameState, side: Side): any[] {
  const prompt = getPromptMap(state, side);
  return prompt?.choices?.map((c: any) => c.value) ?? [];
}

export function promptTitles(state: GameState, side: Side): string[] {
  return promptButtons(state, side).map((b: any) => b?.title ?? b);
}

export function accessing(state: GameState, title: string): boolean {
  return state.runner?.prompt?.[0]?.card?.title === title;
}

export function promptIsCard(
  state: GameState,
  side: Side,
  card: Card,
): boolean {
  const prompt = getPromptMap(state, side);
  return card?.cid != null && prompt?.card?.cid === card.cid;
}

export function promptIsType(
  state: GameState,
  side: Side,
  promptType: string,
): boolean {
  const prompt = getPromptMap(state, side);
  return prompt?.promptType === promptType;
}

// ============================================================
// Deck/hand construction helpers
// ============================================================

export function qty(card: string, amount: number): string[] {
  return Array.from({ length: amount }, () => card);
}

export function newGame(
  stateOrConfig?: GameState | any,
  config?: any,
): GameState {
  // Support both patterns:
  // - newGame({corp: {...}, runner: {...}}) - config as first arg
  // - newGame(state, {corp: {...}, runner: {...}}) - state + config
  let state: GameState;
  let actualConfig: any;

  if (config !== undefined) {
    state = stateOrConfig as GameState;
    actualConfig = config;
  } else {
    state = stateOrConfig ?? {};
    actualConfig = (stateOrConfig as any)?.corp !== undefined || (stateOrConfig as any)?.runner !== undefined
      ? stateOrConfig
      : {};
  }

  // Build game data from config, mirroring Clojure's new-game/make-decks
  const corpCfg = actualConfig?.corp ?? {};
  const runnerCfg = actualConfig?.runner ?? {};

  const corpDeck = corpCfg.deck ?? [];
  const runnerDeck = runnerCfg.deck ?? [];

  // Find identity cards in decks, use first one or default
  const corpIdentity =
    corpDeck.find((c: string) =>
      [
        "Haas-Bioroid",
        "Weyland Consortium",
        "NBN",
        "Jinteki",
        "Shiro",
        "Neutral Corporation",
      ].includes(c),
    ) ?? "Neutral Corporation";
  const runnerIdentity =
    runnerDeck.find((c: string) =>
      [
        "Ace of Spades",
        "Amalgamated Culture",
        "Anarch",
        "Apex",
        "Neutral Runner",
      ].includes(c),
    ) ?? "Neutral Runner";

  // Filter out identity from deck cards
  const corpCards = corpDeck.filter((c: string) => c !== corpIdentity);
  const runnerCards = runnerDeck.filter((c: string) => c !== runnerIdentity);

  const gameData: GameData = {
    gameid: "1",
    format: config?.format ?? "Standard",
    players: [
      {
        side: "Corp",
        user: { username: "Corp" },
        deck: { identity: corpIdentity, cards: corpCards },
      },
      {
        side: "Runner",
        user: { username: "Runner" },
        deck: { identity: runnerIdentity, cards: runnerCards },
      },
    ],
  };

  const gameState = initGame(gameData);
  Object.assign(state, gameState);

  // Handle mulligan (keep by default)
  if (!config?.dontStartGame) {
    core.clickPrompt(state, "corp", "Keep");
    core.clickPrompt(state, "runner", "Keep");
    if (!config?.dontStartTurn) {
      core.startTurn(state, "corp");
    }
  }

  // Set up hands
  if (corpCfg.hand) {
    core.startingHand(state, "corp", corpCfg.hand);
  }
  if (runnerCfg.hand) {
    core.startingHand(state, "runner", runnerCfg.hand);
  }

  // Set up discard piles
  for (const side of ["corp", "runner"] as Side[]) {
    const cfg = side === "corp" ? corpCfg : runnerCfg;
    if (cfg.discard) {
      for (const title of cfg.discard) {
        const card =
          core.findCard(title, state[side]?.deck) ??
          core.findCard(title, state[side]?.hand);
        if (card) {
          core.move(state, side, card, "discard");
        }
      }
    }
    // Set credits if specified
    if (cfg.credits) {
      state[side].credit = cfg.credits;
    }
  }

  // Handle score-area
  if (corpCfg.scoreArea) {
    for (const title of corpCfg.scoreArea) {
      const card =
        core.findCard(title, state.corp?.deck) ??
        core.findCard(title, state.corp?.hand);
      if (card) core.scoreAgenda(state, card);
    }
  }
  if (runnerCfg.scoreArea) {
    for (const title of runnerCfg.scoreArea) {
      const card =
        core.findCard(title, state.runner?.deck) ??
        core.findCard(title, state.runner?.hand);
      if (card) core.scoreAgenda(state, card);
    }
  }

  // Set bad publicity
  if (corpCfg.badPub) {
    if (!state.corp.badPublicity) state.corp.badPublicity = { base: 0 };
    state.corp.badPublicity.base = corpCfg.badPub;
  }

  // Set tags
  if (runnerCfg.tags) {
    if (!state.runner.tag) state.runner.tag = { base: 0 };
    state.runner.tag.base = runnerCfg.tags;
  }

  // start-as runner
  if (actualConfig?.startAs === "runner") {
    core.takeCredits(state, "corp");
  }

  core.fakeCheckpoint(state);
  return state;
}

export function startingHand(
  state: GameState,
  side: Side,
  cards: string[],
): void {
  core.startingHand(state, side, cards);
}

export function stackDeck(state: GameState, side: Side, cards: string[]): void {
  core.stackDeck(state, side, cards);
}

export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state));
}

// ============================================================
// Turn management
// ============================================================

export function takeCredits(state: GameState, side: Side, n?: number): void {
  core.takeCredits(state, side, n);
}

export function startTurn(state: GameState, side: Side): void {
  core.processAction("start-turn", state, side, null);
}

export function endTurn(state: GameState, side: Side): void {
  core.processAction("end-turn", state, side, null);
}

export function endPhase12(state: GameState, side: Side): void {
  core.processAction("end-phase-12", state, side, null);
}

// ============================================================
// Card plays
// ============================================================

export function playFromHand(
  state: GameState,
  side: Side,
  title: string,
  server?: string,
): boolean {
  return core.playFromHand(state, side, title, server);
}

export function playAndScore(state: GameState, title: string): boolean {
  return core.playAndScore(state, title);
}

export function scoreAgenda(state: GameState, side: Side, card: Card): boolean {
  return core.scoreAgenda(state, card);
}

export function score(
  state: GameState,
  side: Side,
  card: Card,
  args?: any,
): boolean {
  return core.processAction(
    "score",
    state,
    "corp",
    args ? { ...args, card } : { card },
  );
}

export function playCards(state: GameState, side: Side, ...plays: any[]): void {
  core.playCards(state, side, plays);
}

// ============================================================
// Runs
// ============================================================

export function runEmptyServer(state: GameState, server: string): void {
  core.runEmptyServer(state, server);
}

export function runOn(state: GameState, server: string, args?: any): boolean {
  return core.runOn(state, server, args ?? {});
}

export function runContinue(state: GameState, phase?: string): void {
  core.runContinue(state, phase);
}

export function runContinueUntil(
  state: GameState,
  phase: string,
  ice?: Card,
): void {
  core.runContinueUntil(state, phase, ice);
}

export function runJackOut(state: GameState): void {
  core.runJackOut(state);
}

export function runNextPhase(state: GameState): void {
  core.processAction("start-next-phase", state, "runner", null);
}

export function encounterContinue(state: GameState, phase?: string): void {
  core.encounterContinue(state, phase);
}

export function playRunEvent(
  state: GameState,
  card: string,
  server: string,
): void {
  core.playRunEvent(state, card, server);
}

// ============================================================
// Prompts and clicks
// ============================================================

export function clickPrompt(
  state: GameState,
  side: Side,
  choice: string | number,
  args?: any,
): void {
  core.clickPrompt(state, side, choice, args);
}

export function clickPrompts(
  state: GameState,
  side: Side,
  ...choices: (string | number)[]
): void {
  for (const choice of choices) {
    core.clickPrompt(state, side, choice);
  }
}

export function clickCard(
  state: GameState,
  side: Side,
  card: Card | string,
): void {
  core.clickCard(state, side, card);
}

export function clickAdvance(state: GameState, side: Side, card: Card): void {
  core.clickAdvance(state, side, card);
}

export function clickDraw(state: GameState, side: Side): void {
  core.processAction("draw", state, side, null);
}

export function clickCredit(state: GameState, side: Side): void {
  core.processAction("credit", state, side, null);
}

// ============================================================
// Card interactions
// ============================================================

export function rez(
  state: GameState,
  side: Side,
  card: Card,
  opts?: { expectRez?: boolean },
): void {
  core.rez(state, side, card, opts);
}

export function derez(state: GameState, side: Side, card: Card): void {
  core.processAction("derez", state, side, { card: core.getCard(state, card) });
}

export function advance(state: GameState, card: Card, n: number = 1): void {
  for (let i = 0; i < n; i++) {
    core.clickAdvance(state, "corp", card);
  }
}

export function cardAbility(
  state: GameState,
  side: Side,
  card: Card,
  ability: number | string,
  targets?: any,
): boolean {
  return core.cardAbility(state, side, card, ability, targets);
}

export function expend(state: GameState, side: Side, card: Card): boolean {
  return core.processAction("expend", state, side, {
    card: core.getCard(state, card),
  });
}

export function cardSubroutine(
  state: GameState,
  _: Side,
  card: Card,
  ability: number,
): void {
  core.processAction("subroutine", state, "corp", {
    card: core.getCard(state, card),
    subroutine: ability,
  });
}

export function cardSideAbility(
  state: GameState,
  side: Side,
  card: Card,
  ability: any,
  targets?: any,
): void {
  const ab = { card: core.getCard(state, card), ability, targets };
  const action = side === "corp" ? "corp-ability" : "runner-ability";
  core.processAction(action, state, side, ab);
}

export function fireSubs(state: GameState, card: Card): void {
  core.processAction("unbroken-subroutines", state, "corp", {
    card: core.getCard(state, card),
  });
}

export function autoPump(state: GameState, card: Card): void {
  core.processAction("dynamic-ability", state, "runner", {
    dynamic: "auto-pump",
    card: core.getCard(state, card),
  });
}

export function autoPumpAndBreak(state: GameState, card: Card): void {
  core.processAction("dynamic-ability", state, "runner", {
    dynamic: "auto-pump-and-break",
    card: core.getCard(state, card),
  });
}

export function selectBadPub(state: GameState, shiftHeld: boolean): void {
  core.processAction("bad-pub-choice", state, "runner", {
    eid: getPromptMap(state, "runner")?.eid,
    shiftKeyHeld: shiftHeld,
  });
}

// ============================================================
// Card moves and trash
// ============================================================

export function trash(state: GameState, side: Side, card: Card): void {
  core.processAction("trash", state, side, { card: core.getCard(state, card) });
}

export function trashFromHand(
  state: GameState,
  side: Side,
  title: string,
): void {
  const card = findCard(title, state[side]?.hand);
  if (card) trash(state, side, card);
}

export function trashResource(state: GameState): void {
  core.processAction("trash-resource", state, "corp", null);
}

export function move(
  state: GameState,
  side: Side,
  card: Card,
  location: Zone,
  args?: any,
): void {
  core.move(state, side, card, location, args);
  core.fakeCheckpoint(state);
}

// ============================================================
// Direct resource mutations (wrapping core)
// ============================================================

export function gain(
  state: GameState,
  side: Side,
  ...keysAndValues: any[]
): void {
  core.gain(state, side, ...keysAndValues);
  core.fakeCheckpoint(state);
}

export function lose(
  state: GameState,
  side: Side,
  ...keysAndValues: any[]
): void {
  core.lose(state, side, ...keysAndValues);
  core.fakeCheckpoint(state);
}

export function addProp(
  state: GameState,
  side: Side,
  eid: any,
  card: Card,
  key: string,
  value: any,
): void {
  core.addProp(state, side, eid, card, key, value);
  core.fakeCheckpoint(state);
}

export function makeEid(state: GameState): any {
  return core.makeEid(state);
}

export function gainClicks(state: GameState, side: Side, n: number): void {
  core.gainClicks(state, side, n);
}

export function gainTags(state: GameState, side: Side, n: number): void {
  core.gainTags(state, side, core.makeEid(state), n);
  core.fakeCheckpoint(state);
}

export function removeTag(state: GameState, side: Side): void {
  core.processAction("remove-tag", state, side, null);
}

export function loseTags(state: GameState, side: Side, n: number): void {
  core.loseTags(state, side, core.makeEid(state), n);
}

export function damage(
  state: GameState,
  side: Side,
  dmgType: string,
  qty: number,
): void {
  core.damage(state, side, core.makeEid(state), dmgType, qty, null);
  core.fakeCheckpoint(state);
}

export function draw(
  state: GameState,
  side: Side,
  n: number = 1,
  args?: any,
): void {
  core.draw(state, side, core.makeEid(state), n, args);
  core.fakeCheckpoint(state);
}

export function purge(state: GameState, side: Side): void {
  core.purge(state, side, core.makeEid(state));
  core.fakeCheckpoint(state);
}

export function trace(state: GameState, base: number): void {
  core.initTrace(
    state,
    "corp",
    core.makeCard({ title: "/trace command", side: "Corp" }),
    { base },
  );
}

export function change(
  state: GameState,
  side: Side,
  valueKey: string,
  delta: number,
): void {
  core.processAction("change", state, side, { key: valueKey, delta });
}

// ============================================================
// Stat/count helpers
// ============================================================

export function countTags(state: GameState): number {
  return (state.runner as any)?.tag?.total ?? 0;
}

export function countRealTags(state: GameState): number {
  return (state.runner as any)?.tag?.base ?? 0;
}

export function isTagged(state: GameState): boolean {
  const runner = state.runner as any;
  return !!(runner?.tag?.["is-tagged"] || countTags(state) > 0);
}

export function countBadPub(state: GameState): number {
  const badPub = (state.corp as any)?.badPublicity;
  return (badPub?.base ?? 0) + (badPub?.additional ?? 0);
}

export function getLink(state: GameState): number {
  return core.getLink(state);
}

export function handSize(state: GameState, side: Side): number {
  return core.handSizeTotal(state, side);
}

// ============================================================
// Log helpers
// ============================================================

type LogSide = "public" | "corp" | "runner";

function escapeLogString(s: string): string {
  return s.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function sideLog(side: LogSide, log: any[]): any[] {
  return (log ?? []).filter((entry: any) => entry?.[side] ?? entry?.public);
}

export function lastLogContains(
  state: GameState,
  content: string,
  side: LogSide = "public",
): boolean {
  const log = sideLog(side, state.log ?? []);
  const lastEntry = log[log.length - 1]?.text ?? "";
  return new RegExp(escapeLogString(content)).test(lastEntry);
}

export function secondLastLogContains(
  state: GameState,
  content: string,
  side: LogSide = "public",
): boolean {
  const log = sideLog(side, state.log ?? []);
  const entry = log[log.length - 2]?.text ?? "";
  return new RegExp(escapeLogString(content)).test(entry);
}

export function lastNLogContains(
  state: GameState,
  n: number,
  content: string,
  side: LogSide = "public",
): boolean {
  const log = sideLog(side, state.log ?? []);
  const entry = log[log.length - 1 - n]?.text ?? "";
  return new RegExp(escapeLogString(content)).test(entry);
}

// ============================================================
// Deck assertions
// ============================================================

export function isDeckStacked(
  state: GameState,
  side: Side,
  cards: string[],
): boolean {
  const topN = (state[side]?.deck ?? [])
    .slice(0, cards.length)
    .map((c: Card) => c?.title);
  return cards.every((title, i) => topN[i] === title);
}

// ============================================================
// Changed helpers (replacing Clojure's changed? macro)
// ============================================================

export function changed(
  getter: () => number,
  delta: number,
  body: () => void,
): boolean {
  const before = getter();
  body();
  const after = getter();
  return after - before === delta;
}

export function changedMulti(
  bindings: Array<[() => number, number]>,
  body: () => void,
): boolean {
  const befores = bindings.map(([getter]) => getter());
  body();
  const afters = bindings.map(([getter]) => getter());
  return bindings.every(([, delta], i) => afters[i] - befores[i] === delta);
}

// ============================================================
// doGame wrapper (mirrors Clojure's do-game macro)
// ============================================================

export function doGame(fn: (state: GameState) => void): void {
  const state: GameState = {};
  fn(state);
}
