import type { Card, CardDef, EID, Side, State } from '../../types';
import * as coreAccess from '../core/access';
import * as coreActions from '../core/actions';
import * as coreAgendas from '../core/agendas';
import * as coreBadPublicity from '../core/bad_publicity';
import * as coreBoard from '../core/board';
import * as coreCard from '../core/card';
import * as coreCardDefs from '../core/card_defs';
import * as coreCheckpoint from '../core/checkpoint';
import * as coreChooseOne from '../core/choose_one';
import * as coreCostFns from '../core/cost_fns';
import * as coreDamage from '../core/damage';
import * as coreDefHelpers from '../core/def_helpers';
import * as coreDrawing from '../core/drawing';
import * as coreEffects from '../core/effects';
import * as coreEid from '../core/eid';
import * as coreEngine from '../core/engine';
import * as coreEvents from '../core/events';
import * as coreExpend from '../core/expend';
import * as coreExpose from '../core/expose';
import * as coreFinding from '../core/finding';
import * as coreFlags from '../core/flags';
import * as coreGaining from '../core/gaining';
import * as coreHandSize from '../core/hand_size';
import * as coreHosting from '../core/hosting';
import * as coreIce from '../core/ice';
import * as coreInitializing from '../core/initializing';
import * as coreInstalling from '../core/installing';
import * as coreLink from '../core/link';
import * as coreMoving from '../core/moving';
import * as coreOptional from '../core/optional';
import * as corePayment from '../core/payment';
import * as corePrevention from '../core/prevention';
import * as coreProps from '../core/props';
import * as corePrompts from '../core/prompts';
import * as coreRevealing from '../core/revealing';
import * as coreRezzing from '../core/rezzing';
import * as coreRuns from '../core/runs';
import * as coreSay from '../core/say';
import * as coreServers from '../core/servers';
import * as coreSetAside from '../core/set_aside';
import * as coreShuffling from '../core/shuffling';
import * as coreTags from '../core/tags';
import * as coreThreat from '../core/threat';
import * as coreToString from '../core/to_string';
import * as coreToasts from '../core/toasts';
import * as coreUpdate from '../core/update';
import * as coreWinning from '../core/winning';
import * as utils from '../utils';
import { req, effect, msg, wait_for, continue_ability, forms } from '../macros';
import { advanceAmbush, campaign } from './assets_1';
// Echo Chamber
export const echoChamber: CardDef = {
  title: 'Echo Chamber',
  abilities: [{
    action: true,
    label: 'Add this asset to your score area as an agenda worth 1 agenda point',
    cost: [corePayment.toC('click', 3)],
    msg: 'add itself to [their] score area as an agenda worth 1 agenda point',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      coreMoving.asAgenda(state, ':corp', card, 1);
    }),
  }],
};

// Edge of World
export const edgeOfWorld: CardDef = {
  title: 'Edge of World',
  ...coreDefHelpers.installedAccessTrigger(3, {
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const run = (state as any).run;
      const ices = (state as any).corp?.servers?.[run?.server]?.ices || [];
      return `do ${ices.length} core damage`;
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      const run = (state as any).run;
      const ices = (state as any).corp?.servers?.[run?.server]?.ices || [];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':brain', ices.length, { card })], []);
    }),
  }),
};

// Eliza's Toybox
export const elizasToybox: CardDef = {
  title: "Eliza's Toybox", // apostrophe requires double quotes
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 3)],
    'keep-menu-open': ':while-3-clicks-left',
    label: 'Rez a card, ignoring all costs',
    choices: {
      card: (c: Card) => coreCard.corp(c) && coreCard.installed(c) && !coreCard.agenda(c) && !coreCard.rezzed(c),
    },
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRezzing.rez(state, side, eid, targets[0], {
          ignoreCost: ':all-costs',
          msgKeys: { includeCostFromEid: eid },
        })], []);
    }),
  }],
};

