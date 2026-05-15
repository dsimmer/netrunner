/**
 * Agenda Cards
 * Ported from Clojure cards/agendas.clj to TypeScript
 *
 * Contains ~181 card definitions with their abilities and events.
 * Each card has properties like on-score, on-access, events, static-abilities, etc.
 */

import type { State, Side, Card, EID } from '../../types';
import * as coreAgendas from '../core/agendas';
import * as coreBoard from '../core/board';
import * as coreCard from '../core/card';
import * as coreCostFns from '../core/cost-fns';
import * as coreChooseOne from '../core/choose-one';
import * as coreDamage from '../core/damage';
import * as coreDefHelpers from '../core/def-helpers';
import * as coreDrawing from '../core/drawing';
import * as coreEffects from '../core/effects';
import * as coreEid from '../core/eid';
import * as coreEngine from '../core/engine';
import * as coreEvents from '../core/events';
import * as coreFinding from '../core/finding';
import * as coreFlags from '../core/flags';
import * as coreGaining from '../core/gaining';
import * as coreHandSize from '../core/hand-size';
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
import * as coreSetAside from '../core/set-aside';
import * as coreShuffling from '../core/shuffling';
import * as coreTags from '../core/tags';
import * as coreToString from '../core/to-string';
import * as coreToasts from '../core/toasts';
import * as coreUpdate from '../core/update';
import * as coreWinning from '../core/winning';
import * as utils from '../utils';
import { req, effect, msg, wait_for, continue_ability, forms } from '../macros';
import type { CardDef } from '../../types';

import { addAgendaPointCounters, agendaCounters } from './agendas_1';

// Greenmail
export const greenmail: CardDef = {
  title: 'Greenmail',
  'on-score': coreDefHelpers.gainCreditsAbility(2),
  'on-forfeit': coreDefHelpers.gainCreditsAbility(4),
};

// Hades Fragment
export const hadesFragment: CardDef = {
  title: 'Hades Fragment',
  flags: { 'corp-phase-12': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return (state as any).corp?.discard?.length > 0 && coreFlags.isScored(state, ':corp', card);
  }) },
  abilities: [{
    prompt: 'Choose a card to add to the bottom of R&D',
    label: 'add card to bottom of R&D',
    'show-discard': true,
    event: 'corp-turn-begins',
    'once': ':per-turn',
    choices: { card: (c: Card) => coreCard.corp(c) && coreCard.inDiscard(c) },
    effect: effect(coreMoving.move(target, 'deck')),
    msg: (msgFn: any) => `add ${(target.seen ? target.title : 'a card')} to the bottom of R&D`,
  }],
  events: [{ ...(coreDefHelpers.gainCreditsAbility(0)), 'change-in-game-state': { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).corp?.discard?.length > 0; }), silent: true } }],
};

// Helium-3 Deposit
export const helium3Deposit: CardDef = {
  title: 'Helium-3 Deposit',
  'on-score': {
    async: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    prompt: 'How many power counters do you want to place?',
    choices: ['0', '1', '2'],
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const c = parseInt(forms.target(state, card, targets), 10) || 0;
      continue_ability(
        state, side,
        {
          choices: { card: (c: Card) => (coreCard.getCounters(c, ':power') || 0) > 0 },
          msg: (msgFn: any) => `place ${utils.quantify(c, 'power counter')} on ${target.title}`,
          async: true,
          effect: effect(coreProps.addCounter(state, side, eid, target, ':power', c, null)),
        },
        card,
        null
      );
    }),
  },
};

// High-Risk Investment
export const highRiskInvestment: CardDef = {
  title: 'High-Risk Investment',
  'on-score': agendaCounters(1),
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1), corePayment.toC('agenda', 1)],
    'change-in-game-state': { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (state as any).runner?.credit > 0;
    }) },
    label: 'gain credits',
    msg: (msgFn: any) => `gain ${(state as any).runner?.credit} [Credits]`,
    async: true,
    'keep-menu-open': ':while-agenda-tokens-left',
    effect: effect(coreGaining.gainCredits(eid, (state as any).runner?.credit || 0)),
  }],
};

