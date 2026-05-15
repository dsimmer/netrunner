// Navigation bar.
// Mirrors: src/cljs/nr/navbar.cljs
import React from "react";
import { useLocation, Link } from "react-router-dom";
import { useAppState } from "./appstate";
import { tr, trSpan } from "./translations";

interface NavLink {
  title: [string, string];
  cls: string;
  route: string;
  show?: (state: ReturnType<typeof useAppState.getState>) => boolean;
}

const NAV_LINKS: NavLink[] = [
  { title: ["nav_welcome", "Welcome"],       cls: "landing",      route: "/" },
  { title: ["nav_chat", "Chat"],              cls: "chat",         route: "/chat" },
  { title: ["nav_cards", "Cards"],            cls: "card",         route: "/cards" },
  { title: ["nav_deck-builder", "Deck Builder"], cls: "deckbuilder", route: "/deckbuilder" },
  { title: ["nav_play", "Play"],              cls: "play",         route: "/play" },
  { title: ["nav_help", "Help"],              cls: "help",         route: "/help" },
  { title: ["nav_settings", "Settings"],      cls: "settings",     route: "/account", show: s => !!s.user },
  { title: ["nav_stats", "Stats"],            cls: "stats",        route: "/stats",   show: s => !!s.user },
  { title: ["nav_about", "About"],            cls: "about",        route: "/about" },
  {
    title: ["nav_tournaments", "Tournaments"], cls: "tournaments", route: "/tournament",
    show: s => !!(s.user?.["tournament-organizer"]),
  },
  {
    title: ["nav_admin", "Admin"], cls: "admin", route: "/admin",
    show: s => !!(s.user?.isadmin),
  },
  {
    title: ["nav_users", "Users"], cls: "users", route: "/users",
    show: s => !!(s.user?.isadmin || s.user?.ismoderator),
  },
  {
    title: ["nav_prizes", "Prizes"], cls: "prizes", route: "/prizes",
    show: s => !!(s.user?.isadmin || s.user?.ismoderator),
  },
];

// Mirrors: navbar component in navbar.cljs
export function Navbar(): React.ReactElement {
  const location = useLocation();
  const appState = useAppState();

  return (
    <ul>
      {NAV_LINKS.map((link, idx) => {
        if (link.show && !link.show(appState)) return null;
        const active = location.pathname === link.route;
        return (
          <li
            key={tr(link.title)}
            className={active ? "active" : ""}
            id={`${link.cls}-nav`}
            data-target="#main"
            data-slide-to={idx}
          >
            <Link to={link.route}>{trSpan(link.title)}</Link>
          </li>
        );
      })}
    </ul>
  );
}
