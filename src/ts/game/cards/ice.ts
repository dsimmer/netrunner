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

// ============================================================================
// Helper functions
// ============================================================================

function forcedToAvoidTags(state: State, side: Side): boolean {
  return coreEffects.anyEffects(state, side, ':forced-to-avoid-tag');
}

function currentlyEncounteringCard(card: Card, state: State): boolean {
  return coreCard.sameCard(coreRuns.getCurrentEncounter(state)?.ice, card);
}

function bioraidBreak(cost: number, qty: number, args: any = {}): any {
  return coreIce.breakSub([corePayment.toC('lose-click', cost)], qty, null,
    Object.assign({}, args, {
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return !coreEffects.isDisabledReg(state, card) && currentlyEncounteringCard(card, state);
      }),
    })
  );
}

const endTheRun: any = {
  label: 'End the run',
  msg: 'end the run',
  async: true,
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
    yield wait_for(state, [{ asyncResult: 'result' },
      coreRuns.endRun(state, ':corp', eid, card)], []);
  }),
};

const endTheRunIfTagged: any = {
  label: 'End the run if the Runner is tagged',
  'change-in-game-state': { req: req(function*(state: State) { return utils.isTagged(state); }), silent: true },
  msg: 'end the run',
  async: true,
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
    yield wait_for(state, [{ asyncResult: 'result' },
      coreRuns.endRun(state, ':corp', eid, card)], []);
  }),
};

const preventRunsThisTurn: any = {
  label: 'The Runner cannot make another run this turn',
  msg: 'prevent the Runner from making another run',
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
    coreFlags.registerTurnFlag(state, side, card, ':can-run', null);
  }),
};

function maybeDrawSub(qty: number): any {
  return {
    async: true,
    label: `You may draw ${utils.quantify(qty, 'card')}`,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.maybeDraw(state, side, eid, card, qty)], []);
    }),
  };
}

function drawUpToSub(qty: number, args: any = {}): any {
  return {
    async: true,
    label: `Draw up to ${utils.quantify(qty, 'card')}`,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.drawUpTo(state, side, eid, card, qty, args)], []);
    }),
  };
}

function endTheRunUnlessRunnerPays(cost: any, reason: string = 'subroutine'): any {
  return {
    player: ':runner',
    async: true,
    label: `End the run unless the Runner pays ${corePayment.buildCostLabel([cost])}`,
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return ['End the run',
        corePayment.canPay(state, ':runner', eid, card, null, [cost])
          ? utils.capitalize(corePayment.costToString([cost]))
          : null,
      ].filter(Boolean);
    }),
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const t = targets[0];
      return t === 'End the run'
        ? utils.decapitalize(t)
        : `force the runner to ${utils.decapitalize(t)}`;
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const target = targets[0];
      if (target === 'End the run') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, ':corp', eid, card)], []);
      } else {
        const result: any = yield wait_for(state, [{ asyncResult: 'result' },
          corePayment.pay(state, ':runner', coreEid.makeEid(state, eid), card, [cost])], []);
        if (result?.msg) {
          coreSay.systemMsg(state, ':runner',
            `${result.msg} due to ${(card as any).title} ${reason}`);
        }
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

function endTheRunUnlessCorpPays(cost: any): any {
  return {
    async: true,
    label: `End the run unless the Corp pays ${corePayment.buildCostLabel([cost])}`,
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return ['End the run',
        corePayment.canPay(state, ':corp', eid, card, null, [cost])
          ? utils.capitalize(corePayment.costToString([cost]))
          : null,
      ].filter(Boolean);
    }),
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return utils.decapitalize(targets[0]);
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const target = targets[0];
      if (target === 'End the run') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, ':corp', eid, card)], []);
      } else {
        const result: any = yield wait_for(state, [{ asyncResult: 'result' },
          corePayment.pay(state, ':corp', coreEid.makeEid(state, eid), card, [cost])], []);
        if (result?.msg) coreSay.systemMsg(state, ':corp', result.msg);
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

function endTheRunUnlessRunner(label: string, prompt: string, ability: any): any {
  return {
    player: ':runner',
    async: true,
    label: `End the run unless the Runner ${label}`,
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: ['End the run', utils.capitalize(prompt)],
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'End the run') {
        coreSay.systemMsg(state, ':corp', `uses ${(card as any).title} to end the run`);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, ':corp', eid, card)], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, ability, card, null)], []);
      }
    }),
  };
}

const gainPowerCounter: any = {
  label: 'Place 1 power counter',
  msg: 'place 1 power counter on itself',
  'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card) {
    return coreCard.installed(card);
  })},
  async: true,
  effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
    yield wait_for(state, [{ asyncResult: 'result' },
      coreProps.addCounter(state, side, eid, card, ':power', 1, { placed: true })], []);
  }),
};

function rezAnIce(args: any = {}): any {
  const costBonus = args.costBonus ?? 0;
  const tagStr = `Rez an ice${costBonus === 0 ? '' : costBonus > 0 ? `, paying ${costBonus} more` : `, paying ${-costBonus} less`}`;
  return {
    label: tagStr,
    prompt: tagStr,
    async: true,
    'change-in-game-state': { silent: true, req: req(function*(state: State) {
      return coreBoard.allInstalled(state, ':corp').some((c: Card) => coreCard.ice(c) && !coreCard.rezzed(c));
    })},
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const t = targets[0];
        return coreCard.installed(t) && coreCard.ice(t) && !coreCard.rezzed(t) &&
          coreRezzing.canPayToRez(state, side, eid, t, args);
      }),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRezzing.rez(state, side, eid, targets[0], args)], []);
    }),
  };
}

function traceAbility(base: number, ability: any, unAbility?: any): any {
  if (unAbility) {
    const label = `${ability.label} / ${unAbility.label}`;
    return { label: `Trace ${base} - ${label}`, trace: { base, label, successful: ability, unsuccessful: unAbility } };
  }
  return { label: `Trace ${base} - ${ability.label}`, trace: { base, label: ability.label, successful: ability } };
}

function tagTrace(base: number, n: number = 1): any {
  return traceAbility(base, coreDefHelpers.giveTags(n));
}

function tagOrPayCredits(x: number): any {
  return {
    label: `Give the Runner 1 tag unless they pay ${x} [Credits]`,
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const canPay = corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', x)]);
      let ability: any;
      if (canPay) {
        ability = coreChooseOne.chooseOneHelper({ player: ':runner' }, [
          { option: 'Take 1 tag', ability: coreDefHelpers.giveTags(1) },
          coreChooseOne.costOption([corePayment.toC('credit', x)], ':runner'),
        ]);
      } else {
        ability = {
          msg: 'give the Runner 1 tag',
          async: true,
          effect: req(function*(s: State, sd: Side, e: EID) {
            yield wait_for(s, [{ asyncResult: 'result' }, coreTags.gainTags(s, sd, e, 1)], []);
          }),
        };
      }
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, ability, card, null)], []);
    }),
  };
}

function gainCreditsSub(credits: number): any {
  return {
    label: `Gain ${credits} [Credits]`,
    msg: `gain ${credits} [Credits]`,
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, credits)], []);
    }),
  };
}

function corpsGainsAndRunnerLosesCredits(gain: number, loss: number): any {
  return {
    label: `Gain ${gain} [Credits], Runner loses ${loss} [Credits]`,
    msg: `gain ${gain} [Credits] and force the Runner to lose ${loss} [Credits]`,
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, ':corp', coreEid.makeEid(state, eid), gain)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.loseCredits(state, ':runner', eid, loss)], []);
    }),
  };
}

function powerCounterAbility(ability: any): any {
  return Object.assign({}, ability, { cost: [corePayment.toC('power', 1)] });
}

function doPsi(neqAbility: any, eqAbility?: any): any {
  if (eqAbility) {
    return {
      label: `Psi Game - ${neqAbility['label-neq']} / ${eqAbility['label-eq']}`,
      msg: `start a psi game (${neqAbility['label-neq']} / ${eqAbility['label-eq']})`,
      psi: { 'not-equal': neqAbility, equal: eqAbility },
    };
  }
  return {
    label: `Psi Game - ${neqAbility.label}`,
    msg: `start a psi game (${neqAbility.label})`,
    psi: { 'not-equal': neqAbility },
  };
}

const runnerLosesClick: any = {
  label: 'Force the Runner to lose [Click]',
  'change-in-game-state': { silent: true, req: req(function*(state: State) {
    return ((state as any).runner?.click ?? 0) > 0;
  })},
  msg: 'force the Runner to lose [Click], if able',
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
    coreGaining.loseClicks(state, ':runner', 1);
  }),
};

function runnerLosesCredits(credits: number): any {
  return {
    label: `Make the Runner lose ${credits} [Credits]`,
    msg: `force the Runner to lose ${credits} [Credits]`,
    'change-in-game-state': { silent: true, req: req(function*(state: State) {
      return ((state as any).runner?.credit ?? 0) > 0;
    })},
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.loseCredits(state, ':runner', eid, credits)], []);
    }),
  };
}

const addRunnerCardToGrip: any = {
  label: 'Add an installed Runner card to the grip',
  'change-in-game-state': { silent: true, req: req(function*(state: State) {
    return coreBoard.allInstalled(state, ':runner').length > 0;
  })},
  'waiting-prompt': true,
  prompt: 'Choose a card',
  choices: { card: (c: Card) => coreCard.installed(c) && coreCard.runner(c) },
  msg: 'add 1 installed card to the grip',
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    const target = targets[0];
    coreMoving.move(state, ':runner', target, ':hand', true);
    coreSay.systemMsg(state, side, `adds ${(target as any).title} to the grip`);
  }),
};

const addProgramToTopOfStack: any = {
  prompt: 'Add a program to the top of the stack',
  'waiting-prompt': true,
  choices: { card: (c: Card) => coreCard.installed(c) && coreCard.program(c) },
  'change-in-game-state': { silent: true, req: req(function*(state: State) {
    return coreBoard.allInstalled(state, ':runner').some((c: Card) => coreCard.program(c));
  })},
  label: 'Add installed program to the top of the stack',
  msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return `add ${(targets[0] as any)?.title} to the top of the stack`;
  }),
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    coreMoving.move(state, ':runner', targets[0], ':deck', { front: true });
  }),
};

const trashProgramSub: any = {
  prompt: 'Choose a program to trash',
  label: 'Trash a program',
  msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return `trash ${(targets[0] as any)?.title}`;
  }),
  'waiting-prompt': true,
  'change-in-game-state': { silent: true, req: req(function*(state: State) {
    return coreBoard.allInstalled(state, ':runner').some((c: Card) => coreCard.program(c));
  })},
  choices: { card: (c: Card) => coreCard.installed(c) && coreCard.program(c) },
  async: true,
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    yield wait_for(state, [{ asyncResult: 'result' },
      coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
  }),
};

const runnerTrashProgramSub: any = {
  prompt: 'Choose a program to trash',
  player: ':runner',
  label: 'Force the Runner to trash a program',
  msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return `force the runner to trash ${(targets[0] as any)?.title}`;
  }),
  'display-side': ':corp',
  'waiting-prompt': true,
  'change-in-game-state': { silent: true, req: req(function*(state: State) {
    return coreBoard.allInstalled(state, ':runner').some((c: Card) => coreCard.program(c));
  })},
  choices: { card: (c: Card) => coreCard.installed(c) && coreCard.program(c) },
  async: true,
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    yield wait_for(state, [{ asyncResult: 'result' },
      coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
  }),
};

const trashHardwareSub: any = {
  prompt: 'Choose a piece of hardware to trash',
  label: 'Trash a piece of hardware',
  msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return `trash ${(targets[0] as any)?.title}`;
  }),
  choices: { card: (c: Card) => coreCard.installed(c) && coreCard.hardware(c) },
  'waiting-prompt': true,
  'change-in-game-state': { silent: true, req: req(function*(state: State) {
    return coreBoard.allInstalled(state, ':runner').some((c: Card) => coreCard.hardware(c));
  })},
  async: true,
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    yield wait_for(state, [{ asyncResult: 'result' },
      coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
  }),
};

const trashResourceSub: any = {
  prompt: 'Choose a resource to trash',
  label: 'Trash a resource',
  msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return `trash ${(targets[0] as any)?.title}`;
  }),
  choices: { card: (c: Card) => coreCard.installed(c) && coreCard.resource(c) },
  'waiting-prompt': true,
  'change-in-game-state': { silent: true, req: req(function*(state: State) {
    return coreBoard.allInstalled(state, ':runner').some((c: Card) => coreCard.resource(c));
  })},
  async: true,
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    yield wait_for(state, [{ asyncResult: 'result' },
      coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
  }),
};

const trashInstalledSub: any = {
  async: true,
  prompt: 'Choose an installed card to trash',
  label: 'Trash an installed Runner card',
  msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return `trash ${(targets[0] as any)?.title}`;
  }),
  'waiting-prompt': true,
  'change-in-game-state': { silent: true, req: req(function*(state: State) {
    return coreBoard.allInstalled(state, ':runner').length > 0;
  })},
  choices: { card: (c: Card) => coreCard.installed(c) && coreCard.runner(c) },
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    yield wait_for(state, [{ asyncResult: 'result' },
      coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
  }),
};

const runnerTrashInstalledSub: any = Object.assign({}, trashInstalledSub, {
  player: ':runner',
  label: 'Force the Runner to trash an installed card',
  msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return `force the Runner to trash ${(targets[0] as any)?.title}`;
  }),
});

function installFromHqSub(args: any = {}): any {
  return {
    label: 'Install a card from HQ',
    prompt: 'Choose a card to install from HQ',
    'waiting-prompt': true,
    choices: { card: (c: Card) => coreCard.corpInstallableType(c) && coreCard.inHand(c) },
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreInstalling.corpInstall(state, side, eid, targets[0], null,
          Object.assign({ msgKeys: { installSource: card } }, args))], []);
    }),
  };
}

function installFromArchivesSub(args: any = {}): any {
  return {
    label: 'Install a card from Archives',
    prompt: 'Choose a card to install from Archives',
    'show-discard': true,
    'waiting-prompt': true,
    choices: { card: (c: Card) => coreCard.corpInstallableType(c) && coreCard.inDiscard(c) },
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreInstalling.corpInstall(state, side, eid, targets[0], null,
          Object.assign({ msgKeys: { installSource: card, displayOrigin: true } }, args))], []);
    }),
  };
}

function installFromHqOrArchivesSub(args: any = {}): any {
  return {
    label: 'Install a card from HQ or Archives',
    prompt: 'Choose a card to install from HQ or Archives',
    'show-discard': true,
    'waiting-prompt': true,
    choices: { card: (c: Card) => coreCard.corpInstallableType(c) && (coreCard.inHand(c) || coreCard.inDiscard(c)) },
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreInstalling.corpInstall(state, side, eid, targets[0], null,
          Object.assign({ msgKeys: { installSource: card, displayOrigin: true } }, args))], []);
    }),
  };
}

const cannotStealOrTrashSub: any = {
  label: 'The Runner cannot steal or trash Corp cards for the remainder of this run',
  msg: 'prevent the Runner from stealing or trashing Corp cards for the remainder of the run',
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
    coreFlags.registerRunFlag(state, side, card, ':can-steal',
      (_state: State, _side: Side, _card: Card) => {
        coreToasts.toast(state, ':runner', 'Cannot steal due to subroutine.', 'warning');
        return false;
      });
    coreFlags.registerRunFlag(state, side, card, ':can-trash',
      (_state: State, _side: Side, c: Card) => {
        if (coreCard.corp(c)) {
          coreToasts.toast(state, ':runner', 'Cannot trash due to subroutine.', 'warning');
          return false;
        }
        return true;
      });
  }),
};

function wallIce(subroutines: any[]): any {
  return {
    advanceable: ':always',
    subroutines,
    'static-abilities': [coreIce.iceStrengthBonus(
      req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreCard.getCounters(card, ':advancement');
      })
    )],
  };
}

function spaceIce(...abilities: any[]): any {
  return {
    advanceable: ':always',
    subroutines: abilities,
    'rez-cost-bonus': req(function*(state: State, side: Side, eid: EID, card: Card) {
      return -3 * coreCard.getCounters(card, ':advancement');
    }),
  };
}

function grailInHand(card: Card): boolean {
  return coreCard.corp(card) && coreCard.inHand(card) && coreCard.hasSubtype(card, 'Grail');
}

function addGrailSubs(cards: Card[]): any {
  if (!cards.length) return null;
  const t = cards[0];
  const s: any[] = (coreCardDefs.cardDef(t) as any)?.subroutines || [];
  return {
    prompt: `Add ${(s[0] as any)?.label} subroutine where?`,
    choices: ['Front', 'End'],
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const isFront = targets[0] === 'Front' ? ':front' : null;
      coreEffects.registerLingeringEffect(state, side, card, {
        type: ':additional-subroutines',
        duration: ':end-of-run',
        req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          return coreCard.sameCard(card, tgts[0]);
        }),
        value: { position: isFront, subroutines: [...s] },
      });
      const rest = cards.slice(1);
      if (rest.length) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, addGrailSubs(rest), card, null)], []);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

const revealGrail: any = {
  prompt: 'Reveal up to 2 pieces of Grail ice from HQ (first ice chosen will be first sub)',
  interactive: req(function*() { return true; }),
  choices: { max: 2, card: grailInHand },
  async: true,
  'waiting-prompt': true,
  effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    yield wait_for(state, [{ asyncResult: 'result' },
      coreRevealing.revealLoud(state, side, coreEid.makeEid(state, eid), card, null, targets)], []);
    const next = addGrailSubs(targets);
    if (next) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, next, card, null)], []);
    } else {
      coreEid.effectCompleted(state, side, eid);
    }
  }),
};

function grailIce(ability: any): any {
  return { 'on-encounter': revealGrail, subroutines: [ability] };
}

function trashTypeOrEndTheRun(typeName: string, typeFn: (c: Card) => boolean, sub: any): any {
  return {
    label: `Trash 1 ${typeName} or end the run`,
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const hasType = coreBoard.allActiveInstalled(state, ':runner').some(typeFn);
      return [hasType ? `Trash a ${typeName}` : 'Do nothing', 'End the run'];
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const target = targets[0];
      if (target === 'End the run') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, endTheRun, card, null)], []);
      } else if (target !== 'Do nothing') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, sub, card, null)], []);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

function variableSubsIce(subsCount: (state: State) => number, sub: any): any {
  return {
    'static-abilities': [{
      type: ':additional-subroutines',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.sameCard(card, targets[0]);
      }),
      value: req(function*(state: State) {
        return { subroutines: Array(subsCount(state)).fill(sub) };
      }),
    }],
  };
}

function subtypeIceCount(corp: any, subtype: string): number {
  const servers = corp?.servers || {};
  return Object.values(servers).flatMap((s: any) => s?.ices || [])
    .filter((ice: Card) => coreCard.rezzed(ice) && coreCard.hasSubtype(ice, subtype)).length;
}

function nextIceCount(corp: any): number {
  return subtypeIceCount(corp, 'NEXT');
}

function nextIceVariableSubs(sub: any): any {
  return variableSubsIce((state: State) => nextIceCount((state as any).corp), sub);
}

function harmonicIceCount(corp: any): number {
  return subtypeIceCount(corp, 'Harmonic');
}

function morphIce(base: string, other: string, ability: any): any {
  return {
    advanceable: ':always',
    'static-abilities': [
      {
        type: ':lose-subtype',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return coreCard.sameCard(card, targets[0]) &&
            (coreCard.getCounters(coreCard.getCard(state, card), ':advancement') % 2 !== 0);
        }),
        value: base,
      },
      {
        type: ':gain-subtype',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return coreCard.sameCard(card, targets[0]) &&
            (coreCard.getCounters(coreCard.getCard(state, card), ':advancement') % 2 !== 0);
        }),
        value: other,
      },
    ],
    subroutines: [ability],
  };
}

function constellationIce(ability: any): any {
  const base = traceAbility(2, ability);
  return {
    subroutines: [Object.assign({}, base, {
      trace: Object.assign({}, base.trace, { kicker: ability, 'kicker-min': 5 }),
    })],
  };
}

function zeroToHero(sub: any): any {
  return {
    advanceable: ':while-rezzed',
    'static-abilities': [{
      type: ':additional-subroutines',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.sameCard(card, targets[0]) && coreCard.getCounters(card, ':advancement') > 0;
      }),
      value: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return { position: ':front', subroutines: Array(coreCard.getCounters(card, ':advancement')).fill(sub) };
      }),
    }],
  };
}

function heroToHero(sub: any): any {
  return {
    advanceable: ':always',
    'static-abilities': [{
      type: ':additional-subroutines',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.sameCard(card, targets[0]) && coreCard.getCounters(card, ':advancement') > 0;
      }),
      value: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return { position: ':front', subroutines: Array(coreCard.getCounters(card, ':advancement')).fill(sub) };
      }),
    }],
  };
}

function wonderSub(card: Card, number: number): boolean {
  return number <= coreCard.getCounters(card, ':advancement');
}

function resolveAnotherSubroutine(
  pred: (c: Card) => boolean = () => true,
  label = 'Resolve a subroutine on another ice',
  allowSameCard?: boolean
): any {
  const predFn = (card: Card, target: Card) =>
    coreCard.ice(target) && coreCard.rezzed(target) &&
    ((target as any).subroutines?.length ?? 0) >= 1 &&
    (allowSameCard || !coreCard.sameCard(card, target)) && pred(target);
  return {
    async: true,
    label,
    'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreBoard.allInstalled(state, ':corp').some((t: Card) => predFn(card, t));
    })},
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      const chosenIce: Card = yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          async: true,
          prompt: 'Choose the ice',
          choices: {
            req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
              return predFn(card, tgts[0]);
            }),
            all: true,
          },
          effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            coreEid.completeWithResult(s, sd, e, tgts[0]);
          }),
        }, card, null)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          async: true,
          prompt: 'Choose the subroutine',
          choices: req(function*(s: State) {
            return coreIce.unbrokenSubroutinesChoice(chosenIce);
          }),
          msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            return `resolve the subroutine ("[subroutine] ${tgts[0]}") from ${(chosenIce as any).title}`;
          }),
          effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            const sub = ((chosenIce as any).subroutines || []).find(
              (x: any) => tgts[0] === utils.makeLabel(x['sub-effect'])
            );
            yield wait_for(s, [{ asyncResult: 'result' },
              coreEngine.resolveAbility(s, sd, sub?.['sub-effect'], chosenIce, null)], []);
          }),
        }, card, null)], []);
    }),
  };
}

function implementationNote(note: string, iceDef: any): any {
  return Object.assign({}, iceDef, { implementation: note });
}

const takeBadPub: any = {
  async: true,
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
    coreSay.systemMsg(state, side, `takes 1 bad publicity from ${(card as any).title}`);
    yield wait_for(state, [{ asyncResult: 'result' },
      coreBadPublicity.gainBadPublicity(state, ':corp', eid, 1)], []);
  }),
};

// ============================================================================
// Card definitions
// ============================================================================

// Ablative Barrier
export const ablativeBarrier: CardDef = {
  title: 'Ablative Barrier',
  subroutines: [endTheRun],
  'on-rez': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreThreat.threatLevel(3, state) && !!(state as any).run && forms.thisServer(state, card);
    }),
    prompt: 'Choose a non-agenda card to install from Archives or HQ in another server',
    'waiting-prompt': true,
    'show-discard': true,
    choices: {
      card: (c: Card) => coreCard.corp(c) && coreCard.corpInstallableType(c) &&
        !coreCard.agenda(c) && (coreCard.inHand(c) || coreCard.inDiscard(c)),
    },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const thisServer = coreServers.zoneName((coreCard.getZone(card) as string[])?.[1]);
      const nice = targets[0];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          prompt: 'Choose a server',
          'waiting-prompt': true,
          choices: req(function*(s: State) {
            return coreInstalling.installableServers(s, nice).filter((srv: string) => srv !== thisServer);
          }),
          async: true,
          effect: effect(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            yield wait_for(s, [{ asyncResult: 'result' },
              coreInstalling.corpInstall(s, sd, e, nice, tgts[0],
                { msgKeys: { installSource: card, displayOrigin: true } })], []);
          }),
        }, card, null)], []);
    }),
  },
};

// Anemone
export const anemone: CardDef = {
  title: 'Anemone',
  'on-rez': {
    optional: {
      prompt: 'Trash a card from HQ to do 2 net damage?',
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return ((state as any).corp?.hand?.length ?? 0) > 0 &&
          !!(state as any).run && forms.thisServer(state, card);
      }),
      'waiting-prompt': true,
      'yes-ability': {
        msg: 'do 2 net damage',
        cost: [corePayment.toC('trash-from-hand', 1)],
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDamage.damage(state, side, eid, ':net', 2, { card })], []);
        }),
      },
      'no-ability': {
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          coreSay.systemMsg(state, ':corp', `declines to use ${(card as any).title}`);
        }),
      },
    },
  },
  subroutines: [coreDefHelpers.doNetDamage(1)],
};

// Ansel 1.0
export const ansel10: CardDef = {
  title: 'Ansel 1.0',
  subroutines: [trashInstalledSub, installFromHqOrArchivesSub(), cannotStealOrTrashSub],
  'runner-abilities': [bioraidBreak(1, 1)],
};

// Ansel 2.0
export const ansel20: CardDef = {
  title: 'Ansel 2.0',
  'runner-abilities': [bioraidBreak(2, 2)],
  subroutines: [
    trashInstalledSub,
    {
      label: 'Remove 1 card in the Heap from the game',
      'change-in-game-state': {
        silent: true,
        req: req(function*(state: State) {
          return ((state as any).runner?.discard?.length ?? 0) > 0 &&
            !coreFlags.zoneLocked(state, ':runner', ':discard');
        }),
      },
      prompt: 'Choose a card in the heap to remove from the game',
      'show-opponent-discard': true,
      'waiting-prompt': true,
      choices: { card: (c: Card) => coreCard.runner(c) && coreCard.inDiscard(c) },
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `remove ${(targets[0] as any)?.title} from the game`;
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        coreMoving.move(state, ':runner', targets[0], ':rfg');
      }),
    },
    installFromHqOrArchivesSub(),
    endTheRun,
  ],
};