// Hollywood Renovation
export const hollywoodRenovation: CardDef = {
  title: 'Hollywood Renovation',
  'install-state': ':face-up',
  events: [{
    event: 'advance',
    condition: ':faceup',
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(card, (forms.context(state, card, targets) || {}).card);
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const cardObj = coreCard.getCard(state, card);
      const n = (coreCard.getCounters(cardObj, ':advancement') || 0) >= 6 ? 2 : 1;
      continue_ability(
        state, side,
        {
          choices: { 'not-self': true, req: req(function*(s: State, sd: Side, eid2: EID, c: Card, t: any[]) {
            const t2 = t[0];
            return t2 && coreCard.canBeAdvanced(s, t2);
          }) },
          msg: (msgFn: any) => `place ${utils.quantify(n, 'advancement counter')} on ${coreToString.cardStr(state, target)}`,
          async: true,
          effect: effect(coreProps.addProp(':corp', eid, target, ':advance-counter', n, { placed: true })),
        },
        card,
        null
      );
    }),
  }],
};

// Hostile Takeover
export const hostileTakeover: CardDef = {
  title: 'Hostile Takeover',
  'on-score': {
    msg: 'gain 7 [Credits] and take 1 bad publicity',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, 7, { suppressCheckpoint: true })], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreBadPublicity.gainBadPublicity(state, ':corp', eid, 1)], []);
    }),
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
  },
};

// House of Knives
export const houseOfKnives: CardDef = {
  title: 'House of Knives',
  'on-score': agendaCounters(3),
  abilities: [{
    cost: [corePayment.toC('agenda', 1)],
    msg: 'do 1 net damage',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.run(state); }),
    'once': ':per-run',
    async: true,
    effect: effect(coreDamage.damage(eid, ':net', 1, { card: card })),
  }],
};

// Hybrid Release
export const hybridRelease: CardDef = {
  title: 'Hybrid Release',
  'on-score': {
    prompt: 'Choose a facedown card in Archives to install',
    'show-discard': true,
    'waiting-prompt': true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const corpDiscard = (state as any).corp?.discard || [];
      return corpDiscard.some((c: Card) => !coreCard.faceup(c));
    }),
    async: true,
    choices: { card: (c: Card) => coreCard.corpInstallableType(c) && coreCard.inDiscard(c) && !coreCard.faceup(c) },
    effect: effect(coreInstalling.corpInstall(eid, target, null, { msgKeys: { installSource: card, displayOrigin: true } })),
  },
};

// Hyperloop Extension
export const hyperloopExtension: CardDef = {
  title: 'Hyperloop Extension',
  'on-score': coreDefHelpers.gainCreditsAbility(3),
  stolen: coreDefHelpers.gainCreditsAbility(3),
};

// Ikawah Project
export const ikawahProject: CardDef = {
  title: 'Ikawah Project',
  'steal-cost-bonus': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return [corePayment.toC('click', 1), corePayment.toC('credit', 2)];
  }),
};

// Illicit Sales
export const illicitSales: CardDef = {
  title: 'Illicit Sales',
  'on-score': {
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.resolveAbility(
        state, side,
        {
          optional: {
            prompt: 'Take 1 bad publicity?',
            'yes-ability': { msg: 'take 1 bad publicity', async: true, effect: effect(coreBadPublicity.gainBadPublicity(':corp', eid, 1)) },
          },
        },
        card,
        null
      )], []);
      const n = 3 * (utils.countBadPub(state) || 0);
      coreSay.systemMsg(state, side, `uses ${card.title} to gain ${n} [Credits]`);
      coreGaining.gainCredits(state, side, eid, n);
    }),
  },
};

