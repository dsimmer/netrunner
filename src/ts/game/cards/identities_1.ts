import type { Card, CardDef, EID, Side, State } from '../../types';
import * as coreAccess from '../core/access';
import * as coreBadPublicity from '../core/bad_publicity';
import * as coreBoard from '../core/board';
import * as coreCard from '../core/card';
import * as coreCharge from '../core/charge';
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
import * as coreHosting from '../core/hosting';
import * as coreIce from '../core/ice';
import * as coreInstalling from '../core/installing';
import * as coreLink from '../core/link';
import * as coreMark from '../core/mark';
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
import * as coreSabotage from '../core/sabotage';
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
const eid: any = undefined as any;
const asyncResult: any = undefined as any;
// scope in cards that were not yet rewritten to use req/effect callbacks.
// These ambient names keep the file compiling; the affected predicates were
// already broken at runtime (state was never defined in the closure either)
// and need per-card rewrites to use state-aware req/effect callbacks.
const state: any = undefined as any;
const target: any = undefined as any;
const side: any = undefined as any;
const ctx: any = undefined as any;
const card: any = undefined as any;

// Helpers shared by draft-format identities (ported from cards/identities.clj).
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

/** 419: Amoral Scammer */
export const card_419_AmoralScammer: CardDef = {
  title: '419: Amoral Scammer',
  events: [{
    event: 'corp-install', async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)?.[0]?.context || {};
      const installState = context['install-state'];
      return coreEvents.firstEvent(state, 'corp', 'corp-install') &&
        ((state as any).turn || 0) > 0 &&
        !coreCard.rezzed(context.card) &&
        installState !== 'face-up';
    }),
    waitingPrompt: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)?.[0]?.context || {};
      const installedCard = context.card;
      continue_ability(state, side, {
        optional: {
          prompt: 'Expose installed card unless the Corp pays 1 [Credits]?',
          autoResolve: coreOptional.getAutoresolve('auto-fire'),
          noAbility: {
            effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
              corePrompts.clearWaitPrompt?.(state, 'corp');
            })
          },
          yesAbility: {
            async: true,
            effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
              const cost = [corePayment.toC('credit', 1)];
              if (!corePayment.canPay(state, 'corp', eid, card, null, cost)) {
                coreToasts.toast(state, 'corp', 'Cannot afford to pay 1 [Credit] to block card exposure', 'info');
                coreExpose.expose(state, 'runner', eid, [installedCard]);
                return;
              }
              continue_ability(state, side, {
                optional: {
                  waitingPrompt: true,
                  prompt: `Pay 1 [Credits] to prevent exposing ${coreToString.cardStr(state, installedCard) || ''}?`,
                  player: 'corp',
                  noAbility: {
                    async: true,
                    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
                      coreExpose.expose(state, 'runner', eid, [installedCard]);
                    })
                  },
                  yesAbility: {
                    async: true,
                    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
                      yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.pay(state, 'corp', coreEid.makeEid(state, eid), card, cost)], []);
                      const result: any = (state as any).__lastAsyncResult;
                      coreSay.systemMsg(state, 'corp', `${result?.msg || ''} to prevent exposing ${coreToString.cardStr(state, installedCard) || ''}`);
                      coreEid.effectCompleted(state, side, eid);
                    })
                  }
                }
              }, card, targets);
            })
          }
        }
      }, card, targets);
    })
  }],
  abilities: [coreOptional.setAutoresolve('auto-fire', '419: Amoral Scammer')]
};

/** A Teia: IP Recovery */
export const card_ATeia_IPRecovery: CardDef = {
  title: 'A Teia: IP Recovery',
  flags: { 'server-limit': 2 } as any,
  events: [{
    event: 'corp-install', async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)?.[0]?.context || {};
      const z = coreCard.getZone(context.card) as any[];
      const isRem = z && coreServers.isRemote(z[1]);
      return isRem && coreEvents.firstEvent(state, side, 'corp-install', (entry: any) => {
        const zz = coreCard.getZone(entry?.[0]?.card) as any[];
        return zz && coreServers.isRemote(zz[1]);
      });
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)?.[0]?.context || {};
      const originalServer = coreServers.zoneToName((coreCard.getZone(context.card) as any[])?.[1]);
      continue_ability(state, side, {
        prompt: 'Choose a card to install in or protecting another remote server',
        waitingPrompt: true,
        choices: {
          card: (c: Card) => coreCard.corp(c) && coreCard.corpInstallableType(c) && coreCard.inHand(c) &&
            !((coreServers as any).installableServers?.(state, c) || []).every?.((s: string) => ['HQ', 'R&D', 'Archives'].includes(s))
        },
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const chosen = targets[0];
          continue_ability(state, side, {
            prompt: 'Choose a remote server',
            waitingPrompt: true,
            choices: (((coreBoard as any).getRemoteNames?.(state) || []) as string[]).filter((s: string) => s !== originalServer).concat(['New remote']),
            async: true,
            effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
              coreInstalling.corpInstall(state, side, eid, chosen, targets[0], {
                'ignore-install-cost': true,
                msgKeys: { installSource: card, displayOrigin: true }
              });
            })
          }, card, null);
        })
      }, card, null);
    })
  }]
};

/** Acme Consulting: The Truth You Need */
export const card_AcmeConsulting_TheTruthYouNeed: CardDef = {
  title: 'Acme Consulting: The Truth You Need',
  staticAbilities: [{
    type: 'tags',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const encounter = coreIce.getCurrentEncounter?.(state);
      const currentIce = coreIce.getCurrentIce?.(state);
      if (!encounter || !currentIce || !coreCard.rezzed(currentIce)) return false;
      const server = coreBoard.cardToServer(state, currentIce);
      const serverIce = (server as any)?.ices || [];
      return serverIce.length > 0 && coreCard.sameCard(currentIce, serverIce[serverIce.length - 1]);
    }),
    value: 1
  }]
};

/** Adam: Compulsive Hacker */
export const card_Adam_CompulsiveHacker: CardDef = {
  title: 'Adam: Compulsive Hacker',
  events: [{
    event: 'pre-start-game',
    req: req(function*(state: State, side: Side): Generator<any, any, any> { return side === 'runner'; }),
    async: true,
    waitingPrompt: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const serverCards = (coreEngine as any).serverCards?.() || [];
      const directives = serverCards
        .filter((c: any) => coreCard.hasSubtype(c, 'Directive'))
        .map((c: any) => (coreEngine as any).makeCard?.(c) || c)
        .map((c: any) => ({ ...c, zone: ['play-area'] }));
      (state as any).runner['play-area'] = directives;
      continue_ability(state, side, {
        prompt: 'Choose 3 starting directives',
        choices: {
          max: 3, all: true,
          card: (c: Card) => coreCard.runner(c) && (c.zone || []).includes?.('play-area')
        },
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          for (const dir of targets) {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreInstalling.runnerInstall(state, side, coreEid.makeEid(state, eid), dir, {
                'ignore-all-cost': true,
                customMessage: (_: any) => `starts with ${dir.title} in play`
              })
            ], []);
          }
          (state as any).runner['play-area'] = [];
          coreEid.effectCompleted(state, null as any, eid);
        })
      }, card, null);
    })
  }]
};

/** AgInfusion: New Miracles for a New World */
export const card_AgInfusion_NewMiraclesForANewWorld: CardDef = {
  title: 'AgInfusion: New Miracles for a New World',
  abilities: [{
    label: 'Trash a piece of ice to choose another server- the runner is now running that server',
    once: 'per-turn',
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const run = (state as any).run;
      const currentIce = coreIce.getCurrentIce?.(state);
      return run && run.phase === 'approach-ice' && !coreCard.rezzed(currentIce);
    }),
    prompt: 'Choose another server and redirect the run to its outermost position',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const run = (state as any).run;
      const currentServer = (coreServers as any).centralToName?.(run?.server) || run?.server?.[0];
      const allServers: string[] = (coreServers as any).servers?.(state) || [];
      return allServers.filter((s: string) => s !== currentServer);
    }),
    msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return `trash the approached piece of ice. The Runner is now running on ${targets[0]}`;
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const target = targets[0];
      const currentIce = coreIce.getCurrentIce?.(state);
      const dest = (coreServers as any).serverToZone?.(state, target);
      const iceCount = (((state as any).corp as any)?.servers?.[target]?.ices || []).length;
      const phase = iceCount > 0 ? 'encounter-ice' : 'movement';
      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trash(state, side, coreEid.makeEid(state, eid), currentIce, { unpreventable: true })], []);
      (coreRuns as any).redirectRun?.(state, side, target, phase);
      (coreRuns as any).startNextPhase?.(state, side, eid);
    })
  }]
};

/** Akiko Nisei: Head Case */
export const card_AkikoNisei_HeadCase: CardDef = {
  title: 'Akiko Nisei: Head Case',
  events: [{
    event: 'breach-server', automatic: 'pre-breach',
    interactive: req(function*(): Generator<any, any, any> { return true; }),
    psi: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const context = (targets as any)[0]?.context || {};
        return context.server === 'rd';
      }),
      equal: {
        msg: 'access 1 additional card', async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          (coreAccess.accessBonus as any)(state, side, 'rd', 1);
          coreEid.effectCompleted(state, side, eid);
        })
      }
    }
  }]
};

/** Alice Merchant: Clan Agitator */
export const card_AliceMerchant_ClanAgitator: CardDef = {
  title: 'Alice Merchant: Clan Agitator',
  events: [{
    event: 'successful-run',
    interactive: req(function*(): Generator<any, any, any> { return true; }),
    automatic: 'force-discard',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)?.[0]?.context || {};
      const ts = coreServers.targetServer({ server: context.server });
      return ts === 'archives' && coreEvents.firstSuccessfulRunOnServer(state, ['archives']);
    }),
    changeInGameState: {
      silent: true,
      req: req(function*(state: State): Generator<any, any, any> { return (((state as any).corp?.hand || []).length) > 0; })
    },
    waitingPrompt: true,
    prompt: 'Choose a card in HQ to discard',
    player: 'corp',
    choices: {
      all: true,
      card: (c: Card) => coreCard.inHand(c) && coreCard.corp(c)
    },
    msg: 'force the Corp to trash 1 card from HQ', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreMoving.trash(state, 'corp', eid, targets[0], null);
    })
  }]
};

/** Ampère: Cybernetics For Anyone */
export const card_Ampere_CyberneticsForAnyone: CardDef = {
  title: 'Ampère: Cybernetics For Anyone'
};

/** Andromeda: Dispossessed Ristie */
export const card_Andromeda_DispossessedRistie: CardDef = {
  title: 'Andromeda: Dispossessed Ristie',
  events: [{
    event: 'pre-start-game',
    req: req(function*(state: State, side: Side): Generator<any, any, any> { return side === 'runner'; }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreDrawing.draw(state, side, eid, 4, { suppressEvent: true });
    })
  }],
  mulligan: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    coreDrawing.draw(state, side, eid, 4, { suppressEvent: true });
  })
};

