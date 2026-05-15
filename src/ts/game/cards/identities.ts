
/** Fringe Applications: Tomorrow, Today */
export const card_FringeApplications_TomorrowToday: Card = {
  title: 'Fringe Applications: Tomorrow, Today',
  events: [
    { event: 'pre-start-game', effect: effect(function*(state) { draftPointsTarget(state); }) },
    {
      event: 'runner-turn-begins',
      req: req(function*(state, side, eid, card, targets) {
        if (card.disabled || coreEffects.isDisabled(state, side, card)) return false;
        return hasMostFaction(state, 'corp', 'Weyland Consortium');
      }),
      changeInGameState: { silent: true, req: req(function*(state) { return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => coreCard.ice(c)); }) },
      prompt: 'Choose a piece of ice to place 1 advancement counter on',
      choices: { card: (c: Card) => coreCard.installed(c) && coreCard.ice(c) },
      msg: msg('place 1 advancement counter on ', (c: Card) => coreToString.cardStr(state, c) || ''),
      async: true,
      effect: effect(function*(state, side, eid, card, targets) {
        coreProps.addProp(state, side, eid, targets[0], 'advance-counter', 1, { placed: true });
      })
    }
  ]
};

/** Gabriel Santiago: Consummate Professional */
export const card_GabrielSantiago_ConsummateProfessional: Card = {
  title: 'Gabriel Santiago: Consummate Professional',
  events: [{
    event: 'successful-run', automatic: 'gain-credits', silent: true,
    req: req(function*(state, side, eid, card, targets) {
      const ctx = (targets as any)[0]?.context || {};
      return ctx.targetServer === 'hq' && coreEvents.firstSuccessfulRunOnServer(state, 'hq');
    }),
    msg: 'gain 2 [Credits]', async: true,
    effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainCredits(eid, 2); })
  }]
};

/** Gagarin Deep Space: Expanding the Horizon */
export const card_GagarinDeepSpace_ExpandingTheHorizon: Card = {
  title: 'Gagarin Deep Space: Expanding the Horizon',
  events: [{
    event: 'pre-access-card',
    req: req(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      const accessedCard = context.accessedCard ? coreCard.getCard(state, context.accessedCard) : null;
      const zone = coreCard.getZone(accessedCard);
      return zone && coreServers.isRemote(zone);
    }),
    effect: effect(function*(state, side, eid, card, targets) {
      coreAccess.accessCostBonus([corePayment.toC('credit', 1)]);
    }),
    msg: 'make the Runner spend 1 [Credits] to access'
  }]
};

/** GameNET: Where Dreams are Real */
export const card_GameNET_WhereDreamsAreReal: Card = {
  title: 'GameNET: Where Dreams are Real',
  events: [
    {
      req: req(function*(state, side, eid, card, targets) {
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
      effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainCredits('corp', eid, 1); })
    },
    {
      event: 'runner-credit-loss',
      req: req(function*(state, side, eid, card, targets) {
        const run = (state as any).run;
        if (!run) return false;
        return coreEid.source(eid)?.side === 'Runner';
      }),
      async: true, msg: 'gain 1 [Credits]',
      effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainCredits('corp', eid, 1); })
    }
  ]
};

/** GRNDL: Power Unleashed */
export const card_GRNDL_PowerUnleashed: Card = {
  title: 'GRNDL: Power Unleashed',
  events: [{
    event: 'pre-start-game',
    req: req(function*(state, side, eid, card, targets) { return side === 'corp'; }),
    async: true,
    msg: 'start the game with 10 [Credits] and 1 bad publicity',
    effect: effect(function*(state, side, eid, card, targets) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, 'corp', 5)], []);
      if ((state as any).corp?.badPublicity <= 0) {
        coreBadPublicity.gainBadPublicity(state, 'corp', eid, 1);
      }
    })
  }]
};

/** Haarpsichord Studios: Entertainment Unleashed */
export const card_HaarpsichordStudios_EntertainmentUnleashed: Card = {
  title: 'Haarpsichord Studios: Entertainment Unleashed',
  staticAbilities: [{
    type: 'cannot-steal',
    value: req(function*(state, side, eid, card, targets) {
      return (coreEvents.eventCount(state, side, 'agenda-stolen') || 0) > 0;
    })
  }],
  events: [{
    event: 'access',
    req: req(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      const accessedCard = context.accessedCard ? coreCard.getCard(state, context.accessedCard) : null;
      return accessedCard && coreCard.agenda(accessedCard) && (coreEvents.eventCount(state, side, 'agenda-stolen') || 0) > 0;
    }),
    effect: effect(function*(state, side, eid, card, targets) {
      coreToasts.toast(state, 'runner', 'Cannot steal due to Haarpsichord Studios.', 'warning');
    })
  }]
};

/** Haas-Bioroid: Architects of Tomorrow */
export const card_HaasBioroid_ArchitectsOfTomorrow: Card = {
  title: 'Haas-Bioroid: Architects of Tomorrow',
  events: [{
    event: 'pass-ice',
    req: req(function*(state, side, eid, card, targets) {
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
      req: req(function*(state, side, eid, card, targets) {
        return coreCard.hasSubtype(targets[0], 'Bioroid') && !coreCard.rezzed(targets[0]) &&
          coreRezzing.canPayToRez(state, side, eid, targets[0], { 'cost-bonus': -4 });
      })
    },
    async: true,
    effect: effect(function*(state, side, eid, card, targets) {
      coreRezzing.rez(state, side, eid, targets[0], { 'cost-bonus': -4 });
    })
  }]
};

/** Haas-Bioroid: Engineering the Future */
export const card_HaasBioroid_EngineeringTheFuture: Card = {
  title: 'Haas-Bioroid: Engineering the Future',
  events: [{
    event: 'corp-install',
    req: req(function*(state, side, eid, card, targets) {
      return coreEvents.firstEvent(state, 'corp', 'corp-install');
    }),
    automatic: 'gain-credits', msg: 'gain 1 [Credits]', async: true,
    effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainCredits(eid, 1); })
  }]
};

/** Haas-Bioroid: Precision Design */
export const card_HaasBioroid_PrecisionDesign: Card = {
  title: 'Haas-Bioroid: Precision Design',
  staticAbilities: [coreHandSize.corpHandSizePlus(req(function*(state, side, eid, card, targets) { return 1; }))],
  events: [{
    event: 'agenda-scored',
    interactive: true,
    optional: {
      prompt: 'Add 1 card from Archives to HQ?',
      autoResolve: coreOptional.getAutoresolve('auto-fire'),
      yesAbility: coreDefHelpers.corpRecur
    }
  }],
  abilities: [{ effect: effect(function*(state) { coreOptional.setAutoresolve('auto-fire', 'Haas-Bioroid: Precision Design'); }) }]
};

/** Haas-Bioroid: Stronger Together */
export const card_HaasBioroid_StrongerTogether: Card = {
  title: 'Haas-Bioroid: Stronger Together',
  staticAbilities: [{
    type: 'ice-strength',
    req: req(function*(state, side, eid, card, targets) { return coreCard.hasSubtype(targets[0], 'Bioroid'); }),
    value: 1
  }],
  leavePlay: effect(function*(state, side, eid, card, targets) { coreIce.updateAllIce(state, side); }),
  effect: effect(function*(state, side, eid, card, targets) { coreIce.updateAllIce(state, side); })
};

