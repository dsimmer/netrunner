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

function drainCredits(runnerSide: Side, corpSide: Side, amount: number, min: number, max: number): any {
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

function runServerAbility(server: string, opts: any = {}): any {
  return coreDefHelpers.runServerAbility(server, opts);
}

function runAnyServerAbility(opts: any = {}): any {
  return coreDefHelpers.runAnyServerAbility(opts);
}

function runRemoteServerAbility(opts: any = {}): any {
  return coreDefHelpers.runRemoteServerAbility(opts);
}

function runCentralServerAbility(opts: any = {}): any {
  return coreDefHelpers.runCentralServerAbility(opts);
}

function runServerFromChoicesAbility(servers: string[], opts: any = {}): any {
  return coreDefHelpers.runServerFromChoicesAbility(servers, opts);
}

function gainCreditsAbility(amount: number): any {
  return coreDefHelpers.gainCreditsAbility(amount);
}

function drawAbi(amount: number): any {
  return coreDefHelpers.drawAbi(amount);
}

function tutorAbi(forceCorp: boolean, predicate: any): any {
  return coreDefHelpers.tutorAbi(forceCorp, predicate);
}

function offerJackOut(opts: any): any {
  return coreDefHelpers.offerJackOut(opts);
}

function scry(state: State, side: Side, card: Card, targetSide: Side, num: number): void {
  coreDefHelpers.scry(state, side, card, targetSide, num);
}

function makeIcon(symbol: string, card: Card): any {
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

// Carpe Diem
export const carpeDiem: CardDef = {
  title: 'Carpe Diem',
  makesRun: true,
  events: [coreMark.markChangedEvent],
  onPlay: {
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(
        state,
        [{ asyncResult: 'result' }, coreEngine.resolveAbility(state, side, coreMark.identifyMarkAbility, card, null)],
        []
      );
      const markedServer = (state as any).mark;
      coreUpdate.update(
        coreUpdate.updateIn(state, ['runner'], (r: any) => ({ ...r, [card.title]: coreServers.centralToName(markedServer) }))
      );
      coreSay.systemMsg(state, side, `uses ${card.title} to gain 4 [Credits]`);
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, 'runner', 4)], []);
      yield continue_ability(
        state,
        side,
        {
          optional: {
            prompt: `Run on ${coreServers.zoneToName(markedServer)}?`,
            noAbility: {
              effect: effect(
                coreSay.systemMsg(`declines to use ${card.title} to make a run`)
              ),
            },
            yesAbility: {
              msg: `make a run on ${coreServers.zoneToName(markedServer)}`,
              async: true,
              effect: effect(coreRuns.makeRun(eid, markedServer, card)),
            },
          },
        },
        card,
        null
      );
    }),
  },
};

// CBI Raid
export const cbiRaid: CardDef = {
  title: 'CBI Raid',
  makesRun: true,
  onPlay: runServerAbility('hq'),
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'hq',
    mandatory: true,
    thisCardRun: true,
    ability: {
      msg: 'force the Corp to add all cards in HQ to the top of R&D',
      player: 'corp',
      waitingPrompt: true,
      async: true,
      effect: effect(
        continue_ability(
          (() => {
            const from = (state as any).corp?.hand || [];
            if (from.length > 0) {
              return cbiChoice(from, [], from.length, from);
            }
          })(),
          card,
          null
        )
      ),
    },
  }],
};

function cbiChoice(remaining: Card[], chosen: Card[], n: number, original: Card[]): any {
  return {
    player: 'corp',
    prompt: 'Choose a card to move next onto R&D',
    choices: remaining.map((c: Card) => c.title),
    async: true,
    effect: effect(continue_ability(
      (() => {
        const newChosen = [msg, ...chosen];
        if (newChosen.length < n) {
          return cbiChoice(remaining.filter((c: Card) => c.title !== msg.title), newChosen, n, original);
        }
        return cbiFinal(newChosen, original);
      })(),
      card,
      null
    )),
  };
}

function cbiFinal(chosen: Card[], original: Card[]): any {
  return {
    player: 'corp',
    prompt: `The top cards of R&D will be ${chosen.map((c: Card) => c.title).join(', ')}`,
    choices: ['Done', 'Start over'],
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (msg === 'Done') {
        for (const c of chosen.reverse()) {
          yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, 'corp', c, 'deck', { front: true })], []);
        }
        coreSay.systemMsg(state, side, `The top cards of R&D are ${chosen.map((c: Card) => c.title).join(', ')}`, { logSide: 'corp' });
        return coreEid.effectCompleted(state, side, eid);
      } else {
        const from = (state as any).corp?.hand || [];
        yield continue_ability(state, side, cbiChoice(from, [], from.length, from), card, null);
      }
    }),
  };
}

// Chain Reaction
export const chainReaction: CardDef = {
  title: 'Chain Reaction',
  onPlay: {
    async: true,
    onChangeGameState: { req: req(function*(state, side, eid, card, targets) {
      return (coreBoard.allInstalled(state, 'corp') || []).length > 0 ||
             (coreBoard.allInstalled(state, 'runner') || []).length > 0;
    })},
    req: req(function*(state, side, eid, card, targets) {
      const reg = (state as any).runner?.register;
      return reg?.successfulRun?.includes('hq') &&
             reg?.successfulRun?.includes('rd') &&
             reg?.successfulRun?.includes('archives');
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if ((coreBoard.allInstalled(state, 'corp') || []).length > 0) {
        yield continue_ability(
          state,
          side,
          {
            prompt: 'choose cards to trash',
            async: true,
            choices: { card: (c: Card) => coreCard.corp(c) && coreCard.installed(c), max: 2, all: true },
            waitingPrompt: true,
            effect: effect(continue_ability(state, 'corp', {
              player: 'corp',
              prompt: 'Choose a Runner card to trash',
              async: true,
              req: req(function*(state, side, eid, card, targets) { return (coreBoard.allInstalled(state, 'runner') || []).length > 0; }),
              choices: { card: (c: Card) => coreCard.runner(c) && coreCard.installed(c) },
              waitingPrompt: true,
              displaySide: 'corp',
              effect: effect(coreMoving.trash(state, 'corp', eid, msg)),
            }, card, null)),
          },
          card,
          null
        );
      } else {
        yield continue_ability(
          state,
          'corp',
          {
            player: 'corp',
            prompt: 'Choose a Runner card to trash',
            async: true,
            choices: { card: (c: Card) => coreCard.runner(c) && coreCard.installed(c) },
            waitingPrompt: true,
            effect: effect(coreMoving.trash(state, 'corp', eid, msg)),
          },
          card,
          null
        );
      }
    }),
  },
};

// Charm Offensive
export const charmOffensive: CardDef = {
  title: 'Charm Offensive',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [
    {
      event: 'breach-server',
      req: req(function*(state, side, eid, card, targets) { return ctx.server === 'archives'; }),
      silent: true,
      effect: effect(
        coreUpdate.updateIn(
          coreUpdate.updateIn(card, ['special', 'accessed'], (s: any) => [...(s || []), ...(coreCard.getDiscard(state, 'corp') || []).map((c: Card) => c.title).filter(Boolean)]),
        )
      ),
    },
    {
      event: 'access-card',
      req: req(function*(state, side, eid, card, targets) { return coreCard.inDiscard(ctx.accessedCard); }),
      silent: true,
      effect: effect(
        coreUpdate.updateIn(
          coreUpdate.updateIn(card, ['special', 'accessed'], (s: any) => [...(s || []), ctx.accessedCard.title]),
        )
      ),
    },
    {
      event: 'run-ends',
      req: req(function*(state, side, eid, card, targets) { return coreCard.getCard(state, card)?.special?.accessed?.length > 0; }),
      async: true,
      interactive: req(function*(state, side, eid, card, targets) { return true; }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const rezzedTitles = (coreBoard.allInstalled(state, 'corp') || [])
          .filter((c: Card) => coreCard.rezzed(c))
          .map((c: Card) => c.title);
        const accessedTitles = coreCard.getCard(state, card)?.special?.accessed || [];
        const intersection = rezzedTitles.filter((t: string) => accessedTitles.includes(t));
        if (intersection.length > 0) {
          yield continue_ability(
            state,
            side,
            {
              async: true,
              prompt: 'Trash a rezzed copy of a card you accessed',
              choices: { card: (c: Card) => coreCard.rezzed(c) && intersection.includes(c.title) },
              msg: msg('trash ', msg => coreToString.cardStr(state, msg)),
              effect: effect(coreMoving.trash(eid, msg, { causeCard: card })),
            },
            card,
            null
          );
        } else {
          return coreEid.effectCompleted(state, side, eid);
        }
      }),
    },
  ],
};

// Chastushka
export const chastushka: CardDef = {
  title: 'Chastushka',
  makesRun: true,
  onPlay: runServerAbility('hq'),
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'hq',
    thisCardRun: true,
    mandatory: true,
    ability: coreSabotage.sabotageAbility(4),
  }],
};

// Chrysopoeian Skimming
export const chrysopoeianSkimming: CardDef = {
  title: 'Chrysopoeian Skimming',
  onPlay: {
    prompt: 'Choose an agenda to reveal',
    player: 'corp',
    waitingPrompt: true,
    choices: req(function*(state, side, eid, card, targets) {
      const agendas = (state as any).corp?.hand?.filter((c: Card) => coreCard.agenda(c)) || [];
      return [...agendas.map((c: Card) => c.title), 'Done'];
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (msg === 'Done') {
        coreSay.systemMsg(state, 'corp', 'declines to reveal an agenda from HQ');
        scry(state, 'runner', eid, card, 'corp', 3);
      } else {
        yield wait_for(
          state,
          [{ asyncResult: 'result' }, coreRevealing.revealLoud(state, side, card, { forced: true }, msg)],
          []
        );
        yield continue_ability(
          state,
          'runner',
          {
            msg: 'gain [Click] and draw 1 card',
            async: true,
            effect: effect(coreGaining.gainClicks(state, 'runner', 1), coreDrawing.draw(state, 'runner', eid, 1)),
          },
          card,
          null
        );
      }
    }),
  },
};

// Clean Getaway
export const cleanGetaway: CardDef = {
  title: 'Clean Getaway',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [{
    event: 'successful-run',
    req: req(function*(state, side, eid, card, targets) { return forms.thisCardRun; }),
    msg: 'gain 6 [Credits]',
    async: true,
    effect: effect(coreGaining.gainCredits('runner', eid, 6)),
  }],
};

// Code Siphon
export const codeSiphon: CardDef = {
  title: 'Code Siphon',
  makesRun: true,
  onPlay: runServerAbility('rd'),
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'rd',
    thisCardRun: true,
    ability: {
      async: true,
      prompt: 'Choose a program to install',
      msg: msg('install ', msg => msg, ' and take 1 tag'),
      choices: req(function*(state, side, eid, card, targets) {
        const rdIce = (state: State) => -3 * ((state as any).corp?.servers?.rd?.ices?.length || 0);
        return (state as any).runner?.deck?.filter((c: Card) =>
          coreCard.program(c) &&
          coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card }, c, { costBonus: rdIce(state) })
        ) || [];
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.triggerEvent(state, side, 'searched-stack')], []);
        yield wait_for(state, [{ asyncResult: 'result' }, coreShuffling.shuffle(state, side, 'deck')], []);
        yield wait_for(
          state,
          [{ asyncResult: 'result' },
            coreInstalling.runnerInstall(state, side, msg, {
              costBonus: (state: State) => -3 * ((state as any).corp?.servers?.rd?.ices?.length || 0),
              msgKeys: { installSource: card, displayOrigin: true },
            })
          ],
          []
        );
        yield wait_for(state, [{ asyncResult: 'result' }, coreTags.gainTags(state, side, eid, 1)], []);
      }),
    },
  }],
};

// Cold Read
export const coldRead: CardDef = {
  title: 'Cold Read',
  implementation: 'Used programs restriction not enforced',
  makesRun: true,
  data: { counter: { credit: 4 } },
  onPlay: runAnyServerAbility(),
  interactions: {
    'pay-credits': { req: req(function*(state, side, eid, card, targets) { return forms.run(state); }), type: 'credit' },
  },
  events: [{
    event: 'run-ends',
    prompt: 'Choose a program that was used during the run',
    choices: { card: (c: Card) => coreCard.program(c) && coreCard.installed(c) },
    msg: msg('trash ', msg => msg),
    async: true,
    effect: effect(coreMoving.trash(eid, msg, { unpreventable: true, causeCard: card })),
  }],
};

// Compile
export const compile: CardDef = {
  title: 'Compile',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [{
    event: 'encounter-ice',
    skippable: true,
    optional: {
      prompt: 'Install a program?',
      req: req(function*(state, side, eid, card, targets) { return coreEvents.firstRunEvent(state, side, 'encounter-ice'); }),
      yesAbility: {
        async: true,
        prompt: 'Choose where to install the program from',
        choices: req(function*(state, side, eid, card, targets) {
          return coreCard.zoneLocked(state, 'runner', 'discard')
            ? ['Stack']
            : ['Stack', 'Heap'];
        }),
        effect: effect(continue_ability(
          compileFn(msg === 'Stack' ? 'deck' : 'discard'),
          card,
          null
        )),
      },
    },
  }],
};

function compileFn(where: string): any {
  return {
    prompt: 'Choose a program to install',
    choices: { req: req(function*(state, side, eid, card, targets) {
      return corePrompts.cancellable(
        (state as any).runner?.[where]?.filter((c: Card) => coreCard.program(c)) || []
      );
    })},
    async: true,
    cancel: where === 'deck' ? coreShuffling.failToFind!,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (where === 'deck') {
        yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.triggerEvent(state, side, 'searched-stack')], []);
        yield wait_for(state, [{ asyncResult: 'result' }, coreShuffling.shuffle(state, side, 'deck')], []);
      }
      yield wait_for(
        state,
        [{ asyncResult: 'result' },
          coreInstalling.runnerInstall(state, side, msg, {
            ignoreAllCost: true,
            msgKeys: { displayOrigin: true, installSource: card },
          })
        ],
        []
      );
      if (msg) {
        coreEffects.registerLingeringEffect(state, side, card, {
          type: 'icon',
          duration: 'end-of-run',
          req: req(function*(state, side, eid, card, targets) { return utils.sameCard(msg, msg); }),
          value: makeIcon('C', card),
        });
        coreEngine.registerEvents(state, side, card, [{
          duration: 'end-of-run',
          event: 'run-ends',
          interactive: req(function*(state, side, eid, card, targets) { return true; }),
          onChangeGameState: { req: req(function*(state, side, eid, card, targets) { return coreCard.installed(coreCard.getCard(state, msg)); }), silent: true },
          msg: msg('move ', msg => coreToString.cardStr(state, msg), ' to the bottom of the stack'),
          effect: effect(coreMoving.move(state, side, msg, 'deck')),
        }]);
      }
      return coreEid.effectCompleted(state, side, eid);
    }),
  };
}

// Concerto
export const concerto: CardDef = {
  title: 'Concerto',
  makesRun: true,
  interactions: {
    'pay-credits': { req: req(function*(state, side, eid, card, targets) { return forms.run(state); }), type: 'credit' },
  },
  onPlay: {
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const deck = (state as any).runner?.deck || [];
      const topCard = deck[0];
      if (topCard) {
        yield wait_for(
          state,
          [{ asyncResult: 'result' }, coreRevealing.reveal(state, side, topCard)],
          []
        );
        yield wait_for(
          state,
          [{ asyncResult: 'result' },
            coreProps.addCounter(state, side, card, 'credit', topCard.cost || 0, { placed: true })
          ],
          []
        );
        yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, 'runner', topCard, 'hand')], []);
      }
      yield continue_ability(state, side, runAnyServerAbility(), coreCard.getCard(state, card), null);
    }),
  },
};

// Contaminate
export const contaminate: CardDef = {
  title: 'Contaminate',
  onPlay: {
    msg: msg('place 3 virus counters on ', msg => msg),
    choices: {
      req: req(function*(state, side, eid, card, targets) {
        const t = targets[0];
        return coreCard.installed(t) && coreCard.runner(t) && coreVirus.getVirusCounters(state, t) === 0;
      }),
    },
    onChangeGameState: { req: req(function*(state, side, eid, card, targets) {
      return (coreBoard.allActiveInstalled(state, 'runner') || []).some((c: Card) => coreVirus.getVirusCounters(state, c) === 0);
    })},
    async: true,
    effect: effect(coreProps.addCounter('runner', eid, msg, 'virus', 3, null)),
  },
};

// Corporate "Grant"
export const corporateGrant: CardDef = {
  title: 'Corporate "Grant"',
  events: [{
    event: 'runner-install',
    req: req(function*(state, side, eid, card, targets) { return coreEvents.firstEvent(state, side, 'runner-install'); }),
    msg: 'force the Corp to lose 1 [Credit]',
    async: true,
    effect: effect(coreGaining.lose('corp', eid, 1)),
  }],
};

// Corporate Scandal
export const corporateScandal: CardDef = {
  title: 'Corporate Scandal',
  onPlay: {
    msg: 'give the Corp 1 additional bad publicity',
    implementation: 'No enforcement that this Bad Pub cannot be removed',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const s = coreUpdate.updateIn(state, ['corp', 'bad-publicity', 'additional'], (n: number) => (n || 0) + 1);
      coreSay.systemMsg(state, side, 'give the Corp 1 additional bad publicity');
    }),
  },
  leavePlay: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    coreUpdate.updateIn(state, ['corp', 'bad-publicity', 'additional'], (n: number) => (n || 1) - 1);
  }),
};

// Creative Commission
export const creativeCommission: CardDef = {
  title: 'Creative Commission',
  onPlay: {
    msg: msg(function*(state, side, eid, card, targets) {
      const runner = (state as any).runner;
      let result = 'gain 5 [Credits]';
      if (runner.click > 0) result += ' and lose [Click]';
      return result;
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const runner = (state as any).runner;
      if (runner.click > 0) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.loseClicks(state, 'runner', 1)], []);
      }
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, 'runner', eid, 5)], []);
    }),
  },
};

// Credit Crash
export const creditCrash: CardDef = {
  title: 'Credit Crash',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [{
    event: 'pre-access-card',
    once: 'per-run',
    async: true,
    req: req(function*(state, side, eid, card, targets) { return !coreCard.agenda(ctx.accessedCard); }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const c = ctx.accessedCard;
      const title = c.title;
      let cost: number;
      if (coreCard.asset(c) || coreCard.upgrade(c) || coreCard.ice(c)) {
        cost = coreCostFns.rezCost(state, side, c) || 0;
      } else if (coreCard.operation(c)) {
        cost = coreCostFns.playCost(state, side, c) || 0;
      } else {
        cost = 0;
      }
      if (corePayment.canPay(state, 'corp', eid, card, null, [corePayment.toC('credit', cost)])) {
        yield continue_ability(
          state,
          'corp',
          {
            optional: {
              waitingPrompt: true,
              prompt: msg(`Spend ${cost} [Credits] to prevent the trash of ${title}?`),
              player: 'corp',
              yesAbility: {
                async: true,
                effect: effect(
                  coreSay.systemMsg(state, 'corp', `spends ${cost} [Credits] to prevent ${title} from being trashed at no cost`),
                  coreGaining.lose('corp', eid, cost)
                ),
              },
              noAbility: {
                msg: msg('trash ', msg => msg, ' at no cost'),
                async: true,
                effect: effect(coreMoving.trash(eid, { ...c, seen: true }, { causeCard: card })),
              },
            },
          },
          card,
          null
        );
      } else {
        coreSay.systemMsg(state, side, `uses ${card.title} to trash ${title} at no cost`);
        yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trash(state, side, eid, { ...c, seen: true }, null)], []);
      }
    }),
  }],
};

// Credit Kiting
// Credit Kiting
export const creditKiting: CardDef = {
  onPlay: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const reg = (state as any).runner?.register;
      return reg?.successfulRun?.some((s: string) => ['hq', 'rd', 'archives'].includes(s));
    }),
    prompt: 'Choose a card to install',
    choices: {
      req: req(function*(state: Side, eid: EID, card: Card, targets: any[]) {
        const t = targets[0];
        return !coreCard.event(t) &&
          coreCard.inHandStar(state, t) &&
          coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card }, t, { costBonus: -8 });
      }),
    },
    async: true,
    cancel: {
      msg: 'take 1 tag',
      async: true,
      effect: effect(coreTags.gainTags(state, 'runner', eid, 1)),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const newEid = coreEid.makeEid(state, { source: card, sourceType: 'runner-install' });
      yield wait_for(
        state,
        [{ asyncResult: 'result' },
          coreInstalling.runnerInstall(state, 'runner', newEid, msg, {
            msgKeys: { installSource: card, displayOrigin: true },
            costBonus: -8,
            suppressCheckpoint: true,
          })
        ],
        []
      );
      yield wait_for(state, [{ asyncResult: 'result' }, coreTags.gainTags(state, 'runner', eid, 1)], []);
    }),
  },
};

// Cyber Threat
export const cyberThreat: CardDef = {
  title: 'Cyber Threat',
  makesRun: true,
  onPlay: {
    prompt: 'Choose a server',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null));
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const serv = msg;
      const corpInstalled = coreBoard.allInstalled(state, 'corp') || [];
      const canRez = corpInstalled.some((c: Card) =>
        coreCard.installed(c) &&
        !coreCard.rezzed(c) &&
        coreCard.ice(c) &&
        corePayment.canPay(state, side, eid, card, null, [corePayment.toC('credit', coreCostFns.rezCost(state, side, c) || 0)])
      );
      yield continue_ability(
        state,
        'corp',
        canRez
          ? {
              optional: {
                prompt: msg('Rez a piece of ice protecting ', msg => msg, '?'),
                yesAbility: {
                  async: true,
                  prompt: msg('Choose a piece of ice protecting ', msg => msg, ' to rez'),
                  player: 'corp',
                  choices: {
                    card: (c: Card) =>
                      coreCard.installed(c) &&
                      !coreCard.rezzed(c) &&
                      coreCard.ice(c) &&
                      corePayment.canPay(state, side, eid, card, null, [corePayment.toC('credit', coreCostFns.rezCost(state, side, c) || 0)]),
                  },
                  effect: effect(coreRezzing.rez('corp', eid, msg)),
                  cancel: {
                    async: true,
                    effect: effect(
                      coreFlags.registerRunFlag(
                        card,
                        'can-rez',
                        function*(state: State, _side: Side, card: Card) {
                          if (coreCard.ice(card)) {
                            coreToasts.toast(state, 'corp', 'Cannot rez ice on this run due to Cyber Threat');
                            return false;
                          }
                          return true;
                        }
                      ),
                      coreRuns.makeRun(eid, serv, card)
                    ),
                  },
                },
                noAbility: {
                  async: true,
                  effect: effect(
                    coreFlags.registerRunFlag(
                      card,
                      'can-rez',
                      function*(state: State, _side: Side, card: Card) {
                        if (coreCard.ice(card)) {
                          coreToasts.toast(state, 'corp', 'Cannot rez ice on this run due to Cyber Threat');
                          return false;
                        }
                        return true;
                      }
                    ),
                    coreRuns.makeRun(eid, serv, card)
                  ),
                  msg: msg('make a run on ', msg => msg, ' during which no ice can be rezzed'),
                },
              },
            }
          : {
              async: true,
              effect: effect(
                coreFlags.registerRunFlag(
                  card,
                  'can-rez',
                  function*(state: State, _side: Side, card: Card) {
                    if (coreCard.ice(card)) {
                      coreToasts.toast(state, 'corp', 'Cannot rez ice on this run due to Cyber Threat');
                      return false;
                    }
                    return true;
                  }
                ),
                coreRuns.makeRun(eid, serv, card)
              ),
              msg: msg('make a run on ', msg => msg, ' during which no ice can be rezzed'),
            },
        card,
        null
      );
    }),
  },
};

