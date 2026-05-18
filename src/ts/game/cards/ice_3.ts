/**
 * ICE Cards
 * Ported from Clojure cards/ice.clj to TypeScript
 *
 * Contains ~317 card definitions with their abilities and events.
 */

import type { State, Side, Card, EID } from '../../types';
import * as coreBadPublicity from '../core/bad_publicity';
import * as coreBoard from '../core/board';
import * as coreCard from '../core/card';
import * as coreCardDefs from '../core/card_defs';
import * as coreCheckpoint from '../core/checkpoint';
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
import * as coreIce from '../core/ice';
import * as coreInstalling from '../core/installing';
import * as coreMoving from '../core/moving';
import * as corePayment from '../core/payment';
import * as coreProps from '../core/props';
import * as coreRevealing from '../core/revealing';
import * as coreRezzing from '../core/rezzing';
import * as coreRuns from '../core/runs';
import * as coreSay from '../core/say';
import * as coreServers from '../core/servers';
import * as coreTags from '../core/tags';
import * as coreThreat from '../core/threat';
import * as coreToString from '../core/to_string';
import * as coreToasts from '../core/toasts';
import * as coreUpdate from '../core/update';
import * as utils from '../utils';
import { req, effect, msg, wait_for, continue_ability, forms } from '../macros';
import type { CardDef } from '../../types';

import { bioraidBreak, doPsi, endTheRun, endTheRunIfTagged, endTheRunUnlessRunnerPays, forcedToAvoidTags, gainPowerCounter, installFromArchivesSub, installFromHqOrArchivesSub, maybeDrawSub, powerCounterAbility, runnerLosesClick, runnerTrashProgramSub, traceAbility, trashInstalledSub, trashProgramSub, wallIce, wonderSub } from './ice_1';

// Chrysalis
export const chrysalis: CardDef = {
  title: 'Chrysalis',
  flags: { 'rd-reveal': req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }) },
  subroutines: [coreDefHelpers.doNetDamage(2)],
  'on-access': {
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return !coreCard.inDiscard(card);
    }),
    msg: 'force the Runner to encounter Chrysalis',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRuns.forceIceEncounter(state, side, eid, card)], []);
    }),
  },
};

// Chum
export const chum: CardDef = {
  title: 'Chum',
  subroutines: [{
    label: 'Give +2 strength to next piece of ice Runner encounters',
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return forms.thisServer(state, card);
    }),
    msg: 'give +2 strength to the next piece of ice the Runner encounters',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      coreEvents.registerEvents(state, side, card, [{
        event: ':encounter-ice',
        duration: ':end-of-run',
        'unregister-once-resolved': true,
        effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> {
          const context = tgts[0];
          const targetIce = context?.ice;
          coreEffects.registerLingeringEffect(s, sd, c, {
            type: ':ice-strength',
            duration: ':end-of-encounter',
            value: 2,
            req: req(function*(s2: State, sd2: Side, e2: EID, c2: Card, tgts2: any[]): Generator<any, any, any> {
              return coreCard.sameCard(tgts2[0], targetIce);
            }),
          });
          coreEvents.registerEvents(s, sd, c, [
            Object.assign({}, coreDefHelpers.doNetDamage(3), {
              event: ':end-of-encounter',
              duration: ':end-of-run',
              'unregister-once-resolved': true,
              req: req(function*(s2: State, sd2: Side, e2: EID, c2: Card, tgts2: any[]): Generator<any, any, any> {
                const ctx = tgts2[0];
                return coreCard.sameCard(ctx?.ice, targetIce) &&
                  (ctx?.ice?.subroutines ?? []).some((sub: any) => !sub.broken);
              }),
            }),
          ]);
        }),
      }]);
    }),
  }],
};

// Clairvoyant Monitor
export const clairvoyantMonitor: CardDef = {
  title: 'Clairvoyant Monitor',
  subroutines: [
    doPsi({
      label: 'Place 1 advancement counter and end the run',
      async: true,
      prompt: 'Choose an installed card to place 1 advancement counter on',
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `place 1 advancement counter on ${coreToString.cardStr(state, targets[0])} and end the run`;
      }),
      choices: { card: (c: Card) => coreCard.installed(c) },
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreProps.addProp(state, side, eid, targets[0], ':advance-counter', 1, { placed: true })], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, side, eid, card)], []);
      }),
    }),
  ],
};

