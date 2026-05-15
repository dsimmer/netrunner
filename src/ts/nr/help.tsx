// Help page with FAQ and command reference.
// Mirrors: src/cljs/nr/help.cljs
import React, { useEffect, useRef, Fragment } from "react";
import { commandInfo } from "../jinteki/utils";

interface KeyboardControlInfo {
  name: string;
  usage: string;
  help: string;
}

const KEYBOARD_CONTROL_INFO: KeyboardControlInfo[] = [
  { name: "Space", usage: "Space", help: "Performs a default action if there are no controls focused. Otherwise, activates the focused control. Default actions: Clicking for credits, Starting/Ending turns, and continuing a run" },
  { name: "Enter", usage: "Enter", help: "Focuses the chat if there are no controls focused. Otherwise, activates the focused control" },
  { name: "/", usage: "/ (forward slash)", help: "Focuses the chat and brings up the command menu" },
  { name: "numbers", usage: "Number keys", help: "Activates options in the button panel or card menu. Numbers are mapped to options from top to bottom" },
];

interface HelpSubEntry {
  id: string;
  title: string;
  content: React.ReactNode;
}

interface HelpSection {
  id: string;
  title: string;
  sub: HelpSubEntry[];
}

const HELP_DATA: HelpSection[] = [
  {
    id: "general",
    title: "General",
    sub: [
      {
        id: "dostuff",
        title: "How do I perform actions in a game?",
        content: (
          <ul>
            <p>In general, if you want to perform an action connected to a card, try clicking that card. Either something will happen or a menu should appear. Your mouse cursor may also turn into a &quot;target&quot; icon if you need to choose a target. You will be prompted discard down to your hand size after you choose &quot;End Turn&quot;.</p>
            <p>Most cards in the game are now automated, but be aware that some cards' restrictions or trigger conditions are not implemented. If you want to spend credits from a card, but the game is not giving you the option, just click the card with credits and take some.</p>
          </ul>
        ),
      },
      {
        id: "manual",
        title: "What if the card I'm playing is not implemented?",
        content: (
          <ul>
            <p>Once in a while you may need to do something manually. A player's clicks, credits, tags etc. can be manipulated by hand by using plus/minus signs next to their numbers in the panel on the left (which will appear when you move your mouse there).</p>
            <p>Cards can be moved by clicking them and dragging, but this does not work when moving a card into the play area (including from one server to another server). One workaround is to manually add a click and any credits needed, then click on the card to install it. This works even if it's not your turn.</p>
          </ul>
        ),
      },
      {
        id: "undo",
        title: "How do I undo an action?",
        content: (
          <ul>
            <p>There are two undo functions - undo to turn start, and undo the last click. To undo the start of the current turn both players must use the /undo-turn command. To undo to the start of the click the active player must use the /undo-click command. </p>
            <p>There are some non-click based interactions such as using clone-chip and rezzing ice or assets which are not supported via the undo-click function and players will need to handle manually. Trashed/played cards can be dragged back to hand and reinstalled if needed. If there are lingering/hard to dismiss prompts, try using <code>/close-prompt</code> command as a last resort.</p>
          </ul>
        ),
      },
      {
        id: "breakice",
        title: "How do I break ice and fire ice subroutines?",
        content: (
          <ul>
            <p>Once the Runner encounters a piece of ice, both the Runner and the Corp will see a menu. To break subroutines, the Runner should click on their icebreakers and use their abilities. If some subroutines are left unbroken, after the Runner chooses &quot;Let all subroutines fire&quot;, the Corp clicks &quot;Fire unbroken subroutines&quot; to fire them.</p>
            <p>It's considered common courtesy to wait as Corp for the Runner to indicate to fire unbroken subroutines, since the Runner may have ways of breaking/avoiding the effects that are not immediately obvious and the effects of a fired subroutine may be hard to undo.</p>
          </ul>
        ),
      },
      {
        id: "closemenu",
        title: "How do I close a card's menu?",
        content: (
          <ul>
            <p>Click outside the menu or press Escape. If it isn't a menu, but a bugged prompt that shouldn't be there, try using <code>/close-prompt</code>.</p>
          </ul>
        ),
      },
      {
        id: "keyboard",
        title: "Are there any keyboard controls?",
        content: (
          <ul>
            <div>
              The keyboard can control some basic functionality. List of available keyboard controls:
              <ul>
                {KEYBOARD_CONTROL_INFO.map((item, idx) => (
                  <li key={idx}><code>{item.usage}</code> - {item.help}</li>
                ))}
              </ul>
            </div>
          </ul>
        ),
      },
      {
        id: "commands",
        title: "How do I use commands during a game?",
        content: (
          <ul>
            <div>
              To use a command, type it in chatbox and press Enter. Some of the commands will bring up a prompt requiring you to select something. List of available commands:
              <ul>
                {commandInfo.map((item, idx) => (
                  <li key={idx}><code>{item.usage}</code> - {item.help}</li>
                ))}
              </ul>
            </div>
          </ul>
        ),
      },
      {
        id: "documentation",
        title: "Is there more documentation on how to use Jinteki.net?",
        content: (
          <ul>
            <p>Read the <a href="https://github.com/mtgred/netrunner/wiki/Jinteki.net-Guide" target="_blank">Jinteki.net Guide</a> on the GitHub wiki.</p>
          </ul>
        ),
      },
    ],
  },
  {
    id: "beginners",
    title: "Beginners",
    sub: [
      {
        id: "learnrules",
        title: "Where can I find the game's rules explanation?",
        content: (
          <ul>
            <p>The first step is <a href="https://nullsignal.games/players/learn-to-play/" target="_blank">the Learn to Play page</a>. If you prefer video form, Null Signal Games has prepared <a href="https://youtube.com/watch?v=aG0eTf7BncU" target="_blank">a video tutorial</a>, too.</p>
            <p>Once familiar with the basics, the finer points of rules/card interactions can be found in <a href="https://nullsignal.games/about/frequently-asked-questions/">the FAQ page</a>. There is also <a href="http://ancur.wikia.com/wiki/Project_ANCUR_Wiki">Project ANCUR</a>, which is a collection of rulings (also unofficial) regarding various cards and game situations.</p>
          </ul>
        ),
      },
      {
        id: "firstgame",
        title: "Can I play my first game on jinteki.net even though I'm a total beginner and never played in meatspace?",
        content: (
          <ul>
            <p>Sure! Many players will be happy to play/teach a beginner if they know what they're getting into beforehand. So just create a new game in the System Gateway or Core formats with a name such as &quot;beginner here&quot; or &quot;core set only please&quot;, someone happy to play with a beginner should join after a while.</p>
          </ul>
        ),
      },
      {
        id: "finddecks",
        title: "Where can I find some good starting decks?",
        content: (
          <ul>
            <p><a href="https://netrunnerdb.com/">NetrunnerDB</a> is a good resource for finding decks of all kinds. For finding decks consisting of core set only try setting some filters in <a href="http://netrunnerdb.com/en/decklists/search#allowed_packs">the decklist search</a>.</p>
            <p>Once you find a deck you like, export it in Jinteki.net's format (or plain text format if the site doesn't offer the former), copy and paste it into the deckbuilder.</p>
          </ul>
        ),
      },
      {
        id: "communities",
        title: "Where can I find other Netrunner players to talk to?",
        content: (
          <ul>
            <div>
              Apart from the chatrooms here on Jinteki.net, here are a few links to online Netrunner communities:
              <ul>
                <li><a href="http://forum.stimhack.com/">Stimhack forums</a></li>
                <li><a href="https://stimslackinvite.herokuapp.com/">Stimslack</a> (herokuapp invite link)</li>
                <li><a href="https://discord.gg/VxgbNj5">Green Level Clearance Discord server</a></li>
                <li><a href="http://reddit.com/r/netrunner/">/r/netrunner subreddit</a></li>
                <li><a href="https://www.facebook.com/groups/netrunnerdorks/">Netrunner Dorks Facebook group</a></li>
                <li><a href="https://www.nearearthhub.net/#h.c28pw9eqowgt">NearEarthHub#Community Resources</a></li>
              </ul>
            </div>
          </ul>
        ),
      },
    ],
  },
  {
    id: "formats",
    title: "Formats",
    sub: [
      {
        id: "standard",
        title: "What is the Standard format?",
        content: (
          <ul>
            <p>The flagship format of Null Signal Games' Organized Play, Standard is frequently changing to keep the meta exciting and engaging for players of all levels. Most official Organised Play events will follow the Standard format. Refer to <a href="https://nullsignal.games/players/supported-formats/">Supported Formats</a>.</p>
          </ul>
        ),
      },
      {
        id: "startup",
        title: "What is the Startup format?",
        content: (
          <ul>
            <p>Startup is a limited-cardpool format, intended for new players taking their first steps into Organized Play as well as experienced players who want a slimmed-down deckbuilding challenge. Refer to <a href="https://nullsignal.games/players/supported-formats/">Supported Formats</a>.</p>
          </ul>
        ),
      },
      {
        id: "system-gateway",
        title: "What is the System Gateway format?",
        content: (
          <ul>
            <p>System Gateway is Null Signal Games' foundational set. It is designed as an out-of-the-box learning experience and provides everything you need to start playing Netrunner. Refer to <a href="https://nullsignal.games/products/system-gateway/">System Gateway</a>.</p>
          </ul>
        ),
      },
      {
        id: "eternal",
        title: "What is the Eternal format?",
        content: (
          <ul>
            <p>Eternal is not affected by rotation and has a much less stringent Most Wanted List. The largest and most complex format, it encompasses nearly the entirety of the printed card pool and only grows larger with time. Refer to <a href="https://nullsignal.games/players/supported-formats/">Supported Formats</a>.</p>
          </ul>
        ),
      },
      {
        id: "core",
        title: "What is the Core format?",
        content: (
          <ul>
            <p>Elevation builds upon the groundwork laid by System Gateway to broaden the core Netrunner card pool and round out the thematic and mechanical identities of each identity. The combination of System Gateway and Elevation will form the non-rotating core for the Standard and Startup formats, as well as the recommended starting point for new players wanting to explore beyond System Gateway alone. There is no ban list associated with the Core Sets format. Refer to <a href="https://nullsignal.games/players/supported-formats/">Supported Formats</a>.</p>
          </ul>
        ),
      },
    ],
  },
  {
    id: "site",
    title: "Website",
    sub: [
      {
        id: "avatar",
        title: "How do I change my avatar?",
        content: (
          <ul>
            <p>Go to <a href="http://gravatar.com" target="_blank">gravatar.com</a> and create an account with the same email as the one used to register on Jinteki.net. Please note that it can sometimes take up to a few hours for the new avatar to be visible on the site.</p>
          </ul>
        ),
      },
      {
        id: "bestbrowser",
        title: "What is the best supported browser?",
        content: (
          <ul>
            <p>Google Chrome or Firefox on a desktop or laptop is recommended. Safari should work fine too.</p>
            <p>There is limited support for tablet browsers. If you have too many cards to fit on the screen you might not able to see all of them.</p>
            <p>Using a phone is not recommended. The screen will most likely be too small to fit the gameboard.</p>
          </ul>
        ),
      },
      {
        id: "fullscreen",
        title: "How to use jinteki.net in fullscreen mode on a tablet?",
        content: (
          <ul>
            <p>Add jinteki.net to your homescreen as described <a href="http://www.howtogeek.com/196087/how-to-add-websites-to-the-home-screen-on-any-smartphone-or-tablet/">here</a>. If you tap on the homescreen icon, you will be in fullscreen.</p>
          </ul>
        ),
      },
      {
        id: "privatemsgs",
        title: "How do I send a private message / add someone to friendlist?",
        content: (
          <ul>
            <p>The community management issues such as private messages or friendlist are currently not implemented. They are planned, but no specific date is set, as all of our code is written by volunteers.</p>
          </ul>
        ),
      },
      {
        id: "competitive",
        title: 'What is the point of the "Competitive" room in lobby? How does it differ from "Casual"?',
        content: (
          <ul>
            <p>Different rooms in lobby are meant to help people with similar expectations about the game find each other. In general, competitive room is for games with players intending to play competitively. This may mean something different to each of them... However, since it's a non-default room, going there and creating or joining a game usually isn't accidental and is a declaration of some kind of competitive intent.</p>
            <div>
              Some recommendations for playing in the competitive room:
              <br /><br />
              <ul>
                <li>a decent knowledge of the game's rules</li>
                <li>familiarity with the site's interface</li>
                <li>a <span className="legal">tournament legal</span> deck</li>
                <li>enough time reserved for a full game and no distractions</li>
              </ul>
            </div>
            <p>Games with players not able or willing to follow above recommendations are probably better suited to the Casual room. Some examples would be: learning the game, learning the site's interface, testing a completely new and crazy deck idea, testing future spoilers, playing on a touchscreen, playing at work and likely to have to quit on short notice, etc. All of these circumstances may cause needless frustration of players expecting to play a game in a competitive setting.</p>
          </ul>
        ),
      },
      {
        id: "aboutstats",
        title: "What are the options for tracking Game and Deck Statistics, and what do they mean?",
        content: (
          <ul>
            <div>
              Games Started vs. Completed is always logged and displayed. We want to discourage people dropping in games. You can toggle between the modes listed below if you feel like being a casual player one moment then logging stats the next. No data is lost or cleared when you toggle between modes.
              <br /><br />
              <ul>
                <li>Always - statistics are kept and displayed for all games you play</li>
                <li>Competitive lobby only - statistics are kept and displayed only for competitive games</li>
                <li>None - statistics are neither logged or displayed</li>
              </ul>
            </div>
            <div>
              What do the game statistics mean?
              <br /><br />
              <ul>
                <li>Games Started - games you have entered.</li>
                <li>Games Completed - games that had a winner, or games that did not complete but opponent dropped first.</li>
                <li>Games Incomplete - games with no winner where you dropped first, and did not concede.</li>
                <li>Games Won - games won. The percentage is compared to those games lost.</li>
                <li>Games Lost - games lost. The percentage is compared to those games won.</li>
              </ul>
            </div>
            <p>Your game completion rate is visible in the player lobby so people can determine if they should play against you. Don't quit during games - please concede if you have to leave.</p>
          </ul>
        ),
      },
    ],
  },
  {
    id: "cards",
    title: "Cards and Specific Interactions",
    sub: [
      {
        id: "adam",
        title: "How do I install Adam's directives?",
        content: (
          <ul>
            <p>Adam's directives are installed automatically at the game start. The directives are pulled directly from the game-server so do not need to be a part of your deck. The previous workaround of explicitly adding the 3 directives to the deck is no longer necessary.</p>
          </ul>
        ),
      },
      {
        id: "banlist",
        title: "What is SBL?",
        content: (
          <ul>
            <p>Standard Ban List, also known as SBL, is a list of cards with additional deck building restrictions for tournament play. For more information refer to <a href="https://nullsignal.games/players/supported-formats/">the Supported Formats page</a>.</p>
            <p>Decks that are valid and fit within tournament restrictions are marked <span className="legal">Standard legal</span>. Decks that do not fit basic deckbuilding rules are marked <span className="invalid">Standard invalid</span>.</p>
            <p>Putting cards in your deck that are not yet available for sale (i.e. future spoilers) or ones that are out of competitive rotation will also result in your deck being marked as <span className="casual">Casual legal</span>. Such cards should be easy to identify - they are <span className="casual">highlighted</span> in the deckbuilder.</p>
          </ul>
        ),
      },
      {
        id: "altarts",
        title: "How do I change my decks to use alternative art versions of cards (or promotional ones)?",
        content: (
          <ul>
            <p>Alternative art cards are enabled for <a href="#donations">donors</a> and <a href="#devs">developers</a> of the site. If you belong to one of the aforementioned groups and you feel like you should have them enabled, but you don't, <a href="/about">contact us</a>.</p>
          </ul>
        ),
      },
    ],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    sub: [
      {
        id: "weird",
        title: "The site is behaving weird.",
        content: (
          <ul>
            <p>The server code may have been freshly updated and you don't have the latest Javascript code. First step in every troubleshooting should be a forced refresh of your browser by doing a <a href="http://refreshyourcache.com/en/cache/">force refresh</a> (<code>Ctrl + F5</code> on Windows). Also read the announcements on the main page, something about server problems may be written there.</p>
          </ul>
        ),
      },
      {
        id: "touchproblems",
        title: "The website doesn't work well on my touchscreen device.",
        content: (
          <ul>
            <p>Touchscreen devices are currently not supported. See answer to <a href="#bestbrowser">this question</a> for best browsers to use with Jinteki.net.</p>
          </ul>
        ),
      },
      {
        id: "toomanyservers",
        title: "There are too many servers to fit on my screen.",
        content: (
          <ul>
            <p>Decrease the zoom level of your browser and you should be able to see everything. If you are using Chrome, you can do it by pressing CTRL and - (minus). If you are using Firefox, you may need to install <a href="https://addons.mozilla.org/pl/firefox/addon/zoom-page/">Zoom Page addon</a> before the zoom works correctly.</p>
          </ul>
        ),
      },
      {
        id: "zerogames",
        title: "Whenever I connect to the site, I see there are 0 games in the lobby.",
        content: (
          <ul>
            <p>This is most likely a websocket issue. Check if your network filters let through traffic from ws.jinteki.net. Whitelisting *.jinteki.net should solve the problem.</p>
          </ul>
        ),
      },
    ],
  },
  {
    id: "getinvolved",
    title: "Getting Involved",
    sub: [
      {
        id: "reportingbugs",
        title: "How can I report a bug?",
        content: (
          <ul>
            <p>The best place to report bugs is the <a href="https://github.com/mtgred/netrunner/issues" target="_blank">GitHub issue tracker</a>. Before reporting, it is best to make a quick search to see if it's already been reported. If the bug concerns a card, look it up in <a href="https://docs.google.com/spreadsheets/d/1ICv19cNjSaW9C-DoEEGH3iFt09PBTob4CAutGex0gnE/pubhtml" target="_blank">Card implementation status</a> - the card in question may be unimplemented yet.</p>
          </ul>
        ),
      },
      {
        id: "features",
        title: "How can I suggest a feature?",
        content: (
          <ul>
            <p>Same as bugs - feature requests should go on the <a href="https://github.com/mtgred/netrunner/issues" target="_blank">GitHub issue tracker</a>. Again, it's best to make a quick search first to avoid duplicating existing issues.</p>
          </ul>
        ),
      },
      {
        id: "donations",
        title: "How can I make a donation?",
        content: (
          <ul>
            <p>Donation info can be found on the <a href="/about">About</a> page.</p>
          </ul>
        ),
      },
      {
        id: "devs",
        title: "How can I help with the coding/webdesign?",
        content: (
          <ul>
            <p>Visit the project page on <a href="https://github.com/mtgred/netrunner/" target="_blank">GitHub</a> and fork the repository. Implement the changes you were planning on doing and create a PR (Pull Request). If you are in need of some ideas, check out <a href="https://github.com/mtgred/netrunner/labels/easy" target="_blank">issues marked 'easy' on GitHub</a>.</p>
            <p>After two of your PRs have been merged into the master branch, send an e-mail to <a href="mailto:mtgred@gmail.com">mtgred@gmail.com</a> stating who you are on GitHub and ask for access to Jinteki.net Slack, so you can get in better contact with the dev team.</p>
          </ul>
        ),
      },
      {
        id: "awesome",
        title: "Why is this site so awesome?",
        content: (
          <ul>
            <p>Because We Built It.</p>
          </ul>
        ),
      },
    ],
  },
];