// Improved Protein Source
export const improvedProteinSource: CardDef = {
  title: 'Improved Protein Source',
  abilities: [{
    async: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    msg: 'make the Runner gain 4 [Credits]',
    effect: effect(coreGaining.gainCredits(':runner', eid, 4)),
  }],
  'on-score': {
    async: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    msg: 'make the Runner gain 4 [Credits]',
    effect: effect(coreGaining.gainCredits(':runner', eid, 4)),
  },
  stolen: {
    async: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    msg: 'make the Runner gain 4 [Credits]',
    effect: effect(coreGaining.gainCredits(':runner', eid, 4)),
  },
};

// Improved Tracers
export const improvedTracers: CardDef = {
  title: 'Improved Tracers',
  'move-zone': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    if (coreCard.inScored(card) && (card as any)['scored-side'] === ':corp') {
      coreSay.systemMsg(state, side, `uses ${card.title} to increase the strength of Tracer ice by 1`);
      coreSay.systemMsg(state, side, `uses ${card.title} to increase the base strength of all trace subroutines by 1`);
      coreIce.updateAllIce(state, side);
      coreEid.effectCompleted(state, side, eid);
    } else {
      coreEid.effectCompleted(state, side, eid);
    }
  }),
  'static-abilities': [
    { type: ':ice-strength', req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return coreCard.hasSubtype(targets[0] || {}, 'Tracer'); }), value: 1 },
    { type: ':trace-base-strength', req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const secondTargets = targets[1];
      return secondTargets && (secondTargets as any)['source-type'] === ':subroutine';
    }), value: 1 },
  ],
};

// Jumon
export const jumon: CardDef = {
  title: 'Jumon',
  events: [{
    event: 'corp-turn-ends',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const allInstalled = coreBoard.allInstalled(state, ':corp');
      return allInstalled.some((c: Card) => {
        const zone = coreCard.getZone(c);
        return zone && zone[zone.length - 1] === ':content' && coreServers.isRemote(zone[1]);
      });
    }),
    prompt: 'Choose a card to place 2 advancement counters on',
    choices: { card: (c: Card) => {
      const zone = coreCard.getZone(c);
      return zone && zone[zone.length - 1] === ':content' && coreServers.isRemote(zone[1]);
    }},
    msg: (msgFn: any) => `place 2 advancement counters on ${coreToString.cardStr(state, target)}`,
    async: true,
    effect: effect(coreProps.addProp(':corp', eid, target, ':advance-counter', 2, { placed: true })),
  }],
};

// Kimberlite Field
export const kimberliteField: CardDef = {
  title: 'Kimberlite Field',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    async: true,
    'waiting-prompt': true,
    prompt: 'Choose a rezzed card to trash',
    msg: (msgFn: any) => `trash ${coreToString.cardStr(state, target)}`,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const allInstalled = coreBoard.allInstalled(state, ':corp');
      return allInstalled.some((c: Card) => coreCard.rezzed(c));
    }),
    choices: { card: (c: Card) => coreCard.rezzed(c) },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const targetCost = (target as any).cost;
      continue_ability(
        state, side,
        {
          prompt: `Choose a runner card that costs ${targetCost} or less to trash`,
          choices: { card: (c: Card) => coreCard.installed(c) && coreCard.runner(c) && (c as any).cost <= targetCost },
          msg: (msgFn: any) => target.title,
          async: true,
          effect: effect(coreMoving.trash(eid, target)),
        },
        card,
        null
      );
    }),
  },
};

// Kingmaking
export const kingmaking: CardDef = {
  title: 'Kingmaking',
  'on-score': {
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.drawUpTo(state, side, card, 3)], []);
      continue_ability(state, side, addAbi, card, null);
    }),
  },
};

function addAbiFn(): any {
  return {
    prompt: 'Choose 1 agenda worth 1 or less points',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (state as any).corp?.hand?.length > 0;
    }),
    async: true,
    choices: { card: (c: Card) => coreCard.agenda(c) && coreCard.inHand(c) && (c as any).agendapoints <= 1 },
    'waiting-prompt': true,
    msg: (msgFn: any) => `add ${target.title} from HQ to [their] score area`,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const c = coreMoving.move(state, ':corp', target, ':scored');
      coreInitializing.cardInit(state, ':corp', c, { 'resolve-effect': false, 'init-data': true });
      coreAgendas.updateAllAdvancementRequirements(state);
      coreAgendas.updateAllAgendaPoints(state);
      coreWinning.checkWinByAgenda(state, side);
      coreEid.effectCompleted(state, side, eid);
    }),
  };
}
const addAbi = addAbiFn();

