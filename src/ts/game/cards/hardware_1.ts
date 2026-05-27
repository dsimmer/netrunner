//
/**
 * Hardware Cards
 * Ported from Clojure cards/hardware.clj to TypeScript
 *
 * Contains all Runner hardware card definitions with their abilities and events.
 */

import type { Card, CardDef, EID, Side, State } from "../../types";
import * as coreAccess from "../core/access";
import * as coreActions from "../core/actions";
import * as coreBoard from "../core/board";
import * as coreCard from "../core/card";
import * as coreCostFns from "../core/cost_fns";
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
import * as coreInstalling from "../core/installing";
import * as coreLink from "../core/link";
import * as coreMemory from "../core/memory";
import * as coreMoving from "../core/moving";
import * as coreOptional from "../core/optional";
import * as corePayment from "../core/payment";
import * as corePlayInstants from "../core/play_instants";
import * as corePrevention from "../core/prevention";
import * as corePrompts from "../core/prompts";
import * as coreProps from "../core/props";
import * as coreRevealing from "../core/revealing";
import * as coreRezzing from "../core/rezzing";
import * as coreRuns from "../core/runs";
import * as coreSay from "../core/say";
import * as coreServers from "../core/servers";
import * as coreSetAside from "../core/set_aside";
import * as coreShuffling from "../core/shuffling";
import * as coreTags from "../core/tags";
import * as coreToString from "../core/to_string";
import * as coreToasts from "../core/toasts";
import * as coreUpdate from "../core/update";
import * as coreVirus from "../core/virus";
import * as coreWinning from "../core/winning";
import * as coreSetAsideModule from "../core/set_aside";
import * as coreSabotage from "../core/sabotage";
import * as coreMark from "../core/mark";
import * as coreThreat from "../core/threat";
import * as utils from "../utils";
import * as jintekiUtils from "../../jinteki/utils";
import { req, effect, msg, wait_for, continue_ability, forms } from "../macros";
// Helper for toC
export function toC(...args: any[]): any {
  return (corePayment.toC as any)?.(...args);
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
export function enumerateCards(...args: any[]): string {
  return (utils.enumerateCards as any)?.(...args);
}

// Helper for quantify
export function quantify(...args: any[]): string {
  return (utils.quantify as any)?.(...args);
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
export function shuffleDeck(...args: any[]): void {
  (coreShuffling.shuffle as any)?.(...args);
}

// Helper for play-sfx
export function playSfx(...args: any[]): void {
  (coreSay.playSfx as any)?.(...args);
}

// Helper for system-msg
export function systemMsg(...args: any[]): void {
  (coreSay.systemMsg as any)?.(...args);
}

// Helper for card-str
export function cardStr(...args: any[]): string {
  return (coreToString.cardStr as any)?.(...args);
}

// Helper for make-icon
export function makeIcon(...args: any[]): any {
  return (coreDefHelpers.makeIcon as any)?.(...args);
}

// Helper for trash-on-empty
function trashOnEmpty(...args: any[]): any {
  return (coreDefHelpers.trashOnEmpty as any)?.(...args);
}

// Helper for draw-abi
export function drawAbility(...args: any[]): any {
  return (coreDefHelpers.drawAbility as any)?.(...args);
}

// Helper for successful-run-replace-breach
export function successfulRunReplaceBreach(...args: any[]): any {
  return (coreDefHelpers.successfulRunReplaceBreach as any)?.(...args);
}

// Helper for breach-access-bonus
export function breachAccessBonus(...args: any[]): any {
  return (coreDefHelpers.breachAccessBonus as any)?.(...args);
}

// Helper for auto-icebreaker
function autoIcebreaker(...args: any[]): any {
  return (coreDefHelpers.autoIcebreaker as any)?.(...args);
}

// Helper for run-any-server-ability
function runAnyServerAbility(...args: any[]): any {
  return (coreDefHelpers.runAnyServerAbility as any)?.(...args);
}

// Helper for look-at-the-top
export function lookAtTheTop(...args: any[]): any {
  return (coreDefHelpers.lookAtTheTop as any)?.(...args);
}

// Helper for offer-jack-out
export function offerJackOut(...args: any[]): any {
  return (coreDefHelpers.offerJackOut as any)?.(...args);
}

// Helper for reorder-choice
export function reorderChoice(...args: any[]): any {
  return (coreDefHelpers.reorderChoice as any)?.(...args);
}

// Helper for play-tiered-sfx
export function playTieredSfx(...args: any[]): void {
  (coreDefHelpers.playTieredSfx as any)?.(...args);
}

// Helper for cancellable
export function cancelable(...args: any[]): any {
  return (corePrompts.cancellable as any)?.(...args);
}

// Helper for sabotage-ability
export function sabotageAbility(...args: any[]): any {
  return (coreSabotage.sabotageAbility as any)?.(...args);
}

// Helper for identify-mark-ability
export function identifyMarkAbility(..._args: any[]): any {
  return coreMark.identifyMarkAbility;
}

// Helper for mark-changed-event
export function markChangedEvent(..._args: any[]): any {
  return coreMark.markChangedEvent;
}

// Helper for set-aside
export function setAsideFn(...args: any[]): void {
  (coreSetAsideModule.setAside as any)?.(...args);
}

// Helper for get-set-aside
export function getSetAsideFn(...args: any[]): Card[] {
  return (coreSetAsideModule.getSetAside as any)?.(...args);
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
export function breakSubFn(...args: any[]): any {
  return (coreIce.breakSub as any)?.(...args);
}

// Helper for pump
export function pumpFn(...args: any[]): void {
  (coreIce.pump as any)?.(...args);
}

// Helper for update-all-ice
export function updateAllIceFn(...args: any[]): void {
  (coreIce.updateAllIce as any)?.(...args);
}

// Helper for update-all-icebreakers
export function updateAllIcebreakersFn(...args: any[]): void {
  (coreIce.updateAllIcebreakers as any)?.(...args);
}

// Helper for update-breaker-strength
export function updateBreakerStrengthFn(...args: any[]): void {
  (coreIce.updateBreakerStrength as any)?.(...args);
}

// Helper for derez
export function derezFn(...args: any[]): void {
  (coreRezzing.derez as any)?.(...args);
}

// Helper for rez
export function rezFn(...args: any[]): void {
  (coreRezzing.rez as any)?.(...args);
}

// Helper for can-pay-to-rez?
export function canPayToRezFn(
  state: State,
  side: Side,
  eid: EID,
  card: Card,
): boolean {
  return coreRezzing.canPayToRez?.(state, side, eid, card) ?? false;
}

// Helper for rez-cost
export function rezCostFn(state: State, side: Side, card: Card): number {
  return coreCostFns.rezCost?.(state, side, card) ?? 0;
}

// Helper for rez-additional-cost-bonus
export function rezAdditionalCostBonusFn(
  state: State,
  side: Side,
  card: Card,
): any[] {
  return coreCostFns.rezAdditionalCostBonus?.(state, side, card) || [];
}

// Helper for build-cost-string
export function buildCostString(...args: any[]): string {
  return (corePayment.buildCostString as any)?.(...args);
}

// Helper for trash-cost
export function trashCostFn(
  state: State,
  side: Side,
  card: Card,
): number | null {
  return coreCostFns.trashCost?.(state, side, card) ?? null;
}

// Helper for get-x-fn
export function getxFn(...args: any[]): number {
  return (coreMemory.getxFn as any)?.(...args);
}

// Helper for expected-mu
export function expectedMuFn(...args: any[]): number {
  return (coreMemory.expectedMu as any)?.(...args);
}

// Helper for count-virus-programs
export function countVirusProgramsFn(...args: any[]): number {
  return (coreVirus.countVirusPrograms as any)?.(...args);
}

// Helper for link+
export function linkPlusFn(...args: any[]): any {
  return (coreLink.linkPlus as any)?.(...args);
}

// Helper for get-link
export function getLinkFn(...args: any[]): number {
  return (coreLink.getLink as any)?.(...args);
}

// Helper for hand-size
export function handSizeFn(state: State, side: Side): number {
  return coreHandSize.handSize?.(state, side) ?? 0;
}

// Helper for mu+
export function muPlusFn(...args: any[]): any {
  return (coreMemory.muPlus as any)?.(...args);
}

// Helper for caissa-mu+
export function caissaMuPlusFn(...args: any[]): any {
  return (coreMemory.caissaMuPlus as any)?.(...args);
}

// Helper for virus-mu+
export function virusMuPlusFn(...args: any[]): any {
  return (coreMemory.virusMuPlus as any)?.(...args);
}

// Helper for runner-hand-size+
export function runnerHandSizePlusFn(...args: any[]): any {
  return (coreHandSize.runnerHandSizePlus as any)?.(...args);
}

// Helper for runner-hand-size+
function runnerHandSizePlus(...args: any[]): any {
  return (coreHandSize.runnerHandSizePlus as any)?.(...args);
}

// Helper for in-hand*?
export function inHandStarFn(state: State, card: Card): boolean {
  return coreCard.inHandStar?.(state, card) ?? coreCard.inHand(card);
}

// Helper for all-cards-in-hand*
export function allCardsInHandStarFn(state: State, side: Side): Card[] {
  return (
    coreCard.allCardsInHandStar?.(state, side) ||
    (state as any)[side]?.hand ||
    []
  );
}

// Helper for same-card?
export function sameCard(a: any, b: any): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (typeof a === "object" && typeof b === "object") {
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
export function effectCompletedFn(...args: any[]): any {
  return (coreEid.effectCompleted as any)?.(...args);
}

// Helper for complete-with-result
function completeWithResultFn(...args: any[]): any {
  return (coreEid.completeWithResult as any)?.(...args);
}

// Helper for make-result
export function makeResultFn(...args: any[]): any {
  return (coreEid.makeResult as any)?.(...args);
}

// Helper for resolve-ability
export function resolveAbilityFn(...args: any[]): void {
  (coreEngine.resolveAbility as any)?.(...args);
}

// Helper for not-used-once?
export function notUsedOnceFn(state: State, opts: any, card: Card): boolean {
  return coreEngine.notUsedOnce?.(state, opts, card) ?? true;
}

// Helper for can-trigger?
export function canTriggerFn(
  state: State,
  side: Side,
  eid: EID,
  ability: any,
  card: Card,
  targets: any[],
): boolean {
  return (
    coreEngine.canTrigger?.(state, side, eid, ability, card, targets) ?? true
  );
}

// Helper for register-once
export function registerOnceFn(
  state: State,
  side: Side,
  ability: any,
  card: Card,
): void {
  coreEngine.registerOnce?.(state, side, ability, card);
}

// Helper for register-events
export function registerEventsFn(...args: any[]): void {
  (coreEngine.registerEvents as any)?.(...args);
}

// Helper for unregister-floating-events
export function unregisterFloatingEventsFn(...args: any[]): void {
  (coreEngine.unregisterFloatingEvents as any)?.(...args);
}

// Helper for unregister-suppress-by-uuid
function unregisterSuppressByUuidFn(
  state: State,
  side: Side,
  uuid: string,
): void {
  coreEngine.unregisterSuppressByUuid?.(state, side, uuid);
}

// Helper for trigger-event
export function triggerEventFn(...args: any[]): void {
  (coreEngine.triggerEvent as any)?.(...args);
}

// Helper for unregister-effects-for-card
function unregisterEffectsForCardFn(
  state: State,
  side: Side,
  card: Card,
): void {
  coreEffects.unregisterEffectsForCard?.(state, side, card);
}

// Helper for unregister-lingering-effects
export function unregisterLingeringEffectsFn(...args: any[]): void {
  (coreEffects.unregisterLingeringEffects as any)?.(...args);
}

// Helper for any-effects
export function anyEffectsFn(
  state: State,
  side: Side,
  effectType: string,
  value: any,
  card: Card,
  opts: any,
): boolean {
  return coreEffects.anyEffects?.(state, side, effectType, value, card, opts) ?? false;
}

// Helper for register-lingering-effect
export function registerLingeringEffectFn(...args: any[]): string {
  return (coreEffects.registerLingeringEffect as any)?.(...args) || "";
}

// Helper for unregister-effect-by-uuid
export function unregisterEffectByUuidFn(...args: any[]): void {
  (coreEffects.unregisterEffectByUuid as any)?.(...args);
}

// Helper for get-autoresolve
export function getAutoresolveFn(...args: any[]): any {
  return (coreOptional.getAutoresolve as any)?.(...args);
}

// Helper for never?
export function neverFn(x: unknown): boolean {
  return coreOptional.never?.(x) ?? false;
}

// Helper for set-autoresolve
function setAutoresolveFn(key: string, value: string): any {
  return coreOptional.setAutoresolve?.(key, value);
}

// Helper for run-any-server-ability
export function runAnyServerAbilityFn(...args: any[]): any {
  return (coreDefHelpers.runAnyServerAbility as any)?.(...args);
}

// Helper for host
export function hostFn(...args: any[]): void {
  (coreHosting.host as any)?.(...args);
}

// Helper for runner-can-pay-and-install?
export function runnerCanPayAndInstallFn(...args: any[]): boolean {
  return (coreInstalling.runnerCanPayAndInstall as any)?.(...args);
}

// Helper for runner-install
export function runnerInstallFn(...args: any[]): void {
  (coreInstalling.runnerInstall as any)?.(...args);
}

// Helper for access-bonus
export function accessBonusFn(...args: any[]): void {
  (coreAccess.accessBonus as any)?.(...args);
}

// Helper for access-card
export function accessCardFn(...args: any[]): void {
  (coreAccess.accessCard as any)?.(...args);
}

// Helper for turn-archives-faceup
export function turnArchivesFaceupFn(...args: any[]): void {
  (coreAccess.turnArchivesFaceup as any)?.(...args);
}

// Helper for get-only-card-to-access
export function getOnlyCardToAccessFn(state: State): Card | null {
  return coreAccess.getOnlyCardToAccess?.(state) ?? null;
}

// Helper for total-cards-accessed
export function totalCardsAccessedFn(...args: any[]): number {
  return (coreRuns.totalCardsAccessed as any)?.(...args);
}

// Helper for bypass-ice
export function bypassIceFn(...args: any[]): void {
  (coreRuns.bypassIce as any)?.(...args);
}

// Helper for end-run
export function endRunFn(...args: any[]): void {
  (coreRuns.endRun as any)?.(...args);
}

// Helper for get-current-encounter
export function getCurrentEncounterFn(state: State): any {
  return coreRuns.getEncounter?.(state) || {};
}

// Helper for make-run
export function makeRunFn(...args: any[]): void {
  (coreRuns.makeRun as any)?.(...args);
}

// Helper for jack-out
export function jackOutFn(...args: any[]): void {
  (coreRuns.jackOut as any)?.(...args);
}

// Helper for prevent-tag
export function preventTagFn(...args: any[]): void {
  (corePrevention.preventTag as any)?.(...args);
}

// Helper for prevent-end-run
export function preventEndRunFn(...args: any[]): void {
  (corePrevention.preventEndRun as any)?.(...args);
}

// Helper for prevent-damage
export function preventDamageFn(...args: any[]): void {
  (corePrevention.preventDamage as any)?.(...args);
}

// Helper for prevent-encounter
export function preventEncounterFn(...args: any[]): void {
  (corePrevention.preventEncounter as any)?.(...args);
}

// Helper for preventable?
export function preventableFn(...args: any[]): boolean {
  return (corePrevention.preventable as any)?.(...args);
}

// Helper for damage-name
export function damageNameFn(...args: any[]): string {
  return (coreDamage.damageName as any)?.(...args);
}

// Helper for damage-type
export function damageTypeFn(...args: any[]): string {
  return (coreDamage.damageType as any)?.(...args);
}

// Helper for chosen-damage
export function chosenDamageFn(...args: any[]): void {
  (coreDamage.chosenDamage as any)?.(...args);
}

// Helper for enable-runner-damage-choice
export function enableRunnerDamageChoiceFn(...args: any[]): void {
  (coreDamage.enableRunnerDamageChoice as any)?.(...args);
}

// Helper for runner-can-choose-damage?
export function runnerCanChooseDamageFn(state: State): boolean {
  return coreDamage.runnerCanChooseDamage?.(state) ?? false;
}

// Helper for prevent-up-to-n-damage
export function preventUpToNDamageFn(...args: any[]): any {
  return (corePrevention.preventUpToNDamage as any)?.(...args);
}

// Helper for prevent-encounter
function preventEncounterFn2(...args: any[]): void {
  (corePrevention.preventEncounter as any)?.(...args);
}

// Helper for zone-locked?
export function zoneLockedFn(
  state: State,
  side: string,
  zone: string,
): boolean {
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
export function getCounters(...args: any[]): number {
  return (coreCard.getCounters as any)?.(...args);
}

// Helper for add-counter
export function addCounterFn(...args: any[]): void {
  (coreProps.addCounter as any)?.(...args);
}

// Helper for gain-clicks
export function gainClicksFn(...args: any[]): void {
  (coreGaining.gainClicks as any)?.(...args);
}

// Helper for lose-clicks
function loseClicksFn(...args: any[]): void {
  (coreGaining.loseClicks as any)?.(...args);
}

// Helper for gain-credits
export function gainCreditsFn(...args: any[]): void {
  (coreGaining.gainCredits as any)?.(...args);
}

// Helper for lose-credits
export function loseCreditsFn(...args: any[]): void {
  (coreGaining.loseCredits as any)?.(...args);
}

// Helper for gain-tags
export function gainTagsFn(...args: any[]): void {
  (coreTags.gainTags as any)?.(...args);
}

// Helper for lose-tags
export function loseTagsFn(...args: any[]): void {
  (coreTags.loseTags as any)?.(...args);
}

// Helper for draw
export function drawFn(...args: any[]): void {
  (coreDrawing.draw as any)?.(...args);
}

// Helper for mill
export function millFn(...args: any[]): void {
  (coreMoving.mill as any)?.(...args);
}

// Helper for move
export function moveFn(...args: any[]): void {
  (coreMoving.move as any)?.(...args);
}

// Helper for trash — forward all args.
export function trashFn(...args: any[]): void {
  (coreMoving.trash as any)?.(...args);
}

// Helper for trash-cards
export function trashCardsFn(...args: any[]): void {
  (coreMoving.trashCards as any)?.(...args);
}

// Helper for trash-on-empty
export function trashOnEmptyFn(...args: any[]): any {
  return (coreDefHelpers.trashOnEmpty as any)?.(...args);
}

// Helper for reveal
export function revealFn(...args: any[]): void {
  (coreRevealing.reveal as any)?.(...args);
}

// Helper for expose
export function exposeFn(...args: any[]): void {
  (coreExpose.expose as any)?.(...args);
}

// Helper for find-card
export function findCardFn(...args: any[]): Card | null {
  return (coreFinding.findCard as any)?.(...args);
}

// Helper for find-latest
export function findLatestFn(...args: any[]): any {
  return (coreFinding.findLatest as any)?.(...args);
}

// Helper for all-active
export function allActiveFn(...args: any[]): Card[] {
  return (coreBoard.allActive as any)?.(...args);
}

// Helper for all-active-installed
export function allActiveInstalledFn(...args: any[]): Card[] {
  return (coreBoard.allActiveInstalled as any)?.(...args);
}

// Helper for all-installed
export function allInstalledFn(...args: any[]): Card[] {
  return (coreBoard.allInstalled as any)?.(...args);
}

// Helper for runnable-servers
export function runnableServersFn(state: State, side?: string, eid?: any, card?: any): string[] {
  return coreBoard.runnableServers?.(state, side, eid, card) || [];
}

// Helper for is-central?
export function isCentralFn(...args: any[]): boolean {
  return (coreServers.isCentral as any)?.(...args);
}

// Helper for target-server
export function targetServerFn(...args: any[]): string {
  return (coreServers.targetServer as any)?.(...args);
}

// Helper for zone->name
export function zoneNameFn(...args: any[]): string {
  return (coreServers.zoneName as any)?.(...args);
}

// Helper for threat-level
export function threatLevelFn(level: number, state: State): boolean {
  return coreThreat.threatLevel?.(level, state) ?? true;
}

// Helper for win
export function winFn(...args: any[]): void {
  (coreWinning.win as any)?.(...args);
}

// Helper for play-ability
export function playAbilityFn(...args: any[]): void {
  (coreActions.playAbility as any)?.(...args);
}

// Helper for play-instant
export function playInstantFn(...args: any[]): void {
  (corePlayInstants.playInstant as any)?.(...args);
}

// Helper for as-agenda
export function asAgendaFn(...args: any[]): void {
  (coreMoving.asAgenda as any)?.(...args);
}

// Helper for swap-agendas
export function swapAgendasFn(...args: any[]): void {
  (coreMoving.swapAgendas as any)?.(...args);
}

// Helper for update!
export function updateFn(...args: any[]): void {
  (coreUpdate.update as any)?.(...args);
}

// Helper for get-card
export function getCardFn(...args: any[]): Card {
  return (coreCard.getCard as any)?.(...args);
}

// Helper for in-deck?
export function inDeckFn(...args: any[]): boolean {
  return (coreCard.inDeck as any)?.(...args);
}

// Helper for in-discard?
export function inDiscardFn(...args: any[]): boolean {
  return (coreCard.inDiscard as any)?.(...args);
}

// Helper for in-hand?
export function inHandFn(...args: any[]): boolean {
  return (coreCard.inHand as any)?.(...args);
}

// Helper for in-scored?
export function inScoredFn(...args: any[]): boolean {
  return (coreCard.inScored as any)?.(...args);
}

// Helper for installed?
export function installedFn(...args: any[]): boolean {
  return (coreCard.installed as any)?.(...args);
}

// Helper for rezzed?
export function rezzedFn(...args: any[]): boolean {
  return (coreCard.rezzed as any)?.(...args);
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
export function hasSubtypeFn(...args: any[]): boolean {
  return (coreCard.hasSubtype as any)?.(...args);
}

// Helper for has-any-subtype?
export function hasAnySubtypeFn(...args: any[]): boolean {
  return (coreCard.hasAnySubtype as any)?.(...args);
}

// Helper for is-type?
export function isTypeFn(...args: any[]): boolean {
  return (coreCard.isType as any)?.(...args);
}

// Helper for card predicates
export function agendaFn(...args: any[]): boolean {
  return (coreCard.agenda as any)?.(...args);
}

export function corpFn(arg: any): any {
  // Polymorphic: when called with a Card, return predicate; when called with state, return corp state.
  if (arg && typeof arg === "object" && "corp" in arg && "runner" in arg) {
    return (arg as any).corp;
  }
  return (coreCard.corp as any)?.(arg);
}

export function eventFn(...args: any[]): boolean {
  return (coreCard.event as any)?.(...args);
}

export function iceFn(...args: any[]): boolean {
  return (coreCard.ice as any)?.(...args);
}

export function hardwareFn(...args: any[]): boolean {
  return (coreCard.hardware as any)?.(...args);
}

export function programFn(...args: any[]): boolean {
  return (coreCard.program as any)?.(...args);
}

export function resourceFn(...args: any[]): boolean {
  return (coreCard.resource as any)?.(...args);
}

export function runnerFn(arg: any): any {
  // Polymorphic: when called with a Card, return predicate; when called with state, return runner state.
  if (arg && typeof arg === "object" && "runner" in arg && "corp" in arg) {
    return (arg as any).runner;
  }
  return coreCard.runner(arg as Card);
}

export function virusProgramFn(...args: any[]): boolean {
  return (coreCard.virusProgram as any)?.(...args);
}

// Helper for first-event?
export function firstEventFn(...args: any[]): boolean {
  return (coreEvents.firstEvent as any)?.(...args);
}

// Helper for first-run-event?
function firstRunEventFn(...args: any[]): boolean {
  return (coreEvents.firstEvent as any)?.(...args);
}

// Helper for first-trash?
function firstTrashFn(state: State, pred?: (entry: any) => unknown): boolean {
  return coreEvents.firstTrash?.(state, pred) ?? false;
}

// Helper for no-event?
export function noEventFn(
  state: State,
  side: Side | null,
  event: string,
  pred?: any,
): boolean {
  return coreEvents.noEvent?.(state, side, event, pred) ?? true;
}

// Helper for event-count
export function eventCountFn(...args: any[]): number {
  return (coreEvents.eventCount as any)?.(...args) ?? 0;
}

// Helper for run-events
export function runEventsFn(state: State, side: Side, event: string): any[] {
  return coreEvents.runEvents?.(state, side, event) || [];
}

// Helper for tagged
export function isTaggedFn(state: State): boolean {
  return !!(state as any).tagged;
}

// Helper for remove-once
function removeOnceFn(arr: any[], item: any): any[] {
  const idx = arr.indexOf(item);
  if (idx >= 0) {
    return [...arr.slice(0, idx), ...arr.slice(idx + 1)];
  }
  return arr;
}