// Anvil
export const anvil: CardDef = {
  title: 'Anvil',
  'on-encounter': {
    optional: {
      prompt: 'Trash another card?',
      'waiting-prompt': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return corePayment.canPay(state, side,
          Object.assign({}, eid, { source: card, sourceType: ':ability' }),
          card, null, [corePayment.toC('trash-other-installed', 1)]);
      }),
      'yes-ability': {
        prompt: 'Select another installed card to trash',
        cost: [corePayment.toC('trash-other-installed', 1)],
        msg: 'prevent its printed subroutines being broken this encounter',
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          coreEffects.registerLingeringEffect(state, side, card, {
            type: ':cannot-break-subs-on-ice',
            req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
              return coreCard.sameCard(card, (tgts[0] as any)?.ice);
            }),
            value: true,
            duration: ':end-of-encounter',
          });
        }),
      },
    },
  },
  subroutines: [corpsGainsAndRunnerLosesCredits(1, 1), runnerTrashInstalledSub],
};

// Afshar
export const afshar: CardDef = (() => {
  const breakableFn = req(function*(state: State, side: Side, eid: EID, card: Card) {
    if ((card as any).title === 'Afshar' &&
      (coreCard.getZone(card) as string[])?.[1] === ':hq' &&
      !coreEffects.isDisabledReg(state, card)) {
      return ((card as any).subroutines || []).some((s: any) => s.broken && s.printed)
        ? ':unrestricted' : true;
    }
    return ':unrestricted';
  });
  return {
    title: 'Afshar',
    subroutines: [
      Object.assign({}, runnerLosesCredits(2), { breakable: breakableFn }),
      Object.assign({}, endTheRun, { breakable: breakableFn }),
    ],
  };
})();

// Aiki
export const aiki: CardDef = {
  title: 'Aiki',
  subroutines: [
    doPsi({
      label: 'Runner draws 2 cards',
      msg: 'make the Runner draw 2 cards',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDrawing.draw(state, ':runner', eid, 2)], []);
      }),
    }),
    coreDefHelpers.doNetDamage(1),
    coreDefHelpers.doNetDamage(1),
  ],
};

// Aimor
export const aimor: CardDef = {
  title: 'Aimor',
  subroutines: [{
    async: true,
    label: 'Trash the top 3 cards of the stack',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const top3 = ((state as any).runner?.deck || []).slice(0, 3);
      coreSay.systemMsg(state, ':corp',
        `uses ${(card as any).title} to trash ${utils.enumerateCards(top3)} from the top of the stack and trash itself`);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.mill(state, ':corp', coreEid.makeEid(state, eid), ':runner', 3)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trash(state, ':corp', coreEid.makeEid(state, eid), card, { cause: ':subroutine' })], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRuns.encounterEnds(state, side, eid)], []);
    }),
  }],
};

// Akhet
export const akhet: CardDef = (() => {
  const breakableFn = req(function*(state: State, side: Side, eid: EID, card: Card) {
    if (coreCard.getCounters(card, ':advancement') >= 3 &&
      (card as any).title === 'Akhet' && !coreEffects.isDisabledReg(state, card)) {
      return ((card as any).subroutines || []).some((s: any) => s.broken && s.printed)
        ? ':unrestricted' : true;
    }
    return ':unrestricted';
  });
  return {
    title: 'Akhet',
    advanceable: ':always',
    subroutines: [
      {
        label: 'Gain 1 [Credit]. Place 1 advancement counter',
        breakable: breakableFn,
        msg: {
          public: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            return `gain 1 [Credit] and place 1 advancement counter on ${coreToString.cardStr(state, targets[0])}`;
          }),
          corp: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            return `gain 1 [Credit] and place 1 advancement counter on ${coreToString.cardStr(state, targets[0], { maybeVisible: true })}`;
          }),
        },
        prompt: 'Choose an installed card',
        choices: { card: (c: Card) => coreCard.installed(c) },
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreProps.addProp(state, side, coreEid.makeEid(state, eid), targets[0], ':advance-counter', 1, { placed: true })], []);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreGaining.gainCredits(state, side, eid, 1)], []);
        }),
      },
      Object.assign({}, endTheRun, { breakable: breakableFn }),
    ],
    'static-abilities': [coreIce.iceStrengthBonus(
      req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreCard.getCounters(card, ':advancement') >= 3;
      }),
      3
    )],
  };
})();

// Anansi
export const anansi: CardDef = (() => {
  const runnerDraw: any = {
    player: ':runner',
    optional: {
      'waiting-prompt': true,
      prompt: 'Pay 2 [Credits] to draw 1 card?',
      'yes-ability': {
        async: true,
        cost: [corePayment.toC('credit', 2)],
        msg: 'draw 1 card',
        effect: req(function*(state: State, side: Side, eid: EID) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDrawing.draw(state, ':runner', eid, 1)], []);
        }),
      },
      'no-ability': { msg: 'does not draw 1 card' },
    },
  };
  return {
    title: 'Anansi',
    subroutines: [
      {
        msg: 'rearrange the top 5 cards of R&D',
        'change-in-game-state': { silent: true, req: req(function*(state: State) {
          return ((state as any).corp?.deck?.length ?? 0) > 0;
        })},
        async: true,
        'waiting-prompt': true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          const from = ((state as any).corp?.deck || []).slice(0, 5);
          if (from.length > 0) {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreEngine.resolveAbility(state, side,
                coreDefHelpers.reorderChoice(':corp', ':runner', from, [], from.length, from),
                card, null)], []);
          } else {
            coreEid.effectCompleted(state, side, eid);
          }
        }),
      },
      {
        label: 'Draw 1 card, runner draws 1 card',
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDrawing.maybeDraw(state, side, coreEid.makeEid(state, eid), card, 1)], []);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, ':runner', runnerDraw, card, null)], []);
        }),
      },
      coreDefHelpers.doNetDamage(1),
    ],
    events: [Object.assign({}, coreDefHelpers.doNetDamage(3), {
      event: ':end-of-encounter',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = targets[0];
        return coreCard.sameCard(ctx?.ice, card) &&
          ((ctx?.ice as any)?.subroutines || []).some((s: any) => !s.broken);
      }),
    })],
  };
})();

// Archangel
export const archangel: CardDef = {
  title: 'Archangel',
  flags: { 'rd-reveal': req(function*() { return true; }) },
  'on-access': {
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return !coreCard.inDiscard(card);
      }),
      'waiting-prompt': true,
      prompt: msg(function(state: State, side: Side, eid: EID, card: Card) {
        return `Pay 3 [Credits] to force Runner to encounter ${(card as any).title}?`;
      }),
      'yes-ability': {
        cost: [corePayment.toC('credit', 3)],
        async: true,
        msg: 'force the Runner to encounter it',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreRuns.forceIceEncounter(state, side, eid, card)], []);
        }),
      },
      'no-ability': {
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          coreSay.systemMsg(state, ':corp', `declines to use ${(card as any).title}`);
        }),
      },
    },
  },
  subroutines: [traceAbility(6, addRunnerCardToGrip)],
};

// Archer
export const archer: CardDef = {
  title: 'Archer',
  'additional-cost': [corePayment.toC('forfeit', 1)],
  'rez-sound': 'archer',
  subroutines: [gainCreditsSub(2), trashProgramSub, trashProgramSub, endTheRun],
};

// Architect
export const architect: CardDef = {
  title: 'Architect',
  'static-abilities': [{
    type: ':cannot-be-trashed',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(card, targets[0]);
    }),
    value: true,
  }],
  subroutines: [
    {
      async: true,
      'change-in-game-state': { silent: true, req: req(function*(state: State) {
        return ((state as any).corp?.deck?.length ?? 0) > 0;
      })},
      label: 'Look at the top 5 cards of R&D',
      msg: 'look at the top 5 cards of R&D',
      prompt: msg(function(state: State) {
        const top5 = ((state as any).corp?.deck || []).slice(0, 5);
        return `The top cards of R&D are (top->bottom) ${utils.enumerateCards(top5)}`;
      }),
      'waiting-prompt': true,
      choices: ['OK'],
      req: req(function*(state: State) {
        return ((state as any).corp?.deck?.length ?? 0) > 0;
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        const top5 = ((state as any).corp?.deck || []).slice(0, 5);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            prompt: 'Choose a card to install',
            choices: coreRuns.cancellable(top5.filter((c: Card) => coreCard.corpInstallableType(c))),
            async: true,
            'waiting-prompt': true,
            effect: effect(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
              const target = tgts[0];
              const idx = top5.findIndex((x: Card) => coreCard.sameCard(x, target));
              yield wait_for(s, [{ asyncResult: 'result' },
                coreInstalling.corpInstall(s, sd, e, target, null, {
                  ignoreAllCost: true,
                  msgKeys: { installSource: card, originIndex: idx, displayOrigin: true },
                })], []);
            }),
          }, card, null)], []);
      }),
    },
    installFromHqOrArchivesSub(),
  ],
};

// Ashigaru
export const ashigaru: CardDef = {
  title: 'Ashigaru',
  ...variableSubsIce((state: State) => ((state as any).corp?.hand?.length ?? 0), endTheRun),
};

// Assassin
export const assassin: CardDef = {
  title: 'Assassin',
  subroutines: [traceAbility(5, coreDefHelpers.doNetDamage(3)), traceAbility(4, trashProgramSub)],
};

// Asteroid Belt
export const asteroidBelt: CardDef = { title: 'Asteroid Belt', ...spaceIce(endTheRun) };

// Attini
export const attini: CardDef = (() => {
  const sub: any = {
    label: 'Do 1 net damage unless the Runner pays 2 [Credits]',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      if (coreThreat.threatLevel(3, state) && !coreEffects.isDisabledReg(state, card)) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDamage.damage(state, side, eid, ':net', 1, { card })], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            prompt: 'Choose one',
            'waiting-prompt': true,
            player: ':runner',
            async: true,
            choices: req(function*(s: State, sd: Side, e: EID, c: Card) {
              return [
                'Take 1 net damage',
                corePayment.canPay(s, ':runner',
                  Object.assign({}, e, { source: card, sourceType: ':ability' }),
                  card, null, [corePayment.toC('credit', 2)]) ? 'Pay 2 [Credits]' : null,
              ].filter(Boolean);
            }),
            msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
              return tgts[0] === 'Take 1 net damage'
                ? 'do 1 net damage' : `force the runner to ${utils.decapitalize(tgts[0])}`;
            }),
            effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
              if (tgts[0] === 'Take 1 net damage') {
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreDamage.damage(s, ':corp', e, ':net', 1, { card: c })], []);
              } else {
                yield wait_for(s, [{ asyncResult: 'result' },
                  corePayment.pay(s, ':runner', e, card, [corePayment.toC('credit', 2)])], []);
              }
            }),
          }, card, null)], []);
      }
    }),
  };
  return {
    title: 'Attini',
    events: [{
      event: ':pre-resolve-subroutine',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreThreat.threatLevel(3, state) && coreCard.sameCard((targets[0] as any)?.ice, card);
      }),
      silent: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        coreEffects.registerLingeringEffect(state, side, card, {
          type: ':cannot-pay-credit',
          req: req(function*(s: State, sd: Side) { return sd === ':runner'; }),
          value: true,
          duration: ':subroutine-currently-resolving',
        });
      }),
    }],
    subroutines: [sub, sub, sub],
  };
})();

// Authenticator
export const authenticator: CardDef = {
  title: 'Authenticator',
  'on-encounter': {
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return !(state as any).run?.bypass && !forcedToAvoidTags(state, side);
      }),
      player: ':runner',
      prompt: 'Take 1 tag to bypass Authenticator?',
      'yes-ability': {
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          coreSay.systemMsg(state, ':runner', 'takes 1 tag on encountering Authenticator to bypass it');
          coreRuns.bypassIce(state);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreTags.gainTags(state, ':runner', eid, 1, { unpreventable: true })], []);
        }),
      },
    },
  },
  subroutines: [gainCreditsSub(2), endTheRun],
};

// Bailiff
export const bailiff: CardDef = (() => {
  function bailiffGainCredits(state: State, side: Side, eid: EID, n: number): void {
    if (n > 0) {
      const innerEid = coreEid.makeEid(state, eid);
      coreGaining.gainCredits(state, ':corp', innerEid, 1);
      // recursive: will call itself via effect completion in real engine
    } else {
      coreEid.effectCompleted(state, side, eid);
    }
  }
  return {
    title: 'Bailiff',
    'on-break-subs': {
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const n = (targets[0]?.brokenSubs || []).length;
        return `gain ${n} [Credits] from the runner breaking subs`;
      }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const n = (targets[0]?.brokenSubs || []).length;
        bailiffGainCredits(state, side, eid, n);
      }),
    },
    subroutines: [endTheRun],
  };
})();

// Ballista
export const ballista: CardDef = {
  title: 'Ballista',
  subroutines: [trashTypeOrEndTheRun('program', (c: Card) => coreCard.program(c), trashProgramSub)],
};

// Bandwidth
export const bandwidth: CardDef = {
  title: 'Bandwidth',
  subroutines: [{
    msg: 'give the Runner 1 tag',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreTags.gainTags(state, ':corp', coreEid.makeEid(state, eid), 1)], []);
      coreEngine.registerEvents(state, side, card, [{
        event: ':successful-run',
        automatic: ':corp-lose-tag',
        duration: ':end-of-run',
        'unregister-once-resolved': true,
        async: true,
        msg: 'make the Runner lose 1 tag',
        effect: effect(function*(s: State, sd: Side, e: EID) {
          yield wait_for(s, [{ asyncResult: 'result' },
            coreTags.loseTags(s, ':corp', e, 1)], []);
        }),
      }]);
      coreEid.effectCompleted(state, side, eid);
    }),
  }],
};

// Bastion
export const bastion: CardDef = { title: 'Bastion', subroutines: [endTheRun] };

// Bathynomus
export const bathynomus: CardDef = {
  title: 'Bathynomus',
  subroutines: [coreDefHelpers.doNetDamage(3)],
  'static-abilities': [coreIce.iceStrengthBonus(
    req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.protectingArchives(card) ? 3 : 0;
    })
  )],
};

// Battlement
export const battlement: CardDef = { title: 'Battlement', subroutines: [endTheRun, endTheRun] };

// Blockchain
export const blockchain: CardDef = (() => {
  const subCount = (state: State) => Math.floor(
    ((state as any).corp?.discard || []).filter((c: Card) =>
      coreCard.isType(c, 'Operation') && coreCard.hasSubtype(c, 'Transaction') && coreCard.faceup(c)
    ).length / 2
  );
  const sub = corpsGainsAndRunnerLosesCredits(1, 1);
  return {
    title: 'Blockchain',
    'static-abilities': [{
      type: ':additional-subroutines',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.sameCard(card, targets[0]);
      }),
      value: req(function*(state: State) {
        return { position: ':front', subroutines: Array(subCount(state)).fill(sub) };
      }),
    }],
    subroutines: [sub, endTheRun],
  };
})();

// Bloodletter
export const bloodletter: CardDef = {
  title: 'Bloodletter',
  subroutines: [{
    async: true,
    label: 'Runner trashes 1 program or top 2 cards of the stack',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const hasPrograms = coreBoard.allActiveInstalled(state, ':runner').some((c: Card) => coreCard.program(c));
      if (!hasPrograms) {
        coreSay.systemMsg(state, ':runner', 'trashes the top 2 cards of the stack');
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.mill(state, ':runner', eid, ':runner', 2)], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, ':runner', {
            'waiting-prompt': true,
            prompt: 'Choose one',
            async: true,
            choices: req(function*(s: State) {
              return [
                coreBoard.allActiveInstalled(s, ':runner').some((c: Card) => coreCard.program(c))
                  ? 'Trash 1 program' : null,
                ((s as any).runner?.deck?.length ?? 0) >= 1
                  ? 'Trash the top 2 cards of the stack' : null,
              ].filter(Boolean);
            }),
            effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
              if (tgts[0] === 'Trash 1 program') {
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreEngine.resolveAbility(s, ':runner', trashProgramSub, card, null)], []);
              } else {
                coreSay.systemMsg(s, ':runner', 'trashes the top 2 cards of the stack');
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreMoving.mill(s, ':runner', e, ':runner', 2)], []);
              }
            }),
          }, card, null)], []);
      }
    }),
  }],
};

// Bloom
export const bloom: CardDef = {
  title: 'Bloom',
  subroutines: [
    {
      label: 'Install a piece of ice from HQ protecting another server, ignoring all costs',
      'change-in-game-state': { silent: true, req: req(function*(state: State) {
        return ((state as any).corp?.hand?.length ?? 0) > 0;
      })},
      prompt: 'Choose a piece of ice to install from HQ in another server',
      async: true,
      choices: { card: (c: Card) => coreCard.ice(c) && coreCard.inHand(c) },
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const thisServer = coreServers.zoneName((coreCard.getZone(card) as string[])?.[1]);
        const nice = targets[0];
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            prompt: `Choose a location to install ${(nice as any).title}`,
            choices: req(function*(s: State) {
              return coreInstalling.installableServers(s, nice).filter((srv: string) => srv !== thisServer);
            }),
            async: true,
            effect: effect(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
              yield wait_for(s, [{ asyncResult: 'result' },
                coreInstalling.corpInstall(s, sd, e, nice, tgts[0], {
                  ignoreAllCost: true,
                  msgKeys: { installSource: card, displayOrigin: true },
                })], []);
            }),
          }, card, null)], []);
      }),
    },
    {
      label: 'Install a piece of ice from HQ in the next innermost position, protecting this server, ignoring all costs',
      'change-in-game-state': { silent: true, req: req(function*(state: State) {
        return ((state as any).corp?.hand?.length ?? 0) > 0;
      })},
      prompt: 'Choose a piece of ice to install from HQ in this server',
      async: true,
      choices: { card: (c: Card) => coreCard.ice(c) && coreCard.inHand(c) },
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const run = (state as any).run;
        const server = coreServers.zoneName(coreRuns.targetServer(run));
        const pos = Math.max(((state as any).run?.position ?? 1) - 1, 0);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreInstalling.corpInstall(state, side, eid, targets[0], server, {
            ignoreAllCost: true,
            msgKeys: { installSource: card, displayOrigin: true },
            index: pos,
          })], []);
      }),
    },
  ],
};

// Bloop
export const bloop: CardDef = {
  title: 'Bloop',
  'additional-cost': [corePayment.toC('derez-other-harmonic', 1)],
  'rez-sound': 'bloop',
  subroutines: [coreDefHelpers.doBrainDamage(1), trashProgramSub, trashProgramSub],
};

// Border Control
export const borderControl: CardDef = {
  title: 'Border Control',
  abilities: [{
    label: 'End the run',
    msg: 'end the run',
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return forms.thisServer(state, card) && !!(state as any).run;
    }),
    cost: [corePayment.toC('trash-can', 1)],
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRuns.endRun(state, side, eid, card)], []);
    }),
  }],
  subroutines: [
    {
      label: 'Gain 1 [Credits] for each ice protecting this server',
      msg: msg(function(state: State, side: Side, eid: EID, card: Card) {
        return `gain ${(coreBoard.cardToServer(state, card)?.ices || []).length} [Credits]`;
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        const n = (coreBoard.cardToServer(state, card)?.ices || []).length;
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, ':corp', eid, n)], []);
      }),
    },
    endTheRun,
  ],
};

// Boto
export const boto: CardDef = (() => {
  const discardSub: any = {
    label: 'Trash 1 card from HQ to end the run',
    'change-in-game-state': { silent: true, req: req(function*(state: State) {
      return ((state as any).corp?.hand?.length ?? 0) > 0;
    })},
    optional: {
      prompt: 'Trash 1 card from HQ to end the run?',
      'yes-ability': {
        cost: [corePayment.toC('trash-from-hand', 1)],
        msg: 'end the run',
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreRuns.endRun(state, side, eid, card)], []);
        }),
      },
    },
  };
  return {
    title: 'Boto',
    'static-abilities': [coreIce.iceStrengthBonus(
      req(function*(state: State) { return coreThreat.threatLevel(4, state) ? 2 : 0; })
    )],
    subroutines: [coreDefHelpers.doNetDamage(2), discardSub, discardSub],
  };
})();

// Brainstorm
export const brainstorm: CardDef = {
  title: 'Brainstorm',
  'on-encounter': {
    interactive: req(function*() { return true; }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const subCount = ((state as any).runner?.hand?.length ?? 0);
      coreEffects.registerLingeringEffect(state, side, card, {
        type: ':additional-subroutines',
        req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          return coreCard.sameCard(card, tgts[0]);
        }),
        duration: ':end-of-run',
        value: req(function*() {
          return { subroutines: Array(subCount).fill(coreDefHelpers.doBrainDamage(1)) };
        }),
      });
    }),
  },
};

// Builder
export const builder: CardDef = (() => {
  const sub: any = {
    label: 'Place 1 advancement counter on a piece of ice that can be advanced protecting this server',
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `place 1 advancement counter on ${coreToString.cardStr(state, targets[0])}`;
    }),
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const t = targets[0];
        return coreCard.ice(t) && coreCard.canBeAdvanced(state, t);
      }),
    },
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addProp(state, side, eid, targets[0], ':advance-counter', 1, { placed: true })], []);
    }),
  };
  return {
    title: 'Builder',
    abilities: [{
      action: true,
      label: 'Move this ice to the outermost position of any server',
      cost: [corePayment.toC('click', 1)],
      prompt: 'Choose a server',
      choices: req(function*(state: State) { return forms.servers(state); }),
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `move itself to the outermost position of ${targets[0]}`;
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const zone = [...coreServers.serverToZone(state, targets[0]), ':ices'];
        coreMoving.move(state, side, card, zone);
      }),
    }],
    subroutines: [sub, sub],
  };
})();

// Bumi 1.0
export const bumi10: CardDef = {
  title: 'Bumi 1.0',
  subroutines: [trashProgramSub, coreDefHelpers.doBrainDamage(1)],
  'runner-abilities': [bioraidBreak(1, 1)],
  'on-rez': {
    prompt: 'Trash a trojan program',
    choices: {
      card: (c: Card) => coreCard.installed(c) && coreCard.program(c) && coreCard.hasSubtype(c, 'Trojan'),
    },
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !!(state as any).run && forms.thisServer(state, card) &&
        coreBoard.allInstalled(state, ':runner').some((c: Card) => coreCard.hasSubtype(c, 'Trojan'));
    }),
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `trash ${(targets[0] as any)?.title}`;
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trash(state, side, eid, targets[0], { causeCard: card })], []);
    }),
  },
};

// Brân 1.0
export const bran10: CardDef = {
  title: 'Brân 1.0',
  subroutines: [
    {
      async: true,
      label: 'Install an ice from HQ or Archives',
      prompt: 'Choose an ice to install from Archives or HQ',
      'show-discard': true,
      'waiting-prompt': true,
      choices: { card: (c: Card) => coreCard.ice(c) && (coreCard.inHand(c) || coreCard.inDiscard(c)) },
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const serverName = coreServers.zoneName((coreCard.getZone(card) as string[])?.[1]);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreInstalling.corpInstall(state, ':corp', coreEid.makeEid(state, eid), targets[0],
            serverName, {
              ignoreInstallCost: true,
              msgKeys: { installSource: card, displayOrigin: true },
              index: (card as any).index,
            })], []);
        coreEid.effectCompleted(state, side, eid);
      }),
    },
    endTheRun,
    endTheRun,
  ],
  'runner-abilities': [bioraidBreak(1, 1)],
};

// Bullfrog
export const bullfrog: CardDef = {
  title: 'Bullfrog',
  subroutines: [doPsi({
    label: 'Move this ice to another server',
    prompt: 'Choose a server',
    choices: req(function*(state: State) { return forms.servers(state); }),
    'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.installed(card);
    })},
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `move itself to the outermost position of ${targets[0]}`;
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const zone = [...coreServers.serverToZone(state, targets[0]), ':ices'];
      coreMoving.move(state, side, card, zone);
      coreRuns.redirectRun(state, side, targets[0]);
      coreEid.effectCompleted(state, side, eid);
    }),
  })],
};

// Bulwark
export const bulwark: CardDef = (() => {
  const sub: any = {
    msg: 'gain 2 [Credits] and end the run',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, coreEid.makeEid(state, eid), 2)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRuns.endRun(state, side, eid, card)], []);
    }),
  };
  return {
    title: 'Bulwark',
    'on-rez': takeBadPub,
    'on-encounter': {
      req: req(function*(state: State) {
        return coreBoard.allActiveInstalled(state, ':runner').some((c: Card) => coreCard.hasSubtype(c, 'AI'));
      }),
      msg: 'gain 2 [Credits] if there is an installed AI',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, side, eid, 2)], []);
      }),
    },
    subroutines: [runnerTrashProgramSub, sub, sub],
  };
})();

// Burke Bugs
export const burkeBugs: CardDef = {
  title: 'Burke Bugs',
  subroutines: [traceAbility(0, runnerTrashProgramSub)],
};

// Caduceus
export const caduceus: CardDef = {
  title: 'Caduceus',
  subroutines: [
    traceAbility(3, gainCreditsSub(3)),
    traceAbility(2, endTheRun),
  ],
};

// Capacitor
export const capacitor: CardDef = {
  title: 'Capacitor',
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State) {
    return utils.isTagged(state) ? 2 : 0;
  }))],
  subroutines: [
    {
      label: 'Gain 1 [Credits] for each tag the Runner has',
      async: true,
      'change-in-game-state': { silent: true, req: req(function*(state: State) { return utils.isTagged(state); }) },
      msg: msg(function(state: State) { return `gain ${utils.countTags(state)} [Credits]`; }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, ':corp', eid, utils.countTags(state))], []);
      }),
    },
    endTheRun,
  ],
};

// Cell Portal
export const cellPortal: CardDef = {
  title: 'Cell Portal',
  subroutines: [{
    async: true,
    msg: 'make the Runner approach the outermost piece of ice',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const server = coreServers.zoneName(coreRuns.targetServer(state));
      coreRuns.redirectRun(state, side, server, ':approach-ice');
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, ':runner', coreEid.makeEid(state, eid),
          coreRuns.offerJackOut(), card, null)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRezzing.derez(state, side, eid, card)], []);
      coreRuns.encounterEnds(state, side, eid);
    }),
  }],
};

// Changeling
export const changeling: CardDef = {
  title: 'Changeling',
  ...morphIce('Barrier', 'Sentry', endTheRun),
};

// Checkpoint
export const checkpoint: CardDef = {
  title: 'Checkpoint',
  'on-rez': takeBadPub,
  subroutines: [
    traceAbility(5, {
      label: 'Do 3 meat damage when this run is successful',
      msg: 'do 3 meat damage when this run is successful',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        coreEvents.registerEvents(state, side, card, [{
          event: ':successful-run',
          automatic: ':corp-damage',
          duration: ':end-of-run',
          async: true,
          msg: 'do 3 meat damage',
          effect: effect(function*(s: State, sd: Side, e: EID, c: Card) {
            yield wait_for(s, [{ asyncResult: 'result' },
              coreDamage.damage(s, sd, e, ':meat', 3, { card: c })], []);
          }),
        }]);
      }),
    }),
  ],
};

