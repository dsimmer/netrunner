/**
 * Agenda Cards
 * Ported from Clojure cards/agendas.clj to TypeScript
 *
 * Contains ~181 card definitions with their abilities and events.
 * Each card has properties like on-score, on-access, events, static-abilities, etc.
 */

import type { Card, CardDef, EID, Side, State, Subroutine, Zone } from '../../types';
import * as coreAgendas from '../core/agendas';
import * as coreBoard from '../core/board';
import * as coreCard from '../core/card';
import * as coreCostFns from '../core/cost_fns';
import * as coreChooseOne from '../core/choose_one';
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
import * as coreHosting from '../core/hosting';
import * as coreIce from '../core/ice';
import * as coreInitializing from '../core/initializing';
import * as coreInstalling from '../core/installing';
import * as coreMoving from '../core/moving';
import * as coreOptional from '../core/optional';
import * as corePayment from '../core/payment';
import * as corePrevention from '../core/prevention';
import * as corePrompts from '../core/prompts';
import * as coreProps from '../core/props';
import * as corePurging from '../core/purging';
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
import * as coreWinning from '../core/winning';
import * as utils from '../utils';
import { req, effect, msg, wait_for, continue_ability, forms } from '../macros';
import { agendaCounters } from './agendas_1';
import * as coreBadPublicity from '../core/bad_publicity';

// Stub helpers (to be ported from clj cards/*.clj)
function projectAgenda(_args?: any): any { return {}; }

// Nisei MK II
export const niseiMKII: CardDef = {
  title: 'Nisei MK II',
  'on-score': agendaCounters(1),
  abilities: [{
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return forms.run(state); }),
    cost: [corePayment.toC('agenda', 1)],
    msg: 'end the run',
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreRuns.endRun(eid, card); }),
  }],
};

// Oaktown Renovation
export const oaktownRenovation: CardDef = {
  title: 'Oaktown Renovation',
  'install-state': ':face-up',
  events: [{
    event: 'advance',
    condition: ':faceup',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreCard.sameCard(card, (forms.context(state, card, targets) || {}).card);
    }),
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `gain ${((coreCard.getCounters(coreCard.getCard(state, card), ':advancement') || 0) >= 5 ? '3' : '2')} [Credits]`,
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreGaining.gainCredits(eid, (coreCard.getCounters(coreCard.getCard(state, card), ':advancement') || 0) <= 5 ? 3 : 2); }),
  }],
};

// Obokata Protocol
export const obokataProtocol: CardDef = {
  title: 'Obokata Protocol',
  'steal-cost-bonus': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return [corePayment.toC('net', 4)]; }),
};

// Offworld Office
export const offworldOffice: CardDef = {
  title: 'Offworld Office',
  'on-score': coreDefHelpers.gainCreditsAbility(7),
};

// Off the Books
export const offTheBooks: CardDef = {
  title: 'Off the Books',
  ...projectAgenda({ mode: 'computed' }),
  events: [{
    event: 'corp-turn-ends',
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    skippable: true,
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return (coreCard.getCounters(card, ':agenda') || 0) > 0 && (state as any).corp?.deck?.length > 0;
      }),
      prompt: 'Search R&D for a card?',
      'yes-ability': {
        cost: [corePayment.toC('agenda', 1)],
        choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const corp = (state as any).corp;
          return corePrompts.cancellable((corp?.deck || []).slice(), { sorted: true });
        }),
        prompt: 'Tutor a card',
        async: true,
        msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return ((): string => { const target: any = (targets as any[])?.[0]; return `reveal ${target.title} from R&D`; })(); },
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
          coreShuffling.shuffle(state, side, ':deck');
          yield wait_for(state, [{ asyncResult: 'result' }, coreRevealing.reveal(state, side, target)], []);
          const targetCard = target;
          continue_ability(
            state, side,
            coreChooseOne.chooseOneHelper([
              { option: `Install ${targetCard.title}`, ability: { async: true, effect: effect(coreInstalling.corpInstall(state, side, eid, targetCard, { 'ignore-install-cost': true, msgArgs: { displayOrigin: true, installSource: card } })) }},
              { option: `Add ${targetCard.title} to HQ`, ability: { msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `add ${targetCard.title} to HQ`, effect: effect(coreMoving.move(state, side, targetCard, 'hand')) }},
            ]),
            card,
            null
          );
        }),
      },
    },
  }],
};

