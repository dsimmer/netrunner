//
/**
 * Resource Cards
 * Ported from Clojure cards/resources.clj to TypeScript
 *
 * Contains all Runner resource card definitions with their abilities and events.
 */

import type { Card, CardDef, Counter, EID, Side, State } from "../../types";
import * as coreAccess from "../core/access";
import * as coreAgendas from "../core/agendas";
import * as coreBadPublicity from "../core/bad_publicity";
import * as coreBoard from "../core/board";
import * as coreCard from "../core/card";
import * as coreCardDefs from "../core/card_defs";
import * as coreCharge from "../core/charge";
import * as coreCheckpoint from "../core/checkpoint";
import * as coreChooseOne from "../core/choose_one";
import * as coreCostFns from "../core/cost_fns";
import * as coreCosts from "../core/costs";
import * as coreDamage from "../core/damage";
import * as coreDefHelpers from "../core/def_helpers";
import * as coreDrawing from "../core/drawing";
import * as coreEffects from "../core/effects";
import * as coreEid from "../core/eid";
import * as coreEngine from "../core/engine";
import * as coreEvents from "../core/events";
import * as coreExpose from "../core/expose";
import * as coreFinding from "../core/finding";
import * as coreFlags from "../core/flags";
import * as coreGaining from "../core/gaining";
import * as coreHandSize from "../core/hand_size";
import * as coreHosting from "../core/hosting";
import * as coreIce from "../core/ice";
import * as coreIdentities from "../core/identities";
import * as coreInitializing from "../core/initializing";
import * as coreInstalling from "../core/installing";
import * as coreLink from "../core/link";
import * as coreMark from "../core/mark";
import * as coreMemory from "../core/memory";
import * as coreMoving from "../core/moving";
import * as coreOptional from "../core/optional";
import * as corePayment from "../core/payment";
import * as corePickCounters from "../core/pick_counters";
import * as corePlayInstants from "../core/play_instants";
import * as corePrevention from "../core/prevention";
import * as corePrompts from "../core/prompts";
import * as coreProps from "../core/props";
import * as coreRevealing from "../core/revealing";
import * as coreRezzing from "../core/rezzing";
import * as coreRuns from "../core/runs";
import * as coreSabotage from "../core/sabotage";
import * as coreSay from "../core/say";
import * as coreServers from "../core/servers";
import * as coreSetAside from "../core/set_aside";
import * as coreShuffling from "../core/shuffling";
import * as coreTags from "../core/tags";
import * as coreThreat from "../core/threat";
import * as coreToString from "../core/to_string";
import * as coreToasts from "../core/toasts";
import * as coreUpdate from "../core/update";
import * as coreVirus from "../core/virus";
import * as coreWinning from "../core/winning";
import * as jintekiValidator from "../../jinteki/validator";
import * as utils from "../utils";
import { req, effect, msg, wait_for, continue_ability } from "../macros";

// ---- Helper aliases ----

function toC(type: string, ...values: any[]): any {
  return corePayment.toC?.(type, ...values);
}

function addCounter(
  state: State,
  side: Side,
  eid: EID,
  card: Card,
  type: string,
  count: number,
  opts?: any,
): any {
  return coreProps.addCounter?.(state, side, eid, card, type, count, opts);
}

function gainCredits(
  state: State,
  side: Side,
  eid: EID,
  amount: number,
  opts?: any,
): any {
  return coreGaining.gainCredits?.(state, side, eid, amount, opts);
}

function loseCredits(
  state: State,
  side: Side,
  eid: EID,
  amount: number | "all",
  opts?: any,
): any {
  return coreGaining.loseCredits?.(state, side, eid, amount, opts);
}

function gainClicks(state: State, side: Side, n: number): void {
  coreGaining.gainClicks?.(state, side, n);
}

function loseClicks(state: State, side: Side, n: number): void {
  coreGaining.loseClicks?.(state, side, n);
}

function drawCards(
  state: State,
  side: Side,
  eid: EID,
  count: number,
  opts?: any,
): any {
  return coreDrawing.draw?.(state, side, eid, count, opts);
}

function trash(
  state: State,
  side: Side,
  eid: EID,
  card: Card,
  opts?: any,
): any {
  return coreMoving.trash?.(state, side, eid, card, opts);
}

function trashCards(
  state: State,
  side: Side,
  eid: EID,
  cards: Card[],
  opts?: any,
): any {
  return coreMoving.trashCards?.(state, side, eid, cards, opts);
}

function moveCard(
  state: State,
  side: Side,
  card: Card,
  zone: any,
  opts?: any,
): any {
  return coreMoving.move?.(state, side, card, zone, opts);
}

function mill(
  state: State,
  side: Side,
  eid: EID,
  target: Side,
  count: number,
): any {
  return coreMoving.mill?.(state, side, eid, target, count);
}

function damage(
  state: State,
  side: Side,
  eid: EID,
  type: string,
  count: number,
  opts?: any,
): any {
  return coreDamage.damage?.(state, side, eid, type, count, opts);
}

function gainTags(state: State, side: Side, eid: EID, count: number): any {
  return coreTags.gainTags?.(state, side, eid, count);
}

function loseTags(
  state: State,
  side: Side,
  eid: EID,
  count: number | "all",
): any {
  return coreTags.loseTags?.(state, side, eid, count);
}

function countTags(state: State): number {
  return coreTags.countTags?.(state) ?? 0;
}
function isTagged(state: State): boolean {
  return coreTags.isTagged?.(state) ?? false;
}

function isCorp(c: any): boolean {
  return coreCard.isCorp?.(c) ?? false;
}
function isRunner(c: any): boolean {
  return coreCard.isRunner?.(c) ?? false;
}
function isInstalled(c: any): boolean {
  return coreCard.isInstalled?.(c) ?? false;
}
function isAgenda(c: any): boolean {
  return coreCard.isAgenda?.(c) ?? false;
}
function isAsset(c: any): boolean {
  return coreCard.isAsset?.(c) ?? false;
}
function isEvent(c: any): boolean {
  return coreCard.isEvent?.(c) ?? false;
}
function isIce(c: any): boolean {
  return coreCard.isIce?.(c) ?? false;
}
function isProgram(c: any): boolean {
  return coreCard.isProgram?.(c) ?? false;
}
function isResource(c: any): boolean {
  return coreCard.isResource?.(c) ?? false;
}
function isHardware(c: any): boolean {
  return coreCard.isHardware?.(c) ?? false;
}
function isUpgrade(c: any): boolean {
  return coreCard.isUpgrade?.(c) ?? false;
}
function isIdentity(c: any): boolean {
  return coreCard.isIdentity?.(c) ?? false;
}
function isRezzed(c: any): boolean {
  return coreCard.isRezzed?.(c) ?? false;
}
function isFacedown(c: any): boolean {
  return coreCard.isFacedown?.(c) ?? false;
}
function isUnique(c: any): boolean {
  return c?.uniqueness === true;
}
function hasSubtype(c: any, t: string): boolean {
  return !!coreCard.hasSubtype?.(c, t);
}
function hasAnySubtype(c: any, ts: string[]): boolean {
  return coreCard.hasAnySubtype?.(c, ts) ?? false;
}
function inHand(c: any): boolean {
  return coreCard.inHand?.(c) ?? false;
}
function inDiscard(c: any): boolean {
  return coreCard.inDiscard?.(c) ?? false;
}
function inScored(c: any): boolean {
  return coreCard.inScored?.(c) ?? false;
}
function getZone(c: any): any {
  return coreCard.getZone?.(c);
}
function getCard(state: State, c: any): any {
  return coreCard.getCard?.(state, c);
}
function getCounters(c: any, t: string): number {
  return c?.counter?.[t] ?? 0;
}
function getAgendaPoints(c: any): number {
  return c?.agendaPoints ?? 0;
}
function sameCard(a: any, b: any): boolean {
  return coreCard.sameCard?.(a, b) ?? false;
}
function isCentral(z: any): boolean {
  return coreServers.isCentral?.(z) ?? false;
}
function isRemote(z: any): boolean {
  return coreServers.isRemote?.(z) ?? false;
}
function zoneToName(z: any): string {
  return coreServers.zoneToName?.(z) ?? "";
}
function serverToZone(state: State, s: any): any {
  return coreServers.serverToZone?.(state, s);
}
function unknownToKw(s: any): any {
  return coreServers.unknownToKw?.(s);
}
function getStrength(c: any): number {
  return coreIce.getStrength?.(c) ?? 0;
}
function getLink(state: State): number {
  return coreLink.getLink?.(state) ?? 0;
}
function linkPlus(n: any): any {
  return coreLink.linkPlus?.(n);
}
function runnerHandSizePlus(n: any): any {
  return coreHandSize.runnerHandSizePlus?.(n);
}
function corpHandSizePlus(n: any): any {
  return coreHandSize.corpHandSizePlus?.(n);
}
function runnerInstall(
  state: State,
  side: Side,
  eid: EID,
  t: any,
  opts?: any,
): any {
  return coreInstalling.runnerInstall?.(state, side, eid, t, opts);
}
function host(state: State, side: Side, c: any, t: any, opts?: any): any {
  return coreHosting.host?.(state, side, c, t, opts);
}
function rez(state: State, side: Side, eid: EID, c: any, opts?: any): any {
  return coreRezzing.rez?.(state, side, eid, c, opts);
}
function derez(state: State, side: Side, eid: EID, c: any, opts?: any): any {
  return coreRezzing.derez?.(state, side, eid, c, opts);
}
function breachServer(
  state: State,
  side: Side,
  eid: EID,
  srv: any[],
  opts?: any,
): any {
  return coreAccess.breachServer?.(state, side, eid, srv, opts);
}
function accessBonus(side: any, server?: any, n?: number): any {
  return coreAccess.accessBonus?.(side, server, n);
}
function steal(state: State, side: Side, eid: EID, c: any): any {
  return coreAccess.steal?.(state, side, eid, c);
}
function expose(state: State, side: Side, eid: EID, cards: any): any {
  return coreExpose.expose?.(state, side, eid, cards);
}
function makeRun(state: State, side: Side, eid: EID, srv: any, c: any): any {
  return coreRuns.makeRun?.(state, side, eid, srv, c);
}
function bypassIce(state: State): void {
  coreRuns.bypassIce?.(state);
}
function canRunServer(state: State, s: any): boolean {
  return coreRuns.canRunServer?.(state, s) ?? false;
}
function totalCardsAccessed(t: any, d?: any): number {
  return coreRuns.totalCardsAccessed?.(t, d) ?? 0;
}
function targetServer(ctx: any): any {
  return ctx?.targetServer ?? ctx?.server;
}
function registerEvents(state: State, side: Side, c: any, ev: any[]): void {
  coreEngine.registerEvents?.(state, side, c, ev);
}
function unregisterEvents(state: State, side: Side, c: any): void {
  coreEngine.unregisterEvents?.(state, side, c);
}
function triggerEvent(
  state: State,
  side: Side,
  ev: string,
  ...args: any[]
): void {
  coreEngine.triggerEvent?.(state, side, ev, ...args);
}
function pay(state: State, side: Side, eid: EID, c: any, cost: any): any {
  return coreEngine.pay?.(state, side, eid, c, cost);
}
function canPay(
  state: State,
  side: Side,
  eid: EID,
  c: any,
  t: any,
  cost: any[],
): boolean {
  return coreEngine.canPay?.(state, side, eid, c, t, cost) ?? false;
}
function trashCost(state: State, side: Side, c: any): number {
  return coreCostFns.trashCost?.(state, side, c) ?? 0;
}
function rezCost(state: State, side: Side, c: any): number {
  return coreCostFns.rezCost?.(state, side, c) ?? 0;
}
function installCost(state: State, side: Side, c: any): number {
  return coreCostFns.installCost?.(state, side, c) ?? 0;
}
function hasTrashAbility(c: any): boolean {
  return coreCostFns.hasTrashAbility?.(c) ?? false;
}
function totalAvailableCredits(
  state: State,
  side: Side,
  eid: EID,
  c: any,
): number {
  return coreCosts.totalAvailableCredits?.(state, side, eid, c) ?? 0;
}
function makeEid(state: State, opts?: any): EID {
  return coreEid.makeEID(state, opts);
}
function effectCompleted(state: State, side: any, eid: EID): void {
  coreEid.effectCompleted?.(state, side, eid);
}
function completeWithResult(state: State, side: Side, eid: EID, r: any): void {
  coreEid.completeWithResult?.(state, side, eid, r);
}
function firstEvent(state: State, side: Side, ev: string, pred?: any): boolean {
  return coreEvents.firstEvent?.(state, side, ev, pred) ?? false;
}
function firstRunEvent(
  state: State,
  side: Side,
  ev: string,
  pred?: any,
): boolean {
  return coreEvents.firstRunEvent?.(state, side, ev, pred) ?? false;
}
function firstSuccessfulRunOnServer(state: State, srv: any): boolean {
  return coreEvents.firstSuccessfulRunOnServer?.(state, srv) ?? false;
}
function noEvent(state: State, side: Side, ev: string, pred?: any): boolean {
  return coreEvents.noEvent?.(state, side, ev, pred) ?? false;
}
function turnEvents(state: State, side: Side, ev: string): any[] {
  return coreEvents.turnEvents?.(state, side, ev) ?? [];
}
function getAutoresolve(key: string, value?: any): any {
  return coreOptional.getAutoresolve?.(key, value);
}
function setAutoresolve(key: string, label: string): any {
  return coreOptional.setAutoresolve?.(key, label);
}
function trashOnEmpty(c: string): any {
  return coreDefHelpers.trashOnEmpty?.(c);
}
function drawAbi(n: number, m?: any, opts?: any): any {
  return coreDefHelpers.drawAbi?.(n, m, opts);
}
function takeNCreditsAbility(n: number, src: string, opts?: any): any {
  return coreDefHelpers.takeNCreditsAbility?.(n, src, opts);
}
function takeAllCreditsAbility(opts?: any): any {
  return coreDefHelpers.takeAllCreditsAbility?.(opts);
}
function takeCredits(
  state: State,
  side: Side,
  eid: EID,
  c: any,
  t: string,
  n: any,
  opts?: any,
): any {
  return coreDefHelpers.takeCredits?.(state, side, eid, c, t, n, opts);
}
function spendCredits(
  state: State,
  side: Side,
  eid: EID,
  c: any,
  t: string,
  n: number,
): any {
  return coreDefHelpers.spendCredits?.(state, side, eid, c, t, n);
}
function breachAccessBonus(s: any, n: number, opts?: any): any {
  return coreDefHelpers.breachAccessBonus?.(s, n, opts);
}
function offerJackOut(): any {
  return coreDefHelpers.offerJackOut?.();
}
function reorderChoice(
  s: Side,
  o: Side,
  c: any[],
  p: any[],
  n: number,
  a: any[],
  d?: string,
): any {
  return coreDefHelpers.reorderChoice?.(s, o, c, p, n, a, d);
}
function gainTagsAbility(n: number): any {
  return coreDefHelpers.gainTagsAbility?.(n);
}
function makeIcon(l: string, c: any): any {
  return coreDefHelpers.makeIcon?.(l, c);
}
function runAnyServerAbility(opts: any): any {
  return coreDefHelpers.runAnyServerAbility?.(opts);
}
function runServerAbility(s: any, opts: any): any {
  return coreDefHelpers.runServerAbility?.(s, opts);
}
function successfulRunReplaceBreach(opts: any): any {
  return coreAccess.successfulRunReplaceBreach?.(opts);
}
function chooseOneHelper(opts: any, options?: any[]): any {
  return coreChooseOne.chooseOneHelper?.(opts, options);
}
function pickVirusCountersToSpend(n: number): any {
  return corePickCounters.pickVirusCountersToSpend?.(n);
}
function chargeAbility(state: State, side: Side): any {
  return coreCharge.chargeAbility?.(state, side);
}
function canCharge(state: State, side: Side): boolean {
  return coreCharge.canCharge?.(state, side) ?? false;
}
function sabotageAbility(n: number): any {
  return coreSabotage.sabotageAbility?.(n);
}
function preventDamage(
  state: State,
  side: Side,
  eid: EID,
  n: number | "all",
): any {
  return corePrevention.preventDamage?.(state, side, eid, n);
}
function preventTag(
  state: State,
  side: Side,
  eid: EID,
  n: number | "all",
): any {
  return corePrevention.preventTag?.(state, side, eid, n);
}
function preventEncounter(state: State, side: Side, eid: EID): any {
  return corePrevention.preventEncounter?.(state, side, eid);
}
function preventable(ctx: any): boolean {
  return corePrevention.preventable?.(ctx) ?? false;
}
function damageName(state: State): string {
  return corePrevention.damageName?.(state) ?? "damage";
}
function preventTrashInstalledByType(
  n: string,
  t: any,
  cost: any[],
  pred: any,
): any {
  return corePrevention.preventTrashInstalledByType?.(n, t, cost, pred);
}
function preventUpToNDamage(n: any, types?: any): any {
  return corePrevention.preventUpToNDamage?.(n, types);
}
function preventUpToNTags(n: any): any {
  return corePrevention.preventUpToNTags?.(n);
}
function asAgenda(state: State, side: Side, c: any, p: number): any {
  return coreMoving.asAgenda?.(state, side, c, p);
}
function forfeit(state: State, side: Side, eid: EID, c: any): any {
  return coreMoving.forfeit?.(state, side, eid, c);
}
function updateAllAdvancementRequirements(state: State): void {
  coreAgendas.updateAllAdvancementRequirements?.(state);
}
function updateAllAgendaPoints(state: State): void {
  coreAgendas.updateAllAgendaPoints?.(state);
}
function checkWinByAgenda(state: State, side?: Side): void {
  coreWinning.checkWinByAgenda?.(state, side);
}
function gainBadPublicity(state: State, side: Side, eid: any, opts?: any): any {
  return coreBadPublicity.gainBadPublicity?.(state, side, eid, opts);
}
function hasBadPub(state: State): boolean {
  return coreBadPublicity.hasBadPublicity?.(state) ?? false;
}
function countBadPub(state: State): number {
  return coreBadPublicity.countBadPublicity?.(state) ?? 0;
}
function allInstalled(state: State, side: Side): any[] {
  return coreBoard.allInstalled?.(state, side) ?? [];
}
function allActive(state: State, side: Side): any[] {
  return coreBoard.allActive?.(state, side) ?? [];
}
function allActiveInstalled(state: State, side: Side): any[] {
  return coreBoard.allActiveInstalled?.(state, side) ?? [];
}
function allInstalledRunner(state: State): any[] {
  return coreBoard.allInstalledRunner?.(state) ?? [];
}
function getAllCards(state: State): any[] {
  return coreBoard.getAllCards?.(state) ?? [];
}
function flipFaceup(state: State, side: Side, c: any): void {
  coreMoving.flipFaceup?.(state, side, c);
}
function checkpoint(state: State, side: any, eid: EID): void {
  coreEngine.checkpoint?.(state, side, eid);
}
function cardStr(state: State, c: any, opts?: any): string {
  return coreToString.cardStr?.(state, c, opts) ?? "";
}
function getTitle(c: any): string {
  return coreCard.getTitle?.(c) ?? c?.title ?? "";
}
function toast(state: State, side: Side, message: string, t?: string): void {
  coreToasts.toast?.(state, side, message, t);
}
function systemMsg(state: State, side: Side, message: string): void {
  coreSay.systemMsg?.(state, side, message);
}
function playSfx(state: State, side: Side, sfx: string): void {
  coreSay.playSfx?.(state, side, sfx);
}
function updateCard(state: State, side: Side, c: any): void {
  coreUpdate.updateCard?.(state, side, c);
}
function shuffleDeck(state: State, side: Side, d: string): void {
  coreShuffling.shuffle?.(state, side, d);
}
function failToFind(): any {
  return coreShuffling.failToFind?.();
}
function cancellable(items: any, opts?: any): any {
  return corePrompts.cancellable?.(items, opts);
}
function quantify(n: number, noun: string, s?: string, p?: string): string {
  return utils.quantify?.(n, noun, s, p) ?? `${n} ${noun}`;
}
function enumerateCards(cards: any[], opts?: any): string {
  return utils.enumerateCards?.(cards, opts) ?? "";
}
function enumerateStr(items: any[]): string {
  return utils.enumerateStr?.(items) ?? "";
}
function decapitalize(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}
function strToInt(s: string): number {
  return parseInt(s, 10);
}
function legalCard(format: any, status: any, c: any): boolean {
  return jintekiValidator.legal?.(format, status, c) ?? false;
}
function hasFlag(state: State, side: Side, kind: any, flag: any): boolean {
  return coreFlags.hasFlag?.(state, side, kind, flag) ?? false;
}
function cardFlag(c: any, f: string, v: any): boolean {
  return coreFlags.cardFlag?.(c, f, v) ?? false;
}
function inCorpScored(state: State, side: Side, c: any): boolean {
  return coreFlags.inCorpScored?.(state, side, c) ?? false;
}
function registerPersistentFlag(
  state: State,
  side: Side,
  c: any,
  f: any,
  v: any,
): void {
  coreFlags.registerPersistentFlag?.(state, side, c, f, v);
}
function clearPersistentFlag(state: State, side: Side, c: any, f: any): void {
  coreFlags.clearPersistentFlag?.(state, side, c, f);
}
function registerTurnFlag(
  state: State,
  side: Side,
  c: any,
  f: any,
  fn: any,
): void {
  coreFlags.registerTurnFlag?.(state, side, c, f, fn);
}
function zoneLocked(state: State, side: Side, z: any): boolean {
  return coreFlags.zoneLocked?.(state, side, z) ?? false;
}
function disableCard(state: State, side: Side, c: any): void {
  coreIdentities.disableCard?.(state, side, c);
}
function enableCard(state: State, side: Side, c: any): void {
  coreIdentities.enableCard?.(state, side, c);
}
function registerLingeringEffect(
  state: State,
  side: Side,
  c: any,
  e: any,
): void {
  coreEffects.registerLingeringEffect?.(state, side, c, e);
}
function updateDisabledCards(state: State): void {
  coreEffects.updateDisabledCards?.(state);
}
function getVirusCounters(state: State, c: any): number {
  return coreVirus.getVirusCounters?.(state, c) ?? 0;
}
function numberOfRunnerVirusCounters(state: State): number {
  return coreVirus.numberOfRunnerVirusCounters?.(state) ?? 0;
}
function threatLevel(l: number, state: State): boolean {
  return coreThreat.threatLevel?.(l, state) ?? false;
}
function cardIndex(state: State, c: any): number | undefined {
  return coreCard.cardIndex?.(state, c);
}
function reveal(state: State, side: Side, eid: EID, cards: any): any {
  return coreRevealing.reveal?.(state, side, eid, cards);
}
function revealLoud(
  state: State,
  side: Side,
  eid: EID,
  c: any,
  opts: any,
  cards: any,
): any {
  return coreRevealing.revealLoud?.(state, side, eid, c, opts, cards);
}
function canPlayInstant(
  state: State,
  side: Side,
  eid: EID,
  c: any,
  opts?: any,
): boolean {
  return corePlayInstants.canPlayInstant?.(state, side, eid, c, opts) ?? false;
}
function playInstant(
  state: State,
  side: Side,
  eid: EID,
  c: any,
  opts?: any,
): any {
  return corePlayInstants.playInstant?.(state, side, eid, c, opts);
}
function runnerCanInstall(
  state: State,
  side: Side,
  eid: EID,
  c: any,
  opts: any,
): boolean {
  return coreInstalling.runnerCanInstall?.(state, side, eid, c, opts) ?? false;
}
function runnerCanPayAndInstall(
  state: State,
  side: Side,
  eid: EID,
  c: any,
  opts?: any,
): boolean {
  return (
    coreInstalling.runnerCanPayAndInstall?.(state, side, eid, c, opts) ?? false
  );
}
function installLocked(state: State, side: Side): boolean {
  return coreInstalling.installLocked?.(state, side) ?? false;
}
function pump(c: any, n: number, d?: any): any {
  return coreIce.pump?.(c, n, d);
}
function pumpIce(c: any, n: number, d?: any): any {
  return coreIce.pumpIce?.(c, n, d);
}
function iceStrength(state: State, side: Side, ice: any): number {
  return coreIce.iceStrength?.(state, side, ice) ?? 0;
}
function breakSubroutine(state: State, ice: any, sub: any): void {
  coreIce.breakSubroutine?.(state, ice, sub);
}
function unbrokenSubroutinesChoice(ice: any): any[] {
  return coreIce.unbrokenSubroutinesChoice?.(ice) ?? [];
}
function setNextPhase(state: State, p: any): void {
  coreRuns.setNextPhase?.(state, p);
}
function getCurrentEncounter(state: State): any {
  return coreRuns.getCurrentEncounter?.(state);
}
function updateCurrentEncounter(state: State, k: any, v: any): void {
  coreRuns.updateCurrentEncounter?.(state, k, v);
}
function activeEncounter(state: State): boolean {
  return coreRuns.activeEncounter?.(state) ?? false;
}
function getRunnableZones(
  state: State,
  side: Side,
  eid: EID,
  c: any,
  opts: any,
): any[] {
  return coreRuns.getRunnableZones?.(state, side, eid, c, opts) ?? [];
}

