import type { State, Side, Card, EID, CardDef } from '../../types';
import * as coreAccess from '../core/access';
import * as coreBadPublicity from '../core/bad_publicity';
import * as coreBoard from '../core/board';
import * as coreCard from '../core/card';
import * as coreChooseOne from '../core/choose_one';
import * as coreCostFns from '../core/cost_fns';
import * as coreDamage from '../core/damage';
import * as coreDefHelpers from '../core/def_helpers';
import * as coreDrawing from '../core/drawing';
import * as coreEffects from '../core/effects';
import * as coreEid from '../core/eid';
import * as coreEngine from '../core/engine';
import * as coreEvents from '../core/events';
import * as coreExpose from '../core/expose';
import * as coreFlags from '../core/flags';
import * as coreGaining from '../core/gaining';
import * as coreHandSize from '../core/hand_size';
import * as coreIce from '../core/ice';
import * as coreInstalling from '../core/installing';
import * as coreLink from '../core/link';
import * as coreMark from '../core/mark';
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
import * as coreShuffling from '../core/shuffling';
import * as coreTags from '../core/tags';
import * as coreToString from '../core/to_string';
import * as coreToasts from '../core/toasts';
import * as coreUpdate from '../core/update';
import * as utils from '../utils';
import { req, effect, msg, wait_for, continue_ability, forms } from '../macros';

// __cardScopeShim: 'state', 'target', etc. are referenced at CardDef literal
// scope in cards that were not yet rewritten to use req/effect callbacks.
// These ambient names keep the file compiling; the affected predicates were
// already broken at runtime (state was never defined in the closure either)
// and need per-card rewrites to use state-aware req/effect callbacks.
const state: any = undefined as any;
const target: any = undefined as any;

function draftPointsTarget(state: State): void {
  const s: any = state as any;
  if (s?.runner?.agendaPointReq === 7) s.runner.agendaPointReq = 6;
  if (s?.corp?.agendaPointReq === 7) s.corp.agendaPointReq = 6;
}

function hasMostFaction(state: State, side: Side, faction: string): boolean {
  const cards = coreBoard.allActiveInstalled(state, side) || [];
  const counts: Record<string, number> = {};
  for (const c of cards) {
    const f = (c as any)?.faction;
    if (typeof f === 'string') counts[f] = (counts[f] || 0) + 1;
  }
  let max = 0;
  let best: string | null = null;
  let tied = false;
  for (const [f, n] of Object.entries(counts)) {
    if (n > max) { max = n; best = f; tied = false; }
    else if (n === max) { tied = true; }
  }
  if (tied) best = null;
  return best === faction;
}

/** René "Loup" Arcemont: Party Animal */
export const card_ReneLoupArcemont_PartyAnimal: CardDef = {
  title: 'René "Loup" Arcemont: Party Animal',
  events: [{
    event: 'runner-trash',
    req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      if (!(targets as any)[0]?.context?.accessed) return false;
      return coreEvents.firstEvent(state, side, 'runner-trash', (ctx: any) => ctx.some((t: any) => t.context?.accessed));
    }),
    async: true, msg: 'gain 1 [Credits] and draw 1 card',
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, 'runner', 1, { suppressCheckpoint: true })], []);
      coreGaining.gainCredits(state, 'runner', eid, 1);
    })
  }]
};

/** Rielle "Kit" Peddler: Transhuman */
export const card_RielleKitPeddler_Transhuman: CardDef = {
  title: 'Rielle "Kit" Peddler: Transhuman',
  events: [{
    event: 'encounter-ice',
    req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      return coreEvents.firstEvent(state, side, 'encounter-ice');
    }),
    msg: msg('make ', (c: Card) => c.title || '', ' gain Code Gate until the end of the run'),
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const ice = context.ice ? coreCard.getCard(state, context.ice) : null;
      coreEffects.registerLingeringEffect(card, {
        type: 'gain-subtype', duration: 'end-of-run',
        req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { return coreCard.sameCard(ice, targets[0]); }),
        value: 'Code Gate'
      });
    })
  }]
};

/** Ryō "Phoenix" Ōno: Out of the Ashes */
export const card_RyoPhoenixOno_OutOfTheAshes: CardDef = {
  title: 'Ryō "Phoenix" Ōno: Out of the Ashes',
  events: [{
    event: 'successful-run',
    req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const fired = context['subroutines-fired'] || 0;
      if (fired <= 0) return false;
      return coreEvents.firstEvent(state, side, 'successful-run', (ctx: any) => (ctx[0]?.['subroutines-fired'] || 0) > 0);
    }),
    interactive: true, automatic: 'force-discard',
    msg: 'gain 1 [Credits]', async: true, once: 'per-turn',
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, 1)], []);
      if ((state.corp?.hand || []).length === 0) return coreEid.effectCompleted(state, side, eid);
      continue_ability(state, 'corp', {
        displaySide: 'corp', waitingPrompt: true, player: 'corp',
        cost: [corePayment.toC('trash-from-hand', 1)], msg: ':cost'
      }, card, null);
    })
  }]
};