// Ontological Dependence
export const ontologicalDependence: CardDef = {
  title: 'Ontological Dependence',
  'advancement-requirement': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    return -((state as any).runner?.brainDamage || 0) || 0;
  }),
};


// Oracle Thinktank
export const oracleThinktank: CardDef = {
  title: 'Oracle Thinktank',
  stolen: coreDefHelpers.giveTags(1),
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1), corePayment.toC('tag', 1)],
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return coreFlags.isScored(state, ':runner', card); }),
    msg: 'shuffle itself into R&D',
    label: 'Shuffle this agenda into R&D',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreMoving.move(':corp', card, 'deck', null); coreShuffling.shuffle(':corp', 'deck'); coreAgendas.updateAllAgendaPoints(); }),
  }],
  flags: { 'has-abilities-when-stolen': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }) },
};

// Orbital Superiority
export const orbitalSuperiority: CardDef = {
  title: 'Orbital Superiority',
  'on-score': {
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => ((utils.isTagged(state) || 0) > 0 ? 'do 4 meat damage' : 'give the Runner 1 tag'),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if ((utils.isTagged(state) || 0) > 0) {
        coreDamage.damage(state, ':corp', eid, ':meat', 4, { card: card });
      } else {
        coreTags.gainTags(state, ':corp', eid, 1);
      }
    }),
  },
};

// Paper Trail
export const paperTrail: CardDef = {
  title: 'Paper Trail',
  'on-score': {
    trace: {
      base: 6,
      successful: {
        msg: 'trash all connection and job resources',
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const allInstalled = coreBoard.allActiveInstalled(state, ':runner');
          const resources = allInstalled.filter((c: Card) => coreCard.hasSubtype(c, 'Job') || coreCard.hasSubtype(c, 'Connection'));
          yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trashCards(state, side, eid, resources, { causeCard: card })], []);
        }),
      },
    },
  },
};

// Personality Profiles
export const personalityProfiles: CardDef = {
  title: 'Personality Profiles',
  events: [
    {
      event: 'searched-stack',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return (state as any).runner?.hand?.length > 0;
      }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const runnerHand = [...state.runner?.hand || []];
        const c = runnerHand.sort(() => Math.random() - 0.5)[0];
        coreSay.systemMsg(state, side, `uses ${card.title} to force the Runner to trash ${c.title} from the grip at random`);
        yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trash(state, side, eid, c, { causeCard: card })], []);
      }),
    },
    {
      event: 'runner-install',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        return ((ctx.previousZone || []).includes(':discard')) && (state as any).runner?.hand?.length > 0;
      }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const runnerHand = [...state.runner?.hand || []];
        const c = runnerHand.sort(() => Math.random() - 0.5)[0];
        coreSay.systemMsg(state, side, `uses ${card.title} to force the Runner to trash ${c.title} from the grip at random`);
        yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trash(state, side, eid, c, { causeCard: card })], []);
      }),
    },
  ].filter(Boolean),
};

// Philotic Entanglement
export const philoticEntanglement: CardDef = {
  title: 'Philotic Entanglement',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return (state as any).runner?.scored?.length > 0;
    }),
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `do ${(state as any).runner?.scored?.length} net damage`,
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, ':net', (state as any).runner?.scored?.length || 0, { card: card }); }),
  },
};

// Post-Truth Dividend
export const postTruthDividend: CardDef = {
  title: 'Post-Truth Dividend',
  'on-score': {
    optional: {
      prompt: 'Draw 1 card?',
      'yes-ability': { msg: 'draw 1 card', async: true, effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDrawing.draw(eid, 1); }) },
      'no-ability': { effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreSay.systemMsg(`declines to use ${card.title}`); }) },
    },
  },
};

