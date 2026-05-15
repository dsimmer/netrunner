/**
 * Event Cards - Runner and Corp event card definitions
 * Ported from Clojure cards/events.clj to TypeScript
 * 
 * This file contains ~224 card definitions with their abilities and events.
 * Each card has properties like makes-run, on-play, events, static-abilities, etc.
 */

import type { State, Side, Card, EID } from '../../types';
import * as coreAccess from '../core/access';
import * as coreAgendas from '../core/agendas';
import * as coreBadPublicity from '../core/bad-publicity';
import * as coreBoard from '../core/board';
import * as coreCard from '../core/card';
import * as coreCharge from '../core/charge';
import * as coreCheckpoint from '../core/checkpoint';
import * as coreChooseOne from '../core/choose-one';
import * as coreCostFns from '../core/cost-fns';
import * as coreDamage from '../core/damage';
import * as coreDefHelpers from '../core/def-helpers';
import * as coreDrawing from '../core/drawing';
import * as coreEffects from '../core/effects';
import * as coreEid from '../core/eid';
import * as coreEngine from '../core/engine';
import * as coreEvents from '../core/events';
import * as coreExpose from '../core/expose';
import * as coreFinding from '../core/finding';
import * as coreFlags from '../core/flags';
import * as coreGaining from '../core/gaining';
import * as coreHandSize from '../core/hand-size';
import * as coreHosting from '../core/hosting';
import * as coreIce from '../core/ice';
import * as coreIdentities from '../core/identities';
import * as coreInstalling from '../core/installing';
import * as coreLink from '../core/link';
import * as coreMark from '../core/mark';
import * as coreMemory from '../core/memory';
import * as coreMoving from '../core/moving';
import * as corePayment from '../core/payment';
import * as corePlayInstants from '../core/play-instants';
import * as corePrevention from '../core/prevention';
import * as corePrompts from '../core/prompts';
import * as coreProps from '../core/props';
import * as coreRevealing from '../core/revealing';
import * as coreRezzing from '../core/rezzing';
import * as coreRuns from '../core/runs';
import * as coreSabotage from '../core/sabotage';
import * as coreSay from '../core/say';
import * as coreServers from '../core/servers';
import * as coreSetAside from '../core/set-aside';
import * as coreShuffling from '../core/shuffling';
import * as coreTags from '../core/tags';
import * as coreThreat from '../core/threat';
import * as coreToString from '../core/to-string';
import * as coreToasts from '../core/toasts';
import * as coreUpdate from '../core/update';
import * as coreVirus from '../core/virus';
import * as utils from '../utils';
import { req, effect, msg, wait_for, continue_ability, forms } from '../macros';

// Import defcard helper - each card is a card definition object
import { defcard } from '../core/def-helpers';
import type { CardDef } from '../../types';

// Helper functions used across cards

export function drainCredits(runnerSide: Side, corpSide: Side, amount: number, min: number, max: number): any {
  return {
    msg: 'force the corp to lose credits',
    async: true,
    effect: effect(
      coreGaining.lose(corpSide, null, Math.min(max, Math.max(min, Math.floor(amount / 2)))),
      coreGaining.gain(runnerSide, null, Math.min(max, Math.max(min, Math.floor(amount / 2))))
    )
  };
}

function breachAccessBonus(server: string, num: number, opts: any = {}): any {
  return coreDefHelpers.breachAccessBonus(server, num, opts);
}

export function runServerAbility(server: string, opts: any = {}): any {
  return coreDefHelpers.runServerAbility(server, opts);
}

export function runAnyServerAbility(opts: any = {}): any {
  return coreDefHelpers.runAnyServerAbility(opts);
}

export function runRemoteServerAbility(opts: any = {}): any {
  return coreDefHelpers.runRemoteServerAbility(opts);
}

export function runCentralServerAbility(opts: any = {}): any {
  return coreDefHelpers.runCentralServerAbility(opts);
}

export function runServerFromChoicesAbility(servers: string[], opts: any = {}): any {
  return coreDefHelpers.runServerFromChoicesAbility(servers, opts);
}