/** AU Co.: The Gold Standard in Clones */
const card_AUCo_Ability: any = {
  msg: 'place 1 power counter on itself',
  label: 'Manually place 1 power counter',
  oncePerInstance: true,
  async: true,
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    coreProps.addCounter(state, side, eid, card, 'power', 1);
  })
};
const card_AUCo_StartOfTurn: any = {
  interactive: req(function*(): Generator<any, any, any> { return true; }),
  skippable: true,
  event: 'corp-turn-begins',
  changeInGameState: {
    silent: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return (coreCard.getCounters(card, 'power') || 0) >= 2;
    })
  },
  label: 'Look at the top 3 cards of R&D',
  optional: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const deck = ((state as any).corp?.deck || []);
      return deck.length > 0 && (state as any)['corp-phase-12'];
    }),
    prompt: 'Look at the top 3 cards of R&D?',
    waitingPrompt: true,
    yesAbility: {
      cost: [corePayment.toC('power', 2)],
      async: true,
      msg: 'look at the top 3 cards of R&D',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const top3 = ((state as any).corp?.deck || []).slice(0, 3);
        const toDraw = top3.length - 1;
        continue_ability(state, side, {
          async: true,
          prompt: `The top of R&D is (top->bottom): ${utils.enumerateCards?.(top3) || ''}. Choose a card to trash`,
          'not-distinct': true,
          choices: top3 as any,
          msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            const idx = ((state as any).corp?.deck || []).slice(0, 3).findIndex((c: Card) => coreCard.sameCard(c, targets[0]));
            const pos = idx === 0 ? 'top ' : idx === 1 ? 'second ' : idx === 2 ? 'third ' : 'this-should-not-happen ';
            const base = `trash the ${pos}card from R&D`;
            return toDraw > 0 ? `${base} and draw ${toDraw} cards` : base;
          }),
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trash(state, 'corp', coreEid.makeEid(state, eid), targets[0], { causeCard: card, suppressCheckpoint: toDraw > 0 })], []);
            if (toDraw > 0) {
              coreDrawing.draw(state, side, eid, toDraw);
            } else {
              coreEid.effectCompleted(state, side, eid);
            }
          })
        }, card, null);
      })
    }
  }
};
export const card_AUCo_TheGoldStandardInClones: CardDef = {
  title: 'AU Co.: The Gold Standard in Clones',
  events: [
    { ...card_AUCo_Ability, event: 'damage',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return (targets as any)?.[0]?.['from-side'] === 'corp' || (targets as any)?.[0]?.fromSide === 'corp';
      }) },
    { ...card_AUCo_Ability, event: 'corp-trash',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return (targets || []).some((ctx: any) =>
          coreCard.corp(ctx?.card) && coreCard.inHand(ctx?.card) && (ctx?.cause || ctx?.['cause-card'] || ctx?.causeCard)
        );
      }) },
    card_AUCo_StartOfTurn
  ],
  abilities: [card_AUCo_Ability, card_AUCo_StartOfTurn]
};

/** Apex: Invasive Predator */
const card_Apex_InvasivePredatorAbility: any = {
  prompt: 'Choose a card to install facedown',
  label: 'Install a card facedown (start of turn)',
  once: 'per-turn',
  choices: {
    max: 1,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreCard.runner(targets[0]) && coreCard.inHandStar?.(state, targets[0]);
    })
  },
  req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    return ((state as any).runner?.hand || []).length > 0 && (state as any)['runner-phase-12'];
  }),
  async: true,
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    coreInstalling.runnerInstall(state, side, { ...eid, source: card, sourceType: 'runner-install' }, targets[0], {
      facedown: true,
      msgKeys: { installSource: card }
    });
  })
};

export const card_Apex_InvasivePredator: CardDef = {
  title: 'Apex: Invasive Predator',
  implementation: 'Install restriction not enforced',
  events: [{ ...card_Apex_InvasivePredatorAbility, event: 'runner-turn-begins' }],
  flags: { 'runner-phase-12': req(function*(): Generator<any, any, any> { return true; }) },
  abilities: [card_Apex_InvasivePredatorAbility]
};

/** Argus Security: Protection Guaranteed */
export const card_ArgusSecurity_ProtectionGuaranteed: CardDef = {
  title: 'Argus Security: Protection Guaranteed',
  events: [{
    event: 'agenda-stolen',
    prompt: 'Choose one',
    waitingPrompt: true,
    async: true,
    choices: ['Take 1 tag', 'Suffer 2 meat damage'],
    player: 'runner',
    displaySide: 'corp',
    msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const t = targets?.[0] || '';
      const decap = typeof t === 'string' ? t.charAt(0).toLowerCase() + t.slice(1) : '';
      return `force the Runner to ${decap}`;
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if (targets[0] === 'Take 1 tag') {
        coreTags.gainTags(state, 'runner', eid, 1);
      } else {
        coreDamage.damage(state, 'runner', eid, 'meat', 2, { unboostable: true, card });
      }
    })
  }]
};

/** Arissana Rocha Nahu: Street Artist */
export const card_ArissanaRochaNahu_StreetArtist: CardDef = {
  title: 'Arissana Rocha Nahu: Street Artist',
  abilities: [{
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const run = (state as any).run;
      return run && !((card as any)?.special?.['per-turn-used']) && !coreInstalling.installLocked?.(state, side);
    }),
    async: true,
    label: 'Install a program from the grip',
    prompt: 'Choose a program to install',
    waitingPrompt: true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const inHand = (coreDefHelpers as any).allCardsInHandStar?.(state, 'runner') || [];
      return inHand.filter((c: Card) =>
        coreCard.program(c) &&
        (coreInstalling as any).runnerCanPayAndInstall?.(state, side, { ...eid, sourceType: 'runner-install' }, c, { noToast: true })
      );
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreInstalling.runnerInstall(state, 'runner', { ...coreEid.makeEid(state, eid), source: card, sourceType: 'runner-install' }, targets[0], {
          msgKeys: { installSource: card, displayOrigin: true }
        })
      ], []);
      coreEngine.registerOnce(state, side, { once: 'per-turn' } as any, card);
      const installedCard = (state as any).__lastAsyncResult;
      if ((state as any).run && installedCard) {
        coreEngine.registerEvents(state, side, card, [{
          event: 'run-ends',
          interactive: req(function*(): Generator<any, any, any> { return true; }),
          duration: 'end-of-run',
          changeInGameState: {
            silent: true,
            req: req(function*(state: State): Generator<any, any, any> {
              const c = coreCard.getCard(state, installedCard);
              return c && !coreCard.hasSubtype(c, 'Trojan');
            })
          },
          async: true,
          msg: msg(function*(): Generator<any, any, any> { return `trash ${installedCard?.title || ''}`; }),
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            coreMoving.trash(state, side, eid, installedCard, null);
          })
        }] as any);
      }
      coreEid.effectCompleted(state, side, eid);
    })
  }]
};

/** Armand "Geist" Walker: Tech Lord */
export const card_ArmandGeistWalker_TechLord: CardDef = {
  title: 'Armand "Geist" Walker: Tech Lord',
  events: [{
    event: 'costs-paid',
    async: true,
    interactive: req(function*(): Generator<any, any, any> { return true; }),
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = targets?.[0]?.context || {};
      return context.side === 'runner' && (context.payment || []).some((p: any) => p?.['paid/type'] === 'trash-can' || p?.['paid/type'] === ':trash-can');
    }),
    msg: 'draw 1 card',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreDrawing.draw(state, side, eid, 1);
    })
  }]
};

/** Asa Group: Security Through Vigilance */
export const card_AsaGroup_SecurityThroughVigilance: CardDef = {
  title: 'Asa Group: Security Through Vigilance',
  events: [{
    event: 'corp-install', async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreEvents.firstEvent(state, 'corp', 'corp-install');
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)?.[0]?.context || {};
      const installedCard: Card | null = context.card;
      const zone = installedCard ? coreCard.getZone(installedCard) : [];
      const parentZone = (zone as any[]).slice(0, -1);
      const isRemoteZ = coreServers.isRemote(parentZone);
      continue_ability(state, side, {
        prompt: 'Choose a non-agenda card in HQ to install',
        choices: {
          card: (c: Card) => coreCard.inHand(c) && coreCard.corp(c) && coreCard.corpInstallableType(c) &&
            (isRemoteZ || !coreCard.isType(c, 'Asset')) && !coreCard.isType(c, 'Agenda')
        },
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          coreInstalling.corpInstall(state, side, eid, targets[0], coreServers.zoneToName(parentZone), {
            msgKeys: { installSource: card, displayOrigin: true }
          });
        })
      }, card, null);
    })
  }]
};

/** Ayla "Bios" Rahim: Simulant Specialist */
export const card_AylaBiosRahim_SimulantSpecialist: CardDef = {
  title: 'Ayla "Bios" Rahim: Simulant Specialist',
  abilities: [{
    action: true,
    label: 'Add 1 hosted card to the grip',
    cost: [corePayment.toC('click', 1)],
    async: true,
    prompt: 'Choose a hosted card',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return (card as any)?.hosted || [];
    }),
    msg: 'add a hosted card to the grip',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreMoving.move(state, side, targets[0], 'hand');
      coreEid.effectCompleted(state, side, eid);
    })
  }],
  events: [{
    event: 'pre-start-game',
    req: req(function*(state: State, side: Side): Generator<any, any, any> { return side === 'runner'; }),
    async: true,
    waitingPrompt: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const deck = (state as any).runner?.deck || [];
      for (const c of deck.slice(0, 6)) {
        coreMoving.move(state, side, c, 'play-area');
      }
      continue_ability(state, side, {
        prompt: 'Choose 4 cards to be hosted',
        choices: {
          max: 4, all: true,
          card: (c: Card) => coreCard.runner(c) && (c.zone || []).includes?.('play-area')
        },
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          for (const c of targets) {
            (coreHosting as any).host?.(state, side, coreCard.getCard(state, card), c, { facedown: true });
          }
          const playArea = ((state as any).runner?.['play-area'] || []).slice();
          for (const c of playArea) {
            coreMoving.move(state, side, c, 'deck');
          }
          coreShuffling.shuffle(state, side, 'deck');
        })
      }, card, null);
    })
  }]
};

/** Az McCaffrey: Mechanical Prodigy */
function azType(card: Card): boolean {
  return coreCard.hardware(card) || (coreCard.resource(card) && coreCard.hasAnySubtype(card, ['Job', 'Connection']));
}
function azNotTriggered(state: State): boolean {
  const events = coreEvents.turnEvents(state, 'runner', 'runner-install') || [];
  return !events.some((e: any) => azType(e?.[0]?.card));
}
export const card_AzMcCaffrey_MechanicalProdigy: CardDef = {
  title: 'Az McCaffrey: Mechanical Prodigy',
  staticAbilities: [{
    type: 'install-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return azType(targets[0]) && azNotTriggered(state);
    }),
    value: -1
  }],
  events: [{
    event: 'runner-install',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)?.[0]?.context || {};
      return azType(context.card) && azNotTriggered(state);
    }),
    silent: req(function*(): Generator<any, any, any> { return true; }),
    msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)?.[0]?.context || {};
      return `reduce the install cost of ${context.card?.title || ''} by 1 [Credits]`;
    })
  }]
};

