// Mirrors: src/clj/web/versions.clj
// Holds mutable state for frontend version and banned message.
// Clojure uses atoms (defonce + reset!); here we use module-level vars
// with setter functions to allow mutation from other modules.

let _frontendVersion: string | null = null;
let _bannedMsg: string | null = null;

/** Set the frontend version. Mirrors: (reset! frontend-version version) */
export function setFrontendVersion(version: string | null): void {
  _frontendVersion = version;
}

/** Set the banned message. Mirrors: (reset! banned-msg msg) */
export function setBannedMsg(msg: string | null): void {
  _bannedMsg = msg;
}

// Backward-compatible live bindings for read-only consumers
export { _frontendVersion as frontendVersion };
export { _bannedMsg as bannedMsg };