// Data Breach
export const dataBreach: CardDef = {
  title: 'Data Breach',
  makesRun: true,
  onPlay: runServerAbility('rd'),
  events: [{
    event: 'run-ends',
    unregisterOnceResolved: true,
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return ctx.successful &&
          forms.thisCardRun &&
          !coreCard.getCard(state, card)?.special?.runAgain &&
          ctx.server === 'rd';
      }),
      prompt: 'Make another run on R&D?',
      yesAbility: runServerAbility('rd'),
    },
  }],
};

// Day Job
export const dayJob: CardDef = {
  title: 'Day Job',
  onPlay: {
    additionalCost: [corePayment.toC('click', 3)],
    msg: 'gain 10 [Credits]',
    async: true,
    effect: effect(coreGaining.gainCredits(eid, 10)),
  },
};

// Deep Data Mining
export const deepDataMining: CardDef = {
  title: 'Deep Data Mining',
  makesRun: true,
  onPlay: runServerAbility('rd'),
  events: [{
    event: 'successful-run',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return ctx.server === 'rd' && forms.thisCardRun;
    }),
    silent: true,
    effect: effect(
      coreEngine.registerEvents(
        card,
        [coreDefHelpers.breachAccessBonus('rd', Math.max(0, Math.min(4, coreMemory.availableMush(state)), { duration: 'end-of-run' })]
      )
    ),
  }],
};

// Deep Dive
export const deepDive: CardDef = {
  title: 'Deep Dive',
  onPlay: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const reg = (state as any).runner?.register;
      return reg?.successfulRun?.includes('hq') &&
             reg?.successfulRun?.includes('rd') &&
             reg?.successfulRun?.includes('archives');
    }),
    async: true,
    onChangeGameState: { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).corp?.deck?.length > 0; }) },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      coreSetAside.setAside(state, 'corp', eid, (state as any).corp?.deck?.slice(0, 8) || []);
      const top8 = (coreSetAside.getSetAside(state, 'corp', eid) || []).sort((a: Card, b: Card) => (a.title || '').localeCompare(b.title || ''));
      coreSay.systemMsg(state, side, `uses ${card.title} to set aside ${top8.map((c: Card) => c.title).join(', ')} from the top of R&D`);
      yield wait_for(
        state,
        [{ asyncResult: 'result' }, coreEngine.resolveAbility(state, side, { async: true, prompt: `The set aside cards are: ${top8.map((c: Card) => c.title).join(', ')}`, choices: ['OK'] }, card, null)],
        []
      );
      yield wait_for(
        state,
        [{ asyncResult: 'result' }, coreEngine.resolveAbility(state, side, deepDiveAccess(top8), card, null)],
        []
      );
      if (msg) {
        yield wait_for(
          state,
          [{ asyncResult: 'result' },
            coreEngine.resolveAbility(
              state,
              side,
              {
                optional: {
                  prompt: 'Pay [Click] to access another card?',
                  req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                    return corePayment.canPay(state, 'runner', { ...eid, source: card, sourceType: 'ability' }, card, null, [corePayment.toC('click', 1)]);
                  }),
                  noAbility: {
                    effect: effect(coreSay.systemMsg(`declines to use ${card.title} to access another card`)),
                  },
                  yesAbility: {
                    async: true,
                    cost: [corePayment.toC('click', 1)],
                    msg: 'access another card',
                    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                      yield wait_for(
                        state,
                        [{ asyncResult: 'result' }, coreEngine.resolveAbility(state, side, deepDiveAccess(msg), card, null)],
                        []
                      );
                      return coreEid.effectCompleted(state, side, eid);
                    }),
                  },
                },
              },
              card,
              null
            )
          ],
          []
        );
        for (const c of coreSetAside.getSetAside(state, 'corp', eid) || []) {
          yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, 'corp', c, 'deck')], []);
        }
        coreShuffling.shuffle(state, 'corp', 'deck');
      } else {
        for (const c of coreSetAside.getSetAside(state, 'corp', eid) || []) {
          yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, 'corp', c, 'deck')], []);
        }
        coreShuffling.shuffle(state, 'corp', 'deck');
      }
      return coreEid.effectCompleted(state, side, eid);
    }),
  },
};

function deepDiveAccess(cards: Card[]): any {
  return {
    prompt: 'Choose a card to access',
    waitingPrompt: true,
    notDistinct: true,
    choices: cards.map((c: Card) => c.title),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreAccess.accessCard(state, side, msg)], []);
      const remaining = cards.filter((c: Card) => !utils.sameCard(c, msg));
      return coreEid.makeResult(eid, remaining);
    }),
  };
}

// Déjà Vu
export const dejaVu: CardDef = {
  title: 'Déjà Vu',
  onPlay: {
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (state as any).runner?.discard?.length > 0 && !coreCard.zoneLocked(state, 'runner', 'discard');
      }),
    },
    prompt: 'Choose a card to add to Grip',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return corePrompts.cancellable((state as any).runner?.discard || [], 'sorted');
    }),
    msg: msg('add ', msg => msg, ' to [their] Grip'),
    async: true,
    effect: effect(
      coreMoving.move(msg, 'hand'),
      continue_ability(
        coreCard.hasSubtype(msg, 'Virus')
          ? {
              prompt: 'Choose a virus to add to Grip',
              onChangeGameState: { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                return (state as any).runner?.discard?.some((c: Card) => coreCard.hasSubtype(c, 'Virus'));
              })},
              msg: msg('add ', msg => msg, ' to [their] Grip'),
              choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                const disc = (state as any).runner?.discard || [];
                return corePrompts.cancellable(disc.filter((c: Card) => coreCard.hasSubtype(c, 'Virus')), 'sorted');
              }),
              effect: effect(coreMoving.move(msg, 'hand')),
            }
          : null,
        card,
        null
      )
    ),
  },
};

// Demolition Run
export const demolitionRun: CardDef = {
  title: 'Demolition Run',
  makesRun: true,
  onPlay: runServerFromChoicesAbility(['HQ', 'R&D']),
  interactions: {
    'access-ability': {
      label: 'Trash card',
      trash: true,
      msg: msg('trash ', msg => msg, ' at no cost'),
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const t = targets[0];
        return coreFlags.canTrash(state, 'runner', t) && !coreCard.inDiscard(t);
      }),
      async: true,
      effect: effect(coreMoving.trash(eid, { ...msg, seen: true }, { causeCard: card })),
    },
  },
};

// Deuces Wild
export const deucesWild: CardDef = {
  title: 'Deuces Wild',
  onPlay: {
    async: true,
    effect: effect(
      continue_ability(
        (() => {
          const all = [
            { effect: effect(coreGaining.gainCredits(eid, 3)), async: true, msg: 'gain 3 [Credits]' },
            { async: true, effect: effect(coreDrawing.draw(eid, 2)), msg: 'draw 2 cards' },
            { async: true, effect: effect(coreTags.loseTags(eid, 1)), msg: 'remove 1 tag' },
            {
              prompt: 'Choose 1 piece of ice to expose',
              msg: 'expose 1 ice and make a run',
              choices: { card: (c: Card) => coreCard.installed(c) && coreCard.ice(c) },
              async: true,
              effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                yield wait_for(state, [{ asyncResult: 'result' }, coreExpose.expose(state, side, [msg])], []);
                yield continue_ability(state, side, runAnyServerAbility(), card, null);
              }),
              cancel: runAnyServerAbility(),
            },
          ];
          const choice = (abis: any[]) => ({
            prompt: 'Choose an ability to resolve',
            choices: abis.map((a: any) => a.msg.charAt(0).toUpperCase() + a.msg.slice(1)),
            waitingPrompt: true,
            async: true,
            effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              const chosen = abis.find((a: any) => msg === a.msg.charAt(0).toUpperCase() + a.msg.slice(1));
              yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.resolveAbility(state, side, chosen, card, null)], []);
              if (abis.length === 4) {
                yield continue_ability(state, side, choice(abis.filter((a: any) => a !== chosen)), card, null);
              } else {
                return coreEid.effectCompleted(state, side, eid);
              }
            }),
          });
          return choice(all);
        })(),
        card,
        null
      )
    ),
  },
};

// Diana's Hunt
export const dianasHunt: CardDef = {
  title: "Diana's Hunt",
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [
    {
      event: 'encounter-ice',
      skippable: true,
      optional: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return (coreDefHelpers.allCardsInHandStar(state, 'runner') || []).some((c: Card) => coreCard.program(c));
        }),
        prompt: 'Install a program from the grip?',
        yesAbility: {
          prompt: 'Choose a program to install',
          async: true,
          choices: {
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              const t = targets[0];
              return coreCard.inHandStar(state, t) && coreCard.program(t);
            }),
          },
          effect: effect(coreInstalling.runnerInstall(eid, { ...msg, special: { ...msg?.special, dianaInstalled: true } }, { ignoreAllCost: true, msgKeys: { installSource: card, displayOrigin: true } })),
        },
      },
    },
    {
      event: 'run-ends',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const installedCards = (coreBoard.allActiveInstalled(state, 'runner') || []).filter((c: Card) => c.special?.dianaInstalled);
        if (installedCards.length > 0) {
          coreSay.systemMsg(state, 'runner', `trashes ${installedCards.length} card (${installedCards.map((c: Card) => c.title).join(', ')}) at the end of the run from Diana's Hunt`);
          yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trashCards(state, 'runner', eid, installedCards, { causeCard: card })], []);
        } else {
          return coreEid.effectCompleted(state, side, eid);
        }
      }),
    },
  ],
};

// Diesel
export const diesel: CardDef = {
  title: 'Diesel',
  onPlay: drawAbi(3),
};

// Direct Access
export const directAccess: CardDef = {
  title: 'Direct Access',
  makesRun: true,
  staticAbilities: [{
    type: 'disable-card',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const corp = (state as any).corp;
      const runner = (state as any).runner;
      return utils.sameCard(msg, corp?.identity) || utils.sameCard(msg, runner?.identity);
    }),
    value: true,
  }],
  onPlay: {
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      coreCheckpoint.fakeCheckpoint(state);
      yield continue_ability(
        state,
        side,
        {
          async: true,
          prompt: 'Choose a server',
          choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null));
          }),
          effect: effect(coreRuns.makeRun(eid, msg, card)),
        },
        card,
        null
      );
    }),
  },
  events: [{
    event: 'run-ends',
    unregisterOnceResolved: true,
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield continue_ability(
        state,
        'runner',
        {
          optional: {
            prompt: 'Shuffle Direct Access into the Stack?',
            yesAbility: {
              msg: 'shuffle itself into the Stack',
              effect: effect(
                coreMoving.move(coreCard.getCard(state, card), 'deck'),
                coreShuffling.shuffle('deck')
              ),
            },
          },
        },
        card,
        null
      );
    }),
  }],
};

// Dirty Laundry
export const dirtyLaundry: CardDef = {
  title: 'Dirty Laundry',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [{
    event: 'run-ends',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return ctx.successful && forms.thisCardRun;
    }),
    msg: 'gain 5 [Credits]',
    async: true,
    effect: effect(coreGaining.gainCredits('runner', eid, 5)),
  }],
};

// Diversion of Funds
export const diversionOfFunds: CardDef = {
  title: 'Diversion of Funds',
  makesRun: true,
  onPlay: runServerAbility('hq'),
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'hq',
    thisCardRun: true,
    ability: drainCredits('runner', 'corp', 5, 1),
  }],
};

// Divide and Conquer
export const divideAndConquer: CardDef = {
  title: 'Divide and Conquer',
  makesRun: true,
  onPlay: runServerAbility('archives'),
  events: [{
    event: 'end-breach-server',
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return ctx.server === 'archives' && ctx.successful;
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreAccess.breachServer(state, side, ['hq'], { noRoot: true })], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreAccess.breachServer(state, side, eid, ['rd'], { noRoot: true })], []);
    }),
  }],
};

// Drive By
export const driveBy: CardDef = {
  title: 'Drive By',
  onPlay: {
    choices: {
      card: (c: Card) => {
        const topmost = coreCard.getNestedHost(c);
        if (!topmost) return false;
        const zone = coreCard.getZone(topmost);
        return zone &&
          coreServers.isRemote(zone[1]) &&
          zone[zone.length - 1] === 'content' &&
          !topmost.rezzed;
      },
    },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreExpose.expose(state, side, [msg])], []);
      const exposedCard = msg;
      if (coreCard.asset(exposedCard) || coreCard.upgrade(exposedCard)) {
        coreSay.systemMsg(state, 'runner', `uses ${card.title} to trash ${exposedCard.title}`);
        yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trash(state, 'runner', eid, { ...exposedCard, seen: true }, { causeCard: card })], []);
      }
      return coreEid.effectCompleted(state, side, eid);
    }),
  },
};

// Early Bird
export const earlyBird: CardDef = {
  title: 'Early Bird',
  makesRun: true,
  onPlay: {
    prompt: 'Choose a server',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null));
    }),
    msg: msg('make a run on ', msg => msg, ' and gain [Click]'),
    async: true,
    effect: effect(coreGaining.gainClicks(1), coreRuns.makeRun(eid, msg, card)),
  },
};

// Easy Mark
export const easyMark: CardDef = {
  title: 'Easy Mark',
  onPlay: gainCreditsAbility(3),
};

// Embezzle
export const embezzle: CardDef = {
  title: 'Embezzle',
  makesRun: true,
  onPlay: runServerAbility('hq'),
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'hq',
    thisCardRun: true,
    mandatory: true,
    ability: {
      prompt: 'Choose a card type',
      choices: ['Asset', 'Upgrade', 'Operation', 'ICE'],
      msg: msg('reveal 2 cards from HQ and trash all ', msg => msg, msg => msg !== 'ICE' ? 's' : ''),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const corpHand = (state as any).corp?.hand || [];
        const cardsToReveal = corpHand.slice(0, 2).sort(() => Math.random() - 0.5);
        yield wait_for(state, [{ asyncResult: 'result' }, coreRevealing.revealLoud(state, side, card, null, cardsToReveal)], []);
        const cardsToTrash = cardsToReveal.filter((c: Card) => coreCard.isType(c, msg));
        const credits = cardsToTrash.length * 4;
        if (credits > 0) {
          yield wait_for(
            state,
            [{ asyncResult: 'result' }, coreMoving.trashCards(state, 'runner', cardsToTrash.map((c: Card) => ({ ...c, seen: true })), { causeCard: card })],
            []
          );
          yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, 'runner', eid, credits)], []);
          coreSay.systemMsg(state, side, `uses ${card.title} to trash ${cardsToTrash.map((c: Card) => c.title).join(', ')} from HQ and gain ${credits} [Credits]`);
        }
        return coreEid.effectCompleted(state, side, eid);
      }),
    },
  }],
};

// Emergency Shutdown
export const emergencyShutdown: CardDef = {
  title: 'Emergency Shutdown',
  onPlay: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const reg = (state as any).runner?.register;
      return reg?.successfulRun?.includes('hq');
    }),
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => coreCard.ice(c) && coreCard.rezzed(c));
      }),
    },
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.rezzed(c) },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreRezzing.derez(state, side, eid, msg)], []);
    }),
  },
};

// Emergent Creativity
export const emergentCreativity: CardDef = {
  title: 'Emergent Creativity',
  onPlay: {
    prompt: 'Choose pieces of hardware and/or programs to trash',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (state as any).runner?.deck?.length > 0 || (state as any).runner?.hand?.length > 0;
      }),
    },
    choices: {
      card: (c: Card) => (coreCard.hardware(c) || coreCard.program(c)) && coreCard.inHand(c),
      max: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.hand?.length || 0; }),
    },
    cancel: {
      msg: 'trash no cards and shuffle the stack',
      effect: effect(
        coreEngine.triggerEvent(state, side, 'searched-stack'),
        coreShuffling.shuffle(state, side, 'deck')
      ),
    },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const trashCost = (targets || []).reduce((sum: number, c: Card) => sum + (c.cost || 0), 0);
      yield wait_for(
        state,
        [{ asyncResult: 'result' }, coreMoving.trashCards(state, side, targets, { unpreventable: true, causeCard: card })],
        []
      );
      yield continue_ability(
        state,
        side,
        {
          async: true,
          prompt: 'Choose a piece of hardware or program to install',
          msg: msg('trash ', targets?.length > 0 ? targets.map((c: Card) => c.title).join(', ') : 'no cards', ' and install ', msg => msg, ' from the Stack, lowering the cost by ', msg => trashCost),
          choices: {
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              return corePrompts.cancellable(
                (state as any).runner?.deck?.filter((c: Card) =>
                  (coreCard.program(c) || coreCard.hardware(c)) &&
                  coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card }, c, { costBonus: -trashCost })
                ) || [],
                'sorted'
              );
            }),
          },
          cancel: {
            msg: 'trash ' + (targets?.length > 0 ? targets.map((c: Card) => c.title).join(', ') : 'no cards') + ' and shuffle the stack',
            effect: effect(
              coreEngine.triggerEvent(state, side, 'searched-stack'),
              coreShuffling.shuffle(state, side, 'deck')
            ),
          },
          effect: effect(
            coreEngine.triggerEvent(state, side, 'searched-stack'),
            coreShuffling.shuffle(state, side, 'deck'),
            coreInstalling.runnerInstall({ ...eid, source: card, sourceType: 'runner-install' }, msg, { costBonus: -trashCost })
          ),
        },
        card,
        null
      );
    }),
  },
};

// Employee Strike
export const employeeStrike: CardDef = {
  title: 'Employee Strike',
  onPlay: {
    msg: "disable the Corp's identity",
  },
  staticAbilities: [{
    type: 'disable-card',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return utils.sameCard(msg, (state as any).corp?.identity);
    }),
    value: true,
  }],
};

// En Passant
export const enPassant: CardDef = {
  title: 'En Passant',
  onPlay: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (state as any).runner?.register?.successfulRun;
    }),
    prompt: 'Choose an unrezzed piece of ice that you passed on your last run',
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const lastRun = (state as any).runner?.register?.lastRun;
        if (!lastRun) return false;
        const events = lastRun.events || [];
        return events
          .filter((e: [string, any]) => e[0] === 'pass-ice')
          .map((e: [string, any]) => e[1])
          .map((e: any) => coreCard.getCard(state, e.ice))
          .filter((c: Card) => c && !coreCard.rezzed(c))
          .some((c: Card) => utils.sameCard(msg, c));
      }),
    },
    msg: msg('trash ', msg => coreToString.cardStr(state, msg)),
    async: true,
    cancel: { msg: 'do nothing' },
    effect: effect(coreMoving.trash(eid, msg, { causeCard: card })),
  },
};

// Encore
export const encore: CardDef = {
  title: 'Encore',
  onPlay: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const reg = (state as any).runner?.register;
      return reg?.successfulRun?.includes('hq') &&
             reg?.successfulRun?.includes('rd') &&
             reg?.successfulRun?.includes('archives');
    }),
    rfgInsteadOfTrashing: true,
    msg: 'take an additional turn after this one',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const s = coreUpdate.updateIn(state, ['runner', 'extra-turns'], (n: number) => (n || 0) + 1);
      coreSay.systemMsg(state, side, 'take an additional turn after this one');
    }),
  },
};

// Escher
export const escher: CardDef = {
  title: 'Escher',
  makesRun: true,
  onPlay: runServerAbility('hq'),
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'hq',
    thisCardRun: true,
    mandatory: true,
    ability: {
      async: true,
      msg: 'rearrange installed ice',
      effect: effect(
        continue_ability(
          (() => ({
            async: true,
            prompt: 'Choose 2 pieces of ice to swap positions',
            choices: { card: (c: Card) => coreCard.installed(c) && coreCard.ice(c), max: 2 },
            effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              if ((targets || []).length === 2) {
                yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.swapIce(state, side, targets[0], targets[1])], []);
                yield continue_ability(state, side, escher(), card, null);
              } else {
                coreSay.systemMsg(state, side, 'has finished rearranging ice');
                return coreEid.effectCompleted(state, side, eid);
              }
            }),
          }))(),
          card,
          null
        )
      ),
    },
  }],
};

function escher(): any {
  return {
    async: true,
    prompt: 'Choose 2 pieces of ice to swap positions',
    choices: { card: (c: Card) => coreCard.installed(c) && coreCard.ice(c), max: 2 },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if ((targets || []).length === 2) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.swapIce(state, side, targets[0], targets[1])], []);
        yield continue_ability(state, side, escher(), card, null);
      } else {
        coreSay.systemMsg(state, side, 'has finished rearranging ice');
        return coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

// Eureka!
export const eureka: CardDef = {
  title: 'Eureka!',
  onPlay: {
    async: true,
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.deck?.length > 0; }),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const topCard = (state as any).runner?.deck?.[0];
      const canInstall = topCard &&
        (coreCard.hardware(topCard) || coreCard.program(topCard) || coreCard.resource(topCard)) &&
        coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card }, topCard, { costBonus: -10 });
      if (canInstall) {
        yield continue_ability(
          state,
          side,
          {
            optional: {
              prompt: msg('Install ', msg => msg, '?'),
              yesAbility: {
                async: true,
                effect: effect(coreInstalling.runnerInstall(eid, topCard, { msgKeys: { displayOrigin: true, installSource: card }, costBonus: -10 })),
              },
              noAbility: {
                async: true,
                effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                  yield wait_for(state, [{ asyncResult: 'result' }, coreRevealing.reveal(state, side, topCard)], []);
                  coreSay.systemMsg(state, side, `reveals ${topCard.title} from the top of the stack and trashes it`);
                  yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trash(eid, topCard, { unpreventable: true, causeCard: card })], []);
                }),
              },
            },
          },
          card,
          null
        );
      } else {
        yield wait_for(state, [{ asyncResult: 'result' }, coreRevealing.reveal(state, side, topCard)], []);
        coreSay.systemMsg(state, side, `reveals ${topCard.title} from the top of the stack and trashes it`);
        yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trash(state, side, eid, topCard, { unpreventable: true, causeCard: card })], []);
      }
    }),
  },
};

// Exclusive Party
export const exclusiveParty: CardDef = {
  title: 'Exclusive Party',
  onPlay: {
    msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const discard = (state as any).runner?.discard || [];
      const count = discard.filter((c: Card) => c.title === card.title).length;
      return `draw 1 card and gain ${count} [Credits]`;
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, side, 1)], []);
      const discard = (state as any).runner?.discard || [];
      const count = discard.filter((c: Card) => c.title === card.title).length;
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, eid, count)], []);
    }),
  },
};

// Executive Wiretaps
export const executiveWiretaps: CardDef = {
  title: 'Executive Wiretaps',
  onPlay: {
    msg: msg('reveal ', msg => (state as any).corp?.hand?.map((c: Card) => c.title).join(', '), ' from HQ'),
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).corp?.hand?.length > 0; }),
    },
    async: true,
    effect: effect(coreRevealing.reveal(eid, (state as any).corp?.hand || [])),
  },
};

// Exploit
export const exploit: CardDef = {
  title: 'Exploit',
  onPlay: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const reg = (state as any).runner?.register;
      return reg?.successfulRun?.includes('hq') &&
             reg?.successfulRun?.includes('rd') &&
             reg?.successfulRun?.includes('archives');
    }),
    prompt: 'Choose up to 3 pieces of ice to derez',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => coreCard.ice(c) && coreCard.rezzed(c));
      }),
    },
    choices: { max: 3, card: (c: Card) => coreCard.rezzed(c) && coreCard.ice(c) },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreRezzing.derez(state, side, eid, targets)], []);
    }),
  },
};

