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
function toC(type: string, ...values: number[]): any {
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
function enumerateCards(cards: any[], sort?: string): string {
  return utils.enumerateCards(cards, sort);
}

// Helper for quantify
function quantify(n: number, noun: string): string {
  return utils.quantify(n, noun);
}

// Helper for decapitalize
function decapitalize(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// Helper for str->int
function strToInt(s: string): number {
  return parseInt(s, 10);
}

// Helper for shuffle!
function shuffleDeck(state: State, side: Side, zone: string): void {
  coreShuffling.shuffle(state, side, zone);
}

// Helper for play-sfx
function playSfx(state: State, side: Side, sfx: string): void {
  coreSay.playSfx(state, side, sfx);
}

// Helper for system-msg
function systemMsg(state: State, side: Side, text: string): void {
  coreSay.systemMsg(state, side, text);
}

// Helper for card-str
function cardStr(state: State, card: Card): string {
  return coreToString.cardStr(state, card);
}

// Helper for make-icon
function makeIcon(type: string, card: Card): any {
  return coreDefHelpers.makeIcon(type, card);
}

// Helper for trash-on-empty
function trashOnEmpty(counterType: string): any {
  return coreDefHelpers.trashOnEmpty(counterType);
}

// Helper for draw-abi
function drawAbility(count: number, card: Card | null, opts: any = {}): any {
  return coreDefHelpers.drawAbility(count, card, opts);
}

// Helper for successful-run-replace-breach
function successfulRunReplaceBreach(opts: any): any {
  return coreDefHelpers.successfulRunReplaceBreach(opts);
}

// Helper for breach-access-bonus
function breachAccessBonus(server: string, count: number, opts: any = {}): any {
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
function lookAtTheTop(fromSide: string, toSide: string, count: number): any {
  return coreDefHelpers.lookAtTheTop(fromSide, toSide, count);
}

// Helper for offer-jack-out
function offerJackOut(): any {
  return coreDefHelpers.offerJackOut();
}

// Helper for reorder-choice
function reorderChoice(fromSide: string, toSide: string, from: Card[], fromIdx: number, toIdx: number, cards: Card[]): any {
  return coreDefHelpers.reorderChoice(fromSide, toSide, from, fromIdx, toIdx, cards);
}

// Helper for play-tiered-sfx
function playTieredSfx(state: State, side: Side, sfx: string, credits: number, maxLevel: number): void {
  coreDefHelpers.playTieredSfx(state, side, sfx, credits, maxLevel);
}

// Helper for cancellable
function cancelable(choices: any[], opts: any = {}): any {
  return corePrompts.cancellable(choices, opts);
}

// Helper for sabotage-ability
function sabotageAbility(count: number): any {
  return coreSabotage.sabotageAbility(count);
}

// Helper for identify-mark-ability
function identifyMarkAbility(): any {
  return coreMark.identifyMarkAbility();
}

// Helper for mark-changed-event
function markChangedEvent(): any {
  return coreMark.markChangedEvent();
}

// Helper for set-aside
function setAsideFn(state: State, side: Side, eid: EID, cards: Card[]): void {
  coreSetAsideModule.setAside(state, side, eid, cards);
}

// Helper for get-set-aside
function getSetAsideFn(state: State, side: Side, eid: EID): Card[] {
  return coreSetAsideModule.getSetAside(state, side, eid);
}

// Helper for any-subs-broken
function anySubsBrokenFn(currentIce: Card | null): boolean {
  return coreIce.anySubsBroken?.(currentIce) ?? false;
}

// Helper for all-subs-broken
function allSubsBrokenFn(currentIce: Card | null): boolean {
  return coreIce.allSubsBroken?.(currentIce) ?? false;
}

// Helper for break-sub
function breakSubFn(cost: any, strength: number, type: string, opts: any = {}): any {
  return coreIce.breakSub(cost, strength, type, opts);
}

// Helper for pump
function pumpFn(card: Card, amount: number, duration?: string): void {
  coreIce.pump(card, amount, duration);
}

// Helper for update-all-ice
function updateAllIceFn(state: State): void {
  coreIce.updateAllIce(state);
}

// Helper for update-all-icebreakers
function updateAllIcebreakersFn(state: State, side: Side): void {
  coreIce.updateAllIcebreakers(state, side);
}

// Helper for update-breaker-strength
function updateBreakerStrengthFn(state: State, side: Side, card: Card): void {
  coreIce.updateBreakerStrength(state, side, card);
}

// Helper for derez
function derezFn(state: State, side: Side, eid: EID, card: Card, opts: any = {}): void {
  coreRezzing.derez(state, side, eid, card, opts);
}

// Helper for rez
function rezFn(state: State, side: Side, eid: EID, card: Card): void {
  coreRezzing.rez(state, side, eid, card);
}

// Helper for can-pay-to-rez?
function canPayToRezFn(state: State, side: Side, eid: EID, card: Card): boolean {
  return coreRezzing.canPayToRez?.(state, side, eid, card) ?? false;
}

// Helper for rez-cost
function rezCostFn(state: State, side: Side, card: Card): number {
  return coreCostFns.rezCost?.(state, side, card) ?? 0;
}

// Helper for rez-additional-cost-bonus
function rezAdditionalCostBonusFn(state: State, side: Side, card: Card): any[] {
  return coreCostFns.rezAdditionalCostBonus?.(state, side, card) || [];
}

// Helper for build-cost-string
function buildCostString(costs: any[]): string {
  return corePayment.buildCostString(costs);
}

// Helper for trash-cost
function trashCostFn(state: State, side: Side, card: Card): number | null {
  return coreCostFns.trashCost?.(state, side, card) ?? null;
}

// Helper for get-x-fn
function getxFn(state: State, side: Side, eid: EID, card: Card, targets: any[]): number {
  return coreMemory.getxFn(state, side, eid, card, targets);
}

// Helper for expected-mu
function expectedMuFn(state: State, card: Card): number {
  return coreMemory.expectedMu(state, card);
}

// Helper for count-virus-programs
function countVirusProgramsFn(state: State): number {
  return coreVirus.countVirusPrograms(state);
}

// Helper for link+
function linkPlusFn(count: number): any {
  return coreLink.linkPlus(count);
}

// Helper for get-link
function getLinkFn(state: State): number {
  return coreLink.getLink(state);
}

// Helper for hand-size
function handSizeFn(state: State, side: Side): number {
  return coreHandSize.handSize?.(state, side) ?? 0;
}

// Helper for mu+
function muPlusFn(value: number | any): any {
  return coreMemory.muPlus(value);
}

// Helper for caissa-mu+
function caissaMuPlusFn(value: number): any {
  return coreMemory.caissaMuPlus(value);
}

// Helper for virus-mu+
function virusMuPlusFn(value: number): any {
  return coreMemory.virusMuPlus(value);
}

// Helper for runner-hand-size+
function runnerHandSizePlusFn(value: number | any): any {
  return coreHandSize.runnerHandSizePlus(value);
}

// Helper for runner-hand-size+
function runnerHandSizePlus(value: number | any): any {
  return coreHandSize.runnerHandSizePlus(value);
}

// Helper for in-hand*?
function inHandStarFn(state: State, card: Card): boolean {
  return coreCard.inHandStar?.(state, card) ?? coreCard.inHand(card);
}

// Helper for all-cards-in-hand*
function allCardsInHandStarFn(state: State, side: Side): Card[] {
  return coreCard.allCardsInHandStar?.(state, side) || ((state as any)[side]?.hand || []);
}

// Helper for same-card?
function sameCard(a: any, b: any): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (typeof a === 'object' && typeof b === 'object') {
    return a.uuid === b.uuid;
  }
  return a === b;
}

// Helper for remove-once
function removeOnce(arr: any[], item: any): any[] {
  const idx = arr.indexOf(item);
  if (idx >= 0) {
    return [...arr.slice(0, idx), ...arr.slice(idx + 1)];
  }
  return arr;
}

// Helper for effect-completed
function effectCompletedFn(state: State, side: Side, eid: EID): any {
  return coreEid.effectCompleted(state, side, eid);
}

// Helper for complete-with-result
function completeWithResultFn(state: State, side: Side, eid: EID, result: any): any {
  return coreEid.completeWithResult(state, side, eid, result);
}

// Helper for make-result
function makeResultFn(eid: EID, val: any): any {
  return coreEid.makeResult(eid, val);
}

// Helper for resolve-ability
function resolveAbilityFn(state: State, side: Side, ability: any, card: Card, targets: any[]): void {
  coreEngine.resolveAbility(state, side, ability, card, targets);
}

// Helper for not-used-once?
function notUsedOnceFn(state: State, opts: any, card: Card): boolean {
  return coreEngine.notUsedOnce?.(state, opts, card) ?? true;
}

// Helper for can-trigger?
function canTriggerFn(state: State, side: Side, eid: EID, ability: any, card: Card, targets: any[]): boolean {
  return coreEngine.canTrigger?.(state, side, eid, ability, card, targets) ?? true;
}

// Helper for register-once
function registerOnceFn(state: State, side: Side, ability: any, card: Card): void {
  coreEngine.registerOnce?.(state, side, ability, card);
}

// Helper for register-events
function registerEventsFn(state: State, side: Side, card: Card, events: any[]): void {
  coreEngine.registerEvents(state, side, card, events);
}

// Helper for unregister-floating-events
function unregisterFloatingEventsFn(duration: string): void {
  coreEngine.unregisterFloatingEvents(duration);
}

// Helper for unregister-suppress-by-uuid
function unregisterSuppressByUuidFn(state: State, side: Side, uuid: string): void {
  coreEngine.unregisterSuppressByUuid?.(state, side, uuid);
}

// Helper for trigger-event
function triggerEventFn(state: State, side: Side, event: string): void {
  coreEngine.triggerEvent(state, side, event);
}

// Helper for unregister-effects-for-card
function unregisterEffectsForCardFn(state: State, side: Side, card: Card): void {
  coreEffects.unregisterEffectsForCard?.(state, side, card);
}

// Helper for unregister-lingering-effects
function unregisterLingeringEffectsFn(duration: string): void {
  coreEffects.unregisterLingeringEffects(duration);
}

// Helper for any-effects
function anyEffectsFn(state: State, side: Side, effectType: string, value: any, card: Card, opts: any): any[] {
  return coreEffects.anyEffects?.(state, side, effectType, value, card, opts) || [];
}

// Helper for register-lingering-effect
function registerLingeringEffectFn(card: Card, effectDef: any): string {
  return coreEffects.registerLingeringEffect?.(card, effectDef) || '';
}

// Helper for unregister-effect-by-uuid
function unregisterEffectByUuidFn(state: State, side: Side, uuid: string): void {
  coreEffects.unregisterEffectByUuid?.(state, side, uuid);
}

// Helper for get-autoresolve
function getAutoresolveFn(key: string, fallback: any = null): any {
  return coreOptional.getAutoresolve(key, fallback);
}

// Helper for never?
function neverFn(): boolean {
  return coreOptional.never?.() ?? false;
}

// Helper for set-autoresolve
function setAutoresolveFn(key: string, value: string): any {
  return coreOptional.setAutoresolve?.(key, value);
}

// Helper for run-any-server-ability
function runAnyServerAbilityFn(opts: any): any {
  return coreDefHelpers.runAnyServerAbility(opts);
}

// Helper for host
function hostFn(state: State, side: Side, host: Card, hostee: Card, opts: any = {}): void {
  coreHosting.host(state, side, host, hostee, opts);
}

// Helper for runner-can-pay-and-install?
function runnerCanPayAndInstallFn(state: State, side: Side, eid: EID, card: Card, opts: any = {}): boolean {
  return coreInstalling.runnerCanPayAndInstall(state, side, eid, card, opts);
}

// Helper for runner-install
function runnerInstallFn(state: State, side: Side, eid: EID, card: Card, opts: any = {}): void {
  coreInstalling.runnerInstall(state, side, eid, card, opts);
}

// Helper for access-bonus
function accessBonusFn(state: State, side: Side, server: string, count: number): void {
  coreAccess.accessBonus(state, side, server, count);
}

// Helper for access-card
function accessCardFn(state: State, side: Side, eid: EID, card: Card): void {
  coreAccess.accessCard(state, side, eid, card);
}

// Helper for turn-archives-faceup
function turnArchivesFaceupFn(state: State, side: Side, servers: string[]): void {
  coreAccess.turnArchivesFaceup(state, side, servers);
}

// Helper for get-only-card-to-access
function getOnlyCardToAccessFn(state: State): boolean {
  return coreAccess.getOnlyCardToAccess?.(state) ?? false;
}

// Helper for total-cards-accessed
function totalCardsAccessedFn(run: any): number {
  return coreRuns.totalCardsAccessed(run);
}

// Helper for bypass-ice
function bypassIceFn(state: State): void {
  coreRuns.bypassIce(state);
}

// Helper for end-run
function endRunFn(state: State, side: Side, eid: EID, card: Card): void {
  coreRuns.endRun(state, side, eid, card);
}

// Helper for get-current-encounter
function getCurrentEncounterFn(state: State): any {
  return coreRuns.getEncounter?.(state) || {};
}

// Helper for make-run
function makeRunFn(state: State, side: Side, eid: EID, server: string, card: Card): void {
  coreRuns.makeRun(state, side, eid, server, card);
}

// Helper for jack-out
function jackOutFn(eid: EID): void {
  coreRuns.jackOut(eid);
}

// Helper for prevent-tag
function preventTagFn(state: State, side: Side, count: number | 'all'): void {
  corePrevention.preventTag(state, side, count);
}

// Helper for prevent-end-run
function preventEndRunFn(state: State, side: Side, eid: EID): void {
  corePrevention.preventEndRun(state, side, eid);
}

// Helper for prevent-damage
function preventDamageFn(state: State, side: Side, eid: EID, count: number): void {
  corePrevention.preventDamage(state, side, eid, count);
}

// Helper for prevent-encounter
function preventEncounterFn(state: State, side: Side, eid: EID): void {
  corePrevention.preventEncounter(state, side, eid);
}

// Helper for preventable?
function preventableFn(ctx: any): boolean {
  return corePrevention.preventable(ctx);
}

// Helper for damage-name
function damageNameFn(state: State): string {
  return coreDamage.damageName(state);
}

// Helper for damage-type
function damageTypeFn(state: State): string {
  return coreDamage.damageType(state);
}

// Helper for chosen-damage
function chosenDamageFn(side: string, targets: any[]): void {
  coreDamage.chosenDamage(side, targets);
}

// Helper for enable-runner-damage-choice
function enableRunnerDamageChoiceFn(): void {
  coreDamage.enableRunnerDamageChoice();
}

// Helper for runner-can-choose-damage?
function runnerCanChooseDamageFn(state: State): boolean {
  return coreDamage.runnerCanChooseDamage?.(state) ?? false;
}

// Helper for prevent-up-to-n-damage
function preventUpToNDamageFn(n: number, types: string[]): any {
  return corePrevention.preventUpToNDamage(n, types);
}

// Helper for prevent-encounter
function preventEncounterFn2(state: State, side: Side, eid: EID): void {
  corePrevention.preventEncounter(state, side, eid);
}

// Helper for zone-locked?
function zoneLockedFn(state: State, side: string, zone: string): boolean {
  return coreFlags.zoneLocked?.(state, side, zone) ?? false;
}

// Helper for can-trash?
function canTrashFn(state: State, side: Side, card: Card): boolean {
  return coreFlags.canTrash?.(state, side, card) ?? true;
}

// Helper for in-corp-scored?
function inCorpScoredFn(state: State, side: Side, card: Card): boolean {
  return coreFlags.inCorpScored?.(state, side, card) ?? false;
}

// Helper for card-flag?
function cardFlagFn(card: Card, flag: string, value?: any): boolean {
  return coreFlags.cardFlag?.(card, flag, value) ?? false;
}

// Helper for register-run-flag!
function registerRunFlagFn(card: Card, flag: string, fn: any): void {
  coreFlags.registerRunFlag?.(card, flag, fn);
}

// Helper for get-counters
function getCounters(card: Card, type: string): number {
  return coreCard.getCounters(card, type);
}

// Helper for add-counter
function addCounterFn(state: State, side: Side, card: Card, type: string, count: number, opts: any = {}): void {
  coreProps.addCounter(state, side, card, type, count, opts);
}

// Helper for gain-clicks
function gainClicksFn(state: State, side: Side, count: number, opts?: any): void {
  coreGaining.gainClicks(state, side, count, opts);
}

// Helper for lose-clicks
function loseClicksFn(state: State, side: Side, count: number): void {
  coreGaining.loseClicks(state, side, count);
}

// Helper for gain-credits
function gainCreditsFn(state: State, side: Side, count: number, opts?: any): void {
  coreGaining.gainCredits(state, side, count, opts);
}

// Helper for lose-credits
function loseCreditsFn(state: State, side: Side, count: number, opts?: any): void {
  coreGaining.loseCredits(state, side, count, opts);
}

// Helper for gain-tags
function gainTagsFn(state: State, side: Side, eid: EID, count: number, opts?: any): void {
  coreTags.gainTags(state, side, eid, count, opts);
}

// Helper for lose-tags
function loseTagsFn(state: State, side: Side, eid: EID, count: number): void {
  coreTags.loseTags(state, side, eid, count);
}

// Helper for draw
function drawFn(state: State, side: Side, eid: EID, count: number): void {
  coreDrawing.draw(state, side, eid, count);
}

// Helper for mill
function millFn(state: State, side: Side, eid: EID, card: Card, count: number): void {
  coreMoving.mill(state, side, eid, card, count);
}

// Helper for move
function moveFn(state: State, side: Side, card: Card, toZone: string, opts: any = {}): void {
  coreMoving.move(state, side, card, toZone, opts);
}

// Helper for trash
function trashFn(state: State, side: Side, eidOrCard: any, opts?: any): void {
  const eid = typeof eidOrCard === 'object' && eidOrCard ? eidOrCard : null;
  if (typeof eidOrCard === 'object' && eidOrCard.uuid) {
    // second arg is card, third is opts
    coreMoving.trash(state, side, eidOrCard, opts);
  } else {
    coreMoving.trash(state, side, eidOrCard, opts);
  }
}

// Helper for trash-cards
function trashCardsFn(state: State, side: Side, eid: EID, cards: Card[], opts?: any): void {
  coreMoving.trashCards(state, side, eid, cards, opts);
}

// Helper for trash-on-empty
function trashOnEmptyFn(counterType: string): any {
  return coreDefHelpers.trashOnEmpty(counterType);
}

// Helper for reveal
function revealFn(state: State, side: Side, card: Card): void {
  coreRevealing.reveal(state, side, card);
}

// Helper for expose
function exposeFn(state: State, side: Side, eid: EID, cards: Card[]): void {
  coreExpose.expose(state, side, eid, cards);
}

// Helper for find-card
function findCardFn(title: string, cards: Card[]): Card | null {
  return coreFinding.findCard(title, cards);
}

// Helper for find-latest
function findLatestFn(state: State, card: any): any {
  return coreFinding.findLatest(state, card);
}

// Helper for all-active
function allActiveFn(state: State, side: Side, type?: string): Card[] {
  return coreBoard.allActive(state, side, type);
}

// Helper for all-active-installed
function allActiveInstalledFn(state: State, side: Side, type?: string): Card[] {
  return coreBoard.allActiveInstalled(state, side, type);
}

// Helper for all-installed
function allInstalledFn(state: State, side: Side, type?: string): Card[] {
  return coreBoard.allInstalled(state, side, type);
}

// Helper for runnable-servers
function runnableServersFn(state: State, card: Card): string[] {
  return coreBoard.runnableServers?.(state, card) || [];
}

// Helper for is-central?
function isCentralFn(server: any): boolean {
  return coreServers.isCentral(server);
}

// Helper for target-server
function targetServerFn(ctx: any): string {
  return coreServers.targetServer(ctx);
}

// Helper for zone->name
function zoneNameFn(zone: string): string {
  return coreServers.zoneName(zone);
}

// Helper for threat-level
function threatLevelFn(level: number, state: State): boolean {
  return coreThreat.threatLevel?.(level, state) ?? true;
}

// Helper for win
function winFn(state: State, side: Side, reason: string): void {
  coreWinning.win(state, side, reason);
}

// Helper for play-ability
function playAbilityFn(eid: EID, opts: any): void {
  coreActions.playAbility(eid, opts);
}

// Helper for play-instant
function playInstantFn(state: State, side: Side, eid: EID, card: Card, opts: any = {}): void {
  corePlayInstants.playInstant(state, side, eid, card, opts);
}

// Helper for as-agenda
function asAgendaFn(state: State, side: Side, card: Card, agendaPoints: number): void {
  coreMoving.asAgenda(state, side, card, agendaPoints);
}

// Helper for swap-agendas
function swapAgendasFn(a: Card, b: Card): void {
  coreMoving.swapAgendas(a, b);
}

// Helper for update!
function updateFn(state: State, side: Side, card: Card): void {
  coreUpdate.update(state, side, card);
}

// Helper for get-card
function getCardFn(state: State, card: any): Card {
  return coreCard.getCard(state, card);
}

// Helper for in-deck?
function inDeckFn(card: Card): boolean {
  return coreCard.inDeck(card);
}

// Helper for in-discard?
function inDiscardFn(card: Card): boolean {
  return coreCard.inDiscard(card);
}

// Helper for in-hand?
function inHandFn(card: Card): boolean {
  return coreCard.inHand(card);
}

// Helper for in-scored?
function inScoredFn(card: Card): boolean {
  return coreCard.inScored(card);
}

// Helper for installed?
function installedFn(card: Card): boolean {
  return coreCard.installed(card);
}

// Helper for rezzed?
function rezzedFn(card: Card): boolean {
  return coreCard.rezzed(card);
}

// Helper for facedown?
function facedownFn(card: Card): boolean {
  return coreCard.facedown?.(card) ?? false;
}

// Helper for faceup?
function faceupFn(card: Card): boolean {
  return coreCard.faceup?.(card) ?? false;
}

// Helper for has-subtype?
function hasSubtypeFn(card: Card, subtype: string): boolean {
  return coreCard.hasSubtype(card, subtype);
}

// Helper for has-any-subtype?
function hasAnySubtypeFn(card: Card, types: string[]): boolean {
  return coreCard.hasAnySubtype(card, types);
}

// Helper for is-type?
function isTypeFn(card: Card, type: string): boolean {
  return coreCard.isType(card, type);
}

// Helper for card predicates
function agendaFn(card: Card): boolean {
  return coreCard.agenda(card);
}

function corpFn(card: Card): boolean {
  return coreCard.corp(card);
}

function eventFn(card: Card): boolean {
  return coreCard.event(card);
}

function iceFn(card: Card): boolean {
  return coreCard.ice(card);
}

function hardwareFn(card: Card): boolean {
  return coreCard.hardware(card);
}

function programFn(card: Card): boolean {
  return coreCard.program(card);
}

function resourceFn(card: Card): boolean {
  return coreCard.resource(card);
}

function runnerFn(card: Card): boolean {
  return coreCard.runner(card);
}

function virusProgramFn(card: Card): boolean {
  return coreCard.virusProgram(card);
}

// Helper for first-event?
function firstEventFn(state: State, side: Side, event: string, pred?: any): boolean {
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
function noEventFn(state: State, side: Side | null, event: string, pred?: any): boolean {
  return coreEvents.noEvent?.(state, side, event, pred) ?? true;
}

// Helper for event-count
function eventCountFn(state: State, side: Side, event: string, pred?: any): number {
  return coreEvents.eventCount?.(state, side, event, pred) ?? 0;
}

// Helper for run-events
function runEventsFn(state: State, side: Side, event: string): any[] {
  return coreEvents.runEvents?.(state, side, event) || [];
}

// Helper for tagged
function isTaggedFn(state: State): boolean {
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

// Helper for card-def
function cardDefFn(card: Card): any {
  return coreCard.cardDef(card);
}

// ============================================================================
// Card definitions
// ============================================================================

// Acacia
export const acacia: CardDef = {
  title: 'Acacia',
  events: [{
    event: 'purge',
    optional: {
      'waiting-prompt': true,
      prompt: 'Trash Acacia to gain 1 [Credits] for each purged virus counter?',
      'yes-ability': {
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const counters = (state as any).total_purged_counters ?? 0;
          yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trash(state, side, eid, { causeCard: card })], []);
          systemMsg(state, side, `trashes Acacia and gains ${counters} [Credit]`);
          gainCreditsFn(state, side, counters);
        }),
      },
    },
  }],
};