// Posted Bounty
export const postedBounty: CardDef = {
  title: 'Posted Bounty',
  'on-score': {
    optional: {
      prompt: 'Forfeit this agenda to give the Runner 1 tag and take 1 bad publicity?',
      'yes-ability': {
        msg: 'give the Runner 1 tag and take 1 bad publicity',
        cost: [corePayment.toC('forfeit-self')],
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          yield wait_for(state, [{ asyncResult: 'result' }, coreBadPublicity.gainBadPublicity(state, ':corp', coreEid.makeEid(state, eid), 1, { suppressCheckpoint: true })], []);
          coreTags.gainTags(state, ':corp', eid, 1);
        }),
      },
    },
  },
};

// Priority Requisition
export const priorityRequisition: CardDef = {
  title: 'Priority Requisition',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.installed(c) && !coreCard.rezzed(c) },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; coreRezzing.rez(eid, target, { 'ignore-cost': ':all-costs' }); }),
  },
};

// Private Security Force
export const privateSecurityForce: CardDef = {
  title: 'Private Security Force',
  abilities: [{
    action: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return forms.tagged(state); }),
    cost: [corePayment.toC('click', 1)],
    'keep-menu-open': ':while-clicks-left',
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, ':meat', 1, { card: card }); }),
    msg: 'do 1 meat damage',
  }],
};

// Profiteering
export const profiteering: CardDef = {
  title: 'Profiteering',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    choices: ['0', '1', '2', '3'],
    prompt: 'How many bad publicity do you want to take?',
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return ((): string => { const target: any = (targets as any[])?.[0]; return `take ${target} bad publicity and gain ${5 * parseInt(target, 10)} [Credits]`; })(); },
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      const bp = utils.countBadPub(state) || 0;
      yield wait_for(state, [{ asyncResult: 'result' }, coreBadPublicity.gainBadPublicity(state, ':corp', parseInt(target, 10))], []);
      if (bp < (utils.countBadPub(state) || 0)) {
        coreGaining.gainCredits(state, ':corp', eid, 5 * parseInt(target, 10));
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  },
};

// Project Ares
export const projectAres: CardDef = {
  title: 'Project Ares',
  'on-score': {
    player: ':runner',
    silent: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const adv = (forms.context(state, card, targets) || {}).advancement || 0;
      return adv > 4 && coreBoard.allInstalled(state, ':runner').length > 0;
    }),
    'waiting-prompt': true,
    prompt: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `Choose ${utils.quantify(((forms.context(state, card, targets) || {}).advancement || 0) - 4, 'installed card')} to trash`,
    choices: { max: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const adv = (forms.context(state, card, targets) || {}).advancement || 0;
      return Math.min(adv - 4, coreBoard.allInstalled(state, ':runner').length);
    }), card: (c: Card) => coreCard.runner(c) && coreCard.installed(c) },
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `force the Runner to trash ${utils.quantify(((forms.context(state, card, targets) || {}).advancement || 0) - 4, 'installed card')} and take 1 bad publicity`,
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trashCards(state, side, targets, { causeCard: card, cause: ':forced-to-trash' })], []);
      coreSay.systemMsg(state, side, `trashes ${utils.enumerateCards(targets)}`);
      yield wait_for(state, [{ asyncResult: 'result' }, coreBadPublicity.gainBadPublicity(state, ':corp', eid, 1)], []);
    }),
  },
};

// Project Atlas
export const projectAtlas: CardDef = {
  title: 'Project Atlas',
  ...projectAgenda(),
  abilities: [{
    cost: [corePayment.toC('agenda', 1)],
    'keep-menu-open': false,
    prompt: 'Choose a card',
    label: 'Search R&D and add 1 card to HQ',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return (coreCard.getCounters(card, ':agenda') || 0) > 0;
    }),
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return ((): string => { const target: any = (targets as any[])?.[0]; return `add ${target.title} to HQ from R&D`; })(); },
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const corp = (state as any).corp;
      return corePrompts.cancellable((corp?.deck || []).slice(), { sorted: true });
    }),
    cancel: { msg: 'decide they don\'t want to tutor a card after all' },
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; coreShuffling.shuffle(state, side, ':deck'); coreMoving.move(state, side, target, 'hand'); }),
  }],
};