// Exploratory Romp
export const exploratoryRomp: CardDef = {
  title: 'Exploratory Romp',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [{
    event: 'successful-run-replace-breach',
    mandatory: true,
    thisCardRun: true,
    ability: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => {
          const adv = coreCard.getCounters(c, 'advancement');
          const server = coreCard.getZone(c);
          return adv > 0 && (server && coreRuns.targetServer(ctx) === (server as string[])[1]);
        });
      }),
      prompt: 'How many advancements counters do you want to remove?',
      choices: ['0', '1', '2', '3'],
      async: true,
      waitingPrompt: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const n = parseInt(msg, 10);
        yield continue_ability(
          state,
          side,
          {
            choices: {
              card: (c: Card) => {
                const adv = coreCard.getCounters(c, 'advancement');
                const server = coreCard.getZone(c);
                return adv > 0 && (server && coreRuns.targetServer(ctx) === (server as string[])[1]);
              },
            },
            msg: msg('remove ', msg => coreUtils.quantify(n, 'advancement counter'), ' from ', msg => coreToString.cardStr(state, msg)),
            async: true,
            effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              const toRemove = Math.min(n, coreCard.getCounters(msg, 'advancement'));
              coreProps.addProp(state, 'corp', eid, msg, 'advance-counter', -toRemove);
            }),
          },
          card,
          null
        );
      }),
    },
  }],
};

// Express Delivery
export const expressDelivery: CardDef = {
  title: 'Express Delivery',
  onPlay: {
    prompt: 'Choose a card to add to the grip',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.deck?.length > 0; }),
    },
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (state as any).runner?.deck?.slice(0, 4) || [];
    }),
    msg: 'look at the top 4 cards of the stack and add 1 of them to the grip',
    effect: effect(coreMoving.move(msg, 'hand'), coreShuffling.shuffle('deck')),
  },
};

// Eye for an Eye
export const eyeForAnEye: CardDef = {
  title: 'Eye for an Eye',
  makesRun: true,
  onPlay: { ...(runServerAbility('hq') || {}), req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return !utils.isTagged(state); }) },
  interactions: {
    'access-ability': {
      label: 'Trash card',
      trash: true,
      cost: [corePayment.toC('trash-from-hand', 1)],
      msg: msg('trash ', msg => msg, ' from HQ'),
      async: true,
      effect: effect(coreMoving.trash(eid, { ...msg, seen: true }, { accessed: true, causeCard: card })),
    },
  },
  events: [{
    event: 'successful-run',
    silent: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return ctx.server === 'hq' && forms.thisCardRun;
    }),
    async: true,
    msg: 'take 1 tag and access 1 additional card from HQ',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreTags.gainTags(state, 'runner', 1, { unpreventable: true })], []);
      coreEngine.registerEvents(state, side, card, [coreDefHelpers.breachAccessBonus('hq', 1, { duration: 'end-of-run' })]);
      return coreEid.effectCompleted(state, side, eid);
    }),
  }],
};

// Falsified Credentials
export const falsifiedCredentials: CardDef = {
  title: 'Falsified Credentials',
  onPlay: {
    prompt: 'Choose one',
    choices: ['Agenda', 'Asset', 'Upgrade'],
    msg: msg('guess ', msg => msg),
    async: true,
    effect: effect(
      continue_ability(
        (() => {
          const chosenType = msg;
          return {
            choices: {
              card: (c: Card) => {
                const topmost = coreCard.getNestedHost(c);
                if (!topmost) return false;
                const zone = coreCard.getZone(topmost);
                return zone && coreServers.isRemote(zone[1]) && zone[zone.length - 1] === 'content' && !topmost.rezzed;
              },
            },
            async: true,
            effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              yield wait_for(state, [{ asyncResult: 'result' }, coreExpose.expose(state, side, [msg])], []);
              if (msg && chosenType === msg?.type) {
                yield continue_ability(
                  state,
                  'runner',
                  { msg: 'gain 5 [Credits]', async: true, effect: effect(coreGaining.gainCredits(eid, 5)) },
                  card,
                  null
                );
              }
            }),
          };
        })(),
        card,
        null
      )
    ),
  },
};

// Fear the Masses
export const fearTheMasses: CardDef = {
  title: 'Fear the Masses',
  makesRun: true,
  onPlay: runServerAbility('hq'),
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'hq',
    thisCardRun: true,
    mandatory: true,
    ability: {
      async: true,
      msg: 'force the Corp to trash the top card of R&D',
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.mill(state, 'corp', 'corp', 1)], []);
        const n = (state as any).runner?.hand?.filter((c: Card) => utils.sameCard('title', card, c)).length || 0;
        yield continue_ability(
          state,
          side,
          {
            async: true,
            prompt: msg('How many copies of ', msg => card.title, ' do you want to reveal?'),
            choices: {
              card: (c: Card) => coreCard.inHand(c) && utils.sameCard('title', card, c),
              max: n,
            },
            msg: msg('reveal ', msg => coreUtils.quantify((targets || []).length, 'cop', 'y', 'ies'), ' of itself, forcing the Corp to trash ', msg => coreUtils.quantify((targets || []).length, 'additional card'), ' from the top of R&D'),
            effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              yield wait_for(state, [{ asyncResult: 'result' }, coreRevealing.reveal(state, 'runner', targets || [])], []);
              yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.mill(state, 'corp', eid, (targets || []).length)], []);
            }),
          },
          card,
          null
        );
      }),
    },
  }],
};

// Feint
export const feint: CardDef = {
  title: 'Feint',
  makesRun: true,
  onPlay: runServerAbility('hq'),
  events: [
    {
      event: 'encounter-ice',
      automatic: 'bypass',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const count = coreCard.getCard(state, card)?.special?.bypassCount || 0;
        return count < 2;
      }),
      msg: msg('bypass ', msg => ctx.ice?.title),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreRuns.bypassIce(state)], []);
        const c = coreUpdate.updateIn(card, ['special', 'bypassCount'], (n: number) => (n || 0) + 1);
      }),
    },
    {
      event: 'successful-run',
      effect: effect(coreAccess.preventAccess()),
    },
  ],
};

// Finality
export const finality: CardDef = {
  title: 'Finality',
  makesRun: true,
  onPlay: runServerAbility('rd', { additionalCost: [corePayment.toC('brain', 1)] }),
  events: [{
    event: 'successful-run',
    silent: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return ctx.server === 'rd' && forms.thisCardRun;
    }),
    effect: effect(coreEngine.registerEvents(card, [coreDefHelpers.breachAccessBonus('rd', 3, { duration: 'end-of-run' })])),
  }],
};

// Fisk Investment Seminar
export const fiskInvestmentSeminar: CardDef = {
  title: 'Fisk Investment Seminar',
  onPlay: {
    msg: 'make each player draw 3 cards',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (state as any).runner?.deck?.length > 0 || (state as any).corp?.deck?.length > 0;
      }),
    },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, 'runner', 3, { suppressCheckpoint: true })], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, 'corp', eid, 3)], []);
    }),
  },
};

// Forged Activation Orders
export const forgedActivationOrders: CardDef = {
  title: 'Forged Activation Orders',
  onPlay: {
    choices: { card: (c: Card) => coreCard.ice(c) && !coreCard.rezzed(c) },
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => coreCard.ice(c) && !coreCard.rezzed(c));
      }),
    },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ice = msg;
      const serv = coreServers.zoneToName(coreCard.getZone(ice)?.[1]);
      yield continue_ability(
        state,
        'corp',
        {
          prompt: 'Choose one',
          choices: [
            (coreFlags.canRez(state, 'corp', ice) && corePayment.canPay(state, 'corp', eid, ice, null, [coreRezzing.getRezCost(state, 'corp', ice)]))
              ? `Rez ${coreToString.cardStr(state, ice)}`
              : null,
            `Trash ${coreToString.cardStr(state, ice)}`,
          ].filter(Boolean),
          async: true,
          msg: msg('force the Corp to ', msg => msg),
          waitingPrompt: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            if (msg.startsWith('Rez')) {
              yield wait_for(state, [{ asyncResult: 'result' }, coreRezzing.rez(state, 'corp', eid, ice)], []);
            } else {
              yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trash(state, 'corp', eid, ice, { causeCard: card, cause: 'forced-to-trash' })], []);
            }
          }),
        },
        card,
        null
      );
    }),
  },
};

// Forked
export const forked: CardDef = {
  title: 'Forked',
  ...cutlery('Sentry'),
};

// Frame Job
export const frameJob: CardDef = {
  title: 'Frame Job',
  onPlay: {
    prompt: 'Choose an agenda to forfeit',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.scored?.length > 0; }),
    },
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.scored || []; }),
    msg: msg('forfeit ', msg => msg, ' and give the Corp 1 bad publicity'),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(
        state,
        [{ asyncResult: 'result' }, coreMoving.forfeit(state, side, coreEid.makeEid(state, eid), msg, { msg: false })],
        []
      );
      yield wait_for(state, [{ asyncResult: 'result' }, coreBadPublicity.gainBadPublicity(state, 'corp', eid, 1)], []);
    }),
  },
};

// Frantic Coding
export const franticCoding: CardDef = {
  title: 'Frantic Coding',
  onPlay: {
    async: true,
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.deck?.length > 0; }),
    },
    effect: effect(
      continue_ability(
        (() => {
          const topTen = (state as any).runner?.deck?.slice(0, 10) || [];
          return {
            prompt: `The top cards of the stack are (top->bottom): ${topTen.map((c: Card) => c.title).join(', ')}`,
            choices: ['OK'],
            async: true,
            effect: effect(
              continue_ability(
                {
                  prompt: 'Install a program?',
                  choices: [
                    ...(topTen.filter((c: Card) => coreCard.program(c) && coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card }, c, { costBonus: -5 })))
                      .sort((a: Card, b: Card) => (a.title || '').localeCompare(b.title || ''))
                      .map((c: Card) => c.title),
                    'Done',
                  ],
                  async: true,
                  effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                    const numberShuffles = (coreEvents.turnEvents(state, 'runner', 'runner-shuffle-deck') || []).length;
                    yield wait_for(
                      state,
                      [{ asyncResult: 'result' },
                        coreInstalling.runnerInstall(
                          coreEid.makeEid(state, { source: card, sourceType: 'runner-install' }),
                          msg,
                          { costBonus: -5, msgKeys: { displayOrigin: true, installSource: card } }
                        )
                      ],
                      []
                    );
                    const newShuffles = (coreEvents.turnEvents(state, 'runner', 'runner-shuffle-deck') || []).length;
                    if (numberShuffles === newShuffles) {
                      coreSay.systemMsg(state, side, `uses ${card.title} to trash ${topTen.map((c: Card) => c.title).join(', ')} from the top of the stack`);
                      yield wait_for(
                        state,
                        [{ asyncResult: 'result' },
                          coreMoving.trashCards(state, side, eid, topTen.filter((c: Card) => !utils.sameCard(c, msg)), { unpreventable: true, causeCard: card })
                        ],
                        []
                      );
                    } else {
                      coreSay.systemMsg(state, side, 'does not have to trash cards because the stack was shuffled');
                    }
                    return coreEid.effectCompleted(state, side, eid);
                  }),
                },
                card,
                null
              )
            ),
          };
        })(),
        card,
        null
      )
    ),
  },
};

// "Freedom Through Equality"
export const freedomThroughEquality: CardDef = {
  title: '"Freedom Through Equality"',
  events: [{
    event: 'agenda-stolen',
    msg: 'add itself to [their] score area as an agenda worth 1 agenda point',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.asAgenda(state, 'runner', card, 1)], []);
    }),
  }],
};

// Freelance Coding Contract
export const freelanceCodingContract: CardDef = {
  title: 'Freelance Coding Contract',
  onPlay: {
    choices: { max: 5, card: (c: Card) => coreCard.program(c) && coreCard.inHand(c) },
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.hand?.length > 0; }),
    },
    msg: msg('trash ', msg => (targets || []).map((c: Card) => c.title).join(', '), ' and gain ', msg => (targets || []).length * 2, ' [Credits]'),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trashCards(state, side, targets, { unpreventable: true, causeCard: card })], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, eid, (targets || []).length * 2)], []);
    }),
  },
};

// Game Day
export const gameDay: CardDef = {
  title: 'Game Day',
  onPlay: {
    msg: msg('draw ', msg => coreUtils.quantify(coreHandSize.handSize(state, 'runner') - ((state as any).runner?.hand?.length || 0), 'card')),
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreHandSize.handSize(state, 'runner') - ((state as any).runner?.hand?.length || 0) > 0;
      }),
    },
    async: true,
    effect: effect(coreDrawing.draw(eid, coreHandSize.handSize(state, 'runner') - ((state as any).runner?.hand?.length || 0))),
  },
};

// Glut Cipher
export const glutCipher: CardDef = {
  title: 'Glut Cipher',
  makesRun: true,
  onPlay: runServerAbility('archives'),
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'archives',
    thisCardRun: true,
    mandatory: true,
    ability: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).corp?.discard?.length >= 5; }),
      showDiscard: true,
      async: true,
      player: 'corp',
      waitingPrompt: true,
      prompt: 'Choose 5 cards from Archives to add to HQ',
      choices: { max: 5, all: true, card: (c: Card) => coreCard.corp(c) && coreCard.inDiscard(c) },
      msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const seen = (targets || []).filter((c: Card) => c.seen);
        const m = (targets || []).filter((c: Card) => !c.seen).length;
        return `move ${seen.map((c: Card) => c.title).join(', ')}${m > 0 ? (seen.length > 0 ? ' and ' : '') + coreUtils.quantify(m, 'unseen card') : ''} into HQ, then trash 5 cards`;
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        for (const c of targets || []) {
          yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, side, c, 'hand')], []);
        }
        const corpHand = (state as any).corp?.hand || [];
        yield wait_for(
          state,
          [{ asyncResult: 'result' },
            coreMoving.trashCards(state, 'corp', eid, (corpHand || []).slice(0, 5).sort(() => Math.random() - 0.5), { causeCard: card })
          ],
          []
        );
      }),
    },
  }],
};

// Government Investigations
export const governmentInvestigations: CardDef = {
  title: 'Government Investigations',
  flags: { 'prevent-secretly-spend': req(2) },
};

// Guinea Pig
export const guineaPig: CardDef = {
  title: 'Guinea Pig',
  onPlay: {
    msg: 'trash all cards in the grip and gain 10 [Credits]',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(
        state,
        [{ asyncResult: 'result' }, coreMoving.trashCards(state, side, (state as any).runner?.hand || [], { unpreventable: true, causeCard: card })],
        []
      );
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, 'runner', eid, 10)], []);
    }),
  },
};

// Hacktivist Meeting
export const hacktivistMeeting: CardDef = {
  title: 'Hacktivist Meeting',
  staticAbilities: [{
    type: 'rez-additional-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return msg; }),
    value: [corePayment.toC('randomly-trash-from-hand', 1)],
  }],
};

// Harmony AR Therapy
export const harmonyArTherapy: CardDef = {
  title: 'Harmony AR Therapy',
  onPlay: {
    rfgInsteadOfTrashing: true,
    waitingPrompt: true,
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (!coreCard.zoneLocked(state, 'runner', 'discard') && (state as any).runner?.discard?.length > 0) {
        yield continue_ability(
          state,
          side,
          harmonyChooseNext([], null, (state as any).runner?.discard?.map((c: Card) => c.title) || []),
          card,
          null
        );
      } else {
        coreSay.systemMsg(state, 'runner', `uses ${card.title} to shuffle the stack`);
        yield wait_for(state, [{ asyncResult: 'result' }, coreShuffling.shuffle(state, 'runner', 'deck')], []);
        return coreEid.effectCompleted(state, side, eid);
      }
    }),
  },
};

function harmonyChooseNext(toShuffle: string[], target: any, remaining: string[]): any {
  remaining = msg === 'Done' ? remaining : remaining.filter((x: string) => x !== msg);
  const toShuffleArr = msg === 'Done' ? toShuffle : (target ? [...toShuffle, target] : []);
  const remainingChoices = 5 - toShuffleArr.length;
  const finished = msg === 'Done' || remainingChoices === 0 || remaining.length === 0;
  return {
    prompt: finished
      ? `Shuffling: ${toShuffleArr.join(', ')}`
      : `Choose up to ${remainingChoices} more cards.${toShuffleArr.length > 0 ? '[br]Shuffling: ' + toShuffleArr.join(', ') : ''}`,
    async: true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return finished ? ['OK', 'Start over'] : [...remaining, ...(toShuffleArr.length > 0 ? ['Done'] : [])];
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (finished) {
        if (msg === 'OK') {
          yield continue_ability(state, side, harmonyChooseEnd(toShuffleArr), card, null);
        } else {
          yield continue_ability(
            state,
            side,
            harmonyChooseNext([], null, [...new Set((state as any).runner?.discard?.map((c: Card) => c.title) || [])]),
            card,
            null
          );
        }
      } else {
        yield continue_ability(state, side, harmonyChooseNext(toShuffleArr, msg, remaining), card, null);
      }
    }),
  };
}

function harmonyChooseEnd(toShuffle: string[]): any {
  toShuffle = [...new Set(toShuffle)];
  return {
    msg: msg('shuffle ', msg => coreUtils.quantify(toShuffle.length, 'card'), ' back into the stack: ', msg => toShuffle.join(', ')),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      for (const cTitle of toShuffle) {
        const c = (state as any).runner?.discard?.find((x: Card) => x.title === cTitle);
        if (c) {
          yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, side, c, 'deck')], []);
        }
      }
      yield wait_for(state, [{ asyncResult: 'result' }, coreShuffling.shuffle(state, side, 'deck')], []);
    }),
  };
}

// High-Stakes Job
export const highStakesJob: CardDef = {
  title: 'High-Stakes Job',
  makesRun: true,
  onPlay: {
    prompt: 'Choose a server',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const unrezzedIce = (server: string) => (state as any).corp?.servers?.[server]?.ices?.some((c: Card) => !coreCard.rezzed(c));
      const badZones = Object.keys((state as any).corp?.servers || {}).filter((s: string) => !unrezzedIce(s));
      return (coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null)) || []).filter((s: string) => !badZones.includes(s));
    }),
    async: true,
    effect: effect(coreRuns.makeRun(eid, msg, card)),
  },
  events: [{
    event: 'run-ends',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return ctx.successful && forms.thisCardRun;
    }),
    msg: 'gain 12 [Credits]',
    async: true,
    effect: effect(coreGaining.gainCredits('runner', eid, 12)),
  }],
};

// Hostage
export const hostage: CardDef = {
  title: 'Hostage',
  onPlay: {
    prompt: 'Choose a Connection',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.deck?.length > 0; }),
    },
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const deck = (state as any).runner?.deck || [];
      return corePrompts.cancellable(deck.filter((c: Card) => coreCard.hasSubtype(c, 'Connection')), 'sorted');
    }),
    msg: msg('add ', msg => msg, ' from the stack to the grip and shuffle the stack'),
    async: true,
    cancel: coreShuffling.failToFind,
    effect: effect(
      coreEngine.triggerEvent('searched-stack'),
      continue_ability(
        (() => {
          const connection = msg;
          if (coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card }, connection)) {
            return {
              optional: {
                prompt: msg('Install ', msg => connection.title, '?'),
                yesAbility: {
                  async: true,
                  effect: effect(
                    coreInstalling.runnerInstall({ ...eid, source: card, sourceType: 'runner-install' }, connection, null),
                    coreShuffling.shuffle('deck')
                  ),
                },
                noAbility: {
                  effect: effect(coreMoving.move(connection, 'hand'), coreShuffling.shuffle('deck')),
                },
              },
            };
          }
          return { effect: effect(coreMoving.move(connection, 'hand'), coreShuffling.shuffle('deck')) };
        })(),
        card,
        null
      )
    ),
  },
};

// Hot Pursuit
export const hotPursuit: CardDef = {
  title: 'Hot Pursuit',
  makesRun: true,
  onPlay: runServerAbility('hq'),
  events: [{
    event: 'successful-run',
    automatic: 'gain-credits',
    async: true,
    msg: 'gain 9 [Credits] and take 1 tag',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return ctx.server === 'hq' && forms.thisCardRun;
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreTags.gainTags(state, 'runner', 1, { suppressCheckpoint: true })], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, 'runner', eid, 9)], []);
    }),
  }],
};

// I've Had Worse
export const iveHadWorse: CardDef = {
  title: "I've Had Worse",
  onPlay: {
    async: true,
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.deck?.length > 0; }),
    },
    effect: effect(coreDrawing.draw(eid, 3)),
  },
  onTrash: {
    whenInactive: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return ['meat', 'net'].includes(ctx.cause);
    }),
    msg: 'draw 3 cards',
    effect: effect(coreDrawing.draw('runner', eid, 3)),
  },
};

// Illumination
export const illumination: CardDef = {
  title: 'Illumination',
  makesRun: true,
  playSound: 'illumination',
  onPlay: runServerAbility('rd'),
  events: [illuminationInstallFn(3)],
};

function illuminationInstallFn(remaining: number): any {
  return {
    ...illuminationInstallChoice(remaining),
    event: 'successful-run',
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return forms.thisCardRun && ctx.server === 'rd';
    }),
  };
}

function illuminationInstallChoice(remaining: number): any {
  return {
    prompt: `install a card from the Grip, paying 1 [Credits] less (${remaining} remaining)`,
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const t = targets[0];
        return coreCard.inHandStar(state, t) &&
          (coreCard.hardware(t) || coreCard.resource(t) || coreCard.program(t)) &&
          coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card }, t, { costBonus: -1 });
      }),
    },
    async: true,
    waitingPrompt: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(
        state,
        [{ asyncResult: 'result' }, coreInstalling.runnerInstall(state, side, msg, { costBonus: -1, msgKeys: { installSource: card, displayOrigin: true } })],
        []
      );
      if (remaining > 1) {
        yield continue_ability(state, side, illuminationInstallChoice(remaining - 1), card, null);
      } else {
        return coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

// Immolation Script
export const immolationScript: CardDef = {
  title: 'Immolation Script',
  makesRun: true,
  onPlay: runServerAbility('archives'),
  events: [{
    event: 'breach-server',
    automatic: 'pre-breach',
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return ctx.server === 'archives' &&
        [...(state as any).corp?.discard?.filter((c: Card) => coreCard.ice(c)).map((c: Card) => c.title), ...((coreBoard.allInstalled(state, 'corp') || [])
          .filter((c: Card) => coreCard.rezzed(c))
          .map((c: Card) => c.title))].filter((x: string, i: number, a: string[]) => a.indexOf(x) === i).length > 0;
    }),
    prompt: 'Choose a piece of ice in Archives',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (state as any).corp?.discard?.filter((c: Card) => coreCard.ice(c)) || [];
    }),
    effect: effect(
      continue_ability(
        {
          async: true,
          prompt: msg('Choose a rezzed copy of ', msg => msg, ' to trash'),
          choices: { card: (c: Card) => coreCard.ice(c) && coreCard.rezzed(c) && utils.sameCard('title', c, msg) },
          msg: msg('trash ', msg => coreToString.cardStr(state, msg)),
          effect: effect(coreMoving.trash(eid, msg, { causeCard: card })),
        },
        card,
        null
      )
    ),
  }],
};

// In the Groove
export const inTheGroove: CardDef = {
  title: 'In the Groove',
  events: [{
    event: 'runner-install',
    duration: 'end-of-turn',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (ctx.card?.cost || 0) >= 1 && !ctx.facedown;
    }),
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.hasSubtype(ctx.card, 'Cybernetic') || coreEvents.firstEvent(state, side, 'runner-install');
    }),
    async: true,
    prompt: 'Choose one',
    waitingPrompt: true,
    choices: ['Draw 1 card', 'Gain 1 [Credits]'],
    msg: msg(msg => msg),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (msg === 'Draw 1 card') {
        yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, side, eid, 1)], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, eid, 1)], []);
      }
    }),
  }],
};

