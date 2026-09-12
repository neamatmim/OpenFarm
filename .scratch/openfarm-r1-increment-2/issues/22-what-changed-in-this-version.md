# 22 — What changed in this Version

**What to build:** When the Owner publishes a new Version, the Staff who do that work are told, and the first time each of them opens the SOP they are shown what is different from the Version they were working to — added Steps, changed numbers, removed Evidence — in Bangla, before they start. Nobody follows the old procedure because nobody told them.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 2, user story 93.

- [x] Publishing tells the people whose Role the SOP is assigned to — in the digest, not as an Alert; see below
- [x] The first open after publication shows what changed, as differences a person can read, not a JSON diff
- [x] The notice does not reappear for ever, and the farm can show who saw it — by the work itself rather than by an acknowledgement; see below
- [x] An in-flight Instance still runs on the Version it started on, and says so
- [x] Tests cover publishing, the first open, the second open, and an Instance that predates the change

**Two of this ticket's own criteria were wrong, and the farm had already said so.** Both were my wording, and both are contradicted by answers the Owner gave when the release was mapped:

- **"Raises an Alert"** — the notification table says _"New SOP Version published | everyone in the assigned role | digest"_, and the glossary reserves **Alert** for what costs money or breaks a legal deadline if missed, ignoring quiet hours. A changed procedure costs nothing if it is read at six in the morning. The notice is written and shown in-app, and it is not pushed; ticket 23 will batch it into the morning and evening digests with everything else that is not an Alert.
- **"Acknowledging is recorded"** — the same decision says _"the first instance a person opens on it carries a 'changed' marker with what changed; no separate acknowledgement step in R1"_. So there is no button. The marker stays on the work until that person has recorded something on the new Version, which is better evidence that they read it than a button is: a button between somebody and the job is a button that gets pressed without reading.

**How it was built.**

- **The differences are in the words of the job.** Steps are matched by their id, so a reworded Step reads as a rewording rather than as one Step gone and another arrived. A new Step, a Step that is gone, different words, something else to record, a different time, a longer grace, somebody else doing it — that is what a person notices. Who published it and when is on the Card.
- **The first Version of an SOP changed nothing.** It is the procedure, and saying "this changed" about it would be noise on the day the Playbook is first written.
- **Work already in hand is not swapped under the person doing it** (ADR 0001). The board runs the Version the Instance was raised on, and a test holds it to that across a publication.

**Review outcomes folded in.** One of these was a crash on the job, and one was not this ticket's at all.

- **A missing message key was a white screen in the shed.** The banner looked up its wording by building a key from the change's own name and casting the type away, and an unknown key is `undefined.replace` — so adding a kind of change and forgetting its words would have taken down the work page for everybody doing that job. It is a typed map now, the way the Alert list already does it: a new kind is a compile error here rather than a blank screen there.
- **"Now signed off by: null."** A Version published with nobody checking it rendered the word null. A Role is named now, and "nobody" is a word the farm already has.
- **The banner could announce a change with nothing under it.** Reordering Steps, changing the purpose, the skip reasons, what a Step records, or the range on a figure all read as no change at all — while the banner still said the procedure had changed. All of those are differences a person notices on the job, so they are described now; and when two Versions really do differ only in ways nobody working would see, nothing is said at all. A banner that cries wolf is a banner people learn to tap past.
- **The diff was Bangla only.** The Step's words are carried in both languages and the reader gets theirs — and an English rewording is a rewording, which it was not before.
- **Somebody away for two publications saw only the last one.** The comparison is against the Version they last worked to, which the same question that clears the banner already knew.
- **"And says so" was never built.** The string existed; nothing rendered it. Work running on a superseded Version says which one it is on, rather than leaving somebody to wonder why the card on the wall differs.
- Times are in the reader's digits; the notice's key matches the naming of every other key; the cheap question is asked first, so most board loads read one row instead of three; and the glossary's **Alert** entry now says what makes one an Alert — that it goes _now_ — since the in-app list carries the quieter notices beside them.

**A defect from another ticket, found through this one.** A Shed Phone kept everything it had read across a PIN Switch. The server was always right about who was asking, but the phone's cache was not: with a minute's stale time and offline-first reads, the next milker to PIN in could be handed the last one's board and Alerts — one person's work on another person's screen, on the device the farm actually uses, every milking. The phone forgets what it read when the person at it changes. The reviewer found it because somebody else's completion was suppressing the changed banner; it was never only about the banner.