// Chetana
export const chetana: CardDef = {
  title: 'Chetana',
  subroutines: [
    {
      msg: 'make each player gain 2 [Credits]',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, ':runner', coreEid.makeEid(state, eid), 2)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, ':corp', eid, 2)], []);
      }),
    },
    doPsi({
      label: 'Do 1 net damage for each card in the grip',
      async: true,
      msg: msg(function(state: State) {
        return `do ${((state as any).runner?.hand?.length ?? 0)} net damage`;
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        const n = (state as any).runner?.hand?.length ?? 0;
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDamage.damage(state, side, eid, ':net', n, { card })], []);
      }),
    }),
  ],
};

// Chimera
export const chimera: CardDef = {
  title: 'Chimera',
  'on-rez': {
    prompt: 'Choose one subtype',
    choices: ['Barrier', 'Code Gate', 'Sentry'],
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `make itself gain ${targets[0]}`;
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      coreCard.updateCard(state, side, Object.assign({}, card, { subtypeTarget: targets[0] }));
    }),
  },
  'static-abilities': [{
    type: ':gain-subtype',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(card, targets[0]) && !!(card as any).subtypeTarget;
    }),
    value: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return (card as any).subtypeTarget;
    }),
  }],
  events: [
    {
      event: ':runner-turn-ends',
      req: req(function*(state: State, side: Side, eid: EID, card: Card) { return coreCard.rezzed(card); }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRezzing.derez(state, side, eid, card)], []);
      }),
    },
    {
      event: ':corp-turn-ends',
      req: req(function*(state: State, side: Side, eid: EID, card: Card) { return coreCard.rezzed(card); }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRezzing.derez(state, side, eid, card)], []);
      }),
    },
  ],
  subroutines: [endTheRun],
};

// Chiyashi
export const chiyashi: CardDef = (() => {
  function chiyashiAutoTrash(state: State, side: Side, eid: EID, n: number): any {
    if (n > 0) {
      return (async function*() {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.mill(state, ':corp', ':runner', 2)], []);
        coreSay.systemMsg(state, side, 'uses Chiyashi to trash the top 2 cards of the Stack');
        yield wait_for(state, [{ asyncResult: 'result' },
          chiyashiAutoTrash(state, side, eid, n - 1)], []);
      })();
    }
    return coreEid.effectCompleted(state, side, eid);
  }
  return {
    title: 'Chiyashi',
    events: [{
      event: ':subroutines-broken',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const context = targets[0];
        return coreCard.sameCard(card, context?.ice) &&
          coreBoard.allActiveInstalled(state, ':runner').some((c: Card) => coreCard.hasSubtype(c, 'AI'));
      }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const context = targets[0];
        yield wait_for(state, [{ asyncResult: 'result' },
          chiyashiAutoTrash(state, side, eid, (context?.brokenSubs ?? context?.['broken-subs'] ?? []).length)], []);
      }),
    }],
    subroutines: [coreDefHelpers.doNetDamage(2), coreDefHelpers.doNetDamage(2), endTheRun],
  };
})();

// Chrysalis
export const chrysalis: CardDef = {
  title: 'Chrysalis',
  flags: { 'rd-reveal': req(function*() { return true; }) },
  subroutines: [coreDefHelpers.doNetDamage(2)],
  'on-access': {
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !coreCard.inDiscard(card);
    }),
    msg: 'force the Runner to encounter Chrysalis',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return forms.thisServer(state, card);
    }),
    msg: 'give +2 strength to the next piece of ice the Runner encounters',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreEvents.registerEvents(state, side, card, [{
        event: ':encounter-ice',
        duration: ':end-of-run',
        'unregister-once-resolved': true,
        effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          const context = tgts[0];
          const targetIce = context?.ice;
          coreEffects.registerLingeringEffect(s, sd, c, {
            type: ':ice-strength',
            duration: ':end-of-encounter',
            value: 2,
            req: req(function*(s2: State, sd2: Side, e2: EID, c2: Card, tgts2: any[]) {
              return coreCard.sameCard(tgts2[0], targetIce);
            }),
          });
          coreEvents.registerEvents(s, sd, c, [
            Object.assign({}, coreDefHelpers.doNetDamage(3), {
              event: ':end-of-encounter',
              duration: ':end-of-run',
              'unregister-once-resolved': true,
              req: req(function*(s2: State, sd2: Side, e2: EID, c2: Card, tgts2: any[]) {
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
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const context = targets[0];
      return (card as any).rezzed === ':this-turn' && coreCard.sameCard(context?.ice, card);
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
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
        effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          const target = tgts[0];
          let innerAbility: any;
          if (target === 'Corp trashes 1 Runner card') {
            innerAbility = trashInstalledSub;
          } else if (target === 'Take 2 tags') {
            innerAbility = {
              msg: `force the Runner to ${utils.decapitalize(target)}`,
              async: true,
              effect: effect(function*(s2: State, sd2: Side, e2: EID) {
                yield wait_for(s2, [{ asyncResult: 'result' },
                  coreTags.gainTags(s2, ':runner', e2, 2, { unpreventable: true })], []);
              }),
            };
          } else {
            innerAbility = {
              msg: `force the Runner to ${utils.decapitalize(target)}`,
              async: true,
              effect: req(function*(s2: State, sd2: Side, e2: EID, c2: Card) {
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
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
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
        req: req(function*(state: State, side: Side, eid: EID, card: Card) {
          const installed = coreBoard.allInstalled(state, ':runner');
          return installed.some((c: Card) => coreCard.program(c)) ||
            (wonderSub(card, 3) && installed.some((c: Card) => coreCard.resource(c)));
        }),
      },
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
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
            effect: effect(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(targets[0]?.ice, card);
    }),
    msg: 'gain 1 [Credits]',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, ':corp', eid, 1)], []);
    }),
  }],
  subroutines: [{
    label: 'Gain 2 [Credits]. The Runner gains 1 [Credits]',
    msg: 'gain 2 [Credits]. The Runner gains 1 [Credits]',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
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
    req(function*(state: State) {
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
    'change-in-game-state': { silent: true, req: req(function*(state: State) { return utils.availableMu(state) > 0; }) },
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':net', utils.availableMu(state), { card })], []);
    }),
  }],
};

// Crick
export const crick: CardDef = {
  title: 'Crick',
  subroutines: [installFromArchivesSub()],
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card) {
    return coreServers.protectingArchives(state, card) ? 3 : 0;
  }))],
};

// Curtain Wall
export const curtainWall: CardDef = {
  title: 'Curtain Wall',
  subroutines: [endTheRun, endTheRun, endTheRun],
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card) {
    const ices = coreServers.cardToServer(state, card)?.ices ?? [];
    return coreCard.sameCard(card, ices[ices.length - 1]) ? 4 : 0;
  }))],
  events: [
    {
      event: ':trash',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return !coreCard.sameCard(card, targets[0]) &&
          coreServers.cardToServer(state, card) === coreServers.cardToServer(state, targets[0]);
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        coreIce.updateIceStrength(state, side, card);
      }),
    },
    {
      event: ':corp-install',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const context = targets[0];
        return !coreCard.sameCard(card, context?.card) &&
          coreServers.cardToServer(state, card) === coreServers.cardToServer(state, context?.card);
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
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
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
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
        'change-in-game-state': { req: req(function*(state: State) { return ((state as any).runner?.deck?.length ?? 0) > 0; }), silent: true },
        msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const c = (targets[0] ?? 0) - (targets[1] ?? 0);
          const deckLen = (state as any).runner?.deck?.length ?? 0;
          return `look at ${utils.quantify(Math.min(c, deckLen), 'card')} from the top of the stack`;
        }),
        'waiting-prompt': true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
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
    req: req(function*(state: State) { return ((state as any).runner?.hand?.length ?? 0) > 0; }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const n = Math.min(2, (state as any).runner?.hand?.length ?? 0);
      const ability = {
        prompt: `Choose ${utils.quantify(n, 'card')} in the grip to add to the top of the stack (second card targeted will be topmost)`,
        choices: { max: n, all: true, card: (c: Card) => coreCard.inHand(c) && coreCard.runner(c) },
        msg: msg(function() { return `add ${utils.quantify(n, 'card')} from the grip to the top of the stack`; }),
        effect: effect(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
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
    choices: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return [
        corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 3)])
          ? 'Pay 3 [Credits]' : null,
        'Take 1 tag',
      ].filter(Boolean);
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
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
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
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
      'change-in-game-state': { silent: true, req: req(function*(state: State) { return utils.countTags(state) >= 2; }) },
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':power', targets[0], null)], []);
      coreIce.updateIceStrength(state, side, card);
      coreEid.effectCompleted(state, side, eid);
    }),
  },
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card) {
    return coreCard.getCounters(card, ':power');
  }))],
  subroutines: [
    traceAbility(2, {
      label: 'Give the Runner 1 tag and end the run',
      msg: 'give the Runner 1 tag and end the run',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const context = targets[0];
      return coreCard.hasSubtype(context?.card, 'Harmonic') && coreCard.ice(context?.card);
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':power', 1, null)], []);
    }),
  }],
  'static-abilities': [{
    type: ':additional-subroutines',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(card, targets[0]);
    }),
    value: req(function*(state: State, side: Side, eid: EID, card: Card) {
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
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDrawing.draw(state, side, coreEid.makeEid(state, eid), 1)], []);
        const hand: Card[] = (state as any).corp?.hand ?? [];
        if (hand.length > 0) {
          const returnAbility = {
            req: req(function*() { return (state as any).corp?.hand?.length > 0; }),
            prompt: 'Place a card in HQ on the top of R&D?',
            msg: {
              public: 'add 1 card in HQ to the top of R&D',
              corp: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
                return `add facedown ${(tgts[0] as any)?.title} in HQ to the top of R&D`;
              }),
            },
            choices: { card: (c: Card) => coreCard.inHand(c) && coreCard.corp(c) },
            async: true,
            effect: effect(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
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
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
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
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
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
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        const unbroken = ((card as any).subroutines ?? []).filter((s: any) => !s.broken && s.resolve !== false);
        return unbroken.length <= corePayment.totalAvailableCredits(state, ':runner', eid, card);
      }),
      async: true,
      label: 'Pay for all unbroken subs',
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
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
        req: req(function*(state: State) {
          return coreBoard.allInstalled(state, ':runner').some((c: Card) => coreCard.hasSubtype(c, 'Console'));
        }),
      },
      choices: { card: (c: Card) => coreCard.hasSubtype(c, 'Console') && coreCard.installed(c) },
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `trash ${(targets[0] as any)?.title}`;
      }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
      }),
    },
    {
      msg: 'trash all virtual resources',
      'change-in-game-state': {
        silent: true,
        req: req(function*(state: State) {
          return coreBoard.allInstalled(state, ':runner').some(
            (c: Card) => coreCard.hasSubtype(c, 'Virtual') && coreCard.resource(c));
        }),
      },
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
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
    'change-in-game-state': { silent: true, req: req(function*(state: State) { return ((state as any).runner?.hand?.length ?? 0) > 0; }) },
    msg: msg(function(state: State) {
      return `reveal ${utils.enumerateCards((state as any).runner?.hand ?? [], { sorted: true })} from the grip`;
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
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
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const cardtype = targets[0];
        coreEvents.registerEvents(state, side, card, [{
          event: ':corp-reveal',
          duration: ':end-of-encounter',
          req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            const context = tgts[0];
            const revealedCards: Card[] = context?.cards ?? [];
            const hand: Card[] = (s as any).runner?.hand ?? [];
            return revealedCards.every((rc: Card) => coreCard.inHand(rc)) &&
              revealedCards.length === hand.length &&
              revealedCards.some((rc: Card) => coreCard.isType(rc, cardtype));
          }),
          async: true,
          effect: req(function*(s: State, sd: Side, e: EID, c: Card) {
            const trashAbility = coreRevealing.withRevealedHand(':runner', { skipReveal: true }, {
              prompt: 'Choose revealed card to trash',
              choices: { card: (rc: Card) => coreCard.runner(rc) && coreCard.inHand(rc) && coreCard.isType(rc, cardtype) },
              msg: msg(function(s2: State, sd2: Side, e2: EID, c2: Card, tgts2: any[]) {
                return `trash ${(tgts2[0] as any)?.title} from the Grip`;
              }),
              async: true,
              effect: req(function*(s2: State, sd2: Side, e2: EID, c2: Card, tgts2: any[]) {
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
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':power', 4, null)], []);
    }),
  },
  events: [{
    event: ':corp-turn-begins',
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.getCounters(card, ':power') > 0;
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':power', -1, null)], []);
    }),
  }],
  subroutines: [{
    label: 'Trash this ice',
    async: true,
    msg: msg(function(state: State, side: Side, eid: EID, card: Card) { return `trash ${(card as any).title}`; }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trash(state, side, eid, card, { cause: ':subroutine' })], []);
    }),
  }],
  'static-abilities': [{
    type: ':additional-subroutines',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(card, targets[0]);
    }),
    value: req(function*(state: State, side: Side, eid: EID, card: Card) {
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
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
          effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !!(state as any).run && forms.thisServer(state, card);
    }),
    cost: [corePayment.toC('trash-can', 1)],
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRuns.endRun(state, side, eid, card)], []);
    }),
  }],
};

// Excalibur
export const excalibur: CardDef = {
  title: 'Excalibur',
  subroutines: [preventRunsThisTurn],
};

// Executive Functioning
export const executiveFunctioning: CardDef = {
  title: 'Executive Functioning',
  subroutines: [traceAbility(4, coreDefHelpers.doBrainDamage(1))],
};

// ezaM
export const ezaM: CardDef = {
  title: 'ezaM',
  subroutines: [
    {
      label: 'Look at the top card of R&D',
      'change-in-game-state': { silent: true, req: req(function*(state: State) { return ((state as any).corp?.deck?.length ?? 0) > 0; }) },
      'waiting-prompt': true,
      prompt: msg(function(state: State) {
        return `The top card of R&D is ${(state as any).corp?.deck?.[0]?.title}`;
      }),
      choices: req(function*(state: State) {
        return [
          (state as any).corp?.deck?.length !== 1 ? 'Place it on the bottom of R&D' : null,
          'Done',
        ].filter(Boolean);
      }),
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `look at the top card of R&D${targets[0] !== 'Done' ? ' and add it to the bottom of R&D' : ''}`;
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        if (targets[0] !== 'Done') {
          coreMoving.move(state, side, (state as any).corp?.deck?.[0], ':deck');
        }
      }),
    },
    {
      label: 'Each piece of ice gets +1 strength for the remainder of this run.',
      msg: 'give +1 strength to all ice for the remainder of the run',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        coreEffects.registerLingeringEffect(state, side, card, {
          type: ':ice-strength',
          duration: ':end-of-run',
          value: 1,
        });
        coreIce.updateAllIce(state, side);
      }),
    },
  ],
  abilities: [{
    cost: [corePayment.toC('click', 1)],
    action: true,
    label: 'Swap this ice with another installed ice.',
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.ice(targets[0]) && coreCard.installed(targets[0]) && !coreCard.sameCard(card, targets[0]);
      }),
    },
    msg: {
      public: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `swap itself with ${coreToString.cardStr(state, targets[0])}`;
      }),
      corp: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `swap itself with ${coreToString.cardStr(state, targets[0], { maybeVisible: true })}`;
      }),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      coreIce.swapIce(state, side, card, targets[0]);
    }),
  }],
};

// F2P
export const f2p: CardDef = {
  title: 'F2P',
  subroutines: [addRunnerCardToGrip, coreDefHelpers.giveTags(1)],
  'runner-abilities': [coreIce.breakSub([corePayment.toC('credit', 2)], 1, null, {
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !utils.isTagged(state) && currentlyEncounteringCard(card, state);
    }),
  })],
};

// Fairchild
export const fairchild: CardDef = {
  title: 'Fairchild',
  subroutines: [
    endTheRunUnlessRunnerPays(corePayment.toC('credit', 4)),
    endTheRunUnlessRunnerPays(corePayment.toC('credit', 4)),
    endTheRunUnlessRunnerPays(corePayment.toC('trash-installed', 1)),
    endTheRunUnlessRunnerPays(corePayment.toC('brain', 1)),
  ],
};

// Fairchild 1.0
export const fairchild10: CardDef = (() => {
  const sub: any = {
    label: 'Force the Runner to pay 1 [Credits] or trash an installed card',
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `force the Runner to ${utils.decapitalize(targets[0])}`;
    }),
    player: ':runner',
    prompt: 'Choose one',
    'waiting-prompt': true,
    'change-in-game-state': {
      silent: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 1)]) ||
          corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('trash-installed', 1)]);
      }),
    },
    choices: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return [
        corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 1)]) ? 'Pay 1 [Credits]' : null,
        corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('trash-installed', 1)]) ? 'Trash an installed card' : null,
      ].filter(Boolean);
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'Pay 1 [Credits]') {
        const result: any = yield wait_for(state, [{ asyncResult: 'result' },
          corePayment.pay(state, side, coreEid.makeEid(state, eid), card, [corePayment.toC('credit', 1)])], []);
        coreSay.systemMsg(state, side, result?.msg ?? '');
        coreEid.effectCompleted(state, side, eid);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, ':runner', runnerTrashInstalledSub, card, null)], []);
      }
    }),
  };
  return { title: 'Fairchild 1.0', subroutines: [sub, sub], 'runner-abilities': [bioraidBreak(1, 1)] };
})();

// Fairchild 2.0
export const fairchild20: CardDef = (() => {
  const sub: any = {
    label: 'Force the Runner to pay 2 [Credits] or trash an installed card',
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `force the Runner to ${utils.decapitalize(targets[0])}`;
    }),
    player: ':runner',
    prompt: 'Choose one',
    'waiting-prompt': true,
    'change-in-game-state': {
      silent: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 2)]) ||
          corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('trash-installed', 1)]);
      }),
    },
    choices: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return [
        corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 2)]) ? 'Pay 2 [Credits]' : null,
        corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('trash-installed', 1)]) ? 'Trash an installed card' : null,
      ].filter(Boolean);
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'Pay 2 [Credits]') {
        const result: any = yield wait_for(state, [{ asyncResult: 'result' },
          corePayment.pay(state, side, coreEid.makeEid(state, eid), card, [corePayment.toC('credit', 2)])], []);
        coreSay.systemMsg(state, side, result?.msg ?? '');
        coreEid.effectCompleted(state, side, eid);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, ':runner', runnerTrashInstalledSub, card, null)], []);
      }
    }),
  };
  return {
    title: 'Fairchild 2.0',
    subroutines: [sub, sub, coreDefHelpers.doBrainDamage(1)],
    'runner-abilities': [bioraidBreak(2, 2)],
  };
})();

// Fairchild 3.0
export const fairchild30: CardDef = (() => {
  const sub: any = {
    label: 'Force the Runner to pay 3 [Credits] or trash an installed card',
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `force the Runner to ${utils.decapitalize(targets[0])}`;
    }),
    player: ':runner',
    prompt: 'Choose one',
    'waiting-prompt': true,
    'change-in-game-state': {
      silent: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 3)]) ||
          corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('trash-installed', 1)]);
      }),
    },
    choices: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return [
        corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 3)]) ? 'Pay 3 [Credits]' : null,
        corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('trash-installed', 1)]) ? 'Trash an installed card' : null,
      ].filter(Boolean);
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'Pay 3 [Credits]') {
        const result: any = yield wait_for(state, [{ asyncResult: 'result' },
          corePayment.pay(state, side, coreEid.makeEid(state, eid), card, [corePayment.toC('credit', 3)])], []);
        coreSay.systemMsg(state, side, result?.msg ?? '');
        coreEid.effectCompleted(state, side, eid);
      } else if (targets[0] === 'Trash an installed card') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, ':runner', runnerTrashInstalledSub, card, null)], []);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
  return {
    title: 'Fairchild 3.0',
    subroutines: [
      sub, sub,
      {
        label: 'Do 1 core damage or end the run',
        prompt: 'Choose one',
        'waiting-prompt': true,
        choices: ['Do 1 core damage', 'End the run'],
        msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return utils.decapitalize(targets[0]);
        }),
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          if (targets[0] === 'Do 1 core damage') {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreDamage.damage(state, side, eid, ':brain', 1, { card })], []);
          } else {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreRuns.endRun(state, ':corp', eid, card)], []);
          }
        }),
      },
    ],
    'runner-abilities': [bioraidBreak(3, 3)],
  };
})();

// Fenris
export const fenris: CardDef = {
  title: 'Fenris',
  'on-rez': takeBadPub,
  subroutines: [coreDefHelpers.doBrainDamage(1), endTheRun],
};

// Fire Wall
export const fireWall: CardDef = {
  title: 'Fire Wall',
  ...wallIce([endTheRun]),
};

// Flare
export const flare: CardDef = {
  title: 'Flare',
  subroutines: [
    traceAbility(6, {
      label: 'Trash 1 piece of hardware, do 2 meat damage, and end the run',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        const hasHardware = coreBoard.allInstalled(state, ':runner').some((c: Card) => coreCard.hardware(c));
        let innerAbility: any;
        if (hasHardware) {
          innerAbility = {
            prompt: 'Choose a piece of hardware to trash',
            label: 'Trash a piece of hardware',
            choices: { card: (c: Card) => coreCard.hardware(c), all: true },
            msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
              return `trash ${(tgts[0] as any)?.title}, do 2 meat damage, and end the run`;
            }),
            async: true,
            effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
              yield wait_for(s, [{ asyncResult: 'result' },
                coreMoving.trash(s, sd, coreEid.makeEid(s, e), tgts[0], { cause: ':subroutine', suppressCheckpoint: true })], []);
              yield wait_for(s, [{ asyncResult: 'result' },
                coreDamage.damage(s, sd, coreEid.makeEid(s, e), ':meat', 2, { unpreventable: true, suppressCheckpoint: true, card: c })], []);
              yield wait_for(s, [{ asyncResult: 'result' }, coreRuns.endRun(s, sd, e, c)], []);
            }),
          };
        } else {
          innerAbility = {
            async: true,
            msg: 'do 2 meat damage and end the run',
            effect: req(function*(s: State, sd: Side, e: EID, c: Card) {
              yield wait_for(s, [{ asyncResult: 'result' },
                coreDamage.damage(s, sd, coreEid.makeEid(s, e), ':meat', 2, { unpreventable: true, suppressCheckpoint: true, card: c })], []);
              yield wait_for(s, [{ asyncResult: 'result' }, coreRuns.endRun(s, sd, e, c)], []);
            }),
          };
        }
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, innerAbility, card, null)], []);
      }),
    }),
  ],
};

// Flyswatter
export const flyswatter: CardDef = {
  title: 'Flyswatter',
  'suppress-rez-sound': req(function*(state: State, side: Side, eid: EID, card: Card) {
    return !!(state as any).run && forms.thisServer(state, card) && !coreEffects.isDisabledReg(state, card);
  }),
  'on-rez': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !!(state as any).run && forms.thisServer(state, card);
    }),
    msg: 'purge virus counters',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      coreSay.playSfx(state, side, 'virus-purge');
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEffects.purge(state, side, eid)], []);
    }),
  },
  subroutines: [endTheRun],
};

// Flywheel
export const flywheel: CardDef = (() => {
  const sub: any = {
    label: 'Gain 1 [Credit]. You may draw 1 card',
    async: true,
    msg: 'gain 1 [Credit]',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, coreEid.makeEid(state, eid), 1)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.maybeDraw(state, side, eid, card, 1)], []);
    }),
  };
  return { title: 'Flywheel', subroutines: [sub, sub] };
})();

// Formicary
export const formicary: CardDef = {
  title: 'Formicary',
  'derezzed-events': [{
    event: ':approach-server',
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreEngine.getAutoresolve(state, side, card, ':auto-fire')(state, side, eid, card, null) !== 'No';
    }),
    silent: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreEngine.getAutoresolve(state, side, card, ':auto-fire')(state, side, eid, card, null) === 'No';
    }),
    optional: {
      prompt: msg(function(state: State, side: Side, eid: EID, card: Card) {
        return `Rez and move ${coreToString.cardStr(state, card, { visible: true })} to protect the approached server?`;
      }),
      autoresolve: (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreEngine.getAutoresolve(state, side, card, ':auto-fire')(state, side, eid, card, targets),
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreRezzing.canRez(state, side, card) &&
          corePayment.canPay(state, side, eid, card, null, coreRezzing.getRezCost(state, side, card, null));
      }),
      'yes-ability': {
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          const result: any = yield wait_for(state, [{ asyncResult: 'result' },
            coreRezzing.rez(state, side, card)], []);
          if (coreCard.rezzed(result?.card ?? card)) {
            coreSay.systemMsg(state, side,
              'uses Formicary to move itself to the innermost position of the attacked server. The runner is now encountering it');
            const currentCard = coreCard.getCard(state, card);
            coreMoving.move(state, side, currentCard,
              [':servers', coreRuns.targetServer(state), ':ices'], { front: true });
            (state as any).run.position = 1;
            coreRuns.setNextPhase(state, ':encounter-ice');
            coreRuns.setCurrentIce(state);
            coreIce.updateAllIce(state, side);
            coreIce.updateAllIcebreakers(state, side);
          }
          coreEid.effectCompleted(state, side, eid);
        }),
      },
    },
  }],
  subroutines: [endTheRunUnlessRunnerPays(corePayment.toC('net', 2))],
  abilities: [coreEngine.setAutoresolve(':auto-fire', 'Formicary rezzing and moving itself on approach')],
};

// Free Lunch
export const freeLunch: CardDef = {
  title: 'Free Lunch',
  abilities: [powerCounterAbility(runnerLosesCredits(1))],
  subroutines: [gainPowerCounter, gainPowerCounter],
};

// Funhouse
export const funhouse: CardDef = {
  title: 'Funhouse',
  'on-encounter': {
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return targets[0] === 'Take 1 tag'
        ? `force the runner to ${utils.decapitalize(targets[0])} on encountering it`
        : utils.decapitalize(targets[0]);
    }),
    player: ':runner',
    prompt: 'Choose one',
    choices: req(function*(state: State) {
      return [
        !forcedToAvoidTags(state, ':runner' as Side) ? 'Take 1 tag' : null,
        'End the run',
      ].filter(Boolean);
    }),
    'waiting-prompt': true,
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'Take 1 tag') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreTags.gainTags(state, ':runner', eid, 1, { unpreventable: true })], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, ':runner', eid, card)], []);
      }
    }),
  },
  subroutines: [tagOrPayCredits(4)],
};