// Project Beale
export const projectBeale: CardDef = {
  title: 'Project Beale',
  ...projectAgenda({ granularity: 2 }),
  'agendapoints-runner': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return 2; }),
  'agendapoints-corp': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    return 2 + (coreCard.getCounters(card, ':agenda') || 0);
  }),
};

// Project Ingatan
export const projectIngatan: CardDef = {
  title: 'Project Ingatan',
  ...projectAgenda({ mode: 'computed' }),
  events: [{
    event: 'corp-turn-ends',
    cost: [corePayment.toC('agenda', 1)],
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return corePayment.canPay(state, side, eid, card, null, [corePayment.toC('agenda', 1)]);
    }),
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    label: 'Install a card from Archives',
    prompt: 'Install a card from Archives, ignoring all costs',
    'show-discard': true,
    'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const corpDiscard = (state as any).corp?.discard || [];
      return corpDiscard.some((c: Card) => !c.seen || !coreCard.operation(c));
    })},
    choices: { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      return !coreCard.operation(target) && coreCard.inDiscard(target);
    })},
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; coreInstalling.corpInstall(state, side, eid, target, null, { 'ignore-all-cost': true, msgKeys: { installSource: card, displayOrigin: true } }); }),
  }],
};

// Project Kusanagi
export const projectKusanagi: CardDef = {
  title: 'Project Kusanagi',
  ...projectAgenda(),
  abilities: [{
    label: 'Give a piece of ice "[Subroutine] Do 1 net damage"',
    prompt: 'Choose a piece of ice',
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.rezzed(c) },
    cost: [corePayment.toC('agenda', 1)],
    'change-in-game-state': { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return forms.run(state) && coreBoard.allInstalled(state, ':corp').some((c: Card) => coreCard.ice(c) && coreCard.rezzed(c));
    })},
    'keep-menu-open': ':while-agenda-tokens-left',
    msg: 'make a piece of ice gain "[Subroutine] Do 1 net damage" after all its other subroutines for the remainder of the run',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      const t = target;
      coreEffects.registerLingeringEffect(card, {
        type: ':additional-subroutines',
        duration: ':end-of-run',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return coreCard.sameCard(targets[0] || {}, t); }),
        value: { subroutines: [coreDefHelpers.doNetDamage(1)] },
      });
    }),
  }],
};

// Project Vacheron
export const projectVacheron: CardDef = {
  title: 'Project Vacheron',
  flags: { 'has-events-when-stolen': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }) },
  'agendapoints-runner': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    const prevZone = (card as any)['previous-zone'] || [];
    return (prevZone[0] === ':discard' || (coreCard.getCounters(card, ':agenda') || 0) === 0) ? 3 : 0;
  }),
  'move-zone': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    if (coreCard.inScored(card) && (card as any)['scored-side'] === ':runner' && (card as any)['previous-zone']?.[0] !== ':discard') {
      coreSay.systemMsg(state, side, `uses ${card.title} to place 4 agenda counters on itself`);
      yield wait_for(state, [{ asyncResult: 'result' }, coreProps.addCounter(state, side, eid, coreCard.getCard(state, card), ':agenda', 4, null)], []);
    }
    coreEid.effectCompleted(state, side, eid);
  }),
  events: [{
    event: 'runner-turn-begins',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return (coreCard.getCounters(card, ':agenda') || 0) > 0;
    }),
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return ((): string => { const target: any = (targets as any[])?.[0]; return `remove 1 agenda counter from ${target.title}`; })(); },
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if ((coreCard.getCounters(card, ':agenda') || 0) > 0) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreProps.addCounter(state, side, card, ':agenda', -1, null)], []);
        coreAgendas.updateAllAgendaPoints(state, side);
        const cardObj = coreCard.getCard(state, card);
        if ((coreCard.getCounters(cardObj, ':agenda') || 0) === 0) {
          const points = coreCard.getAgendaPoints(cardObj) || 0;
          coreSay.systemMsg(state, ':runner', `gains ${utils.quantify(points, 'agenda point')} from ${cardObj.title}`);
        }
        coreWinning.checkWinByAgenda(state, side);
        coreEid.effectCompleted(state, side, eid);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  }],
};

