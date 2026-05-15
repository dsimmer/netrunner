
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