// Elizabeth Mills
export const elizabethMills: CardDef = {
  title: 'Elizabeth Mills',
  'on-rez': {
    msg: 'remove 1 bad publicity',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      coreBadPublicity.loseBadPublicity(state, side, 1);
    }),
  },
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1), corePayment.toC('trash-can', 1)],
    label: 'Trash a location and take 1 bad publicity',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      const hasLocation = (coreBoard.allInstalled(state, ':runner') || []).some((c: Card) =>
        coreCard.hasSubtype(c, 'Location'));
      if (hasLocation) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            prompt: 'Trash a location and take 1 bad publicity',
            msg: msg((s: State, sd: Side, e: EID, c: Card, t: any[]) =>
              `trash ${(t[0] as any)?.title} and take 1 bad publicity`),
            choices: { min: 1, card: (c: Card) => coreCard.hasSubtype(c, 'Location') },
            async: true,
            effect: req(function*(s: State, sd: Side, e: EID, c: Card, t: any[]): Generator<any, any, any> {
              yield wait_for(s, [{ asyncResult: 'result' },
                coreMoving.trash(s, sd, e, t[0], { causeCard: c })], []);
              yield wait_for(s, [{ asyncResult: 'result' },
                coreBadPublicity.gainBadPublicity(s, ':corp', e, 1)], []);
            }),
          }, card, null)], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            msg: 'take 1 bad publicity',
            async: true,
            effect: effect(function*(s: State, sd: Side, e: EID, c: Card): Generator<any, any, any> {
              yield wait_for(s, [{ asyncResult: 'result' },
                coreBadPublicity.gainBadPublicity(s, ':corp', e, 1)], []);
            }),
          }, card, null)], []);
      }
    }),
  }],
};

// Encryption Protocol
export const encryptionProtocol: CardDef = {
  title: 'Encryption Protocol',
  'static-abilities': [{
    type: ':trash-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreCard.installed(targets[0]);
    }),
    value: 1,
  }],
};

// Esca
export const esca: CardDef = {
  title: 'Esca',
  flags: { 'rd-reveal': req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }) },
  poison: true,
  'on-access': {
    msg: 'force the Runner to lose 1 [Credits]',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.loseCredits(state, ':runner', eid, 1)], []);
      if (coreFlags.tagged(state)) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            req: req(function*(s: State): Generator<any, any, any> { return coreFlags.tagged(s); }),
            msg: 'do 1 net damage',
            async: true,
            effect: req(function*(s: State, sd: Side, e: EID, c: Card): Generator<any, any, any> {
              yield wait_for(s, [{ asyncResult: 'result' },
                coreDamage.damage(s, sd, e, ':net', 1, null)], []);
            }),
          }, card, null)], []);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  },
};

// Estelle Moon
export const estelleMoon: CardDef = {
  title: 'Estelle Moon',
  events: [{
    event: ':corp-install',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = (targets as any)[0] || {};
      const c = ctx.card;
      return (coreCard.asset(c) || coreCard.agenda(c) || coreCard.upgrade(c)) &&
        coreServers.isRemote((coreCard.getZone(c) || [])[1]);
    }),
    msg: 'place 1 power counter on itself',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':power', 1, null)], []);
    }),
  }],
  abilities: [{
    label: 'Draw 1 card and gain 2 [Credits] for each hosted power counter',
    cost: [corePayment.toC('trash-can', 1)],
    'change-in-game-state': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return coreCard.getCounters(card, ':power') > 0;
      }),
    },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      const counters = coreCard.getCounters(card, ':power');
      const credits = 2 * counters;
      coreSay.systemMsg(state, side,
        `uses ${(card as any)?.title} to draw ${utils.quantify(counters, 'card')} and gain ${credits} [Credits]`);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.draw(state, side, eid, counters)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, credits)], []);
    }),
  }],
};

// Eve Campaign
export const eveCampaign: CardDef = {
  title: 'Eve Campaign',
  ...campaign(16, 2),
};

// Executive Boot Camp
export const executiveBootCamp: CardDef = {
  title: 'Executive Boot Camp',
  'derezzed-events': [coreDefHelpers.corpRezToast],
  events: [{
    event: ':corp-turn-begins',
    interactive: req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }),
    prompt: 'Rez a card, paying 1 [Credit] less',
    'waiting-prompt': true,
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return coreCard.corp(targets[0]) && coreCard.installed(targets[0]) && !coreCard.rezzed(targets[0]) &&
          coreRezzing.canPayToRez(state, side, eid, targets[0], { costBonus: -1 });
      }),
    },
    'change-in-game-state': {
      req: req(function*(state: State): Generator<any, any, any> {
        return (coreBoard.allInstalled(state, ':corp') || []).some((c: Card) => !coreCard.rezzed(c));
      }),
      silent: true,
    },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRezzing.rez(state, side, eid, targets[0], { costBonus: -1, noWarning: true })], []);
    }),
  }],
  abilities: [{
    prompt: 'Choose an asset to reveal and add to HQ',
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `reveal ${(targets[0] as any)?.title}, add it to HQ, and shuffle R&D`),
    choices: req(function*(state: State): Generator<any, any, any> {
      return corePrompts.cancellable(
        ((state as any).corp?.deck || []).filter((c: Card) => coreCard.asset(c)),
        { sorted: true });
    }),
    cost: [corePayment.toC('credit', 1), corePayment.toC('trash-can', 1)],
    cancel: { ...coreShuffling.shuffleMyDeck, cost: [corePayment.toC('credit', 1), corePayment.toC('trash-can', 1)] },
    label: 'Search R&D for an asset',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRevealing.reveal(state, side, targets[0])], []);
      coreShuffling.shuffle(state, side, ':deck');
      coreMoving.move(state, side, targets[0], ':hand', null);
      coreEid.effectCompleted(state, side, eid);
    }),
  }],
};