/** Harishchandra Ent.: Where You're the Star */
export const card_HarishchandraEnt_WhereYoureTheStar: Card = {
  title: "Harishchandra Ent.: Where You're the Star",
  events: [
    {
      event: 'post-runner-draw',
      req: req(function*(state) { return utils.isTagged?.(state) ?? false; }),
      msg: msg('see that the Runner drew: ', (runner: any) => {
        return runner && runner.length > 0 ? utils.enumerateCards(runner) : 'no cards';
      })
    },
    {
      event: 'tags-changed',
      effect: effect(function*(state, side, eid, card, targets) {
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
  effect: effect(function*(state, side, eid, card, targets) {
    if (utils.isTagged?.(state) ?? false) coreRevealing.revealHand(state, 'runner');
  }),
  leavePlay: effect(function*(state, side, eid, card, targets) {
    if (utils.isTagged?.(state) ?? false) coreRevealing.concealHand(state, 'runner');
  })
};

/** Harmony Medtech: Biomedical Pioneer */
export const card_HarmonyMedtech_BiomedicalPioneer: Card = {
  title: 'Harmony Medtech: Biomedical Pioneer',
  staticAbilities: [{ type: 'agenda-point-req', value: -1 }]
};

/** Hayley Kaplan: Universal Scholar */
export const card_HayleyKaplan_UniversalScholar: Card = {
  title: 'Hayley Kaplan: Universal Scholar',
  events: [{
    event: 'runner-install',
    req: req(function*(state, side, eid, card, targets) {
      if (!coreEvents.firstEvent(state, side, 'runner-install')) return false;
      if ((targets as any)[0]?.context?.facedown) return false;
      const allInstalled = coreBoard.allActiveInstalled(state, 'runner');
      return allInstalled.some((c: Card) => {
        const flag = coreFlags.cardFlag?.(c, 'runner-install-draw');
        return flag;
      });
    }),
    async: true, waitingPrompt: true,
    effect: effect(function*(state, side, eid, card, targets) {
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
              choices: { req: req(function*(state, side, eid, card, targets) { return coreCard.isType(targets[0], cardType) && coreDefHelpers.inHandStar(state, targets[0]); }) },
              async: true,
              effect: effect(function*(state, side, eid, card, targets) {
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
export const card_Hiram0missionSvensson_ShadowOfThePast: Card = {
  title: 'Hiram "0mission" Svensson: Shadow of the Past',
  events: [
    {
      event: 'runner-install',
      req: req(function*(state, side, eid, card, targets) {
        const context = (targets as any)[0]?.context || {};
        const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
        return contextCard && coreCard.hardware(contextCard);
      }),
      msg: msg('look at ', (c: any) => c.title || 'the top card', ' on top of R&D'),
      effect: effect(function*(state, side, eid, card, targets) {
        coreDefHelpers.scry(state, side, card, 'corp', 1);
      })
    },
    {
      event: 'runner-trash',
      req: req(function*(state, side, eid, card, targets) {
        return (targets as any[]).some((t: any) => {
          const context = t.context || {};
          const ctxCard = context.card ? coreCard.getCard(state, context.card) : null;
          return ctxCard && coreCard.hardware(ctxCard);
        });
      }),
      effect: effect(function*(state, side, eid, card, targets) {
        coreDefHelpers.scry(state, side, card, 'corp', 1);
      })
    }
  ]
};

/** Hoshiko Shiro: Untold Protagonist */
export const card_HoshikoShiro_UntoldProtagonist: Card = {
  title: 'Hoshiko Shiro: Untold Protagonist',
  staticAbilities: [
    coreLink.linkPlus(req(function*(state, side, eid, card, targets) { return card.flipped ? 1 : 0; }), 1),
    {
      type: 'gain-subtype',
      req: req(function*(state, side, eid, card, targets) {
        return coreCard.sameCard(card, targets[0]) && card.flipped;
      }),
      value: 'Digital'
    },
    {
      type: 'lose-subtype',
      req: req(function*(state, side, eid, card, targets) {
        return coreCard.sameCard(card, targets[0]) && card.flipped;
      }),
      value: 'Natural'
    }
  ],
  events: [
    {
      event: 'pre-first-turn',
      req: req(function*(state, side, eid, card, targets) { return side === 'runner'; }),
      effect: effect(function*(state, side, eid, card, targets) {
        coreUpdate.update!(state, side, { ...card, flipped: false, face: 'front' });
      })
    },
    {
      event: 'runner-turn-ends',
      automatic: 'gain-credits', interactive: true, async: true,
      effect: effect(function*(state, side, eid, card, targets) {
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
      req: req(function*(state, side, eid, card, targets) { return card.flipped; }),
      async: true,
      effect: effect(function*(state, side, eid, card, targets) {
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
    effect: effect(function*(state, side, eid, card, targets) {
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
export const card_HyoubuInstitute_AbsoluteClarity: Card = {
  title: 'Hyoubu Institute: Absolute Clarity',
  events: [{
    event: 'corp-reveal',
    req: req(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      const cards = context.cards || [];
      if (cards.length <= 0) return false;
      return coreEvents.firstEvent(state, side, 'corp-reveal', (ctx: any) => (ctx.cards || []).length > 0);
    }),
    msg: 'gain 1 [Credits]', async: true,
    effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainCredits(eid, 1); })
  }],
  abilities: [
    {
      action: true, cost: [corePayment.toC('click', 1)],
      label: 'Reveal the top card of the Stack', async: true,
      effect: effect(function*(state, side, eid, card, targets) {
        const revealed = (state.runner?.deck || [])[0];
        if (revealed) {
          coreSay.systemMsg(state, side, `uses ${card.title} to reveal ${revealed.title} from the top of the Stack`);
          coreRevealing.reveal(state, side, eid, revealed);
        }
      })
    },
    {
      action: true, cost: [corePayment.toC('click', 1)],
      label: 'Reveal a random card from the Grip', async: true,
      effect: effect(function*(state, side, eid, card, targets) {
        const hand = (state.runner?.hand || []).slice();
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
export const card_IainStirling_RetiredSpook: Card = {
  title: 'Iain Stirling: Retired Spook',
  flags: { 'drip-economy': true },
  events: [{
    event: 'runner-turn-begins',
    req: req(function*(state, side, eid, card, targets) {
      return (state.corp?.agendaPoint || 0) > (state.runner?.agendaPoint || 0);
    }),
    automatic: 'gain-credits', msg: 'gain 2 [Credits]', async: true,
    effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainCredits(eid, 2); })
  }],
  abilities: [{
    req: req(function*(state, side, eid, card, targets) {
      return (state.corp?.agendaPoint || 0) > (state.runner?.agendaPoint || 0);
    }),
    once: 'per-turn', automatic: 'gain-credits', msg: 'gain 2 [Credits]', async: true,
    effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainCredits(eid, 2); })
  }]
};

/** Industrial Genomics: Growing Solutions */
export const card_IndustrialGenomics_GrowingSolutions: Card = {
  title: 'Industrial Genomics: Growing Solutions',
  staticAbilities: [{
    type: 'trash-cost',
    value: req(function*(state, side, eid, card, targets) {
      return (state.corp?.discard || []).filter((c: Card) => !c.seen).length;
    })
  }]
};

/** Information Dynamics: All You Need To Know */
export const card_InformationDynamics_AllYouNeedToKnow: Card = {
  title: 'Information Dynamics: All You Need To Know',
  events: [
    { event: 'pre-start-game', effect: effect(function*(state) { draftPointsTarget(state); }) },
    {
      event: 'agenda-scored',
      req: req(function*(state, side, eid, card, targets) {
        if (card.disabled || coreEffects.isDisabled(state, side, card)) return false;
        return hasMostFaction(state, 'corp', 'NBN');
      }),
      interactive: true, msg: 'give the Runner 1 tag', async: true,
      effect: effect(function*(state, side, eid, card, targets) { coreTags.gainTags('corp', eid, 1); })
    },
    {
      event: 'agenda-stolen',
      req: req(function*(state, side, eid, card, targets) {
        if (card.disabled || coreEffects.isDisabled(state, side, card)) return false;
        return hasMostFaction(state, 'corp', 'NBN');
      }),
      interactive: true, msg: 'give the Runner 1 tag', async: true,
      effect: effect(function*(state, side, eid, card, targets) { coreTags.gainTags('corp', eid, 1); })
    }
  ]
};

/** Issuaq Adaptics: Sustaining Diversity */
export const card_IssuaqAdaptics_SustainingDiversity: Card = {
  title: 'Issuaq Adaptics: Sustaining Diversity',
  effect: effect(function*(state, side, eid, card, targets) {
    coreGaining.gain('agenda-point-req', coreCard.getCounters(card, 'power'));
  }),
  leavePlay: effect(function*(state, side, eid, card, targets) {
    coreGaining.gain('agenda-point-req', coreCard.getCounters(card, 'power'));
  }),
  staticAbilities: [{
    type: 'agenda-point-req',
    req: req(function*(state, side, eid, card, targets) { return side === 'corp'; }),
    value: req(function*(state, side, eid, card, targets) {
      return -(coreCard.getCounters(card, 'power') || 0);
    })
  }],
  events: [{
    event: 'agenda-scored', interactive: true,
    req: req(function*(state, side, eid, card, targets) {
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
    effect: effect(function*(state, side, eid, card, targets) {
      coreProps.addCounter(state, side, eid, card, 'power', 1);
    })
  }]
};

/** Jamie "Bzzz" Micken: Techno Savant */
export const card_JamieBzzzMicken_TechnoSavant: Card = {
  title: 'Jamie "Bzzz" Micken: Techno Savant',
  events: [
    { event: 'pre-start-game', effect: effect(function*(state) { draftPointsTarget(state); }) },
    {
      event: 'runner-install',
      req: req(function*(state, side, eid, card, targets) {
        return hasMostFaction(state, 'runner', 'Shaper') && coreEvents.firstEvent(state, side, 'runner-install');
      }),
      msg: 'draw 1 card', async: true,
      effect: effect(function*(state, side, eid, card, targets) { coreDrawing.draw(eid, 1); })
    }
  ]
};

/** Jemison Astronautics: Sacrifice. Audacity. Success. */
export const card_JemisonAstronautics_SacrificeAudacitySuccess: Card = {
  title: 'Jemison Astronautics: Sacrifice. Audacity. Success.',
  events: [{
    event: 'corp-forfeit-agenda',
    async: true, waitingPrompt: true,
    effect: effect(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      const p = (coreCard.getAgendaPoints(context.card) || 0) + 1;
      continue_ability(state, side, {
        prompt: 'Choose a card to place advancement counters on',
        choices: { card: (c: Card) => coreCard.installed(c) && coreCard.corp(c) },
        msg: msg('place ', (n: number) => utils.quantify(n, 'advancement counter'), ' on ', (c: Card) => coreToString.cardStr(state, c) || ''),
        async: true,
        effect: effect(function*(state, side, eid, card, targets) {
          coreProps.addProp('corp', eid, targets[0], 'advance-counter', p, { placed: true });
        })
      }, card, null);
    })
  }]
};

/** Jesminder Sareen: Girl Behind the Curtain */
export const card_JesminderSareen_GirlBehindTheCurtain: Card = {
  title: 'Jesminder Sareen: Girl Behind the Curtain',
  staticAbilities: [{
    type: 'forced-to-avoid-tag',
    req: req(function*(state, side, eid, card, targets) {
      const run = (state as any).run;
      if (!run) return false;
      return (coreEvents.runEventCount(state, side, 'tag-interrupt') || 0) === 0;
    }),
    value: true
  }],
  events: [{
    event: 'tag-interrupt', async: true,
    req: req(function*(state, side, eid, card, targets) {
      const run = (state as any).run;
      if (!run) return false;
      return (coreEvents.runEventCount(state, side, 'tag-interrupt') || 0) <= 1;
    }),
    msg: 'avoid 1 tag',
    effect: effect(function*(state, side, eid, card, targets) { corePrevention.preventTag('runner', eid, 1); })
  }]
};

/** Jinteki Biotech: Life Imagined */
export const card_JintekiBiotech_LifeImagined: Card = {
  title: 'Jinteki Biotech: Life Imagined',
  events: [{
    event: 'pre-first-turn',
    req: req(function*(state, side, eid, card, targets) { return side === 'corp'; }),
    prompt: msg('Choose a copy of ', (c: Card) => c.title || '', ' to use this game'),
    choices: ['The Brewery', 'The Tank', 'The Greenhouse'],
    effect: effect(function*(state, side, eid, card, targets) {
      coreUpdate.update!(state, side, { ...card, 'biotech-target': targets[0], face: 'front' });
      coreSay.systemMsg(`has chosen a copy of ${card.title} for this game`);
    })
  }],
  abilities: [
    {
      label: 'Check chosen flip identity',
      effect: effect(function*(state, side, eid, card, targets) {
        const target = card['biotech-target'];
        if (target === 'The Brewery') coreToasts.toast(state, 'corp', 'Flip to: The Brewery (Do 2 net damage)', 'info');
        else if (target === 'The Tank') coreToasts.toast(state, 'corp', 'Flip to: The Tank (Shuffle Archives into R&D)', 'info');
        else if (target === 'The Greenhouse') coreToasts.toast(state, 'corp', 'Flip to: The Greenhouse (Place 4 advancement counters on a card)', 'info');
        else coreToasts.toast(state, 'corp', 'No flip identity specified', 'info');
      })
    },
    {
      action: true, cost: [corePayment.toC('click', 3)],
      req: req(function*(state, side, eid, card, targets) { return !card['biotech-used']; }),
      label: 'Flip this identity', async: true,
      effect: effect(function*(state, side, eid, card, targets) {
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
            choices: { req: req(function*(state, side, eid, card, targets) { return coreCard.canBeAdvanced(state, targets[0]); }) },
            async: true,
            effect: effect(function*(state, side, eid, card, targets) {
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
export const card_Jinteki_PersonalEvolution: Card = {
  title: 'Jinteki: Personal Evolution',
  events: [
    { event: 'agenda-scored', effect: effect(function*(state, side, eid, card, targets) { coreDamage.damage(eid, 'net', 1, { card }); }) },
    { event: 'agenda-stolen', effect: effect(function*(state, side, eid, card, targets) { coreDamage.damage(eid, 'net', 1, { card }); }) }
  ]
};

/** Jinteki: Potential Unleashed */
export const card_Jinteki_PotentialUnleashed: Card = {
  title: 'Jinteki: Potential Unleashed',
  events: [{
    event: 'damage', async: true,
    req: req(function*(state, side, eid, card, targets) {
      return (targets as any)[0]?.context?.damageType === 'net';
    }),
    changeInGameState: { silent: true, req: req(function*(state) { return (state.runner?.deck || []).length > 0; }) },
    msg: msg('trash ', (r: any) => (r.hand || [])[0]?.title || 'the top card', ' from the top of the stack'),
    effect: effect(function*(state, side, eid, card, targets) { coreMoving.mill('corp', eid, 'runner', 1); })
  }]
};

/** Jinteki: Replicating Perfection */
export const card_Jinteki_ReplicatingPerfection: Card = {
  title: 'Jinteki: Replicating Perfection',
  staticAbilities: [{
    type: 'cannot-run-on-server',
    req: req(function*(state, side, eid, card, targets) {
      return coreEvents.eventCount(state, side, 'run', (ctx: any) => coreServers.isCentral(ctx[0]?.server || '')) === 0;
    }),
    value: req(function*(state, side, eid, card, targets) {
      const remotes = coreBoard.getRemotes(state);
      return Object.keys(remotes || {});
    })
  }]
};

/** Jinteki: Restoring Humanity */
export const card_Jinteki_RestoringHumanity: Card = {
  title: 'Jinteki: Restoring Humanity',
  events: [{
    event: 'corp-turn-ends', automatic: 'gain-credits',
    req: req(function*(state, side, eid, card, targets) {
      return (state.corp?.discard || []).filter((c: Card) => !c.seen).length > 0;
    }),
    msg: 'gain 1 [Credits]', async: true,
    effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainCredits('corp', eid, 1); })
  }]
};

/** Kabonesa Wu: Netspace Thrillseeker */
export const card_KabonesaWu_NetspaceThrillseeker: Card = {
  title: 'Kabonesa Wu: Netspace Thrillseeker',
  abilities: [{
    action: true, cost: [corePayment.toC('click', 1)],
    label: 'Install a non-virus program from the stack, lowering the cost by 1 [Credit]',
    prompt: 'Choose a program',
    changeInGameState: { req: req(function*(state) { return (state.runner?.deck || []).length > 0; }) },
    choices: (state) => {
      const deck = (state.runner?.deck || []);
      return corePrompts.cancellable(deck.filter((c: Card) =>
        coreCard.program(c) && !coreCard.hasSubtype(c, 'Virus') &&
        corePayment.canPay(state, 'runner', { ...eid, source: card, sourceType: 'runner-install' }, c, null,
          [corePayment.toC('credit', (coreCostFns.installCost(state, side, c, { 'cost-bonus': -1 }) || 0))])
      ));
    },
    async: true, waitingPrompt: true,
    cancel: (state, side, eid, card, targets) => ({ action: true, cost: [corePayment.toC('click', 1)] }),
    effect: effect(function*(state, side, eid, card, targets) {
      const target = targets[0];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreInstalling.runnerInstall(state, side, target, { 'cost-bonus': -1, msgKeys: { 'display-origin': true, 'install-source': card } })], []);
      const installedCard = (state as any).__lastAsyncResult;
      coreEngine.registerEvents(state, side, card, [{
        event: 'runner-turn-ends',
        interactive: req(function*(state, side, eid, card, targets) { return coreCard.getCard(state, installedCard); }),
        silent: req(function*(state, side, eid, card, targets) { return !coreCard.getCard(state, installedCard); }),
        changeInGameState: { silent: true, req: req(function*(state, side, eid, card, targets) { return coreCard.getCard(state, installedCard); }) },
        abilityName: `Kabonesa Wu (${installedCard.title})`,
        msg: msg('remove ', (c: Card) => c.title || '', ' from the game'),
        effect: effect(function*(state, side, eid, card, targets) {
          coreMoving.move(state, side, coreCard.getCard(state, installedCard), 'rfg');
        })
      }]);
      return coreEid.effectCompleted(state, side, eid);
    })
  }]
};

/** Kate "Mac" McCaffrey: Digital Tinker */
export const card_KateMacMcCaffrey_DigitalTinker: Card = {
  title: 'Kate "Mac" McCaffrey: Digital Tinker',
  staticAbilities: [{
    type: 'install-cost',
    req: req(function*(state, side, eid, card, targets) {
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
export const card_KenExpressTenma_DisappearedClone: Card = {
  title: 'Ken "Express" Tenma: Disappeared Clone',
  events: [{
    event: 'play-event',
    req: req(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
      if (!contextCard || !coreCard.hasSubtype(contextCard, 'Run')) return false;
      return coreEvents.firstEvent(state, 'runner', 'play-event', (ctx: any) => {
        const c = ctx.card ? coreCard.getCard(state, ctx.card) : null;
        return c && coreCard.hasSubtype(c, 'Run');
      });
    }),
    msg: 'gain 1 [Credits]', async: true,
    effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainCredits(eid, 1); })
  }]
};

/** Khan: Savvy Skiptracer */
export const card_Khan_SavvySkiptracer: Card = {
  title: 'Khan: Savvy Skiptracer',
  events: [{
    event: 'pass-ice',
    req: req(function*(state, side, eid, card, targets) {
      return coreEvents.firstEvent(state, 'runner', 'pass-ice');
    }),
    async: true, interactive: true,
    effect: effect(function*(state, side, eid, card, targets) {
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
            req: req(function*(state, side, eid, card, targets) {
              return coreCard.inHandStar(state, targets[0]) && coreCard.hasSubtype(targets[0], 'Icebreaker') &&
                corePayment.canPay(state, side, { ...eid, source: card, sourceType: 'runner-install' }, targets[0], null,
                  [corePayment.toC('credit', (coreCostFns.installCost(state, side, targets[0], { 'cost-bonus': -1 }) || 0))]);
            })
          },
          async: true,
          effect: effect(function*(state, side, eid, card, targets) {
            coreInstalling.runnerInstall(state, side, eid, targets[0], { 'cost-bonus': -1, msgKeys: { 'display-origin': true, 'install-source': card } });
          })
        }, card, null);
      }
    })
  }]
};

/** Laramy Fisk: Savvy Investor */
export const card_LaramyFisk_SavvyInvestor: Card = {
  title: 'Laramy Fisk: Savvy Investor',
  events: [{
    event: 'successful-run', skippable: true, async: true,
    interactive: coreOptional.getAutoresolve('auto-fire', (v: any) => !coreOptional.never(v)),
    silent: coreOptional.getAutoresolve('auto-fire', (v: any) => coreOptional.never(v) ? true : false),
    optional: {
      req: req(function*(state, side, eid, card, targets) {
        const context = (targets as any)[0]?.context || {};
        if (!coreServers.isCentral(context.server || '')) return false;
        return coreEvents.firstEvent(state, side, 'successful-run', (ctx: any) => coreServers.isCentral(ctx[0]?.server || ''));
      }),
      autoResolve: coreOptional.getAutoresolve('auto-fire'),
      prompt: 'Force the Corp to draw 1 card?',
      yesAbility: { msg: 'force the Corp to draw 1 card', async: true, effect: effect(function*(state, side, eid, card, targets) { coreDrawing.draw('corp', eid, 1); }) },
      noAbility: { effect: effect(function*(state, side, eid, card, targets) { coreSay.systemMsg(`declines to use ${card.title}`); }) }
    }
  }],
  abilities: [{ effect: effect(function*(state) { coreOptional.setAutoresolve('auto-fire', 'Laramy Fisk: Savvy Investor'); }) }]
};

/** Lat: Ethical Freelancer */
export const card_Lat_EthicalFreelancer: Card = {
  title: 'Lat: Ethical Freelancer',
  events: [{
    event: 'runner-turn-ends', interactive: true, async: true,
    effect: effect(function*(state, side, eid, card, targets) {
      const run = (state as any).runner;
      const corp = (state as any).corp;
      const runHand = run?.hand || [];
      const corpHand = corp?.hand || [];
      continue_ability(state, side, {
        optional: {
          req: req(function*(state, side, eid, card, targets) { return runHand.length === corpHand.length; }),
          autoResolve: coreOptional.getAutoresolve('auto-fire'),
          waitingPrompt: true,
          prompt: 'Draw 1 card?',
          yesAbility: { async: true, msg: 'draw 1 card', effect: effect(function*(state, side, eid, card, targets) { coreDrawing.draw('runner', eid, 1); }) },
          noAbility: { effect: effect(function*(state, side, eid, card, targets) { coreSay.systemMsg(`declines to use ${card.title}`); }) }
        }
      }, card, null);
    })
  }],
  abilities: [{ effect: effect(function*(state) { coreOptional.setAutoresolve('auto-fire', 'Lat: Ethical Freelancer'); }) }]
};

/** Leela Patel: Trained Pragmatist */
export const card_LeelaPatel_TrainedPragmatist: Card = {
  title: 'Leela Patel: Trained Pragmatist',
  events: [
    {
      event: 'agenda-scored',
      interactive: true, prompt: 'Choose an unrezzed card to return to HQ',
      choices: { card: (c: Card) => !coreCard.faceup(c) && coreCard.installed(c) && coreCard.corp(c), all: true },
      changeInGameState: { silent: true, req: req(function*(state) { return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => !coreCard.faceup(c) && coreCard.installed(c)); }) },
      msg: msg('add ', (c: Card) => coreToString.cardStr(state, c) || '', ' to HQ'),
      effect: effect(function*(state, side, eid, card, targets) { coreMoving.move('corp', targets[0], 'hand'); })
    },
    {
      event: 'agenda-stolen',
      interactive: true, prompt: 'Choose an unrezzed card to return to HQ',
      choices: { card: (c: Card) => !coreCard.faceup(c) && coreCard.installed(c) && coreCard.corp(c), all: true },
      changeInGameState: { silent: true, req: req(function*(state) { return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => !coreCard.faceup(c) && coreCard.installed(c)); }) },
      msg: msg('add ', (c: Card) => coreToString.cardStr(state, c) || '', ' to HQ'),
      effect: effect(function*(state, side, eid, card, targets) { coreMoving.move('corp', targets[0], 'hand'); })
    }
  ]
};

/** LEO Construction: Labor Solutions */
export const card_LEOConstruction_LaborSolutions: Card = {
  title: 'LEO Construction: Labor Solutions',
  abilities: [{
    cost: [corePayment.toC('bioroid-run-server', 1)], once: 'per-turn',
    label: 'end the run', msg: 'end the run', async: true,
    effect: effect(function*(state, side, eid, card, targets) { coreRuns.endRun(state, side, eid, card); })
  }]
};

/** Liza Talking Thunder: Prominent Legislator */
export const card_LizaTalkingThunder_ProminentLegislator: Card = {
  title: 'Liza Talking Thunder: Prominent Legislator',
  events: [{
    event: 'successful-run', automatic: 'draw-cards', async: true, interactive: true,
    msg: 'draw 2 cards and take 1 tag',
    req: req(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      if (!coreServers.isCentral(context.server || '')) return false;
      return coreEvents.firstEvent(state, side, 'successful-run', (ctx: any) => coreServers.isCentral(ctx[0]?.server || ''));
    }),
    effect: effect(function*(state, side, eid, card, targets) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, 'runner', 2, { suppressCheckpoint: true })], []);
      coreTags.gainTags(state, 'runner', eid, 1);
    })
  }]
};

/** Los: Data Hijacker */
export const card_Los_DataHijacker: Card = {
  title: 'Los: Data Hijacker',
  events: [{
    event: 'rez',
    req: req(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
      return contextCard && coreCard.ice(contextCard) && coreEvents.firstEvent(state, side, 'rez', (ctx: any) => {
        const c = ctx.card ? coreCard.getCard(state, ctx.card) : null;
        return c && coreCard.ice(c);
      });
    }),
    msg: 'gain 2 [Credits]', async: true,
    effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainCredits('runner', eid, 2); })
  }]
};

/** Magdalene Keino-Chemutai: Cryptarchitect */
export const card_MagdaleneKeinoChemutai_Cryptarchitect: Card = {
  title: 'Magdalene Keino-Chemutai: Cryptarchitect',
  events: [{
    event: 'runner-discard-to-hand-size', async: true,
    effect: effect(function*(state, side, eid, card, targets) {
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
          effect: effect(function*(state, side, eid, card, targets) {
            coreInstalling.runnerInstall(state, side, eid, targets[0], { msgKeys: { 'install-source': card, 'display-origin': true } });
          })
        }, card, null);
      }
    })
  }]
};

/** MaxX: Maximum Punk Rock */
export const card_MaxX_MaximumPunkRock: Card = {
  title: 'MaxX: Maximum Punk Rock',
  flags: {
    'runner-turn-draw': true,
    'runner-phase-12': req(function*(state, side, eid, card, targets) {
      if (card.disabled) return false;
      if (coreEffects.isDisabled(state, side, card)) return false;
      const allActive = coreBoard.allActiveInstalled(state, 'runner') || [];
      return allActive.some((c: Card) => coreFlags.cardFlag?.(c, 'runner-turn-draw') === true);
    })
  },
  events: [{
    event: 'runner-turn-begins',
    prompt: msg(function*(state, side, eid, card, targets) {
      const deck = (state.runner?.deck || []);
      if (deck.length > 0) return `trash ${utils.enumerateCards(deck.slice(0, 2))} from the stack and draw 1 card`;
      return 'trash the top 2 cards from the stack and draw 1 card - but the stack is empty';
    }),
    label: 'trash and draw cards', once: 'per-turn', automatic: 'post-draw-cards', async: true,
    effect: effect(function*(state, side, eid, card, targets) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.mill('runner', 'runner', 2)], []);
      coreDrawing.draw(state, 'runner', eid, 1);
    })
  }],
  abilities: [{
    msg: msg(function*(state, side, eid, card, targets) {
      const deck = (state.runner?.deck || []);
      if (deck.length > 0) return `trash ${utils.enumerateCards(deck.slice(0, 2))} from the stack and draw 1 card`;
      return 'trash the top 2 cards from the stack and draw 1 card - but the stack is empty';
    }),
    label: 'trash and draw cards', once: 'per-turn', automatic: 'post-draw-cards', async: true,
    effect: effect(function*(state, side, eid, card, targets) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.mill('runner', 'runner', 2)], []);
      coreDrawing.draw(state, 'runner', eid, 1);
    })
  }]
};

/** Méliès U: Only the Brightest */
export const card_MeliesU_OnlyTheBrightest: Card = {
  title: 'Méliès U: Only the Brightest',
  abilities: [{
    label: 'Check chosen flip identity',
    effect: effect(function*(state, side, eid, card, targets) {
      const target = card['melies-target'];
      if (target === 'HQ') coreToasts.toast(state, 'corp', 'Tenure Floors (HQ)', 'info');
      else if (target === 'R&D') coreToasts.toast(state, 'corp', 'Subsurface Labs (R&D)', 'info');
      else if (target === 'Archives') coreToasts.toast(state, 'corp', 'Disposal Grounds (Archives)', 'info');
      else coreToasts.toast(state, 'corp', 'No flip identity specified', 'info');
    })
  }],
  events: [
    {
      event: 'pre-first-turn',
      req: req(function*(state, side, eid, card, targets) { return side === 'corp'; }),
      effect: effect(function*(state, side, eid, card, targets) {
        const options = ['HQ', 'R&D', 'Archives'];
        const shuffled = options.sort(() => Math.random() - 0.5);
        coreUpdate.update!(state, side, { ...card, face: 'front', 'melies-target': shuffled[0] });
        coreSay.systemMsg('reveals that the three hidden faces of Méliès U: Only the Brightest are: Tenure Floors: Méliès U, Subsurface Labs: Méliès U, and Disposal Grounds: Méliès U');
      })
    },
    {
      event: 'corp-turn-ends',
      prompt: 'Choose a server', interactive: true, waitingPrompt: true,
      choices: ['HQ', 'R&D', 'Archives'],
      msg: { public: 'secretly choose a server', corp: msg('secretly choose ', (t: string) => {
        const faces: Record<string, string> = { HQ: 'Tenure Floors: Méliès U', 'R&D': 'Subsurface Labs: Méliès U', Archives: 'Disposal Grounds: Méliès U' };
        return `${faces[t] || t} (${t})`;
      })},
      effect: effect(function*(state, side, eid, card, targets) {
        coreUpdate.update!(state, side, { ...card, 'melies-target': targets[0] });
      })
    },
    {
      event: 'runner-turn-ends',
      req: req(function*(state, side, eid, card, targets) { return card.face === 'front'; }),
      msg: 'gain 1 [Credit]', async: true,
      effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainCredits(state, side, eid, 1); })
    },
    {
      event: 'corp-turn-begins', silent: true,
      effect: effect(function*(state, side, eid, card, targets) {
        coreUpdate.update!(state, side, { ...card, face: 'front' });
      })
    },
    {
      event: 'successful-run',
      req: req(function*(state, side, eid, card, targets) {
        const context = (targets as any)[0]?.context || {};
        return card.face === 'front' && coreServers.isCentral(context.server || '');
      }),
      msg: msg('flip to ', (c: Card) => {
        const faces: Record<string, string> = { HQ: 'Tenure Floors: Méliès U', 'R&D': 'Subsurface Labs: Méliès U', Archives: 'Disposal Grounds: Méliès U' };
        return faces[c['melies-target']] || 'this shouldn\'t occur';
      }),
      async: true,
      effect: effect(function*(state, side, eid, card, targets) {
        const context = (targets as any)[0]?.context || {};
        const target = card['melies-target'];
        let targetZone: string, face: string;
        if (target === 'HQ') { targetZone = 'hq'; face = 'tenure'; }
        else if (target === 'R&D') { targetZone = 'rd'; face = 'subsurface'; }
        else if (target === 'Archives') { targetZone = 'archives'; face = 'disposal'; }
        else { targetZone = 'hq'; face = 'tenure'; }
        coreUpdate.update!(state, side, { ...card, face });
        const corp = (state as any).corp;
        if (context.server && Array.isArray(context.server) && context.server[0] === targetZone && corp?.deck?.length > 0) {
          continue_ability(state, side, {
            optional: {
              prompt: msg('The top card of R&D is ', (c: Card) => c.title || '', '. Trash it?'),
              waitingPrompt: true,
              changeInGameState: { silent: true, req: req(function*(state) { return (state.corp?.deck || []).length > 0; }) },
              yesAbility: {
                cost: [corePayment.toC('trash-from-deck', 1)], once: 'per-turn',
                msg: 'add 1 card from Archives to HQ', async: true,
                effect: effect(function*(state, side, eid, card, targets) {
                  continue_ability(state, side, coreDefHelpers.corpRecur, card, null);
                })
              }
            }
          }, card, null);
        } else {
          return coreEid.effectCompleted(state, side, eid);
        }
      })
    }
  ]
};

