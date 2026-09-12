# 23 — Digests and quiet hours

**What to build:** The Manager's phone stays quiet unless it matters. Overdue work and the safety Alerts arrive the moment they happen; everything else waits and arrives together in a morning and an evening digest. Quiet hours hold the non-urgent ones until morning. The times are farm parameters, because a farm that milks at four is not a farm that milks at six.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 2, user story 92.

- [x] Each Alert kind is either immediate or digestible, decided in one place and visible in the code as such
- [x] Digest times and quiet hours are farm parameters with sensible defaults
- [x] A digest names what is in it and links to each thing; an empty digest is not sent
- [x] Nothing is lost to quiet hours — held, then delivered, and still in the in-app list throughout
- [x] Tests drive the clock across a quiet period and both digest times, and assert what was pushed and when

**How it was built.**

- **One table decides how everything travels.** `DELIVERY` names each kind of notice as immediate or digestible, typed by the kind — so a new kind of notice cannot be added without somebody deciding which it is. That decision _is_ the farm's notification table, and it is now in the code rather than in a document beside it.
- **A digest is a moment, not a window.** The first cut carried the post whenever a digest time had passed that day, which meant every app-open between six in the morning and ten at night sent whatever had just been raised — a running commentary with a digest's name on it. What is carried now is everything raised _before_ the most recent carrying moment; everything since waits for the next one. That is the difference between a digest and a notification.
- **A digest time inside quiet hours is not a carrying moment.** It waits for the farm to wake, because a batch of things that could wait is exactly what quiet hours are for. Two digest times that both fall asleep collapse into one waking moment: a person is woken once.
- **Whoever opens the app first carries the post.** There is nothing else to run it — the same pattern the Alert sweep has used since increment 1 — and it is safe to call as often as anybody likes, because a notice is stamped when it is carried. A timer on the deploy host can call it too; neither is troubled by the other doing it first.
- **Nothing is lost.** The stamp goes on whether or not a push got through: the notices are in the app either way, and a digest that retried for ever would carry the same fortnight every evening.
- **An empty digest is not sent.** A farm whose phone buzzes to say nothing happened is a farm that stops reading the ones that say something did.

**What the farm can set:** when its post is carried, and when it is asleep. Both are farm parameters, and a time of day that is not one is refused rather than quietly rewritten.

**Review outcomes folded in.** Two of these were the repo telling me a rule it had already written down twice.

- **The pushes were inside the audited transaction.** `push-send.ts` says why in its own words — a lock held across a call to somebody else's server is a lock every phone in the shed waits on, and a push sent before the transaction commits can buzz a pocket about something the farm then rolls back — and the Alert sweep restates it forty lines above where I put this. Claiming and telling are separate now: the claim is one statement in a transaction, the telling happens outside it.
- **Two phones at six o'clock both carried the same post.** Reading the waiting notices and stamping them afterwards is not a claim; the second phone read the same rows before the first had stamped them, and both pushed. It is one `update … where carried_at is null returning` now, so the post is claimed by whoever gets there first and carried once.
- **Quiet hours had a hole the size of a night.** The code asked whether a carrying moment had passed, but never whether the farm was asleep _now_: a notice from two in the afternoon that nobody collected, and a Manager glancing at their phone at half past midnight, would have set every phone on the farm buzzing. There is a test for that night.
- **Two tables decided how a notice travels** — the farm's delivery table, and whether the code happened to have push wording for that kind. Giving a digest kind a title would quietly have made it an Alert. One table decides; the wording is only wording.
- **The digest counted rather than named.** "Three things waiting" is a number somebody has to go and identify, and a number people learn to ignore. It says what is in it now.
- **The trail was written on every app-open**, including the ones that carried nothing, with an entityId no row carries and a payload that did not say what was carried. Nothing to carry writes nothing; what is written says how many people, how many browsers heard, and what the post covered.
- Also: the farm day rather than the UTC date, so half past midnight is not stamped yesterday; quiet hours that begin when they end are refused rather than silently meaning "never quiet"; and one place tells one browser one thing, rather than two copies of the same loop.

**A trade-off worth naming.** A claimed notice is stamped whether or not a push reaches anybody — a person with no browser subscribed has their post marked carried and never hears a buzz. That is deliberate: the stamp is what makes the post go once, and the notices are in the app either way, which is where the farm's record of them has always been. The trail now records how many browsers actually heard, so a farm can see the difference between a post carried and a post delivered.

**Named, and written down.** **Quiet Hours** is a glossary entry now — it was a phrase inside the definition of Alert while being a pair of columns, a predicate and a rule about the in-app list. The **Digest** entry no longer says 06:00 and 18:00 as though they were fixed; they are the farm's to set.

**What the notification table still owes.** Three rows in the decision document name events that exist today and have no kind yet: an SOP proposal waiting for the Owner, work reassigned to its new assignee, and — the one that matters — _sync problems_, which story 92 lists among the immediate Alerts. The batch path produces rejected entries with nothing telling the person. The delivery table is the right place for all three; the first two belong with the queues that tickets 24 and 25 put on screen, and the third should not wait that long.