// Cloud Eater
export const cloudEater: CardDef = {
  title: 'Cloud Eater',
  subroutines: [trashInstalledSub, coreDefHelpers.giveTags(2), coreDefHelpers.doNetDamage(3)],
  events: [{
    event: ':end-of-encounter',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = targets[0];
      return (card as any).rezzed === ':this-turn' && coreCard.sameCard(context?.ice, card);
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      const canPay = corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('net', 3)]);
      const choices = [
        'Corp trashes 1 Runner card',
        !forcedToAvoidTags(state, side) ? 'Take 2 tags' : null,
        canPay ? 'Suffer 3 net damage' : null,
      ].filter(Boolean);
      const promptAbility = {
        prompt: 'Choose one',
        player: ':runner',
        choices,
        'waiting-prompt': true,
        async: true,
        effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> {
          const target = tgts[0];
          let innerAbility: any;
          if (target === 'Corp trashes 1 Runner card') {
            innerAbility = trashInstalledSub;
          } else if (target === 'Take 2 tags') {
            innerAbility = {
              msg: `force the Runner to ${utils.decapitalize(target)}`,
              async: true,
              effect: effect(function*(s2: State, sd2: Side, e2: EID): Generator<any, any, any> {
                yield wait_for(s2, [{ asyncResult: 'result' },
                  coreTags.gainTags(s2, ':runner', e2, 2, { unpreventable: true })], []);
              }),
            };
          } else {
            innerAbility = {
              msg: `force the Runner to ${utils.decapitalize(target)}`,
              async: true,
              effect: req(function*(s2: State, sd2: Side, e2: EID, c2: Card): Generator<any, any, any> {
                yield wait_for(s2, [{ asyncResult: 'result' },
                  corePayment.pay(s2, ':runner', e2, c2, [corePayment.toC('net', 3)])], []);
              }),
            };
          }
          const resolvePlayer = target === 'Corp trashes 1 Runner card' ? ':corp' : ':runner';
          yield wait_for(s, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(s, resolvePlayer as Side, innerAbility, c, null)], []);
        }),
      };
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, promptAbility, card, null)], []);
    }),
  }],
};

// Cobra
export const cobra: CardDef = {
  title: 'Cobra',
  subroutines: [trashProgramSub, coreDefHelpers.doNetDamage(2)],
};

// Colossus
export const colossus: CardDef = (() => {
  const base = wallIce([
    {
      label: 'Give the Runner 1 tag (Give the Runner 2 tags)',
      async: true,
      msg: msg(function(state: State, side: Side, eid: EID, card: Card) {
        return `give the Runner ${wonderSub(card, 3) ? '2 tags' : '1 tag'}`;
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreTags.gainTags(state, ':corp', eid, wonderSub(card, 3) ? 2 : 1)], []);
      }),
    },
    {
      label: 'Trash 1 program (Trash 1 program and 1 resource)',
      async: true,
      msg: msg(function(state: State, side: Side, eid: EID, card: Card) {
        return `trash 1 program${wonderSub(card, 3) ? ' and 1 resource' : ''}`;
      }),
      'change-in-game-state': {
        silent: true,
        req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
          const installed = coreBoard.allInstalled(state, ':runner');
          return installed.some((c: Card) => coreCard.program(c)) ||
            (wonderSub(card, 3) && installed.some((c: Card) => coreCard.resource(c)));
        }),
      },
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, trashProgramSub, card, null)], []);
        if (wonderSub(card, 3)) {
          const trashResourceAbility = {
            prompt: 'Choose a resource to trash',
            msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
              return `trash ${(tgts[0] as any)?.title}`;
            }),
            choices: { card: (c: Card) => coreCard.installed(c) && coreCard.resource(c) },
            async: true,
            effect: effect(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> {
              yield wait_for(s, [{ asyncResult: 'result' },
                coreMoving.trash(s, sd, e, tgts[0], { cause: ':subroutine' })], []);
            }),
          };
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, trashResourceAbility, card, null)], []);
        } else {
          coreEid.effectCompleted(state, side, eid);
        }
      }),
    },
  ]);
  return Object.assign({ title: 'Colossus' }, base);
})();