// ---- Local helpers (translated from Clojure private fns) ----

function geneticsTrigger(state: State, side: Side, event: string): boolean {
  return (
    firstEvent(state, side, event) ||
    (hasFlag(state, side, ":persistent", ":genetics-trigger-twice") &&
      (coreEvents.secondEvent?.(state, side, event) ?? false))
  );
}

function shardConstructor(
  title: string,
  server: any,
  message: string,
  effectFn: any,
): any {
  return {
    events: [
      Object.assign(
        {},
        successfulRunReplaceBreach({
          "target-server": server,
          ability: {
            async: true,
            effect: effect(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              runnerInstall(state, side, eid, card, {
                "ignore-all-cost": true,
                "msg-keys": { "display-origin": true, "install-source": card },
              });
            }),
          },
        }),
        { location: ":hand" },
      ),
      Object.assign(
        {},
        successfulRunReplaceBreach({
          "target-server": server,
          ability: {
            async: true,
            effect: effect(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              runnerInstall(state, side, eid, card, {
                "ignore-all-cost": true,
                "msg-keys": { "display-origin": true, "install-source": card },
              });
            }),
          },
        }),
        { location: ":hosted" },
      ),
    ],
    abilities: [
      {
        async: true,
        cost: [toC(":trash-can")],
        msg: message,
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          effectFn(state, side, eid, card, targets);
        }),
      },
    ],
  };
}

function companionBuilder(
  payCreditsReq: any,
  turnEndsAbility: any,
  ability: any,
): any {
  const placeCredit: any = {
    msg: "add 1 [Credits] to itself",
    automatic: ":gain-credits",
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      addCounter(state, side, eid, card, "credit", 1);
    }),
  };
  return {
    interactions: { "pay-credits": { req: payCreditsReq, type: ":credit" } },
    events: [
      Object.assign({}, placeCredit, { event: "runner-turn-begins" }),
      Object.assign({}, placeCredit, { event: "agenda-stolen" }),
      {
        event: "runner-turn-ends",
        req: req(function* (
          state: State,
          _s: Side,
          _e: EID,
          card: Card,
        ): Generator<any, any, any> {
          return getCounters(getCard(state, card) || card, "credit") >= 3;
        }),
        interactive: req(function* (
          state: State,
          side?: Side,
          eid?: EID,
          card?: Card,
          targets?: any[],
        ): Generator<any, any, any> {
          return true;
        }),
        async: true,
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          continue_ability(state, side, turnEndsAbility, card, targets);
        }),
      },
    ],
    abilities: [ability],
  };
}

function trashWhenTagged(name: string, c: any): any {
  const ev = (): any => ({
    req: req(function* (state: State): Generator<any, any, any> {
      return isTagged(state);
    }),
    interactive: req(function* (
      state: State,
      side?: Side,
      eid?: EID,
      card?: Card,
      targets?: any[],
    ): Generator<any, any, any> {
      return true;
    }),
    "ability-name": `${name} (trash if tagged)`,
    msg: "trash itself due to being tagged",
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      trash(state, side, eid, card, { "cause-card": card });
    }),
  });
  return Object.assign({}, c, {
    events: ([] as any[]).concat(c.events || [], [
      Object.assign(ev(), { event: "tags-changed" }),
      Object.assign(ev(), { event: "disabled-cards-updated" }),
    ]),
    "on-install": ev(),
  });
}

function biteyBoi(filterFn: "first" | "last"): any {
  return {
    abilities: [
      {
        req: req(function* (state: State): Generator<any, any, any> {
          const ice = (state as any)?.currentIce;
          return !!(getCurrentEncounter(state) && ice && isRezzed(ice));
        }),
        break: 1,
        breaks: "All",
        "break-cost": [toC(":trash-can")],
        cost: [toC(":trash-can")],
        label: `Break the ${filterFn} subroutine`,
        msg: msg("break the ", filterFn, " subroutine on current ice"),
        effect: effect(function* (state: State): Generator<any, any, any> {
          const ice = (state as any)?.currentIce;
          const subs = ice?.subroutines || [];
          const sub = filterFn === "first" ? subs[0] : subs[subs.length - 1];
          if (sub) breakSubroutine(state, ice, sub);
        }),
      },
    ],
  };
}

// ============================================================================
// Card Definitions
// ============================================================================

/** Aaron Marrón */
export const aaronMarron: CardDef = {
  title: "Aaron Marrón",
  abilities: [
    {
      cost: [toC(":power", 1)],
      "keep-menu-open": ":while-power-tokens-left",
      msg: "remove 1 tag and draw 1 card",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [{ asyncResult: "result" }, loseTags(state, side, eid, 1)],
          [],
        );
        drawCards(state, side, eid, 1);
      }),
    },
  ],
  events: [
    {
      event: "agenda-scored",
      msg: "place 2 power counters on itself",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, side, eid, card, "power", 2);
      }),
    },
    {
      event: "agenda-stolen",
      msg: "place 2 power counters on itself",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, side, eid, card, "power", 2);
      }),
    },
  ],
};

/** Access to Globalsec */
export const accessToGlobalsec: CardDef = {
  title: "Access to Globalsec",
  "static-abilities": [linkPlus(1)],
};

/** Activist Support */
export const activistSupport: CardDef = {
  title: "Activist Support",
  events: [
    {
      event: "corp-turn-begins",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        if (countTags(state) === 0) {
          gainTags(state, "runner", eid, 1);
          systemMsg(state, "runner", `uses ${card.title} to take 1 tag`);
        } else effectCompleted(state, "runner", eid);
      }),
    },
    {
      event: "runner-turn-begins",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        if (!hasBadPub(state)) {
          gainBadPublicity(state, "corp", eid, 1);
          systemMsg(
            state,
            "runner",
            `uses ${card.title} to give the corp 1 bad publicity`,
          );
        } else effectCompleted(state, "runner", eid);
      }),
    },
  ],
};

/** Adjusted Chronotype */
export const adjustedChronotype: CardDef = {
  title: "Adjusted Chronotype",
  events: [
    {
      event: "runner-click-loss",
      req: req(function* (state: State, side: Side): Generator<any, any, any> {
        const losses = turnEvents(state, side, "runner-lose").filter(
          (e: any) => e?.[0]?.type === "click",
        ).length;
        return (
          losses === 1 ||
          (losses === 2 &&
            hasFlag(state, side, ":persistent", ":genetics-trigger-twice"))
        );
      }),
      msg: "gain [Click]",
      effect: effect(function* (
        state: State,
        side: Side,
      ): Generator<any, any, any> {
        gainClicks(state, "runner", 1);
      }),
    },
  ],
};

/** Aeneas Informant */
export const aeneasInformant: CardDef = {
  title: "Aeneas Informant",
  events: [
    {
      event: "post-access-card",
      optional: {
        autoresolve: getAutoresolve(":auto-fire"),
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = (targets as any)[0]?.context || {};
          return (
            !!ctx["accessed-card-snapshot"]?.trash &&
            !inDiscard(ctx["accessed-card"])
          );
        }),
        prompt: "Gain 1 [Credits] and reveal accessed card?",
        "yes-ability": {
          async: true,
          msg: "gain 1 [Credits]",
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
          ): Generator<any, any, any> {
            gainCredits(state, side, eid, 1);
          }),
        },
      },
    },
  ],
  abilities: [setAutoresolve(":auto-fire", "Aeneas Informant")],
};

/** Aesop's Pawnshop */
export const aesopsPawnshop: CardDef = {
  title: "Aesop's Pawnshop",
  flags: {
    "runner-phase-12": req(function* (state: State): Generator<any, any, any> {
      return allInstalled(state, "runner").length >= 2;
    }),
  },
  events: [
    {
      event: "runner-turn-begins",
      skippable: true,
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      async: true,
      once: ":per-turn",
      choices: {
        "not-self": true,
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return isRunner(targets[0]) && isInstalled(targets[0]);
        }),
      },
      msg: msg("trash and gain 3 [Credits]"),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            trash(state, side, eid, targets[0], {
              unpreventable: true,
              "cause-card": card,
            }),
          ],
          [],
        );
        gainCredits(state, side, eid, 3);
      }),
    },
  ],
  abilities: [
    {
      async: true,
      label: "trash a card to gain 3 [Credits]",
      once: ":per-turn",
      choices: {
        "not-self": true,
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return isRunner(targets[0]) && isInstalled(targets[0]);
        }),
      },
      msg: msg("trash and gain 3 [Credits]"),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            trash(state, side, eid, targets[0], {
              unpreventable: true,
              "cause-card": card,
            }),
          ],
          [],
        );
        gainCredits(state, side, eid, 3);
      }),
    },
  ],
};

/** Akshara Sareen */
export const aksharaSareen: CardDef = {
  title: "Akshara Sareen",
  "in-play": [":click-per-turn", 1],
  "on-install": {
    msg: "give each player 1 additional [Click] to spend during their turn",
    effect: effect(function* (state: State): Generator<any, any, any> {
      (state as any).corp = (state as any).corp || {};
      (state as any).corp["click-per-turn"] =
        ((state as any).corp["click-per-turn"] || 3) + 1;
    }),
  },
};

/** Algo Trading */
export const algoTrading: CardDef = {
  title: "Algo Trading",
  flags: {
    "runner-phase-12": req(function* (state: State): Generator<any, any, any> {
      return ((state as any).runner?.credit || 0) > 0;
    }),
  },
  abilities: [
    {
      label: "Store up to 3 [Credit]",
      prompt: "How many credits do you want to store?",
      once: ":per-turn",
      choices: {
        number: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          return Math.min(3, totalAvailableCredits(state, "runner", eid, card));
        }),
      },
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const t = targets[0] as number;
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            addCounter(state, side, eid, card, "credit", t, {
              "suppress-checkpoint": true,
            }),
          ],
          [],
        );
        loseCredits(state, side, eid, t);
      }),
      msg: msg("store credits"),
    },
    {
      action: true,
      label: "Take all hosted credits",
      cost: [toC(":click", 1), toC(":trash-can")],
      msg: msg("gain all hosted credits"),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        playSfx(state, side, "click-credit-3");
        takeCredits(state, side, eid, card, "credit", "all");
      }),
    },
  ],
  events: [
    {
      event: "runner-turn-begins",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return getCounters(card, "credit") >= 6;
      }),
      msg: "place 2 [Credit] on itself",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, side, eid, card, "credit", 2);
      }),
    },
  ],
};

/** All-nighter */
export const allNighter: CardDef = {
  title: "All-nighter",
  abilities: [
    {
      action: true,
      cost: [toC(":click", 1), toC(":trash-can")],
      effect: effect(function* (
        state: State,
        side: Side,
      ): Generator<any, any, any> {
        gainClicks(state, side, 2);
      }),
      msg: "gain [Click][Click]",
    },
  ],
};

/** Always Be Running */
export const alwaysBeRunning: CardDef = {
  title: "Always Be Running",
  implementation: "Run requirement not enforced",
  events: [
    {
      event: "runner-turn-begins",
      effect: effect(function* (state: State): Generator<any, any, any> {
        toast(
          state,
          "runner",
          "Reminder: Always Be Running requires a run on the first click",
          "info",
        );
      }),
    },
  ],
  abilities: [
    Object.assign(
      {},
      coreIce.breakSub?.([toC(":lose-click", 2)], 1, "All", {
        req: req(function* (
          state: State,
          side?: Side,
          eid?: EID,
          card?: Card,
          targets?: any[],
        ): Generator<any, any, any> {
          return true;
        }),
      }) || {},
      { once: ":per-turn" },
    ),
  ],
};

/** Amelia Earhart */
export const ameliaEarhart: CardDef = {
  title: "Amelia Earhart",
  flags: {
    "runner-phase-12": req(function* (
      state: State,
      side?: Side,
      eid?: EID,
      card?: Card,
      targets?: any[],
    ): Generator<any, any, any> {
      return true;
    }),
  },
  events: [
    {
      event: "run-ends",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = (targets as any)[0]?.context || {};
        return (
          ["hq", "rd"].includes(targetServer(ctx)) &&
          totalCardsAccessed(ctx) >= 3
        );
      }),
      msg: "add 1 power counter to itself",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, side, eid, getCard(state, card) || card, "power", 1);
      }),
    },
    {
      event: "runner-turn-begins",
      skippable: true,
      optional: {
        prompt: "Trash this resource to force the Corp to lose 10 [Credits]?",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          return getCounters(getCard(state, card) || card, "power") >= 3;
        }),
        "yes-ability": {
          msg: "trash itself and force the Corp to lose 10 [Credits]",
          async: true,
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
          ): Generator<any, any, any> {
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                trash(state, side, eid, card, { "cause-card": card }),
              ],
              [],
            );
            loseCredits(
              state,
              "corp",
              eid,
              Math.min(10, (state as any).corp?.credit || 0),
            );
          }),
        },
      },
    },
  ],
};

/** Angel Arena */
export const angelArena: CardDef = {
  title: "Angel Arena",
  "on-install": {
    prompt: "How many credits do you want to spend?",
    choices: ":credit",
    msg: msg("place power counters"),
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      addCounter(state, side, eid, card, "power", targets[0]);
    }),
  },
  events: [trashOnEmpty("power")],
  abilities: [
    {
      cost: [toC(":power", 1)],
      "keep-menu-open": ":while-power-tokens-left",
      msg: "reveal the top card of Stack",
      "change-in-game-state": {
        req: req(function* (state: State): Generator<any, any, any> {
          return ((state as any).runner?.deck?.length || 0) > 0;
        }),
      },
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const topCard = (state as any).runner?.deck?.[0];
        if (!topCard) {
          effectCompleted(state, side, eid);
          return;
        }
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            revealLoud(state, side, eid, card, null, topCard),
          ],
          [],
        );
        continue_ability(
          state,
          side,
          {
            optional: {
              prompt: `Add ${topCard.title} to bottom of Stack?`,
              "yes-ability": {
                msg: `move ${topCard.title} to the bottom of the Stack`,
                effect: effect(function* (
                  state: State,
                  side: Side,
                ): Generator<any, any, any> {
                  const tc = (state as any).runner?.deck?.[0];
                  if (tc) moveCard(state, side, tc, ":deck");
                }),
              },
            },
          },
          card,
          null,
        );
      }),
    },
  ],
};

/** Armitage Codebusting */
export const armitageCodebusting: CardDef = {
  title: "Armitage Codebusting",
  data: { counter: { credit: 12 } },
  events: [trashOnEmpty("credit")],
  abilities: [
    takeNCreditsAbility(2, "resource", {
      label: "Take 2 [Credits]",
      action: true,
      cost: [toC(":click", 1)],
      "keep-menu-open": ":while-clicks-left",
    }),
  ],
};

/** Artist Colony */
export const artistColony: CardDef = {
  title: "Artist Colony",
  abilities: [
    {
      prompt: "Choose a card to install",
      label: "install a card",
      "change-in-game-state": {
        req: req(function* (state: State): Generator<any, any, any> {
          return ((state as any).runner?.deck?.length || 0) > 0;
        }),
      },
      req: req(function* (state: State, side: Side): Generator<any, any, any> {
        return !installLocked(state, side);
      }),
      cost: [toC(":forfeit")],
      choices: req(function* (state: State): Generator<any, any, any> {
        return cancellable(
          ((state as any).runner?.deck || []).filter((c: any) => !isEvent(c)),
          ":sorted",
        );
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        triggerEvent(state, side, ":searched-stack");
        shuffleDeck(state, side, "deck");
        runnerInstall(state, side, eid, targets[0], {
          "msg-keys": {
            "install-source": card,
            "include-cost-from-eid": eid,
            "display-origin": true,
          },
        });
      }),
    },
  ],
};

/** Arruaceiras Crew */
export const arruaceirasCrew: CardDef = {
  title: "Arruaceiras Crew",
  abilities: [
    {
      req: req(function* (state: State): Generator<any, any, any> {
        return activeEncounter(state);
      }),
      cost: [toC(":gain-tag", 1)],
      once: ":per-turn",
      label: "Give encountered ice -2 strength",
      msg: msg(
        "give encountered ice -2 strength for the remainder of the encounter",
      ),
      effect: effect(function* (state: State): Generator<any, any, any> {
        const ice = (state as any).currentIce;
        if (ice) pumpIce(ice, -2, ":end-of-encounter");
      }),
    },
    {
      label: "Trash encountered ice",
      async: true,
      req: req(function* (state: State, side: Side): Generator<any, any, any> {
        const ice = (state as any).currentIce;
        return (
          activeEncounter(state) && ice && iceStrength(state, side, ice) <= 0
        );
      }),
      cost: [toC(":credit", 2), toC(":trash-can")],
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const ice = (state as any).currentIce;
        if (ice) trash(state, side, eid, ice, { "cause-card": card });
      }),
      msg: msg("trash encountered ice"),
    },
  ],
};

/** Asmund Pudlat */
export const asmundPudlat: CardDef = {
  title: "Asmund Pudlat",
  "on-install": {
    async: true,
    prompt: "Choose a virus or weapon card",
    choices: req(function* (state: State): Generator<any, any, any> {
      return cancellable(
        ((state as any).runner?.deck || []).filter((c: any) =>
          hasAnySubtype(c, ["Virus", "Weapon"]),
        ),
        ":sorted",
      );
    }),
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      if (targets[0]) host(state, side, card, targets[0]);
      shuffleDeck(state, side, "deck");
      effectCompleted(state, side, eid);
    }),
  },
  events: [
    {
      event: "runner-turn-begins",
      skippable: true,
      label: "Add a hosted card to the grip (start of turn)",
      prompt: "Choose a hosted card to move to the grip",
      choices: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return sameCard(card, targets[0]?.host);
        }),
      },
      msg: msg("add a hosted card to the grip"),
      once: ":per-turn",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        moveCard(state, side, targets[0], ":hand");
        const hosted = ((getCard(state, card) || card) as any)?.hosted || [];
        if (!hosted.length) {
          systemMsg(state, side, `trashes ${getTitle(card)}`);
          trash(state, side, eid, card, {
            unpreventable: true,
            "source-card": card,
          });
        } else effectCompleted(state, side, eid);
      }),
    },
  ],
};

/** Assimilator */
export const assimilator: CardDef = {
  title: "Assimilator",
  abilities: [
    {
      action: true,
      label: "Turn a facedown card faceup",
      cost: [toC(":click", 2)],
      "keep-menu-open": ":while-2-clicks-left",
      prompt: "Choose a facedown installed card",
      choices: {
        card: (c: any) => isFacedown(c) && isInstalled(c) && isRunner(c),
      },
      async: true,
      msg: msg("turn a card faceup"),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const t = targets[0];
        if (isEvent(t)) trash(state, side, eid, t, { unpreventable: true });
        else {
          flipFaceup(state, side, t);
          checkpoint(state, null, eid);
        }
      }),
    },
  ],
};

/** Avgustina Ivanovskaya */
export const avgustinaIvanovskaya: CardDef = {
  title: "Avgustina Ivanovskaya",
  events: [
    {
      event: "runner-install",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = targets?.[0]?.context || {};
        return (
          isProgram(ctx.card) &&
          hasSubtype(ctx.card, "Virus") &&
          firstEvent(
            state,
            side,
            "runner-install",
            (e: any) =>
              isProgram(e?.[0]?.card) && hasSubtype(e?.[0]?.card, "Virus"),
          )
        );
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        continue_ability(state, side, sabotageAbility(1), card, null);
      }),
    },
  ],
};

/** Backstitching */
export const backstitching: CardDef = {
  title: "Backstitching",
  events: [
    (coreMark as any).markChangedEvent,
    Object.assign({}, (coreMark as any).identifyMarkAbility, {
      event: "runner-turn-begins",
    }),
    {
      event: "encounter-ice",
      skippable: true,
      async: true,
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      optional: {
        prompt: msg("Trash to bypass encountered ice?"),
        req: req(function* (state: State): Generator<any, any, any> {
          return (state as any).mark === (state as any).run?.server?.[0];
        }),
        "yes-ability": {
          msg: msg("bypass encountered ice"),
          async: true,
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
          ): Generator<any, any, any> {
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                trash(state, side, eid, card, {
                  "cause-card": card,
                  cause: ":runner-ability",
                }),
              ],
              [],
            );
            bypassIce(state);
            effectCompleted(state, side, eid);
          }),
        },
      },
    },
  ],
};

/** "Baklan" Bochkin */
export const baklanBochkin: CardDef = {
  title: '"Baklan" Bochkin',
  events: [
    {
      event: "encounter-ice",
      automatic: ":pre-bypass",
      req: req(function* (state: State, side: Side): Generator<any, any, any> {
        return firstRunEvent(state, side, "encounter-ice");
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, side, eid, card, "power", 1);
      }),
    },
  ],
  abilities: [
    {
      label: "Derez a piece of ice currently being encountered",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const ice = (state as any).currentIce;
        return !!(
          getCurrentEncounter(state) &&
          ice &&
          isRezzed(ice) &&
          getStrength(ice) <= getCounters(getCard(state, card) || card, "power")
        );
      }),
      cost: [toC(":trash-can")],
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const ice = (state as any).currentIce;
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            derez(state, side, eid, ice, {
              "msg-keys": { "include-cost-from-eid": eid },
            }),
          ],
          [],
        );
        continue_ability(state, side, gainTagsAbility(1), card, null);
      }),
    },
  ],
};

/** Bank Job */
export const bankJob: CardDef = {
  title: "Bank Job",
  data: { counter: { credit: 8 } },
  events: [
    trashOnEmpty("credit"),
    successfulRunReplaceBreach({
      "target-server": ":remote",
      ability: {
        async: true,
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          continue_ability(
            state,
            side,
            {
              prompt: "How many hosted credits do you want to take?",
              choices: {
                number: req(function* (state: State): Generator<any, any, any> {
                  return getCounters(getCard(state, card) || card, "credit");
                }),
              },
              msg: msg("gain credits"),
              async: true,
              effect: effect(function* (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ): Generator<any, any, any> {
                takeCredits(state, side, eid, card, "credit", targets[0]);
              }),
            },
            card,
            null,
          );
        }),
      },
    }),
  ],
};

/** Bazaar */
export const bazaar: CardDef = {
  title: "Bazaar",
  events: [
    {
      event: "runner-install",
      async: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = targets?.[0]?.context || {};
        return (
          isHardware(ctx.card) &&
          JSON.stringify(ctx["previous-zone"]) === JSON.stringify([":hand"])
        );
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = targets?.[0]?.context || {};
        const hwTitle = ctx.card?.title;
        const inHandCopy = ((state as any).runner?.hand || []).find(
          (c: any) => c?.title === hwTitle,
        );
        continue_ability(
          state,
          side,
          {
            optional: {
              req: req(function* (
                state: State,
                side?: Side,
                eid?: EID,
                card?: Card,
                targets?: any[],
              ): Generator<any, any, any> {
                return !!inHandCopy;
              }),
              prompt: `Install another copy of ${hwTitle}?`,
              "yes-ability": {
                async: true,
                effect: effect(function* (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                ): Generator<any, any, any> {
                  if (inHandCopy)
                    runnerInstall(state, side, eid, inHandCopy, {
                      "msg-keys": {
                        "display-origin": true,
                        "install-source": card,
                      },
                    });
                  else effectCompleted(state, side, eid);
                }),
              },
            },
          },
          card,
          null,
        );
      }),
    },
  ],
};

/** Beach Party */
export const beachParty: CardDef = {
  title: "Beach Party",
  "static-abilities": [runnerHandSizePlus(5)],
  events: [
    {
      event: "runner-turn-begins",
      automatic: ":lose-clicks",
      msg: "lose [Click]",
      effect: effect(function* (
        state: State,
        side: Side,
      ): Generator<any, any, any> {
        loseClicks(state, side, 1);
      }),
    },
  ],
};