/** Saraswati Mnemonics: Endless Exploration */
export const card_SaraswatiMnemonics_EndlessExploration: CardDef = {
  title: 'Saraswati Mnemonics: Endless Exploration',
  abilities: [{
    action: true, async: true, label: 'Install a card from HQ',
    cost: [corePayment.toC('click', 1), corePayment.toC('credit', 1)],
    changeInGameState: { req: req(function*(state: any): Generator<any, any, any> { return (state.corp?.hand || []).length > 0; }) },
    prompt: 'Choose a card to install from HQ',
    choices: { card: (c: Card) => (coreCard.asset(c) || coreCard.agenda(c) || coreCard.upgrade(c)) && coreCard.corp(c) && coreCard.inHand(c) },
    msg: msg('install a card in a remote server and place 1 advancement counter on it'),
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      const chosen = targets[0];
      continue_ability(state, side, {
        prompt: 'Choose a remote server',
        choices: [...coreBoard.getRemoteNames(state), 'New remote'],
        async: true,
        effect: effect(function*(state2: any, side2: any, eid2: any, card2: any, t2: any): Generator<any, any, any> {
          const tgtcid = chosen.cid;
          coreFlags.registerPersistentFlag!(state2, side2, card2, 'can-rez', (st: any, _: any, c: any) => c.cid === tgtcid ? false : true);
          coreFlags.registerTurnFlag!(state2, side2, card2, 'can-score', (st: any, _: any, c: any) => {
            if (c.cid !== tgtcid) return true;
            const req = coreCard.getAdvancementRequirement(c);
            const adv = coreCard.getCounters(c, 'advancement');
            if (req != null && adv != null && req > adv) {
              coreToasts.toast(st, 'corp', 'Cannot score due to Saraswati Mnemonics: Endless Exploration.', 'warning');
              return false;
            }
            return true;
          });
          coreInstalling.corpInstall(state2, side2, eid2, chosen, t2[0], { counters: { 'advance-counter': 1 }, msgKeys: { 'install-source': card2, 'display-origin': true } });
        })
      }, card, null);
    })
  }],
  events: [{
    event: 'corp-turn-begins', silent: true,
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      coreFlags.clearPersistentFlag!(state, side, card, 'can-rez');
    })
  }]
};

/** Sebastião Souza Pessoa: Activist Organizer */
export const card_SebastiaoSouzaPessoa_ActivistOrganizer: CardDef = {
  title: 'Sebastião Souza Pessoa: Activist Organizer',
  staticAbilities: [{
    type: 'basic-ability-additional-trash-cost',
    req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      return coreCard.resource(targets[0]) && coreCard.hasSubtype(targets[0], 'Connection') && side === 'corp';
    }),
    value: [corePayment.toC('trash-from-hand', 1)]
  }],
  events: [{
    event: 'runner-gain-tag', async: true,
    req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      if (coreInstalling.installLocked(state, side)) return false;
      const context = (targets as any)[0]?.context || {};
      return context.amount === (coreTags.countTags(state) || 0);
    }),
    prompt: 'Choose a connection to install, paying 2 [Credits] less',
    choices: {
      req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
        const cost = coreCostFns.installCost(state, side, targets[0], { 'cost-bonus': -2 }) - 2;
        return coreCard.hasSubtype(targets[0], 'Connection') && coreCard.resource(targets[0]) &&
          coreCard.inHandStar(state, targets[0]) &&
          corePayment.canPay(state, side, { ...eid, source: card, sourceType: 'runner-install' }, targets[0], null, [corePayment.toC('credit', cost)]);
      })
    },
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      coreInstalling.runnerInstall(state, side, { ...eid, source: card, sourceType: 'runner-install' }, targets[0], {
        'cost-bonus': -2, msgKeys: { 'display-origin': true, 'install-source': card }
      });
    })
  }]
};

/** Seidr Laboratories: Destiny Defined */
export const card_SeidrLaboratories_DestinyDefined: CardDef = {
  title: 'Seidr Laboratories: Destiny Defined',
  implementation: 'Manually triggered',
  abilities: [{
    req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      const run = (state as any).run;
      return run && (state.corp?.discard || []).length > 0;
    }),
    label: 'add card from Archives to R&D during a run', once: 'per-turn',
    prompt: 'Choose a card to add to the top of R&D', showDiscard: true,
    choices: { card: (c: Card) => coreCard.corp(c) && coreCard.inDiscard(c) },
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      coreMoving.move(targets[0], 'deck', { front: true });
    }),
    msg: msg('add ', (c: Card) => c.seen ? c.title : 'a card', ' to the top of R&D')
  }]
};

/** Silhouette: Stealth Operative */
export const card_Silhouette_StealthOperative: CardDef = {
  title: 'Silhouette: Stealth Operative',
  events: [{
    event: 'successful-run', skippable: true,
    interactive: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => !coreCard.rezzed(c));
    }),
    async: true,
    req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      return context.targetServer === 'hq' && coreEvents.firstSuccessfulRunOnServer(state, 'hq');
    }),
    choices: { card: (c: Card) => coreCard.installed(c) && !coreCard.rezzed(c) },
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { coreExpose.expose(eid, [targets[0]]); })
  }]
};