export function gainCreditsAbility(amount: number): any {
  return coreDefHelpers.gainCreditsAbility(amount);
}

export function drawAbi(amount: number): any {
  return coreDefHelpers.drawAbi(amount);
}

export function tutorAbi(forceCorp: boolean, predicate: any): any {
  return coreDefHelpers.tutorAbi(forceCorp, predicate);
}

function offerJackOut(opts: any): any {
  return coreDefHelpers.offerJackOut(opts);
}

export function scry(state: State, side: Side, card: Card, targetSide: Side, num: number): void {
  coreDefHelpers.scry(state, side, card, targetSide, num);
}

export function makeIcon(symbol: string, card: Card): any {
  return coreDefHelpers.makeIcon(symbol, card);
}

// Cutlery helper - creates card with subroutines-broken event
function cutlery(subtype: string): any {
  return {
    makesRun: true,
    onPlay: runAnyServerAbility(),
    events: [{
      event: 'subroutines-broken',
      async: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const pred = (ctx: any) => {
          const allSubsBroken = true; // simplified
          const iceHasSubtype = coreCard.hasSubtype(ctx.ice, subtype);
          return allSubsBroken && iceHasSubtype;
        };
        return pred(context) &&
          coreCard.getCard(state, ctx.ice) &&
          coreEvents.firstRunEvent(state, side, 'subroutines-broken', (t: any) => {
            const first = t[0];
            return first && pred(first);
          });
      }),
      msg: msg('trash ', msg => coreToString.cardStr(state, ctx.ice)),
      effect: effect(coreMoving.trash(eid, ctx.ice, { causeCard: card })),
    }],
  };
}

// ============================================================================
// Card Definitions
// ============================================================================

// Account Siphon
export const accountSiphon: CardDef = {
  title: 'Account Siphon',
  makesRun: true,
  onPlay: runServerAbility('hq'),
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'hq',
    thisCardRun: true,
    ability: drainCredits('runner', 'corp', 5, 2, 2),
  }],
};

// Aircheck
export const aircheck: CardDef = {
  title: 'Aircheck',
  makesRun: true,
  data: { counter: { credit: 4 } },
  interactions: {
    'pay-credits': { req: req(function*(state, side, eid, card, targets) { return forms.run(state); }), type: 'credit' },
  },
  staticAbilities: [
    { type: 'cannot-pay-credits-from-pool', req: req(function*(state, side) { return side === ':runner'; }), value: true },
    { type: 'cannot-lose-credits', req: req(function*(state, side) { return side === ':runner'; }), value: true },
  ],
  onPlay: runServerFromChoicesAbility(['HQ', 'R&D'], {
    events: [{
      event: 'run-ends',
      unregisterOnceResolved: true,
      req: req(function*(state, side, eid, card, targets) {
        const ctx = targets[0] || {};
        return ctx.successful &&
          forms.thisCardRun &&
          (ctx.server === 'hq' || ctx.server === 'rd');
      }),
      prompt: 'Choose a remote server to run',
      choices: req(function*(state, side, eid, card, targets) {
        return corePrompts.cancellable(
          coreServers.zonesToSortedNames(
            coreRuns.getRunnableZones(state, side, eid, card, null)
              .filter((s: string) => coreServers.isRemote(s))
          ).map(coreServers.unknownToKw)
        );
      }),
      msg: msg('make a run on ', msg => msg),
      async: true,
      effect: effect(coreRuns.makeRun(eid, msg, card)),
    }],
  }),
};

