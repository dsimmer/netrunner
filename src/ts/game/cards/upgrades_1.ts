/**
 * Upgrade Cards
 * Ported from Clojure cards/upgrades.clj to TypeScript
 *
 * Contains ~118 card definitions with their abilities and events.
 */

import type { State, Side, Card, EID } from '../../types';
import * as coreAccess from '../core/access';
import * as coreBadPublicity from '../core/bad_publicity';
import * as coreBoard from '../core/board';
import * as coreCard from '../core/card';
import * as coreCostFns from '../core/cost_fns';
import * as coreCosts from '../core/costs';
import * as coreDamage from '../core/damage';
import * as coreDefHelpers from '../core/def_helpers';
import * as coreDrawing from '../core/drawing';
import * as coreEffects from '../core/effects';
import * as coreEid from '../core/eid';
import * as coreEngine from '../core/engine';
import * as coreEvents from '../core/events';
import * as coreFinding from '../core/finding';
import * as coreFlags from '../core/flags';
import * as coreGaining from '../core/gaining';
import * as coreHandSize from '../core/hand_size';
import * as coreIce from '../core/ice';
import * as coreInstalling from '../core/installing';
import * as coreMoving from '../core/moving';
import * as coreOptional from '../core/optional';
import * as corePayment from '../core/payment';
import * as corePlayInstants from '../core/play_instants';
import * as corePrompts from '../core/prompts';
import * as coreProps from '../core/props';
import * as corePurging from '../core/purging';
import * as coreRevealing from '../core/revealing';
import * as coreRezzing from '../core/rezzing';
import * as coreRuns from '../core/runs';
import * as coreSay from '../core/say';
import * as coreServers from '../core/servers';
import * as coreShuffling from '../core/shuffling';
import * as coreTags from '../core/tags';
import * as coreThreat from '../core/threat';
import * as coreToString from '../core/to_string';
import * as coreToasts from '../core/toasts';
import * as coreUpdate from '../core/update';
import * as utils from '../utils';
import { req, effect, msg, wait_for, continue_ability, forms } from '../macros';
import type { CardDef } from '../../types';

// __cardScopeShim — placeholders for legacy literal-scope references
const state: any = undefined as any;
const side: any = undefined as any;
const eid: any = undefined as any;
const card: any = undefined as any;
const target: any = undefined as any;
const targets: any = undefined as any;
const ctx: any = undefined as any;
const asyncResult: any = undefined as any;

// ============================================================================
// Helper functions
// ============================================================================

function mobileSysopEventFn(ev?: string, callback?: any): any {
  return {
    event: ev || ':corp-turn-ends',
    skippable: true,
    optional: {
      prompt: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => `Move ${card.title} to another server?`),
      'waiting-prompt': true,
      'yes-ability': {
        prompt: 'Choose a server',
        'waiting-prompt': true,
        choices: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreServers.serverListExclude(state, [(card as any).zone?.[1]])
        ),
        msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return `move itself to ${target}`; }),
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
          const zone = (card as any).zone as string[] | undefined;
          const server = zone?.[1];
          const newZone = [...(coreServers.serverToZone(state, target) || []), 'content'];
          const moved = yield wait_for(state, [{ asyncResult: 'result' },
            coreMoving.move(state, side, card, newZone)]);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.unregisterEvents(card)], []);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.registerDefaultEvents(state, side, moved)], []);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, callback, moved, null)], []);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEffects.effectCompleted(state, side, eid)], []);
        }),
      },
    },
  };
}

export function canSmartPurge(state: State): boolean {
  const autoPurge = (state as any).corp?.properties?.['auto-purge'];
  if (!autoPurge) return false;
  const allInstalled = coreBoard.allInstalled(state, ':runner');
  const titles = allInstalled.map((c: Card) => c.title).filter(Boolean) as string[];
  return !titles.includes('Acacia') && !titles.includes('Fester') && !titles.includes('Heliamphora');
}

// ============================================================================
// Card definitions
// ============================================================================

// Adrian Seis
export const adrianSeis: CardDef = {
  title: 'Adrian Seis',
  events: [
    mobileSysopEventFn(),
    {
      event: ':successful-run',
      interactive: req(() => true),
      psi: {
        req: req(forms.thisServer),
        'not-equal': {
          msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => `prevent the Runner from accessing cards other than ${card.title}`),
          async: true,
          effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreAccess.setOnlyCardToAccess(card); coreEffects.effectCompleted(eid); }),
        },
        equal: {
          msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => `prevent the Runner from accessing ${card.title}`),
          async: true,
          effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; coreFlags.registerRunFlag(card, ':can-access',
              (_state: State, _side: Side, target: Card) => !coreCard.sameCard(target, card)); coreEffects.effectCompleted(eid); }),
        },
      },
    },
  ],
};