// Adjusted Matrix
export const adjustedMatrix: CardDef = {
  title: 'Adjusted Matrix',
  implementation: 'Click Adjusted Matrix to use the ability',
  'on-install': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const allActiveInstalled = allActiveInstalledFn(state, ':runner');
      return allActiveInstalled.some((c: Card) => hasSubtypeFn(c, 'Icebreaker'));
    }),
    prompt: 'Choose an icebreaker',
    choices: { card: (c: Card) => runnerFn(c) && hasSubtypeFn(c, 'Icebreaker') && installedFn(c) },
    msg: (msgFn: any) => `host itself on ${cardStr(state, target)}`,
    effect: effect(hostFn(state, side, getCardFn(state, target), card)),
  },
  'static-abilities': [{
    type: ':gain-subtype',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const host = forms.host?.(state, card);
      return host && sameCard(targets[0], host);
    }),
    value: 'AI',
  }],
  abilities: [{
    ...breakSubFn(toC(':lose-click', 1), 1, 'All', { req: req(function*() { return true; }) }),
  } as any],
};

// AirbladeX (JSRF Ed.)
export const airbladeX: CardDef = {
  title: 'AirbladeX (JSRF Ed.)',
  data: { counter: { power: 3 } },
  prevention: [
    {
      prevents: 'damage',
      type: 'ability',
      ability: {
        async: true,
        cost: [toC('power', 1)],
        msg: 'prevent 1 net damage',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const ctx = forms.context(state, card, targets) || {};
          return (forms.runFn(state) &&
            (ctx.type === 'net' || ctx.type === ':net') &&
            preventableFn(ctx));
        }),
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          preventDamageFn(state, side, eid, 1);
        }),
      },
    },
    {
      prevents: 'encounter',
      type: 'ability',
      ability: {
        async: true,
        cost: [toC('power', 1)],
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const ctx = forms.context(state, card, targets) || {};
          return (ctx.remaining > 0);
        }),
        msg: (msgFn: any) => `prevent the encounter ability on ${(forms.context(state, card, targets) as any)?.ice?.title || 'the encountered ice'}`,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          preventEncounterFn(state, side, eid);
        }),
      },
    },
  ],
  events: [trashOnEmptyFn('power')],
};

// Akamatsu Mem Chip
export const akamatsuMemChip: CardDef = {
  title: 'Akamatsu Mem Chip',
  'static-abilities': [muPlusFn(1)],
};

// Alarm Clock
export const alarmClock: CardDef = {
  title: 'Alarm Clock',
  let: {
    ability: {
      once: ':per-turn',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return !!(state as any)['runner-phase-12'];
      }),
      msg: 'make a run on HQ',
      'makes-run': true,
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        registerEventsFn(state, side, card, [{
          event: 'encounter-ice',
          skippable: true,
          'unregister-once-resolved': true,
          duration: ':end-of-run',
          optional: {
            prompt: 'Spend [Click][Click] to bypass encountered ice?',
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              return firstEventFn(state, side, 'encounter-ice');
            }),
            'yes-ability': {
              cost: [toC('click', 2)],
              req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                return (getCardFn(state, card)?.runner?.click ?? 0) >= 2;
              }),
              msg: (msgFn: any) => `bypass ${cardStr(state, (forms.context(state, card, targets) as any)?.ice)}`,
              effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                bypassIceFn(state);
              }),
            },
          },
        }]);
        makeRunFn(state, side, eid, ':hq', card);
      }),
    },
  },
  flags: { 'runner-phase-12': req(function*() { return true; }) },
  events: [{
    event: 'runner-turn-begins',
    skippable: true,
    interactive: req(function*() { return true; }),
    optional: {
      once: ':per-turn',
      prompt: 'Make a run on HQ?',
      'yes-ability': { let: { ability: null } },
    },
  }],
  abilities: [forms.let?.ability],
};

// Amanuensis
export const amanuensis: CardDef = {
  title: 'Amanuensis',
  'static-abilities': [muPlusFn(1)],
  events: [
    {
      event: 'runner-lose-tag',
      optional: {
        prompt: 'Remove 1 power counter to draw 2 cards?',
        'waiting-prompt': true,
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const ctx = forms.context(state, card, targets) || {};
          return (ctx.side === ':runner' || ctx.side === 'runner') &&
            (ctx.amount > 0) &&
            (getCounters(card, 'power') > 0);
        }),
        'yes-ability': drawAbility(2, null, { cost: [toC('power', 1)] }),
      },
    },
    {
      event: 'runner-turn-ends',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return isTaggedFn(state);
      }),
      msg: 'place 1 power counter on itself',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        addCounterFn(state, side, card, 'power', 1);
      }),
    },
  ],
};

// Aniccam
export const aniccam: CardDef = {
  title: 'Aniccam',
  'static-abilities': [muPlusFn(1)],
  events: [
    {
      event: 'corp-trash',
      async: true,
      'once-per-instance': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const eventTargets = targets || [];
        const hasEvent = eventTargets.some((t: any) => t.card && eventFn(t.card));
        if (!hasEvent) return false;
        return firstEventFn(state, null, 'trash',
          (t: any[]) => t.some((x: any) => x.card && eventFn(x.card)));
      }),
      'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return !!(runnerFn(state as unknown as State)?.deck?.length);
      }) },
      msg: 'draw 1 card',
      effect: effect(drawFn(':runner', eid, 1)),
    },
    {
      event: 'runner-trash',
      async: true,
      'once-per-instance': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const eventTargets = targets || [];
        const hasEvent = eventTargets.some((t: any) => t.card && eventFn(t.card));
        if (!hasEvent) return false;
        return firstEventFn(state, null, 'trash',
          (t: any[]) => t.some((x: any) => x.card && eventFn(x.card)));
      }),
      'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return !!(runnerFn(state as unknown as State)?.deck?.length);
      }) },
      msg: 'draw 1 card',
      effect: effect(drawFn(':runner', eid, 1)),
    },
    {
      event: 'game-trash',
      async: true,
      'once-per-instance': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const eventTargets = targets || [];
        const hasEvent = eventTargets.some((t: any) => t.card && eventFn(t.card));
        if (!hasEvent) return false;
        return firstEventFn(state, null, 'trash',
          (t: any[]) => t.some((x: any) => x.card && eventFn(x.card)));
      }),
      'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return !!(runnerFn(state as unknown as State)?.deck?.length);
      }) },
      msg: 'draw 1 card',
      effect: effect(drawFn(':runner', eid, 1)),
    },
  ],
};

// Archives Interface
export const archivesInterface: CardDef = {
  title: 'Archives Interface',
  events: [{
    event: 'breach-server',
    automatic: ':pre-breach',
    async: true,
    interactive: req(function*() { return true; }),
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      const run = forms.run(state);
      const corp = (state as any).corp;
      return ((ctx.server === ':archives' || ctx.server === 'archives') &&
        (run?.maxAccess ?? 0) !== 0 &&
        (corp?.discard?.length ?? 0) > 0);
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        turnArchivesFaceupFn(state, side, [':archives'])], []);
      continue_ability(state, side, {
        optional: {
          prompt: 'Remove a card from the game instead of accessing it?',
          'yes-ability': {
            prompt: 'Choose a card in Archives',
            choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              return (state as any).corp?.discard || [];
            }),
            msg: (msgFn: any) => `remove ${target?.title || 'the target'} from the game`,
            effect: effect(coreMoving.move(':corp', target, ':rfg')),
          },
        },
      }, card, null);
    }),
  }],
};

// Astrolabe
export const astrolabe: CardDef = {
  title: 'Astrolabe',
  'static-abilities': [muPlusFn(1)],
  events: [drawAbility(1, null, { event: 'server-created' })],
};

// Autoscripter
export const autoscripter: CardDef = {
  title: 'Autoscripter',
  events: [
    {
      event: 'runner-install',
      silent: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        const program = ctx.card;
        if (!program || !programFn(program)) return false;
        if ((state as any).activePlayer !== ':runner') return false;
        const prevZone = ctx['previous-zone'] || [];
        if (!prevZone.includes('hand') && !prevZone.includes(':hand')) return false;
        return firstEventFn(state, ':runner', 'runner-install',
          (t: any[]) => {
            const first = t[0];
            const pz = first?.card ? (first.card['previous-zone'] || []) : [];
            return pz.includes('hand') && programFn(first.card);
          });
      }),
      msg: 'gain [Click]',
      effect: effect(gainClicksFn(1)),
    },
    {
      event: 'unsuccessful-run',
      async: true,
      msg: 'trash itself',
      effect: effect(coreMoving.trash(eid, card, { causeCard: card })),
    },
  ],
};

// Basilar Synthgland 2KVJ
export const basilarSynthgland: CardDef = {
  title: 'Basilar Synthgland 2KVJ',
  'on-install': {
    async: true,
    effect: effect(coreDamage.damage(eid, ':brain', 2, { card: card })),
  },
  'in-play': [':click-per-turn', 1],
};

// Blackguard
export const blackguard: CardDef = {
  title: 'Blackguard',
  'static-abilities': [muPlusFn(2)],
  events: [{
    event: 'expose',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      return !!(ctx.cards?.length);
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      const cards = ctx.cards || [];
      if (cards.length === 1) {
        // force-rez single card
        const c = cards[0];
        const cname = c.title || 'the card';
        const cost = rezCostFn(state, side, c);
        const additionalCosts = rezAdditionalCostBonusFn(state, side, c);
        const payable = canPayToRezFn(state, ':corp', eid, c);
        if (!payable) {
          effectCompletedFn(state, side, eid);
        } else if (additionalCosts?.length) {
          continue_ability(state, side, {
            optional: {
              'waiting-prompt': true,
              prompt: `Pay [Credits] ${cost}, plus ${decapitalize(buildCostString(additionalCosts))} as an additional cost to rez ${cname}?`,
              player: ':corp',
              'yes-ability': {
                async: true,
                effect: effect(rezFn(':corp', eid, c)),
              },
              'no-ability': {
                msg: `declines to pay additional costs and is not forced to rez ${cname}`,
              },
            },
          }, card, null);
        } else {
          rezFn(state, ':corp', eid, c);
        }
      } else {
        // choose a card to force rez
        const chooseFn = (cardsList: Card[]) => {
          if (cardsList.length === 1) {
            return resolveAbilityFn(state, side, {
              msg: `force the rez of ${cardsList[0].title}`,
              async: true,
              effect: effect(rezFn(state, ':corp', eid, cardsList[0])),
            }, card, null);
          }
          resolveAbilityFn(state, side, {
            prompt: 'Force the Corp to rez which card?',
            req: req(function*() { return !!(cardsList?.length); }),
            choices: req(function*() { return cardsList; }),
            async: true,
            effect: req(function*(s: State, sd: Side, eid2: EID, c: Card, t: any[]) {
              const chosen = t[0];
              if (chosen) {
                // resolve force rez on chosen
                const cost = rezCostFn(s, sd, chosen);
                const additionalCosts = rezAdditionalCostBonusFn(s, sd, chosen);
                const payable = canPayToRezFn(s, ':corp', eid2, chosen);
                if (!payable) {
                  effectCompletedFn(s, sd, eid2);
                } else if (additionalCosts?.length) {
                  continue_ability(s, sd, {
                    optional: {
                      'waiting-prompt': true,
                      prompt: `Pay [Credits] ${cost}, plus ${decapitalize(buildCostString(additionalCosts))} as an additional cost to rez ${chosen.title}?`,
                      player: ':corp',
                      'yes-ability': {
                        async: true,
                        effect: effect(rezFn(sd, eid2, chosen)),
                      },
                      'no-ability': {
                        msg: `declines to pay additional costs and is not forced to rez ${chosen.title}`,
                      },
                    },
                  }, c, null);
                } else {
                  rezFn(s, ':corp', eid2, chosen);
                }
                // continue with remaining
                const remaining = cardsList.filter(x => !sameCard(x, chosen));
                if (remaining.length > 0) {
                  continue_ability(s, sd, { prompt: 'Choose next', choices: remaining, async: true,
                    effect: effect(chooseFn(remaining))
                  }, c, null);
                }
              }
            }),
          }, card, null);
        };
        chooseFn(cards);
      }
    }),
  }],
};

// Bling
export const bling: CardDef = {
  title: 'Bling',
  'static-abilities': [
    muPlusFn(1),
    {
      type: ':can-play-as-if-in-hand',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const host = forms.host?.(state, card);
        return host && sameCard(targets[0], host);
      }),
      value: true,
    },
  ],
  events: [
    {
      event: 'runner-install',
      skippable: true,
      optional: {
        'waiting-prompt': true,
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const ctx = forms.context(state, card, targets) || {};
          const costs = ctx.costs || [];
          const hasNoCredits = !costs.some((c: any) =>
            (c['cost/type'] === ':credit' || c['cost/type'] === 'credit') && c['cost/amount'] > 0);
          return hasNoCredits && !!(runnerFn(state)?.deck?.length);
        }),
        prompt: 'Host the top card of your stack on Bling?',
        'yes-ability': {
          msg: (msgFn: any) => `host ${(runnerFn(state)?.deck?.[0])?.title || 'the top card'}`,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            triggerEventFn(state, side, ':bling-hosted');
            const deck = (state as any).runner?.deck || [];
            const timesHosted = Math.min(eventCountFn(state, null, ':bling-hosted'), 10);
            playSfx(state, side, `bling-${timesHosted}`);
            const topCard = deck[0];
            if (topCard) {
              hostFn(state, side, card, topCard);
            }
          }),
        },
      },
    },
    {
      event: 'runner-turn-ends',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const cardObj = getCardFn(state, card);
        return !!(cardObj?.hosted?.length);
      }),
      msg: (msgFn: any) => enumerateCards(hostedFn(state, card), ':sorted'),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const cardObj = getCardFn(state, card);
        const hosted = cardObj?.hosted || [];
        if (hosted.length) {
          trashCardsFn(state, ':runner', eid, hosted);
        }
      }),
    },
  ],
};

// BMI Buffer
export const bmiBuffer: CardDef = {
  title: 'BMI Buffer',
  events: [
    {
      event: 'runner-trash',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const cardObj = getCardFn(state, card);
        const hosted = cardObj?.hosted || [];
        for (const t of targets) {
          const latest = findLatestFn(state, t.card);
          const latestCard = getCardFn(state, latest);
          if (runnerFn(latestCard) && programFn(latestCard) && inDiscardFn(latestCard) &&
              (latestCard['previous-zone'] || [])[0] === 'hand') {
            hostFn(state, side, cardObj, latestCard);
          }
        }
        effectCompletedFn(state, side, eid);
      }),
    },
    {
      event: 'corp-trash',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const cardObj = getCardFn(state, card);
        const hosted = cardObj?.hosted || [];
        for (const t of targets) {
          const latest = findLatestFn(state, t.card);
          const latestCard = getCardFn(state, latest);
          if (runnerFn(latestCard) && programFn(latestCard) && inDiscardFn(latestCard) &&
              (latestCard['previous-zone'] || [])[0] === 'hand') {
            hostFn(state, side, cardObj, latestCard);
          }
        }
        effectCompletedFn(state, side, eid);
      }),
    },
  ],
  abilities: [{
    action: true,
    cost: [toC('click', 2)],
    label: 'Install a hosted program',
    prompt: 'Choose a program to install',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const cardObj = getCardFn(state, card);
      const hosted = cardObj?.hosted || [];
      return cancelable(hosted.filter((c: Card) =>
        runnerCanPayAndInstallFn(state, side, { ...eid, source: card }, c)));
    }),
    msg: (msgFn: any) => `install ${target?.title || ''}`,
    async: true,
    effect: effect(runnerInstallFn({ ...eid, source: card, 'source-type': ':runner-install' }, target)),
  }],
};

// BMI Buffer 2
export const bmiBuffer2: CardDef = {
  title: 'BMI Buffer 2',
  events: bmiBuffer.events.map((e: any) => ({ ...e, event: e.event })),
  abilities: [{
    action: true,
    cost: [toC('click', 2)],
    label: 'Install a hosted program',
    prompt: 'Choose a program to install',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const cardObj = getCardFn(state, card);
      return cardObj?.hosted || [];
    }),
    msg: (msgFn: any) => `install ${target?.title || ''}`,
    async: true,
    effect: effect(runnerInstallFn({ ...eid, source: card, 'source-type': ':runner-install' }, target,
      { ignoreAllCost: true })),
  }],
};

// Bookmark
export const bookmark: CardDef = {
  title: 'Bookmark',
  abilities: [
    {
      action: true,
      label: 'Host up to 3 cards from the grip facedown',
      cost: [toC('click', 1)],
      'keep-menu-open': ':while-clicks-left',
      msg: 'host up to 3 cards from the grip facedown',
      choices: { max: 3, card: (c: Card) => runnerFn(c) && inHandFn(c) },
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const cardObj = getCardFn(state, card);
        for (const t of targets) {
          hostFn(state, side, cardObj, t, { facedown: true });
        }
      }),
    },
    {
      action: true,
      label: 'Add all hosted cards to the grip',
      cost: [toC('click', 1)],
      msg: 'add all hosted cards to the grip',
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const cardObj = getCardFn(state, card);
        const hosted = cardObj?.hosted || [];
        for (const c of hosted) {
          moveFn(state, side, c, ':hand');
        }
      }),
    },
    {
      label: 'Add all hosted cards to the grip',
      'fake-cost': [toC(':trash-can')],
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const cardObj = getCardFn(state, card);
        const hostedCards = cardObj?.hosted || [];
        for (const c of hostedCards) {
          moveFn(state, side, c, ':hand');
        }
        continue_ability(state, side, {
          cost: [toC(':trash-can')],
          msg: `add ${quantify(hostedCards.length, 'hosted card')} to the grip`,
        }, card, null);
      }),
    },
  ],
};

// Boomerang
export const boomerang: CardDef = {
  title: 'Boomerang',
  'on-install': {
    prompt: 'Choose an installed piece of ice',
    msg: (msgFn: any) => `target ${cardStr(state, target)}`,
    choices: { card: (c: Card) => installedFn(c) && iceFn(c) },
    effect: effect(coreUpdate.update(state, side, { ...card, special: { ...card.special, 'boomerang-target': target } })),
  },
  'static-abilities': [{
    type: ':icon',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const cardObj = getCardFn(state, card);
      const boomerangTarget = cardObj?.special?.['boomerang-target'];
      return boomerangTarget && sameCard(targets[0], boomerangTarget);
    }),
    'while-disabled': true,
    value: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return makeIcon('B', card);
    }),
  }],
  abilities: [
    // Break subroutine ability
    {
      ...breakSubFn(toC(':trash-can'), 2, 'All', {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const cardObj = getCardFn(state, card);
          const boomerangTarget = cardObj?.special?.['boomerang-target'];
          if (!boomerangTarget) return true;
          const encounters = (state as any).encounters || [];
          return encounters.some((e: any) => sameCard(boomerangTarget, e.ice));
        }),
        'additional-ability': {
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            const cardObj = getCardFn(state, card);
            const source = card;
            registerEventsFn(state, side, source, [{
              event: 'run-ends',
              duration: ':end-of-run',
              'unregister-once-resolved': true,
              optional: {
                req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                  const cardObj2 = getCardFn(state, card);
                  const ctx = forms.context(state, card, targets) || {};
                  return !!(ctx.successful &&
                    !zoneLockedFn(state, ':runner', ':discard') &&
                    (runnerFn(state)?.discard || []).some((c: Card) => c.title === cardObj2.title));
                }),
                once: ':per-run',
                prompt: `Shuffle a copy of ${card?.title || 'this card'} back into the Stack?`,
                'yes-ability': {
                  msg: `shuffle a copy of ${card?.title || 'this card'} back into the Stack`,
                  effect: effect(
                    moveFn(
                      (runnerFn(state)?.discard || []).find((c: Card) => c.title === card?.title),
                      ':deck'
                    ),
                    shuffleDeck(state, side, ':deck')
                  ),
                },
              },
            }]);
          }),
        },
      }),
    },
    // Break 0 subroutines ability
    {
      label: 'Break 0 subroutines',
      cost: [toC(':trash-can')],
      msg: 'break 0 subroutines',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const cardObj = getCardFn(state, card);
        const boomerangTarget = cardObj?.special?.['boomerang-target'];
        if (!boomerangTarget) return true;
        const encounters = (state as any).encounters || [];
        return encounters.some((e: any) => sameCard(boomerangTarget, e.ice));
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const cardObj = getCardFn(state, card);
        const source = card;
        registerEventsFn(state, side, source, [{
          event: 'run-ends',
          duration: ':end-of-run',
          'unregister-once-resolved': true,
          optional: {
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              const cardObj2 = getCardFn(state, card);
              const ctx = forms.context(state, card, targets) || {};
              return !!(ctx.successful &&
                !zoneLockedFn(state, ':runner', ':discard') &&
                (runnerFn(state)?.discard || []).some((c: Card) => c.title === cardObj2.title));
            }),
            once: ':per-run',
            prompt: `Shuffle a copy of ${card?.title || 'this card'} back into the Stack?`,
            'yes-ability': {
              msg: `shuffle a copy of ${card?.title || 'this card'} back into the Stack`,
              effect: effect(
                moveFn(
                  (runnerFn(state)?.discard || []).find((c: Card) => c.title === card?.title),
                  ':deck'
                ),
                shuffleDeck(state, side, ':deck')
              ),
            },
          },
        }]);
      }),
    },
  ],
};