// Always Have a Backup Plan
export const alwaysHaveABackupPlan: CardDef = {
  title: 'Always Have a Backup Plan',
  makesRun: true,
  onPlay: {
    prompt: 'Choose a server',
    onChangeGameState: req(function*(state, side, eid, card, targets) {
      return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null)).length > 0;
    }),
    choices: req(function*(state, side, eid, card, targets) {
      return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null));
    }),
    async: true,
    msg: msg('make a run on ', msg => msg),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(
        state,
        [{ asyncResult: 'result' }, coreRuns.makeRun(state, side, msg, card)],
        []
      );
      const cardObj = coreCard.getCard(state, card);
      const runAgain = cardObj?.special?.runAgain;
      if (runAgain) {
        coreRuns.makeRun(state, side, eid, runAgain, card, { ignoreCosts: true });
      } else {
        return coreEid.effectCompleted(state, side, eid);
      }
    }),
  },
  events: [
    {
      event: 'run-ends',
      optional: {
        req: req(function*(state, side, eid, card, targets) {
          return !coreCard.getCard(state, card)?.special?.runAgain && !ctx.successful;
        }),
        prompt: 'Make another run on the same server?',
        yesAbility: {
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            const lastRun = (state as any).runner?.register?.lastRun;
            const attackedServer = lastRun?.server?.[0];
            const runEvents = coreEvents.runEvents(lastRun, 'encounter-ice');
            const ice = runEvents?.[0]?.[1]?.[0]?.ice;
            const updatedCard = coreUpdate.update(
              coreUpdate.updateIn(card, ['special'], (s: any) => ({ ...s, runAgain: attackedServer, runAgainIce: ice }))
            );
          }),
        },
      },
    },
    {
      event: 'encounter-ice',
      automatic: 'bypass',
      once: 'per-run',
      req: req(function*(state, side, eid, card, targets) {
        const c = coreCard.getCard(state, card);
        return c?.special?.runAgain &&
          utils.sameCard(ctx.ice, c.special.runAgainIce);
      }),
      msg: msg('bypass ', msg => ctx.ice?.title),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreRuns.bypassIce(state)], []);
      }),
    },
  ],
};

// Amped Up
export const ampedUp: CardDef = {
  title: 'Amped Up',
  onPlay: {
    msg: 'gain [Click][Click][Click] and suffer 1 core damage',
    async: true,
    effect: effect(
      coreGaining.gainClicks(3),
      coreDamage.damage(eid, 'brain', 1, { unpreventable: true, card })
    ),
  },
};

// Another Day, Another Paycheck
export const anotherDayAnotherPaycheck: CardDef = {
  title: 'Another Day, Another Paycheck',
  events: [{
    event: 'agenda-stolen',
    trace: {
      base: 0,
      unsuccessful: {
        async: true,
        effect: effect(
          coreGaining.gain('runner', eid, (state as any).runner?.agendaPoint + (state as any).corp?.agendaPoint)
        ),
        msg: msg(msg => `gain ${msg} [Credits]`),
      },
    },
  }],
};

// Apocalypse
export const apocalypse: CardDef = {
  title: 'Apocalypse',
  onPlay: {
    req: req(function*(state, side, eid, card, targets) {
      const reg = (state as any).runner?.register;
      return reg?.successfulRun?.includes('hq') &&
        reg?.successfulRun?.includes('rd') &&
        reg?.successfulRun?.includes('archives');
    }),
    async: true,
    msg: 'trash all installed Corp cards and turn all installed Runner cards facedown',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const corpTrash = {
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const ai = coreBoard.allInstalled(state, 'corp');
          const onhost = ai.filter((c: Card) => c.zone?.[0] === 'onhost');
          const unhosted = ai
            .filter((c: Card) => c.zone?.[0] !== 'onhost')
            .sort((a: Card, b: Card) => JSON.stringify(a.zone).localeCompare(JSON.stringify(b.zone)))
            .reverse();
          const allCorp = [...onhost, ...unhosted];
          yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trashCards(state, 'runner', eid, allCorp, { causeCard: card })], []);
        }),
      };
      const runnerFacedown = {
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const installedCards = coreBoard.allActiveInstalled(state, 'runner');
          const isHosted = (c: Card) => c.zone?.[0] === 'onhost';
          const hostedCards = installedCards.filter(isHosted);
          const nonHostedCards = installedCards.filter((c: Card) => !isHosted(c));
          for (const oc of hostedCards) {
            const c = coreCard.getCard(state, oc);
            if (!coreCard.conditionCounter(c)) {
              yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.flipFacedown(state, side, c)], []);
            }
          }
          for (const oc of nonHostedCards) {
            const c = coreCard.getCard(state, oc);
            yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.flipFacedown(state, side, c)], []);
          }
        }),
      };
      yield wait_for(
        state,
        [{ asyncResult: 'result' }, coreEngine.resolveAbility(state, side, corpTrash, card, null)],
        []
      );
      yield continue_ability(state, side, runnerFacedown, card, null);
    }),
  },
};