// Akitaro Watanabe
export const akitaroWatanabe: CardDef = {
  title: 'Akitaro Watanabe',
  'static-abilities': [{
    type: ':rez-cost',
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const t = targets[0];
      return t && coreCard.ice(t) && coreServers.protectingSameServer(card, t);
    }),
    value: -2,
  }],
};

// AMAZE Amusements
export const amazeAmusements: CardDef = {
  title: 'AMAZE Amusements',
  events: [{
    event: ':run-ends',
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const zone = (card as any).zone as string[] | undefined;
      const server = zone?.[1];
      const runServer = forms.runServer(state);
      return server && runServer && server === runServer;
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = forms.context(state, card, targets) || {};
      if (ctx['did-steal']) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreTags.gainTags(state, ':corp', eid, 2)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreSay.systemMsg(state, ':corp', `${card.title} gives the Runner 2 tags`)], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' }, coreEffects.effectCompleted(state, side, eid)], []);
      }
    }),
  }],
  'on-trash': {
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      side === ':runner' && !!forms.run(state)),
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreEngine.registerEvents(
      card,
      [{
        event: ':run-ends',
        req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const zone = (card as any).previousZone as string[] | undefined;
          const server = zone?.[1];
          const runServer = forms.runServer(state);
          return server && runServer && server === runServer;
        }),
        duration: ':end-of-run',
      }],
    ); }),
  },
};

// Amazon Industrial Zone
export const amazonIndustrialZone: CardDef = {
  title: 'Amazon Industrial Zone',
  events: [{
    event: ':corp-install',
    optional: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const ctx = forms.context(state, card, targets) || {};
        const cardCtx = ctx.card;
        return cardCtx && coreCard.ice(cardCtx) &&
          coreServers.protectingSameServer(card, cardCtx) &&
          coreRezzing.canPayToRez(state, side, { ...eid, source: card }, cardCtx, { 'cost-bonus': -3 });
      }),
      prompt: 'Rez ice with rez cost lowered by 3?',
      'yes-ability': {
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const ctx = forms.context(state, card, targets) || {};
          const cardCtx = ctx.card;
          yield wait_for(state, [{ asyncResult: 'result' },
            coreRezzing.rez({ ...eid, source: card }, cardCtx, { 'cost-bonus': -3 })], []);
        }),
      },
    },
  }],
};

// Angelique Garza Correa
export const angeliqueGarzaCorrea: CardDef = {
  title: 'Angelique Garza Correa',
  expend: {
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      coreThreat.threatLevel(3, state)),
    cost: [corePayment.toC('credit', 1)],
    msg: 'do 1 meat damage',
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, ':meat', 1, { card }); }),
  },
  'on-access': {
    optional: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreCard.rezzed(card)),
      'waiting-prompt': true,
      prompt: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => `Pay 2 [Credits] to use ${card.title} ability?`),
      'no-ability': {
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreSay.systemMsg(`declines to use ${card.title}`); }),
      },
      'yes-ability': {
        async: true,
        cost: [corePayment.toC('credit', 2)],
        msg: 'do 2 meat damage',
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, ':meat', 2, { card }); }),
      },
    },
  },
};

// Anoetic Void
export const anoeticVoid: CardDef = {
  title: 'Anoetic Void',
  events: [{
    event: ':approach-server',
    interactive: req(() => true),
    optional: {
      prompt: 'Pay 2 [Credits] and trash 2 cards from HQ to end the run?',
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        corePayment.canPay(state, side, eid, card, null, [
          corePayment.toC('credit', 2),
          corePayment.toC('trash-from-hand', 2),
        ]) && forms.thisServer(state, card)),
      'yes-ability': {
        async: true,
        msg: 'end the run',
        cost: [corePayment.toC('credit', 2), corePayment.toC('trash-from-hand', 2)],
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreRuns.endRun(state, side, eid, card); }),
      },
    },
  }],
};