/** Skorpios Defense Systems: Persuasive Power */
export const card_SkorpiosDefenseSystems_PersuasivePower: CardDef = {
  title: 'Skorpios Defense Systems: Persuasive Power',
  implementation: 'Switch between Manual, "Smart", and Automatic resolution by using the ability on the card',
  events: [
    {
      event: 'pre-first-turn',
      req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { return side === 'corp'; }),
      effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
        coreUpdate.update!(state, side, { ...card, special: { ...(card as any).special, 'resolution-mode': 'Smart' } });
        coreToasts.toast(state, 'corp', 'Set Skorpios resolution to Smart mode');
        coreUpdate.update!(state, side, { ...coreCard.getCard(state, card), 'card-target': 'Smart' });
      })
    },
    {
      event: 'pre-trash-interrupt',
      once: 'per-turn', player: 'corp', waitingPrompt: true,
      req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
        const resType = (coreCard.getCard(state, card) as any)?.['card-target'];
        const validCards = (coreEvents.turnEvents(state, 'runner', 'damage') || []).filter((e: any) => e[0]?.card ? coreCard.runner(coreCard.getCard(state, e[0].card)) : false);
        if (resType === 'Automatic') return true;
        if (resType === 'Smart') {
          const relevantCards = ['Labor Rights', 'The Price'];
          const run = (state as any).runner;
          const playArea = run?.playArea || [];
          if (playArea.some((c: Card) => c.title && relevantCards.includes(c.title))) return true;
          const bufferDrive = (coreBoard.allActiveInstalled(state, 'runner') || []).some((c: Card) => c.title === 'Buffer Drive');
          if (bufferDrive) {
            const relevantTrashed = ['I\'ve Had Worse', 'Strike Fund', 'Steelskin Scarring', 'Crowdfunding'];
            const context = (targets as any)[0]?.context || {};
            const contextCards = context.cards || [];
            if (contextCards.some((c: any) => c.title && relevantTrashed.includes(c.title))) return true;
            if (contextCards.some((c: any) => c.type === 'program')) return true;
          }
          return validCards.some((c: Card) => coreCard.program(c));
        }
        return false;
      }),
      prompt: 'Remove a card from the game?',
      choices: (state: any, side: any, eid: any, card: any, targets: any) => corePrompts.cancellable((targets as any)[0]?.cards || []),
      msg: msg('remove ', (c: Card) => c.title || '', ' from the game'),
      async: true,
      effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
        coreMoving.move(state, 'runner', targets[0], 'rfg');
        return coreEid.effectCompleted(state, side, eid);
      })
    }
  ],
  abilities: [{
    label: 'Set resolution mode',
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      const helper = coreChooseOne.chooseOneHelper({ optional: true, label: 'Set resolution mode' },
        ['Manual', 'Smart', 'Automatic'].map((x: string) => ({ option: x, ability: { effect: effect(function*(st: any, s: any, e: any, c: any, t: any): Generator<any, any, any> {
          coreUpdate.update!(st, s, { ...c, special: { ...(c as any).special, 'resolution-mode': x } });
          coreToasts.toast(st, 'corp', `Set Skorpios resolution to ${x} mode`);
          coreUpdate.update!(st, s, { ...coreCard.getCard(st, c), 'card-target': x });
        }) } })));
      continue_ability(state, side, helper, card, null);
    })
  }, {
    label: 'Remove a card in the Heap that was just trashed from the game',
    waitingPrompt: true, prompt: 'Choose a card in the Heap that was just trashed', once: 'per-turn',
    choices: (state: any) => corePrompts.cancellable((state.runner?.discard || []) as Card[]),
    msg: msg('remove ', (c: Card) => c.title || '', ' from the game'),
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { coreMoving.move(state, 'runner', targets[0], 'rfg'); })
  }]
};

/** Spark Agency: Worldswide Reach */
export const card_SparkAgency_WorldswideReach: CardDef = {
  title: 'Spark Agency: Worldswide Reach',
  events: [{
    event: 'rez',
    req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
      return contextCard && coreCard.hasSubtype(contextCard, 'Advertisement') &&
        coreEvents.firstEvent(state, 'corp', 'rez', (ctx: any) => {
          const c = ctx.card ? coreCard.getCard(state, ctx.card) : null;
          return c && coreCard.hasSubtype(c, 'Advertisement');
        });
    }),
    async: true, effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { coreGaining.loseCredits('runner', eid, 1); }),
    msg: 'make the Runner lose 1 [Credits]'
  }]
};

/** Sportsmetal: Go Big or Go Home */
export const card_Sportsmetal_GoBigOrGoHome: CardDef = {
  title: 'Sportsmetal: Go Big or Go Home',
  events: [
    {
      event: 'agenda-scored',
      prompt: 'Choose one', waitingPrompt: true, player: 'corp',
      choices: ['Gain 2 [Credits]', 'Draw 2 cards'],
      msg: msg(function*(t: any): Generator<any, any, any> { return (t || '').charAt(0).toLowerCase() + (t || '').slice(1); }),
      async: true, interactive: true,
      effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
        if (targets[0] === 'Gain 2 [Credits]') coreGaining.gainCredits(state, 'corp', eid, 2);
        else coreDrawing.draw(state, 'corp', eid, 2);
      })
    },
    {
      event: 'agenda-stolen',
      prompt: 'Choose one', waitingPrompt: true, player: 'corp',
      choices: ['Gain 2 [Credits]', 'Draw 2 cards'],
      msg: msg(function*(t: any): Generator<any, any, any> { return (t || '').charAt(0).toLowerCase() + (t || '').slice(1); }),
      async: true, interactive: true,
      effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
        if (targets[0] === 'Gain 2 [Credits]') coreGaining.gainCredits(state, 'corp', eid, 2);
        else coreDrawing.draw(state, 'corp', eid, 2);
      })
    }
  ]
};

/** SSO Industries: Fueling Innovation */
export const card_SSOIndustries_FuelingInnovation: CardDef = {
  title: 'SSO Industries: Fueling Innovation',
  events: [{
    event: 'corp-turn-ends',
    optional: {
      req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
        const installed = (coreBoard.allInstalled(state, 'corp') || []).filter((c: Card) => coreCard.agenda(c) && coreCard.faceup(c));
        const selectableIce = (coreBoard.allInstalled(state, 'corp') || []).filter((c: Card) =>
          coreCard.ice(c) && coreCard.installed(c) && (coreCard.getCounters(c, 'advancement') || 0) === 0);
        return installed.length > 0 && selectableIce.length > 0;
      }),
      waitingPrompt: true, prompt: 'Place advancement counters on an installed piece of ice?',
      autoResolve: coreOptional.getAutoresolve('auto-fire'),
      yesAbility: {
        async: true,
        effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
          const installed = (coreBoard.allInstalled(state, 'corp') || []).filter((c: Card) => coreCard.agenda(c) && coreCard.faceup(c));
          const agendaPoints = installed.reduce((sum, c) => sum + (c.agendapoints || 0), 0);
          continue_ability(state, side, {
            prompt: `Choose a piece of ice with no advancement counters to place ${utils.quantify(agendaPoints, 'advancement counter')} on`,
            choices: { card: (c: Card) => coreCard.ice(c) && coreCard.installed(c) && (coreCard.getCounters(c, 'advancement') || 0) === 0 },
            msg: msg('place ', (n: number) => utils.quantify(n, 'advancement counter'), ' on ', (c: Card) => coreToString.cardStr(state, c) || ''),
            async: true,
            effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
              coreProps.addProp(eid, targets[0], 'advance-counter', agendaPoints, { placed: true });
            })
          }, card, null);
        })
      }
    }
  }],
  abilities: [{ effect: effect(function*(state: any): Generator<any, any, any> { coreOptional.setAutoresolve('auto-fire', 'SSO Industries: Fueling Innovation'); }) }]
};