/** Azmari EdTech is placed first within Az* alphabetically below; see above for ordering */

/** BANGUN: When Disaster Strikes */
const card_BANGUN_FlipFaceup: any = {
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    coreUpdate.update!(state, side, { ...targets[0], seen: true });
  })
};
export const card_BANGUN_WhenDisasterStrikes: CardDef = {
  title: 'BANGUN: When Disaster Strikes',
  abilities: [{
    label: 'Manually turn an agenda faceup',
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return coreCard.agenda(targets[0]) && coreCard.installed(targets[0]);
      })
    },
    msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return `turn ${coreToString.cardStr(state, targets[0], { visible: true } as any) || ''} faceup`;
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreUpdate.update!(state, side, { ...targets[0], seen: true });
    })
  }],
  events: [
    {
      event: 'access',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = (targets as any)?.[0]?.context || {};
        const c: Card = ctx['accessed-card'] || ctx.accessedCard;
        return c && (c as any).faceup && coreCard.installed(c) && coreCard.agenda(c) && (c as any)['was-seen'];
      }),
      interactive: req(function*(): Generator<any, any, any> { return true; }),
      msg: 'do 2 meat damage and give the Runner a tag',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' }, coreDamage.damage(state, 'corp', coreEid.makeEid(state, eid), 'meat', 2, { card, suppressCheckpoint: true })], []);
        coreTags.gainTags(state, 'corp', eid, 1);
      })
    },
    {
      event: 'corp-install',
      interactive: req(function*(): Generator<any, any, any> { return true; }),
      skippable: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = (targets as any)?.[0]?.context || {};
        const tcard: Card = (targets as any)?.[0]?.card || ctx.card;
        const ictx = ctx;
        if (!tcard || coreCard.ice(tcard)) return false;
        if ((coreCard as any).conditionCounter?.(tcard)) return false;
        if (coreCard.rezzed(ictx.card)) return false;
        const z = coreCard.getZone(tcard) as any[];
        if (['hq', 'archives', 'rd'].includes(z?.[1])) return false;
        if (ictx['install-state'] === 'face-up') return false;
        const cardsInSlot = (coreBoard.allInstalled(state, 'corp') || []).filter((c: Card) => {
          const cz = coreCard.getZone(c) as any[];
          const ictxZ = coreCard.getZone(ictx.card) as any[];
          return JSON.stringify(cz) === JSON.stringify(ictxZ);
        });
        return !cardsInSlot.some((c: any) => (coreCard.asset(c) || coreCard.agenda(c)) && (coreCard.rezzed(c) || c.faceup));
      }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const tcard: Card = (targets as any)?.[0]?.card || (targets as any)?.[0]?.context?.card;
        if (coreCard.agenda(tcard)) {
          continue_ability(state, side, {
            optional: {
              prompt: `Turn ${tcard.title} faceup?`,
              waitingPrompt: true,
              yesAbility: {
                msg: `turn ${coreToString.cardStr(state, tcard, { visible: true } as any) || ''} faceup`,
                effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
                  coreUpdate.update!(state, side, { ...tcard, seen: true });
                })
              }
            }
          }, card, null);
        } else {
          continue_ability(state, side, {
            prompt: 'Nothing to see here',
            waitingPrompt: true,
            choices: ['OK']
          }, card, null);
        }
      })
    }
  ]
};

/** Azmari EdTech: Shaping the Future */
export const card_AzmariEdTech_ShapingTheFuture: CardDef = {
  title: 'Azmari EdTech: Shaping the Future',
  events: [
    {
      event: 'corp-turn-ends',
      prompt: 'Choose a card type',
      choices: ['Event', 'Resource', 'Program', 'Hardware', 'None'],
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const t = targets[0];
        coreUpdate.update!(state, side, { ...card, 'card-target': t === 'None' ? null : t });
        if (t === 'None') {
          coreSay.systemMsg(state, side, `declines to use ${card.title}`);
        } else {
          coreSay.systemMsg(state, side, `uses ${card.title} to name ${t}`);
        }
      })
    },
    {
      event: 'runner-install',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const target = (card as any)['card-target'];
        const context = (targets as any)?.[0]?.context || {};
        if (!target || !coreCard.isType(context.card, target) || context.facedown) return false;
        return coreEvents.firstEvent(state, 'runner', 'runner-install', (entry: any) => coreCard.isType(entry?.[0]?.card, target));
      }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        coreGaining.gainCredits(state, 'corp', eid, 2);
      }),
      msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return `gain 2 [Credits] from ${(card as any)['card-target'] || ''}`;
      })
    },
    {
      event: 'play-event',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const target = (card as any)['card-target'];
        const context = (targets as any)?.[0]?.context || {};
        if (!target) return false;
        return coreEvents.firstEvent(state, 'runner', 'play-event') && coreCard.isType(context.card, target);
      }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        coreGaining.gainCredits(state, 'corp', eid, 2);
      }),
      msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return `gain 2 [Credits] from ${(card as any)['card-target'] || ''}`;
      })
    }
  ]
};

/** Barry "Baz" Wong: Tri-Maf Veteran */
export const card_BarryBazWong_TriMafVeteran: CardDef = {
  title: 'Barry "Baz" Wong: Tri-Maf Veteran',
  events: [{
    async: true,
    prompt: 'Install a resource or piece of hardware',
    event: 'rez',
    waitingPrompt: true,
    player: 'runner',
    interactive: req(function*(): Generator<any, any, any> { return true; }),
    skippable: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)?.[0]?.context || {};
      return coreCard.ice(context.card);
    }),
    changeInGameState: {
      silent: true,
      req: req(function*(state: State): Generator<any, any, any> {
        return (coreDefHelpers.allCardsInHandStar?.(state, 'runner') || []).length > 0;
      })
    },
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const t = targets[0];
        return coreCard.inHandStar?.(state, t) && (coreCard.resource(t) || coreCard.hardware(t)) &&
          (coreInstalling as any).runnerCanPayAndInstall?.(state, side, eid, t);
      })
    },
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreInstalling.runnerInstall(state, side, { ...eid, source: card }, targets[0], { msgKeys: { installSource: card } });
    })
  }]
};

/** Blue Sun: Powering the Future */
const card_BlueSun_PoweringTheFutureAbility: any = {
  choices: { card: (c: Card) => coreCard.rezzed(c) },
  label: 'Add 1 rezzed card to HQ and gain credits equal to its rez cost',
  msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    const t = targets[0];
    const cost = coreCostFns.rezCost?.(state, side, t) || 0;
    return `add ${t?.title} to HQ and gain ${cost} [Credits]`;
  }),
  changeInGameState: {
    req: req(function*(state: State): Generator<any, any, any> {
      return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => coreCard.rezzed(c));
    }),
    silent: true
  },
  async: true,
  once: 'per-turn',
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    const t = targets[0];
    const cost = coreCostFns.rezCost?.(state, side, t) || 0;
    coreMoving.move(state, side, t, 'hand');
    coreGaining.gainCredits(state, side, eid, cost);
  })
};
export const card_BlueSun_PoweringTheFuture: CardDef = {
  title: 'Blue Sun: Powering the Future',
  flags: {
    'corp-phase-12': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if (card.disabled || coreEffects.isDisabled(state, side, card)) return false;
      return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => coreCard.rezzed(c));
    })
  },
  events: [{ ...card_BlueSun_PoweringTheFutureAbility, event: 'corp-turn-begins', automatic: 'last', skippable: true }],
  abilities: [card_BlueSun_PoweringTheFutureAbility]
};

/** Boris "Syfr" Kovac: Crafty Veteran */
export const card_BorisSyfrKovac_CraftyVeteran: CardDef = {
  title: 'Boris "Syfr" Kovac: Crafty Veteran',
  events: [
    { event: 'pre-start-game', effect: effect(function*(state: State): Generator<any, any, any> { draftPointsTarget(state); }) },
    {
      event: 'runner-turn-begins',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const base = ((state as any).runner?.tag?.base) || 0;
        return hasMostFaction(state, 'runner', 'Criminal') && base > 0;
      }),
      msg: 'remove 1 tag', async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        coreTags.loseTags(state, side, eid, 1);
      })
    }
  ]
};

/** Captain Padma Isbister: Intrepid Explorer */
export const card_CaptainPadmaIsbister_IntrepidExplorer: CardDef = {
  title: 'Captain Padma Isbister: Intrepid Explorer',
  events: [{
    event: 'run', async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const target0: any = (targets as any)?.[0];
      const server = target0?.server;
      const isRd = Array.isArray(server) ? server.length === 1 && server[0] === 'rd' : server === 'rd';
      if (!isRd) return false;
      return coreEvents.firstEvent(state, side, 'run', (entry: any) => {
        const s = entry?.[0]?.server;
        return Array.isArray(s) ? s.length === 1 && s[0] === 'rd' : s === 'rd';
      });
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      continue_ability(state, side, coreCharge.chargeAbility(state, side), card, null);
    })
  }]
};

/** Cerebral Imaging: Infinite Frontiers */
export const card_CerebralImaging_InfiniteFrontiers: CardDef = {
  title: 'Cerebral Imaging: Infinite Frontiers',
  staticAbilities: [coreHandSize.corpHandSizePlus(req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    return (((state as any).corp?.credit) || 0) - 5;
  }))]
};

/** Chaos Theory: Wünderkind */
export const card_ChaosTheory_Wunderkind: CardDef = {
  title: 'Chaos Theory: Wünderkind',
  staticAbilities: [coreMemory.muPlus(1)]
};

/** Chronos Protocol: Haas-Bioroid */
export const card_ChronosProtocol_HaasBioroid: CardDef = {
  title: 'Chronos Protocol: Haas-Bioroid',
  events: [{
    event: 'damage',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)?.[0]?.context || {};
      return context['damage-type'] === 'brain' || context.damageType === 'brain';
    }),
    msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)?.[0]?.context || {};
      const trashed = context['cards-trashed'] || context.cardsTrashed || [];
      return `remove all copies of ${utils.enumerateCards?.(trashed) || ''}, everywhere, from the game`;
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)?.[0]?.context || {};
      const trashed = context['cards-trashed'] || context.cardsTrashed || [];
      const allCards = (coreBoard as any).getAllCards?.(state) || [];
      for (const c of trashed) {
        const candidates = allCards.filter((x: Card) => !coreCard.inRfg(x) && coreCard.runner(x) && x.title === c.title);
        for (const cand of candidates) {
          coreMoving.move(state, 'runner', cand, 'rfg');
        }
      }
    })
  }]
};