// Borrowed Goods
export const borrowedGoods: CardDef = {
  title: 'Borrowed Goods',
  'on-install': {
    'change-in-game-state': { silent: true, req: req(function*() { return !isTaggedFn(state); }) },
    msg: 'take 1 tag',
    interactive: req(function*() { return true; }),
    async: true,
    effect: effect(gainTagsFn(state, side, eid, 1)),
  },
  'static-abilities': [muPlusFn(1)],
};

// Box-E
export const boxE: CardDef = {
  title: 'Box-E',
  'static-abilities': [
    muPlusFn(2),
    runnerHandSizePlusFn(2),
  ],
};

// Brain Cage
export const brainCage: CardDef = {
  title: 'Brain Cage',
  'static-abilities': [runnerHandSizePlusFn(3)],
  'on-install': {
    async: true,
    effect: effect(coreDamage.damage(eid, ':brain', 1, { card: card })),
  },
};

// Brain Chip
export const brainChip: CardDef = {
  title: 'Brain Chip',
  'x-fn': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return Math.max((state as any)?.runner?.agendaPoint ?? 0, 0);
  }),
  'static-abilities': [
    muPlusFn(req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (getxFn(state, side, eid, card, targets) > 0);
    })),
    muPlusFn(req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return [':regular', getxFn(state, side, eid, card, targets)];
    })),
    runnerHandSizePlusFn(req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return getxFn(state, side, eid, card, targets);
    })),
  ],
};

// Buffer Drive
export const bufferDrive: CardDef = {
  title: 'Buffer Drive',
  events: [
    {
      event: 'runner-trash',
      'once-per-instance': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const hasTrash = targets.some((t: any) => runnerFn(t.card) && (inHandFn(t.card) || inDeckFn(t.card)));
        if (!hasTrash) return false;
        return firstEventFn(state, null, 'trash',
          (t: any[]) => t.some((x: any) => runnerFn(x.card) && (inHandFn(x.card) || inDeckFn(x.card))));
      }),
      interactive: req(function*() { return true; }),
      prompt: 'Choose 1 trashed card to add to the bottom of the stack',
      choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const trashCards = targets || [];
        const validCards = trashCards
          .filter((t: any) => runnerFn(t.card) && (inHandFn(t.card) || inDeckFn(t.card)))
          .map((t: any) => t['moved-card']?.title || t.card?.title)
          .sort();
        return [...validCards, 'No action'];
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        if (target === 'No action') {
          effectCompletedFn(state, side, eid);
          return;
        }
        systemMsg(state, side, `uses ${card.title} to add ${target} to the bottom of the stack`);
        const runner = runnerFn(state);
        const discard = runner?.discard || [];
        const cardToMove = findCardFn(target, [...discard].reverse());
        if (cardToMove) {
          moveFn(state, side, cardToMove, ':deck');
        }
        effectCompletedFn(state, side, eid);
      }),
    },
    {
      event: 'corp-trash',
      'once-per-instance': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const hasTrash = targets.some((t: any) => runnerFn(t.card) && (inHandFn(t.card) || inDeckFn(t.card)));
        if (!hasTrash) return false;
        return firstEventFn(state, null, 'trash',
          (t: any[]) => t.some((x: any) => runnerFn(x.card) && (inHandFn(x.card) || inDeckFn(x.card))));
      }),
      interactive: req(function*() { return true; }),
      prompt: 'Choose 1 trashed card to add to the bottom of the stack',
      choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const trashCards = targets || [];
        const validCards = trashCards
          .filter((t: any) => runnerFn(t.card) && (inHandFn(t.card) || inDeckFn(t.card)))
          .map((t: any) => t['moved-card']?.title || t.card?.title)
          .sort();
        return [...validCards, 'No action'];
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        if (target === 'No action') {
          effectCompletedFn(state, side, eid);
          return;
        }
        systemMsg(state, side, `uses ${card.title} to add ${target} to the bottom of the stack`);
        const runner = runnerFn(state);
        const discard = runner?.discard || [];
        const cardToMove = findCardFn(target, [...discard].reverse());
        if (cardToMove) {
          moveFn(state, side, cardToMove, ':deck');
        }
        effectCompletedFn(state, side, eid);
      }),
    },
  ],
  abilities: [{
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return !zoneLockedFn(state, ':runner', ':discard');
    }),
    label: 'Add a card from the heap to the top of the stack',
    cost: [toC(':remove-from-game')],
    'show-discard': true,
    choices: { card: (c: Card) => runnerFn(c) && inDiscardFn(c) },
    msg: (msgFn: any) => `add ${target?.title || ''} to the top of the stack`,
    effect: effect(moveFn(target, ':deck', { front: true })),
  }],
};

// Capstone
export const capstone: CardDef = {
  title: 'Capstone',
  abilities: [{
    action: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (runnerFn(state)?.hand?.length ?? 0) > 0;
    }),
    label: 'trash and install cards',
    cost: [toC('click', 1)],
    async: true,
    prompt: 'Choose any number of cards to trash from the grip',
    choices: { max: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (runnerFn(state)?.hand?.length ?? 0);
    }), card: (c: Card) => runnerFn(c) && inHandFn(c) },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const cardObj = getCardFn(state, card);
      const trashedCardNames = targets.map((t: any) => t.title || t);
      const installedCards = allActiveInstalledFn(state, ':runner');
      const installedNames = installedCards.map((c: Card) => c.title);
      const overlapSet = new Set(trashedCardNames.filter((n: string) => installedNames.includes(n)));

      yield wait_for(state, [{ asyncResult: 'result' },
        trashCardsFn(state, side, eid, targets, { unpreventable: true, causeCard: card })], []);
      const trashedCards = (state as any).async_result;
      const drawCount = Array.from(overlapSet).length;
      yield wait_for(state, [{ asyncResult: 'result' }, drawFn(state, side, drawCount)], []);
      systemMsg(state, side, `uses ${cardObj.title} to trash ${enumerateCards(trashedCards)} from the grip and draw ${quantify(drawCount, 'card')}`);
      effectCompletedFn(state, side, eid);
    }),
  }],
};

// Capybara
export const capybara: CardDef = {
  title: 'Capybara',
  events: [{
    event: 'bypassed-ice',
    async: true,
    optional: {
      req: req(function*() { return true; }),
      prompt: (msgFn: any) => `Remove this hardware from the game to derez ${target?.title || 'the encountered ice'}?`,
      'waiting-prompt': true,
      'yes-ability': {
        async: true,
        cost: [toC(':remove-from-game')],
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          derezFn(state, side, eid, target, { 'msg-keys': { 'include-cost-from-eid': eid } });
        }),
      },
    },
  }],
};

// Carnivore
export const carnivore: CardDef = {
  title: 'Carnivore',
  'static-abilities': [muPlusFn(1)],
  interactions: {
    'access-ability': {
      label: 'Trash card',
      'trash?': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const cardObj = getCardFn(state, card);
        const runner = runnerFn(state);
        return (canTrashFn(state, ':runner', target) &&
          !inDiscardFn(target) &&
          !(state as any)['per-turn']?.[cardObj.cid] &&
          (runner?.hand?.length ?? 0) >= 2);
      }),
      cost: [toC(':trash-from-hand', 2)],
      msg: (msgFn: any) => `trash ${target.title} at no cost`,
      once: ':per-turn',
      async: true,
      effect: effect(trashFn(eid, { ...target, seen: true }, { accessed: true, causeCard: card })),
    },
  },
};

// Cataloguer
export const cataloguer: CardDef = {
  title: 'Cataloguer',
  data: { counter: { power: 2 } },
  abilities: [
    {
      action: true,
      cost: [toC('click', 1), toC('power', 1)],
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const runner = runnerFn(state);
        return (runner?.reg?.successfulRun || []).some((s: any) => s === ':rd' || s === 'rd');
      }),
      label: 'Breach R&D',
      msg: 'breach R&D',
      'keep-menu-open': ':while-power-tokens-left',
      async: true,
      effect: effect(accessBonusFn(state, ':runner', ':rd', 1)),
    },
  ],
  events: [
    trashOnEmptyFn('power'),
    successfulRunReplaceBreach({
      targetServer: ':rd',
      mandatory: false,
      ability: {
        async: true,
        msg: 'rearrange the top 4 cards of R&D',
        cost: [toC('power', 1)],
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return (getCounters(card, 'power') > 0);
        }),
        'waiting-prompt': true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const corp = corpFn(state as unknown as State);
          const deckCards = corp?.deck?.slice(0, 4) || [];
          if (deckCards.length > 0) {
            continue_ability(state, side,
              reorderChoice(':corp', ':corp', deckCards, 0, deckCards.length, deckCards),
              card, null);
          }
        }),
      },
    }),
  ],
};

// Chop Bot 3000
export const chopBot: CardDef = {
  title: 'Chop Bot 3000',
  flags: { 'runner-phase-12': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return (allInstalledFn(state, ':runner').length ?? 0) >= 2;
  }) },
  events: [{
    event: 'runner-turn-begins',
    skippable: true,
    interactive: req(function*() { return true; }),
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (allInstalledFn(state, ':runner').length ?? 0) >= 2;
    }),
    once: ':per-turn',
    prompt: 'Trash another installed card to draw 1 card or remove 1 tag',
    choices: { card: (c: Card) => runnerFn(c) && installedFn(c), 'not-self': true },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const trashedCard = target;
      yield wait_for(state, [{ asyncResult: 'result' },
        trashFn(state, ':runner', trashedCard, { unpreventable: true, causeCard: card })], []);
      const tags = countRealTagsFn(state);
      continue_ability(state, side, {
        prompt: 'Choose one',
        'waiting-prompt': true,
        choices: ['Draw 1 card', ...(tags > 0 ? ['Remove 1 tag'] : []), 'Done'],
        async: true,
        msg: (msgFn: any) => `trash ${cardStr(state, trashedCard)} and ${decapitalize(target)}`,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          if (target === 'Draw 1 card') {
            drawFn(state, ':runner', eid, 1);
          } else if (target === 'Remove 1 tag') {
            loseTagsFn(state, ':runner', eid, 1);
          } else {
            effectCompletedFn(state, ':runner', eid);
          }
        }),
      }, card, null);
    }),
  }],
  abilities: [{
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (allInstalledFn(state, ':runner').length ?? 0) >= 2;
    }),
    label: 'Trash another installed card to draw 1 card or remove 1 tag',
    choices: { card: (c: Card) => runnerFn(c) && installedFn(c), 'not-self': true },
    once: ':per-turn',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const trashedCard = target;
      yield wait_for(state, [{ asyncResult: 'result' },
        trashFn(state, ':runner', trashedCard, { unpreventable: true, causeCard: card })], []);
      const tags = countRealTagsFn(state);
      continue_ability(state, side, {
        prompt: 'Choose one',
        'waiting-prompt': true,
        choices: ['Draw 1 card', ...(tags > 0 ? ['Remove 1 tag'] : []), 'Done'],
        async: true,
        msg: (msgFn: any) => `trash ${cardStr(state, trashedCard)} and ${decapitalize(target)}`,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          if (target === 'Draw 1 card') {
            drawFn(state, ':runner', eid, 1);
          } else if (target === 'Remove 1 tag') {
            loseTagsFn(state, ':runner', eid, 1);
          } else {
            effectCompletedFn(state, ':runner', eid);
          }
        }),
      }, card, null);
    }),
  }],
};

// Clone Chip
export const cloneChip: CardDef = {
  title: 'Clone Chip',
  abilities: [{
    prompt: 'Choose a program to install',
    label: 'Install program from the heap',
    'show-discard': true,
    'change-in-game-state': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const runner = runnerFn(state);
        const discard = runner?.discard || [];
        return discard.some((c: Card) => programFn(c) &&
          runnerCanPayAndInstallFn(state, side, { ...eid, source: card, 'source-type': ':runner-install' }, c,
            { 'no-toast': true }));
      }),
    },
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return programFn(target) && inDiscardFn(target) &&
          runnerCanPayAndInstallFn(state, side, { ...eid, source: card }, target);
      }),
    },
    cost: [toC(':trash-can')],
    async: true,
    effect: effect(runnerInstallFn({ ...eid, source: card, 'source-type': ':runner-install' }, target,
      { 'msg-keys': { installSource: card, displayOrigin: true, 'include-cost-from-eid': eid } })),
  }],
};

// Comet
export const comet: CardDef = {
  title: 'Comet',
  'static-abilities': [muPlusFn(1)],
  events: [{
    event: 'play-event',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return firstEventFn(state, side, 'play-event');
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      systemMsg(state, ':runner', `can play another event without spending a [Click] by clicking on Comet`);
      updateFn(state, side, { ...card, 'comet-event': true });
    }),
  }],
  abilities: [{
    async: true,
    label: 'Play an event in the grip twice',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const cardObj = getCardFn(state, card);
      return cardObj?.['comet-event'];
    }),
    prompt: 'Choose an event to play',
    choices: { card: (c: Card) => eventFn(c) && inHandFn(c) },
    msg: (msgFn: any) => `play ${target?.title || ''}`,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const newEid = { ...eid, 'source-type': ':play' };
      updateFn(state, ':runner', { ...getCardFn(state, card), 'comet-event': false });
      playInstantFn(state, side, newEid, target, null);
    }),
  }],
};

// Cortez Chip
export const cortezChip: CardDef = {
  title: 'Cortez Chip',
  abilities: [{
    prompt: 'Choose a piece of ice',
    label: 'increase rez cost of ice',
    choices: { card: (c: Card) => iceFn(c) && !rezzedFn(c) },
    msg: (msgFn: any) => `increase the rez cost of ${cardStr(state, target)} by 2 [Credits] until the end of the turn`,
    cost: [toC(':trash-can')],
    effect: effect(registerLingeringEffectFn(card, {
      type: ':rez-additional-cost',
      duration: ':end-of-turn',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ice = target;
        return sameCard(targets[0], ice);
      }),
      value: [toC('credit', 2)],
    })),
  }],
};

// Cyberdelia
export const cyberdelia: CardDef = {
  title: 'Cyberdelia',
  'static-abilities': [muPlusFn(1)],
  events: [{
    event: 'subroutines-broken',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      return !!(ctx.allSubsBroken &&
        firstEventFn(state, side, 'subroutines-broken',
          (t: any[]) => t[0] && t[0].allSubsBroken));
    }),
    msg: 'gain 1 [Credits] for breaking all subroutines on a piece of ice',
    async: true,
    effect: effect(gainCreditsFn(eid, 1)),
  }],
};

// Cyberfeeder
export const cyberfeeder: CardDef = {
  title: 'Cyberfeeder',
  recurring: 1,
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const t = target;
        const srcType = eid['source-type'];
        return ((srcType === ':runner-install' || srcType === 'runner-install') &&
          hasSubtypeFn(t, 'Virus') && programFn(t)) ||
          ((srcType === ':ability' || srcType === 'ability') &&
          hasSubtypeFn(t, 'Icebreaker'));
      }),
      type: ':recurring',
    },
  },
};

// CyberSolutions Mem Chip
export const cyberSolutionsMemChip: CardDef = {
  title: 'CyberSolutions Mem Chip',
  'static-abilities': [muPlusFn(2)],
};

// Cybsoft MacroDrive
export const cybsoftMacroDrive: CardDef = {
  title: 'Cybsoft MacroDrive',
  recurring: 1,
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const t = target;
        return eid['source-type'] === ':ability' &&
          programFn(t);
      }),
      type: ':recurring',
    },
  },
};

// Daredevil
export const daredevil: CardDef = {
  title: 'Daredevil',
  'static-abilities': [muPlusFn(2)],
  events: [drawAbility(2, null, {
    event: 'run',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const pos = targetFn(state, card, targets)?.position ?? 0;
      return (pos <= 2 && firstEventFn(state, side, 'run',
        (t: any[]) => (t[0]?.position ?? 0) <= 2));
    }),
  })],
};

// Dedicated Processor
export const dedicatedProcessor: CardDef = {
  title: 'Dedicated Processor',
  implementation: 'Click Dedicated Processor to use ability',
  req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    const allActiveInstalled = allActiveInstalledFn(state, ':runner');
    return allActiveInstalled.some((c: Card) => hasSubtypeFn(c, 'Icebreaker'));
  }),
  hosting: { card: (c: Card) => hasSubtypeFn(c, 'Icebreaker') && !hasSubtypeFn(c, 'AI') && installedFn(c) },
  abilities: [{
    cost: [toC('credit', 2)],
    label: 'add 4 strength for the remainder of the run',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return !!runFn(state);
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const host = forms.host?.(state, card);
      const hostCard = getCardFn(state, host);
      if (hostCard) {
        pumpFn(hostCard, 4);
      }
    }),
    msg: (msgFn: any) => `pump the strength of ${(forms.host?.(state, card))?.title || ''} by 4`,
  }],
};

// Deep Red
export const deepRed: CardDef = {
  title: 'Deep Red',
  'static-abilities': [caissaMuPlusFn(3)],
  events: [{
    event: 'runner-install',
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        return hasSubtypeFn(ctx.card, 'Caissa');
      }),
      prompt: 'Trigger the [Click] ability of the just-installed Caissa program?',
      'yes-ability': {
        async: true,
        effect: effect(playAbilityFn(eid, { card: (forms.context(state, card, targets) as any)?.card, ability: 0, 'ignore-cost': true })),
      },
    },
  }],
};

// Demolisher
export const demolisher: CardDef = {
  title: 'Demolisher',
  'static-abilities': [
    muPlusFn(1),
    { type: ':trash-cost', value: -1 },
  ],
  events: [{
    event: 'runner-trash',
    'once-per-instance': true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      return corpFn(ctx.card) &&
        firstEventFn(state, side, 'runner-trash',
          (t: any[]) => t.some((x: any) => corpFn(x.card)));
    }),
    msg: 'gain 1 [Credits]',
    async: true,
    effect: effect(gainCreditsFn(':runner', eid, 1)),
  }],
};

// Desperado
export const desperado: CardDef = {
  title: 'Desperado',
  'static-abilities': [muPlusFn(1)],
  events: [{
    event: 'successful-run',
    automatic: ':gain-credits',
    silent: true,
    async: true,
    msg: 'gain 1 [Credits]',
    effect: effect(gainCreditsFn(eid, 1)),
  }],
};

// Detente
export const detente: CardDef = {
  title: 'Detente',
  abilities: [{
    action: true,
    cost: [toC('click', 1), toC(':hosted-to-hq', 2)],
    label: 'Runner may access 1 card from HQ',
    msg: ':cost',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      continue_ability(state, ':runner', {
        optional: {
          prompt: 'Access 1 card from HQ?',
          'waiting-prompt': true,
          'yes-ability': {
            msg: 'access 1 card from HQ',
            async: true,
            effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              const corp = corpFn(state);
              const hand = corp?.hand || [];
              if (hand.length > 0) {
                const shuffled = [...hand].sort(() => Math.random() - 0.5);
                const cardToAccess = shuffled[0];
                accessCardFn(state, ':runner', eid, cardToAccess);
              }
            }),
          },
        },
      }, card, null);
    }),
  }],
  'static-abilities': [muPlusFn(1)],
  events: [{
    event: 'successful-run',
    skippable: true,
    interactive: req(function*() { return true; }),
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        const validCtx = (c: any) => c.server?.[0] === ':hq' || c.server?.[0] === 'hq';
        return (validCtx(ctx) &&
          firstEventFn(state, side, 'successful-run',
            (t: any[]) => t[0] && validCtx(t[0])) &&
          !!(corpFn(state)?.hand?.length));
      }),
      'waiting-prompt': true,
      prompt: 'Reveal and host a card from HQ (at random)',
      'yes-ability': {
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const corp = corpFn(state);
          const hand = corp?.hand || [];
          const targetCard = hand.length > 0 ? hand[Math.floor(Math.random() * hand.length)] : null;
          if (targetCard) {
            systemMsg(state, side, `uses Detente to reveal and host ${targetCard.title} from HQ`);
            yield wait_for(state, [{ asyncResult: 'result' }, revealFn(state, ':runner', targetCard)], []);
            hostFn(state, side, card, { ...targetCard, seen: true });
            effectCompletedFn(state, side, eid);
          }
        }),
        async: true,
      },
    },
  }],
  'corp-abilities': [{ action: true, player: ':corp', 'display-side': ':corp',
    cost: [toC('click', 1), toC(':hosted-to-hq', 2)],
    label: 'Runner may access 1 card from HQ',
    msg: ':cost',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      continue_ability(state, ':runner', {
        optional: {
          prompt: 'Access 1 card from HQ?',
          'waiting-prompt': true,
          'yes-ability': {
            msg: 'access 1 card from HQ',
            async: true,
            effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              const corp = corpFn(state);
              const hand = corp?.hand || [];
              if (hand.length > 0) {
                const shuffled = [...hand].sort(() => Math.random() - 0.5);
                const cardToAccess = shuffled[0];
                accessCardFn(state, ':runner', eid, cardToAccess);
              }
            }),
          },
        },
      }, card, null);
    }),
  }],
};

// Devil Charm
export const devilCharm: CardDef = {
  title: 'Devil Charm',
  events: [{
    event: 'encounter-ice',
    skippable: true,
    interactive: req(function*() { return true; }),
    optional: {
      prompt: 'Remove Devil Charm from the game to give encountered ice -6 strength?',
      'yes-ability': {
        msg: (msgFn: any) => `give -6 strength to ${(forms.context(state, card, targets) as any)?.ice?.title || 'the encountered ice'} for the remainder of the run`,
        cost: [toC(':remove-from-game')],
        effect: effect(
          registerLingeringEffectFn(card, {
            type: ':ice-strength',
            duration: ':end-of-run',
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              const ctx = forms.context(state, card, targets) || {};
              const ice = ctx.ice;
              return ice && sameCard(targets[0], ice);
            }),
            value: -6,
          }),
          updateAllIceFn(state)
        ),
      },
    },
  }],
};

// Dinosaurus
export const dinosaurus: CardDef = {
  title: 'Dinosaurus',
  'static-abilities': [
    {
      type: ':can-host',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return programFn(target) && hasSubtypeFn(target, 'Icebreaker') && !hasSubtypeFn(target, 'AI');
      }),
      'max-cards': 1,
      'no-mu': true,
    },
    {
      type: ':breaker-strength',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const cardObj = getCardFn(state, card);
        const hosted = cardObj?.hosted;
        return hosted && hosted.length > 0 && sameCard(targets[0], hosted[0]);
      }),
      value: 2,
    },
  ],
};

// Docklands Pass
export const docklandsPass: CardDef = {
  title: 'Docklands Pass',
  events: [breachAccessBonus(':hq', 1, {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      return (ctx.server === ':hq' &&
        firstEventFn(state, side, 'breach-server',
          (t: any[]) => t[0] && t[0].server === ':hq'));
    }),
    msg: 'access 1 additional card from HQ',
  })],
};