// Arella Salvatore
export const arellaSalvatore: CardDef = {
  title: 'Arella Salvatore',
  events: [{
    event: ':agenda-scored',
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const ctx = forms.context(state, card, targets) || {};
      const cardCtx = ctx.card;
      return cardCtx && (cardCtx as any).previousZone === (card as any).zone;
    }),
    'change-in-game-state': { silent: true, req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => !!(state as any).corp?.hand?.length) },
    interactive: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      !!(state as any).corp?.hand?.some((c: Card) => coreCard.corpInstallableType(c))),
    silent: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      !!(state as any).corp?.hand?.some((c: Card) => !coreCard.corpInstallableType(c))),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      const corp = (state as any).corp;
      const hand = corp?.hand || [];
      if (hand.some((c: Card) => coreCard.corpInstallableType(c))) {
        const selectAbility = {
          prompt: 'Choose a card in HQ to install',
          choices: { card: (c: Card) => coreCard.corpInstallableType(c) && coreCard.inHand(c) && coreCard.corp(c) },
          async: true,
          effect: effect(function*(s: State, sd: Side, eid2: EID, c2: Card, t: any[]): Generator<any, any, any> {
            yield wait_for(s, [{ asyncResult: 'result' },
              coreInstalling.corpInstall(s, ':corp', eid2, target, null, {
                'ignore-all-cost': true,
                counters: { 'advance-counter': 1 },
                'msg-keys': { 'install-source': card, 'display-origin': true },
              })], []);
          }),
        };
        yield wait_for(state, [{ asyncResult: 'result' },
          continue_ability(state, side, selectAbility, card, null)], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' }, coreEffects.effectCompleted(state, side, eid)], []);
      }
    }),
  }],
};

// Ash 2X3ZB9CY
export const ash2X3ZB9CY: CardDef = {
  title: 'Ash 2X3ZB9CY',
  events: [{
    event: ':successful-run',
    interactive: req(() => true),
    trace: {
      base: 4,
      req: req(forms.thisServer),
      successful: {
        msg: `prevent the Runner from accessing cards other than ${card.title}`,
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreAccess.setOnlyCardToAccess(card); }),
      },
    },
  }],
};

// Awakening Center
export const awakeningCenter: CardDef = {
  title: 'Awakening Center',
  'can-host': req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
    coreCard.ice(targets[0])),
  abilities: [{
    action: true,
    label: 'Host a piece of Bioroid ice',
    cost: [corePayment.toC('click', 1)],
    prompt: 'Choose a piece of Bioroid ice in HQ to host',
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.hasSubtype(c, 'Bioroid') && coreCard.inHand(c) },
    msg: 'host a piece of Bioroid ice',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreInstalling.corpInstall(state, side, eid, target, card, {
          'ignore-all-cost': true,
          'msg-keys': { 'install-source': card, 'display-origin': true },
        })], []);
    }),
  }],
  events: [{
    event: ':pass-all-ice',
    optional: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        if (!forms.thisServer(state, card)) return false;
        const hosted = (card as any).hosted || [];
        return hosted.some((c: Card) =>
          coreRezzing.canPayToRez(state, side, { ...eid, source: card }, c, { 'cost-bonus': -7 }));
      }),
      prompt: 'Rez and force the Runner to encounter a hosted piece of ice?',
      'waiting-prompt': true,
      'yes-ability': {
        async: true,
        prompt: 'Choose a hosted piece of Bioroid ice to rez',
        choices: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const hosted = (card as any).hosted || [];
          return hosted.filter((c: Card) =>
            coreRezzing.canPayToRez(state, side, { ...eid, source: card }, c, { 'cost-bonus': -7 }));
        }),
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
          yield wait_for(state, [{ asyncResult: 'result' },
            coreRezzing.rez(state, side, target, { 'cost-bonus': -7 })], []);
          const iceCard = target;
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.registerEvents(state, side, card, [{
              event: ':run-ends',
              duration: ':end-of-run',
              async: true,
              req: req((s: State, sd: Side, eid2: EID, c2: Card, t: any[]) =>
                coreFinding.getCard(s, iceCard)),
              effect: effect(coreMoving.trash(eid, coreFinding.getCard(state, iceCard)!, { causeCard: card })),
            }])], []);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreSay.systemMsg(state, side, `uses ${card.title} to force the Runner to encounter ${coreToString.cardStr(state, iceCard)}`)], []);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreRuns.forceIceEncounter(state, side, eid, iceCard)], []);
        }),
      },
      'no-ability': {
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreSay.systemMsg(`declines to use ${card.title}`); }),
      },
    },
  }],
};