/** Steve Cambridge: Master Grifter */
export const card_SteveCambridge_MasterGrifter: CardDef = {
  title: 'Steve Cambridge: Master Grifter',
  events: [{
    event: 'successful-run', skippable: true,
    optional: {
      req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
        const context = (targets as any)[0]?.context || {};
        return context.targetServer === 'hq' && coreEvents.firstSuccessfulRunOnServer(state, 'hq') &&
          (state.runner?.discard || []).length >= 2 && !coreFlags.zoneLocked?.(state, 'runner', 'discard');
      }),
      prompt: 'Choose 2 cards in the heap?',
      autoResolve: coreOptional.getAutoresolve('auto-fire'),
      interactive: true,
      yesAbility: {
        async: true, prompt: 'Choose 2 cards in the heap', showDiscard: true,
        choices: { max: 2, all: true, card: (c: Card) => coreCard.inDiscard(c) && coreCard.runner(c) },
        effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
          const c1 = targets[0], c2 = targets[1];
          continue_ability(state, side, {
            waitingPrompt: true, prompt: 'Choose which card to remove from the game', player: 'corp',
            choices: [c1, c2],
            msg: msg(function*(chosen: Card, other: Card): Generator<any, any, any> {
              return `add ${other.title} from the heap to the grip. Corp removes ${chosen.title} from the game`;
            }),
            effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
              const chosen = targets[0];
              const other = (chosen === c1) ? c2 : c1;
              coreMoving.move(state, 'runner', chosen, 'rfg');
              coreMoving.move(state, 'runner', other, 'hand');
            })
          }, card, null);
        })
      }
    }
  }],
  abilities: [{ effect: effect(function*(state: any): Generator<any, any, any> { coreOptional.setAutoresolve('auto-fire', 'Steve Cambridge: Master Grifter'); }) }]
};

/** Strategic Innovations: Future Forward */
export const card_StrategicInnovations_FutureForward: CardDef = {
  title: 'Strategic Innovations: Future Forward',
  events: [
    { event: 'pre-start-game', effect: effect(function*(state: any): Generator<any, any, any> { draftPointsTarget(state); }) },
    {
      event: 'runner-turn-ends',
      req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
        if (card.disabled || coreEffects.isDisabled(state, side, card)) return false;
        return hasMostFaction(state, 'corp', 'Haas-Bioroid');
      }),
      async: true,
      effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
        if ((state.corp?.discard || []).length === 0) {
          coreShuffling.shuffleCardsIntoDeck!(state, 'corp', card, []);
          return coreEid.effectCompleted(state, side, eid);
        }
        continue_ability(state, side, {
          prompt: 'Choose a card in Archives to shuffle into R&D',
          choices: { card: (c: Card) => coreCard.corp(c) && coreCard.inDiscard(c), all: true },
          player: 'corp', showDiscard: true,
          effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
            coreShuffling.shuffleCardsIntoDeck!(state, 'corp', card, [targets[0]]);
          })
        }, card, null);
      })
    }
  ]
};

/** Sunny Lebeau: Security Specialist */
export const card_SunnyLebeau_SecuritySpecialist: CardDef = { title: 'Sunny Lebeau: Security Specialist' };

/** SYNC: Everything, Everywhere */
export const card_SYNC_Everywhere: CardDef = {
  title: 'SYNC: Everything, Everywhere',
  staticAbilities: [
    {
      type: 'card-ability-cost',
      req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
        return !card['sync-flipped'] && coreCard.sameCard((targets as any)[0], (state.runner as any)?.['basic-action-card']) &&
          (card as any)['ability']?.label === 'Remove 1 tag';
      }),
      value: corePayment.toC('credit', 1)
    },
    {
      type: 'card-ability-cost',
      req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
        return card['sync-flipped'] && coreCard.sameCard((targets as any)[0], (state.corp as any)?.['basic-action-card']) &&
          (card as any)['ability']?.label === 'Trash 1 resource if the Runner is tagged';
      }),
      value: corePayment.toC('credit', -2)
    }
  ],
  abilities: [{
    action: true, cost: [corePayment.toC('click', 1)],
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      if (card['sync-flipped']) {
        coreUpdate.update!(state, side, { ...card, 'sync-flipped': false, face: 'front', code: '09001' });
      } else {
        coreUpdate.update!(state, side, { ...card, 'sync-flipped': true, face: 'back', code: 'sync' });
      }
    }),
    label: 'Flip this identity', msg: msg('flip [their] identity')
  }]
};