// Doppelgänger
export const doppelganger: CardDef = {
  title: 'Doppelgänger',
  'static-abilities': [muPlusFn(1)],
  events: [{
    event: 'run-ends',
    interactive: req(function*() { return true; }),
    'change-in-game-state': {
      silent: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return notUsedOnceFn(state, { once: ':per-turn' }, card);
      }),
    },
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        return !!(ctx.successful &&
          notUsedOnceFn(state, { once: ':per-turn' }, card));
      }),
      prompt: 'Make another run?',
      'yes-ability': {
        prompt: 'Choose a server',
        once: ':per-turn',
        async: true,
        choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return runnableServersFn(state, card);
        }),
        msg: (msgFn: any) => `make a run on ${target}`,
        'makes-run': true,
        effect: effect(
          unregisterLingeringEffectsFn(':end-of-run'),
          unregisterFloatingEventsFn(':end-of-run'),
          registerOnceFn(state, side, { once: ':per-turn' }, card),
          updateAllIcebreakersFn(state, side),
          updateAllIceFn(state),
          coreIce.resetAllIce?.(state),
          corePrompts.clearWaitPrompt?.(':corp'),
          makeRunFn(eid, target, getCardFn(state, card))
        ),
      },
    },
  }],
};

// Dorm Computer
export const dormComputer: CardDef = {
  title: 'Dorm Computer',
  data: { counter: { power: 4 } },
  'static-abilities': [{
    type: ':forced-to-avoid-tag',
    value: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      // this-card-is-run-source check
      const run = forms.run(state);
      const sourceCard = run?.sourceCard;
      return sourceCard && sameCard(card, sourceCard);
    }),
  }],
  events: [{
    event: 'tag-interrupt',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const run = forms.run(state);
      const sourceCard = run?.sourceCard;
      return sourceCard && sameCard(sourceCard, card);
    }),
    async: true,
    msg: 'avoid all tags',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      preventTagFn(state, ':runner', 'all');
    }),
  }],
  abilities: [runAnyServerAbilityFn({
    action: true,
    cost: [toC('click', 1), toC('power', 1)],
    msg: 'make a run and avoid all tags for the remainder of the run',
  })],
};

// Dyson Fractal Generator
export const dysonFractalGenerator: CardDef = {
  title: 'Dyson Fractal Generator',
  recurring: 1,
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const t = target;
        return eid['source-type'] === ':ability' &&
          hasSubtypeFn(t, 'Fracter') && hasSubtypeFn(t, 'Icebreaker');
      }),
      type: ':recurring',
    },
  },
};

// Dyson Mem Chip
export const dysonMemChip: CardDef = {
  title: 'Dyson Mem Chip',
  'static-abilities': [
    muPlusFn(1),
    linkPlusFn(1),
  ],
};

// DZMZ Optimizer
export const dzmzOptimizer: CardDef = {
  title: 'DZMZ Optimizer',
  'static-abilities': [
    muPlusFn(1),
    {
      type: ':install-cost',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return programFn(target) &&
          noEventFn(state, ':runner', 'runner-install',
            (t: any[]) => programFn((t[0] || {}).card));
      }),
      value: -1,
    },
  ],
  events: [{
    event: 'runner-install',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return programFn(target) &&
        firstEventFn(state, ':runner', 'runner-install',
          (t: any[]) => programFn((t[0] || {}).card));
    }),
    silent: true,
    msg: (msgFn: any) => `reduce the install cost of ${target.title} by 1 [Credits]`,
  }],
};

// e3 Feedback Implants
export const e3FeedbackImplants: CardDef = {
  title: 'e3 Feedback Implants',
  ...autoIcebreakerFn({
    abilities: [{
      ...breakSubFn(1, 1, 'All', {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return anySubsBrokenFn(forms.currentIce?.(state));
        }),
      }),
    }],
  }),
};

// Ekomind
export const ekomind: CardFn = {
  title: 'Ekomind',
  effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    // Update base mu to match hand size
    const handSize = (runnerFn(state)?.hand || []).length;
    // Add watch to update on hand change
    addWatchFn(state, 'ekomind', (k: string, ref: any, oldVal: any, newVal: any) => {
      const newHandSize = (newVal?.runner?.hand || []).length;
      if (newHandSize !== (oldVal?.runner?.hand || []).length) {
        // Update base mu
        const base = newVal.runner?.memory?.base;
        if (base !== newHandSize) {
          coreUpdate.updateIn(ref, ['runner', 'memory', 'base'], () => newHandSize);
        }
      }
    });
  }),
  'leave-play': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    removeWatchFn(state, 'ekomind');
  }),
};

// EMP Device
export const empDevice: CardDef = {
  title: 'EMP Device',
  abilities: [{
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return !!runFn(state);
    }),
    msg: 'prevent the Corp from rezzing more than 1 piece of ice for the remainder of the run',
    cost: [toC(':trash-can')],
    effect: effect(
      registerEventsFn(card, [{
        event: 'rez',
        duration: ':end-of-run',
        'unregister-once-resolved': true,
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return iceFn((forms.context(state, card, targets) as any)?.card);
        }),
        effect: effect(registerRunFlagFn(card, ':can-rez',
          (s: State, _side: Side, card: Card) =>
            iceFn(card)
              ? ((() => { toastFn(state, ':corp', 'Cannot rez ice the rest of this run due to EMP Device'); return false; })())
              : true)),
      }])
    ),
  }],
};

function toastFn(state: State, side: Side, msg: string): void {
  coreToasts.toast(state, side, msg);
}

function addWatchFn(state: any, key: string, fn: any): void {
  state.addWatch?.(key, fn);
}

function removeWatchFn(state: any, key: string): void {
  state.removeWatch?.(key);
}

// Endurance
export const endurance: CardDef = {
  title: 'Endurance',
  ...autoIcebreakerFn({
    data: { counter: { power: 3 } },
    'static-abilities': [muPlusFn(2)],
    events: [{
      event: 'successful-run',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return firstEventFn(state, ':runner', 'successful-run');
      }),
      msg: 'place 1 power counter on itself',
      async: true,
      effect: effect(addCounterFn(eid, card, 'power', 1)),
    }],
    abilities: [breakSubFn(toC('power', 2), 2, 'All')],
  }),
};

// Feedback Filter
export const feedbackFilter: CardDef = {
  title: 'Feedback Filter',
  prevention: [
    {
      prevents: 'damage',
      type: 'ability',
      label: 'Feedback Filter (Net)',
      ability: {
        async: true,
        cost: [toC('credit', 3)],
        msg: 'prevent 1 net damage',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const ctx = forms.context(state, card, targets) || {};
          return (ctx.type === 'net' || ctx.type === ':net') && preventableFn(ctx);
        }),
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          preventDamageFn(state, side, eid, 1);
        }),
      },
    },
    {
      prevents: 'damage',
      type: 'ability',
      label: 'Feedback Filter (Core)',
      ability: {
        ...preventUpToNDamageFn(2, [':brain', ':core']),
        cost: [toC(':trash-can')],
      },
    },
  ],
};

// Flame-out
export const flameOut: CardDef = {
  title: 'Flame-out',
  implementation: 'Credit usage restriction not enforced',
  'static-abilities': [{
    type: ':can-host',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return programFn(target);
    }),
    'max-cards': 1,
  }],
  data: { counter: { credit: 9 } },
  abilities: [
    {
      label: 'Take 1 hosted [Credits]',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const cardObj = getCardFn(state, card);
        const hosted = cardObj?.hosted;
        return !!(hosted?.length && getCounters(card, 'credit') > 0);
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        systemMsg(state, ':runner', 'takes 1 hosted [Credits] from Flame-out');
        // Register flame-out effect
        const cardObj = getCardFn(state, card);
        coreUpdate.update(state, ':runner', { ...cardObj, special: { ...cardObj.special, 'flame-out-trigger': true } });
        spendCreditsFn(state, side, eid, card, 'credit', 1);
      }),
    },
    {
      label: 'Take all hosted [Credits]',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const cardObj = getCardFn(state, card);
        const hosted = cardObj?.hosted;
        return !!(hosted?.length && getCounters(card, 'credit') > 0);
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const credits = getCounters(card, 'credit');
        systemMsg(state, ':runner', `takes ${credits} hosted [Credits] from Flame-out`);
        const cardObj = getCardFn(state, card);
        coreUpdate.update(state, ':runner', { ...cardObj, special: { ...cardObj.special, 'flame-out-trigger': true } });
        takeCreditsFn(state, side, eid, card, 'credit', ':all');
      }),
    },
  ],
  events: [
    {
      event: 'runner-turn-ends',
      automatic: ':last',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const cardObj = getCardFn(state, card);
        return cardObj?.special?.['flame-out-trigger'];
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const cardObj = getCardFn(state, card);
        updateFn(state, side, { ...cardObj, special: { ...cardObj.special, 'flame-out-trigger': false } });
        const cardObj2 = getCardFn(state, card);
        const hosted = cardObj2?.hosted?.[0];
        if (hosted) {
          systemMsg(state, ':runner', `trashes ${hosted.title} from Flame-out`);
          trashFn(state, side, eid, hosted, { causeCard: card });
        } else {
          effectCompletedFn(state, side, eid);
        }
      }),
    },
    {
      event: 'corp-turn-ends',
      automatic: ':last',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const cardObj = getCardFn(state, card);
        return cardObj?.special?.['flame-out-trigger'];
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const cardObj = getCardFn(state, card);
        updateFn(state, side, { ...cardObj, special: { ...cardObj.special, 'flame-out-trigger': false } });
        const cardObj2 = getCardFn(state, card);
        const hosted = cardObj2?.hosted?.[0];
        if (hosted) {
          systemMsg(state, ':runner', `trashes ${hosted.title} from Flame-out`);
          trashFn(state, side, eid, hosted, { causeCard: card });
        } else {
          effectCompletedFn(state, side, eid);
        }
      }),
    },
  ],
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const cardObj = getCardFn(state, card);
        const host = forms.host?.(state, cardObj);
        return eid['source-type'] === ':ability' &&
          host && sameCard(cardObj, host) &&
          getCounters(cardObj, 'credit') > 0;
      }),
      'custom-amount': 1,
      'custom': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const cardObj = getCardFn(state, card);
        yield wait_for(state, [{ asyncResult: 'result' },
          addCounterFn(state, side, cardObj, 'credit', -1, { 'suppress-checkpoint': true })], []);
        coreUpdate.update(state, ':runner', { ...cardObj, special: { ...cardObj.special, 'flame-out-trigger': true } });
        effectCompletedFn(state, side, makeResultFn(eid, 1));
      }),
      type: ':custom',
    },
  },
};

// Flip Switch
export const flipSwitch: CardDef = {
  title: 'Flip Switch',
  events: [{
    event: 'initialize-trace',
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (state as any).activePlayer === ':runner';
      }),
      'waiting-prompt': true,
      prompt: 'Trash Flip Switch to reduce the base trace strength to 0?',
      'yes-ability': {
        msg: 'reduce the base trace strength to 0',
        cost: [toC(':trash-can')],
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          coreUpdate.updateIn(state, [':trace', 'force-base'], () => 0);
        }),
      },
    },
  }],
  abilities: [
    {
      label: 'Jack out',
      'change-in-game-state': { req: req(function*() { return !!(runFn(state) || getCurrentEncounterFn(state)); }) },
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (state as any).activePlayer === ':runner';
      }),
      msg: 'jack out',
      cost: [toC(':trash-can')],
      async: true,
      effect: effect(jackOutFn(eid)),
    },
    {
      label: 'Remove 1 tag',
      'change-in-game-state': { req: req(function*() { return countRealTagsFn(state) > 0; }) },
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (state as any).activePlayer === ':runner';
      }),
      msg: 'remove 1 tag',
      cost: [toC(':trash-can')],
      async: true,
      effect: effect(loseTagsFn(eid, 1)),
    },
  ],
};

// Forger
export const forger: CardDef = {
  title: 'Forger',
  events: [coreChooseOne.chooseOneHelper(
    {
      event: 'tag-interrupt',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return !!(getPreventFn(state)?.tag?.remaining > 0 &&
          !anyEffectsFn(state, side, ':prevent-paid-ability', true, card, [
            { msg: 'avoid 1 tag', label: 'Avoid 1 tag', async: true, cost: [toC(':trash-can')],
              effect: effect(preventTagFn(':runner', eid, 1)) },
            0
          ]));
      }),
      optional: true,
      interactive: req(function*() { return true; }),
    },
    [{
      option: 'Avoid 1 tag',
      cost: [toC(':trash-can')],
      ability: { msg: 'avoid 1 tag', label: 'Avoid 1 tag', async: true, cost: [toC(':trash-can')],
        effect: effect(preventTagFn(':runner', eid, 1)) },
      }
    ])
  ],
  'static-abilities': [linkPlusFn(1)],
  abilities: [{
    msg: 'remove 1 tag',
    label: 'Remove 1 tag',
    cost: [toC(':trash-can')],
    'change-in-game-state': { req: req(function*() { return countRealTagsFn(state) > 0; }) },
    async: true,
    effect: effect(loseTagsFn(eid, 1)),
  }],
};

function getPreventFn(state: State): any {
  return (state as any).prevent;
}

// Friday Chip
export const fridayChip: CardDef = {
  title: 'Friday Chip',
  abilities: [{
    ...setAutoresolveFn('auto-fire', 'Friday Chip placing virus counters on itself'),
  }],
  special: { 'auto-fire': ':always' },
  events: [{
    event: 'runner-turn-begins',
    msg: (msgFn: any) => `move 1 virus counter to ${target.title}`,
    skippable: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (getCounters(card, 'virus') > 0 && countVirusProgramsFn(state) > 0);
    }),
    choices: { card: virusProgramFn },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        addCounterFn(state, ':runner', card, 'virus', -1, { 'suppress-checkpoint': true })], []);
      addCounterFn(state, ':runner', eid, target, 'virus', 1);
    }),
  }, {
    event: 'runner-trash',
    'once-per-instance': true,
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return targets.some((t: any) => corpFn(t.card));
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const amtTrashed = targets.filter((t: any) => corpFn(t.card)).length;
      const singAb = {
        optional: {
          prompt: `Place a virus counter on ${card.title}?`,
          autoresolve: getAutoresolveFn('auto-fire'),
          'yes-ability': {
            async: true,
            effect: effect(
              systemMsg(':runner', `uses ${card.title} to place 1 virus counter on itself`),
              addCounterFn(':runner', eid, card, 'virus', 1)
            ),
          },
        },
      };
      const multAb = {
        prompt: `Place virus counters on ${card.title}?`,
        choices: { number: req(function*() { return amtTrashed; }), default: req(function*() { return amtTrashed; }) },
        async: true,
        effect: effect(
          systemMsg(':runner', `uses ${card.title} to place ${quantify(target, 'virus counter')} on itself`),
          addCounterFn(':runner', eid, card, 'virus', target)
        ),
      };
      const ab = amtTrashed > 1 ? multAb : singAb;
      continue_ability(state, side, ab, card, targets);
    }),
  }],
};

// Gachapon
export const gachapon: CardDef = {
  title: 'Gachapon',
  abilities: [{
    label: 'Install a card from among the top 6 cards of the stack',
    'change-in-game-state': { req: req(function*() { return !!(runnerFn(state)?.deck?.length); }) },
    cost: [toC(':trash-can')],
    async: true,
    'waiting-prompt': true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const deck = runnerFn(state)?.deck || [];
      setAsideFn(state, side, eid, deck.slice(0, 6));
      const setAsideCards = getSetAsideFn(state, side, eid).sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      systemMsg(state, side, `${(eid as any).latestPaymentStr || 'The player'} to use ${card.title} to set aside ${enumerateCards(setAsideCards)} from the top of the stack`);
      yield wait_for(state, [{ asyncResult: 'result' },
        resolveAbilityFn(state, side, {
          async: true,
          prompt: `The set aside cards are: ${enumerateCards(setAsideCards)}`,
          choices: ['OK'],
        }, card, null)], []);

      const installFn = (setAsideCards: Card[]) => ({
        prompt: 'Choose a card to install',
        async: true,
        choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const validCards = setAsideCards.filter((c: Card) =>
            (programFn(c) || (resourceFn(c) && hasSubtypeFn(c, 'Virtual'))) &&
            runnerCanPayAndInstallFn(state, side, { ...eid, source: card, 'source-type': ':runner-install' }, c,
              { 'cost-bonus': -2, 'no-toast': true }));
          return [...validCards, 'Done'];
        }),
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          if (target === 'Done') {
            continue_ability(state, side, shuffleNextFn(setAsideCards, null, null), card, null);
            return;
          }
          const setAsideCards2 = removeOnce(setAsideCards, target);
          const newEid = { ...eid, source: card, 'source-type': ':runner-install' };
          yield wait_for(state, [{ asyncResult: 'result' },
            runnerInstallFn(state, side, newEid, target, {
              'cost-bonus': -2,
              'msg-keys': { installSource: card, displayOrigin: true },
            })], []);
          continue_ability(state, side, shuffleNextFn(setAsideCards2, null, null), card, null);
        }),
      });

      const shuffleNextFn = (setAsideCards: Card[], chosenCard: Card | null, toShuffle: Card[]) => ({
        prompt: (msgFn: any) => {
          const finished = toShuffle?.length >= 3 || setAsideCards.length === 0;
          if (finished) {
            return `Removing: ${enumerateCards(setAsideCards, ':sorted')}[br]Shuffling: ${enumerateCards(toShuffle || [], ':sorted')}`;
          }
          return `Choose ${3 - (toShuffle?.length || 0)} more cards to shuffle back.${toShuffle?.length ? '[br]Currently shuffling back: ' + enumerateCards(toShuffle, ':sorted') : ''}`;
        },
        async: true,
        'not-distinct': true,
        choices: req(function*() {
          const finished = (toShuffle?.length ?? 0) >= 3 || setAsideCards.length === 0;
          return finished ? ['Done', 'Start over'] : setAsideCards;
        }),
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const finished = (toShuffle?.length ?? 0) >= 3 || setAsideCards.length === 0;
          if (finished) {
            if (target === 'Done') {
              continue_ability(state, side, shuffleEndFn(setAsideCards, toShuffle || []), card, null);
            } else if (target === 'Start over') {
              continue_ability(state, side, shuffleNextFn(
                [...(setAsideCards || [])],
                null,
                [...(toShuffle || [])]
              ), card, null);
            }
          } else if (target) {
            const newSetAside = removeOnce(setAsideCards, target);
            const newToShuffle = [...(toShuffle || []), target];
            continue_ability(state, side, shuffleNextFn(newSetAside, target, newToShuffle), card, null);
          }
        }),
      });

      const shuffleEndFn = (removeFromGame: Card[], shuffleBack: Card[]) => ({
        msg: (msgFn: any) => `shuffle ${enumerateCards(shuffleBack, ':sorted')} into the stack and remove ${enumerateCards(removeFromGame, ':sorted')} from the game`,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          for (const c of removeFromGame) {
            moveFn(state, side, c, ':rfg');
          }
          for (const c of shuffleBack) {
            moveFn(state, side, c, ':deck');
          }
          shuffleDeck(state, side, ':deck');
        }),
      });

      continue_ability(state, side, installFn(setAsideCards), card, null);
    }),
  }],
};

function shuffleNextFn(setAsideCards: Card[], chosenCard: Card | null, toShuffle: Card[]): any {
  return {
    prompt: (msgFn: any) => {
      const finished = toShuffle?.length >= 3 || setAsideCards.length === 0;
      if (finished) {
        return `Removing: ${enumerateCards(setAsideCards, ':sorted')}[br]Shuffling: ${enumerateCards(toShuffle || [], ':sorted')}`;
      }
      return `Choose ${3 - (toShuffle?.length || 0)} more cards to shuffle back.${toShuffle?.length ? '[br]Currently shuffling back: ' + enumerateCards(toShuffle, ':sorted') : ''}`;
    },
    async: true,
    'not-distinct': true,
    choices: req(function*() {
      const finished = (toShuffle?.length ?? 0) >= 3 || setAsideCards.length === 0;
      return finished ? ['Done', 'Start over'] : setAsideCards;
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const finished = (toShuffle?.length ?? 0) >= 3 || setAsideCards.length === 0;
      if (finished) {
        if (target === 'Done') {
          continue_ability(state, side, shuffleEndFn(setAsideCards, toShuffle || []), card, null);
        } else if (target === 'Start over') {
          continue_ability(state, side, shuffleNextFn(
            [...(setAsideCards || [])],
            null,
            [...(toShuffle || [])]
          ), card, null);
        }
      } else if (target) {
        const newSetAside = removeOnce(setAsideCards, target);
        const newToShuffle = [...(toShuffle || []), target];
        continue_ability(state, side, shuffleNextFn(newSetAside, target, newToShuffle), card, null);
      }
    }),
  };
}

function shuffleEndFn(removeFromGame: Card[], shuffleBack: Card[]): any {
  return {
    msg: (msgFn: any) => `shuffle ${enumerateCards(shuffleBack, ':sorted')} into the stack and remove ${enumerateCards(removeFromGame, ':sorted')} from the game`,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      for (const c of removeFromGame) {
        moveFn(state, side, c, ':rfg');
      }
      for (const c of shuffleBack) {
        moveFn(state, side, c, ':deck');
      }
      shuffleDeck(state, side, ':deck');
    }),
  };
}

// GAMEDRAGON™ Pro
export const gamedragonPro: CardDef = {
  title: 'GAMEDRAGON™ Pro',
  'on-install': {
    prompt: 'Choose an icebreaker to host GAMEDRAGON™ Pro',
    event: 'runner-turn-begins',
    'change-in-game-state': {
      silent: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const allInst = allInstalledFn(state, ':runner');
        return allInst.some((c: Card) =>
          programFn(c) && !hasSubtypeFn(c, 'AI') && !sameCard(c, card) && hasSubtypeFn(c, 'Icebreaker'));
      }),
    },
    'waiting-prompt': true,
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return installedFn(target) && programFn(target) && !hasSubtypeFn(target, 'AI') && hasSubtypeFn(target, 'Icebreaker');
      }),
    },
    effect: effect(hostFn(state, side, target, card)),
    msg: (msgFn: any) => `host itself on ${target.title}`,
  },
  events: [
    {
      event: 'runner-turn-begins',
      prompt: 'Choose an icebreaker to host GAMEDRAGON™ Pro',
      'change-in-game-state': {
        silent: true,
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const allInst = allInstalledFn(state, ':runner');
          return allInst.some((c: Card) =>
            programFn(c) && !hasSubtypeFn(c, 'AI') && !sameCard(c, card) && hasSubtypeFn(c, 'Icebreaker'));
        }),
      },
      'waiting-prompt': true,
      choices: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return installedFn(target) && programFn(target) && !hasSubtypeFn(target, 'AI') && hasSubtypeFn(target, 'Icebreaker');
        }),
      },
      effect: effect(hostFn(state, side, target, card)),
      msg: (msgFn: any) => `host itself on ${target.title}`,
    },
    {
      event: 'pump-breaker',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return sameCard((forms.context(state, card, targets) as any)?.card, card);
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        const newPump = { ...ctx.effect, duration: ':end-of-run' };
        const effects = (state as any).effects || [];
        const filtered = effects.filter((e: any) => e.uuid !== newPump.uuid);
        (state as any).effects = [...filtered, newPump];
        updateBreakerStrengthFn(state, side, (forms.context(state, card, targets) as any)?.card);
      }),
    },
  ],
  'static-abilities': [{
    type: ':breaker-strength',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return sameCard(targets[0], card);
    }),
    value: 1,
  }],
};