// Congratulations!
export const congratulations: CardDef = {
  title: 'Congratulations!',
  events: [{
    event: ':pass-ice',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreCard.sameCard(targets[0]?.ice, card);
    }),
    msg: 'gain 1 [Credits]',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, ':corp', eid, 1)], []);
    }),
  }],
  subroutines: [{
    label: 'Gain 2 [Credits]. The Runner gains 1 [Credits]',
    msg: 'gain 2 [Credits]. The Runner gains 1 [Credits]',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, ':corp', coreEid.makeEid(state, eid), 2)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, ':runner', eid, 1)], []);
    }),
  }],
};

// Conundrum
export const conundrum: CardDef = {
  title: 'Conundrum',
  subroutines: [runnerTrashProgramSub, runnerLosesClick, endTheRun],
  'static-abilities': [coreIce.iceStrengthBonus(
    req(function*(state: State): Generator<any, any, any> {
      return coreBoard.allActiveInstalled(state, ':runner').some((c: Card) => coreCard.hasSubtype(c, 'AI')) ? 3 : 0;
    })
  )],
};

// Cortex Lock
export const cortexLock: CardDef = {
  title: 'Cortex Lock',
  subroutines: [{
    label: 'Do 1 net damage for each unused memory unit the Runner has',
    msg: msg(function(state: State) { return `do ${utils.availableMu(state)} net damage`; }),
    'change-in-game-state': { silent: true, req: req(function*(state: State): Generator<any, any, any> { return utils.availableMu(state) > 0; }) },
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':net', utils.availableMu(state), { card })], []);
    }),
  }],
};

// Crick
export const crick: CardDef = {
  title: 'Crick',
  subroutines: [installFromArchivesSub()],
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    return coreServers.protectingArchives(state, card) ? 3 : 0;
  }))],
};

// Curtain Wall
export const curtainWall: CardDef = {
  title: 'Curtain Wall',
  subroutines: [endTheRun, endTheRun, endTheRun],
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    const ices = coreServers.cardToServer(state, card)?.ices ?? [];
    return coreCard.sameCard(card, ices[ices.length - 1]) ? 4 : 0;
  }))],
  events: [
    {
      event: ':trash',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return !coreCard.sameCard(card, targets[0]) &&
          coreServers.cardToServer(state, card) === coreServers.cardToServer(state, targets[0]);
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        coreIce.updateIceStrength(state, side, card);
      }),
    },
    {
      event: ':corp-install',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const context = targets[0];
        return !coreCard.sameCard(card, context?.card) &&
          coreServers.cardToServer(state, card) === coreServers.cardToServer(state, context?.card);
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        coreIce.updateIceStrength(state, side, card);
      }),
    },
  ],
};

// Data Hound
export const dataHound: CardDef = (() => {
  function dhTrash(cards: Card[]): any {
    return {
      prompt: 'Choose a card to trash',
      choices: cards,
      async: true,
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `trash ${(targets[0] as any)?.title}`;
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, side, eid, targets[0], { unpreventable: true, cause: ':subroutine' })], []);
        const remaining = cards.filter((c: Card) => !coreCard.sameCard(c, targets[0]));
        const reorder = coreIce.reorderChoice(':runner', ':runner', remaining, [], remaining.length, remaining);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, reorder, card, null)], []);
      }),
    };
  }
  return {
    title: 'Data Hound',
    subroutines: [
      traceAbility(2, {
        async: true,
        label: 'Look at the top cards of the stack',
        'change-in-game-state': { req: req(function*(state: State): Generator<any, any, any> { return ((state as any).runner?.deck?.length ?? 0) > 0; }), silent: true },
        msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const c = (targets[0] ?? 0) - (targets[1] ?? 0);
          const deckLen = (state as any).runner?.deck?.length ?? 0;
          return `look at ${utils.quantify(Math.min(c, deckLen), 'card')} from the top of the stack`;
        }),
        'waiting-prompt': true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const c = (targets[0] ?? 0) - (targets[1] ?? 0);
          const deck: Card[] = (state as any).runner?.deck ?? [];
          const from = deck.slice(0, c);
          if (c > 1) {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreEngine.resolveAbility(state, side, dhTrash(from), card, null)], []);
          } else {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreMoving.trash(state, side, eid, from[0], { unpreventable: true, cause: ':subroutine' })], []);
            coreSay.systemMsg(state, ':corp', `trashes ${(from[0] as any)?.title}`);
            coreEid.effectCompleted(state, side, eid);
          }
        }),
      }),
    ],
  };
})();