/** Beatriz Friere Gonzalez */
export const beatrizFriereGonzalez: CardDef = {
  title: "Beatriz Friere Gonzalez",
  abilities: [
    runServerAbility(":hq", {
      action: true,
      cost: [toC(":click", 2)],
      events: [
        successfulRunReplaceBreach({
          "target-server": ":hq",
          duration: ":end-of-run",
          "unregister-once-resolved": true,
          mandatory: true,
          ability: {
            msg: "breach R&D, accessing 1 additional card",
            async: true,
            effect: effect(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
            ): Generator<any, any, any> {
              registerEvents(state, side, card, [
                breachAccessBonus(":rd", 1, { duration: ":end-of-run" }),
              ]);
              breachServer(state, "runner", eid, [":rd"], null);
            }),
          },
        }),
      ],
    }),
  ],
};

/** Beth Kilrain-Chang */
export const bethKilrainChang: CardDef = {
  title: "Beth Kilrain-Chang",
  flags: { "drip-economy": true },
  events: [
    {
      event: "runner-turn-begins",
      once: ":per-turn",
      automatic: ":gain-clicks",
      req: req(function* (state: State): Generator<any, any, any> {
        return !!(state as any)["runner-phase-12"];
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const c = (state as any).corp?.credit || 0;
        const b = card.title;
        if (c >= 5 && c <= 9) {
          systemMsg(state, side, `uses ${b} to gain 1 [Credits]`);
          gainCredits(state, side, eid, 1);
        } else if (c >= 10 && c <= 14) {
          systemMsg(state, side, `uses ${b} to draw 1 card`);
          drawCards(state, side, eid, 1);
        } else if (c >= 15) {
          systemMsg(state, side, `uses ${b} to gain [Click]`);
          gainClicks(state, side, 1);
          effectCompleted(state, side, eid);
        } else effectCompleted(state, side, eid);
      }),
    },
  ],
};

/** Bhagat */
export const bhagat: CardDef = {
  title: "Bhagat",
  events: [
    {
      event: "successful-run",
      automatic: ":force-discard",
      async: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = targets?.[0]?.context || {};
        return (
          targetServer(ctx) === "hq" && firstSuccessfulRunOnServer(state, "hq")
        );
      }),
      msg: "force the Corp to trash the top card of R&D",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        mill(state, "corp", eid, "corp", 1);
      }),
    },
  ],
};

/** Bio-Modeled Network */
export const bioModeledNetwork: CardDef = {
  title: "Bio-Modeled Network",
  prevention: [
    {
      prevents: ":damage",
      type: ":ability",
      "max-uses": 1,
      ability: {
        async: true,
        cost: [toC(":trash-can")],
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = targets?.[0]?.context || {};
          return ctx.remaining > 1 && ctx.type === ":net" && preventable(ctx);
        }),
        msg: msg("prevent damage"),
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = targets?.[0]?.context || {};
          preventDamage(state, side, eid, ctx.remaining - 1);
        }),
      },
    },
  ],
};

/** Biometric Spoofing */
export const biometricSpoofing: CardDef = {
  title: "Biometric Spoofing",
  prevention: [
    {
      prevents: ":damage",
      type: ":ability",
      "max-uses": 1,
      ability: {
        async: true,
        cost: [toC(":trash-can")],
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return preventable(targets?.[0]?.context);
        }),
        msg: msg("prevent up to 2 damage"),
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = targets?.[0]?.context || {};
          preventDamage(state, side, eid, Math.min(2, ctx.remaining));
        }),
      },
    },
  ],
};

/** Blockade Runner */
export const blockadeRunner: CardDef = {
  title: "Blockade Runner",
  abilities: [
    {
      action: true,
      cost: [toC(":click", 2)],
      "keep-menu-open": ":while-2-clicks-left",
      msg: "draw 3 cards and shuffle 1 card from the grip back into the stack",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        playSfx(state, side, "click-card-3");
        yield wait_for(
          state,
          [{ asyncResult: "result" }, drawCards(state, side, eid, 3)],
          [],
        );
        continue_ability(
          state,
          side,
          {
            prompt: "Choose a card in the grip to shuffle back into the stack",
            req: req(function* (state: State): Generator<any, any, any> {
              return ((state as any).runner?.hand?.length || 0) > 0;
            }),
            choices: { card: (c: any) => inHand(c) && isRunner(c) },
            effect: effect(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              moveCard(state, side, targets[0], ":deck");
              shuffleDeck(state, side, "deck");
            }),
          },
          card,
          null,
        );
      }),
    },
  ],
};

/** Bloo Moose */
export const blooMoose: CardDef = {
  title: "Bloo Moose",
  flags: {
    "runner-phase-12": req(function* (state: State): Generator<any, any, any> {
      return !zoneLocked(state, "runner", ":discard");
    }),
  },
  events: [
    {
      event: "runner-turn-begins",
      automatic: ":gain-credits",
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      once: ":per-turn",
      req: req(function* (state: State): Generator<any, any, any> {
        return !zoneLocked(state, "runner", ":discard");
      }),
      prompt: "Choose a card in the Heap",
      "show-discard": true,
      choices: { card: (c: any) => inDiscard(c) && isRunner(c) },
      msg: msg("remove from the game and gain 2 [Credits]"),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        moveCard(state, side, targets[0], ":rfg");
        gainCredits(state, side, eid, 2);
      }),
    },
  ],
};

/** Borrowed Satellite */
export const borrowedSatellite: CardDef = {
  title: "Borrowed Satellite",
  "static-abilities": [linkPlus(1), runnerHandSizePlus(1)],
};

/** Bug Out Bag */
export const bugOutBag: CardDef = {
  title: "Bug Out Bag",
  "on-install": {
    prompt: "How many credits do you want to spend?",
    choices: ":credit",
    msg: msg("place power counters"),
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      addCounter(state, side, eid, card, "power", targets[0]);
    }),
  },
  events: [
    {
      event: "runner-turn-ends",
      automatic: ":draw-cards",
      req: req(function* (state: State): Generator<any, any, any> {
        return ((state as any).runner?.hand?.length || 0) === 0;
      }),
      msg: msg("draw cards"),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const n = getCounters(card, "power");
        yield wait_for(
          state,
          [{ asyncResult: "result" }, drawCards(state, side, eid, n)],
          [],
        );
        trash(state, side, eid, card, { "cause-card": card });
      }),
    },
  ],
};

/** Caldera */
export const caldera: CardDef = {
  title: "Caldera",
  prevention: [
    {
      prevents: ":damage",
      type: ":ability",
      ability: {
        async: true,
        cost: [toC(":credit", 3)],
        msg: msg("prevent 1 damage"),
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = targets?.[0]?.context || {};
          return (
            ["net", "core", "brain"].includes(ctx.type) && preventable(ctx)
          );
        }),
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
        ): Generator<any, any, any> {
          preventDamage(state, side, eid, 1);
        }),
      },
    },
  ],
};

/** Cacophony */
export const cacophony: CardDef = {
  title: "Cacophony",
  events: [
    {
      event: "runner-trash",
      async: true,
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, side, eid, card, "power", 1);
      }),
    },
    {
      event: "agenda-stolen",
      async: true,
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, side, eid, card, "power", 1);
      }),
    },
    {
      event: "runner-turn-ends",
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      skippable: true,
      optional: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          return getCounters(card, "power") >= 2;
        }),
        prompt: "Sabotage 3?",
        "yes-ability": Object.assign({}, sabotageAbility(3), {
          cost: [toC(":power", 2)],
        }),
      },
    },
  ],
};

/** Charlatan */
export const charlatan: CardDef = {
  title: "Charlatan",
  abilities: [
    {
      action: true,
      cost: [toC(":click", 2)],
      label: "Make a run",
      prompt: "Choose a server",
      choices: req(function* (state: State): Generator<any, any, any> {
        return (state as any).runnableServers || [];
      }),
      msg: msg("make a run"),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        makeRun(state, side, eid, targets[0], card);
      }),
    },
  ],
};

/** Chatterjee University */
export const chatterjeeUniversity: CardDef = {
  title: "Chatterjee University",
  abilities: [
    {
      action: true,
      cost: [toC(":click", 1)],
      "keep-menu-open": ":while-clicks-left",
      label: "Place 1 power counter",
      msg: "place 1 power counter on itself",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, side, eid, card, "power", 1);
      }),
    },
    {
      action: true,
      cost: [toC(":click", 1)],
      "keep-menu-open": ":while-clicks-left",
      label: "Install a program from the grip",
      prompt: "Choose a program to install",
      async: true,
      choices: { card: (c: any) => isProgram(c) && inHand(c) },
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const bonus = -getCounters(card, "power");
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            runnerInstall(state, side, eid, targets[0], {
              "msg-keys": { "install-source": card, "display-origin": true },
              "cost-bonus": bonus,
            }),
          ],
          [],
        );
        if (getCounters(card, "power") > 0)
          addCounter(state, side, eid, card, "power", -1);
        else effectCompleted(state, side, eid);
      }),
    },
  ],
};

/** Chrome Parlor */
export const chromeParlor: CardDef = {
  title: "Chrome Parlor",
  prevention: [
    {
      prevents: ":damage",
      type: ":event",
      "max-uses": 1,
      mandatory: true,
      ability: {
        async: true,
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = targets?.[0]?.context || {};
          return (
            hasSubtype(ctx["source-card"], "Cybernetic") && preventable(ctx)
          );
        }),
        msg: msg("prevent damage"),
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
        ): Generator<any, any, any> {
          preventDamage(state, side, eid, "all");
        }),
      },
    },
  ],
};

/** Citadel Sanctuary */
export const citadelSanctuary: CardDef = {
  title: "Citadel Sanctuary",
  prevention: [
    {
      prevents: ":damage",
      type: ":ability",
      prompt: "Use Citadel Sanctuary to prevent meat damage?",
      ability: {
        async: true,
        cost: [toC(":trash-can"), toC(":trash-entire-hand")],
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = targets?.[0]?.context || {};
          return ctx.type === ":meat" && preventable(ctx);
        }),
        msg: msg("prevent damage"),
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
        ): Generator<any, any, any> {
          preventDamage(state, side, eid, "all");
        }),
      },
    },
  ],
  events: [
    {
      event: "runner-turn-ends",
      automatic: ":trace",
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      msg: "force the Corp to initiate a trace",
      trace: {
        base: 1,
        req: req(function* (state: State): Generator<any, any, any> {
          return isTagged(state);
        }),
        unsuccessful: {
          msg: "remove 1 tag",
          async: true,
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
          ): Generator<any, any, any> {
            loseTags(state, "runner", eid, 1);
          }),
        },
      },
    },
  ],
};

/** Clan Vengeance */
export const clanVengeance: CardDef = {
  title: "Clan Vengeance",
  events: [
    {
      event: "damage",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return targets?.[0]?.context?.amount > 0;
      }),
      msg: "place 1 power counter on itself",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, side, eid, card, "power", 1);
      }),
    },
  ],
  abilities: [
    {
      label: "Trash 1 random card from HQ for each hosted power counter",
      async: true,
      cost: [toC(":trash-can")],
      msg: msg("trash cards from HQ"),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const n = Math.min(
          getCounters(card, "power"),
          ((state as any).corp?.hand || []).length,
        );
        const shuffled = [...((state as any).corp?.hand || [])].sort(
          () => Math.random() - 0.5,
        );
        trashCards(state, side, eid, shuffled.slice(0, n), {
          "cause-card": card,
        });
      }),
    },
  ],
};

/** Climactic Showdown */
export const climacticShowdown: CardDef = {
  title: "Climactic Showdown",
  events: [
    {
      event: "runner-turn-begins",
      async: true,
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        moveCard(state, side, card, ":rfg");
        effectCompleted(state, side, eid);
      }),
    },
  ],
};

/** Compromised Employee */
export const compromisedEmployee: CardDef = {
  title: "Compromised Employee",
  recurring: 1,
  events: [
    {
      event: "rez",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return isIce(targets?.[0]?.context?.card);
      }),
      msg: "gain 1 [Credits]",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        gainCredits(state, "runner", eid, 1);
      }),
    },
  ],
  interactions: {
    "pay-credits": {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        return (eid as any)?.sourceType === ":trace";
      }),
      type: ":recurring",
    },
  },
};

/** Cookbook */
export const cookbook: CardDef = {
  title: "Cookbook",
  special: { "auto-fire": ":always" },
  events: [
    {
      event: "runner-install",
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      optional: {
        prompt: "Place 1 virus counter?",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return hasSubtype(targets?.[0]?.context?.card, "Virus");
        }),
        autoresolve: getAutoresolve(":auto-fire"),
        "yes-ability": {
          msg: msg("place 1 virus counter"),
          async: true,
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            const ctx = targets?.[0]?.context || {};
            addCounter(state, side, eid, ctx.card, "virus", 1);
          }),
        },
      },
    },
  ],
  abilities: [setAutoresolve(":auto-fire", "Cookbook")],
};

/** Corporate Defector */
export const corporateDefector: CardDef = {
  title: "Corporate Defector",
  events: [
    {
      event: "corp-click-draw",
      msg: msg("force the Corp to reveal that they drew a card"),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = targets?.[0]?.context || {};
        reveal(state, side, eid, ctx.card);
      }),
    },
  ],
};

/** Councilman */
export const councilman: CardDef = {
  title: "Councilman",
  events: [
    {
      event: "rez",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = targets?.[0]?.context || {};
        return (
          (isAsset(ctx.card) || isUpgrade(ctx.card)) &&
          canPay(state, "runner", eid, card, null, [
            toC(":credit", rezCost(state, "corp", ctx.card)),
          ])
        );
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = targets?.[0]?.context || {};
        continue_ability(
          state,
          side,
          {
            optional: {
              prompt: `Trash ${card.title} and pay ${rezCost(state, "corp", ctx.card)} [Credits] to derez ${ctx.card?.title}?`,
              "yes-ability": {
                cost: [
                  toC(":credit", rezCost(state, "corp", ctx.card)),
                  toC(":trash-self"),
                ],
                async: true,
                effect: effect(function* (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                ): Generator<any, any, any> {
                  yield wait_for(
                    state,
                    [
                      { asyncResult: "result" },
                      derez(state, "runner", eid, ctx.card, {}),
                    ],
                    [],
                  );
                  registerTurnFlag(
                    state,
                    side,
                    card,
                    ":can-rez",
                    (_s: State, _: any, c: any) => !sameCard(c, ctx.card),
                  );
                  effectCompleted(state, side, eid);
                }),
              },
            },
          },
          card,
          targets,
        );
      }),
    },
  ],
};

/** Counter Surveillance */
export const counterSurveillance: CardDef = {
  title: "Counter Surveillance",
  abilities: [
    runAnyServerAbility({
      action: true,
      cost: [toC(":click", 1), toC(":trash-can")],
      events: [
        successfulRunReplaceBreach({
          mandatory: true,
          duration: ":end-of-run",
          ability: {
            async: true,
            effect: effect(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
            ): Generator<any, any, any> {
              const tags = countTags(state);
              if (tags <= totalAvailableCredits(state, "runner", eid, card)) {
                continue_ability(
                  state,
                  "runner",
                  {
                    async: true,
                    cost: [toC(":credit", tags)],
                    msg: msg("access cards"),
                    effect: effect(function* (
                      state: State,
                      side: Side,
                      eid: EID,
                      card: Card,
                    ): Generator<any, any, any> {
                      (coreAccess as any).accessNCards?.(
                        state,
                        side,
                        eid,
                        (state as any).run?.server,
                        tags,
                      );
                    }),
                  },
                  card,
                  [],
                );
              } else {
                systemMsg(
                  state,
                  "runner",
                  `could not afford to use ${card.title}`,
                );
                effectCompleted(state, null, eid);
              }
            }),
          },
        }),
      ],
    }),
  ],
};

/** Crash Space */
export const crashSpace: CardDef = {
  title: "Crash Space",
  prevention: [
    {
      prevents: ":damage",
      type: ":ability",
      ability: Object.assign({}, preventUpToNDamage(3, [":meat"]), {
        cost: [toC(":trash-can")],
      }),
    },
  ],
  interactions: {
    "pay-credits": {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        return (eid as any)?.sourceType === ":remove-tag";
      }),
      type: ":recurring",
    },
  },
  recurring: 2,
};

/** Crowdfunding */
export const crowdfunding: CardDef = {
  title: "Crowdfunding",
  data: { counter: { credit: 3 } },
  "highlight-in-discard": true,
  flags: { "drip-economy": true },
  events: [
    {
      event: "runner-turn-begins",
      automatic: ":gain-credits",
      msg: "gain 1 [Credits]",
      once: ":per-turn",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return (
          !!(state as any)["runner-phase-12"] && getCounters(card, "credit") > 0
        );
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            takeCredits(state, side, eid, card, "credit", 1),
          ],
          [],
        );
        if (getCounters(getCard(state, card) || card, "credit") <= 0) {
          systemMsg(state, "runner", "trashes Crowdfunding");
          trash(state, "runner", eid, card, { "cause-card": card });
        }
      }),
    },
  ],
};

/** Crypt */
export const crypt: CardDef = {
  title: "Crypt",
  events: [
    {
      event: "successful-run",
      silent: true,
      optional: {
        prompt: msg("Place 1 virus counter?"),
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return targetServer(targets?.[0]?.context) === ":archives";
        }),
        autoresolve: getAutoresolve(":auto-place-counter"),
        "yes-ability": {
          msg: "place 1 virus counter on itself",
          async: true,
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
          ): Generator<any, any, any> {
            addCounter(state, side, eid, card, "virus", 1);
          }),
        },
      },
    },
  ],
  abilities: [
    {
      action: true,
      async: true,
      label: "Install a virus program from the stack",
      choices: req(function* (state: State): Generator<any, any, any> {
        return cancellable(
          ((state as any).runner?.deck || []).filter(
            (c: any) => isProgram(c) && hasSubtype(c, "Virus"),
          ),
          ":sorted",
        );
      }),
      cost: [toC(":click", 1), toC(":virus", 3), toC(":trash-can")],
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        triggerEvent(state, side, ":searched-stack");
        shuffleDeck(state, side, "deck");
        runnerInstall(state, side, eid, targets[0], {
          "msg-keys": { "install-source": card, "display-origin": true },
        });
      }),
    },
    setAutoresolve(
      ":auto-place-counter",
      "Crypt placing virus counters on itself",
    ),
  ],
};

/** Cybertrooper Talut */
export const cybertrooperTalut: CardDef = {
  title: "Cybertrooper Talut",
  "static-abilities": [linkPlus(1)],
  events: [
    {
      event: "runner-install",
      silent: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = targets?.[0]?.context || {};
        return (
          hasSubtype(ctx.card, "Icebreaker") && !hasSubtype(ctx.card, "AI")
        );
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        pump(targets?.[0]?.context?.card, 2, ":end-of-turn");
      }),
    },
  ],
};

/** Dadiana Chacon */
export const dadianaChacon: CardDef = {
  title: "Dadiana Chacon",
  flags: { "drip-economy": true },
  "on-install": {
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      if (((state as any).runner?.credit || 0) === 0)
        damage(state, "runner", eid, ":meat", 3, { unboostable: true, card });
      else effectCompleted(state, side, eid);
    }),
  },
  events: [
    {
      event: "runner-turn-begins",
      once: ":per-turn",
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        if (((state as any).runner?.credit || 0) < 6) {
          systemMsg(state, "runner", `uses ${card.title} to gain 1 [Credits]`);
          gainCredits(state, "runner", eid, 1);
        } else effectCompleted(state, side, eid);
      }),
    },
  ],
};

/** Daily Casts */
export const dailyCasts: CardDef = {
  title: "Daily Casts",
  data: { counter: { credit: 8 } },
  flags: { "drip-economy": true },
  events: [
    trashOnEmpty("credit"),
    {
      event: "runner-turn-begins",
      once: ":per-turn",
      automatic: ":gain-credits",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return (
          !!(state as any)["runner-phase-12"] && getCounters(card, "credit") > 0
        );
      }),
      msg: msg("gain credits"),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        takeCredits(state, side, eid, card, "credit", 2);
      }),
    },
  ],
};

/** Daeg, First Net-Cat */
export const daegFirstNetCat: CardDef = {
  title: "Daeg, First Net-Cat",
  events: [
    {
      event: "agenda-scored",
      async: true,
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        continue_ability(state, side, chargeAbility(state, side), card, null);
      }),
    },
    {
      event: "agenda-stolen",
      async: true,
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        continue_ability(state, side, chargeAbility(state, side), card, null);
      }),
    },
  ],
};

/** Data Dealer */
export const dataDealer: CardDef = {
  title: "Data Dealer",
  abilities: [
    {
      action: true,
      cost: [toC(":click", 1), toC(":forfeit")],
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        playSfx(state, side, "click-credit-3");
        gainCredits(state, side, eid, 9);
      }),
      msg: "gain 9 [Credits]",
    },
  ],
};

/** Data Folding */
export const dataFolding: CardDef = {
  title: "Data Folding",
  flags: { "drip-economy": true },
  events: [
    {
      event: "runner-turn-begins",
      automatic: ":gain-credits",
      msg: "gain 1 [Credits]",
      once: ":per-turn",
      req: req(function* (state: State): Generator<any, any, any> {
        return (
          ((coreMemory as any).availableMu?.(state) ?? 0) >= 2 &&
          !!(state as any)["runner-phase-12"]
        );
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        gainCredits(state, side, eid, 1);
      }),
    },
  ],
};

/** Data Leak Reversal */
export const dataLeakReversal: CardDef = {
  title: "Data Leak Reversal",
  abilities: [
    {
      action: true,
      async: true,
      req: req(function* (state: State): Generator<any, any, any> {
        return isTagged(state);
      }),
      cost: [toC(":click", 1)],
      "keep-menu-open": ":while-clicks-left",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        mill(state, "corp", eid, "corp", 1);
      }),
      msg: "force the Corp to trash the top card of R&D",
    },
  ],
};

/** DDoS */
export const ddos: CardDef = {
  title: "DDoS",
  abilities: [
    {
      msg: "prevent the corp from rezzing the outermost piece of ice during a run on any server this turn",
      cost: [toC(":trash-can")],
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        registerTurnFlag(
          state,
          side,
          card,
          ":can-rez",
          (s: State, _: any, c: any) => {
            if (!isIce(c)) return true;
            toast(
              state,
              "corp",
              "Cannot rez any outermost ice due to DDoS.",
              "warning",
            );
            return false;
          },
        );
      }),
    },
  ],
};

/** Dean Lister */
export const deanLister: CardDef = {
  title: "Dean Lister",
  abilities: [
    {
      label: "pump icebreaker",
      msg: msg(
        "give +1 strength per grip card to icebreaker until the end of the run",
      ),
      choices: {
        card: (c: any) => isInstalled(c) && hasSubtype(c, "Icebreaker"),
      },
      cost: [toC(":trash-can")],
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        if ((state as any).run) {
          registerLingeringEffect(state, side, card, {
            type: ":breaker-strength",
            duration: ":end-of-run",
            req: req(function* (
              _s: State,
              _sd: Side,
              _e: EID,
              _c: Card,
              ts: any[],
            ): Generator<any, any, any> {
              return sameCard(targets[0], ts[0]);
            }),
            value: req(function* (state: State): Generator<any, any, any> {
              return ((state as any).runner?.hand || []).length;
            }),
          });
          (coreIce as any).updateBreakerStrength?.(state, side, targets[0]);
        }
      }),
    },
  ],
};

/** Debbie "Downtown" Moreira */
export const debbieDowntownMoreira: CardDef = {
  title: 'Debbie "Downtown" Moreira',
  "on-install": {
    req: req(function* (state: State): Generator<any, any, any> {
      return threatLevel(4, state);
    }),
    msg: "place 2 [Credits] on itself",
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      addCounter(state, side, eid, card, "credit", 2);
    }),
  },
  events: [
    {
      event: "play-event",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return hasSubtype(targets?.[0]?.context?.card, "Run");
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, side, eid, card, "credit", 1);
      }),
    },
  ],
  abilities: [
    {
      msg: "take 1 [Credits]",
      async: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return getCounters(getCard(state, card) || card, "credit") > 0;
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        spendCredits(state, side, eid, card, "credit", 1);
      }),
    },
    runAnyServerAbility({ action: true, cost: [toC(":click", 1)] }),
  ],
};

