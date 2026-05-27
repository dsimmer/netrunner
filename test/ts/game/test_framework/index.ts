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

export function findCard(title: string, cards: Card[]): Card | undefined;
export function findCard(state: GameState, title: string): Card | undefined;
export function findCard(
  arg1: string | GameState,
  arg2: Card[] | string,
): Card | undefined {
  if (typeof arg1 !== "string" && typeof arg2 === "string") {
    const allCards = core.getAllCards(arg1);
    return allCards.find(
      (c: Card) => c?.title === arg2 || c?.printedTitle === arg2,
    );
  }
  return (arg2 as Card[])?.find(
    (c: Card) => c?.title === arg1 || c?.printedTitle === arg1,
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
// Icon helpers
// ============================================================

export function cardIcons(state: GameState, card: Card): string[] {
  const resolvedCard = core.getCard(state, card);
  if (!resolvedCard) return [];
  const icons = iconSummary(resolvedCard, state);
  return icons?.filter((entry: any) => entry)?.map((entry: any) => entry[0]) ?? [];
}

export function hasIcon(state: GameState, card: Card, icon: string): boolean {
  const icons = cardIcons(state, card);
  return icons.includes(icon);
}

export function noIcons(state: GameState, card: Card): boolean {
  return cardIcons(state, card).length === 0;
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

export function anybodyWaiting(state: GameState): boolean {
  return waiting(state, "runner") || waiting(state, "corp");
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

export function ensureNoPrompts(state: GameState): void {
  if (!noPrompt(state, "corp")) {
    throw new Error("Corp has prompts open");
  }
  if (!noPrompt(state, "runner")) {
    throw new Error("Runner has prompts open");
  }
}

// ============================================================
// Deck/hand construction helpers
// ============================================================

export function qty(card: string, amount: number): string[] {
  return amount > 0 ? Array.from({ length: amount }, () => card) : [];
}

export function flattenCards(cards: (string | string[])[]): string[] {
  return cards.flatMap((c) => (Array.isArray(c) ? c : [c]));
}

export function transform(side: string, cards: (string | string[])[]): any[] {
  const flat = flattenCards(cards);
  const freq: Record<string, number> = {};
  for (const title of flat) {
    freq[title] = (freq[title] ?? 0) + 1;
  }
  return Object.entries(freq).map(([card, amt]) => ({ card, qty: amt }));
}

export function newGame(
  stateOrConfig?: GameState | any,
  config?: any,
): GameState {
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

  const corpCfg = actualConfig?.corp ?? {};
  const runnerCfg = actualConfig?.runner ?? {};
  const optionsCfg = actualConfig?.options ?? actualConfig;

  const corpDeck = corpCfg.deck ?? [];
  const runnerDeck = runnerCfg.deck ?? [];

  const corpIdentity = corpCfg.id ?? (
    corpDeck.find((c: string) =>
      [
        "Haas-Bioroid", "Weyland Consortium", "NBN", "Jinteki", "Shiro",
        "Neutral Corporation",
      ].includes(c),
    ) ?? "Neutral Corporation"
  );
  const runnerIdentity = runnerCfg.id ?? (
    runnerDeck.find((c: string) =>
      [
        "Ace of Spades", "Amalgamated Culture", "Anarch", "Apex",
        "Neutral Runner",
      ].includes(c),
    ) ?? "Neutral Runner"
  );

  const corpAllCards = flattenCards([...corpDeck, ...(corpCfg.hand ?? [])]);
  const runnerAllCards = flattenCards([...runnerDeck, ...(runnerCfg.hand ?? [])]);

  const corpCards = corpAllCards.filter((c: string) => c !== corpIdentity);
  const runnerCards = runnerAllCards.filter((c: string) => c !== runnerIdentity);

  const formatCards = (titles: string[]) =>
    titles.map((title) => ({ card: { title } }));

  const gameData: GameData = {
    gameid: "1",
    format: optionsCfg?.format ?? "casual",
    players: [
      {
        side: "Corp",
        user: { username: "Corp" },
        deck: { identity: { title: corpIdentity }, cards: formatCards(corpCards) },
      },
      {
        side: "Runner",
        user: { username: "Runner" },
        deck: { identity: { title: runnerIdentity }, cards: formatCards(runnerCards) },
      },
    ],
  };

  const gameState = initGame(gameData);
  Object.assign(state, gameState);

  if (!optionsCfg?.dontStartGame) {
    const mulligan = optionsCfg?.mulligan;
    if (mulligan === "both" || mulligan === "corp") {
      testClickPrompt(state, "corp", "Mulligan");
    } else {
      testClickPrompt(state, "corp", "Keep");
    }
    if (mulligan === "both" || mulligan === "runner") {
      testClickPrompt(state, "runner", "Mulligan");
    } else {
      testClickPrompt(state, "runner", "Keep");
    }
    if (!optionsCfg?.dontStartTurn) {
      core.processAction("start-turn", state, "corp", null);
    }
  }

  if (corpCfg.hand) {
    testStartingHand(state, "corp", corpCfg.hand);
  }
  if (runnerCfg.hand) {
    testStartingHand(state, "runner", runnerCfg.hand);
  }

  for (const side of ["corp", "runner"] as Side[]) {
    const cfg = side === "corp" ? corpCfg : runnerCfg;
    if (cfg.discard) {
      for (const title of cfg.discard) {
        const card =
          findCard(title, state[side]?.deck) ??
          findCard(title, state[side]?.hand);
        if (card) {
          core.move(state, side, card, "discard");
        }
      }
    }
    if (cfg.credits) {
      state[side].credit = cfg.credits;
    }
  }

  if (corpCfg.scoreArea) {
    testStartingScoreAreas(state, corpCfg.scoreArea, runnerCfg.scoreArea ?? []);
  } else if (runnerCfg.scoreArea) {
    testStartingScoreAreas(state, [], runnerCfg.scoreArea);
  }

  if (corpCfg.badPub) {
    if (!state.corp.badPublicity) state.corp.badPublicity = { base: 0 };
    state.corp.badPublicity.base = corpCfg.badPub;
  }

  if (runnerCfg.tags) {
    if (!state.runner.tag) state.runner.tag = { base: 0 };
    state.runner.tag.base = runnerCfg.tags;
  }

  if (optionsCfg?.startAs === "runner") {
    takeCredits(state, "corp");
  }

  core.fakeCheckpoint(state);
  return state;
}

export function startingHand(
  state: GameState,
  side: Side,
  cards: string[],
): void {
  testStartingHand(state, side, cards);
}

export function stackDeck(state: GameState, side: Side, cards: string[]): void {
  const orderedNames: string[] = flattenCards(cards);
  const deckCards = state[side]?.deck ?? [];
  const deckFreq: Record<string, number> = {};
  for (const c of deckCards) {
    deckFreq[c.title] = (deckFreq[c.title] ?? 0) + 1;
  }

  for (const title of orderedNames) {
    const card = findCard(title, state[side]?.deck);
    if (card) {
      core.move(state, side, card, "set-aside");
    }
  }
  for (const title of [...orderedNames].reverse()) {
    const setAside = state[side]?.setAside ?? [];
    const card = findCard(title, setAside);
    if (card) {
      core.move(state, side, card, "deck", { front: true });
    }
  }

  const newDeck = state[side]?.deck ?? [];
  const newDeckFreq: Record<string, number> = {};
  for (const c of newDeck) {
    newDeckFreq[c.title] = (newDeckFreq[c.title] ?? 0) + 1;
  }
  if (JSON.stringify(deckFreq) !== JSON.stringify(newDeckFreq)) {
    throw new Error("Deck is still composed of the same set of cards after being stacked");
  }

  const topNTitles = newDeck.slice(0, orderedNames.length).map((c: any) => c.title);
  if (JSON.stringify(topNTitles) !== JSON.stringify(orderedNames)) {
    throw new Error(`Deck is (from top to bottom): ${orderedNames.join(", ")}`);
  }

  core.fakeCheckpoint(state);
}

export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state));
}

// ============================================================
// Turn management
// ============================================================

export function takeCredits(state: GameState, side: Side, n?: number): void {
  const clicks = state[side]?.click ?? 0;
  const numClicks = n ?? clicks;
  for (let i = 0; i < numClicks; i++) {
    core.processAction("credit", state, side, null);
  }
  if ((state[side]?.click ?? 0) === 0) {
    core.processAction("end-turn", state, side, null);
    const otherSide = side === "corp" ? "runner" : "corp";
    if (state.gameOver) return;
    if (!waiting(state, side)) {
      core.processAction("start-turn", state, otherSide, null);
    }
  }
}

export function startTurn(state: GameState, side: Side): void {
  core.processAction("start-turn", state, side, null);
}

export function endTurn(state: GameState, side: Side): void {
  core.processAction("end-turn", state, side, null);
}

export function endPhase12(state: GameState): void {
  if (state.corp?.click > 0) {
    takeCredits(state, "corp");
  }
  if (!state.gameOver) {
    startTurn(state, "runner");
  }
}

// ============================================================
// Play cards
// ============================================================

export function playFromHand(
  state: GameState,
  side: Side,
  title: string,
  args?: any,
): Card | undefined {
  const cards = state[side]?.hand ?? [];
  const card = findCard(title, cards);
  if (!card) {
    throw new Error(`${title} not in ${side} hand`);
  }
  core.processAction("play", state, side, { card, args });
  const result = playFromHandWithPromptsImpl(state, side, [title], args);
  return result;
}

function playFromHandWithPromptsImpl(
  state: GameState,
  side: Side,
  titleOrTitles: string | string[],
  args?: any,
): Card | undefined {
  const titles = Array.isArray(titleOrTitles) ? titleOrTitles : [titleOrTitles];
  const cards = state[side]?.hand ?? [];
  let card: Card | undefined;
  for (const title of titles) {
    const found = findCard(title, cards);
    if (found) {
      card = found;
      break;
    }
  }
  if (!card) return undefined;
  core.processAction("play", state, side, { card, args });
  return card;
}

export function playFromHandWithPrompts(
  state: GameState,
  side: Side,
  title: string,
  args?: any,
  prompts?: any[],
): Card | undefined {
  const card = playFromHandWithPromptsImpl(state, side, title, args);
  if (prompts) {
    for (const prompt of prompts) {
      testClickPrompt(state, side, prompt);
    }
  }
  return card;
}

export function playAndScore(
  state: GameState,
  title: string,
  args?: any,
): boolean {
  const card = findCard(title, state.corp?.hand ?? []);
  if (!card) return false;
  const advCost = card?.advancementCost;
  if (typeof advCost !== "number") return false;
  gain(state, "corp", "click", advCost);
  gain(state, "corp", "credit", advCost);
  core.fakeCheckpoint(state);
  for (let i = 0; i < advCost; i++) {
    core.clickAdvance(state, "corp", card);
  }
  return core.processAction("score", state, "corp", { card });
}

export function scoreAgenda(
  state: GameState,
  card: Card,
  args?: any,
): boolean {
  const resolvedCard = core.getCard(state, card);
  if (!resolvedCard) return false;
  return core.processAction(
    "score",
    state,
    "corp",
    args ? { ...args, card: resolvedCard } : { card: resolvedCard },
  );
}

export function score(
  state: GameState,
  _side: Side,
  card: Card,
  args?: any,
): boolean {
  const resolvedCard = core.getCard(state, card);
  if (!resolvedCard) return false;
  return core.processAction(
    "score",
    state,
    "corp",
    args ? { ...args, card: resolvedCard } : { card: resolvedCard },
  );
}

export function playCards(state: GameState, side: Side, ...plays: any[]): void {
  for (const play of plays) {
    if (typeof play === "string") {
      playFromHand(state, side, play);
    } else if (Array.isArray(play)) {
      playFromHandWithPromptsImpl(state, side, play[0], play.slice(1));
    }
  }
}

// ============================================================
// Runs
// ============================================================

export function runEmptyServer(state: GameState, server: string): void {
  if (runOn(state, server)) {
    runContinue(state);
  }
}

export function runOn(state: GameState, server: string, args?: any): boolean {
  const run = state.run;
  if (run) return false;
  if (state.runner.click <= 0) return false;
  core.processAction("run", state, "runner", { server });
  if (!args?.waitAtInitiation) {
    core.processAction("continue", state, "corp", null);
    if (!state.run?.noAction) {
      core.processAction("continue", state, "runner", null);
    }
  }
  return state.run != null;
}

export function runContinue(state: GameState): void {
  core.processAction("continue", state, "corp", null);
  if (!state.run?.noAction) {
    core.processAction("continue", state, "runner", null);
  }
  core.fakeCheckpoint(state);
}

export function runContinueUntil(
  state: GameState,
  pred: (s: GameState) => boolean,
): void {
  if (pred(state)) return;
  let safety = 0;
  while (state.run && !pred(state) && safety < 10) {
    runContinue(state);
    safety++;
  }
}

export function runJackOut(state: GameState): void {
  core.processAction("jack-out", state, "runner", null);
}

export function runNextPhase(state: GameState, phase: string): void {
  core.processAction("continue", state, "corp", null);
  if (!state.run?.noAction) {
    core.processAction("continue", state, "runner", null);
  }
  core.fakeCheckpoint(state);
  // If still on same run, keep continuing until phase changes
  let safety = 0;
  while (state.run && state.run.phase !== phase && safety < 10) {
    core.processAction("continue", state, "corp", null);
    if (!state.run?.noAction) {
      core.processAction("continue", state, "runner", null);
    }
    core.fakeCheckpoint(state);
    safety++;
  }
}

export function encounterContinue(state: GameState): void {
  core.processAction("continue", state, "runner", null);
  core.fakeCheckpoint(state);
}

export function playRunEvent(state: GameState, title: string, server?: string): void {
  ensureNoPrompts(state);
  const card = playFromHand(state, "runner", title);
  if (server && state.run) {
    runContinueUntil(state, (s) => s.run?.successful);
  }
}

// ============================================================
// Prompt interaction
// ============================================================

function testClickPrompt(state: GameState, side: Side, value: any): void {
  core.processAction("choose", state, side, { value });
  core.fakeCheckpoint(state);
}

export function clickPrompt(state: GameState, side: Side, value: any, args?: any): void {
  testClickPrompt(state, side, value);
}

export function clickPrompts(state: GameState, side: Side, ...values: any[]): void {
  for (const value of values) {
    testClickPrompt(state, side, value);
  }
}

export function clickCard(
  state: GameState,
  side: Side,
  card: Card,
  args?: any,
): void {
  const resolvedCard = core.getCard(state, card);
  testClickPrompt(state, side, { card: resolvedCard, args });
}

// ============================================================
// Basic action click helpers
// ============================================================

export function clickAdvance(
  state: GameState,
  side: Side,
  card: Card,
): void {
  testClickPrompt(state, side, "advance");
  coreClickAdvance(state, side, card);
  core.fakeCheckpoint(state);
}

export function clickDraw(state: GameState, side: Side): void {
  testClickPrompt(state, side, "draw");
}

export function clickCredit(state: GameState, side: Side): void {
  testClickPrompt(state, side, "credit");
}

// ============================================================
// Card ability / action helpers
// ============================================================

export function cardAbility(
  state: GameState,
  side: Side,
  card: Card,
  abilityIndex: number,
  args?: any,
): boolean {
  const resolvedCard = core.getCard(state, card);
  if (!resolvedCard) return false;
  const abilities = resolvedCard.abilities ?? [];
  const ability = abilities[abilityIndex];
  if (!ability) return false;
  return core.processAction("ability", state, side, { card: resolvedCard, abilityIndex, args });
}

export function expend(
  state: GameState,
  side: Side,
  card: Card,
  abilityIndex: number,
  args?: any,
): boolean {
  return cardAbility(state, side, card, abilityIndex, args);
}

export function cardSubroutine(
  state: GameState,
  card: Card,
  subIndex: number,
): boolean {
  const resolvedCard = core.getCard(state, card);
  if (!resolvedCard) return false;
  return core.processAction("subroutine", state, "corp", { card: resolvedCard, subIndex });
}

export function fireSubs(
  state: GameState,
  card: Card,
  fromIndex?: number,
  toIndex?: number,
): void {
  const resolvedCard = core.getCard(state, card);
  const subs = resolvedCard?.subroutines ?? [];
  const start = fromIndex ?? 0;
  const end = toIndex ?? subs.length;
  for (let i = start; i < end; i++) {
    const sub = subs[i];
    if (!sub) continue;
    const broken = resolvedCard?.subroutinesBroken ?? [];
    if (broken.includes(i)) continue;
    cardSubroutine(state, card, i);
  }
}

// ============================================================
// ICE / Breaker helpers
// ============================================================

export function rez(
  state: GameState,
  side: Side,
  card: Card,
  args?: any,
): void {
  const resolvedCard = core.getCard(state, card);
  core.rez(state, side, resolvedCard, args);
  core.fakeCheckpoint(state);
}

export function derez(
  state: GameState,
  side: Side,
  card: Card,
  args?: any,
): void {
  const resolvedCard = core.getCard(state, card);
  core.rez(state, side, resolvedCard, { derez: true, ...args });
  core.fakeCheckpoint(state);
}

export function autoPump(state: GameState, server: string): void {
  const ices = getIce(state, server);
  for (const ice of ices) {
    if (!rezzed(ice)) {
      rez(state, "corp", ice);
    }
  }
}

export function autoPumpAndBreak(state: GameState, server: string): void {
  autoPump(state, server);
  const ices = getIce(state, server);
  for (const ice of ices) {
    fireSubs(state, ice);
  }
}

// ============================================================
// Advance helpers
// ============================================================

export function advance(
  state: GameState,
  side: Side,
  card: Card,
  args?: any,
): void {
  const resolvedCard = core.getCard(state, card);
  core.processAction("advance", state, side, { card: resolvedCard, ...args });
  core.fakeCheckpoint(state);
}

// ============================================================
// Trash helpers
// ============================================================

export function trash(
  state: GameState,
  side: Side,
  title: string,
  args?: any,
): void {
  const cards = state[side]?.hand ?? [];
  const card = findCard(title, cards);
  if (card) {
    core.processAction("trash", state, side, { card, ...args });
    core.fakeCheckpoint(state);
  }
}

export function trashCard(
  state: GameState,
  side: Side,
  card: Card,
  args?: any,
): void {
  const resolvedCard = core.getCard(state, card);
  core.processAction("trash", state, side, { card: resolvedCard, ...args });
  core.fakeCheckpoint(state);
}

export function trashFromHand(
  state: GameState,
  side: Side,
  title: string,
  args?: any,
): void {
  trash(state, side, title, args);
}

export function trashResource(
  state: GameState,
  pos: number,
): void {
  const resources = state.runner?.rig?.resource ?? [];
  const card = resources[pos];
  if (card) {
    core.processAction("trash", state, "runner", { card });
    core.fakeCheckpoint(state);
  }
}

// ============================================================
// Trash prompt helper (for card effects)
// ============================================================

export function doTrashPrompt(state: GameState, cost: number): void {
  clickPrompt(state, "runner", `Pay ${cost} [Credits] to trash`);
}

export function selectBadPub(
  state: GameState,
  side: Side,
  index: number,
): void {
  clickPrompt(state, side, index);
}

// ============================================================
// Zone assertion helpers
// ============================================================

export function isHand(state: GameState, side: Side, expected: string[]): void {
  const handCards = state[side]?.hand ?? [];
  const actual = [...handCards.map((c: Card) => c.title)].sort();
  const expectedSorted = [...expected].sort();
  expect(actual).toEqual(expectedSorted);
}

export function isDiscard(state: GameState, side: Side, expected: string[]): void {
  const discardCards = state[side]?.discard ?? [];
  const actual = [...discardCards.map((c: Card) => c.title)].sort();
  const expectedSorted = [...expected].sort();
  expect(actual).toEqual(expectedSorted);
}

export function isDeck(state: GameState, side: Side, expected: string[]): void {
  const deckCards = state[side]?.deck ?? [];
  const actual = deckCards.map((c: Card) => c.title);
  const expectedSorted = [...expected].sort();
  const actualSorted = [...actual].sort();
  expect(actualSorted).toEqual(expectedSorted);
}

export function isDeckStacked(state: GameState, side: Side, expected: string[]): void {
  const deckCards = state[side]?.deck ?? [];
  const actual = deckCards.map((c: Card) => c.title);
  expect(actual).toEqual(expected);
}

// ============================================================
// Move cards
// ============================================================

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
  resource: string,
  amount: number,
): void {
  core.gain(state, side, resource, amount);
  core.fakeCheckpoint(state);
}

