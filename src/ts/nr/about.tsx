// About page.
// Mirrors: src/cljs/nr/about.cljs
import React, { useEffect, useRef, useState } from "react";
import { GET } from "./ajax";
import { useAppState } from "./appstate";
import { trElement, trElementWithEmbeddedContent, trSpan } from "./translations";
import { setScrollTop, storeScrollTop } from "./utils";

interface ArtistInfo {
  name: string;
  "artist-link"?: string;
  "artist-about"?: string;
  [key: string]: unknown;
}

function LinkedPerson({ name, url }: { name: string; url: string }): React.ReactElement {
  return <a href={url} target="_blank" rel="noreferrer">{name}</a>;
}

function MakeArtists(): React.ReactElement {
  const altInfo = (useAppState((s) => (s as unknown as Record<string, unknown>)["alt-info"]) as ArtistInfo[] | undefined) ?? [];
  const artists = altInfo.filter((a) => Object.prototype.hasOwnProperty.call(a, "artist-about"));
  return (
    <>
      {artists.map((info) => (
        <li key={info.name}>
          <a href={info["artist-link"] ?? "#"}>{info.name}</a>: {info["artist-about"]}
        </li>
      ))}
    </>
  );
}

// scroll-top kept as a module-level ref so it survives navigation (matches the
// `(atom 0)` declared inside `about` in the cljs source which lives for the
// page lifetime).
const aboutScrollTop = { value: 0 };

