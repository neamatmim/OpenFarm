# Portal exposure review

Research date: 2026-09-25. Ticket: [What the portal must withstand once strangers can reach it](../../.scratch/openfarm-investor-portal/issues/02-what-the-portal-must-withstand-once-strangers-can-reach-it.md). Code read at `a4c47e9` on main.

**Baseline.** OWASP ASVS **5.0.0** (May 2025), level 1. Each item names the ASVS requirement it was checked against and that requirement's level. Some items the ticket asks about, such as framing, CSP and session length, are level 2 or 3 in ASVS 5.0. Those are marked as such, so it is clear which gaps level 1 allows and which it does not. The requirement wording is quoted from the ASVS 5.0 chapter files; the links are under "Sources" at the end.

**How it was read.** Almost everything here comes from reading code in this repository and in the installed libraries (better-auth 1.7.3, oRPC 2.0.0-beta.35). Two things were run:

- A probe of the oRPC error interceptor, using the portal's own `join` schema (item 5.4).
- A script that lists every procedure with no Role check (item 6.1).

Nothing was run against a database or a built server. Where a finding is a reading and not a result, it says so.

**Marks.** _has_ means the control is there. _lacks_ means it is not, and a smallest fix is given. _n/a_ means the requirement does not apply to the portal.

---

## 1. Guessing

### 1.1 Invitation codes are random, short-lived and used once: _has_

ASVS 6.4.1 (L1): "system generated initial passwords or activation codes are securely randomly generated, follow the existing password policy, and expire after a short period of time or after they are initially used. These initial secrets must not be permitted to become the long term password."

- **Random.** A code is 8 characters drawn with `crypto.getRandomValues` from a 32-letter alphabet (`packages/api/src/membership.ts:472-488`). 256 is a multiple of 32, so the choice has no bias. That is about 40 bits.
- **Only a hash is kept.** The farm stores the SHA-256 of the code, never the code (`portal-store.ts:156`, `:284`).
- **Short-lived.** A code is good for a week (`portal-store.ts:26`, `:157`).
- **Used once.** It is cleared when taken up (`portal-store.ts:326-344`) and when access is taken away (`portal-store.ts:223`).
- **Never the password.** The Investor chooses their own password, so the code never becomes one.

### 1.2 Wrong codes at `join` are counted, but only per phone: _lacks_

ASVS 6.3.1 (L1): "controls to prevent attacks such as credential stuffing and password brute force are implemented according to the application's security documentation". ASVS 6.1.1 (L1) asks for those controls to be documented, including how they "prevent malicious account lockout".

**What it has.**

- `takeUpInvitation` counts wrong codes against the phone that was typed: 10 in 15 minutes, then a 15-minute wait (`portal-store.ts:264-276`, `attempts.ts:15`).
- Against one phone, that is about 6,700 tries over a code's week, out of roughly 10¹² possible codes. That is enough.

**What it lacks.**

- **No per-address limit.** `portal.join` is a public procedure under `/api/rpc` (`routers/portal.ts:74-82`), and better-auth's rate limiter only covers `/api/auth`. Nothing limits how many join requests one address sends. Shed Phone enrolment already counts by caller address (`routers/devices.ts:109`); `join` does not.
- **The count is not bounded.** The wrong-guess counter is a `Map` in process memory (`attempts.ts:7`). It is only pruned for the key being asked about (`attempts.ts:17-26`). The key is built from whatever the caller typed as the phone, raw when it is not a mobile number (`portal-store.ts:264`). A script that sends a different phone on every request therefore grows the map without limit, until the process dies and systemd restarts it (`deploy/openfarm.service:16`). That takes the whole farm app down with it, and the restart forgets every count.
- **Malicious lockout.** Anybody who knows an Investor's phone can keep that Investor's code locked by sending 10 wrong codes every 15 minutes. It is a nuisance, not a breach, but 6.1.1 asks for it to be addressed in writing.

**Smallest fix.**

1. In `takeUpInvitation`, check and count `portal-join:${context.callerAddress}` before the phone key, as `devices.ts:109` does.
2. Do not count a string that is not a mobile number, because no invitation can match it.
3. In `countFailure`, sweep expired keys once the map passes a few thousand entries.

### 1.3 Password rules: _has_

