/**
 * Hardware Cards
 * Ported from Clojure cards/hardware.clj to TypeScript
 *
 * Contains all Runner hardware card definitions with their abilities and events.
 */

import type { State, Side, Card, EID } from '../../types';
import * as coreAccess from '../core/access';
import * as coreActions from '../core/actions';
import * as coreBoard from '../core/board';
import * as coreCard from '../core/card';
import * as coreCostFns from '../core/cost-fns';
import * as coreDamage from '../core/damage';
import * as coreDefHelpers from '../core/def-helpers';
import * as coreDrawing from '../core/drawing';
import * as coreEffects from '../core/effects';
import * as coreEid from '../core/eid';
import * as coreEngine from '../core/engine';
import * as coreEvents from '../core/events';
import * as coreExpose from '../core/expose';
import * as coreFinding from '../core/finding';
import * as coreFlags from '../core/flags';
import * as coreGaining from '../core/gaining';
import * as coreHandSize from '../core/hand-size';
import * as coreHosting from '../core/hosting';
import * as coreIce from '../core/ice';
import * as coreInstalling from '../core/installing';
import * as coreLink from '../core/link';
import * as coreMemory from '../core/memory';
import * as coreMoving from '../core/moving';
import * as coreOptional from '../core/optional';
import * as corePayment from '../core/payment';
import * as corePlayInstants from '../core/play-instants';
import * as corePrevention from '../core/prevention';
import * as corePrompts from '../core/prompts';
import * as coreProps from '../core/props';
import * as coreRevealing from '../core/revealing';
import * as coreRezzing from '../core/rezzing';
import * as coreRuns from '../core/runs';
import * as coreSay from '../core/say';
import * as coreServers from '../core/servers';
import * as coreSetAside from '../core/set-aside';
import * as coreShuffling from '../core/shuffling';
import * as coreTags from '../core/tags';
import * as coreToString from '../core/to-string';
import * as coreToasts from '../core/toasts';
import * as coreUpdate from '../core/update';
import * as coreVirus from '../core/virus';
import * as coreWinning from '../core/winning';
import * as coreSetAsideModule from '../core/set-aside';
import * as coreSabotage from '../core/sabotage';
import * as coreMark from '../core/mark';
import * as utils from '../utils';
import * as jintekiUtils from '../jinteki/utils';
import { req, effect, msg, wait_for, continue_ability, forms } from '../macros';
import type { CardDef } from '../../types';

// Helper for toC
export function toC(type: string, ...values: number[]): any {
  return corePayment.toC(type, ...values);
}

// Helper for count-real-tags
function countRealTags(state: State): number {
  return jintekiUtils.countRealTags?.(state) ?? 0;
}

// Helper for count-tags
function countTags(state: State): number {
  return jintekiUtils.countTags?.(state) ?? 0;
}

// Helper for enumerate-cards
export function enumerateCards(cards: any[], sort?: string): string {
  return utils.enumerateCards(cards, sort);
}

// Helper for quantify
export function quantify(n: number, noun: string): string {
  return utils.quantify(n, noun);
}

