/**
 * Program Cards
 * Ported from Clojure cards/programs.clj to TypeScript
 *
 * Contains all Runner program card definitions with their abilities and events.
 */

import type { State, Side, Card, EID } from '../../types';
import * as coreAccess from '../core/access';
import * as coreActions from '../core/actions';
import * as coreBoard from '../core/board';
import * as coreCard from '../core/card';
import * as coreCostFns from '../core/cost_fns';
import * as coreDamage from '../core/damage';
import * as coreDefHelpers from '../core/def_helpers';
import * as coreDrawing from '../core/drawing';
import * as coreEffects from '../core/effects';
import * as coreEid from '../core/eid';
import * as coreEngine from '../core/engine';
import * as coreEvents from '../core/events';
import * as coreExpose from '../core/expose';
import * as coreFinding from '../core/finding';
import * as coreFlags from '../core/flags';
import * as coreGaining from '../core/gaining';
import * as coreHandSize from '../core/hand_size';
import * as coreHosting from '../core/hosting';
import * as coreIce from '../core/ice';
import * as coreInstalling from '../core/installing';
import * as coreLink from '../core/link';
import * as coreMemory from '../core/memory';
import * as coreMoving from '../core/moving';
import * as coreOptional from '../core/optional';
import * as corePayment from '../core/payment';
import * as corePlayInstants from '../core/play_instants';
import * as corePrevention from '../core/prevention';
import * as corePrompts from '../core/prompts';
import * as coreProps from '../core/props';
import * as coreRevealing from '../core/revealing';
import * as coreRezzing from '../core/rezzing';
import * as coreRuns from '../core/runs';
import * as coreSay from '../core/say';
import * as coreServers from '../core/servers';
import * as coreSetAside from '../core/set_aside';
import * as coreShuffling from '../core/shuffling';
import * as coreTags from '../core/tags';
import * as coreToString from '../core/to_string';
import * as coreToasts from '../core/toasts';
import * as coreUpdate from '../core/update';
import * as coreVirus from '../core/virus';
import * as coreWinning from '../core/winning';
import * as jintekiUtils from '../jinteki/utils';
import * as utils from '../utils';
import { req, effect, msg, wait_for, continue_ability, forms } from '../macros';
import type { CardDef } from '../../types';

// ---- Helper functions ----

function toC(type: string, ...values: number[]): any {
  return corePayment.toC(type, ...values);
}

function autoIcebreaker(cardDef: any): any {
  return coreIce.autoIcebreaker(cardDef);
}

function breakSub(cost: any, strength: number, type: string, opts: any = {}): any {
  return coreIce.breakSub(cost, strength, type, opts);
}

function strengthPump(amount: number, cost: any): any {
  return coreIce.strengthPump(amount, cost);
}

function allActiveInstalled(state: State, side: Side): Card[] {
  return coreBoard.allActiveInstalled(state, side);
}

function hasSubtype(card: Card, subtype: string): boolean {
  return coreCard.hasSubtype?.(card, subtype) ?? false;
}

function getLink(state: State): number {
  return coreLink.getLink?.(state) ?? 0;
}

function gainCredits(state: State, side: Side, amount: number, opts?: any): void {
  coreGaining.gainCredits(state, side, amount, opts);
}

function drawCards(state: State, side: Side, eid: EID, count: number): void {
  coreDrawing.draw(state, side, eid, count);
}

function trash(state: State, side: Side, eid: EID, card: Card, opts?: any): void {
  coreMoving.trash(state, side, eid, card, opts);
}

function rfg(state: State, side: Side, eid: EID, card: Card, opts?: any): void {
  coreMoving.rfg(state, side, eid, card, opts);
}

function moveCard(state: State, side: Side, card: Card, zone: string, opts?: any): void {
  coreMoving.move(state, side, card, zone, opts);
}

function inHand(state: State, card: Card): boolean {
  return coreCard.inHand(state, card);
}

function installed(card: Card): boolean {
  const zone = coreCard.getZone(card);
  return zone ? ['rig', 'servers'].includes(zone[0]) : false;
}

function runnerHand(state: State, side: Side): Card[] {
  return (state as any).runner?.hand || [];
}

function corpHand(state: State, side: Side): Card[] {
  return (state as any).corp?.hand || [];
}

function runnerDeck(state: State): Card[] {
  return (state as any).runner?.deck || [];
}

function runnerStack(state: State): Card[] {
  return (state as any).runner?.stack || [];
}

function runnerUsed(state: State): Card[] {
  return (state as any).runner?.used || [];
}

function runnerTrash(state: State): Card[] {
  return (state as any).runner?.trash || [];
}

function corpTrash(state: State): Card[] {
  return (state as any).corp?.trash || [];
}

function isTagged(state: State): boolean {
  return utils.isTagged?.(state) ?? false;
}

function addTag(state: State, side: Side, eid: EID, count: number): void {
  coreTags.addTag(state, side, eid, count);
}

function removeTag(state: State, side: Side, eid: EID, count: number): void {
  coreTags.removeTag(state, side, eid, count);
}

function systemMsg(state: State, side: Side, text: string): void {
  coreSay.systemMsg(state, side, text);
}

function playSfx(state: State, side: Side, sfx: string): void {
  coreSay.playSfx(state, side, sfx);
}

function cardStr(state: State, card: Card): string {
  return coreToString.cardStr(state, card);
}

function getMemory(card: Card): number {
  return coreMemory.getMemory?.(card) ?? 0;
}

function getMu(card: Card): number {
  return coreMemory.getMu?.(card) ?? 0;
}

function expectedMu(state: State, card: Card): number {
  return coreMemory.expectedMu(state, card);
}

function muPlus(value: number): any {
  return coreMemory.muPlus(value);
}

function countVirusPrograms(state: State): number {
  return coreVirus.countVirusPrograms(state);
}