// Executive Search Firm
export const executiveSearchFirm: CardDef = {
  title: 'Executive Search Firm',
  abilities: [{
    action: true,
    prompt: 'Choose an Executive, Sysop, or Character to add to HQ',
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `reveal ${(targets[0] as any)?.title}, add it to HQ, and shuffle R&D`),
    choices: req(function*(state: State): Generator<any, any, any> {
      return corePrompts.cancellable(
        ((state as any).corp?.deck || []).filter((c: Card) =>
          coreCard.hasAnySubtype(c, ['Executive', 'Sysop', 'Character'])),
        { sorted: true });
    }),
    cost: [corePayment.toC('click', 1)],
    cancel: { ...coreShuffling.shuffleMyDeck, cost: [corePayment.toC('click', 1)], action: true },
    'keep-menu-open': ':while-clicks-left',
    label: 'Search R&D for an Executive, Sysop, or Character',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreMoving.move(state, side, targets[0], ':hand', null);
      coreShuffling.shuffle(state, ':deck');
    }),
  }],
};

// Exposé
export const expose: CardDef = {
  title: 'Exposé',
  advanceable: ':always',
  abilities: [{
    label: 'Remove 1 bad publicity for each advancement counter on Exposé',
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `remove ${coreCard.getCounters(card, ':advancement')} bad publicity`),
    cost: [corePayment.toC('trash-can', 1)],
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      coreBadPublicity.loseBadPublicity(state, side, coreCard.getCounters(card, ':advancement'));
    }),
  }],
};

// False Flag
export const falseFlag: CardDef = {
  title: 'False Flag',
  advanceable: ':always',
  'on-access': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return coreCard.getCounters(coreCard.getCard(state, card), ':advancement') > 0;
    }),
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `give the runner ${utils.quantify(Math.floor(coreCard.getCounters(coreCard.getCard(state, card), ':advancement') / 2), 'tag')}`),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      const n = Math.floor(coreCard.getCounters(coreCard.getCard(state, card), ':advancement') / 2);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreTags.gainTags(state, ':corp', eid, n)], []);
    }),
  },
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1), corePayment.toC('advancement', 7)],
    label: 'Add this asset to your score area as an agenda worth 3 agenda points',
    msg: 'add itself to [their] score area as an agenda worth 3 agenda points',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      coreMoving.asAgenda(state, ':corp', card, 3);
    }),
  }],
};

// Federal Fundraising
export const federalFundraising: CardDef = (() => {
  const drawAb: any = {
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return coreFlags.unprotected(state, side, card);
      }),
      prompt: 'Draw 1 card?',
      'waiting-prompt': true,
      'yes-ability': { msg: 'draw 1 card', async: true, effect: effect(function*(state: State, side: Side, eid: EID): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, side, eid, 1)], []);
      }) },
      'no-ability': {
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
          coreSay.systemMsg(state, side, `declines to use ${(card as any)?.title} to draw 1 card`);
        }),
      },
    },
  };
  const ability: any = {
    once: ':per-turn',
    req: req(function*(state: State): Generator<any, any, any> {
      return !!(state as any).corpPhase12 && ((state as any).corp?.deck?.length > 0);
    }),
    skippable: true,
    interactive: req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }),
    label: 'Look at the top 3 cards of R&D (start of turn)',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          optional: {
            prompt: 'Look at the top 3 cards of R&D?',
            'waiting-prompt': true,
            'no-ability': drawAb,
            'yes-ability': {
              msg: 'rearrange the top 3 cards of R&D',
              async: true,
              'waiting-prompt': true,
              effect: req(function*(s: State, sd: Side, e: EID, c: Card): Generator<any, any, any> {
                const from = (s as any).corp?.deck?.slice(0, 3) || [];
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreEngine.resolveAbility(s, sd,
                    coreDefHelpers.reorderChoice(':corp', ':runner', from, [], from.length, from),
                    c, null)], []);
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreEngine.resolveAbility(s, sd, drawAb, c, null)], []);
              }),
            },
          },
        }, card, null)], []);
    }),
  };
  return {
    title: 'Federal Fundraising',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    flags: { 'corp-phase-12': req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }) },
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
  };
})();

