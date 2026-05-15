// About page.
// Mirrors: src/cljs/nr/about.cljs
import React, { useEffect, useState } from "react";
import { GET } from "./ajax";

function LinkedPerson({ name, url }: { name: string; url: string }): React.ReactElement {
  return <a href={url} target="_blank" rel="noreferrer">{name}</a>;
}

export default function AboutPage(): React.ReactElement {
  const [donors, setDonors] = useState<string[]>([]);

  useEffect(() => {
    GET("/data/donors").then(r => {
      if (r.status === 200 && Array.isArray(r.json)) {
        setDonors(r.json as string[]);
      }
    });
  }, []);

  return (
    <div className="page-container">
      <div className="about-bg" />
      <div className="about panel content-page blue-shade">
        <h3>About</h3>
        <p>
          This website was founded by @mtgred, an avid Netrunner player from Belgium.
          The goal is to provide a great way to create and test Netrunner decks online.
        </p>

        <h3>Development</h3>
        <h4>Software Development Team</h4>
        <ul className="list compact">
          <li><LinkedPerson name="@mtgred" url="http://twitter.com/mtgred" />: Founder, original sole developer. Retired.</li>
          <li><LinkedPerson name="NoahTheDuke" url="https://github.com/noahtheduke" />: Project maintainer, lead developer.</li>
          <li>
            <LinkedPerson name="nbkelly" url="https://ko-fi.com/nbkelly" />,{" "}
            <LinkedPerson name="butzopower" url="https://github.com/butzopower" />,{" "}
            <LinkedPerson name="francescopellegrini" url="https://github.com/francescopellegrini" />: Current active contributors.
          </li>
          <li>
            <a href="https://github.com/mtgred/netrunner/graphs/contributors" target="_blank" rel="noreferrer">
              Many past contributors.
            </a>
          </li>
        </ul>

        <h4>Content Creators</h4>
        <ul className="list compact">
          <li>
            <LinkedPerson name="0thmxma" url="https://web-cdn.bsky.app/profile/0thmxma.bsky.social" />,{" "}
            <LinkedPerson name="Sanjay" url="https://stimhack.com/yugioh-and-you-by-sanjay/" />,{" "}
            quarg, <LinkedPerson name="znsolomon" url="https://contactthearchivists.podbean.com/" />,
            hbarsquared, yankeeflatline, rumirumirumirumi: Corp and Runner quotes for start-of-game splash screen.
          </li>
          <li><LinkedPerson name="nbkelly" url="https://ko-fi.com/nbkelly" />: Processing/handling of translated NSG card images.</li>
          <li><LinkedPerson name="nbkelly" url="https://ko-fi.com/nbkelly" />, <LinkedPerson name="xiaat" url="https://github.com/xiaat" />: Management/handling/processing of community alt arts.</li>
          <li>PopTartNZ: High-resolution scans for FFG cards.</li>
          <li>
            <LinkedPerson name="Rhahi" url="https://github.com/Rhahi" />: Labelling and other QoL functionality ported with permission from{" "}
            <a href="https://addons.mozilla.org/en-US/firefox/addon/cyberfeeder/" target="_blank" rel="noreferrer">Cyberfeeder firefox plugin</a>
          </li>
        </ul>

        <h4>UI Translators</h4>
        <ul className="list compact">
          <li>Chinese (Simplified): <LinkedPerson name="bbbbbbbbba" url="https://github.com/bbbbbbbbba" />, <LinkedPerson name="klingeling" url="https://github.com/klingeling" /></li>
          <li>French: canisinhorto</li>
          <li>Italian: <LinkedPerson name="gianluks90" url="https://github.com/Gianluks90" /></li>
          <li>Japanese: <LinkedPerson name="csbisa" url="https://github.com/csbisa" /></li>
          <li>Korean: Seojun Park</li>
          <li>Pig-Latin: <LinkedPerson name="jwarwick" url="https://github.com/jwarwick" /></li>
          <li>Polish: <LinkedPerson name="vesperius" url="https://vesper.cyberpunk.me/" /></li>
          <li>Portuguese: Vacilotto</li>
          <li>Russian: <LinkedPerson name="xiaat" url="https://github.com/xiaat" /></li>
        </ul>

        <h4>Tech Stack</h4>
        <ul className="list compact">
          <li><b>Game engine:</b> Go. Card data from <a href="https://netrunnerdb.com/" target="_blank" rel="noreferrer">NetrunnerDB</a> API.</li>
          <li><b>Server:</b> Go. chi router. gorilla/websocket for WebSocket communications.</li>
          <li><b>Front-end client:</b> TypeScript. React + Zustand + Vite.</li>
        </ul>

        <p>
          The code is open source and available on{" "}
          <a href="https://github.com/mtgred/netrunner/issues" target="_blank" rel="noreferrer">Github</a>.
        </p>
        <p>
          Bug reports and feature suggestions can be submitted{" "}
          <a href="https://github.com/mtgred/netrunner/issues" target="_blank" rel="noreferrer">here</a>.
        </p>

        <h3>Donations</h3>
        <p>
          Donations are appreciated and help finance fast servers. You can support the project
          financially with PayPal or Bitcoin. Alternate art cards will be enabled on your account
          as a token of gratitude. Please specify your username with your donation.
        </p>
        <ul className="list compact">
          <li>PayPal: mtgred@gmail.com or <a href="https://www.paypal.me/mtgred" title="PayPal" target="_blank" rel="noreferrer">paypal.me/mtgred</a></li>
          <li>Bitcoin: <span className="bitcoin">1MRRtCsZYGdgwvRo4NMhmo14q7KJNtAiKL<img className="qr" src="/img/bitcoin.png" alt="Bitcoin QR Code" /></span></li>
        </ul>
        <p>Many thanks to all the donors. Your contributions and kind words are greatly appreciated. You help finance fast servers.</p>
        <ul className="list compact">
          {donors.map(d => <li key={d}>{d}</li>)}
        </ul>

        <h3>Disclaimer</h3>
        <p>Netrunner is a trademark of Fantasy Flight Publishing, Inc. and/or Wizards of the Coast LLC.</p>
        <p>This website is not affiliated with Fantasy Flight Games or Wizards of the Coast.</p>
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