// Data Loop
export const dataLoop: CardDef = {
  title: 'Data Loop',
  'on-encounter': {
    req: req(function*(state: State): Generator<any, any, any> { return ((state as any).runner?.hand?.length ?? 0) > 0; }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      const n = Math.min(2, (state as any).runner?.hand?.length ?? 0);
      const ability = {
        prompt: `Choose ${utils.quantify(n, 'card')} in the grip to add to the top of the stack (second card targeted will be topmost)`,
        choices: { max: n, all: true, card: (c: Card) => coreCard.inHand(c) && coreCard.runner(c) },
        msg: msg(function() { return `add ${utils.quantify(n, 'card')} from the grip to the top of the stack`; }),
        effect: effect(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> {
          for (const t of tgts) coreMoving.move(s, ':runner', t, ':deck', { front: true });
        }),
      };
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, ':runner', ability, card, null)], []);
    }),
  },
  subroutines: [endTheRunIfTagged, endTheRun],
};

// Data Mine
export const dataMine: CardDef = {
  title: 'Data Mine',
  subroutines: [{
    msg: 'do 1 net damage and trash itself',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, ':runner', coreEid.makeEid(state, eid), ':net', 1, { card })], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trash(state, ':corp', coreEid.makeEid(state, eid), card, { cause: ':subroutine' })], []);
      coreRuns.encounterEnds(state, side, eid);
    }),
  }],
};

// Data Raven
export const dataRaven: CardDef = {
  title: 'Data Raven',
  abilities: [powerCounterAbility(coreDefHelpers.giveTags(1))],
  'on-encounter': {
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return targets[0] === 'End the run'
        ? utils.decapitalize(targets[0])
        : `force the runner to ${utils.decapitalize(targets[0])} on encountering it`;
    }),
    player: ':runner',
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: ['Take 1 tag', 'End the run'],
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if (targets[0] === 'Take 1 tag') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreTags.gainTags(state, ':runner', eid, 1)], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, ':runner', eid, card)], []);
      }
    }),
  },
  subroutines: [traceAbility(3, gainPowerCounter)],
};

// Data Ward
export const dataWard: CardDef = {
  title: 'Data Ward',
  'on-encounter': {
    player: ':runner',
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `force the runner to ${utils.decapitalize(targets[0])} on encountering it`;
    }),
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return [
        corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 3)])
          ? 'Pay 3 [Credits]' : null,
        'Take 1 tag',
      ].filter(Boolean);
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if (targets[0] === 'Pay 3 [Credits]') {
        const result: any = yield wait_for(state, [{ asyncResult: 'result' },
          corePayment.pay(state, ':runner', coreEid.makeEid(state, eid), card, [corePayment.toC('credit', 3)])], []);
        if (result?.msg) coreSay.systemMsg(state, ':runner', result.msg);
        coreEid.effectCompleted(state, side, eid);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreTags.gainTags(state, ':runner', eid, 1)], []);
      }
    }),
  },
  subroutines: [endTheRunIfTagged, endTheRunIfTagged, endTheRunIfTagged, endTheRunIfTagged],
};

// Datapike
export const datapike: CardDef = {
  title: 'Datapike',
  subroutines: [
    {
      async: true,
      label: 'Runner must pay 2 [Credits]. If they cannot, end the run',
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        const result: any = yield wait_for(state, [{ asyncResult: 'result' },
          corePayment.pay(state, ':runner', coreEid.makeEid(state, eid), card, [corePayment.toC('credit', 2)])], []);
        if (result?.costPaid) {
          coreSay.systemMsg(state, ':runner', result.msg);
          coreEid.effectCompleted(state, side, eid);
        } else {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreRuns.endRun(state, ':corp', eid, card)], []);
        }
      }),
    },
    endTheRun,
  ],
};

// Diviner
export const diviner: CardDef = {
  title: 'Diviner',
  subroutines: [{
    label: 'Do 1 net damage',
    async: true,
    msg: 'do 1 net damage',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      const result: any[] = yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, ':corp', coreEid.makeEid(state, eid), ':net', 1, { card })], []);
      const trashedCard = result?.[0];
      if (!trashedCard) {
        coreEid.effectCompleted(state, side, eid);
      } else if (((trashedCard as any).cost ?? 0) % 2 !== 0) {
        coreSay.systemMsg(state, ':corp', `uses ${(card as any).title} to end the run`);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, ':corp', eid, card)], []);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  }],
};