/** Chronos Protocol: Selective Mind-mapping */
function chronosSelectiveEnableChoice(state: State): void {
  (coreDamage as any).enableCorpDamageChoice?.(state);
}
export const card_ChronosProtocol_SelectiveMindMapping: CardDef = {
  title: 'Chronos Protocol: Selective Mind-mapping',
  req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    const evs = coreEvents.turnEvents(state, 'runner', 'damage') || [];
    return !evs.some((e: any) => (e?.[0]?.['damage-type'] || e?.[0]?.damageType) === 'net');
  }),
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    chronosSelectiveEnableChoice(state);
  }),
  leavePlay: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    const dmg: any = (state as any).damage;
    if (dmg) delete dmg['damage-choose-corp'];
  }),
  events: [
    {
      event: 'corp-phase-12',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        chronosSelectiveEnableChoice(state);
      })
    },
    {
      event: 'runner-phase-12',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        chronosSelectiveEnableChoice(state);
      })
    },
    {
      event: 'pre-resolve-damage',
      optional: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const context = (targets as any)?.[0]?.context || {};
          const dt = context['damage-type'] || context.damageType;
          const amount = context.amount || 0;
          const hand = (state as any).runner?.hand || [];
          return dt === 'net' &&
            ((coreDamage as any).corpCanChooseDamage?.(state)) &&
            amount > 0 &&
            !coreEvents.turnEvents(state, 'runner', 'damage')?.some((e: any) => (e?.[0]?.['damage-type'] || e?.[0]?.damageType) === 'net') &&
            hand.length > 0;
        }),
        waitingPrompt: true,
        prompt: 'Choose the first card to trash?',
        yesAbility: {
          prompt: 'Choose 1 card to trash',
          choices: { card: (c: Card) => coreCard.runner(c) && coreCard.inHand(c) },
          msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            return `choose ${targets[0]?.title || ''} to trash`;
          }),
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            (coreDamage as any).chosenDamage?.(state, 'corp', targets[0]);
          })
        },
        noAbility: {
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            coreSay.systemMsg(state, 'corp', `declines to use ${card.title}`);
          })
        }
      }
    }
  ]
};

/** Cybernetics Division: Humanity Upgraded */
export const card_CyberneticsDivision_HumanityUpgraded: CardDef = {
  title: 'Cybernetics Division: Humanity Upgraded',
  staticAbilities: [coreHandSize.handSizePlus(-1)]
};

/** Dewi Subrotoputri: Pedagogical Dhalang */
function dewiFlipEffect(state: State, side: Side, card: Card): void {
  if ((card as any).flipped) {
    coreUpdate.update!(state, side, {
      ...card,
      flipped: false,
      face: 'front',
      code: (card.code || '').substring(0, 5)
    });
  } else {
    coreUpdate.update!(state, side, {
      ...card,
      flipped: true,
      face: 'back',
      code: (card.code || '').substring(0, 5) + 'flip'
    });
  }
}
export const card_DewiSubrotoputri_PedagogicalDhalang: CardDef = {
  title: 'Dewi Subrotoputri: Pedagogical Dhalang',
  events: [
    {
      event: 'pre-first-turn',
      req: req(function*(state: State, side: Side): Generator<any, any, any> { return side === 'runner'; }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        coreUpdate.update!(state, side, { ...card, flipped: false, face: 'front' });
      })
    },
    {
      event: 'successful-run',
      skippable: true,
      interactive: req(function*(): Generator<any, any, any> { return true; }),
      changeInGameState: {
        silent: true,
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const flipped = (card as any).flipped;
          const availMu = ((coreMemory as any).availableMu?.(state) ?? 0);
          return (flipped && availMu > 0) || (!flipped && availMu === 0);
        })
      },
      optional: {
        prompt: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          return `Flip your ID (${(card as any).flipped ? 'draw 1 card)?' : 'gain 1 [Credits])?'}`;
        }),
        yesAbility: {
          async: true,
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            const flipped = (card as any).flipped;
            const availMu = ((coreMemory as any).availableMu?.(state) ?? 0);
            if (flipped) {
              if (availMu > 0) {
                yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, 'runner', coreEid.makeEid(state, eid), 1)], []);
                coreSay.systemMsg(state, side, 'draws 1 card and flips [their] identity to Dewi Subrotoputri: Pedagogical Dhalang');
                dewiFlipEffect(state, side, card);
              } else {
                coreEid.effectCompleted(state, side, eid);
              }
            } else {
              if (availMu === 0) {
                yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, 'runner', coreEid.makeEid(state, eid), 1)], []);
                coreSay.systemMsg(state, side, 'gain 1 [Credits] and flips [their] identity to Dewi Subrotoputri: Shadow Guide');
                dewiFlipEffect(state, 'runner', card);
              } else {
                coreEid.effectCompleted(state, side, eid);
              }
            }
          })
        }
      }
    }
  ],
  abilities: [{
    label: 'Manually flip identity',
    forceMenu: true,
    msg: 'manually flip [their] identity',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      dewiFlipEffect(state, side, card);
    })
  }]
};

/** Earth Station: SEA Headquarters */
function earthStationFlip(state: State, side: Side, card: Card): void {
  if ((card as any).flipped) {
    coreSay.systemMsg(state, 'corp', 'flipped [pronoun] identity to Earth Station: SEA Headquarters');
    coreUpdate.update!(state, side, {
      ...card,
      flipped: false,
      face: 'front',
      code: (card.code || '').substring(0, 5)
    });
  } else {
    coreUpdate.update!(state, side, {
      ...card,
      flipped: true,
      face: 'back',
      code: (card.code || '').substring(0, 5) + 'flip'
    });
  }
}
export const card_EarthStation_SEAHeadquarters: CardDef = {
  title: 'Earth Station: SEA Headquarters',
  flags: { 'server-limit': 1 } as any,
  events: [
    {
      event: 'pre-first-turn',
      req: req(function*(state: State, side: Side): Generator<any, any, any> { return side === 'corp'; }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        coreUpdate.update!(state, side, { ...card, flipped: false, face: 'front' });
      })
    },
    {
      event: 'successful-run',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const context = (targets as any)?.[0]?.context || {};
        return coreServers.targetServer({ server: context.server }) === 'hq' && (card as any).flipped;
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        earthStationFlip(state, side, card);
      })
    }
  ],
  staticAbilities: [{
    type: 'run-additional-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const server = (targets as any)?.[1]?.server;
      const flipped = (card as any).flipped;
      const remotes = Object.keys((state as any).corp?.servers?.remote || {});
      return (!flipped && server === 'hq') || (flipped && remotes.includes(server));
    }),
    value: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return [corePayment.toC('credit', (card as any).flipped ? 6 : 1)];
    })
  }],
  abilities: [
    {
      action: true,
      label: 'Flip identity to Earth Station: Ascending to Orbit',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return !(card as any).flipped; }),
      cost: [corePayment.toC('click', 1)],
      msg: 'flip [their] identity to Earth Station: Ascending to Orbit',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        earthStationFlip(state, side, card);
      })
    },
    {
      label: 'Manually flip identity to Earth Station: SEA Headquarters',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return (card as any).flipped; }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        earthStationFlip(state, side, card);
      })
    }
  ]
};

/** Editorial Division: Ad Nihilum */
export const card_EditorialDivision_AdNihilum: CardDef = {
  title: 'Editorial Division: Ad Nihilum',
  events: [{
    event: 'corp-gain-bad-publicity',
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = (targets as any)?.[0]?.context || {};
        const validCtx = (entry: any) => (entry?.[0]?.amount ?? entry?.amount ?? 0) > 0;
        return (ctx.amount || 0) > 0 && coreEvents.firstEvent(state, side, 'corp-gain-bad-publicity', validCtx);
      }),
      prompt: 'Search for a card?',
      waitingPrompt: true,
      yesAbility: {
        prompt: 'Choose a card',
        msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          return `add ${targets[0]?.title || ''} to HQ from R&D`;
        }),
        choices: {
          card: (c: Card) => coreCard.corp(c) &&
            (c.zone || []).some?.((z: string) => z === 'deck') &&
            coreCard.hasAnySubtype(c, ['Illicit', 'Black Ops', 'Gray Ops', 'Liability']) &&
            !coreCard.isType(c, 'Agenda')
        },
        cancel: coreShuffling.shuffleMyDeck,
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          (coreRevealing as any).revealAndQueueEvent?.(state, side, targets[0]);
          coreShuffling.shuffle(state, side, 'deck');
          coreMoving.move(state, side, targets[0], 'hand');
          coreEngine.checkpoint(state, side, eid);
        })
      }
    }
  }]
};

/** Edward Kim: Humanity's Hammer */
export const card_EdwardKim_HumanitysHammer: CardDef = {
  title: "Edward Kim: Humanity's Hammer",
  events: [{
    event: 'access',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = (targets as any)?.[0]?.context || {};
      const accessed = ctx['accessed-card'] || ctx.accessedCard;
      return coreCard.operation(accessed) &&
        coreEvents.firstEvent(state, side, 'access', (entry: any) => coreCard.operation(entry?.[0]?.['accessed-card'] || entry?.[0]?.accessedCard));
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = (targets as any)?.[0]?.context || {};
      const accessed: Card = ctx['accessed-card'] || ctx.accessedCard;
      if (coreCard.inDiscard(accessed)) {
        coreEid.effectCompleted(state, side, eid);
        return;
      }
      continue_ability(state, side, {
        prompt: `You accessed ${accessed?.title || ''}`,
        choices: ['[Edward Kim] Trash'],
        async: true,
        msg: `trash ${accessed?.title || ''}`,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          coreMoving.trash(state, side, eid, accessed, null);
        })
      }, card, null);
    })
  }]
};

/** Ele "Smoke" Scovak: Cynosure of the Net */
export const card_EleSmokeScovak_CynosureOfTheNet: CardDef = {
  title: 'Ele "Smoke" Scovak: Cynosure of the Net',
  recurring: 1,
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const abTarget = coreEid.getAbilityTargets(eid);
        return coreEid.sourceType(eid) === 'ability' && coreCard.hasSubtype(abTarget as Card, 'Icebreaker');
      }),
      type: 'recurring'
    }
  }
};

/** Epiphany Analytica: Nations Undivided */
const card_EpiphanyAnalytica_Ability: any = {
  once: 'per-turn',
  msg: 'place 1 power counter on itself',
  async: true,
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    coreProps.addCounter(state, side, eid, card, 'power', 1, null);
  })
};
export const card_EpiphanyAnalytica_NationsUndivided: CardDef = {
  title: 'Epiphany Analytica: Nations Undivided',
  events: [
    { ...card_EpiphanyAnalytica_Ability, event: 'runner-trash',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const t = (targets as any)?.[0];
        return coreCard.corp(t?.card);
      }) },
    { ...card_EpiphanyAnalytica_Ability, event: 'agenda-stolen',
      req: req(function*(): Generator<any, any, any> { return true; }) }
  ],
  abilities: [{
    action: true,
    label: 'Look at the top 3 cards of R&D',
    changeInGameState: {
      req: req(function*(state: State): Generator<any, any, any> { return ((state as any).corp?.deck || []).length > 0; })
    },
    cost: [corePayment.toC('click', 1), corePayment.toC('power', 1)],
    msg: 'look at the top 3 cards of R&D',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const top = ((state as any).corp?.deck || []).slice(0, 3);
      yield wait_for(state, [{ asyncResult: 'result' }, (coreDefHelpers as any).scry?.(state, side, card, side, 3)], []);
      continue_ability(state, 'corp', {
        prompt: 'Choose a card to install',
        waitingPrompt: true,
        'not-distinct': true,
        choices: top.filter((c: Card) => coreCard.corpInstallableType(c)),
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const idx = top.findIndex((c: Card) => coreCard.sameCard(targets[0], c));
          coreInstalling.corpInstall(state, side, eid, targets[0], null, {
            msgKeys: { installSource: card, originIndex: idx, displayOrigin: true }
          });
        })
      }, card, null);
    })
  }]
};