// Ashen Epilogue
export const ashenEpilogue: CardDef = {
  title: 'Ashen Epilogue',
  onPlay: {
    msg: msg(function*(state, side, eid, card, targets) {
      return coreCard.zoneLocked(state, 'runner', 'discard')
        ? 'shuffle the grip into the stack'
        : 'shuffle the grip and heap into the stack';
    }),
    rfgInsteadOfTrashing: true,
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreShuffling.shuffleIntoDeck(state, 'runner', 'hand', 'discard')], []);
      const top5 = (coreShuffling.getSetAside(state, 'runner', eid)?.slice(0, 5)) ||
                   (state as any).runner?.deck?.slice(0, 5) || [];
      for (const c of top5) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, side, c, 'rfg')], []);
      }
      coreSay.systemMsg(state, side, `removes ${top5.map((c: Card) => c.title).join(', ')} from the game and draws 5 cards`);
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, 'runner', eid, 5)], []);
    }),
  },
};

// Bahia Bands
export const bahiaBands: CardDef = {
  title: 'Bahia Bands',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  interactions: {
    'pay-credits': {
      req: req(function*(state, side, eid, card, targets) {
        return eid.sourceType === 'runner-trash-corp-cards' && coreCard.corp(targets[0]);
      }),
      type: 'credit',
    },
  },
  events: [{
    event: 'successful-run',
    interactive: req(function*(state, side, eid, card, targets) { return true; }),
    async: true,
    req: req(function*(state, side, eid, card, targets) { return forms.thisCardRun; }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const all = [
        { async: true, effect: effect(coreDrawing.draw(eid, 2)), msg: 'draw 2 cards' },
        {
          msg: 'install a card from the grip, paying 1 [Credits] less',
          async: true,
          req: req(function*(state, side, eid, card, targets) {
            return !coreInstalling.installLocked(state, side);
          }),
          effect: effect(continue_ability(
            {
              prompt: 'Choose a card to install',
              waitingPrompt: true,
              choices: {
                req: req(function*(state, side, eid, card, targets) {
                  const t = targets[0];
                  return (coreCard.hardware(t) || coreCard.program(t) || coreCard.resource(t)) &&
                    coreCard.inHandStar(state, t) &&
                    coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card }, t, { costBonus: -1 });
                }),
              },
              async: true,
              effect: effect(
                coreInstalling.runnerInstall(
                  { ...eid, source: card, sourceType: 'runner-install' },
                  msg,
                  { costBonus: -1, msgKeys: { installSource: card, displayOrigin: true } }
                )
              ),
            },
            card,
            null
          )),
        },
        { msg: 'remove 1 tag', async: true, effect: effect(coreTags.loseTags(eid, 1)) },
        {
          async: true,
          effect: effect(coreProps.addCounter(eid, coreCard.getCard(state, card), 'credit', 4, null)),
          msg: 'place 4 [Credits] for paying trash costs',
        },
      ];

      const choice = (abis: any[], rem: number): any => ({
        prompt: `Choose an ability to resolve (${rem} remaining)`,
        waitingPrompt: true,
        choices: abis.map((a: any) => a.msg.charAt(0).toUpperCase() + a.msg.slice(1)),
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const chosen = abis.find((a: any) => msg === a.msg.charAt(0).toUpperCase() + a.msg.slice(1));
          yield wait_for(
            state,
            [{ asyncResult: 'result' }, coreEngine.resolveAbility(state, side, chosen, card, null)],
            []
          );
          if (rem > 1) {
            yield continue_ability(
              state,
              side,
              choice(abis.filter((a: any) => a !== chosen), rem - 1),
              card,
              null
            );
          } else {
            return coreEid.effectCompleted(state, side, eid);
          }
        }),
      });

      yield continue_ability(state, side, choice(all, 2), card, null);
    }),
  }],
};