/** Decoy */
export const decoy: CardDef = {
  title: "Decoy",
  prevention: [
    {
      prevents: ":tag",
      type: ":ability",
      label: "Decoy",
      prompt: "Trash Decoy to avoid 1 tag?",
      ability: {
        async: true,
        cost: [toC(":trash-can")],
        msg: "avoid 1 tag",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return preventable(targets?.[0]?.context);
        }),
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
        ): Generator<any, any, any> {
          preventTag(state, "runner", eid, 1);
        }),
      },
    },
  ],
};

/** District 99 */
export const district99: CardDef = {
  title: "District 99",
  abilities: [
    {
      action: true,
      label: "Add a card from the heap to the grip",
      cost: [toC(":click", 1), toC(":power", 3)],
      prompt: "Choose a card to add to grip",
      choices: req(function* (state: State): Generator<any, any, any> {
        const ident = (state as any).runner?.identity;
        return ((state as any).runner?.discard || []).filter(
          (c: any) => sameCard(ident, c) || c?.faction === ident?.faction,
        );
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        moveCard(state, side, targets[0], ":hand");
      }),
      msg: msg("add card from heap to grip"),
    },
    {
      label: "Place 1 power counter",
      once: ":per-turn",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, side, eid, card, "power", 1);
      }),
      msg: "manually place 1 power counter on itself",
    },
  ],
};

/** DJ Fenris */
export const djFenris: CardDef = {
  title: "DJ Fenris",
  implementation: "Hosting g-mod identity not fully implemented",
  "on-install": {
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
    ): Generator<any, any, any> {
      effectCompleted(state, side, eid);
    }),
  },
};

/** Donut Taganes */
export const donutTaganes: CardDef = {
  title: "Donut Taganes",
  "static-abilities": [{ type: ":play-cost", value: 1 }],
};

/** Dr. Lovegood */
export const drLovegood: CardDef = {
  title: "Dr. Lovegood",
  events: [
    {
      event: "runner-turn-begins",
      skippable: true,
      label: "blank a card",
      prompt:
        "Choose an installed card to make its text box blank for the remainder of the turn",
      once: ":per-turn",
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      choices: { card: isInstalled },
      msg: msg("blank a card text box for the remainder of the turn"),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const c = targets[0];
        registerLingeringEffect(state, side, card, {
          type: ":icon",
          duration: ":end-of-turn",
          req: req(function* (
            _s: State,
            _sd: Side,
            _e: EID,
            _c: Card,
            ts: any[],
          ): Generator<any, any, any> {
            return sameCard(c, ts[0]);
          }),
          value: makeIcon("DL", card),
        });
        registerLingeringEffect(state, side, card, {
          type: ":disable-card",
          duration: ":end-of-turn",
          req: req(function* (
            _s: State,
            _sd: Side,
            _e: EID,
            _c: Card,
            ts: any[],
          ): Generator<any, any, any> {
            return sameCard(c, ts[0]);
          }),
          value: req(function* (
            state: State,
            side?: Side,
            eid?: EID,
            card?: Card,
            targets?: any[],
          ): Generator<any, any, any> {
            return true;
          }),
        });
        updateDisabledCards(state);
      }),
    },
  ],
};

/** Dr. Nuka Vrolyck */
export const drNukaVrolyck: CardDef = {
  title: "Dr. Nuka Vrolyck",
  data: { counter: { power: 2 } },
  events: [trashOnEmpty("power")],
  abilities: [
    drawAbi(3, null, {
      action: true,
      "keep-menu-open": ":while-clicks-left",
      cost: [toC(":click", 1), toC(":power", 1)],
    }),
  ],
};

/** DreamNet */
export const dreamNet: CardDef = {
  title: "DreamNet",
  events: [
    {
      event: "successful-run",
      automatic: ":draw-cards",
      async: true,
      req: req(function* (state: State, side: Side): Generator<any, any, any> {
        return firstEvent(state, "runner", "successful-run");
      }),
      msg: msg("draw 1 card"),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [{ asyncResult: "result" }, drawCards(state, "runner", eid, 1)],
          [],
        );
        const id = (state as any).runner?.identity;
        if (getLink(state) >= 2 || hasSubtype(id, "Digital"))
          gainCredits(state, "runner", eid, 1);
        else effectCompleted(state, side, eid);
      }),
    },
  ],
};

/** Drug Dealer */
export const drugDealer: CardDef = {
  title: "Drug Dealer",
  flags: {
    "runner-phase-12": req(function* (state: State): Generator<any, any, any> {
      return allActiveInstalled(state, "runner").some((c: any) =>
        cardFlag(c, ":drip-economy", true),
      );
    }),
  },
  abilities: [
    {
      label: "Lose 1 [Credits] (start of turn)",
      msg: msg("lose 1 [Credits]"),
      req: req(function* (state: State): Generator<any, any, any> {
        return !!(state as any)["runner-phase-12"];
      }),
      once: ":per-turn",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        loseCredits(state, side, eid, 1);
      }),
    },
  ],
  events: [
    {
      event: "corp-turn-begins",
      automatic: ":draw-cards",
      msg: msg("draw 1 card"),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        drawCards(state, "runner", eid, 1);
      }),
    },
    {
      event: "runner-turn-begins",
      automatic: ":lose-credits",
      msg: msg("lose 1 [Credits]"),
      once: ":per-turn",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        loseCredits(state, side, eid, 1);
      }),
    },
  ],
};

/** Duggar's */
export const duggars: CardDef = {
  title: "Duggar's",
  abilities: [
    drawAbi(10, null, {
      action: true,
      cost: [toC(":click", 4)],
      "keep-menu-open": ":while-4-clicks-left",
    }),
  ],
};

/** Dummy Box */
export const dummyBox: CardDef = {
  title: "Dummy Box",
  prevention: [
    preventTrashInstalledByType(
      "Dummy Box (Hardware)",
      ["Hardware"],
      [toC(":trash-hardware-from-hand", 1)],
      (ctx: any) => ctx?.sourcePlayer === ":corp",
    ),
    preventTrashInstalledByType(
      "Dummy Box (Program)",
      ["Program"],
      [toC(":trash-program-from-hand", 1)],
      (ctx: any) => ctx?.sourcePlayer === ":corp",
    ),
    preventTrashInstalledByType(
      "Dummy Box (Resource)",
      ["Resource"],
      [toC(":trash-resource-from-hand", 1)],
      (ctx: any) => ctx?.sourcePlayer === ":corp",
    ),
  ],
};

/** Earthrise Hotel */
export const earthriseHotel: CardDef = {
  title: "Earthrise Hotel",
  data: { counter: { power: 3 } },
  flags: { "runner-turn-draw": true },
  events: [
    {
      event: "runner-turn-begins",
      msg: "draw 2 cards",
      automatic: ":draw-cards",
      once: ":per-turn",
      req: req(function* (state: State): Generator<any, any, any> {
        return !!(state as any)["runner-phase-12"];
      }),
      async: true,
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        if (getCounters(card, "power") > 0) {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              addCounter(state, side, eid, card, "power", -1),
            ],
            [],
          );
        }
        drawCards(state, side, eid, 2);
      }),
    },
    trashOnEmpty("power"),
  ],
};

/** Eden Shard */
export const edenShard: CardDef = shardConstructor(
  "Eden Shard",
  ":rd",
  "force the Corp to draw 2 cards",
  (state: State, side: Side, eid: EID, card: Card) =>
    drawCards(state, "corp", eid, 2),
);

/** Emptied Mind */
export const emptiedMind: CardDef = {
  title: "Emptied Mind",
  events: [
    {
      event: "runner-turn-begins",
      automatic: ":gain-clicks",
      msg: "gain [Click]",
      once: ":per-turn",
      req: req(function* (state: State): Generator<any, any, any> {
        return ((state as any).runner?.hand?.length || 0) === 0;
      }),
      effect: effect(function* (
        state: State,
        side: Side,
      ): Generator<any, any, any> {
        gainClicks(state, side, 1);
      }),
    },
  ],
};

/** Enhanced Vision */
export const enhancedVision: CardDef = {
  title: "Enhanced Vision",
  events: [
    {
      event: "successful-run",
      silent: true,
      async: true,
      req: req(function* (state: State, side: Side): Generator<any, any, any> {
        return geneticsTrigger(state, side, "successful-run");
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const hand = (state as any).corp?.hand || [];
        const target = hand[Math.floor(Math.random() * hand.length)];
        if (target) {
          systemMsg(
            state,
            "runner",
            `uses ${card.title} to force the Corp to reveal ${target.title} from HQ`,
          );
          reveal(state, "corp", eid, target);
        } else effectCompleted(state, side, eid);
      }),
    },
  ],
};

/** Environmental Testing */
export const environmentalTesting: CardDef = {
  title: "Environmental Testing",
  events: [
    {
      event: "runner-install",
      silent: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return getCounters(card, "power") !== 3;
      }),
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = targets?.[0]?.context || {};
        return (
          (isHardware(ctx.card) || isProgram(ctx.card)) && !ctx["facedown?"]
        );
      }),
      async: true,
      msg: "place 1 power counter on itself",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, "runner", eid, card, "power", 1);
      }),
    },
    {
      event: "counter-added",
      async: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return getCounters(getCard(state, card) || card, "power") >= 4;
      }),
      msg: "trash itself and gain 9 [Credit]",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            trash(state, side, eid, card, { "cause-card": card }),
          ],
          [],
        );
        gainCredits(state, side, eid, 9);
      }),
    },
  ],
};

/** Eru Ayase-Pessoa */
export const eruAyasePessoa: CardDef = {
  title: "Eru Ayase-Pessoa",
  events: [
    {
      event: "breach-server",
      automatic: ":pre-breach",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = targets?.[0]?.context || {};
        return (
          threatLevel(3, state) &&
          ctx.server === ":rd" &&
          (state as any).run?.server?.[0] === ":archives"
        );
      }),
      msg: "access 1 additional card",
      effect: effect(function* (
        state: State,
        side: Side,
      ): Generator<any, any, any> {
        accessBonus(side, ":rd", 1);
      }),
    },
  ],
  abilities: [
    runServerAbility(":archives", {
      cost: [toC(":gain-tag", 1), toC(":click", 1)],
      once: ":per-turn",
      action: true,
      events: [
        successfulRunReplaceBreach({
          "target-server": ":archives",
          mandatory: true,
          duration: ":end-of-run",
          "unregister-once-resolved": true,
          ability: {
            msg: "breach R&D",
            async: true,
            effect: effect(function* (
              state: State,
              side: Side,
              eid: EID,
            ): Generator<any, any, any> {
              breachServer(state, "runner", eid, [":rd"], null);
            }),
          },
        }),
      ],
    }),
  ],
};

/** Fall Guy */
export const fallGuy: CardDef = {
  title: "Fall Guy",
  prevention: [
    preventTrashInstalledByType(
      "Fall Guy",
      ["Resource"],
      [toC(":trash-can")],
      (ctx: any) => ctx?.cause !== ":ability-cost",
    ),
  ],
  abilities: [
    {
      label: "Gain 2 [Credits]",
      msg: "gain 2 [Credits]",
      cost: [toC(":trash-can")],
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        gainCredits(state, side, eid, 2);
      }),
    },
  ],
};

/** Fan Site */
export const fanSite: CardDef = {
  title: "Fan Site",
  events: [
    {
      event: "agenda-scored",
      msg: "add itself to score area as an agenda worth 0 agenda points",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return isInstalled(card);
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        asAgenda(state, "runner", card, 0);
      }),
    },
  ],
};

/** Fencer Fueno */
export const fencerFueno: CardDef = companionBuilder(
  req(function* (state: State, side: Side, eid: EID): Generator<any, any, any> {
    return !!(state as any).run?.successful;
  }),
  {
    prompt: "Choose one",
    choices: ["Pay 1 [Credits]", "Trash Fencer Fueno"],
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      if (targets[0] === "Trash Fencer Fueno")
        trash(state, "runner", eid, card, { "cause-card": card });
      else pay(state, "runner", eid, card, toC(":credit", 1));
    }),
  },
  {
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      return (
        getCounters(getCard(state, card) || card, "credit") > 0 &&
        !!(state as any).run?.successful
      );
    }),
    msg: "take 1 [Credits]",
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      spendCredits(state, side, eid, card, "credit", 1);
    }),
  },
);

/** Fester */
export const fester: CardDef = {
  title: "Fester",
  events: [
    {
      event: "purge",
      msg: "force the Corp to lose 2 [Credits]",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        if (((state as any).corp?.credit || 0) >= 2)
          loseCredits(state, "corp", eid, 2);
        else effectCompleted(state, side, eid);
      }),
    },
  ],
};

/** Film Critic */
export const filmCritic: CardDef = {
  title: "Film Critic",
  events: [
    {
      event: "access",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const hosted = ((card as any).hosted || []).filter(isAgenda);
        return (
          hosted.length === 0 &&
          isAgenda(targets?.[0]?.context?.["accessed-card"])
        );
      }),
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const agenda = targets?.[0]?.context?.["accessed-card"];
        continue_ability(
          state,
          side,
          {
            optional: {
              prompt: `Host ${agenda?.title} on Film Critic?`,
              "yes-ability": {
                effect: effect(function* (
                  state: State,
                  side: Side,
                ): Generator<any, any, any> {
                  host(state, side, card, agenda);
                  (state as any).access = undefined;
                }),
                msg: `host ${agenda?.title} instead of accessing it`,
              },
            },
          },
          card,
          null,
        );
      }),
    },
  ],
  abilities: [
    {
      action: true,
      cost: [toC(":click", 2)],
      label: "Add hosted agenda to your score area",
      "change-in-game-state": {
        req: req(function* (
          state: State,
          _s: Side,
          _e: EID,
          card: Card,
        ): Generator<any, any, any> {
          return !!((card as any).hosted || []).find(isAgenda);
        }),
      },
      async: true,
      msg: msg("add hosted agenda to score area"),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const agenda = ((card as any).hosted || []).find(isAgenda);
        if (!agenda) {
          effectCompleted(state, side, eid);
          return;
        }
        const c = moveCard(state, "runner", agenda, ":scored");
        updateAllAdvancementRequirements(state);
        updateAllAgendaPoints(state);
        checkWinByAgenda(state, side);
        effectCompleted(state, side, eid);
      }),
    },
  ],
};

/** Find the Truth */
export const findTheTruth: CardDef = {
  title: "Find the Truth",
  events: [
    {
      event: "post-runner-draw",
      msg: msg("reveal drawn cards"),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        const drawing = (state as any)["runner-currently-drawing"] || [];
        reveal(state, side, eid, drawing);
      }),
    },
    {
      event: "successful-run",
      optional: {
        req: req(function* (
          state: State,
          side: Side,
        ): Generator<any, any, any> {
          return (
            firstEvent(state, side, "successful-run") &&
            ((state as any).corp?.deck?.length || 0) > 0
          );
        }),
        autoresolve: getAutoresolve(":auto-peek"),
        prompt: "Look at the top card of R&D?",
        "yes-ability": {
          prompt: req(function* (state: State): Generator<any, any, any> {
            return `The top card of R&D is ${(state as any).corp?.deck?.[0]?.title}`;
          }),
          msg: "look at the top card of R&D",
          choices: ["OK"],
        },
      },
    },
  ],
  abilities: [
    setAutoresolve(
      ":auto-peek",
      "Find the Truth looking at the top card of R&D",
    ),
  ],
};

/** First Responders */
export const firstResponders: CardDef = {
  title: "First Responders",
  abilities: [
    drawAbi(1, null, {
      cost: [toC(":credit", 2)],
      req: req(function* (state: State, side: Side): Generator<any, any, any> {
        return turnEvents(state, "runner", "damage").some((e: any) =>
          isCorp(e?.[0]?.card),
        );
      }),
    }),
  ],
};

/** Fransofia Ward */
export const fransofiaWard: CardDef = {
  title: "Fransofia Ward",
  "static-abilities": [
    {
      type: ":rez-cost",
      req: req(function* (
        _s: State,
        _sd: Side,
        _e: EID,
        _c: Card,
        ts: any[],
      ): Generator<any, any, any> {
        return isIce(ts[0]);
      }),
      value: 1,
    },
  ],
  events: [
    {
      event: "encounter-ice",
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      skippable: true,
      optional: {
        req: req(function* (state: State): Generator<any, any, any> {
          return ((state as any).corp?.credit || 0) >= 15;
        }),
        prompt: msg("Trash Fransofia Ward to bypass encountered ice?"),
        "yes-ability": {
          cost: [toC(":trash-self")],
          msg: msg("bypass encountered ice"),
          effect: effect(function* (state: State): Generator<any, any, any> {
            bypassIce(state);
          }),
        },
      },
    },
  ],
};

/** Friend of a Friend */
export const friendOfAFriend: CardDef = {
  title: "Friend of a Friend",
  abilities: [
    {
      action: true,
      label: "Gain 5 [Credits] and remove 1 tag",
      msg: "gain 5 [Credits] and remove 1 tag",
      cost: [toC(":click", 1), toC(":trash-can")],
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        playSfx(state, side, "click-credit-3");
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            gainCredits(state, side, makeEid(state, eid), 5),
          ],
          [],
        );
        loseTags(state, "runner", eid, 1);
      }),
    },
    {
      action: true,
      label: "Gain 9 [Credits] and take 1 tag",
      msg: "gain 9 [Credits] and take 1 tag",
      cost: [toC(":click", 1), toC(":trash-can")],
      async: true,
      req: req(function* (state: State): Generator<any, any, any> {
        return !isTagged(state);
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        playSfx(state, side, "click-credit-3");
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            gainCredits(state, side, makeEid(state, eid), 9),
          ],
          [],
        );
        gainTags(state, "runner", eid, 1);
      }),
    },
  ],
};

/** Gang Sign */
export const gangSign: CardDef = {
  title: "Gang Sign",
  events: [
    {
      event: "agenda-scored",
      async: true,
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      msg: "breach HQ",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        breachServer(state, "runner", eid, [":hq"], { "no-root": true });
      }),
    },
  ],
};

/** Gbahali */
export const gbahali: CardDef = Object.assign(
  { title: "Gbahali" },
  biteyBoi("last"),
);

/** Gene Conditioning Shoppe */
export const geneConditioningShoppe: CardDef = {
  title: "Gene Conditioning Shoppe",
  "on-install": {
    msg: "make Genetics trigger a second time each turn",
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      registerPersistentFlag(
        state,
        side,
        card,
        ":genetics-trigger-twice",
        () => true,
      );
    }),
  },
  "leave-play": effect(function* (
    state: State,
    side: Side,
    eid: EID,
    card: Card,
  ): Generator<any, any, any> {
    clearPersistentFlag(state, side, card, ":genetics-trigger-twice");
  }),
};

/** Ghost Runner */
export const ghostRunner: CardDef = {
  title: "Ghost Runner",
  data: { counter: { credit: 3 } },
  abilities: [
    {
      msg: "gain 1 [Credits]",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return !!(state as any).run && getCounters(card, "credit") > 0;
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        spendCredits(state, side, eid, card, "credit", 1);
      }),
    },
  ],
  events: [trashOnEmpty("credit")],
  interactions: {
    "pay-credits": {
      req: req(function* (state: State): Generator<any, any, any> {
        return !!(state as any).run;
      }),
      type: ":credit",
    },
  },
};

/** Globalsec Security Clearance */
export const globalsecSecurityClearance: CardDef = {
  title: "Globalsec Security Clearance",
  req: req(function* (state: State): Generator<any, any, any> {
    return getLink(state) > 1;
  }),
  flags: {
    "runner-phase-12": req(function* (
      state: State,
      side?: Side,
      eid?: EID,
      card?: Card,
      targets?: any[],
    ): Generator<any, any, any> {
      return true;
    }),
  },
  abilities: [
    {
      once: ":per-turn",
      label: "Lose [Click] and look at the top card of R&D (start of turn)",
      req: req(function* (state: State): Generator<any, any, any> {
        return !!(state as any)["runner-phase-12"];
      }),
      optional: {
        prompt: "Lose [Click] to look at the top card of R&D?",
        autoresolve: getAutoresolve(":auto-fire"),
        "yes-ability": {
          msg: "lose [Click] and look at the top card of R&D",
          prompt: req(function* (state: State): Generator<any, any, any> {
            return `The top card of R&D is ${(state as any).corp?.deck?.[0]?.title}`;
          }),
          choices: ["OK"],
          effect: effect(function* (
            state: State,
            side: Side,
          ): Generator<any, any, any> {
            loseClicks(state, side, 1);
          }),
        },
      },
    },
    setAutoresolve(":auto-fire", "Globalsec Security Clearance"),
  ],
};

/** Grifter */
export const grifter: CardDef = {
  title: "Grifter",
  events: [
    {
      event: "runner-turn-ends",
      automatic: ":gain-credits",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        if (((state as any).runner?.register?.["successful-run"] || []).length)
          gainCredits(state, side, eid, 1);
        else
          trash(state, side, eid, card, {
            cause: ":runner-ability",
            "cause-card": card,
          });
      }),
    },
  ],
};

/** Guru Davinder */
export const guruDavinder: CardDef = {
  title: "Guru Davinder",
  "static-abilities": [
    { type: ":cannot-pay-net", value: true },
    { type: ":cannot-pay-meat", value: true },
  ],
  prevention: [
    {
      prevents: ":damage",
      type: ":event",
      "max-uses": 1,
      mandatory: true,
      ability: {
        async: true,
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = targets?.[0]?.context || {};
          return ["meat", "net"].includes(ctx.type) && preventable(ctx);
        }),
        msg: msg("prevent damage"),
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          yield wait_for(
            state,
            [{ asyncResult: "result" }, preventDamage(state, side, eid, "all")],
            [],
          );
          continue_ability(
            state,
            side,
            {
              prompt: "Choose one",
              choices: ["Pay 4 [Credits]", "Trash Guru Davinder"],
              async: true,
              effect: effect(function* (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ): Generator<any, any, any> {
                if (targets[0] === "Trash Guru Davinder")
                  trash(state, "runner", eid, card, {
                    cause: ":runner-ability",
                    "cause-card": card,
                  });
                else pay(state, "runner", eid, card, toC(":credit", 4));
              }),
            },
            card,
            null,
          );
        }),
      },
    },
  ],
};

/** Hackerspace */
export const hackerspace: CardDef = {
  title: "Hackerspace",
  "static-abilities": [
    {
      type: ":can-host",
      req: req(function* (
        _s: State,
        _sd: Side,
        _e: EID,
        _c: Card,
        ts: any[],
      ): Generator<any, any, any> {
        return (
          isResource(ts[0]) &&
          hasAnySubtype(ts[0], ["Connection", "Companion"]) &&
          isUnique(ts[0])
        );
      }),
      "cost-bonus": -1,
    },
    runnerHandSizePlus(
      req(function* (
        _s: State,
        _sd: Side,
        _e: EID,
        card: Card,
      ): Generator<any, any, any> {
        const hosted = (card as any).hosted || [];
        return hosted.some((c: any) => hasSubtype(c, "Connection")) &&
          hosted.some((c: any) => hasSubtype(c, "Companion"))
          ? 2
          : 0;
      }),
    ),
  ],
};

/** Hades Shard */
export const hadesShard: CardDef = shardConstructor(
  "Hades Shard",
  ":archives",
  "breach Archives",
  (state: State, side: Side, eid: EID) =>
    breachServer(state, "runner", eid, [":archives"], { "no-root": true }),
);

/** Hannah "Wheels" Pilintra */
export const hannahWheelsPilintra: CardDef = {
  title: 'Hannah "Wheels" Pilintra',
  abilities: [
    {
      action: true,
      cost: [toC(":click", 1)],
      once: ":per-turn",
      label: "Run a remote server",
      async: true,
      prompt: "Choose a remote server",
      choices: req(function* (state: State): Generator<any, any, any> {
        return cancellable(
          ((state as any).runnableServers || []).filter((s: any) =>
            isRemote(unknownToKw(s)),
          ),
        );
      }),
      msg: msg("gain [Click] and make a run"),
      "makes-run": true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        gainClicks(state, side, 1);
        registerEvents(state, side, card, [
          {
            event: "run-ends",
            duration: ":end-of-run",
            "unregister-once-resolved": true,
            req: req(function* (
              _s: State,
              _sd: Side,
              _e: EID,
              _c: Card,
              ts: any[],
            ): Generator<any, any, any> {
              return (
                ts?.[0]?.context?.unsuccessful &&
                sameCard(card, ts?.[0]?.context?.["source-card"])
              );
            }),
            async: true,
            msg: "take 1 tag",
            effect: effect(function* (
              state: State,
              side: Side,
              eid: EID,
            ): Generator<any, any, any> {
              gainTags(state, "runner", eid, 1);
            }),
          },
        ]);
        makeRun(state, side, eid, targets[0], card);
      }),
    },
    {
      action: true,
      cost: [toC(":click", 1), toC(":trash-can")],
      async: true,
      label: "Gain [Click][Click]. Remove 1 tag",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        gainClicks(state, side, 2);
        loseTags(state, side, eid, 1);
      }),
      msg: "gain [Click][Click] and remove 1 tag",
    },
  ],
};