// Galahad
export const galahad: CardDef = {
  title: 'Galahad',
  ...grailIce(endTheRun),
};

// Gatekeeper
export const gatekeeper: CardDef = (() => {
  const revealAndShuffle: any = {
    prompt: 'Reveal and shuffle up to 3 agendas into R&D',
    'show-discard': true,
    choices: {
      card: (c: Card) => coreCard.corp(c) && (coreCard.inHand(c) || coreCard.inDiscard(c)) && coreCard.agenda(c),
      max: req(function*() { return 3; }),
    },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRevealing.revealLoud(state, side, card, { andThen: ', and shuffle [them] into R&D' }, targets)], []);
      for (const c of targets) coreMoving.move(state, ':corp', c, ':deck');
      coreMoving.shuffle(state, ':corp', ':deck');
      coreEid.effectCompleted(state, ':corp', eid);
    }),
    cancel: coreMoving.shuffleMyDeck,
  };
  const drawRevealShuffle: any = {
    async: true,
    label: 'Draw cards, reveal and shuffle agendas',
    'waiting-prompt': true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.drawUpTo(state, side, eid, card, 3)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, revealAndShuffle, card, null)], []);
    }),
  };
  return {
    title: 'Gatekeeper',
    'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card) {
      return (card as any).rezzed === ':this-turn' ? 6 : 0;
    }))],
    subroutines: [drawRevealShuffle, endTheRun],
  };
})();

// Gemini
export const gemini: CardDef = {
  title: 'Gemini',
  ...constellationIce(coreDefHelpers.doNetDamage(1)),
};

// Gold Farmer
export const goldFarmer: CardDef = (() => {
  function gfLoseCredits(state: State, side: Side, eid: EID, n: number): any {
    if (n > 0) {
      return (async function*() {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.loseCredits(state, ':runner', coreEid.makeEid(state, eid), 1)], []);
        yield wait_for(state, [{ asyncResult: 'result' }, gfLoseCredits(state, side, eid, n - 1)], []);
      })();
    }
    return coreEid.effectCompleted(state, side, eid);
  }
  return {
    title: 'Gold Farmer',
    implementation: 'Auto breaking will break even with too few credits',
    'on-break-subs': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const context = targets[0];
        return (context?.brokenSubs ?? context?.['broken-subs'] ?? []).some((s: any) => s.printed);
      }),
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const context = targets[0];
        const nSubs = (context?.brokenSubs ?? context?.['broken-subs'] ?? []).filter((s: any) => s.printed).length;
        return `force the runner to lose ${nSubs} [Credits] for breaking printed subs`;
      }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const context = targets[0];
        const n = (context?.brokenSubs ?? context?.['broken-subs'] ?? []).filter((s: any) => s.printed).length;
        yield wait_for(state, [{ asyncResult: 'result' }, gfLoseCredits(state, side, eid, n)], []);
      }),
    },
    subroutines: [
      endTheRunUnlessRunnerPays(corePayment.toC('credit', 3)),
      endTheRunUnlessRunnerPays(corePayment.toC('credit', 3)),
    ],
  };
})();

// Grim
export const grim: CardDef = {
  title: 'Grim',
  'on-rez': takeBadPub,
  subroutines: [trashProgramSub],
};

// Grubber
export const grubber: CardDef = {
  title: 'Grubber',
  'on-rez': {
    'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreServers.protectingACentral(state, card);
    }) },
    async: true,
    msg: 'take 1 bad publicity',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreBadPublicity.gainBadPublicity(state, side, eid, 1)], []);
    }),
  },
  subroutines: [
    endTheRunUnlessRunnerPays(corePayment.toC('credit', 3)),
    endTheRunUnlessRunnerPays(corePayment.toC('credit', 3)),
  ],
};

// Guard
export const guard: CardDef = {
  title: 'Guard',
  'static-abilities': [{
    type: ':bypass-ice',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(card, targets[0]);
    }),
    value: false,
  }],
  subroutines: [endTheRun],
};

// Gutenberg
export const gutenberg: CardDef = {
  title: 'Gutenberg',
  subroutines: [tagTrace(7)],
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card) {
    return coreServers.protectingRD(state, card) ? 3 : 0;
  }))],
};

// Gyri Labyrinth
export const gyriLabyrinth: CardDef = {
  title: 'Gyri Labyrinth',
  subroutines: [{
    req: req(function*(state: State) { return !!(state as any).run; }),
    label: "Reduce Runner's hand size by 2",
    msg: "reduce the Runner's maximum hand size by 2 until the start of the next Corp turn",
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreEffects.registerLingeringEffect(state, side, card, {
        type: ':hand-size',
        duration: ':until-corp-turn-begins',
        req: req(function*(s: State, sd: Side) { return sd === ':runner'; }),
        value: -2,
      });
    }),
  }],
};

// Hadrian's Wall
export const hadriansWall: CardDef = {
  title: "Hadrian's Wall",
  ...wallIce([endTheRun, endTheRun]),
};

// Hafrún
export const hafrun: CardDef = (() => {
  function preventSubBreakBy(t: Card): any {
    return {
      type: ':prevent-paid-ability',
      duration: ':end-of-run',
      value: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const [breakCard, breakAbility] = targets;
        return coreCard.sameCard(breakCard, t) &&
          (breakAbility?.break != null || breakAbility?.breaks != null ||
            breakAbility?.heapBreakerBreak != null || breakAbility?.breakCost != null);
      }),
    };
  }
  return {
    title: 'Hafrún',
    subroutines: [endTheRun],
    'on-rez': {
      optional: {
        prompt: 'Trash a card from HQ to prevent subroutines from being broken by a Runner card abilities for the remainder of the run?',
        req: req(function*(state: State, side: Side, eid: EID, card: Card) {
          return !!(state as any).run && forms.thisServer(state, card) &&
            ((state as any).corp?.hand?.length ?? 0) > 0;
        }),
        'waiting-prompt': true,
        'yes-ability': {
          cost: [corePayment.toC('trash-from-hand', 1)],
          async: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
            const innerAbility = {
              'waiting-prompt': true,
              prompt: 'Choose an installed Runner card',
              async: true,
              choices: { card: (c: Card) => coreCard.installed(c) && coreCard.runner(c) },
              msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
                return `trash 1 card from HQ to prevent subroutines from being broken by ${(tgts[0] as any)?.title} abilities for the remainder of the run`;
              }),
              effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
                const t = tgts[0];
                coreEffects.registerLingeringEffect(s, sd, c, {
                  type: ':icon',
                  duration: ':end-of-run',
                  req: req(function*(s2: State, sd2: Side, e2: EID, c2: Card, tgts2: any[]) {
                    return coreCard.sameCard(t, tgts2[0]);
                  }),
                  value: coreEffects.makeIcon('H', c),
                });
                coreEffects.registerLingeringEffect(s, sd, c, preventSubBreakBy(t));
                coreEid.effectCompleted(s, sd, e);
              }),
            };
            yield wait_for(state, [{ asyncResult: 'result' },
              coreEngine.resolveAbility(state, side, innerAbility, card, null)], []);
          }),
        },
        'no-ability': {
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
            coreSay.systemMsg(state, ':corp', `declines to use ${(card as any).title}`);
          }),
        },
      },
    },
  };
})();

// Hákarl 1.0
export const hakarl10: CardDef = {
  title: 'Hákarl 1.0',
  'runner-abilities': [bioraidBreak(1, 1)],
  subroutines: [coreDefHelpers.doBrainDamage(1), endTheRun],
  'on-rez': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !!(state as any).run && forms.thisServer(state, card) &&
        coreBoard.getAllInstalled(state).filter((c: Card) => !coreCard.sameCard(card, c) && coreCard.rezzed(c)).length > 0;
    }),
    prompt: 'Derez another card to prevent the runner from using printed abilities on bioroid ice this turn?',
    choices: {
      'not-self': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.installed(targets[0]) && coreCard.rezzed(targets[0]);
      }),
    },
    'waiting-prompt': true,
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRezzing.derez(state, side, targets[0])], []);
      coreSay.systemMsg(state, side, 'prevents the runner from using printed abilities on bioroid ice for the rest of the turn');
      coreEffects.registerLingeringEffect(state, side, card, {
        type: ':prevent-paid-ability',
        duration: ':end-of-turn',
        req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          return coreCard.ice(tgts[0]) && sd === ':runner' && coreCard.hasSubtype(tgts[0], 'Bioroid');
        }),
        value: true,
      });
      coreEid.effectCompleted(state, side, eid);
    }),
  },
};

// Hagen
export const hagen: CardDef = {
  title: 'Hagen',
  subroutines: [
    {
      label: 'Trash 1 program',
      prompt: 'Choose a program that is not a decoder, fracter or killer',
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `trash ${(targets[0] as any)?.title}`;
      }),
      'change-in-game-state': {
        silent: true,
        req: req(function*(state: State) {
          return coreBoard.allInstalled(state, ':runner').some(
            (c: Card) => coreCard.program(c) && !coreCard.hasAnySubtype(c, ['Decoder', 'Fracter', 'Killer']));
        }),
      },
      choices: {
        card: (c: Card) => coreCard.installed(c) && coreCard.program(c) &&
          !coreCard.hasAnySubtype(c, ['Decoder', 'Fracter', 'Killer']),
      },
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        coreRuns.clearWaitPrompt(state, ':runner');
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
      }),
    },
    endTheRun,
  ],
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State) {
    return -coreBoard.allActiveInstalled(state, ':runner')
      .filter((c: Card) => coreCard.hasSubtype(c, 'Icebreaker')).length;
  }))],
};

// Hailstorm
export const hailstorm: CardDef = {
  title: 'Hailstorm',
  subroutines: [
    {
      label: 'Remove a card in the Heap from the game',
      'change-in-game-state': {
        silent: true,
        req: req(function*(state: State) {
          return !coreFlags.zoneLocked(state, ':runner', ':discard') &&
            ((state as any).runner?.discard?.length ?? 0) > 0;
        }),
      },
      prompt: 'Choose a card in the Heap',
      choices: req(function*(state: State) {
        return coreCard.cancellable((state as any).runner?.discard ?? [], { sorted: true });
      }),
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `remove ${(targets[0] as any)?.title} from the game`;
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        coreMoving.move(state, ':runner', targets[0], ':rfg');
      }),
    },
    endTheRun,
  ],
};

// Hammer
export const hammer: CardDef = (() => {
  const breakableFn = req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    const killerBroken = (card as any).subroutines?.filter(
      (s: any) => s.printed && s.broken && !(s.breakerSubtypes ?? s['breaker-subtypes'] ?? []).includes('Killer')
    ) ?? [];
    return killerBroken.length === 0 || coreCard.hasSubtype(targets[0], 'Killer') ? ':unrestricted' : false;
  });
  return {
    title: 'Hammer',
    'static-abilities': [{
      type: ':cannot-auto-break-subs-on-ice',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const context = targets[0];
        return coreCard.sameCard(card, context?.ice) && !coreCard.hasSubtype(context?.breaker, 'Killer');
      }),
      value: true,
    }],
    subroutines: [
      Object.assign({}, coreDefHelpers.giveTags(1), { breakable: breakableFn }),
      {
        label: 'Choose a resource or piece of hardware to trash',
        msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return `trash ${(targets[0] as any)?.title}`;
        }),
        prompt: 'Trash a resource or piece of hardware',
        'change-in-game-state': {
          silent: true,
          req: req(function*(state: State) {
            return coreBoard.allInstalled(state, ':runner').some(
              (c: Card) => coreCard.hardware(c) || coreCard.resource(c));
          }),
        },
        choices: {
          req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            return coreCard.installed(targets[0]) && (coreCard.hardware(targets[0]) || coreCard.resource(targets[0]));
          }),
        },
        async: true,
        breakable: breakableFn,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
        }),
      },
      {
        label: 'Choose a program to trash that is not a decoder, fracter or killer',
        'change-in-game-state': {
          silent: true,
          req: req(function*(state: State) {
            return coreBoard.allInstalled(state, ':runner').some(
              (c: Card) => coreCard.program(c) && !coreCard.hasAnySubtype(c, ['Decoder', 'Fracter', 'Killer']));
          }),
        },
        prompt: 'Trash a program that is not a decoder, fracter or killer',
        msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return `trash ${(targets[0] as any)?.title}`;
        }),
        breakable: breakableFn,
        choices: {
          card: (c: Card) => coreCard.installed(c) && coreCard.program(c) &&
            !coreCard.hasAnySubtype(c, ['Decoder', 'Fracter', 'Killer']),
        },
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
        }),
      },
    ],
  };
})();

// Descent
export const descent: CardDef = (() => {
  const shuffleAb: any = {
    label: 'Draw 1 card and shuffle up to 2 agendas in HQ and/or Archives into R&D',
    msg: 'draw 1 card',
    async: true,
    cost: [corePayment.toC('credit', 1)],
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      coreSay.playSfx(state, side, 'click-card');
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.draw(state, side, coreEid.makeEid(state, eid), 1)], []);
      const shuffleAbility = {
        prompt: 'Choose up to 2 agendas in HQ and/or Archives',
        choices: {
          max: 2,
          card: (c: Card) => coreCard.agenda(c) && (coreCard.inHand(c) || coreCard.inDiscard(c)),
        },
        async: true,
        'show-discard': true,
        effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          yield wait_for(s, [{ asyncResult: 'result' },
            coreRevealing.revealLoud(s, sd, c, { andThen: 'shuffle [them] into R&D' }, tgts)], []);
          for (const t of tgts) coreMoving.move(s, ':corp', t, ':deck');
          coreMoving.shuffle(s, ':corp', ':deck');
          coreEid.effectCompleted(s, sd, e);
        }),
      };
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, shuffleAbility, card, null)], []);
    }),
  };
  return {
    title: 'Descent',
    events: [{
      event: ':corp-turn-begins',
      skippable: true,
      interactive: req(function*() { return true; }),
      req: req(function*(state: State, side: Side, eid: EID, card: Card) { return coreCard.rezzed(card); }),
      optional: {
        prompt: msg(function(state: State, side: Side, eid: EID, card: Card) {
          return `Add ${coreToString.cardStr(state, card)} to HQ?`;
        }),
        'yes-ability': {
          effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
            coreMoving.move(state, side, card, ':hand');
          }),
          msg: msg(function(state: State, side: Side, eid: EID, card: Card) {
            return `add ${coreToString.cardStr(state, card)} to HQ`;
          }),
        },
      },
    }],
    expend: shuffleAb,
    subroutines: [endTheRun],
  };
})();

// Harvester
export const harvester: CardDef = (() => {
  const sub: any = {
    label: "Runner draws 3 cards and discards down to maximum hand size",
    msg: "make the Runner draw 3 cards and discard down to [runner-pronoun] maximum hand size",
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.draw(state, ':runner', coreEid.makeEid(state, eid), 3)], []);
      const handSize = utils.handSize(state, ':runner');
      const hand: Card[] = (state as any).runner?.hand ?? [];
      const delta = hand.length - handSize;
      if (delta > 0) {
        const discardAbility = {
          prompt: `Choose ${utils.quantify(delta, 'card')} to discard`,
          player: ':runner',
          choices: { max: delta, card: (c: Card) => coreCard.inHand(c) },
          async: true,
          'display-side': ':runner',
          msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            return `discard ${utils.enumerateCards(tgts)}`;
          }),
          effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            const discarded = tgts.map((t: Card) => coreMoving.move(s, sd, t, ':discard'));
            const ev = sd === ':runner' ? ':runner-discard-to-hand-size' : ':corp-discard-to-hand-size';
            coreEvents.queueEvent(s, ev, { cards: discarded });
            yield wait_for(s, [{ asyncResult: 'result' },
              coreCheckpoint.checkpoint(s, null, e, { durations: [ev] })], []);
          }),
        };
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, ':runner', discardAbility, card, null)], []);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
  return { title: 'Harvester', subroutines: [sub, sub] };
})();

// Heimdall 1.0
export const heimdall10: CardDef = {
  title: 'Heimdall 1.0',
  subroutines: [coreDefHelpers.doBrainDamage(1), endTheRun, endTheRun],
  'runner-abilities': [bioraidBreak(1, 1)],
};

// Heimdall 2.0
export const heimdall20: CardDef = {
  title: 'Heimdall 2.0',
  subroutines: [
    coreDefHelpers.doBrainDamage(1),
    {
      msg: 'do 1 core damage and end the run',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDamage.damage(state, side, coreEid.makeEid(state, eid), ':brain', 1, { card })], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, side, eid, card)], []);
      }),
    },
    endTheRun,
  ],
  'runner-abilities': [bioraidBreak(2, 2)],
};

// Herald
export const herald: CardDef = {
  title: 'Herald',
  flags: { 'rd-reveal': req(function*() { return true; }) },
  subroutines: [
    gainCreditsSub(2),
    {
      async: true,
      label: 'Pay up to 2 [Credits] to place up to 2 advancement counters',
      prompt: 'How many advancement counters do you want to place?',
      choices: req(function*(state: State) {
        const credits = (state as any).corp?.credit ?? 0;
        return Array.from({ length: Math.min(2, credits) + 1 }, (_, i) => String(i));
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const c = parseInt(targets[0], 10);
        const newEid = coreEid.makeEid(state, { source: card, sourceType: ':subroutine' });
        if (corePayment.canPay(state, side, Object.assign({}, eid, { source: card, sourceType: ':subroutine' }), card, (card as any).title, [corePayment.toC('credit', c)])) {
          const result: any = yield wait_for(state, [{ asyncResult: 'result' },
            corePayment.pay(state, ':corp', newEid, card, [corePayment.toC('credit', c)])], []);
          coreSay.systemMsg(state, ':corp', result?.msg ?? '');
          const placeAbility = {
            msg: msg(function(s: State, sd: Side, e: EID, ca: Card, tgts2: any[]) {
              return `pay ${c} [Credits] and place ${utils.quantify(c, 'advancement counter')} on ${coreToString.cardStr(s, tgts2[0])}`;
            }),
            choices: {
              req: req(function*(s: State, sd: Side, e: EID, ca: Card, tgts2: any[]) {
                return coreCard.canBeAdvanced(s, tgts2[0]);
              }),
            },
            async: true,
            effect: effect(function*(s: State, sd: Side, e: EID, ca: Card, tgts2: any[]) {
              yield wait_for(s, [{ asyncResult: 'result' },
                coreProps.addProp(s, sd, e, tgts2[0], ':advance-counter', c, { placed: true })], []);
            }),
          };
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, placeAbility, card, null)], []);
        } else {
          coreEid.effectCompleted(state, side, eid);
        }
      }),
    },
  ],
  'on-access': {
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card) { return !coreCard.inDiscard(card); }),
    msg: 'force the Runner to encounter Herald',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRuns.forceIceEncounter(state, side, eid, card)], []);
    }),
  },
};

// Himitsu-Bako
export const himitsuBako: CardDef = {
  title: 'Himitsu-Bako',
  abilities: [{
    msg: 'add itself to HQ',
    cost: [corePayment.toC('credit', 1)],
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreMoving.move(state, side, card, ':hand');
    }),
  }],
  subroutines: [endTheRun],
};

// Hive
export const hive: CardDef = {
  title: 'Hive',
  'static-abilities': [{
    type: ':lose-printed-subroutines',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(card, targets[0]);
    }),
    value: req(function*(state: State) {
      return Math.max(0, (state as any).corp?.agendaPoint ?? 0);
    }),
  }],
  subroutines: [endTheRun, endTheRun, endTheRun, endTheRun, endTheRun],
};

// Holmegaard
export const holmegaard: CardDef = {
  title: 'Holmegaard',
  subroutines: [
    traceAbility(4, {
      label: 'Runner cannot access any cards this run',
      msg: 'stop the Runner from accessing any cards this run',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        coreRuns.preventAccess(state);
      }),
    }),
    {
      label: 'Trash an icebreaker',
      prompt: 'Choose an icebreaker to trash',
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `trash ${(targets[0] as any)?.title}`;
      }),
      'change-in-game-state': {
        silent: true,
        req: req(function*(state: State) {
          return coreBoard.allInstalled(state, ':runner').some((c: Card) => coreCard.hasSubtype(c, 'Icebreaker'));
        }),
      },
      choices: { card: (c: Card) => coreCard.installed(c) && coreCard.hasSubtype(c, 'Icebreaker') },
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        coreRuns.clearWaitPrompt(state, ':runner');
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
      }),
    },
  ],
};

// Hortum
export const hortum: CardDef = (() => {
  function hort(state: State, side: Side, eid: EID, card: Card, n: number): any {
    return {
      prompt: 'Choose a card to add to HQ',
      async: true,
      choices: req(function*(s: State) {
        return coreCard.cancellable((s as any).corp?.deck ?? [], { sorted: true });
      }),
      msg: 'add 1 card to HQ from R&D',
      cancel: coreMoving.shuffleMyDeck,
      effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
        coreMoving.move(s, sd, tgts[0], ':hand');
        if (n < 2) {
          yield wait_for(s, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(s, sd, hort(s, sd, e, c, n + 1), c, null)], []);
        } else {
          coreMoving.shuffle(s, sd, ':deck');
          coreSay.systemMsg(s, sd, 'shuffles R&D');
          coreEid.effectCompleted(s, sd, e);
        }
      }),
    };
  }
  const breakableFn = req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    if (coreCard.getCounters(card, ':advancement') < 3 ||
        !coreCard.hasSubtype(targets[0], 'AI') ||
        (card as any).title !== 'Hortum' ||
        coreEffects.isDisabledReg(state, card)) {
      return ':unrestricted';
    }
    return false;
  });
  return {
    title: 'Hortum',
    advanceable: ':always',
    subroutines: [
      {
        label: 'Gain 1 [Credits] (Gain 4 [Credits])',
        breakable: breakableFn,
        msg: msg(function(state: State, side: Side, eid: EID, card: Card) {
          return `gain ${wonderSub(card, 3) ? '4' : '1'} [Credits]`;
        }),
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreGaining.gainCredits(state, ':corp', eid, wonderSub(card, 3) ? 4 : 1)], []);
        }),
      },
      {
        label: 'End the run (Search R&D for up to 2 cards and add them to HQ, shuffle R&D, end the run)',
        async: true,
        breakable: breakableFn,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          if (wonderSub(card, 3)) {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreEngine.resolveAbility(state, side, hort(state, side, eid, card, 1), card, null)], []);
            coreSay.systemMsg(state, side,
              `uses ${(card as any).title} to add 2 cards to HQ from R&D, shuffle R&D, and end the run`);
            yield wait_for(state, [{ asyncResult: 'result' },
              coreRuns.endRun(state, side, eid, card)], []);
          } else {
            coreSay.systemMsg(state, side, `uses ${(card as any).title} to end the run`);
            yield wait_for(state, [{ asyncResult: 'result' },
              coreRuns.endRun(state, side, eid, card)], []);
          }
        }),
      },
    ],
  };
})();

// Hourglass
export const hourglass: CardDef = {
  title: 'Hourglass',
  subroutines: [runnerLosesClick, runnerLosesClick, runnerLosesClick],
};

// Howler
export const howler: CardDef = {
  title: 'Howler',
  subroutines: [{
    label: 'Install and rez a piece of Bioroid ice from HQ or Archives',
    req: req(function*(state: State) {
      const pool = [...((state as any).corp?.hand ?? []), ...((state as any).corp?.discard ?? [])];
      return pool.some((c: Card) => coreCard.corp(c) && coreCard.hasSubtype(c, 'Bioroid'));
    }),
    async: true,
    prompt: 'Choose a piece of Bioroid ice in HQ or Archives to install',
    'show-discard': true,
    choices: {
      card: (c: Card) => coreCard.corp(c) && (coreCard.inHand(c) || coreCard.inDiscard(c)) && coreCard.hasSubtype(c, 'Bioroid'),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const result: any = yield wait_for(state, [{ asyncResult: 'result' },
        coreInstalling.corpInstall(state, side, eid, targets[0],
          coreServers.zoneName(coreRuns.targetServer(state)),
          {
            ignoreAllCost: true,
            installState: ':rezzed-no-cost',
            msgKeys: { installSource: card, displayOrigin: true },
            index: coreIce.cardIndex(state, card),
          })], []);
      const newIce = result?.card;
      coreEvents.registerEvents(state, side, card, [{
        event: ':run-ends',
        duration: ':end-of-run',
        async: true,
        effect: req(function*(s: State, sd: Side, e: EID, c: Card) {
          yield wait_for(s, [{ asyncResult: 'result' },
            coreRezzing.derez(s, sd, coreEid.makeEid(s, e), newIce, { suppressCheckpoint: true, msgKeys: { andThen: ' and trash itself' } })], []);
          yield wait_for(s, [{ asyncResult: 'result' },
            coreMoving.trash(s, sd, e, c, { cause: ':subroutine' })], []);
        }),
      }]);
      coreEid.effectCompleted(state, side, eid);
    }),
  }],
};

// Hudson 1.0
export const hudson10: CardDef = (() => {
  const sub: any = {
    msg: 'prevent the Runner from accessing more than 1 card during this run',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreRuns.maxAccess(state, 1);
    }),
  };
  return { title: 'Hudson 1.0', subroutines: [sub, sub], 'runner-abilities': [bioraidBreak(1, 1)] };
})();

// Hunter
export const hunter: CardDef = {
  title: 'Hunter',
  subroutines: [tagTrace(3)],
};

// Hydra
export const hydra: CardDef = (() => {
  function otherwiseTag(message: string, abilityEffect: any): any {
    return {
      msg: msg(function(state: State) {
        return utils.isTagged(state) ? message : 'give the Runner 1 tag';
      }),
      label: `${utils.capitalize(message)} if the Runner is tagged; otherwise, give the Runner 1 tag`,
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        if (utils.isTagged(state)) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, ':runner', abilityEffect, card, null)], []);
        } else {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreTags.gainTags(state, ':runner', eid, 1)], []);
        }
      }),
    };
  }
  return {
    title: 'Hydra',
    subroutines: [
      otherwiseTag('do 3 net damage', {
        async: true, effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDamage.damage(state, ':runner', eid, ':net', 3, { card })], []);
        }),
      }),
      otherwiseTag('gain 5 [Credits]', {
        async: true, effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreGaining.gainCredits(state, ':corp', eid, 5)], []);
        }),
      }),
      otherwiseTag('end the run', {
        async: true, effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreRuns.endRun(state, side, eid, card)], []);
        }),
      }),
    ],
  };
})();

// Ice Wall
export const iceWall: CardDef = {
  title: 'Ice Wall',
  ...wallIce([endTheRun]),
};