/** Esâ Afontov: Eco-Insurrectionist */
function esaCheckBrain(targets: any[]): boolean {
  const ctx = targets?.[0]?.context || targets?.[0] || {};
  return (ctx.amount || 0) > 0 && (ctx['damage-type'] === 'brain' || ctx.damageType === 'brain');
}
export const card_EsaAfontov_EcoInsurrectionist: CardDef = {
  title: 'Esâ Afontov: Eco-Insurrectionist',
  events: [{
    event: 'damage',
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return esaCheckBrain(targets) &&
          coreEvents.firstEvent(state, 'runner', 'damage', (entry: any) => esaCheckBrain(entry));
      }),
      prompt: 'Draw 1 card and sabotage 2?',
      autoResolve: coreOptional.getAutoresolve('auto-fire'),
      yesAbility: {
        async: true,
        msg: 'draw 1 card and sabotage 2',
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, side, eid, 1, { suppressCheckpoint: true })], []);
          continue_ability(state, side, (coreSabotage as any).sabotageAbility?.(2), card, null);
        })
      }
    }
  }],
  abilities: [coreOptional.setAutoresolve('auto-fire', 'Esâ Afontov: Eco-Insurrectionist drawing cards')]
};

/** Exile: Streethawk */
export const card_Exile_Streethawk: CardDef = {
  title: 'Exile: Streethawk',
  flags: { 'runner-install-draw': true },
  events: [{
    event: 'runner-install', async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)?.[0]?.context || {};
      const installedCard = context.card;
      const previousZone = context['previous-zone'] || context.previousZone || [];
      return coreCard.program(installedCard) && previousZone.some((z: string) => z === 'discard');
    }),
    msg: 'draw 1 card',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreDrawing.draw(state, side, eid, 1);
    })
  }]
};

/** Freedom Khumalo: Crypto-Anarchist */
export const card_FreedomKhumalo_CryptoAnarchist: CardDef = {
  title: 'Freedom Khumalo: Crypto-Anarchist',
  interactions: {
    'access-ability': {
      async: true,
      trash: true,
      once: 'per-turn',
      label: 'Trash card',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const t = targets[0];
        if (card.disabled || coreEffects.isDisabled(state, side, card)) return false;
        if (coreCard.agenda(t) || coreCard.inDiscard(t)) return false;
        const playCost = coreCostFns.playCost(state, side, t);
        const virusCount = ((coreMemory as any).numberOfRunnerVirusCounters?.(state)) || 0;
        return (playCost || 0) <= virusCount;
      }),
      waitingPrompt: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const accessed: Card = targets[0];
        const playOrRez = (accessed as any).cost || 0;
        if (playOrRez === 0) {
          continue_ability(state, side, {
            async: true,
            msg: msg(function*(): Generator<any, any, any> { return `trash ${accessed.title} at no cost`; }),
            effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
              coreMoving.trash(state, side, eid, { ...accessed, seen: true } as Card, { accessed: true });
            })
          }, card, null);
        } else {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility?.(state, side, (coreCostFns as any).pickVirusCountersToSpend?.(playOrRez), card, null)
          ], []);
          const result: any = (state as any).__lastAsyncResult;
          if (result?.msg) {
            coreSay.systemMsg(state, 'runner', `uses ${card.title} to trash ${accessed.title} at no cost, spending ${result.msg}`);
            coreMoving.trash(state, side, eid, { ...accessed, seen: true } as Card, { accessed: true });
          } else {
            const perTurn: any = (state as any)['per-turn'];
            if (perTurn) delete perTurn[(card as any).cid];
            (coreAccess as any).accessNonAgenda?.(state, side, eid, accessed, { 'skip-trigger-event': true });
          }
        }
      })
    }
  } as any
};

/** Fringe Applications: Tomorrow, Today */
export const card_FringeApplications_TomorrowToday: CardDef = {
  title: 'Fringe Applications: Tomorrow, Today',
  events: [
    { event: 'pre-start-game', effect: effect(function*(state: State): Generator<any, any, any> { draftPointsTarget(state); }) },
    {
      event: 'runner-turn-begins',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        if (card.disabled || coreEffects.isDisabled(state, side, card)) return false;
        return hasMostFaction(state, 'corp', 'Weyland Consortium');
      }),
      changeInGameState: { silent: true, req: req(function*(state: State): Generator<any, any, any> { return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => coreCard.ice(c)); }) },
      prompt: 'Choose a piece of ice to place 1 advancement counter on',
      choices: { card: (c: Card) => coreCard.installed(c) && coreCard.ice(c) },
      msg: msg('place 1 advancement counter on ', (c: Card) => coreToString.cardStr(state, c) || ''),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        coreProps.addProp(state, side, eid, targets[0], 'advance-counter', 1, { placed: true });
      })
    }
  ]
};

/** Gabriel Santiago: Consummate Professional */
export const card_GabrielSantiago_ConsummateProfessional: CardDef = {
  title: 'Gabriel Santiago: Consummate Professional',
  events: [{
    event: 'successful-run', automatic: 'gain-credits', silent: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = (targets as any)[0]?.context || {};
      return ctx.targetServer === 'hq' && coreEvents.firstSuccessfulRunOnServer(state, 'hq');
    }),
    msg: 'gain 2 [Credits]', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits(eid, 2); })
  }]
};

/** Gagarin Deep Space: Expanding the Horizon */
export const card_GagarinDeepSpace_ExpandingTheHorizon: CardDef = {
  title: 'Gagarin Deep Space: Expanding the Horizon',
  events: [{
    event: 'pre-access-card',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const accessedCard = context.accessedCard ? coreCard.getCard(state, context.accessedCard) : null;
      const zone = coreCard.getZone(accessedCard);
      return zone && coreServers.isRemote(zone);
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreAccess.accessCostBonus([corePayment.toC('credit', 1)]);
    }),
    msg: 'make the Runner spend 1 [Credits] to access'
  }]
};

/** GameNET: Where Dreams are Real */
export const card_GameNET_WhereDreamsAreReal: CardDef = {
  title: 'GameNET: Where Dreams are Real',
  events: [
    {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const run = (state as any).run;
        if (!run) return false;
        if (coreEid.source(eid)?.side !== 'Runner') return false;
        if (eid.sourceType === 'runner-trash-corp-cards' || eid.sourceType === 'runner-steal') {
          const addCosts = (eid as any).additionalCosts || [];
          for (const ac of addCosts) {
            if ((ac.cost?.type === 'credit' || ac.cost?.type === 'x-credit') && coreEid.source(ac.source)?.side === 'Corp') return true;
          }
        }
        return false;
      }),
      async: true, msg: 'gain 1 [Credits]',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits('corp', eid, 1); })
    },
    {
      event: 'runner-credit-loss',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const run = (state as any).run;
        if (!run) return false;
        return coreEid.source(eid)?.side === 'Runner';
      }),
      async: true, msg: 'gain 1 [Credits]',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits('corp', eid, 1); })
    }
  ]
};

/** GRNDL: Power Unleashed */
export const card_GRNDL_PowerUnleashed: CardDef = {
  title: 'GRNDL: Power Unleashed',
  events: [{
    event: 'pre-start-game',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return side === 'corp'; }),
    async: true,
    msg: 'start the game with 10 [Credits] and 1 bad publicity',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, 'corp', 5)], []);
      if ((state as any).corp?.badPublicity <= 0) {
        coreBadPublicity.gainBadPublicity(state, 'corp', eid, 1);
      }
    })
  }]
};

/** Haarpsichord Studios: Entertainment Unleashed */
export const card_HaarpsichordStudios_EntertainmentUnleashed: CardDef = {
  title: 'Haarpsichord Studios: Entertainment Unleashed',
  staticAbilities: [{
    type: 'cannot-steal',
    value: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return (coreEvents.eventCount(state, side, 'agenda-stolen') || 0) > 0;
    })
  }],
  events: [{
    event: 'access',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const accessedCard = context.accessedCard ? coreCard.getCard(state, context.accessedCard) : null;
      return accessedCard && coreCard.agenda(accessedCard) && (coreEvents.eventCount(state, side, 'agenda-stolen') || 0) > 0;
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreToasts.toast(state, 'runner', 'Cannot steal due to Haarpsichord Studios.', 'warning');
    })
  }]
};

/** Haas-Bioroid: Architects of Tomorrow */
export const card_HaasBioroid_ArchitectsOfTomorrow: CardDef = {
  title: 'Haas-Bioroid: Architects of Tomorrow',
  events: [{
    event: 'pass-ice',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const ice = context.ice ? coreCard.getCard(state, context.ice) : null;
      if (!ice || !coreCard.rezzed(ice) || !coreCard.hasSubtype(ice, 'Bioroid')) return false;
      return coreEvents.firstEvent(state, 'runner', 'pass-ice', (ctx: any) => {
        const ice = ctx.ice ? coreCard.getCard(state, ctx.ice) : null;
        return ice && coreCard.rezzed(ice) && coreCard.installed(ice) && coreCard.hasSubtype(ice, 'Bioroid');
      });
    }),
    waitingPrompt: true, prompt: 'Choose a Bioroid to rez', player: 'corp',
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return coreCard.hasSubtype(targets[0], 'Bioroid') && !coreCard.rezzed(targets[0]) &&
          coreRezzing.canPayToRez(state, side, eid, targets[0], { 'cost-bonus': -4 });
      })
    },
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreRezzing.rez(state, side, eid, targets[0], { 'cost-bonus': -4 });
    })
  }]
};

/** Haas-Bioroid: Engineering the Future */
export const card_HaasBioroid_EngineeringTheFuture: CardDef = {
  title: 'Haas-Bioroid: Engineering the Future',
  events: [{
    event: 'corp-install',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreEvents.firstEvent(state, 'corp', 'corp-install');
    }),
    automatic: 'gain-credits', msg: 'gain 1 [Credits]', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits(eid, 1); })
  }]
};

/** Haas-Bioroid: Precision Design */
export const card_HaasBioroid_PrecisionDesign: CardDef = {
  title: 'Haas-Bioroid: Precision Design',
  staticAbilities: [coreHandSize.corpHandSizePlus(req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return 1; }))],
  events: [{
    event: 'agenda-scored',
    interactive: true,
    optional: {
      prompt: 'Add 1 card from Archives to HQ?',
      autoResolve: coreOptional.getAutoresolve('auto-fire'),
      yesAbility: coreDefHelpers.corpRecur
    }
  }],
  abilities: [{ effect: effect(function*(state: State): Generator<any, any, any> { coreOptional.setAutoresolve('auto-fire', 'Haas-Bioroid: Precision Design'); }) }]
};