- **6.2.1 (L1), at least 8 characters.** The minimum is 8 (`packages/auth/src/password.ts:9`, `packages/auth/src/index.ts:211`), and `join` checks it again (`portal-store.ts:253-261`). The maximum is 128.
- **6.2.5 (L1), no composition rules.** None.
- **6.2.8 (L1), verified exactly as received.** The password is not trimmed or changed anywhere: `routers/portal.ts:79` has no `.trim()`, and the login screen passes it as typed (`routes/portal/login.tsx:42-43`).
- **6.2.6 (L1), masked input.** `PasswordInput` is `type="password"`, with a show toggle that 6.2.6 allows (`apps/web/src/components/auth/password-input.tsx:18`).
- **6.2.7 (L1), paste and password managers allowed.** No `onPaste` or `onCopy` handler appears anywhere in `apps/web/src`, and the fields carry the right `autoComplete` values.
- **6.2.2 and 6.2.3 (L1), change password, needing the current one.** The account page calls `authClient.changePassword` with `currentPassword` (`routes/portal/_in/account.tsx:124-128`).
- **6.4.2 (L1), no hints or secret questions.** There are none.

### 1.4 Common passwords are not refused: _lacks_

ASVS 6.2.4 (L1): "passwords submitted during account registration or password change are checked against an available set of, at least, the top 3000 passwords which match the application's password policy".

Neither `takeUpInvitation` nor better-auth's `/change-password` checks one. This matters more here than on most sites:

- The Investor's user name is their phone number, which is not a secret. It is known to family, and it will be printed on the welcome sheet.
- The map settles that "a password is enough", with no second factor.

So the password is the only secret, and `12345678` is accepted today.

**Smallest fix.** Ship a list of at least 3,000 common passwords of 8 or more characters in `packages/auth`, for example SecLists' top passwords filtered to length 8 and up. Refuse a listed password:

- in `takeUpInvitation`, next to the length check at `portal-store.ts:253`, which also covers the re-invite path through `setPasswordFor`;
- in the door hook for `/change-password` and `/reset-password` (`packages/auth/src/index.ts:130-137`).

### 1.5 Password guessing at sign-in is limited per address only: _has_, with a gap

ASVS 6.3.1 and 6.1.1 (L1).

**What it has.**

- `/sign-in/email` allows 5 tries a minute per address (`packages/auth/src/index.ts:201`).
- The counters are kept in PostgreSQL (`:191-194`), so a restart does not reset them.
- better-auth 1.7.3 reads the address from `X-Forwarded-For` and trusts it only when the header holds exactly one entry (`@better-auth/core/dist/utils/ip.mjs`, `getIPFromHeader`/`getIP`).
- The deploy runbook requires the proxy to _set_ that header rather than append to it (`docs/runbooks/deploy.md:42-45`).

**The gaps.**

- **No per-account count.** Per address, that is 7,200 tries a day. From many addresses there is no limit, because nothing counts failures per account. With a known user name (1.4), that is the credential-stuffing case 6.3.1 names.
- **The runbook line is load-bearing twice.** If the proxy appends, better-auth sees two entries and resolves no address. It then puts every caller in one shared bucket (`better-auth/dist/api/rate-limiter/index.mjs`, `NO_TRUSTED_IP_KEY`), so five wrong passwords a minute from anybody would lock out every Investor and every member of staff. Separately, the API's own `callerAddressOf` takes the _first_ entry (`packages/api/src/context.ts:368-369`), which a caller controls when the proxy appends.
- **Shared addresses.** Bangladeshi mobile carriers put many subscribers behind one address, so a stranger guessing from a carrier address uses up the same 5-a-minute as the farm's own staff on that carrier.

**Fix (should).**

- Count sign-in failures per login address in an after hook on `/sign-in/email`, backing off rather than locking out.
- Write the farm's guessing limits down in one place: sign-in, codes, PINs, and what a malicious lockout costs. That is 6.1.1.
- At go-live, confirm with one `curl -H 'X-Forwarded-For: 1.2.3.4'` that the header the app sees holds one address.

### 1.6 `join` does not say whether a phone is an Investor's: _has_

ASVS 6.3.8 (L3), recorded because the ticket asks.

- `join` gives the same `wrong_code` answer for an unknown phone, a wrong code, an expired code and a missing Investor (`portal-store.ts:270-302`).
- `portal_closed` and `password_too_short` are decided before any phone is looked up (`:247-261`), so they say nothing about a person.
- Both known and unknown phones cost the same single lookup (`:280-292`). Only a string that is not a mobile number returns earlier, and that fact is public anyway.

### 1.7 Sign-in says whether a phone is an Investor's, without the password: _lacks_