// Helper for decapitalize
export function decapitalize(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// Helper for str->int
export function strToInt(s: string): number {
  return parseInt(s, 10);
}

// Helper for shuffle!
export function shuffleDeck(state: State, side: Side, zone: string): void {
  coreShuffling.shuffle(state, side, zone);
}

// Helper for play-sfx
export function playSfx(state: State, side: Side, sfx: string): void {
  coreSay.playSfx(state, side, sfx);
}

// Helper for system-msg
export function systemMsg(state: State, side: Side, text: string): void {
  coreSay.systemMsg(state, side, text);
}

// Helper for card-str
export function cardStr(state: State, card: Card): string {
  return coreToString.cardStr(state, card);
}

// Helper for make-icon
export function makeIcon(type: string, card: Card): any {
  return coreDefHelpers.makeIcon(type, card);
}

// Helper for trash-on-empty
function trashOnEmpty(counterType: string): any {
  return coreDefHelpers.trashOnEmpty(counterType);
}

// Helper for draw-abi
export function drawAbility(count: number, card: Card | null, opts: any = {}): any {
  return coreDefHelpers.drawAbility(count, card, opts);
}

// Helper for successful-run-replace-breach
export function successfulRunReplaceBreach(opts: any): any {
  return coreDefHelpers.successfulRunReplaceBreach(opts);
}

// Helper for breach-access-bonus
export function breachAccessBonus(server: string, count: number, opts: any = {}): any {
  return coreDefHelpers.breachAccessBonus(server, count, opts);
}

// Helper for auto-icebreaker
function autoIcebreaker(cardDef: any): any {
  return coreDefHelpers.autoIcebreaker(cardDef);
}

// Helper for run-any-server-ability
function runAnyServerAbility(opts: any): any {
  return coreDefHelpers.runAnyServerAbility(opts);
}

// Helper for look-at-the-top
export function lookAtTheTop(fromSide: string, toSide: string, count: number): any {
  return coreDefHelpers.lookAtTheTop(fromSide, toSide, count);
}

// Helper for offer-jack-out
export function offerJackOut(): any {
  return coreDefHelpers.offerJackOut();
}

// Helper for reorder-choice
export function reorderChoice(fromSide: string, toSide: string, from: Card[], fromIdx: number, toIdx: number, cards: Card[]): any {
  return coreDefHelpers.reorderChoice(fromSide, toSide, from, fromIdx, toIdx, cards);
}

// Helper for play-tiered-sfx
export function playTieredSfx(state: State, side: Side, sfx: string, credits: number, maxLevel: number): void {
  coreDefHelpers.playTieredSfx(state, side, sfx, credits, maxLevel);
}

// Helper for cancellable
export function cancelable(choices: any[], opts: any = {}): any {
  return corePrompts.cancellable(choices, opts);
}

// Helper for sabotage-ability
export function sabotageAbility(count: number): any {
  return coreSabotage.sabotageAbility(count);
}

// Helper for identify-mark-ability
export function identifyMarkAbility(): any {
  return coreMark.identifyMarkAbility();
}

// Helper for mark-changed-event
export function markChangedEvent(): any {
  return coreMark.markChangedEvent();
}

// Helper for set-aside
export function setAsideFn(state: State, side: Side, eid: EID, cards: Card[]): void {
  coreSetAsideModule.setAside(state, side, eid, cards);
}

// Helper for get-set-aside
export function getSetAsideFn(state: State, side: Side, eid: EID): Card[] {
  return coreSetAsideModule.getSetAside(state, side, eid);
}

// Helper for any-subs-broken
export function anySubsBrokenFn(currentIce: Card | null): boolean {
  return coreIce.anySubsBroken?.(currentIce) ?? false;
}

// Helper for all-subs-broken
function allSubsBrokenFn(currentIce: Card | null): boolean {
  return coreIce.allSubsBroken?.(currentIce) ?? false;
}

// Helper for break-sub
export function breakSubFn(cost: any, strength: number, type: string, opts: any = {}): any {
  return coreIce.breakSub(cost, strength, type, opts);
}

// Helper for pump
export function pumpFn(card: Card, amount: number, duration?: string): void {
  coreIce.pump(card, amount, duration);
}

// Helper for update-all-ice
export function updateAllIceFn(state: State): void {
  coreIce.updateAllIce(state);
}

// Helper for update-all-icebreakers
export function updateAllIcebreakersFn(state: State, side: Side): void {
  coreIce.updateAllIcebreakers(state, side);
}

// Helper for update-breaker-strength
export function updateBreakerStrengthFn(state: State, side: Side, card: Card): void {
  coreIce.updateBreakerStrength(state, side, card);
}

// Helper for derez
export function derezFn(state: State, side: Side, eid: EID, card: Card, opts: any = {}): void {
  coreRezzing.derez(state, side, eid, card, opts);
}

// Helper for rez
export function rezFn(state: State, side: Side, eid: EID, card: Card): void {
  coreRezzing.rez(state, side, eid, card);
}

// Helper for can-pay-to-rez?
export function canPayToRezFn(state: State, side: Side, eid: EID, card: Card): boolean {
  return coreRezzing.canPayToRez?.(state, side, eid, card) ?? false;
}

// Helper for rez-cost
export function rezCostFn(state: State, side: Side, card: Card): number {
  return coreCostFns.rezCost?.(state, side, card) ?? 0;
}

// Helper for rez-additional-cost-bonus
export function rezAdditionalCostBonusFn(state: State, side: Side, card: Card): any[] {
  return coreCostFns.rezAdditionalCostBonus?.(state, side, card) || [];
}

// Helper for build-cost-string
export function buildCostString(costs: any[]): string {
  return corePayment.buildCostString(costs);
}

// Helper for trash-cost
export function trashCostFn(state: State, side: Side, card: Card): number | null {
  return coreCostFns.trashCost?.(state, side, card) ?? null;
}

// Helper for get-x-fn
export function getxFn(state: State, side: Side, eid: EID, card: Card, targets: any[]): number {
  return coreMemory.getxFn(state, side, eid, card, targets);
}

// Helper for expected-mu
export function expectedMuFn(state: State, card: Card): number {
  return coreMemory.expectedMu(state, card);
}

// Helper for count-virus-programs
export function countVirusProgramsFn(state: State): number {
  return coreVirus.countVirusPrograms(state);
}

// Helper for link+
export function linkPlusFn(count: number): any {
  return coreLink.linkPlus(count);
}

// Helper for get-link
export function getLinkFn(state: State): number {
  return coreLink.getLink(state);
}

// Helper for hand-size
export function handSizeFn(state: State, side: Side): number {
  return coreHandSize.handSize?.(state, side) ?? 0;
}

// Helper for mu+
export function muPlusFn(value: number | any): any {
  return coreMemory.muPlus(value);
}

// Helper for caissa-mu+
export function caissaMuPlusFn(value: number): any {
  return coreMemory.caissaMuPlus(value);
}

// Helper for virus-mu+
export function virusMuPlusFn(value: number): any {
  return coreMemory.virusMuPlus(value);
}

// Helper for runner-hand-size+
export function runnerHandSizePlusFn(value: number | any): any {
  return coreHandSize.runnerHandSizePlus(value);
}

// Helper for runner-hand-size+
function runnerHandSizePlus(value: number | any): any {
  return coreHandSize.runnerHandSizePlus(value);
}

// Helper for in-hand*?
export function inHandStarFn(state: State, card: Card): boolean {
  return coreCard.inHandStar?.(state, card) ?? coreCard.inHand(card);
}

// Helper for all-cards-in-hand*
export function allCardsInHandStarFn(state: State, side: Side): Card[] {
  return coreCard.allCardsInHandStar?.(state, side) || ((state as any)[side]?.hand || []);
}

// Helper for same-card?
export function sameCard(a: any, b: any): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (typeof a === 'object' && typeof b === 'object') {
    return a.uuid === b.uuid;
  }
  return a === b;
}