// DNA Tracker
export const dnaTracker: CardDef = (() => {
  const sub: any = {
    msg: 'do 1 net damage and make the Runner lose 2 [Credits]',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, coreEid.makeEid(state, eid), ':net', 1, { card })], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.loseCredits(state, ':runner', eid, 2)], []);
    }),
  };
  return { title: 'DNA Tracker', subroutines: [sub, sub, sub] };
})();

// Doomscroll
export const doomscroll: CardDef = {
  title: 'Doomscroll',
  subroutines: [
    coreDefHelpers.giveTags(1),
    coreDefHelpers.doNetDamage(1),
    Object.assign({}, coreDefHelpers.doNetDamage(2), {
      label: 'Do 2 net damage if the runner has 2 tags',
      'change-in-game-state': { silent: true, req: req(function*(state: State): Generator<any, any, any> { return utils.countTags(state) >= 2; }) },
    }),
  ],
};

// Dracō
export const draco: CardDef = {
  title: 'Dracō',
  'on-rez': {
    prompt: 'How many power counters do you want to place?',
    choices: ':credit',
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `place ${utils.quantify(targets[0], 'power counter')}`;
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':power', targets[0], null)], []);
      coreIce.updateIceStrength(state, side, card);
      coreEid.effectCompleted(state, side, eid);
    }),
  },
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    return coreCard.getCounters(card, ':power');
  }))],
  subroutines: [
    traceAbility(2, {
      label: 'Give the Runner 1 tag and end the run',
      msg: 'give the Runner 1 tag and end the run',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreTags.gainTags(state, ':corp', coreEid.makeEid(state, eid), 1)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, ':corp', eid, card)], []);
      }),
    }),
  ],
};

// Drafter
export const drafter: CardDef = {
  title: 'Drafter',
  subroutines: [installFromArchivesSub(), installFromHqOrArchivesSub({ ignoreAllCost: true })],
};

// Echo
export const echo: CardDef = {
  title: 'Echo',
  'rez-sound': 'echo',
  events: [{
    event: ':rez',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = targets[0];
      return coreCard.hasSubtype(context?.card, 'Harmonic') && coreCard.ice(context?.card);
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':power', 1, null)], []);
    }),
  }],
  'static-abilities': [{
    type: ':additional-subroutines',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreCard.sameCard(card, targets[0]);
    }),
    value: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return { subroutines: Array(coreCard.getCounters(card, ':power')).fill(endTheRun) };
    }),
  }],
};

// Eli 1.0
export const eli10: CardDef = {
  title: 'Eli 1.0',
  subroutines: [endTheRun, endTheRun],
  'runner-abilities': [bioraidBreak(1, 1)],
};

// Eli 2.0
export const eli20: CardDef = {
  title: 'Eli 2.0',
  subroutines: [maybeDrawSub(1), endTheRun, endTheRun],
  'runner-abilities': [bioraidBreak(2, 2)],
};

// Empiricist
export const empiricist: CardDef = {
  title: 'Empiricist',
  subroutines: [
    {
      label: 'Draw 1 card. You may add 1 card from HQ to the top of R&D.',
      msg: 'draw 1 card',
      async: true,
      'waiting-prompt': true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDrawing.draw(state, side, coreEid.makeEid(state, eid), 1)], []);
        const hand: Card[] = (state as any).corp?.hand ?? [];
        if (hand.length > 0) {
          const returnAbility = {
            req: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return (state as any).corp?.hand?.length > 0; }),
            prompt: 'Place a card in HQ on the top of R&D?',
            msg: {
              public: 'add 1 card in HQ to the top of R&D',
              corp: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
                return `add facedown ${(tgts[0] as any)?.title} in HQ to the top of R&D`;
              }),
            },
            choices: { card: (c: Card) => coreCard.inHand(c) && coreCard.corp(c) },
            async: true,
            effect: effect(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> {
              coreMoving.move(s, sd, tgts[0], ':deck', { front: true });
              coreEid.effectCompleted(s, sd, e);
            }),
          };
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, returnAbility, card, null)], []);
        } else {
          coreEid.effectCompleted(state, side, eid);
        }
      }),
    },
    {
      label: 'Do 1 net damage and give the Runner 1 tag',
      msg: 'do 1 net damage and give the Runner 1 tag',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDamage.damage(state, side, coreEid.makeEid(state, eid), ':net', 1, { card, suppressCheckpoint: true })], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreTags.gainTags(state, ':corp', eid, 1)], []);
      }),
    },
    coreDefHelpers.doNetDamage(2),
  ],
};