// Independent Thinking
export const independentThinking: CardDef = {
  title: 'Independent Thinking',
  onPlay: {
    prompt: 'Choose up to 5 installed cards to trash',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (coreBoard.allInstalled(state, 'runner') || []).length > 0; }),
    },
    choices: { max: 5, card: (c: Card) => coreCard.installed(c) && coreCard.runner(c) },
    msg: msg('trash ', msg => (targets || []).map((c: Card) => c.title).join(', '), ' and draw ', msg => coreUtils.quantify((targets || []).length * (targets || []).some((c: Card) => !c.facedown && coreCard.hasSubtype(c, 'Directive')) ? 2 : 1, 'card')),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const cardsToDraw = (targets || []).length * ((targets || []).some((c: Card) => !c.facedown && coreCard.hasSubtype(c, 'Directive')) ? 2 : 1);
      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trashCards(state, side, targets, { causeCard: card })], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, 'runner', eid, cardsToDraw)], []);
    }),
  },
};

// Indexing
export const indexing: CardDef = {
  title: 'Indexing',
  makesRun: true,
  onPlay: runServerAbility('rd'),
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'rd',
    thisCardRun: true,
    ability: {
      msg: 'rearrange the top 5 cards of R&D',
      waitingPrompt: true,
      async: true,
      effect: effect(
        continue_ability(
          (() => {
            const from = (state as any).corp?.deck?.slice(0, 5) || [];
            if (from.length > 0) {
              return coreDefHelpers.reorderChoice('corp', 'corp', from, [], from.length, from);
            }
          })(),
          card,
          null
        )
      ),
    },
  }],
};

// Infiltration
export const infiltration: CardDef = {
  title: 'Infiltration',
  onPlay: coreChooseOne.chooseOneHelper([
    { option: 'Gain 2 [Credits]', ability: gainCreditsAbility(2) },
    {
      option: 'Expose a card',
      ability: {
        choices: { card: (c: Card) => coreCard.installed(c) && !coreCard.rezzed(c) },
        async: true,
        effect: effect(coreExpose.expose(eid, [msg])),
      },
    },
  ]),
};

// Information Sifting
export const informationSifting: CardDef = {
  title: 'Information Sifting',
  makesRun: true,
  onPlay: runServerAbility('hq'),
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'hq',
    thisCardRun: true,
    mandatory: true,
    ability: {
      player: 'corp',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).corp?.hand?.length >= 1; }),
      async: true,
      waitingPrompt: true,
      prompt: msg('Choose up to ', msg => coreUtils.quantify((state as any).corp?.hand?.length - 1 || 0, 'card'), ' for the first pile'),
      choices: { card: (c: Card) => coreCard.inHand(c) && coreCard.corp(c), max: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).corp?.hand?.length - 1 || 0; }) },
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield continue_ability(
          state,
          'runner',
          informationSiftingWhichPile(targets || [], (state as any).corp?.hand || []).filter((c: Card) => !targets.includes(c)),
          card,
          null
        );
      }),
    },
  }],
};

function informationSiftingWhichPile(p1: Card[], p2: Card[]): any {
  return {
    waitingPrompt: true,
    prompt: msg('Choose a pile to access'),
    choices: ['Pile 1', 'Pile 2'],
    async: true,
    effect: effect(
      continue_ability(
        {
          player: 'corp',
          req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).corp?.hand?.length >= 1; }),
          async: true,
          waitingPrompt: true,
          prompt: msg('Choose up to ', msg => coreUtils.quantify((state as any).corp?.hand?.length - 1 || 0, 'card'), ' for the first pile'),
          choices: { card: (c: Card) => coreCard.inHand(c) && coreCard.corp(c), max: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).corp?.hand?.length - 1 || 0; }) },
          effect: effect(continue_ability(state, 'runner', informationSiftingWhichPile(targets || [], (state as any).corp?.hand || []).filter((c: Card) => !targets.includes(c)), card, null)),
        },
        card,
        null
      )
    ),
  };
}

// Inject
export const inject: CardDef = {
  title: 'Inject',
  onPlay: {
    async: true,
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.deck?.length > 0; }),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const cards = (state as any).runner?.deck?.slice(0, 4) || [];
      const programs = cards.filter((c: Card) => coreCard.program(c));
      const others = cards.filter((c: Card) => !coreCard.program(c));
      yield wait_for(state, [{ asyncResult: 'result' }, coreRevealing.reveal(state, side, cards)], []);
      if (programs.length > 0) {
        yield wait_for(
          state,
          [{ asyncResult: 'result' }, coreMoving.trashCards(state, side, programs, { unpreventable: true, causeCard: card })],
          []
        );
        coreSay.systemMsg(state, side, `reveals ${programs.map((c: Card) => c.title).join(', ')} from the top of the stack, trashes them, and gains ${programs.length} [Credits]`);
        yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, programs.length)], []);
        for (const c of others) {
          yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, side, c, 'hand')], []);
          coreSay.systemMsg(state, side, `adds ${c.title} to the grip`);
        }
      } else {
        for (const c of others) {
          yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, side, c, 'hand')], []);
          coreSay.systemMsg(state, side, `adds ${c.title} to the grip`);
        }
      }
      return coreEid.effectCompleted(state, side, eid);
    }),
  },
};

// Injection Attack
export const injectionAttack: CardDef = {
  title: 'Injection Attack',
  makesRun: true,
  onPlay: {
    prompt: 'Choose a server',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null));
    }),
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null)).length > 0;
      }),
    },
    async: true,
    effect: effect(
      continue_ability(
        {
          prompt: 'Choose an icebreaker',
          choices: { card: (c: Card) => coreCard.installed(c) && coreCard.hasSubtype(c, 'Icebreaker') },
          async: true,
          effect: effect(coreIce.pump(msg, 2, 'end-of-run'), coreRuns.makeRun(eid, msg, card)),
        },
        card,
        null
      )
    ),
  },
};

// Inside Job
export const insideJob: CardDef = {
  title: 'Inside Job',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [{
    event: 'encounter-ice',
    automatic: 'bypass',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreEvents.firstRunEvent(state, side, 'encounter-ice') && forms.thisCardIsRunSource;
    }),
    msg: msg('bypass ', msg => ctx.ice?.title),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreRuns.bypassIce(state)], []);
    }),
  }],
};

// Insight
export const insight: CardDef = {
  title: 'Insight',
  onPlay: {
    async: true,
    player: 'corp',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).corp?.deck?.length > 0; }),
    },
    waitingPrompt: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(
        state,
        [{ asyncResult: 'result' }, coreEngine.resolveAbility(state, 'corp', coreDefHelpers.reorderChoice('corp', (state as any).corp?.deck?.slice(0, 4) || []), card, targets)],
        []
      );
      const top4 = (state as any).corp?.deck?.slice(0, 4) || [];
      coreSay.systemMsg(state, 'runner', `reveals ${top4.map((c: Card) => c.title).join(', ')} from the top of R&D (top->bottom)`);
      yield wait_for(state, [{ asyncResult: 'result' }, coreRevealing.reveal(state, 'runner', eid, top4)], []);
    }),
  },
};

// Interdiction
export const interdiction: CardDef = {
  title: 'Interdiction',
  onPlay: {
    msg: "prevent the Corp from rezzing non-ice cards on the Runner's turn",
    effect: effect(
      coreFlags.registerTurnFlag(
        card,
        'can-rez',
        function*(state: State, _side: Side, card: Card) {
          if (state.activePlayer === 'runner' && !coreCard.ice(card)) {
            coreToasts.toast(state, 'corp', "Cannot rez non-ice on the Runner's turn due to Interdiction");
            return false;
          }
          return true;
        }
      )
    ),
  },
  events: [{
    event: 'runner-turn-begins',
    silent: true,
    effect: effect(
      coreFlags.registerTurnFlag(
        card,
        'can-rez',
        function*(state: State, _side: Side, card: Card) {
          if (state.activePlayer === 'runner' && !coreCard.ice(card)) {
            coreToasts.toast(state, 'corp', "Cannot rez non-ice on the Runner's turn due to Interdiction");
            return false;
          }
          return true;
        }
      )
    ),
  }],
  leavePlay: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    coreFlags.clearAllFlagsForCard(state, side, card);
  }),
};

// Into the Depths
export const intoTheDepths: CardDef = {
  title: 'Into the Depths',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [{
    event: 'successful-run',
    automatic: 'gain-credits',
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.thisCardRun; }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const icePassed = coreEvents.runEventCount(state, side, 'pass-ice') || 0;
      const numChoices = Math.max(0, Math.min(3, icePassed));
      if (numChoices > 0) {
        yield continue_ability(
          state,
          side,
          intoTheDepthsChoice(intoTheDepthsAll, numChoices),
          card,
          null
        );
      } else {
        return coreEid.effectCompleted(state, side, eid);
      }
    }),
  }],
};

const intoTheDepthsAll = [
  { msg: 'gain 4 [Credits]', async: true, effect: effect(coreGaining.gainCredits(eid, 4)) },
  {
    msg: 'install a program from the stack',
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return !coreInstalling.installLocked(state, side); }),
    effect: effect(
      continue_ability(
        {
          prompt: 'Choose a program to install',
          msg: msg(msg => msg === 'Done' ? 'shuffle the stack' : `install ${msg} from the stack`),
          choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            return [
              ...(state as any).runner?.deck?.filter((c: Card) => coreCard.program(c) && coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card }, c)))
                .sort((a: Card, b: Card) => (a.title || '').localeCompare(b.title || ''))
                .map((c: Card) => c.title),
              'Done',
            ];
          }),
          async: true,
          effect: effect(
            coreEngine.triggerEvent(state, side, 'searched-stack'),
            coreShuffling.shuffle(state, side, 'deck'),
            msg === 'Done' ? coreEid.effectCompleted(state, side, eid) : coreInstalling.runnerInstall({ ...eid, source: card, sourceType: 'runner-install' }, msg, { msgKeys: { installSource: card, displayOrigin: true } })
          ),
        },
        card,
        null
      )
    ),
  },
  { async: true, effect: effect(continue_ability(state, side, coreCharge.chargeAbility(state, side), card, null)), msg: 'charge a card' },
];

function intoTheDepthsChoice(abis: any[], rem: number): any {
  return {
    prompt: `Choose an ability to resolve (${rem} remaining)`,
    waitingPrompt: true,
    choices: abis.map((a: any) => a.msg.charAt(0).toUpperCase() + a.msg.slice(1)),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const chosen = abis.find((a: any) => msg === a.msg.charAt(0).toUpperCase() + a.msg.slice(1));
      yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.resolveAbility(state, side, chosen, card, null)], []);
      if (rem > 1) {
        yield continue_ability(state, side, intoTheDepthsChoice(abis.filter((a: any) => a !== chosen), rem - 1), card, null);
      } else {
        return coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

// Isolation
export const isolation: CardDef = {
  title: 'Isolation',
  onPlay: {
    additionalCost: [corePayment.toC('resource', 1)],
    msg: 'gain 7 [Credits]',
    async: true,
    effect: effect(coreGaining.gainCredits(eid, 7)),
  },
};

// Itinerant Protesters
export const itinerantProtesters: CardDef = {
  title: 'Itinerant Protesters',
  onPlay: {
    msg: "reduce the Corp's maximum hand size by 1 for each bad publicity",
  },
  staticAbilities: [coreHandSize.corpHandSizePlus(req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return -(state as any).corp?.badPublicity?.additional || 0;
  }))],
};

// Jailbreak
export const jailbreak: CardDef = {
  title: 'Jailbreak',
  makesRun: true,
  onPlay: runServerFromChoicesAbility(['HQ', 'R&D']),
  events: [{
    event: 'successful-run',
    automatic: 'draw-cards',
    silent: true,
    async: true,
    msg: 'draw 1 card',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return ['hq', 'rd'].includes(ctx.server) && forms.thisCardRun;
    }),
    effect: effect(
      coreEngine.registerEvents(card, [coreDefHelpers.breachAccessBonus(ctx.server, 1, { duration: 'end-of-run' })]),
      coreDrawing.draw(eid, 1)
    ),
  }],
};

// Joy Ride
export const joyRide: CardDef = {
  title: 'Joy Ride',
  onPlay: {
    async: true,
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null)) || []).includes('rd');
      }),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreRuns.makeRun(state, side, eid, 'rd', card)], []);
    }),
  },
  events: [{
    event: 'successful-run',
    automatic: 'draw-cards',
    silent: true,
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return ctx.server === 'rd' && forms.thisCardRun;
    }),
    msg: 'draw 5 cards',
    effect: effect(coreDrawing.draw(eid, 5)),
  }],
};

// Katorga Breakout
export const katorgaBreakout: CardDef = {
  title: 'Katorga Breakout',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [{
    event: 'successful-run',
    automatic: 'draw-cards',
    req: req(function*(state: Side, eid: EID, card: Card, targets: any[]) {
      return forms.thisCardRun && !coreCard.zoneLocked(state, 'runner', 'discard');
    }),
    prompt: 'Choose 1 card to add to the grip',
    waitingPrompt: true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return corePrompts.cancellable((state as any).runner?.discard || [], 'sorted');
    }),
    msg: msg('add ', msg => msg, ' to the grip'),
    effect: effect(coreMoving.move(msg, 'hand')),
  }],
};

// Khusyuk
export const khusyuk: CardDef = {
  title: 'Khusyuk',
  makesRun: true,
  onPlay: runServerAbility('rd'),
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'rd',
    thisCardRun: true,
    mandatory: true,
    ability: {
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const installCost = khusyukSelectInstallCost(state);
        yield wait_for(
          state,
          [{ asyncResult: 'result' }, coreEngine.resolveAbility(state, side, installCost, card, null)],
          []
        );
        const revealed = (state as any).corp?.deck?.slice(0, asyncResult?.[1] || 0) || [];
        coreSay.systemMsg(state, 'runner', `uses ${card.title} to choose an install cost of ${asyncResult?.[0]} [Credit] and reveals ${revealed.map((c: Card) => c.title).join(', ')} from the top of R&D (top->bottom)`);
        if (revealed.length > 0 && !coreAccess.getOnlyCardToAccess(state)) {
          yield wait_for(
            state,
            [{ asyncResult: 'result' }, coreRevealing.reveal(eid, revealed)],
            []
          );
          yield wait_for(
            state,
            [{ asyncResult: 'result' }, coreEngine.resolveAbility(state, side, khusyukAccessRevealed(revealed), card, null)],
            []
          );
        }
        yield wait_for(state, [{ asyncResult: 'result' }, coreShuffling.shuffle(state, 'corp', 'deck')], []);
        coreSay.systemMsg(state, 'runner', 'shuffles R&D');
        return coreEid.effectCompleted(state, side, eid);
      }),
    },
  }],
};

function khusyukSelectInstallCost(state: State): any {
  return {
    async: true,
    prompt: 'Choose an install cost from among your installed cards',
    choices: ['1 [Credit]'],
    effect: effect(coreEid.completeWithResult(eid, [1, 1])),
  };
}

function khusyukAccessRevealed(revealed: Card[]): any {
  return {
    async: true,
    prompt: 'Choose a card to access',
    waitingPrompt: true,
    notDistinct: true,
    choices: revealed.map((c: Card) => c.title),
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return ctx.maxAccess !== 0; }),
    effect: effect(coreAccess.accessCard(eid, msg)),
  };
}

// Knifed
export const knifed: CardDef = {
  title: 'Knifed',
  ...cutlery('Barrier'),
};

// Kompromat
export const kompromat: CardDef = {
  title: 'Kompromat',
  makesRun: true,
  onPlay: {
    async: true,
    rfgInsteadOfTrashing: true,
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return kompromatIcedServers(state, side, eid, card).length > 0;
      }),
    },
    prompt: 'Choose an iced server',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return kompromatIcedServers(state, side, eid, card);
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreRuns.makeRun(state, side, eid, msg, card)], []);
    }),
  },
  events: [{
    event: 'run-ends',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return forms.thisCardRun && ctx.successful;
    }),
    async: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const validIce = (coreBoard.allInstalled(state, 'corp') || []).filter((c: Card) =>
        coreCard.ice(c) && coreCard.rezzed(c) && (ctx.server === (coreCard.getZone(c) as string[])[1])
      );
      if (validIce.length > 0) {
        yield continue_ability(
          state,
          side,
          {
            prompt: 'Derez an ice? (if you click done, you take a bad publicity)',
            player: 'corp',
            waitingPrompt: true,
            choices: {
              req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                return validIce.some((c: Card) => utils.sameCard(c, msg));
              }),
            },
            cancel: {
              displaySide: 'runner',
              msg: 'give the Corp 1 bad publicity',
              async: true,
              effect: effect(coreBadPublicity.gainBadPublicity(state, 'runner', eid, 1)),
            },
            msg: msg('derez ', msg => coreToString.cardStr(state, msg)),
            displaySide: 'corp',
            async: true,
            effect: effect(coreRezzing.derez(state, side, eid, msg, { noMsg: true })),
          },
          card,
          null
        );
      } else {
        yield wait_for(state, [{ asyncResult: 'result' }, coreBadPublicity.gainBadPublicity(state, 'runner', eid, 1)], []);
      }
    }),
  }],
};

function kompromatIcedServers(state: State, side: Side, eid: EID, card: Card): string[] {
  return (coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null)) || []).filter((s: string) => {
    const server = (state as any).corp?.servers?.[coreBoard.serverToZone(state, s)?.[1]];
    return server?.ices?.length > 0;
  });
}

// Kraken
export const kraken: CardDef = {
  title: 'Kraken',
  onPlay: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (state as any).runner?.register?.stoleAgenda;
    }),
    prompt: 'Choose a server',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => coreCard.ice(c));
      }),
    },
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreServers.zonesToSortedNames(coreBoard.getZones(state));
    }),
    msg: msg('force the Corp to trash a piece of ice protecting ', msg => msg),
    async: true,
    effect: effect(
      continue_ability(
        {
          player: 'corp',
          async: true,
          prompt: msg('Choose a piece of ice in ', msg => msg, ' to trash'),
          choices: { card: (c: Card) => coreCard.ice(c) && (coreBoard.serverToZone(state, msg)?.[1] === (coreCard.getZone(c) as string[])[1]) },
          effect: effect(
            coreSay.systemMsg(`trashes ${coreToString.cardStr(state, msg)}`),
            coreMoving.trash('corp', eid, msg, { causeCard: card })
          ),
        },
        card,
        null
      )
    ),
  },
};

// Labor Rights
export const laborRights: CardDef = {
  title: 'Labor Rights',
  onPlay: {
    rfgInsteadOfTrashing: true,
    async: true,
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (state as any).runner?.deck?.length > 0 || ((state as any).runner?.discard?.length > 0 && !coreCard.zoneLocked(state, 'runner', 'discard'));
      }),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const millCount = Math.min(3, (state as any).runner?.deck?.length || 0);
      const topNMsg = (state as any).runner?.deck?.slice(0, millCount) || [];
      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.mill(state, 'runner', 'runner', millCount)], []);
      if (topNMsg.length > 0) {
        coreSay.systemMsg(state, 'runner', `trashes ${topNMsg.map((c: Card) => c.title).join(', ')} from the top of the stack`);
      } else {
        coreSay.systemMsg(state, 'runner', 'trashes no cards from the top of the stack');
      }
      const heapCount = Math.min(3, (state as any).runner?.discard?.length || 0);
      yield continue_ability(
        state,
        side,
        !coreCard.zoneLocked(state, 'runner', 'discard')
          ? {
              prompt: msg('Choose ', msg => coreUtils.quantify(heapCount, 'card'), ' to shuffle into the stack'),
              showDiscard: true,
              async: true,
              choices: { max: heapCount, all: true, 'not-self': true, card: (c: Card) => coreCard.runner(c) && coreCard.inDiscard(c) },
              effect: effect(
                function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                  for (const c of targets || []) {
                    yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, side, c, 'deck')], []);
                  }
                },
                coreSay.systemMsg(state, 'runner', `shuffles ${targets?.map((c: Card) => c.title).join(', ')} from the heap into the stack, and draws 1 card`),
                coreShuffling.shuffle(state, 'runner', 'deck'),
                coreDrawing.draw(state, 'runner', eid, 1)
              ),
            }
          : {
              async: true,
              effect: effect(
                coreSay.systemMsg(state, 'runner', 'shuffles the stack and draws 1 card'),
                coreShuffling.shuffle(state, 'runner', 'deck'),
                coreDrawing.draw(state, 'runner', eid, 1)
              ),
            },
        card,
        null
      );
    }),
  },
};

// Lawyer Up
export const lawyerUp: CardDef = {
  title: 'Lawyer Up',
  onPlay: {
    msg: 'remove 2 tags and draw 3 cards',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return utils.isTagged(state) || (state as any).runner?.deck?.length > 0;
      }),
    },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreTags.loseTags(state, side, 2)], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, side, eid, 3)], []);
    }),
  },
};

// Lean and Mean
export const leanAndMean: CardDef = {
  title: 'Lean and Mean',
  makesRun: true,
  onPlay: {
    prompt: 'Choose a server',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null)).length > 0;
      }),
    },
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null));
    }),
    msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      let result = `make a run on ${msg}`;
      if ((coreBoard.allActiveInstalled(state, 'runner') || []).filter((c: Card) => coreCard.program(c)).length <= 3) {
        result += ', giving +2 strength to all icebreakers';
      }
      return result;
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if ((coreBoard.allActiveInstalled(state, 'runner') || []).filter((c: Card) => coreCard.program(c)).length <= 3) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreIce.pumpAllIcebreakers(state, side, 2, 'end-of-run')], []);
      }
      yield wait_for(state, [{ asyncResult: 'result' }, coreRuns.makeRun(state, side, eid, msg, card)], []);
    }),
  },
};

// Leave No Trace
export const leaveNoTrace: CardDef = {
  title: 'Leave No Trace',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [{
    event: 'run-ends',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const rezzedIce = (coreEvents.runEvents(msg, 'rez') || [])
        .map((e: [any, any]) => {
          const cardData = e[0]?.card;
          return cardData && coreCard.ice(cardData) ? coreCard.getCard(state, cardData) : null;
        })
        .filter((c: Card) => c && coreCard.rezzed(c));
      yield wait_for(state, [{ asyncResult: 'result' }, coreRezzing.derez(state, 'runner', eid, rezzedIce)], []);
    }),
  }],
};

// Legwork
export const legwork: CardDef = {
  title: 'Legwork',
  makesRun: true,
  onPlay: runServerAbility('hq'),
  events: [{
    event: 'successful-run',
    silent: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return ctx.server === 'hq' && forms.thisCardRun;
    }),
    effect: effect(coreEngine.registerEvents(card, [coreDefHelpers.breachAccessBonus('hq', 2, { duration: 'end-of-run' })])),
  }],
};

// Leverage
export const leverage: CardDef = {
  title: 'Leverage',
  onPlay: {
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (state as any).runner?.register?.successfulRun?.includes('hq');
      }),
      player: 'corp',
      prompt: 'Take 2 bad publicity?',
      waitingPrompt: true,
      yesAbility: {
        player: 'corp',
        msg: 'takes 2 bad publicity',
        effect: effect(coreBadPublicity.gainBadPublicity('corp', 2)),
      },
      noAbility: {
        player: 'runner',
        msg: "is immune to damage until the beginning of the Runner's next turn",
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          coreEffects.registerLingeringEffect(state, side, card, {
            type: 'prevention',
            duration: 'until-runner-turn-begins',
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return side === 'runner'; }),
            value: {
              prevents: 'damage',
              type: 'floating',
              maxUses: 1,
              card: card,
              mandatory: true,
              ability: {
                async: true,
                card: card,
                condition: 'floating',
                req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return corePrevention.preventable(ctx); }),
                msg: msg('prevent ', msg => ctx.remaining, ' ', msg => coreDamage.damageName(state, 'damage'), ' damage'),
                effect: effect(corePrevention.preventDamage(state, side, eid, 'damage', 'all')),
              },
            },
          });
        }),
      },
    },
  },
};