// Helper for remove-once
export function removeOnce(arr: any[], item: any): any[] {
  const idx = arr.indexOf(item);
  if (idx >= 0) {
    return [...arr.slice(0, idx), ...arr.slice(idx + 1)];
  }
  return arr;
}

// Helper for effect-completed
export function effectCompletedFn(state: State, side: Side, eid: EID): any {
  return coreEid.effectCompleted(state, side, eid);
}

// Helper for complete-with-result
function completeWithResultFn(state: State, side: Side, eid: EID, result: any): any {
  return coreEid.completeWithResult(state, side, eid, result);
}

// Helper for make-result
export function makeResultFn(eid: EID, val: any): any {
  return coreEid.makeResult(eid, val);
}

// Helper for resolve-ability
export function resolveAbilityFn(state: State, side: Side, ability: any, card: Card, targets: any[]): void {
  coreEngine.resolveAbility(state, side, ability, card, targets);
}

// Helper for not-used-once?
export function notUsedOnceFn(state: State, opts: any, card: Card): boolean {
  return coreEngine.notUsedOnce?.(state, opts, card) ?? true;
}

// Helper for can-trigger?
export function canTriggerFn(state: State, side: Side, eid: EID, ability: any, card: Card, targets: any[]): boolean {
  return coreEngine.canTrigger?.(state, side, eid, ability, card, targets) ?? true;
}