function scrollToElement(id: string): void {
  const elementId = id.replace(/^#/, "");
  const element = document.getElementById(elementId);
  if (element) {
    element.scrollIntoView({ behavior: "smooth" });
  }
}

function handleAnchorClick(e: React.MouseEvent<HTMLAnchorElement>): void {
  const anchor = (e.target as HTMLAnchorElement).href;
  if (anchor && anchor.includes("#")) {
    e.preventDefault();
    const hash = anchor.split("#").slice(-1)[0];
    window.location.hash = hash;
    scrollToElement(hash);
  }
}

const HelpToc: React.FC = () => (
  <nav role="navigation" className="table-of-contents" key="nav">
    <ul>
      {HELP_DATA.map(({ id, title, sub }) => (
        <li key={id}>
          <a href={`#${id}`} onClick={handleAnchorClick}>{title}</a>
          <ul>
            {sub.map(({ id, title }) => (
              <li key={id}><a href={`#${id}`} onClick={handleAnchorClick}>{title}</a></li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  </nav>
);

const HelpContents: React.FC = () => (
  <>
    {HELP_DATA.map(({ id, title, sub }) => (
      <Fragment key={id}>
        <h2 id={id} key={id}>{title}</h2>
        {sub.map(({ id, title, content }) => (
          <Fragment key={title}>
            <div>
              <h3 id={id} key={title}>{title}</h3>
              {content}
            </div>
          </Fragment>
        ))}
      </Fragment>
    ))}
  </>
);

export default function Help(): React.ReactElement {
  const handlerRef = useRef<typeof handleAnchorClick | null>(null);

  useEffect(() => {
    handlerRef.current = handleAnchorClick;

    const hash = window.location.hash;
    if (hash && hash.trim() !== "") {
      setTimeout(() => scrollToElement(hash), 100);
    }

    const docHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.href && target.tagName === "A") {
        const handler = handlerRef.current;
        if (handler) {
          handler(e as unknown as React.MouseEvent<HTMLAnchorElement>);
        }
      }
    };

    document.addEventListener("click", docHandler);
    return () => {
      document.removeEventListener("click", docHandler);
    };
  }, []);

  return (
    <div className="page-container">
      <div className="help-bg" />
      <div className="help panel content-page blue-shade">
        <h2>Help Topics</h2>
        <div>
          <div>
            <HelpToc />
            <HelpContents />
          </div>
        </div>
      </div>
    </div>
  );
}