export function lose(
  state: GameState,
  side: Side,
  resource: string,
  amount: number,
): void {
  core.lose(state, side, resource, amount);
  core.fakeCheckpoint(state);
}

export function addProp(
  state: GameState,
  side: Side,
  prop: string,
  value: any,
): void {
  core.addProp(state, side, prop, value);
  core.fakeCheckpoint(state);
}

export function makeEid(state: GameState): string {
  return core.makeEID(state);
}

export function gainClicks(state: GameState, side: Side, n: number): void {
  state[side].click = (state[side]?.click ?? 0) + n;
  core.fakeCheckpoint(state);
}

// ============================================================
// Tags
// ============================================================

// countTags can be called with just state (returns total tags for runner)
// or with state, side, tag (returns count of specific tag)
// Tags are primarily a runner mechanic
export function countTags(state: GameState, side: Side, tag: string): number;
export function countTags(state: GameState): number;
export function countTags(
  state: GameState,
  side?: Side,
  tag?: string,
): number {
  const activeSide = side ?? "runner";
  const player = state[activeSide];
  const total = player?.tag;
  if (!total) return 0;
  const real = total?.real ?? 0;
  const virtual = total?.virtual ?? {};
  if (tag === undefined) {
    // Return total tags
    return real + Object.values(virtual).reduce((sum: number, v: number) => sum + v, 0);
  }
  return (real > 0 && tag === "Any" ? real : 0) + (virtual[tag] ?? 0);
}