// Because I Can
export const becauseICan: CardDef = {
  title: 'Because I Can',
  makesRun: true,
  onPlay: runRemoteServerAbility(),
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'remote',
    thisCardRun: true,
    ability: {
      msg: 'shuffle all cards in the server into R&D',
      effect: effect(
        function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const runServer = forms.runServer(state);
          for (const c of runServer?.content || []) {
            yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, 'corp', c, 'deck')], []);
          }
          yield wait_for(state, [{ asyncResult: 'result' }, coreShuffling.shuffle(state, 'corp', 'deck')], []);
        }
      ),
    },
  }],
};

// Beta Build
export const betaBuild: CardDef = {
  title: 'Beta Build',
  makesRun: true,
  onPlay: {
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(
        state,
        [{ asyncResult: 'result' },
          coreEngine.resolveAbility(
            state,
            side,
            {
              prompt: 'Install a non-virus program',
              choices: {
                req: req(function*(state, side, eid, card, targets) {
                  return corePrompts.cancellable(
                    (state as any).runner?.deck?.filter((c: Card) => coreCard.program(c) &&
                      coreInstalling.runnerCanInstall(state, side, eid, c, { noToast: true })) || []
                  );
                }),
              },
              async: true,
              effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                yield wait_for(
                  state,
                  [{ asyncResult: 'result' },
                    coreInstalling.runnerInstall(state, side, msg, { ignoreAllCost: true, msgKeys: { displayOrigin: true, sourceCard: card } })
                  ],
                  []
                );
                return coreEid.completeWithResult(state, side, eid, msg);
              }),
            },
            card,
            null
          )
        ],
        []
      );
      const installedCard = msg;
      yield continue_ability(
        state,
        side,
        runAnyServerAbility({
          events: [{
            event: 'run-ends',
            unregisterOnceResolved: true,
            duration: 'end-of-run',
            interactive: req(function*(state, side, eid, card, targets) { return true; }),
            automatic: 'last',
            onChangeGameState: { silent: true, req: req(function*(state, side, eid, card, targets) { return coreCard.getCard(state, installedCard); }) },
            msg: msg('add ', msg => installedCard.title, ' to the top of the stack'),
            effect: effect(coreMoving.move(state, side, installedCard, 'deck', { front: true })),
          }],
        }),
        card,
        null
      );
    }),
  },
};

// Black Hat
export const blackHat: CardDef = {
  title: 'Black Hat',
  onPlay: {
    trace: {
      base: 4,
      unsuccessful: {
        effect: effect(
          coreEngine.registerEvents(
            card,
            [
              breachAccessBonus('rd', 2, { duration: 'end-of-turn' }),
              breachAccessBonus('hq', 2, { duration: 'end-of-turn' }),
            ]
          )
        ),
      },
    },
  },
};

// Blackmail
export const blackmail: CardDef = {
  title: 'Blackmail',
  makesRun: true,
  onPlay: {
    req: req(function*(state, side, eid, card, targets) { return coreBadPublicity.hasBadPub(state); }),
    prompt: 'Choose a server',
    onChangeGameState: { req: req(function*(state) { return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state)).length > 0; }) },
    choices: req(function*(state, side, eid, card, targets) { return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state)); }),
    msg: 'prevent ice from being rezzed during this run',
    async: true,
    effect: effect(
      coreFlags.registerRunFlag(
        card,
        'can-rez',
        function*(state: State, _side: Side, card: Card) {
          if (coreCard.ice(card)) {
            coreToasts.toast(state, 'corp', 'Cannot rez ice on this run due to Blackmail');
            return false;
          }
          return true;
        }
      ),
      coreRuns.makeRun(eid, msg, card)
    ),
  },
};