/** Synapse Global: Faster than Thought */
export const card_SynapseGlobal_FasterThanThought: CardDef = {
  title: 'Synapse Global: Faster than Thought',
  events: [{
    event: 'runner-lose-tag',
    req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      if (!context.amount || context.amount <= 0) return false;
      return coreEvents.firstEvent(state, side, 'runner-lose-tag', (ctx: any) => (ctx[0]?.context?.amount || 0) > 0);
    }),
    prompt: 'Reveal and install a card from HQ?',
    changeInGameState: { req: req(function*(state: any): Generator<any, any, any> { return (state.corp?.hand || []).length > 0; }), silent: true },
    choices: { req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      return coreCard.corp(targets[0]) && coreCard.inHand(targets[0]) && !coreCard.operation(targets[0]);
    })},
    async: true,
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRevealing.revealLoud(state, side, card, null, [targets[0]])], []);
      coreInstalling.corpInstall(state, side, eid, targets[0], null, { 'ignore-install-cost': true, msgKeys: { 'install-source': card } });
    })
  }],
  abilities: [{
    label: 'Gain 2 [Credits]', action: true, async: true,
    cost: [corePayment.toC('tag', 1), corePayment.toC('click', 1)],
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits(state, side, eid, 2); })
  }]
};

/** Synthetic Systems: The World Re-imagined */
export const card_SyntheticSystems_TheWorldReimagined: CardDef = {
  title: 'Synthetic Systems: The World Re-imagined',
  events: [
    { event: 'pre-start-game', effect: effect(function*(state: any): Generator<any, any, any> { draftPointsTarget(state); }) },
    {
      event: 'corp-turn-begins',
      optional: {
        req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
          return hasMostFaction(state, 'corp', 'Jinteki') &&
            (coreBoard.allInstalled(state, 'corp') || []).filter((c: Card) => coreCard.ice(c)).length >= 2;
        }),
        prompt: 'Swap two ice?', waitingPrompt: true,
        yesAbility: {
          prompt: 'Choose 2 installed pieces of ice to swap', label: 'swap 2 installed pieces of ice',
          choices: { card: (c: Card) => coreCard.installed(c) && coreCard.ice(c), max: 2, all: true },
          once: 'per-turn',
          effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { coreMoving.swapIce(state, side, targets[0], targets[1]); }),
          msg: msg('swap the positions of ', (c: Card) => coreToString.cardStr(state, c) || '', ' and ', (c: Card) => coreToString.cardStr(state, c) || '')
        }
      }
    }
  ],
  flags: { 'corp-phase-12': req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
    const gc = coreCard.getCard(state, card);
    if (gc?.disabled || coreEffects.isDisabled(state, side, card)) return false;
    return hasMostFaction(state, 'corp', 'Jinteki') &&
      (coreBoard.allInstalled(state, 'corp') || []).filter((c: Card) => coreCard.ice(c)).length >= 2;
  })},
  abilities: [{
    prompt: 'Choose 2 installed pieces of ice to swap', label: 'swap 2 installed pieces of ice',
    choices: { card: (c: Card) => coreCard.installed(c) && coreCard.ice(c), max: 2, all: true },
    once: 'per-turn',
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { coreMoving.swapIce(state, side, targets[0], targets[1]); }),
    msg: msg('swap the positions of ', (c: Card) => coreToString.cardStr(state, c) || '', ' and ', (c: Card) => coreToString.cardStr(state, c) || '')
  }]
};

/** Tāo Salonga: Telepresence Magician */
export const card_TaoSalonga_TelepresenceMagician: CardDef = {
  title: 'Tāo Salonga: Telepresence Magician',
  events: [
    {
      event: 'agenda-scored',
      interactive: true,
      changeInGameState: { silent: true, req: req(function*(state: any): Generator<any, any, any> { return (coreBoard.allInstalled(state, 'corp') || []).filter((c: Card) => coreCard.ice(c)).length >= 2; }) },
      optional: {
        prompt: 'Swap 2 pieces of ice?', waitingPrompt: true,
        yesAbility: {
          prompt: 'Choose 2 pieces of ice',
          choices: { req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { return coreCard.installed(targets[0]) && coreCard.ice(targets[0]); }), max: 2, all: true },
          msg: msg('swap the positions of ', (c: Card) => coreToString.cardStr(state, c) || '', ' and ', (c: Card) => coreToString.cardStr(state, c) || ''),
          effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { coreMoving.swapIce(state, side, targets[0], targets[1]); })
        },
        noAbility: { effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { coreSay.systemMsg(`declines to use ${card.title}`); }) }
      }
    },
    {
      event: 'agenda-stolen',
      interactive: true,
      changeInGameState: { silent: true, req: req(function*(state: any): Generator<any, any, any> { return (coreBoard.allInstalled(state, 'corp') || []).filter((c: Card) => coreCard.ice(c)).length >= 2; }) },
      optional: {
        prompt: 'Swap 2 pieces of ice?', waitingPrompt: true,
        yesAbility: {
          prompt: 'Choose 2 pieces of ice',
          choices: { req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { return coreCard.installed(targets[0]) && coreCard.ice(targets[0]); }), max: 2, all: true },
          msg: msg('swap the positions of ', (c: Card) => coreToString.cardStr(state, c) || '', ' and ', (c: Card) => coreToString.cardStr(state, c) || ''),
          effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { coreMoving.swapIce(state, side, targets[0], targets[1]); })
        },
        noAbility: { effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { coreSay.systemMsg(`declines to use ${card.title}`); }) }
      }
    }
  ]
};

/** Tennin Institute: The Secrets Within */
export const card_TenninInstitute_TheSecretsWithin: CardDef = {
  title: 'Tennin Institute: The Secrets Within',
  events: [{
    msg: msg('place 1 advancement token on ', (c: Card) => coreToString.cardStr(state, c) || ''),
    label: 'Place 1 advancement token on a card if the Runner did not make a successful run last turn',
    choices: { card: (c: Card) => coreCard.installed(c) },
    event: 'corp-turn-begins',
    req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { return coreEvents.notLastTurn(state, 'runner', 'successful-run'); }),
    waitingPrompt: true, once: 'per-turn', async: true, interactive: true,
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      coreProps.addProp(eid, targets[0], 'advance-counter', 1, { placed: true });
    })
  }]
};