// Helper for register-once
export function registerOnceFn(state: State, side: Side, ability: any, card: Card): void {
  coreEngine.registerOnce?.(state, side, ability, card);
}

// Helper for register-events
export function registerEventsFn(state: State, side: Side, card: Card, events: any[]): void {
  coreEngine.registerEvents(state, side, card, events);
}

// Helper for unregister-floating-events
export function unregisterFloatingEventsFn(duration: string): void {
  coreEngine.unregisterFloatingEvents(duration);
}

// Helper for unregister-suppress-by-uuid
function unregisterSuppressByUuidFn(state: State, side: Side, uuid: string): void {
  coreEngine.unregisterSuppressByUuid?.(state, side, uuid);
}

// Helper for trigger-event
export function triggerEventFn(state: State, side: Side, event: string): void {
  coreEngine.triggerEvent(state, side, event);
}

// Helper for unregister-effects-for-card
function unregisterEffectsForCardFn(state: State, side: Side, card: Card): void {
  coreEffects.unregisterEffectsForCard?.(state, side, card);
}

// Helper for unregister-lingering-effects
export function unregisterLingeringEffectsFn(duration: string): void {
  coreEffects.unregisterLingeringEffects(duration);
}

// Helper for any-effects
export function anyEffectsFn(state: State, side: Side, effectType: string, value: any, card: Card, opts: any): any[] {
  return coreEffects.anyEffects?.(state, side, effectType, value, card, opts) || [];
}

// Helper for register-lingering-effect
export function registerLingeringEffectFn(card: Card, effectDef: any): string {
  return coreEffects.registerLingeringEffect?.(card, effectDef) || '';
}

// Helper for unregister-effect-by-uuid
export function unregisterEffectByUuidFn(state: State, side: Side, uuid: string): void {
  coreEffects.unregisterEffectByUuid?.(state, side, uuid);
}

// Helper for get-autoresolve
export function getAutoresolveFn(key: string, fallback: any = null): any {
  return coreOptional.getAutoresolve(key, fallback);
}

// Helper for never?
export function neverFn(): boolean {
  return coreOptional.never?.() ?? false;
}

// Helper for set-autoresolve
function setAutoresolveFn(key: string, value: string): any {
  return coreOptional.setAutoresolve?.(key, value);
}

// Helper for run-any-server-ability
export function runAnyServerAbilityFn(opts: any): any {
  return coreDefHelpers.runAnyServerAbility(opts);
}

// Helper for host
export function hostFn(state: State, side: Side, host: Card, hostee: Card, opts: any = {}): void {
  coreHosting.host(state, side, host, hostee, opts);
}

// Helper for runner-can-pay-and-install?
export function runnerCanPayAndInstallFn(state: State, side: Side, eid: EID, card: Card, opts: any = {}): boolean {
  return coreInstalling.runnerCanPayAndInstall(state, side, eid, card, opts);
}

// Helper for runner-install
export function runnerInstallFn(state: State, side: Side, eid: EID, card: Card, opts: any = {}): void {
  coreInstalling.runnerInstall(state, side, eid, card, opts);
}

// Helper for access-bonus
export function accessBonusFn(state: State, side: Side, server: string, count: number): void {
  coreAccess.accessBonus(state, side, server, count);
}

// Helper for access-card
export function accessCardFn(state: State, side: Side, eid: EID, card: Card): void {
  coreAccess.accessCard(state, side, eid, card);
}

// Helper for turn-archives-faceup
export function turnArchivesFaceupFn(state: State, side: Side, servers: string[]): void {
  coreAccess.turnArchivesFaceup(state, side, servers);
}

// Helper for get-only-card-to-access
export function getOnlyCardToAccessFn(state: State): boolean {
  return coreAccess.getOnlyCardToAccess?.(state) ?? false;
}

// Helper for total-cards-accessed
export function totalCardsAccessedFn(run: any): number {
  return coreRuns.totalCardsAccessed(run);
}

// Helper for bypass-ice
export function bypassIceFn(state: State): void {
  coreRuns.bypassIce(state);
}