// Bamboo Dome
export const bambooDome: CardDef = {
  title: 'Bamboo Dome',
  'install-req': req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
    targets.some((t: any) => t === 'R&D')),
  abilities: [{
    label: 'Add 1 card from top 3 of R&D to HQ',
    cost: [corePayment.toC('click', 1)],
    'change-in-game-state': { req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => (state as any).corp?.deck?.length > 0) },
    async: true,
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => `reveal ${utils.enumerateCards((state as any).corp?.deck?.slice?.(0, 3) || [])} from the top of R&D`),
    'waiting-prompt': true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      const corp = (state as any).corp;
      const deckCards = corp?.deck?.slice(0, 3) || [];
      yield wait_for(state, [{ asyncResult: 'result' }, coreRevealing.reveal(state, side, deckCards)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        continue_ability(state, side, {
          prompt: 'Choose a card to add to HQ',
          async: true,
          choices: deckCards,
          'not-distinct': true,
          msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => `add 1 of the revealed cards to HQ`),
          effect: effect(function*(s: State, sd: Side, eid2: EID, c2: Card, t: any[]): Generator<any, any, any> {
            yield wait_for(s, [{ asyncResult: 'result' }, coreMoving.move(s, sd, target, 'hand')], []);
          }),
        }, card, null)], []);
    }),
  }],
};

// Ben Musashi
export const benMusashi: CardDef = {
  title: 'Ben Musashi',
  'on-trash': {
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      side === ':runner' && !!forms.run(state)),
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreEffects.registerLingeringEffect(
      card,
      {
        type: ':steal-additional-cost',
        duration: ':end-of-run',
        req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const t = targets[0];
          return t && (
            coreCard.getZone(t) === (card as any).previousZone ||
            coreServers.centralToZone(coreCard.getZone(t)) ===
              ((card as any).previousZone as string[]).slice(0, -1)
          );
        }),
        value: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          corePayment.toC('net', 2)),
      },
    ); }),
  },
  'static-abilities': [{
    type: ':steal-additional-cost',
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const t = targets[0];
      return t && (coreServers.inSameServer(card, t) || coreServers.fromSameServer(card, t));
    }),
    value: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      corePayment.toC('net', 2)),
  }],
};

// Bernice Mai
export const berniceMai: CardDef = {
  title: 'Bernice Mai',
  events: [{
    event: ':successful-run',
    interactive: req(() => true),
    trace: {
      base: 5,
      req: req(forms.thisServer),
      successful: coreDefHelpers.giveTags(1),
      unsuccessful: {
        async: true,
        msg: 'trash itself',
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreMoving.trash(eid, card, { causeCard: card }); }),
      },
    },
  }],
};

// Bio Vault
export const bioVault: CardDef = {
  title: 'Bio Vault',
  'install-req': req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
    const filtered = targets.filter((t: any) => t !== 'HQ' && t !== 'R&D' && t !== 'Archives');
    return filtered.length > 0;
  }),
  advanceable: ':always',
  abilities: [{
    label: 'End the run',
    'change-in-game-state': { req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => !!forms.run(state)) },
    msg: 'end the run',
    async: true,
    cost: [corePayment.toC('advancement', 2), corePayment.toC('trash-can')],
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreRuns.endRun(eid, card); }),
  }],
};

// Black Level Clearance
export const blackLevelClearance: CardDef = {
  title: 'Black Level Clearance',
  events: [{
    event: ':successful-run',
    async: true,
    interactive: req(() => true),
    player: ':runner',
    req: req(forms.thisServer),
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return `force the Runner to ${target.toLowerCase()}`; }),
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: ['Take 1 core damage', 'Jack out'],
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      if (target === 'Take 1 core damage') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDamage.damage(state, ':runner', eid, ':brain', 1, { card })], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.jackOut(state, ':runner', coreEid.makeEid(state))], []);
        yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, ':corp', 5)], []);
        yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, ':corp', 1)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreSay.systemMsg(state, ':corp',
            `gains 5 [Credits] and draws 1 card. Black Level Clearance is trashed`)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, ':corp', eid, card, { causeCard: card })], []);
      }
    }),
  }],
};