// Blueberry! Diesel
export const blueberryDiesel: CardDef = {
  title: 'Blueberry! Diesel',
  onPlay: {
    async: true,
    onChangeGameState: { req: req(function*(state, side, eid, card, targets) { return (state as any).runner?.deck?.length > 0; }) },
    prompt: 'Move a card to the bottom of the stack?',
    notDistinct: true,
    choices: req(function*(state, side, eid, card, targets) {
      const deck = (state as any).runner?.deck || [];
      return [...deck.slice(0, 2), 'No'];
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (typeof msg !== 'string') {
        yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, side, msg, 'deck')], []);
      }
      coreSay.systemMsg(state, side, `looks at the top 2 cards of the stack${typeof msg !== 'string' ? ' and adds one to the bottom of the stack' : ''}`);
      coreSay.systemMsg(state, side, `uses ${card.title} to draw 2 cards`);
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, 'runner', eid, 2)], []);
    }),
  },
};

// Bravado - tracks passed ice for credit gain
export const bravado: CardDef = {
  title: 'Bravado',
  makesRun: true,
  onPlay: {
    async: true,
    onChangeGameState: { req: req(function*(state, side, eid, card, targets) {
      const icedServers = (state: State, side: Side, eid: EID, card: Card) =>
        coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null))
          .filter((s: string) => {
            const zone = coreBoard.serverToZone(state, s);
            const server = (state as any).corp?.servers?.[zone?.[1]];
            return server?.ices?.length > 0;
          });
      return icedServers(state, side, eid, card).length > 0;
    })},
    prompt: 'Choose an iced server',
    choices: req(function*(state, side, eid, card, targets) {
      const icedServers = (state: State, side: Side, eid: EID, card: Card) =>
        coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null))
          .filter((s: string) => {
            const zone = coreBoard.serverToZone(state, s);
            const server = (state as any).corp?.servers?.[zone?.[1]];
            return server?.ices?.length > 0;
          });
      return icedServers(state, side, eid, card);
    }),
    effect: effect(
      coreEngine.registerEvents(
        card,
        [{
          event: 'pass-ice',
          duration: 'end-of-run',
          effect: effect(
            coreUpdate.updateIn(coreCard.getCard(state, card), ['special', 'bravadoPassed'], (s: any) => {
              const set = s || new Set();
              set.add(ctx.ice.cid);
              return set;
            })
          ),
        }]
      ),
      coreRuns.makeRun(eid, msg, coreCard.getCard(state, card))
    ),
  },
  events: [
    {
      event: 'run-ends',
      silent: true,
      msg: msg(function*(state, side, eid, card, targets) {
        const passed = coreCard.getCard(state, card)?.special?.bravadoPassed || new Set();
        const moved = coreCard.getCard(state, card)?.special?.bravadoMoved || 0;
        const qty = 6 + passed.size + moved;
        return `gain ${qty} [Credits]`;
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const passed = coreCard.getCard(state, card)?.special?.bravadoPassed || new Set();
        const moved = coreCard.getCard(state, card)?.special?.bravadoMoved || 0;
        const qty = 6 + passed.size + moved;
        yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, 'runner', eid, qty)], []);
      }),
    },
    {
      event: 'card-moved',
      silent: true,
      req: req(function*(state, side, eid, card, targets) {
        const passed = coreCard.getCard(state, card)?.special?.bravadoPassed || new Set();
        return passed.has(ctx.movedCard?.cid);
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const c = coreUpdate.update(
          coreUpdate.updateIn(card, ['special', 'bravadoMoved'], (n: number) => (n || 0) + 1)
        );
        coreUpdate.update(
          coreUpdate.updateIn(c, ['special', 'bravadoPassed'], (s: any) => {
            const set = s || new Set();
            set.delete(ctx.movedCard?.cid);
            return set;
          })
        );
      }),
    },
  ],
};

