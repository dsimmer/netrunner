// User utilities. Mirrors: src/clj/web/user.clj
import bcrypt from "bcryptjs";
import { md5 } from "./utils";

export const USER_KEYS = [
  "_id", "username", "emailhash",
  "isadmin", "ismoderator", "tournament-organizer",
  "special", "options", "stats", "has-api-keys", "banned",
] as const;

export type UserKey = typeof USER_KEYS[number];

export interface User {
  _id?: string;
  username: string;
  email?: string;
  emailhash: string;
  registrationDate?: Date;
  lastConnection?: Date;
  password?: string;
  isadmin?: boolean;
  ismoderator?: boolean;
  "tournament-organizer"?: boolean;
  special?: unknown;
  options?: {
    "default-format"?: string;
    pronouns?: string;
    "blocked-users"?: string[];
  };
  stats?: unknown;
  "has-api-keys"?: boolean;
  banned?: boolean;
}

export function characterLength(username: string): number {
  // Mirrors Clojure's (.codePointCount username 0 (count username))
  let count = 0;
  for (const _char of username) {
    count++;
  }
  return count;
}

const URL_INVALID_CHAR_PATTERN = /:\/\//;
const END_HTML_INVALID_CHAR_PATTERN = /<\//;
const PATTERNS_USERNAME = [URL_INVALID_CHAR_PATTERN, END_HTML_INVALID_CHAR_PATTERN];

export function withinCharLimitUsername(username: string): boolean {
  return characterLength(username) <= 20;
}

export function validUsername(username: string): boolean {
  return withinCharLimitUsername(username) &&
    !PATTERNS_USERNAME.some((pattern) => pattern.test(username));
}

export function createUser(
  username: string,
  password: string,
  email: string,
  opts?: { isadmin?: boolean },
): User {
  const registrationDate = new Date();
  return {
    username,
    email,
    emailhash: md5(email),
    registrationDate,
    lastConnection: registrationDate,
    password: bcrypt.hashSync(password, 10),
    isadmin: opts?.isadmin ?? false,
    options: {
      "default-format": "standard",
      pronouns: "none",
    },
  };
}

/**
 * Returns the given user if it exists and is not banned.
 * Mirrors: active-user? [user]
 */
export function activeUser(user?: User | null): User | undefined {
  if (user && !user.banned) {
    return user;
  }
  return undefined;
}

/**
 * Returns true if user has not blocked other and other has not blocked user.
 * Mirrors: visible-to-user [user other connected-users]
 */
export function visibleToUser(
  user: User,
  other: User,
  connectedUsers: Record<string, User>,
): boolean {
  const userBlockList = new Set(
    user.options?.["blocked-users"] ?? [],
  );
  const otherUsername = other.username;
  const otherUser = connectedUsers[otherUsername];
  const otherBlockList = new Set(
    otherUser?.options?.["blocked-users"] ?? [],
  );
  return !(userBlockList.has(otherUsername) || otherBlockList.has(user.username));
}