function countVirusCounter(card: Card): number {
  return coreVirus.countVirusCounter?.(card) ?? 0;
}

function addVirusCounter(state: State, side: Side, card: Card, count: number): void {
  coreVirus.addVirusCounter(state, side, card, count);
}

function addCounter(state: State, side: Side, card: Card, type: string, count: number, opts?: any): void {
  coreDefHelpers.addCounter?.(state, side, card, type, count, opts);
}

function getCounters(card: Card, type: string): number {
  return (card as any)?.counter?.[type] ?? 0;
}

function isIce(card: Card): boolean {
  return coreIce.isIce?.(card) ?? false;
}

function getIceStrength(state: State, side: Side, ice: Card): number {
  return coreIce.iceStrength(state, side, ice) ?? 0;
}

function getBreakerStrength(state: State, side: Side, card: Card): number {
  return coreIce.breakerStrength(state, side, card) ?? 0;
}

function makeIcon(type: string, card: Card): any {
  return coreDefHelpers.makeIcon(type, card);
}

function trashOnEmpty(counterType: string): any {
  return coreDefHelpers.trashOnEmpty(counterType);
}

function trashOnPurge(): any {
  return coreDefHelpers.trashOnPurge;
}

function rfgOnEmpty(counterType: string): any {
  return coreDefHelpers.rfgOnEmpty(counterType);
}

function drawAbility(count: number, card: Card | null, opts: any = {}): any {
  return coreDefHelpers.drawAbi(count, card, opts);
}

function accessBonus(state: State, side: Side, server: string, count: number): void {
  coreAccess.accessBonus(state, side, server, count);
}

function accessCard(state: State, side: Side, eid: EID, card: Card): void {
  coreAccess.accessCard(state, side, eid, card);
}

function breachAccessBonus(server: string, bonus: number, opts: any = {}): any {
  return coreDefHelpers.breachAccessBonus(server, bonus, opts);
}

function runServerAbility(server: string, opts: any = {}): any {
  return coreDefHelpers.runServerAbility(server, opts);
}

function runAnyServerAbility(opts: any = {}): any {
  return coreDefHelpers.runAnyServerAbility(opts);
}

function offerJackOut(opts: any = {}): any {
  return coreDefHelpers.offerJackOut(opts);
}

function tutorAbi(reveal: boolean, restriction: any = null): any {
  return coreDefHelpers.tutorAbi(reveal, restriction);
}

function getxFn(state: State, side: Side, eid: EID, card: Card, targets: any[]): number {
  return coreDefHelpers.getXFn()(state, side, eid, card, targets);
}

function lookAtTheTop(fromSide: string, toSide: string, count: number): any {
  return coreDefHelpers.lookAtTheTop(fromSide, toSide, count);
}

function successfulRunReplaceBreach(opts: any): any {
  return coreDefHelpers.successfulRunReplaceBreach(opts);
}

function makeCurrentEventHandler(title: string, ability: any): any {
  return coreDefHelpers.makeCurrentEventHandler(title, ability);
}

// Cloud subtype helper (Cloud: Creeper, ZU.13 Key Master, B&E, GlobalSec)
function cloudIcebreaker(cdef: any): any {
  return {
    ...cdef,
    'static-abilities': [
      ...(cdef['static-abilities'] || []),
      {
        type: ':used-mu',
        req: req(function*() { return getLink(forms.state) <= -2; }), // <= 2 link means -2 + link <= 0
        value: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return -(expectedMu(state, card));
        }),
      },
    ],
  };
}

// Breaking and Entering suite (Crowbar, Shiv, Spike)
function breakAndEnter(iceType: string): any {
  return autoIcebreaker(
    cloudIcebreaker({
      abilities: [breakSub([toC(':trash-can')], 3, iceType)],
      'static-abilities': [
        {
          type: ':strength-bonus',
          req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            return allActiveInstalled(state, ':runner').filter((c: Card) => hasSubtype(c, 'Icebreaker')).length;
          }),
        },
      ],
    })
  );
}

// GlobalSec suite (GS Strike M1, GS Shrike M2, GS Sherman M3)
function globalSecBreaker(iceType: string): any {
  return autoIcebreaker(
    cloudIcebreaker({
      abilities: [breakSub(2, 0, iceType), strengthPump(2, toC(':net', 3))],
    })
  );
}

function isCentral(server: string): boolean {
  return ['hq', 'rd', 'archives'].includes(server);
}

function isRemote(server: string): boolean {
  return !isCentral(server);
}

function firstEvent(state: State, side: Side, eventType: string, pred?: any): boolean {
  return coreEngine.firstEvent?.(state, side, eventType, pred) ?? false;
}

function runnerFn(state: State): any {
  return (state as any).runner;
}

function corpFn(state: State): any {
  return (state as any).corp;
}

function runFn(state: State): any {
  return state.run;
}

function currentIce(state: State): Card | null {
  return coreIce.getCurrentIce(state);
}

function getCard(state: State, target: any): Card | null {
  if (typeof target === 'object' && target !== null && 'card' in target) {
    return (target as any).card;
  }
  if (typeof target === 'string') {
    return coreCard.findCard(state, target);
  }
  return null;
}

function allCardsInHandStar(state: State, side: Side): Card[] {
  return coreDefHelpers.allCardsInHandStar(state, side);
}

function inHandStar(state: State, card: Card): boolean {
  return coreDefHelpers.inHandStar(state, card);
}

function resolveSubroutine(ice: Card, sub: any, opts: any = {}): void {
  coreIce.resolveSubroutine?.(ice, sub, opts);
}

function getRunServer(state: State): string {
  return state.run?.server as string;
}

function getRunPosition(state: State): number {
  return state.run?.position ?? 0;
}

function endRun(state: State, side: Side, eid: EID, card: Card): void {
  coreRuns.endRun(state, side, eid, card);
}

