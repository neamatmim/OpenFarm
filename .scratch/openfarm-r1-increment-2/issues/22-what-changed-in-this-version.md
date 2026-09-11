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

- **"Raises an Alert"** — the notification table says *"New SOP Version published | everyone in the assigned role | digest"*, and the glossary reserves **Alert** for what costs money or breaks a legal deadline if missed, ignoring quiet hours. A changed procedure costs nothing if it is read at six in the morning. The notice is written and shown in-app, and it is not pushed; ticket 23 will batch it into the morning and evening digests with everything else that is not an Alert.
- **"Acknowledging is recorded"** — the same decision says *"the first instance a person opens on it carries a 'changed' marker with what changed; no separate acknowledgement step in R1"*. So there is no button. The marker stays on the work until that person has recorded something on the new Version, which is better evidence that they read it than a button is: a button between somebody and the job is a button that gets pressed without reading.

**How it was built.**

- **The differences are in the words of the job.** Steps are matched by their id, so a reworded Step reads as a rewording rather than as one Step gone and another arrived. A new Step, a Step that is gone, different words, something else to record, a different time, a longer grace, somebody else doing it — that is what a person notices. Who published it and when is on the Card.
- **The first Version of an SOP changed nothing.** It is the procedure, and saying "this changed" about it would be noise on the day the Playbook is first written.
- **Work already in hand is not swapped under the person doing it** (ADR 0001). The board runs the Version the Instance was raised on, and a test holds it to that across a publication.