// Ichi 1.0
export const ichi10: CardDef = {
  title: 'Ichi 1.0',
  subroutines: [
    trashProgramSub,
    trashProgramSub,
    traceAbility(1, {
      label: 'Give the Runner 1 tag and do 1 core damage',
      msg: 'give the Runner 1 tag and do 1 core damage',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDamage.damage(state, ':runner', coreEid.makeEid(state, eid), ':brain', 1, { card, suppressCheckpoint: true })], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreTags.gainTags(state, ':corp', eid, 1)], []);
      }),
    }),
  ],
  'runner-abilities': [bioraidBreak(1, 1)],
};

// Ichi 2.0
export const ichi20: CardDef = {
  title: 'Ichi 2.0',
  subroutines: [
    trashProgramSub,
    trashProgramSub,
    traceAbility(3, {
      label: 'Give the Runner 1 tag and do 1 core damage',
      msg: 'give the Runner 1 tag and do 1 core damage',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDamage.damage(state, ':runner', coreEid.makeEid(state, eid), ':brain', 1, { card })], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreTags.gainTags(state, ':corp', eid, 1)], []);
      }),
    }),
  ],
  'runner-abilities': [bioraidBreak(2, 2)],
};

// Inazuma
export const inazuma: CardDef = {
  title: 'Inazuma',
  subroutines: [
    {
      msg: 'prevent the Runner from breaking subroutines on the next piece of ice they encounter this run',
      'change-in-game-state': { silent: true, req: req(function*(state: State) { return !!(state as any).run; }) },
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        coreEvents.registerEvents(state, side, card, [{
          event: ':encounter-ice',
          duration: ':end-of-run',
          'unregister-once-resolved': true,
          msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            return `prevent the runner from breaking subroutines on ${(tgts[0]?.ice as any)?.title}`;
          }),
          effect: effect(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            const encounteredIce = tgts[0]?.ice;
            coreEffects.registerLingeringEffect(s, sd, c, {
              type: ':cannot-break-subs-on-ice',
              duration: ':end-of-encounter',
              req: req(function*(s2: State, sd2: Side, e2: EID, c2: Card, tgts2: any[]) {
                return coreCard.sameCard(encounteredIce, tgts2[0]?.ice);
              }),
              value: true,
            });
          }),
        }]);
      }),
    },
    {
      msg: 'prevent the Runner from jacking out until after the next piece of ice',
      'change-in-game-state': { silent: true, req: req(function*(state: State) { return !!(state as any).run; }) },
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        const lingering = coreEffects.registerLingeringEffect(state, side, card, {
          type: ':cannot-jack-out',
          value: true,
          duration: ':end-of-run',
        });
        coreEvents.registerEvents(state, side, card, [{
          event: ':encounter-ice',
          duration: ':end-of-run',
          'unregister-once-resolved': true,
          effect: req(function*(s: State, sd: Side) {
            coreEffects.unregisterEffectByUuid(s, sd, lingering);
          }),
        }]);
      }),
    },
  ],
};

// Information Overload
export const informationOverload: CardDef = {
  title: 'Information Overload',
  ...variableSubsIce((state: State) => utils.countTags(state), runnerTrashInstalledSub),
  'on-encounter': tagTrace(1),
};

// Interrupt 0
export const interrupt0: CardDef = (() => {
  const sub: any = {
    label: 'Make the Runner pay 1 [Credits] to use icebreaker',
    msg: 'make the Runner pay 1 [Credits] to use icebreakers to break subroutines during this run',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreEffects.registerLingeringEffect(state, side, card, {
        type: ':break-sub-additional-cost',
        duration: ':end-of-run',
        req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          const context = tgts[0];
          return coreCard.hasSubtype(context?.card, 'Icebreaker') &&
            context?.ability?.break != null && (context?.ability?.break ?? 0) > 0;
        }),
        value: corePayment.toC('credit', 1),
      });
    }),
  };
  return { title: 'Interrupt 0', subroutines: [sub, sub] };
})();

// IP Block
export const ipBlock: CardDef = {
  title: 'IP Block',
  'on-encounter': Object.assign({}, coreDefHelpers.giveTags(1), {
    req: req(function*(state: State) {
      return coreBoard.allActiveInstalled(state, ':runner').some((c: Card) => coreCard.hasSubtype(c, 'AI'));
    }),
    msg: 'give the runner 1 tag because there is an installed AI',
  }),
  subroutines: [tagTrace(3), endTheRunIfTagged],
};

// IQ
export const iq: CardDef = {
  title: 'IQ',
  subroutines: [endTheRun],
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State) {
    return (state as any).corp?.hand?.length ?? 0;
  }))],
  'rez-cost-bonus': req(function*(state: State) {
    return (state as any).corp?.hand?.length ?? 0;
  }),
};

// Ireress
export const ireress: CardDef = {
  title: 'Ireress',
  ...variableSubsIce((state: State) => utils.countBadPub(state), runnerLosesCredits(1)),
};

// It's a Trap!
export const itsATrap: CardDef = {
  title: "It's a Trap!",
  'on-expose': {
    msg: 'do 2 net damage',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':net', 2, { card })], []);
    }),
  },
  subroutines: [
    Object.assign({}, runnerTrashInstalledSub, {
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, side, coreEid.makeEid(state, eid), targets[0], { cause: ':subroutine' })], []);
        coreSay.systemMsg(state, ':corp', `uses ${(card as any).title} to trash itself`);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, ':corp', coreEid.makeEid(state, eid), card, { cause: ':subroutine' })], []);
        coreRuns.encounterEnds(state, side, eid);
      }),
    }),
  ],
};

// Ivik
export const ivik: CardDef = {
  title: 'Ivik',
  subroutines: [coreDefHelpers.doNetDamage(2), endTheRun],
  'rez-cost-bonus': req(function*(state: State) {
    return -subtypeIceCount((state as any).corp, 'Code Gate');
  }),
};

// Jaguarundi
export const jaguarundi: CardDef = {
  title: 'Jaguarundi',
  'on-encounter': {
    req: req(function*(state: State) { return coreThreat.threatLevel(4, state); }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const canSpendClick = corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('click', 1)]);
      const ability = {
        player: ':runner',
        prompt: 'Choose one',
        choices: req(function*() {
          return ['Take 1 tag', canSpendClick ? 'Spend [Click]' : null].filter(Boolean);
        }),
        'waiting-prompt': true,
        async: true,
        msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          return tgts[0] === 'Take 1 tag'
            ? 'give the Runner 1 tag'
            : `force the runner to ${utils.decapitalize(tgts[0])} on encountering it`;
        }),
        effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          if (tgts[0] === 'Take 1 tag') {
            yield wait_for(s, [{ asyncResult: 'result' }, coreTags.gainTags(s, ':runner', e, 1)], []);
          } else {
            const result: any = yield wait_for(s, [{ asyncResult: 'result' },
              corePayment.pay(s, ':runner', coreEid.makeEid(s, e), c, [corePayment.toC('click', 1)])], []);
            coreSay.systemMsg(s, sd, result?.msg ?? '');
            coreEid.effectCompleted(s, ':runner', e);
          }
        }),
      };
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, ability, card, null)], []);
    }),
  },
  subroutines: [
    coreDefHelpers.giveTags(1),
    {
      label: 'Do 1 core damage if the Runner is tagged',
      'change-in-game-state': { silent: true, req: req(function*(state: State) { return utils.isTagged(state); }) },
      msg: 'do 1 core damage',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDamage.damage(state, side, eid, ':brain', 1, { card })], []);
      }),
    },
  ],
};

// Janus 1.0
export const janus10: CardDef = {
  title: 'Janus 1.0',
  subroutines: [
    coreDefHelpers.doBrainDamage(1),
    coreDefHelpers.doBrainDamage(1),
    coreDefHelpers.doBrainDamage(1),
    coreDefHelpers.doBrainDamage(1),
  ],
  'runner-abilities': [bioraidBreak(1, 1)],
};

// Jua
export const jua: CardDef = {
  title: 'Jua',
  'on-encounter': {
    msg: 'prevent the Runner from installing cards for the rest of the turn',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreFlags.registerTurnFlag(state, side, card, ':runner-lock-install', () => true);
    }),
  },
  subroutines: [{
    label: 'Choose 2 installed Runner cards, if able. The Runner must add 1 of those to the top of the Stack',
    'change-in-game-state': { silent: true, req: req(function*(state: State) {
      return coreBoard.allInstalled(state, ':runner').length >= 2;
    }) },
    async: true,
    prompt: 'Choose 2 installed Runner cards',
    choices: {
      card: (c: Card) => coreCard.runner(c) && coreCard.installed(c),
      max: 2,
      all: true,
    },
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `add either ${coreToString.cardStr(state, targets[0])} or ${coreToString.cardStr(state, targets[1])} to the top of the Stack`;
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets.length === 2) {
        const pickAbility = {
          player: ':runner',
          'waiting-prompt': true,
          prompt: 'Choose a card to move to the top of the Stack',
          choices: { card: (c: Card) => targets.some((t: Card) => coreCard.sameCard(t, c)) },
          effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            coreMoving.move(s, ':runner', tgts[0], ':deck', { front: true });
            coreSay.systemMsg(s, ':runner', `selected ${coreToString.cardStr(s, tgts[0])} to move to the top of the Stack`);
          }),
        };
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, pickAbility, card, null)], []);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  }],
};

// Kakugo
export const kakugo: CardDef = {
  title: 'Kakugo',
  events: [{
    event: ':pass-ice',
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(targets[0]?.ice, card);
    }),
    msg: 'do 1 net damage',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':net', 1, { card })], []);
    }),
  }],
  subroutines: [endTheRun],
};

// Kamali 1.0
export const kamali10: CardDef = (() => {
  function brainDamageUnlessRunnerPays(cost: any[], text: string): any {
    return {
      player: ':runner',
      async: true,
      label: `Do 1 core damage unless the Runner trashes 1 installed ${text}`,
      prompt: 'Choose one',
      'waiting-prompt': true,
      choices: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return [
          'Take 1 core damage',
          corePayment.canPay(state, ':runner', eid, card, null, cost)
            ? utils.capitalize(corePayment.costToString(cost)) : null,
        ].filter(Boolean);
      }),
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return targets[0] === 'Take 1 core damage'
          ? 'do 1 core damage'
          : `force the runner to ${utils.decapitalize(targets[0])}`;
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        if (targets[0] === 'Take 1 core damage') {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDamage.damage(state, side, eid, ':brain', 1, { card })], []);
        } else {
          const result: any = yield wait_for(state, [{ asyncResult: 'result' },
            corePayment.pay(state, ':runner', coreEid.makeEid(state, eid), card, cost)], []);
          if (result?.msg) coreSay.systemMsg(state, ':runner', `${result.msg} due to ${(card as any).title}`);
          coreEid.effectCompleted(state, side, eid);
        }
      }),
    };
  }
  return {
    title: 'Kamali 1.0',
    subroutines: [
      brainDamageUnlessRunnerPays([corePayment.toC('resource', 1)], 'resource'),
      brainDamageUnlessRunnerPays([corePayment.toC('hardware', 1)], 'piece of hardware'),
      brainDamageUnlessRunnerPays([corePayment.toC('program', 1)], 'program'),
    ],
    'runner-abilities': [bioraidBreak(1, 1)],
  };
})();

// Karunā
export const karuna: CardDef = {
  title: 'Karunā',
  subroutines: [
    {
      label: 'Do 2 net damage. The Runner may jack out',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, coreDefHelpers.doNetDamage(2), card, null)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, coreRuns.offerJackOut(), card, null)], []);
      }),
    },
    coreDefHelpers.doNetDamage(2),
  ],
};

// Kessleroid
export const kessleroid: CardDef = {
  title: 'Kessleroid',
  'static-abilities': [{
    type: ':cannot-be-trashed',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(card, targets[0]) && side === ':runner';
    }),
    value: true,
  }],
  subroutines: [endTheRun, endTheRun],
};

// Kitsune
export const kitsune: CardDef = {
  title: 'Kitsune',
  subroutines: [{
    label: 'Force the Runner to access a card in HQ',
    optional: {
      req: req(function*(state: State) { return ((state as any).corp?.hand?.length ?? 0) > 0; }),
      prompt: 'Force the Runner to access a card in HQ?',
      'yes-ability': {
        async: true,
        prompt: 'Choose a card in HQ',
        choices: { card: (c: Card) => coreCard.inHand(c) && coreCard.corp(c), all: true },
        label: 'Force the Runner to breach HQ and access a card',
        msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return `force the Runner to breach HQ and access ${(targets[0] as any)?.title}`;
        }),
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreRuns.breachServer(state, ':runner', coreEid.makeEid(state, eid), [':hq'], { noRoot: true, accessFirst: targets[0] })], []);
          coreSay.systemMsg(state, ':corp', `uses ${(card as any).title} to trash itself`);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreMoving.trash(state, ':corp', coreEid.makeEid(state, eid), card, { cause: ':subroutine' })], []);
          coreRuns.encounterEnds(state, side, eid);
        }),
      },
    },
  }],
};

// Klevetnik
export const klevetnik: CardDef = (() => {
  const onRezAbility: any = {
    prompt: 'Choose an installed resource',
    'waiting-prompt': true,
    choices: { card: (c: Card) => coreCard.installed(c) && coreCard.resource(c) },
    async: true,
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `let the Runner gain 2 [Credits] to blank the text box of ${(targets[0] as any)?.title} until the Corp next turn ends`;
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const t = targets[0];
      const activePlayer = (state as any).activePlayer;
      const duration = activePlayer === ':corp' ? ':until-next-corp-turn-ends' : ':until-corp-turn-ends';
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, ':runner', coreEid.makeEid(state, eid), 2)], []);
      coreEffects.registerLingeringEffect(state, side, card, {
        type: ':disable-card',
        req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) { return coreCard.sameCard(t, tgts[0]); }),
        duration,
        value: true,
      });
      coreEid.effectCompleted(state, side, eid);
    }),
  };
  return {
    title: 'Klevetnik',
    subroutines: [endTheRun],
    'on-rez': {
      optional: {
        prompt: 'Let the Runner gain 2 [Credits]?',
        'waiting-prompt': true,
        req: req(function*(state: State, side: Side, eid: EID, card: Card) {
          return !!(state as any).run && forms.thisServer(state, card) &&
            coreBoard.allInstalled(state, ':runner').some((c: Card) => coreCard.resource(c));
        }),
        'yes-ability': {
          async: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreEngine.resolveAbility(state, side, onRezAbility, card, null)], []);
          }),
        },
        'no-ability': {
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
            coreSay.systemMsg(state, ':corp', `declines to use ${(card as any).title}`);
          }),
        },
      },
    },
  };
})();

// Knowledge Seeker
export const knowledgeSeeker: CardDef = {
  title: 'Knowledge Seeker',
  events: [{
    event: ':end-of-encounter',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(targets[0]?.ice, card) && coreCard.getCounters(card, ':virus') >= 3;
    }),
    interactive: req(function*() { return true; }),
    async: true,
    msg: 'purge virus counters and derez itself',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRezzing.derez(state, side, coreEid.makeEid(state, eid), card)], []);
      coreSay.playSfx(state, side, 'virus-purge');
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEffects.purge(state, side, eid)], []);
    }),
  }],
  subroutines: [
    {
      label: 'Place 1 virus counter on this card',
      msg: 'place 1 virus counter on itself',
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreProps.addCounter(state, side, eid, card, ':virus', 1, null)], []);
      }),
      async: true,
    },
    {
      label: 'Rearrange the top 4 cards of R&D',
      async: true,
      'waiting-prompt': true,
      'change-in-game-state': { silent: true, req: req(function*(state: State) { return ((state as any).corp?.deck?.length ?? 0) > 0; }) },
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const top4 = ((state as any).corp?.deck ?? []).slice(0, 4);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, coreIce.reorderChoice(':corp', top4), card, targets)], []);
      }),
    },
    endTheRun,
  ],
};

// Komainu
export const komainu: CardDef = {
  title: 'Komainu',
  'on-encounter': {
    interactive: req(function*() { return true; }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      const subCount = (state as any).runner?.hand?.length ?? 0;
      coreEffects.registerLingeringEffect(state, side, card, {
        type: ':additional-subroutines',
        req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          return coreCard.sameCard(card, tgts[0]);
        }),
        duration: ':end-of-run',
        value: req(function*() {
          return { subroutines: Array(subCount).fill(coreDefHelpers.doNetDamage(1)) };
        }),
      });
    }),
  },
};

// Konjin
export const konjin: CardDef = {
  title: 'Konjin',
  'on-encounter': doPsi({
    async: true,
    label: 'Force the runner to encounter another ice',
    prompt: 'Choose a piece of ice',
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.rezzed(c), 'not-self': true },
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `force the Runner to encounter ${coreToString.cardStr(state, targets[0])}`;
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRuns.forceIceEncounter(state, side, eid, targets[0])], []);
    }),
  }),
};

// Lab Dog
export const labDog: CardDef = {
  title: 'Lab Dog',
  subroutines: [{
    label: 'Force the Runner to trash an installed piece of hardware',
    player: ':runner',
    async: true,
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `force the Runner to trash ${(targets[0] as any)?.title} and trash itself`;
    }),
    prompt: 'Choose a piece of hardware to trash',
    choices: { card: (c: Card) => coreCard.installed(c) && coreCard.hardware(c) },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trash(state, side, coreEid.makeEid(state, eid), targets[0], { cause: ':subroutine' })], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trash(state, ':corp', coreEid.makeEid(state, eid), card, { cause: ':subroutine' })], []);
      coreRuns.encounterEnds(state, side, eid);
    }),
  }],
};

// Lamplighter
export const lamplighter: CardDef = (() => {
  const trashSelf: any = {
    async: true,
    interactive: req(function*() { return true; }),
    automatic: ':pre-draw-cards',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const context = targets[0];
      let targetZone = context?.card?.previousZone?.[1] ?? context?.card?.previousZone?.[0];
      if (targetZone === ':deck') targetZone = ':rd';
      else if (targetZone === ':hand') targetZone = ':hq';
      else if (targetZone === ':discard') targetZone = ':archives';
      return targetZone === (coreCard.getZone(card) as string[])?.[1];
    }),
    msg: 'trash itself',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trash(state, ':corp', eid, card, { causeCard: card, cause: ':effect' })], []);
    }),
  };
  return {
    title: 'Lamplighter',
    subroutines: [tagOrPayCredits(3), endTheRunIfTagged],
    events: [
      Object.assign({}, trashSelf, { event: ':agenda-scored' }),
      Object.assign({}, trashSelf, { event: ':agenda-stolen' }),
    ],
  };
})();

// Lancelot
export const lancelot: CardDef = {
  title: 'Lancelot',
  ...grailIce(trashProgramSub),
};

// Lethe
export const lethe: CardDef = {
  title: 'Lethe',
  events: [
    Object.assign({}, coreDefHelpers.giveTags(1), {
      event: ':bypassed-ice',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.sameCard(card, targets[0]);
      }),
    }),
    Object.assign({}, coreDefHelpers.giveTags(1), {
      event: ':subroutines-broken',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const context = targets[0];
        return coreCard.sameCard(context?.ice, card) && context?.allSubsBroken;
      }),
    }),
  ],
  subroutines: [
    {
      'change-in-game-state': { silent: true, req: req(function*(state: State) { return ((state as any).corp?.discard?.length ?? 0) > 0; }) },
      label: 'add card from Archives to R&D',
      prompt: 'Choose a card to add to the top or bottom of R&D',
      'show-discard': true,
      choices: { card: (c: Card) => coreCard.corp(c) && coreCard.inDiscard(c) },
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, coreIce.moveCardToTopOrBottom(targets[0], ':corp'), card, null)], []);
      }),
    },
    addRunnerCardToGrip,
  ],
};

// Lionsmane
export const lionsmane: CardDef = {
  title: 'Lionsmane',
  subroutines: (() => {
    const twoNetOption: any = {
      option: 'Corp does 2 net damage',
      ability: {
        msg: 'do 2 net damage',
        'display-side': ':corp',
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDamage.damage(state, ':corp', eid, ':net', 2, { card })], []);
        }),
      },
    };
    return [
      coreDefHelpers.doNetDamage(2),
      coreChooseOne.chooseOneHelper({
        label: 'Do 2 net damage unless the Runner pays 3 [Credits]',
        player: ':runner',
      }, [
        coreChooseOne.costOption([corePayment.toC('credit', 3)], ':runner'),
        twoNetOption,
      ]),
      coreChooseOne.chooseOneHelper({
        label: 'Do 2 net damage unless the Runner jacks out',
        player: ':runner',
      }, [
        {
          option: 'Jack out',
          ability: {
            msg: 'jack out',
            'display-side': ':runner',
            async: true,
            effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
              yield wait_for(state, [{ asyncResult: 'result' },
                coreRuns.jackOut(state, ':runner', eid)], []);
            }),
          },
        },
        twoNetOption,
      ]),
    ];
  })(),
};

// Little Engine
export const littleEngine: CardDef = {
  title: 'Little Engine',
  subroutines: [
    endTheRun,
    endTheRun,
    {
      msg: 'make the Runner gain 5 [Credits]',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, ':runner', eid, 5)], []);
      }),
    },
  ],
};

// Lockdown
export const lockdown: CardDef = {
  title: 'Lockdown',
  subroutines: [{
    label: 'The Runner cannot draw cards for the remainder of this turn',
    msg: 'prevent the Runner from drawing cards',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreDrawing.preventDraw(state);
    }),
  }],
};

// Logjam
export const logjam: CardDef = {
  title: 'Logjam',
  advanceable: ':always',
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card) {
    return coreCard.getCounters(card, ':advancement');
  }))],
  'on-rez': {
    msg: msg(function(state: State, side: Side, eid: EID, card: Card) {
      return `place ${utils.quantify(1 + utils.faceupArchivesTypes((state as any).corp), 'advancement counter')} on itself`;
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addProp(state, side, eid, card, ':advance-counter',
          1 + utils.faceupArchivesTypes((state as any).corp), { placed: true })], []);
    }),
  },
  subroutines: [
    Object.assign({}, gainCreditsSub(2), endTheRun, { label: 'Gain 2 [Credits] and end the run', msg: 'gain 2 [Credits] and end the run' }),
    endTheRun,
    endTheRun,
  ],
};

// Loki
export const loki: CardDef = {
  title: 'Loki',
  'on-encounter': {
    req: req(function*(state: State) {
      return coreBoard.allActiveInstalled(state, ':corp').filter((c: Card) => coreCard.ice(c)).length >= 2;
    }),
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.active(c), 'not-self': true },
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `choose ${coreToString.cardStr(state, targets[0])}`;
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const target = targets[0];
      coreEffects.registerLingeringEffect(state, ':corp', card, {
        type: ':gain-subtype',
        duration: ':end-of-run',
        req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) { return coreCard.sameCard(card, tgts[0]); }),
        value: (target as any).subtypes,
      });
      const additionalSubs = ((target as any).subroutines ?? []).map((s: any) => s['sub-effect']);
      coreEffects.registerLingeringEffect(state, ':corp', card, {
        type: ':additional-subroutines',
        req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) { return coreCard.sameCard(card, tgts[0]); }),
        duration: ':end-of-run',
        value: { position: ':front', subroutines: additionalSubs },
      });
    }),
  },
  subroutines: [{
    label: 'End the run unless the Runner shuffles the grip into the stack',
    player: ':runner',
    async: true,
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: req(function*(state: State) {
      const hand = (state as any).runner?.hand ?? [];
      const deck = (state as any).runner?.deck ?? [];
      return [
        !(hand.length === 0 && deck.length < 2) ? 'Shuffle the grip into the stack' : null,
        'End the run',
      ].filter(Boolean);
    }),
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return targets[0] === 'End the run'
        ? utils.decapitalize(targets[0])
        : `force the Runner to ${utils.decapitalize(targets[0])}`;
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'End the run') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, ':corp', eid, card)], []);
      } else {
        for (const c of (state as any).runner?.hand ?? []) {
          coreMoving.move(state, ':runner', c, ':deck');
        }
        coreMoving.shuffle(state, ':runner', ':deck');
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  }],
};

// Loot Box
export const lootBox: CardDef = (() => {
  function top3(state: State): Card[] {
    return ((state as any).runner?.deck ?? []).slice(0, 3);
  }
  return {
    title: 'Loot Box',
    subroutines: [
      endTheRunUnlessRunnerPays(corePayment.toC('credit', 2)),
      {
        label: 'Reveal the top 3 cards of the Stack',
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          const deck = (state as any).runner?.deck ?? [];
          if (deck.length > 0) {
            const top = top3(state);
            coreSay.systemMsg(state, side,
              `uses ${(card as any).title} to reveal ${utils.enumerateCards(top)} from the top of the stack`);
            yield wait_for(state, [{ asyncResult: 'result' },
              coreRevealing.reveal(state, side, coreEid.makeEid(state, eid), top)], []);
            const pickAbility = {
              'waiting-prompt': true,
              prompt: 'Choose a card to add to the Grip',
              choices: req(function*() { return top3(state); }),
              msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
                return `add ${(tgts[0] as any)?.title} to the Grip, gain ${(tgts[0] as any)?.cost} [Credits], shuffle the Stack and trash itself`;
              }),
              async: true,
              effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
                coreMoving.move(s, ':runner', tgts[0], ':hand');
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreGaining.gainCredits(s, ':corp', coreEid.makeEid(s, e), (tgts[0] as any)?.cost ?? 0)], []);
                coreMoving.shuffle(s, ':runner', ':deck');
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreMoving.trash(s, ':corp', e, c, { cause: ':subroutine' })], []);
                coreRuns.encounterEnds(s, sd, e);
              }),
            };
            yield wait_for(state, [{ asyncResult: 'result' },
              coreEngine.resolveAbility(state, side, pickAbility, card, null)], []);
          } else {
            coreSay.systemMsg(state, side, `uses ${(card as any).title} to trash itself`);
            yield wait_for(state, [{ asyncResult: 'result' },
              coreMoving.trash(state, ':corp', coreEid.makeEid(state, eid), card, { cause: ':subroutine' })], []);
            coreRuns.encounterEnds(state, side, eid);
          }
        }),
      },
    ],
  };
})();

// Lotus Field
export const lotusField: CardDef = {
  title: 'Lotus Field',
  'static-abilities': [{
    type: ':cannot-lower-strength',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(card, targets[0]?.ice);
    }),
    value: true,
  }],
  subroutines: [endTheRun],
};

// Lycan
export const lycan: CardDef = {
  title: 'Lycan',
  ...morphIce('Sentry', 'Code Gate', trashProgramSub),
};