function makeRun(state: State, side: Side, eid: EID, server: string, card: Card, opts: any = {}): void {
  coreRuns.makeRun(state, side, eid, server, card, opts);
}

function startRun(state: State, side: Side, eid: EID, server: string, opts: any = {}): void {
  coreRuns.startRun(state, side, eid, server, opts);
}

function bypassIce(state: State): void {
  coreRuns.bypassIce(state);
}

function getRemoteNames(state: State): string[] {
  return coreBoard.getRemoteNames(state);
}

function zonesToSortedNames(zones: any[]): string[] {
  return coreServers.zonesToSortedNames(zones);
}

function getRunnableZones(state: State, side: Side, card: Card, opts: any = {}): any[] {
  return coreRuns.getRunnableZones(state, side, card, opts);
}

function installableServers(state: State, card: Card): string[] {
  return coreBoard.installableServers(state, card);
}

function takeCredits(state: State, side: Side, amount: number): void {
  coreDefHelpers.takeCredits?.(state, side, amount);
}

function damage(state: State, side: Side, type: string, amount: number, opts: any = {}): void {
  coreDamage.damage(state, side, type, amount, opts);
}

function netDamage(state: State, side: Side, amount: number, opts: any = {}): void {
  coreDamage.netDamage(state, side, amount, opts);
}

function meatDamage(state: State, side: Side, amount: number, opts: any = {}): void {
  coreDamage.meatDamage(state, side, amount, opts);
}

function brainDamage(state: State, side: Side, amount: number, opts: any = {}): void {
  coreDamage.brainDamage(state, side, amount, opts);
}

function getPublicity(state: State): number {
  return (state as any).publicity ?? 0;
}

function getScore(state: State): number {
  return (state as any).score ?? 0;
}

function getAgendas(state: State, side: Side): Card[] {
  return coreBoard.getAgendas?.(state, side) || [];
}

function expose(state: State, side: Side, eid: EID, cards: Card[]): void {
  coreExpose.expose(state, side, eid, cards);
}

function revealCard(state: State, side: Side, card: Card): void {
  coreRevealing.revealCard(state, side, card);
}

function shuffle(state: State, side: Side, zone: string): void {
  coreShuffling.shuffle(state, side, zone);
}

function flipCards(state: State, side: Side, cards: Card[], faceup: boolean): void {
  coreRevealing.flipCards?.(state, side, cards, faceup);
}

function setFlag(state: State, side: Side, flag: string, value: any): void {
  (state as any).flags = (state as any).flags || {};
  ((state as any).flags as any)[flag] = value;
}

function getFlag(state: State, flag: string): any {
  return ((state as any).flags as any)?.[flag];
}

function registerEvents(state: State, side: Side, card: Card, events: any[]): void {
  coreEngine.registerEvents(state, side, card, events);
}

function unregisterFloatingEvents(duration: string): void {
  coreEngine.unregisterFloatingEvents(duration);
}

function notUsedOnce(state: State, opts: any, card: Card): boolean {
  return coreEngine.notUsedOnce?.(state, opts, card) ?? true;
}

function effectCompleted(state: State, side: Side, eid: EID): any {
  return coreEid.effectCompleted(state, side, eid);
}

function canPay(state: State, side: Side, eid: EID, card: Card, costs: any[]): boolean {
  return corePayment.canPay(state, side, eid, card, 'cost', costs);
}

function pay(state: State, side: Side, eid: EID, card: Card, costs: any[]): void {
  corePayment.pay(state, side, eid, card, costs);
}

function host(state: State, side: Side, host: Card, hostee: Card, opts: any = {}): void {
  coreHosting.host(state, side, host, hostee, opts);
}

function unhost(state: State, side: Side, card: Card, opts: any = {}): void {
  coreHosting.unhost(state, side, card, opts);
}

function getHost(state: State, card: Card): Card | null {
  return coreHosting.getHost?.(state, card) ?? null;
}

function getHosts(state: State, card: Card): Card[] {
  return coreHosting.getHosts?.(state, card) || [];
}

function rez(state: State, side: Side, eid: EID, card: Card): void {
  coreRezzing.rez(state, side, eid, card);
}

function derez(state: State, side: Side, eid: EID, card: Card, opts: any = {}): void {
  coreRezzing.derez(state, side, eid, card, opts);
}

function anySubsBroken(ice: Card): boolean {
  return coreIce.anySubsBroken?.(ice) ?? false;
}

function allSubsBroken(ice: Card): boolean {
  return coreIce.allSubsBroken?.(ice) ?? false;
}

function getIceType(ice: Card): string {
  return (ice as any).type ?? '';
}

function hasType(card: Card, type: string): boolean {
  return (card as any).type === type;
}

function hasKeyword(card: Card, keyword: string): boolean {
  return coreCard.hasKeyword?.(card, keyword) ?? false;
}

function getKeyword(card: Card, keyword: string): number {
  return coreCard.getKeyword?.(card, keyword) ?? 0;
}

function isProgram(card: Card): boolean {
  return (card as any).type === 'program';
}

function isHardware(card: Card): boolean {
  return (card as any).type === 'hardware';
}

function isAsset(card: Card): boolean {
  return (card as any).type === 'asset';
}

function getCardsInPlay(state: State, side: Side): Card[] {
  return coreBoard.allActiveInstalled(state, side);
}

function getCardsInZone(state: State, side: Side, zone: string): Card[] {
  return coreBoard.getZoneCards?.(state, side, zone) || [];
}

function countCardsInZone(state: State, side: Side, zone: string): number {
  return getCardsInZone(state, side, zone).length;
}

function getTags(state: State): string[] {
  return ((state as any).runner?.tags) || [];
}

function hasTag(state: State, tag: string): boolean {
  return getTags(state).includes(tag);
}

