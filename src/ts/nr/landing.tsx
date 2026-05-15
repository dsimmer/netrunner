// Landing / welcome page.
// Mirrors: src/cljs/nr/landing.cljs
import React from "react";

export default function LandingPage(): React.ReactElement {
  return (
    <div className="container">
      <div className="home-bg" />
      <div className="page-container">
        <div className="worlds2020" />
        <div className="landing-message">
          <h4>
            Visit{" "}
            <a href="https://www.nearearthhub.net/" target="_blank" rel="noreferrer">
              nearearthhub.net
            </a>{" "}
            for links to rules and other resources
          </h4>
          <div className="landing panel content-page blue-shade">
            <h2>Welcome!</h2>
            <p>
              This website is for the facilitation of Netrunner games online. Please note
              that jinteki.net may not provide a complete implementation of the rules of the game.
            </p>
            <h4>Making Jinteki.net better:</h4>
            <p>
              Jinteki.net is the product of voluntary contributions made by many individuals.
              If you wish to make Jinteki.net better, found a bug and need to report an issue,
              or just like reading code, simply visit our{" "}
              <a href="https://github.com/mtgred/netrunner" target="_blank" rel="noreferrer">
                Github
              </a>{" "}
              page.
            </p>
            <h4>The use of Jinteki.net:</h4>
            <ul className="list compact">
              <li>
                Please be respectful. Any disrespectful conduct will not be tolerated
                regardless of the circumstance or rationale.
              </li>
              <li>
                There are many deck archetypes and playstyles in Netrunner. All are valid and
                should be respected. If you do not wish to play against a certain deck or
                playstyle please write it in the game title. If the game has already started,
                politely explain to your opponent and concede the game.
              </li>
              <li>
                The global chat tab should only be used for Netrunner-related discussion and
                for trying to reach out to users who may have disconnected.
              </li>
            </ul>
            <h4>Examples of unacceptable behavior include, but are not limited to, the following:</h4>
            <ul className="list compact">
              <li>Harassing your opponent based on their playstyle or deck.</li>
              <li>Game titles which could reasonably be considered inappropriate or offensive.</li>
              <li>
                Trolling, insulting/derogatory comments, casual use of slurs, pejorative language,
                personal/political attacks, harassment, intimidation, or threats.
              </li>
              <li>The use of sexualized language or imagery.</li>
              <li>Making light of/making mocking comments about trigger warnings or content warnings.</li>
              <li>
                Deliberately using incorrect pronouns for a person, especially after being informed
                of the correct ones. If unsure, use gender-neutral language.
              </li>
            </ul>
            <p>
              To report an incident or to contact the moderation team please email{" "}
              <a href="mailto:jnetmods@gmail.com">jnetmods@gmail.com</a>.{" "}
              If reporting an incident, please include screenshots if possible.
            </p>
            <p>
              Moderators will respond to offenses by attempting to contact users for resolution
              where possible. Repeated/severe offenses will be reviewed by the moderation team
              and met with temporary or permanent bans. All bans are reviewed by the entire
              moderation team.
            </p>
            <p>
              Moderators are not here to settle rules disputes or otherwise serve as judges.
              If there is a rules disagreement, bringing it to a community space is the best
              plan for resolution.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