// Lycian Multi-Munition
export const lycianMultiMunition: CardDef = (() => {
  function iceSubtypeChoice(choices: string[], state: State, side: Side, card: Card): any {
    return {
      prompt: 'Choose an ice subtype',
      choices,
      async: true,
      effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
        if (tgts[0] === 'Done') {
          coreEid.effectCompleted(s, sd, e);
        } else {
          const remaining = choices.filter((ch: string) => ch !== tgts[0]);
          const newChoices = [...new Set([...remaining, 'Done'])];
          coreSay.systemMsg(s, sd, `uses ${(c as any).title} to make itself gain ${tgts[0]}`);
          coreEffects.registerLingeringEffect(s, sd, c, {
            type: ':gain-subtype',
            req: req(function*(s2: State, sd2: Side, e2: EID, c2: Card, tgts2: any[]) {
              return coreCard.sameCard(c, tgts2[0]);
            }),
            value: tgts[0],
          });
          yield wait_for(s, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(s, sd, iceSubtypeChoice(newChoices, s, sd, c), c, null)], []);
        }
      }),
    };
  }
  return {
    title: 'Lycian Multi-Munition',
    'on-rez': {
      async: true,
      'waiting-prompt': true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, iceSubtypeChoice(['Barrier', 'Code Gate', 'Sentry'], state, side, card), card, null)], []);
      }),
    },
    'derez-effect': {
      effect: req(function*(state: State, side: Side) {
        coreEffects.unregisterEffectsForCard(state, side, (card: Card) => (e: any) => e.type === ':gain-subtype');
      }),
    },
    events: [
      {
        event: ':runner-turn-ends',
        req: req(function*(state: State, side: Side, eid: EID, card: Card) { return coreCard.rezzed(card); }),
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreRezzing.derez(state, ':corp', eid, card)], []);
        }),
      },
      {
        event: ':corp-turn-ends',
        req: req(function*(state: State, side: Side, eid: EID, card: Card) { return coreCard.rezzed(card); }),
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreRezzing.derez(state, ':corp', eid, card)], []);
        }),
      },
    ],
    subroutines: [
      {
        label: '(Code Gate) Force the Runner to lose [Click] and 1 [Credit]',
        msg: 'force the Runner to lose [Click] and 1 [Credit]',
        'change-in-game-state': {
          silent: true,
          req: req(function*(state: State, side: Side, eid: EID, card: Card) {
            return coreCard.hasSubtype(card, 'Code Gate') &&
              (((state as any).runner?.credit ?? 0) > 0 || ((state as any).runner?.click ?? 0) > 0);
          }),
        },
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreGaining.loseCredits(state, ':runner', coreEid.makeEid(state, eid), 1)], []);
          coreGaining.loseClicks(state, ':runner', 1);
          coreEid.effectCompleted(state, side, eid);
        }),
      },
      {
        label: '(Sentry) Trash a program',
        prompt: 'Choose a program to trash',
        'change-in-game-state': {
          silent: true,
          req: req(function*(state: State, side: Side, eid: EID, card: Card) {
            return coreCard.hasSubtype(card, 'Sentry') &&
              coreBoard.allInstalled(state, ':runner').some((c: Card) => coreCard.program(c));
          }),
        },
        msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return `trash ${(targets[0] as any)?.title}`;
        }),
        choices: { card: (c: Card) => coreCard.installed(c) && coreCard.program(c) },
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
        }),
      },
      {
        label: '(Barrier) Gain 1 [Credit] and end the run',
        msg: 'gain 1 [Credit] and end the run',
        'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card) {
          return coreCard.hasSubtype(card, 'Barrier');
        }) },
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreGaining.gainCredits(state, ':corp', coreEid.makeEid(state, eid), 1)], []);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreRuns.endRun(state, ':corp', eid, card)], []);
        }),
      },
    ],
  };
})();

// M.I.C.
export const mic: CardDef = {
  title: 'M.I.C.',
  abilities: [{
    label: 'End the run unless the Runner spends [Click]',
    msg: 'end the run unless the Runner spends [Click]',
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !!(state as any).run && forms.thisServer(state, card);
    }),
    async: true,
    cost: [corePayment.toC('trash-can', 1)],
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side,
          endTheRunUnlessRunnerPays(corePayment.toC('click', 1), 'ability'), card, null)], []);
      if ((state as any).run && coreIce.getCurrentIce(state) === card) {
        coreRuns.encounterEnds(state, side, eid);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  }],
  subroutines: [runnerLosesClick, runnerLosesClick, endTheRun],
};

// Machicolation A
export const machicolationA: CardDef = {
  title: 'Machicolation A',
  subroutines: [
    trashProgramSub,
    trashProgramSub,
    trashHardwareSub,
    {
      label: 'Runner loses 3 [Credits], if able. End the run',
      msg: msg(function(state: State) {
        return ((state as any).runner?.credit ?? 0) >= 3
          ? 'make the Runner lose 3 [Credits] and end the run'
          : 'end the run';
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        if (((state as any).runner?.credit ?? 0) >= 3) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreGaining.loseCredits(state, ':runner', coreEid.makeEid(state, eid), 3)], []);
        }
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, ':corp', eid, card)], []);
      }),
    },
  ],
};

// Machicolation B
export const machicolationB: CardDef = {
  title: 'Machicolation B',
  subroutines: [
    trashResourceSub,
    trashResourceSub,
    coreDefHelpers.doNetDamage(1),
    {
      label: 'Runner loses [click], if able. End the run',
      msg: msg(function(state: State) {
        return ((state as any).runner?.click ?? 0) > 0
          ? 'make the Runner lose [click] and end the run'
          : 'end the run';
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        if (((state as any).runner?.click ?? 0) > 0) {
          coreGaining.loseClicks(state, ':runner', 1);
        }
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, ':corp', eid, card)], []);
      }),
    },
  ],
};

// Macrophage
export const macrophage: CardDef = {
  title: 'Macrophage',
  subroutines: [
    traceAbility(4, {
      label: 'Purge virus counters',
      msg: 'purge virus counters',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEffects.purge(state, side, eid)], []);
      }),
    }),
    traceAbility(3, {
      label: 'Trash a virus',
      prompt: 'Choose a virus to trash',
      choices: { card: (c: Card) => coreCard.installed(c) && coreCard.hasSubtype(c, 'Virus') },
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `trash ${(targets[0] as any)?.title}`;
      }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        coreRuns.clearWaitPrompt(state, ':runner');
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
      }),
    }),
    traceAbility(2, {
      label: 'Remove a virus in the Heap from the game',
      req: req(function*(state: State) { return !coreFlags.zoneLocked(state, ':runner', ':discard'); }),
      prompt: 'Choose a virus in the Heap to remove from the game',
      choices: req(function*(state: State) {
        return coreCard.cancellable(
          ((state as any).runner?.discard ?? []).filter((c: Card) => coreCard.hasSubtype(c, 'Virus')),
          { sorted: true }
        );
      }),
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `remove ${(targets[0] as any)?.title} from the game`;
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        coreMoving.move(state, ':runner', targets[0], ':rfg');
      }),
    }),
    traceAbility(1, endTheRun),
  ],
};

// Magnet
export const magnet: CardDef = {
  title: 'Magnet',
  'on-rez': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreBoard.allInstalled(state, ':corp').some((ice: Card) =>
        coreCard.ice(ice) && !coreCard.sameCard(ice, card) &&
        ((ice as any).hosted ?? []).some((h: Card) => coreCard.program(h))
      );
    }),
    prompt: 'Choose a Program to host',
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `host ${coreToString.cardStr(state, targets[0])}`;
    }),
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.program(targets[0]) &&
          coreCard.ice((targets[0] as any).host) &&
          !coreCard.sameCard((targets[0] as any).host, card);
      }),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      coreCard.host(state, side, card, targets[0]);
      coreEffects.updateDisabledCards(state);
      coreEvents.triggerEvent(state, ':corp', ':subroutines-should-update');
    }),
  },
  'static-abilities': [{
    type: ':disable-card',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard((targets[0] as any)?.host, card) &&
        (targets[0] as any)?.title !== 'Hush' &&
        coreCard.program(targets[0]);
    }),
    value: true,
  }],
  subroutines: [endTheRun],
};

// Mamba
export const mamba: CardDef = {
  title: 'Mamba',
  abilities: [powerCounterAbility(Object.assign({}, coreDefHelpers.doNetDamage(1), {
    req: req(function*(state: State) { return !!(state as any).run; }),
  }))],
  subroutines: [coreDefHelpers.doNetDamage(1), doPsi(gainPowerCounter)],
};

// Marker
export const marker: CardDef = {
  title: 'Marker',
  subroutines: [{
    label: 'Give next encountered ice "End the run"',
    msg: 'give next encountered ice "[Subroutine] End the run" after all its other subroutines for the remainder of the run',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreEvents.registerEvents(state, side, card, [{
        event: ':encounter-ice',
        duration: ':end-of-run',
        'unregister-once-resolved': true,
        req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          return coreCard.rezzed(tgts[0]?.ice);
        }),
        msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          return `give ${(tgts[0]?.ice as any)?.title} "[Subroutine] End the run" after all its other subroutines`;
        }),
        effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          const tCard = tgts[0]?.ice;
          coreEffects.registerLingeringEffect(s, sd, c, {
            type: ':additional-subroutines',
            req: req(function*(s2: State, sd2: Side, e2: EID, c2: Card, tgts2: any[]) {
              return coreCard.sameCard(tCard, tgts2[0]);
            }),
            duration: ':end-of-run',
            value: { subroutines: [endTheRun] },
          });
        }),
      }]);
    }),
  }],
};

// Markus 1.0
export const markus10: CardDef = {
  title: 'Markus 1.0',
  subroutines: [runnerTrashInstalledSub, endTheRun],
  'runner-abilities': [bioraidBreak(1, 1)],
};

// Maskirovka
export const maskirovka: CardDef = {
  title: 'Maskirovka',
  subroutines: [gainCreditsSub(2), endTheRun],
};

// Masvingo
export const masvingo: CardDef = {
  title: 'Masvingo',
  ...heroToHero(endTheRun),
  'on-rez': {
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addProp(state, side, eid, card, ':advance-counter', 1, { placed: true })], []);
    }),
  },
};

// Matrix Analyzer
export const matrixAnalyzer: CardDef = {
  title: 'Matrix Analyzer',
  'on-encounter': Object.assign({}, coreDefHelpers.placeAdvancementCounter(true), { cost: [corePayment.toC('credit', 1)] }),
  subroutines: [tagTrace(2)],
};

// Mausolus
export const mausolus: CardDef = {
  title: 'Mausolus',
  advanceable: ':always',
  subroutines: [
    {
      label: 'Gain 1 [Credits] (Gain 3 [Credits])',
      msg: msg(function(state: State, side: Side, eid: EID, card: Card) {
        return `gain ${wonderSub(card, 3) ? 3 : 1} [Credits]`;
      }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, side, eid, wonderSub(card, 3) ? 3 : 1)], []);
      }),
    },
    {
      label: 'Do 1 net damage (Do 3 net damage)',
      async: true,
      msg: msg(function(state: State, side: Side, eid: EID, card: Card) {
        return `do ${wonderSub(card, 3) ? 3 : 1} net damage`;
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDamage.damage(state, side, eid, ':net', wonderSub(card, 3) ? 3 : 1, { card })], []);
      }),
    },
    {
      label: 'Give the Runner 1 tag (and end the run)',
      async: true,
      msg: msg(function(state: State, side: Side, eid: EID, card: Card) {
        return `give the Runner 1 tag${wonderSub(card, 3) ? ' and end the run' : ''}`;
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreTags.gainTags(state, ':corp', coreEid.makeEid(state, eid), 1)], []);
        if (wonderSub(card, 3)) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreRuns.endRun(state, side, eid, card)], []);
        } else {
          coreEid.effectCompleted(state, side, eid);
        }
      }),
    },
  ],
};

// Meridian
export const meridian: CardDef = {
  title: 'Meridian',
  subroutines: [{
    label: 'Gain 4 [Credits] and end the run',
    'waiting-prompt': true,
    prompt: 'Choose one',
    choices: ['Corp gains 4 [Credits] and end the run', 'Add Meridian to score area'],
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return targets[0].startsWith('Corp')
        ? 'gain 4 [Credits] and end the run'
        : `force the Runner to ${utils.decapitalize(targets[0])}`;
    }),
    player: ':runner',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0].startsWith('Corp')) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, ':corp', coreEid.makeEid(state, eid), 4)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, ':runner', eid, card)], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.encounterEnds(state, side, coreEid.makeEid(state, eid))], []);
        coreCard.asAgenda(state, ':runner', card, -1);
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  }],
};

// Merlin
export const merlin: CardDef = {
  title: 'Merlin',
  ...grailIce(coreDefHelpers.doNetDamage(2)),
};

// Meru Mati
export const meruMati: CardDef = {
  title: 'Meru Mati',
  subroutines: [endTheRun],
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card) {
    return coreServers.protectingHQ(state, card) ? 3 : 0;
  }))],
};

// Metamorph
export const metamorph: CardDef = {
  title: 'Metamorph',
  subroutines: [{
    label: 'Swap 2 pieces of ice or swap 2 installed non-ice',
    msg: 'swap 2 pieces of ice or swap 2 installed non-ice',
    async: true,
    prompt: 'Choose one',
    'waiting-prompt': true,
    req: req(function*(state: State) {
      const installed = coreBoard.allInstalled(state, ':corp');
      return installed.filter((c: Card) => coreCard.ice(c)).length >= 2 ||
        installed.filter((c: Card) => !coreCard.ice(c)).length >= 2;
    }),
    choices: req(function*(state: State) {
      const installed = coreBoard.allInstalled(state, ':corp');
      return [
        installed.filter((c: Card) => coreCard.ice(c)).length >= 2 ? 'Swap 2 pieces of ice' : null,
        installed.filter((c: Card) => !coreCard.ice(c)).length >= 2 ? 'Swap 2 non-ice' : null,
      ].filter(Boolean);
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      let innerAbility: any;
      if (targets[0] === 'Swap 2 pieces of ice') {
        innerAbility = {
          prompt: 'Choose 2 pieces of ice to swap',
          choices: { card: (c: Card) => coreCard.installed(c) && coreCard.ice(c), 'not-self': true, max: 2, all: true },
          msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            return `swap the positions of ${coreToString.cardStr(s, tgts[0])} and ${coreToString.cardStr(s, tgts[1])}`;
          }),
          effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            coreIce.swapIce(s, sd, tgts[0], tgts[1]);
          }),
        };
      } else {
        innerAbility = {
          prompt: 'Choose 2 cards to swap',
          choices: { card: (c: Card) => coreCard.installed(c) && !coreCard.ice(c), max: 2, all: true },
          msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            return `swap the positions of ${coreToString.cardStr(s, tgts[0])} and ${coreToString.cardStr(s, tgts[1])}`;
          }),
          effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            coreCard.swapInstalled(s, sd, tgts[0], tgts[1]);
          }),
        };
      }
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, innerAbility, card, null)], []);
    }),
  }],
};

// Mestnichestvo
export const mestnichestvo: CardDef = {
  title: 'Mestnichestvo',
  advanceable: ':always',
  'on-encounter': {
    optional: {
      prompt: 'Remove 1 hosted advancement counter to make the Runner lose 3 [Credits]?',
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreCard.getCounters(coreCard.getCard(state, card), ':advancement') > 0;
      }),
      'yes-ability': {
        async: true,
        msg: msg(function(state: State, side: Side, eid: EID, card: Card) {
          return `spend 1 hosted advancement counter from ${(card as any).title} to force the Runner to lose 3 [Credits]`;
        }),
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreProps.addProp(state, ':corp', coreEid.makeEid(state, eid), card, ':advance-counter', -1, { placed: true })], []);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreGaining.loseCredits(state, ':runner', eid, 3)], []);
        }),
      },
      'no-ability': {
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          coreSay.systemMsg(state, ':corp', `declines to use ${(card as any).title}`);
        }),
      },
    },
  },
  subroutines: [runnerLosesCredits(3), endTheRun],
};

// Mganga
export const mganga: CardDef = {
  title: 'Mganga',
  subroutines: [
    doPsi(
      {
        async: true,
        label: 'Do 2 net damage',
        msg: 'do 2 net damage and trash itself',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDamage.damage(state, ':corp', coreEid.makeEid(state, eid), ':net', 2, { card })], []);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreMoving.trash(state, ':corp', coreEid.makeEid(state, eid), card, { cause: ':subroutine' })], []);
          coreRuns.encounterEnds(state, side, eid);
        }),
      },
      {
        async: true,
        label: 'Do 1 net damage',
        msg: 'do 1 net damage and trash itself',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDamage.damage(state, ':corp', coreEid.makeEid(state, eid), ':net', 1, { card })], []);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreMoving.trash(state, ':corp', coreEid.makeEid(state, eid), card, { cause: ':subroutine' })], []);
          coreRuns.encounterEnds(state, side, eid);
        }),
      }
    ),
  ],
};

// Mind Game
export const mindGame: CardDef = {
  title: 'Mind Game',
  subroutines: [
    doPsi({
      label: 'Redirect the run to another server',
      async: true,
      prompt: 'Choose a server',
      'waiting-prompt': true,
      choices: req(function*(state: State) {
        const currentServer = coreServers.zoneName((state as any).run?.server);
        return forms.servers(state).filter((s: string) => s !== currentServer);
      }),
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `redirect the run to ${targets[0]} and for the remainder of the run, the runner must add 1 installed card to the bottom of the stack as an additional cost to jack out`;
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const run = (state as any).run;
        const canRedirect = run && (run.encounters ?? []).length === 1 && run.phase !== ':success';
        if (canRedirect) {
          coreRuns.redirectRun(state, side, targets[0], ':approach-ice');
        }
        coreEffects.registerLingeringEffect(state, side, card, {
          type: ':jack-out-additional-cost',
          duration: ':end-of-run',
          value: [corePayment.toC('add-installed-to-bottom-of-deck', 1)],
        });
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, coreRuns.offerJackOut(), card, null)], []);
        if (canRedirect && !(state as any).run?.endRun?.ended) {
          coreRuns.encounterEnds(state, side, eid);
        } else {
          coreEid.effectCompleted(state, side, eid);
        }
      }),
    }),
  ],
};

// Minelayer
export const minelayer: CardDef = {
  title: 'Minelayer',
  subroutines: [{
    async: true,
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.inHand(c) },
    prompt: 'Choose a piece of ice to install from HQ',
    'change-in-game-state': { req: req(function*(state: State) { return ((state as any).corp?.hand?.length ?? 0) > 0; }), silent: true },
    label: 'install ice from HQ, ignoring all costs',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreInstalling.corpInstall(state, side, eid, targets[0],
          coreServers.zoneName(coreRuns.targetServer(state)),
          { ignoreAllCost: true, msgKeys: { installSource: card, displayOrigin: true } })], []);
    }),
  }],
};

// Mirāju
export const miraju: CardDef = {
  title: 'Mirāju',
  events: [{
    event: ':end-of-encounter',
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const context = targets[0];
      const firstPrinted = (context?.ice?.subroutines ?? []).find((s: any) => s.printed);
      return coreCard.sameCard(card, context?.ice) && firstPrinted?.broken;
    }),
    msg: 'make the Runner continue the run on Archives',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const run = (state as any).run;
      if (run && (run.encounters ?? []).length === 1 && run.phase !== ':success') {
        coreRuns.redirectRun(state, side, 'Archives', ':approach-ice');
      }
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, ':runner', coreEid.makeEid(state, eid), coreRuns.offerJackOut(), card, null)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRezzing.derez(state, side, eid, card)], []);
    }),
  }],
  subroutines: [{
    async: true,
    label: 'Draw 1 card, then shuffle 1 card from HQ into R&D',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          optional: {
            prompt: 'Draw 1 card?',
            'yes-ability': {
              async: true, msg: 'draw 1 card',
              effect: effect(function*(s: State, sd: Side, e: EID) {
                yield wait_for(s, [{ asyncResult: 'result' }, coreDrawing.draw(s, sd, e, 1)], []);
              }),
            },
          },
        }, card, null)], []);
      const shuffleAbility = {
        prompt: 'Choose 1 card in HQ to shuffle into R&D',
        choices: { card: (c: Card) => coreCard.inHand(c) && coreCard.corp(c) },
        msg: 'shuffle 1 card in HQ into R&D',
        effect: effect(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          coreMoving.move(s, sd, tgts[0], ':deck');
          coreMoving.shuffle(s, ':corp', ':deck');
        }),
      };
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, shuffleAbility, card, null)], []);
    }),
  }],
};

// Mlinzi
export const mlinzi: CardDef = (() => {
  function netOrMill(netDmg: number, millCnt: number): any {
    return {
      label: `Do ${netDmg} net damage`,
      player: ':runner',
      'waiting-prompt': true,
      prompt: 'Choose one',
      choices: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return [
          `Take ${netDmg} net damage`,
          corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('trash-from-deck', millCnt)])
            ? utils.capitalize(corePayment.buildCostLabel([corePayment.toC('trash-from-deck', millCnt)])) : null,
        ].filter(Boolean);
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        if (targets[0] === `Take ${netDmg} net damage`) {
          coreSay.systemMsg(state, ':corp', `uses ${(card as any).title} to do ${netDmg} net damage`);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDamage.damage(state, ':runner', eid, ':net', netDmg, { card })], []);
        } else {
          const result: any = yield wait_for(state, [{ asyncResult: 'result' },
            corePayment.pay(state, ':runner', coreEid.makeEid(state, eid), card, [corePayment.toC('trash-from-deck', millCnt)])], []);
          coreSay.systemMsg(state, ':runner', result?.msg ?? '');
          coreEid.effectCompleted(state, side, eid);
        }
      }),
    };
  }
  return { title: 'Mlinzi', subroutines: [netOrMill(1, 2), netOrMill(2, 3), netOrMill(3, 4)] };
})();

// Mother Goddess
export const motherGoddess: CardDef = {
  title: 'Mother Goddess',
  'static-abilities': [{
    type: ':gain-subtype',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(card, targets[0]);
    }),
    value: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const corp = (state as any).corp;
      const ices: Card[] = Object.values(corp?.servers ?? {}).flatMap((s: any) => s?.ices ?? []);
      return ices
        .filter((ice: Card) => coreCard.rezzed(ice) && !coreCard.sameCard(card, ice))
        .flatMap((ice: Card) => (ice as any).subtypes ?? []);
    }),
  }],
  subroutines: [endTheRun],
  events: [
    { event: ':rez', req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) { return coreCard.ice(tgts[0]?.card); }), effect: effect(function*(s: State, sd: Side) { coreIce.updateAllSubtypes(s, sd); }) },
    { event: ':derez', req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) { return coreCard.ice(tgts[0]?.card); }), effect: effect(function*(s: State, sd: Side) { coreIce.updateAllSubtypes(s, sd); }) },
    { event: ':card-moved', req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) { return coreCard.ice(tgts[0]?.card); }), effect: effect(function*(s: State, sd: Side) { coreIce.updateAllSubtypes(s, sd); }) },
    { event: ':ice-subtype-changed', req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) { return coreCard.ice(tgts[0]); }), effect: effect(function*(s: State, sd: Side) { coreIce.updateAllSubtypes(s, sd); }) },
  ],
};

// Muckraker
export const muckraker: CardDef = {
  title: 'Muckraker',
  'on-rez': takeBadPub,
  subroutines: [tagTrace(1), tagTrace(2), tagTrace(3), endTheRunIfTagged],
};

// Mycoweb
export const mycoweb: CardDef = {
  title: 'Mycoweb',
  subroutines: [
    {
      label: 'Install an ice from Archives, ignoring all costs',
      'show-discard': true,
      choices: { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.ice(targets[0]) && coreCard.inDiscard(targets[0]);
      }) },
      'waiting-prompt': true,
      async: true,
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreInstalling.corpInstallMsg(targets[0]);
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreInstalling.corpInstall(state, side, eid, targets[0], null, { ignoreInstallCost: true })], []);
      }),
    },
    rezAnIce({ costBonus: -2 }),
    resolveAnotherSubroutine((c: Card) => coreCard.hasSubtype(c, 'Sentry'), 'Resolve subroutine on a rezzed Sentry', true),
    resolveAnotherSubroutine((c: Card) => coreCard.hasSubtype(c, 'Code Gate'), 'Resolve subroutine on another rezzed Code Gate'),
  ],
};

// N-Pot
export const nPot: CardDef = (() => {
  function etrIfThreatX(x: number): any {
    return Object.assign({}, endTheRun, {
      label: `If threat >= ${x}, End the run`,
      'change-in-game-state': { silent: true, req: req(function*(state: State) { return coreThreat.threatLevel(x, state); }) },
    });
  }
  return {
    title: 'N-Pot',
    subroutines: [endTheRun, etrIfThreatX(2), etrIfThreatX(4)],
    'runner-abilities': [coreIce.breakSub([corePayment.toC('credit', 3)], 1, null, {
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return currentlyEncounteringCard(card, state);
      }),
    })],
  };
})();

// Najja 1.0
export const najja10: CardDef = {
  title: 'Najja 1.0',
  subroutines: [endTheRun, endTheRun],
  'runner-abilities': [bioraidBreak(1, 1)],
};

// Nebula
export const nebula: CardDef = {
  title: 'Nebula',
  ...spaceIce(trashProgramSub),
};

// Negotiator
export const negotiator: CardDef = {
  title: 'Negotiator',
  subroutines: [gainCreditsSub(2), trashProgramSub],
  'runner-abilities': [coreIce.breakSub([corePayment.toC('credit', 2)], 1, 'All', {
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return currentlyEncounteringCard(card, state);
    }),
  })],
};

// Nerine 2.0
export const nerine20: CardDef = (() => {
  const sub: any = {
    label: 'Do 1 core damage and Corp may draw 1 card',
    async: true,
    msg: 'do 1 core damage',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, ':runner', coreEid.makeEid(state, eid), ':brain', 1, { card })], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.maybeDraw(state, side, eid, card, 1)], []);
    }),
  };
  return {
    title: 'Nerine 2.0',
    subroutines: [sub, sub],
    'runner-abilities': [bioraidBreak(2, 2)],
    abilities: [coreEngine.setAutoresolve(':auto-fire', 'Nerine 2.0 drawing cards')],
  };
})();

// Neural Katana
export const neuralKatana: CardDef = {
  title: 'Neural Katana',
  subroutines: [coreDefHelpers.doNetDamage(3)],
};