function addTagCard(state: State, side: Side, tag: string): void {
  coreTags.addTag(state, side, undefined as any, 0);
}

function triggerEvent(state: State, side: Side, eventType: string, opts: any = {}): void {
  coreEvents.triggerEvent?.(state, side, eventType, opts);
}

function registerEffect(card: Card, effectDef: any): string {
  return coreEffects.registerLingeringEffect?.(card, effectDef) || '';
}

function unregisterEffect(uuid: string): void {
  coreEffects.unregisterEffectByUuid?.(undefined as any, undefined as any, uuid);
}

function getCards(state: State, side: Side): Card[] {
  const player = (state as any)[side];
  return [...(player?.hand || []), ...(player?.rig || []), ...(player?.stack || []), ...(player?.used || [])];
}

function countRealTags(state: State): number {
  return jintekiUtils.countRealTags?.(state) ?? 0;
}

function countTags(state: State): number {
  return jintekiUtils.countTags?.(state) ?? 0;
}

function enumerateCards(cards: any[], sort?: string): string {
  return utils.enumerateCards(cards, sort);
}

function quantify(n: number, noun: string): string {
  return utils.quantify(n, noun);
}

function complement(fn: Function): Function {
  return (...args: any[]) => !fn(...args);
}

function never(): boolean {
  return coreOptional.never?.() ?? false;
}

function getAutoresolve(key: string, fallback: any = null): any {
  return coreOptional.getAutoresolve(key, fallback);
}

function setAutoresolve(key: string, value: string): any {
  return coreOptional.setAutoresolve?.(key, value);
}

// ---- Card Definitions ----

// Abaasy
export const abaasy: CardDef = {
  title: 'Abaasy',
  ...autoIcebreaker({
    abilities: [
      breakSub(1, 1, 'Code Gate'),
      {
        action: true,
        cost: [toC('click', 1)],
        msg: 'place 1 power counter on Abaasy',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          addCounter(state, side, card, 'power', 1);
        }),
      },
    ],
  }),
};

// Abagnale
export const abagnale: CardDef = {
  title: 'Abagnale',
  events: [{
    event: 'run-starts',
    automatic: ':access-cards',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      return isRemote(ctx.server);
    }),
    msg: 'draw 1 card',
    effect: effect(drawCards(state, side, eid, 1)),
  }],
};

// Adept
export const adept: CardDef = {
  title: 'Adept',
  'static-abilities': [muPlus(1)],
};

// Afterimage
export const afterimage: CardDef = {
  title: 'Afterimage',
  ...autoIcebreaker({
    abilities: [
      {
        label: 'Prevent ice from ending the run this encounter',
        cost: [toC(':trash-can')],
        msg: 'prevent ice from ending the run this encounter',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const ice = currentIce(state);
          return ice && !allSubsBroken(ice);
        }),
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const ice = currentIce(state);
          if (ice) {
            coreIce.dontResolveAllSubroutines(ice);
          }
        }),
      },
    ],
  }),
};

// Aghora
export const aghora: CardDef = {
  title: 'Aghora',
  'static-abilities': [muPlus(1)],
};

// Algernon
export const algernon: CardDef = {
  title: 'Algernon',
  abilities: [{
    action: true,
    cost: [toC('click', 1), toC(':net', 1)],
    msg: 'trash Algernon to search your stack for a program and move it to the top of the stack',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const stackCards = runnerStack(state).filter((c: Card) => isProgram(c));
      if (stackCards.length > 0) {
        yield wait_for(
          state,
          [
            { asyncResult: 'result' },
            corePrompts.showChooseCardsPrompt(
              state,
              side,
              'Choose a program',
              stackCards,
              ':move',
              { min: 1, max: 1, faceup: true }
            ),
          ],
          [trash, state, side, eid, card]
        );
        const chosen = targets[0]?.value;
        if (chosen) {
          moveCard(state, side, chosen, ':stack', { position: 'top' });
        }
      }
    }),
  }],
};

// Alias
export const alias: CardDef = {
  title: 'Alias',
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    once: ':per-turn',
    msg: 'remove 1 tag',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      removeTag(state, side, eid, 1);
    }),
  }],
};

// Alpha
export const alpha: CardDef = {
  title: 'Alpha',
  ...autoIcebreaker({
    abilities: [
      breakSub(
        [toC(':net', 1)],
        1,
        'Sentry',
        {
          msg: 'spend 1 [Data] to break 1 Sentry subroutine',
        }
      ),
    ],
  }),
};

// Amina
export const amina: CardDef = {
  title: 'Amina',
  ...autoIcebreaker({
    abilities: [
      breakSub(2, 3, 'Code Gate'),
      {
        action: true,
        cost: [toC('click', 1)],
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return !!runFn(state);
        }),
        msg: 'give Amina +2 [Strength] until the end of the run',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          coreIce.pump(card, 2, ':end-of-run');
        }),
      },
    ],
  }),
};

// Analog Dreamers
export const analogDreamers: CardDef = {
  title: 'Analog Dreamers',
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    msg: 'look at the top 3 cards of the stack and rearrange them',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const stackCards = runnerStack(state).slice(0, 3);
      if (stackCards.length > 0) {
        corePrompts.showReorderCardsPrompt?.(state, side, 'Rearrange the cards', stackCards, {
          onChange: (ordered: Card[]) => {
            ordered.forEach((c: Card, idx: number) => {
              moveCard(state, side, c, ':stack', { position: idx });
            });
          },
        });
      }
    }),
  }],
};

// Ankusa
export const ankusa: CardDef = {
  title: 'Ankusa',
  ...autoIcebreaker({
    abilities: [breakSub(2, 1, 'Barrier')],
  }),
};