// Gebrselassie
export const gebrselassie: CardDef = {
  title: 'Gebrselassie',
  abilities: [{
    action: true,
    msg: 'host itself on an installed non-AI icebreaker',
    cost: [toC('click', 1)],
    choices: { card: (c: Card) => installedFn(c) && hasSubtypeFn(c, 'Icebreaker') && !hasSubtypeFn(c, 'AI') },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const host = getCardFn(state, card);
      // Remove original-duration effects
      const effects = (state as any).effects || [];
      const newEffects = effects.reduce((acc: any[], e: any) => {
        if (sameCard(host, e.card) && e.type === ':breaker-strength' && e['original-duration']) {
          acc.push({ ...e, duration: e['original-duration'], 'original-duration': undefined });
        } else {
          acc.push(e);
        }
        return acc;
      }, []);
      (state as any).effects = newEffects;
      updateBreakerStrengthFn(state, side, host);
      hostFn(state, side, target, card);
    }),
  }],
  events: [{
    event: 'pump-breaker',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return sameCard((forms.context(state, card, targets) as any)?.card, card);
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      const effects = (state as any).effects || [];
      const lastPump = { ...ctx.effect, duration: ':end-of-turn', 'original-duration': effects[effects.length - 1]?.duration };
      const filtered = effects.filter((e: any) => e.uuid !== lastPump.uuid);
      (state as any).effects = [...filtered, lastPump];
      updateBreakerStrengthFn(state, side, (forms.context(state, card, targets) as any)?.card);
    }),
  }],
  'leave-play': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    const host = getCardFn(state, card);
    const effects = (state as any).effects || [];
    const newEffects = effects.reduce((acc: any[], e: any) => {
      if (sameCard(host, e.card) && e.type === ':breaker-strength' && e['original-duration']) {
        acc.push({ ...e, duration: e['original-duration'], 'original-duration': undefined });
      } else {
        acc.push(e);
      }
      return acc;
    }, []);
    (state as any).effects = newEffects;
    updateBreakerStrengthFn(state, side, host);
  }),
};

// Ghosttongue
export const ghosttongue: CardDef = {
  title: 'Ghosttongue',
  'on-install': {
    async: true,
    effect: effect(coreDamage.damage(eid, ':brain', 1, { card: card })),
  },
  'static-abilities': [{
    type: ':play-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return eventFn(target);
    }),
    value: -1,
  }],
};

// GPI Net Tap
export const gpiNetTap: CardDef = {
  title: 'GPI Net Tap',
  abilities: [{
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const run = forms.run(state);
      return run?.phase === ':approach-ice' &&
        iceFn(forms.currentIce?.(state)) &&
        !rezzedFn(forms.currentIce?.(state));
    }),
    label: 'expose approached ice',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        exposeFn(state, side, makeEidFn2(state, eid), [forms.currentIce?.(state)])], []);
      continue_ability(state, side, offerJackOut(), card, null);
    }),
  }],
};

// Grimoire
export const grimoire: CardDef = {
  title: 'Grimoire',
  'static-abilities': [muPlusFn(2)],
  events: [{
    event: 'runner-install',
    interactive: req(function*() { return true; }),
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      return hasSubtypeFn(ctx.card, 'Virus');
    }),
    async: true,
    effect: effect(addCounterFn(eid, (forms.context(state, card, targets) as any)?.card, 'virus', 1)),
  }],
};

// Heartbeat
export const heartbeat: CardDef = {
  title: 'Heartbeat',
  'static-abilities': [muPlusFn(1)],
  prevention: [{
    prevents: 'damage',
    type: 'ability',
    label: 'Heartbeat',
    ability: {
      async: true,
      cost: [toC(':trash-installed', 1)],
      msg: (msgFn: any) => `prevent 1 ${damageNameFn(state)} damage`,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return preventableFn(forms.context(state, card, targets));
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        preventDamageFn(state, side, eid, 1);
      }),
    },
  }],
};

// Hermes
export const hermes: CardDef = {
  title: 'Hermes',
  let: {
    ability: {
      interactive: req(function*() { return true; }),
      prompt: 'Choose an unrezzed card',
      'change-in-game-state': {
        silent: true,
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const allInst = allActiveInstalledFn(state, ':corp');
          return allInst.some((c: Card) => !faceupFn(c) && installedFn(c));
        }),
      },
      'waiting-prompt': true,
      choices: { card: (c: Card) => !faceupFn(c) && installedFn(c) && corpFn(c), all: true },
      msg: (msgFn: any) => `add ${cardStr(state, target)} to HQ`,
      effect: effect(moveFn(':corp', target, ':hand')),
    },
  },
  'static-abilities': [muPlusFn(1)],
  events: [
    { event: 'agenda-scored', ...(forms.ability || {}) },
    { event: 'agenda-stolen', ...(forms.ability || {}) },
  ],
};

// Hijacked Router
export const hijackedRouter: CardDef = {
  title: 'Hijacked Router',
  events: [
    {
      event: 'server-created',
      msg: 'force the Corp to lose 1 [Credits]',
      async: true,
      effect: effect(loseCreditsFn(':corp', eid, 1)),
    },
    {
      event: 'successful-run',
      skippable: true,
      optional: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return targetServerFn(forms.context(state, card, targets)) === ':archives';
        }),
        prompt: `Trash ${card.title} to force the Corp to lose 3 [Credits]?`,
        'yes-ability': {
          async: true,
          msg: 'force the Corp to lose 3 [Credits]',
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            yield wait_for(state, [{ asyncResult: 'result' },
              trashFn(state, ':runner', card, { unpreventable: true, causeCard: card })], []);
            loseCreditsFn(state, ':corp', eid, 3);
          }),
        },
      },
    },
  ],
};

// Hippo
export const hippo: CardDef = {
  title: 'Hippo',
  events: [{
    event: 'subroutines-broken',
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        const pred = (c: any) => c.allSubsBroken && c.outermost && c['during-run'] && c['on-attacked-server'];
        return pred(ctx) &&
          getCardFn(state, ctx.ice) &&
          firstEventFn(state, side, 'subroutines-broken',
            (t: any[]) => { const c = t[0]; return c && pred(c); });
      }),
      prompt: (msgFn: any) => `Remove this hardware from the game to trash ${(forms.context(state, card, targets) as any)?.ice?.title || 'the ice'}?`,
      'yes-ability': {
        async: true,
        cost: [toC(':remove-from-game')],
        msg: (msgFn: any) => `trash ${cardStr(state, (forms.context(state, card, targets) as any)?.ice)}`,
        effect: effect(trashFn(eid, (forms.context(state, card, targets) as any)?.ice, { causeCard: card })),
      },
    },
  }],
};

// Hippocampic Mechanocytes
export const hippocampicMechanocytes: CardDef = {
  title: 'Hippocampic Mechanocytes',
  'on-install': {
    async: true,
    msg: 'suffer 1 meat damage',
    effect: effect(coreDamage.damage(eid, ':meat', 1, { unboostable: true, card: card })),
  },
  data: { counter: { power: 2 } },
  'static-abilities': [runnerHandSizePlusFn(req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return getCounters(card, 'power');
  }))],
};

// HQ Interface
export const hqInterface: CardDef = {
  title: 'HQ Interface',
  events: [breachAccessBonus(':hq', 1)],
};

// Jeitinho
export const jeitinho: CardDef = {
  title: 'Jeitinho',
  events: [
    {
      event: 'bypassed-ice',
      location: ':discard',
      interactive: req(function*() { return true; }),
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return threatLevelFn(3, state) && inDiscardFn(card);
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        continue_ability(state, side, {
          optional: {
            prompt: 'Install this hardware from the heap?',
            'yes-ability': {
              cost: [toC(':lose-click', 1)],
              async: true,
              effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                const runner = runnerFn(state);
                const discard = runner?.discard || [];
                const targetCard = discard.find((c: Card) => c['printed-title'] === card['printed-title']);
                if (targetCard) {
                  runnerInstallFn(state, side, { ...eid, source: card, 'source-type': ':runner-install' }, targetCard, {
                    'msg-keys': { displayOrigin: true, installSource: card },
                  });
                }
              }),
            },
          },
        }, card, null);
      }),
    },
    {
      event: 'runner-turn-ends',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return installedFn(card) &&
          (runnerFn(state)?.reg?.successfulRun || []).some((s: any) => s === ':hq') &&
          (runnerFn(state)?.reg?.successfulRun || []).some((s: any) => s === ':rd') &&
          (runnerFn(state)?.reg?.successfulRun || []).some((s: any) => s === ':archives');
      }),
      msg: 'add itself to the score area as an assassination agenda worth 0 agenda points',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        asAgendaFn(state, ':runner', card, 0);
        const scored = (state as any).runner?.scored || [];
        const matchingCount = scored.filter((c: Card) => c['printed-title'] === card['printed-title']).length;
        if (matchingCount === 3) {
          systemMsg(state, side, 'wins the game');
          winFn(state, ':runner', 'assassination plot (Jeitinho)');
          effectCompletedFn(state, side, eid);
        } else {
          effectCompletedFn(state, side, eid);
        }
      }),
    },
  ],
};

// Keiko
export const keiko: CardDef = {
  title: 'Keiko',
  'static-abilities': [muPlusFn(2)],
  events: [
    {
      event: 'spent-credits-from-card',
      'once-per-instance': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const companionPred = (c: Card) => !facedownFn(c) && hasSubtypeFn(c, 'Companion');
        const validCtx = (targets: any[]) => targets.some((t: any) => {
          const c = t.card;
          return runnerFn(c) && installedFn(c) && companionPred(c);
        });
        return validCtx(targets) &&
          firstEventFn(state, side, 'spent-credits-from-card', validCtx) &&
          noEventFn(state, side, 'runner-install',
            (t: any[]) => t[0] && t[0].card && companionPred(t[0].card));
      }),
      msg: 'gain 1 [Credit]',
      async: true,
      effect: effect(gainCreditsFn(':runner', eid, 1)),
    },
    {
      event: 'runner-install',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        const companionPred = (c: Card) => !facedownFn(c) && hasSubtypeFn(c, 'Companion');
        const validCtx = (targets: any[]) => targets.some((t: any) => {
          const c = t.card;
          return runnerFn(c) && installedFn(c) && companionPred(c);
        });
        return companionPred(ctx.card) &&
          firstEventFn(state, side, 'runner-install', validCtx) &&
          noEventFn(state, side, 'spent-credits-from-card', validCtx);
      }),
      msg: 'gain 1 [Credit]',
      async: true,
      effect: effect(gainCreditsFn(':runner', eid, 1)),
    },
  ],
};

// Knobkierie
export const knobkierie: CardDef = {
  title: 'Knobkierie',
  'static-abilities': [virusMuPlusFn(3)],
  events: [{
    event: 'successful-run',
    skippable: true,
    interactive: req(function*() { return true; }),
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return firstEventFn(state, ':runner', 'successful-run') &&
          countVirusProgramsFn(state) > 0;
      }),
      prompt: 'Place 1 virus counter?',
      autoresolve: getAutoresolveFn('auto-fire'),
      'yes-ability': {
        prompt: 'Choose an installed virus program to place 1 virus counter on',
        choices: { card: (c: Card) => installedFn(c) && hasSubtypeFn(c, 'Virus') && programFn(c) },
        msg: (msgFn: any) => `place 1 virus counter on ${target.title}`,
        async: true,
        effect: effect(addCounterFn(eid, target, 'virus', 1)),
      },
    },
  }],
  abilities: [{ ...setAutoresolveFn('auto-fire', 'Knobkierie') }],
};

// Lemuria Codecracker
export const lemuriaCodecracker: CardDef = {
  title: 'Lemuria Codecracker',
  abilities: [{
    action: true,
    async: true,
    cost: [toC('click', 1), toC('credit', 1)],
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (runnerFn(state)?.reg?.successfulRun || []).some((s: any) => s === ':hq');
    }),
    choices: { card: installedFn },
    label: 'Expose a card',
    effect: effect(exposeFn(eid, [target], { card: card })),
  }],
};

// LilyPAD
export const lilyPad: CardDef = {
  title: 'LilyPAD',
  events: [{
    event: 'runner-install',
    optional: {
      prompt: 'Draw 1 card?',
      'waiting-prompt': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        return programFn(ctx.card) &&
          firstEventFn(state, ':runner', 'runner-install',
            (t: any[]) => programFn((t[0] || {}).card));
      }),
      autoresolve: getAutoresolveFn('auto-fire'),
      'yes-ability': drawAbility(1),
      'no-ability': { effect: effect(systemMsg(`declines to use ${card.title}`)) },
    },
  }],
  'static-abilities': [muPlusFn(2)],
  abilities: [{ ...setAutoresolveFn('auto-fire', 'LilyPAD') }],
};

// LLDS Memory Diamond
export const lldsMemoryDiamond: CardDef = {
  title: 'LLDS Memory Diamond',
  'static-abilities': [
    linkPlusFn(1),
    runnerHandSizePlusFn(1),
    muPlusFn(1),
  ],
};

// LLDS Processor
export const lldsProcessor: CardDef = {
  title: 'LLDS Processor',
  events: [{
    event: 'runner-install',
    silent: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      return hasSubtypeFn(ctx.card, 'Icebreaker');
    }),
    effect: effect(pumpFn((forms.context(state, card, targets) as any)?.card, 1, ':end-of-turn')),
  }],
};

// Lockpick
export const lockpick: CardDef = {
  title: 'Lockpick',
  recurring: 1,
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const t = target;
        return eid['source-type'] === ':ability' &&
          hasSubtypeFn(t, 'Decoder') && hasSubtypeFn(t, 'Icebreaker');
      }),
      type: ':recurring',
    },
  },
};

// Logos
export const logos: CardDef = {
  title: 'Logos',
  'static-abilities': [
    muPlusFn(1),
    runnerHandSizePlusFn(1),
  ],
  events: [{
    event: 'agenda-scored',
    'change-in-game-state': {
      silent: true,
      req: req(function*() { return !!(runnerFn(state)?.deck?.length); }),
    },
    optional: {
      prompt: 'Search for a card?',
      'waiting-prompt': true,
      'yes-ability': {
        prompt: 'Choose a card',
        msg: 'add 1 card from the stack to the grip',
        choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return runnerFn(state)?.deck || [];
        }),
        effect: effect(
          triggerEventFn(':searched-stack'),
          shuffleDeck(state, side, ':deck'),
          moveFn(target, ':hand')
        ),
      },
    },
  }],
};

// Lucky Charm
export const luckyCharm: CardDef = {
  title: 'Lucky Charm',
  prevention: [{
    prevents: 'end-run',
    type: 'ability',
    ability: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        return (runnerFn(state)?.reg?.successfulRun || []).some((s: any) => s === ':hq') &&
          ctx.remaining > 0 &&
          (getPreventFn(state)?.['end-run']?.sourcePlayer) === ':corp';
      }),
      cost: [toC(':remove-from-game')],
      async: true,
      msg: 'prevent the run from ending',
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        preventEndRunFn(state, side, eid);
      }),
    },
  }],
};

// Mâché
export const mache: CardDef = {
  title: 'Mâché',
  abilities: [{
    ...drawAbility(1, null, {
      cost: [toC('power', 3)],
      'keep-menu-open': ':while-3-power-tokens-left',
    }),
  }],
  events: [{
    event: 'runner-trash',
    'once-per-instance': true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const pred = ({ card: c, accessed }: any) => accessed && corpFn(c);
      return targets.some(pred) &&
        firstEventFn(state, side, 'runner-trash',
          (t: any[]) => t.some(pred));
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const pred = ({ card: c, accessed }: any) => accessed && corpFn(c);
      const target = targets.find(pred);
      const cost = trashCostFn(state, side, target?.card);
      if (cost) {
        systemMsg(state, side, `uses ${card.title} to place ${quantify(cost, 'power counter')} on itself`);
        addCounterFn(state, side, eid, card, 'power', cost);
      } else {
        effectCompletedFn(state, side, eid);
      }
    }),
  }],
};

// Madani
export const madani: CardDef = {
  title: 'Madani',
  'static-abilities': [],
  abilities: [
    {
      cost: [toC('click', 1)],
      label: 'Host any number of programs',
      prompt: 'Choose any number of program',
      action: true,
      choices: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return inHandFn(target) && programFn(target);
        }),
        max: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return (runnerFn(state)?.hand || []).filter((c: Card) => programFn(c)).length;
        }),
      },
      msg: (msgFn: any) => `host ${enumerateCards(targets, ':sorted')}`,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        for (const t of targets) {
          hostFn(state, side, card, t);
        }
      }),
    },
    {
      cost: [toC('credit', 0)],
      label: 'Install a hosted program',
      async: true,
      once: ':per-turn',
      prompt: 'Choose a hosted program to install',
      choices: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return programFn(target) &&
            runnerCanPayAndInstallFn(state, side, eid, target, { 'no-toast': true }) &&
            sameCard((hostFn(state, card)), target);
        }),
      },
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        runnerInstallFn(state, side, eid, target, { displayOrigin: true, installSource: card });
      }),
    },
  ],
};

// Maglectric Rapid (748 Mod)
export const maglectricRapid: CardDef = {
  title: 'Maglectric Rapid (748 Mod)',
  events: [{
    event: 'successful-run',
    prompt: 'Derez a card?',
    skippable: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      return targetServerFn(ctx) === ':hq' &&
        allActiveInstalledFn(state, ':corp').some((c: Card) =>
          rezzedFn(c) && !agendaFn(c));
    }),
    choices: { card: (c: Card) => installedFn(c) && corpFn(c) && rezzedFn(c) && !agendaFn(c) },
    cost: [toC(':trash-self', 1)],
    async: true,
    effect: effect(derezFn(state, side, eid, target)),
  }],
};

// Marrow
export const marrow: CardDef = {
  title: 'Marrow',
  'static-abilities': [
    muPlusFn(1),
    runnerHandSizePlusFn(3),
  ],
  'on-install': {
    async: true,
    effect: effect(coreDamage.damage(eid, ':brain', 1, { card: card })),
  },
  events: [{
    ...sabotageAbility(1),
    event: 'agenda-scored',
    interactive: req(function*() { return true; }),
  }],
};

// Masterwork (v37)
export const masterwork: CardDef = {
  title: 'Masterwork (v37)',
  'static-abilities': [muPlusFn(1)],
  events: [
    {
      event: 'run',
      interactive: req(function*() { return true; }),
      'change-in-game-state': {
        silent: true,
        req: req(function*() { return !!(runnerFn(state)?.hand?.length); }),
      },
      optional: {
        prompt: 'Pay 1 [Credit] to install a piece of hardware?',
        'yes-ability': {
          async: true,
          prompt: 'Choose a piece of hardware',
          req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            return allCardsInHandStarFn(state, ':runner').some((c: Card) =>
              hardwareFn(c) &&
              runnerCanPayAndInstallFn(state, side, { ...eid, source: card }, c, { 'cost-bonus': 1 }));
          }),
          choices: {
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              return inHandStarFn(state, target) &&
                hardwareFn(target) &&
                runnerCanPayAndInstallFn(state, side, { ...eid, source: card }, target, { 'cost-bonus': 1 });
            }),
          },
          effect: effect(runnerInstallFn({ ...eid, source: card, 'source-type': ':runner-install' }, target, {
            'cost-bonus': 1,
            'msg-keys': { displayOrigin: true, installSource: card },
          })),
        },
      },
    },
    drawAbility(1, null, {
      event: 'runner-install',
      interactive: req(function*() { return true; }),
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        return hardwareFn(ctx.card) &&
          firstEventFn(state, side, 'runner-install',
            (t: any[]) => hardwareFn((t[0] || {}).card));
      }),
    }),
  ],
};

// Māui
export const maui: CardDef = {
  title: 'Māui',
  'x-fn': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    const corp = corpFn(state);
    return (corp?.servers?.hq?.ices || []).length;
  }),
  'static-abilities': [muPlusFn(2)],
  recurring: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    const corp = corpFn(state);
    return (corp?.servers?.hq?.ices || []).length;
  }),
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (getRunFn(state)?.server || []).length === 1 &&
          getRunFn(state)?.server[0] === ':hq';
      }),
      type: ':recurring',
    },
  },
};

function getRunFn(state: State): any {
  return (state as any).run;
}

// Maw
export const maw: CardDef = {
  title: 'Maw',
  'static-abilities': [muPlusFn(2)],
  events: [{
    event: 'post-access-card',
    label: 'Trash a card from HQ',
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      return (getPreventFn(state)?.noTrashOrSteal) === 1 &&
        (corpFn(state)?.hand?.length ?? 0) > 0 &&
        !inDiscardFn(target) &&
        !inScoredFn(target);
    }),
    once: ':per-turn',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const corp = corpFn(state);
      const cardToTrash = corp?.hand?.[Math.floor(Math.random() * corp.hand.length)] || null;
      const ctx = forms.context(state, card, targets) || {};
      const cardSeen = cardToTrash && sameCard(ctx['accessed-card'], cardToTrash);
      const finalCard = cardSeen ? { ...cardToTrash, seen: true } : cardToTrash;
      continue_ability(state, side, {
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          trashFn(state, ':corp', eid, finalCard, { causeCard: card, cause: ':forced-to-trash' });
        }),
        async: true,
        msg: `force the Corp to trash a random card from HQ${cardSeen ? ' (' + finalCard.title + ')' : ''}`,
      }, card, null);
    }),
  }],
};

// Maya
export const maya: CardDef = {
  title: 'Maya',
  'static-abilities': [muPlusFn(2)],
  events: [{
    event: 'post-access-card',
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        return inDeckFn(ctx['accessed-card-snapshot']);
      }),
      once: ':per-turn',
      prompt: (msgFn: any) => `Move ${ctxFn?.()?.['accessed-card']?.title || 'the card'} to the bottom of R&D?`,
      'yes-ability': {
        msg: 'move the card just accessed to the bottom of R&D',
        async: true,
        effect: effect(
          moveFn(ctxFn?.()?.['accessed-card'], ':deck'),
          gainTagsFn(':runner', eid, 1)
        ),
      },
    },
  }],
};

function ctxFn(): any {
  return null;
}

// MemStrips
export const memStrips: CardDef = {
  title: 'MemStrips',
  'static-abilities': [virusMuPlusFn(3)],
};