/** The Catalyst: Convention Breaker */
export const card_TheCatalyst_ConventionBreaker: CardDef = { title: 'The Catalyst: Convention Breaker' };

/** The Collective: Williams, Wu, et al. */
export const card_TheCollective_WilliamsWu: CardDef = {
  title: 'The Collective: Williams, Wu, et al.',
  events: [{
    event: 'action-resolved',
    req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { return side === 'runner'; }),
    silent: true, async: true,
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const currentQueue = (card as any)?.special?.['previous-actions'] || [];
      const filteredContext = { cid: context.card?.cid, idx: context['ability-idx'] };
      if (currentQueue && currentQueue.length > 0 && JSON.stringify(currentQueue[0]) === JSON.stringify(filteredContext)) {
        const newQueue = [...currentQueue, filteredContext];
        coreUpdate.update!(state, side, { ...card, special: { ...(card as any).special, 'previous-actions': newQueue } });
        if (newQueue.length === 3) {
          continue_ability(state, side, { label: 'Manually gain [Click]', once: 'per-turn', msg: msg('gain [Click]'),
            effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { coreGaining.gainClicks(state, side, 1); }) }, card, null);
        }
        return coreEid.effectCompleted(state, side, eid);
      } else {
        coreUpdate.update!(state, side, { ...card, special: { ...(card as any).special, 'previous-actions': [filteredContext] } });
        return coreEid.effectCompleted(state, side, eid);
      }
    })
  }, {
    event: 'runner-turn-begins', silent: true,
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      coreUpdate.update!(state, side, { ...card, special: { ...(card as any).special, 'previous-actions': null } });
    })
  }]
};

/** The Foundry: Refining the Process */
export const card_TheFoundry_RefiningTheProcess: CardDef = {
  title: 'The Foundry: Refining the Process',
  events: [{
    event: 'rez',
    optional: {
      prompt: msg('Add another copy of ', (c: Card) => c.title || '', ' to HQ?'),
      req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
        const context = (targets as any)[0]?.context || {};
        const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
        return contextCard && coreCard.ice(contextCard) && coreEvents.firstEvent(state, 'runner', 'rez', (ctx: any) => {
          const c = ctx.card ? coreCard.getCard(state, ctx.card) : null;
          return c && coreCard.ice(c);
        });
      }),
      yesAbility: {
        effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
          const context = (targets as any)[0]?.context || {};
          const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
          const foundCard = [...(state.corp?.deck || []), ...(state.corp?.playArea || [])].find((c: Card) => c.title === contextCard?.title);
          if (foundCard) {
            coreMoving.move(state, side, foundCard, 'hand');
            coreSay.systemMsg(state, side, `uses ${card.title} to add a copy of ${foundCard.title} to HQ, and shuffle R&D`);
            coreShuffling.shuffle(state, side, 'deck');
          } else {
            coreSay.systemMsg(state, side, 'shuffles R&D');
            coreShuffling.shuffle(state, side, 'deck');
          }
        })
      }
    }
  }]
};

/** The Masque: Cyber General */
export const card_TheMasque_CyberGeneral: CardDef = {
  title: 'The Masque: Cyber General',
  events: [{ event: 'pre-start-game', effect: effect(function*(state: any): Generator<any, any, any> { draftPointsTarget(state); }) }]
};

/** The Outfit: Family Owned and Operated */
export const card_TheOutfit_FamilyOwnedAndOperated: CardDef = {
  title: 'The Outfit: Family Owned and Operated',
  events: [{
    event: 'corp-gain-bad-publicity', msg: 'gain 3 [Credit]', async: true,
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits(eid, 3); })
  }]
};

/** The Professor: Keeper of Knowledge */
export const card_TheProfessor_KeeperOfKnowledge: CardDef = { title: 'The Professor: Keeper of Knowledge' };

/** The Shadow: Pulling the Strings */
export const card_TheShadow_PullingTheStrings: CardDef = {
  title: 'The Shadow: Pulling the Strings',
  events: [{ event: 'pre-start-game', effect: effect(function*(state: any): Generator<any, any, any> { draftPointsTarget(state); }) }]
};

/** The Syndicate: Profit over Principle */
export const card_TheSyndicate_ProfitOverPrinciple: CardDef = { title: 'The Syndicate: Profit over Principle' };

/** The Zwicky Group: Invisible Hands */
export const card_TheZwickyGroup_InvisibleHands: CardDef = {
  title: 'The Zwicky Group: Invisible Hands',
  events: [{
    event: 'corp-credit-gain', async: true,
    req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const source = context.source ? coreCard.getCard(state, context.source) : null;
      return (source && coreCard.agenda(source)) || (source && coreCard.operation(source)) &&
        coreEvents.firstEvent(state, side, 'corp-credit-gain', (ctx: any) => {
          const s = ctx[0]?.source ? coreCard.getCard(state, ctx[0].source) : null;
          return s && (coreCard.agenda(s) || coreCard.operation(s));
        });
    }),
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { coreDrawing.maybeDraw(eid, card, 1); })
  }]
};