// Helper for end-run
export function endRunFn(state: State, side: Side, eid: EID, card: Card): void {
  coreRuns.endRun(state, side, eid, card);
}

// Helper for get-current-encounter
export function getCurrentEncounterFn(state: State): any {
  return coreRuns.getEncounter?.(state) || {};
}

// Helper for make-run
export function makeRunFn(state: State, side: Side, eid: EID, server: string, card: Card): void {
  coreRuns.makeRun(state, side, eid, server, card);
}

// Helper for jack-out
export function jackOutFn(eid: EID): void {
  coreRuns.jackOut(eid);
}

// Helper for prevent-tag
export function preventTagFn(state: State, side: Side, count: number | 'all'): void {
  corePrevention.preventTag(state, side, count);
}

// Helper for prevent-end-run
export function preventEndRunFn(state: State, side: Side, eid: EID): void {
  corePrevention.preventEndRun(state, side, eid);
}

// Helper for prevent-damage
export function preventDamageFn(state: State, side: Side, eid: EID, count: number): void {
  corePrevention.preventDamage(state, side, eid, count);
}

// Helper for prevent-encounter
export function preventEncounterFn(state: State, side: Side, eid: EID): void {
  corePrevention.preventEncounter(state, side, eid);
}

// Helper for preventable?
export function preventableFn(ctx: any): boolean {
  return corePrevention.preventable(ctx);
}

// Helper for damage-name
export function damageNameFn(state: State): string {
  return coreDamage.damageName(state);
}

// Helper for damage-type
export function damageTypeFn(state: State): string {
  return coreDamage.damageType(state);
}

// Helper for chosen-damage
export function chosenDamageFn(side: string, targets: any[]): void {
  coreDamage.chosenDamage(side, targets);
}

// Helper for enable-runner-damage-choice
export function enableRunnerDamageChoiceFn(): void {
  coreDamage.enableRunnerDamageChoice();
}

// Helper for runner-can-choose-damage?
export function runnerCanChooseDamageFn(state: State): boolean {
  return coreDamage.runnerCanChooseDamage?.(state) ?? false;
}

// Helper for prevent-up-to-n-damage
export function preventUpToNDamageFn(n: number, types: string[]): any {
  return corePrevention.preventUpToNDamage(n, types);
}

// Helper for prevent-encounter
function preventEncounterFn2(state: State, side: Side, eid: EID): void {
  corePrevention.preventEncounter(state, side, eid);
}

// Helper for zone-locked?
export function zoneLockedFn(state: State, side: string, zone: string): boolean {
  return coreFlags.zoneLocked?.(state, side, zone) ?? false;
}

// Helper for can-trash?
export function canTrashFn(state: State, side: Side, card: Card): boolean {
  return coreFlags.canTrash?.(state, side, card) ?? true;
}

// Helper for in-corp-scored?
export function inCorpScoredFn(state: State, side: Side, card: Card): boolean {
  return coreFlags.inCorpScored?.(state, side, card) ?? false;
}

// Helper for card-flag?
export function cardFlagFn(card: Card, flag: string, value?: any): boolean {
  return coreFlags.cardFlag?.(card, flag, value) ?? false;
}

// Helper for register-run-flag!
export function registerRunFlagFn(card: Card, flag: string, fn: any): void {
  coreFlags.registerRunFlag?.(card, flag, fn);
}

// Helper for get-counters
export function getCounters(card: Card, type: string): number {
  return coreCard.getCounters(card, type);
}

// Helper for add-counter
export function addCounterFn(state: State, side: Side, card: Card, type: string, count: number, opts: any = {}): void {
  coreProps.addCounter(state, side, card, type, count, opts);
}

// Helper for gain-clicks
export function gainClicksFn(state: State, side: Side, count: number, opts?: any): void {
  coreGaining.gainClicks(state, side, count, opts);
}

// Helper for lose-clicks
function loseClicksFn(state: State, side: Side, count: number): void {
  coreGaining.loseClicks(state, side, count);
}

// Helper for gain-credits
export function gainCreditsFn(state: State, side: Side, count: number, opts?: any): void {
  coreGaining.gainCredits(state, side, count, opts);
}