export function countRealTags(state: GameState, side: Side, tag: string): number;
export function countRealTags(state: GameState): number;
export function countRealTags(
  state: GameState,
  side?: Side,
  tag?: string,
): number {
  const activeSide = side ?? "runner";
  const player = state[activeSide];
  const total = player?.tag;
  if (!total) return 0;
  const real = total?.real ?? 0;
  if (tag === undefined) return real;
  return (real > 0 && tag === "Any" ? real : 0);
}

// isTagged can be called with just state (checks if runner has any tags)
// or with state and tag (checks for specific tag)
export function isTagged(state: GameState): boolean;
export function isTagged(state: GameState, tag: string): boolean;
export function isTagged(state: GameState, tag?: string): boolean {
  return countTags(state, tag) > 0;
}

export function countBadPub(state: GameState): number {
  return state.corp?.badPublicity?.base ?? 0;
}

export function getLink(state: GameState): number {
  return core.getLink(state);
}

export function handSize(state: GameState, side: Side): number {
  return (state[side]?.hand?.length ?? 0);
}

// ============================================================
// Log assertions
// ============================================================

export function logStr(state: GameState, n: number): string {
  const log = state.log ?? [];
  if (n === 0) return log[log.length - 1]?.msg ?? "";
  if (n > 0) return log[n]?.msg ?? "";
  return log[log.length + n]?.msg ?? "";
}