/** Mercury: Chrome Libertador */
export const card_Mercury_ChromeLibertador: Card = {
  title: 'Mercury: Chrome Libertador',
  events: [{
    event: 'breach-server', automatic: 'pre-breach',
    req: req(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      return (state as any).run && (coreEvents.runEvents(state, side, 'subroutines-broken') || []).length === 0 &&
        ['hq', 'rd'].includes(context.server || '');
    }),
    async: true,
    effect: effect(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      const breachedServer = context.server;
      continue_ability(state, side, {
        optional: {
          prompt: 'Access 1 additional card?',
          waitingPrompt: true, once: 'per-turn',
          yesAbility: {
            msg: msg('access 1 additional card'), async: true,
            effect: effect(function*(state, side, eid, card, targets) {
              coreAccess.accessBonus(state, side, breachedServer, 1, 'end-of-access');
              return coreEid.effectCompleted(state, side, eid);
            })
          },
          noAbility: { effect: effect(function*(state, side, eid, card, targets) { coreSay.systemMsg(`declines to use ${card.title} to access 1 additional card`); }) }
        }
      }, card, null);
    })
  }]
};

/** MirrorMorph: Endless Iteration */
export const card_MirrorMorph_EndlessIteration: Card = {
  title: 'MirrorMorph: Endless Iteration',
  implementation: 'Does not work with terminal Operations',
  abilities: [
    {
      prompt: 'Choose one', choices: ['Gain [Click]', 'Gain 1 [Credits]'],
      msg: msg(function*(t) { return (t || '').charAt(0).toLowerCase() + (t || '').slice(1); }),
      once: 'per-turn', label: 'Manually trigger ability', async: true,
      effect: effect(function*(state, side, eid, card, targets) {
        if (targets[0] === 'Gain [Click]') {
          coreGaining.gainClicks(state, side, 1);
          coreUpdate.update!(state, side, { ...coreCard.getCard(state, card), 'special': { ...(card as any).special, 'mm-click': true } });
          return coreEid.effectCompleted(state, side, eid);
        }
        coreGaining.gainCredits(state, side, eid, 1);
      })
    },
    {
      label: 'Manually fix Mirrormorph',
      prompt: 'Manually fix Mirrormorph',
      msg: 'manually clear Mirrormorph flags',
      effect: effect(function*(state, side, eid, card, targets) {
        coreUpdate.update!(state, side, { ...card, special: { ...(card as any).special, 'mm-actions': [] } });
        coreUpdate.update!(state, side, { ...coreCard.getCard(state, card), special: { ...(card as any).special, 'mm-click': false } });
      })
    }
  ],
  events: [
    {
      event: 'action-resolved', async: true,
      req: req(function*(state, side, eid, card, targets) { return side === 'corp'; }),
      effect: effect(function*(state, side, eid, card, targets) {
        const context = (targets as any)[0]?.context || {};
        const ctxKeys = { cid: context.card?.cid, idx: context['ability-idx'] };
        const prevActions = (card as any)?.special?.['mm-actions'] || [];
        const actions = [...prevActions, ctxKeys];
        coreUpdate.update!(state, side, { ...card, special: { ...(card as any).special, 'mm-actions': actions } });
        coreUpdate.update!(state, side, { ...coreCard.getCard(state, card), special: { ...(card as any).special, 'mm-click': false } });
        if (actions.length === 3 && new Set(actions).size === 3) {
          continue_ability(state, side, {
            prompt: 'Choose one', choices: ['Gain [Click]', 'Gain 1 [Credits]'],
            msg: msg(function*(t) { return (t || '').charAt(0).toLowerCase() + (t || '').slice(1); }),
            once: 'per-turn', label: 'Manually trigger ability', async: true,
            effect: effect(function*(state, side, eid, card, targets) {
              if (targets[0] === 'Gain [Click]') {
                coreGaining.gainClicks(state, side, 1);
                return coreEid.effectCompleted(state, side, eid);
              }
              coreGaining.gainCredits(state, side, eid, 1);
            })
          }, coreCard.getCard(state, card), null);
        }
        return coreEid.effectCompleted(state, side, eid);
      })
    },
    {
      event: 'runner-turn-begins', silent: true,
      effect: effect(function*(state, side, eid, card, targets) {
        coreUpdate.update!(state, side, { ...card, special: { ...(card as any).special, 'mm-actions': [] } });
        coreUpdate.update!(state, side, { ...coreCard.getCard(state, card), special: { ...(card as any).special, 'mm-click': false } });
      })
    },
    {
      event: 'corp-turn-ends', silent: true,
      effect: effect(function*(state, side, eid, card, targets) {
        coreUpdate.update!(state, side, { ...card, special: { ...(card as any).special, 'mm-actions': [] } });
        coreUpdate.update!(state, side, { ...coreCard.getCard(state, card), special: { ...(card as any).special, 'mm-click': false } });
      })
    }
  ],
  staticAbilities: [{
    type: 'prevent-paid-ability',
    req: req(function*(state, side, eid, card, targets) {
      const prevClick = (card as any)?.special?.['mm-click'];
      if (!prevClick) return false;
      const ctx = { cid: targets[0]?.cid, idx: targets.length > 2 ? targets[2] : undefined };
      const prevActions = (card as any)?.special?.['mm-actions'] || [];
      const actions = [...prevActions, ctx];
      return !(actions.length === 4 && new Set(actions.map((a: any) => `${a.cid}:${a.idx}`)).size === 4);
    }),
    value: true
  }]
};