export default function AboutPage(): React.ReactElement {
  const [donors, setDonors] = useState<string[]>([]);
  const nodeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    GET("/data/donors").then((r) => {
      if (r.status === 200 && Array.isArray(r.json)) {
        setDonors(r.json as string[]);
      }
    });
  }, []);

  useEffect(() => {
    setScrollTop(nodeRef.current, aboutScrollTop.value);
    return () => {
      storeScrollTop(nodeRef.current, (n) => { aboutScrollTop.value = n; });
    };
  }, []);

  const openSourceLink = (
    <a href="https://github.com/mtgred/netrunner/issues" target="_blank" rel="noreferrer">
      {trSpan(["about_url-github", "Github"])}
    </a>
  );
  const bugReportsLink = (
    <a href="https://github.com/mtgred/netrunner/issues" target="_blank" rel="noreferrer">
      {trSpan(["about_url-here", "here"])}
    </a>
  );

  return (
    <div className="page-container">
      <div className="about-bg" />
      <div className="about panel content-page blue-shade" ref={nodeRef}>
        {trElement("h3", ["about_about", "About"])}
        {trElement("p", ["about_founded-by", "This website was founded by @mtgred, an avid Netrunner player from Belgium. The goal is to provide a great way to create and test Netrunner decks online."])}

        {trElement("h3", ["about_development", "Development"])}
        {trElement("h4", ["about_software-development-team", "Software Development Team"])}
        <ul className="list compact">
          <li><LinkedPerson name="@mtgred" url="http://twitter.com/mtgred" />: {trSpan(["about_founder-attribution", "Founder, original sole developer. Retired."])}</li>
          <li><LinkedPerson name="NoahTheDuke" url="https://github.com/noahtheduke" />: {trSpan(["about_maintainer-attribution", "Project maintainer, lead developer."])}</li>
          <li>
            <LinkedPerson name="nbkelly" url="https://ko-fi.com/nbkelly" />,{" "}
            <LinkedPerson name="butzopower" url="https://github.com/butzopower" />,{" "}
            <LinkedPerson name="francescopellegrini" url="https://github.com/francescopellegrini" />: {trSpan(["about_active-contributors", "Current active contributors."])}
          </li>
          <li>
            <a href="https://github.com/mtgred/netrunner/graphs/contributors" target="_blank" rel="noreferrer">
              {trSpan(["about_past-contributors", "Many past contributors."])}
            </a>
          </li>
        </ul>

        {trElement("h4", ["about_content-creators", "Content Creators"])}
        <ul className="list compact">
          <li>
            <LinkedPerson name="0thmxma" url="https://web-cdn.bsky.app/profile/0thmxma.bsky.social" />,{" "}
            <LinkedPerson name="Sanjay" url="https://stimhack.com/yugioh-and-you-by-sanjay/" />,{" "}
            quarg, <LinkedPerson name="znsolomon" url="https://contactthearchivists.podbean.com/" />,
            hbarsquared, yankeeflatline, rumirumirumirumi: {trSpan(["about_start-of-game-quotes", "Corp and Runner quotes for start-of-game splash screen."])}
          </li>
          <li><LinkedPerson name="nbkelly" url="https://ko-fi.com/nbkelly" />: {trSpan(["about_translated-images", "Processing/handling of translated NSG card images, and card backs for community tournaments."])}</li>
          <li>
            <LinkedPerson name="nbkelly" url="https://ko-fi.com/nbkelly" />,{" "}
            <LinkedPerson name="xiaat" url="https://github.com/xiaat" />: {trSpan(["about_alt-art-management", "Management/handling/processing of community alt arts for jinteki.net. If you want your art on jinteki.net, contact one of us."])}
          </li>
          <li>PopTartNZ: {trSpan(["about_high-res-images", "High-resolution scans for FFG cards."])}</li>
          <li>
            <LinkedPerson name="Rhahi" url="https://github.com/Rhahi" />: Labelling and other QoL functionality ported with permission from{" "}
            <a href="https://addons.mozilla.org/en-US/firefox/addon/cyberfeeder/" target="_blank" rel="noreferrer">Cyberfeeder firefox plugin</a>
          </li>
          <MakeArtists />
        </ul>

        {trElement("h4", ["about_ui-translators", "UI Translators"])}
        <ul className="list compact">
          <li>{trSpan(["lang_zh-simp", "Chinese (Simplified)"])}: <LinkedPerson name="bbbbbbbbba" url="https://github.com/bbbbbbbbba" />, <LinkedPerson name="klingeling" url="https://github.com/klingeling" /></li>
          <li>{trSpan(["lang_fr", "French"])}: canisinhorto</li>
          <li>{trSpan(["lang_it", "Italian"])}: <LinkedPerson name="gianluks90" url="https://github.com/Gianluks90" /></li>
          <li>{trSpan(["lang_ja", "Japanese"])}: <LinkedPerson name="csbisa" url="https://github.com/csbisa" /></li>
          <li>{trSpan(["lang_ko", "Korean"])}: Seojun Park</li>
          <li>{trSpan(["lang_la-pig", "Pig-Latin"])}: <LinkedPerson name="jwarwick" url="https://github.com/jwarwick" /></li>
          <li>{trSpan(["lang_pl", "Polish"])}: <LinkedPerson name="vesperius" url="https://vesper.cyberpunk.me/" /></li>
          <li>{trSpan(["lang_pt", "Portuguese"])}: Vacilotto</li>
          <li>{trSpan(["lang_ru", "Russian"])}: <LinkedPerson name="xiaat" url="https://github.com/xiaat" /></li>
        </ul>

        {trElement("h4", ["about_tech-stack", "Tech Stack"])}
        <ul className="list compact">
          <li>{trElement("b", ["about_game-engine", "Game engine:"])} Clojure. Card data from <a href="https://netrunnerdb.com/" target="_blank" rel="noreferrer">NetrunnerDB</a> API.</li>
          <li>{trElement("b", ["about_server", "Server:"])} Clojure. Ring and Compojure running on http-kit. Sente for websocket communications.</li>
          <li>{trElement("b", ["about_front-end-client", "Front-end client:"])} ClojureScript. Reagent (React). </li>
        </ul>

        {trElementWithEmbeddedContent(
          "p",
          ["about_open-source", "The code is open source and available on{{link}}."],
          { link: openSourceLink },
        )}
        {trElementWithEmbeddedContent(
          "p",
          ["about_bug-reports", "Bug reports and feature suggestions can be submitted {{link}}."],
          { link: bugReportsLink },
        )}

        {trElement("h3", ["about_donations", "Donations"])}
        {trElement("p", ["about_donations-long", "Donations are appreciated and help finance fast servers. You can support the project financially with PayPal or Bitcoin. Alternate art cards will be enabled on your account as a token of gratitude. Please specify your username with your donation."])}
        <ul className="list compact">
          <li>PayPal: mtgred@gmail.com or <a href="https://www.paypal.me/mtgred" title="PayPal" target="_blank" rel="noreferrer">paypal.me/mtgred</a></li>
          <li>Bitcoin: <span className="bitcoin">1MRRtCsZYGdgwvRo4NMhmo14q7KJNtAiKL<img className="qr" src="/img/bitcoin.png" alt="Bitcoin QR Code" /></span></li>
        </ul>

        {trElement("p", ["about_thank-you", "Many thanks to all the donors. Your contributions and kind words are greatly appreciated. You help finance fast servers."])}
        <ul className="list compact">
          {donors.map((d) => <li key={d}>{d}</li>)}
        </ul>

        {trElement("h3", ["about_disclaimer", "Disclaimer"])}
        {trElement("p", ["about_netrunner-trademark", "Netrunner is a trademark of Fantasy Flight Publishing, Inc. and/or Wizards of the Coast LLC."])}
        {trElement("p", ["about_unaffiliated", "This is website is not affiliated with Fantasy Flight Games or Wizards of the Coast."])}
        <p>
          Targeting icon made by{" "}
          <a href="http://www.freepik.com" title="Freepik" target="_blank" rel="noreferrer">Freepik</a>{" "}
          from{" "}
          <a href="http://www.flaticon.com" title="Flaticon" target="_blank" rel="noreferrer">www.flaticon.com</a>{" "}
          is licensed under{" "}
          <a href="http://creativecommons.org/licenses/by/3.0/" title="Creative Commons BY 3.0" target="_blank" rel="noreferrer">CC BY 3.0</a>
        </p>
      </div>
    </div>
  );
}