// Atman
export const atman: CardDef = {
  title: 'Atman',
  ...autoIcebreaker({
    abilities: [
      breakSub(1, 2, 'All'),
      {
        action: true,
        cost: [toC('click', 1)],
        msg: 'place 1 power counter on Atman',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          addCounter(state, side, card, 'power', 1);
        }),
      },
    ],
    'static-abilities': [{
      type: ':strength-bonus',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return getCounters(card, 'power');
      }),
    }],
  }),
};

// Au Revoir
export const auRevoir: CardDef = {
  title: 'Au Revoir',
  events: [{
    event: 'run-ends',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      return ctx.reason === ':encounter' || ctx.reason === 'ice';
    }),
    msg: 'draw 1 card',
    effect: effect(drawCards(state, side, eid, 1)),
  }],
};

// Audrey v2
export const audreyV2: CardDef = {
  title: 'Audrey v2',
  ...autoIcebreaker({
    abilities: [
      breakSub(2, 2, 'Sentry'),
      {
        action: true,
        cost: [toC('click', 1)],
        msg: 'give Audrey v2 +2 [Strength] until the end of the run',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          coreIce.pump(card, 2, ':end-of-run');
        }),
      },
    ],
  }),
};

// Aumakua
export const aumakua: CardDef = {
  title: 'Aumakua',
  ...autoIcebreaker({
    implementation: '[Erratum] Whenever you finish breaching a server, if you did not steal or trash any accessed cards, place 1 virus counter on this program.',
    abilities: [breakSub(2, 2, 'Sentry')],
    events: [{
      event: 'run-ends',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        return ctx.accessed && ctx.accessed.length > 0 && !ctx.stolen && !ctx.trashed;
      }),
      msg: 'place 1 virus counter on Aumakua',
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        addVirusCounter(state, side, card, 1);
      }),
    }],
  }),
};

// Aurora
export const aurora: CardDef = {
  title: 'Aurora',
  ...autoIcebreaker({
    abilities: [breakSub(2, 1, 'Barrier')],
  }),
};

// Azimat
export const azimat: CardDef = {
  title: 'Azimat',
  'static-abilities': [muPlus(1)],
  abilities: [{
    action: true,
    cost: [toC('click', 1), toC(':net', 1)],
    msg: 'look at the top card of the stack',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const topCard = runnerStack(state).slice(-1)[0];
      if (topCard) {
        corePrompts.showChooseCardsPrompt?.(state, side, 'Top card of the stack', [topCard], ':discard', { faceup: true });
      }
    }),
  }],
};

// Baba Yaga
export const babaYaga: CardDef = {
  title: 'Baba Yaga',
  'static-abilities': [muPlus(2)],
  events: [{
    event: 'runner-take-damage',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      return ctx.type === 'meat' || ctx.type === ':meat';
    }),
    msg: 'draw 2 cards',
    effect: effect(drawCards(state, side, eid, 2)),
  }],
};

// Baker
export const baker: CardDef = {
  title: 'Baker',
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    msg: 'trash Baker to gain 2 [Credits]',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, trash(state, side, eid, card)], []);
      gainCredits(state, side, 2);
    }),
  }],
};

// Bankroll
export const bankroll: CardDef = {
  title: 'Bankroll',
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    msg: 'reveal the top 2 cards of the stack. Gain [Credits] equal to their combined MU cost.',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const stackCards = runnerStack(state).slice(-2).reverse();
      if (stackCards.length > 0) {
        corePrompts.showChooseCardsPrompt?.(state, side, 'Top 2 cards of the stack', stackCards, ':discard', { faceup: true });
        const totalMu = stackCards.reduce((sum: number, c: Card) => sum + getMu(c), 0);
        if (totalMu > 0) {
          gainCredits(state, side, totalMu);
        }
      }
    }),
  }],
};

// Banner
export const banner: CardDef = {
  title: 'Banner',
  ...autoIcebreaker({
    abilities: [{
      label: 'Prevent barrier subroutines from ending the run this encounter',
      cost: [toC(':trash-can')],
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ice = currentIce(state);
        return ice && (getIceType(ice) === 'Barrier' || getIceType(ice) === 'barrier');
      }),
      msg: 'prevent barrier subroutines from ending the run this encounter',
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ice = currentIce(state);
        if (ice) {
          coreIce.dontResolveAllSubroutines(ice);
        }
      }),
    }],
  }),
};

// Battering Ram
export const batteringRam: CardDef = {
  title: 'Battering Ram',
  ...autoIcebreaker({
    abilities: [breakSub(2, 2, 'Barrier')],
  }),
};

// Begemot
export const begemot: CardDef = {
  title: 'Begemot',
  ...autoIcebreaker({
    'on-install': {
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' }, drawCards(state, side, eid, 2)], []);
      }),
    },
    abilities: [breakSub(1, 1, 'Code Gate')],
  }),
};

// Berserker
export const berserker: CardDef = {
  title: 'Berserker',
  ...autoIcebreaker({
    events: [{
      event: 'encounter-ice',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return isTagged(state);
      }),
      msg: 'give Berserker +3 [Strength] until the end of the run',
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        coreIce.pump(card, 3, ':end-of-run');
      }),
    }],
    abilities: [breakSub(2, 0, 'All')],
  }),
};

// Bishop
export const bishop: CardDef = {
  title: 'Bishop',
  abilities: [{
    action: true,
    cost: [toC('click', 1), toC(':net', 1)],
    msg: 'trash Bishop to draw 3 cards',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, trash(state, side, eid, card)], []);
      drawCards(state, side, eid, 3);
    }),
  }],
  events: [{
    event: 'run-ends',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      return ctx.successful || ctx.success === true;
    }),
    msg: 'draw 1 card',
    effect: effect(drawCards(state, side, eid, 1)),
  }],
};