// Levy AR Lab Access
export const levyArLabAccess: CardDef = {
  title: 'Levy AR Lab Access',
  onPlay: {
    msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.zoneLocked(state, 'runner', 'discard')
        ? 'shuffle the grip into the stack and draw 5 cards'
        : 'shuffle the grip and heap into the stack and draw 5 cards';
    }),
    rfgInsteadOfTrashing: true,
    async: true,
    effect: effect(
      coreShuffling.shuffleIntoDeck('hand', 'discard'),
      coreDrawing.draw(eid, 5)
    ),
  },
};

// Lie Low
export const lieLow: CardDef = {
  title: 'Lie Low',
  onPlay: coreChooseOne.chooseOneHelper(
    { onChangeGameState: { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.deck?.length > 0 || utils.isTagged(state); }) } },
    [
      {
        option: 'Draw 4 cards',
        ability: { msg: 'draw 4 cards', async: true, effect: effect(req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, side, eid, 4)], []); })) },
      },
      {
        option: 'Remove up to 2 tags',
        ability: coreChooseOne.chooseOneHelper(
          [
            { option: 'Remove 0 tags', req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.tags >= 0; }), ability: { msg: 'remove 0 tags', async: true, effect: effect(req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { yield wait_for(state, [{ asyncResult: 'result' }, coreTags.loseTags(state, side, eid, 0)], []); })) } },
            { option: 'Remove 1 tag', req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.tags >= 1; }), ability: { msg: 'remove 1 tag', async: true, effect: effect(req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { yield wait_for(state, [{ asyncResult: 'result' }, coreTags.loseTags(state, side, eid, 1)], []); })) } },
            { option: 'Remove 2 tags', req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.tags >= 2; }), ability: { msg: 'remove 2 tags', async: true, effect: effect(req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { yield wait_for(state, [{ asyncResult: 'result' }, coreTags.loseTags(state, side, eid, 2)], []); })) } },
          ]
        ),
      },
    ]
  ),
};

// Lucky Find
export const luckyFind: CardDef = {
  title: 'Lucky Find',
  onPlay: {
    msg: 'gain 9 [Credits]',
    async: true,
    effect: effect(coreGaining.gainCredits(eid, 9)),
  },
};

// Mad Dash
export const madDash: CardDef = {
  title: 'Mad Dash',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [{
    event: 'run-ends',
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.thisCardRun; }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (ctx.didSteal) {
        coreSay.systemMsg(state, 'runner', `adds Mad Dash to [their] score area as an agenda worth 1 agenda point`);
        yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.asAgenda(state, 'runner', coreCard.getCard(state, card), 1)], []);
        return coreEid.effectCompleted(state, side, eid);
      } else {
        coreSay.systemMsg(state, 'runner', 'suffers 1 meat damage from Mad Dash');
        yield wait_for(state, [{ asyncResult: 'result' }, coreDamage.damage(state, side, eid, 'meat', { card: card })], []);
      }
    }),
  }],
};

// Maintenance Access
export const maintenanceAccess: CardDef = {
  title: 'Maintenance Access',
  makesRun: true,
  events: [{
    event: 'pre-approach-server',
    unregisterOnceResolved: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    msg: 'change the attacked server to HQ',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return ctx.server?.[0] === 'archives'; }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const s = coreUpdate.updateIn(state, ['run', 'server'], () => ['hq']);
      coreSay.systemMsg(state, side, 'change the attacked server to HQ');
    }),
  }],
  onPlay: runServerAbility('archives'),
};

// Making an Entrance
export const makingAnEntrance: CardDef = {
  title: 'Making an Entrance',
  onPlay: {
    msg: 'look at and trash or rearrange the top 6 cards of the stack',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.deck?.length > 0; }),
    },
    async: true,
    waitingPrompt: true,
    effect: effect(
      continue_ability(
        makingAnEntranceTrash((state as any).runner?.deck?.slice(0, 6) || []),
        card,
        null
      )
    ),
  },
};

function makingAnEntranceTrash(cards: Card[]): any {
  return {
    prompt: 'Choose a card to trash',
    choices: [...cards.map((c: Card) => c.title), 'Done'],
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (msg === 'Done') {
        if (cards.length > 0) {
          yield continue_ability(
            state,
            side,
            coreDefHelpers.reorderChoice('runner', 'corp', cards, [], cards.length, cards),
            card,
            null
          );
        }
      } else {
        yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trash(state, side, msg, { unpreventable: true, causeCard: card })], []);
        coreSay.systemMsg(state, side, `trashes ${msg.title}`);
        const remaining = cards.filter((c: Card) => !utils.sameCard(c, msg));
        if (remaining.length > 0) {
          yield continue_ability(state, side, makingAnEntranceTrash(remaining), card, null);
        }
      }
    }),
  };
}

// Marathon
export const marathon: CardDef = {
  title: 'Marathon',
  makesRun: true,
  onPlay: runRemoteServerAbility(),
  events: [{
    event: 'run-ends',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.thisCardRun; }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const blockedServer = (ctx.server || [])[0];
      coreEffects.registerLingeringEffect(state, side, card, {
        type: 'cannot-run-on-server',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
        value: [blockedServer],
        duration: 'end-of-turn',
      });
      if (ctx.successful) {
        coreSay.systemMsg(state, 'runner', `gains [Click] and adds Marathon to [their] grip`);
        yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainClicks(state, 'runner', 1)], []);
        yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, 'runner', card, 'hand')], []);
        coreEngine.unregisterEvents(state, side, card);
      }
    }),
  }],
};

// Mars for Martians
export const marsForMartians: CardDef = {
  title: 'Mars for Martians',
  onPlay: {
    msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const clanCount = (coreBoard.allActiveInstalled(state, 'runner') || []).filter((c: Card) => coreCard.hasSubtype(c, 'Clan') && coreCard.resource(c)).length;
      return `draw ${coreUtils.quantify(clanCount, 'card')} and gain ${coreTags.countTags(state)} [Credits]`;
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const clanCount = (coreBoard.allActiveInstalled(state, 'runner') || []).filter((c: Card) => coreCard.hasSubtype(c, 'Clan') && coreCard.resource(c)).length;
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, side, clanCount)], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, eid, coreTags.countTags(state))], []);
    }),
  },
};

// Mass Install
export const massInstall: CardDef = {
  title: 'Mass Install',
  onPlay: {
    async: true,
    onChangeGameState: { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (coreDefHelpers.allCardsInHandStar(state, 'runner') || []).length > 0; }) },
    effect: effect(continue_ability(massInstallHelper(0), card, null)),
  },
};

function massInstallHelper(n: number): any {
  if (n < 3) {
    return {
      async: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (coreDefHelpers.allCardsInHandStar(state, 'runner') || []).some((c: Card) => coreCard.program(c) && coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card, sourceType: 'runner-install' }, c));
      }),
      prompt: 'Choose a program to install',
      choices: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const t = targets[0];
          return coreCard.program(t) && coreCard.inHandStar(state, t) && coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card, sourceType: 'runner-install' }, t);
        }),
      },
      effect: effect(
        coreInstalling.runnerInstall(state, side, msg, { msgKeys: { installSource: card, displayOrigin: true } }),
        continue_ability(state, side, massInstallHelper(n + 1), card, null)
      ),
    };
  }
  return null;
}

// Meeting of Minds
export const meetingOfMinds: CardDef = {
  title: 'Meeting of Minds',
  onPlay: {
    prompt: 'Choose one',
    async: true,
    waitingPrompt: true,
    choices: ['Connection', 'Virtual'],
    effect: effect(
      continue_ability(
        {
          optional: {
            prompt: msg('Search the stack for a ', msg => msg.toLowerCase(), ' resource?'),
            yesAbility: {
              async: true,
              msg: msg('search the stack for a ', msg => msg.toLowerCase(), ' resource'),
              effect: effect(continue_ability(meetingOfMindsTutor(msg), card, null)),
            },
            noAbility: {
              async: true,
              effect: effect(continue_ability(meetingOfMindsCreditGain(msg), card, null)),
            },
          },
        },
        card,
        null
      )
    ),
  },
};

function meetingOfMindsTutor(type: string): any {
  return {
    prompt: msg('Choose a ', msg => msg.toLowerCase(), ' resource'),
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const deck = (state as any).runner?.deck || [];
      return corePrompts.cancellable(deck.filter((c: Card) => coreCard.hasSubtype(c, type)), 'sorted');
    }),
    cancel: {
      async: true,
      msg: 'shuffle the stack',
      effect: effect(
        coreEngine.triggerEvent(state, side, 'searched-stack'),
        coreShuffling.shuffle(state, side, 'deck'),
        continue_ability(state, side, meetingOfMindsCreditGain(type), card, null)
      ),
    },
    msg: msg('add ', msg => msg, ' from the stack to the grip and shuffle the stack'),
    async: true,
    effect: effect(
      coreEngine.triggerEvent('searched-stack'),
      coreMoving.move(msg, 'hand'),
      coreShuffling.shuffle('deck'),
      continue_ability(meetingOfMindsCreditGain(type), card, null)
    ),
  };
}

function meetingOfMindsCreditGain(type: string): any {
  return {
    choices: { max: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.hand?.length || 0; }), card: (c: Card) => coreCard.runner(c) && coreCard.inHand(c) && coreCard.hasSubtype(c, type) },
    prompt: msg('Choose any number of ', msg => msg.toLowerCase(), ' resources to reveal'),
    msg: msg('reveal ', msg => (targets || []).map((c: Card) => c.title).join(', '), ' from the Grip and gain ', msg => targets?.length || 0, ' [Credits]'),
    async: true,
    effect: effect(
      coreRevealing.reveal(state, side, targets || []),
      coreGaining.gainCredits(state, side, eid, (targets || []).length)
    ),
  };
}

// Mining Accident
export const miningAccident: CardDef = {
  title: 'Mining Accident',
  onPlay: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const reg = (state as any).runner?.register;
      return reg?.successfulRun?.includes('hq') || reg?.successfulRun?.includes('rd') || reg?.successfulRun?.includes('archives');
    }),
    rfgInsteadOfTrashing: true,
    msg: msg('force the corp to ', msg => msg),
    waitingPrompt: true,
    player: 'corp',
    prompt: 'Choose one',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const choices: string[] = [];
      if (corePayment.canPay(state, 'corp', eid, card, null, [corePayment.toC('credit', 5)])) {
        choices.push('Pay 5 [Credits]');
      }
      choices.push('Take 1 bad publicity');
      return choices;
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (msg === 'Pay 5 [Credits]') {
        yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.pay(state, 'corp', coreEid.makeEid(state, eid), card, corePayment.toC('credit', 5))], []);
        coreSay.systemMsg(state, 'corp', asyncResult?.msg);
        return coreEid.effectCompleted(state, side, eid);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' }, coreBadPublicity.gainBadPublicity(state, 'corp', 1)], []);
        return coreEid.effectCompleted(state, side, eid);
      }
    }),
  },
};

// Möbius
export const mobius: CardDef = {
  title: 'Möbius',
  onPlay: {
    async: true,
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null)) || []).includes('rd');
      }),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreRuns.makeRun(state, side, 'rd', card)], []);
      const c = coreCard.getCard(state, card);
      if (c?.special?.runAgain) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreRuns.makeRun(state, side, eid, 'rd', card)], []);
      } else {
        return coreEid.effectCompleted(state, side, eid);
      }
    }),
  },
  events: [
    {
      event: 'successful-run',
      automatic: 'gain-credits',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const c = coreCard.getCard(state, card);
        return c?.special?.runAgain && ctx.server === 'rd';
      }),
      msg: 'gain 4 [Credits]',
      async: true,
      effect: effect(coreGaining.gainCredits(eid, 4)),
    },
    {
      event: 'run-ends',
      interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
      optional: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const c = coreCard.getCard(state, card);
          return ctx.successful && !c?.special?.runAgain && ctx.server === 'rd';
        }),
        prompt: 'Make another run on R&D?',
        yesAbility: {
          effect: effect(corePrompts.clearWaitPrompt('corp'), coreUpdate.updateIn(card, ['special', 'runAgain'], () => true)),
        },
      },
    },
  ],
};

// Modded
export const modded: CardDef = {
  title: 'Modded',
  onPlay: {
    prompt: 'Choose a program or piece of hardware to install',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (coreDefHelpers.allCardsInHandStar(state, 'runner') || []).length > 0; }),
    },
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const t = targets[0];
        return (coreCard.hardware(t) || coreCard.program(t)) && coreCard.inHandStar(state, t) && coreInstalling.runnerCanPayAndInstall(state, side, eid, card, { costBonus: -3 });
      }),
    },
    async: true,
    effect: effect(
      coreInstalling.runnerInstall({ ...eid, source: card, sourceType: 'runner-install' }, msg, { costBonus: -3, msgKeys: { installSource: card, displayOrigin: true } })
    ),
  },
};

// Moshing
export const moshing: CardDef = {
  title: 'Moshing',
  onPlay: {
    additionalCost: [corePayment.toC('trash-from-hand', 3)],
    msg: 'draw 3 cards and gain 3 [Credits]',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, side, 3)], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, eid, 3)], []);
    }),
  },
};

// Mutual Favor
export const mutualFavor: CardDef = {
  title: 'Mutual Favor',
  onPlay: {
    prompt: 'Choose an Icebreaker',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.deck?.length > 0; }),
    },
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const deck = (state as any).runner?.deck || [];
      return corePrompts.cancellable(deck.filter((c: Card) => coreCard.hasSubtype(c, 'Icebreaker')), 'sorted');
    }),
    cancel: coreShuffling.failToFind,
    msg: msg('add ', msg => msg, ' from the stack to the grip and shuffle the stack'),
    async: true,
    effect: effect(
      coreEngine.triggerEvent('searched-stack'),
      continue_ability(
        (() => {
          const icebreaker = msg;
          if ((state as any).runner?.register?.successfulRun && coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card, sourceType: 'runner-install' }, icebreaker)) {
            return {
              optional: {
                prompt: msg('Install ', msg => icebreaker.title, '?'),
                yesAbility: {
                  async: true,
                  msg: msg('install ', msg => icebreaker.title),
                  effect: effect(
                    coreInstalling.runnerInstall(state, side, { ...eid, source: card, sourceType: 'runner-install' }, icebreaker, null),
                    coreShuffling.shuffle(state, side, 'deck')
                  ),
                },
                noAbility: {
                  effect: effect(coreMoving.move(state, side, icebreaker, 'hand'), coreShuffling.shuffle(state, side, 'deck')),
                },
              },
            };
          }
          return { effect: effect(coreMoving.move(state, side, icebreaker, 'hand'), coreShuffling.shuffle(state, side, 'deck')) };
        })(),
        card,
        null
      )
    ),
  },
};

// Net Celebrity
export const netCelebrity: CardDef = {
  title: 'Net Celebrity',
  recurring: 1,
  interactions: {
    'pay-credits': { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.run(state); }), type: 'recurring' },
  },
};

// Networking
export const networking: CardDef = {
  title: 'Networking',
  onPlay: {
    async: true,
    msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return utils.isTagged(state) ? 'remove 1 tag' : 'do nothing';
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreTags.loseTags(state, side, 1)], []);
      yield continue_ability(
        state,
        side,
        {
          optional: {
            prompt: msg('Pay 1 [Credits] to add ', msg => card.title, ' to Grip?'),
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              return corePayment.canPay(state, side, eid, card, null, [corePayment.toC('credit', 1)]);
            }),
            yesAbility: {
              cost: [corePayment.toC('credit', 1)],
              msg: 'add itself to the Grip',
              effect: effect(coreMoving.move(card, 'hand')),
            },
          },
        },
        card,
        null
      );
    }),
  },
};

// Notoriety
export const notoriety: CardDef = {
  title: 'Notoriety',
  onPlay: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const reg = (state as any).runner?.register;
      return reg?.successfulRun?.includes('hq') && reg?.successfulRun?.includes('rd') && reg?.successfulRun?.includes('archives');
    }),
    msg: 'add itself to [their] score area as an agenda worth 1 agenda point',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.asAgenda(state, 'runner', card, 1)], []);
    }),
  },
};

// Office Supplies
export const officeSupplies: CardDef = {
  title: 'Office Supplies',
  onPlay: {
    playCostBonus: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return -coreLink.getLink(state); }),
    prompt: 'Choose one',
    waitingPrompt: true,
    choices: ['Gain 4 [Credits]', 'Draw 4 cards'],
    msg: msg(msg => msg),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (msg === 'Gain 4 [Credits]') {
        yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, 'runner', eid, 4)], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, 'runner', eid, 4)], []);
      }
    }),
  },
};

// On the Lam
export const onTheLam: CardDef = {
  title: 'On the Lam',
  prevention: [
    {
      prevents: 'tag',
      type: 'ability',
      prompt: 'Trash On the Lam to avoid up to 3 tags?',
      ability: { ...(corePrevention.preventUpToNTags(3) || {}), cost: [corePayment.toC('trash-can')] },
    },
    {
      prevents: 'damage',
      type: 'ability',
      prompt: 'Trash On the Lam to prevent up to 3 damage?',
      ability: { ...(corePrevention.preventUpToNDamage(3, ['net', 'meat', 'core', 'brain']) || {}), cost: [corePayment.toC('trash-can')] },
    },
  ],
  onPlay: {
    prompt: 'Choose a resource to host On the Lam on',
    choices: { card: (c: Card) => coreCard.resource(c) && coreCard.installed(c) },
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (coreBoard.allActiveInstalled(state, 'runner') || []).some((c: Card) => coreCard.resource(c));
      }),
    },
    async: true,
    effect: effect(
      coreSay.systemMsg(state, side, `hosts On the Lam on ${msg.title}`),
      coreInstalling.installAsConditionCounter(state, side, eid, card, msg)
    ),
  },
};

// Out of the Ashes
export const outOfTheAshes: CardDef = {
  title: "Out of the Ashes",
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [{
    event: 'runner-turn-begins',
    skippable: true,
    async: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    silent: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ashes = (state as any).runner?.discard?.filter((c: Card) => c.title === 'Out of the Ashes') || [];
      return card !== ashes[0] || !coreEngine.notUsedOnce(state, { once: 'per-turn', onceKey: 'out-of-ashes' }, card);
    }),
    location: 'discard',
    once: 'per-turn',
    onceKey: 'out-of-ashes',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(
        state,
        [{ asyncResult: 'result' }, coreEngine.resolveAbility(state, side, coreEid.makeEid(state, eid), outOfTheAshesRecur(), card, null)],
        []
      );
      return coreEid.effectCompleted(state, side, eid);
    }),
  }],
};

function outOfTheAshesRecur(): any {
  return {
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return !coreCard.zoneLocked(state, 'runner', 'discard'); }),
      prompt: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const count = (state as any).runner?.discard?.filter((c: Card) => c.title === 'Out of the Ashes').length || 0;
        return `Remove Out of the Ashes from the game to make a run? (${count} available)`;
      }),
      yesAbility: {
        async: true,
        msg: 'removes Out of the Ashes from the game to make a run',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, side, card, 'rfg')], []);
          yield wait_for(
            state,
            [{ asyncResult: 'result' }, coreEngine.resolveAbility(state, side, coreEid.makeEid(state, eid), outOfTheAshesRun(), card, null)],
            []
          );
          const next = (state as any).runner?.discard?.find((c: Card) => c.title === 'Out of the Ashes' && !utils.sameCard(card, c));
          if (next) {
            yield continue_ability(state, side, outOfTheAshesRecur(), coreCard.getCard(state, next), null);
          } else {
            return coreEid.effectCompleted(state, side, eid);
          }
        }),
      },
    },
  };
}

function outOfTheAshesRun(): any {
  return {
    prompt: 'Choose a server',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null));
    }),
    async: true,
    effect: effect(coreRuns.makeRun(eid, msg, card)),
  };
}

// Overclock
export const overclock: CardDef = {
  title: 'Overclock',
  makesRun: true,
  data: { counter: { credit: 5 } },
  interactions: {
    'pay-credits': { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.run(state); }), type: 'credit' },
  },
  onPlay: runAnyServerAbility(),
};

// Paper Tripping
export const paperTripping: CardDef = {
  title: 'Paper Tripping',
  onPlay: {
    msg: 'remove all tags',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return utils.isTagged(state); }),
    },
    async: true,
    effect: effect(coreTags.loseTags(eid, 'all')),
  },
};

// Peace in Our Time
export const peaceInOurTime: CardDef = {
  title: 'Peace in Our Time',
  onPlay: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return !(state as any).corp?.registerLastTurn?.scoredAgenda;
    }),
    msg: 'gain 10 [Credits]. The Corp gains 5 [Credits]',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, 'runner', 10)], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreFlags.registerTurnFlag(state, side, card, 'can-run', null)], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, 'corp', eid, 5)], []);
    }),
  },
};

// Pinhole Threading
export const pinholeThreading: CardDef = {
  title: 'Pinhole Threading',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [{
    event: 'successful-run-replace-breach',
    mandatory: true,
    thisCardRun: true,
    ability: {
      prompt: 'Choose a card in the root of another server to access',
      choices: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const topmost = coreCard.getNestedHost(msg);
          const zone = coreCard.getZone(topmost);
          return zone && (state as any).run?.server?.[0] !== zone[1] && zone[zone.length - 1] === 'content';
        }),
      },
      async: true,
      waitingPrompt: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        if (coreCard.agenda(msg)) {
          const protectedCard = msg;
          coreFlags.registerRunFlag(state, side, card, 'can-steal', function*(_state: State, _side: Side, c: Card) { return !utils.sameCard(c, protectedCard); });
          coreFlags.registerRunFlag(state, side, card, 'can-trash', function*(_state: State, _side: Side, c: Card) { return !utils.sameCard(c, protectedCard); });
          yield wait_for(state, [{ asyncResult: 'result' }, coreAccess.accessCard(state, side, protectedCard)], []);
          coreFlags.clearRunFlag(state, side, card, 'can-steal');
          coreFlags.clearRunFlag(state, side, card, 'can-trash');
          return coreEid.effectCompleted(state, side, eid);
        } else {
          yield wait_for(state, [{ asyncResult: 'result' }, coreAccess.accessCard(state, side, eid, msg)], []);
        }
      }),
    },
  }],
};

// Planned Assault
export const plannedAssault: CardDef = {
  title: 'Planned Assault',
  onPlay: {
    prompt: 'Choose a Run event',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.deck?.length > 0; }),
    },
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const deck = (state as any).runner?.deck || [];
      return deck
        .filter((c: Card) => coreCard.hasSubtype(c, 'Run') && corePayment.canPay(state, side, { ...eid, source: card, sourceType: 'play' }, c, null, [corePayment.toC('credit', coreCostFns.playCost(state, side, c) || 0)]))
        .sort((a: Card, b: Card) => (a.title || '').localeCompare(b.title || ''));
    }),
    msg: msg('play ', msg => msg),
    async: true,
    effect: effect(
      coreEngine.triggerEvent('searched-stack'),
      coreShuffling.shuffle('deck'),
      corePlayInstants.playInstant(eid, msg, { noAdditionalCost: true })
    ),
  },
};