// Labyrinthine Servers
export const labyrinthineServers: CardDef = {
  title: 'Labyrinthine Servers',
  'on-score': agendaCounters(2, ':power'),
  prevention: [{
    prevents: ':jack-out',
    type: ':ability',
    ability: {
      cost: [corePayment.toC('power', 1)],
      msg: 'prevent the runner from jacking out for the remainder of this run',
      condition: ':active',
      async: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return corePrevention.preventable(forms.context(state, card, targets));
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' }, corePrevention.preventJackOut(state, side)], []);
        coreEffects.registerLingeringEffect(state, side, card, {
          type: ':cannot-jack-out',
          value: true,
          duration: ':end-of-run',
        });
        coreEid.effectCompleted(state, side, eid);
      }),
    },
  }],
};

// Let Them Dream
export const letThemDream: CardDef = {
  title: 'Let Them Dream',
  'on-score': {
    ...coreChooseOne.chooseOneHelper({
      optional: true,
      prompt: 'Search for an Agenda from where?',
    }, [
      { option: 'HQ', ability: findAbi(':hq') },
      { option: 'R&D', ability: findAbi(':rd') },
      { option: 'Archives', ability: findAbi(':archives') },
    ]),
  },
  'agendapoints-runner': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return 1; }),
};

function findAbi(zone: string): any {
  return {
    prompt: 'Choose an agenda',
    'show-discard': zone === ':archives',
    choices: zone === ':rd'
      ? req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const corp = (state as any).corp;
          return corePrompts.cancellable((corp?.deck || []).filter((c: Card) => coreCard.agenda(c)).sort((a: Card, b: Card) => (a.title || '').localeCompare(b.title || '')), { sorted: true });
        })
      : { card: (c: Card) => coreCard.agenda(c) && (zone === ':hq' ? coreCard.inHand(c) : coreCard.inDiscard(c)) },
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      moveToOne(target, zone);
    }),
    async: true,
    'cancel-effect': coreShuffling.shuffleMyDeck!,
  };
}

function moveToOne(c: Card, from: string): any {
  const andThen = (s: string) => `${from === ':rd' ? ', shuffle R&D, and then ' : ' and '}${s}`;
  return coreChooseOne.chooseOneHelper({ prompt: `Move ${c.title} where?` }, [
    { option: 'HQ', ability: {
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        if (from === ':rd') coreShuffling.shuffle(state, side, ':deck');
        coreMoving.move(state, side, c, 'hand');
        coreRevealing.revealLoud(state, side, eid, card, { 'and-then': andThen('add it to HQ') }, c);
      }),
    }},
    { option: 'Bottom of R&D', ability: {
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        if (from === ':rd') coreShuffling.shuffle(state, side, ':deck');
        coreMoving.move(state, side, c, 'deck');
        coreRevealing.revealLoud(state, side, eid, card, { 'and-then': andThen('add it to the bottom of R&D') }, c);
      }),
    }},
  ]);
}

// License Acquisition
export const licenseAcquisition: CardDef = {
  title: 'License Acquisition',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    prompt: 'Choose an asset or upgrade to install from Archives or HQ',
    'show-discard': true,
    choices: { card: (c: Card) => coreCard.corp(c) && (coreCard.asset(c) || coreCard.upgrade(c)) && (coreCard.inHand(c) || coreCard.inDiscard(c)) },
    msg: (msgFn: any) => `install and rez ${target.title}, ignoring all costs`,
    async: true,
    effect: effect(coreInstalling.corpInstall(eid, target, null, { 'install-state': ':rezzed-no-cost', msgKeys: { installSource: card, displayOrigin: true } })),
  },
};