// Methuselah
export const methuselah: CardDef = {
  title: 'Methuselah',
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return !!runFn(state);
      }),
      type: ':credit',
    },
  },
  events: [{
    event: 'run',
    'change-in-game-state': { req: req(function*() { return !!(runnerFn(state)?.hand?.length); }), silent: true },
    skippable: true,
    interactive: req(function*() { return true; }),
    prompt: 'Trash a hardware from the Grip?',
    choices: { card: (c: Card) => hardwareFn(c) && inHandFn(c) },
    async: true,
    'waiting-prompt': true,
    msg: (msgFn: any) => `trash ${target.title} and place 2 [Credits] on itself`,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        trashFn(state, side, target, { unpreventable: true })], []);
      addCounterFn(state, side, eid, card, 'credit', 2);
    }),
  }],
  'static-abilities': [muPlusFn(1)],
};

// Mind's Eye
export const mindsEye: CardDef = {
  title: "Mind's Eye",
  implementation: 'Power counters added automatically',
  'static-abilities': [muPlusFn(1)],
  events: [{
    event: 'successful-run',
    silent: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return targetServerFn(forms.context(state, card, targets)) === ':rd';
    }),
    async: true,
    effect: effect(addCounterFn(eid, card, 'power', 1)),
  }],
  abilities: [{
    action: true,
    async: true,
    cost: [toC('click', 1), toC('power', 3)],
    msg: 'breach R&D',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      accessBonusFn(state, side, ':rd', 1);
    }),
  }],
};

// Mirror
export const mirror: CardDef = {
  title: 'Mirror',
  'static-abilities': [muPlusFn(2)],
  events: [{
    event: 'successful-run',
    skippable: true,
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return targetServerFn(forms.context(state, card, targets)) === ':rd';
    }),
    effect: effect(continue_ability({
      prompt: 'Choose a card and replace 1 spent [Recurring Credits] on it',
      choices: { card: (c: Card) => getCounters(c, 'recurring') < ((cardDefFn(c) || {})?.recurring ?? 0) },
      msg: (msgFn: any) => `replace 1 spent [Recurring Credits] on ${target.title}`,
      async: true,
      effect: effect(addCounterFn(eid, target, 'recurring', 1)),
    }, card, null)),
  }],
};

// Monolith
export const monolith: CardDef = {
  title: 'Monolith',
  'static-abilities': [muPlusFn(3)],
  'on-install': {
    async: true,
    effect: effect(continue_ability(mHelper(1), card, null)),
  },
  prevention: [{
    prevents: 'damage',
    type: 'ability',
    ability: {
      async: true,
      cost: [toC(':trash-program-from-hand', 1)],
      msg: (msgFn: any) => `prevent 1 ${damageNameFn(state)} damage`,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        return (ctx.type !== 'meat' && ctx.type !== ':meat') && preventableFn(ctx);
      }),
    },
  }],
};

function mHelperFn(n: number): any {
  return {
    prompt: 'Choose a program to install',
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return programFn(target) &&
          inHandStarFn(state, target) &&
          runnerCanPayAndInstallFn(state, side, { ...eid, source: card }, target, { 'cost-bonus': -4 });
      }),
    },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        runnerInstallFn(state, side, target, {
          'cost-bonus': -4,
          'msg-keys': { installSource: card, displayOrigin: true },
        })], []);
      if (n < 3) {
        continue_ability(state, side, mHelperFn(n + 1), card, null);
      }
    }),
  };
}

// Mu Safecracker
export const muSafecracker: CardDef = {
  title: 'Mu Safecracker',
  implementation: 'Stealth credit restriction not enforced',
  events: [
    {
      event: 'successful-run',
      skippable: true,
      optional: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const ctx = forms.context(state, card, targets) || {};
          return targetServerFn(ctx) === ':hq' &&
            allActiveFn(state, ':runner').some((c: Card) => hasSubtypeFn(c, 'Stealth'));
        }),
        prompt: 'Pay 1 [Credits] to access 1 additional card?',
        'yes-ability': {
          cost: [toC('credit', 1, { stealth: 1 })],
          msg: 'access 1 additional card from HQ',
          effect: effect(registerEventsFn(card, [breachAccessBonus(':hq', 1, { duration: ':end-of-run' })])),
        },
      },
    },
    {
      event: 'successful-run',
      skippable: true,
      optional: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const ctx = forms.context(state, card, targets) || {};
          return targetServerFn(ctx) === ':rd' &&
            allActiveFn(state, ':runner').some((c: Card) => hasSubtypeFn(c, 'Stealth'));
        }),
        prompt: 'Pay 2 [Credits] to access 1 additional card?',
        'yes-ability': {
          cost: [toC('credit', 2, { stealth: ':all-stealth' })],
          msg: 'access 1 additional card from R&D',
          effect: effect(registerEventsFn(card, [breachAccessBonus(':rd', 1, { duration: ':end-of-run' })])),
        },
      },
    },
  ],
};

// Muresh Bodysuit
export const mureshBodysuit: CardDef = {
  title: 'Muresh Bodysuit',
  prevention: [{
    prevents: 'damage',
    type: 'event',
    'max-uses': 1,
    mandatory: true,
    ability: {
      async: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        return (ctx.type === 'meat' || ctx.type === ':meat') &&
          firstEventFn(state, side, 'pre-damage-flag',
            (t: any[]) => (t[0] || {})?.type === 'meat') &&
          preventableFn(ctx);
      }),
      msg: 'reduce the pending meat damage by 1',
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        preventDamageFn(state, side, eid, 1);
      }),
    },
  }],
};

// Net-Ready Eyes
export const netReadyEyes: CardDef = {
  title: 'Net-Ready Eyes',
  'on-install': {
    async: true,
    msg: 'suffer 2 meat damage',
    effect: effect(coreDamage.damage(eid, ':meat', 2, { unboostable: true, card: card })),
  },
  events: [{
    event: 'run',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return allActiveInstalledFn(state, ':runner').some((c: Card) =>
        programFn(c) && hasSubtypeFn(c, 'Icebreaker'));
    }),
    choices: { card: (c: Card) => installedFn(c) && hasSubtypeFn(c, 'Icebreaker') },
    msg: (msgFn: any) => `give ${target.title} +1 strength`,
    effect: effect(pumpFn(target, 1, ':end-of-run')),
  }],
};

// NetChip
export const netChip: CardDef = {
  title: 'NetChip',
  let: {
    netChipCount: (state: State) =>
      allActiveInstalledFn(state, ':runner')
        .filter((c: Card) => c.title === 'NetChip').length,
  },
  'enforce-conditions': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const hosted = getHosted(state, card);
      const firstProgram = hosted.find((c: Card) => programFn(c));
      if (!firstProgram) return false;
      return expectedMuFn(state, firstProgram) > getHostedFn(state, card).length;
    }),
    silent: true,
    msg: (msgFn: any) => `trash ${cardStr(state, getHostedFn(state, card).find((c: Card) => programFn(c)))} for violating hosting restrictions`,
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const hosted = getHostedFn(state, card);
      const firstProgram = hosted.find((c: Card) => programFn(c));
      if (firstProgram) {
        systemMsg(state, null, `${cardStr(state, firstProgram)} is trashed for violating hosting restrictions`);
        trashCardsFn(state, side, eid, [firstProgram], { unpreventable: true, 'game-trash': true });
      }
    }),
  },
  'static-abilities': [{
    type: ':can-host',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ncCount = allActiveInstalledFn(state, ':runner')
        .filter((c: Card) => c.title === 'NetChip').length;
      return programFn(target) && expectedMuFn(state, target) <= ncCount;
    }),
    'max-mu': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return allActiveInstalledFn(state, ':runner')
        .filter((c: Card) => c.title === 'NetChip').length;
    }),
    'max-cards': 1,
    'no-mu': true,
  }],
};

function getHostedFn(state: State, card: Card): Card[] {
  const c = getCardFn(state, card);
  return c?.hosted || [];
}

// Obelus
export const obelus: CardDef = {
  title: 'Obelus',
  'static-abilities': [
    muPlusFn(1),
    runnerHandSizePlusFn(req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return countTagsFn(state);
    })),
  ],
  events: [{
    event: 'run-ends',
    interactive: req(function*() { return true; }),
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      return !!(ctx.successful &&
        ([':rd', ':hq', 'rd', 'hq'].includes(ctx.target) ||
         (ctx.target?.includes && (ctx.target.includes('rd') || ctx.target.includes('hq')))) &&
        firstEventFn(state, side, 'run-ends',
          (t: any[]) => {
            const first = t[0];
            return first?.successful &&
              (first.target === ':rd' || first.target === ':hq' ||
               (first.target?.includes && (first.target.includes('rd') || first.target.includes('hq'))));
          }));
    }),
    msg: (msgFn: any) => `draw ${quantify(totalCardsAccessedFn(forms.context(state, card, targets)) ?? 0, 'card')}`,
    async: true,
    effect: effect(drawFn(eid, totalCardsAccessedFn(forms.context(state, card, targets)) ?? 0)),
  }],
};

// Omni-drive
export const omniDrive: CardDef = {
  title: 'Omni-drive',
  recurring: 1,
  'enforce-conditions': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const hosted = getHostedFn(state, card);
      const firstProgram = hosted.find((c: Card) => programFn(c));
      return firstProgram && expectedMuFn(state, firstProgram) > 1;
    }),
    silent: true,
    msg: (msgFn: any) => `trash ${cardStr(state, getHostedFn(state, card).find((c: Card) => programFn(c)))} for violating hosting restrictions`,
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const hosted = getHostedFn(state, card);
      const firstProgram = hosted.find((c: Card) => programFn(c));
      if (firstProgram) {
        systemMsg(state, null, `${cardStr(state, firstProgram)} is trashed for violating hosting restrictions`);
        trashCardsFn(state, side, eid, [firstProgram], { unpreventable: true, 'game-trash': true });
      }
    }),
  },
  'static-abilities': [{
    type: ':can-host',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return programFn(target) && expectedMuFn(state, target) <= 1;
    }),
    'max-mu': 1,
    'max-cards': 1,
    'no-mu': true,
  }],
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const host = forms.host?.(state, card);
        return eid['source-type'] === ':ability' &&
          programFn(target) && host && sameCard(card, host);
      }),
      type: ':recurring',
    },
  },
};

// PAN-Weave
export const panWeave: CardDef = {
  title: 'PAN-Weave',
  'on-install': {
    async: true,
    msg: 'suffer 1 meat damage',
    effect: effect(coreDamage.damage(eid, ':meat', 1, { unboostable: true, card: card })),
  },
  events: [{
    event: 'successful-run',
    automatic: ':drain-credits',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      return (ctx.server?.[0] === ':hq' || ctx.server?.[0] === 'hq') &&
        firstEventFn(state, side, 'successful-run',
          (t: any[]) => {
            const first = t[0];
            return first?.server?.[0] === ':hq' || first?.server?.[0] === 'hq';
          });
    }),
    msg: 'force the Corp to lose 1 [Credits]',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const corp = corpFn(state);
      if ((corp?.credit ?? 0) > 0) {
        yield wait_for(state, [{ asyncResult: 'result' }, loseCreditsFn(state, ':corp', 1)], []);
        systemMsg(state, side, `uses ${card.title} to gain 1 [Credits]`);
        gainCreditsFn(state, ':runner', eid, 1);
      } else {
        effectCompletedFn(state, side, eid);
      }
    }),
  }],
};

// Pantograph
export const pantograph: CardDef = {
  title: 'Pantograph',
  let: {
    installAbility: {
      async: true,
      prompt: 'Choose a card to install',
      'waiting-prompt': true,
      'change-in-game-state': { req: req(function*() { return !!(allCardsInHandStarFn(state, ':runner')?.length); }), silent: true },
      choices: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return runnerFn(target) && inHandStarFn(state, target) && !eventFn(target) &&
            runnerCanPayAndInstallFn(state, side, eid, target, { 'no-toast': true });
        }),
      },
      effect: effect(runnerInstallFn({ ...eid, source: card, 'source-type': ':runner-install' }, target,
        { 'msg-keys': { installSource: card, displayOrigin: true } })),
    },
    gainCreditAbility: {
      interactive: req(function*() { return true; }),
      async: true,
      msg: 'gain 1 [Credits]',
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' }, gainCreditsFn(state, ':runner', 1)], []);
        continue_ability(state, side, forms.let?.installAbility, card, null);
      }),
    },
  },
  'static-abilities': [muPlusFn(1)],
  events: [
    { event: 'agenda-scored', ...(forms.let?.gainCreditAbility || {}) },
    { event: 'agenda-stolen', ...(forms.let?.gainCreditAbility || {}) },
  ],
};

// Paragon
export const paragon: CardDef = {
  title: 'Paragon',
  'static-abilities': [muPlusFn(1)],
  events: [{
    event: 'successful-run',
    automatic: ':pre-draw',
    interactive: getAutoresolveFn('auto-fire', (complementFn(neverFn) as any)),
    silent: getAutoresolveFn('auto-fire', neverFn),
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return firstEventFn(state, side, 'successful-run');
      }),
      autoresolve: getAutoresolveFn('auto-fire'),
      'waiting-prompt': true,
      prompt: 'Gain 1 [Credit] and look at the top card of the stack?',
      'yes-ability': {
        msg: 'gain 1 [Credit] and look at the top card of the stack',
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          yield wait_for(state, [{ asyncResult: 'result' }, gainCreditsFn(state, ':runner', 1)], []);
          continue_ability(state, ':runner', {
            optional: {
              prompt: (msgFn: any) => `Add ${(runnerFn(state)?.deck?.[0])?.title || 'the top card'} to bottom of the stack?`,
              'yes-ability': {
                msg: 'add the top card of the stack to the bottom',
                effect: effect(moveFn(':runner', (runnerFn(state)?.deck?.[0]), ':deck')),
              },
              'no-ability': { effect: effect(systemMsg('does not add the top card of the the stack to the bottom')) },
            },
          }, card, null);
        }),
      },
      'no-ability': { effect: effect(systemMsg(`declines to use ${card.title}`)) },
    },
  }],
  abilities: [{ ...setAutoresolveFn('auto-fire', 'Paragon') }],
};

function complementFn(fn: any): any {
  return (...args: any[]) => !fn(...args);
}

// Patchwork
export const patchwork: CardDef = {
  title: 'Patchwork',
  let: {
    installWord: (c: Card) => eventFn(c) ? 'play' : 'install',
    patchworkAbility: { once: ':per-turn',
      effect: effect(coreUpdate.updateIn(card, ['special', 'patchwork'], () => true)) },
    patchworkManualPrognosis: {
      cost: [toC('click', 1)],
      action: true,
      once: ':per-turn',
      label: 'Manually resolve patchwork',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return !!(runnerFn(state)?.hand?.length &&
          canTriggerFn(state, side, eid, forms.let?.patchworkAbility, card, targets));
      }),
      prompt: 'Designate a card to play or install',
      choices: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return runnerFn(target) && inHandStarFn(state, target);
        }),
      },
      'waiting-prompt': true,
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const toPlay = target;
        continue_ability(state, side, {
          prompt: 'Designate a card to trash',
          choices: { card: (c: Card) => runnerFn(c) && inHandFn(c), all: true },
          async: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            registerOnceFn(state, side, forms.let?.patchworkAbility, card);
            const toTrash = target;
            continue_ability(state, side,
              sameCard(toTrash, toPlay)
                ? { msg: `trash ${toTrash.title} from the Grip, and is no longer able to ${forms.let?.installWord?.(toPlay)} it`,
                    async: true,
                    effect: effect(trashFn(state, side, eid, toTrash, { causeCard: card })) }
                : { msg: `trash ${toTrash.title} to ${forms.let?.installWord?.(toPlay)} ${toPlay.title} from the Grip, paying 2 [Credits] less`,
                    async: true,
                    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                      yield wait_for(state, [{ asyncResult: 'result' },
                        trashFn(state, side, eid, toTrash, { causeCard: card })], []);
                      if (eventFn(toPlay)) {
                        playInstantFn(state, ':runner', eid, toPlay, { 'cost-bonus': -2 });
                      } else {
                        runnerInstallFn(state, ':runner', eid, toPlay, { 'cost-bonus': -2 });
                      }
                    }),
                  },
              card, null);
          }),
        }, card, null);
      }),
    },
  },
  'static-abilities': [muPlusFn(1)],
  abilities: [forms.let?.patchworkManualPrognosis],
  implementation: 'click on patchwork to manually resolve it (for tricks)',
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const srcType = eid['source-type'];
        return (srcType === ':play' || srcType === 'play' || srcType === ':runner-install' || srcType === 'runner-install') &&
          !!(runnerFn(state)?.hand?.length - 1 >= 0) && // at least one card other than target
          !card?.special?.patchwork &&
          canTriggerFn(state, side, eid, forms.let?.patchworkAbility, card, targets);
      }),
      'custom-amount': 2,
      'custom': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const costType = (eid['source-type'] === ':play' ? 'play' : eid['source-type'] === ':runner-install' ? 'install' : '');
        const targetCard = target;
        continue_ability(state, side, {
          prompt: `Trash a card to lower the ${costType} cost of ${targetCard.title} by 2 [Credits]`,
          async: true,
          choices: { card: (c: Card) => inHandFn(c) && runnerFn(c) && !sameCard(c, targetCard) },
          msg: (msgFn: any) => `trash ${target?.title || ''} to lower the ${costType} cost of ${targetCard?.title || ''} by 2 [Credits]`,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            yield wait_for(state, [{ asyncResult: 'result' },
              trashFn(state, side, eid, target, { unpreventable: true, causeCard: card })], []);
            registerOnceFn(state, side, forms.let?.patchworkAbility, card);
            effectCompletedFn(state, side, makeResultFn(eid, 2));
          }),
          cancel: {
            async: true,
            effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              effectCompletedFn(state, side, makeResultFn(eid, 0));
            }),
          },
        }, card, null);
      }),
      type: ':custom',
      'cost-reduction': true,
    },
  },
};

// Pennyshaver
export const pennyshaver: CardDef = {
  title: 'Pennyshaver',
  'static-abilities': [muPlusFn(1)],
  events: [{
    event: 'successful-run',
    silent: true,
    async: true,
    msg: 'place 1 [Credits]',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      addCounterFn(state, ':runner', eid, card, 'credit', 1);
    }),
  }],
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    label: 'Gain 1 [Credits]. Take all hosted credits',
    async: true,
    msg: (msgFn: any) => `gain ${1 + (getCounters(card, 'credit') ?? 0)} [Credits]`,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const credits = 1 + (getCounters(card, 'credit') ?? 0);
      playTieredSfx(state, side, 'click-credit', credits, 3);
      yield wait_for(state, [{ asyncResult: 'result' },
        addCounterFn(state, side, card, 'credit', (credits - 1) * -1)], []);
      gainCreditsFn(state, ':runner', eid, credits);
    }),
  }],
};

// Plascrete Carapace
export const plascreteCarapace: CardDef = {
  title: 'Plascrete Carapace',
  data: { counter: { power: 4 } },
  prevention: [{
    prevents: 'damage',
    type: 'ability',
    ability: {
      async: true,
      cost: [toC('power', 1)],
      msg: 'prevent 1 meat damage',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        return preventableFn(ctx) && (ctx.type === 'meat' || ctx.type === ':meat');
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        preventDamageFn(state, side, eid, 1);
      }),
    },
  }],
  events: [trashOnEmptyFn('power')],
};

// Poison Vial
export const poisonVial: CardDef = {
  title: 'Poison Vial',
  ...autoIcebreakerFn({
    data: { counter: { power: 3 } },
    events: [trashOnEmptyFn('power')],
    abilities: [breakSubFn(toC('power', 1), 2, 'All', {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return anySubsBrokenFn(forms.currentIce?.(state));
      }),
    })],
  }),
};

// Polyhistor
export const polyhistor: CardDef = {
  title: 'Polyhistor',
  let: {
    abi: {
      optional: {
        prompt: 'Draw 1 card to force the Corp to draw 1 card?',
        'waiting-prompt': true,
        'yes-ability': {
          msg: 'draw 1 card and force the Corp to draw 1 card',
          async: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            yield wait_for(state, [{ asyncResult: 'result' }, drawFn(state, ':runner', 1)], []);
            drawFn(state, ':corp', eid, 1);
          }),
        },
        'no-ability': { effect: effect(systemMsg(`declines to use ${card.title}`)) },
      },
    },
  },
  'static-abilities': [
    muPlusFn(1),
    linkPlusFn(1),
  ],
  events: [
    {
      event: 'pass-ice',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const run = forms.run(state);
        return (run?.server || []).join('') === 'hq' &&
          (run?.position ?? 0) === 0 &&
          (runnerFn(state)?.deck?.length ?? 0) > 0;
      }),
      async: true,
      once: ':per-turn',
      effect: effect(continue_ability(state, ':runner', forms.let?.abi, card, null)),
    },
    {
      event: 'run',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const run = targetFn(state, card, targets);
        return (run?.server || []).join('') === 'hq' &&
          (run?.position ?? 0) === 0 &&
          (runnerFn(state)?.deck?.length ?? 0) > 0;
      }),
      async: true,
      once: ':per-turn',
      effect: effect(continue_ability(state, ':runner', forms.let?.abi, card, null)),
    },
  ],
};

// Prepaid VoicePAD
export const prepaidVoicePad: CardDef = {
  title: 'Prepaid VoicePAD',
  recurring: 1,
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const t = target;
        return eventFn(t) &&
          ((eid['cost-paid']?.length ?? 0) === 0 || eid['x-cost']) &&
          eid['source-type'] === ':play';
      }),
      type: ':recurring',
    },
  },
};

// Prognostic Q-Loop
export const prognosticQLoop: CardDef = {
  title: 'Prognostic Q-Loop',
  events: [{
    event: 'run',
    interactive: getAutoresolveFn('auto-fire', (complementFn(neverFn) as any)),
    silent: getAutoresolveFn('auto-fire', neverFn),
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return firstEventFn(state, side, 'run');
      }),
      'change-in-game-state': { silent: true, req: req(function*() { return !!(runnerFn(state)?.deck?.length); }) },
      autoresolve: getAutoresolveFn('auto-fire'),
      prompt: 'Look at top 2 cards of the stack?',
      'yes-ability': lookAtTheTop(':runner', ':runner', 2),
    },
  }],
  abilities: [
    { ...setAutoresolveFn('auto-fire', 'Prognostic Q-Loop') },
    {
      label: 'Reveal and install top card of the stack',
      once: ':per-turn',
      cost: [toC('credit', 1)],
      'change-in-game-state': { req: req(function*() { return (runnerFn(state)?.deck?.length ?? 0) > 0; }) },
      msg: (msgFn: any) => `reveal ${(runnerFn(state)?.deck?.[0])?.title || ''} from the top of the stack`,
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' },
          revealFn(state, side, (runnerFn(state)?.deck?.[0]) || null)], []);
        continue_ability(state, side, {
          optional: {
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              const topCard = (runnerFn(state)?.deck?.[0]) || null;
              return (topCard && (programFn(topCard) || hardwareFn(topCard)) &&
                runnerCanPayAndInstallFn(state, side, { ...eid, 'source-type': ':runner-install' }, topCard));
            }),
            prompt: (msgFn: any) => `Install ${(runnerFn(state)?.deck?.[0])?.title || 'the top card'}?`,
            'yes-ability': {
              async: true,
              effect: effect(runnerInstallFn({ ...eid, 'source-type': ':runner-install' },
                (runnerFn(state)?.deck?.[0]), {
                  'msg-keys': { displayOrigin: true, originIndex: 0, installSource: card },
                })),
            },
          },
        }, card, null);
      }),
    },
  ],
};