// Endless EULA
export const endlessEula: CardDef = (() => {
  const sub = endTheRunUnlessRunnerPays(corePayment.toC('credit', 1));
  function breakFn(unbrokenSubs: any[], total: number): any {
    return {
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        if (unbrokenSubs.length > 0) {
          const result: any = yield wait_for(state, [{ asyncResult: 'result' },
            corePayment.pay(state, ':runner',
              coreEid.makeEid(state, Object.assign({}, eid, { sourceType: ':subroutine' })),
              card, [corePayment.toC('credit', 1)])], []);
          coreSay.systemMsg(state, ':runner', result?.msg ?? '');
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, breakFn(unbrokenSubs.slice(1), total + 1), card, null)], []);
        } else {
          if (total > 0) {
            coreSay.systemMsg(state, side,
              `resolves ${utils.quantify(total, 'unbroken subroutine')} on Endless EULA ("[subroutine] ${sub.label}")`);
          }
          coreEid.effectCompleted(state, side, eid);
        }
      }),
    };
  }
  return {
    title: 'Endless EULA',
    subroutines: [sub, sub, sub, sub, sub, sub],
    'runner-abilities': [{
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        const unbroken = ((card as any).subroutines ?? []).filter((s: any) => !s.broken && s.resolve !== false);
        return unbroken.length <= corePayment.totalAvailableCredits(state, ':runner', eid, card);
      }),
      async: true,
      label: 'Pay for all unbroken subs',
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        const unbroken = ((card as any).subroutines ?? []).filter((s: any) => !s.broken && s.resolve !== false);
        const newEid = Object.assign({}, eid, { sourceType: ':subroutine' });
        const resolved = unbroken.reduce((c: Card, s: any) => coreIce.resolveSubroutine(c, s), card);
        coreCard.updateCard(state, side, resolved);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, breakFn(unbroken, 0), card, null)], []);
      }),
    }],
  };
})();

// Enforcer 1.0
export const enforcer10: CardDef = {
  title: 'Enforcer 1.0',
  'additional-cost': [corePayment.toC('forfeit', 1)],
  subroutines: [
    trashProgramSub,
    coreDefHelpers.doBrainDamage(1),
    {
      label: 'Trash a console',
      prompt: 'Choose a console to trash',
      'change-in-game-state': {
        silent: true,
        req: req(function*(state: State): Generator<any, any, any> {
          return coreBoard.allInstalled(state, ':runner').some((c: Card) => coreCard.hasSubtype(c, 'Console'));
        }),
      },
      choices: { card: (c: Card) => coreCard.hasSubtype(c, 'Console') && coreCard.installed(c) },
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `trash ${(targets[0] as any)?.title}`;
      }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
      }),
    },
    {
      msg: 'trash all virtual resources',
      'change-in-game-state': {
        silent: true,
        req: req(function*(state: State): Generator<any, any, any> {
          return coreBoard.allInstalled(state, ':runner').some(
            (c: Card) => coreCard.hasSubtype(c, 'Virtual') && coreCard.resource(c));
        }),
      },
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        const cards = coreBoard.allActiveInstalled(state, ':runner').filter(
          (c: Card) => coreCard.hasSubtype(c, 'Virtual'));
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trashCards(state, side, eid, cards, { cause: ':subroutine' })], []);
      }),
    },
  ],
  'runner-abilities': [bioraidBreak(1, 1)],
};