/** Thule Subsea: Safety Below */
export const card_ThuleSubsea_SafetyBelow: CardDef = {
  title: 'Thule Subsea: Safety Below',
  events: [{
    event: 'agenda-stolen', async: true,
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      continue_ability(state, side, {
        prompt: 'Choose one', player: 'runner',
        choices: [
          (corePayment.canPay(state, 'runner', eid, card, null, [corePayment.toC('credit', 2), corePayment.toC('click', 1)])) ? 'Pay [Click] and 2 [Credits]' : null,
          'Suffer 1 core damage'
        ].filter(Boolean) as string[],
        async: true, waitingPrompt: true,
        msg: msg(function*(t: string): Generator<any, any, any> {
          if (t === 'Pay [Click] and 2 [Credits]') return 'force the runner to ' + t.toLowerCase();
          return 'do 1 core damage';
        }),
        effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
          if (targets[0] === 'Pay [Click] and 2 [Credits]') {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreEngine.pay(state, side, coreEid.makeEid(state, eid), card, [corePayment.toC('click', 1), corePayment.toC('credit', 2)])], []);
            const asyncResult = (state as any).__lastAsyncResult;
            coreSay.systemMsg(state, side, (asyncResult as any)?.msg || '');
            return coreEid.effectCompleted(state, 'runner', eid);
          }
          coreDamage.damage(state, side, eid, 'brain', 1, { card });
        })
      }, card, null);
    })
  }]
};

/** Thunderbolt Armaments: Peace Through Power */
export const card_ThunderboltArmaments_PeaceThroughPower: CardDef = {
  title: 'Thunderbolt Armaments: Peace Through Power',
  events: [{
    event: 'rez',
    req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      const run = (state as any).run;
      if (!run) return false;
      const context = (targets as any)[0]?.context || {};
      const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
      return contextCard && coreCard.ice(contextCard) &&
        (coreCard.hasSubtype(contextCard, 'AP') || coreCard.hasSubtype(contextCard, 'Destroyer'));
    }),
    msg: msg('give ', (c: Card) => coreToString.cardStr(state, c) || '', ' +1 strength and "End the run unless the Runner trashes 1 of their installed cards" after its other subroutines'),
    async: true,
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const t = context.card ? coreCard.getCard(state, context.card) : null;
      const thunderboltSub: any = {
        player: 'runner', async: true,
        label: 'End the run unless the Runner trashes 1 of their installed cards',
        prompt: 'Choose one', waitingPrompt: true,
        choices: (() => {
          const opts = ['End the run'];
          if (corePayment.canPay(state, 'runner', eid, card, null, [corePayment.toC('trash-installed', 1)])) {
            opts.push(corePayment.costToString(corePayment.toC('trash-installed', 1)) || 'trash-installed');
          }
          return opts;
        })(),
        msg: msg(function*(t: string): Generator<any, any, any> {
          return t === 'End the run' ? 'end the run' : 'force the runner to ' + t.toLowerCase();
        }),
        effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
          if (targets[0] === 'End the run') {
            coreRuns.endRun(state, 'corp', eid, card);
          } else {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreEngine.pay(state, 'runner', coreEid.makeEid(state, eid), card, corePayment.toC('trash-installed', 1))], []);
            const asyncResult = (state as any).__lastAsyncResult;
            if (asyncResult) {
              coreSay.systemMsg(state, 'runner', `${(asyncResult as any).msg} due to ${card.title} subroutine`);
            }
            return coreEid.effectCompleted(state, side, eid);
          }
        })
      };
      coreEffects.registerLingeringEffect(card, {
        type: 'additional-subroutines', duration: 'end-of-run',
        req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
          return coreCard.rezzed(targets[0]) && coreCard.sameCard(t, targets[0]);
        }),
        value: { subroutines: [thunderboltSub] }
      });
      coreIce.pumpIce(t, 1, 'end-of-run');
      return coreEid.effectCompleted(eid);
    })
  }]
};

/** Titan Transnational: Investing In Your Future */
export const card_TitanTransnational_InvestingInYourFuture: CardDef = {
  title: 'Titan Transnational: Investing In Your Future',
  events: [{
    event: 'agenda-scored',
    msg: msg('place 1 agenda counter on ', (c: Card) => c.title || ''),
    async: true,
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
      coreProps.addCounter(eid, contextCard, 'agenda', 1, null);
    })
  }]
};

/** Topan: Ormas Leader */
export const card_Topan_OrmasLeader: CardDef = {
  title: 'Topan: Ormas Leader',
  abilities: [{
    cost: [corePayment.toC('click', 1)], action: true, once: 'per-turn', async: true,
    prompt: 'Install a card, paying 2 [Credits] less', waitingPrompt: true,
    choices: { req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      return coreCard.inHandStar(state, targets[0]) &&
        (coreCard.hardware(targets[0]) || coreCard.resource(targets[0]) || coreCard.program(targets[0])) &&
        coreInstalling.runnerCanPayAndInstall(state, side, eid, targets[0], { 'cost-bonus': -2 });
    })},
    label: 'Install 1 card from your grip, paying 2{c} less. When you install that card, suffer 1 meat damage.',
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      const evs = coreEngine.registerEvents(state, side, card, [{
        event: 'runner-install', unregisterOnceResolved: true, async: true, interactive: true,
        msg: 'suffer 1 meat damage',
        effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { coreDamage.damage(state, side, eid, 'meat', 1); })
      }]);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreInstalling.runnerInstall(state, side, targets[0], { 'cost-bonus': -2, msgKeys: { 'include-cost-from-eid': eid, 'install-source': card } })], []);
      coreEngine.unregisterEventByUuid(state, side, evs[0].uuid);
      return coreEid.effectCompleted(state, side, eid);
    })
  }]
};

/** Valencia Estevez: The Angel of Cayambe */
export const card_ValenciaEstevez_TheAngelOfCayambe: CardDef = {
  title: 'Valencia Estevez: The Angel of Cayambe',
  events: [{
    event: 'pre-start-game',
    req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      return side === 'runner' && (state.corp?.badPublicity || 0) === 0;
    }),
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      coreGaining.gain('corp', 'bad-publicity', 1);
    })
  }]
};