// Project Vitruvius
export const projectVitruvius: CardDef = {
  title: 'Project Vitruvius',
  ...projectAgenda(),
  abilities: [
    ...coreDefHelpers.corpRecur(),
    { cost: [corePayment.toC('agenda', 1)], 'keep-menu-open': false, req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return (coreCard.getCounters(card, ':agenda') || 0) > 0;
    }) },
  ],
};

// Project Wotan
export const projectWotan: CardDef = {
  title: 'Project Wotan',
  'on-score': agendaCounters(3),
  abilities: [{
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ci = forms.currentIce(state, card);
      return ci && coreCard.rezzed(ci) && coreCard.hasSubtype(ci, 'Bioroid') && (forms.run(state)?.phase) === ':approach-ice';
    }),
    cost: [corePayment.toC('agenda', 1)],
    'keep-menu-open': ':while-agenda-tokens-left',
    msg: 'make the approached piece of Bioroid ice gain "[Subroutine] End the run" after all its other subroutines for the remainder of this run',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const cardTarget = forms.currentIce(state, card);
      coreEffects.registerLingeringEffect(card, {
        type: ':additional-subroutines',
        duration: ':end-of-run',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return coreCard.sameCard(targets[0] || {}, cardTarget); }),
        value: { subroutines: [{ label: 'End the run', msg: 'end the run', async: true, effect: effect(coreRuns.endRun(eid, card)) }] },
      });
    }),
  }],
};

// Project Yagi-Uda
export const projectYagiUda: CardDef = {
  title: 'Project Yagi-Uda',
  ...projectAgenda({
    abilities: [{
      async: true,
      'waiting-prompt': true,
      'fake-cost': [corePayment.toC('agenda', 1)],
      'keep-menu-open': false,
      label: 'swap card in HQ with installed card',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return forms.run(state) && corePayment.canPay(state, side, eid, card, null, [corePayment.toC('agenda', 1)]);
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        continue_ability(state, ':runner', chooseCard((forms.run(state) || {}).server), card, null);
      }),
    }],
  }),
};

function chooseCard(runServer: any): any {
  return {
    async: true,
    prompt: 'Choose a card in or protecting the attacked server',
    choices: { card: (c: Card) => (coreCard.getZone(c) || [])[0] === (runServer || [])[0] },
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      continue_ability(state, ':runner', chooseSwap(target), card, null);
    }),
  };
}

function chooseSwap(toSwap: Card): any {
  return {
    async: true,
    prompt: `Choose a card in HQ to swap with ${toSwap.title}`,
    cost: [corePayment.toC('agenda', 1)],
    choices: { 'not-self': true, card: (c: Card) => {
      return coreCard.corp(c) && coreCard.inHand(c) && (!coreCard.ice(toSwap) || coreCard.ice(c));
    }},
    msg: { public: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `swap ${coreToString.cardStr(state, toSwap)} with a card from HQ`, corp: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return `swap ${coreToString.cardStr(state, toSwap, { 'maybe-visible': true })} with a card from HQ (${target.title})`; }},
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      yield wait_for(state, [{ asyncResult: 'result' }, coreInstalling.swapCardsAsync(state, side, toSwap, target)], []);
      continue_ability(state, ':runner', coreDefHelpers.offerJackOut(), card, null);
    }),
  };
}