// News Hound
export const newsHound: CardDef = {
  title: 'News Hound',
  'static-abilities': [{
    type: ':additional-subroutines',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(card, targets[0]) &&
        ([...(state as any).corp?.current ?? [], ...(state as any).runner?.current ?? []]).length > 0;
    }),
    value: { subroutines: [endTheRun] },
  }],
  subroutines: [tagTrace(3)],
};

// NEXT Bronze
export const nextBronze: CardDef = {
  title: 'NEXT Bronze',
  subroutines: [endTheRun],
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State) {
    return nextIceCount((state as any).corp);
  }))],
};

// NEXT Diamond
export const nextDiamond: CardDef = {
  title: 'NEXT Diamond',
  'rez-cost-bonus': req(function*(state: State) { return -nextIceCount((state as any).corp); }),
  subroutines: [
    coreDefHelpers.doBrainDamage(1),
    coreDefHelpers.doBrainDamage(1),
    {
      prompt: 'Choose a card to trash',
      label: 'Trash 1 installed Runner card',
      'change-in-game-state': { silent: true, req: req(function*(state: State) { return coreBoard.allInstalled(state, ':runner').length > 0; }) },
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return `trash ${(targets[0] as any)?.title}`; }),
      choices: { card: (c: Card) => coreCard.installed(c) && coreCard.runner(c) },
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
      }),
    },
  ],
};

// NEXT Gold
export const nextGold: CardDef = (() => {
  function trashPrograms(cnt: number, state: State, side: Side, card: Card, eid: EID): any {
    if (cnt > 0) {
      return (async function*() {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, trashProgramSub, card, null)], []);
        yield wait_for(state, [{ asyncResult: 'result' }, trashPrograms(cnt - 1, state, side, card, eid)], []);
      })();
    }
    return coreEid.effectCompleted(state, side, eid);
  }
  return {
    title: 'NEXT Gold',
    'x-fn': req(function*(state: State) { return nextIceCount((state as any).corp); }),
    subroutines: [
      {
        label: 'Do X net damage',
        msg: msg(function(state: State) { return `do ${nextIceCount((state as any).corp)} net damage`; }),
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDamage.damage(state, side, eid, ':net', nextIceCount((state as any).corp), { card })], []);
        }),
      },
      {
        label: 'Trash X programs',
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          const n = nextIceCount((state as any).corp);
          const programs = coreBoard.allActiveInstalled(state, ':runner').filter((c: Card) => coreCard.program(c)).length;
          yield wait_for(state, [{ asyncResult: 'result' }, trashPrograms(Math.min(programs, n), state, side, card, eid)], []);
        }),
      },
    ],
  };
})();

// NEXT Opal
export const nextOpal: CardDef = {
  title: 'NEXT Opal',
  ...nextIceVariableSubs(installFromHqSub()),
};

// NEXT Sapphire
export const nextSapphire: CardDef = {
  title: 'NEXT Sapphire',
  'x-fn': req(function*(state: State) { return nextIceCount((state as any).corp); }),
  subroutines: [
    {
      label: 'Draw up to X cards',
      prompt: 'How many cards do you want to draw?',
      'waiting-prompt': true,
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return `draw ${utils.quantify(targets[0], 'card')}`; }),
      choices: { number: req(function*(state: State) { return nextIceCount((state as any).corp); }), default: req(function*() { return 1; }) },
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDrawing.draw(state, side, eid, targets[0])], []);
      }),
    },
    {
      label: 'Add up to X cards from Archives to HQ',
      prompt: 'Choose cards to add to HQ',
      'show-discard': true,
      choices: {
        card: (c: Card) => coreCard.corp(c) && coreCard.inDiscard(c),
        max: req(function*(state: State) { return nextIceCount((state as any).corp); }),
      },
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        for (const c of targets) coreMoving.move(state, side, c, ':hand');
      }),
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const seen = targets.filter((c: Card) => (c as any).seen);
        const m = targets.filter((c: Card) => !(c as any).seen).length;
        return `add ${utils.enumerateCards(seen, { sorted: true })}${m > 0 ? ` and ${utils.quantify(m, 'unseen card')}` : ''} to HQ`;
      }),
    },
    {
      label: 'Shuffle up to X cards from HQ into R&D',
      prompt: 'Choose cards to shuffle into R&D',
      choices: {
        card: (c: Card) => coreCard.corp(c) && coreCard.inHand(c),
        max: req(function*(state: State) { return nextIceCount((state as any).corp); }),
      },
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        for (const c of targets) coreMoving.move(state, ':corp', c, ':deck');
        coreMoving.shuffle(state, ':corp', ':deck');
      }),
      cancel: coreMoving.shuffleMyDeck,
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `shuffle ${utils.quantify(targets.length, 'card')} from HQ into R&D`;
      }),
    },
  ],
};

// NEXT Silver
export const nextSilver: CardDef = {
  title: 'NEXT Silver',
  ...nextIceVariableSubs(endTheRun),
};

// Nightdancer
export const nightdancer: CardDef = (() => {
  const sub: any = {
    label: 'The Runner loses [Click], if able. You have an additional [Click] to spend during your next turn',
    msg: 'force the runner to lose a [Click], if able. Corp gains an additional [Click] to spend during [their] next turn',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreGaining.loseClicks(state, ':runner', 1);
      (state as any).corp.extraClickTemp = ((state as any).corp.extraClickTemp ?? 0) + 1;
    }),
  };
  return { title: 'Nightdancer', subroutines: [sub, sub] };
})();

// Oduduwa
export const oduduwa: CardDef = {
  title: 'Oduduwa',
  'on-encounter': {
    msg: 'place 1 advancement counter on itself',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addProp(state, side, coreEid.makeEid(state, eid), card, ':advance-counter', 1, { placed: true })], []);
      const currentCard = coreCard.getCard(state, card);
      const counters = coreCard.getCounters(currentCard, ':advancement');
      const optAbility = {
        optional: {
          prompt: `Place ${utils.quantify(counters, 'advancement counter')} on another ice?`,
          'yes-ability': {
            msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
              return `place ${utils.quantify(counters, 'advancement counter')} on ${coreToString.cardStr(s, tgts[0])}`;
            }),
            async: true,
            choices: { card: (c: Card) => coreCard.ice(c), 'not-self': true },
            effect: effect(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
              yield wait_for(s, [{ asyncResult: 'result' },
                coreProps.addProp(s, sd, e, tgts[0], ':advance-counter', counters, { placed: true })], []);
            }),
          },
        },
      };
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, optAbility, coreCard.getCard(state, card), null)], []);
    }),
  },
  'x-fn': req(function*(state: State, side: Side, eid: EID, card: Card) {
    return coreCard.getCounters(card, ':advancement');
  }),
  subroutines: [endTheRun, endTheRun],
};

// Orion
export const orion: CardDef = {
  title: 'Orion',
  ...spaceIce(trashProgramSub, resolveAnotherSubroutine(), endTheRun),
};

// Otoroshi
export const otoroshi: CardDef = {
  title: 'Otoroshi',
  subroutines: [{
    async: true,
    label: 'Place 3 advancement counters on an installed card',
    msg: 'place 3 advancement counters on an installed card',
    prompt: 'Choose an installed card in the root of a remote server',
    req: req(function*(state: State) {
      return coreBoard.allInstalled(state, ':corp').some((c: Card) => !coreCard.ice(c));
    }),
    choices: { card: (c: Card) => coreCard.corp(c) && coreCard.installed(c) && !coreCard.ice(c) },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const c = targets[0];
      const title = coreToString.cardStr(state, c);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, coreEid.makeEid(state, eid), c, ':advancement', 3, { placed: true })], []);
      const canPay3 = corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 3)]);
      const accessAbility = {
        player: ':runner',
        async: true,
        'waiting-prompt': true,
        prompt: 'Choose one',
        choices: [`Access ${title}`, canPay3 ? 'Pay 3 [Credits]' : null].filter(Boolean),
        msg: msg(function(s: State, sd: Side, e: EID, ca: Card, tgts: any[]) {
          return `force the Runner to ${utils.decapitalize(tgts[0])}`;
        }),
        effect: req(function*(s: State, sd: Side, e: EID, ca: Card, tgts: any[]) {
          if (tgts[0] === 'Pay 3 [Credits]') {
            const result: any = yield wait_for(s, [{ asyncResult: 'result' },
              corePayment.pay(s, ':runner', coreEid.makeEid(s, e), ca, [corePayment.toC('credit', 3)])], []);
            coreSay.systemMsg(s, ':runner', result?.msg ?? '');
            coreEid.effectCompleted(s, sd, e);
          } else {
            yield wait_for(s, [{ asyncResult: 'result' },
              coreRuns.accessCard(s, ':runner', e, c)], []);
          }
        }),
      };
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, accessAbility, card, null)], []);
    }),
  }],
};

// Owl
export const owl: CardDef = {
  title: 'Owl',
  subroutines: [addProgramToTopOfStack],
};

// Pachinko
export const pachinko: CardDef = {
  title: 'Pachinko',
  subroutines: [endTheRunIfTagged, endTheRunIfTagged],
};

// Palisade
export const palisade: CardDef = {
  title: 'Palisade',
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card) {
    return !coreServers.protectingACentral(state, card) ? 2 : 0;
  }))],
  subroutines: [endTheRun],
};

// Paper Wall
export const paperWall: CardDef = {
  title: 'Paper Wall',
  events: [{
    event: ':subroutines-broken',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const context = targets[0];
      return coreCard.sameCard(card, context?.ice) && context?.allSubsBroken;
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trash(state, ':corp', eid, card, { causeCard: card, cause: ':effect' })], []);
    }),
  }],
  subroutines: [endTheRun],
};

// Paywall
export const paywall: CardDef = {
  title: 'Paywall',
  'on-encounter': runnerLosesCredits(1),
  subroutines: [endTheRunUnlessRunnerPays(corePayment.toC('credit', 1))],
};

// Peeping Tom
export const peepingTom: CardDef = (() => {
  const sub = endTheRunUnlessRunner('takes 1 tag', 'take 1 tag', coreDefHelpers.giveTags(1));
  return {
    title: 'Peeping Tom',
    'on-encounter': {
      prompt: 'Choose a card type',
      choices: ['Event', 'Hardware', 'Program', 'Resource'],
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const cardtype = targets[0];
        const hand: Card[] = (state as any).runner?.hand ?? [];
        const n = hand.filter((c: Card) => coreCard.isType(c, cardtype)).length;
        coreSay.systemMsg(state, side,
          `uses ${(card as any).title} to name ${cardtype}, reveal ${utils.enumerateCards(hand, { sorted: true })} from the grip, and gain ${utils.quantify(n, 'subroutine')}`);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRevealing.reveal(state, side, coreEid.makeEid(state, eid), hand)], []);
        coreEffects.registerLingeringEffect(state, side, card, {
          type: ':additional-subroutines',
          duration: ':end-of-run',
          req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) { return coreCard.sameCard(card, tgts[0]); }),
          value: { subroutines: Array(n).fill(sub) },
        });
        coreEid.effectCompleted(state, side, eid);
      }),
    },
  };
})();

// Pharos
export const pharos: CardDef = {
  title: 'Pharos',
  advanceable: ':always',
  subroutines: [coreDefHelpers.giveTags(1), endTheRun, endTheRun],
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card) {
    return wonderSub(card, 3) ? 5 : 0;
  }))],
};

// Phoneutria
export const phoneutria: CardDef = {
  title: 'Phoneutria',
  subroutines: [coreDefHelpers.doNetDamage(1), coreDefHelpers.doNetDamage(1)],
  events: [{
    event: ':pass-ice',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(targets[0]?.ice, card) && ((state as any).runner?.hand?.length ?? 0) >= 4;
    }),
    msg: 'give the Runner 1 tag',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreTags.gainTags(state, side, eid, 1)], []);
    }),
  }],
};

// Ping
export const ping: CardDef = {
  title: 'Ping',
  'on-rez': Object.assign({}, coreDefHelpers.giveTags(1), {
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !!(state as any).run && forms.thisServer(state, card);
    }),
  }),
  subroutines: [endTheRun],
};

// Piranhas
export const piranhas: CardDef = {
  title: 'Piranhas',
  'additional-cost': [corePayment.toC('tag-or-bad-pub', 1)],
  subroutines: [
    maybeDrawSub(1),
    coreDefHelpers.doNetDamage(1),
    Object.assign({}, endTheRun, {
      label: 'End the run if there are more cards in HQ than in the grip',
      'change-in-game-state': {
        silent: true,
        req: req(function*(state: State) {
          return ((state as any).corp?.hand?.length ?? 0) > ((state as any).runner?.hand?.length ?? 0);
        }),
      },
    }),
  ],
};

// Pop-up Window
export const popUpWindow: CardDef = {
  title: 'Pop-up Window',
  'on-encounter': gainCreditsSub(1),
  subroutines: [endTheRunUnlessRunnerPays(corePayment.toC('credit', 1))],
};

// Biawak
export const biawak: CardDef = {
  title: 'Biawak',
  subroutines: [
    trashTypeOrEndTheRun('program', (c: Card) => coreCard.program(c), trashProgramSub),
    trashTypeOrEndTheRun('resource', (c: Card) => coreCard.resource(c), trashResourceSub),
    endTheRun,
  ],
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return eid.sourceType === ':rez' &&
          ((state as any).corp?.scored?.length ?? 0) > 0 &&
          coreCard.sameCard(card, targets[0]);
      }),
      'custom-amount': 10,
      'max-uses': 1,
      custom: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const targetCard = targets[0];
        const ability = {
          prompt: 'Forfeit an agenda to pay for 10 [Credits] of the rez cost?',
          async: true,
          choices: {
            req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
              return coreCard.inCorpScored(s, sd, tgts[0]);
            }),
          },
          msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            return `forfeit ${(tgts[0] as any)?.title} to pay for 10 [Credits] its rez cost`;
          }),
          effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            yield wait_for(s, [{ asyncResult: 'result' }, coreCard.forfeit(s, sd, tgts[0])], []);
            coreEid.completeWithResult(s, sd, e, 10);
          }),
          cancel: {
            async: true,
            effect: req(function*(s: State, sd: Side, e: EID) {
              coreEid.effectCompleted(s, sd, coreEid.makeResult(e, 0));
            }),
          },
        };
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, ability, card, null)], []);
      }),
      type: ':custom',
      'while-inactive': true,
    },
  },
};

// Pulse
export const pulse: CardDef = {
  title: 'Pulse',
  'rez-sound': 'pulse',
  'on-rez': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !!(state as any).run && forms.thisServer(state, card);
    }),
    msg: 'force the runner to lose [Click]',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreGaining.loseClicks(state, ':runner', 1);
    }),
  },
  subroutines: [
    {
      label: 'Runner loses 1 [Credits] for each rezzed piece of Harmonic ice',
      msg: msg(function(state: State) { return `make the runner lose ${harmonicIceCount((state as any).corp)} [Credits]`; }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.loseCredits(state, ':runner', eid, harmonicIceCount((state as any).corp))], []);
      }),
    },
    endTheRunUnlessRunnerPays(corePayment.toC('click', 1)),
  ],
};

// Pup
export const pup: CardDef = (() => {
  const sub: any = {
    player: ':runner',
    async: true,
    label: 'Do 1 net damage unless the Runner pays 1 [Credits]',
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return [
        'Suffer 1 net damage',
        corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 1)]) ? 'Pay 1 [Credits]' : null,
      ].filter(Boolean);
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'Suffer 1 net damage') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, ':corp', coreDefHelpers.doNetDamage(1), card, null)], []);
      } else {
        const result: any = yield wait_for(state, [{ asyncResult: 'result' },
          corePayment.pay(state, ':runner', coreEid.makeEid(state, eid), card, [corePayment.toC('credit', 1)])], []);
        coreSay.systemMsg(state, ':runner', result?.msg ?? '');
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
  return { title: 'Pup', subroutines: [sub, sub] };
})();

// Quandary
export const quandary: CardDef = {
  title: 'Quandary',
  subroutines: [endTheRun],
};

// Quicksand
export const quicksand: CardDef = {
  title: 'Quicksand',
  'on-encounter': gainPowerCounter,
  subroutines: [endTheRun],
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card) {
    return coreCard.getCounters(card, ':power');
  }))],
};

// Rainbow
export const rainbow: CardDef = {
  title: 'Rainbow',
  subroutines: [endTheRun],
};

// Ravana 1.0
export const ravana10: CardDef = (() => {
  const sub = resolveAnotherSubroutine((c: Card) => coreCard.hasSubtype(c, 'Bioroid'), 'Resolve a subroutine on a rezzed bioroid ice');
  return { title: 'Ravana 1.0', subroutines: [sub, sub], 'runner-abilities': [bioraidBreak(1, 1)] };
})();

// Red Tape
export const redTape: CardDef = {
  title: 'Red Tape',
  subroutines: [{
    label: 'Give +3 strength to all ice for the remainder of the run',
    msg: 'give +3 strength to all ice for the remainder of the run',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreEffects.registerLingeringEffect(state, side, card, {
        type: ':ice-strength',
        duration: ':end-of-run',
        value: 3,
      });
      coreIce.updateAllIce(state, side);
    }),
  }],
};

// Resistor
export const resistor: CardDef = {
  title: 'Resistor',
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State) { return utils.countTags(state); }))],
  subroutines: [traceAbility(4, endTheRun)],
};

// Reverb
export const reverb: CardDef = {
  title: 'Reverb',
  'rez-cost-bonus': req(function*(state: State, side: Side, eid: EID, card: Card) {
    return -coreBoard.allInstalled(state, ':corp').filter(
      (c: Card) => coreCard.ice(c) && !coreCard.sameCard(card, c) && !coreCard.rezzed(c)).length;
  }),
  subroutines: [endTheRun, endTheRun],
};

// Rime
export const rime: CardDef = {
  title: 'Rime',
  implementation: 'Can be rezzed anytime already',
  'on-rez': {
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreIce.updateAllIce(state, side);
    }),
  },
  subroutines: [runnerLosesCredits(1)],
  'static-abilities': [{
    type: ':ice-strength',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreServers.protectingSameServer(state, card, targets[0]);
    }),
    value: 1,
  }],
};

// Rototurret
export const rototurret: CardDef = {
  title: 'Rototurret',
  subroutines: [trashProgramSub, endTheRun],
};

// RSVP
export const rsvp: CardDef = {
  title: 'RSVP',
  subroutines: [{
    label: 'Runner cannot spend credits this run',
    msg: 'prevent the runner from spending credits this run',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      if ((state as any).run) {
        coreEffects.registerLingeringEffect(state, side, card, {
          type: ':cannot-pay-credit',
          req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            return tgts[0]?.amount == null || tgts[0].amount > 0;
          }),
          value: true,
          duration: ':end-of-run',
        });
      }
    }),
  }],
};

// Sadaka
export const sadaka: CardDef = {
  title: 'Sadaka',
  subroutines: [
    {
      label: 'Look at the top 3 cards of R&D',
      'change-in-game-state': { silent: true, req: req(function*(state: State) { return ((state as any).corp?.deck?.length ?? 0) > 0; }) },
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        const topCards = ((state as any).corp?.deck ?? []).slice(0, 3);
        const arrangeAbility = {
          'waiting-prompt': true,
          prompt: `The top cards of R&D are (top->bottom): ${utils.enumerateCards(topCards)}`,
          choices: ['Arrange cards', 'Shuffle R&D'],
          async: true,
          effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            if (tgts[0] === 'Arrange cards') {
              yield wait_for(s, [{ asyncResult: 'result' },
                coreEngine.resolveAbility(s, sd, coreIce.reorderChoice(':corp', topCards), c, null)], []);
              coreSay.systemMsg(s, ':corp', `rearranges the top ${utils.quantify(topCards.length, 'card')} of R&D`);
              yield wait_for(s, [{ asyncResult: 'result' },
                coreDrawing.maybeDraw(s, sd, e, c, 1)], []);
            } else {
              coreMoving.shuffle(s, ':corp', ':deck');
              coreSay.systemMsg(s, ':corp', 'shuffles R&D');
              yield wait_for(s, [{ asyncResult: 'result' },
                coreDrawing.maybeDraw(s, sd, e, c, 1)], []);
            }
          }),
        };
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, arrangeAbility, card, null)], []);
      }),
    },
    {
      label: 'Trash 1 card in HQ',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        const trashHQAbility = {
          'waiting-prompt': true,
          prompt: 'Choose a card in HQ to trash',
          choices: req(function*(s: State) {
            return coreCard.cancellable((s as any).corp?.hand ?? [], { sorted: true });
          }),
          async: true,
          effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            yield wait_for(s, [{ asyncResult: 'result' },
              coreMoving.trash(s, ':corp', coreEid.makeEid(s, e), tgts[0], { cause: ':subroutine' })], []);
            coreSay.systemMsg(s, ':corp', 'trashes a card from HQ');
            yield wait_for(s, [{ asyncResult: 'result' },
              coreEngine.resolveAbility(s, sd, trashResourceSub, c, null)], []);
          }),
        };
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, trashHQAbility, card, null)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, ':corp', coreEid.makeEid(state, eid), card, { causeCard: card })], []);
        coreSay.systemMsg(state, ':corp', `uses ${(card as any).title} to trash itself`);
        coreRuns.encounterEnds(state, side, eid);
      }),
    },
  ],
};

// Sagittarius
export const sagittarius: CardDef = {
  title: 'Sagittarius',
  ...constellationIce(trashProgramSub),
};

// Saisentan
export const saisentan: CardDef = (() => {
  const sub: any = {
    label: 'Do 1 net damage',
    async: true,
    msg: 'do 1 net damage',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':net', 1, { card, cause: ':subroutine' })], []);
    }),
  };
  return {
    title: 'Saisentan',
    'on-encounter': {
      'waiting-prompt': true,
      prompt: 'Choose a card type',
      choices: ['Event', 'Hardware', 'Program', 'Resource'],
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `choose the card type ${targets[0]}`;
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        coreCard.updateCard(state, side, Object.assign({}, card, { cardTarget: targets[0] }));
      }),
    },
    events: [
      {
        event: ':damage',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const context = targets[0];
          return context?.damageType === ':net' && context?.cause === ':subroutine' && coreCard.sameCard(context?.card, card);
        }),
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const context = targets[0];
          const trashedCards: Card[] = context?.cardsTrashed ?? [];
          const chosenType = (card as any).cardTarget;
          const matching = trashedCards.filter((c: Card) => coreCard.isType(c, chosenType));
          if (matching.length === 0) {
            coreEid.effectCompleted(state, side, eid);
            return;
          }
          function resolveExtraDamage(x: number): any {
            return (async function*() {
              coreSay.systemMsg(state, ':corp', `uses ${(card as any).title} to deal 1 additional net damage${x > 1 ? ` (${x - 1} remaining)` : ''}`);
              if (x <= 1) {
                yield wait_for(state, [{ asyncResult: 'result' },
                  coreDamage.damage(state, side, eid, ':net', 1, { card })], []);
              } else {
                yield wait_for(state, [{ asyncResult: 'result' },
                  coreDamage.damage(state, side, coreEid.makeEid(state, eid), ':net', 1, { card })], []);
                yield wait_for(state, [{ asyncResult: 'result' }, resolveExtraDamage(x - 1)], []);
              }
            })();
          }
          yield wait_for(state, [{ asyncResult: 'result' }, resolveExtraDamage(matching.length)], []);
        }),
      },
      {
        event: ':end-of-encounter',
        req: req(function*(state: State, side: Side, eid: EID, card: Card) { return !!(card as any).cardTarget; }),
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          coreCard.updateCard(state, side, Object.assign({}, card, { cardTarget: undefined }));
        }),
      },
    ],
    subroutines: [sub, sub, sub],
  };
})();

// Salvage
export const salvage: CardDef = {
  title: 'Salvage',
  ...zeroToHero(tagTrace(2)),
};

// Sand Storm
export const sandStorm: CardDef = {
  title: 'Sand Storm',
  subroutines: [{
    async: true,
    label: 'Move this ice and the run to another server',
    prompt: 'Choose another server and redirect the run to its outermost position',
    choices: req(function*(state: State) {
      const currentServer = coreServers.zoneName((state as any).run?.server);
      return coreCard.cancellable(forms.servers(state).filter((s: string) => s !== currentServer));
    }),
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `move itself and the run on ${targets[0]} and trash itself`;
    }),
    'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card) { return coreCard.installed(card); }) },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const movedIce = coreMoving.move(state, side, card, [...coreServers.serverToZone(state, targets[0]), ':ices']);
      coreRuns.redirectRun(state, side, targets[0]);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trash(state, side, coreEid.makeEid(state, eid), movedIce, { unpreventable: true, cause: ':subroutine' })], []);
      coreRuns.encounterEnds(state, side, eid);
    }),
  }],
};

// Sandman
export const sandman: CardDef = {
  title: 'Sandman',
  subroutines: [addRunnerCardToGrip, addRunnerCardToGrip],
};

// Sandstone
export const sandstone: CardDef = {
  title: 'Sandstone',
  subroutines: [endTheRun],
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card) {
    return -coreCard.getCounters(card, ':virus');
  }))],
  'on-encounter': {
    msg: 'place 1 virus counter on itself',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':virus', 1, null)], []);
      coreIce.updateIceStrength(state, side, coreCard.getCard(state, card));
      coreEid.effectCompleted(state, side, eid);
    }),
  },
};

// Sapper
export const sapper: CardDef = {
  title: 'Sapper',
  flags: { 'rd-reveal': req(function*() { return true; }) },
  subroutines: [trashProgramSub],
  'on-access': {
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card) { return !coreCard.inDiscard(card); }),
    msg: 'force the Runner to encounter Sapper',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRuns.forceIceEncounter(state, side, eid, card)], []);
    }),
  },
};

// Scatter Field
export const scatterField: CardDef = {
  title: 'Scatter Field',
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card) {
    const zone = coreCard.getZone(card) as string[];
    return ((state as any).corp?.servers?.[zone?.[1]]?.ices?.length ?? 0) === 1 ? 4 : 0;
  }))],
  subroutines: [installFromHqSub(), endTheRun],
};

// Searchlight
export const searchlight: CardDef = (() => {
  const sub: any = {
    label: 'Trace X - Give the Runner 1 tag',
    trace: {
      base: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreCard.getCounters(card, ':advancement');
      }),
      label: 'Give the Runner 1 tag',
      successful: coreDefHelpers.giveTags(1),
    },
  };
  return {
    title: 'Searchlight',
    'x-fn': req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.getCounters(card, ':advancement');
    }),
    advanceable: ':always',
    subroutines: [sub, sub],
  };
})();

