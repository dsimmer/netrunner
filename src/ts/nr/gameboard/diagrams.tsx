// Diagram panes: turn timing and run timing reference charts.
// Mirrors: src/cljs/nr/gameboard/diagrams.cljs
import React from "react";
import { trElement, tr } from "../translations";
import { renderIcons } from "../utils";

const BULLET_LETTERS = "abcdefghi";

function Bullet({ tag, trVec }: { tag: number; trVec: [string, string] }): React.ReactElement {
  const letter = BULLET_LETTERS[tag];
  return (
    <div>
      <td>
        <label>{letter + ") "}</label>
      </td>
      <td>
        <div data-i18n-key={trVec[0]}>{renderIcons(tr(trVec))}</div>
      </td>
    </div>
  );
}

export function TurnTimingPane(): React.ReactElement {
  return (
    <div className="diagram">
      <section>{trElement("h3", ["diagrams_turn_corp-turn", "Corporation Turn"])}</section>
      <section>
        {trElement("h4", ["diagrams_turn_corp-draw-phase", "5.6.1: Draw Phase"])}
        <Bullet tag={0} trVec={["diagrams_turn_corp-draw-phase-a", "Corporation gains allotted clicks (default: [click][click][click])"]} />
        <Bullet tag={1} trVec={["diagrams_turn_corp-draw-phase-b", "Paid ability window. Corp may rez non-ice cards or score agendas during this window"]} />
        <Bullet tag={2} trVec={["diagrams_turn_corp-draw-phase-c", "Corporation recurring credits refill"]} />
        <Bullet tag={3} trVec={["diagrams_turn_corp-draw-phase-d", "The turn formally begins. Turn begins events resolve"]} />
        <Bullet tag={4} trVec={["diagrams_turn_corp-draw-phase-e", "The corporation performs their mandatory draw"]} />
        <Bullet tag={5} trVec={["diagrams_turn_corp-draw-phase-f", "Proceed to the action phase (5.6.2)"]} />
      </section>
      <section>
        {trElement("h4", ["diagrams_turn_corp-action-phase", "5.6.2: Action Phase"])}
        <Bullet tag={0} trVec={["diagrams_turn_corp-action-phase-a", "Paid ability window. Corp may rez non-ice cards or score agendas during this window"]} />
        <Bullet tag={1} trVec={["diagrams_turn_corp-action-phase-b", "If the corporation has unspent [Clicks], they take an action"]} />
        <Bullet tag={2} trVec={["diagrams_turn_corp-action-phase-c", "If an action occured, return to (a)"]} />
        <Bullet tag={3} trVec={["diagrams_turn_corp-action-phase-d", "The action phase is complete. Proceed to the discard phase (5.6.3)"]} />
      </section>
      <section>
        {trElement("h4", ["diagrams_turn_corp-discard-phase", "5.6.3: Discard phase"])}
        <Bullet tag={0} trVec={["diagrams_turn_corp-discard-phase-a", "The corporation discards to maximum hand size, if applicable"]} />
        <Bullet tag={1} trVec={["diagrams_turn_corp-discard-phase-b", "Paid ability window. Corp may rez non-ice cards during this window"]} />
        <Bullet tag={2} trVec={["diagrams_turn_corp-discard-phase-c", "If the corporation has any [Clicks] remaining, they lose those [Clicks]"]} />
        <Bullet tag={3} trVec={["diagrams_turn_corp-discard-phase-d", "The Corporations turn formally ends. Turn end triggers resolve"]} />
        <Bullet tag={4} trVec={["diagrams_turn_corp-discard-phase-e", "Proceed to the Runner turn"]} />
      </section>

      <section>{trElement("h3", ["diagrams_turn_runner-turn", "Runner Turn"])}</section>
      <section>
        {trElement("h4", ["diagrams_turn_runner-action-phase", "5.7.1: Action Phase"])}
        <Bullet tag={0} trVec={["diagrams_turn_runner-action-phase-a", "Runner gains allotted clicks (default: [click][click][click][click])"]} />
        <Bullet tag={1} trVec={["diagrams_turn_runner-action-phase-b", "Paid ability window. Corp may rez non-ice cards"]} />
        <Bullet tag={2} trVec={["diagrams_turn_runner-action-phase-c", "Runner recurring credits refill"]} />
        <Bullet tag={3} trVec={["diagrams_turn_runner-action-phase-d", "The turn formally begins. Turn begins events resolve"]} />
        <Bullet tag={4} trVec={["diagrams_turn_runner-action-phase-e", "Paid ability window. Corp may rez non-ice cards"]} />
        <Bullet tag={5} trVec={["diagrams_turn_runner-action-phase-f", "If the Runner has unspent [Clicks], they take an action"]} />
        <Bullet tag={6} trVec={["diagrams_turn_runner-action-phase-g", "If an action occured, return to (e)"]} />
        <Bullet tag={7} trVec={["diagrams_turn_runner-action-phase-h", "The action phase is complete. Proceed to the discard phase (5.7.2)"]} />
      </section>
      <section>
        {trElement("h4", ["diagrams_turn_runner-discard-phase", "5.7.2: Discard Phase"])}
        <Bullet tag={0} trVec={["diagrams_turn_runner-discard-phase-a", "The runner discards to maximum handsize, if applicable"]} />
        <Bullet tag={1} trVec={["diagrams_turn_runner-discard-phase-b", "Paid ability window. Corp may rez non-ice cards"]} />
        <Bullet tag={2} trVec={["diagrams_turn_runner-discard-phase-c", "If the runner has any [Clicks] remaining, they lose those [Clicks]"]} />
        <Bullet tag={3} trVec={["diagrams_turn_runner-discard-phase-d", "The Runners turn formally ends. Turn end triggers resolve"]} />
        <Bullet tag={4} trVec={["diagrams_turn_runner-discard-phase-e", "Proceed to the Corporation turn"]} />
      </section>
    </div>
  );
}