// Public Terminal
export const publicTerminal: CardDef = {
  title: 'Public Terminal',
  recurring: 1,
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const t = target;
        return eid['source-type'] === ':play' && hasSubtypeFn(t, 'Run');
      }),
      type: ':recurring',
    },
  },
};

// Q-Coherence Chip
export const qCoherenceChip: CardDef = {
  title: 'Q-Coherence Chip',
  'static-abilities': [muPlusFn(1)],
  events: [
    {
      event: 'runner-trash',
      async: true,
      interactive: req(function*() { return true; }),
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        return installedFn(ctx.card) && programFn(ctx.card);
      }),
      msg: 'trash itself',
      effect: effect(trashFn(eid, card, { causeCard: card })),
    },
    {
      event: 'corp-trash',
      async: true,
      interactive: req(function*() { return true; }),
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        return installedFn(ctx.card) && programFn(ctx.card);
      }),
      msg: 'trash itself',
      effect: effect(trashFn(eid, card, { causeCard: card })),
    },
  ],
};

// Qianju PT
export const qianjuPT: CardDef = {
  title: 'Qianju PT',
  flags: { 'runner-phase-12': req(function*() { return true; }) },
  abilities: [{
    label: 'Lose [Click], avoid 1 tag (start of turn)',
    once: ':per-turn',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return !!(state as any)['runner-phase-12'];
    }),
    cost: [toC(':lose-click', 1)],
    msg: 'avoid the first tag received until [their] next turn',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const currentTurn = (state as any).turn;
      const lingering = registerLingeringEffectFn(state, side, card, {
        type: ':forced-to-avoid-tag',
        duration: ':until-next-runner-turn-begins',
        value: true,
      });
      registerEventsFn(state, side, card, [{
        event: 'tag-interrupt',
        'unregister-once-resolved': true,
        duration: ':until-next-runner-turn-begins',
        async: true,
        msg: 'avoid 1 tag',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          unregisterEffectByUuidFn(state, side, lingering);
          preventTagFn(state, ':runner', eid, 1);
        }),
      }]);
    }),
  }],
};

// R&D Interface
export const rndInterface: CardDef = {
  title: 'R&D Interface',
  events: [breachAccessBonus(':rd', 1)],
};

// Rabbit Hole
export const rabbitHole: CardDef = {
  title: 'Rabbit Hole',
  'static-abilities': [linkPlusFn(1)],
  'on-install': {
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const deck = runnerFn(state)?.deck || [];
        return deck.some((c: Card) => c.title === card.title);
      }),
      prompt: (msgFn: any) => `Install another copy of ${card.title}?`,
      'yes-ability': {
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          triggerEventFn(state, side, ':searched-stack');
          shuffleDeck(state, ':runner', ':deck');
          const deck = runnerFn(state)?.deck || [];
          const c = deck.find((x: Card) => x.title === card.title);
          if (c) {
            runnerInstallFn(state, side, eid, c, {
              'msg-keys': { installSource: card, displayOrigin: true },
            });
          } else {
            effectCompletedFn(state, side, eid);
          }
        }),
      },
    },
  },
};

// Ramujan-reliant 550 BMI
export const ramujanReliant: CardDef = {
  title: 'Ramujan-reliant 550 BMI',
  let: {
    maxTrash: (state: State) => 1 + allActiveInstalledFn(state, ':runner')
      .filter((c: Card) => c.title === 'Ramujan-reliant 550 BMI').length,
  },
  prevention: [{
    prevents: 'damage',
    type: 'ability',
    ability: {
      async: true,
      cost: [toC(':trash-can')],
      msg: (msgFn: any) => `prevent up to ${getCardFn(state, card) ? 1 + allActiveInstalledFn(state, ':runner').filter((c: Card) => c.title === 'Ramujan-reliant 550 BMI').length : 1} damage`,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return true; // preventUpToNDamage check
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const maxTrash = 1 + allActiveInstalledFn(state, ':runner')
          .filter((c: Card) => c.title === 'Ramujan-reliant 550 BMI').length;
        yield wait_for(state, [{ asyncResult: 'result' },
          resolveAbilityFn(state, side, preventUpToNDamageFn(maxTrash, [':net', ':core', ':brain']), card, targets)], []);
        const prevented = (state as any).prevent?.damage?.prevented ?? 0;
        systemMsg(state, side, `uses ${card.title} to trash the top ${prevented} cards of the stack`);
        millFn(state, ':runner', eid, card, prevented);
      }),
    },
  }],
};

// Recon Drone
export const reconDrone: CardDef = {
  title: 'Recon Drone',
  prevention: [{
    prevents: 'damage',
    type: 'ability',
    ability: {
      async: true,
      'fake-cost': [toC(':trash-can')],
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return preventableFn(forms.context(state, card, targets)) &&
          sameCard((forms.context(state, card, targets) as any)?.sourceCard, (state as any).access);
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        continue_ability(state, side, {
          cost: [toC(':trash-can'), toC(':x-credits', 0, { maximum: (forms.context(state, card, targets) as any)?.remaining ?? 0 })],
          msg: (msgFn: any) => `prevent ${costValueFn(eid, ':x-credits')} ${damageTypeFn(state)} damage`,
          async: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            preventDamageFn(state, side, eid, costValueFn(eid, ':x-credits'));
          }),
        }, card, null);
      }),
    },
  }],
};

function costValueFn(eid: EID, type: string): number {
  return corePayment.costValue?.(eid, type) ?? 0;
}

// Record Reconstructor
export const recordReconstructor: CardDef = {
  title: 'Record Reconstructor',
  events: [successfulRunReplaceBreach({
    targetServer: ':archives',
    ability: {
      prompt: 'Choose one faceup card to add to the top of R&D',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const corp = corpFn(state);
        const faceupCards = (corp?.discard || []).filter((c: Card) => faceupFn(c));
        return !!(faceupCards?.length);
      }),
      choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const corp = corpFn(state);
        return (corp?.discard || []).filter((c: Card) => faceupFn(c));
      }),
      msg: (msgFn: any) => `add ${target.title} to the top of R&D`,
      effect: effect(moveFn(':corp', target, ':deck', { front: true })),
    },
  })],
};

// Reflection
export const reflection: CardDef = {
  title: 'Reflection',
  'static-abilities': [
    muPlusFn(1),
    linkPlusFn(1),
  ],
  events: [{
    event: 'jack-out',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const corp = corpFn(state);
      const hand = corp?.hand || [];
      const targetCard = hand.length > 0 ? hand[Math.floor(Math.random() * hand.length)] : null;
      if (targetCard) {
        systemMsg(state, ':runner', `force the Corp to reveal ${targetCard.title} from HQ`);
        revealFn(state, ':corp', eid, targetCard);
      }
    }),
  }],
};

// Replicator
export const replicator: CardDef = {
  title: 'Replicator',
  events: [{
    event: 'runner-install',
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      return ctx.card && hardwareFn(ctx.card) &&
        (runnerFn(state)?.deck || []).some((c: Card) => c.title === ctx.card.title);
    }),
    silent: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      return !(ctx.card && hardwareFn(ctx.card) &&
        (runnerFn(state)?.deck || []).some((c: Card) => c.title === ctx.card.title));
    }),
    optional: {
      prompt: (msgFn: any) => `Search the stack for another copy of ${(forms.context(state, card, targets) as any)?.card?.title || 'this card'} and add it to the grip?`,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        return ctx.card && hardwareFn(ctx.card) &&
          (runnerFn(state)?.deck || []).some((c: Card) => c.title === ctx.card.title);
      }),
      'yes-ability': {
        msg: (msgFn: any) => `add a copy of ${(forms.context(state, card, targets) as any)?.card?.title || 'this card'} from the stack to the grip`,
        effect: effect(
          triggerEventFn(':searched-stack'),
          shuffleDeck(':deck'),
          moveFn(
            (runnerFn(state)?.deck || []).find((c: Card) => c.title === ((forms.context(state, card, targets) as any)?.card)?.title),
            ':hand'
          )
        ),
      },
    },
  }],
};

// Respirocytes
export const respirocytes: CardDef = {
  title: 'Respirocytes',
  implementation: 'Only watches trashes, playing events, and installing. Doesnt know about your hand size pre-install.',
  let: {
    ability: {
      once: ':per-turn',
      msg: 'draw 1 card and place a power counter',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' }, drawFn(state, ':runner', 1)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          addCounterFn(state, side, getCardFn(state, card), 'power', 1)], []);
        if (getCounters(getCardFn(state, card), 'power') >= 3) {
          systemMsg(state, ':runner', `trashes ${card.title} as it reached 3 power counters`);
          trashFn(state, side, eid, card, { unpreventable: true, causeCard: card });
        } else {
          effectCompletedFn(state, side, eid);
        }
      }),
    },
    event: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (runnerFn(state)?.hand?.length ?? 0) === 0;
      }),
      async: true,
      effect: effect(continue_ability(forms.let?.ability, card, targets)),
    },
  },
  'on-install': {
    async: true,
    msg: 'suffer 1 meat damage',
    effect: effect(coreDamage.damage(eid, ':meat', 1, { unboostable: true, card: card })),
  },
  events: [
    { event: 'play-event', ...(forms.let?.event || {}) },
    { event: 'runner-hand-changed?', ...(forms.let?.event || {}) },
    {
      event: 'runner-trash',
      'once-per-instance': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return targets.some((t: any) => runnerFn(t.card) && inHandFn(t.card)) &&
          (runnerFn(state)?.hand?.length ?? 0) === 0;
      }),
      ...forms.let?.event,
    },
    {
      event: 'corp-trash',
      'once-per-instance': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return targets.some((t: any) => runnerFn(t.card) && inHandFn(t.card)) &&
          (runnerFn(state)?.hand?.length ?? 0) === 0;
      }),
      ...forms.let?.event,
    },
    {
      event: 'runner-install',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        const prevZone = ctx['previous-zone'] || [];
        return prevZone.includes('hand') && (runnerFn(state)?.hand?.length ?? 0) === 0;
      }),
      ...forms.let?.event,
    },
    {
      event: 'runner-turn-begins',
      automatic: ':draw-cards',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (runnerFn(state)?.hand?.length ?? 0) === 0;
      }),
      async: true,
      effect: effect(continue_ability(forms.let?.ability, card, null)),
    },
    {
      event: 'corp-turn-begins',
      automatic: ':draw-cards',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (runnerFn(state)?.hand?.length ?? 0) === 0;
      }),
      async: true,
      effect: effect(continue_ability(forms.let?.ability, card, null)),
    },
  ],
  abilities: [forms.let?.ability],
};

// Rotary
export const rotary: CardDef = {
  title: 'Rotary',
  'static-abilities': [muPlusFn(1)],
  events: [{
    event: 'breach-server',
    automatic: ':pre-breach',
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        return ([':hq', ':rd', 'hq', 'rd'].includes(ctx.server));
      }),
      prompt: 'Tag 1 tag to see an additional card?',
      'yes-ability': {
        cost: [toC(':gain-tag', 1)],
        msg: (msgFn: any) => `access 1 additional card from ${zoneNameFn(targetServerFn(forms.context(state, card, targets)))}`,
        effect: effect(accessBonusFn(targetServerFn(forms.context(state, card, targets)), 1)),
      },
    },
  }],
  'corp-abilities': [{
    action: true,
    label: 'Trash Rotary',
    async: true,
    cost: [toC('click', 1), toC('credit', 2)],
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return isTaggedFn(state) && side === ':corp';
    }),
    effect: effect(
      systemMsg(':corp', 'spends [Click] and 2 [Credits] to trash Rotary'),
      trashFn(':corp', eid, card, { causeCard: card })
    ),
  }],
};

// Rubicon Switch
export const rubiconSwitch: CardDef = {
  title: 'Rubicon Switch',
  abilities: [{
    action: true,
    cost: [toC('click', 1), toC(':x-credits')],
    label: 'Derez a piece of ice rezzed this turn',
    once: ':per-turn',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const paymentEid = eid;
      const spentCredits = costValueFn(eid, ':x-credits');
      continue_ability(state, side, {
        choices: {
          req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            return iceFn(target) &&
              (target as any)?.rezzed === ':this-turn' &&
              rezCostFn(state, ':corp', target) <= spentCredits;
          }),
        },
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          derezFn(state, side, eid, target, { 'msg-keys': { 'include-cost-from-eid': paymentEid } });
        }),
      }, card, null);
    }),
  }],
};

// Security Chip
export const securityChip: CardDef = {
  title: 'Security Chip',
  abilities: [
    {
      label: 'Add [Link] strength to a non-Cloud icebreaker until the end of the run',
      msg: (msgFn: any) => `add ${getLinkFn(state)} strength to ${target.title} until the end of the run`,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return !!runFn(state);
      }),
      prompt: 'Choose one non-Cloud icebreaker',
      choices: { card: (c: Card) => hasSubtypeFn(c, 'Icebreaker') && !hasSubtypeFn(c, 'Cloud') && installedFn(c) },
      cost: [toC(':trash-can')],
      effect: effect(pumpFn(target, getLinkFn(state), ':end-of-run')),
    },
    {
      label: 'Add [Link] strength to any Cloud icebreakers until the end of the run',
      msg: (msgFn: any) => `add ${getLinkFn(state)} strength to ${targets.length} Cloud icebreakers until the end of the run`,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return !!runFn(state);
      }),
      prompt: 'Choose any number of Cloud icebreakers',
      choices: { max: 50, card: (c: Card) => hasSubtypeFn(c, 'Icebreaker') && hasSubtypeFn(c, 'Cloud') && installedFn(c) },
      cost: [toC(':trash-can')],
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        for (const t of targets) {
          pumpFn(state, side, t, getLinkFn(state), ':end-of-run');
          updateBreakerStrengthFn(state, side, t);
        }
      }),
    },
  ],
};

// Security Nexus
export const securityNexus: CardDef = {
  title: 'Security Nexus',
  'static-abilities': [
    muPlusFn(1),
    linkPlusFn(1),
  ],
  events: [{
    event: 'encounter-ice',
    skippable: true,
    interactive: req(function*() { return true; }),
    optional: {
      prompt: 'Trace 5 to bypass current ice?',
      once: ':per-turn',
      'yes-ability': {
        msg: 'force the Corp to initiate a trace',
        trace: {
          base: 5,
          successful: {
            msg: 'give the Runner 1 tag and end the run',
            async: true,
            effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              yield wait_for(state, [{ asyncResult: 'result' }, gainTagsFn(state, ':runner', 1)], []);
              endRunFn(state, side, eid, card);
            }),
          },
          unsuccessful: {
            msg: (msgFn: any) => `bypass ${cardStr(state, forms.currentIce?.(state))}`,
            effect: effect(bypassIceFn(state)),
          },
        },
      },
    },
  }],
};

// Severnius Stim Implant
export const severniusStimImplant: CardDef = {
  title: 'Severnius Stim Implant',
  let: {
    implantFn: (srv: string, kw: string) => ({
      prompt: 'Choose at least 2 cards to trash',
      cost: [toC('click', 1)],
      choices: { max: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (runnerFn(state)?.hand?.length ?? 0);
      }), card: (c: Card) => runnerFn(c) && inHandFn(c) },
      msg: (msgFn: any) => `trash ${quantify(targets.length, 'card')} and access ${quantify(Math.floor(targets.length / 2), 'additional card')}`,
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const bonus = Math.floor(targets.length / 2);
        yield wait_for(state, [{ asyncResult: 'result' },
          trashCardsFn(state, side, targets, { unpreventable: true, causeCard: card })], []);
        registerEventsFn(state, side, card, [breachAccessBonus(kw, bonus, { duration: ':end-of-run' })]);
        makeRunFn(state, side, eid, srv, card);
      }),
    }),
  },
  abilities: [{
    action: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (runnerFn(state)?.hand?.length ?? 0) >= 2;
    }),
    label: 'Run HQ or R&D',
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: ['HQ', 'R&D'],
    async: true,
    effect: effect(continue_ability(
      (() => {
        const srv = target === 'HQ' ? ':hq' : ':rd';
        const kw = target === 'HQ' ? ':hq' : ':rd';
        return {
          prompt: 'Choose at least 2 cards to trash',
          cost: [toC('click', 1)],
          choices: { max: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            return (runnerFn(state)?.hand?.length ?? 0);
          }), card: (c: Card) => runnerFn(c) && inHandFn(c) },
          msg: (msgFn: any) => `trash ${quantify(targets.length, 'card')} and access ${quantify(Math.floor(targets.length / 2), 'additional card')}`,
          async: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            const bonus = Math.floor(targets.length / 2);
            yield wait_for(state, [{ asyncResult: 'result' },
              trashCardsFn(state, side, targets, { unpreventable: true, causeCard: card })], []);
            registerEventsFn(state, side, card, [breachAccessBonus(kw, bonus, { duration: ':end-of-run' })]);
            makeRunFn(state, side, eid, srv, card);
          }),
        };
      })(),
      card, null)),
  }],
};

// Şifr
export const sifr: CardDef = {
  title: 'Şifr',
  let: {
    gatherPreSifrEffects: (sifr: Card, state: State, side: Side, eid: EID, target: Card, targets: Card[]) => {
      // Calculate ice strength at the moment Sifr would affect it
      const effects = (state as any).effects || [];
      const iceStrengthEffects = effects.filter((e: any) => e.type === ':ice-strength');
      return iceStrengthEffects.reduce((sum: number, e: any) => {
        const value = typeof e.value === 'function' ? e.value(state, side, eid, getCardFn(state, e.card), targets) : e.value;
        return sum + value;
      }, 0);
    },
  },
  'static-abilities': [muPlusFn(2)],
  events: [{
    event: 'encounter-ice',
    skippable: true,
    interactive: req(function*() { return true; }),
    optional: {
      prompt: 'Lower your maximum hand size by 1 to reduce the strength of encountered ice to 0?',
      once: ':per-turn',
      'yes-ability': {
        msg: (msgFn: any) => `lower [their] maximum hand size by 1 and reduce the strength of ${forms.currentIce?.(state)?.title || 'the encountered ice'} to 0`,
        effect: effect(
          registerLingeringEffectFn(card, {
            type: ':hand-size',
            duration: ':until-runner-turn-begins',
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              return side === ':runner';
            }),
            value: -1,
          }),
          registerLingeringEffectFn(':runner', card, {
            type: ':ice-strength',
            duration: ':end-of-encounter',
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              return sameCard(forms.currentIce?.(state), targets[0]);
            }),
            value: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              const currentIce = forms.currentIce?.(state);
              const strength = currentIce?.strength ?? 0;
              return -(strength + (forms.let?.gatherPreSifrEffects?.(card, state, side, eid, currentIce, targets.slice(1)) ?? 0));
            }),
          })
        ),
      },
    },
  }],
};

// Silencer
export const silencer: CardDef = {
  title: 'Silencer',
  recurring: 1,
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const t = target;
        return eid['source-type'] === ':ability' &&
          hasSubtypeFn(t, 'Killer') && hasSubtypeFn(t, 'Icebreaker');
      }),
      type: ':recurring',
    },
  },
};

// Simulchip
export const simulchip: CardDef = {
  title: 'Simulchip',
  'static-abilities': [{
    type: ':card-ability-additional-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const pred = (event: any[]) => event.some((t: any) => runnerFn(t.card) && installedFn(t.card) && programFn(t.card));
      return sameCard(card, (forms.context(state, card, targets) as any)?.card) &&
        (eventCountFn(state, null, 'runner-trash', pred) +
         eventCountFn(state, null, 'corp-trash', pred) +
         eventCountFn(state, null, 'game-trash', pred)) === 0;
    }),
    value: [toC(':program', 1)],
  }],
  abilities: [{
    async: true,
    label: 'Install a program from the heap',
    'change-in-game-state': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const runner = runnerFn(state);
        const discard = runner?.discard || [];
        return discard.some((c: Card) => programFn(c) &&
          runnerCanPayAndInstallFn(state, side, { ...eid, source: card, 'source-type': ':runner-install' }, c,
            { 'cost-bonus': -3, 'no-toast': true }));
      }),
    },
    cost: [toC(':trash-can')],
    effect: effect(continue_ability({
      'show-discard': true,
      'waiting-prompt': true,
      choices: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return inDiscardFn(target) && programFn(target) &&
            runnerCanPayAndInstallFn(state, side, { ...eid, source: card }, target, { 'cost-bonus': -3 });
        }),
      },
      async: true,
      effect: effect(runnerInstallFn({ ...eid, source: card, 'source-type': ':runner-install' }, target, {
        'cost-bonus': -3,
        'msg-keys': { displayOrigin: true, installSource: card, 'include-cost-from-eid': eid },
      })),
    }, card, null)),
  }],
};

// Skulljack
export const skulljack: CardDef = {
  title: 'Skulljack',
  'on-install': {
    async: true,
    effect: effect(coreDamage.damage(eid, ':brain', 1, { card: card })),
  },
  'static-abilities': [{ type: ':trash-cost', value: -1 }],
};

// Solidarity Badge
export const solidarityBadge: CardDef = {
  title: 'Solidarity Badge',
  events: [
    {
      event: 'runner-turn-begins',
      skippable: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return getCounters(getCardFn(state, card), 'power') > 0;
      }),
      async: true,
      interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return getCounters(getCardFn(state, card), 'power') > 0;
      }),
      prompt: 'Choose one',
      'waiting-prompt': true,
      choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const tags = countRealTagsFn(state);
        return ['Draw 1 card', ...(tags > 0 ? ['Remove 1 tag'] : []), 'Done'];
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        if (target === 'Draw 1 card') {
          yield wait_for(state, [{ asyncResult: 'result' },
            addCounterFn(state, side, card, 'power', -1)], []);
          systemMsg(state, side, `uses ${card.title} to draw 1 card`);
          drawFn(state, ':runner', eid, 1);
        } else if (target === 'Remove 1 tag') {
          yield wait_for(state, [{ asyncResult: 'result' },
            addCounterFn(state, side, card, 'power', -1)], []);
          systemMsg(state, side, `uses ${card.title} to remove 1 tag`);
          loseTagsFn(state, ':runner', eid, 1);
        } else {
          effectCompletedFn(state, ':runner', eid);
        }
      }),
    },
    {
      event: 'runner-trash',
      async: true,
      interactive: req(function*() { return true; }),
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return targets.some((t: any) => corpFn(t.card)) &&
          firstEventFn(state, side, 'runner-trash',
            (t: any[]) => t.some((x: any) => corpFn(x.card)));
      }),
      msg: 'place 1 power counter on itself',
      effect: effect(addCounterFn(':runner', eid, card, 'power', 1)),
    },
  ],
};

