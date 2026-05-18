// Landing / welcome page.
// Mirrors: src/cljs/nr/landing.cljs
import React from "react";
import { trElement, trElementWithEmbeddedContent, trSpan } from "./translations";

export default function LandingPage(): React.ReactElement {
  const githubLink = (
    <a href="https://github.com/mtgred/netrunner" target="_blank" rel="noreferrer">
      {trSpan(["landing_github", "Github"])}
    </a>
  );
  const nehLink = (
    <a href="https://www.nearearthhub.net/" target="_blank" rel="noreferrer">
      nearearthhub.net
    </a>
  );
  const mailLink = <a href="mailto:jnetmods@gmail.com">jnetmods@gmail.com</a>;

  return (
    <div className="container">
      <div className="home-bg" />
      <div className="page-container">
        <div className="worlds2020" />
        <div className="landing-message">
          {trElementWithEmbeddedContent(
            "h4",
            ["landing_visit-neh-for-rules", "Visit {{link}} for links to rules and other resources"],
            { link: nehLink },
          )}
          <div className="landing panel content-page blue-shade">
            {trElement("h2", ["landing_welcome", "Welcome!"])}
            {trElement("p", ["landing_rules-are-incomplete", "This website is for the facilitation of Netrunner games online. Please note that jinteki.net may not provide a complete implementation of the rules of the game."])}
            {trElement("h4", ["landing_make-jinteki-better", "Making Jinteki.net better:"])}
            {trElementWithEmbeddedContent(
              "p",
              ["landing_jinteki-is-free", "Jinteki.net is the product of voluntary contributions made by many individuals. If you wish to make Jinteki.net better, found a bug and need to report an issue, or just like reading code, simply visit our {{link}} page."],
              { link: githubLink },
            )}
            {trElement("h4", ["landing_use-header", "The use of Jinteki.net:"])}
            <ul className="list compact">
              {trElement("li", ["landing_please-be-nice", "Please be respectful. Any disrespectful conduct will not be tolerated regardless of the circumstance or rationale."])}
              {trElement("li", ["landing_prison-decks-exist", "There are many deck archetypes and playstyles in Netrunner. All are valid and should be respected. If you do not wish to play against a certain deck or playstyle please write it in the game title (“No Project Vacheron” or “Experienced/New players only”). If the game has already started, politely explain to your opponent and concede the game."])}
              {trElement("li", ["landing_please-be-nice-in-global", "The global chat tab should only be used for Netrunner-related discussion (including unofficial rules clarifications) and for trying to reach out to users who may have disconnected. Inappropriate use of global chat includes disputes with other players, airing grievances, and everything outlined as unacceptable behavior below."])}
            </ul>
            {trElement("h4", ["landing_please-dont-do-these", "Examples of unacceptable behavior include, but are not limited to, the following:"])}
            <ul className="list compact">
              {trElement("li", ["landing_please-no-harassment", "Harassing your opponent based on their playstyle or deck."])}
              {trElement("li", ["landing_please-no-ugly-titles", "Game titles which could reasonably be considered inappropriate or offensive"])}
              {trElement("li", ["landing_please-no-trolling", "Trolling, insulting/derogatory comments, casual use of slurs, pejorative language, personal/political attacks, harassment, intimidation, threats, or anything outside the scope of playing Netrunner."])}
              {trElement("li", ["landing_please-no-smut", "The use of sexualized language or imagery."])}
              {trElement("li", ["landing_please-no-trigger-mocking", "Making light of/making mocking comments about trigger warnings or content warnings."])}
              {trElement("li", ["landing_please-no-misgendering", "Deliberately using incorrect pronouns for a person, especially after being informed of the correct ones. If unsure, use gender-neutral language."])}
            </ul>
            {trElementWithEmbeddedContent(
              "p",
              ["landing_report-here", "To report an incident or to contact the moderation team please email {{email}}. If reporting an incident, please include screenshots if possible."],
              { email: mailLink },
            )}
            {trElement("p", ["landing_moderators-will-respond", "Moderators will respond to offenses by attempting to contact users for resolution where possible. Repeated/severe offenses will be reviewed by the moderation team and met with temporary or permanent bans. All bans are reviewed by the entire moderation team."])}
            {trElement("p", ["landing_moderators-arent-judges", "Moderators are not here to settle rules disputes or otherwise serve as judges. If there is a rules disagreement, bringing it to a community space is the best plan for resolution."])}
          </div>
        </div>
      </div>
    </div>
  );
}