export function printLog(state: GameState): void {
  const log = state.log ?? [];
  for (const entry of log) {
    console.log(entry.msg ?? "");
  }
}

export function lastLogContains(state: GameState, substr: string): boolean {
  const log = state.log ?? [];
  const last = log[log.length - 1]?.msg ?? "";
  return last.includes(substr);
}

export function secondLastLogContains(state: GameState, substr: string): boolean {
  const log = state.log ?? [];
  const last = log[log.length - 2]?.msg ?? "";
  return last.includes(substr);
}

export function lastNLogContains(state: GameState, n: number, substr: string): boolean {
  const log = state.log ?? [];
  for (let i = log.length - 1; i >= 0 && i >= log.length - n; i--) {
    if ((log[i]?.msg ?? "").includes(substr)) return true;
  }
  return false;
}

// ============================================================
// Change tracker
// ============================================================

export function changed(getVal: () => any, delta: number, fn: () => void): boolean {
  const before = getVal();
  fn();
  const after = getVal();
  return after === before + delta;
}

export function changedMulti(
  getVal: () => any,
  getDelta: () => number,
  fn: () => void,
): boolean {
  const before = getVal();
  fn();
  const after = getVal();
  return after === before + getDelta();
}

// ============================================================
// Memory helpers
// ============================================================