// Puppet Master
export const puppetMaster: CardDef = {
  title: 'Puppet Master',
  events: [{
    event: 'successful-run',
    skippable: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    'waiting-prompt': true,
    prompt: 'Choose a card that can be advanced to place 1 advancement counter on',
    choices: { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return coreCard.canBeAdvanced(state, card); }) },
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return `place 1 advancement counter on ${coreToString.cardStr(state, target)}`; },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; coreProps.addProp(':corp', eid, target, ':advance-counter', 1, { placed: true }); }),
  }],
};

// Proprionegation
export const proprionegation: CardDef = {
  title: 'Proprionegation',
  'on-score': {
    silent: true,
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreProps.addCounter(eid, card, ':agenda', 1); }),
  },
  abilities: [{
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return forms.run(state); }),
    cost: [corePayment.toC('agenda', 1)],
    'change-in-game-state': { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return (state as any).run?.phase !== ':success';
    })},
    label: 'Redirect runner to archives',
    msg: 'make the Runner continue the run on Archives',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if ((state as any)['forced-encounter']) {
        coreRuns.redirectRun(state, side, 'Archives', ':approach-ice');
        coreEid.effectCompleted(state, side, eid);
      } else if ((state as any).run?.phase === ':encounter-ice') {
        if (coreRuns.getCurrentEncounter(state)) {
          coreEngine.triggerEvent(state, ':end-of-encounter', { ice: coreIce.getCurrentIce(state) });
        }
        yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.checkpoint(state, side, eid, { duration: ':end-of-encounter' })], []);
        coreRuns.clearEncounter(state);
        coreRuns.redirectRun(state, side, 'Archives', ':approach-ice');
        coreRuns.startNextPhase(state, side, eid);
      } else {
        coreRuns.clearEncounter(state);
        coreRuns.redirectRun(state, side, 'Archives', ':approach-ice');
        coreRuns.startNextPhase(state, side, eid);
      }
    }),
  }],
};

// Quantum Predictive Model
export const quantumPredictiveModel: CardDef = {
  title: 'Quantum Predictive Model',
  flags: { 'rd-reveal': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }) },
  'on-access': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return forms.tagged(state); }),
    player: ':runner',
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    prompt: 'Quantum Predictive Model will be added to the Corp\'s score area',
    choices: ['OK'],
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => 'add itself to [their] score area and gain 1 agenda point',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreMoving.move(':corp', card, ':scored', { force: true }); coreAgendas.updateAllAgendaPoints(); coreWinning.checkWinByAgenda(); }),
  },
};

// Rebranding Team
export const rebrandingTeam: CardDef = {
  title: 'Rebranding Team',
  'move-zone': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    if (coreCard.inScored(card) && (card as any)['scored-side'] === ':corp') {
      coreSay.systemMsg(state, side, `uses ${card.title} to make all assets gain Advertisement`);
    }
    coreEid.effectCompleted(state, side, eid);
  }),
  'static-abilities': [{
    type: ':gain-subtype',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return coreCard.asset(targets[0] || {}); }),
    value: 'Advertisement',
  }],
};

// Reeducation
export const reeducation: CardDef = {
  title: 'Reeducation',
  'on-score': {
    async: true,
    'waiting-prompt': true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const from = (state as any).corp?.hand || [];
      if (from.length > 0) {
        continue_ability(state, ':corp', corpChoice(from, [], from), card, null);
      } else {
        coreSay.systemMsg(state, side, 'does not add any cards from HQ to bottom of R&D');
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  },
};

function corpChoice(remaining: Card[], chosen: Card[], original: Card[]): any {
  return {
    prompt: 'Choose a card to move to bottom of R&D',
    choices: [...remaining, 'Done'],
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      const chosenList = [target, ...chosen];
      if (target !== 'Done') {
        const remainingFiltered = remaining.filter((c: Card) => !coreCard.sameCard(c, target));
        if (remainingFiltered.length > 0) {
          continue_ability(state, side, corpChoice(remainingFiltered, [target, ...chosen], original), card, null);
        }
      } else {
        const finalChosen = chosen.filter((c: Card) => c !== 'Done');
        if (finalChosen.length > 0) {
          corpFinal(finalChosen, original);
        } else {
          coreSay.systemMsg(state, side, 'does not add any cards from HQ to bottom of R&D');
          coreEid.effectCompleted(state, side, eid);
        }
      }
    }),
  };
}