// Lightning Laboratory
export const lightningLaboratory: CardDef = {
  title: 'Lightning Laboratory',
  'on-score': agendaCounters(1),
  events: [{
    event: 'run',
    async: true,
    optional: {
      prompt: (msgFn: any) => `Remove 1 hosted agenda counter to rez up to 2 pieces of ice protecting ${coreServers.zoneToName(forms.context(state, card, targets)?.server || '')}, ignoring all costs?`,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (coreCard.getCounters(card, ':agenda') || 0) > 0;
      }),
      'yes-ability': {
        cost: [corePayment.toC('agenda', 1)],
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const currentServer = (state as any).run?.server?.[0];
          continue_ability(
            state, side,
            {
              prompt: (msgFn: any) => `Choose up to 2 pieces of ice protecting ${coreServers.zoneToName(currentServer)}`,
              'waiting-prompt': true,
              choices: { card: (c: Card) => coreCard.ice(c) && !coreCard.rezzed(c) && (coreCard.getZone(c) || [])[1] === currentServer, max: 2 },
              async: true,
              cancel: { effect: effect(coreEngine.registerEvents(state, side, card, [iceDerez(currentServer)]) ) },
              effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.registerEvents(state, side, card, [iceDerez(currentServer)])], []);
                yield wait_for(state, [{ asyncResult: 'result' }, coreRezzing.rezMultipleCards(state, side, eid, targets, { 'ignore-cost': ':all-costs', msgKeys: { includeCostFromEid: eid } })], []);
              }),
            },
            card,
            null
          );
        }),
      },
    },
  }],
};

function iceDerez(zone: string): any {
  return {
    event: 'runner-turn-ends',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const allActive = coreBoard.allActiveInstalled(state, ':corp');
      return allActive.some((c: Card) => (c as any).zone === ['servers', zone, 'ices']);
    }),
    duration: ':end-of-turn',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const allActive = coreBoard.allActiveInstalled(state, ':corp');
      const matchingIces = allActive.filter((c: Card) => (c as any).zone === ['servers', zone, 'ices']);
      const derezCount = Math.min(2, matchingIces.length);
      continue_ability(
        state, side,
        {
          prompt: (msgFn: any) => `Choose ${utils.quantify(derezCount, 'piece')} of ice protecting ${coreServers.zoneToName([zone])} to derez`,
          'waiting-prompt': true,
          choices: { card: (c: Card) => coreCard.ice(c) && coreCard.rezzed(c) && (coreCard.getZone(c) || [])[1] === zone, max: derezCount, min: derezCount },
          msg: (msgFn: any) => `derez ${utils.enumerateStr(targets.map((t: Card) => coreToString.cardStr(state, t)))}`,
          async: true,
          effect: effect(coreRezzing.derez(state, side, eid, targets)),
        },
        card,
        null
      );
    }),
  };
}

// Longevity Serum
export const longevitySerum: CardDef = {
  title: 'Longevity Serum',
  'on-score': {
    prompt: 'Choose any number of cards in HQ to trash',
    choices: { max: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).corp?.hand?.length || 0; }), card: (c: Card) => coreCard.corp(c) && coreCard.inHand(c) },
    msg: { public: (msgFn: any) => `trash ${utils.quantify(targets.length, 'card')} from HQ`, corp: (msgFn: any) => `trash ${utils.quantify(targets.length, 'card')} from HQ (${utils.enumerateCards(targets, { sorted: true })})` },
    async: true,
    cancel: { msg: 'decline trashing any cards from HQ', async: true, effect: effect(coreShuffling.shuffleIntoRDEffect(state, side, eid, card, 3)) },
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trashCards(state, side, targets, { unpreventable: true, causeCard: card })], []);
      coreShuffling.shuffleIntoRDEffect(state, side, eid, card, 3);
    }),
  },
};