export function providesMu(card: Card): boolean {
  return !!card?.muCost;
}

// ============================================================
// Internal helper: starting hand setup
// ============================================================

function testStartingHand(
  state: GameState,
  side: Side,
  cardNames: string[],
): void {
  const flatNames = flattenCards(cardNames);
  state[side].hand = flatNames.map((title) => {
    const existing = findCard(title, state[side]?.deck ?? []);
    if (existing) {
      core.move(state, side, existing, "hand");
      return existing;
    }
    const card = core.makeCard(title);
    card.zone = ["hand"] as any;
    return card;
  });
  core.fakeCheckpoint(state);
}

function testStartingScoreAreas(
  state: GameState,
  corpCards: string[],
  runnerCards: string[],
): void {
  for (const title of flattenCards(corpCards)) {
    const card = findCard(title, state.corp?.deck ?? []);
    if (card) {
      core.move(state, "corp", card, "scored");
    }
  }
  for (const title of flattenCards(runnerCards)) {
    const card = findCard(title, state.runner?.deck ?? []);
    if (card) {
      core.move(state, "runner", card, "scored");
    }
  }
  core.fakeCheckpoint(state);
}

// ============================================================
// Flashback (play from discard)
// ============================================================

export function flashback(
  state: GameState,
  side: Side,
  title: string,
  args?: any,
): Card | undefined {
  const discard = state[side]?.discard ?? [];
  const card = findCard(title, discard);
  if (card) {
    core.processAction("play", state, side, { card, flashback: true, ...args });
    return card;
  }
  return undefined;
}