/** Virtual Intelligence, P.I.: "You Can Call Me Vic" */
export const card_VirtualIntelligence_PICallMeVic: CardDef = {
  title: 'Virtual Intelligence, P.I.: "You Can Call Me Vic"',
  abilities: [{
    cost: [corePayment.toC('click', 1), corePayment.toC('credit', 1)], action: true, once: 'per-turn',
    label: 'Draw 1 card and remove 1 tag.',
    msg: msg(function*(tagged: boolean): Generator<any, any, any> { return tagged ? 'draw 1 card and remove 1 tag' : 'draw 1 card'; }),
    async: true,
    changeInGameState: { req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      return utils.isTagged?.(state) ?? false || (state.runner?.deck || []).length > 0;
    })},
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      const tagged = utils.isTagged?.(state) ?? false;
      if (tagged) {
        coreSay.playSfx(state, side, 'vic');
        yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, side, 1, { suppressCheckpoint: true })], []);
        coreTags.loseTags(state, side, eid, 1);
      } else {
        coreSay.playSfx(state, side, 'click-card');
        coreDrawing.draw(state, side, eid, 1);
      }
    })
  }]
};

/** Weyland Consortium: Because We Built It */
export const card_WeylandConsortium_BecauseWeBuiltIt: CardDef = {
  title: 'Weyland Consortium: Because We Built It',
  recurring: 1,
  interactions: {
    'pay-credits': {
      req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
        const abTarget = coreEid.getAbilityTargets(eid);
        return coreCard.ice(abTarget) &&
          (coreEid.sourceType(eid) === 'advance' || coreEid.isBasicAdvanceAction(eid));
      }),
      type: 'recurring'
    }
  }
};

/** Weyland Consortium: Builder of Nations */
export const card_WeylandConsortium_BuilderOfNations: CardDef = {
  title: 'Weyland Consortium: Builder of Nations',
  implementation: '[Erratum] The first time an encounter with a piece of ice with at least 1 advancement counter ends each turn, do 1 meat damage.',
  events: [{
    event: 'end-of-encounter', async: true,
    req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const ice = context.ice ? coreCard.getCard(state, context.ice) : null;
      if (!ice || !coreCard.rezzed(ice)) return false;
      if ((coreCard.getCounters(ice, 'advancement') || 0) <= 0) return false;
      return coreEvents.firstEvent(state, 'runner', 'end-of-encounter', (ctx: any) => {
        const ice = ctx.ice ? coreCard.getCard(state, ctx.ice) : null;
        return ice && coreCard.rezzed(ice) && (coreCard.getCounters(ice, 'advancement') || 0) > 0;
      });
    }),
    msg: 'do 1 meat damage',
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { coreDamage.damage(eid, 'meat', 1, { card }); })
  }]
};

/** Weyland Consortium: Building a Better World */
export const card_WeylandConsortium_BuildingABetterWorld: CardDef = {
  title: 'Weyland Consortium: Building a Better World',
  events: [{
    event: 'play-operation',
    req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
      return contextCard && coreCard.hasSubtype(contextCard, 'Transaction');
    }),
    msg: 'gain 1 [Credits]', async: true,
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits(eid, 1); })
  }]
};

/** Weyland Consortium: Built to Last */
export const card_WeylandConsortium_BuiltToLast: CardDef = {
  title: 'Weyland Consortium: Built to Last',
  events: [{
    event: 'advance', async: true,
    req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
      if (!contextCard) return false;
      const adv = coreCard.getCounters(contextCard, 'advancement') || 0;
      const amount = context.amount || 0;
      return adv - amount <= 0;
    }),
    msg: 'gain 2 [Credits]',
    effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits(state, 'corp', eid, 2); })
  }]
};

/** Whizzard: Master Gamer */
export const card_Whizzard_MasterGamer: CardDef = {
  title: 'Whizzard: Master Gamer',
  recurring: 3,
  interactions: {
    'pay-credits': {
      req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
        return coreEid.sourceType(eid) === 'runner-trash-corp-cards' && coreCard.corp(targets[0]);
      }),
      type: 'recurring'
    }
  }
};

/** Wyvern: Chemically Enhanced */
export const card_Wyvern_ChemicallyEnhanced: CardDef = {
  title: 'Wyvern: Chemically Enhanced',
  events: [
    { event: 'pre-start-game', effect: effect(function*(state: any): Generator<any, any, any> { draftPointsTarget(state); }) },
    {
      event: 'runner-trash', interactive: true,
      req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
        return hasMostFaction(state, 'runner', 'Anarch') && coreCard.corp((targets as any)[0]?.card || {});
      }),
      effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
        const runner = (state as any).runner;
        const discard = runner?.discard || [];
        const lastCard = discard[discard.length - 1];
        if (lastCard) {
          coreShuffling.shuffleCardsIntoDeck!(state, 'runner', card, [lastCard]);
        }
      })
    }
  ]
};

/** Zahya Sadeghi: Versatile Smuggler */
export const card_ZahyaSadeghi_VersatileSmuggler: CardDef = {
  title: 'Zahya Sadeghi: Versatile Smuggler',
  events: [{
    event: 'run-ends',
    optional: {
      req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
        const context = (targets as any)[0]?.context || {};
        const server = context.server || '';
        const accessed = coreRuns.totalCardsAccessed(context);
        return ['hq', 'rd'].includes(server) && accessed > 0;
      }),
      prompt: 'Gain 1 [Credits] for each card you accessed?', once: 'per-turn',
      yesAbility: {
        msg: msg('gain ', (n: number) => n.toString(), ' [Credits]'), once: 'per-turn', async: true,
        effect: effect(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
          const context = (targets as any)[0]?.context || {};
          const accessed = coreRuns.totalCardsAccessed(context);
          coreGaining.gainCredits(state, 'runner', eid, accessed);
        })
      }
    }
  }]
};