function corpFinal(chosen: Card[], original: Card[]): any {
  return {
    prompt: `The bottom cards of R&D will be ${utils.enumerateCards(chosen)}`,
    choices: ['Done', 'Start over'],
    async: true,
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `add ${utils.quantify(chosen.length, 'card')} from HQ to the bottom of R&D and draw ${utils.quantify(chosen.length, 'card')}${chosen.length <= ((state as any).runner?.hand?.length || 0) ? `. The Runner randomly adds ${utils.quantify(chosen.length, 'card')} from [runner-pronoun] Grip to the bottom of the Stack` : ''}`,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      if (target === 'Done') {
        const n = chosen.length;
        for (const c of [...chosen].reverse()) {
          yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, ':corp', c, 'deck')], []);
        }
        yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, ':corp', n)], []);
        if (n <= ((state as any).runner?.hand?.length || 0)) {
          const runnerHand = [...((state as any).runner?.hand || [])];
          const shuffled = runnerHand.sort(() => Math.random() - 0.5);
          for (const r of shuffled.slice(0, n)) {
            yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, ':runner', r, 'deck')], []);
          }
          coreEngine.triggerEvent(state, ':runner-hand-changed');
          yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.checkpoint(state, side, eid)], []);
        }
        coreEid.effectCompleted(state, side, eid);
      } else {
        coreSay.systemMsg(state, side, 'declines to add cards');
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

// Regenesis
export const regenesis: CardDef = {
  title: 'Regenesis',
  'on-score': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const corpDiscard = (state as any).corp?.discard || [];
      const hasFacedown = corpDiscard.some((c: Card) => !coreCard.faceup(c));
      if (!hasFacedown) return false;
      // Check no-event condition simplified
      return true;
    }),
    prompt: 'Choose a face-down agenda in Archives',
    choices: { card: (c: Card) => coreCard.agenda(c) && coreCard.inDiscard(c) && !coreCard.faceup(c) },
    'show-discard': true,
    async: true,
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return `reveal ${(target || []).title} and add it to [their] score area`; },
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      yield wait_for(state, [{ asyncResult: 'result' }, coreRevealing.reveal(state, side, target)], []);
      const c = coreMoving.move(state, ':corp', target, ':scored');
      coreInitializing.cardInit(state, ':corp', c, { 'resolve-effect': false, 'init-data': true });
      coreAgendas.updateAllAdvancementRequirements(state);
      coreAgendas.updateAllAgendaPoints(state);
      coreWinning.checkWinByAgenda(state, side);
      coreEid.effectCompleted(state, side, eid);
    }),
  },
};

// Regulatory Capture
export const regulatoryCapture: CardDef = {
  title: 'Regulatory Capture',
  'advancement-requirement': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    return -(Math.min(4, utils.countBadPub(state) || 0));
  }),
};

// Remastered Edition
export const remasteredEdition: CardDef = {
  title: 'Remastered Edition',
  'on-score': agendaCounters(1),
  abilities: [Object.assign(coreDefHelpers.placeAdvancementCounter(null, 1), { cost: [corePayment.toC('agenda', 1)] })],
};

// Remote Data Farm
export const remoteDataFarm: CardDef = {
  title: 'Remote Data Farm',
  'move-zone': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    if (coreCard.inScored(card) && (card as any)['scored-side'] === ':corp') {
      coreSay.systemMsg(state, side, `uses ${card.title} to increase [their] maximum hand size by 2`);
    }
    coreEid.effectCompleted(state, side, eid);
  }),
  'static-abilities': [coreHandSize.corpHandSizePlus(2)],
};