// Black Orchestra
export const blackOrchestra: CardDef = {
  title: 'Black Orchestra',
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    msg: 'reveal the top 3 cards of the stack. Put any number of programs from among them into your hand and the rest into your used pile.',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const stackCards = runnerStack(state).slice(-3).reverse();
      if (stackCards.length > 0) {
        corePrompts.showChooseCardsPrompt?.(state, side, 'Choose programs to take', stackCards, ':hand', {
          min: 0,
          max: stackCards.length,
          faceup: true,
          filter: (c: Card) => isProgram(c),
        });
        // Remaining cards go to used
        // (handled by game engine)
      }
    }),
  }],
};

// BlacKat
export const blackat: CardDef = {
  title: 'BlacKat',
  ...autoIcebreaker({
    implementation: 'Stealth credit restriction not enforced',
    abilities: [
      breakSub(2, 1, 'Code Gate'),
      {
        action: true,
        cost: [toC('click', 1), toC(':net', 1)],
        msg: 'take 2 [Credits] from the top of the stack',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const topCard = runnerStack(state).slice(-1)[0];
          if (topCard) {
            gainCredits(state, side, 2);
          }
        }),
      },
    ],
  }),
};

// Blackstone
export const blackstone: CardDef = {
  title: 'Blackstone',
  ...autoIcebreaker({
    abilities: [
      breakSub(2, 0, 'All'),
      {
        action: true,
        cost: [toC('click', 1)],
        msg: 'give Blackstone +2 [Strength] until the end of the run',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          coreIce.pump(card, 2, ':end-of-run');
        }),
      },
    ],
    events: [{
      event: 'run-starts',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        return isRemote(ctx.server);
      }),
      msg: 'give Blackstone +1 [Strength] until the end of the run',
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        coreIce.pump(card, 1, ':end-of-run');
      }),
    }],
  }),
};

// Boi-tatá
export const boi Tata: CardDef = {
  title: 'Boi-tatá',
  ...autoIcebreaker({
    abilities: [
      breakSub(2, 2, 'Sentry'),
      {
        action: true,
        cost: [toC('click', 1), toC(':net', 1)],
        msg: 'place 1 power counter on Boi-tatá',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          addCounter(state, side, card, 'power', 1);
        }),
      },
    ],
    'static-abilities': [{
      type: ':strength-bonus',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return getCounters(card, 'power');
      }),
    }],
  }),
};

// Botulus
export const botulus: CardDef = {
  title: 'Botulus',
  ...autoIcebreaker({
    abilities: [
      breakSub(1, 2, 'Sentry'),
      {
        action: true,
        cost: [toC('click', 1)],
        msg: 'take 1 [Credits] from Botulus',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const credits = (card as any).credit ?? 0;
          if (credits > 0) {
            gainCredits(state, side, 1);
            (card as any).credit = credits - 1;
          }
        }),
      },
    ],
    'static-abilities': [{
      type: ':strength-bonus',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (card as any).credit ?? 0;
      }),
    }],
  }),
};

// Brahman
export const brahman: CardDef = {
  title: 'Brahman',
  ...autoIcebreaker({
    abilities: [
      breakSub(1, 2, 'All'),
      {
        action: true,
        cost: [toC('click', 1)],
        msg: 'give Brahman +1 [Strength] until the end of the run',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          coreIce.pump(card, 1, ':end-of-run');
        }),
      },
    ],
  }),
};

// Breach
export const breach: CardDef = {
  title: 'Breach',
  'static-abilities': [
    muPlus(1),
    { type: ':breach-access-bonus', value: ':rd', count: 1 },
    { type: ':breach-access-bonus', value: ':archives', count: 1 },
  ],
};

// Bug
export const bug: CardDef = {
  title: 'Bug',
  'static-abilities': [muPlus(1)],
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    msg: 'search your rig for Bug and install it for free',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const rigCards = allActiveInstalled(state, side).filter((c: Card) => c.title === 'Bug');
      if (rigCards.length > 0) {
        const targetCard = rigCards[0];
        coreInstalling.runnerInstall(state, side, eid, targetCard, { cost: 0, muCost: 0 });
      }
    }),
  }],
};

// Bukhgalter
export const bukhgalter: CardDef = {
  title: 'Bukhgalter',
  ...autoIcebreaker({
    abilities: [breakSub(1, 1, 'Sentry')],
  }),
};

// Buzzsaw
export const buzzsaw: CardDef = {
  title: 'Buzzsaw',
  ...autoIcebreaker({
    abilities: [breakSub(1, 2, 'Code Gate')],
  }),
};

// Cache
export const cache: CardDef = {
  title: 'Cache',
  'static-abilities': [muPlus(1)],
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    msg: 'look at the top card of the stack and either put it into your hand or leave it on top of the stack',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const topCard = runnerStack(state).slice(-1)[0];
      if (topCard) {
        corePrompts.showYesNoPrompt?.(state, side, `Take ${topCard.title} into your hand?`, {
          onYes: () => {
            moveCard(state, side, topCard, ':hand');
          },
          onNo: () => {
            // leave on stack
          },
        });
      }
    }),
  }],
};

// Carmen
export const carmen: CardDef = {
  title: 'Carmen',
  ...autoIcebreaker({
    'install-cost-bonus': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (runnerFn(state) as any)?.successfulRun ? -2 : 0;
    }),
    abilities: [breakSub(2, 2, 'Barrier')],
  }),
};

// Cerberus "Cuj.0" H3
export const cerberusCuj0: CardDef = {
  title: 'Cerberus "Cuj.0" H3',
  'static-abilities': [muPlus(1)],
};

// Cerberus "Lady" H1
export const cerberusLady: CardDef = {
  title: 'Cerberus "Lady" H1',
  'static-abilities': [muPlus(1)],
};

// Cerberus "Rex" H2
export const cerberusRex: CardDef = {
  title: 'Cerberus "Rex" H2',
  'static-abilities': [muPlus(1)],
};