// Lotus Haze
export const lotusHaze: CardDef = {
  title: 'Lotus Haze',
  'on-score': agendaCounters(3),
  abilities: [{
    cost: [corePayment.toC('agenda', 1)],
    prompt: 'Choose an upgrade to move',
    choices: { card: (c: Card) => coreCard.upgrade(c) && coreCard.rezzed(c) },
    label: 'Move a rezzed upgrade to the root of another server.',
    'waiting-prompt': true,
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const toMove = target;
      const zone = (coreCard.getZone(toMove) || [])[1];
      const notSameZone = (zones: string[]) => zones.filter((z: string) => z !== coreServers.zoneToName(zone));
      const legalZonesFn = toMove && (coreCard.getCardDef(toMove) as any)?.legalZones
        ? (zones: string[]) => (coreCard.getCardDef(toMove) as any).legalZones(state, side, eid, card, zones)
        : (zones: string[]) => zones;
      const regionRestriction = (zones: string[]) => {
        if (coreCard.hasSubtype(toMove, 'Region')) {
          return zones.filter((z: string) => {
            const serverZ = coreServers.serverToZone(state, z);
            const content = (state as any).corp?.servers?.[serverZ]?.content;
            return !content?.some((c: Card) => coreCard.hasSubtype(c, 'Region'));
          });
        }
        return zones;
      };
      const serverList = coreBoard.serverList(state);
      const legalMoves = regionRestriction(notSameZone(serverList)).filter(Boolean);
      if (legalMoves.length > 0) {
        continue_ability(
          state, side,
          {
            prompt: 'Choose a server',
            choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return legalMoves; }),
            msg: (msgFn: any) => `move ${toMove.title} to ${target}`,
            effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              const c = coreMoving.move(state, side, toMove, [...coreServers.serverToZone(state, target), ':content']);
              coreEngine.unregisterEvents(state, side, toMove);
              coreEngine.registerDefaultEvents(state, side, c);
            }),
          },
          card,
          null
        );
      } else {
        continue_ability(
          state, side,
          { prompt: `You have no legal moves for ${toMove.title}`, msg: (msgFn: any) => `reveal that they have no legal moves for ${toMove.title}`, choices: ['OK'] },
          card,
          null
        );
      }
    }),
  }],
};

// Luminal Transubstantiation
export const luminalTransubstantiation: CardDef = {
  title: 'Luminal Transubstantiation',
  'on-score': {
    silent: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      coreGaining.gainClicks(state, ':corp', 3);
      coreFlags.registerTurnFlag!(state, side, card, ':can-score', function(state: State, side: Side, card: Card) {
        ((): boolean => { coreToasts.toast(state, ':corp', 'Cannot score cards this turn due to Luminal Transubstantiation.', 'warning'); return false; })();
        return false;
      });
    }),
  },
};

// Mandatory Seed Replacement
export const mandatorySeedReplacement: CardDef = {
  title: 'Mandatory Seed Replacement',
  'on-score': {
    async: true,
    msg: 'rearrange any number of ice',
    effect: effect(msr()),
  },
};

function msr(): any {
  return {
    prompt: 'Choose two pieces of ice to swap positions',
    choices: { card: (c: Card) => coreCard.installed(c) && coreCard.ice(c), max: 2 },
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets.length === 2) {
        coreMoving.swapIce(state, side, targets[0], targets[1]);
        coreSay.systemMsg(state, side, `swaps the position of ${coreToString.cardStr(state, targets[0])} and ${coreToString.cardStr(state, targets[1])}`);
        continue_ability(state, side, msr(), card, null);
      } else {
        coreSay.systemMsg(state, ':corp', 'has finished rearranging ice');
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

// Mandatory Upgrades
export const mandatoryUpgrades: CardDef = {
  title: 'Mandatory Upgrades',
  'move-zone': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    if (coreCard.inScored(card) && (card as any)['scored-side'] === ':corp') {
      coreSay.systemMsg(state, side, `uses ${card.title} to gain 1 addition [Click] per turn`);
      if ((state as any).activePlayer === ':corp') coreGaining.gainClicks(state, ':corp', 1);
      coreGaining.gain(state, ':corp', ':click-per-turn', 1);
      coreEid.effectCompleted(state, side, eid);
    } else {
      coreEid.effectCompleted(state, side, eid);
    }
  }),
  'leave-play': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    coreGaining.lose(state, ':corp', ':click', 1, ':click-per-turn', 1);
  }),
};