// Helper for lose-credits
export function loseCreditsFn(state: State, side: Side, count: number, opts?: any): void {
  coreGaining.loseCredits(state, side, count, opts);
}

// Helper for gain-tags
export function gainTagsFn(state: State, side: Side, eid: EID, count: number, opts?: any): void {
  coreTags.gainTags(state, side, eid, count, opts);
}

// Helper for lose-tags
export function loseTagsFn(state: State, side: Side, eid: EID, count: number): void {
  coreTags.loseTags(state, side, eid, count);
}

// Helper for draw
export function drawFn(state: State, side: Side, eid: EID, count: number): void {
  coreDrawing.draw(state, side, eid, count);
}

// Helper for mill
export function millFn(state: State, side: Side, eid: EID, card: Card, count: number): void {
  coreMoving.mill(state, side, eid, card, count);
}

// Helper for move
export function moveFn(state: State, side: Side, card: Card, toZone: string, opts: any = {}): void {
  coreMoving.move(state, side, card, toZone, opts);
}

// Helper for trash
export function trashFn(state: State, side: Side, eidOrCard: any, opts?: any): void {
  const eid = typeof eidOrCard === 'object' && eidOrCard ? eidOrCard : null;
  if (typeof eidOrCard === 'object' && eidOrCard.uuid) {
    // second arg is card, third is opts
    coreMoving.trash(state, side, eidOrCard, opts);
  } else {
    coreMoving.trash(state, side, eidOrCard, opts);
  }
}

// Helper for trash-cards
export function trashCardsFn(state: State, side: Side, eid: EID, cards: Card[], opts?: any): void {
  coreMoving.trashCards(state, side, eid, cards, opts);
}

// Helper for trash-on-empty
export function trashOnEmptyFn(counterType: string): any {
  return coreDefHelpers.trashOnEmpty(counterType);
}

// Helper for reveal
export function revealFn(state: State, side: Side, card: Card): void {
  coreRevealing.reveal(state, side, card);
}

// Helper for expose
export function exposeFn(state: State, side: Side, eid: EID, cards: Card[]): void {
  coreExpose.expose(state, side, eid, cards);
}

// Helper for find-card
export function findCardFn(title: string, cards: Card[]): Card | null {
  return coreFinding.findCard(title, cards);
}

// Helper for find-latest
export function findLatestFn(state: State, card: any): any {
  return coreFinding.findLatest(state, card);
}

// Helper for all-active
export function allActiveFn(state: State, side: Side, type?: string): Card[] {
  return coreBoard.allActive(state, side, type);
}

// Helper for all-active-installed
export function allActiveInstalledFn(state: State, side: Side, type?: string): Card[] {
  return coreBoard.allActiveInstalled(state, side, type);
}

// Helper for all-installed
export function allInstalledFn(state: State, side: Side, type?: string): Card[] {
  return coreBoard.allInstalled(state, side, type);
}

// Helper for runnable-servers
export function runnableServersFn(state: State, card: Card): string[] {
  return coreBoard.runnableServers?.(state, card) || [];
}

// Helper for is-central?
export function isCentralFn(server: any): boolean {
  return coreServers.isCentral(server);
}

// Helper for target-server
export function targetServerFn(ctx: any): string {
  return coreServers.targetServer(ctx);
}

// Helper for zone->name
export function zoneNameFn(zone: string): string {
  return coreServers.zoneName(zone);
}

// Helper for threat-level
export function threatLevelFn(level: number, state: State): boolean {
  return coreThreat.threatLevel?.(level, state) ?? true;
}

// Helper for win
export function winFn(state: State, side: Side, reason: string): void {
  coreWinning.win(state, side, reason);
}

// Helper for play-ability
export function playAbilityFn(eid: EID, opts: any): void {
  coreActions.playAbility(eid, opts);
}

// Helper for play-instant
export function playInstantFn(state: State, side: Side, eid: EID, card: Card, opts: any = {}): void {
  corePlayInstants.playInstant(state, side, eid, card, opts);
}