/** Mti Mwekundu: Life Improved */
export const card_MtiMwekundu_LifeImproved: Card = {
  title: 'Mti Mwekundu: Life Improved',
  events: [{
    event: 'approach-server', async: true, interactive: true, waiting: 'Corp to make a decision',
    req: req(function*(state, side, eid, card, targets) {
      const corp = (state as any).corp;
      if ((corp?.hand || []).length === 0) return false;
      return !utils.usedThisTurn(state, card.cid);
    }),
    effect: effect(function*(state, side, eid, card, targets) {
      const corp = (state as any).corp;
      const hasIce = (corp?.hand || []).some((c: Card) => coreCard.ice(c));
      if (hasIce) {
        continue_ability(state, side, {
          optional: {
            prompt: 'Install a piece of ice?', once: 'per-turn',
            yesAbility: {
              prompt: 'Choose a piece of ice to install from HQ',
              choices: { card: (c: Card) => coreCard.ice(c) && coreCard.inHand(c) },
              async: true,
              msg: 'install a piece of ice from HQ at the innermost position of this server. Runner is now approaching that piece of ice',
              effect: effect(function*(state, side, eid, card, targets) {
                const run = (state as any).run;
                const targetServer = run?.server ? coreServers.centralToName(run.server) : 'hq';
                yield wait_for(state, [{ asyncResult: 'result' },
                  coreInstalling.corpInstall(state, side, targets[0], targetServer, { 'ignore-all-cost': true, front: true })], []);
                (state as any).run.position = 1;
                coreRuns.setNextPhase(state, 'approach-ice');
                coreIce.updateAllIce(state, side);
                coreIce.updateAllIcebreakers(state, side);
                continue_ability(state, side, coreDefHelpers.offerJackOut({ req: req(function*(state) { return (state as any).run?.['approached-ice?']; }) }), card, null);
              })
            }
          }
        }, card, null);
      } else {
        continue_ability(state, 'corp', {
          async: true, prompt: 'You have no piece of ice to install',
          choices: ['Carry on!'], promptType: 'bogus',
          effect: effect(function*(state, side, eid, card, targets) { return coreEid.effectCompleted(eid); })
        }, card, null);
      }
    })
  }]
};

/** MuslihaT: Multifarious Marketeer */
export const card_MuslihaT_MultifariousMarketeer: Card = {
  title: 'MuslihaT: Multifarious Marketeer',
  events: [{
    event: 'runner-turn-begins',
    req: req(function*(state, side, eid, card, targets) { return (state.runner?.deck || []).length > 0; }),
    msg: { public: 'look at the top card of the stack', runner: msg('look at ', (r: any) => (r.deck?.[0]?.title || '') || 'the top card', ' on the top of the stack') },
    async: true,
    effect: effect(function*(state, side, eid, card, targets) {
      const run = (state as any).runner;
      const topCard = run.deck?.[0];
      const isRunOrIcebreaker = topCard &&
        ((coreCard.event(topCard) && coreCard.hasSubtype(topCard, 'Run')) ||
         (coreCard.program(topCard) && coreCard.hasSubtype(topCard, 'Icebreaker')));
      if (isRunOrIcebreaker) {
        continue_ability(state, side, {
          optional: {
            prompt: `Add ${topCard.title} to the grip?`, waitingPrompt: true,
            yesAbility: {
              async: true,
              effect: effect(function*(state, side, eid, card, targets) {
                yield wait_for(state, [{ asyncResult: 'result' },
                  coreRevealing.revealLoud(state, side, card, ' and add it to the grip', topCard)], []);
                coreMoving.move(state, side, topCard, 'hand');
                return coreEid.effectCompleted(state, side, eid);
              })
            }
          }
        }, card, null);
      } else {
        continue_ability(state, side, {
          prompt: `The top card of the stack is ${topCard?.title || ''}`,
          choices: ['OK'], waitingPrompt: true, async: true
        }, card, null);
      }
    })
  }]
};

/** Nasir Meidan: Cyber Explorer */
export const card_NasirMeidan_CyberExplorer: Card = {
  title: 'Nasir Meidan: Cyber Explorer',
  events: [{
    event: 'approach-ice',
    req: req(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      const contextIce = context.ice ? coreCard.getCard(state, context.ice) : null;
      return contextIce && !coreCard.rezzed(contextIce);
    }),
    effect: effect(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      const ice = context.ice ? coreCard.getCard(state, context.ice) : null;
      const cost = coreCostFns.rezCost(state, side, ice);
      coreEngine.registerEvents(card, [{
        event: 'encounter-ice', duration: 'end-of-encounter',
        unregisterOnceResolved: true,
        req: req(function*(state, side, eid, card, targets) {
          return coreCard.sameCard(ice, context.ice ? coreCard.getCard(state, context.ice) : null);
        }),
        msg: msg('lose all credits and gain ', (n: number) => n, ' [Credits] from the rez of ', (c: Card) => c.title || ''),
        async: true,
        effect: effect(function*(state, side, eid, card, targets) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreGaining.loseCredits(state, 'runner', coreEid.makeEid(state, eid), 'all')], []);
          coreGaining.gainCredits(state, 'runner', eid, cost);
        })
      }]);
    })
  }]
};

/** Nathaniel "Gnat" Hall: One-of-a-Kind */
export const card_NathanielGnatHall_OneofaKind: Card = {
  title: 'Nathaniel "Gnat" Hall: One-of-a-Kind',
  flags: {
    'drip-economy': true,
    'runner-phase-12': req(function*(state, side, eid, card, targets) {
      if (card.disabled || coreEffects.isDisabled(state, side, card)) return false;
      const allActive = coreBoard.allActiveInstalled(state, 'runner') || [];
      return allActive.some((c: Card) => coreFlags.cardFlag?.(c, 'runner-turn-draw') === true);
    })
  },
  abilities: [{
    label: 'Gain 1 [Credits] (start of turn)', once: 'per-turn', interactive: true, async: true,
    automatic: 'pre-draw-cards',
    changeInGameState: { silent: true, req: req(function*(state, side, eid, card, targets) { return (state.runner?.hand || []).length < 3; }) },
    effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainCredits(state, 'runner', eid, 1); }),
    msg: 'gain 1 [Credits]'
  }],
  events: [{ event: 'runner-turn-begins', effect: effect(function*(state, side, eid, card, targets) {
    return coreGaining.gainCredits(state, 'runner', eid, 1);
  }) }]
};

/** NBN: Controlling the Message */
export const card_NBN_ControllingTheMessage: Card = {
  title: 'NBN: Controlling the Message',
  events: [{
    event: 'runner-trash', interactive: true, oncePerInstance: true,
    optional: {
      player: 'corp',
      req: req(function*(state, side, eid, card, targets) {
        const hasCorpInstalled = (targets as any[]).some((t: any) => {
          const context = t.context || {};
          const ctxCard = context.card ? coreCard.getCard(state, context.card) : null;
          return ctxCard && coreCard.corp(ctxCard) && coreCard.installed(ctxCard);
        });
        if (!hasCorpInstalled) return false;
        return coreEvents.firstEvent(state, side, 'runner-trash', (ctx: any) => {
          return ctx.some((t: any) => {
            const c = t.context?.card ? coreCard.getCard(state, t.context.card) : null;
            return c && coreCard.installed(c) && coreCard.corp(c);
          });
        });
      }),
      waitingPrompt: true, prompt: 'Initiate a trace with strength 4?',
      autoResolve: coreOptional.getAutoresolve('auto-fire'),
      yesAbility: {
        trace: { base: 4, successful: { msg: 'give the Runner 1 tag', async: true, effect: effect(function*(state, side, eid, card, targets) {
          coreTags.gainTags('corp', eid, 1, { unpreventable: true });
        }) } }
      }
    }
  }],
  abilities: [{ effect: effect(function*(state) { coreOptional.setAutoresolve('auto-fire', 'NBN: Controlling the Message'); }) }]
};

/** NBN: Making News */
export const card_NBN_MakingNews: Card = {
  title: 'NBN: Making News',
  recurring: 2,
  interactions: {
    'pay-credits': {
      req: req(function*(state, side, eid, card, targets) {
        return coreEid.sourceType(eid) === 'trace';
      }),
      type: 'recurring'
    }
  }
};

/** NBN: Reality Plus */
export const card_NBN_RealityPlus: Card = {
  title: 'NBN: Reality Plus',
  events: [{
    event: 'runner-gain-tag',
    req: req(function*(state, side, eid, card, targets) {
      return coreEvents.firstEvent(state, 'runner', 'runner-gain-tag');
    }),
    player: 'corp', async: true, waitingPrompt: true,
    prompt: 'Choose one',
    choices: ['Gain 2 [Credits]', 'Draw 2 cards'],
    msg: msg(function*(t) { return (t || '').charAt(0).toLowerCase() + (t || '').slice(1); }),
    effect: effect(function*(state, side, eid, card, targets) {
      if (targets[0] === 'Gain 2 [Credits]') coreGaining.gainCredits(state, 'corp', eid, 2);
      else coreDrawing.draw(state, 'corp', eid, 2);
    })
  }]
};

/** NBN: The World is Yours* */
export const card_NBN_TheWorldIsYours: Card = {
  title: 'NBN: The World is Yours*',
  staticAbilities: [coreHandSize.corpHandSizePlus(1)]
};

/** Near-Earth Hub: Broadcast Center */
export const card_NearEarthHub_BroadcastCenter: Card = {
  title: 'Near-Earth Hub: Broadcast Center',
  events: [{
    event: 'server-created',
    req: req(function*(state, side, eid, card, targets) {
      return coreEvents.firstEvent(state, 'corp', 'server-created');
    }),
    async: true, msg: 'draw 1 card',
    effect: effect(function*(state, side, eid, card, targets) { coreDrawing.draw('corp', eid, 1); })
  }]
};

/** Nebula Talent Management: Making Stars */
export const card_NebulaTalentManagement_MakingStars: Card = {
  title: 'Nebula Talent Management: Making Stars',
  abilities: [{
    label: 'Manually flip identity', msg: 'Manually flip identity', forceMenu: true,
    effect: effect(function*(state, side, eid, card, targets) {
      if (card.flipped) coreUpdate.update!(state, side, { ...card, flipped: false, face: 'front', code: (card.code || '').substring(0, 5) });
      else coreUpdate.update!(state, side, { ...card, flipped: true, face: 'back', code: (card.code || '').substring(0, 5) + 'flip' });
    })
  }],
  events: [
    {
      event: 'pre-first-turn',
      req: req(function*(state, side, eid, card, targets) { return side === 'corp'; }),
      effect: effect(function*(state, side, eid, card, targets) {
        coreUpdate.update!(state, side, { ...card, flipped: false, face: 'front' });
      })
    },
    {
      event: 'corp-turn-ends',
      req: req(function*(state, side, eid, card, targets) {
        return !coreEvents.eventCount(state, side, 'play-operation') && !card.flipped;
      }),
      msg: msg('flip [their] identity to Gemilang Arena: Burning Bright and gain 1 [Credits]'),
      async: true,
      effect: effect(function*(state, side, eid, card, targets) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, 1)], []);
        coreUpdate.update!(state, side, { ...card, flipped: true, face: 'back', code: (card.code || '').substring(0, 5) + 'flip' });
      })
    },
    {
      event: 'successful-run',
      req: req(function*(state, side, eid, card, targets) {
        const context = (targets as any)[0]?.context || {};
        const server = context.targetServer;
        return (server === 'rd' || server === 'hq') && card.flipped;
      }),
      msg: msg('flip [their] identity to Nebula Talent Management: Making Stars'),
      async: true,
      effect: effect(function*(state, side, eid, card, targets) {
        coreUpdate.update!(state, side, { ...card, flipped: false, face: 'front', code: (card.code || '').substring(0, 5) });
      })
    },
    {
      event: 'play-operation-resolved',
      req: req(function*(state, side, eid, card, targets) {
        const context = (targets as any)[0]?.context || {};
        const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
        return coreEvents.firstEvent(state, side, 'play-operation-resolved') &&
          !coreCard.hasSubtype(contextCard, 'Terminal') && card.flipped;
      }),
      interactive: true, msg: msg('gain [click]'),
      effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainClicks(state, 'corp', 1); })
    }
  ]
};

/** Nero Severn: Information Broker */
export const card_NeroSevern_InformationBroker: Card = {
  title: 'Nero Severn: Information Broker',
  events: [{
    event: 'encounter-ice', skippable: true,
    optional: coreDefHelpers.offerJackOut({
      req: req(function*(state, side, eid, card, targets) {
        const context = (targets as any)[0]?.context || {};
        const ice = context.ice ? coreCard.getCard(state, context.ice) : null;
        return ice && coreCard.hasSubtype(ice, 'Sentry');
      }),
      once: 'per-turn'
    })
  }]
};

