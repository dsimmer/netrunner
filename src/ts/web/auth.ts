// Authentication module. Mirrors: src/clj/web/auth.clj
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import nodemailer from "nodemailer";
import { Db, Document, UpdateResult } from "mongodb";
import { toObjectId, findOneAsMapCaseInsensitive } from "./mongodb";
import { md5, response, type HttpResponse } from "./utils";
import { activeUser, createUser, USER_KEYS, type User, validUsername } from "./user";
import { syncKeys } from "../jinteki/settings";
import { getContent } from "../jinteki/i18n";
import { bannedMsg } from "./versions";
import { getAppState, swapAppState } from "./app_state";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthSettings {
  expiration?: number;
  secret?: string;
  cookie?: Record<string, unknown>;
}

export interface EmailSettings {
  host?: string | null;
  user?: string | null;
  pass?: string | null;
  ssl?: unknown;
  from?: string;
  "reset-subject"?: string;
  "confirm-reset-subject"?: string;
}

export interface AuthResponse extends HttpResponse {
  cookies?: Record<string, Record<string, unknown>>;
}

export interface AuthRequest {
  system?: {
    db?: Db;
    auth?: AuthSettings;
    email?: EmailSettings;
    [key: string]: unknown;
  };
  user?: User;
  cookies?: Record<string, { value: string }>;
  params?: Record<string, string>;
  "path-params"?: Record<string, string>;
  body?: Record<string, unknown>;
  "remote-addr"?: string;
  headers?: Record<string, string | string[] | undefined>;
  [key: string]: unknown;
}

export interface AuthHandler {
  (req: AuthRequest): HttpResponse | AuthResponse | void;
}

export type AuthHandlerAsync = (req: AuthRequest) => Promise<HttpResponse | AuthResponse | void>;

// ---------------------------------------------------------------------------
// JWT Token helpers
// ---------------------------------------------------------------------------

/**
 * Creates a JWT token for the given user.
 * Mirrors: create-token
 */
export function createToken(
  auth: AuthSettings,
  user: { _id?: string | Document; emailhash?: string },
): string {
  const expiration = auth.expiration ?? 30; // default 30 days
  const secret = auth.secret ?? "";
  const claims = {
    _id: user._id,
    emailhash: user.emailhash,
    exp: Math.floor(Date.now() / 1000) + expiration * 24 * 60 * 60,
  };
  return jwt.sign(claims, secret, { algorithm: "HS512" });
}

/**
 * Validates and decodes a JWT token.
 * Mirrors: unsign-token
 */