/** Haas-Bioroid: Stronger Together */
export const card_HaasBioroid_StrongerTogether: CardDef = {
  title: 'Haas-Bioroid: Stronger Together',
  staticAbilities: [{
    type: 'ice-strength',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return coreCard.hasSubtype(targets[0], 'Bioroid'); }),
    value: 1
  }],
  leavePlay: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreIce.updateAllIce(state, side); }),
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreIce.updateAllIce(state, side); })
};

/** Harishchandra Ent.: Where You're the Star */
export const card_HarishchandraEnt_WhereYoureTheStar: CardDef = {
  title: "Harishchandra Ent.: Where You're the Star",
  events: [
    {
      event: 'post-runner-draw',
      req: req(function*(state: State): Generator<any, any, any> { return utils.isTagged?.(state) ?? false; }),
      msg: msg('see that the Runner drew: ', (runner: any) => {
        return runner && runner.length > 0 ? utils.enumerateCards(runner) : 'no cards';
      })
    },
    {
      event: 'tags-changed',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const tagged = utils.isTagged?.(state) ?? false;
        const gripRevealed = (state as any).runner?.openhand;
        if (tagged) {
          if (!gripRevealed) {
            coreSay.systemMsg(state, 'corp', `uses ${coreCard.getTitle(card)} make the Runner play with [runner-pronoun] grip revealed`);
            const grip = (state as any).runner?.hand || [];
            const gripStr = grip.length > 0 ? utils.enumerateCards(grip) : 'no cards';
            coreSay.systemMsg(state, 'corp', `uses ${coreCard.getTitle(card)} to see that the Runner currently has ${gripStr} in [runner-pronoun] grip`);
            coreRevealing.revealHand(state, 'runner');
          }
        } else {
          if (gripRevealed) {
            const grip = (state as any).runner?.hand || [];
            const gripStr = grip.length > 0 ? utils.enumerateCards(grip) : 'no cards';
            coreSay.systemMsg(state, 'corp', `uses ${coreCard.getTitle(card)} to note that the Runner had ${gripStr} in [runner-pronoun] grip before it was concealed`);
            coreRevealing.concealHand(state, 'runner');
          }
        }
      })
    }
  ],
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    if (utils.isTagged?.(state) ?? false) coreRevealing.revealHand(state, 'runner');
  }),
  leavePlay: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    if (utils.isTagged?.(state) ?? false) coreRevealing.concealHand(state, 'runner');
  })
};

/** Harmony Medtech: Biomedical Pioneer */
export const card_HarmonyMedtech_BiomedicalPioneer: CardDef = {
  title: 'Harmony Medtech: Biomedical Pioneer',
  staticAbilities: [{ type: 'agenda-point-req', value: -1 }]
};

/** Hayley Kaplan: Universal Scholar */
export const card_HayleyKaplan_UniversalScholar: CardDef = {
  title: 'Hayley Kaplan: Universal Scholar',
  events: [{
    event: 'runner-install',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if (!coreEvents.firstEvent(state, side, 'runner-install')) return false;
      if ((targets as any)[0]?.context?.facedown) return false;
      const allInstalled = coreBoard.allActiveInstalled(state, 'runner');
      return allInstalled.some((c: Card) => {
        const flag = coreFlags.cardFlag?.(c, 'runner-install-draw');
        return flag;
      });
    }),
    async: true, waitingPrompt: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const itarget = context.card ? coreCard.getCard(state, context.card) : null;
      const cardType = itarget ? (itarget.type || '') : '';
      const inHand = coreDefHelpers.allCardsInHandStar(state, 'runner') || [];
      const sameType = inHand.some((c: Card) => coreCard.isType(c, cardType));
      if (sameType) {
        const ability: any = {
          optional: {
            prompt: `Install another ${cardType} from the grip?`,
            yesAbility: {
              prompt: `Choose a ${cardType} to install`,
              choices: { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return coreCard.isType(targets[0], cardType) && coreDefHelpers.inHandStar(state, targets[0]); }) },
              async: true,
              effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
                coreInstalling.runnerInstall(state, side, { ...eid, source: card, sourceType: 'runner-install' }, targets[0], {
                  msgKeys: { 'install-source': card, 'display-origin': true }
                });
              })
            }
          }
        };
        continue_ability(state, side, ability, card, null);
      } else {
        continue_ability(state, side, { prompt: `You have no ${cardType} to install`, choices: ['Carry on!'], promptType: 'bogus' }, card, null);
      }
    })
  }]
};

/** Hiram "0mission" Svensson: Shadow of the Past */
export const card_Hiram0missionSvensson_ShadowOfThePast: CardDef = {
  title: 'Hiram "0mission" Svensson: Shadow of the Past',
  events: [
    {
      event: 'runner-install',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const context = (targets as any)[0]?.context || {};
        const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
        return contextCard && coreCard.hardware(contextCard);
      }),
      msg: msg('look at ', (c: any) => c.title || 'the top card', ' on top of R&D'),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        coreDefHelpers.scry(state, side, card, 'corp', 1);
      })
    },
    {
      event: 'runner-trash',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return (targets as any[]).some((t: any) => {
          const context = t.context || {};
          const ctxCard = context.card ? coreCard.getCard(state, context.card) : null;
          return ctxCard && coreCard.hardware(ctxCard);
        });
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        coreDefHelpers.scry(state, side, card, 'corp', 1);
      })
    }
  ]
};

/** Hoshiko Shiro: Untold Protagonist */
export const card_HoshikoShiro_UntoldProtagonist: CardDef = {
  title: 'Hoshiko Shiro: Untold Protagonist',
  staticAbilities: [
    coreLink.linkPlus(req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return card.flipped ? 1 : 0; }), 1),
    {
      type: 'gain-subtype',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return coreCard.sameCard(card, targets[0]) && card.flipped;
      }),
      value: 'Digital'
    },
    {
      type: 'lose-subtype',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return coreCard.sameCard(card, targets[0]) && card.flipped;
      }),
      value: 'Natural'
    }
  ],
  events: [
    {
      event: 'pre-first-turn',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return side === 'runner'; }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        coreUpdate.update!(state, side, { ...card, flipped: false, face: 'front' });
      })
    },
    {
      event: 'runner-turn-ends',
      automatic: 'gain-credits', interactive: true, async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const run = (state as any).runner;
        const accessedCards = run?.register?.accessedCards;
        if (card.flipped && !accessedCards) {
          coreSay.systemMsg(state, 'runner', 'flips [their] identity to Hoshiko Shiro: Untold Protagonist');
          coreUpdate.update!(state, side, { ...card, flipped: false, face: 'front', code: (card.code || '').substring(0, 5), subtype: 'Natural' });
          coreLink.updateLink(state);
        } else if (!card.flipped && accessedCards) {
          yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, 'runner', 2)], []);
          coreSay.systemMsg(state, 'runner', 'gains 2 [Credits] and flips [their] identity to Hoshiko Shiro: Mahou Shoujo');
          coreUpdate.update!(state, side, { ...card, flipped: true, face: 'back', code: (card.code || '').substring(0, 5) + 'flip', subtype: 'Digital' });
          coreLink.updateLink(state);
        }
        return coreEid.effectCompleted(state, side, eid);
      })
    },
    {
      event: 'runner-turn-begins',
      automatic: 'lose-credits',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return card.flipped; }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, 'runner', 1)], []);
        yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.loseCredits(state, 'runner', coreEid.makeEid(state, eid), 1)], []);
        coreSay.systemMsg(state, 'runner', `uses ${card.title} to draw 1 card and lose 1 [Credits]`);
        return coreEid.effectCompleted(state, side, eid);
      })
    }
  ],
  abilities: [{
    label: 'flip identity',
    msg: 'flip [their] identity manually',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if (card.flipped) {
        coreUpdate.update!(state, side, { ...card, flipped: false, face: 'front', code: (card.code || '').substring(0, 5), subtype: 'Natural' });
      } else {
        coreUpdate.update!(state, side, { ...card, flipped: true, face: 'back', code: (card.code || '').substring(0, 5) + 'flip', subtype: 'Digital' });
      }
      coreLink.updateLink(state);
    })
  }]
};

/** Hyoubu Institute: Absolute Clarity */
export const card_HyoubuInstitute_AbsoluteClarity: CardDef = {
  title: 'Hyoubu Institute: Absolute Clarity',
  events: [{
    event: 'corp-reveal',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const cards = context.cards || [];
      if (cards.length <= 0) return false;
      return coreEvents.firstEvent(state, side, 'corp-reveal', (ctx: any) => (ctx.cards || []).length > 0);
    }),
    msg: 'gain 1 [Credits]', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits(eid, 1); })
  }],
  abilities: [
    {
      action: true, cost: [corePayment.toC('click', 1)],
      label: 'Reveal the top card of the Stack', async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const revealed = ((state as any).runner?.deck || [])[0];
        if (revealed) {
          coreSay.systemMsg(state, side, `uses ${card.title} to reveal ${revealed.title} from the top of the Stack`);
          coreRevealing.reveal(state, side, eid, revealed);
        }
      })
    },
    {
      action: true, cost: [corePayment.toC('click', 1)],
      label: 'Reveal a random card from the Grip', async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const hand = ((state as any).runner?.hand || []).slice();
        const revealed = hand[Math.floor(Math.random() * hand.length)];
        if (revealed) {
          coreSay.systemMsg(state, side, `uses ${card.title} to reveal ${revealed.title} from the Grip`);
          coreRevealing.reveal(state, side, eid, revealed);
        }
      })
    }
  ]
};

/** Iain Stirling: Retired Spook */
export const card_IainStirling_RetiredSpook: CardDef = {
  title: 'Iain Stirling: Retired Spook',
  flags: { 'drip-economy': true },
  events: [{
    event: 'runner-turn-begins',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return ((state as any).corp?.agendaPoint || 0) > ((state as any).runner?.agendaPoint || 0);
    }),
    automatic: 'gain-credits', msg: 'gain 2 [Credits]', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits(eid, 2); })
  }],
  abilities: [{
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return ((state as any).corp?.agendaPoint || 0) > ((state as any).runner?.agendaPoint || 0);
    }),
    once: 'per-turn', automatic: 'gain-credits', msg: 'gain 2 [Credits]', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits(eid, 2); })
  }]
};

/** Industrial Genomics: Growing Solutions */
export const card_IndustrialGenomics_GrowingSolutions: CardDef = {
  title: 'Industrial Genomics: Growing Solutions',
  staticAbilities: [{
    type: 'trash-cost',
    value: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return ((state as any).corp?.discard || []).filter((c: Card) => !c.seen).length;
    })
  }]
};