/** Hard at Work */
export const hardAtWork: CardDef = {
  title: "Hard at Work",
  flags: { "drip-economy": true },
  events: [
    {
      event: "runner-turn-begins",
      msg: "gain 2 [Credits] and lose [Click]",
      automatic: ":lose-clicks",
      once: ":per-turn",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        loseClicks(state, side, 1);
        gainCredits(state, side, eid, 2);
      }),
    },
  ],
};

/** Hernando Cortez */
export const hernandoCortez: CardDef = {
  title: "Hernando Cortez",
  "static-abilities": [
    {
      type: ":rez-additional-cost",
      req: req(function* (
        state: State,
        _sd: Side,
        _e: EID,
        _c: Card,
        ts: any[],
      ): Generator<any, any, any> {
        return ((state as any).corp?.credit || 0) >= 10 && isIce(ts[0]);
      }),
      value: req(function* (
        _s: State,
        _sd: Side,
        _e: EID,
        _c: Card,
        ts: any[],
      ): Generator<any, any, any> {
        return [toC(":credit", (ts[0]?.subroutines || []).length)];
      }),
    },
  ],
};

/** Human First */
export const humanFirst: CardDef = {
  title: "Human First",
  events: [
    {
      event: "agenda-scored",
      msg: msg("gain credits"),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        gainCredits(
          state,
          "runner",
          eid,
          getAgendaPoints(targets?.[0]?.context?.card),
        );
      }),
    },
    {
      event: "agenda-stolen",
      msg: msg("gain credits"),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        gainCredits(
          state,
          "runner",
          eid,
          getAgendaPoints(targets?.[0]?.context?.card),
        );
      }),
    },
  ],
};

/** Hunting Grounds */
export const huntingGrounds: CardDef = {
  title: "Hunting Grounds",
  prevention: [
    {
      prevents: ":encounter",
      type: ":event",
      ability: {
        async: true,
        once: ":per-turn",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return preventable(targets?.[0]?.context);
        }),
        msg: msg("prevent encounter ability"),
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
        ): Generator<any, any, any> {
          preventEncounter(state, side, eid);
        }),
      },
    },
  ],
  abilities: [
    {
      async: true,
      label: "Install the top 3 cards of the stack facedown",
      msg: "install the top 3 cards of the stack facedown",
      cost: [toC(":trash-can")],
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const top3 = ((state as any).runner?.deck || []).slice(0, 3);
        for (const c of top3) {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              runnerInstall(state, side, eid, c, {
                facedown: true,
                "msg-keys": { "install-source": card, "display-origin": true },
              }),
            ],
            [],
          );
        }
        effectCompleted(state, side, eid);
      }),
    },
  ],
};

/** Ice Analyzer */
export const iceAnalyzer: CardDef = {
  title: "Ice Analyzer",
  implementation: "Credit use restriction is not enforced",
  events: [
    {
      event: "rez",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return isIce(targets?.[0]?.context?.card);
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, "runner", eid, card, "credit", 1);
      }),
    },
  ],
  abilities: [
    {
      async: true,
      msg: "take 1 hosted [Credits] to install programs",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        spendCredits(state, side, eid, card, "credit", 1);
      }),
    },
  ],
  interactions: {
    "pay-credits": {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          (eid as any)?.sourceType === ":runner-install" &&
          isProgram(targets?.[0])
        );
      }),
      type: ":credit",
    },
  },
};

/** Ice Carver */
export const iceCarver: CardDef = {
  title: "Ice Carver",
  "static-abilities": [
    {
      type: ":ice-strength",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ice = (state as any).currentIce;
        return !!(
          getCurrentEncounter(state) &&
          ice &&
          sameCard(ice, targets[0])
        );
      }),
      value: -1,
    },
  ],
};

/** Info Bounty */
export const infoBounty: CardDef = {
  title: "Info Bounty",
  events: [
    (coreMark as any).markChangedEvent,
    Object.assign({}, (coreMark as any).identifyMarkAbility, {
      event: "runner-turn-begins",
    }),
    {
      event: "run-ends",
      async: true,
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      once: ":per-turn",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return !!targets?.[0]?.context?.["marked-server"];
      }),
      msg: msg("gain 2 [Credits]"),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        gainCredits(state, side, eid, 2);
      }),
    },
  ],
};

/** Inside Man */
export const insideMan: CardDef = {
  title: "Inside Man",
  recurring: 2,
  interactions: {
    "pay-credits": {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          (eid as any)?.sourceType === ":runner-install" &&
          isHardware(targets?.[0])
        );
      }),
      type: ":recurring",
    },
  },
};

/** Investigative Journalism */
export const investigativeJournalism: CardDef = {
  title: "Investigative Journalism",
  req: req(function* (state: State): Generator<any, any, any> {
    return hasBadPub(state);
  }),
  abilities: [
    {
      action: true,
      cost: [toC(":click", 4), toC(":trash-can")],
      msg: "give the Corp 1 bad publicity",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        gainBadPublicity(state, "corp", eid, 1);
      }),
    },
  ],
};

/** Investigator Inez Delgado */
export const investigatorInezDelgado: CardDef = {
  title: "Investigator Inez Delgado",
  abilities: [
    {
      msg: msg("add itself to score area as an agenda worth 0 agenda points"),
      label: "Add to score area and reveal cards in server",
      async: true,
      prompt: "Choose a server",
      choices: req(function* (state: State): Generator<any, any, any> {
        return (state as any).remotes || [];
      }),
      req: req(function* (state: State): Generator<any, any, any> {
        return !!(state as any).runner?.register?.["stole-agenda"];
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        asAgenda(state, "runner", card, 0);
        const zone = serverToZone(state, targets[0]);
        const content =
          (state as any).corp?.servers?.[unknownToKw(targets[0])]?.content ||
          [];
        expose(state, "runner", eid, content);
      }),
    },
  ],
};

/** Jackpot! */
export const jackpot: CardDef = {
  title: "Jackpot!",
  implementation: "Credit gain must be manually triggered",
  events: [
    {
      event: "runner-turn-begins",
      silent: true,
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, "runner", eid, card, "credit", 1);
      }),
    },
    {
      event: "card-moved",
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      optional: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = targets?.[0]?.context || {};
          return inScored(ctx["moved-card"]) && ctx["scored-side"] === "runner";
        }),
        prompt: msg("Trash Jackpot?"),
        "yes-ability": {
          prompt: "How many hosted credits do you want to take?",
          choices: {
            number: req(function* (
              state: State,
              _s: Side,
              _e: EID,
              card: Card,
            ): Generator<any, any, any> {
              return getCounters(card, "credit");
            }),
          },
          async: true,
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                takeCredits(state, side, eid, card, "credit", targets[0]),
              ],
              [],
            );
            systemMsg(
              state,
              "runner",
              `trashes ${card.title} to gain ${targets[0]} [Credits]`,
            );
            trash(state, "runner", eid, card, { "cause-card": card });
          }),
        },
      },
    },
  ],
};

/** Jak Sinclair */
export const jakSinclair: CardDef = {
  title: "Jak Sinclair",
  implementation: "Doesn't prevent program use",
  flags: {
    "runner-phase-12": req(function* (
      state: State,
      side?: Side,
      eid?: EID,
      card?: Card,
      targets?: any[],
    ): Generator<any, any, any> {
      return true;
    }),
  },
  "install-cost-bonus": req(function* (state: State): Generator<any, any, any> {
    return -getLink(state);
  }),
  events: [
    {
      event: "runner-turn-begins",
      skippable: true,
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      optional: {
        once: ":per-turn",
        prompt: "Make a run?",
        "yes-ability": {
          label: "Make a run (start of turn)",
          prompt: "Choose a server",
          choices: req(function* (state: State): Generator<any, any, any> {
            return (state as any).runnableServers || [];
          }),
          msg: msg("make a run during which no programs can be used"),
          "makes-run": true,
          async: true,
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            makeRun(state, side, eid, targets[0], card);
          }),
        },
      },
    },
  ],
};

/** Jarogniew Mercs */
export const jarogniewMercs: CardDef = {
  title: "Jarogniew Mercs",
  "on-install": {
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      yield wait_for(
        state,
        [{ asyncResult: "result" }, gainTags(state, "runner", eid, 1)],
        [],
      );
      addCounter(state, "runner", eid, card, "power", 3 + countTags(state));
    }),
  },
  events: [trashOnEmpty("power")],
  flags: { "untrashable-while-resources": true },
  prevention: [
    {
      prevents: ":damage",
      type: ":ability",
      ability: {
        async: true,
        cost: [toC(":power", 1)],
        msg: "prevent 1 meat damage",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = targets?.[0]?.context || {};
          return ctx.type === ":meat" && preventable(ctx);
        }),
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
        ): Generator<any, any, any> {
          preventDamage(state, side, eid, 1);
        }),
      },
    },
  ],
};

/** John Masanori */
export const johnMasanori: CardDef = {
  title: "John Masanori",
  events: [
    {
      event: "successful-run",
      automatic: ":draw-cards",
      req: req(function* (state: State, side: Side): Generator<any, any, any> {
        return firstEvent(state, side, "successful-run");
      }),
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      msg: "draw 1 card",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        drawCards(state, side, eid, 1);
      }),
    },
    {
      event: "unsuccessful-run",
      req: req(function* (state: State, side: Side): Generator<any, any, any> {
        return firstEvent(state, side, "unsuccessful-run");
      }),
      async: true,
      msg: "take 1 tag",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        gainTags(state, "runner", eid, 1);
      }),
    },
  ],
};

/** Joshua B. */
export const joshuaB: CardDef = {
  title: "Joshua B.",
  flags: {
    "runner-phase-12": req(function* (
      state: State,
      side?: Side,
      eid?: EID,
      card?: Card,
      targets?: any[],
    ): Generator<any, any, any> {
      return true;
    }),
  },
  events: [
    {
      event: "runner-turn-begins",
      skippable: true,
      optional: {
        prompt: "Gain [Click]?",
        once: ":per-turn",
        "yes-ability": {
          msg: "gain [Click]",
          once: ":per-turn",
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
          ): Generator<any, any, any> {
            gainClicks(state, side, 1);
            registerEvents(state, side, card, [
              Object.assign({}, gainTagsAbility(1), {
                event: "runner-turn-ends",
                "unregister-once-resolved": true,
                interactive: req(function* (
                  state: State,
                  side?: Side,
                  eid?: EID,
                  card?: Card,
                  targets?: any[],
                ): Generator<any, any, any> {
                  return true;
                }),
              }),
            ]);
          }),
        },
      },
    },
  ],
};

/** Juli Moreira Lee */
export const juliMoreiraLee: CardDef = {
  title: "Juli Moreira Lee",
  data: { counter: { power: 4 } },
  events: [
    trashOnEmpty("power"),
    {
      event: "action-played",
      once: ":per-turn",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const valid = (ts: any[]) => ts?.[0]?.card && isResource(ts[0].card);
        return (
          valid(targets) &&
          side === "runner" &&
          firstEvent(state, side, "action-played", (e: any) => valid(e))
        );
      }),
      msg: "gain [Click]",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        if (getCounters(card, "power") > 0) {
          gainClicks(state, side, 1);
          addCounter(state, side, eid, card, "power", -1);
        } else {
          gainClicks(state, side, 1);
          effectCompleted(state, side, eid);
        }
      }),
    },
  ],
};

/** Kasi String */
export const kasiString: CardDef = {
  title: "Kasi String",
  special: { "auto-place-counter": ":always" },
  events: [
    {
      event: "run-ends",
      optional: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = targets?.[0]?.context || {};
          return (
            firstEvent(state, "runner", "run-ends", (e: any) =>
              isRemote(e?.[0]?.context?.server),
            ) &&
            !ctx["did-steal"] &&
            ctx["did-access"] &&
            isRemote(ctx.server)
          );
        }),
        autoresolve: getAutoresolve(":auto-place-counter"),
        prompt: msg("Place 1 power counter?"),
        "yes-ability": {
          msg: "place 1 power counter on itself",
          async: true,
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
          ): Generator<any, any, any> {
            addCounter(state, side, eid, card, "power", 1, { placed: true });
          }),
        },
      },
    },
    {
      event: "counter-added",
      req: req(function* (
        state: State,
        _s: Side,
        _e: EID,
        card: Card,
      ): Generator<any, any, any> {
        return getCounters(getCard(state, card) || card, "power") >= 4;
      }),
      msg: "add itself to score area as an agenda worth 1 agenda point",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        asAgenda(state, "runner", card, 1);
      }),
    },
  ],
  abilities: [
    setAutoresolve(
      ":auto-place-counter",
      "Kasi String placing power counters on itself",
    ),
  ],
};

/** Kati Jones */
export const katiJones: CardDef = {
  title: "Kati Jones",
  abilities: [
    {
      action: true,
      cost: [toC(":click", 1)],
      msg: "store 3 [Credits]",
      once: ":per-turn",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, side, eid, card, "credit", 3);
      }),
    },
    takeAllCreditsAbility({
      action: true,
      cost: [toC(":click", 1)],
      once: ":per-turn",
    }),
  ],
};

/** Keros Mcintyre */
export const kerosMcintyre: CardDef = {
  title: "Keros Mcintyre",
  events: [
    {
      event: "derez",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          firstEvent(
            state,
            side,
            "derez",
            (e: any) => e?.[0]?.side === "runner",
          ) && targets?.[0]?.context?.side === "runner"
        );
      }),
      msg: "gain 2 [Credits]",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        gainCredits(state, side, eid, 2);
      }),
    },
  ],
};

/** "Knickknack" O'Brian */
export const knickknackOBrian: CardDef = {
  title: '"Knickknack" O\'Brian',
  events: [
    {
      async: true,
      once: ":per-turn",
      event: "run",
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      req: req(function* (state: State, side: Side): Generator<any, any, any> {
        return (
          allInstalled(state, "runner").length >= 2 &&
          firstEvent(state, side, "run")
        );
      }),
      skippable: true,
      choices: {
        "not-self": true,
        req: req(function* (
          _s: State,
          _sd: Side,
          _e: EID,
          _c: Card,
          ts: any[],
        ): Generator<any, any, any> {
          return isRunner(ts[0]) && isInstalled(ts[0]);
        }),
      },
      msg: msg("trash to gain credits and draw a card"),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const t = targets[0];
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            trash(state, side, eid, t, {
              unpreventable: true,
              "cause-card": card,
            }),
          ],
          [],
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            gainCredits(state, side, eid, t?.cost || 0),
          ],
          [],
        );
        drawCards(state, side, eid, 1);
      }),
    },
  ],
};

/** Kongamato */
export const kongamato: CardDef = Object.assign(
  { title: "Kongamato" },
  biteyBoi("first"),
);

/** Lago Paranoá Shelter */
export const lagoParanoaShelter: CardDef = {
  title: "Lago Paranoá Shelter",
  events: [
    {
      event: "corp-install",
      optional: {
        prompt: "Trash the top card of the stack?",
        autoresolve: getAutoresolve(":auto-fire"),
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const c = targets?.[0]?.card;
          return (
            !isIce(c) &&
            firstEvent(
              state,
              side,
              "corp-install",
              (e: any) => !isIce(e?.[0]?.card),
            )
          );
        }),
        "yes-ability": {
          msg: msg("trash top card of stack and draw 1 card"),
          async: true,
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
          ): Generator<any, any, any> {
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                mill(state, "runner", eid, "runner", 1),
              ],
              [],
            );
            drawCards(state, "runner", eid, 1);
          }),
        },
      },
    },
  ],
  abilities: [setAutoresolve(":auto-fire", "Lago Paranoá Shelter")],
};

/** Laguna Velasco District */
export const lagunaVelascoDistrict: CardDef = {
  title: "Laguna Velasco District",
  events: [
    {
      event: "runner-click-draw",
      msg: "draw 1 additional card",
      effect: effect(function* (state: State): Generator<any, any, any> {
        (coreDrawing as any).clickDrawBonus?.(state, 1);
      }),
    },
  ],
};

/** Levy Advanced Research Lab */
export const levyAdvancedResearchLab: CardDef = {
  title: "Levy Advanced Research Lab",
  abilities: [
    {
      action: true,
      cost: [toC(":click", 1)],
      "keep-menu-open": ":while-clicks-left",
      label: "Reveal the top 4 cards of the stack",
      msg: msg("reveal top cards of stack"),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const top4 = ((state as any).runner?.deck || []).slice(0, 4);
        reveal(state, side, eid, top4);
        const programs = top4.filter(isProgram);
        continue_ability(
          state,
          side,
          {
            prompt: "Choose a Program to add to the grip",
            choices: programs.concat(["None"] as any),
            async: true,
            effect: effect(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              if (targets[0] !== "None")
                moveCard(state, side, targets[0], ":hand");
              effectCompleted(state, side, eid);
            }),
          },
          card,
          null,
        );
      }),
    },
  ],
};

/** Lewi Guilherme */
export const lewiGuilherme: CardDef = {
  title: "Lewi Guilherme",
  flags: { "drip-economy": true },
  "static-abilities": [corpHandSizePlus(-1)],
  events: [
    {
      event: "runner-turn-begins",
      label: "lose 1 [Credits] or trash",
      async: true,
      prompt: "Choose one",
      choices: ["Pay 1 [Credits]", "Trash Lewi Guilherme"],
      msg: msg("lose 1 [Credits] or trash itself"),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        if (targets[0] === "Trash Lewi Guilherme")
          trash(state, "runner", eid, card, { "cause-card": card });
        else pay(state, "runner", eid, card, toC(":credit", 1));
      }),
    },
  ],
};

/** Liberated Account */
export const liberatedAccount: CardDef = {
  title: "Liberated Account",
  data: { counter: { credit: 16 } },
  abilities: [
    takeNCreditsAbility(4, "resource", {
      action: true,
      cost: [toC(":click", 1)],
      "keep-menu-open": ":while-clicks-left",
      label: "take 4 [Credits]",
    }),
  ],
  events: [trashOnEmpty("credit")],
};

/** Liberated Chela */
export const liberatedChela: CardDef = {
  title: "Liberated Chela",
  abilities: [
    {
      action: true,
      cost: [toC(":click", 5), toC(":forfeit")],
      msg: "add itself to score area as an agenda worth 2 points",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        asAgenda(state, "runner", card, 2);
        effectCompleted(state, side, eid);
      }),
    },
  ],
};

/** Light the Fire! */
export const lightTheFire: CardDef = {
  title: "Light the Fire!",
  abilities: [
    {
      action: true,
      label: "Run a remote server",
      cost: [toC(":click", 1), toC(":trash-can"), toC(":brain", 1)],
      prompt: "Choose a remote server",
      choices: req(function* (state: State): Generator<any, any, any> {
        return cancellable(
          ((state as any).remotes || []).filter((s: any) =>
            canRunServer(state, s),
          ),
        );
      }),
      msg: msg(
        "make a run on a server during which cards in the root lose all abilities",
      ),
      "makes-run": true,
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        registerEvents(state, side, card, [
          {
            event: "successful-run",
            duration: ":end-of-run",
            async: true,
            req: req(function* (state: State): Generator<any, any, any> {
              return (
                !!(state as any).run && isRemote((state as any).run?.server)
              );
            }),
            effect: effect(function* (
              state: State,
              side: Side,
              eid: EID,
            ): Generator<any, any, any> {
              trashCards(
                state,
                side,
                eid,
                (state as any).run?.server?.content || [],
              );
            }),
            msg: "trash all cards in the server for no cost",
          },
        ]);
        makeRun(state, side, eid, targets[0], card);
      }),
    },
  ],
};

/** Logic Bomb */
export const logicBomb: CardDef = {
  title: "Logic Bomb",
  abilities: [
    {
      label: "Bypass the encountered ice",
      req: req(function* (state: State): Generator<any, any, any> {
        const ice = (state as any).currentIce;
        return !!(getCurrentEncounter(state) && ice && isRezzed(ice));
      }),
      msg: msg("bypass encountered ice"),
      cost: [toC(":trash-can")],
      effect: effect(function* (
        state: State,
        side: Side,
      ): Generator<any, any, any> {
        bypassIce(state);
        loseClicks(state, "runner", (state as any).runner?.click || 0);
      }),
    },
  ],
};

/** London Library */
export const londonLibrary: CardDef = {
  title: "London Library",
  abilities: [
    {
      action: true,
      async: true,
      label: "Install and host a non-virus program",
      cost: [toC(":click", 1)],
      "keep-menu-open": ":while-clicks-left",
      prompt: "Choose a non-virus program in the grip",
      choices: {
        req: req(function* (
          _s: State,
          _sd: Side,
          _e: EID,
          _c: Card,
          ts: any[],
        ): Generator<any, any, any> {
          return (
            isProgram(ts[0]) && !hasSubtype(ts[0], "Virus") && inHand(ts[0])
          );
        }),
      },
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        runnerInstall(state, side, eid, targets[0], {
          "host-card": card,
          "ignore-install-cost": true,
          "msg-keys": {
            "install-source": card,
            "include-cost-from-eid": eid,
            "display-origin": true,
          },
        });
      }),
    },
    {
      action: true,
      label: "Add a hosted program to the grip",
      cost: [toC(":click", 1)],
      "keep-menu-open": ":while-clicks-left",
      choices: {
        req: req(function* (
          _s: State,
          _sd: Side,
          _e: EID,
          card: Card,
          ts: any[],
        ): Generator<any, any, any> {
          return sameCard(card, ts[0]?.host);
        }),
      },
      msg: msg("add hosted program to Grip"),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        moveCard(state, side, targets[0], ":hand");
      }),
    },
  ],
  events: [
    {
      event: "runner-turn-ends",
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const programs = ((card as any).hosted || []).filter(isProgram);
        trashCards(state, side, eid, programs, { "cause-card": card });
      }),
    },
  ],
};

/** Manuel Lattes de Moura */
export const manuelLattesDeMoura: CardDef = {
  title: "Manuel Lattes de Moura",
  "static-abilities": [
    {
      type: ":basic-ability-additional-trash-cost",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          sameCard(card, targets[0]) && side === "corp" && threatLevel(3, state)
        );
      }),
      value: [toC(":trash-from-hand", 1)],
    },
  ],
  events: [
    {
      event: "breach-server",
      automatic: ":pre-breach",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = targets?.[0]?.context || {};
        return isTagged(state) && ["hq", "rd"].includes(ctx.server);
      }),
      msg: msg("access 1 additional card"),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        accessBonus(side, targets?.[0]?.context?.server, 1);
      }),
    },
  ],
};

/** "Pretty" Mary da Silva */
export const prettyMaryDaSilva: CardDef = {
  title: '"Pretty" Mary da Silva',
  events: [
    {
      event: "breach-server",
      automatic: ":last",
      async: true,
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return targets?.[0]?.context?.server === ":rd";
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        continue_ability(
          state,
          side,
          {
            optional: {
              prompt: "Access 1 additional card?",
              "yes-ability": {
                msg: "access 1 additional card",
                effect: effect(function* (
                  state: State,
                  side: Side,
                ): Generator<any, any, any> {
                  accessBonus(side, ":rd", 1);
                }),
              },
            },
          },
          card,
          null,
        );
      }),
    },
  ],
};

/** Maxwell James */
export const maxwellJames: CardDef = {
  title: "Maxwell James",
  "static-abilities": [linkPlus(1)],
  abilities: [
    {
      req: req(function* (state: State): Generator<any, any, any> {
        return (
          (state as any).runner?.register?.["successful-run"] || []
        ).includes(":hq");
      }),
      prompt: "Choose a piece of ice protecting a remote server",
      choices: {
        card: (c: any) => isIce(c) && isRezzed(c) && isRemote(getZone(c)?.[1]),
      },
      label: "Derez a piece of ice protecting a remote server",
      cost: [toC(":trash-can")],
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        derez(state, side, eid, targets[0]);
      }),
    },
  ],
};