// Political Graffiti
export const politicalGraffiti: CardDef = {
  title: 'Political Graffiti',
  makesRun: true,
  onPlay: runServerAbility('archives'),
  staticAbilities: [{
    type: 'agenda-value',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return utils.sameCard(msg, card.host);
    }),
    value: -1,
  }],
  events: [
    {
      event: 'purge',
      condition: 'hosted',
      async: true,
      msg: 'trash itself',
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trash(state, 'runner', card, { cause: 'purge', causeCard: card })], []);
        yield wait_for(state, [{ asyncResult: 'result' }, coreAgendas.updateAllAgendaPoints(state, side)], []);
        return coreEid.effectCompleted(state, side, eid);
      }),
    },
    {
      event: 'successful-run-replace-breach',
      targetServer: 'archives',
      thisCardRun: true,
      mandatory: true,
      ability: {
        prompt: msg('Choose an agenda to host ', msg => card.title, ' on'),
        choices: {
          req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return coreFlags.inCorpScored(state, side, msg); }),
        },
        msg: msg('host itself on ', msg => msg, ' as a hosted condition counter'),
        async: true,
        effect: effect(
          coreInstalling.installAsConditionCounter(state, side, coreEid.makeEid(state, eid), card, msg),
          coreAgendas.updateAllAgendaPoints(state, side)
        ),
      },
    },
  ],
};

// Populist Rally
export const populistRally: CardDef = {
  title: 'Populist Rally',
  onPlay: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (coreBoard.allActiveInstalled(state, 'runner') || []).some((c: Card) => coreCard.hasSubtype(c, 'Seedy'));
    }),
    msg: 'give the Corp 1 fewer [Click] to spend on [corp-pronoun] next turn',
    effect: effect(coreGaining.lose('corp', 'click-per-turn', 1)),
  },
  events: [{
    event: 'corp-turn-ends',
    duration: 'until-corp-turn-ends',
    effect: effect(coreGaining.gain('corp', 'click-per-turn', 1)),
  }],
};

// Power Nap
export const powerNap: CardDef = {
  title: 'Power Nap',
  onPlay: {
    async: true,
    msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const count = (state as any).runner?.discard?.filter((c: Card) => coreCard.hasSubtype(c, 'Double')).length || 0;
      return `gain ${count + 2} [Credits]`;
    }),
    effect: effect(coreGaining.gainCredits(eid, (state as any).runner?.discard?.filter((c: Card) => coreCard.hasSubtype(c, 'Double')).length + 2 || 2)),
  },
};

// Power to the People
export const powerToThePeople: CardDef = {
  title: 'Power to the People',
  events: [{
    event: 'access',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.agenda(ctx.accessedCard) && coreEvents.firstEvent(state, side, 'access', (t: any[]) => coreCard.agenda(t[0]?.accessedCard));
    }),
    duration: 'end-of-turn',
    unregisterOnceResolved: true,
    msg: 'gain 7 [Credits]',
    async: true,
    effect: effect(coreGaining.gainCredits(eid, 7)),
  }],
};

// Prey
export const prey: CardDef = {
  title: 'Prey',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [{
    event: 'pass-ice',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.rezzed(ctx.ice) && coreEngine.notUsedOnce(state, { once: 'per-run' }, card) && coreIce.getStrength(ctx.ice) <= (coreBoard.allInstalled(state, 'runner') || []).length;
    }),
    async: true,
    effect: effect(
      continue_ability(
        (() => {
          const ice = ctx.ice;
          if (coreIce.getStrength(ice) > 0) {
            return {
              optional: {
                prompt: msg('Trash ', msg => coreUtils.quantify(coreIce.getStrength(ice), 'installed card'), ' to trash ', msg => ice.title, '?'),
                once: 'per-run',
                yesAbility: {
                  async: true,
                  cost: [corePayment.toC('trash-installed', coreIce.getStrength(ice))],
                  msg: msg('trash ', msg => coreToString.cardStr(state, ice)),
                  effect: effect(coreMoving.trash(eid, ice, { causeCard: card })),
                },
              },
            };
          }
          return {
            optional: {
              prompt: msg('Trash ', msg => ice.title, '?'),
              once: 'per-run',
              yesAbility: {
                async: true,
                msg: msg('trash ', msg => coreToString.cardStr(state, ice)),
                effect: effect(coreMoving.trash(eid, ice, { causeCard: card })),
              },
            },
          };
        })(),
        card,
        null
      )
    ),
  }],
};

// Privileged Access
export const privilegedAccess: CardDef = {
  title: 'Privileged Access',
  makesRun: true,
  onPlay: { ...(runServerAbility('archives') || {}), req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return !utils.isTagged(state); }) },
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'archives',
    thisCardRun: true,
    mandatory: true,
    ability: {
      async: true,
      msg: 'take 1 tag',
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        coreEngine.registerPendingEvent(state, 'runner-gain-tag', card, privilegedAccessInstallResource());
        coreEngine.registerPendingEvent(state, 'runner-gain-tag', card, privilegedAccessInstallProgram());
        yield wait_for(state, [{ asyncResult: 'result' }, coreTags.gainTags(state, 'runner', 1)], []);
        coreEngine.unregisterEvents(state, side, card);
        return coreEid.effectCompleted(state, side, eid);
      }),
    },
  }],
};

function privilegedAccessInstallProgram(): any {
  return {
    prompt: 'Choose a program to install',
    waitingPrompt: true,
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const c = coreCard.getCard(state, card);
      return !c?.special?.maybeABonusTag && !coreCard.zoneLocked(state, 'runner', 'discard') && !coreInstalling.installLocked(state, side) && coreThreat.threatLevel(3, state);
    }),
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    abilityName: 'Privileged Access (program)',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const discard = (state as any).runner?.discard || [];
      return [...discard.filter((c: Card) => coreCard.program(c) && coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card }, c)).sort((a: Card, b: Card) => (a.title || '').localeCompare(b.title || '')), 'Done'];
    }),
    effect: effect(
      msg === 'Done'
        ? coreEid.effectCompleted(state, side, eid)
        : effect(
            coreUpdate.updateIn(state, side, 'maybeABonusTag', true),
            coreInstalling.runnerInstall(coreEid.makeEid(state, { ...eid, source: card, sourceType: 'runner-install' }), msg, { msgKeys: { installSource: card, displayOrigin: true } }),
            coreUpdate.updateIn(state, side, 'maybeABonusTag', () => undefined),
            coreEid.effectCompleted(state, side, eid)
          )
    ),
  };
}

function privilegedAccessInstallResource(): any {
  return {
    prompt: 'Choose a resource to install, paying 2 [Credits] less',
    waitingPrompt: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const c = coreCard.getCard(state, card);
      return !c?.special?.maybeABonusTag && !coreCard.zoneLocked(state, 'runner', 'discard') && !coreInstalling.installLocked(state, side);
    }),
    async: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    abilityName: 'Privileged Access (resource)',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const discard = (state as any).runner?.discard || [];
      return [...discard.filter((c: Card) => coreCard.resource(c) && coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card }, c, { costBonus: -2 })).sort((a: Card, b: Card) => (a.title || '').localeCompare(b.title || '')), 'Done'];
    }),
    effect: effect(
      msg === 'Done'
        ? coreEid.effectCompleted(state, side, eid)
        : effect(
            coreUpdate.updateIn(state, side, 'maybeABonusTag', true),
            coreInstalling.runnerInstall(coreEid.makeEid(state, { ...eid, source: card, sourceType: 'runner-install' }), msg, { costBonus: -2, msgKeys: { installSource: card, displayOrigin: true } }),
            coreUpdate.updateIn(state, side, 'maybeABonusTag', () => undefined),
            coreEid.effectCompleted(state, side, eid)
          )
    ),
  };
}

// Process Automation
export const processAutomation: CardDef = {
  title: 'Process Automation',
  onPlay: {
    msg: 'gain 2 [Credits] and draw 1 card',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, 2)], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, side, eid, 1)], []);
    }),
  },
};

// Push Your Luck
export const pushYourLuck: CardDef = {
  title: 'Push Your Luck',
  onPlay: {
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const allAmounts = Array.from({ length: (state as any).runner?.credit + 1 }, (_, i) => i);
      const validAmounts = allAmounts.filter((n: number) => !coreFlags.anyFlagFn(state, 'corp', 'prevent-secretly-spend', n) && !coreFlags.anyFlagFn(state, 'runner', 'prevent-secretly-spend', n));
      const choices = validAmounts.map(String);
      yield continue_ability(state, side, pushYourLuckRunnerChoice(choices), card, null);
    }),
  },
};

function pushYourLuckRunnerChoice(choices: string[]): any {
  return {
    prompt: 'How many credits do you want to spend?',
    waitingPrompt: true,
    choices: choices,
    async: true,
    effect: effect(continue_ability('corp', pushYourLuckCorpChoice(choices, parseInt(msg, 10)), card, null)),
  };
}

function pushYourLuckCorpChoice(choices: string[], spent: number): any {
  return {
    player: 'corp',
    waitingPrompt: true,
    prompt: 'Choose one',
    choices: ['Even', 'Odd'],
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const correctGuess = (msg === 'Even' ? (n: number) => n % 2 === 0 : (n: number) => n % 2 !== 0)(spent);
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.loseCredits(state, 'runner', coreEid.makeEid(state, eid), spent)], []);
      coreSay.systemMsg(state, 'runner', `spends ${spent} [Credit]`);
      coreSay.systemMsg(state, 'corp', `${correctGuess ? '' : 'in'}correctly guesses ${msg.toLowerCase()}`);
      yield wait_for(
        state,
        [{ asyncResult: 'result' }, coreEngine.triggerEventSimult(state, side, 'reveal-spent-credits', null, { runnerCredits: spent })],
        []
      );
      if (correctGuess) {
        return coreEid.effectCompleted(state, side, eid);
      } else {
        coreSay.systemMsg(state, 'runner', `gains ${spent * 2} [Credits]`);
        yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, 'runner', eid, spent * 2)], []);
      }
    }),
  };
}

// Pushing the Envelope
export const pushingTheEnvelope: CardDef = {
  title: 'Pushing the Envelope',
  makesRun: true,
  onPlay: {
    prompt: 'Choose a server',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null)).length > 0;
      }),
    },
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null));
    }),
    msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (state as any).runner?.hand?.length <= 2 ? 'make a run, and give +2 strength to installed icebreakers' : 'make a run';
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if ((state as any).runner?.hand?.length <= 2) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreIce.pumpAllIcebreakers(state, side, 2, 'end-of-run')], []);
      }
      yield wait_for(state, [{ asyncResult: 'result' }, coreRuns.makeRun(state, side, eid, msg, card)], []);
    }),
  },
};

// Quality Time
export const qualityTime: CardDef = {
  title: 'Quality Time',
  onPlay: drawAbi(5),
};

// Queen's Gambit
export const queensGambit: CardDef = {
  title: "Queen's Gambit",
  onPlay: {
    choices: ['0', '1', '2', '3'],
    prompt: 'How many advancement counters do you want to place?',
    async: true,
    effect: effect(
      continue_ability(
        (() => {
          const c = parseInt(msg, 10);
          return {
            choices: { card: (c: Card) => coreServers.isRemote(coreCard.getZone(c)?.[1]) && (coreCard.getZone(c) as string[])[(coreCard.getZone(c) as string[]).length - 1] === 'content' && !c.rezzed },
            msg: msg('place ', msg => coreUtils.quantify(c, 'advancement counter'), ' on ', msg => coreToString.cardStr(state, msg), ' and gain ', msg => c * 2, ' [Credits]'),
            async: true,
            effect: effect(
              coreGaining.gainCredits(state, side, c * 2),
              coreProps.addProp(state, 'corp', msg, 'advance-counter', c, { placed: true }),
              coreFlags.registerTurnFlag(state, side, card, 'can-access', function*(_state: State, _side: Side, c: Card) { return !utils.sameCard(msg, c); }),
              coreEid.effectCompleted(state, side, eid)
            ),
          };
        })(),
        card,
        null
      )
    ),
  },
};

// Quest Completed
export const questCompleted: CardDef = {
  title: 'Quest Completed',
  onPlay: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const reg = (state as any).runner?.register;
      return reg?.successfulRun?.includes('hq') && reg?.successfulRun?.includes('rd') && reg?.successfulRun?.includes('archives');
    }),
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => !coreCard.ice(c));
      }),
    },
    choices: { card: (c: Card) => coreCard.installed(c) },
    msg: msg('access ', msg => msg),
    async: true,
    effect: effect(coreAccess.accessCard(eid, msg)),
  },
};

// Raindrops Cut Stone
export const raindropsCutStone: CardDef = {
  title: 'Raindrops Cut Stone',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [
    {
      event: 'subroutine-fired',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return card.zone?.includes('play-area');
      }),
      async: true,
      effect: effect(coreProps.addCounter(eid, coreCard.getCard(state, card), 'power', 1, null)),
    },
    {
      event: 'run-ends',
      async: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.thisCardRun; }),
      interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const cardsToDraw = coreCard.getCard(state, card)?.power || 0;
        yield continue_ability(
          state,
          side,
          {
            msg: msg(cardsToDraw > 0 ? `draw ${cardsToDraw} card and gain 3 [Credits]` : 'gain 3 [Credits]'),
            async: true,
            effect: effect(cardsToDraw > 0 ? coreDrawing.draw(state, side, cardsToDraw) : null, coreGaining.gainCredits(state, side, eid, 3)),
          },
          card,
          null
        );
      }),
    },
  ],
};

// Rebirth
export const rebirth: CardDef = {
  title: 'Rebirth',
  onPlay: {
    prompt: 'Choose an identity',
    rfgInsteadOfTrashing: true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const runnerIdentity = (state as any).runner?.identity;
      const format = (state as any).format;
      const isDraftId = (c: Card) => c.code?.startsWith('00');
      const isSwappable = (c: Card) =>
        c.type === 'Identity' && c.side === 'Runner' && runnerIdentity?.faction === c.faction && !isDraftId(c) && runnerIdentity?.title !== c.title &&
        (['casual', 'quick-draft', 'preconstructed'].includes(format) || jintekiValidator.legal(format, 'legal', c));
      const swappableIds = (serverCards() || []).filter((c: Card) => isSwappable(c));
      return swappableIds.sort((a: Card, b: Card) => (a.title || '').localeCompare(b.title || ''));
    }),
    msg: 'change identities',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const oldIdentity = (state as any).runner?.identity;
      for (const c of oldIdentity?.hosted || []) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, side, c, 'temp-hosted')], []);
      }
      coreIdentities.disableIdentity(state, side);
      const newId = { ...msg, zone: ['identity'] };
      const numOldBlanks = oldIdentity?.numDisabled || 0;
      (state as any).runner.identity = newId;
      coreInitializing.cardInit(state, side, newId);
      for (let i = 0; i < numOldBlanks; i++) {
        coreIdentities.disableIdentity(state, side);
      }
      for (const c of (state as any).runner?.tempHosted || []) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreHosting.host(state, side, (state as any).runner?.identity, c, { facedown: true })], []);
      }
    }),
  },
};

// Reboot
export const reboot: CardDef = {
  title: 'Reboot',
  makesRun: true,
  onPlay: { ...(runServerAbility('archives') || {}), rfgInsteadOfTrashing: true },
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'archives',
    thisCardRun: true,
    mandatory: true,
    ability: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return !coreCard.zoneLocked(state, 'runner', 'discard'); }),
      async: true,
      prompt: 'Choose up to 5 cards to install',
      showDiscard: true,
      choices: { max: 5, card: (c: Card) => coreCard.inDiscard(c) && coreCard.runner(c) },
      effect: effect(rebootInstallCards(targets || [], targets?.map((c: Card) => c.title) || [])),
    },
  }],
};

function rebootInstallCards(toInstall: Card[], titles: string[]): any {
  if (toInstall.length > 0) {
    return {
      async: true,
      effect: effect(
        coreInstalling.runnerInstall(state, 'runner', toInstall[0], { facedown: true, noMsg: true }),
        rebootInstallCards(toInstall.slice(1), titles)
      ),
    };
  }
  return effect(
    coreMoving.move(state, side, coreFinding.findLatest(state, card), 'rfg'),
    coreSay.systemMsg(state, 'runner', `uses ${card.title} to install ${titles.join(', ')} facedown`),
    coreEid.effectCompleted(state, side, eid)
  );
}

// Recon
export const recon: CardDef = {
  title: 'Recon',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [{
    event: 'encounter-ice',
    skippable: true,
    optional: coreDefHelpers.offerJackOut({ req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return coreEvents.firstRunEvent(state, side, 'encounter-ice'); }) }),
  }],
};

// Rejig
export const rejig: CardDef = {
  title: 'Rejig',
  onPlay: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (coreBoard.allInstalled(state, 'runner') || []).some((c: Card) => coreCard.runner(c) && (coreCard.program(c) || coreCard.hardware(c)));
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(
        state,
        [{ asyncResult: 'result' }, coreEngine.resolveAbility(state, side, rejigPickUp(), card, null)],
        []
      );
      yield continue_ability(state, side, rejigPutDown(asyncResult || 0), card, null);
    }),
  },
};

function rejigPickUp(): any {
  return {
    async: true,
    prompt: 'Choose a program or piece of hardware to add to the grip',
    choices: { card: (c: Card) => coreCard.runner(c) && (coreCard.program(c) || coreCard.hardware(c)) && coreCard.installed(c) },
    effect: effect(
      coreMoving.move(state, side, msg, 'hand'),
      coreEid.completeWithResult(state, side, eid, msg.cost)
    ),
  };
}

function rejigPutDown(bonus: number): any {
  return {
    async: true,
    prompt: 'Choose a program or piece of hardware to install',
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const t = targets[0];
        return coreCard.runner(t) && (coreCard.program(t) || coreCard.hardware(t)) && coreCard.inHandStar(state, t) && coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card }, t, { costBonus: -bonus });
      }),
    },
    effect: effect(
      coreInstalling.runnerInstall({ ...eid, source: card, sourceType: 'runner-install' }, msg, { costBonus: -bonus, msgKeys: { installSource: card, displayOrigin: true } })
    ),
  };
}

// Reprise
export const reprise: CardDef = {
  title: 'Reprise',
  makesRun: true,
  onPlay: {
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.register?.stoleAgenda; }),
    prompt: 'Choose an installed Corp card to add to HQ',
    waitingPrompt: true,
    choices: { card: (c: Card) => coreCard.installed(c) && coreCard.corp(c) },
    msg: msg('add ', msg => coreToString.cardStr(state, msg), ' to HQ'),
    cancel: repriseOptRun(),
    effect: effect(
      coreMoving.move('corp', msg, 'hand'),
      continue_ability(repriseOptRun(), card, null)
    ),
  },
};

function repriseOptRun(): any {
  return {
    optional: {
      prompt: 'Run a server?',
      yesAbility: runAnyServerAbility(),
      noAbility: {
        effect: effect(coreSay.systemMsg(`declines to use ${coreCard.getCard(state, card)?.title || 'this card'} to make a run`)),
      },
    },
  };
}

// Reshape
export const reshape: CardDef = {
  title: 'Reshape',
  onPlay: {
    prompt: 'Choose 2 unrezzed pieces of ice to swap positions',
    choices: { card: (c: Card) => coreCard.installed(c) && !coreCard.rezzed(c) && coreCard.ice(c), max: 2, all: true },
    msg: msg('swap the positions of ', msg => coreToString.cardStr(state, targets?.[0]), ' and ', msg => coreToString.cardStr(state, targets?.[1])),
    effect: effect(coreMoving.swapIce(targets?.[0], targets?.[1])),
  },
};

// Retrieval Run
export const retrievalRun: CardDef = {
  title: 'Retrieval Run',
  makesRun: true,
  onPlay: runServerAbility('archives'),
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'archives',
    thisCardRun: true,
    ability: {
      async: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return !coreCard.zoneLocked(state, 'runner', 'discard') && (state as any).runner?.discard?.some((c: Card) => coreCard.program(c) && coreInstalling.runnerCanInstall(state, side, eid, c, { noToast: true }));
      }),
      prompt: 'Choose a program to install',
      waitingPrompt: true,
      choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (state as any).runner?.discard?.filter((c: Card) => coreCard.program(c) && coreInstalling.runnerCanInstall(state, side, eid, c, { noToast: true }));
      }),
      effect: effect(
        coreInstalling.runnerInstall(state, side, eid, msg, { msgKeys: { installSource: card, displayOrigin: true }, ignoreAllCost: true })
      ),
    },
  }],
};

// Rigged Results
export const riggedResults: CardDef = {
  title: 'Rigged Results',
  onPlay: {
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const allAmounts = Array.from({ length: Math.min(3, (state as any).runner?.credit + 1) }, (_, i) => i);
      const validAmounts = allAmounts.filter((n: number) => !coreFlags.anyFlagFn(state, 'corp', 'prevent-secretly-spend', n) && !coreFlags.anyFlagFn(state, 'runner', 'prevent-secretly-spend', n));
      const choices = validAmounts.map(String);
      yield continue_ability(state, side, riggedResultsRunnerChoice(choices), card, null);
    }),
  },
};

function riggedResultsRunnerChoice(choices: string[]): any {
  return {
    waitingPrompt: true,
    prompt: 'How many credits do you want to spend?',
    choices: choices,
    async: true,
    effect: effect(continue_ability(riggedResultsCorpChoice(choices, parseInt(msg, 10)), card, null)),
  };
}

function riggedResultsCorpChoice(choices: string[], spent: number): any {
  return {
    player: 'corp',
    waitingPrompt: true,
    prompt: 'How many credits were spent?',
    choices: choices,
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.loseCredits(state, 'runner', coreEid.makeEid(state, eid), spent)], []);
      coreSay.systemMsg(state, 'runner', `spends ${spent} [Credit]`);
      coreSay.systemMsg(state, 'corp', `guesses ${msg} [Credit]`);
      yield wait_for(
        state,
        [{ asyncResult: 'result' }, coreEngine.triggerEventSimult(state, side, 'reveal-spent-credits', null, { runnerCredits: spent })],
        []
      );
      if (spent !== parseInt(msg, 10)) {
        yield continue_ability(state, 'runner', riggedResultsChooseIce(), card, null);
      } else {
        return coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

function riggedResultsChooseIce(): any {
  return {
    waitingPrompt: true,
    prompt: 'Choose a piece of ice to bypass',
    choices: { card: (c: Card) => coreCard.ice(c) },
    msg: msg('make a run and bypass ', msg => coreToString.cardStr(state, msg)),
    async: true,
    effect: effect(
      coreEngine.registerEvents(
        card,
        [{
          event: 'encounter-ice',
          automatic: 'bypass',
          req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            return utils.sameCard(msg, ctx.ice);
          }),
          msg: msg('bypass ', msg => ctx.ice?.title),
          effect: effect(coreRuns.bypassIce(state)),
        }]
      ),
      coreRuns.makeRun(eid, (coreCard.getZone(msg) as string[])[1], card)
    ),
  };
}

// Rigging Up
export const riggingUp: CardDef = {
  title: 'Rigging Up',
  onPlay: {
    prompt: 'Choose a program or piece of hardware to install',
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const t = targets[0];
        return (coreCard.hardware(t) || coreCard.program(t)) && coreCard.inHandStar(state, t) && coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card }, t, { costBonus: -3 });
      }),
    },
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (coreDefHelpers.allCardsInHandStar(state, 'runner') || []).length > 0; }),
    },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(
        state,
        [{ asyncResult: 'result' }, coreInstalling.runnerInstall(state, side, coreEid.makeEid(state, { source: card, sourceType: 'runner-install' }), msg, { costBonus: -3, msgKeys: { installSource: card, displayOrigin: true } })],
        []
      );
      const rigTarget = asyncResult;
      yield continue_ability(
        state,
        side,
        {
          optional: {
            prompt: msg('Charge ', msg => rigTarget?.title, '?'),
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return coreCharge.canCharge(state, side, rigTarget); }),
            yesAbility: {
              async: true,
              effect: effect(coreCharge.chargeCard(eid, rigTarget)),
              msg: msg('charge ', msg => rigTarget?.title),
            },
          },
        },
        card,
        null
      );
    }),
  },
};