ASVS 6.3.8 (L3): "valid users cannot be deduced from failed authentication challenges, such as by basing on error messages, HTTP response codes, or different response times". It is level 3, but the fact it gives away is that a named person has money in the farm's Ventures. That is financial personal data, which ticket 01 asks about.

The door's sign-in hook (`packages/auth/src/index.ts:98-115`) runs _before_ better-auth checks the password. For an address with a portal access row, it answers `403` with `portal.closed` in the Investor's own language when any of these holds:

- the portal is switched off;
- the Investor's access was taken away;
- the account is disabled.

Every other address gets better-auth's `401` "Invalid email or password". better-auth pads the unknown-user case to the same timing (`better-auth/dist/api/routes/sign-in.mjs:318-327`).

The login address is made from the phone by a public rule (`packages/domain/src/investor-login.ts:27-30`), so a guesser only needs phone numbers, and any password will do:

- **Portal switched off (the default, and the lawyer's "no").** Every phone the Owner ever invited answers differently from a stranger's.
- **Portal switched on.** Every phone whose access was taken away does.

A list of a few hundred numbers is checked within the hour at 5 a minute. Staff have the same leak: a disabled staff member's address answers `auth.noLongerHere` whatever the password (`:116-121`).

The existing tests sign in with the right password (`routers/portal.test.ts:186-220`), so none of them shows the wrong-password case.

This was read from code, not run. Hooks registered under `hooks.before` run before the endpoint's handler, which is where better-auth checks the password.

**Smallest fix.** Say "closed" or "no longer here" only to somebody who got the password right:

1. Move both checks from the before hook into a `hooks.after` on `/sign-in/email`.
2. When `ctx.context.newSession` is set and the account is refused, delete that session and throw the same `403`.
3. Leave the before hook to answer nothing for sign-in.
4. Add a wrong-password test that expects `401`.

### 1.8 Default accounts: _n/a_ for the portal

ASVS 6.3.2 (L1). There is no default account. Before a Farm exists, the first account opened becomes the Owner (`packages/auth/src/index.ts:48-52`). The runbook closes that window at go-live (`docs/runbooks/deploy.md:47-49`), and it is the farm's step, not the portal's.

---

## 2. Sessions

### 2.1 Cookie flags: _has_ in production

ASVS 3.3.1 (L1): "cookies have the 'Secure' attribute set, and if the '__Host-' prefix is not used for the cookie name, the '__Secure-' prefix must be used".

better-auth 1.7.3 (`better-auth/dist/cookies/index.mjs`, `createCookieGetter`) sets:

- the `__Secure-` prefix and `Secure` whenever `useSecureCookies` is true, which it is when `NODE_ENV` is `production` (`packages/auth/src/index.ts:232-236`);
- `HttpOnly`, which is 3.3.4 (L2);
- `SameSite=Lax`, which is 3.3.2 (L2);
- `Path=/` and no `Domain`, so the cookie is host-only.

`__Host-` (3.3.3, L2) is not used. It is optional at level 1.

### 2.2 Session tokens: _has_

ASVS 7.2.1-7.2.4 (L1). Sessions are rows in the database, checked by the server on every request (`packages/api/src/context.ts:406-407`, `packages/api/src/index.ts:9-25`). better-auth mints a new random token at every sign-in.

### 2.3 The 12-hour end holds only inside the portal's own procedures: _has_, with a gap

ASVS 7.3.2 (L2, absolute lifetime) and 7.3.1 (L2, idle timeout).

**What it has.** `investorProcedure` ends a sign-in more than 12 hours old and sends the Investor back to sign in (`routers/portal.ts:53-61`, `portal-store.ts:391-408`). The screen says why (`routes/portal/_in.tsx:41-43`).

**The gap.** The session row itself lives 7 days (`packages/auth/src/index.ts:228`), and the cookie's `Max-Age` is the same. Between hour 12 and day 7, the cookie still works everywhere that is not an `investorProcedure`:

- better-auth's `/get-session`, which answers with the Investor's name and phone-made address;
- `/update-user`, which renames the account (see 6.2);
- `/list-sessions`;
- `/change-password`, which still needs the current password;
- the role-free procedures in 6.1.

Nothing financial is exposed, but the rule is not what the screen promises. There is also no idle timeout, so a phone put down on a table stays open for the rest of the 12 hours.

**Fix (should).**

1. Give an Investor's session 12 hours when it is made, with better-auth `databaseHooks.session.create.before`: when the user has an `investor_access` row, set `expiresAt` to now plus 12 hours. better-auth then ends it everywhere, and the check in `investorProcedure` stays as a second guard.
2. Sign Investors in with `rememberMe: false` (`routes/portal/login.tsx:42`, `routes/portal/join.tsx:42`), so the cookie ends with the browser session. That is only partial on Android Chrome, which restores sessions.

### 2.4 Signing out, being taken away, changing a password: _has_

- **7.4.1 (L1), sign-out ends the session.** The portal's sign-out (`components/portal/portal-shell.tsx:237-246`) calls better-auth `/sign-out`, which deletes the session row (`better-auth/dist/api/routes/sign-out.mjs:50`). The 12-hour end expires the row (`portal-store.ts:399-408`).
- **7.4.2 (L1), a disabled account's sessions end.** Taking access away disables the account and deletes every session it has (`portal-store.ts:225-231`).
- **7.4.3 (L2), other sessions end after a password change.** Changing the password signs out other sessions (`account.tsx:128`). Taking up a new code sets the password through a reset, which revokes sessions too (`packages/auth/src/index.ts:215`).
- **7.5.2 (L2), the user can see and end their sessions.** An Investor sees where they are signed in and signs the rest out (`routers/portal.ts:135-143`, `account.tsx:227-254`).
- **Portal switched off.** Existing sessions stay, but every portal procedure refuses them (`routers/portal.ts:45`) and so does sign-in.

### 2.5 What an Investor read stays on the phone after they sign out: _lacks_

ASVS 14.3.1 (L1): "authenticated data is cleared from client storage, such as the browser DOM, after the client or session is terminated".

The app keeps every successful query in IndexedDB (`openfarm-queries`) for 14 days (`apps/web/src/lib/query-cache.ts:12`, `:84-97`, wired at `apps/web/src/router.tsx:14`). The portal's queries are kept like any other. On sign-out, the portal calls `authClient.signOut` and navigates away (`portal-shell.tsx:237-246`). It does not clear the query client or IndexedDB, and neither does the 12-hour end (`_in.tsx:41-43`).

So after an Investor signs out on a shared phone, all of this stays in the browser's storage for a fortnight, readable by anybody who has the phone and opens developer tools:

- their capital account and every Venture's figures;
- their record: address, nominee's name and phone, and the masked NID and bank account;
- the text of any paper they opened.

It also stays in memory in the same tab until the page reloads.

There is a likely second effect, read but not run. oRPC's query keys name the procedure and its input, not who asked. A second Investor signing in on the same phone could therefore briefly see the first one's portfolio drawn from the cache before it refetches.

**Smallest fix.**

1. On the portal's sign-out, and before the redirect at the 12-hour end, `await forgetWhatThisPhoneRead(queryClient)`. It already exists, for Shed Phones (`query-cache.ts:107-115`).
2. Do not keep portal answers on the device at all. In `keepQueriesOnDevice`'s `shouldDehydrateQuery` (`query-cache.ts:94`), skip queries whose key starts with `portal`. An Investor has no offline need.

The staff sign-out has the same gap (`components/user-menu.tsx:163`), which is outside this review.

---

## 3. Security headers, CSP and framing

`apps/web/src/server.ts:3-30` wraps every response that passes through the TanStack Start handler. It sets:

- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `Content-Security-Policy: base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'`;
- a `Permissions-Policy`;
- in production, `Strict-Transport-Security: max-age=31536000; includeSubDomains`.

### 3.1 HSTS: _has_, not verified on static files

ASVS 3.4.1 (L1): a `Strict-Transport-Security` header "on all responses" with at least a year's max-age. Pages and API answers have it (`server.ts:19-24`).

It was not checked whether Nitro serves the built files under `/assets` before this entry, in which case they go without it. At go-live, compare `curl -I` on `/` and on one `/assets/*.js`. If the asset lacks the headers, set the same headers at the proxy as well.

### 3.2 Framing: _has_

ASVS 3.4.6 (L2): "frame-ancestors directive of the Content-Security-Policy header field for every HTTP response". The portal cannot be framed: `frame-ancestors 'none'` plus `X-Frame-Options: DENY`. That rules out a clickjacked "sign out other devices" or password change.

The print frame is a `srcdoc` frame the page makes itself (`lib/print-alone.ts:43-56`), so `frame-ancestors` does not apply to it.

### 3.3 A CSP that restricts scripts: _lacks_, level 2

ASVS 3.4.3 (L2) asks for a policy that "includes the directives object-src 'none' and base-uri 'none' and defines either an allowlist or uses nonces or hashes". The policy has `object-src 'none'`, but `base-uri 'self'` rather than `'none'`, and no `script-src`. The comment says why: the theme script and the server render write inline scripts (`server.ts:8-10`). As it stands, the CSP does not stop an injected script, and does not stop one sending data elsewhere.

Level 1 does not require this, and no raw-HTML sink was found (4.1).

**Fix (should).**

- Mint a nonce per request in `server.ts` and pass it to the router's `ssr.nonce` option, which the installed `@tanstack/router-core` 1.171 has (`router.d.ts:371`). Give the theme script the same nonce.
- Add `script-src 'self' 'nonce-…'`, `connect-src 'self'` and `base-uri 'none'`.

### 3.4 CORS: _has_

ASVS 3.4.2 (L1). No `Access-Control-Allow-Origin` is set anywhere in `apps/web`, `packages/api` or `packages/auth`, so no other site can read an answer.

### 3.5 Forged requests: _has_

ASVS 3.5.1-3.5.3 (L1).

- **The API** (`apps/web/src/lib/rpc-door.ts:16-38`, used at `routes/api/rpc/$.ts:55-65`) refuses:
  - any request marked `Sec-Fetch-Site: cross-site`;
  - every GET except the development API reference;
  - any `Origin` other than the app's own.
- **better-auth** checks `Origin` against `trustedOrigins` (`packages/auth/src/index.ts:156-162`, `:186`).
- **The cookie** is `SameSite=Lax`.

### 3.6 Answers read in the wrong place, and caching: _has_

ASVS 3.2.1 (L1), 14.3.2 (L2).

- API answers are JSON, only to POST, with `nosniff`.
- Portal pages are drawn in the browser (`_in.tsx:15`, `ssr: false`), so the HTML carries no figures.
- Browsers do not cache POST answers.

The cache that matters is the app's own IndexedDB (2.5).

---

## 4. Printed papers

### 4.1 A paper's text cannot carry HTML: _has_

ASVS 1.2.1 and 3.2.2 (L1).

- **On screen.** A paper is plain text made on the server (`packages/api/src/investor-papers.ts`). It is placed in a `<pre>` as a React text child (`apps/web/src/components/paper.tsx:63-65`), so React escapes it. `dangerouslySetInnerHTML` appears nowhere in `apps/web/src`.
- **Photographs.** They are `data:` URLs built from a stored content type and base64 (`paper.tsx:77-81`). Uploads are limited to JPEG, PNG and WebP (`routers/animals.ts:1065`), and an `<img>` never runs script anyway.
- **Printing.** `printAlone` builds a `srcdoc` from the page's own stylesheets and `element.outerHTML` (`lib/print-alone.ts:48-51`). `outerHTML` writes the already-escaped page back out, so an Investor named `<script>` prints as `&lt;script&gt;`. The only other value put in is the page's `lang`, which is the app's own `bn` or `en`. The frame is same-origin and gets the page's CSP.

### 4.2 Only the Investor's own papers: _has_

ASVS 8.2.2 (L1).

- `paper` and `venture` both call `requireTheirs` first (`routers/portal.ts:154-159`, `:234-239`).
- `requireTheirs` answers the same `NOT_FOUND` whether the Agreement belongs to somebody else or does not exist (`portal-store.ts:447-464`).
- Each paper read is an Export in the trail under the Investor's name.

---

## 5. Error bodies

### 5.1 Unexpected errors: _has_

ASVS 16.5.1 (L2): "a generic message is returned to the consumer when an unexpected or security-sensitive error occurs". oRPC turns anything that is not an `ORPCError` into `INTERNAL_SERVER_ERROR`, keeping the error only as `cause` (`@orpc/client/dist/shared/client.Cik8dxOF.mjs:8-10`). `toJSON` sends only `code`, `message` and `data` (`client.Dtv1JPkU.mjs:55-61`), so no stack or query reaches the caller.

### 5.2 The portal's own refusals: _has_

They are plain sentences with a refusal word: `not_an_investor`, `signed_in_too_long`, `wrong_code`, `portal_closed`, `password_too_short`, `no_such_agreement` (`routers/portal.ts:31-35`, `:57-60`; `portal-store.ts:107-108`, `:247-276`, `:458-461`). None of them names a table, an id or another person.

### 5.3 Validation failures and the API reference: _has_

- **Validation failures.** The body says "Input validation failed" and carries the Zod issues: which field, and which rule it broke (for example `code`, too small, minimum 4). It does not echo the value.
- **The API reference.** The generated reference answers 404 in production (`routes/api/rpc/$.ts:102-106`). That is 13.4.5 (L2).
- **better-auth.** It answers `{ code, message }`. The one difference that matters is 1.7.

### 5.4 A mistyped `join` writes the password into the server log: _lacks_

ASVS 16.2.5 (L2): "it may not be allowed to log certain data, such as credentials". It is level 2, but a password in a log is a password in every copy of that log.

The RPC handler logs every failure with `console.error(failure)` (`routes/api/rpc/$.ts:15-21`). When input fails validation, oRPC attaches a `ValidationError` as the cause, and its `invalidData` is the whole input (`@orpc/contract/dist/shared/contract.DXyrtpyP.mjs:163-175`).

**Run.** A probe with the portal's `join` schema and this same interceptor, on oRPC 2.0.0-beta.35, sent a two-letter code. It printed this to stderr, which systemd writes into the journal:

```
invalidData: { phone: '01711111111', code: 'AB', password: 'hunter2-secret-pw' }
```

**Who triggers it.** The join screen only checks that the code is not empty (`routes/portal/join.tsx:57`). The schema wants at least 4 characters (`routers/portal.ts:78`). So any of these writes the chosen password to the log:

- an Investor who types three characters of their code;
- anybody who sends a password over 128 characters;
- anybody who sends a phone over 30 characters.

The staff password-by-code (`routers/people.ts:607-613`) does the same for a new password under 8 characters.

**Smallest fix.** Log the procedure path, `code` and `message` of an `ORPCError`, never its `cause`. Keep logging the full error only for failures that are not `ORPCError`, which are the real bugs. Also check that evlog's request event does not capture request bodies.

---

## 6. Who may call what

### 6.1 Only an admitted Investor reaches the portal, and an Investor reaches nothing else: _has_

ASVS 8.2.1 and 8.3.1 (L1).

- **The portal's own procedures.** `investorProcedure` requires three things (`routers/portal.ts:42-65`):
  - the portal switched on;
  - no Role on the farm;
  - an accepted access that has not been taken away (`portal-store.ts:411-422`).
- **The Owner's portal procedures** are `requireOnly("owner")` plus `requirePersonalSession()` (`routers/investors.ts:232-238`, `:356-395`).
- **The farm's procedures.** Every farm procedure has a Role gate except six. A script over `packages/api/src/routers` found:
  - `people.me`
  - `farm.current`
  - `farm.bootstrap`
  - `language.get`
  - `language.set`
  - `privateData`

  An Investor learns only their own name and the farm's name from these. `farm.bootstrap` refuses once a Farm exists (`routers/farm.ts:183-188`). `privateData` (`routers/index.ts:97-100`) is the starter template's leftover and echoes the caller back. It is harmless and can go.

### 6.2 better-auth lets an Investor rename their own account: _lacks_, minor

better-auth's `/update-user` is open to any session. The name an Investor sets becomes the actor name the trail writes beside their Exports (`context.ts`, `resolvePerson`).

**Fix (should).** In the door hook, refuse `/update-user` for addresses under the Investor login domain (`isInvestorLogin`, `investor-login.ts:33-34`), except for `language`.

### 6.3 Two takers of one code: _lacks_, low

`takeUpInvitation` sets the new password (`portal-store.ts:303-312`) _before_ the transaction that uses up the code (`:326-347`). Two requests racing with the same valid code can both set a password, and then one of them is refused, but its password may be the one that stands.

**Fix (should).** Use up the code first, then set the password.

---

## 7. Staff and Investors on one address

**The observed behaviour.** On 2026-09-25, a browser signed in as an Investor sent the Owner's pages to `/portal`. That is the app doing what it was written to do with the one session a browser holds:

- the farm's layout sends a signed-in Investor to `/portal` (`routes/_auth/route.tsx:108-111`);
- the portal sends anybody who is not an Investor to `/dashboard` (`routes/portal/_in.tsx:31-33`);
- both login pages send somebody already signed in onwards (`routes/login.tsx:45-53`, `routes/portal/login.tsx:132-142`).

There is one session cookie per origin, so one browser holds one person. What follows from that:

- **One person per browser.** The Owner cannot be signed in to the farm and to an Investor account in the same browser. To sign one in, the other must sign out, and a browser that only lost its cookie leaves its session row alive for up to 7 days. It is not a leak, but it means the Owner's "see as they do" preview (ticket 03) must not be built by signing in as the Investor in the Owner's browser.
- **One origin for scripts.** The portal and the farm app are one build, under one service worker and one CSP. A script that ever gets into any page of the farm app would run as whoever is signed in there, whether that is an Investor or the Owner. No such flaw was found. This is about how far one would reach: the farm app is large and full of text staff type in, and every piece of it shares the portal's origin.
- **One storage.** The query cache, the Outbox and the Shed Phone token all live per origin, so whoever uses the browser next inherits what the last person read (2.5). The browser's own "wipe this site" header, `Clear-Site-Data: "storage"`, cannot be sent at portal sign-out, because on this origin it would also wipe a milker's unsent Outbox.
- **One set of headers.** A stricter CSP for `/portal/*` alone is weak, because pages on one origin can script each other.
- **One limiter.** Investors and staff share sign-in's 5-a-minute per address, which matters behind carrier-shared addresses (1.5).

## Would a separate address help?

A subdomain such as `investors.<farm-domain>` would **reduce** four findings and **remove none**. The must-fix list below is the same whichever way ticket 05 decides.

**What it reduces.**

- **Separate storage (2.5 and 7).** The portal would get its own storage, so its sign-out could safely send `Clear-Site-Data: "cache", "cookies", "storage"`. There would be no Outbox to wipe, and the portal could keep nothing on the device at all. It still has to clear its cache on sign-out, but the browser could then enforce it.
- **Separate sessions (7).** better-auth's cookie is host-only (no `Domain`), so each address would hold its own session. The Owner could be signed in to both, and the redirect seen on 2026-09-25 goes away.
- **How far one flaw reaches (7).** A flaw in the large staff app would no longer run on the portal's origin. The two addresses are still one _site_, so `SameSite=Lax` does not separate them. The separation holds only while the farm's `/api/rpc` door keeps trusting its own origin alone (`rpc-door.ts:33-37`, `routes/api/rpc/$.ts:50-52`). better-auth's single `trustedOrigins` would have to list both, which lets a portal page call the farm address's `/api/auth` with the Owner's cookie. The ways out are a second better-auth instance or an origin check per host.
- **A strict CSP (3.3).** A policy per origin is meaningful where one per path is not. The proxy could also serve only the portal's own paths on that host: `/portal/*`, the assets, the sign-in, sign-out, session and password routes of `/api/auth`, and `/api/rpc/portal/*`, `people/me` and `language/*`.

**What it does not remove.** The farm's own address stays public, because staff reach it on mobile data, so the total surface on the internet does not shrink. And it does nothing for:

- `join`'s missing address limit and unbounded memory (1.2);
- common passwords (1.4);
- the sign-in answer that names Investors (1.7);
- the password in the log (5.4);
- a session that outlives its 12 hours (2.3).

HSTS already carries `includeSubDomains` (`server.ts:22`), which covers a subdomain once the parent has been visited.

**What it costs**, which is ticket 05's to weigh:

- a certificate, or a wildcard;
- a per-request base URL in better-auth. The object form of `baseURL` exists in 1.7.3 (`cookies/index.mjs`, `isDynamicBaseURLConfig`); whether it fits is not checked here;
- `trustedOrigins` kept apart per host;
- one more address on the welcome sheet.

---

## Must fix before the first Investor

1. **Stop logging the input of a failed call** (5.4). `routes/api/rpc/$.ts:15-21` puts an Investor's chosen password into the journal whenever `join` fails validation. Log the path, code and message only.
2. **Clear what the portal read at sign-out and at the 12-hour end, and never keep portal answers on the device** (2.5, ASVS 14.3.1, L1). Change `portal-shell.tsx:237-246`, `_in.tsx:41-43` and `query-cache.ts:94`.
3. **Say "closed" or "no longer here" only after the right password** (1.7). Move the sign-in checks at `packages/auth/src/index.ts:98-121` into an after hook, so a phone number alone does not tell a stranger who invests with the farm.
4. **Give `portal.join` a per-address limit and bound the wrong-guess memory** (1.2, ASVS 6.3.1, L1). It is the portal's one new public door, and today it takes unlimited requests and can grow memory until the server restarts. Change `portal-store.ts:264-276` and `attempts.ts`.
5. **Refuse the most common passwords at `join` and at password change** (1.4, ASVS 6.2.4, L1). The phone number is no secret, so the password is the only one.

Also at go-live, which is not code:

- confirm the proxy _sets_ `X-Forwarded-For` (1.5);
- confirm `/assets/*` carries the security headers (3.1).

## Should fix

- **The 12-hour end.** End an Investor's session at 12 hours inside better-auth itself (`databaseHooks.session.create.before`), and sign Investors in with `rememberMe: false` (2.3).
- **Per-account counting.** Count sign-in failures per login address with a back-off, and write the farm's guessing limits down in one place (1.5, ASVS 6.1.1).
- **A CSP that restricts scripts.** Add a nonce-based `script-src`, plus `connect-src 'self'` and `base-uri 'none'` (3.3, ASVS 3.4.3, L2).
- **Headers at the proxy.** Set the security headers there as well as in `server.ts`, so static files carry them (3.1).
- **Renames.** Refuse `/update-user` renames for Investor accounts (6.2).
- **The code race.** Use up an invitation code before setting the password it came with (6.3).
- **The template leftover.** Delete `privateData` (6.1).
- **Staff sign-out.** It leaves the cache behind too (`components/user-menu.tsx:163`); same fix as 2.5, outside the portal.

---

## Sources

- OWASP Application Security Verification Standard 5.0.0, May 2025 ([project page](https://owasp.org/www-project-application-security-verification-standard/); version and date from [`5.0/en/0x00-Header.yaml`](https://github.com/OWASP/ASVS/blob/master/5.0/en/0x00-Header.yaml)). Requirement text is quoted from the chapter files:
  - V1 Encoding and sanitization, 1.2.1: [`0x10-V1-Encoding-and-Sanitization.md`](https://github.com/OWASP/ASVS/blob/master/5.0/en/0x10-V1-Encoding-and-Sanitization.md)
  - V3 Web frontend security, 3.2.1, 3.2.2, 3.3.1-3.3.4, 3.4.1-3.4.6, 3.5.1-3.5.3: [`0x12-V3-Web-Frontend-Security.md`](https://github.com/OWASP/ASVS/blob/master/5.0/en/0x12-V3-Web-Frontend-Security.md)
  - V6 Authentication, 6.1.1, 6.2.1-6.2.8, 6.3.1, 6.3.2, 6.3.8, 6.4.1, 6.4.2: [`0x15-V6-Authentication.md`](https://github.com/OWASP/ASVS/blob/master/5.0/en/0x15-V6-Authentication.md)
  - V7 Session management, 7.2.1-7.2.4, 7.3.1, 7.3.2, 7.4.1-7.4.3, 7.5.2: [`0x16-V7-Session-Management.md`](https://github.com/OWASP/ASVS/blob/master/5.0/en/0x16-V7-Session-Management.md)
  - V8 Authorization, 8.2.1, 8.2.2, 8.3.1: [`0x17-V8-Authorization.md`](https://github.com/OWASP/ASVS/blob/master/5.0/en/0x17-V8-Authorization.md)
  - V13 Configuration, 13.4.5: [`0x22-V13-Configuration.md`](https://github.com/OWASP/ASVS/blob/master/5.0/en/0x22-V13-Configuration.md)
  - V14 Data protection, 14.3.1, 14.3.2: [`0x23-V14-Data-Protection.md`](https://github.com/OWASP/ASVS/blob/master/5.0/en/0x23-V14-Data-Protection.md)
  - V16 Security logging and error handling, 16.2.5, 16.5.1: [`0x25-V16-Security-Logging-and-Error-Handling.md`](https://github.com/OWASP/ASVS/blob/master/5.0/en/0x25-V16-Security-Logging-and-Error-Handling.md)
- **better-auth 1.7.3**, as installed in `node_modules`:
  - `@better-auth/core/dist/utils/ip.mjs`, for how the address is resolved;
  - `better-auth/dist/api/rate-limiter/index.mjs`, for the shared bucket when there is no address;
  - `better-auth/dist/cookies/index.mjs`, for cookie attributes;
  - `better-auth/dist/api/routes/sign-in.mjs`, for timing padding;
  - `better-auth/dist/api/routes/sign-out.mjs`, for session deletion.
- **oRPC 2.0.0-beta.35**, as installed: `@orpc/server` input validation and `@orpc/contract` `ValidationError`, for `invalidData`; `@orpc/client` `toORPCError` and `ORPCError.toJSON`, for error bodies.
- **@tanstack/router-core 1.171.29**, as installed: `router.d.ts`, for the `ssr.nonce` option.