/** Miss Bones */
export const missBones: CardDef = {
  title: "Miss Bones",
  data: { counter: { credit: 12 } },
  interactions: {
    "pay-credits": {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          (eid as any)?.sourceType === ":runner-trash-corp-cards" &&
          isInstalled(targets?.[0])
        );
      }),
      type: ":credit",
    },
  },
  abilities: [
    {
      prompt: "How many hosted credits do you want to take?",
      label: "Take hosted credits",
      choices: {
        number: req(function* (
          state: State,
          _s: Side,
          _e: EID,
          card: Card,
        ): Generator<any, any, any> {
          return getCounters(card, "credit");
        }),
      },
      msg: msg("gain credits for trashing installed cards"),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        spendCredits(state, side, eid, card, "credit", targets[0]);
      }),
    },
  ],
  events: [trashOnEmpty("credit")],
};

/** Motivation */
export const motivation: CardDef = {
  title: "Motivation",
  special: { "auto-fire": ":always" },
  flags: { "runner-turn-draw": true },
  events: [
    {
      event: "runner-turn-begins",
      label: "Look at the top card of the stack (start of turn)",
      req: req(function* (state: State): Generator<any, any, any> {
        return !!(state as any)["runner-phase-12"];
      }),
      once: ":per-turn",
      optional: {
        prompt: "Look at the top card of the stack?",
        autoresolve: getAutoresolve(":auto-fire"),
        "yes-ability": {
          prompt: req(function* (state: State): Generator<any, any, any> {
            return `The top card of the stack is ${(state as any).runner?.deck?.[0]?.title}`;
          }),
          msg: "look at the top card of the stack",
          choices: ["OK"],
        },
      },
    },
  ],
  abilities: [setAutoresolve(":auto-fire", "Motivation")],
};

/** Mr. Li */
export const mrLi: CardDef = {
  title: "Mr. Li",
  abilities: [
    {
      action: true,
      cost: [toC(":click", 1)],
      "keep-menu-open": ":while-clicks-left",
      msg: "draw 2 cards",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        registerEvents(state, side, card, [
          {
            event: "runner-draw",
            "unregister-once-resolved": true,
            duration: ":end-of-turn",
            prompt: "Choose 1 card to add to the bottom of the Stack",
            choices: {
              req: req(function* (
                state: State,
                _s: Side,
                _e: EID,
                _c: Card,
                ts: any[],
              ): Generator<any, any, any> {
                const drawing =
                  (state as any)["runner-currently-drawing"] || [];
                return drawing.some((d: any) => sameCard(d, ts[0]));
              }),
            },
            msg: "add 1 card to the bottom of the Stack",
            effect: effect(function* (
              state: State,
              side: Side,
              _e: EID,
              _c: Card,
              targets: any[],
            ): Generator<any, any, any> {
              moveCard(state, side, targets[0], ":deck");
            }),
          },
        ]);
        playSfx(state, side, "click-card-2");
        yield wait_for(
          state,
          [{ asyncResult: "result" }, drawCards(state, side, eid, 2)],
          [],
        );
        unregisterEvents(state, side, card);
        effectCompleted(state, side, eid);
      }),
    },
  ],
};

/** Muertos Gang Member */
export const muertosGangMember: CardDef = {
  title: "Muertos Gang Member",
  "on-install": {
    player: "corp",
    prompt: "Choose a card to derez",
    req: req(function* (state: State): Generator<any, any, any> {
      return allInstalled(state, "corp").some(
        (c: any) => isRezzed(c) && !isAgenda(c),
      );
    }),
    choices: {
      card: (c: any) => isCorp(c) && !isAgenda(c) && isRezzed(c),
      all: true,
    },
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      derez(state, "corp", eid, targets[0]);
    }),
  },
  abilities: [drawAbi(1, null, { cost: [toC(":trash-can")] })],
};

/** Mystic Maemi */
export const mysticMaemi: CardDef = companionBuilder(
  req(function* (
    state: State,
    side: Side,
    eid: EID,
    card: Card,
    targets: any[],
  ): Generator<any, any, any> {
    return isEvent(targets?.[0]) && (eid as any)?.sourceType === ":play";
  }),
  chooseOneHelper(null, [
    {
      option: "Trash Mystic Maemi",
      ability: {
        async: true,
        msg: "trash itself",
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          trash(state, side, eid, card, { "cause-card": card });
        }),
      },
    },
    {
      option: "Trash a random card from the grip",
      ability: { cost: [toC(":randomly-trash-from-hand", 1)] },
    },
  ]),
  {
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      return getCounters(getCard(state, card) || card, "credit") > 0;
    }),
    msg: "take 1 [Credits]",
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      takeCredits(state, side, eid, card, "credit", 1);
    }),
  },
);

/** Net Mercur */
export const netMercur: CardDef = {
  title: "Net Mercur",
  abilities: [
    {
      msg: "gain 1 [Credits]",
      async: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return getCounters(getCard(state, card) || card, "credit") > 0;
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        spendCredits(state, side, eid, card, "credit", 1);
      }),
    },
  ],
  events: [
    {
      event: "spent-credits-from-card",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          !!(state as any).run &&
          hasSubtype(targets?.[0]?.context?.card, "Stealth")
        );
      }),
      once: ":per-run",
      prompt: "Choose one",
      choices: ["Place 1 [Credits] on Net Mercur", "Draw 1 card"],
      async: true,
      msg: msg("gain 1 [Credits] or draw 1 card"),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        if (targets[0] === "Draw 1 card") drawCards(state, side, eid, 1);
        else addCounter(state, "runner", eid, card, "credit", 1);
      }),
    },
  ],
  interactions: {
    "pay-credits": {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        return !!(state as any).run;
      }),
      type: ":credit",
    },
  },
};

/** Network Exchange */
export const networkExchange: CardDef = {
  title: "Network Exchange",
  "on-install": { msg: "increase the install cost of non-innermost ice by 1" },
  "static-abilities": [
    {
      type: ":install-cost",
      req: req(function* (
        _s: State,
        _sd: Side,
        _e: EID,
        _c: Card,
        ts: any[],
      ): Generator<any, any, any> {
        return isIce(ts[0]);
      }),
      value: req(function* (
        _s: State,
        _sd: Side,
        _e: EID,
        _c: Card,
        ts: any[],
      ): Generator<any, any, any> {
        return (ts[1]?.["dest-zone"] || []).length > 0 ? 1 : 0;
      }),
    },
  ],
};

/** Neutralize All Threats */
export const neutralizeAllThreats: CardDef = {
  title: "Neutralize All Threats",
  events: [breachAccessBonus(":hq", 1)],
};

/** New Angeles City Hall */
export const newAngelesCityHall: CardDef = {
  title: "New Angeles City Hall",
  prevention: [
    {
      prevents: ":tag",
      type: ":ability",
      label: "New Angeles City Hall",
      prompt: "Pay 2 [Credits] to avoid a tag?",
      ability: {
        async: true,
        cost: [toC(":credit", 2)],
        msg: "avoid 1 tag",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return preventable(targets?.[0]?.context);
        }),
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
        ): Generator<any, any, any> {
          preventTag(state, "runner", eid, 1);
        }),
      },
    },
  ],
  events: [
    {
      event: "agenda-stolen",
      async: true,
      msg: "trash itself",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        trash(state, side, eid, card, {
          cause: ":runner-ability",
          "cause-card": card,
        });
      }),
    },
  ],
};

/** Nurse Hạnh */
export const nurseHanh: CardDef = {
  title: "Nurse Hạnh",
  events: [
    {
      event: "archives-flipped",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (targets?.[0]?.context?.count || 0) >= 2;
      }),
      msg: "draw 2 cards",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        drawCards(state, side, eid, 2);
      }),
    },
  ],
};

/** No Free Lunch */
export const noFreeLunch: CardDef = {
  title: "No Free Lunch",
  abilities: [
    {
      label: "Gain 3 [Credits]",
      msg: "gain 3 [Credits]",
      cost: [toC(":trash-can")],
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        gainCredits(state, side, eid, 3);
      }),
    },
    {
      label: "Remove 1 tag",
      msg: "remove 1 tag",
      cost: [toC(":trash-can")],
      async: true,
      "change-in-game-state": {
        req: req(function* (state: State): Generator<any, any, any> {
          return isTagged(state);
        }),
      },
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        loseTags(state, "runner", eid, 1);
      }),
    },
  ],
};

/** No One Home */
export const noOneHome: CardDef = {
  title: "No One Home",
  prevention: [
    {
      prevents: ":damage",
      type: ":event",
      prompt: "Trash No One Home to force the Corp to trace",
      ability: {
        async: true,
        msg: "force the Corp to trace",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = targets?.[0]?.context || {};
          return ctx.type === ":net";
        }),
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          trash(state, side, eid, card, {
            unpreventable: true,
            "cause-card": card,
          });
        }),
      },
    },
  ],
};

/** Off-Campus Apartment */
export const offCampusApartment: CardDef = {
  title: "Off-Campus Apartment",
  flags: { "runner-install-draw": true },
  "static-abilities": [
    {
      type: ":can-host",
      req: req(function* (
        _s: State,
        _sd: Side,
        _e: EID,
        _c: Card,
        ts: any[],
      ): Generator<any, any, any> {
        return isResource(ts[0]) && hasSubtype(ts[0], "Connection");
      }),
    },
  ],
  events: [
    {
      event: "runner-install",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return sameCard(card, targets?.[0]?.context?.card?.host);
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        drawCards(state, side, eid, 1);
      }),
    },
  ],
};

/** Officer Frank */
export const officerFrank: CardDef = {
  title: "Officer Frank",
  abilities: [
    {
      cost: [toC(":credit", 1), toC(":trash-can")],
      req: req(function* (state: State, side: Side): Generator<any, any, any> {
        return turnEvents(state, "runner", "damage").some(
          (e: any) => e?.[0]?.["damage-type"] === ":meat",
        );
      }),
      msg: "force the Corp to trash 2 random cards from HQ",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const shuffled = [...((state as any).corp?.hand || [])].sort(
          () => Math.random() - 0.5,
        );
        trashCards(state, "corp", eid, shuffled.slice(0, 2), {
          "cause-card": card,
        });
      }),
    },
  ],
};

/** Open Market */
export const openMarket: CardDef = {
  title: "Open Market",
  data: { counter: { credit: 6 } },
  flags: { "drip-economy": true },
  interactions: {
    "pay-credits": {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          (eid as any)?.sourceType === ":runner-install" &&
          hasAnySubtype(targets?.[0], ["Job", "Connection"])
        );
      }),
      type: ":credit",
    },
  },
  abilities: [],
  events: [
    {
      event: "runner-turn-begins",
      once: ":per-turn",
      automatic: ":gain-credits",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return (
          !!(state as any)["runner-phase-12"] && getCounters(card, "credit") > 0
        );
      }),
      msg: msg("gain credits"),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        takeCredits(state, side, eid, card, "credit", 1);
      }),
    },
    trashOnEmpty("credit"),
  ],
};

/** Oracle May */
export const oracleMay: CardDef = {
  title: "Oracle May",
  abilities: [
    {
      action: true,
      cost: [toC(":click", 1)],
      label: "Name a card type",
      once: ":per-turn",
      prompt: "Choose one",
      choices: ["Event", "Hardware", "Program", "Resource"],
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const c = (state as any).runner?.deck?.[0];
        if (!c) {
          effectCompleted(state, side, eid);
          return;
        }
        systemMsg(
          state,
          side,
          `uses ${card.title} to name ${targets[0]} and reveal ${c.title} from the top of the stack`,
        );
        yield wait_for(
          state,
          [{ asyncResult: "result" }, reveal(state, side, eid, c)],
          [],
        );
        if (c.type === targets[0]) {
          systemMsg(state, side, `gains 2 [Credits] and draws ${c.title}`);
          yield wait_for(
            state,
            [{ asyncResult: "result" }, gainCredits(state, side, eid, 2)],
            [],
          );
          drawCards(state, side, eid, 1);
        } else {
          systemMsg(state, side, `trashes ${c.title}`);
          mill(state, side, eid, "runner", 1);
        }
      }),
    },
  ],
};

/** Order of Sol */
export const orderOfSol: CardDef = {
  title: "Order of Sol",
  "on-install": {
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      if (((state as any).runner?.credit || 0) === 0)
        gainCredits(state, side, eid, 1);
      else effectCompleted(state, side, eid);
    }),
  },
  events: [
    {
      event: "runner-credit-loss",
      msg: "gain 1 [Credits]",
      req: req(function* (state: State): Generator<any, any, any> {
        return ((state as any).runner?.credit || 0) === 0;
      }),
      once: ":per-turn",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        gainCredits(state, side, eid, 1);
      }),
    },
    {
      event: "runner-spent-credits",
      msg: "gain 1 [Credits]",
      req: req(function* (state: State): Generator<any, any, any> {
        return ((state as any).runner?.credit || 0) === 0;
      }),
      once: ":per-turn",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        gainCredits(state, side, eid, 1);
      }),
    },
  ],
};

/** PAD Tap */
export const padTap: CardDef = {
  title: "PAD Tap",
  special: { "auto-fire": ":always" },
  events: [
    {
      event: "corp-credit-gain",
      optional: {
        prompt: "Gain 1 [Credit]?",
        autoresolve: getAutoresolve(":auto-fire"),
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = targets?.[0]?.context || {};
          return (
            ctx.action !== ":corp-click-credit" &&
            turnEvents(state, "corp", "corp-credit-gain").filter(
              (e: any) => e?.[0]?.action !== ":corp-click-credit",
            ).length === 1
          );
        }),
        "yes-ability": {
          msg: "gain 1 [Credits]",
          async: true,
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
          ): Generator<any, any, any> {
            gainCredits(state, "runner", eid, 1);
          }),
        },
      },
    },
  ],
  abilities: [setAutoresolve(":auto-fire", "PAD Tap")],
  "corp-abilities": [
    {
      action: true,
      label: "Trash PAD Tap",
      async: true,
      cost: [toC(":click", 1), toC(":credit", 3)],
      req: req(function* (state: State, side: Side): Generator<any, any, any> {
        return side === "corp";
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        systemMsg(
          state,
          "corp",
          "spends [Click] and 3 [Credits] to trash PAD Tap",
        );
        trash(state, "corp", eid, card, { "cause-card": card });
      }),
    },
  ],
};

/** Paige Piper */
export const paigePiper: CardDef = {
  title: "Paige Piper",
  events: [
    {
      event: "runner-install",
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      req: req(function* (state: State, side: Side): Generator<any, any, any> {
        return firstEvent(state, side, "runner-install");
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const title = targets?.[0]?.context?.card?.title;
        const matching = ((state as any).runner?.deck || []).filter(
          (c: any) => c?.title === title,
        );
        continue_ability(
          state,
          side,
          {
            optional: {
              prompt: `Search the stack for additional copies of ${title}?`,
              "yes-ability": {
                prompt: `How many copies of ${title} would you like to get?`,
                choices: Array.from({ length: matching.length + 1 }, (_, i) =>
                  String(i),
                ),
                msg: "shuffle the stack",
                async: true,
                effect: effect(function* (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets2: any[],
                ): Generator<any, any, any> {
                  const n = strToInt(targets2[0]);
                  triggerEvent(state, side, ":searched-stack");
                  shuffleDeck(state, "runner", "deck");
                  if (n > 0)
                    trashCards(state, side, eid, matching.slice(0, n), {
                      unpreventable: true,
                      "cause-card": card,
                    });
                  else effectCompleted(state, side, eid);
                }),
              },
            },
          },
          card,
          null,
        );
      }),
    },
  ],
};

/** Paladin Poemu */
export const paladinPoemu: CardDef = companionBuilder(
  req(function* (
    state: State,
    side: Side,
    eid: EID,
    card: Card,
    targets: any[],
  ): Generator<any, any, any> {
    return (
      (eid as any)?.sourceType === ":runner-install" &&
      !hasSubtype(targets?.[0], "Connection")
    );
  }),
  {
    prompt: "Choose an installed card to trash",
    choices: { all: true, card: (c: any) => isInstalled(c) && isRunner(c) },
    msg: msg("trash card"),
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      trash(state, side, eid, targets[0], {
        cause: ":runner-ability",
        "cause-card": card,
      });
    }),
  },
  {
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      return getCounters(getCard(state, card) || card, "credit") > 0;
    }),
    msg: "take 1 [Credits]",
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      takeCredits(state, side, eid, card, "credit", 1);
    }),
  },
);

/** Paparazzi */
export const paparazzi: CardDef = {
  title: "Paparazzi",
  prevention: [
    {
      prevents: ":damage",
      type: ":event",
      "max-uses": 1,
      mandatory: true,
      ability: {
        async: true,
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = targets?.[0]?.context || {};
          return ctx.type === ":meat" && preventable(ctx);
        }),
        msg: msg("prevent damage"),
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
        ): Generator<any, any, any> {
          preventDamage(state, side, eid, "all");
        }),
      },
    },
  ],
  "static-abilities": [{ type: ":is-tagged", value: true }],
};

/** Patron */
export const patron: CardDef = {
  title: "Patron",
  abilities: [
    {
      prompt: "Choose a server",
      label: "Choose a server (start of turn)",
      choices: req(function* (state: State): Generator<any, any, any> {
        return ((state as any).servers || []).concat(["No server"]);
      }),
      skippable: true,
      once: ":per-turn",
      req: req(function* (state: State): Generator<any, any, any> {
        return !!(state as any)["runner-phase-12"];
      }),
      msg: msg("target server"),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        if (targets[0] !== "No server")
          updateCard(
            state,
            side,
            Object.assign({}, card, { "card-target": targets[0] }) as any,
          );
      }),
    },
  ],
};

/** Paule's Café */
export const paulesCafe: CardDef = {
  title: "Paule's Café",
  abilities: [
    {
      action: true,
      label: "Host a program or piece of hardware",
      cost: [toC(":click", 1)],
      "keep-menu-open": ":while-clicks-left",
      choices: {
        card: (c: any) =>
          (c?.type === "Program" || c?.type === "Hardware") &&
          inHand(c) &&
          isRunner(c),
      },
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        host(state, side, card, targets[0]);
      }),
      msg: msg("install and host card"),
    },
  ],
};

/** Penumbral Toolkit */
export const penumbralToolkit: CardDef = {
  title: "Penumbral Toolkit",
  data: { counter: { credit: 4 } },
  "install-cost-bonus": req(function* (state: State): Generator<any, any, any> {
    return ((state as any).runner?.register?.["successful-run"] || []).includes(
      ":hq",
    )
      ? -2
      : 0;
  }),
  abilities: [
    {
      msg: "gain 1 [Credits]",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return !!(state as any).run && getCounters(card, "credit") > 0;
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        spendCredits(state, side, eid, card, "credit", 1);
      }),
    },
  ],
  events: [trashOnEmpty("credit")],
  interactions: {
    "pay-credits": {
      req: req(function* (state: State): Generator<any, any, any> {
        return !!(state as any).run;
      }),
      type: ":credit",
    },
  },
};

/** Personal Workshop */
export const personalWorkshop: CardDef = {
  title: "Personal Workshop",
  flags: { "drip-economy": true },
  abilities: [
    {
      action: true,
      async: true,
      label: "Host a program or piece of hardware",
      cost: [toC(":click", 1)],
      "keep-menu-open": ":while-clicks-left",
      prompt: "Choose a program or piece of hardware in the grip",
      choices: {
        card: (c: any) =>
          (isProgram(c) || isHardware(c)) && inHand(c) && isRunner(c),
      },
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const t = targets[0];
        if (!t?.cost || t.cost <= 0)
          runnerInstall(state, side, eid, t, {
            "ignore-all-cost": true,
            "msg-keys": { "display-origin": true, "install-source": card },
          });
        else {
          host(
            state,
            side,
            card,
            Object.assign({}, t, { counter: { power: t.cost } }),
          );
          effectCompleted(state, side, eid);
        }
      }),
      msg: msg("install and host card"),
    },
  ],
};

/** Political Operative */
export const politicalOperative: CardDef = {
  title: "Political Operative",
  req: req(function* (state: State): Generator<any, any, any> {
    return ((state as any).runner?.register?.["successful-run"] || []).includes(
      ":hq",
    );
  }),
  abilities: [
    {
      async: true,
      "fake-cost": [toC(":trash-can")],
      label: "Trash a rezzed card",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        continue_ability(
          state,
          side,
          {
            prompt: "Choose a rezzed card with a trash cost",
            choices: { card: (c: any) => c?.trash && isRezzed(c) },
            async: true,
            effect: effect(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              const t = targets[0];
              continue_ability(
                state,
                side,
                {
                  async: true,
                  msg: msg("trash rezzed card"),
                  cost: [
                    toC(":credit", trashCost(state, "runner", t)),
                    toC(":trash-can"),
                  ],
                  effect: effect(function* (
                    state: State,
                    side: Side,
                    eid: EID,
                    card: Card,
                  ): Generator<any, any, any> {
                    trash(state, side, eid, t, { "cause-card": card });
                  }),
                },
                card,
                targets,
              );
            }),
          },
          card,
          null,
        );
      }),
    },
  ],
};

/** Power Tap */
export const powerTap: CardDef = {
  title: "Power Tap",
  events: [
    {
      event: "initialize-trace",
      msg: "gain 1 [Credits]",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        gainCredits(state, "runner", eid, 1);
      }),
    },
  ],
};

/** Professional Contacts */
export const professionalContacts: CardDef = {
  title: "Professional Contacts",
  abilities: [
    {
      action: true,
      cost: [toC(":click", 1)],
      msg: "gain 1 [Credits] and draw 1 card",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [{ asyncResult: "result" }, gainCredits(state, side, eid, 1)],
          [],
        );
        playSfx(state, side, "professional-contacts");
        drawCards(state, side, eid, 1);
      }),
    },
  ],
};

/** Psych Mike */
export const psychMike: CardDef = {
  title: "Psych Mike",
  special: { "auto-fire": ":always" },
  events: [
    {
      event: "run-ends",
      optional: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = targets?.[0]?.context || {};
          return (
            targetServer(ctx) === ":rd" &&
            firstSuccessfulRunOnServer(state, ":rd") &&
            totalCardsAccessed(ctx, ":deck") > 0
          );
        }),
        prompt: "Gain 1 [Credits] for each card you accessed from R&D?",
        autoresolve: getAutoresolve(":auto-fire"),
        "yes-ability": {
          msg: msg("gain credits"),
          async: true,
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            gainCredits(
              state,
              "runner",
              eid,
              totalCardsAccessed(targets?.[0]?.context, ":deck"),
            );
          }),
        },
      },
    },
  ],
  abilities: [setAutoresolve(":auto-fire", "Psych Mike")],
};

/** Public Sympathy */
export const publicSympathy: CardDef = {
  title: "Public Sympathy",
  "static-abilities": [runnerHandSizePlus(2)],
};

/** Rachel Beckman */
export const rachelBeckman: CardDef = trashWhenTagged("Rachel Beckman", {
  title: "Rachel Beckman",
  "in-play": [":click-per-turn", 1],
});

/** Raymond Flint */
export const raymondFlint: CardDef = {
  title: "Raymond Flint",
  events: [
    {
      event: "corp-gain-bad-publicity",
      async: true,
      msg: "breach HQ",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        breachServer(state, "runner", eid, [":hq"], { "no-root": true });
      }),
    },
  ],
  abilities: [
    {
      label: "Expose 1 installed card",
      choices: { card: isInstalled },
      async: true,
      cost: [toC(":trash-can")],
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        expose(state, side, eid, [targets[0]]);
      }),
    },
  ],
};

/** Reclaim */
export const reclaim: CardDef = {
  title: "Reclaim",
  abilities: [
    {
      action: true,
      async: true,
      label:
        "Install a program, piece of hardware, or Virtual resource from the heap",
      cost: [toC(":click", 1), toC(":trash-can"), toC(":trash-from-hand", 1)],
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        continue_ability(
          state,
          side,
          {
            async: true,
            prompt: "Choose a card to install",
            choices: req(function* (state: State): Generator<any, any, any> {
              return ((state as any).runner?.discard || [])
                .filter(
                  (c: any) =>
                    isProgram(c) ||
                    isHardware(c) ||
                    (isResource(c) && hasSubtype(c, "Virtual")),
                )
                .sort((a: any, b: any) =>
                  (a.title || "").localeCompare(b.title || ""),
                );
            }),
            effect: effect(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              runnerInstall(state, "runner", eid, targets[0], {
                "msg-keys": {
                  "install-source": card,
                  "display-origin": true,
                  "include-cost-from-eid": eid,
                },
              });
            }),
          },
          card,
          null,
        );
      }),
    },
  ],
};

