import {
  bigint,
  integer,
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Shared rate-limit counters. Memory storage is not safe when serverless
 * instances scale independently, so Better Auth keeps its counters here. */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/**
 * A wrong password given for one account, whatever address it came from: the sign-in limit counts by address, and a
 * guesser with many addresses is counted here instead. Five within the hour and the account takes one try a minute
 * until the hour has passed (the Owner, 2026-10-07), and the Owner is told. Cleared when the right one is given; only
 * the hour's are ever read.
 */
export const passwordGuess = pgTable(
  "password_guess",
  {
    id: text("id").primaryKey(),
    /** The address signed in with, as Better Auth reads it, lowercased: an account's or none at all, so a wrong one
     *  for nobody is counted the same as one for somebody and says nothing about who exists. */
    login: text("login").notNull(),
    guessedAt: timestamp("guessed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("password_guess_login_idx").on(table.login, table.guessedAt),
  ]
);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  /** UI language: "bn" (farm default) or "en". Validated by the app, not the database. */
  language: text("language", { enum: ["bn", "en"] })
    .notNull()
    .default("bn"),
  /** A number the farm can text. Only the two safety notices ever go this way, and only to the
   *  Owner and the Manager — but the number is the person's, so anybody may have one. */
  phone: text("phone"),
  /** Set when the Owner removes a person's access; the person and their history remain. */
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)]
);

/**
 * When a signed-in person last gave their password again, for the acts that ask for it within the quarter hour: the
 * money paid out and approved, the portal opened, an Investor's data copied. Signing in counts by the session's own
 * start; this is for a session older than that. Gone with the session.
 */
export const passwordGiven = pgTable("password_given", {
  sessionId: text("session_id")
    .primaryKey()
    .references(() => session.id, { onDelete: "cascade" }),
  givenAt: timestamp("given_at", { withTimezone: true }).notNull(),
});

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("account_providerId_accountId_uidx").on(
      table.providerId,
      table.accountId
    ),
    index("account_userId_idx").on(table.userId),
  ]
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);