/** New Angeles Sol: Your News */
export const card_NewAngelesSol_YourNews: Card = {
  title: 'New Angeles Sol: Your News',
  events: [
    {
      event: 'agenda-scored',
      optional: {
        prompt: 'Play a Current?', player: 'corp',
        req: req(function*(state, side, eid, card, targets) {
          const corp = (state as any).corp;
          return [...(corp?.hand || []), ...(corp?.discard || []), ...(corp?.current || [])].some((c: Card) => coreCard.hasSubtype(c, 'Current'));
        }),
        yesAbility: {
          prompt: 'Choose a Current to play from HQ or Archives',
          showDiscard: true, async: true,
          choices: { card: (c: Card) => coreCard.hasSubtype(c, 'Current') && coreCard.corp(c) && (coreCard.inHand(c) || coreCard.inDiscard(c)) },
          msg: msg('play a current from ', (c: Card) => coreServers.nameZone('Corp', coreCard.getZone(c)) || ''),
          effect: effect(function*(state, side, eid, card, targets) { corePlayInstants.playInstant(eid, targets[0]); })
        }
      }
    },
    {
      event: 'agenda-stolen',
      optional: {
        prompt: 'Play a Current?', player: 'corp',
        req: req(function*(state, side, eid, card, targets) {
          const corp = (state as any).corp;
          return [...(corp?.hand || []), ...(corp?.discard || []), ...(corp?.current || [])].some((c: Card) => coreCard.hasSubtype(c, 'Current'));
        }),
        yesAbility: {
          prompt: 'Choose a Current to play from HQ or Archives',
          showDiscard: true, async: true,
          choices: { card: (c: Card) => coreCard.hasSubtype(c, 'Current') && coreCard.corp(c) && (coreCard.inHand(c) || coreCard.inDiscard(c)) },
          msg: msg('play a current from ', (c: Card) => coreServers.nameZone('Corp', coreCard.getZone(c)) || ''),
          effect: effect(function*(state, side, eid, card, targets) { corePlayInstants.playInstant(eid, targets[0]); })
        }
      }
    }
  ]
};

/** NEXT Design: Guarding the Net */
export const card_NEXTDesign_GuardingTheNet: Card = {
  title: 'NEXT Design: Guarding the Net',
  events: [{
    event: 'pre-first-turn',
    req: req(function*(state, side, eid, card, targets) { return side === 'corp'; }),
    msg: 'install up to 3 pieces of ice and draw back up to 5 cards',
    async: true,
    effect: effect(function*(state, side, eid, card, targets) {
      const ndHelper = function(n: number, st: GameState) {
        return {
          prompt: msg('When finished, click ', (c: Card) => c.title || '', ' to draw back up to 5 cards in HQ. Choose a piece of ice in HQ to install'),
          choices: { card: (c: Card) => coreCard.corp(c) && coreCard.ice(c) && coreCard.inHand(c) },
          async: true,
          effect: effect(function*(st2, s2, e2, c2, t2) {
            yield wait_for(st2, [{ asyncResult: 'result' },
              coreInstalling.corpInstall(st2, s2, e2, t2[0], null, { msgKeys: { 'install-source': c2, 'display-origin': true } })], []);
            if (n < 3) continue_ability(st2, s2, ndHelper(n + 1, st2), c2, null);
          })
        };
      };
      yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.resolveAbility(state, side, ndHelper(1, state), card, null)], []);
      coreUpdate.update!(state, side, { ...card, 'fill-hq': true });
      return coreEid.effectCompleted(state, side, eid);
    })
  }],
  abilities: [{
    req: req(function*(state, side, eid, card, targets) { return card['fill-hq']; }),
    label: 'draw remaining cards',
    msg: msg('draw ', (n: number) => utils.quantify(5 - (state.corp?.hand || []).length, 'card')),
    async: true,
    effect: effect(function*(state, side, eid, card, targets) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.draw(state, side, 5 - (state.corp?.hand || []).length, { suppressEvent: true })], []);
      coreUpdate.update!(state, side, { ...card, 'fill-hq': undefined });
      (state as any).turnEvents = null;
      return coreEid.effectCompleted(state, side, eid);
    })
  }]
};

/** Nisei Division: The Next Generation */
export const card_NiseiDivision_TheNextGeneration: Card = {
  title: 'Nisei Division: The Next Generation',
  events: [{
    event: 'reveal-spent-credits',
    req: req(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      return context['corp-credits'] != null && context['runner-credits'] != null;
    }),
    msg: 'gain 1 [Credits]', async: true,
    effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainCredits('corp', eid, 1); })
  }]
};

/** Noise: Hacker Extraordinaire */
export const card_Noise_HackerExtraordinaire: Card = {
  title: 'Noise: Hacker Extraordinaire',
  events: [{
    event: 'runner-install', async: true, interactive: true,
    req: req(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
      return contextCard && coreCard.hasSubtype(contextCard, 'Virus');
    }),
    msg: 'force the Corp to trash the top card of R&D',
    effect: effect(function*(state, side, eid, card, targets) { coreMoving.mill('corp', eid, 'corp', 1); })
  }]
};

/** Null: Whistleblower */
export const card_Null_Whistleblower: Card = {
  title: 'Null: Whistleblower',
  events: [{
    event: 'encounter-ice', skippable: true,
    optional: {
      req: req(function*(state, side, eid, card, targets) { return (state.runner?.hand || []).length > 0; }),
      prompt: 'Trash a card in the grip to lower the strength of encountered ice by 2?',
      once: 'per-turn',
      yesAbility: {
        prompt: 'Choose a card to trash',
        choices: { card: (c: Card) => coreCard.inHand(c) },
        msg: msg('trash ', (c: Card) => c.title || '', ' from the grip to lower the strength of ', (c: Card) => c.title || '', ' by 2 for the remainder of the run'),
        async: true,
        effect: effect(function*(state, side, eid, card, targets) {
          const currentIce = coreIce.getCurrentIce(state);
          coreEffects.registerLingeringEffect(card, {
            type: 'ice-strength', duration: 'end-of-run',
            req: req(function*(state, side, eid, card, targets) { return coreCard.sameCard(currentIce, targets[0]); }),
            value: -2
          });
          coreIce.updateAllIce();
          coreMoving.trash(eid, targets[0], { unpreventable: true });
        })
      }
    }
  }]
};

/** Nuvem SA: Law of the Land */
export const card_NuvemSA_LawOfTheLand: Card = {
  title: 'Nuvem SA: Law of the Land',
  events: [
    {
      event: 'expend-resolved',
      req: req(function*(state, side, eid, card, targets) {
        return (state as any).activePlayer === 'corp' &&
          (targets as any)[0]?.zone?.[0] === 'deck' &&
          coreEvents.firstEvent(state, side, 'corp-trash', (ctx: any) => {
            const c = ctx[0]?.card ? coreCard.getCard(state, ctx[0].card) : null;
            return c && c.zone?.[0] === 'deck';
          });
      }),
      msg: 'gain 2 [Credits]', async: true,
      effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainCredits('corp', eid, 2); })
    },
    {
      event: 'play-operation-resolved',
      req: req(function*(state, side, eid, card, targets) {
        return (state as any).activePlayer === 'corp' &&
          (targets as any)[0]?.zone?.[0] === 'deck' &&
          coreEvents.firstEvent(state, side, 'corp-trash', (ctx: any) => {
            const c = ctx[0]?.card ? coreCard.getCard(state, ctx[0].card) : null;
            return c && c.zone?.[0] === 'deck';
          });
      }),
      msg: 'gain 2 [Credits]', async: true,
      effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainCredits('corp', eid, 2); })
    },
    {
      event: 'corp-trash',
      req: req(function*(state, side, eid, card, targets) {
        return (state as any).activePlayer === 'corp' &&
          (targets as any)[0]?.zone?.[0] === 'deck' &&
          coreEvents.firstEvent(state, side, 'corp-trash', (ctx: any) => {
            const c = ctx[0]?.card ? coreCard.getCard(state, ctx[0].card) : null;
            return c && c.zone?.[0] === 'deck';
          });
      }),
      msg: 'gain 2 [Credits]', async: true,
      effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainCredits('corp', eid, 2); })
    }
  ]
};

/** Nyusha "Sable" Sintashta: Symphonic Prodigy */
export const card_NyushaSableSintashta_SymphonicProdigy: Card = {
  title: 'Nyusha "Sable" Sintashta: Symphonic Prodigy',
  events: [
    coreMark.markChangedEvent,
    { ...coreMark.identifyMarkAbility, event: 'runner-turn-begins' },
    {
      event: 'successful-run', automatic: 'gain-clicks', interactive: true,
      req: req(function*(state, side, eid, card, targets) {
        const context = (targets as any)[0]?.context || {};
        return context['marked-server'] && coreEvents.firstEvent(state, side, 'successful-run', (ctx: any) => ctx[0]?.['marked-server']);
      }),
      msg: 'gain [Click]',
      effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainClicks(1); })
    }
  ]
};

/** Ob Superheavy Logistics: Extract. Export. Excel. */
export const card_ObSuperheavyLogistics_ExtractExportExcel: Card = {
  title: 'Ob Superheavy Logistics: Extract. Export. Excel.',
  implementation: 'note - we ensure the card can be installed (asset/upgrade/ice)',
  abilities: [{
    label: 'Always pause at start of turn',
    effect: effect(function*(state, side, eid, card, targets) {
      const helper = coreChooseOne.chooseOneHelper({ label: 'Always pause at start of turn' }, [
        { option: 'Always pause at turn start', ability: { effect: effect(function*(st, s, e, c, t) {
          coreUpdate.update!(st, s, { ...c, special: { ...(c as any).special, 'pause-at-phase-12': true } });
          coreToasts.toast(st, 'corp', 'The game will always pause at the start of the turn');
        }) }},
        { option: 'Only if triggered by cards in play', ability: { effect: effect(function*(st, s, e, c, t) {
          coreUpdate.update!(st, s, { ...c, special: (c as any).special ? { ...(c as any).special } : {}, 'pause-at-phase-12': undefined });
          coreToasts.toast(st, 'corp', 'The game only pause at turn start if triggered by cards in play');
        }) }}
      ]);
      continue_ability(state, side, helper, card, null);
    })
  }],
  flags: { 'corp-phase-12': req(function*(state, side, eid, card, targets) { return (card as any).special?.['pause-at-phase-12']; }) },
  events: [{
    event: 'corp-trash',
    req: req(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
      return contextCard && coreCard.installed(contextCard) && !context['during-installation'] && coreCard.rezzed(contextCard) &&
        !utils.usedThisTurn(state, card.cid);
    }),
    async: true, interactive: true,
    effect: effect(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0] || {};
      const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
      const targetCost = (coreCard.cost(contextCard) || 0) - 1;
      const obAbility: any = {
        optional: {
          prompt: targetCost >= 0 ? `Install a ${targetCost}-cost card from your deck?` : `Shuffle your deck (search for a ${targetCost}-cost card from your deck?)`,
          once: 'per-turn', waitingPrompt: true,
          yesAbility: {
            msg: msg('search R&D for a ', (n: number) => n.toString(), '-cost card'),
            async: true,
            effect: effect(function*(state, side, eid, card, targets) {
              if (targetCost >= 0) {
                continue_ability(state, side, {
                  prompt: 'Choose a card to install and rez',
                  choices: {
                    req: req(function*(state, side, eid, card, targets) {
                      const deck = (state.corp?.deck || []);
                      const valid = deck.filter((c: Card) => (coreCard.asset(c) || coreCard.upgrade(c) || coreCard.ice(c)) && coreCard.cost(c) === targetCost);
                      return valid.includes(targets[0]) || targets[0] === 'Done';
                    })
                  },
                  msg: 'shuffle R&D', async: true,
                  effect: effect(function*(state, side, eid, card, targets) {
                    if (targets[0] === 'Done') return coreEid.effectCompleted(state, side, eid);
                    coreShuffling.shuffle(state, side, 'deck');
                    const addCosts = coreCostFns.rezAdditionalCostBonus(state, side, targets[0], (c: any) => c.cost?.type !== 'credit');
                    const instTarget = targets[0];
                    if (addCosts.length > 0 && corePayment.canPay(state, side, coreCard.getTitle(instTarget) || '', addCosts)) {
                      continue_ability(state, side, {
                        optional: {
                          prompt: `Rez ${coreCard.getTitle(instTarget)}, paying additional costs?`,
                          yesAbility: {
                            msg: msg('rez ', (c: Card) => c.title || '', ', paying additional costs'), async: true,
                            effect: effect(function*(st, s, e, c, t) {
                              coreInstalling.corpInstall(st, s, e, t[0], null, { 'ignore-all-cost': true, 'no-warning': true, 'install-state': 'rezzed-no-rez-cost' });
                            })
                          },
                          noAbility: { msg: 'install a card from R&D ignoring all credit costs', async: true,
                            effect: effect(function*(st, s, e, c, t) {
                              coreInstalling.corpInstall(st, s, e, t[0], null, { 'ignore-all-cost': true, 'no-warning': true });
                            })
                          }
                        }
                      }, card, null);
                    } else if (addCosts.length > 0) {
                      continue_ability(state, side, { msg: 'install a card from R&D without paying additional costs to rez', async: true,
                        effect: effect(function*(st, s, e, c, t) {
                          coreInstalling.corpInstall(st, s, e, t[0], null, { 'ignore-all-cost': true, 'no-warning': true });
                        })
                      }, card, null);
                    } else {
                      yield wait_for(state, [{ asyncResult: 'result' }, coreRevealing.reveal(state, side, targets[0])], []);
                      coreInstalling.corpInstall(state, side, eid, coreCard.getCard(state, targets[0]), null, { 'ignore-all-cost': true, 'no-warning': true, 'install-state': 'rezzed-no-rez-cost' });
                    }
                  })
                }, card, null);
              } else {
                continue_ability(state, side, { msg: 'shuffle R&D', effect: effect(function*(st, s, e, c, t) { coreShuffling.shuffle('corp', 'deck'); }) }, card, null);
              }
            })
          },
          noAbility: { effect: effect(function*(st, s, e, c, t) { coreSay.systemMsg(`declines to use ${c.title}`); }) }
        }
      };
      const targetCost = (coreCard.cost(coreCard.getCard(state, (targets as any)[0]?.card)) || 0) - 1;
      continue_ability(state, side, obAbility, card, null);
    })
  }]
};

/** Omar Keung: Conspiracy Theorist */
export const card_OmarKeung_ConspiracyTheorist: Card = {
  title: 'Omar Keung: Conspiracy Theorist',
  abilities: [coreDefHelpers.runServerAbility('archives', {
    action: true, cost: [corePayment.toC('click', 1)], once: 'per-turn',
    events: [{
      event: 'pre-successful-run', interactive: true, duration: 'end-of-run',
      unregisterOnceResolved: true,
      req: req(function*(state, side, eid, card, targets) {
        const run = (state as any).run;
        return run && run.server && coreServers.centralToName(run.server) === 'archives';
      }),
      prompt: 'Choose one',
      choices: ['HQ', 'R&D'],
      msg: msg('change the attacked server to ', (t: string) => t),
      effect: effect(function*(state, side, eid, card, targets) {
        const targetServer = targets[0] === 'HQ' ? 'hq' : 'rd';
        (state as any).run.server = [targetServer];
      })
    }]
  })]
};