// Brasília Government Grid
export const brasiliaGovernmentGrid: CardDef = {
  title: 'Brasília Government Grid',
  events: [{
    event: ':rez',
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const ctx = forms.context(state, card, targets) || {};
      const rezzedCard = ctx.card;
      return rezzedCard && coreCard.ice(rezzedCard) && forms.thisServer(state, card) &&
        forms.run(state) &&
        coreBoard.allActiveInstalled(state, ':corp').some((c: Card) =>
          coreCard.ice(c) && !coreCard.sameCard(c, rezzedCard));
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      const ctx = forms.context(state, card, targets) || {};
      const rezzedCard = ctx.card;
      yield wait_for(state, [{ asyncResult: 'result' },
        continue_ability(state, side, {
          optional: {
            prompt: `Derez another piece of ice to give ${rezzedCard.title} +3 strength for the remainder of the run?`,
            'waiting-prompt': true,
            once: ':per-turn',
            'yes-ability': {
              choices: { card: (c: Card) => coreCard.ice(c) && coreCard.rezzed(c) && !coreCard.sameCard(c, rezzedCard) },
              async: true,
              effect: effect(function*(s: State, sd: Side, eid2: EID, c2: Card, t: any[]): Generator<any, any, any> {
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreRezzing.derez(s, sd, coreFinding.getCard(s, target)!, {
                    'msg-keys': { 'and-then': `to give ${coreToString.cardStr(s, rezzedCard)} +3 strength for the remainder of the run` },
                  })], []);
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreIce.pumpIce(s, sd, rezzedCard, 3, ':end-of-run')], []);
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreEffects.effectCompleted(s, sd, eid2)], []);
              }),
            },
          },
        }, card, null)], []);
    }),
  }],
};

// Breaker Bay Grid
export const breakerBayGrid: CardDef = {
  title: 'Breaker Bay Grid',
  'static-abilities': [{
    type: ':rez-cost',
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      coreServers.inSameServer(card, targets[0])),
    value: -5,
  }],
};

// Bryan Stinson
export const bryanStinson: CardDef = {
  title: 'Bryan Stinson',
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1)],
    'keep-menu-open': ':while-clicks-left',
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const runner = (state as any).runner;
      const corp = (state as any).corp;
      return runner?.credit < 6 &&
        corp?.discard?.some((c: Card) => coreCard.operation(c) && coreCard.hasSubtype(c, 'Transaction'));
    }),
    label: 'Play a transaction operation from Archives, ignoring all costs, and remove it from the game',
    prompt: 'Choose a transaction operation to play',
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return `play ${target.title} from Archives, ignoring all costs, and removes it from the game`; }),
    choices: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const corp = (state as any).corp;
      const ops = corp?.discard?.filter((c: Card) =>
        coreCard.operation(c) && coreCard.hasSubtype(c, 'Transaction'));
      return ops ? corePrompts.cancellable(ops, { sorted: true }) : [];
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      const modifiedTarget = { ...target, 'rfg-instead-of-trashing': true, special: { 'rfg-when-trashed': true } };
      yield wait_for(state, [{ asyncResult: 'result' },
        corePlayInstants.playInstant(eid, modifiedTarget, {
          'no-additional-cost': true,
          'ignore-cost': true,
        })], []);
    }),
  }],
};

// Calibration Testing
export const calibrationTesting: CardDef = {
  title: 'Calibration Testing',
  'install-req': req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
    const filtered = targets.filter((t: any) => t !== 'HQ' && t !== 'R&D' && t !== 'Archives');
    return filtered.length > 0;
  }),
  abilities: [{
    label: 'Place 1 advancement counter on a card in this server',
    async: true,
    'fake-cost': [corePayment.toC('trash-can')],
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; coreEngine.continueAbility(
      {
        prompt: 'Choose a card in this server',
        choices: { card: (c: Card) => coreServers.inSameServer(c, card) },
        async: true,
        msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return `place an advancement counter on ${coreToString.cardStr(state, target)}`; }),
        cost: [corePayment.toC('trash-can')],
        effect: effect(coreProps.addProp(eid, target, ':advance-counter', 1, { placed: true })),
      },
      card, null,
    ); }),
  }],
};

// Caprice Nisei
export const capriceNisei: CardDef = {
  title: 'Caprice Nisei',
  events: [{
    event: ':pass-all-ice',
    psi: {
      req: req(forms.thisServer),
      'not-equal': {
        msg: 'end the run',
        async: true,
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreRuns.endRun(eid, card); }),
      },
    },
  }],
};