// Market Research
export const marketResearch: CardDef = {
  title: 'Market Research',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.tagged(state); }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      addAgendaPointCounters(state, side, eid, card, 1);
    }),
  },
  'agendapoints-corp': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return (coreCard.getCounters(card, ':agenda') || 0) === 0 ? 2 : 3;
  }),
};

// Medical Breakthrough
export const medicalBreakthrough: CardDef = {
  title: 'Medical Breakthrough',
  flags: { 'has-events-when-stolen': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }) },
  'static-abilities': [{
    type: ':advancement-requirement',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (targets[0] || {}).title === 'Medical Breakthrough'; }),
    value: -1,
  }],
};

// Méliès City Luxury Line
export const metiesCityLuxuryLine: CardDef = {
  title: 'Méliès City Luxury Line',
  'steal-cost-bonus': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return [corePayment.toC('click', 1)]; }),
  'on-score': { msg: 'gain [Click]', silent: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }), effect: effect(coreGaining.gainClicks(state, ':corp', 1)) },
};

// Megaprix Qualifier
export const megaprixQualifier: CardDef = {
  title: 'Megaprix Qualifier',
  'on-score': {
    silent: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const scored = [...((state as any).corp?.scored || []), ...((state as any).runner?.scored || [])];
      return scored.filter((c: Card) => c.title === 'Megaprix Qualifier').length > 1;
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      addAgendaPointCounters(state, side, eid, card, 1);
    }),
  },
  'agendapoints-corp': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return (coreCard.getCounters(card, ':agenda') || 0) === 0 ? 1 : 2;
  }),
};

// Merger
export const merger: CardDef = {
  title: 'Merger',
  'agendapoints-runner': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return 3; }),
};

// Meteor Mining
export const meteorMining: CardDef = {
  title: 'Meteor Mining',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    async: true,
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const tags = utils.countTags(state) || 0;
      return ['Gain 7 [Credits]', tags >= 2 ? 'Do 7 meat damage' : null, 'No action'].filter(Boolean) as string[];
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const t = forms.target(state, card, targets);
      if (t === 'Gain 7 [Credits]') {
        coreSay.systemMsg(state, side, `uses ${card.title} to gain 7 [Credits]`);
        coreGaining.gainCredits(state, side, eid, 7);
      } else if (t === 'Do 7 meat damage') {
        coreSay.systemMsg(state, side, `uses ${card.title} to do 7 meat damage`);
        coreDamage.damage(state, side, eid, ':meat', 7, { card: card });
      } else {
        coreSay.systemMsg(state, side, `declines to use ${card.title}`);
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  },
};

// Midnight-3 Arcology
export const midnight3Arcology: CardDef = {
  title: 'Midnight-3 Arcology',
  'on-score': {
    async: true,
    msg: (msgFn: any) => 'draw 3 cards and skip [their] discard step this turn',
    effect: effect(
      coreEffects.registerLingeringEffect(card, { type: ':skip-discard', duration: ':end-of-turn', value: true }),
      coreDrawing.draw(':corp', eid, 3)
    ),
  },
};

// NAPD Contract
export const napdContract: CardDef = {
  title: 'NAPD Contract',
  'steal-cost-bonus': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return [corePayment.toC('credit', 4)]; }),
  'advancement-requirement': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return utils.countBadPub(state) || 0;
  }),
};