// Seidr Adaptive Barrier
export const seidrAdaptiveBarrier: CardDef = {
  title: 'Seidr Adaptive Barrier',
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card) {
    return (coreServers.cardToServer(state, card)?.ices ?? []).length;
  }))],
  subroutines: [endTheRun],
};

// Self-Adapting Code Wall
export const selfAdaptingCodeWall: CardDef = {
  title: 'Self-Adapting Code Wall',
  'static-abilities': [{
    type: ':cannot-lower-strength',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(card, targets[0]?.ice);
    }),
    value: true,
  }],
  subroutines: [endTheRun],
};

// Semak-samun
export const semakSamun: CardDef = {
  title: 'Semak-samun',
  'static-abilities': [{
    type: ':cannot-break-subs-on-ice',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const context = targets[0];
      return coreCard.sameCard(card, context?.ice) && !coreCard.hasSubtype(context?.icebreaker, 'Fracter');
    }),
    value: true,
  }],
  subroutines: [endTheRunUnlessRunnerPays(corePayment.toC('net', 3))],
};

// Sensei
export const sensei: CardDef = {
  title: 'Sensei',
  subroutines: [{
    label: 'Give encountered ice "End the run"',
    msg: 'give encountered ice "[Subroutine] End the run" after all its other subroutines for the remainder of the run',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreEffects.registerLingeringEffect(state, side, card, {
        type: ':additional-subroutines',
        duration: ':end-of-run',
        req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          return coreCard.rezzed(tgts[0]) &&
            coreCard.sameCard(tgts[0], coreIce.getCurrentIce(s)) &&
            !coreCard.sameCard(card, tgts[0]);
        }),
        value: { subroutines: [endTheRun] },
      });
    }),
  }],
};

// Seraph
export const seraph: CardDef = {
  title: 'Seraph',
  'on-encounter': {
    prompt: 'Choose one',
    player: ':runner',
    'waiting-prompt': true,
    choices: req(function*(state: State) {
      const hand = (state as any).runner?.hand ?? [];
      return [
        'Lose 3 [Credits]',
        hand.length >= 2 ? 'Suffer 2 net damage' : null,
        !forcedToAvoidTags(state, ':runner' as Side) ? 'Take 1 tag' : null,
      ].filter(Boolean);
    }),
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `force the Runner to ${utils.decapitalize(targets[0])} on encountering it`;
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'Lose 3 [Credits]') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.loseCredits(state, ':runner', eid, 3)], []);
      } else if (targets[0] === 'Suffer 2 net damage') {
        yield wait_for(state, [{ asyncResult: 'result' },
          corePayment.pay(state, ':runner', eid, card, [corePayment.toC('net', 2)])], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreTags.gainTags(state, ':runner', eid, 1, { unpreventable: true })], []);
      }
    }),
  },
  subroutines: [runnerLosesCredits(3), coreDefHelpers.doNetDamage(2), coreDefHelpers.giveTags(1)],
};

// Shadow
export const shadow: CardDef = {
  title: 'Shadow',
  ...wallIce([gainCreditsSub(2), tagTrace(3)]),
};

// Sherlock 1.0
export const sherlock10: CardDef = {
  title: 'Sherlock 1.0',
  subroutines: [traceAbility(4, addProgramToTopOfStack), traceAbility(4, addProgramToTopOfStack)],
  'runner-abilities': [bioraidBreak(1, 1)],
};

// Sherlock 2.0
export const sherlock20: CardDef = (() => {
  const sub = traceAbility(4, {
    choices: { card: (c: Card) => coreCard.installed(c) && coreCard.program(c) },
    label: 'Add 1 installed program to the bottom of the stack',
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `add ${(targets[0] as any)?.title} to the bottom of the stack`;
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      coreMoving.move(state, ':runner', targets[0], ':deck');
    }),
  });
  return {
    title: 'Sherlock 2.0',
    subroutines: [sub, sub, coreDefHelpers.giveTags(1)],
    'runner-abilities': [bioraidBreak(2, 2)],
  };
})();

// Shinobi
export const shinobi: CardDef = {
  title: 'Shinobi',
  'on-rez': takeBadPub,
  subroutines: [
    traceAbility(1, coreDefHelpers.doNetDamage(1)),
    traceAbility(2, coreDefHelpers.doNetDamage(2)),
    traceAbility(3, {
      label: 'Do 3 net damage and end the run',
      msg: 'do 3 net damage and end the run',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDamage.damage(state, side, coreEid.makeEid(state, eid), ':net', 3, { card })], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, side, eid, card)], []);
      }),
    }),
  ],
};

// Shiro
export const shiro: CardDef = {
  title: 'Shiro',
  subroutines: [
    {
      label: 'Rearrange the top 3 cards of R&D',
      msg: 'rearrange the top 3 cards of R&D',
      'change-in-game-state': { silent: true, req: req(function*(state: State) { return ((state as any).corp?.deck?.length ?? 0) > 0; }) },
      async: true,
      'waiting-prompt': true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        const from = ((state as any).corp?.deck ?? []).slice(0, 3);
        if (from.length > 0) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, coreIce.reorderChoice(':corp', ':runner', from, [], from.length, from), card, null)], []);
        } else {
          coreEid.effectCompleted(state, side, eid);
        }
      }),
    },
    {
      label: 'The runner breaches R&D unless the corp pays 1 [Credit]',
      optional: {
        prompt: 'Pay 1 [Credits] to keep the Runner from breaching R&D?',
        'yes-ability': {
          cost: [corePayment.toC('credit', 1)],
          msg: 'keep the Runner from breaching R&D',
        },
        'no-ability': {
          async: true,
          msg: 'make the Runner breach R&D',
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreRuns.breachServer(state, ':runner', eid, [':rd'], { noRoot: true })], []);
          }),
        },
      },
    },
  ],
};

// Sleipnir
export const sleipnir: CardDef = {
  title: 'Sleipnir',
  subroutines: [
    maybeDrawSub(1),
    {
      prompt: 'Shuffle up 1 card from HQ or Archives into R&D?',
      label: 'You may shuffle 1 card from HQ or Archives into R&D',
      'show-discard': true,
      choices: { card: (c: Card) => coreCard.corp(c) && (coreCard.inHand(c) || coreCard.inDiscard(c)) },
      async: true,
      msg: {
        public: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return `shuffle ${coreToString.cardStr(state, targets[0])} into R&D`;
        }),
        corp: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return `shuffle ${coreToString.cardStr(state, targets[0], { maybeVisible: true })} into R&D`;
        }),
      },
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        coreMoving.move(state, ':corp', targets[0], ':deck');
        coreMoving.shuffle(state, ':corp', ':deck');
        coreEid.effectCompleted(state, ':corp', eid);
      }),
    },
    endTheRun,
  ],
};

// Slot Machine
export const slotMachine: CardDef = (() => {
  function effectType(card: Card): string {
    return `:slot-machine-top-3-${(card as any).cid}`;
  }
  function top3(state: State): Card[] {
    return ((state as any).runner?.deck ?? []).slice(0, 3);
  }
  function top3Types(state: State, card: Card, et: string): number {
    const effects = coreEffects.getEffects(state, ':corp', et, card);
    const cards: Card[] = effects?.[0] ?? [];
    return new Set(cards.map((c: Card) => (c as any).type)).size;
  }
  function ability(): any {
    return {
      label: 'Encounter ability (manual)',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        coreMoving.move(state, ':runner', (state as any).runner?.deck?.[0], ':deck');
        const t3 = top3(state);
        const et = effectType(card);
        coreEffects.registerLingeringEffect(state, side, card, {
          type: et,
          duration: ':end-of-encounter',
          value: t3,
        });
        coreSay.systemMsg(state, side,
          `uses ${(card as any).title} to put the top card of the stack to the bottom, then reveal ${utils.enumerateStr(t3.map((c: Card) => `${(c as any).title} (${(c as any).type})`))} from the top of the stack`);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRevealing.reveal(state, side, eid, t3)], []);
      }),
    };
  }
  return {
    title: 'Slot Machine',
    'on-encounter': ability(),
    abilities: [ability()],
    subroutines: [
      {
        label: 'Runner loses 3 [Credits]',
        msg: 'force the Runner to lose 3 [Credits]',
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreGaining.loseCredits(state, ':runner', eid, 3)], []);
        }),
      },
      {
        label: 'Gain 3 [Credits]',
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          const et = effectType(card);
          const effects = coreEffects.getEffects(state, ':corp', et, card);
          const cards: Card[] = effects?.[0] ?? [];
          const uniqueTypes = new Set(cards.map((c: Card) => (c as any).type)).size;
          if ((uniqueTypes <= 2 && cards.length === 3) || (uniqueTypes === 1 && cards.length === 2)) {
            coreSay.systemMsg(state, ':corp', `uses ${(card as any).title} to gain 3 [Credits]`);
            yield wait_for(state, [{ asyncResult: 'result' },
              coreGaining.gainCredits(state, ':corp', eid, 3)], []);
          } else {
            coreEid.effectCompleted(state, side, eid);
          }
        }),
      },
      {
        label: 'Place 3 advancement counters',
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          const et = effectType(card);
          const effects = coreEffects.getEffects(state, ':corp', et, card);
          const cards: Card[] = effects?.[0] ?? [];
          const uniqueTypes = new Set(cards.map((c: Card) => (c as any).type)).size;
          if (cards.length === 3 && uniqueTypes === 1) {
            const placeAbility = {
              choices: { card: (c: Card) => coreCard.installed(c) },
              prompt: 'Choose an installed card',
              msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
                return `place 3 advancement counters on ${coreToString.cardStr(s, tgts[0])}`;
              }),
              async: true,
              effect: effect(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreProps.addProp(s, sd, e, tgts[0], ':advance-counter', 3, { placed: true })], []);
              }),
            };
            yield wait_for(state, [{ asyncResult: 'result' },
              coreEngine.resolveAbility(state, side, placeAbility, card, null)], []);
          } else {
            coreEid.effectCompleted(state, side, eid);
          }
        }),
      },
    ],
  };
})();

// Snoop
export const snoop: CardDef = {
  title: 'Snoop',
  'on-encounter': {
    msg: msg(function(state: State) {
      return `reveal ${utils.enumerateCards((state as any).runner?.hand ?? [], { sorted: true })} from the grip`;
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRevealing.reveal(state, side, eid, (state as any).runner?.hand ?? [])], []);
    }),
  },
  abilities: [{
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.getCounters(card, ':power') > 0;
    }),
    'change-in-game-state': { req: req(function*(state: State) { return ((state as any).runner?.hand?.length ?? 0) > 0; }) },
    cost: [corePayment.toC('power', 1)],
    label: 'Reveal all cards in the grip and trash 1 card',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const trashAbility = coreRevealing.withRevealedHand(':runner', { eventSide: ':corp' }, {
        prompt: 'Choose a card to trash',
        req: req(function*(s: State) { return ((s as any).runner?.hand?.length ?? 0) > 0; }),
        choices: { card: (c: Card) => coreCard.inHand(c) && coreCard.runner(c) },
        async: true,
        msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          return `trash ${(tgts[0] as any)?.title} from the Grip`;
        }),
        effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          yield wait_for(s, [{ asyncResult: 'result' },
            coreMoving.trash(s, sd, e, tgts[0], { causeCard: c })], []);
        }),
      });
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, trashAbility, card, null)], []);
    }),
  }],
  subroutines: [traceAbility(3, gainPowerCounter)],
};

// Snowflake
export const snowflake: CardDef = {
  title: 'Snowflake',
  subroutines: [doPsi(endTheRun)],
};

// Sorocaban Blade
export const sorocabanBlade: CardDef = {
  title: 'Sorocaban Blade',
  events: [
    {
      event: ':corp-trash',
      silent: true,
      'once-per-instance': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return !!coreIce.getCurrentEncounter(state) &&
          (targets as any[]).some((t: any) => coreCard.runner(t.card) && coreCard.installed(t.card));
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        coreCard.updateCard(state, side, Object.assign({}, card, { special: Object.assign({}, (card as any).special, { sorocabanBlade: true }) }));
      }),
    },
    {
      event: ':end-of-encounter',
      silent: true,
      req: req(function*() { return true; }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        coreCard.updateCard(state, side, Object.assign({}, card, { special: Object.assign({}, (card as any).special, { sorocabanBlade: undefined }) }));
      }),
    },
  ],
  subroutines: [
    trashResourceSub,
    Object.assign({}, trashHardwareSub, {
      'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return !(card as any)?.special?.sorocabanBlade;
      }) },
    }),
    Object.assign({}, trashProgramSub, {
      'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return !(card as any)?.special?.sorocabanBlade;
      }) },
    }),
  ],
};

// Special Offer
export const specialOffer: CardDef = {
  title: 'Special Offer',
  subroutines: [{
    label: 'Gain 5 [Credits] and trash this ice',
    msg: 'gain 5 [Credits] and trash itself',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, ':corp', coreEid.makeEid(state, eid), 5)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trash(state, ':corp', coreEid.makeEid(state, eid), card, { cause: ':subroutine' })], []);
      coreRuns.encounterEnds(state, side, eid);
    }),
  }],
};

// Spiderweb
export const spiderweb: CardDef = {
  title: 'Spiderweb',
  subroutines: [endTheRun, endTheRun, endTheRun],
};

// Starlit Knight
export const starlitKnight: CardDef = {
  title: 'Starlit Knight',
  'on-encounter': {
    interactive: req(function*() { return true; }),
    req: req(function*(state: State) { return coreThreat.threatLevel(4, state); }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const subs = utils.sumTagEffects(state);
      coreEffects.registerLingeringEffect(state, side, card, {
        type: ':additional-subroutines',
        duration: ':end-of-run',
        req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) { return coreCard.sameCard(card, tgts[0]); }),
        value: req(function*() { return { subroutines: Array(subs).fill(endTheRun) }; }),
      });
    }),
  },
  subroutines: [coreDefHelpers.giveTags(1), coreDefHelpers.giveTags(1)],
};

// Stavka
export const stavka: CardDef = {
  title: 'Stavka',
  'on-rez': {
    optional: {
      prompt: 'Trash another card to give Stavka +5 strength?',
      'waiting-prompt': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return corePayment.canPay(state, side,
          Object.assign({}, eid, { source: card, sourceType: ':ability' }), card, null,
          [corePayment.toC('trash-other-installed', 1)]);
      }),
      'yes-ability': {
        prompt: 'Choose another installed card to trash',
        cost: [corePayment.toC('trash-other-installed', 1)],
        msg: 'give itself +5 strength for the remainder of the run',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          if ((state as any).run) {
            coreEffects.registerLingeringEffect(state, side, card, {
              type: ':ice-strength',
              duration: ':end-of-run',
              req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) { return coreCard.sameCard(tgts[0], card); }),
              value: 5,
            });
            coreIce.updateIceStrength(state, side, card);
          }
        }),
      },
    },
  },
  subroutines: [trashProgramSub, trashProgramSub],
};

// Surveyor
export const surveyor: CardDef = {
  title: 'Surveyor',
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card) {
    return 2 * ((coreServers.cardToServer(state, card)?.ices ?? []).length);
  }))],
  'x-fn': req(function*(state: State, side: Side, eid: EID, card: Card) {
    return 2 * ((coreServers.cardToServer(state, card)?.ices ?? []).length);
  }),
  subroutines: [
    {
      label: 'Trace X - Give the Runner 2 tags',
      trace: {
        base: req(function*(state: State, side: Side, eid: EID, card: Card) {
          return 2 * ((coreServers.cardToServer(state, card)?.ices ?? []).length);
        }),
        label: 'Give the Runner 2 tags',
        successful: coreDefHelpers.giveTags(2),
      },
    },
    {
      label: 'Trace X - End the run',
      trace: {
        base: req(function*(state: State, side: Side, eid: EID, card: Card) {
          return 2 * ((coreServers.cardToServer(state, card)?.ices ?? []).length);
        }),
        label: 'End the run',
        successful: endTheRun,
      },
    },
  ],
};

// Susanoo-no-Mikoto
export const susanooNoMikoto: CardDef = {
  title: 'Susanoo-no-Mikoto',
  subroutines: [{
    async: true,
    'change-in-game-state': {
      silent: true,
      req: req(function*(state: State) {
        return !!(state as any).run && (state as any).run?.server?.[0] !== ':discard';
      }),
    },
    msg: 'make the Runner continue the run on Archives',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const run = (state as any).run;
      const lingering = coreEffects.registerLingeringEffect(state, side, card, {
        type: ':cannot-jack-out',
        value: true,
        duration: ':end-of-run',
      });
      coreEvents.registerEvents(state, side, card, [{
        event: ':encounter-ice',
        duration: ':end-of-run',
        'unregister-once-resolved': true,
        effect: req(function*(s: State, sd: Side) {
          coreEffects.unregisterEffectByUuid(s, sd, lingering);
        }),
      }]);
      if (run && (run.encounters ?? []).length === 1 && run.phase !== ':success') {
        coreRuns.redirectRun(state, side, 'Archives', ':approach-ice');
        coreRuns.encounterEnds(state, side, eid);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  }],
};

// Swarm
export const swarm: CardDef = (() => {
  const sub: any = {
    player: ':runner',
    async: true,
    label: 'Trash a program',
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return [
        'The Corp trashes a program',
        corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 3)]) ? 'Pay 3 [Credits]' : null,
      ].filter(Boolean);
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'Pay 3 [Credits]') {
        const result: any = yield wait_for(state, [{ asyncResult: 'result' },
          corePayment.pay(state, ':runner', coreEid.makeEid(state, eid), card, [corePayment.toC('credit', 3)])], []);
        coreSay.systemMsg(state, ':runner', result?.msg ?? '');
        coreEid.effectCompleted(state, side, eid);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, ':corp', trashProgramSub, card, null)], []);
      }
    }),
  };
  return Object.assign({}, heroToHero(sub), { title: 'Swarm', 'on-rez': takeBadPub });
})();

// Swordsman
export const swordsman: CardDef = {
  title: 'Swordsman',
  'static-abilities': [{
    type: ':cannot-break-subs-on-ice',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const context = targets[0];
      return coreCard.sameCard(card, context?.ice) && coreCard.hasSubtype(context?.icebreaker, 'AI');
    }),
    value: true,
  }],
  subroutines: [
    {
      async: true,
      prompt: 'Choose an AI program to trash',
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return `trash ${(targets[0] as any)?.title}`; }),
      label: 'Trash an AI program',
      'change-in-game-state': { silent: true, req: req(function*(state: State) {
        return coreBoard.allInstalled(state, ':runner').some((c: Card) => coreCard.program(c) && coreCard.hasSubtype(c, 'AI'));
      }) },
      choices: { card: (c: Card) => coreCard.installed(c) && coreCard.program(c) && coreCard.hasSubtype(c, 'AI') },
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
      }),
    },
    coreDefHelpers.doNetDamage(1),
  ],
};

// SYNC BRE
export const syncBre: CardDef = {
  title: 'SYNC BRE',
  subroutines: [
    tagTrace(4),
    traceAbility(2, {
      label: 'Runner reduces cards accessed by 1 for this run',
      msg: 'reduce cards accessed for this run by 1',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        coreRuns.accessBonus(state, ':total', -1);
      }),
    }),
  ],
};

// Syailendra
export const syailendra: CardDef = {
  title: 'Syailendra',
  advanceable: ':always',
  'on-encounter': Object.assign({}, coreDefHelpers.placeAdvancementCounter(true), {
    interactive: req(function*() { return true; }),
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.getCounters(card, ':advancement') >= 3;
    }),
  }),
  subroutines: [
    coreDefHelpers.placeAdvancementCounter(true),
    runnerLosesCredits(2),
    coreDefHelpers.doNetDamage(1),
  ],
};

// Tapestry
export const tapestry: CardDef = {
  title: 'Tapestry',
  subroutines: [
    runnerLosesClick,
    maybeDrawSub(1),
    {
      req: req(function*(state: State) { return ((state as any).corp?.hand?.length ?? 0) > 0; }),
      prompt: 'Choose a card in HQ to move to the top of R&D',
      choices: { card: (c: Card) => coreCard.inHand(c) && coreCard.corp(c) },
      msg: 'add 1 card in HQ to the top of R&D',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        coreMoving.move(state, side, targets[0], ':deck', { front: true });
      }),
    },
  ],
};

// Tatu-Bola
export const tatuBola: CardDef = {
  title: 'Tatu-Bola',
  events: [{
    event: ':pass-ice',
    interactive: req(function*(state: State) { return !!(state as any).run; }),
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(targets[0]?.ice, card);
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const iceInHand = ((state as any).corp?.hand ?? []).filter((c: Card) => coreCard.ice(c));
      let innerAbility: any;
      if (iceInHand.length > 0) {
        innerAbility = {
          optional: {
            prompt: msg(function(s: State) { return `Gain 4 [Credits] and swap ${coreToString.cardStr(s, card)} with a piece of ice in HQ?`; }),
            'waiting-prompt': true,
            'no-ability': { msg: 'decline to install a card' },
            'yes-ability': {
              prompt: 'Choose a piece of ice',
              'waiting-prompt': true,
              choices: req(function*(s: State) { return ((s as any).corp?.hand ?? []).filter((c: Card) => coreCard.ice(c)); }),
              async: true,
              effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreCard.swapCardsAsync(s, sd, coreEid.makeEid(s, e), tgts[0], coreCard.getCard(s, card))], []);
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreGaining.gainCredits(s, ':corp', e, 4)], []);
              }),
              msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
                return `swap ${coreToString.cardStr(s, card)} with a piece of ice from HQ and gain 4 [Credits]`;
              }),
            },
          },
        };
      } else {
        innerAbility = {
          prompt: 'You have no ice', choices: ['OK'], 'waiting-prompt': true, msg: 'decline to install a card',
        };
      }
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, innerAbility, card, null)], []);
    }),
  }],
  subroutines: [endTheRun],
};

// Taurus
export const taurus: CardDef = {
  title: 'Taurus',
  ...constellationIce(trashHardwareSub),
};

// Thimblerig
export const thimblerig: CardDef = (() => {
  function ability(): any {
    return {
      interactive: req(function*(state: State) { return !!(state as any).run; }),
      skippable: true,
      optional: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const installed = coreBoard.allInstalled(state, ':corp').filter((c: Card) => coreCard.ice(c));
          const inRun = !!(state as any).run;
          return installed.length >= 2 && (!inRun || coreCard.sameCard(targets[0]?.ice, card));
        }),
        prompt: msg(function(state: State, side: Side, eid: EID, card: Card) {
          return `Swap ${coreToString.cardStr(state, card)} with another ice?`;
        }),
        'yes-ability': {
          prompt: 'Choose a piece of ice to swap Thimblerig with',
          choices: { card: (c: Card) => coreCard.ice(c), 'not-self': true },
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            coreIce.swapIce(state, side, card, targets[0]);
          }),
          msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            return `swap ${coreToString.cardStr(state, card)} with ${coreToString.cardStr(state, targets[0])}`;
          }),
        },
      },
    };
  }
  return {
    title: 'Thimblerig',
    events: [
      Object.assign({}, ability(), { event: ':pass-ice' }),
      Object.assign({}, ability(), { event: ':corp-turn-begins' }),
    ],
    subroutines: [endTheRun],
  };
})();

// Thoth
export const thoth: CardDef = {
  title: 'Thoth',
  'on-encounter': coreDefHelpers.giveTags(1),
  subroutines: [
    traceAbility(4, {
      label: 'Do 1 net damage for each Runner tag',
      async: true,
      msg: msg(function(state: State) { return `do ${utils.countTags(state)} net damage`; }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDamage.damage(state, side, eid, ':net', utils.countTags(state), { card })], []);
      }),
    }),
    traceAbility(4, {
      label: 'Runner loses 1 [Credits] for each tag',
      async: true,
      msg: msg(function(state: State) { return `force the Runner to lose ${utils.countTags(state)} [Credits]`; }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.loseCredits(state, ':runner', eid, utils.countTags(state))], []);
      }),
    }),
  ],
};

// Tithe
export const tithe: CardDef = {
  title: 'Tithe',
  subroutines: [coreDefHelpers.doNetDamage(1), gainCreditsSub(1)],
};

// Tithonium
export const tithonium: CardDef = {
  title: 'Tithonium',
  'alternative-cost': [corePayment.toC('forfeit', 1)],
  'cannot-host': true,
  subroutines: [
    trashProgramSub,
    trashProgramSub,
    {
      label: 'Trash a resource and end the run',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        const resources = coreBoard.allInstalled(state, ':runner').filter((c: Card) => coreCard.resource(c));
        let trashedCard: Card | null = null;
        if (resources.length > 0) {
          const trashAbility = {
            req: req(function*() { return resources.length > 0; }),
            async: true,
            choices: { all: true, card: (c: Card) => coreCard.installed(c) && coreCard.resource(c) },
            effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
              yield wait_for(s, [{ asyncResult: 'result' },
                coreMoving.trash(s, sd, coreEid.makeEid(s, e), tgts[0], { cause: ':subroutine' })], []);
              coreEid.completeWithResult(s, sd, e, tgts[0]);
            }),
          };
          trashedCard = yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, trashAbility, card, null)], []);
        }
        coreSay.systemMsg(state, side,
          `uses ${(card as any).title} to ${trashedCard ? `trash ${(trashedCard as any).title} and ends the run` : 'end the run'}`);
        yield wait_for(state, [{ asyncResult: 'result' }, coreRuns.endRun(state, side, eid, card)], []);
      }),
    },
  ],
};

// TL;DR
export const tldr: CardDef = {
  title: 'TL;DR',
  subroutines: [{
    label: 'Duplicate each subroutine on a piece of ice',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreEvents.registerEvents(state, side, card, [{
        event: ':encounter-ice',
        duration: ':end-of-run',
        'unregister-once-resolved': true,
        msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          return `duplicate each subroutine on ${(tgts[0]?.ice as any)?.title}`;
        }),
        effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          const t = tgts[0]?.ice;
          coreEffects.registerLingeringEffect(s, sd, c, {
            type: ':tldr-effect',
            duration: ':end-of-encounter',
            value: 1,
            req: req(function*(s2: State, sd2: Side, e2: EID, c2: Card, tgts2: any[]) {
              return coreCard.sameCard(t, tgts2[0]);
            }),
          });
        }),
      }]);
    }),
  }],
};

// TMI
export const tmi: CardDef = {
  title: 'TMI',
  'on-rez': {
    trace: {
      base: 2,
      msg: 'keep TMI rezzed',
      label: 'Keep TMI rezzed',
      unsuccessful: {
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreRezzing.derez(state, side, eid, card)], []);
        }),
      },
    },
  },
  subroutines: [endTheRun],
};