/** Information Dynamics: All You Need To Know */
export const card_InformationDynamics_AllYouNeedToKnow: CardDef = {
  title: 'Information Dynamics: All You Need To Know',
  events: [
    { event: 'pre-start-game', effect: effect(function*(state: State): Generator<any, any, any> { draftPointsTarget(state); }) },
    {
      event: 'agenda-scored',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        if (card.disabled || coreEffects.isDisabled(state, side, card)) return false;
        return hasMostFaction(state, 'corp', 'NBN');
      }),
      interactive: true, msg: 'give the Runner 1 tag', async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreTags.gainTags('corp', eid, 1); })
    },
    {
      event: 'agenda-stolen',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        if (card.disabled || coreEffects.isDisabled(state, side, card)) return false;
        return hasMostFaction(state, 'corp', 'NBN');
      }),
      interactive: true, msg: 'give the Runner 1 tag', async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreTags.gainTags('corp', eid, 1); })
    }
  ]
};

/** Issuaq Adaptics: Sustaining Diversity */
export const card_IssuaqAdaptics_SustainingDiversity: CardDef = {
  title: 'Issuaq Adaptics: Sustaining Diversity',
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    coreGaining.gain('agenda-point-req', coreCard.getCounters(card, 'power'));
  }),
  leavePlay: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    coreGaining.gain('agenda-point-req', coreCard.getCounters(card, 'power'));
  }),
  staticAbilities: [{
    type: 'agenda-point-req',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return side === 'corp'; }),
    value: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return -(coreCard.getCounters(card, 'power') || 0);
    })
  }],
  events: [{
    event: 'agenda-scored', interactive: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const corpInstallEvents = coreEvents.turnEvents(state, side, 'corp-install') || [];
      const advanceEvents = coreEvents.turnEvents(state, side, 'advance') || [];
      const context = (targets as any)[0]?.context || {};
      const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
      if (!contextCard) return true;
      const matchesInstall = corpInstallEvents.every((e: any) => !coreCard.sameCard(contextCard, e[0].card));
      const matchesAdvance = advanceEvents.every((e: any) => !coreCard.sameCard(contextCard, e[0].card));
      return matchesInstall && matchesAdvance;
    }),
    msg: 'put 1 charge counter on itself', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreProps.addCounter(state, side, eid, card, 'power', 1);
    })
  }]
};

/** Jamie "Bzzz" Micken: Techno Savant */
export const card_JamieBzzzMicken_TechnoSavant: CardDef = {
  title: 'Jamie "Bzzz" Micken: Techno Savant',
  events: [
    { event: 'pre-start-game', effect: effect(function*(state: State): Generator<any, any, any> { draftPointsTarget(state); }) },
    {
      event: 'runner-install',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return hasMostFaction(state, 'runner', 'Shaper') && coreEvents.firstEvent(state, side, 'runner-install');
      }),
      msg: 'draw 1 card', async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreDrawing.draw(eid, 1); })
    }
  ]
};

/** Jemison Astronautics: Sacrifice. Audacity. Success. */
export const card_JemisonAstronautics_SacrificeAudacitySuccess: CardDef = {
  title: 'Jemison Astronautics: Sacrifice. Audacity. Success.',
  events: [{
    event: 'corp-forfeit-agenda',
    async: true, waitingPrompt: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const p = (coreCard.getAgendaPoints(context.card) || 0) + 1;
      continue_ability(state, side, {
        prompt: 'Choose a card to place advancement counters on',
        choices: { card: (c: Card) => coreCard.installed(c) && coreCard.corp(c) },
        msg: msg('place ', (n: number) => utils.quantify(n, 'advancement counter'), ' on ', (c: Card) => coreToString.cardStr(state, c) || ''),
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          coreProps.addProp('corp', eid, targets[0], 'advance-counter', p, { placed: true });
        })
      }, card, null);
    })
  }]
};

/** Jesminder Sareen: Girl Behind the Curtain */
export const card_JesminderSareen_GirlBehindTheCurtain: CardDef = {
  title: 'Jesminder Sareen: Girl Behind the Curtain',
  staticAbilities: [{
    type: 'forced-to-avoid-tag',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const run = (state as any).run;
      if (!run) return false;
      return (coreEvents.runEventCount(state, side, 'tag-interrupt') || 0) === 0;
    }),
    value: true
  }],
  events: [{
    event: 'tag-interrupt', async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const run = (state as any).run;
      if (!run) return false;
      return (coreEvents.runEventCount(state, side, 'tag-interrupt') || 0) <= 1;
    }),
    msg: 'avoid 1 tag',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { corePrevention.preventTag('runner', eid, 1); })
  }]
};

/** Jinteki Biotech: Life Imagined */
export const card_JintekiBiotech_LifeImagined: CardDef = {
  title: 'Jinteki Biotech: Life Imagined',
  events: [{
    event: 'pre-first-turn',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return side === 'corp'; }),
    prompt: msg('Choose a copy of ', (c: Card) => c.title || '', ' to use this game'),
    choices: ['The Brewery', 'The Tank', 'The Greenhouse'],
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreUpdate.update!(state, side, { ...card, 'biotech-target': targets[0], face: 'front' });
      coreSay.systemMsg(`has chosen a copy of ${card.title} for this game`);
    })
  }],
  abilities: [
    {
      label: 'Check chosen flip identity',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const target = card['biotech-target'];
        if (target === 'The Brewery') coreToasts.toast(state, 'corp', 'Flip to: The Brewery (Do 2 net damage)', 'info');
        else if (target === 'The Tank') coreToasts.toast(state, 'corp', 'Flip to: The Tank (Shuffle Archives into R&D)', 'info');
        else if (target === 'The Greenhouse') coreToasts.toast(state, 'corp', 'Flip to: The Greenhouse (Place 4 advancement counters on a card)', 'info');
        else coreToasts.toast(state, 'corp', 'No flip identity specified', 'info');
      })
    },
    {
      action: true, cost: [corePayment.toC('click', 3)],
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return !card['biotech-used']; }),
      label: 'Flip this identity', async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        coreUpdate.update!(state, side, { ...coreCard.getCard(state, card), 'biotech-used': true });
        const flip = card['biotech-target'];
        if (flip === 'The Brewery') {
          coreSay.systemMsg(state, side, `uses The Brewery to do 2 net damage`);
          coreUpdate.update!(state, side, { ...card, code: 'brewery', face: 'brewery' });
          coreDamage.damage(state, side, eid, 'net', 2, { card });
        } else if (flip === 'The Tank') {
          coreSay.systemMsg(state, side, `uses The Tank to shuffle Archives into R&D`);
          coreShuffling.shuffleIntoDeck(state, side, 'discard');
          coreUpdate.update!(state, side, { ...card, code: 'tank', face: 'tank' });
          return coreEid.effectCompleted(state, side, eid);
        } else if (flip === 'The Greenhouse') {
          coreSay.systemMsg(state, side, `uses The Greenhouse to place 4 advancement counters on a card that can be advanced`);
          coreUpdate.update!(state, side, { ...card, code: 'greenhouse', face: 'greenhouse' });
          continue_ability(state, side, {
            prompt: 'Choose a card that can be advanced',
            choices: { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return coreCard.canBeAdvanced(state, targets[0]); }) },
            async: true,
            effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
              coreProps.addProp(eid, targets[0], 'advance-counter', 4, { placed: true });
            })
          }, card, null);
        } else {
          coreToasts.toast(state, 'corp', `Unknown Jinteki Biotech: Life Imagined card: ${flip}`, 'error');
          return coreEid.effectCompleted(state, side, eid);
        }
      })
    }
  ]
};

/** Jinteki: Personal Evolution */
export const card_Jinteki_PersonalEvolution: CardDef = {
  title: 'Jinteki: Personal Evolution',
  events: [
    { event: 'agenda-scored', effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreDamage.damage(eid, 'net', 1, { card }); }) },
    { event: 'agenda-stolen', effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreDamage.damage(eid, 'net', 1, { card }); }) }
  ]
};

/** Jinteki: Potential Unleashed */
export const card_Jinteki_PotentialUnleashed: CardDef = {
  title: 'Jinteki: Potential Unleashed',
  events: [{
    event: 'damage', async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return (targets as any)[0]?.context?.damageType === 'net';
    }),
    changeInGameState: { silent: true, req: req(function*(state: State): Generator<any, any, any> { return ((state as any).runner?.deck || []).length > 0; }) },
    msg: msg('trash ', (r: any) => (r.hand || [])[0]?.title || 'the top card', ' from the top of the stack'),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreMoving.mill('corp', eid, 'runner', 1); })
  }]
};

/** Jinteki: Replicating Perfection */
export const card_Jinteki_ReplicatingPerfection: CardDef = {
  title: 'Jinteki: Replicating Perfection',
  staticAbilities: [{
    type: 'cannot-run-on-server',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreEvents.eventCount(state, side, 'run', (ctx: any) => coreServers.isCentral(ctx[0]?.server || '')) === 0;
    }),
    value: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const remotes = coreBoard.getRemotes(state);
      return Object.keys(remotes || {});
    })
  }]
};

/** Jinteki: Restoring Humanity */
export const card_Jinteki_RestoringHumanity: CardDef = {
  title: 'Jinteki: Restoring Humanity',
  events: [{
    event: 'corp-turn-ends', automatic: 'gain-credits',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return ((state as any).corp?.discard || []).filter((c: Card) => !c.seen).length > 0;
    }),
    msg: 'gain 1 [Credits]', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits('corp', eid, 1); })
  }]
};

/** Kabonesa Wu: Netspace Thrillseeker */
export const card_KabonesaWu_NetspaceThrillseeker: CardDef = {
  title: 'Kabonesa Wu: Netspace Thrillseeker',
  abilities: [{
    action: true, cost: [corePayment.toC('click', 1)],
    label: 'Install a non-virus program from the stack, lowering the cost by 1 [Credit]',
    prompt: 'Choose a program',
    changeInGameState: { req: req(function*(state: State): Generator<any, any, any> { return ((state as any).runner?.deck || []).length > 0; }) },
    choices: (state: any) => {
      const deck = ((state as any).runner?.deck || []);
      return corePrompts.cancellable(deck.filter((c: Card) =>
        coreCard.program(c) && !coreCard.hasSubtype(c, 'Virus') &&
        corePayment.canPay(state, 'runner', { ...eid, source: card, sourceType: 'runner-install' }, c, null,
          [corePayment.toC('credit', (coreCostFns.installCost(state, side, c, { 'cost-bonus': -1 }) || 0))])
      ));
    },
    async: true, waitingPrompt: true,
    cancel: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => ({ action: true, cost: [corePayment.toC('click', 1)] }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const target = targets[0];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreInstalling.runnerInstall(state, side, target, { 'cost-bonus': -1, msgKeys: { 'display-origin': true, 'install-source': card } })], []);
      const installedCard = (state as any).__lastAsyncResult;
      coreEngine.registerEvents(state, side, card, [{
        event: 'runner-turn-ends',
        interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return coreCard.getCard(state, installedCard); }),
        silent: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return !coreCard.getCard(state, installedCard); }),
        changeInGameState: { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return coreCard.getCard(state, installedCard); }) },
        abilityName: `Kabonesa Wu (${installedCard.title})`,
        msg: msg('remove ', (c: Card) => c.title || '', ' from the game'),
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          coreMoving.move(state, side, coreCard.getCard(state, installedCard), 'rfg');
        })
      }]);
      return coreEid.effectCompleted(state, side, eid);
    })
  }]
};