// Franchise City
export const franchiseCity: CardDef = {
  title: 'Franchise City',
  events: [{
    event: ':access',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreCard.agenda((targets as any)[0]?.accessedCard);
    }),
    msg: 'add itself to [their] score area as an agenda worth 1 agenda point',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      coreMoving.asAgenda(state, ':corp', card, 1);
    }),
  }],
};

// Front Company
export const frontCompany: CardDef = {
  title: 'Front Company',
  'static-abilities': [{
    type: ':cannot-run-on-server',
    req: req(function*(state: State, side: Side): Generator<any, any, any> {
      return !(coreEvents.turnEvents(state, side, ':run') || []).length;
    }),
    value: req(function*(state: State): Generator<any, any, any> {
      return Object.keys((state as any).corp?.servers?.remote || {}).map((k: string) => k);
    }),
  }],
  'rez-req': req(function*(state: State): Generator<any, any, any> { return state.activePlayer === ':corp'; }),
  events: [{
    event: ':run',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = (targets as any)[0] || {};
      return ctx.targetServer === ':archives' &&
        coreEvents.firstEvent(state, ':runner', ':run', (t: any[]) => (t[0] || {}).targetServer === ':archives') &&
        coreFlags.unprotected(state, side, card);
    }),
    msg: 'do 2 net damage',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':net', 2, null)], []);
    }),
  }],
};

// Full Immersion RecStudio
export const fullImmersionRecStudio: CardDef = {
  title: 'Full Immersion RecStudio',
  'can-host': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    return (coreCard.asset(targets[0]) || coreCard.agenda(targets[0])) &&
      ((card as any).hosted?.length || 0) < 2;
  }),
  'trash-cost-bonus': req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    return 3 * ((card as any).hosted?.length || 0);
  }),
  abilities: [
    {
      action: true,
      label: 'Install an asset or agenda on this asset',
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return ((card as any).hosted?.length || 0) < 2;
      }),
      cost: [corePayment.toC('click', 1)],
      prompt: 'Choose an asset or agenda to install',
      choices: {
        card: (c: Card) => (coreCard.asset(c) || coreCard.agenda(c)) && coreCard.inHand(c) && coreCard.corp(c),
      },
      msg: 'install and host an asset or agenda',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreInstalling.corpInstall(state, side, eid, targets[0], card, null)], []);
      }),
    },
    {
      label: 'Install a previously-installed asset or agenda on this asset (fixes only)',
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return ((card as any).hosted?.length || 0) < 2;
      }),
      prompt: 'Choose an installed asset or agenda to host',
      choices: {
        card: (c: Card) => (coreCard.asset(c) || coreCard.agenda(c)) && coreCard.installed(c) && coreCard.corp(c),
      },
      msg: 'install and host an asset or agenda',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        coreHosting.host(state, side, card, targets[0]);
      }),
    },
  ],
};

// Fumiko Yamamori
export const fumikoYamamori: CardDef = {
  title: 'Fumiko Yamamori',
  events: [{
    event: ':reveal-spent-credits',
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = (targets as any)[0] || {};
      return ctx.corpCredits != null && ctx.runnerCredits != null && ctx.corpCredits !== ctx.runnerCredits;
    }),
    msg: 'do 1 meat damage',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':meat', 1, { card })], []);
    }),
  }],
};