export function unsignToken(auth: AuthSettings, token: string): Record<string, unknown> | null {
  try {
    const secret = auth.secret ?? "";
    return jwt.verify(token, secret, { algorithms: ["HS512"] }) as Record<string, unknown>;
  } catch (_e) {
    console.log("Received invalid token", token);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Middleware wrappers
// ---------------------------------------------------------------------------

/**
 * Middleware to require an authenticated (active) user.
 * Mirrors: wrap-authentication-required
 */
export function wrapAuthenticationRequired(handler: AuthHandler): AuthHandler {
  return (req: AuthRequest) => {
    const user = req.user;
    if (activeUser(user)) {
      return handler(req);
    }
    return response(401, { message: "Not authorized" });
  };
}

/**
 * Middleware to require admin authorization.
 * Mirrors: wrap-authorization-required
 */
export function wrapAuthorizationRequired(handler: AuthHandler): AuthHandler {
  return (req: AuthRequest) => {
    const user = req.user;
    if (user?.isadmin) {
      return handler(req);
    }
    return response(401, { message: "Not authorized" });
  };
}

/**
 * Middleware to require tournament organizer authorization.
 * Mirrors: wrap-tournament-auth-required
 */
export function wrapTournamentAuthRequired(handler: AuthHandler): AuthHandler {
  return (req: AuthRequest) => {
    const user = req.user;
    if (user?.["tournament-organizer"]) {
      return handler(req);
    }
    return response(401, { message: "Not authorized" });
  };
}

/**
 * Middleware to extract and attach the user from the session cookie.
 * Mirrors: wrap-user
 */
export function wrapUser(handler: AuthHandlerAsync): AuthHandlerAsync {
  return async (req: AuthRequest) => {
    const db = req.system?.db;
    const auth = req.system?.auth;
    const cookies = req.cookies;
    let user: User | undefined;

    if (db && auth && cookies) {
      const sessionCookie = cookies["session"];
      if (sessionCookie) {
        const tokenData = unsignToken(auth, sessionCookie.value);
        if (tokenData) {
          const userId = toObjectId(tokenData._id as string | undefined);
          if (userId) {
            const foundUser = await db
              .collection<Document>("users")
              .findOne({
                _id: userId,
                emailhash: tokenData.emailhash as string,
              });
            if (foundUser) {
              // Select only user keys
              const selected: Partial<User> = {};
              for (const key of USER_KEYS) {
                if (key in foundUser) {
                  (selected as Record<string, unknown>)[key] = foundUser[key];
                }
              }
              // Convert _id to string
              if (selected._id && typeof selected._id !== "string") {
                selected._id = String(selected._id);
              }
              user = selected as User;
            }
          }
        }
      }
    }

    if (activeUser(user)) {
      const enrichedReq = {
        ...req,
        user,
        session: { uid: user.username },
      };
      return handler(enrichedReq as AuthRequest);
    }
    return handler(req);
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Handle user registration.
 * Mirrors: register-handler
 */
export async function registerHandler(req: AuthRequest): Promise<HttpResponse> {
  const db = req.system?.db;
  const params = req.params ?? {};
  const { username, password, "confirm-password": confirmPassword, email } = params;

  if (!db) {
    return response(500, { message: "Database not available" });
  }

  if (!validUsername(username)) {
    return response(401, { message: "Username is not valid" });
  }

  if (password !== confirmPassword) {
    return response(401, { message: "Passwords must match" });
  }

  const existingUser = await findOneAsMapCaseInsensitive(db, "users", { username });
  if (existingUser) {
    return response(422, { message: "Username taken" });
  }

  const existingEmail = await findOneAsMapCaseInsensitive(db, "users", { email });
  if (existingEmail) {
    return response(424, { message: "Email taken" });
  }

  const userCollection = db.collection<Document>("users");
  const deckCollection = db.collection<Document>("decks");

  // Check if this is the first user
  const firstUser = (await userCollection.countDocuments()) === 0;

  // Get demo decks
  const demoDecks = await deckCollection.find({ username: "__demo__" }).toArray();

  const newUser = createUser(username, password, email, { isadmin: firstUser });
  await userCollection.insertOne(newUser as unknown as Document);

  // Copy demo decks if they exist
  if (demoDecks.length > 0) {
    const decksToInsert = demoDecks.map((deck) => {
      const { _id: _, ...rest } = deck;
      return { ...rest, username };
    });
    if (decksToInsert.length > 0) {
      await deckCollection.insertMany(decksToInsert);
    }
  }

  return response(200, { message: "ok" });
}

// ---------------------------------------------------------------------------
// Login helpers
// ---------------------------------------------------------------------------

/**
 * Find a user matching the query who is also active (not banned).
 * Mirrors: find-non-banned-user
 */
export async function findNonBannedUser(
  db: Db,
  query: Document,
): Promise<Document | undefined> {
  const user = await findOneAsMapCaseInsensitive(db, "users", query);
  if (user && !user.banned) {
    return user;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

/**
 * Handle user login.
 * Mirrors: login-handler
 */
export async function loginHandler(req: AuthRequest): Promise<AuthResponse> {
  const db = req.system?.db;
  const auth = req.system?.auth;
  const params = req.params ?? {};
  const { username, password } = params;
  const remoteAddress = req["remote-addr"] as string | undefined;
  const headers = req.headers as Record<string, string | string[] | undefined> | undefined;

  if (!db || !auth) {
    return response(500, { message: "Server not configured" }) as AuthResponse;
  }

  // Determine client IP - check x-forwarded-for first, then x-real-ip, then remote-addr
  let clientIp: string | undefined;
  if (headers) {
    const xForwardedFor = headers["x-forwarded-for"];
    if (xForwardedFor && typeof xForwardedFor === "string") {
      clientIp = xForwardedFor.split(",")[0]?.trim();
    } else if (Array.isArray(xForwardedFor) && xForwardedFor.length > 0) {
      clientIp = xForwardedFor[0]?.trim();
    }
  }
  if (!clientIp && headers) {
    const xRealIp = headers["x-real-ip"];
    if (xRealIp && typeof xRealIp === "string") {
      clientIp = xRealIp.trim();
    } else if (Array.isArray(xRealIp) && xRealIp.length > 0) {
      clientIp = xRealIp[0]?.trim();
    }
  }
  if (!clientIp) {
    clientIp = remoteAddress;
  }

  const userCollection = db.collection<Document>("users");
  const user = await userCollection.findOne({ username });

  if (user) {
    const passwordValid = await bcrypt.compare(password, user.password ?? "");

    // Check if user is banned
    if (passwordValid && user.banned) {
      return response(403, { error: bannedMsg ?? "Account Locked" }) as AuthResponse;
    }

    // Check if client IP is banned
    if (passwordValid && clientIp) {
      const ipBan = await db.collection<Document>("ip-bans").findOne({
        "ip-address": clientIp,
      });
      if (ipBan) {
        return response(403, { error: bannedMsg ?? "Account Locked" }) as AuthResponse;
      }
    }

    // Valid login
    if (passwordValid) {
      await userCollection.updateOne(
        { username },
        {
          $set: {
            "last-connection": new Date(),
            "last-ip-address": String(clientIp),
          },
        },
      );

      const token = createToken(auth, {
        _id: String(user._id),
        emailhash: user.emailhash,
      });

      const resp = response(200, { message: "ok" }) as AuthResponse;
      resp.cookies = {
        session: {
          value: token,
          ...auth.cookie,
        },
      };
      return resp;
    }
  }

  return response(401, { error: "Invalid login or password" }) as AuthResponse;
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

/**
 * Handle user logout.
 * Mirrors: logout-handler
 */
export function logoutHandler(_req: AuthRequest): AuthResponse {
  const resp = response(200, { message: "ok" }) as AuthResponse;
  resp.cookies = {
    session: {
      value: "0",
      "max-age": -1,
    },
  };
  return resp;
}

// ---------------------------------------------------------------------------
// Username / Email checks
// ---------------------------------------------------------------------------

/**
 * Check if a username is available.
 * Mirrors: check-username-handler
 */
export async function checkUsernameHandler(req: AuthRequest): Promise<HttpResponse> {
  const db = req.system?.db;
  const pathParams = req["path-params"] ?? {};
  const { username } = pathParams;

  if (!db) {
    return response(500, { message: "Database not available" });
  }

  const existing = await findOneAsMapCaseInsensitive(db, "users", { username });
  if (existing) {
    return response(422, { message: "Username taken" });
  }
  return response(200, { message: "OK" });
}

/**
 * Check if an email is available.
 * Mirrors: check-email-handler
 */
export async function checkEmailHandler(req: AuthRequest): Promise<HttpResponse> {
  const db = req.system?.db;
  const pathParams = req["path-params"] ?? {};
  const { email } = pathParams;

  if (!db) {
    return response(500, { message: "Database not available" });
  }

  const existing = await findOneAsMapCaseInsensitive(db, "users", { email });
  if (existing) {
    return response(422, { message: "Email taken" });
  }
  return response(200, { message: "OK" });
}

// ---------------------------------------------------------------------------
// Email retrieval
// ---------------------------------------------------------------------------

/**
 * Get the authenticated user's email.
 * Mirrors: email-handler
 */
export async function emailHandler(req: AuthRequest): Promise<HttpResponse> {
  const db = req.system?.db;
  const user = req.user;

  if (!activeUser(user)) {
    return response(401, { message: "Unauthorized" });
  }

  if (!db) {
    return response(500, { message: "Database not available" });
  }

  const fullUser = await findOneAsMapCaseInsensitive(db, "users", {
    username: user.username,
  });

  return response(200, { email: fullUser?.email });
}

// ---------------------------------------------------------------------------
// Change email
// ---------------------------------------------------------------------------

/**
 * Change the authenticated user's email address.
 * Mirrors: change-email-handler
 */
export async function changeEmailHandler(req: AuthRequest): Promise<HttpResponse> {
  const db = req.system?.db;
  const user = req.user;
  const body = req.body ?? {};
  const { email } = body as { email?: string };

  if (!activeUser(user)) {
    return response(401, { message: "Unauthorized" });
  }

  if (!db) {
    return response(500, { message: "Database not available" });
  }

  if (!email) {
    return response(400, { message: "Email is required" });
  }

  // Check if email is already in use
  const userCollection = db.collection<Document>("users");
  const existingEmail = await userCollection.findOne({ email });
  if (existingEmail) {
    return response(400, { message: "Email address already in use" });
  }

  const result: UpdateResult = await userCollection.updateOne(
    { username: user.username },
    {
      $set: {
        email,
        emailhash: md5(email),
      },
    },
  );

  if (result.modifiedCount > 0 || result.matchedCount > 0) {
    return response(200, { message: "Refresh your browser" });
  }

  return response(404, { message: "Account not found" });
}

// ---------------------------------------------------------------------------
// Update profile
// ---------------------------------------------------------------------------

/**
 * Update the authenticated user's profile options.
 * Mirrors: update-profile-handler
 */
export async function updateProfileHandler(req: AuthRequest): Promise<HttpResponse> {
  const db = req.system?.db;
  const user = req.user;
  const body = req.body ?? {};
  const lang = body.lang as string | undefined;

  if (!activeUser(user)) {
    return response(401, { message: "Unauthorized" });
  }

  if (!db) {
    return response(500, { message: "Database not available" });
  }

  const syncKeyList = syncKeys();
  const options: Record<string, unknown> = {};
  for (const key of syncKeyList) {
    if (key in body && body[key] !== null && body[key] !== undefined) {
      options[key] = body[key];
    }
  }

  const userCollection = db.collection<Document>("users");
  const result: UpdateResult = await userCollection.updateOne(
    { username: user.username },
    {
      $set: { options },
    },
  );

  if (result.modifiedCount > 0 || result.matchedCount > 0) {
    // Update in-memory app state if user is present
    const state = getAppState();
    if (state.users[user.username]) {
      swapAppState((s) => {
        s.users[user.username] = {
          ...s.users[user.username],
          options,
        };
        return s;
      });
    }

    const respObj: Record<string, unknown> = { message: "Refresh your browser" };
    if (lang) {
      respObj.lang = lang;
      respObj.content = getContent(lang);
    }
    return response(200, respObj);
  }

  return response(404, { message: "Account not found" });
}

// ---------------------------------------------------------------------------
// Password reset token generation
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically secure random token.
 * Mirrors: generate-secure-token
 */
export function generateSecureToken(size: number): Buffer {
  return randomBytes(size);
}

/**
 * Convert a buffer/byte array to a lowercase hex string.
 * Mirrors: hexadecimalize
 */
export function hexadecimalize(buffer: Buffer): string {
  return buffer.toString("hex");
}

/**
 * Generate and store a password reset code for the given email.
 * Mirrors: set-password-reset-code!
 */
export async function setPasswordResetCode(db: Db, email: string): Promise<string> {
  const resetCode = hexadecimalize(generateSecureToken(20));
  const resetExpires = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour from now

  await db.collection<Document>("users").updateOne(
    { email },
    {
      $set: {
        resetPasswordToken: resetCode,
        resetPasswordExpires: resetExpires,
      },
    },
  );

  return resetCode;
}

// ---------------------------------------------------------------------------
// Forgot password
// ---------------------------------------------------------------------------

/**
 * Handle forgot password request.
 * Mirrors: forgot-password-handler
 */
export async function forgotPasswordHandler(req: AuthRequest): Promise<HttpResponse> {
  const db = req.system?.db;
  const emailSettings = req.system?.email;
  const params = req.params ?? {};
  const { email } = params;
  const headers = req.headers as Record<string, string | string[] | undefined> | undefined;

  if (!db) {
    return response(500, { message: "Database not available" });
  }

  const user = await findNonBannedUser(db, { email });
  if (!user) {
    return response(421, { message: "No account with that email address" });
  }

  const code = await setPasswordResetCode(db, email);

  let host = "";
  if (headers) {
    const hostHeader = headers["host"];
    host = typeof hostHeader === "string" ? hostHeader : Array.isArray(hostHeader) ? hostHeader[0] : "";
  }

  // Send email using nodemailer
  const transporter = nodemailer.createTransport({
    host: emailSettings?.host ?? undefined,
    port: (emailSettings as Record<string, unknown>)?.port ? Number((emailSettings as Record<string, unknown>).port) : undefined,
    secure: !!(emailSettings?.ssl),
    auth: emailSettings?.user && emailSettings?.pass
      ? { user: emailSettings.user, pass: emailSettings.pass }
      : undefined,
  });

  const msgBody = `You are receiving this because you (or someone else) have requested the reset of the password for your account ${(user as Record<string, unknown>).username}.

Please click on the following link, or paste this into your browser to complete the process:

http://${host}/reset/${code}

If you did not request this, please ignore this email and your password will remain unchanged.`;

  try {
    await transporter.sendMail({
      from: emailSettings?.from ?? "support@jinteki.net",
      to: email,
      subject: emailSettings?.["reset-subject"] ?? "Jinteki Password Reset",
      text: msgBody,
    });
    return response(200, { message: "Email sent" });
  } catch (err) {
    return response(500, { message: String(err) });
  }
}

// ---------------------------------------------------------------------------
// Reset password
// ---------------------------------------------------------------------------

/**
 * Handle password reset with token.
 * Mirrors: reset-password-handler
 */
export async function resetPasswordHandler(req: AuthRequest): Promise<HttpResponse | void> {
  const db = req.system?.db;
  const emailSettings = req.system?.email;
  const params = req.params ?? {};
  const { password, confirm } = params;
  const pathParams = req["path-params"] ?? {};
  const { token } = pathParams;

  if (!db) {
    return response(500, { message: "Database not available" });
  }

  const user = await db.collection<Document>("users").findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: new Date() },
  });

  if (!user || (user as Record<string, unknown>).banned) {
    return response(404, { message: "No reset token found" });
  }

  const username = user.username as string;
  const email = user.email as string;

  if (password && password === confirm) {
    const hashPw = bcrypt.hashSync(password, 10);
    await db.collection<Document>("users").updateOne(
      { username },
      {
        $set: {
          password: hashPw,
          resetPasswordExpires: null,
          resetPasswordToken: null,
        },
      },
    );

    // Send confirmation email
    const transporter = nodemailer.createTransport({
      host: emailSettings?.host ?? undefined,
      port: (emailSettings as Record<string, unknown>)?.port ? Number((emailSettings as Record<string, unknown>).port) : undefined,
      secure: !!(emailSettings?.ssl),
      auth: emailSettings?.user && emailSettings?.pass
        ? { user: emailSettings.user, pass: emailSettings.pass }
        : undefined,
    });

    try {
      await transporter.sendMail({
        from: emailSettings?.from ?? "support@jinteki.net",
        to: email,
        subject: emailSettings?.["confirm-reset-subject"] ?? "Your password has been changed",
        text: `Hello,

This is a confirmation that the password for your account ${email} has just been changed.`,
      });
    } catch (_err) {
      // Email sending failure is non-fatal for password reset
    }

    // Redirect to "/" - in Ring this returns a redirect response
    // In Express/Node this would be handled differently
    const redirectResp = response(302, {});
    redirectResp.headers["Location"] = "/";
    return redirectResp;
  }

  return response(422, { message: "New Password and Confirm Password did not match" });
}