// Net Quarantine
export const netQuarantine: CardDef = {
  title: 'Net Quarantine',
  'static-abilities': [{
    type: ':trace-force-link',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreEvents.turnEvents(state, side, ':initialize-trace').length === 1;
    }),
    value: 0,
  }],
  events: [
    { event: 'successful-trace', async: true, effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const extra = Math.floor((targets[0]?.runnerSpent || 0) / 2);
      if (extra > 0) {
        coreSay.systemMsg(state, ':corp', `uses ${card.title} to gain ${extra} [Credits]`);
        coreGaining.gainCredits(state, side, eid, extra);
      } else {
        coreEid.effectCompleted(eid);
      }
    })},
    { event: 'unsuccessful-trace', async: true, effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const extra = Math.floor((targets[0]?.runnerSpent || 0) / 2);
      if (extra > 0) {
        coreSay.systemMsg(state, ':corp', `uses ${card.title} to gain ${extra} [Credits]`);
        coreGaining.gainCredits(state, side, eid, extra);
      } else {
        coreEid.effectCompleted(eid);
      }
    })},
  ].filter(Boolean),
};

// New Construction
export const newConstruction: CardDef = {
  title: 'New Construction',
  'install-state': ':face-up',
  events: [{
    event: 'advance',
    condition: ':faceup',
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.sameCard(card, (forms.context(state, card, targets) || {}).card);
      }),
      prompt: 'Install a card from HQ in a new remote?',
      'yes-ability': {
        prompt: 'Choose a card to install',
        choices: { card: (c: Card) => !coreCard.operation(c) && !coreCard.ice(c) && coreCard.corp(c) && coreCard.inHand(c) },
        msg: (msgFn: any) => `install a card from HQ${(coreCard.getCounters(coreCard.getCard(state, card), ':advancement') || 0) <= 5 ? ' and rez it, ignoring all costs' : ''}`,
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const adv = coreCard.getCounters(coreCard.getCard(state, card), ':advancement') || 0;
          yield wait_for(state, [{ asyncResult: 'result' }, coreInstalling.corpInstall(eid, target, 'New remote', {
            'install-state': adv <= 5 ? ':rezzed-no-cost' : undefined,
            msgKeys: { installSource: card, displayOrigin: true },
          })], []);
        }),
      },
    },
  }],
};

// Next Big Thing
export const nextBigThing: CardDef = {
  title: 'Next Big Thing',
  'on-score': agendaCounters(1),
  stolen: agendaCounters(1),
  flags: { 'has-abilities-when-stolen': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }) },
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1), corePayment.toC('agenda')],
    label: 'Draw 4 cards',
    msg: 'draw 4 cards',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      coreSay.playSfx(state, side, 'click-card-2');
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, side, eid, 4)], []);
      continue_ability(
        state, side,
        {
          prompt: 'Shuffle any number of cards into R&D',
          'waiting-prompt': true,
          choices: { max: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).corp?.hand?.length || 0; }), card: (c: Card) => coreCard.corp(c) && coreCard.inHand(c) },
          msg: { public: (msgFn: any) => `shuffle ${utils.quantify(targets.length, 'card')} from HQ into R&D`, corp: (msgFn: any) => `shuffle ${utils.enumerateCards(targets, { sorted: true })} from HQ into R&D` },
          cancel: coreShuffling.shuffleMyDeck!,
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            for (const t of targets) {
              yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, side, t, 'deck')], []);
            }
            coreShuffling.shuffle(state, side, ':deck');
          }),
        },
        card,
        null
      );
    }),
  }],
};

// NEXT Wave 2
export const nextWave2: CardDef = {
  title: 'NEXT Wave 2',
  'on-score': {
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const allInstalled = coreBoard.allInstalled(state, ':corp');
      const nextIces = allInstalled.filter((c: Card) => coreCard.rezzed(c) && coreCard.ice(c) && coreCard.hasSubtype(c, 'NEXT'));
      if (nextIces.length > 0) {
        continue_ability(
          state, side,
          {
            optional: {
              prompt: 'Do 1 core damage?',
              'yes-ability': { msg: 'do 1 core damage', async: true, effect: effect(coreDamage.damage(eid, ':brain', 1, { card: card })) },
            },
          },
          card,
          null
        );
      }
    }),
  },
};