/** Nova Initiumia: Catalyst & Impetus */
export const card_NovaInitiumia_CatalystImpetus: Card = { title: 'Nova Initiumia: Catalyst & Impetus' };

/** Pālanā Foods: Sustainable Growth */
export const card_PalanaFoods_SustainableGrowth: Card = {
  title: 'Pālanā Foods: Sustainable Growth',
  events: [{
    event: 'runner-draw',
    req: req(function*(state, side, eid, card, targets) {
      return coreEvents.firstEvent(state, 'corp', 'runner-draw') && (targets as any)[0]?.count > 0;
    }),
    msg: 'gain 1 [Credits]', async: true, automatic: 'gain-credits',
    effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainCredits('corp', eid, 1); })
  }]
};

/** Poétrï Luxury Brands: All the Rage */
export const card_PoetriLuxuryBrands_AllTheRage: Card = {
  title: 'Poétrï Luxury Brands: All the Rage',
  events: [
    {
      event: 'agenda-stolen', interactive: true, skippable: true, async: true,
      prompt: 'Install a non-agenda from HQ?',
      changeInGameState: { silent: true, req: req(function*(state) { return (state.corp?.hand || []).length > 0; }) },
      waitingPrompt: true,
      choices: { card: (c: Card) => coreCard.corp(c) && coreCard.inHand(c) && !coreCard.agenda(c) && !coreCard.operation(c) },
      effect: effect(function*(state, side, eid, card, targets) {
        coreInstalling.corpInstall(state, side, eid, targets[0], null, { msgKeys: { 'install-source': card } });
      })
    },
    {
      event: 'agenda-scored', skippable: true, interactive: true,
      optional: {
        prompt: 'Look at the top 3 cards of R&D?',
        req: req(function*(state, side, eid, card, targets) { return (state.corp?.deck || []).length > 0; }),
        yesAbility: {
          async: true, msg: msg('look at the top 3 cards of R&D'),
          effect: effect(function*(state, side, eid, card, targets) {
            const top3 = (state.corp?.deck || []).slice(0, 3);
            continue_ability(state, side, coreChooseOne.chooseOneHelper({ prompt: msg('The top of R&D is (in order): ', (c: Card[]) => utils.enumerateCards(c)), optional: true },
              top3.filter((c: Card) => !coreCard.operation(c) && !coreCard.agenda(c)).map((c: Card) => ({
                option: `Install ${c.title}`,
                ability: { async: true, waitingPrompt: true, effect: effect(function*(st, s, e, c, t) {
                  const targetPosition = utils.positions((x: Card) => coreCard.sameCard(x, c), top3)[0];
                  coreInstalling.corpInstall(st, s, e, c, null, { msgKeys: { 'install-source': c, 'origin-index': targetPosition, 'display-origin': true } });
                }) }
              }))), card, null);
          })
        }
      }
    }
  ]
};

/** Pravdivost Consulting: Political Solutions */
export const card_PravdivostConsulting_PoliticalSolutions: Card = {
  title: 'Pravdivost Consulting: Political Solutions',
  events: [{
    event: 'successful-run', skippable: true,
    req: req(function*(state, side, eid, card, targets) { return coreEvents.firstEvent(state, side, 'successful-run'); }),
    interactive: true, async: true, waitingPrompt: true,
    prompt: 'Choose a card that can be advanced to place 1 advancement counter on',
    choices: { req: req(function*(state, side, eid, card, targets) { return coreCard.installed(targets[0]) && coreCard.canBeAdvanced(state, targets[0]); }) },
    msg: { public: msg('place 1 advancement counter on ', (c: Card) => coreToString.cardStr(state, c) || ''), corp: msg('place 1 advancement counter on ', (c: Card) => coreToString.cardStr(state, c, { maybeVisible: true }) || '') },
    effect: effect(function*(state, side, eid, card, targets) { coreProps.addProp('corp', eid, targets[0], 'advance-counter', 1, { placed: true }); })
  }]
};

/** PT Untaian: Life's Building Blocks */
export const card_PTUntaian_LifesBuildingBlocks: Card = {
  title: "PT Untaian: Life's Building Blocks",
  events: [{
    event: 'corp-turn-ends', interactive: true, skippable: true,
    req: req(function*(state, side, eid, card, targets) { return (state.corp?.hand || []).length <= 3; }),
    changeInGameState: { silent: true, req: req(function*(state) {
      return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => !coreCard.rezzed(c) || coreCard.canBeAdvanced(state, c));
    })},
    prompt: 'Pay 1 [Credits]: place 1 advancement counter on an unrezzed advanceable card?',
    waitingPrompt: true,
    choices: { req: req(function*(state, side, eid, card, targets) {
      return coreCard.installed(targets[0]) && !coreCard.rezzed(targets[0]) && coreCard.canBeAdvanced(state, targets[0]);
    })},
    cost: [corePayment.toC('credit', 1)], async: true,
    msg: { public: msg('place 1 advancement counter on ', (c: Card) => coreToString.cardStr(state, c) || ''), corp: msg('place 1 advancement counter on ', (c: Card) => coreToString.cardStr(state, c, { maybeVisible: true }) || '') },
    effect: effect(function*(state, side, eid, card, targets) {
      coreProps.addProp(state, side, eid, targets[0], 'advance-counter', 1, { placed: true });
    })
  }]
};

/** Quetzal: Free Spirit */
export const card_Quetzal_FreeSpirit: Card = {
  title: 'Quetzal: Free Spirit',
  abilities: [Object.assign(coreIce.breakSub(null, 1, 'Barrier', { repeatable: false }), { once: 'per-turn' })]
};

/** Reina Roja: Freedom Fighter */
export const card_ReinaRoja_FreedomFighter: Card = {
  title: 'Reina Roja: Freedom Fighter',
  staticAbilities: [{
    type: 'rez-cost',
    req: req(function*(state, side, eid, card, targets) {
      if (!coreCard.ice(targets[0]) || coreCard.rezzed(targets[0])) return false;
      const triggered = coreEvents.eventCount(state, 'runner', 'rez', (ctx: any) => {
        const c = ctx.card ? coreCard.getCard(state, ctx.card) : null;
        return c && coreCard.ice(c);
      });
      return triggered === 0;
    }),
    value: 1
  }],
  events: [{
    event: 'rez',
    req: req(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
      if (!contextCard || !coreCard.ice(contextCard)) return false;
      const triggered = coreEvents.eventCount(state, 'runner', 'rez', (ctx: any) => {
        const c = ctx.card ? coreCard.getCard(state, ctx.card) : null;
        return c && coreCard.ice(c);
      });
      return triggered <= 1;
    }),
    msg: msg('increased the rez cost of ', (c: Card) => c.title || '', ' by 1 [Credits]')
  }]
};

/** René "Loup" Arcemont: Party Animal */
export const card_ReneLoupArcemont_PartyAnimal: Card = {
  title: 'René "Loup" Arcemont: Party Animal',
  events: [{
    event: 'runner-trash',
    req: req(function*(state, side, eid, card, targets) {
      if (!(targets as any)[0]?.context?.accessed) return false;
      return coreEvents.firstEvent(state, side, 'runner-trash', (ctx: any) => ctx.some((t: any) => t.context?.accessed));
    }),
    async: true, msg: 'gain 1 [Credits] and draw 1 card',
    effect: effect(function*(state, side, eid, card, targets) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, 'runner', 1, { suppressCheckpoint: true })], []);
      coreGaining.gainCredits(state, 'runner', eid, 1);
    })
  }]
};

/** Rielle "Kit" Peddler: Transhuman */
export const card_RielleKitPeddler_Transhuman: Card = {
  title: 'Rielle "Kit" Peddler: Transhuman',
  events: [{
    event: 'encounter-ice',
    req: req(function*(state, side, eid, card, targets) {
      return coreEvents.firstEvent(state, side, 'encounter-ice');
    }),
    msg: msg('make ', (c: Card) => c.title || '', ' gain Code Gate until the end of the run'),
    effect: effect(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      const ice = context.ice ? coreCard.getCard(state, context.ice) : null;
      coreEffects.registerLingeringEffect(card, {
        type: 'gain-subtype', duration: 'end-of-run',
        req: req(function*(state, side, eid, card, targets) { return coreCard.sameCard(ice, targets[0]); }),
        value: 'Code Gate'
      });
    })
  }]
};