// ============================================================
// Tag mutation helpers
// ============================================================

export function gainTags(state: GameState, side: Side, n: number): void {
  const eid = core.makeEID(state);
  core.gainTags(state, side, eid, n);
  core.fakeCheckpoint(state);
}

export function loseTags(state: GameState, side: Side, tag: string, n: number): void {
  core.loseTags(state, side, tag, n);
  core.fakeCheckpoint(state);
}

export function removeTag(state: GameState, side: Side): void {
  core.processAction("remove-tag", state, side, null);
  core.fakeCheckpoint(state);
}

// ============================================================
// Damage / Draw / Purge / Trace
// ============================================================

export function damage(
  state: GameState,
  side: Side,
  damageType: string,
  amount: number,
): void {
  core.damage(state, side, damageType, amount);
  core.fakeCheckpoint(state);
}

export function draw(state: GameState, side: Side, n: number): void {
  core.draw(state, side, n);
  core.fakeCheckpoint(state);
}

export function purge(state: GameState, side: Side, card: Card): void {
  core.purge(state, side, card);
  core.fakeCheckpoint(state);
}

export function trace(
  state: GameState,
  strength: number,
  tags: string[],
  args?: any,
): boolean {
  return core.initTrace(state, strength, tags, args);
}

// ============================================================
// Change values
// ============================================================