export function RunTimingPane(): React.ReactElement {
  return (
    <div className="diagram">
      <section>
        {trElement("h3", ["diagrams_run-timing_header", "Timing Structure of a Run"])}
        {trElement("div", ["diagrams_run-timing_disclaimer", "This structure has been simplified for clarity. For complete rules, see the Null Signal Games website."])}
      </section>
      <section>
        {trElement("h4", ["diagrams_run-timing_initiation", "6.9.1: Initiation Phase"])}
        <Bullet tag={0} trVec={["diagrams_run-timing_initiation-a", "Runner declares a server"]} />
        <Bullet tag={1} trVec={["diagrams_run-timing_initiation-b", "Runner gains Bad Publicity credits"]} />
        <Bullet tag={2} trVec={["diagrams_run-timing_initiation-c", "Run formally begins - Run events fire"]} />
        <Bullet tag={3} trVec={["diagrams_run-timing_initiation-c-2", "Paid Ability Window. Corp may rez non-ice cards during this window."]} />
        <Bullet tag={4} trVec={["diagrams_run-timing_initiation-d", "Proceed to the outermost ice, if applicable, and begin the approach phase (6.9.2)"]} />
        <Bullet tag={5} trVec={["diagrams_run-timing_initiation-e", "Otherwise, proceed to the movement phase (6.9.4)"]} />
      </section>
      <section>
        {trElement("h4", ["diagrams_run-timing_approach", "6.9.2: Approach Ice Phase"])}
        <Bullet tag={0} trVec={["diagrams_run-timing_approach-a", "You are now approaching the ice. Approach events resolve"]} />
        <Bullet tag={1} trVec={["diagrams_run-timing_approach-b", "Paid Ability Window. Corp may rez the approached ice, or non-ice cards, during this window"]} />
        <Bullet tag={2} trVec={["diagrams_run-timing_approach-c", "If approached ice is rezzed, continue to encounter phase (6.9.3)"]} />
        <Bullet tag={3} trVec={["diagrams_run-timing_approach-d", "Otherwise, proceed to the movement phase (6.9.4)"]} />
      </section>
      <section>
        {trElement("h4", ["diagrams_run-timing_encounter", "6.9.3: Encounter Ice Phase"])}
        <Bullet tag={0} trVec={["diagrams_run-timing_encounter-a", "You are now encountering this ice. Encounter events resolve"]} />
        <Bullet tag={1} trVec={["diagrams_run-timing_encounter-b", "Paid ability window. Encountered ice may be interfaced during this window"]} />
        <Bullet tag={2} trVec={["diagrams_run-timing_encounter-c", "If there are unbroken subroutines to resolve, the corporation resolves the topmost unbroken subroutine. If they do, repeat this step"]} />
        <Bullet tag={3} trVec={["diagrams_run-timing_encounter-d", "The encounter is complete. Proceed to the movement phase (6.9.4)"]} />
      </section>
      <section>
        {trElement("h4", ["diagrams_run-timing_movement", "6.9.4: Movement Phase"])}
        <Bullet tag={0} trVec={["diagrams_run-timing_movement-a", "If you were encountering or approaching an ice, you pass it. Pass-Ice events resolve"]} />
        <Bullet tag={1} trVec={["diagrams_run-timing_movement-b", "If there are no more ice inwards from the passed ice, 'when you pass all ice on the server' events resolve"]} />
        <Bullet tag={2} trVec={["diagrams_run-timing_movement-c", "Paid ability window"]} />
        <Bullet tag={3} trVec={["diagrams_run-timing_movement-d", "The runner may jack out. If they do, proceed to the run ends phase (6.9.6)"]} />
        <Bullet tag={4} trVec={["diagrams_run-timing_movement-e", "The runner proceeds to the next position inwards, if applicable"]} />
        <Bullet tag={5} trVec={["diagrams_run-timing_movement-f", "Paid ability window. The corporation may rez non-ice cards"]} />
        <Bullet tag={6} trVec={["diagrams_run-timing_movement-g", "If you are approaching another ice, return to the approach ice phase (6.9.2)"]} />
        <Bullet tag={7} trVec={["diagrams_run-timing_movement-h", "The runner approaches the attacked server. Approach events resolve"]} />
        <Bullet tag={8} trVec={["diagrams_run-timing_movement-i", "Continue to the success phase (6.9.5)"]} />
      </section>
      <section>
        {trElement("h4", ["diagrams_run-timing_success", "6.9.5: Success Phase"])}
        <Bullet tag={0} trVec={["diagrams_run-timing_success-a", "The run is declared successful. Successful run events are met"]} />
        <Bullet tag={1} trVec={["diagrams_run-timing_success-b", "The runner breaches the attacked server"]} />
        <Bullet tag={2} trVec={["diagrams_run-timing_success-c", "The success phase is complete. Continue to the run ends phase (6.9.6)"]} />
      </section>
      <section>
        {trElement("h4", ["diagrams_run-timing_run-ends", "6.9.6: Run Ends Phase"])}
        <Bullet tag={0} trVec={["diagrams_run-timing_run-ends-a", "Any open priority windows complete or are closed"]} />
        <Bullet tag={1} trVec={["diagrams_run-timing_run-ends-b", "The runner loses any unspent bad publicity credits"]} />
        <Bullet tag={2} trVec={["diagrams_run-timing_run-ends-c", "If the success phase was not reached and the server still exists, the run becomes unsuccessful"]} />
        <Bullet tag={3} trVec={["diagrams_run-timing_run-ends-d", "The run ends. Run ends events resolve"]} />
      </section>
    </div>
  );
}

export default RunTimingPane;