/** Red Team */
export const redTeam: CardDef = {
  title: "Red Team",
  data: { counter: { credit: 12 } },
  events: [
    trashOnEmpty("credit"),
    {
      event: "successful-run",
      automatic: ":gain-credits",
      req: req(function* (state: State): Generator<any, any, any> {
        return !!(state as any)["this-card-run"];
      }),
      msg: msg("gain credits"),
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        takeCredits(state, side, eid, card, "credit", 3);
      }),
    },
  ],
  abilities: [
    {
      action: true,
      cost: [toC(":click", 1)],
      prompt: "Choose a server",
      choices: req(function* (state: State): Generator<any, any, any> {
        return cancellable(
          ((state as any).runnableServers || []).filter((s: any) =>
            isCentral(unknownToKw(s)),
          ),
        );
      }),
      label: "make a run on a central server",
      msg: msg("make a run"),
      "makes-run": true,
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        makeRun(state, side, eid, targets[0], card);
      }),
    },
  ],
};

/** Rent Rioters */
export const rentRioters: CardDef = {
  title: "Rent Rioters",
  abilities: [
    {
      action: true,
      cost: [toC(":click", 3), toC(":trash-can")],
      "keep-menu-open": ":while-clicks-left",
      label: "gain 9 [Credits]",
      msg: "gain 9 [Credits]",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        playSfx(state, side, "click-credit-3");
        gainCredits(state, side, eid, 9);
      }),
    },
  ],
};

/** Rogue Trading */
export const rogueTrading: CardDef = {
  title: "Rogue Trading",
  data: { counter: { credit: 18 } },
  events: [trashOnEmpty("credit")],
  abilities: [
    {
      action: true,
      cost: [toC(":click", 2)],
      msg: "gain 6 [Credits] and take 1 tag",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        playSfx(state, side, "click-credit-3");
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            takeCredits(state, side, eid, card, "credit", 6, {
              "suppress-checkpoint": true,
            }),
          ],
          [],
        );
        gainTags(state, "runner", eid, 1);
      }),
    },
  ],
};

/** Rolodex */
export const rolodex: CardDef = {
  title: "Rolodex",
  "on-install": {
    async: true,
    msg: "look at the top 5 cards of the stack",
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      const top = ((state as any).runner?.deck || []).slice(0, 5);
      if (top.length)
        continue_ability(
          state,
          side,
          reorderChoice("runner", "corp", top, [], top.length, top),
          card,
          null,
        );
      else effectCompleted(state, side, eid);
    }),
  },
  "on-trash": {
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      systemMsg(
        state,
        "runner",
        `trashes cards from the stack due to ${card.title} being trashed`,
      );
      mill(state, "runner", eid, "runner", 3);
    }),
  },
};

/** Rosetta 2.0 */
export const rosetta20: CardDef = {
  title: "Rosetta 2.0",
  abilities: [
    {
      action: true,
      req: req(function* (state: State, side: Side): Generator<any, any, any> {
        return !installLocked(state, side);
      }),
      label: "Install a program from the stack",
      async: true,
      cost: [toC(":click", 1), toC(":rfg-program", 1)],
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        continue_ability(
          state,
          side,
          {
            async: true,
            prompt: "Choose a non-virus program to install",
            choices: req(function* (state: State): Generator<any, any, any> {
              return ((state as any).runner?.deck || [])
                .filter((c: any) => isProgram(c) && !hasSubtype(c, "Virus"))
                .sort((a: any, b: any) =>
                  (a.title || "").localeCompare(b.title || ""),
                )
                .concat(["Done"]);
            }),
            effect: effect(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              triggerEvent(state, side, ":searched-stack");
              shuffleDeck(state, side, "deck");
              if (targets[0] === "Done") effectCompleted(state, side, eid);
              else
                runnerInstall(state, side, eid, targets[0], {
                  "msg-keys": {
                    "display-origin": true,
                    "install-source": card,
                    "include-cost-from-eid": eid,
                  },
                });
            }),
          },
          card,
          null,
        );
      }),
    },
  ],
};

/** Sacrificial Clone */
export const sacrificialClone: CardDef = {
  title: "Sacrificial Clone",
  prevention: [
    {
      prevents: ":damage",
      type: ":ability",
      "max-uses": 1,
      ability: {
        async: true,
        cost: [toC(":trash-can")],
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return preventable(targets?.[0]?.context);
        }),
        msg: msg("prevent damage"),
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
        ): Generator<any, any, any> {
          yield wait_for(
            state,
            [{ asyncResult: "result" }, preventDamage(state, side, eid, "all")],
            [],
          );
          const runner = (state as any).runner;
          const cards = (runner?.rig?.hardware || []).concat(
            (runner?.rig?.resource || []).filter(
              (c: any) => !hasSubtype(c, "Virtual"),
            ),
            runner?.hand || [],
          );
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              trashCards(state, side, eid, cards, {}),
            ],
            [],
          );
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              loseCredits(state, side, makeEid(state, eid), "all"),
            ],
            [],
          );
          loseTags(state, side, eid, "all");
        }),
      },
    },
  ],
};

/** Sacrificial Construct */
export const sacrificialConstruct: CardDef = {
  title: "Sacrificial Construct",
  prevention: [
    preventTrashInstalledByType(
      "Sacrificial Construct",
      ["Program", "Hardware"],
      [toC(":trash-can")],
      (ctx: any) => ctx?.cause !== ":ability-cost" && !ctx?.["game-trash"],
    ),
  ],
};

/** Safety First */
export const safetyFirst: CardDef = {
  title: "Safety First",
  "static-abilities": [runnerHandSizePlus(-2)],
  events: [
    {
      event: "runner-turn-ends",
      automatic: ":pre-draw-cards",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const hs = (coreHandSize as any).handSize?.(state, "runner") ?? 5;
        if (((state as any).runner?.hand || []).length < hs) {
          systemMsg(state, "runner", `uses ${card.title} to draw 1 card`);
          drawCards(state, "runner", eid, 1);
        } else effectCompleted(state, "runner", eid);
      }),
    },
  ],
};

/** Salsette Slums */
export const salsetteSlums: CardDef = {
  title: "Salsette Slums",
  interactions: {
    "access-ability": {
      label: "Remove card from game",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const t = targets[0];
        return (
          !inDiscard(t) &&
          !!t?.trash &&
          canPay(state, "runner", eid, card, t?.title, [
            toC(":credit", trashCost(state, side, t)),
          ])
        );
      }),
      once: ":per-turn",
      async: true,
      "trash?": false,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const t = targets[0];
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            pay(state, side, makeEid(state, eid), card, [
              toC(":credit", trashCost(state, side, t)),
            ]),
          ],
          [],
        );
        const moved = moveCard(state, "corp", t, ":rfg");
        systemMsg(state, side, `removes ${t?.title} from the game`);
        completeWithResult(state, side, eid, moved);
      }),
    },
  },
};

/** Salvaged Vanadis Armory */
export const salvagedVanadisArmory: CardDef = {
  title: "Salvaged Vanadis Armory",
  events: [
    {
      event: "damage",
      "fake-cost": [toC(":trash-can")],
      optional: {
        prompt:
          "Trash Salvaged Vanadis Armory to force the Corp to trash the top cards of R&D?",
        "yes-ability": {
          async: true,
          cost: [toC(":trash-can")],
          msg: msg("force the Corp to trash top cards of R&D"),
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
          ): Generator<any, any, any> {
            const n = (coreEvents as any).getTurnDamage?.(state, "runner") ?? 0;
            mill(state, "corp", eid, "corp", n);
          }),
        },
      },
    },
  ],
};

/** Same Old Thing */
export const sameOldThing: CardDef = {
  title: "Same Old Thing",
  abilities: [
    {
      action: true,
      async: true,
      label: "play an event in the heap",
      cost: [toC(":click", 2), toC(":trash-can")],
      prompt: "Choose an event in the heap",
      msg: msg("play event from heap"),
      "show-discard": true,
      choices: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return (
            isEvent(targets[0]) &&
            inDiscard(targets[0]) &&
            canPlayInstant(state, side, eid, targets[0], {
              "base-cost": [toC(":click", 2)],
            })
          );
        }),
      },
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        playInstant(state, side, eid, targets[0]);
      }),
    },
  ],
};

/** Scrubber */
export const scrubber: CardDef = {
  title: "Scrubber",
  recurring: 2,
  interactions: {
    "pay-credits": {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          (eid as any)?.sourceType === ":runner-trash-corp-cards" &&
          isCorp(targets?.[0])
        );
      }),
      type: ":recurring",
    },
  },
};

/** Security Testing */
export const securityTesting: CardDef = {
  title: "Security Testing",
  abilities: [
    {
      prompt: "Choose a server",
      label: "Choose a server (start of turn)",
      skippable: true,
      choices: req(function* (state: State): Generator<any, any, any> {
        return ((state as any).servers || []).concat(["No server"]);
      }),
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      msg: msg("target server"),
      req: req(function* (state: State): Generator<any, any, any> {
        return !!(state as any)["runner-phase-12"];
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        if (targets[0] !== "No server")
          updateCard(
            state,
            side,
            Object.assign({}, card, { "card-target": targets[0] }) as any,
          );
      }),
    },
  ],
};

/** Shadow Team */
export const shadowTeam: CardDef = {
  title: "Shadow Team",
  events: [
    {
      event: "run",
      req: req(function* (state: State): Generator<any, any, any> {
        return ((state as any).runner?.hand?.length || 0) > 0;
      }),
      msg: ":cost" as any,
      cost: [toC(":trash-from-hand", 1)],
    },
    {
      event: "successful-run",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return [":hq", ":rd", ":archives"].includes(
          targetServer(targets?.[0]?.context),
        );
      }),
      msg: "destroy itself",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        moveCard(state, side, card, ":destroyed");
      }),
    },
  ],
};

/** Side Hustle */
export const sideHustle: CardDef = {
  title: "Side Hustle",
  data: { counter: { credit: 1 } },
  events: [
    {
      event: "run",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, side, eid, card, "credit", 1);
      }),
    },
    {
      event: "counter-added",
      async: true,
      req: req(function* (
        state: State,
        _s: Side,
        _e: EID,
        card: Card,
      ): Generator<any, any, any> {
        return getCounters(getCard(state, card) || card, "credit") >= 6;
      }),
      msg: msg("gain credits, draw 1 card, and trash itself"),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            takeCredits(state, side, eid, card, "credit", "all", {
              "suppress-checkpoint": true,
            }),
          ],
          [],
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            drawCards(state, side, eid, 1, { "suppress-checkpoint": true }),
          ],
          [],
        );
        trash(state, side, eid, card, { "cause-card": card });
      }),
    },
  ],
};

/** Smartware Distributor */
export const smartwareDistributor: CardDef = {
  title: "Smartware Distributor",
  flags: {
    "drip-economy": req(function* (
      state: State,
      _s: Side,
      _e: EID,
      card: Card,
    ): Generator<any, any, any> {
      return getCounters(card, "credit") > 0;
    }),
  },
  abilities: [
    {
      action: true,
      cost: [toC(":click", 1)],
      msg: "place 3 [Credits]",
      req: req(function* (state: State): Generator<any, any, any> {
        return !(state as any)["runner-phase-12"];
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, side, eid, card, "credit", 3);
      }),
    },
  ],
  events: [
    {
      event: "runner-turn-begins",
      once: ":per-turn",
      automatic: ":gain-credits",
      label: "Take 1 [Credits] (start of turn)",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return (
          !!(state as any)["runner-phase-12"] && getCounters(card, "credit") > 0
        );
      }),
      msg: "gain 1 [Credits]",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        takeCredits(state, side, eid, card, "credit", 1);
      }),
    },
  ],
};

/** Slipstream */
export const slipstream: CardDef = {
  title: "Slipstream",
  events: [
    {
      event: "pass-ice",
      optional: {
        prompt: msg(
          "Trash to approach a piece of ice protecting a central server?",
        ),
        "yes-ability": {
          async: true,
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
          ): Generator<any, any, any> {
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                trash(state, side, eid, card, {
                  unpreventable: true,
                  "cause-card": card,
                }),
              ],
              [],
            );
            effectCompleted(state, side, eid);
          }),
        },
      },
    },
  ],
};

/** Spoilers */
export const spoilers: CardDef = {
  title: "Spoilers",
  events: [
    {
      event: "agenda-scored",
      async: true,
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      msg: "trash the top card of R&D",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        mill(state, "corp", eid, "corp", 1);
      }),
    },
  ],
};

/** Starlight Crusade Funding */
export const starlightCrusadeFunding: CardDef = {
  title: "Starlight Crusade Funding",
  "on-install": {
    msg: "ignore additional costs on Double events",
    effect: effect(function* (state: State): Generator<any, any, any> {
      (state as any).runner = (state as any).runner || {};
      (state as any).runner.register = (state as any).runner.register || {};
      (state as any).runner.register["double-ignore-additional"] = true;
    }),
  },
  events: [
    {
      event: "runner-turn-begins",
      automatic: ":lose-clicks",
      msg: "lose [Click] and ignore additional costs on Double events",
      effect: effect(function* (state: State): Generator<any, any, any> {
        loseClicks(state, "runner", 1);
        (state as any).runner.register["double-ignore-additional"] = true;
      }),
    },
  ],
};

/** Stim Dealer */
export const stimDealer: CardDef = {
  title: "Stim Dealer",
  events: [
    {
      event: "runner-turn-begins",
      async: true,
      msg: msg("takes 1 core damage or gain [Click]"),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        if (getCounters(card, "power") >= 2) {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              addCounter(
                state,
                side,
                eid,
                card,
                "power",
                -getCounters(card, "power"),
              ),
            ],
            [],
          );
          damage(state, side, eid, ":brain", 1, { unpreventable: true, card });
        } else {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              addCounter(state, side, eid, card, "power", 1),
            ],
            [],
          );
          gainClicks(state, side, 1);
          effectCompleted(state, side, eid);
        }
      }),
    },
  ],
};

/** Stoneship Chart Room */
export const stoneshipChartRoom: CardDef = {
  title: "Stoneship Chart Room",
  abilities: [
    drawAbi(2, null, { cost: [toC(":trash-can")] }),
    {
      label: "Charge a card",
      req: req(function* (state: State, side: Side): Generator<any, any, any> {
        return canCharge(state, side);
      }),
      cost: [toC(":trash-can")],
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        continue_ability(state, side, chargeAbility(state, side), card, null);
      }),
    },
  ],
};

/** Street Peddler */
export const streetPeddler: CardDef = {
  title: "Street Peddler",
  "on-install": {
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      const top3 = ((state as any).runner?.deck || []).slice(0, 3);
      for (const c of top3)
        host(state, side, getCard(state, card) || card, c, { facedown: true });
    }),
  },
  abilities: [
    {
      async: true,
      "fake-cost": [toC(":trash-can")],
      label: "Install a hosted card",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        effectCompleted(state, side, eid);
      }),
    },
  ],
};

/** Symmetrical Visage */
export const symmetricalVisage: CardDef = {
  title: "Symmetrical Visage",
  events: [
    {
      event: "runner-click-draw",
      req: req(function* (state: State, side: Side): Generator<any, any, any> {
        return geneticsTrigger(state, side, "runner-click-draw");
      }),
      msg: "gain 1 [Credits]",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        gainCredits(state, side, eid, 1);
      }),
    },
  ],
};

/** Synthetic Blood */
export const syntheticBlood: CardDef = {
  title: "Synthetic Blood",
  events: [
    {
      event: "damage",
      req: req(function* (state: State, side: Side): Generator<any, any, any> {
        return geneticsTrigger(state, side, "damage");
      }),
      msg: "draw 1 card",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        drawCards(state, "runner", eid, 1);
      }),
    },
  ],
};

/** Tallie Perrault */
export const talliePerrault: CardDef = {
  title: "Tallie Perrault",
  abilities: [
    {
      label: "Draw 1 card for each bad publicity the Corp has",
      async: true,
      cost: [toC(":trash-can")],
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        drawCards(state, side, eid, countBadPub(state));
      }),
      msg: msg("draw cards"),
    },
  ],
  events: [
    {
      event: "play-operation",
      optional: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const c = targets?.[0]?.context?.card;
          return hasSubtype(c, "Black Ops") || hasSubtype(c, "Gray Ops");
        }),
        prompt: "Give the Corp 1 bad publicity and take 1 tag?",
        "yes-ability": {
          msg: "give the Corp 1 bad publicity and take 1 tag",
          async: true,
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
          ): Generator<any, any, any> {
            gainBadPublicity(state, "corp", 1 as any, {
              "suppress-checkpoint": true,
            });
            gainTags(state, "runner", eid, 1);
          }),
        },
      },
    },
  ],
};

/** Tech Trader */
export const techTrader: CardDef = {
  title: "Tech Trader",
  events: [
    {
      event: "costs-paid",
      async: true,
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = targets?.[0]?.context || {};
        return (
          ctx.side === "runner" &&
          (ctx.payment || []).some(
            (p: any) => p?.["paid/type"] === ":trash-can",
          )
        );
      }),
      msg: "gain 1 [Credits]",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        gainCredits(state, side, eid, 1);
      }),
    },
  ],
};

/** Technical Writer */
export const technicalWriter: CardDef = {
  title: "Technical Writer",
  events: [
    {
      event: "runner-install",
      silent: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = targets?.[0]?.context || {};
        return (
          (isHardware(ctx.card) || isProgram(ctx.card)) && !ctx["facedown?"]
        );
      }),
      msg: "place 1 [Credits] on itself",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, "runner", eid, card, "credit", 1);
      }),
    },
  ],
  abilities: [
    {
      action: true,
      cost: [toC(":click", 1), toC(":trash-can")],
      label: "Take all hosted credits",
      msg: msg("gain credits"),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        gainCredits(state, side, eid, getCounters(card, "credit"));
      }),
    },
  ],
};

/** Telework Contract */
export const teleworkContract: CardDef = {
  title: "Telework Contract",
  data: { counter: { credit: 9 } },
  events: [trashOnEmpty("credit")],
  abilities: [
    takeNCreditsAbility(3, "resource", {
      action: true,
      cost: [toC(":click", 1)],
      once: ":per-turn",
    }),
  ],
};

/** Temple of the Liberated Mind */
export const templeOfTheLiberatedMind: CardDef = {
  title: "Temple of the Liberated Mind",
  abilities: [
    {
      action: true,
      cost: [toC(":click", 1)],
      label: "Place 1 power counter",
      msg: "place 1 power counter on itself",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, side, eid, card, "power", 1);
      }),
    },
    {
      label: "Gain [Click]",
      cost: [toC(":power", 1)],
      req: req(function* (state: State): Generator<any, any, any> {
        return (state as any)["active-player"] === "runner";
      }),
      msg: "gain [Click]",
      once: ":per-turn",
      effect: effect(function* (
        state: State,
        side: Side,
      ): Generator<any, any, any> {
        gainClicks(state, side, 1);
      }),
    },
  ],
};

/** Temüjin Contract */
export const temujinContract: CardDef = {
  title: "Temüjin Contract",
  data: { counter: { credit: 20 } },
  "on-install": {
    prompt: "Choose a server",
    choices: req(function* (state: State): Generator<any, any, any> {
      return (state as any).servers || [];
    }),
    msg: msg("target server"),
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const target: any = (targets as any[])?.[0];
      updateCard(
        state,
        side,
        Object.assign({}, card, { "card-target": targets[0] }) as any,
      );
    }),
  },
  events: [
    trashOnEmpty("credit"),
    {
      event: "successful-run",
      automatic: ":gain-credits",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        return (
          zoneToName(targets?.[0]?.context?.server) ===
          ((getCard(state, card) as any) || card)?.["card-target"]
        );
      }),
      msg: msg("gain credits"),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        takeCredits(state, side, eid, card, "credit", 4);
      }),
    },
  ],
};

/** The Archivist */
export const theArchivist: CardDef = {
  title: "The Archivist",
  "static-abilities": [linkPlus(1)],
  events: [
    {
      event: "agenda-scored",
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      trace: {
        base: 1,
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const c = targets?.[0]?.context?.card;
          return hasSubtype(c, "Initiative") || hasSubtype(c, "Security");
        }),
        unsuccessful: {
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
          ): Generator<any, any, any> {
            gainBadPublicity(state, "corp", 1 as any);
            systemMsg(state, "corp", "takes 1 bad publicity");
          }),
        },
      },
    },
  ],
};

/** The Artist */
export const theArtist: CardDef = {
  title: "The Artist",
  abilities: [
    {
      action: true,
      cost: [toC(":click", 1)],
      label: "Gain 2 [Credits]",
      msg: "gain 2 [Credits]",
      once: ":per-turn",
      "once-key": ":artist-credits",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        playSfx(state, side, "click-credit-2");
        gainCredits(state, side, eid, 2);
      }),
    },
    {
      action: true,
      cost: [toC(":click", 1)],
      label: "Install a program or piece of hardware",
      prompt: "Choose a program or piece of hardware to install",
      choices: {
        card: (c: any) => (isHardware(c) || isProgram(c)) && inHand(c),
      },
      once: ":per-turn",
      "once-key": ":artist-install",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        runnerInstall(state, side, eid, targets[0], {
          "msg-keys": { "install-source": card, "display-source": true },
          "cost-bonus": -1,
        });
      }),
    },
  ],
};

/** The Back */
export const theBack: CardDef = {
  title: "The Back",
  implementation: "Placing power counters is manual",
  abilities: [
    {
      label: "Manually place 1 power counter",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        systemMsg(
          state,
          side,
          `manually places 1 power counter on ${card.title}`,
        );
        addCounter(state, side, eid, card, "power", 1);
      }),
    },
    {
      action: true,
      label: "Shuffle back cards with [Trash] abilities",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return (
          getCounters(card, "power") > 0 &&
          ((state as any).runner?.discard || []).some(hasTrashAbility) &&
          !zoneLocked(state, "runner", ":discard")
        );
      }),
      cost: [toC(":click", 1), toC(":remove-from-game")],
      "show-discard": true,
      choices: {
        max: req(function* (
          _s: State,
          _sd: Side,
          _e: EID,
          card: Card,
        ): Generator<any, any, any> {
          return 2 * getCounters(card, "power");
        }),
        req: req(function* (
          _s: State,
          _sd: Side,
          _e: EID,
          _c: Card,
          ts: any[],
        ): Generator<any, any, any> {
          return isRunner(ts[0]) && inDiscard(ts[0]) && hasTrashAbility(ts[0]);
        }),
      },
      msg: msg("shuffle cards into the stack"),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        for (const c of targets) moveCard(state, side, c, ":deck");
        shuffleDeck(state, side, "deck");
        effectCompleted(state, side, eid);
      }),
    },
  ],
};

/** The Black File */
export const theBlackFile: CardDef = {
  title: "The Black File",
  "on-install": {
    msg: "prevent the Corp from winning the game unless they are flatlined",
  },
  "static-abilities": [
    {
      type: ":cannot-win-on-points",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return side === "corp" && getCounters(card, "power") < 3;
      }),
      value: true,
    },
  ],
  events: [
    {
      event: "runner-turn-begins",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        if (getCounters(card, "power") >= 2) {
          moveCard(state, side, card, ":rfg");
          systemMsg(state, side, "removes The Black File from the game");
          checkWinByAgenda(state, side);
          effectCompleted(state, side, eid);
        } else addCounter(state, side, eid, card, "power", 1);
      }),
    },
  ],
  "on-trash": {
    effect: effect(function* (state: State): Generator<any, any, any> {
      checkWinByAgenda(state);
    }),
  },
  "leave-play": effect(function* (state: State): Generator<any, any, any> {
    checkWinByAgenda(state);
  }),
};

/** The Class Act */
export const theClassAct: CardDef = {
  title: "The Class Act",
  events: [
    {
      event: "corp-turn-ends",
      req: req(function* (
        state: State,
        _s: Side,
        _e: EID,
        card: Card,
      ): Generator<any, any, any> {
        return (card as any)["installed-this-turn"];
      }),
      async: true,
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      automatic: ":pre-draw-cards",
      msg: "draw 4 cards",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        drawCards(state, "runner", eid, 4);
      }),
    },
  ],
};

/** The Helpful AI */
export const theHelpfulAI: CardDef = {
  title: "The Helpful AI",
  "static-abilities": [linkPlus(1)],
  abilities: [
    {
      msg: msg("give +2 strength to icebreaker"),
      label: "pump icebreaker",
      choices: {
        card: (c: any) => hasSubtype(c, "Icebreaker") && isInstalled(c),
      },
      cost: [toC(":trash-can")],
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        pump(targets[0], 2, ":end-of-turn");
      }),
    },
  ],
};