// Gaslight
export const gaslight: CardDef = (() => {
  const searchForOperation: any = {
    prompt: 'Choose an operation to add to HQ',
    'waiting-prompt': true,
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const t = targets[0];
      return t === 'Done' ? 'shuffle R&D' : `add ${coreCard.getTitle(t as Card)} from R&D to HQ`;
    }),
    choices: req(function*(state: State): Generator<any, any, any> {
      const ops = ((state as any).corp?.deck || []).filter((c: Card) => coreCard.operation(c))
        .sort((a: Card, b: Card) => ((a as any).title || '').localeCompare((b as any).title || ''));
      return [...ops, 'Done'];
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if (targets[0] === 'Done') {
        coreShuffling.shuffle(state, ':corp', ':deck');
        coreEid.effectCompleted(state, side, eid);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRevealing.reveal(state, side, targets[0])], []);
        coreShuffling.shuffle(state, ':corp', ':deck');
        coreMoving.move(state, ':corp', targets[0], ':hand', null);
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
  const ability: any = {
    once: ':per-turn',
    skippable: true,
    async: true,
    label: 'Search R&D for an operation (start of turn)',
    interactive: req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }),
    req: req(function*(state: State): Generator<any, any, any> { return !!(state as any).corpPhase12; }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          optional: {
            prompt: 'Trash this asset to search R&D for an operation?',
            'yes-ability': {
              async: true,
              effect: req(function*(s: State, sd: Side, e: EID, c: Card): Generator<any, any, any> {
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreMoving.trash(s, sd, c, { causeCard: c })], []);
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreEngine.resolveAbility(s, sd, searchForOperation, c, null)], []);
              }),
            },
          },
        }, card, null)], []);
    }),
  };
  return {
    title: 'Gaslight',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    flags: { 'corp-phase-12': req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }) },
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
  };
})();

// Gene Splicer
export const geneSplicer: CardDef = {
  title: 'Gene Splicer',
  advanceable: ':always',
  'on-access': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return coreCard.getCounters(coreCard.getCard(state, card), ':advancement') > 0;
    }),
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `do ${coreCard.getCounters(coreCard.getCard(state, card), ':advancement')} net damage`),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      const n = coreCard.getCounters(coreCard.getCard(state, card), ':advancement');
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':net', n, { card })], []);
    }),
  },
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1), corePayment.toC('advancement', 3)],
    label: 'Add this asset to your score area as an agenda worth 1 agenda point',
    msg: 'add itself to [their] score area as an agenda worth 1 agenda point',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      coreMoving.asAgenda(state, ':corp', card, 1);
    }),
  }],
};

// Genetics Pavilion
export const geneticsPavilion: CardDef = {
  title: 'Genetics Pavilion',
  'on-rez': {
    msg: 'prevent the Runner from drawing more than 2 cards during [runner-pronoun] turn',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      coreDrawing.maxDraw(state, ':runner', 2);
      if (coreDrawing.remainingDraws(state, ':runner') === 0) {
        coreDrawing.preventDraw(state, ':runner');
      }
    }),
  },
  events: [{
    event: ':runner-turn-begins',
    silent: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      coreDrawing.maxDraw(state, ':runner', 2);
    }),
  }],
  'leave-play': effect(function*(state: State): Generator<any, any, any> {
    const runner = (state as any).runner;
    if (runner?.register) {
      delete runner.register.maxDraw;
      delete runner.register.cannotDraw;
    }
  }),
};

// Ghost Branch
export const ghostBranch: CardDef = {
  title: 'Ghost Branch',
  ...advanceAmbush(0, {
    async: true,
    'waiting-prompt': true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return coreCard.getCounters(coreCard.getCard(state, card), ':advancement') > 0;
    }),
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `give the Runner ${utils.quantify(coreCard.getCounters(coreCard.getCard(state, card), ':advancement'), 'tag')}`),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      const n = coreCard.getCounters(coreCard.getCard(state, card), ':advancement');
      yield wait_for(state, [{ asyncResult: 'result' },
        coreTags.gainTags(state, ':corp', eid, n)], []);
    }),
  }),
};

// GRNDL Refinery
export const grndlRefinery: CardDef = {
  title: 'GRNDL Refinery',
  advanceable: ':always',
  abilities: [{
    action: true,
    label: 'Gain 4 [Credits] for each advancement counter on GRNDL Refinery',
    cost: [corePayment.toC('click', 1), corePayment.toC('trash-can', 1)],
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `gain ${4 * coreCard.getCounters(card, ':advancement')} [Credits]`),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, 4 * coreCard.getCounters(card, ':advancement'))], []);
    }),
  }],
};

// Haas Arcology AI
export const haasArcologyAI: CardDef = {
  title: 'Haas Arcology AI',
  advanceable: ':while-unrezzed',
  abilities: [{
    action: true,
    label: 'Gain [Click][Click]',
    once: ':per-turn',
    msg: 'gain [Click][Click]',
    cost: [corePayment.toC('click', 1), corePayment.toC('advancement', 1)],
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      coreGaining.gainClicks(state, side, 2);
    }),
  }],
};