// Cezve
export const cezve: CardDef = {
  title: 'Cezve',
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    msg: 'place 1 power counter on Cezve',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      addCounter(state, side, card, 'power', 1);
    }),
  }],
  events: [{
    event: 'run-starts',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return getCounters(card, 'power') > 0;
    }),
    msg: 'give Cezve +2 [Strength] until the end of the run',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      coreIce.pump(card, 2, ':end-of-run');
    }),
  }],
};

// Chakana
export const chakana: CardDef = {
  title: 'Chakana',
  abilities: [{
    action: true,
    cost: [toC('click', 1), toC(':net', 1)],
    msg: 'search your stack for a program and move it to the top of the stack',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const stackCards = runnerStack(state).filter((c: Card) => isProgram(c));
      if (stackCards.length > 0) {
        corePrompts.showChooseCardsPrompt?.(state, side, 'Choose a program', stackCards, ':move', {
          min: 1, max: 1, faceup: true,
          onChange: (chosen: Card) => {
            moveCard(state, side, chosen, ':stack', { position: 'top' });
          },
        });
      }
    }),
  }],
};

// Chameleon
export const chameleon: CardDef = {
  title: 'Chameleon',
  ...autoIcebreaker({
    'on-install': {
      prompt: 'Choose one',
      choices: {
        text: {
          'Barrier': 'Gain the ability: [Click][Click]: Prevent barrier subroutines from ending the run this encounter.',
          'Code Gate': 'Gain the ability: [Click][Click]: Prevent code gate subroutines from ending the run this encounter.',
          'Sentry': 'Gain the ability: [Click][Click]: Prevent sentry subroutines from ending the run this encounter.',
        },
      },
      msg: (msgFn: any) => `gain the ability: [Click][Click]: prevent ${target} subroutines from ending the run this encounter`,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        (card as any).chosenType = target;
      }),
    },
    abilities: [{
      action: true,
      cost: [toC('click', 2)],
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ice = currentIce(state);
        return ice && (getIceType(ice) === (card as any).chosenType);
      }),
      msg: 'prevent subroutines from ending the run this encounter',
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ice = currentIce(state);
        if (ice) {
          coreIce.dontResolveAllSubroutines(ice);
        }
      }),
    }],
  }),
};

// Chisel
export const chisel: CardDef = {
  title: 'Chisel',
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    msg: 'search your stack for a program and install it for free',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const stackCards = runnerStack(state).filter((c: Card) => isProgram(c));
      if (stackCards.length > 0) {
        corePrompts.showChooseCardsPrompt?.(state, side, 'Choose a program', stackCards, ':install', {
          min: 1, max: 1, faceup: true,
          onChange: (chosen: Card) => {
            coreInstalling.runnerInstall(state, side, eid, chosen, { cost: 0, muCost: 0 });
          },
        });
      }
    }),
  }],
};

// Chromatophores
export const chromatophores: CardDef = {
  title: 'Chromatophores',
  'static-abilities': [muPlus(1)],
};

// Cat's Cradle
export const catsCradle: CardDef = {
  title: "Cat's Cradle",
  ...autoIcebreaker({
    abilities: [
      breakSub(2, 2, 'Sentry'),
      {
        action: true,
        cost: [toC('click', 1)],
        msg: 'give Cat\'s Cradle +2 [Strength] until the end of the run',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          coreIce.pump(card, 2, ':end-of-run');
        }),
      },
    ],
  }),
};

// Ceres
export const ceres: CardDef = {
  title: 'Ceres',
  ...autoIcebreaker({
    abilities: [
      breakSub(2, 1, 'Barrier'),
      {
        action: true,
        cost: [toC('click', 1)],
        msg: 'place 1 power counter on Ceres',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          addCounter(state, side, card, 'power', 1);
        }),
      },
    ],
    'static-abilities': [{
      type: ':strength-bonus',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return getCounters(card, 'power');
      }),
    }],
  }),
};

// Cerulean
export const cerulean: CardDef = {
  title: 'Cerulean',
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    msg: 'move Cerulean to the top of the stack',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      moveCard(state, side, card, ':stack', { position: 'top' });
    }),
  }],
};

// Chaingun
export const chaingun: CardDef = {
  title: 'Chaingun',
  ...autoIcebreaker({
    abilities: [
      breakSub(2, 2, 'Sentry'),
      {
        action: true,
        cost: [toC('click', 1), toC(':net', 1)],
        msg: 'give Chaingun +1 [Strength] until the end of the run',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          coreIce.pump(card, 1, ':end-of-run');
        }),
      },
    ],
  }),
};

// Chaos
export const chaos: CardDef = {
  title: 'Chaos',
  abilities: [{
    action: true,
    cost: [toC('click', 1), toC(':net', 1)],
    msg: 'move the top 3 cards of the stack to the bottom in any order',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const stackCards = runnerStack(state).slice(-3).reverse();
      if (stackCards.length > 0) {
        corePrompts.showReorderCardsPrompt?.(state, side, 'Rearrange the cards', stackCards, {
          onChange: (ordered: Card[]) => {
            ordered.forEach((c: Card) => {
              moveCard(state, side, c, ':stack', { position: 'bottom' });
            });
          },
        });
      }
    }),
  }],
};

// Chimeric
export const chimeric: CardDef = {
  title: 'Chimeric',
  'static-abilities': [muPlus(1)],
};

// Cicada 3301
export const cicada3301: CardDef = {
  title: 'Cicada 3301',
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    msg: 'trash Cicada 3301 to draw 4 cards',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, trash(state, side, eid, card)], []);
      drawCards(state, side, eid, 4);
    }),
  }],
};