// Rip Deal
export const ripDeal: CardDef = {
  title: 'Rip Deal',
  makesRun: true,
  onPlay: { ...(runServerAbility('hq') || {}), rfgInsteadOfTrashing: true },
  events: [{
    event: 'successful-run',
    automatic: 'draw-cards',
    silent: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return ctx.server === 'hq' && forms.thisCardRun;
    }),
    effect: effect(
      coreEngine.registerEvents(card, [{
        event: 'candidates-determined',
        duration: 'end-of-run',
        async: true,
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return ctx === 'hq'; }),
        effect: effect(continue_ability(ripDealAddCardsFromHeap(), card, null)),
      }])
    ),
  }],
};

function ripDealAddCardsFromHeap(): any {
  return {
    optional: {
      prompt: 'Add cards from heap to grip?',
      waitingPrompt: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return forms.run && (state as any).corp?.hand?.length > 0 && (state as any).runner?.discard?.length > 0 && !coreCard.zoneLocked(state, 'runner', 'discard');
      }),
      yesAbility: {
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const randomAccessLimit = coreAccess.numCardsToAccess(state, side, 'hq', null)?.randomAccessLimit || 0;
          const cardsToMove = Math.min((state as any).corp?.hand?.length, randomAccessLimit, (state as any).runner?.discard?.length);
          yield continue_ability(
            state,
            side,
            {
              async: true,
              showDiscard: true,
              prompt: msg('Choose ', msg => coreUtils.quantify(cardsToMove, 'card'), ' to add from the heap to the grip'),
              msg: msg('add ', msg => (targets || []).map((c: Card) => c.title).join(', '), ' from the heap to the grip'),
              choices: { max: cardsToMove, all: true, card: (c: Card) => coreCard.runner(c) && coreCard.inDiscard(c) },
              effect: effect(
                function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                  for (const c of targets || []) {
                    yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, side, c, 'hand')], []);
                  }
                },
                coreUpdate.updateIn(state, 'run', 'prevent-hand-access', true),
                coreEid.effectCompleted(state, side, eid)
              ),
            },
            card,
            null
          );
        }),
      },
    },
  };
}

// Ritual
export const ritual: CardDef = {
  title: 'Ritual',
  onPlay: {
    async: true,
    onChangeGameState: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (state as any).runner?.deck?.length > 0 && (state as any).runner?.click > 0;
    }),
    msg: msg('draw ', msg => coreUtils.quantify((state as any).runner?.click || 0, 'card')),
    effect: effect(coreDrawing.draw(state, side, eid, (state as any).runner?.click || 0)),
  },
};

// Rumor Mill
export const rumorMill: CardDef = {
  title: 'Rumor Mill',
  staticAbilities: [{
    type: 'disable-card',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return rumorMillEligible(msg);
    }),
    value: true,
  }],
};

function rumorMillEligible(card: Card): boolean {
  return card.uniqueness && (coreCard.asset(card) || coreCard.upgrade(card)) && !coreCard.hasSubtype(card, 'Region');
}

// Run Amok
export const runAmok: CardDef = {
  title: 'Run Amok',
  makesRun: true,
  onPlay: {
    prompt: 'Choose a server',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null)).length > 0;
      }),
    },
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null));
    }),
    async: true,
    effect: effect(
      coreUpdate.updateIn(card, ['special', 'runAmok'], () => runAmokGetRezzedCids(coreBoard.allInstalled(state, 'corp'))),
      coreRuns.makeRun(eid, msg, coreCard.getCard(state, card))
    ),
  },
  events: [{
    event: 'run-ends',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.thisCardRun; }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const newCids = new Set(runAmokGetRezzedCids(coreBoard.allInstalled(state, 'corp')));
      const oldCids = new Set(coreCard.getCard(state, card)?.special?.runAmok || []);
      const diff = [...newCids].filter((c: string) => !oldCids.has(c));
      const diffCards = diff.map((cid: string) => coreFinding.findCid(cid, coreBoard.allInstalled(state, 'corp')));
      yield continue_ability(
        state,
        'runner',
        diffCards.length > 0
          ? {
              async: true,
              prompt: 'Choose an ice to trash',
              choices: { card: (c: Card) => diffCards.some((d: Card) => utils.sameCard(c, d)), all: true },
              effect: effect(coreMoving.trash(eid, msg, { causeCard: card })),
            }
          : null,
        card,
        null
      );
    }),
  }],
};

function runAmokGetRezzedCids(ice: Card[]): string[] {
  return ice.filter((c: Card) => coreCard.rezzed(c) && coreCard.ice(c)).map((c: Card) => c.cid);
}

// Running Hot
export const runningHot: CardDef = {
  title: 'Running Hot',
  onPlay: {
    msg: 'gain [Click][Click][Click]',
    additionalCost: [corePayment.toC('brain', 1)],
    async: true,
    effect: effect(coreGaining.gainClicks(3), coreEid.effectCompleted(eid)),
  },
};

// Running Interference
export const runningInterference: CardDef = {
  title: 'Running Interference',
  makesRun: true,
  staticAbilities: [{
    type: 'rez-additional-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.run(state) && coreCard.ice(msg); }),
    value: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return [corePayment.toC('credit', msg.cost)]; }),
  }],
  onPlay: runAnyServerAbility(),
};

// S-Dobrado
export const sDobrado: CardDef = {
  title: 'S-Dobrado',
  makesRun: true,
  onPlay: runCentralServerAbility(),
  events: [
    {
      event: 'encounter-ice',
      automatic: 'bypass',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return coreEvents.firstRunEvent(state, side, 'encounter-ice'); }),
      once: 'per-run',
      msg: msg('bypass ', msg => coreToString.cardStr(state, forms.currentIce)),
      effect: effect(coreRuns.bypassIce(state)),
    },
    {
      event: 'encounter-ice',
      skippable: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreEvents.runEvents(state, side, 'encounter-ice').length === 2 && coreThreat.threatLevel(4, state);
      }),
      async: true,
      effect: effect(
        continue_ability(
          {
            optional: {
              prompt: msg('Spend [Click] to bypass ', msg => coreToString.cardStr(state, forms.currentIce), '?'),
              waitingPrompt: true,
              yesAbility: {
                msg: msg('bypass ', msg => coreToString.cardStr(state, forms.currentIce)),
                cost: [corePayment.toC('click', 1)],
                effect: effect(coreRuns.bypassIce(state)),
              },
            },
          },
          card,
          null
        )
      ),
    },
  ],
};

// Satellite Uplink
export const satelliteUplink: CardDef = {
  title: 'Satellite Uplink',
  onPlay: {
    choices: {
      max: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return Math.min(2, (coreBoard.allInstalled(state, 'corp') || []).filter((c: Card) => !coreCard.faceup(c)).length);
      }),
      card: (c: Card) => coreCard.corp(c) && coreCard.installed(c) && !coreCard.rezzed(c),
    },
    async: true,
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => !coreCard.faceup(c));
      }),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if ((targets || []).length > 0) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreExpose.expose(state, side, eid, targets)], []);
      } else {
        return coreEid.effectCompleted(state, side, eid);
      }
    }),
  },
};

// Scavenge
export const scavenge: CardDef = {
  title: 'Scavenge',
  onPlay: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (coreBoard.allActiveInstalled(state, 'runner') || []).some((c: Card) => coreCard.program(c) && coreCard.installed(c));
    }),
    prompt: 'Choose an installed program to trash',
    choices: { card: (c: Card) => coreCard.program(c) && coreCard.installed(c) },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const trashed = msg;
      const tcost = trashed?.cost || 0;
      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trash(state, side, trashed, { unpreventable: true, causeCard: card })], []);
      yield continue_ability(
        state,
        side,
        {
          async: true,
          prompt: coreCard.zoneLocked(state, 'runner', 'discard') ? 'Choose a program to install' : 'Choose a program to install from the grip or heap',
          showDiscard: !coreCard.zoneLocked(state, 'runner', 'discard'),
          choices: {
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              const t = targets[0];
              return coreCard.program(t) &&
                (coreCard.inHandStar(state, t) || (!coreCard.zoneLocked(state, 'runner', 'discard') && coreCard.inDiscard(t))) &&
                coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card }, t, { costBonus: -tcost });
            }),
          },
          msg: msg('trash ', msg => trashed?.title, ' and install ', msg => msg, ', lowering the cost by ', msg => tcost, ' [Credits]'),
          effect: effect(
            coreInstalling.runnerInstall({ ...eid, source: card, sourceType: 'runner-install' }, msg, { costBonus: -tcost })
          ),
        },
        card,
        null
      );
    }),
  },
};

// Scrounge
export const scrounge: CardDef = {
  title: 'Scrounge',
  onPlay: {
    prompt: 'Choose a program to install',
    label: 'Install program from the heap',
    showDiscard: true,
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.discard?.some((c: Card) => coreCard.program(c)); }),
    },
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const t = targets[0];
        return coreCard.program(t) && coreCard.inDiscard(t) && coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card }, t);
      }),
    },
    async: true,
    effect: effect(
      coreInstalling.runnerInstall(state, side, msg, { msgKeys: { installSource: card, displayOrigin: true, includeCostFromEid: eid } }),
      continue_ability(scroungeBottomOneProgram(), card, null)
    ),
    cancel: scroungeBottomOneProgram(),
  },
};

function scroungeBottomOneProgram(): any {
  return {
    prompt: 'Put a program on the bottom of the stack?',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.discard?.some((c: Card) => coreCard.program(c)); }),
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const t = targets[0];
        return coreCard.program(t) && coreCard.inDiscard(t);
      }),
    },
    showDiscard: true,
    msg: msg('put ', msg => msg, ' on the bottom of the stack'),
    effect: effect(coreMoving.move(state, side, msg, 'deck')),
  };
}

// Scrubbed
export const scrubbed: CardDef = {
  title: 'Scrubbed',
  events: [{
    event: 'encounter-ice',
    once: 'per-turn',
    effect: effect(
      coreEffects.registerLingeringEffect(card, {
        type: 'ice-strength',
        duration: 'end-of-run',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return utils.sameCard(msg, ctx.ice); }),
        value: -2,
      }),
      coreIce.updateAllIce(state, side)
    ),
  }],
};

// Security Leak
export const securityLeak: CardDef = {
  title: 'Security Leak',
  staticAbilities: [{
    type: 'card-ability-additional-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return utils.sameCard(ctx.card, (state as any).corp?.basicActionCard) && ctx.ability?.label === 'Advance 1 installed card';
    }),
    value: corePayment.toC('credit', 1),
  }],
};

// Sell Out
export const sellOut: CardDef = {
  title: 'Sell Out',
  onPlay: {
    additionalCost: [corePayment.toC('resource', 1)],
    async: true,
    msg: 'gain 4 [Credits] and draw 2 cards',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, 4, { suppressCheckpoint: true })], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, side, eid, 2)], []);
    }),
  },
};

// Shred
export const shred: CardDef = {
  title: 'Shred',
  onPlay: runAnyServerAbility(),
  makesRun: true,
  staticAbilities: [{
    type: 'prevention',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return forms.run(state) && coreEvents.firstRunEvent(state, side, 'end-run-interrupt');
    }),
    value: {
      prevents: 'end-run',
      type: 'floating',
      maxUses: 1,
      mandatory: true,
      ability: {
        async: true,
        condition: 'floating',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return corePrevention.preventable(ctx); }),
        effect: effect(
          continue_ability(
            state,
            side,
            (() => {
              const cardsInServer = (ctx.runServer || {}).content?.length || 0;
              if (cardsInServer > 0) {
                return coreChooseOne.chooseOneHelper(
                  { player: 'corp' },
                  [
                    { option: 'Reveal and randomly trash cards', ability: coreChooseOne.costOption([corePayment.toC('reveal-and-randomly-trash-from-hand', cardsInServer)], 'corp') },
                    { option: 'The run does not end', ability: { displaySide: 'runner', async: true, msg: 'prevent the run from ending', effect: effect(corePrevention.preventEndRun(state, side, eid)) } },
                  ]
                );
              }
              return null;
            })(),
            card,
            null
          )
        ),
      },
    },
  }],
};

// Showing Off
export const showingOff: CardDef = {
  title: 'Showing Off',
  makesRun: true,
  onPlay: runServerAbility('rd'),
  events: [
    {
      event: 'successful-run',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return ctx.server === 'rd' && forms.thisCardRun;
      }),
      silent: true,
      msg: 'access cards from the bottom of R&D',
      effect: effect(coreUpdate.updateIn(state, 'runner', 'rdAccessFn', 'reverse')),
    },
    {
      event: 'run-ends',
      effect: effect(coreUpdate.updateIn(state, 'runner', 'rdAccessFn', 'seq')),
    },
  ],
};

// Singularity
export const singularity: CardDef = {
  title: 'Singularity',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'remote',
    thisCardRun: true,
    mandatory: true,
    ability: {
      async: true,
      msg: 'trash all cards in the server at no cost',
      effect: effect(coreMoving.trashCards(eid, (ctx.runServer || {}).content, { causeCard: card })),
    },
  }],
};

// Social Engineering
export const socialEngineering: CardDef = {
  title: 'Social Engineering',
  onPlay: {
    prompt: 'Choose an unrezzed piece of ice',
    choices: { card: (c: Card) => !coreCard.rezzed(c) && coreCard.installed(c) && coreCard.ice(c) },
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => coreCard.ice(c) && !coreCard.rezzed(c));
      }),
    },
    msg: msg('select ', msg => coreToString.cardStr(state, msg)),
    effect: effect(
      coreEngine.registerEvents(
        card,
        [{
          event: 'rez',
          duration: 'end-of-turn',
          req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            return utils.sameCard(ctx.card, msg);
          }),
          msg: msg('gain ', msg => coreCostFns.rezCost(state, side, coreCard.getCard(state, ctx.card)), ' [Credits]'),
          async: true,
          effect: effect(coreGaining.gainCredits('runner', eid, coreCostFns.rezCost(state, side, coreCard.getCard(state, ctx.card)) || 0)),
        }]
      )
    ),
  },
};

// Spark of Inspiration
export const sparkOfInspiration: CardDef = {
  title: 'Spark of Inspiration',
  onPlay: {
    async: true,
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.deck?.length > 0; }),
    },
    effect: effect(sparkOfInspirationSearch(state, side, eid, card, (state as any).runner?.deck || [], [])),
  },
};

function sparkOfInspirationSearch(state: State, side: Side, eid: EID, card: Card, remainder: Card[], revealedCards: Card[]): any {
  if (remainder.length > 0) {
    const revealedCard = remainder[0];
    const restOfDeck = remainder.slice(1);
    const newRevealed = [...revealedCards, revealedCard];
    if (coreCard.program(revealedCard)) {
      return sparkOfInspirationInstallProgram(state, side, eid, card, revealedCard, newRevealed);
    }
    return sparkOfInspirationSearch(state, side, eid, card, restOfDeck, newRevealed);
  }
  return effect(continue_ability(sparkOfInspirationShuffleBack(revealedCards), card, null));
}

function sparkOfInspirationInstallProgram(state: State, side: Side, eid: EID, card: Card, revealedCard: Card, revealedCards: Card[]): any {
  if (coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card }, revealedCard, { costBonus: -10 })) {
    return continue_ability(
      state,
      side,
      {
        optional: {
          prompt: msg('Install ', msg => revealedCard.title, ' paying 10 [Credits] less?'),
          waitingPrompt: true,
          yesAbility: {
            async: true,
            effect: effect(
              coreRevealing.revealLoud(state, side, card, { andThen: 'shuffle the Stack' }, revealedCards),
              coreInstalling.runnerInstall(coreEid.makeEid(state, { source: card, sourceType: 'runner-install' }), revealedCard, { costBonus: -10, msgKeys: { installSource: card, displayOrigin: true } }),
              coreShuffling.shuffle(state, side, 'deck'),
              coreSay.systemMsg(state, side, 'shuffles the Stack'),
              coreEid.effectCompleted(state, side, eid)
            ),
          },
          noAbility: sparkOfInspirationShuffleBack(revealedCards),
        },
      },
      card,
      null
    );
  }
  return continue_ability(state, side, sparkOfInspirationShuffleBack(revealedCards), card, null);
}

function sparkOfInspirationShuffleBack(revealedCards: Card[]): any {
  return {
    async: true,
    effect: effect(
      coreRevealing.revealLoud(state, side, card, { andThen: 'shuffle the Stack' }, revealedCards),
      coreShuffling.shuffle(state, side, 'deck'),
      coreEid.effectCompleted(state, side, eid)
    ),
  };
}

// Spear Phishing
export const spearPhishing: CardDef = {
  title: 'Spear Phishing',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [{
    event: 'encounter-ice',
    automatic: 'bypass',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.runPosition === 1; }),
    msg: msg('bypass ', msg => ctx.ice?.title),
    effect: effect(coreRuns.bypassIce(state)),
  }],
};

// Spec Work
export const specWork: CardDef = {
  title: 'Spec Work',
  onPlay: {
    additionalCost: [corePayment.toC('program', 1)],
    msg: 'gain 4 [Credits] and draw 2 cards',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, 4)], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, side, eid, 2)], []);
    }),
  },
};

// Special Order
export const specialOrder: CardDef = {
  title: 'Special Order',
  onPlay: tutorAbi(true, (c: Card) => coreCard.hasSubtype(c, 'Icebreaker')),
};

// Spooned
export const spooned: CardDef = {
  title: 'Spooned',
  ...cutlery('Code Gate'),
};

// Spot the Prey
export const spotThePrey: CardDef = {
  title: 'Spot the Prey',
  makesRun: true,
  onPlay: {
    prompt: 'Choose 1 non-ice card to expose',
    msg: 'expose 1 card and make a run',
    choices: { card: (c: Card) => coreCard.installed(c) && !coreCard.ice(c) && coreCard.corp(c) },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreExpose.expose(state, side, [msg])], []);
      yield continue_ability(state, side, runAnyServerAbility(), card, null);
    }),
  },
};

// Spree
export const spree: CardDef = {
  title: 'Spree',
  data: { counter: { power: 3 } },
  makesRun: true,
  onPlay: runAnyServerAbility(),
  abilities: [{
    cost: [corePayment.toC('power', 1)],
    label: 'Host an installed trojan on a piece of ice protecting this server',
    prompt: 'Choose an installed trojan',
    waitingPrompt: true,
    choices: { card: (c: Card) => coreCard.hasSubtype(c, 'Trojan') && coreCard.program(c) && coreCard.installed(c) },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const trojan = msg;
      yield continue_ability(
        state,
        side,
        {
          prompt: 'Choose a piece of ice protecting this server',
          choices: { card: (c: Card) => coreCard.ice(c) && (coreRuns.targetServer(ctx) === (coreCard.getZone(c) as string[])[1]) },
          msg: msg('host ', msg => trojan.title, ' on ', msg => coreToString.cardStr(state, msg)),
          effect: effect(
            coreHosting.host(state, side, msg, trojan),
            coreIce.updateAllIce(state, side)
          ),
        },
        card,
        null
      );
    }),
  }],
};

// Steelskin Scarring
export const steelskinScarring: CardDef = {
  title: 'Steelskin Scarring',
  onPlay: {
    async: true,
    msg: 'draw 3 cards',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.deck?.length > 0; }),
    },
    effect: effect(coreDrawing.draw(eid, 3)),
  },
  onTrash: {
    whenInactive: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return ['hand', 'deck'].includes(coreCard.getZone(ctx.card)?.[0]);
    }),
    effect: effect(
      continue_ability(
        {
          optional: {
            prompt: 'Draw 2 cards?',
            waitingPrompt: true,
            yesAbility: { msg: 'draw 2 cards', async: true, effect: effect(coreDrawing.draw('runner', eid, 2)) },
            noAbility: { effect: effect(coreSay.systemMsg(`declines to use ${coreCard.getCard(state, card)?.title} to draw 2 cards`)) },
          },
        },
        card,
        null
      )
    ),
  },
};

// Stimhack
export const stimhack: CardDef = {
  title: 'Stimhack',
  makesRun: true,
  onPlay: {
    prompt: 'Choose a server',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null)).length > 0;
      }),
    },
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null));
    }),
    async: true,
    effect: effect(coreRuns.gainNextRunCredits(9), coreRuns.makeRun(eid, msg, card)),
  },
  events: [{
    event: 'run-ends',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.thisCardRun; }),
    msg: 'take 1 core damage',
    async: true,
    effect: effect(coreDamage.damage(eid, 'brain', 1, { unpreventable: true, card: card })),
  }],
};

// Strike Fund
export const strikeFund: CardDef = {
  title: 'Strike Fund',
  onPlay: {
    async: true,
    msg: 'gain 4 [Credits]',
    effect: effect(
      coreGaining.gainCredits(state, 'runner', null, 4),
      coreEid.effectCompleted(state, side, eid)
    ),
  },
  onTrash: {
    whenInactive: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return ['hand', 'deck'].includes(coreCard.getZone(ctx.card)?.[0]);
    }),
    effect: effect(
      continue_ability(
        {
          optional: {
            prompt: 'Gain 2 [Credits]?',
            waitingPrompt: true,
            yesAbility: { msg: 'gain 2 [Credits]', async: true, effect: effect(coreGaining.gainCredits('runner', eid, 2)) },
            noAbility: { effect: effect(coreSay.systemMsg(`declines to use ${coreCard.getCard(state, card)?.title} to gain 2 [Credits]`)) },
          },
        },
        card,
        null
      )
    ),
  },
};

// Sure Gamble
export const sureGamble: CardDef = {
  title: 'Sure Gamble',
  onPlay: {
    msg: 'gain 9 [Credits]',
    async: true,
    effect: effect(coreGaining.gainCredits(eid, 9)),
  },
};

// Surge
export const surge: CardDef = {
  title: 'Surge',
  onPlay: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (coreEvents.turnEvents(state, 'runner', 'counter-added') || [])
        .filter((e: any) => e[0]?.[0]?.counterType === 'virus')
        .map((e: any) => e[0]?.card)
        .some((cid: string) => utils.sameCard(cid, msg));
    }),
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (coreEvents.turnEvents(state, 'runner', 'counter-added') || [])
          .filter((e: any) => e[0]?.[0]?.counterType === 'virus')
          .map((e: any) => e[0]?.card)
          .some((cid: string) => utils.sameCard(cid, msg));
      }),
    },
    msg: msg('place 2 virus counters on ', msg => msg),
    async: true,
    effect: effect(coreProps.addCounter('runner', eid, msg, 'virus', 2, null)),
  },
};

// SYN Attack
export const synAttack: CardDef = {
  title: 'SYN Attack',
  onPlay: {
    player: 'corp',
    waitingPrompt: true,
    prompt: 'Choose one',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const choices: string[] = [];
      if ((state as any).corp?.hand?.length >= 2) {
        choices.push('Discard 2 cards from HQ');
      }
      choices.push('Draw 4 cards');
      return choices;
    }),
    async: true,
    msg: msg('force the Corp to ', msg => msg),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (msg === 'Draw 4 cards') {
        yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, 'corp', 4)], []);
        return coreEid.effectCompleted(state, side, eid);
      } else {
        yield continue_ability(
          state,
          'corp',
          {
            prompt: 'Choose 2 cards to discard',
            choices: { max: 2, all: true, card: (c: Card) => coreCard.inHand(c) && coreCard.corp(c) },
            async: true,
            effect: effect(coreMoving.trashCards('corp', eid, targets, { unpreventable: true, causeCard: card, cause: 'forced-to-trash' })),
          },
          card,
          null
        );
      }
    }),
  },
};

