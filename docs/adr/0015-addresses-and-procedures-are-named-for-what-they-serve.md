---
status: accepted
date: 2026-10-03
---

# Addresses and procedures are named for what they serve

On 2026-10-03 the Owner asked for every route to be checked against the conventions an enterprise system is held to. The audit, with its sources, is in [`docs/research/route-naming-audit.md`](../research/route-naming-audit.md): Google's API Improvement Proposals, Microsoft's and Zalando's REST API guidelines, W3C's "Cool URIs don't change", and GOV.UK's URL standards. Every change it recommended was made that day. These are the rules a new page or procedure now follows.

**Page addresses**

- **Named for what the page is, in the glossary's words.** Use English, lowercase, with hyphens between words. A list is plural (`/sales`, `/sheds`), a mass noun or a single thing is singular (`/milk`, `/money`, `/farm`, `/overview`), and a door says what it does (`/sign-in`, `/shed-phone`). The name follows the page's title, as GOV.UK asks: `/inspector-view`, not `/registration-certificate`.
- **Never named for who may open it.** There is no `/admin`: W3C names grouping by access as the way addresses break, and it already had (the audit log needed an exception). Each page carries its own `beforeLoad: onlyFor(…)` instead. The only exceptions are the Role start pages fixed in the glossary, `/home` and `/vet`.
- **A path names a thing; a query filters it.** A tab that is a different kind of record, and that other screens link to, has its own path. Examples are `/money/receivables`, `/animals/$tagNumber/health` and `/ventures/$ventureId/investors`. The page is a layout that draws every tab itself, using `useTabOfPath` (`apps/web/src/lib/path-tabs.ts`). A tab that only narrows one list stays in the query: `/ventures?tab=settled`, `/portal/agreements?tab=finished`.
- **Parameters are named for what they identify**, and give one address per thing: `$agreementId`, not `$ventureId`, on an Agreement's page. `/animals/$tagNumber` uses the Tag Number, which is permanent (CONTEXT.md). An address in lower case is sent to the one in capitals.
- **One address for one page.** `/` sends a signed-in person to their Role's start page, and there is no `/dashboard` beside it.
- **An address held outside the code keeps a permanent redirect (308)** when it moves. The ones held so far are `/today` (an installed app opens there), `/login`, `/portal/login` and `/device`. An address only the code links to moves without one, because the compiler moves every typed link with it.

**API routers and procedures** (oRPC, `/api/rpc/<router>/<procedure>`)

- **A router is the camelCase name of what it serves**, plural for a collection and singular for a mass noun or a single thing. It matches its page: `sales`, `readyForSale`, `work` (not `instances`), `sheds`, `overview`, `monthlyReport`, `inspectorView`. Its file has the same name in kebab-case (`routers/ready-for-sale.ts`).
- **A router that holds more than one kind of thing nests one router per kind**, plural and with the same verbs (AIP-121, AIP-122): `feed.items.restore`, `feed.rations.assign`, `money.categories.create`, `sheds.pens.rename`, `sops.proposals.approve`. A Venture's parts are nested the same way: `ventures.plan`, `.requests`, `.agreements` (with `.offers` and `.amendments`), `.floats`, `.settlement` (with `.adjustments`) and `.movements`. An act on the Venture itself, such as `open`, `cancel` or `takeCapital`, stays on `ventures`. A procedure never spells its noun into its verb (`restoreItem`).
- **`list` and `get` read the router's own resource**: `animals.get`, `backups.list`. Any other read is named for what comes back, with no preposition and no screen word. One idea gets one spelling: `forAnimal` in every router.
- **`create` makes something the farm defines** (a Breed, a Category, a Feed Item). **`record` writes down something that happened.** **`correct…` puts it right.** **`retire` and `restore`** take something out of use and back, as the code already said in `restoreMembership` and the notice `sop_restored`. The backup's Restore Drill is a different thing, which nobody confuses with a Breed put back in use.
- **`me` is the caller's own record, and `mine` is the caller's own items**: `people.me`, `alerts.mine`, `money.mine`. Inside `portal`, everything is the Investor's own, so it is `portal.requests`.
- **Every other act is a verb and a noun in the farm's own words** (`closeAsMissed`, `inviteToPortal`), not a create or update in disguise. `subscribe` and `unsubscribe` are the browser's own words for push.
- **The Investor address's security allowlist names three routers**: `portal`, `people.me` and `language` (`two-addresses.ts`, `query-cache.ts` and the nginx block in `docs/runbooks/deploy.md`). None of them is renamed without changing all three.
- **Renaming a router or procedure renames the phone's kept cache too** (`CACHE_KEY`, `apps/web/src/lib/query-cache.ts`), because a query is kept under its path. A moved page bumps the service worker's shell (`SHELL`, `apps/web/public/sw.js`).

**Settled the same day**, once the words were chosen:
- Feed coming into the store is the glossary's **Feed In**, as its table `feed_in` already was. It has the path `/feed/feed-in` and the procedure `stock.feedIn`.
- The reads that were named after their screens are named for what they return: `returns.list`, `fattening.list` and `inspectorView.get`.

**Left open:** whether `devices` becomes `shedPhones`. "Device" also names the session behind a Shed Phone, so it waits until the device code is touched.

**Revisit** if anything outside the farm will ever call the API. It would then get its own versioned, resource-shaped surface, and the RPC paths would stay the app's own.