/** The Masque A */
export const theMasqueA: CardDef = {
  title: "The Masque A",
  abilities: [
    {
      action: true,
      cost: [toC(":click", 1), toC(":trash-can")],
      label: "Make a run and gain [click]. If successful, draw 1 card",
      prompt: "Choose a server",
      choices: req(function* (state: State): Generator<any, any, any> {
        return (state as any).runnableServers || [];
      }),
      msg: msg("make a run and gain [click]"),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        gainClicks(state, "runner", 1);
        registerEvents(state, side, card, [
          {
            event: "successful-run",
            automatic: ":draw-cards",
            "unregister-once-resolved": true,
            duration: ":end-of-run",
            async: true,
            msg: "draw 1 card",
            effect: effect(function* (
              state: State,
              side: Side,
              eid: EID,
            ): Generator<any, any, any> {
              drawCards(state, "runner", eid, 1);
            }),
          },
        ]);
        makeRun(state, side, eid, targets[0], card);
      }),
    },
  ],
};

/** The Masque B */
export const theMasqueB: CardDef = {
  title: "The Masque B",
  implementation: "Successful run condition not implemented",
  abilities: [
    {
      action: true,
      cost: [toC(":click", 1), toC(":trash-can")],
      label: "Make a run and gain [click]",
      prompt: "Choose a server",
      choices: req(function* (state: State): Generator<any, any, any> {
        return (state as any).runnableServers || [];
      }),
      msg: msg("make a run and gain [click]"),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        gainClicks(state, side, 1);
        makeRun(state, side, eid, targets[0], card);
      }),
    },
  ],
};

/** The Nihilist */
export const theNihilist: CardDef = {
  title: "The Nihilist",
  events: [
    {
      event: "runner-turn-begins",
      skippable: true,
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      optional: {
        prompt: "Spend 2 virus counters?",
        "yes-ability": {
          req: req(function* (state: State): Generator<any, any, any> {
            return numberOfRunnerVirusCounters(state) >= 2;
          }),
          async: true,
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
          ): Generator<any, any, any> {
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                (coreEngine as any).resolveAbility?.(
                  state,
                  side,
                  eid,
                  pickVirusCountersToSpend(2),
                  card,
                  null,
                ),
              ],
              [],
            );
            effectCompleted(state, side, eid);
          }),
        },
      },
    },
    {
      event: "runner-install",
      once: ":per-turn",
      msg: "place 2 virus counters on itself",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return hasSubtype(targets?.[0]?.context?.card, "Virus");
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, side, eid, card, "virus", 2);
      }),
    },
  ],
};

/** The Shadow Net */
export const theShadowNet: CardDef = {
  title: "The Shadow Net",
  abilities: [
    {
      action: true,
      async: true,
      cost: [toC(":click", 1), toC(":forfeit")],
      req: req(function* (state: State): Generator<any, any, any> {
        const events = ((state as any).runner?.discard || []).filter(
          (c: any) => isEvent(c) && !hasSubtype(c, "Priority"),
        );
        return events.length > 0 && !zoneLocked(state, "runner", ":discard");
      }),
      label: "Play an event from the heap, ignoring all costs",
      prompt: "Choose an event to play",
      msg: msg("play event from the heap, ignoring all costs"),
      choices: req(function* (state: State): Generator<any, any, any> {
        return cancellable(
          ((state as any).runner?.discard || []).filter(
            (c: any) => isEvent(c) && !hasSubtype(c, "Priority"),
          ),
          ":sorted",
        );
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        playInstant(state, side, eid, targets[0], { "ignore-cost": true });
      }),
    },
  ],
};

/** The Source */
export const theSource: CardDef = {
  title: "The Source",
  "static-abilities": [
    { type: ":advancement-requirement", value: 1 },
    {
      type: ":steal-additional-cost",
      value: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return toC(":credit", 3);
      }),
    },
  ],
  events: [
    {
      event: "agenda-scored",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        trash(state, side, eid, card, {
          cause: ":runner-ability",
          "cause-card": card,
        });
      }),
    },
    {
      event: "agenda-stolen",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        trash(state, side, eid, card, {
          cause: ":runner-ability",
          "cause-card": card,
        });
      }),
    },
  ],
};

/** The Supplier */
export const theSupplier: CardDef = {
  title: "The Supplier",
  flags: { "drip-economy": true },
  abilities: [
    {
      action: true,
      label: "Host a resource or piece of hardware",
      cost: [toC(":click", 1)],
      "keep-menu-open": ":while-clicks-left",
      prompt: "Choose a card in the grip",
      choices: {
        card: (c: any) => (isHardware(c) || isResource(c)) && inHand(c),
      },
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        host(state, side, card, targets[0]);
      }),
      msg: msg("install and host card"),
    },
  ],
};

/** The Turning Wheel */
export const theTurningWheel: CardDef = {
  title: "The Turning Wheel",
  events: [
    {
      event: "run-ends",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = targets?.[0]?.context || {};
        return !ctx["did-steal"] && ["hq", "rd"].includes(targetServer(ctx));
      }),
      async: true,
      silent: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, side, eid, card, "power", 1);
      }),
    },
  ],
  abilities: [
    {
      label: "Access an additional card in R&D",
      cost: [toC(":power", 2)],
      req: req(function* (state: State): Generator<any, any, any> {
        return !!(state as any).run;
      }),
      msg: "access 1 additional card from R&D for the remainder of the run",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        registerEvents(state, side, card, [
          breachAccessBonus(":rd", 1, { duration: ":end-of-run" }),
        ]);
      }),
    },
    {
      label: "Access an additional card in HQ",
      cost: [toC(":power", 2)],
      req: req(function* (state: State): Generator<any, any, any> {
        return !!(state as any).run;
      }),
      msg: "access 1 additional card from HQ for the remainder of the run",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        registerEvents(state, side, card, [
          breachAccessBonus(":hq", 1, { duration: ":end-of-run" }),
        ]);
      }),
    },
  ],
};

/** The Twinning */
export const theTwinning: CardDef = {
  title: "The Twinning",
  events: [
    {
      event: "spent-credits-from-card",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return targets?.some?.(
          (t: any) => isRunner(t?.card) && isInstalled(t?.card),
        );
      }),
      async: true,
      msg: "place a power counter on itself",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, "runner", eid, card, "power", 1, { placed: true });
      }),
    },
    {
      event: "breach-server",
      automatic: ":pre-breach",
      async: true,
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return ["rd", "hq"].includes(targets?.[0]?.context?.server);
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const server = targets?.[0]?.context?.server;
        const maxN = Math.min(2, getCounters(card, "power"));
        continue_ability(
          state,
          side,
          {
            prompt: `How many additional ${zoneToName(server)} accesses do you want to make?`,
            choices: {
              number: req(function* (
                state: State,
                side?: Side,
                eid?: EID,
                card?: Card,
                targets?: any[],
              ): Generator<any, any, any> {
                return maxN;
              }),
              default: req(function* (
                state: State,
                side?: Side,
                eid?: EID,
                card?: Card,
                targets?: any[],
              ): Generator<any, any, any> {
                return maxN;
              }),
            },
            msg: msg("access additional cards"),
            async: true,
            effect: effect(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets2: any[],
            ): Generator<any, any, any> {
              accessBonus(side, server, Math.max(0, targets2[0]));
              addCounter(state, "runner", eid, card, "power", -targets2[0], {
                placed: true,
              });
            }),
          },
          card,
          null,
        );
      }),
    },
  ],
};

/** Theophilius Bagbiter */
export const theophiliusBagbiter: CardDef = {
  title: "Theophilius Bagbiter",
  "static-abilities": [
    runnerHandSizePlus(
      req(function* (state: State): Generator<any, any, any> {
        return (state as any).runner?.credit || 0;
      }),
    ),
  ],
  "on-install": {
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
    ): Generator<any, any, any> {
      (state as any).runner = (state as any).runner || {};
      (state as any).runner["hand-size"] =
        (state as any).runner["hand-size"] || {};
      (state as any).runner["hand-size"].base = 0;
      loseCredits(state, "runner", eid, "all");
    }),
  },
  "leave-play": effect(function* (state: State): Generator<any, any, any> {
    (state as any).runner["hand-size"].base = 5;
  }),
};

/** Thunder Art Gallery */
export const thunderArtGallery: CardDef = {
  title: "Thunder Art Gallery",
  events: [
    {
      event: "runner-lose-tag",
      async: true,
      prompt: "Choose a card in the grip",
      choices: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return (
            isRunner(targets[0]) && inHand(targets[0]) && !isEvent(targets[0])
          );
        }),
      },
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        runnerInstall(state, side, eid, targets[0], {
          "cost-bonus": -1,
          "msg-keys": { "install-source": card, "display-origin": true },
        });
      }),
    },
  ],
};

/** Tri-maf Contact */
export const triMafContact: CardDef = {
  title: "Tri-maf Contact",
  abilities: [
    {
      action: true,
      cost: [toC(":click", 1)],
      msg: "gain 2 [Credits]",
      once: ":per-turn",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        playSfx(state, side, "click-credit-2");
        gainCredits(state, side, eid, 2);
      }),
    },
  ],
  "on-trash": {
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      damage(state, side, eid, ":meat", 3, { unboostable: true, card });
    }),
  },
};

/** Trickster Taka */
export const tricksterTaka: CardDef = companionBuilder(
  req(function* (
    state: State,
    side: Side,
    eid: EID,
    card: Card,
    targets: any[],
  ): Generator<any, any, any> {
    return (
      (eid as any)?.sourceType === ":ability" &&
      isProgram(targets?.[0]) &&
      !!(state as any).run
    );
  }),
  {
    prompt: "Choose one",
    choices: ["Take 1 tag", "Trash Trickster Taka"],
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      if (targets[0] === "Trash Trickster Taka")
        trash(state, "runner", eid, card, { "cause-card": card });
      else gainTags(state, "runner", eid, 1);
    }),
  },
  {
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      const run = (state as any).run;
      return (
        getCounters(getCard(state, card) || card, "credit") > 0 &&
        !!run &&
        !run.successful &&
        !run.unsuccessful
      );
    }),
    msg: "take 1 [Credits]",
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      spendCredits(state, side, eid, card, "credit", 1);
    }),
  },
);

/** Tsakhia "Bankhar" Gantulga */
export const tsakhiaBankharGantulga: CardDef = {
  title: 'Tsakhia "Bankhar" Gantulga',
  events: [
    {
      event: "runner-turn-begins",
      skippable: true,
      prompt: "Choose a server",
      choices: req(function* (state: State): Generator<any, any, any> {
        return ((state as any).servers || []).concat(["No server"]);
      }),
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      msg: msg("target server"),
      req: req(function* (state: State): Generator<any, any, any> {
        return !!(state as any)["runner-phase-12"];
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        if (targets[0] !== "No server")
          updateCard(
            state,
            side,
            Object.assign({}, card, { "card-target": targets[0] }) as any,
          );
      }),
    },
  ],
};

/** Tyson Observatory */
export const tysonObservatory: CardDef = {
  title: "Tyson Observatory",
  abilities: [
    {
      action: true,
      prompt: "Choose a piece of Hardware",
      msg: msg("add hardware to Grip"),
      label: "Search stack for a piece of hardware",
      choices: req(function* (state: State): Generator<any, any, any> {
        return cancellable(
          ((state as any).runner?.deck || []).filter(isHardware),
          ":sorted",
        );
      }),
      cost: [toC(":click", 2)],
      "keep-menu-open": ":while-2-clicks-left",
      effect: effect(function* (
        state: State,
        side: Side,
        _e: EID,
        _c: Card,
        targets: any[],
      ): Generator<any, any, any> {
        triggerEvent(state, side, ":searched-stack");
        shuffleDeck(state, side, "deck");
        moveCard(state, side, targets[0], ":hand");
      }),
    },
  ],
};

/** Underdome Irregulars */
export const underdomeIrregulars: CardDef = {
  title: "Underdome Irregulars",
  events: [
    {
      event: "runner-action-phase-ends",
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        if (noEvent(state, "corp", "rez", (e: any) => isIce(e?.[0]?.card))) {
          systemMsg(state, side, "trashes itself");
          trash(state, side, eid, card);
        } else {
          continue_ability(
            state,
            side,
            chooseOneHelper(
              {
                event: "runner-action-phase-ends",
                interactive: req(function* (
                  state: State,
                  side?: Side,
                  eid?: EID,
                  card?: Card,
                  targets?: any[],
                ): Generator<any, any, any> {
                  return true;
                }),
              },
              [
                {
                  option: "Draw 2 cards",
                  ability: {
                    msg: "draw 2 cards",
                    async: true,
                    effect: effect(function* (
                      state: State,
                      side: Side,
                      eid: EID,
                    ): Generator<any, any, any> {
                      drawCards(state, side, eid, 2);
                    }),
                  },
                },
                {
                  option: "Remove 1 tag",
                  ability: {
                    msg: "remove 1 tag",
                    async: true,
                    effect: effect(function* (
                      state: State,
                      side: Side,
                      eid: EID,
                    ): Generator<any, any, any> {
                      loseTags(state, side, eid, 1);
                    }),
                  },
                },
              ],
            ),
            card,
            null,
          );
        }
      }),
    },
  ],
};

/** Underworld Contact */
export const underworldContact: CardDef = {
  title: "Underworld Contact",
  flags: { "drip-economy": true },
  events: [
    {
      event: "runner-turn-begins",
      once: ":per-turn",
      automatic: ":gain-credits",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        if (getLink(state) >= 2 && !!(state as any)["runner-phase-12"]) {
          systemMsg(state, "runner", `uses ${card.title} to gain 1 [Credits]`);
          gainCredits(state, "runner", eid, 1);
        } else effectCompleted(state, side, eid);
      }),
    },
  ],
};

/** Urban Art Vernissage */
export const urbanArtVernissage: CardDef = {
  title: "Urban Art Vernissage",
  flags: {
    "runner-phase-12": req(function* (state: State): Generator<any, any, any> {
      return allInstalledRunner(state).some(
        (c: any) =>
          isProgram(c) && hasSubtype(c, "Trojan") && !hasSubtype(c, "Virus"),
      );
    }),
  },
  events: [
    {
      event: "runner-turn-begins",
      skippable: true,
      async: true,
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      label: "Return a non-virus trojan program to the grip",
      once: ":per-turn",
      choices: {
        req: req(function* (
          _s: State,
          _sd: Side,
          _e: EID,
          _c: Card,
          ts: any[],
        ): Generator<any, any, any> {
          return (
            isRunner(ts[0]) &&
            isInstalled(ts[0]) &&
            isProgram(ts[0]) &&
            hasSubtype(ts[0], "Trojan") &&
            !hasSubtype(ts[0], "Virus")
          );
        }),
      },
      msg: msg("return program to grip and place 2 [Credits] on itself"),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        moveCard(state, side, targets[0], ":hand");
        addCounter(state, side, eid, card, "credit", 2);
      }),
    },
  ],
  interactions: {
    "pay-credits": {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        return (eid as any)?.sourceType === ":runner-install";
      }),
      type: ":credit",
    },
  },
};

/** Utopia Shard */
export const utopiaShard: CardDef = shardConstructor(
  "Utopia Shard",
  ":hq",
  "force the Corp to discard 2 cards from HQ at random",
  (state: State, side: Side, eid: EID, card: Card) => {
    const shuffled = [...((state as any).corp?.hand || [])].sort(
      () => Math.random() - 0.5,
    );
    trashCards(state, "corp", eid, shuffled.slice(0, 2), {
      "cause-card": card,
    });
  },
);

/** Valentina Ferreira Carvalho */
export const valentinaFerreiraCarvalho: CardDef = {
  title: "Valentina Ferreira Carvalho",
  "on-install": {
    prompt: "Choose one",
    async: true,
    choices: req(function* (state: State): Generator<any, any, any> {
      const opts: string[] = [];
      if (isTagged(state)) opts.push("Remove 1 tag");
      opts.push("Gain 2 [Credits]", "Done");
      return opts;
    }),
    req: req(function* (state: State): Generator<any, any, any> {
      return (
        threatLevel(3, state) && (state as any)["active-player"] === "runner"
      );
    }),
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      if (targets[0] === "Remove 1 tag") {
        loseTags(state, "runner", eid, 1);
        systemMsg(state, "runner", `uses ${card.title} to remove 1 tag`);
      } else if (targets[0] === "Gain 2 [Credits]") {
        gainCredits(state, "runner", eid, 2);
        systemMsg(state, "runner", `uses ${card.title} to gain 2 [Credits]`);
      } else effectCompleted(state, side, eid);
    }),
  },
  events: [
    {
      event: "runner-lose-tag",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = targets?.[0]?.context || {};
        return ctx.side === "runner" && ctx.amount > 0;
      }),
      msg: "gain 1 [Credits]",
      async: true,
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        gainCredits(state, "runner", eid, 1);
      }),
    },
  ],
};

/** Verbal Plasticity */
export const verbalPlasticity: CardDef = {
  title: "Verbal Plasticity",
  events: [
    {
      event: "runner-click-draw",
      req: req(function* (state: State, side: Side): Generator<any, any, any> {
        return geneticsTrigger(state, side, "runner-click-draw");
      }),
      msg: "draw 1 additional card",
      effect: effect(function* (state: State): Generator<any, any, any> {
        (coreDrawing as any).clickDrawBonus?.(state, 1);
      }),
    },
  ],
};

/** Virus Breeding Ground */
export const virusBreedingGround: CardDef = {
  title: "Virus Breeding Ground",
  events: [
    {
      event: "runner-turn-begins",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, side, eid, card, "virus", 1);
      }),
    },
  ],
  abilities: [
    {
      action: true,
      cost: [toC(":click", 1)],
      label: "move hosted virus counter",
      "change-in-game-state": {
        req: req(function* (
          _s: State,
          _sd: Side,
          _e: EID,
          card: Card,
        ): Generator<any, any, any> {
          return getCounters(card, "virus") > 0;
        }),
      },
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        continue_ability(
          state,
          side,
          {
            msg: msg("move 1 virus counter"),
            choices: {
              "not-self": true,
              card: (c: any) => getVirusCounters(state, c) > 0,
            },
            async: true,
            effect: effect(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              yield wait_for(
                state,
                [
                  { asyncResult: "result" },
                  addCounter(state, side, eid, card, "virus", -1, {
                    "suppress-checkpoint": true,
                  }),
                ],
                [],
              );
              addCounter(state, side, eid, targets[0], "virus", 1);
            }),
          },
          card,
          null,
        );
      }),
    },
  ],
};

/** Wasteland */
export const wasteland: CardDef = {
  title: "Wasteland",
  events: [
    {
      event: "runner-trash",
      "once-per-instance": true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const validCtx = (ts: any[]) =>
          ts?.some?.((t: any) => isInstalled(t?.card) && isRunner(t?.card));
        return (
          validCtx(targets) && firstEvent(state, side, "runner-trash", validCtx)
        );
      }),
      msg: "gain 1 [Credits]",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        gainCredits(state, side, eid, 1);
      }),
    },
  ],
};

/** Whistleblower */
export const whistleblower: CardDef = {
  title: "Whistleblower",
  events: [
    {
      event: "successful-run",
      skippable: true,
      optional: {
        autoresolve: getAutoresolve(":auto-fire"),
        prompt: "Name an agenda?",
        "yes-ability": {
          async: true,
          prompt: "Name an agenda",
          choices: {
            "card-title": req(function* (
              _s: State,
              _sd: Side,
              _e: EID,
              _c: Card,
              ts: any[],
            ): Generator<any, any, any> {
              return isCorp(ts[0]) && isAgenda(ts[0]);
            }),
          },
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            const named = targets[0];
            systemMsg(
              state,
              side,
              `trashes ${card.title} to name ${named?.title || named}`,
            );
            registerEvents(state, side, card, [
              {
                event: "access",
                duration: ":end-of-run",
                "unregister-once-resolved": true,
                async: true,
                req: req(function* (
                  _s: State,
                  _sd: Side,
                  _e: EID,
                  _c: Card,
                  ts: any[],
                ): Generator<any, any, any> {
                  return (
                    ts?.[0]?.context?.["accessed-card"]?.title ===
                    (named?.title || named)
                  );
                }),
                effect: effect(function* (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  ts: any[],
                ): Generator<any, any, any> {
                  steal(state, side, eid, ts?.[0]?.context?.["accessed-card"]);
                }),
              },
            ]);
            trash(state, side, eid, card, {
              unpreventable: true,
              "cause-card": card,
            });
          }),
        },
      },
    },
  ],
  abilities: [setAutoresolve(":auto-fire", "Whistleblower")],
};

/** Wireless Net Pavilion */
export const wirelessNetPavilion: CardDef = {
  title: "Wireless Net Pavilion",
  implementation: "[Erratum] Should be unique",
  "static-abilities": [
    {
      type: ":card-ability-additional-cost",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = targets?.[0]?.context || {};
        return (
          sameCard(ctx.card, (state as any).corp?.["basic-action-card"]) &&
          ctx.ability?.label === "Trash 1 resource if the Runner is tagged"
        );
      }),
      value: toC(":credit", 2),
    },
  ],
};

/** Woman in the Red Dress */
export const womanInTheRedDress: CardDef = {
  title: "Woman in the Red Dress",
  events: [
    {
      event: "runner-turn-begins",
      label: "Reveal the top card of R&D (start of turn)",
      once: ":per-turn",
      req: req(function* (state: State): Generator<any, any, any> {
        return !!(state as any)["runner-phase-12"];
      }),
      async: true,
      msg: msg("reveal top card of R&D"),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const top = (state as any).corp?.deck?.[0];
        if (!top) {
          effectCompleted(state, side, eid);
          return;
        }
        yield wait_for(
          state,
          [{ asyncResult: "result" }, reveal(state, side, eid, top)],
          [],
        );
        continue_ability(
          state,
          side,
          {
            optional: {
              player: "corp",
              prompt: `Draw ${top.title}?`,
              "yes-ability": {
                async: true,
                effect: effect(function* (
                  state: State,
                  side: Side,
                  eid: EID,
                ): Generator<any, any, any> {
                  systemMsg(state, "corp", `draws ${top.title}`);
                  drawCards(state, "corp", eid, 1);
                }),
              },
            },
          },
          card,
          null,
        );
      }),
    },
  ],
};

/** Word on the Street */
export const wordOnTheStreet: CardDef = {
  title: "Word on the Street",
  events: [
    {
      event: "pre-agenda-scored",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          targets?.[0]?.context?.["scored-card"]?.installed === ":this-turn"
        );
      }),
      msg: "add itself to the score area as an agenda worth -1 agenda points",
      "display-side": ":corp",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        asAgenda(state, "corp", card, -1);
      }),
    },
    {
      event: "agenda-scored",
      msg: "trash itself, gain 4 [Credits] and draw a card",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            trash(state, side, eid, card, { "suppress-checkpoint": true }),
          ],
          [],
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            gainCredits(state, side, eid, 4, { "suppress-checkpoint": true }),
          ],
          [],
        );
        drawCards(state, side, eid, 1);
      }),
      async: true,
    },
  ],
};

/** Wyldside */
export const wyldside: CardDef = {
  title: "Wyldside",
  flags: { "runner-turn-draw": true },
  events: [
    {
      event: "runner-turn-begins",
      automatic: ":lose-clicks",
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      msg: "draw 2 cards and lose [Click]",
      once: ":per-turn",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        loseClicks(state, side, 1);
        drawCards(state, side, eid, 2);
      }),
    },
  ],
};

/** Xanadu */
export const xanadu: CardDef = {
  title: "Xanadu",
  "static-abilities": [
    {
      type: ":rez-cost",
      req: req(function* (
        _s: State,
        _sd: Side,
        _e: EID,
        _c: Card,
        ts: any[],
      ): Generator<any, any, any> {
        return isIce(ts[0]);
      }),
      value: 1,
    },
  ],
};

/** Zona Sul Shipping */
export const zonaSulShipping: CardDef = trashWhenTagged("Zona Sul Shipping", {
  title: "Zona Sul Shipping",
  events: [
    {
      event: "runner-turn-begins",
      automatic: ":gain-credits",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        addCounter(state, side, eid, card, "credit", 1);
      }),
    },
  ],
  abilities: [
    takeAllCreditsAbility({ action: true, cost: [toC(":click", 1)] }),
  ],
});