/** Kate "Mac" McCaffrey: Digital Tinker */
export const card_KateMacMcCaffrey_DigitalTinker: CardDef = {
  title: 'Kate "Mac" McCaffrey: Digital Tinker',
  staticAbilities: [{
    type: 'install-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const isKateType = coreCard.hardware(targets[0]) || coreCard.program(targets[0]);
      if (!isKateType) return false;
      const triggered = coreEvents.eventCount(state, 'runner', 'runner-install', (ctx: any) => {
        const c = ctx.card;
        return c && (coreCard.hardware(c) || coreCard.program(c));
      });
      return triggered === 0;
    }),
    value: -1
  }]
};

/** Ken "Express" Tenma: Disappeared Clone */
export const card_KenExpressTenma_DisappearedClone: CardDef = {
  title: 'Ken "Express" Tenma: Disappeared Clone',
  events: [{
    event: 'play-event',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
      if (!contextCard || !coreCard.hasSubtype(contextCard, 'Run')) return false;
      return coreEvents.firstEvent(state, 'runner', 'play-event', (ctx: any) => {
        const c = ctx.card ? coreCard.getCard(state, ctx.card) : null;
        return c && coreCard.hasSubtype(c, 'Run');
      });
    }),
    msg: 'gain 1 [Credits]', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits(eid, 1); })
  }]
};

/** Khan: Savvy Skiptracer */
export const card_Khan_SavvySkiptracer: CardDef = {
  title: 'Khan: Savvy Skiptracer',
  events: [{
    event: 'pass-ice',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreEvents.firstEvent(state, 'runner', 'pass-ice');
    }),
    async: true, interactive: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const runner = (state as any).runner;
      const hand = runner?.hand || [];
      const canInstall = hand.some((c: Card) => {
        if (!coreCard.hasSubtype(c, 'Icebreaker')) return false;
        const cost = coreCostFns.installCost(state, side, c, { 'cost-bonus': -1 });
        return corePayment.canPay(state, side, { ...eid, source: card, sourceType: 'runner-install' }, c, null, [corePayment.toC('credit', cost || 0)]);
      });
      if (canInstall) {
        continue_ability(state, side, {
          prompt: 'Choose an icebreaker to install',
          choices: {
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
              return coreCard.inHandStar(state, targets[0]) && coreCard.hasSubtype(targets[0], 'Icebreaker') &&
                corePayment.canPay(state, side, { ...eid, source: card, sourceType: 'runner-install' }, targets[0], null,
                  [corePayment.toC('credit', (coreCostFns.installCost(state, side, targets[0], { 'cost-bonus': -1 }) || 0))]);
            })
          },
          async: true,
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            coreInstalling.runnerInstall(state, side, eid, targets[0], { 'cost-bonus': -1, msgKeys: { 'display-origin': true, 'install-source': card } });
          })
        }, card, null);
      }
    })
  }]
};

/** Laramy Fisk: Savvy Investor */
export const card_LaramyFisk_SavvyInvestor: CardDef = {
  title: 'Laramy Fisk: Savvy Investor',
  events: [{
    event: 'successful-run', skippable: true, async: true,
    interactive: coreOptional.getAutoresolve('auto-fire', (v: any) => !coreOptional.never(v)),
    silent: coreOptional.getAutoresolve('auto-fire', (v: any) => coreOptional.never(v) ? true : false),
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const context = (targets as any)[0]?.context || {};
        if (!coreServers.isCentral(context.server || '')) return false;
        return coreEvents.firstEvent(state, side, 'successful-run', (ctx: any) => coreServers.isCentral(ctx[0]?.server || ''));
      }),
      autoResolve: coreOptional.getAutoresolve('auto-fire'),
      prompt: 'Force the Corp to draw 1 card?',
      yesAbility: { msg: 'force the Corp to draw 1 card', async: true, effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreDrawing.draw('corp', eid, 1); }) },
      noAbility: { effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreSay.systemMsg(`declines to use ${card.title}`); }) }
    }
  }],
  abilities: [{ effect: effect(function*(state: State): Generator<any, any, any> { coreOptional.setAutoresolve('auto-fire', 'Laramy Fisk: Savvy Investor'); }) }]
};

/** Lat: Ethical Freelancer */
export const card_Lat_EthicalFreelancer: CardDef = {
  title: 'Lat: Ethical Freelancer',
  events: [{
    event: 'runner-turn-ends', interactive: true, async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const run = (state as any).runner;
      const corp = (state as any).corp;
      const runHand = run?.hand || [];
      const corpHand = corp?.hand || [];
      continue_ability(state, side, {
        optional: {
          req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return runHand.length === corpHand.length; }),
          autoResolve: coreOptional.getAutoresolve('auto-fire'),
          waitingPrompt: true,
          prompt: 'Draw 1 card?',
          yesAbility: { async: true, msg: 'draw 1 card', effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreDrawing.draw('runner', eid, 1); }) },
          noAbility: { effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreSay.systemMsg(`declines to use ${card.title}`); }) }
        }
      }, card, null);
    })
  }],
  abilities: [{ effect: effect(function*(state: State): Generator<any, any, any> { coreOptional.setAutoresolve('auto-fire', 'Lat: Ethical Freelancer'); }) }]
};

/** Leela Patel: Trained Pragmatist */
export const card_LeelaPatel_TrainedPragmatist: CardDef = {
  title: 'Leela Patel: Trained Pragmatist',
  events: [
    {
      event: 'agenda-scored',
      interactive: true, prompt: 'Choose an unrezzed card to return to HQ',
      choices: { card: (c: Card) => !coreCard.faceup(c) && coreCard.installed(c) && coreCard.corp(c), all: true },
      changeInGameState: { silent: true, req: req(function*(state: State): Generator<any, any, any> { return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => !coreCard.faceup(c) && coreCard.installed(c)); }) },
      msg: msg('add ', (c: Card) => coreToString.cardStr(state, c) || '', ' to HQ'),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreMoving.move('corp', targets[0], 'hand'); })
    },
    {
      event: 'agenda-stolen',
      interactive: true, prompt: 'Choose an unrezzed card to return to HQ',
      choices: { card: (c: Card) => !coreCard.faceup(c) && coreCard.installed(c) && coreCard.corp(c), all: true },
      changeInGameState: { silent: true, req: req(function*(state: State): Generator<any, any, any> { return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => !coreCard.faceup(c) && coreCard.installed(c)); }) },
      msg: msg('add ', (c: Card) => coreToString.cardStr(state, c) || '', ' to HQ'),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreMoving.move('corp', targets[0], 'hand'); })
    }
  ]
};

/** LEO Construction: Labor Solutions */
export const card_LEOConstruction_LaborSolutions: CardDef = {
  title: 'LEO Construction: Labor Solutions',
  abilities: [{
    cost: [corePayment.toC('bioroid-run-server', 1)], once: 'per-turn',
    label: 'end the run', msg: 'end the run', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreRuns.endRun(state, side, eid, card); })
  }]
};

/** Liza Talking Thunder: Prominent Legislator */
export const card_LizaTalkingThunder_ProminentLegislator: CardDef = {
  title: 'Liza Talking Thunder: Prominent Legislator',
  events: [{
    event: 'successful-run', automatic: 'draw-cards', async: true, interactive: true,
    msg: 'draw 2 cards and take 1 tag',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      if (!coreServers.isCentral(context.server || '')) return false;
      return coreEvents.firstEvent(state, side, 'successful-run', (ctx: any) => coreServers.isCentral(ctx[0]?.server || ''));
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, 'runner', 2, { suppressCheckpoint: true })], []);
      coreTags.gainTags(state, 'runner', eid, 1);
    })
  }]
};

/** Los: Data Hijacker */
export const card_Los_DataHijacker: CardDef = {
  title: 'Los: Data Hijacker',
  events: [{
    event: 'rez',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
      return contextCard && coreCard.ice(contextCard) && coreEvents.firstEvent(state, side, 'rez', (ctx: any) => {
        const c = ctx.card ? coreCard.getCard(state, ctx.card) : null;
        return c && coreCard.ice(c);
      });
    }),
    msg: 'gain 2 [Credits]', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits('runner', eid, 2); })
  }]
};

/** Magdalene Keino-Chemutai: Cryptarchitect */
export const card_MagdaleneKeinoChemutai_Cryptarchitect: CardDef = {
  title: 'Magdalene Keino-Chemutai: Cryptarchitect',
  events: [{
    event: 'runner-discard-to-hand-size', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const cards = context.cards || [];
      const installable = cards.filter((c: Card) =>
        (coreCard.hardware(c) || coreCard.program(c)) &&
        coreInstalling.runnerCanPayAndInstall(state, 'runner', eid, c, { noToast: true })
      );
      if (installable.length > 0) {
        continue_ability(state, side, {
          prompt: 'Install a discarded program or piece of hardware?',
          choices: corePrompts.cancellable(installable),
          async: true,
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            coreInstalling.runnerInstall(state, side, eid, targets[0], { msgKeys: { 'install-source': card, 'display-origin': true } });
          })
        }, card, null);
      }
    })
  }]
};

/** MaxX: Maximum Punk Rock */
export const card_MaxX_MaximumPunkRock: CardDef = {
  title: 'MaxX: Maximum Punk Rock',
  flags: {
    'runner-turn-draw': true,
    'runner-phase-12': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if (card.disabled) return false;
      if (coreEffects.isDisabled(state, side, card)) return false;
      const allActive = coreBoard.allActiveInstalled(state, 'runner') || [];
      return allActive.some((c: Card) => coreFlags.cardFlag?.(c, 'runner-turn-draw') === true);
    })
  },
  events: [{
    event: 'runner-turn-begins',
    prompt: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const deck = ((state as any).runner?.deck || []);
      if (deck.length > 0) return `trash ${utils.enumerateCards(deck.slice(0, 2))} from the stack and draw 1 card`;
      return 'trash the top 2 cards from the stack and draw 1 card - but the stack is empty';
    }),
    label: 'trash and draw cards', once: 'per-turn', automatic: 'post-draw-cards', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.mill('runner', 'runner', 2)], []);
      coreDrawing.draw(state, 'runner', eid, 1);
    })
  }],
  abilities: [{
    msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const deck = ((state as any).runner?.deck || []);
      if (deck.length > 0) return `trash ${utils.enumerateCards(deck.slice(0, 2))} from the stack and draw 1 card`;
      return 'trash the top 2 cards from the stack and draw 1 card - but the stack is empty';
    }),
    label: 'trash and draw cards', once: 'per-turn', automatic: 'post-draw-cards', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.mill('runner', 'runner', 2)], []);
      coreDrawing.draw(state, 'runner', eid, 1);
    })
  }]
};