// Engram Flush
export const engramFlush: CardDef = (() => {
  const sub: any = {
    async: true,
    label: 'Reveal the grip',
    'change-in-game-state': { silent: true, req: req(function*(state: State): Generator<any, any, any> { return ((state as any).runner?.hand?.length ?? 0) > 0; }) },
    msg: msg(function(state: State) {
      return `reveal ${utils.enumerateCards((state as any).runner?.hand ?? [], { sorted: true })} from the grip`;
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRevealing.reveal(state, side, eid, (state as any).runner?.hand ?? [])], []);
    }),
  };
  return {
    title: 'Engram Flush',
    'on-encounter': {
      prompt: 'Choose a card type',
      choices: ['Event', 'Hardware', 'Program', 'Resource'],
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `name ${targets[0]}`;
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const cardtype = targets[0];
        coreEvents.registerEvents(state, side, card, [{
          event: ':corp-reveal',
          duration: ':end-of-encounter',
          req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> {
            const context = tgts[0];
            const revealedCards: Card[] = context?.cards ?? [];
            const hand: Card[] = (s as any).runner?.hand ?? [];
            return revealedCards.every((rc: Card) => coreCard.inHand(rc)) &&
              revealedCards.length === hand.length &&
              revealedCards.some((rc: Card) => coreCard.isType(rc, cardtype));
          }),
          async: true,
          effect: req(function*(s: State, sd: Side, e: EID, c: Card): Generator<any, any, any> {
            const trashAbility = coreRevealing.withRevealedHand(':runner', { skipReveal: true }, {
              prompt: 'Choose revealed card to trash',
              choices: { card: (rc: Card) => coreCard.runner(rc) && coreCard.inHand(rc) && coreCard.isType(rc, cardtype) },
              msg: msg(function(s2: State, sd2: Side, e2: EID, c2: Card, tgts2: any[]) {
                return `trash ${(tgts2[0] as any)?.title} from the Grip`;
              }),
              async: true,
              effect: req(function*(s2: State, sd2: Side, e2: EID, c2: Card, tgts2: any[]): Generator<any, any, any> {
                yield wait_for(s2, [{ asyncResult: 'result' },
                  coreMoving.trash(s2, sd2, e2, tgts2[0], { cause: ':subroutine' })], []);
              }),
            });
            yield wait_for(s, [{ asyncResult: 'result' },
              coreEngine.resolveAbility(s, sd, trashAbility, c, null)], []);
          }),
        }]);
      }),
    },
    subroutines: [sub, sub],
  };
})();

// Enigma
export const enigma: CardDef = {
  title: 'Enigma',
  subroutines: [runnerLosesClick, endTheRun],
};

// Envelopment
export const envelopment: CardDef = {
  title: 'Envelopment',
  'on-rez': {
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':power', 4, null)], []);
    }),
  },
  events: [{
    event: ':corp-turn-begins',
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return coreCard.getCounters(card, ':power') > 0;
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':power', -1, null)], []);
    }),
  }],
  subroutines: [{
    label: 'Trash this ice',
    async: true,
    msg: msg(function(state: State, side: Side, eid: EID, card: Card) { return `trash ${(card as any).title}`; }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trash(state, side, eid, card, { cause: ':subroutine' })], []);
    }),
  }],
  'static-abilities': [{
    type: ':additional-subroutines',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreCard.sameCard(card, targets[0]);
    }),
    value: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return { position: ':front', subroutines: Array(coreCard.getCounters(card, ':power')).fill(endTheRun) };
    }),
  }],
};

// Envelope
export const envelope: CardDef = {
  title: 'Envelope',
  subroutines: [coreDefHelpers.doNetDamage(1), endTheRun],
};

// Errand Boy
export const errandBoy: CardDef = (() => {
  const sub: any = {
    async: true,
    label: 'Draw a card or gain 1 [Credits]',
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: ['Gain 1 [Credits]', 'Draw 1 card'],
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return utils.decapitalize(targets[0]);
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if (targets[0] === 'Gain 1 [Credits]') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, ':corp', eid, 1)], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDrawing.draw(state, ':corp', eid, 1)], []);
      }
    }),
  };
  return { title: 'Errand Boy', subroutines: [sub, sub, sub] };
})();

// Event Horizon
export const eventHorizon: CardDef = {
  title: 'Event Horizon',
  subroutines: [
    coreChooseOne.chooseOneHelper({ label: 'Trash 1 program unless runner pays 3 [Credits]', player: ':runner' }, [
      coreChooseOne.costOption([corePayment.toC('credit', 3)], ':runner'),
      {
        option: 'The Corp trashes a Program',
        ability: {
          async: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreEngine.resolveAbility(state, ':corp', trashProgramSub, card, null)], []);
          }),
        },
      },
    ]),
    endTheRunUnlessRunnerPays(corePayment.toC('credit', 3)),
  ],
  abilities: [{
    label: 'End the run',
    msg: 'end the run',
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return !!(state as any).run && forms.thisServer(state, card);
    }),
    cost: [corePayment.toC('trash-can', 1)],
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRuns.endRun(state, side, eid, card)], []);
    }),
  }],
};