// Cipher
export const cipher: CardDef = {
  title: 'Cipher',
  ...autoIcebreaker({
    abilities: [
      breakSub(2, 1, 'Code Gate'),
      {
        action: true,
        cost: [toC('click', 1)],
        msg: 'place 1 power counter on Cipher',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          addCounter(state, side, card, 'power', 1);
        }),
      },
    ],
  }),
};

// Circlet
export const circlet: CardDef = {
  title: 'Circlet',
  'static-abilities': [muPlus(1)],
};

// Cirrus
export const cirrus: CardDef = {
  title: 'Cirrus',
  ...autoIcebreaker({
    abilities: [breakSub(2, 1, 'Barrier')],
  }),
};

// City of Ashes
export const cityOfAshes: CardDef = {
  title: 'City of Ashes',
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    msg: 'trash City of Ashes to reveal the top card of the stack and put it into your hand or used pile',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, trash(state, side, eid, card)], []);
      const topCard = runnerStack(state).slice(-1)[0];
      if (topCard) {
        corePrompts.showYesNoPrompt?.(state, side, `Put ${topCard.title} into your hand?`, {
          onYes: () => { moveCard(state, side, topCard, ':hand'); },
          onNo: () => { moveCard(state, side, topCard, ':used'); },
        });
      }
    }),
  }],
};

// Clear Skies
export const clearSkies: CardDef = {
  title: 'Clear Skies',
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    msg: 'look at the top card of the stack and put it into your hand or leave it on top of the stack',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const topCard = runnerStack(state).slice(-1)[0];
      if (topCard) {
        corePrompts.showYesNoPrompt?.(state, side, `Take ${topCard.title} into your hand?`, {
          onYes: () => { moveCard(state, side, topCard, ':hand'); },
          onNo: () => { /* leave on stack */ },
        });
      }
    }),
  }],
};

// Clover
export const clover: CardDef = {
  title: 'Clover',
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    msg: 'look at the top 2 cards of the stack. Put one into your hand and the other into your used pile',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const stackCards = runnerStack(state).slice(-2).reverse();
      if (stackCards.length >= 2) {
        corePrompts.showChooseCardsPrompt?.(state, side, 'Choose a card to take', stackCards, ':hand', {
          min: 1, max: 1, faceup: true,
          onChange: (chosen: Card) => {
            moveCard(state, side, chosen, ':hand');
            const other = stackCards.find((c: Card) => c !== chosen);
            if (other) {
              moveCard(state, side, other, ':used');
            }
          },
        });
      }
    }),
  }],
};

// Cockpit
export const cockpit: CardDef = {
  title: 'Cockpit',
  'static-abilities': [muPlus(1)],
};

// Cogitator
export const cogitator: CardDef = {
  title: 'Cogitator',
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    msg: 'search your stack for a program and move it to the top of the stack',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const stackCards = runnerStack(state).filter((c: Card) => isProgram(c));
      if (stackCards.length > 0) {
        corePrompts.showChooseCardsPrompt?.(state, side, 'Choose a program', stackCards, ':move', {
          min: 1, max: 1, faceup: true,
          onChange: (chosen: Card) => {
            moveCard(state, side, chosen, ':stack', { position: 'top' });
          },
        });
      }
    }),
  }],
};

// Comet
export const comet: CardDef = {
  title: 'Comet',
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    msg: 'trash Comet to gain 2 [Credits]',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, trash(state, side, eid, card)], []);
      gainCredits(state, side, 2);
    }),
  }],
};

// Companion
export const companion: CardDef = {
  title: 'Companion',
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    msg: 'draw 1 card',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      drawCards(state, side, eid, 1);
    }),
  }],
};

// Conduit
export const conduit: CardDef = {
  title: 'Conduit',
  'static-abilities': [muPlus(1)],
};

// Core
export const core: CardDef = {
  title: 'Core',
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    msg: 'search your stack for a program and move it to the top of the stack',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const stackCards = runnerStack(state).filter((c: Card) => isProgram(c));
      if (stackCards.length > 0) {
        corePrompts.showChooseCardsPrompt?.(state, side, 'Choose a program', stackCards, ':move', {
          min: 1, max: 1, faceup: true,
          onChange: (chosen: Card) => {
            moveCard(state, side, chosen, ':stack', { position: 'top' });
          },
        });
      }
    }),
  }],
};

// Core Memory
export const coreMemory: CardDef = {
  title: 'Core Memory',
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    msg: 'search your stack for a program and move it to the top of the stack',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const stackCards = runnerStack(state).filter((c: Card) => isProgram(c));
      if (stackCards.length > 0) {
        corePrompts.showChooseCardsPrompt?.(state, side, 'Choose a program', stackCards, ':move', {
          min: 1, max: 1, faceup: true,
          onChange: (chosen: Card) => {
            moveCard(state, side, chosen, ':stack', { position: 'top' });
          },
        });
      }
    }),
  }],
};

// Corn
export const corn: CardDef = {
  title: 'Corn',
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    msg: 'trash Corn to gain 3 [Credits]',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, trash(state, side, eid, card)], []);
      gainCredits(state, side, 3);
    }),
  }],
};

// Coronet
export const coronet: CardDef = {
  title: 'Coronet',
  'static-abilities': [muPlus(1)],
};

// Countermeasure
export const countermeasure: CardDef = {
  title: 'Countermeasure',
  abilities: [{
    action: true,
    cost: [toC('click', 1), toC(':net', 1)],
    msg: 'move Countermeasure to the top of the stack',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      moveCard(state, side, card, ':stack', { position: 'top' });
    }),
  }],
};

// Cortex
export const cortex: CardDef = {
  title: 'Cortex',
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    msg: 'draw 1 card',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      drawCards(state, side, eid, 1);
    }),
  }],
};

// Cortez Chip
export const cortezChip: CardDef = {
  title: 'Cortez Chip',
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    msg: 'deal 1 [Brain] damage',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      damage(state, side, ':brain', 1);
    }),