export const heartsAndMinds: CardDef = (() => {
  const political: any = {
    ...coreDefHelpers.placeAdvancementCounter(true, 1),
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return coreCard.unprotected(state, card);
    }),
  };
  const ability: any = {
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return !!(state as any).corpPhase12;
    }),
    label: 'Move 1 hosted advancement counter to another card you can advance (start of turn)',
    skippable: true,
    once: ':per-turn',
    'waiting-prompt': true,
    prompt: 'Choose an installed card to move 1 hosted advancement counter from',
    choices: {
      card: (c: Card) => coreCard.installed(c) && coreCard.getCounters(c, ':advancement') > 0,
    },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const fromIce = targets[0];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          prompt: 'Choose an installed card you can advance',
          choices: {
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
              const t = targets[0];
              return coreCard.installed(t) && coreProps.canBeAdvanced(state, t) &&
                !coreCard.sameCard(fromIce, t);
            }),
          },
          msg: {
            public: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              `move 1 hosted advancement counter from ${coreToString.cardStr(state, fromIce)} to ${coreToString.cardStr(state, targets[0])}`),
            corp: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              `move 1 hosted advancement counter from ${coreToString.cardStr(state, fromIce, { maybeVisible: true })} to ${coreToString.cardStr(state, targets[0], { maybeVisible: true })}`),
          },
          async: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreProps.addProp(state, ':corp', targets[0], ':advance-counter', 1, { placed: true })], []);
            yield wait_for(state, [{ asyncResult: 'result' },
              coreProps.addProp(state, ':corp', fromIce, ':advance-counter', -1)], []);
            yield wait_for(state, [{ asyncResult: 'result' },
              coreEngine.resolveAbility(state, ':corp', political, card, null)], []);
          }),
          cancel: political,
        }, card, null)], []);
    }),
    cancel: political,
  };
  return {
    title: 'Hearts and Minds',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    flags: { 'corp-phase-12': req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }) },
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
  };
})();

// Honeyfarm
export const honeyfarm: CardDef = {
  title: 'Honeyfarm',
  flags: { 'rd-reveal': req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }) },
  poison: true,
  'on-access': {
    msg: 'force the Runner to lose 1 [Credits]',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.loseCredits(state, ':runner', eid, 1)], []);
    }),
  },
};

// Clyde Van Rite
export const clydeVanRite: CardDef = (() => {
  const ability: any = {
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 1)]) ||
        ((state as any).runner?.deck?.length > 0);
    }),
    player: ':runner',
    once: ':per-turn',
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      const opts: string[] = [];
      if (corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 1)])) {
        opts.push('Pay 1 [Credits]');
      }
      if (!corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 1)]) ||
        (state as any).runner?.deck?.length > 0) {
        opts.push('Trash the top card of the stack');
      }
      return opts;
    }),
    label: 'make the Runner pay 1 [Credits] or trash the top card of the stack (start of turn)',
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `force the Runner to ${utils.decapitalize(targets[0] || '')}`),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if (targets[0] === 'Pay 1 [Credits]') {
        const result: any = yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.pay(state, side, coreEid.makeEid(state, eid), card, corePayment.toC('credit', 1))], []);
        coreSay.systemMsg(state, side, result?.msg || '');
        coreEid.effectCompleted(state, side, eid);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.mill(state, ':runner', eid, ':runner', 1)], []);
      }
    }),
  };
  return {
    title: 'Clyde Van Rite',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    flags: { 'corp-phase-12': req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }) },
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
  };
})();

// Hostile Architecture
export const hostileArchitecture: CardDef = {
  title: 'Hostile Architecture',
  events: [{
    event: ':runner-trash',
    async: true,
    'once-per-instance': true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const valid = (evs: any[]) => evs.some((e: any) => coreCard.corp(e.card) && coreCard.installed(e.card));
      return valid(targets as any[]) &&
        coreEvents.firstEvent(state, side, ':runner-trash', (t: any[]) => valid(t));
    }),
    msg: 'do 2 meat damage',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, ':corp', eid, ':meat', 2, { card })], []);
    }),
  }],
};

// Hostile Infrastructure
export const hostileInfrastructure: CardDef = {
  title: 'Hostile Infrastructure',
  events: [{
    event: ':runner-trash',
    async: true,
    'once-per-instance': false,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreCard.corp((targets as any)[0]?.card);
    }),
    msg: 'do 1 net damage',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, ':corp', eid, ':net', 1, { card })], []);
    }),
  }],
};