export function change(
  state: GameState,
  side: Side,
  key: string,
  value: any,
): void {
  state[side][key] = value;
  core.fakeCheckpoint(state);
}

// ============================================================
// Test helper: run and encounter ice test
// ============================================================

export function runAndEncounterIceTest(
  state: GameState,
  server: string,
): void {
  runEmptyServer(state, server);
}

// ============================================================
// Test helper: subroutine test
// ============================================================

export function subroutineTest(
  state: GameState,
  server: string,
  iceIndex: number,
  subIndex: number,
): void {
  const ice = getIce(state, server, iceIndex);
  if (ice) {
    cardSubroutine(state, ice, subIndex);
  }
}

// ============================================================
// Test helper: fire all subs test
// ============================================================

export function fireAllSubsTest(
  state: GameState,
  server: string,
  iceIndex: number,
): void {
  const ice = getIce(state, server, iceIndex);
  if (ice) {
    fireSubs(state, ice);
  }
}

// ============================================================
// BeforeEach helper (for test setup)
// ============================================================

export function beforeEach(setupFn: (state: GameState) => void): void {
  // This is a no-op helper for the test framework pattern.
  // Actual before_each is handled by Vitest's beforeEach.
}

// ============================================================
// doGame helper - creates an empty state object and passes it
// to the callback for game setup (mirrors Clojure's do-game macro)
// ============================================================

export function doGame(fn: (state: GameState) => void): void {
  const state: GameState = {};
  fn(state);
}

// ============================================================
// Expect is available globally from vitest (globals: true)
// Re-export for convenience
// ============================================================
import { expect } from "vitest";
export { expect };

// ============================================================
// Re-export assertion helpers from asserts.ts
// ============================================================
export {
  assertLastLogContains,
  assertSecondLastLogContains,
  assertLastNLogContains,
  assertPromptIsType,
  assertPromptIsCard,
  assertNoPrompt,
  assertChanged,
  assertChangedWithDesc,
  assertCounters,
  assertAdvancementCounters,
  assertArtifacts,
  assertUniquenessViolation,
  assertZone,
  assertInZone,
  assertCredits,
  assertClicks,
  assertTags,
  assertBadPublicity,
  assertGameOver,
  assertGameActive,
  assertWinner,
} from "./asserts";