// Helper for as-agenda
export function asAgendaFn(state: State, side: Side, card: Card, agendaPoints: number): void {
  coreMoving.asAgenda(state, side, card, agendaPoints);
}

// Helper for swap-agendas
export function swapAgendasFn(a: Card, b: Card): void {
  coreMoving.swapAgendas(a, b);
}

// Helper for update!
export function updateFn(state: State, side: Side, card: Card): void {
  coreUpdate.update(state, side, card);
}

// Helper for get-card
export function getCardFn(state: State, card: any): Card {
  return coreCard.getCard(state, card);
}

// Helper for in-deck?
export function inDeckFn(card: Card): boolean {
  return coreCard.inDeck(card);
}

// Helper for in-discard?
export function inDiscardFn(card: Card): boolean {
  return coreCard.inDiscard(card);
}

// Helper for in-hand?
export function inHandFn(card: Card): boolean {
  return coreCard.inHand(card);
}

// Helper for in-scored?
export function inScoredFn(card: Card): boolean {
  return coreCard.inScored(card);
}

// Helper for installed?
export function installedFn(card: Card): boolean {
  return coreCard.installed(card);
}

// Helper for rezzed?
export function rezzedFn(card: Card): boolean {
  return coreCard.rezzed(card);
}

// Helper for facedown?
export function facedownFn(card: Card): boolean {
  return coreCard.facedown?.(card) ?? false;
}

// Helper for faceup?
export function faceupFn(card: Card): boolean {
  return coreCard.faceup?.(card) ?? false;
}

// Helper for has-subtype?
export function hasSubtypeFn(card: Card, subtype: string): boolean {
  return coreCard.hasSubtype(card, subtype);
}

// Helper for has-any-subtype?
export function hasAnySubtypeFn(card: Card, types: string[]): boolean {
  return coreCard.hasAnySubtype(card, types);
}

// Helper for is-type?
export function isTypeFn(card: Card, type: string): boolean {
  return coreCard.isType(card, type);
}

// Helper for card predicates
export function agendaFn(card: Card): boolean {
  return coreCard.agenda(card);
}

export function corpFn(card: Card): boolean {
  return coreCard.corp(card);
}

export function eventFn(card: Card): boolean {
  return coreCard.event(card);
}

export function iceFn(card: Card): boolean {
  return coreCard.ice(card);
}

export function hardwareFn(card: Card): boolean {
  return coreCard.hardware(card);
}

export function programFn(card: Card): boolean {
  return coreCard.program(card);
}

export function resourceFn(card: Card): boolean {
  return coreCard.resource(card);
}

export function runnerFn(card: Card): boolean {
  return coreCard.runner(card);
}

export function virusProgramFn(card: Card): boolean {
  return coreCard.virusProgram(card);
}

// Helper for first-event?
export function firstEventFn(state: State, side: Side, event: string, pred?: any): boolean {
  return coreEvents.firstEvent(state, side, event, pred);
}

// Helper for first-run-event?
function firstRunEventFn(state: State, side: Side, event: string): boolean {
  return coreEvents.firstEvent(state, side, event);
}

// Helper for first-trash?
function firstTrashFn(state: State, side: Side): boolean {
  return coreEvents.firstTrash?.(state, side) ?? false;
}

// Helper for no-event?
export function noEventFn(state: State, side: Side | null, event: string, pred?: any): boolean {
  return coreEvents.noEvent?.(state, side, event, pred) ?? true;
}

// Helper for event-count
export function eventCountFn(state: State, side: Side, event: string, pred?: any): number {
  return coreEvents.eventCount?.(state, side, event, pred) ?? 0;
}

// Helper for run-events
export function runEventsFn(state: State, side: Side, event: string): any[] {
  return coreEvents.runEvents?.(state, side, event) || [];
}

// Helper for tagged
export function isTaggedFn(state: State): boolean {
  return !!((state as any).tagged);
}

// Helper for remove-once
function removeOnceFn(arr: any[], item: any): any[] {
  const idx = arr.indexOf(item);
  if (idx >= 0) {
    return [...arr.slice(0, idx), ...arr.slice(idx + 1)];
  }
  return arr;
}