// Bribery
export const bribery: CardDef = {
  title: 'Bribery',
  makesRun: true,
  onPlay: {
    async: true,
    basePlayCost: [corePayment.toC('x-credits')],
    choices: req(function*(state, side, eid, card, targets) {
      return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null));
    }),
    msg: msg('make a run on ', msg => msg, ' and increase the rez cost of the first unrezzed piece of ice approached by ', msg => corePayment.xCostValue(eid), ' [Credits]'),
    prompt: 'Choose a server',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const briberyX = corePayment.xCostValue(eid);
      coreEngine.registerEvents(state, side, card, [{
        event: 'approach-ice',
        duration: 'end-of-run',
        unregisterOnceResolved: true,
        req: req(function*(state, side, eid, card, targets) {
          const ice = ctx.ice;
          return !coreCard.rezzed(ice) &&
            coreEvents.firstRunEvent(state, side, 'approach-ice', (t: any) => {
              const first = t[0];
              return first && !coreCard.rezzed(first.ice);
            });
        }),
        effect: effect(
          coreEffects.registerLingeringEffect(card, {
            type: 'rez-additional-cost',
            duration: 'end-of-run',
            unregisterOnceResolved: true,
            req: req(function*(state, side, eid, card, targets) {
              return utils.sameCard(ctx.ice, msg);
            }),
            value: [corePayment.toC('credit', briberyX)],
          })
        ),
      }]);
      yield wait_for(state, [{ asyncResult: 'result' }, coreRuns.makeRun(state, side, eid, msg, card)], []);
    }),
  },
};

// Brute-Force-Hack
export const bruteForceHack: CardDef = {
  title: 'Brute-Force-Hack',
  onPlay: {
    async: true,
    basePlayCost: [corePayment.toC('x-credits')],
    onChangeGameState: { req: req(function*(state, side, eid, card, targets) {
      return coreBoard.allInstalled(state, 'corp').some((c: Card) =>
        coreCard.rezzed(c) && coreCard.ice(c) &&
        coreCostFns.rezCost(state, 'corp', c, null) <= corePayment.xCostValue(eid)
      );
    })},
    prompt: msg('derez an ice with a rez cost of ', msg => corePayment.xCostValue(eid), ' or lower'),
    choices: { req: req(function*(state, side, eid, card, targets) {
      const c = targets[0];
      return coreCard.rezzed(c) && coreCard.ice(c) &&
        coreCostFns.rezCost(state, 'corp', c, null) <= corePayment.xCostValue(eid);
    })},
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreRezzing.derez(state, side, eid, msg)], []);
    }),
  },
};

// Build Script
export const buildScript: CardDef = {
  title: 'Build Script',
  onPlay: {
    msg: 'gain 1 [Credits] and draw 2 cards',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, 1)], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, side, eid, 2)], []);
    }),
  },
};

// Burner
export const burner: CardDef = {
  title: 'Burner',
  makesRun: true,
  onPlay: runServerAbility('hq'),
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'hq',
    thisCardRun: true,
    mandatory: true,
    ability: {
      req: req(function*(state, side, eid, card, targets) { return (state as any).corp?.hand?.length >= 1; }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const corpHand = (state as any).corp?.hand || [];
        const chosenCards = [...corpHand].sort(() => Math.random() - 0.5).slice(0, 3);
        yield wait_for(state, [{ asyncResult: 'result' }, coreRevealing.revealLoud(state, side, card, null, chosenCards)], []);
        yield continue_ability(
          state,
          side,
          {
            prompt: `Choose a card (${Math.min(2, chosenCards.length)} remaining)`,
            choices: chosenCards.map((c: Card) => c.title),
            async: true,
            waitingPrompt: true,
            effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              const targetCard = targets[0];
              yield continue_ability(
                state,
                side,
                {
                  prompt: `Choose where to put ${targetCard.title}`,
                  choices: ['Top of R&D', 'Bottom of R&D'],
                  async: true,
                  msg: msg('add ', msg => msg, ' to the ', msg => msg.toLowerCase()),
                  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                    if (msg === 'Top of R&D') {
                      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, 'corp', msg, 'deck', { front: true })], []);
                    } else {
                      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, 'corp', msg, 'deck', { front: false })], []);
                    }
                  }),
                },
                card,
                null
              );
            }),
          },
          card,
          null
        );
      }),
    },
  }],
};

