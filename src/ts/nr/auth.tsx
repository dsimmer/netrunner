// Auth modals (login, register, forgot) and auth menu.
// Mirrors: src/cljs/nr/auth.cljs
import React, { useState } from "react";
import { useAppState } from "./appstate";
import { GET, POST } from "./ajax";
import { removeSyncSettings } from "./local_storage";
import { trSpan } from "./translations";

// Modal visibility state — managed outside React to allow imperative show/hide
// from any component (mirrors Clojure's (.modal (js/$ "#login-form") "show"))
type ModalName = "login" | "register" | "forgot" | null;
let _setModal: ((m: ModalName) => void) | null = null;

export function showModal(name: ModalName): void {
  _setModal?.(name);
}

// Mirrors: authenticated in auth.cljs — calls f if user is logged in, else shows login modal
export function authenticated(f: (user: Record<string, unknown>) => void): void {
  const user = useAppState.getState().user;
  if (user) {
    f(user);
  } else {
    showModal("login");
  }
}

const EMAIL_RE = /[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/;

function validEmail(email: string): boolean {
  return EMAIL_RE.test(email.toLowerCase());
}

// ──────────────────────────────────────────────────────────────────
// Register modal
// ──────────────────────────────────────────────────────────────────

function RegisterForm({ onClose, onSwitchLogin }: { onClose: () => void; onSwitchLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [flash, setFlash] = useState("");

  async function checkUsername(value: string) {
    if (!value) return;
    const r = await GET(`/check-username/${encodeURIComponent(value)}`);
    if (r.status === 422) setFlash("Username taken");
    else if (r.status === 423) setFlash("Username too short/too long");
    else setFlash("");
  }

  async function checkEmail(value: string) {
    if (!value) return;
    const r = await GET(`/check-email/${encodeURIComponent(value)}`);
    if (r.status === 422) setFlash("Email taken");
    else setFlash("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) { setFlash("Email can't be empty"); return; }
    if (!username) { setFlash("Username can't be empty"); return; }
    if (!validEmail(email)) { setFlash("Please enter a valid email address"); return; }
    if (username.length > 20) { setFlash("Username must be 20 characters or shorter"); return; }
    if (!password || !confirm) { setFlash("Password can't be empty"); return; }
    if (password !== confirm) { setFlash("Passwords must match"); return; }

    const params = new URLSearchParams({ email, username, password });
    const r = await POST("/register", params.toString());
    if (r.status === 200) {
      window.location.reload();
    } else if (r.status === 422) {
      setFlash("Username taken");
    } else if (r.status === 423) {
      setFlash("Username too long");
    } else if (r.status === 424) {
      setFlash("Email already used");
    } else {
      setFlash("Registration failed");
    }
  }

  return (
    <div id="register-form" className="modal fade" style={{ display: "block" }}>
      <div className="modal-dialog">
        <h3>Create an account</h3>
        {flash && <p className="flash-message">{flash}</p>}
        <form onSubmit={handleSubmit}>
          <p>
            <input type="text" placeholder="Email" name="email" value={email}
              onChange={e => setEmail(e.target.value)}
              onBlur={e => {
                checkEmail(e.target.value);
                if (!validEmail(e.target.value)) setFlash("Please enter a valid email address");
              }} />
          </p>
          <p>
            <input type="text" placeholder="Username" name="username" maxLength={16}
              value={username}
              onChange={e => setUsername(e.target.value)}
              onBlur={e => checkUsername(e.target.value)} />
          </p>
          <p>
            <input type="password" placeholder="Password" name="password" value={password}
              onChange={e => setPassword(e.target.value)} />
          </p>
          <p>
            <input type="password" placeholder="Confirm password" name="confirm-password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onBlur={e => {
                if (!e.target.value.startsWith(password.slice(0, e.target.value.length))) {
                  setFlash("Please enter matching passwords");
                }
              }} />
          </p>
          <p>
            <button type="submit">Sign up</button>
            <button type="button" onClick={onClose}>Cancel</button>
          </p>
        </form>
        <p>
          Already have an account?{" "}
          <span className="fake-link" onClick={onSwitchLogin}>Log in</span>
        </p>
        <p>
          Need to reset your password?{" "}
          <span className="fake-link" onClick={() => showModal("forgot")}>Reset</span>
        </p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Login modal
// ──────────────────────────────────────────────────────────────────

function LoginForm({ onClose, onSwitchRegister }: { onClose: () => void; onSwitchRegister: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [flash, setFlash] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams({ username, password });
    const r = await POST("/login", params.toString());
    if (r.status === 200) {
      window.location.reload();
    } else if (r.status === 401) {
      setFlash("Invalid login or password");
    } else if (r.status === 403) {
      const msg = (r.json as { error?: string } | null)?.error;
      setFlash(msg ?? "Account banned");
    } else {
      setFlash("Login failed");
    }
  }

  return (
    <div id="login-form" className="modal fade" style={{ display: "block" }}>
      <div className="modal-dialog">
        <h3>Log in</h3>
        {flash && <p className="flash-message">{flash}</p>}
        <form onSubmit={handleSubmit}>
          <p>
            <input type="text" placeholder="Username" name="username" value={username}
              onChange={e => setUsername(e.target.value)} />
          </p>
          <p>
            <input type="password" placeholder="Password" name="password" value={password}
              onChange={e => setPassword(e.target.value)} />
          </p>
          <p>
            <button type="submit">Log in</button>
            <button type="button" onClick={onClose}>Cancel</button>
          </p>
          <p>
            No account?{" "}
            <span className="fake-link" onClick={onSwitchRegister}>Sign up!</span>
          </p>
          <p>
            Forgot your password?{" "}
            <span className="fake-link" onClick={() => showModal("forgot")}>Reset</span>
          </p>
        </form>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Forgot password modal
// ──────────────────────────────────────────────────────────────────

function ForgotForm({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [flash, setFlash] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validEmail(email)) { setFlash("Please enter a valid email address"); return; }
    const params = new URLSearchParams({ email });
    const r = await POST("/forgot", params.toString());
    if (r.status === 200) {
      setFlash("Reset password sent");
    } else if (r.status === 421) {
      setFlash("No account with that email address exists");
    } else {
      setFlash("Failed to send reset email");
    }
  }

  return (
    <div id="forgot-form" className="modal fade" style={{ display: "block" }}>
      <div className="modal-dialog">
        <h3>Reset your Password</h3>
        {flash && <p className="flash-message">{flash}</p>}
        <form onSubmit={handleSubmit}>
          <p>
            <input type="text" placeholder="Email" name="email" value={email}
              onChange={e => setEmail(e.target.value)}
              onBlur={e => {
                if (!validEmail(e.target.value)) setFlash("Please enter a valid email address");
              }} />
          </p>
          <p>
            <button type="submit">Submit</button>
            <button type="button" onClick={onClose}>Cancel</button>
          </p>
          <p>
            No account?{" "}
            <span className="fake-link" onClick={() => showModal("register")}>Sign up!</span>
          </p>
        </form>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Auth modal root — mount once in App, shows active modal
// ──────────────────────────────────────────────────────────────────

export function AuthForms(): React.ReactElement | null {
  const user = useAppState(s => s.user);
  const [activeModal, setActiveModal] = useState<ModalName>(null);
  _setModal = setActiveModal;

  if (user) return null;

  return (
    <>
      {activeModal === "register" && (
        <RegisterForm
          onClose={() => setActiveModal(null)}
          onSwitchLogin={() => setActiveModal("login")}
        />
      )}
      {activeModal === "login" && (
        <LoginForm
          onClose={() => setActiveModal(null)}
          onSwitchRegister={() => setActiveModal("register")}
        />
      )}
      {activeModal === "forgot" && (
        <ForgotForm onClose={() => setActiveModal(null)} />
      )}
      {activeModal && (
        <div className="modal-backdrop fade in" onClick={() => setActiveModal(null)} />
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
// Auth menu — shown in navbar
// ──────────────────────────────────────────────────────────────────

function Avatar({ user }: { user: Record<string, unknown> }) {
  const emailhash = user.emailhash as string ?? "";
  const size = 22;
  return (
    <img
      className="avatar"
      src={`https://www.gravatar.com/avatar/${emailhash}?d=retro&s=${size}`}
      width={size}
      height={size}
      alt=""
    />
  );
}

async function handleLogout(e: React.MouseEvent) {
  e.preventDefault();
  await POST("/logout", null);
  // Mirrors (ls/remove-sync-settings!) — clear DB-sourced settings from
  // localStorage so they don't leak to the next account.
  removeSyncSettings();
  window.location.reload();
}

function LoggedMenu({ user }: { user: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  return (
    <ul>
      <li className={`dropdown usermenu${open ? " open" : ""}`}>
        <a className="dropdown-toggle" href="" onClick={e => { e.preventDefault(); setOpen(o => !o); }}>
          <Avatar user={user} />
          {user.username as string}
          <b className="caret" />
        </a>
        {open && (
          <div className="dropdown-menu blue-shade float-right">
            {!!user.isadmin && (
              <a className="block-link" href="/admin">
                [{trSpan(["menu_admin", "Admin"])}]
              </a>
            )}
            {!!user.ismoderator && (
              <a className="block-link">[{trSpan(["menu_moderator", "Moderator"])}]</a>
            )}
            {!!user.special && (
              <a className="block-link">[{trSpan(["menu_donor", "Donor"])}]</a>
            )}
            <a className="block-link" href="/account">
              {trSpan(["menu_settings", "Settings"])}
            </a>
            <a className="block-link" href="" onClick={handleLogout}>
              {trSpan(["menu_logout", "Jack out"])}
            </a>
          </div>
        )}
      </li>
    </ul>
  );
}

function UnloggedMenu() {
  return (
    <ul>
      <li>
        <a href="" onClick={e => { e.preventDefault(); showModal("register"); }}>Sign up</a>
      </li>
      <li>
        <a href="" onClick={e => { e.preventDefault(); showModal("login"); }}>Login</a>
      </li>
    </ul>
  );
}

// Mirrors: auth-menu in auth.cljs
export function AuthMenu(): React.ReactElement {
  const user = useAppState(s => s.user);
  if (user) return <LoggedMenu user={user} />;
  return <UnloggedMenu />;
}