// Spinal Modem
export const spinalModem: CardDef = {
  title: 'Spinal Modem',
  'static-abilities': [muPlusFn(1)],
  recurring: 2,
  events: [{
    event: 'successful-trace',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return !!runFn(state);
    }),
    msg: 'suffer 1 core damage',
    async: true,
    effect: effect(coreDamage.damage(eid, ':brain', 1, { card: card })),
  }],
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const t = target;
        return eid['source-type'] === ':ability' && hasSubtypeFn(t, 'Icebreaker');
      }),
      type: ':recurring',
    },
  },
};

// Sports Hopper
export const sportsHopper: CardDef = {
  title: 'Sports Hopper',
  'static-abilities': [linkPlusFn(1)],
  abilities: [{
    ...drawAbility(3, null, {
      'change-in-game-state': { req: req(function*() { return !!(runnerFn(state)?.deck?.length); }) },
      cost: [toC(':trash-can')],
    }),
  }],
};

// Spy Camera
export const spyCamera: CardDef = {
  title: 'Spy Camera',
  abilities: [
    {
      action: true,
      cost: [toC('click', 1)],
      'change-in-game-state': { req: req(function*() { return !!(runnerFn(state)?.deck?.length); }) },
      async: true,
      label: 'Look at the top X cards of the stack',
      msg: 'look at the top X cards of the stack and rearrange them',
      'waiting-prompt': true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const n = (allActiveInstalledFn(state, ':runner').filter((c: Card) => c.title === card.title)).length;
        const deck = runnerFn(state)?.deck || [];
        const from = deck.slice(0, n);
        if (from.length > 0) {
          continue_ability(state, side,
            reorderChoice(':runner', ':corp', from, 0, from.length, from),
            card, null);
        }
      }),
    },
    {
      label: 'Look at the top card of R&D',
      msg: 'look at the top card of R&D',
      cost: [toC(':trash-can')],
      async: true,
      effect: effect(continue_ability({
        prompt: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const corp = corpFn(state);
          const topCard = corp?.deck?.[0];
          return `The top card of R&D is ${topCard?.title || ''}`;
        }),
        choices: ['OK'],
      }, card, null)),
    },
  ],
};

// Supercorridor
export const supercorridor: CardDef = {
  title: 'Supercorridor',
  'static-abilities': [
    muPlusFn(2),
    runnerHandSizePlusFn(1),
  ],
  events: [{
    event: 'runner-turn-ends',
    interactive: getAutoresolveFn('auto-fire', (complementFn(neverFn) as any)),
    silent: getAutoresolveFn('auto-fire', neverFn),
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const runner = runnerFn(state);
        const corp = corpFn(state);
        return (runner?.credit ?? 0) === (corp?.credit ?? 0);
      }),
      'waiting-prompt': true,
      prompt: 'Gain 2 [Credits]?',
      autoresolve: getAutoresolveFn('auto-fire'),
      'yes-ability': {
        msg: 'gain 2 [Credits]',
        async: true,
        effect: effect(gainCreditsFn(eid, 2)),
      },
      'no-ability': { effect: effect(systemMsg(`declines to use ${card.title}`)) },
    },
  }],
  abilities: [{ ...setAutoresolveFn('auto-fire', 'Supercorridor') }],
};

// Swift
export const swift: CardDef = {
  title: 'Swift',
  'static-abilities': [muPlusFn(1)],
  events: [{
    event: 'play-event',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      return hasSubtypeFn(ctx.card, 'Run') &&
        firstEventFn(state, side, 'play-event',
          (t: any[]) => t[0] && hasSubtypeFn((t[0] as any).card, 'Run'));
    }),
    msg: 'gain a [click]',
    effect: effect(gainClicksFn(1)),
  }],
};

// T400 Memory Diamond
export const t400MemoryDiamond: CardDef = {
  title: 'T400 Memory Diamond',
  'static-abilities': [
    muPlusFn(1),
    {
      type: ':hand-size',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return side === ':runner';
      }),
      value: 1,
    },
  ],
};

// The Gauntlet
export const theGauntlet: CardDef = {
  title: 'The Gauntlet',
  'static-abilities': [muPlusFn(2)],
  events: [{
    event: 'breach-server',
    automatic: ':pre-breach',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      return ctx.server === ':hq';
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const evs = runEventsFn(state, side, 'subroutines-broken');
      const relevant = evs.filter((ev: any) => {
        const ctx = ev[0];
        const t = getCardFn(state, ctx.ice);
        return ctx.allSubsBroken && (getCardFn(state, ctx.ice)) &&
          (coreBoard.getZone?.(t) === ':hq' || ctx.ice === ':hq');
      });
      const byCid = [...new Set(relevant.map((ev: any) => ev[0].card?.cid))];
      const bonusCount = byCid.length;
      accessBonusFn(state, ':runner', ':hq', bonusCount);
    }),
  }],
};

// The Personal Touch
export const thePersonalTouch: CardDef = {
  title: 'The Personal Touch',
  hosting: { card: (c: Card) => hasSubtypeFn(c, 'Icebreaker') && installedFn(c) },
  'on-install': { effect: effect(updateBreakerStrengthFn(getCardFn(state, card))) },
  'static-abilities': [{
    type: ':breaker-strength',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return sameCard(targets[0], card);
    }),
    value: 1,
  }],
};

// The Toolbox
export const theToolbox: CardDef = {
  title: 'The Toolbox',
  'static-abilities': [
    muPlusFn(2),
    linkPlusFn(2),
  ],
  recurring: 2,
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const t = target;
        return eid['source-type'] === ':ability' && hasSubtypeFn(t, 'Icebreaker');
      }),
      type: ':recurring',
    },
  },
};

// The Tungsten Tailor
export const theTungstenTailor: CardDef = {
  title: 'The Tungsten Tailor',
  'static-abilities': [{
    type: ':ice-strength',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return iceFn(target);
    }),
    value: -1,
  }],
  events: [{
    event: 'subroutines-broken',
    async: true,
    'once-per-instance': true,
    automatic: ':gain-credits',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const validCtx = (ctx: any) => ctx['was-zero-or-less-strength'];
      return targets.some(validCtx) &&
        firstEventFn(state, side, 'subroutines-broken',
          (t: any[]) => t[0] && validCtx(t[0]));
    }),
    msg: 'gain 1 [Credits]',
    effect: effect(gainCreditsFn(state, side, eid, 1)),
  }],
};

// The Wizard's Chest
export const theWizardsChest: CardDef = {
  title: "The Wizard's Chest",
  let: {
    searchFn: (state: State, side: Side, eid: EID, card: Card, remainder: Card[], type: string, revStr: string, firstCard: Card | null, secondCard: Card | null) => {
      if (remainder.length > 0) {
        const revealedCard = remainder[0];
        const restOfDeck = remainder.slice(1);
        const newRevStr = revStr ? `${revStr}, ${revealedCard.title}` : revealedCard.title;

        const isType = isTypeFn(revealedCard, type);

        if (isType) {
          if (!firstCard) {
            return theWizardsChest.let.searchFn(state, side, eid, card, restOfDeck, type, newRevStr, revealedCard, null);
          } else {
            return installChoice(state, side, eid, card, newRevStr, firstCard, revealedCard, null);
          }
        } else {
          return theWizardsChest.let.searchFn(state, side, eid, card, restOfDeck, type, newRevStr, firstCard, secondCard);
        }
      } else {
        if (!firstCard) {
          return continue_ability(state, side, {
            msg: (msgFn: any) => `reveal ${revStr} from the top of the stack`,
            effect: effect(shuffleDeck(':deck'), systemMsg('shuffles the Stack')),
          }, card, null);
        } else {
          return installChoice(state, side, eid, card, revStr, firstCard, secondCard, null);
        }
      }
    },
    installChoice: (state: State, side: Side, eid: EID, card: Card, revStr: string, firstCard: Card, secondCard: Card | null, remainder: Card[]) => {
      continue_ability(state, side, {
        prompt: 'Choose one',
        choices: [
          `Install ${firstCard.title}`,
          secondCard ? `Install ${secondCard.title}` : null,
          'No install',
        ].filter(Boolean),
        msg: (msgFn: any) => `reveal ${revStr} from the top of the stack`,
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          if (target !== 'No install') {
            yield wait_for(state, [{ asyncResult: 'result' },
              runnerInstallFn(state, side, makeEidFn2(state, { source: card, 'source-type': ':runner-install' }),
                target === `Install ${firstCard.title}` ? firstCard : secondCard,
                { 'ignore-all-cost': true, 'msg-keys': { displayOrigin: true, installSource: card } })], []);
            shuffleDeck(state, side, ':deck');
            systemMsg(state, side, 'shuffles the Stack');
            effectCompletedFn(state, side, eid);
          } else {
            shuffleDeck(state, side, ':deck');
            systemMsg(state, side, 'shuffles the Stack');
            effectCompletedFn(state, side, eid);
          }
        }),
      }, card, null);
    },
  },
  abilities: [{
    cost: [toC(':trash-can')],
    'change-in-game-state': { req: req(function*() { return !!(runnerFn(state)?.deck?.length); }) },
    label: 'Set aside cards from the top of the stack',
    prompt: 'Choose a card type',
    'waiting-prompt': true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return cancelable(['Hardware', 'Program', 'Resource']);
    }),
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const runner = runnerFn(state);
      const reg = runner?.reg || {};
      return (reg.successfulRun || []).some((s: any) => s === ':hq') &&
        (reg.successfulRun || []).some((s: any) => s === ':rd') &&
        (reg.successfulRun || []).some((s: any) => s === ':archives');
    }),
    async: true,
    effect: effect(
      (() => {
        const deck = runnerFn(state)?.deck || [];
        const type = target || 'Program';
        return theWizardsChest.let.searchFn(state, side, eid, card, deck, type, '', null, null);
      })()
    ),
  }],
};

// Time Bomb
export const timeBomb: CardDef = {
  title: 'Time Bomb',
  data: { counter: { power: 1 } },
  req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    const runner = runnerFn(state);
    const reg = runner?.reg || {};
    return (reg.successfulRun || []).some((s: any) => [':hq', ':rd', ':archives'].includes(s));
  }),
  events: [{
    event: 'runner-turn-begins',
    automatic: ':force-discard',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (getCounters(getCardFn(state, card), 'power') >= 3) {
        yield wait_for(state, [{ asyncResult: 'result' },
          trashFn(state, side, card, { causeCard: card })], []);
        continue_ability(state, side, sabotageAbility(3), card, null);
      } else {
        systemMsg(state, side, `uses ${card.title} to place 1 power counter on itself`);
        addCounterFn(state, side, eid, card, 'power', 1);
      }
    }),
  }],
};

// Titanium Ribs
export const titaniumRibs: CardDef = {
  title: 'Titanium Ribs',
  'on-install': {
    async: true,
    msg: 'suffer 2 meat damage',
    effect: effect(enableRunnerDamageChoiceFn(), coreDamage.damage(eid, ':meat', 2, { unboostable: true, card: card })),
  },
  'leave-play': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    coreUpdate.updateIn(state, ['damage'], (d: any) => { if (d) delete d['damage-choose-runner']; return d; });
  }),
  events: [{
    event: 'pre-resolve-damage',
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      return (ctx.amount > 0) &&
        runnerCanChooseDamageFn(state) &&
        !(getDamageFn(state)?.['damage-replace']);
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      const hand = runnerFn(state)?.hand || [];
      const dmg = ctx.amount ?? 0;
      continue_ability(state, ':runner', {
        effect: effect(hand.length < dmg
          ? chosenDamageFn(':runner', hand)
          : {
              'waiting-prompt': true,
              prompt: `Choose ${quantify(dmg, 'card')} to trash for the ${ctx.damageType || 'damage'} damage`,
              choices: { max: dmg, all: true, card: (c: Card) => inHandFn(c) && runnerFn(c) },
              msg: (msgFn: any) => `trash ${enumerateCards(targets, ':sorted')}`,
              effect: effect(chosenDamageFn(':runner', targets)),
            }),
      }, card, null);
    }),
  }],
};

// Top Hat
export const topHat: CardDef = {
  title: 'Top Hat',
  events: [successfulRunReplaceBreach({
    targetServer: ':rd',
    ability: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const run = forms.run(state);
        const corp = corpFn(state);
        return (run?.maxAccess ?? 0) !== 0 && (corp?.deck?.length ?? 0) > 0;
      }),
      prompt: 'Which card from the top of R&D would you like to access? (Card 1 is on top)',
      choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const corp = corpFn(state);
        return Array.from({ length: Math.min((corp?.deck?.length || 0), 5) }, (_, i) => String(i + 1));
      }),
      msg: (msgFn: any) => `only access the card at position ${target} of R&D`,
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        if (getOnlyCardToAccessFn(state)) {
          effectCompletedFn(state, null, eid);
          return;
        }
        const corp = corpFn(state);
        const idx = strToInt(target) - 1;
        const cardToAccess = corp?.deck?.[idx];
        if (cardToAccess) {
          accessCardFn(state, side, eid, cardToAccess, 'an unseen card');
        }
      }),
    },
  })],
};

// Touchstone
export const touchstone: CardDef = {
  title: 'Touchstone',
  events: [{
    event: 'play-event',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return firstEventFn(state, side, 'play-event');
    }),
    async: true,
    silent: req(function*() { return true; }),
    effect: effect(addCounterFn(state, side, eid, card, 'credit', 1)),
  }],
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return !!runFn(state);
      }),
      type: ':credit',
    },
  },
};

// Turntable
export const turntable: CardDef = {
  title: 'Turntable',
  'static-abilities': [muPlusFn(1)],
  events: [{
    event: 'agenda-stolen',
    interactive: req(function*() { return true; }),
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return !!(corpFn(state)?.scored?.length);
    }),
    async: true,
    effect: effect(continue_ability({
      'change-in-game-state': { silent: true },
      prompt: (msgFn: any) => `Swap ${(forms.context(state, card, targets) as any)?.card?.title || 'stolen agenda'} for an agenda in the Corp's score area?`,
      'yes-ability': {
        prompt: `Choose a scored Corp agenda to swap with ${(forms.context(state, card, targets) as any)?.card?.title || 'the stolen agenda'}`,
        choices: { card: (c: Card) => inCorpScoredFn(state, side, c) },
        msg: (msgFn: any) => `swap ${(forms.context(state, card, targets) as any)?.card?.title || 'stolen'} for ${target.title}`,
        effect: effect(swapAgendasFn(target, (forms.context(state, card, targets) as any)?.card)),
      },
    }, card, targets)),
  }],
};

// Ubax
export const ubax: CardDef = {
  title: 'Ubax',
  let: {
    ability: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return !!(state as any)['runner-phase-12'];
      }),
      automatic: ':draw-cards',
      msg: 'draw 1 card',
      label: 'Draw 1 card (start of turn)',
      once: ':per-turn',
      async: true,
      effect: effect(drawFn(eid, 1)),
    },
  },
  'static-abilities': [muPlusFn(1)],
  flags: {
    'runner-turn-draw': true,
    'runner-phase-12': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const identity = getCardFn(state, (state as any).runner?.identity);
      const allActive = allActiveInstalledFn(state, ':runner');
      const cards = [identity, ...allActive];
      return cards.filter((c: Card) => cardFlagFn(c, ':runner-turn-draw', true)).length > 1;
    }),
  },
  events: [{ event: 'runner-turn-begins', ...(forms.let?.ability || {}) }],
  abilities: [forms.let?.ability],
};

// Unregistered S&W '35
export const unregisteredSW: CardDef = {
  title: "Unregistered S&W '35",
  abilities: [{
    action: true,
    cost: [toC('click', 2)],
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const runner = runnerFn(state);
      const reg = runner?.reg || {};
      return (reg.successfulRun || []).some((s: any) => s === ':hq') &&
        allActiveInstalledFn(state, ':corp').some((c: Card) =>
          rezzedFn(c) && installedFn(c) &&
          hasAnySubtypeFn(c, ['Bioroid', 'Clone', 'Executive', 'Sysop']));
    }),
    label: 'trash a Bioroid, Clone, Executive or Sysop',
    prompt: 'Choose a Bioroid, Clone, Executive, or Sysop to trash',
    choices: { card: (c: Card) => rezzedFn(c) && installedFn(c) && hasAnySubtypeFn(c, ['Bioroid', 'Clone', 'Executive', 'Sysop']) },
    async: true,
    msg: (msgFn: any) => `trash ${target.title}`,
    effect: effect(trashFn(eid, target, { causeCard: card })),
  }],
};

// Vigil
export const vigil: CardDef = {
  title: 'Vigil',
  let: {
    ability: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return !!(state as any)['runner-phase-12'] &&
          (corpFn(state)?.hand?.length ?? 0) === handSizeFn(state, ':corp');
      }),
      automatic: ':draw-cards',
      msg: 'draw 1 card',
      label: 'Draw 1 card (start of turn)',
      once: ':per-turn',
      async: true,
      effect: effect(drawFn(eid, 1)),
    },
  },
  'static-abilities': [muPlusFn(1)],
  events: [{ event: 'runner-turn-begins', ...(forms.let?.ability || {}) }],
  abilities: [forms.let?.ability],
};

// Virtuoso
export const virtuoso: CardDef = {
  title: 'Virtuoso',
  'static-abilities': [muPlusFn(1)],
  events: [
    markChangedEvent(),
    identifyMarkAbility(),
    {
      event: 'successful-run',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        return (ctx as any)['marked-server'] &&
          firstEventFn(state, side, 'successful-run',
            (t: any[]) => (t[0] || {})['marked-server']);
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        if (ctx.server?.[0] === ':hq') {
          systemMsg(state, side, `uses ${card.title} to access 1 additional card from HQ this run`);
          registerEventsFn(state, side, card, [breachAccessBonus(':hq', 1, { duration: ':end-of-run' })]);
          effectCompletedFn(state, side, eid);
        } else {
          systemMsg(state, side, `will use ${card.title} to breach HQ when this run ends`);
          registerEventsFn(state, side, card, [{
            event: 'run-ends',
            duration: ':end-of-run',
            async: true,
            interactive: req(function*() { return true; }),
            msg: 'breach HQ',
            effect: effect(breachServerFn(state, ':runner', eid, [':hq'], null)),
          }]);
          effectCompletedFn(state, side, eid);
        }
      }),
    },
  ],
};

function breachServerFn(state: State, side: Side, eid: EID, server: string[], opts: any): void {
  coreAccess.breachServer(eid, server, opts);
}

// WAKE Implant v2A-JRJ
export const wakeImplant: CardDef = {
  title: 'WAKE Implant v2A-JRJ',
  'on-install': {
    async: true,
    msg: 'suffer 1 meat damage',
    effect: effect(coreDamage.damage(eid, ':meat', 1, { unboostable: true, card: card })),
  },
  events: [
    {
      event: 'successful-run',
      async: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return targetServerFn(forms.context(state, card, targets)) === ':hq';
      }),
      msg: 'place 1 power counter on itself',
      effect: effect(addCounterFn(state, ':runner', eid, card, 'power', 1, { placed: true })),
    },
    {
      event: 'breach-server',
      automatic: ':pre-breach',
      async: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        return ctx.server === ':rd' && getCounters(card, 'power') > 0;
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        continue_ability(state, side, {
          prompt: 'How many additional R&D accesses do you want to make?',
          choices: { number: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            return Math.min(3, getCounters(card, 'power'));
          }), default: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            return Math.min(3, getCounters(card, 'power'));
          }) },
          msg: (msgFn: any) => `access ${quantify(target, 'additional card')} from R&D`,
          'waiting-prompt': true,
          async: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            accessBonusFn(state, ':runner', ':rd', Math.max(0, target));
            addCounterFn(state, ':runner', eid, card, 'power', -target, { placed: true });
          }),
        }, card, null);
      }),
    },
  ],
};

// Window
export const window: CardDef = {
  title: 'Window',
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    'change-in-game-state': { req: req(function*() { return !!(runnerFn(state)?.deck?.length); }) },
    'keep-menu-open': ':while-clicks-left',
    msg: 'draw 1 card from the bottom of the stack',
    effect: effect(moveFn((runnerFn(state)?.deck || []).slice(-1)[0], ':hand')),
  }],
};

// Zamba
export const zamba: CardDef = {
  title: 'Zamba',
  special: { 'auto-gain-credits': ':always' },
  implementation: 'Credit gain is automatic',
  'static-abilities': [muPlusFn(2)],
  abilities: [{ ...setAutoresolveFn('auto-gain-credits', 'Zamba gaining credits on expose') }],
  events: [{
    event: 'expose',
    interactive: getAutoresolveFn('auto-gain-credits', (complementFn(neverFn) as any)),
    silent: getAutoresolveFn('auto-gain-credits', neverFn),
    async: true,
    optional: {
      'waiting-prompt': true,
      prompt: (msgFn: any) => `Gain ${(forms.context(state, card, targets) as any)?.cards?.length || 0} [Credits]?`,
      autoresolve: getAutoresolveFn('auto-gain-credits'),
      'yes-ability': {
        msg: (msgFn: any) => `gain ${(forms.context(state, card, targets) as any)?.cards?.length || 0} [Credits]`,
        async: true,
        effect: effect(gainCreditsFn(eid, (forms.context(state, card, targets) as any)?.cards?.length || 0)),
      },
    },
  }],
};

// Zenit Chip JZ-2MJ
export const zenitChip: CardDef = {
  title: 'Zenit Chip JZ-2MJ',
  'on-install': {
    async: true,
    effect: effect(coreDamage.damage(eid, ':brain', 1, { card: card })),
  },
  events: [{
    event: 'successful-run',
    automatic: ':draw-cards',
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      return isCentralFn(ctx.server) &&
        firstEventFn(state, side, 'successful-run',
          (t: any[]) => { const c = t[0]; return c && isCentralFn(c.server); });
    }),
    msg: 'draw 1 card',
    effect: effect(drawFn(state, ':runner', eid, 1)),
  }],
};

// Zer0
export const zer0: CardDef = {
  title: 'Zer0',
  abilities: [{
    action: true,
    cost: [toC('click', 1), toC(':net', 1)],
    once: ':per-turn',
    msg: 'gain 1 [Credits] and draw 2 cards',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      playSfx(state, side, 'professional-contacts');
      yield wait_for(state, [{ asyncResult: 'result' },
        gainCreditsFn(state, side, 1, { 'suppress-checkpoint': true })], []);
      drawFn(state, side, eid, 2);
    }),
  }],
};