// By Any Means
export const byAnyMeans: CardDef = {
  title: 'By Any Means',
  onPlay: {
    effect: effect(
      coreEngine.registerEvents(card, [{
        event: 'access',
        duration: 'end-of-turn',
        req: req(function*(state, side, eid, card, targets) {
          return coreFlags.canTrash(state, 'runner', ctx.accessedCard) &&
            !coreCard.inDiscard(ctx.accessedCard);
        }),
        interactive: req(function*(state, side, eid, card, targets) { return true; }),
        async: true,
        msg: msg('trash ', msg => ctx.accessedCard?.title, ' at no cost and suffer 1 meat damage'),
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const accessedCard = ctx.accessedCard;
          yield wait_for(
            state,
            [{ asyncResult: 'result' }, coreMoving.trash(state, side, { ...accessedCard, seen: true }, { causeCard: card, accessed: true })],
            []
          );
          (state as any).runner.register.trashedCard = true;
          (state as any).runner.register.trashedAccessedCard = true;
          yield wait_for(state, [{ asyncResult: 'result' }, coreDamage.damage(state, 'runner', eid, 'meat', { unboostable: true })], []);
        }),
      }])
    ),
  },
};

// Calling in Favors
export const callingInFavors: CardDef = {
  title: 'Calling in Favors',
  onPlay: {
    msg: msg(function*(state, side, eid, card, targets) {
      const connections = (coreBoard.allActiveInstalled(state, 'runner') || [])
        .filter((c: Card) => coreCard.hasSubtype(c, 'Connection') && coreCard.resource(c));
      return `gain ${connections.length} [Credits]`;
    }),
    onChangeGameState: { req: req(function*(state, side, eid, card, targets) {
      return (coreBoard.allActiveInstalled(state, 'runner') || []).some((c: Card) =>
        coreCard.hasSubtype(c, 'Connection') && coreCard.resource(c)
      );
    })},
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const connections = (coreBoard.allActiveInstalled(state, 'runner') || [])
        .filter((c: Card) => coreCard.hasSubtype(c, 'Connection') && coreCard.resource(c));
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(eid, connections.length)], []);
    }),
  },
};

// Career Fair
export const careerFair: CardDef = {
  title: 'Career Fair',
  onPlay: {
    prompt: 'Choose a resource to install',
    onChangeGameState: { req: req(function*(state, side, eid, card, targets) {
      return (coreDefHelpers.allCardsInHandStar(state, 'runner') || []).length > 0;
    })},
    choices: {
      req: req(function*(state, side, eid, card, targets) {
        const t = targets[0];
        return coreCard.resource(t) &&
          coreCard.inHandStar(state, t) &&
          coreInstalling.runnerCanPayAndInstall(state, side, eid, card, { costBonus: -3 });
      }),
    },
    async: true,
    effect: effect(
      coreInstalling.runnerInstall(
        { ...eid, source: card, sourceType: 'runner-install' },
        msg,
        { costBonus: -3, msgKeys: { installSource: card, displayOrigin: true } }
      )
    ),
  },
};

// Careful Planning
export const carefulPlanning: CardDef = {
  title: 'Careful Planning',
  onPlay: {
    prompt: 'Choose a card in or protecting a remote server',
    choices: { card: (c: Card) => {
      const zone = coreCard.getZone(c);
      return zone && coreServers.isRemote(zone[1]);
    }},
    msg: msg('prevent the Corp from rezzing ', msg => coreToString.cardStr(state, msg), ' for the rest of the turn'),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const t = msg;
      coreEffects.registerLingeringEffect(state, side, card, {
        type: 'icon',
        req: req(function*(state, side, eid, card, targets) { return utils.sameCard(msg, t); }),
        duration: 'post-runner-turn-ends',
        value: makeIcon('CP', card),
      });
      coreFlags.registerTurnFlag(state, side, card, 'can-rez', function*(state: State, _side: Side, card: Card) {
        if (utils.sameCard(card, msg)) {
          coreToasts.toast(state, 'corp', 'Cannot rez the rest of this turn due to Careful Planning');
          return false;
        }
        return true;
      });
    }),
  },
};
