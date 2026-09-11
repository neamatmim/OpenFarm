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

- **One table decides how everything travels.** `DELIVERY` names each kind of notice as immediate or digestible, typed by the kind — so a new kind of notice cannot be added without somebody deciding which it is. That decision *is* the farm's notification table, and it is now in the code rather than in a document beside it.
- **A digest is a moment, not a window.** The first cut carried the post whenever a digest time had passed that day, which meant every app-open between six in the morning and ten at night sent whatever had just been raised — a running commentary with a digest's name on it. What is carried now is everything raised *before* the most recent carrying moment; everything since waits for the next one. That is the difference between a digest and a notification.
- **A digest time inside quiet hours is not a carrying moment.** It waits for the farm to wake, because a batch of things that could wait is exactly what quiet hours are for. Two digest times that both fall asleep collapse into one waking moment: a person is woken once.
- **Whoever opens the app first carries the post.** There is nothing else to run it — the same pattern the Alert sweep has used since increment 1 — and it is safe to call as often as anybody likes, because a notice is stamped when it is carried. A timer on the deploy host can call it too; neither is troubled by the other doing it first.
- **Nothing is lost.** The stamp goes on whether or not a push got through: the notices are in the app either way, and a digest that retried for ever would carry the same fortnight every evening.
- **An empty digest is not sent.** A farm whose phone buzzes to say nothing happened is a farm that stops reading the ones that say something did.

**What the farm can set:** when its post is carried, and when it is asleep. Both are farm parameters, and a time of day that is not one is refused rather than quietly rewritten.