// System Outage
export const systemOutage: CardDef = {
  title: 'System Outage',
  events: [{
    event: 'corp-draw',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return !coreEvents.firstEvent(state, side, 'corp-draw'); }),
    msg: 'force the Corp to lose 1 [Credits]',
    async: true,
    effect: effect(coreGaining.loseCredits('corp', eid, 1)),
  }],
};

// System Seizure
export const systemSeizure: CardDef = {
  title: 'System Seizure',
  events: [
    {
      event: 'pump-breaker',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return !coreCard.getCard(state, card)?.special?.ssTarget || utils.sameCard(ctx.card, coreCard.getCard(state, card)?.special?.ssTarget);
      }),
      effect: effect(
        req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          if (!coreCard.getCard(state, card)?.special?.ssTarget) {
            coreUpdate.updateIn(state, side, 'ssTarget', ctx.card);
          }
          const newPump = { ...ctx.effect, duration: 'end-of-run' };
          const effects = (state as any).effects || [];
          (state as any).effects = [...effects.filter((e: any) => e.uuid !== newPump.uuid), newPump];
          coreIce.updateBreakerStrength(state, side, ctx.card);
        })
      ),
    },
    { event: 'corp-turn-ends', effect: effect(coreUpdate.updateIn(coreCard.getCard(state, card), ['special', 'ssTarget'], () => undefined)) },
    { event: 'runner-turn-ends', effect: effect(coreUpdate.updateIn(coreCard.getCard(state, card), ['special', 'ssTarget'], () => undefined)) },
  ],
};

// Tailgate
export const tailgate: CardDef = {
  title: 'Tailgate',
  makesRun: true,
  onPlay: runServerAbility('hq', { playCostBonus: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return -(state as any).corp?.servers?.hq?.ices?.length || 0; }) }),
  events: [{
    event: 'successful-run',
    silent: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return ctx.server === 'hq' && forms.thisCardRun; }),
    effect: effect(coreEngine.registerEvents(card, [coreDefHelpers.breachAccessBonus('hq', 2, { duration: 'end-of-run' })])),
  }],
};

// Take a Dive
export const takeADive: CardDef = {
  title: 'Take a Dive',
  onPlay: { ...(runServerFromChoicesAbility(['HQ', 'R&D']) || {}), rfgInsteadOfTrashing: true },
  events: [{
    event: 'successful-run',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return ['hq', 'rd'].includes(ctx.server) && (ctx.subroutinesFired || 0) > 0;
    }),
    msg: 'force the Corp to take 1 Bad Publicity',
    async: true,
    effect: effect(coreBadPublicity.gainBadPublicity(state, 'corp', eid, 1, { card: card })),
  }],
};

// Test Run
export const testRun: CardDef = {
  title: 'Test Run',
  onPlay: {
    prompt: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.zoneLocked(state, 'runner', 'discard') ? 'Install a program from the stack?' : 'Install a program from the stack or heap?';
    }),
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const choices = ['Stack'];
      if (!coreCard.zoneLocked(state, 'runner', 'discard')) {
        choices.push('Heap');
      }
      return choices;
    }),
    msg: msg('install a program from the ', msg => msg),
    waitingPrompt: true,
    async: true,
    effect: effect(
      continue_ability(
        (() => {
          const where = msg;
          const whereKey = where === 'Heap' ? 'discard' : 'deck';
          return {
            prompt: 'Choose a program to install',
            choices: {
              req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                return corePrompts.cancellable(
                  (state as any).runner?.[whereKey]?.filter((c: Card) => coreCard.program(c) && coreInstalling.runnerCanInstall(state, side, eid, c, { noToast: true })) || [],
                  'sorted'
                );
              }),
            },
            async: true,
            cancel: where === 'Stack' ? coreShuffling.failToFind : null,
            effect: effect(
              where === 'Stack' ? effect(coreEngine.triggerEvent(state, side, 'searched-stack'), coreShuffling.shuffle(state, side, 'deck')) : null,
              coreInstalling.runnerInstall(
                coreEid.makeEid(state, { source: card, sourceType: 'runner-install' }),
                msg,
                { ignoreAllCost: true, msgKeys: { installSource: card, displayOrigin: true } }
              ),
              asyncResult
                ? (() => {
                    const installedCard = coreUpdate.updateIn(state, side, 'test-run', true);
                    coreEngine.registerEvents(state, side, installedCard, [{
                      event: 'runner-turn-ends',
                      duration: 'end-of-turn',
                      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                        return coreFinding.findLatest(state, installedCard)?.special?.testRun;
                      }),
                      msg: msg('move ', msg => installedCard.title, ' to the top of the stack'),
                      effect: effect(coreMoving.move(coreFinding.findLatest(state, installedCard), 'deck', { front: true })),
                    }]);
                    return coreEid.effectCompleted(state, side, eid);
                  })()
                : coreEid.effectCompleted(state, side, eid)
            ),
          };
        })(),
        card,
        null
      )
    ),
  },
};

// The Maker's Eye
export const theMakersEye: CardDef = {
  title: "The Maker's Eye",
  makesRun: true,
  onPlay: runServerAbility('rd'),
  events: [{
    event: 'successful-run',
    silent: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return ctx.server === 'rd' && forms.thisCardRun;
    }),
    effect: effect(coreEngine.registerEvents(card, [coreDefHelpers.breachAccessBonus('rd', 2, { duration: 'end-of-run' })])),
  }],
};

// The Noble Path
export const theNoblePath: CardDef = {
  title: 'The Noble Path',
  makesRun: true,
  staticAbilities: [
    { type: 'cannot-pay-net', req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.run(state); }), value: true },
    { type: 'cannot-pay-brain', req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.run(state); }), value: true },
    { type: 'cannot-pay-meat', req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.run(state); }), value: true },
  ],
  prevention: [{
    prevents: 'damage',
    type: 'event',
    maxUses: 1,
    mandatory: true,
    ability: {
      async: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return forms.run(state) && utils.sameCard(card, (state as any).runner?.playArea?.[0]) && corePrevention.preventable(ctx);
      }),
      condition: 'active',
      msg: msg('prevent ', msg => ctx.remaining, ' ', msg => coreDamage.damageName(state), ' damage'),
      effect: effect(corePrevention.preventDamage(state, side, eid, 'all')),
    },
  }],
  onPlay: {
    async: true,
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (state as any).runner?.hand?.length > 0 || coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null)).length > 0;
      }),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trashCards(state, side, (state as any).runner?.hand || [], { causeCard: card })], []);
      yield continue_ability(
        state,
        side,
        {
          async: true,
          prompt: 'Choose a server',
          choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null));
          }),
          msg: msg('trash [their] grip and make a run on ', msg => msg, ', preventing all damage'),
          effect: effect(coreRuns.makeRun(eid, msg, card)),
        },
        card,
        null
      );
    }),
  },
};

// The Price
export const thePrice: CardDef = {
  title: 'The Price',
  onPlay: {
    async: true,
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.deck?.length > 0; }),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.mill(state, 'runner', coreEid.makeEid(state, eid), 'runner', 4)], []);
      const trashedCards = asyncResult;
      coreSay.systemMsg(state, side, `uses ${card.title} to trash ${trashedCards?.map((c: Card) => c.title).join(', ')} from the top of the stack`);
      yield continue_ability(
        state,
        side,
        {
          prompt: 'Choose a card to install',
          waitingPrompt: true,
          async: true,
          req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return !coreCard.zoneLocked(state, 'runner', 'discard'); }),
          choices: {
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              return corePrompts.cancellable(
                (trashedCards || []).filter((c: Card) => !coreCard.event(c) && coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card }, c, { costBonus: -3 }) && coreCard.inDiscard(coreCard.getCard(state, c))),
                'sorted'
              );
            }),
          },
          effect: effect(
            (() => {
              const cardToInstall = (trashedCards || []).find((c: Card) => msg?.title === c.title && coreCard.inDiscard(coreCard.getCard(state, c)));
              return coreInstalling.runnerInstall({ ...eid, source: card, sourceType: 'runner-install' }, cardToInstall, { costBonus: -3, msgKeys: { installSource: card, displayOrigin: true } });
            })()
          ),
        },
        card,
        null
      );
    }),
  },
};

// The Price of Freedom
export const thePriceOfFreedom: CardDef = {
  title: 'The Price of Freedom',
  onPlay: {
    additionalCost: [corePayment.toC('connection', 1)],
    rfgInsteadOfTrashing: true,
    msg: 'prevent the Corp from advancing cards during [their] next turn',
  },
  events: [{
    event: 'corp-turn-begins',
    duration: 'until-runner-turn-begins',
    effect: effect(coreFlags.registerTurnFlag(card, 'can-advance', () => false)),
  }],
};

// Three Steps Ahead
export const threeStepsAhead: CardDef = {
  title: 'Three Steps Ahead',
  onPlay: {
    effect: effect(
      coreEngine.registerEvents(
        card,
        [{
          event: 'runner-turn-ends',
          automatic: 'gain-credits',
          duration: 'end-of-turn',
          unregisterOnceResolved: true,
          msg: msg('gain ', msg => (coreEvents.runEvents(state, 'runner', 'successful-run') || []).length * 2, ' [Credits]'),
          async: true,
          effect: effect(coreGaining.gainCredits(eid, (coreEvents.runEvents(state, 'runner', 'successful-run') || []).length * 2)),
        }]
      )
    ),
  },
};

// Tinkering
export const tinkering: CardDef = {
  title: 'Tinkering',
  onPlay: {
    prompt: 'Choose a piece of ice',
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.installed(c) },
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => coreCard.ice(c)); }),
    },
    msg: msg('make ', msg => coreToString.cardStr(state, msg), ' gain Sentry, Code Gate, and Barrier until the end of the turn'),
    effect: effect(
      coreEffects.registerLingeringEffect(state, side, card, {
        type: 'gain-subtype',
        duration: 'end-of-turn',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return utils.sameCard(msg, msg); }),
        value: ['Sentry', 'Code Gate', 'Barrier'],
      }),
      coreEffects.registerLingeringEffect(state, side, card, {
        type: 'icon',
        duration: 'end-of-turn',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return utils.sameCard(msg, msg); }),
        value: makeIcon('T', card),
      })
    ),
  },
};

// Trade-In
export const tradeIn: CardDef = {
  title: 'Trade-In',
  onPlay: {
    additionalCost: [corePayment.toC('hardware', 1)],
    msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const trashedHw = (state as any).runner?.discard?.slice(-1)[0];
      return `trash ${trashedHw?.title} and gain ${Math.floor((trashedHw?.cost || 0) / 2)} [Credits]`;
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const trashedHw = (state as any).runner?.discard?.slice(-1)[0];
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, 'runner', Math.floor((trashedHw?.cost || 0) / 2))], []);
      yield continue_ability(
        state,
        'runner',
        {
          prompt: 'Choose a piece of hardware to add to the grip',
          choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            return (state as any).runner?.deck?.filter((c: Card) => coreCard.hardware(c));
          }),
          msg: msg('add ', msg => msg, ' from the stack to the Grip and shuffle the stack'),
          effect: effect(
            coreEngine.triggerEvent('searched-stack'),
            coreShuffling.shuffle('deck'),
            coreMoving.move(msg, 'hand')
          ),
        },
        card,
        null
      );
    }),
  },
};

// Traffic Jam
export const trafficJam: CardDef = {
  title: 'Traffic Jam',
  staticAbilities: [{
    type: 'advancement-requirement',
    value: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return ((state as any).corp?.scored || []).filter((c: Card) => c.title === msg.title).length;
    }),
  }],
};

// Transfer of Wealth
export const transferOfWealth: CardDef = {
  title: 'Transfer of Wealth',
  onPlay: runServerAbility('hq'),
  makesRun: true,
  events: [{
    event: 'successful-run',
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    automatic: 'drain-credits',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return forms.thisCardRun && ctx.server === 'hq';
    }),
    msg: 'take 1 tag',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreTags.gainTags(state, 'runner', 1)], []);
      yield continue_ability(state, side, drainCredits('runner', 'corp', 3, 2), card, null);
    }),
  }],
};

// Tread Lightly
export const treadLightly: CardDef = {
  title: 'Tread Lightly',
  onPlay: runAnyServerAbility(),
  makesRun: true,
  staticAbilities: [{
    type: 'rez-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.run(state) && coreCard.ice(msg); }),
    value: 3,
  }],
};

// Trick Shot
export const trickShot: CardDef = {
  title: 'Trick Shot',
  makesRun: true,
  data: { counter: { credit: 4 } },
  interactions: {
    'pay-credits': { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.run(state); }), type: 'credit' },
  },
  onPlay: {
    async: true,
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null)) || []).includes('rd');
      }),
    },
    effect: effect(
      coreUpdate.updateIn(state, side, 'runEid', eid),
      coreRuns.makeRun(state, side, eid, 'rd', card)
    ),
  },
  events: [
    {
      event: 'successful-run',
      automatic: 'gain-credits',
      unregisterOnceResolved: true,
      silent: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const c = coreCard.getCard(state, card);
        return ctx.server === 'rd' && forms.thisCardRun && c?.special?.runEid?.eid === state.run?.eid?.eid;
      }),
      msg: 'place 2 [Credits] on itself and access 1 additional card from R&D',
      async: true,
      effect: effect(
        coreEngine.registerEvents(card, [coreDefHelpers.breachAccessBonus('rd', 1, { duration: 'end-of-run' })]),
        coreProps.addCounter(eid, card, 'credit', 2, { placed: true })
      ),
    },
    {
      event: 'run-ends',
      unregisterOnceResolved: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.thisCardRun; }),
      prompt: 'Choose a remote server to run',
      choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return corePrompts.cancellable(
          (coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null)) || [])
            .filter((s: string) => coreServers.isRemote(s))
            .map(coreServers.unknownToKw)
            .map(coreServers.remoteToName)
        );
      }),
      msg: msg('make a run on ', msg => msg),
      async: true,
      effect: effect(coreRuns.makeRun(eid, msg, card)),
    },
  ],
};

// Uninstall
export const uninstall: CardDef = {
  title: 'Uninstall',
  onPlay: {
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (coreBoard.allActiveInstalled(state, 'runner') || []).some((c: Card) => !c.facedown && (coreCard.hardware(c) || coreCard.program(c)));
      }),
    },
    choices: { card: (c: Card) => coreCard.installed(c) && !c.facedown && (coreCard.hardware(c) || coreCard.program(c)) },
    msg: msg('move ', msg => msg, ' to [their] Grip'),
    effect: effect(coreMoving.move(msg, 'hand')),
  },
};

// Unscheduled Maintenance
export const unscheduledMaintenance: CardDef = {
  title: 'Unscheduled Maintenance',
  events: [{
    event: 'corp-install',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return coreCard.ice(ctx.card); }),
    effect: effect(
      coreFlags.registerTurnFlag(
        card,
        'can-install-ice',
        function*(state: State, side: Side, card: Card) {
          if (coreCard.ice(card)) {
            coreToasts.toast(state, 'corp', 'Cannot install ice the rest of this turn due to Unscheduled Maintenance');
            return false;
          }
          return true;
        }
      )
    ),
  }],
  leavePlay: effect(coreFlags.clearTurnFlag(card, 'can-install-ice')),
};

// Vamp
export const vamp: CardDef = {
  title: 'Vamp',
  makesRun: true,
  onPlay: runServerAbility('hq'),
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'hq',
    thisCardRun: true,
    ability: {
      cost: [corePayment.toC('x-credits')],
      async: true,
      onChangeGameState: { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return corePayment.costValue(eid, 'x-credits') > 0; }) },
      msg: msg('make the corp lose ', msg => corePayment.costValue(eid, 'x-credits'), ' [Credits]'),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.loseCredits(state, 'corp', corePayment.costValue(eid, 'x-credits'))], []);
        yield continue_ability(state, side, coreTags.gainTagsAbility(1), card, null);
      }),
    },
  }],
};

// VRcation
export const vrcation: CardDef = {
  title: 'VRcation',
  onPlay: {
    msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      let result = 'draw 4 cards';
      if ((state as any).runner?.click > 0) {
        result += ' and lose [Click]';
      }
      return result;
    }),
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (state as any).runner?.deck?.length > 0 || (state as any).runner?.click > 0;
      }),
    },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if ((state as any).runner?.click > 0) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.loseClicks(state, 'runner', 1)], []);
      }
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, 'runner', eid, 4)], []);
    }),
  },
};

// Wanton Destruction
export const wantonDestruction: CardDef = {
  title: 'Wanton Destruction',
  makesRun: true,
  onPlay: runServerAbility('hq'),
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'hq',
    thisCardRun: true,
    ability: {
      msg: msg('force the Corp to discard ', msg => msg, ' card from HQ at random'),
      prompt: 'How many [Click] do you want to spend?',
      choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return Array.from({ length: (state as any).runner?.click + 1 }, (_, i) => String(i));
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const n = parseInt(msg, 10);
        yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.pay(state, 'runner', coreEid.makeEid(state, eid), card, corePayment.toC('click', n))], []);
        coreSay.systemMsg(state, 'runner', asyncResult?.msg);
        yield wait_for(
          state,
          [{ asyncResult: 'result' }, coreMoving.trashCards(state, 'corp', eid, (state as any).corp?.hand?.slice(0, n).sort(() => Math.random() - 0.5), { causeCard: card })],
          []
        );
      }),
    },
  }],
};

// Watch the World Burn
export const watchTheWorldBurn: CardDef = {
  title: 'Watch the World Burn',
  makesRun: true,
  onPlay: runRemoteServerAbility(),
  events: [{
    event: 'pre-access-card',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return !coreCard.agenda(ctx.accessedCard) && ctx.successful;
    }),
    once: 'per-run',
    msg: msg('remove ', msg => ctx.accessedCard?.title, ' from the game, and watch for other copies of ', msg => ctx.accessedCard?.title, ' to burn'),
    effect: effect(
      coreMoving.move('corp', ctx.accessedCard, 'rfg'),
      coreEngine.registerEvents(card, watchTheWorldBurnRfgCardEvent(ctx.accessedCard))
    ),
  }],
};

function watchTheWorldBurnRfgCardEvent(burnedCard: Card): any[] {
  return [{
    event: 'pre-access-card',
    duration: 'end-of-game',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return utils.sameCard('title', burnedCard, ctx.accessedCard);
    }),
    msg: msg('remove ', msg => burnedCard.title, ' from the game'),
    effect: effect(coreMoving.move('corp', ctx.accessedCard, 'rfg')),
  }];
}

// White Hat
export const whiteHat: CardDef = {
  title: 'White Hat',
  onPlay: {
    trace: {
      base: 3,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const reg = (state as any).runner?.register;
        return reg?.successfulRun?.includes('hq') || reg?.successfulRun?.includes('rd') || reg?.successfulRun?.includes('archives');
      }),
      unsuccessful: coreDefHelpers.withRevealedHand('corp', { eventSide: 'corp', forced: true }, {
        prompt: 'Shuffle up to 2 cards into R&D',
        player: 'runner',
        choices: { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return targets?.some((c: Card) => coreCard.corp(c) && coreCard.inHand(c)); }), max: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return Math.min(2, (state as any).corp?.hand?.length || 0); }) },
        msg: msg('shuffle ', msg => (targets || []).map((c: Card) => c.title).join(', '), ' into R&D'),
        effect: effect(
          function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            for (const t of targets || []) {
              yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, 'corp', t, 'deck')], []);
            }
          },
          coreShuffling.shuffle(state, 'corp', 'deck')
        ),
      }),
    },
  },
};

// Wildcat Strike
export const wildcatStrike: CardDef = {
  title: 'Wildcat Strike',
  onPlay: coreChooseOne.chooseOneHelper(
    { player: 'corp' },
    [
      {
        option: 'Runner gains 6 [Credits]',
        ability: { msg: 'force the Runner to gain 6 [Credits]', displaySide: 'corp', async: true, effect: effect(coreGaining.gainCredits(state, 'runner', eid, 6)) },
      },
      {
        option: 'Runner draws 4 cards',
        ability: { msg: 'force the Runner to draw 4 cards', displaySide: 'corp', async: true, effect: effect(coreDrawing.draw(state, 'runner', eid, 4)) },
      },
    ]
  ),
};

// Windfall
export const windfall: CardDef = {
  title: 'Windfall',
  onPlay: {
    async: true,
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.deck?.length > 0; }),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreShuffling.shuffle(state, side, 'deck')], []);
      const topCard = (state as any).runner?.deck?.[0];
      const cost = topCard?.cost || 0;
      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trash(state, side, topCard, { causeCard: card })], []);
      yield wait_for(
        state,
        [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, coreCard.event(topCard) ? 0 : cost)],
        []
      );
      coreSay.systemMsg(state, side, `shuffles the stack and trashes ${topCard.title}${!coreCard.event(topCard) ? ` to gain ${cost} [Credits]` : ''}`);
      return coreEid.effectCompleted(state, side, eid);
    }),
  },
};

// Window of Opportunity
export const windowOfOpportunity: CardDef = {
  title: 'Window of Opportunity',
  makesRun: true,
  events: [{
    event: 'run',
    async: true,
    unregisterOnceResolved: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const rezzedTargets = (coreBoard.allActiveInstalled(state, 'corp') || []).filter((c: Card) => coreCard.ice(c) && (coreRuns.targetServer(ctx) === (coreCard.getZone(c) as string[])[1]));
      if (rezzedTargets.length > 0) {
        yield continue_ability(
          state,
          side,
          {
            prompt: 'Choose a piece of ice protecting this server to derez',
            waitingPrompt: true,
            choices: { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return rezzedTargets.some((c: Card) => utils.sameCard(msg, c)); }) },
            async: true,
            effect: effect(
              (() => {
                const chosenIce = msg;
                return effect(
                  coreEngine.registerEvents(state, side, card, [{
                    event: 'run-ends',
                    duration: 'end-of-run',
                    optional: {
                      player: 'corp',
                      waitingPrompt: true,
                      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                        return coreCard.installed(coreCard.getCard(state, chosenIce)) && !coreCard.rezzed(coreCard.getCard(state, chosenIce));
                      }),
                      prompt: msg('Rez ', msg => coreToString.cardStr(state, chosenIce), ', ignoring all costs?'),
                      yesAbility: { async: true, effect: effect(coreRezzing.rez(state, 'corp', eid, chosenIce, { ignoreCost: 'all-costs' })) },
                    },
                  }]),
                  coreRezzing.derez(state, side, eid, msg)
                );
              })()
            ),
          },
          card,
          null
        );
      } else {
        return coreEid.effectCompleted(state, side, eid);
      }
    }),
  }],
  onPlay: {
    async: true,
    prompt: 'Choose a server',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null));
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.resolveAbility(state, side, windowOfOpportunityInstallAbi(), card, null)], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreRuns.makeRun(state, side, eid, msg, card)], []);
    }),
  },
};

function windowOfOpportunityInstallAbi(): any {
  return {
    prompt: 'Choose 1 program or piece of hardware to install',
    waitingPrompt: true,
    onChangeGameState: { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (coreDefHelpers.allCardsInHandStar(state, 'runner') || []).length > 0; }) },
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const t = targets[0];
        return coreCard.inHandStar(state, t) && (coreCard.hardware(t) || coreCard.program(t)) && coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card }, t);
      }),
    },
    async: true,
    effect: effect(coreInstalling.runnerInstall({ ...eid, source: card, sourceType: 'runner-install' }, msg, { msgKeys: { installSource: card, displayOrigin: true } })),
  };
}