// Remote Enforcement
export const remoteEnforcement: CardDef = {
  title: 'Remote Enforcement',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    optional: {
      prompt: 'Search R&D for a piece of ice to install protecting a remote server?',
      'yes-ability': {
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
          const corp = (state as any).corp;
          const deckIces = (corp?.deck || []).filter((c: Card) => coreCard.ice(c));
          if (deckIces.length > 0) {
            continue_ability(
              state, side,
              {
                async: true,
                prompt: 'Choose a piece of ice',
                choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
                  const corp = (state as any).corp;
                  return corePrompts.cancellable((corp?.deck || []).filter((c: Card) => coreCard.ice(c)), { sorted: true });
                }),
                cancel: coreShuffling.shuffleMyDeck!,
                effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
                  const chosenIce = target;
                  continue_ability(
                    state, side,
                    {
                      async: true,
                      prompt: `Choose a server to install ${chosenIce.title} on`,
                      choices: coreBoard.installableServers(state, chosenIce).filter((s: string) => !['HQ', 'Archives', 'R&D'].includes(s)),
                      effect: effect(
                        coreShuffling.shuffle(state, ':deck'),
                        coreInstalling.corpInstall(eid, chosenIce, target, { 'install-state': ':rezzed-no-rez-cost', msgKeys: { installSource: card, displayOrigin: true } })
                      ),
                    },
                    card,
                    null
                  );
                }),
              },
              card,
              null
            );
          } else {
            continue_ability(
              state, side,
              { prompt: 'You have no ice in R&D', choices: ['Carry on!'], 'prompt-type': ':bogus', msg: 'shuffle R&D', effect: effect(coreShuffling.shuffle(state, ':deck')) },
              card,
              null
            );
          }
        }),
      },
    },
  },
};

// Research Grant
export const researchGrant: CardDef = {
  title: 'Research Grant',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    silent: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const allInstalled = coreBoard.allInstalled(state, ':corp');
      return allInstalled.filter((c: Card) => c.title === card.title).length === 0;
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      continue_ability(
        state, side,
        {
          prompt: `Choose another installed copy of ${card.title} to score`,
          choices: { card: (c: Card) => c.title === card.title },
          interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
          async: true,
          req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            return coreBoard.allInstalled(state, ':corp').some((c: Card) => c.title === card.title);
          }),
          effect: effect(coreAgendas.score(eid, coreCard.getCard(state, target), { 'no-req': true })),
          msg: 'score another installed copy of itself',
        },
        card,
        null
      );
    }),
  },
};

// Restructured Datapool
export const restructuredDatapool: CardDef = {
  title: 'Restructured Datapool',
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1)],
    label: 'give runner 1 tag',
    'keep-menu-open': ':while-clicks-left',
    trace: {
      base: 2,
      successful: coreDefHelpers.giveTags(1),
    },
  }],
};

// Sacrifice Zone Expansion
export const sacrificeZoneExpansion: CardDef = {
  title: 'Sacrifice Zone Expansion',
  'install-state': ':face-up',
  events: [
    {
      event: 'advance',
      condition: ':faceup',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return coreCard.sameCard(card, (forms.context(state, card, targets) || {}).card) &&
          coreEvents.firstEvent(state, side, 'advance', (t: any[]) => t[0] && coreCard.sameCard(card, t[0].card));
      }),
      msg: 'gain 3 [Credits]',
      async: true,
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreGaining.gainCredits(eid, 3); }),
    },
    {
      event: 'successful-run',
      condition: ':faceup',
      optional: {
        prompt: 'Do 1 meat damage?',
        'once': ':per-turn',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          return coreCard.installed(card) && coreServers.targetServer(forms.context(state, card, targets) || {}) !== (coreCard.getZone(card) || [])[1] &&
            corePayment.canPay(state, side, eid, card, null, [corePayment.toC('advancement', 1)]);
        }),
        'yes-ability': {
          cost: [corePayment.toC('advancement', 1)],
          msg: 'do 1 meat damage',
          effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(state, side, eid, ':meat', 1); }),
          async: true,
        },
      },
    },
  ],
};