/** Ryō "Phoenix" Ōno: Out of the Ashes */
export const card_RyoPhoenixOno_OutOfTheAshes: Card = {
  title: 'Ryō "Phoenix" Ōno: Out of the Ashes',
  events: [{
    event: 'successful-run',
    req: req(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      const fired = context['subroutines-fired'] || 0;
      if (fired <= 0) return false;
      return coreEvents.firstEvent(state, side, 'successful-run', (ctx: any) => (ctx[0]?.['subroutines-fired'] || 0) > 0);
    }),
    interactive: true, automatic: 'force-discard',
    msg: 'gain 1 [Credits]', async: true, once: 'per-turn',
    effect: effect(function*(state, side, eid, card, targets) {
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
export const card_SaraswatiMnemonics_EndlessExploration: Card = {
  title: 'Saraswati Mnemonics: Endless Exploration',
  abilities: [{
    action: true, async: true, label: 'Install a card from HQ',
    cost: [corePayment.toC('click', 1), corePayment.toC('credit', 1)],
    changeInGameState: { req: req(function*(state) { return (state.corp?.hand || []).length > 0; }) },
    prompt: 'Choose a card to install from HQ',
    choices: { card: (c: Card) => (coreCard.asset(c) || coreCard.agenda(c) || coreCard.upgrade(c)) && coreCard.corp(c) && coreCard.inHand(c) },
    msg: msg('install a card in a remote server and place 1 advancement counter on it'),
    effect: effect(function*(state, side, eid, card, targets) {
      const chosen = targets[0];
      continue_ability(state, side, {
        prompt: 'Choose a remote server',
        choices: [...coreBoard.getRemoteNames(state), 'New remote'],
        async: true,
        effect: effect(function*(state2, side2, eid2, card2, t2) {
          const tgtcid = chosen.cid;
          coreFlags.registerPersistentFlag!(state2, side2, card2, 'can-rez', (st, _, c) => c.cid === tgtcid ? false : true);
          coreFlags.registerTurnFlag!(state2, side2, card2, 'can-score', (st, _, c) => {
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
    effect: effect(function*(state, side, eid, card, targets) {
      coreFlags.clearPersistentFlag!(state, side, card, 'can-rez');
    })
  }]
};

/** Sebastião Souza Pessoa: Activist Organizer */
export const card_SebastiaoSouzaPessoa_ActivistOrganizer: Card = {
  title: 'Sebastião Souza Pessoa: Activist Organizer',
  staticAbilities: [{
    type: 'basic-ability-additional-trash-cost',
    req: req(function*(state, side, eid, card, targets) {
      return coreCard.resource(targets[0]) && coreCard.hasSubtype(targets[0], 'Connection') && side === 'corp';
    }),
    value: [corePayment.toC('trash-from-hand', 1)]
  }],
  events: [{
    event: 'runner-gain-tag', async: true,
    req: req(function*(state, side, eid, card, targets) {
      if (coreInstalling.installLocked(state, side)) return false;
      const context = (targets as any)[0]?.context || {};
      return context.amount === (coreTags.countTags(state) || 0);
    }),
    prompt: 'Choose a connection to install, paying 2 [Credits] less',
    choices: {
      req: req(function*(state, side, eid, card, targets) {
        const cost = coreCostFns.installCost(state, side, targets[0], { 'cost-bonus': -2 }) - 2;
        return coreCard.hasSubtype(targets[0], 'Connection') && coreCard.resource(targets[0]) &&
          coreCard.inHandStar(state, targets[0]) &&
          corePayment.canPay(state, side, { ...eid, source: card, sourceType: 'runner-install' }, targets[0], null, [corePayment.toC('credit', cost)]);
      })
    },
    effect: effect(function*(state, side, eid, card, targets) {
      coreInstalling.runnerInstall(state, side, { ...eid, source: card, sourceType: 'runner-install' }, targets[0], {
        'cost-bonus': -2, msgKeys: { 'display-origin': true, 'install-source': card }
      });
    })
  }]
};

/** Seidr Laboratories: Destiny Defined */
export const card_SeidrLaboratories_DestinyDefined: Card = {
  title: 'Seidr Laboratories: Destiny Defined',
  implementation: 'Manually triggered',
  abilities: [{
    req: req(function*(state, side, eid, card, targets) {
      const run = (state as any).run;
      return run && (state.corp?.discard || []).length > 0;
    }),
    label: 'add card from Archives to R&D during a run', once: 'per-turn',
    prompt: 'Choose a card to add to the top of R&D', showDiscard: true,
    choices: { card: (c: Card) => coreCard.corp(c) && coreCard.inDiscard(c) },
    effect: effect(function*(state, side, eid, card, targets) {
      coreMoving.move(targets[0], 'deck', { front: true });
    }),
    msg: msg('add ', (c: Card) => c.seen ? c.title : 'a card', ' to the top of R&D')
  }]
};

/** Silhouette: Stealth Operative */
export const card_Silhouette_StealthOperative: Card = {
  title: 'Silhouette: Stealth Operative',
  events: [{
    event: 'successful-run', skippable: true,
    interactive: req(function*(state, side, eid, card, targets) {
      return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => !coreCard.rezzed(c));
    }),
    async: true,
    req: req(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      return context.targetServer === 'hq' && coreEvents.firstSuccessfulRunOnServer(state, 'hq');
    }),
    choices: { card: (c: Card) => coreCard.installed(c) && !coreCard.rezzed(c) },
    effect: effect(function*(state, side, eid, card, targets) { coreExpose.expose(eid, [targets[0]]); })
  }]
};

/** Skorpios Defense Systems: Persuasive Power */
export const card_SkorpiosDefenseSystems_PersuasivePower: Card = {
  title: 'Skorpios Defense Systems: Persuasive Power',
  implementation: 'Switch between Manual, "Smart", and Automatic resolution by using the ability on the card',
  events: [
    {
      event: 'pre-first-turn',
      req: req(function*(state, side, eid, card, targets) { return side === 'corp'; }),
      effect: effect(function*(state, side, eid, card, targets) {
        coreUpdate.update!(state, side, { ...card, special: { ...(card as any).special, 'resolution-mode': 'Smart' } });
        coreToasts.toast(state, 'corp', 'Set Skorpios resolution to Smart mode');
        coreUpdate.update!(state, side, { ...coreCard.getCard(state, card), 'card-target': 'Smart' });
      })
    },
    {
      event: 'pre-trash-interrupt',
      once: 'per-turn', player: 'corp', waitingPrompt: true,
      req: req(function*(state, side, eid, card, targets) {
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
      choices: (state, side, eid, card, targets) => corePrompts.cancellable((targets as any)[0]?.cards || []),
      msg: msg('remove ', (c: Card) => c.title || '', ' from the game'),
      async: true,
      effect: effect(function*(state, side, eid, card, targets) {
        coreMoving.move(state, 'runner', targets[0], 'rfg');
        return coreEid.effectCompleted(state, side, eid);
      })
    }
  ],
  abilities: [{
    label: 'Set resolution mode',
    effect: effect(function*(state, side, eid, card, targets) {
      const helper = coreChooseOne.chooseOneHelper({ optional: true, label: 'Set resolution mode' },
        ['Manual', 'Smart', 'Automatic'].map((x: string) => ({ option: x, ability: { effect: effect(function*(st, s, e, c, t) {
          coreUpdate.update!(st, s, { ...c, special: { ...(c as any).special, 'resolution-mode': x } });
          coreToasts.toast(st, 'corp', `Set Skorpios resolution to ${x} mode`);
          coreUpdate.update!(st, s, { ...coreCard.getCard(st, c), 'card-target': x });
        }) } })));
      continue_ability(state, side, helper, card, null);
    })
  }, {
    label: 'Remove a card in the Heap that was just trashed from the game',
    waitingPrompt: true, prompt: 'Choose a card in the Heap that was just trashed', once: 'per-turn',
    choices: (state) => corePrompts.cancellable((state.runner?.discard || []) as Card[]),
    msg: msg('remove ', (c: Card) => c.title || '', ' from the game'),
    effect: effect(function*(state, side, eid, card, targets) { coreMoving.move(state, 'runner', targets[0], 'rfg'); })
  }]
};

/** Spark Agency: Worldswide Reach */
export const card_SparkAgency_WorldswideReach: Card = {
  title: 'Spark Agency: Worldswide Reach',
  events: [{
    event: 'rez',
    req: req(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
      return contextCard && coreCard.hasSubtype(contextCard, 'Advertisement') &&
        coreEvents.firstEvent(state, 'corp', 'rez', (ctx: any) => {
          const c = ctx.card ? coreCard.getCard(state, ctx.card) : null;
          return c && coreCard.hasSubtype(c, 'Advertisement');
        });
    }),
    async: true, effect: effect(function*(state, side, eid, card, targets) { coreGaining.loseCredits('runner', eid, 1); }),
    msg: 'make the Runner lose 1 [Credits]'
  }]
};

/** Sportsmetal: Go Big or Go Home */
export const card_Sportsmetal_GoBigOrGoHome: Card = {
  title: 'Sportsmetal: Go Big or Go Home',
  events: [
    {
      event: 'agenda-scored',
      prompt: 'Choose one', waitingPrompt: true, player: 'corp',
      choices: ['Gain 2 [Credits]', 'Draw 2 cards'],
      msg: msg(function*(t) { return (t || '').charAt(0).toLowerCase() + (t || '').slice(1); }),
      async: true, interactive: true,
      effect: effect(function*(state, side, eid, card, targets) {
        if (targets[0] === 'Gain 2 [Credits]') coreGaining.gainCredits(state, 'corp', eid, 2);
        else coreDrawing.draw(state, 'corp', eid, 2);
      })
    },
    {
      event: 'agenda-stolen',
      prompt: 'Choose one', waitingPrompt: true, player: 'corp',
      choices: ['Gain 2 [Credits]', 'Draw 2 cards'],
      msg: msg(function*(t) { return (t || '').charAt(0).toLowerCase() + (t || '').slice(1); }),
      async: true, interactive: true,
      effect: effect(function*(state, side, eid, card, targets) {
        if (targets[0] === 'Gain 2 [Credits]') coreGaining.gainCredits(state, 'corp', eid, 2);
        else coreDrawing.draw(state, 'corp', eid, 2);
      })
    }
  ]
};

/** SSO Industries: Fueling Innovation */
export const card_SSOIndustries_FuelingInnovation: Card = {
  title: 'SSO Industries: Fueling Innovation',
  events: [{
    event: 'corp-turn-ends',
    optional: {
      req: req(function*(state, side, eid, card, targets) {
        const installed = (coreBoard.allInstalled(state, 'corp') || []).filter((c: Card) => coreCard.agenda(c) && coreCard.faceup(c));
        const selectableIce = (coreBoard.allInstalled(state, 'corp') || []).filter((c: Card) =>
          coreCard.ice(c) && coreCard.installed(c) && (coreCard.getCounters(c, 'advancement') || 0) === 0);
        return installed.length > 0 && selectableIce.length > 0;
      }),
      waitingPrompt: true, prompt: 'Place advancement counters on an installed piece of ice?',
      autoResolve: coreOptional.getAutoresolve('auto-fire'),
      yesAbility: {
        async: true,
        effect: effect(function*(state, side, eid, card, targets) {
          const installed = (coreBoard.allInstalled(state, 'corp') || []).filter((c: Card) => coreCard.agenda(c) && coreCard.faceup(c));
          const agendaPoints = installed.reduce((sum, c) => sum + (c.agendapoints || 0), 0);
          continue_ability(state, side, {
            prompt: `Choose a piece of ice with no advancement counters to place ${utils.quantify(agendaPoints, 'advancement counter')} on`,
            choices: { card: (c: Card) => coreCard.ice(c) && coreCard.installed(c) && (coreCard.getCounters(c, 'advancement') || 0) === 0 },
            msg: msg('place ', (n: number) => utils.quantify(n, 'advancement counter'), ' on ', (c: Card) => coreToString.cardStr(state, c) || ''),
            async: true,
            effect: effect(function*(state, side, eid, card, targets) {
              coreProps.addProp(eid, targets[0], 'advance-counter', agendaPoints, { placed: true });
            })
          }, card, null);
        })
      }
    }
  }],
  abilities: [{ effect: effect(function*(state) { coreOptional.setAutoresolve('auto-fire', 'SSO Industries: Fueling Innovation'); }) }]
};

/** Steve Cambridge: Master Grifter */
export const card_SteveCambridge_MasterGrifter: Card = {
  title: 'Steve Cambridge: Master Grifter',
  events: [{
    event: 'successful-run', skippable: true,
    optional: {
      req: req(function*(state, side, eid, card, targets) {
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
        effect: effect(function*(state, side, eid, card, targets) {
          const c1 = targets[0], c2 = targets[1];
          continue_ability(state, side, {
            waitingPrompt: true, prompt: 'Choose which card to remove from the game', player: 'corp',
            choices: [c1, c2],
            msg: msg(function*(chosen: Card, other: Card) {
              return `add ${other.title} from the heap to the grip. Corp removes ${chosen.title} from the game`;
            }),
            effect: effect(function*(state, side, eid, card, targets) {
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
  abilities: [{ effect: effect(function*(state) { coreOptional.setAutoresolve('auto-fire', 'Steve Cambridge: Master Grifter'); }) }]
};

/** Strategic Innovations: Future Forward */
export const card_StrategicInnovations_FutureForward: Card = {
  title: 'Strategic Innovations: Future Forward',
  events: [
    { event: 'pre-start-game', effect: effect(function*(state) { draftPointsTarget(state); }) },
    {
      event: 'runner-turn-ends',
      req: req(function*(state, side, eid, card, targets) {
        if (card.disabled || coreEffects.isDisabled(state, side, card)) return false;
        return hasMostFaction(state, 'corp', 'Haas-Bioroid');
      }),
      async: true,
      effect: effect(function*(state, side, eid, card, targets) {
        if ((state.corp?.discard || []).length === 0) {
          coreShuffling.shuffleCardsIntoDeck!(state, 'corp', card, []);
          return coreEid.effectCompleted(state, side, eid);
        }
        continue_ability(state, side, {
          prompt: 'Choose a card in Archives to shuffle into R&D',
          choices: { card: (c: Card) => coreCard.corp(c) && coreCard.inDiscard(c), all: true },
          player: 'corp', showDiscard: true,
          effect: effect(function*(state, side, eid, card, targets) {
            coreShuffling.shuffleCardsIntoDeck!(state, 'corp', card, [targets[0]]);
          })
        }, card, null);
      })
    }
  ]
};

/** Sunny Lebeau: Security Specialist */
export const card_SunnyLebeau_SecuritySpecialist: Card = { title: 'Sunny Lebeau: Security Specialist' };

/** SYNC: Everything, Everywhere */
export const card_SYNC_Everywhere: Card = {
  title: 'SYNC: Everything, Everywhere',
  staticAbilities: [
    {
      type: 'card-ability-cost',
      req: req(function*(state, side, eid, card, targets) {
        return !card['sync-flipped'] && coreCard.sameCard((targets as any)[0], (state.runner as any)?.['basic-action-card']) &&
          (card as any)['ability']?.label === 'Remove 1 tag';
      }),
      value: corePayment.toC('credit', 1)
    },
    {
      type: 'card-ability-cost',
      req: req(function*(state, side, eid, card, targets) {
        return card['sync-flipped'] && coreCard.sameCard((targets as any)[0], (state.corp as any)?.['basic-action-card']) &&
          (card as any)['ability']?.label === 'Trash 1 resource if the Runner is tagged';
      }),
      value: corePayment.toC('credit', -2)
    }
  ],
  abilities: [{
    action: true, cost: [corePayment.toC('click', 1)],
    effect: effect(function*(state, side, eid, card, targets) {
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
export const card_SynapseGlobal_FasterThanThought: Card = {
  title: 'Synapse Global: Faster than Thought',
  events: [{
    event: 'runner-lose-tag',
    req: req(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      if (!context.amount || context.amount <= 0) return false;
      return coreEvents.firstEvent(state, side, 'runner-lose-tag', (ctx: any) => (ctx[0]?.context?.amount || 0) > 0);
    }),
    prompt: 'Reveal and install a card from HQ?',
    changeInGameState: { req: req(function*(state) { return (state.corp?.hand || []).length > 0; }), silent: true },
    choices: { req: req(function*(state, side, eid, card, targets) {
      return coreCard.corp(targets[0]) && coreCard.inHand(targets[0]) && !coreCard.operation(targets[0]);
    })},
    async: true,
    effect: effect(function*(state, side, eid, card, targets) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRevealing.revealLoud(state, side, card, null, [targets[0]])], []);
      coreInstalling.corpInstall(state, side, eid, targets[0], null, { 'ignore-install-cost': true, msgKeys: { 'install-source': card } });
    })
  }],
  abilities: [{
    label: 'Gain 2 [Credits]', action: true, async: true,
    cost: [corePayment.toC('tag', 1), corePayment.toC('click', 1)],
    effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainCredits(state, side, eid, 2); })
  }]
};

/** Synthetic Systems: The World Re-imagined */
export const card_SyntheticSystems_TheWorldReimagined: Card = {
  title: 'Synthetic Systems: The World Re-imagined',
  events: [
    { event: 'pre-start-game', effect: effect(function*(state) { draftPointsTarget(state); }) },
    {
      event: 'corp-turn-begins',
      optional: {
        req: req(function*(state, side, eid, card, targets) {
          return hasMostFaction(state, 'corp', 'Jinteki') &&
            (coreBoard.allInstalled(state, 'corp') || []).filter((c: Card) => coreCard.ice(c)).length >= 2;
        }),
        prompt: 'Swap two ice?', waitingPrompt: true,
        yesAbility: {
          prompt: 'Choose 2 installed pieces of ice to swap', label: 'swap 2 installed pieces of ice',
          choices: { card: (c: Card) => coreCard.installed(c) && coreCard.ice(c), max: 2, all: true },
          once: 'per-turn',
          effect: effect(function*(state, side, eid, card, targets) { coreMoving.swapIce(state, side, targets[0], targets[1]); }),
          msg: msg('swap the positions of ', (c: Card) => coreToString.cardStr(state, c) || '', ' and ', (c: Card) => coreToString.cardStr(state, c) || '')
        }
      }
    }
  ],
  flags: { 'corp-phase-12': req(function*(state, side, eid, card, targets) {
    const gc = coreCard.getCard(state, card);
    if (gc?.disabled || coreEffects.isDisabled(state, side, card)) return false;
    return hasMostFaction(state, 'corp', 'Jinteki') &&
      (coreBoard.allInstalled(state, 'corp') || []).filter((c: Card) => coreCard.ice(c)).length >= 2;
  })},
  abilities: [{
    prompt: 'Choose 2 installed pieces of ice to swap', label: 'swap 2 installed pieces of ice',
    choices: { card: (c: Card) => coreCard.installed(c) && coreCard.ice(c), max: 2, all: true },
    once: 'per-turn',
    effect: effect(function*(state, side, eid, card, targets) { coreMoving.swapIce(state, side, targets[0], targets[1]); }),
    msg: msg('swap the positions of ', (c: Card) => coreToString.cardStr(state, c) || '', ' and ', (c: Card) => coreToString.cardStr(state, c) || '')
  }]
};

/** Tāo Salonga: Telepresence Magician */
export const card_TaoSalonga_TelepresenceMagician: Card = {
  title: 'Tāo Salonga: Telepresence Magician',
  events: [
    {
      event: 'agenda-scored',
      interactive: true,
      changeInGameState: { silent: true, req: req(function*(state) { return (coreBoard.allInstalled(state, 'corp') || []).filter((c: Card) => coreCard.ice(c)).length >= 2; }) },
      optional: {
        prompt: 'Swap 2 pieces of ice?', waitingPrompt: true,
        yesAbility: {
          prompt: 'Choose 2 pieces of ice',
          choices: { req: req(function*(state, side, eid, card, targets) { return coreCard.installed(targets[0]) && coreCard.ice(targets[0]); }), max: 2, all: true },
          msg: msg('swap the positions of ', (c: Card) => coreToString.cardStr(state, c) || '', ' and ', (c: Card) => coreToString.cardStr(state, c) || ''),
          effect: effect(function*(state, side, eid, card, targets) { coreMoving.swapIce(state, side, targets[0], targets[1]); })
        },
        noAbility: { effect: effect(function*(state, side, eid, card, targets) { coreSay.systemMsg(`declines to use ${card.title}`); }) }
      }
    },
    {
      event: 'agenda-stolen',
      interactive: true,
      changeInGameState: { silent: true, req: req(function*(state) { return (coreBoard.allInstalled(state, 'corp') || []).filter((c: Card) => coreCard.ice(c)).length >= 2; }) },
      optional: {
        prompt: 'Swap 2 pieces of ice?', waitingPrompt: true,
        yesAbility: {
          prompt: 'Choose 2 pieces of ice',
          choices: { req: req(function*(state, side, eid, card, targets) { return coreCard.installed(targets[0]) && coreCard.ice(targets[0]); }), max: 2, all: true },
          msg: msg('swap the positions of ', (c: Card) => coreToString.cardStr(state, c) || '', ' and ', (c: Card) => coreToString.cardStr(state, c) || ''),
          effect: effect(function*(state, side, eid, card, targets) { coreMoving.swapIce(state, side, targets[0], targets[1]); })
        },
        noAbility: { effect: effect(function*(state, side, eid, card, targets) { coreSay.systemMsg(`declines to use ${card.title}`); }) }
      }
    }
  ]
};

/** Tennin Institute: The Secrets Within */
export const card_TenninInstitute_TheSecretsWithin: Card = {
  title: 'Tennin Institute: The Secrets Within',
  events: [{
    msg: msg('place 1 advancement token on ', (c: Card) => coreToString.cardStr(state, c) || ''),
    label: 'Place 1 advancement token on a card if the Runner did not make a successful run last turn',
    choices: { card: (c: Card) => coreCard.installed(c) },
    event: 'corp-turn-begins',
    req: req(function*(state, side, eid, card, targets) { return coreEvents.notLastTurn(state, 'runner', 'successful-run'); }),
    waitingPrompt: true, once: 'per-turn', async: true, interactive: true,
    effect: effect(function*(state, side, eid, card, targets) {
      coreProps.addProp(eid, targets[0], 'advance-counter', 1, { placed: true });
    })
  }]
};

/** The Catalyst: Convention Breaker */
export const card_TheCatalyst_ConventionBreaker: Card = { title: 'The Catalyst: Convention Breaker' };

/** The Collective: Williams, Wu, et al. */
export const card_TheCollective_WilliamsWu: Card = {
  title: 'The Collective: Williams, Wu, et al.',
  events: [{
    event: 'action-resolved',
    req: req(function*(state, side, eid, card, targets) { return side === 'runner'; }),
    silent: true, async: true,
    effect: effect(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      const currentQueue = (card as any)?.special?.['previous-actions'] || [];
      const filteredContext = { cid: context.card?.cid, idx: context['ability-idx'] };
      if (currentQueue && currentQueue.length > 0 && JSON.stringify(currentQueue[0]) === JSON.stringify(filteredContext)) {
        const newQueue = [...currentQueue, filteredContext];
        coreUpdate.update!(state, side, { ...card, special: { ...(card as any).special, 'previous-actions': newQueue } });
        if (newQueue.length === 3) {
          continue_ability(state, side, { label: 'Manually gain [Click]', once: 'per-turn', msg: msg('gain [Click]'),
            effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainClicks(state, side, 1); }) }, card, null);
        }
        return coreEid.effectCompleted(state, side, eid);
      } else {
        coreUpdate.update!(state, side, { ...card, special: { ...(card as any).special, 'previous-actions': [filteredContext] } });
        return coreEid.effectCompleted(state, side, eid);
      }
    })
  }, {
    event: 'runner-turn-begins', silent: true,
    effect: effect(function*(state, side, eid, card, targets) {
      coreUpdate.update!(state, side, { ...card, special: { ...(card as any).special, 'previous-actions': null } });
    })
  }]
};

/** The Foundry: Refining the Process */
export const card_TheFoundry_RefiningTheProcess: Card = {
  title: 'The Foundry: Refining the Process',
  events: [{
    event: 'rez',
    optional: {
      prompt: msg('Add another copy of ', (c: Card) => c.title || '', ' to HQ?'),
      req: req(function*(state, side, eid, card, targets) {
        const context = (targets as any)[0]?.context || {};
        const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
        return contextCard && coreCard.ice(contextCard) && coreEvents.firstEvent(state, 'runner', 'rez', (ctx: any) => {
          const c = ctx.card ? coreCard.getCard(state, ctx.card) : null;
          return c && coreCard.ice(c);
        });
      }),
      yesAbility: {
        effect: effect(function*(state, side, eid, card, targets) {
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
export const card_TheMasque_CyberGeneral: Card = {
  title: 'The Masque: Cyber General',
  events: [{ event: 'pre-start-game', effect: effect(function*(state) { draftPointsTarget(state); }) }]
};

/** The Outfit: Family Owned and Operated */
export const card_TheOutfit_FamilyOwnedAndOperated: Card = {
  title: 'The Outfit: Family Owned and Operated',
  events: [{
    event: 'corp-gain-bad-publicity', msg: 'gain 3 [Credit]', async: true,
    effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainCredits(eid, 3); })
  }]
};

/** The Professor: Keeper of Knowledge */
export const card_TheProfessor_KeeperOfKnowledge: Card = { title: 'The Professor: Keeper of Knowledge' };

/** The Shadow: Pulling the Strings */
export const card_TheShadow_PullingTheStrings: Card = {
  title: 'The Shadow: Pulling the Strings',
  events: [{ event: 'pre-start-game', effect: effect(function*(state) { draftPointsTarget(state); }) }]
};

/** The Syndicate: Profit over Principle */
export const card_TheSyndicate_ProfitOverPrinciple: Card = { title: 'The Syndicate: Profit over Principle' };

/** The Zwicky Group: Invisible Hands */
export const card_TheZwickyGroup_InvisibleHands: Card = {
  title: 'The Zwicky Group: Invisible Hands',
  events: [{
    event: 'corp-credit-gain', async: true,
    req: req(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      const source = context.source ? coreCard.getCard(state, context.source) : null;
      return (source && coreCard.agenda(source)) || (source && coreCard.operation(source)) &&
        coreEvents.firstEvent(state, side, 'corp-credit-gain', (ctx: any) => {
          const s = ctx[0]?.source ? coreCard.getCard(state, ctx[0].source) : null;
          return s && (coreCard.agenda(s) || coreCard.operation(s));
        });
    }),
    effect: effect(function*(state, side, eid, card, targets) { coreDrawing.maybeDraw(eid, card, 1); })
  }]
};

/** Thule Subsea: Safety Below */
export const card_ThuleSubsea_SafetyBelow: Card = {
  title: 'Thule Subsea: Safety Below',
  events: [{
    event: 'agenda-stolen', async: true,
    effect: effect(function*(state, side, eid, card, targets) {
      continue_ability(state, side, {
        prompt: 'Choose one', player: 'runner',
        choices: [
          (corePayment.canPay(state, 'runner', eid, card, null, [corePayment.toC('credit', 2), corePayment.toC('click', 1)])) ? 'Pay [Click] and 2 [Credits]' : null,
          'Suffer 1 core damage'
        ].filter(Boolean) as string[],
        async: true, waitingPrompt: true,
        msg: msg(function*(t: string) {
          if (t === 'Pay [Click] and 2 [Credits]') return 'force the runner to ' + t.toLowerCase();
          return 'do 1 core damage';
        }),
        effect: effect(function*(state, side, eid, card, targets) {
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
export const card_ThunderboltArmaments_PeaceThroughPower: Card = {
  title: 'Thunderbolt Armaments: Peace Through Power',
  events: [{
    event: 'rez',
    req: req(function*(state, side, eid, card, targets) {
      const run = (state as any).run;
      if (!run) return false;
      const context = (targets as any)[0]?.context || {};
      const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
      return contextCard && coreCard.ice(contextCard) &&
        (coreCard.hasSubtype(contextCard, 'AP') || coreCard.hasSubtype(contextCard, 'Destroyer'));
    }),
    msg: msg('give ', (c: Card) => coreToString.cardStr(state, c) || '', ' +1 strength and "End the run unless the Runner trashes 1 of their installed cards" after its other subroutines'),
    async: true,
    effect: effect(function*(state, side, eid, card, targets) {
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
        msg: msg(function*(t: string) {
          return t === 'End the run' ? 'end the run' : 'force the runner to ' + t.toLowerCase();
        }),
        effect: effect(function*(state, side, eid, card, targets) {
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
        req: req(function*(state, side, eid, card, targets) {
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
export const card_TitanTransnational_InvestingInYourFuture: Card = {
  title: 'Titan Transnational: Investing In Your Future',
  events: [{
    event: 'agenda-scored',
    msg: msg('place 1 agenda counter on ', (c: Card) => c.title || ''),
    async: true,
    effect: effect(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
      coreProps.addCounter(eid, contextCard, 'agenda', 1, null);
    })
  }]
};

/** Topan: Ormas Leader */
export const card_Topan_OrmasLeader: Card = {
  title: 'Topan: Ormas Leader',
  abilities: [{
    cost: [corePayment.toC('click', 1)], action: true, once: 'per-turn', async: true,
    prompt: 'Install a card, paying 2 [Credits] less', waitingPrompt: true,
    choices: { req: req(function*(state, side, eid, card, targets) {
      return coreCard.inHandStar(state, targets[0]) &&
        (coreCard.hardware(targets[0]) || coreCard.resource(targets[0]) || coreCard.program(targets[0])) &&
        coreInstalling.runnerCanPayAndInstall(state, side, eid, targets[0], { 'cost-bonus': -2 });
    })},
    label: 'Install 1 card from your grip, paying 2{c} less. When you install that card, suffer 1 meat damage.',
    effect: effect(function*(state, side, eid, card, targets) {
      const evs = coreEngine.registerEvents(state, side, card, [{
        event: 'runner-install', unregisterOnceResolved: true, async: true, interactive: true,
        msg: 'suffer 1 meat damage',
        effect: effect(function*(state, side, eid, card, targets) { coreDamage.damage(state, side, eid, 'meat', 1); })
      }]);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreInstalling.runnerInstall(state, side, targets[0], { 'cost-bonus': -2, msgKeys: { 'include-cost-from-eid': eid, 'install-source': card } })], []);
      coreEngine.unregisterEventByUuid(state, side, evs[0].uuid);
      return coreEid.effectCompleted(state, side, eid);
    })
  }]
};

/** Valencia Estevez: The Angel of Cayambe */
export const card_ValenciaEstevez_TheAngelOfCayambe: Card = {
  title: 'Valencia Estevez: The Angel of Cayambe',
  events: [{
    event: 'pre-start-game',
    req: req(function*(state, side, eid, card, targets) {
      return side === 'runner' && (state.corp?.badPublicity || 0) === 0;
    }),
    effect: effect(function*(state, side, eid, card, targets) {
      coreGaining.gain('corp', 'bad-publicity', 1);
    })
  }]
};

/** Virtual Intelligence, P.I.: "You Can Call Me Vic" */
export const card_VirtualIntelligence_PICallMeVic: Card = {
  title: 'Virtual Intelligence, P.I.: "You Can Call Me Vic"',
  abilities: [{
    cost: [corePayment.toC('click', 1), corePayment.toC('credit', 1)], action: true, once: 'per-turn',
    label: 'Draw 1 card and remove 1 tag.',
    msg: msg(function*(tagged: boolean) { return tagged ? 'draw 1 card and remove 1 tag' : 'draw 1 card'; }),
    async: true,
    changeInGameState: { req: req(function*(state, side, eid, card, targets) {
      return utils.isTagged?.(state) ?? false || (state.runner?.deck || []).length > 0;
    })},
    effect: effect(function*(state, side, eid, card, targets) {
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
export const card_WeylandConsortium_BecauseWeBuiltIt: Card = {
  title: 'Weyland Consortium: Because We Built It',
  recurring: 1,
  interactions: {
    'pay-credits': {
      req: req(function*(state, side, eid, card, targets) {
        const abTarget = coreEid.getAbilityTargets(eid);
        return coreCard.ice(abTarget) &&
          (coreEid.sourceType(eid) === 'advance' || coreEid.isBasicAdvanceAction(eid));
      }),
      type: 'recurring'
    }
  }
};

/** Weyland Consortium: Builder of Nations */
export const card_WeylandConsortium_BuilderOfNations: Card = {
  title: 'Weyland Consortium: Builder of Nations',
  implementation: '[Erratum] The first time an encounter with a piece of ice with at least 1 advancement counter ends each turn, do 1 meat damage.',
  events: [{
    event: 'end-of-encounter', async: true,
    req: req(function*(state, side, eid, card, targets) {
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
    effect: effect(function*(state, side, eid, card, targets) { coreDamage.damage(eid, 'meat', 1, { card }); })
  }]
};

/** Weyland Consortium: Building a Better World */
export const card_WeylandConsortium_BuildingABetterWorld: Card = {
  title: 'Weyland Consortium: Building a Better World',
  events: [{
    event: 'play-operation',
    req: req(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
      return contextCard && coreCard.hasSubtype(contextCard, 'Transaction');
    }),
    msg: 'gain 1 [Credits]', async: true,
    effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainCredits(eid, 1); })
  }]
};

/** Weyland Consortium: Built to Last */
export const card_WeylandConsortium_BuiltToLast: Card = {
  title: 'Weyland Consortium: Built to Last',
  events: [{
    event: 'advance', async: true,
    req: req(function*(state, side, eid, card, targets) {
      const context = (targets as any)[0]?.context || {};
      const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
      if (!contextCard) return false;
      const adv = coreCard.getCounters(contextCard, 'advancement') || 0;
      const amount = context.amount || 0;
      return adv - amount <= 0;
    }),
    msg: 'gain 2 [Credits]',
    effect: effect(function*(state, side, eid, card, targets) { coreGaining.gainCredits(state, 'corp', eid, 2); })
  }]
};

/** Whizzard: Master Gamer */
export const card_Whizzard_MasterGamer: Card = {
  title: 'Whizzard: Master Gamer',
  recurring: 3,
  interactions: {
    'pay-credits': {
      req: req(function*(state, side, eid, card, targets) {
        return coreEid.sourceType(eid) === 'runner-trash-corp-cards' && coreCard.corp(targets[0]);
      }),
      type: 'recurring'
    }
  }
};

/** Wyvern: Chemically Enhanced */
export const card_Wyvern_ChemicallyEnhanced: Card = {
  title: 'Wyvern: Chemically Enhanced',
  events: [
    { event: 'pre-start-game', effect: effect(function*(state) { draftPointsTarget(state); }) },
    {
      event: 'runner-trash', interactive: true,
      req: req(function*(state, side, eid, card, targets) {
        return hasMostFaction(state, 'runner', 'Anarch') && coreCard.corp((targets as any)[0]?.card || {});
      }),
      effect: effect(function*(state, side, eid, card, targets) {
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
export const card_ZahyaSadeghi_VersatileSmuggler: Card = {
  title: 'Zahya Sadeghi: Versatile Smuggler',
  events: [{
    event: 'run-ends',
    optional: {
      req: req(function*(state, side, eid, card, targets) {
        const context = (targets as any)[0]?.context || {};
        const server = context.server || '';
        const accessed = coreRuns.totalCardsAccessed(context);
        return ['hq', 'rd'].includes(server) && accessed > 0;
      }),
      prompt: 'Gain 1 [Credits] for each card you accessed?', once: 'per-turn',
      yesAbility: {
        msg: msg('gain ', (n: number) => n.toString(), ' [Credits]'), once: 'per-turn', async: true,
        effect: effect(function*(state, side, eid, card, targets) {
          const context = (targets as any)[0]?.context || {};
          const accessed = coreRuns.totalCardsAccessed(context);
          coreGaining.gainCredits(state, 'runner', eid, accessed);
        })
      }
    }
  }]
};
