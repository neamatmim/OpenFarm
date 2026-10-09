# Playbook and settings screens — survey 2026-10-07

Against main at 87b49dfe.

- The SOP editor lets the Owner build things publishing then refuses. Some cannot be fixed from the editor at all: a feeding, store count, medicine count or renewal Step, and any procedure without a time of day (by hand, or raised only by an event).
- The editor carries things the Owner cannot see. A Step picked as a service by mistake and then changed to milk still asks every milker for a straw number and a service time. It publishes with no warning.
- Choices and skip reasons carry meanings the farm acts on: heat raises AI work, "not found" opens a Missing. The editor does not show these meanings and does not protect them. Rewording a reason drops its meaning. Replacing a choice in place keeps the old meaning.
- A half-written procedure lives only in the page's memory. A sidebar click, a reload or Back loses it without a word.
- When publishing is blocked, the list says only "Step 2: something here cannot be published as it stands". It does not say which box or why. Two things the editor calls Ready are then refused with "look at each box".
- The Bangla help for times shows `০৫:০০`. Typing that is refused.
- Proposals: turning one down sends the label "কেন নয়" as the reason. The Manager is never told the answer. Approving a proposal written against an older Version quietly overwrites the newer one.
- The settings pages are mostly sound. What is left is small: bounds that are not shown, and one save button that sends two saves.

Proven findings were shown red by a temporary test in `apps/web/src/lib`, which was then deleted. Traced findings come from reading the code.

---

### W1. A feeding, store count, medicine count or renewal Step cannot be published from the editor — high, **Proven**

**What happens.** Choosing one of these four in the "What it records" select marks the Step "once per animal". It also locks the per-animal tick box. Publishing then refuses, for example "a Pen is fed once, not once per animal". The Owner has no way to untick the box. A probe applied each effect to a blank Step with its unit and choices filled in. Four of them stayed blocked on the per-animal rule: `feeding`, `stock_count`, `medicine_count` and `registration_renewal`. Feeding and the two counts are also given a number answer that needs a unit, but the standard procedures use a plain tick. Re-picking the effect on an adopted standard procedure breaks it the same way. The only way back is to cancel the whole draft.

**Why it matters.** A second feeding procedure, for example for a new Pen or a third feed time, cannot be written. The blocker message gives no hint why.

**What should happen.** `withEffect` should treat these four as done once, as it already does for bulk total, head count and cash count. Feeding and the two counts should get a tick, as the standard ones have.

**Where.** `apps/web/src/lib/sop-draft.ts:343-348` (the per-animal list), `:222-232` (`wantedEvidence`); `apps/web/src/components/playbook/sop-steps.tsx:314` (box disabled whenever an effect is set).

### W2. A procedure with no time of day cannot be written — high, **Proven**

**What happens.** A new procedure starts with a 05:00 schedule. Emptying the times box leaves a schedule with no times, and publishing refuses: "a schedule needs at least one time". Nothing in the editor removes the schedule itself. Ticking a weekday on a by-hand procedure creates the same empty schedule. The hint "Nothing raises this — the manager runs it on the day" never appears once a schedule exists, even an empty one.

**Why it matters.** The domain allows by-hand work, such as a quarterly deworming campaign. It also allows event-only work, such as an arrival check or a pregnancy check that must be "raised by a service and by nothing else". The Owner can get these only by adopting a standard procedure, and loses them if they touch its times box.

**What should happen.** An empty times box with no days ticked should drop the schedule trigger.

**Where.** `apps/web/src/lib/sop-draft.ts:59-104` (`withSchedule` always writes a schedule); `apps/web/src/components/playbook/sop-when.tsx:203` (the by-hand hint), `:373-380`; `packages/domain/src/sop.ts:737`.

### W3. A Step keeps answers from an effect it no longer has, and they are invisible — high, **Proven**

**What happens.** The test picked "service" on a Step, then "milk record", then filled the unit. The Step published with no blockers. It asks, as required, a litres figure **and** "স্ট্র নম্বর, বা কোন ষাঁড়" **and** "কখন পাল দেওয়া হলো", plus an optional "who served". `withEffect` keeps every answer after the first. The editor draws only the first answer, so the Owner never sees the other three. Choosing "no effect" after a service or a calving does the same.

**Why it matters.** Every milker, for every cow, would be made to type a straw number and a service time before the Step can be finished. The Owner would learn this from the shed, not from the editor.

**What should happen.** Changing the effect should keep only the answers that belong to the new effect. The editor should show every answer a Step asks for.

**Where.** `apps/web/src/lib/sop-draft.ts:313-314, 326, 339, 357` (`...rest` kept); `apps/web/src/components/playbook/sop-steps.tsx:50` (only `evidence[0]` drawn).

### W4. Choices and skip reasons carry hidden meanings the editor does not protect — high, **Proven**

**What happens.**

- Skip reasons are matched by their exact Bangla. Rewording "পশু পাওয়া যায়নি" to "পশুটি পাওয়া যায়নি" makes a new reason with no meaning. The test showed `{ bn: "পশুটি পাওয়া যায়নি" }` with no `means: "not_found"`. From then on the round opens no Missing.
- Choices go the other way. A choice changed in place, in a list of the same length, keeps its old value. The test replaced "গরম হয়েছে" with "খোঁড়া", and the new choice kept the value `heat`. Every limping sighting is then a Heat and raises AI work. The editor cannot tell a reworded choice from a replaced one.
- Neither box shows that a choice or reason means anything to the farm. A new reason can never be given a meaning.

**Why it matters.** A typo fix silently stops Missing animals being opened. A swapped choice sends the inseminator to lame cows. Neither shows on screen.

**What should happen.** Mark choices and reasons that carry a meaning, and keep that meaning with the reason when it is reworded. Do not let a different word inherit a meaning by its place in the list without the Owner saying so (see Owner choices).

**Where.** `apps/web/src/lib/sop-draft.ts:413-419` (`toBilingualList`), `:434-450` (`toChoices`); `packages/api/src/effects/observation.ts:43`, `packages/domain/src/standard-playbook.ts:173-180`.

### W5. A half-written procedure is lost without warning — high, Traced

**What happens.** The draft is plain `useState` in the Playbook page. A sidebar link, the back link, Cancel, a reload or a signed-out session all drop it. None of them asks first. The app has no leave guard anywhere (`useBlocker`/`beforeunload`), and the draft is not in the persisted cache.

**Why it matters.** Writing a procedure with ten Steps, its choices and its triggers takes a morning. One misclick loses it.

**What should happen.** Ask before leaving a changed draft. Keep the draft on the device until it is published or let go.

**Where.** `apps/web/src/routes/_authenticated/sops/route.tsx:89-92, 199`; `apps/web/src/components/playbook/sop-editor.tsx:232`.

### W6. The blocker list says where, not what — medium, **Proven**

**What happens.** The domain explains each problem in plain words, for example "a choice needs something to choose" or "an animal is moved one at a time". `blockerSaid` throws those words away and shows "ধাপ ১: এখানে কিছু এভাবে প্রকাশ করা যাবে না". A Step with its text written but no unit shows "ধাপ ১: বাংলায় লিখুন". The Owner looks at the Step text, sees Bangla, and is stuck: nothing on screen says the unit box is the one that needs Bangla. Two problems in one Step show as two identical lines. Nothing jumps to the Step.

**Why it matters.** The Owner cannot fix what they are not told. Together with W1–W3 the editor becomes a guessing game.

**What should happen.** Name the box ("ধাপ ১ — একক") and say why, in Bangla, one message per kind of problem. Link each line to its Step.

**Where.** `apps/web/src/lib/sop-blockers.ts:8-43`; `packages/i18n/src/messages/bn-core.ts:1359-1361`; `apps/web/src/components/playbook/sop-editor.tsx:259-267`.

### W7. The editor says Ready and the farm refuses with "look at each box" — medium, **Proven**

**What happens.** The editor checks only the domain's publish rules, but the server also checks the wire schema.

- A grace of 2000 minutes shows "Ready" and is refused: `graceMinutes <= 1440`. Decimals are refused the same way. The box shows no limit.
- A choice is stored with its Bangla words as its value, and a value may be at most 40 characters. "নাক দিয়ে পানি পড়ছে আর সকাল থেকে ঘন ঘন কাশি হচ্ছে" is 50, so it is refused.

Both come back as `common.figureRefused`: "যা লেখা হয়েছে খামার তা নিতে পারছে না: প্রতিটি ঘর দেখে আবার চেষ্টা করুন".

**Why it matters.** "Look at each box" on a page with forty boxes.

**What should happen.** Check the same limits in the editor and say them beside the box. Store a choice's value as a short key rather than its words.

**Where.** `packages/api/src/sop-content.ts:47, 112`; `apps/web/src/lib/sop-draft.ts:448`; `apps/web/src/components/playbook/sop-editor.tsx:141-151`.

### W8. Times typed in Bangla digits, as the Bangla help shows them, are refused — medium, **Proven**

**What happens.** The times hint in Bangla is "কমা দিয়ে, যেমন ০৫:০০, ১৬:০০". Typing exactly that gives `"০৫:০০" is not a time of day`, shown as "কখন কাজটি ওঠে: এখানে কিছু এভাবে প্রকাশ করা যাবে না", once per time. The list then shows the same times back in Bangla digits (`timeInDigits`). The farm's digest times box on Rules does the same: "১৮:০০" is refused with '"১৮:০০" দিনের কোনো সময় নয়'. Course times already accept Bangla digits (`latinDigitsOf`).

**Why it matters.** A Bangla reader follows the example on the page and is refused.

**What should happen.** Read Bangla digits as digits in both boxes, as `course-times.ts` does.

**Where.** `packages/i18n/src/messages/bn-core.ts:1309`; `apps/web/src/components/playbook/sop-when.tsx:373-380`; `packages/domain/src/sop.ts:379`; `apps/web/src/components/farm-parameters.tsx` (`changesOf`), `packages/api/src/routers/farm.ts:820`.

### W9. The editor's number boxes turn an empty box into 0 — medium, **Proven** (range) / Traced (others)

**What happens.**

- The Least and Most boxes show `0` when no range is set. Clearing a Most sets it to `0`, not "none". The test showed `outsideItsRange` then flags 12 litres as "above 0", so every cow is warned at the animal. A range can never be removed once typed.
- The grace box, cleared, becomes 0 minutes, so work is late the moment it is due.
- "Days after" works the same way.
- These are `type="number"` boxes, so Bangla digits typed into them are dropped or read as empty.

**Why it matters.** The Owner sees "Most: 0" and cannot tell "no limit" from "zero". A cleared box quietly changes what the shed is warned about.

**What should happen.** Empty means none. Show empty, not 0, when there is no limit.

**Where.** `apps/web/src/components/playbook/sop-steps.tsx:117-146`; `apps/web/src/components/playbook/sop-editor.tsx:146`; `apps/web/src/components/playbook/sop-when.tsx:160-167`.

### W10. English goes stale or goes missing — medium, **Proven** (choices) / Traced (rest)

**What happens.**

- Only the procedure's name has an English box. Purpose, Step text, unit, choices and skip reasons are Bangla only.
- When their Bangla is changed, the old English is kept. The test reworded "গরম হয়েছে" to "খোঁড়া" and the English stayed "In heat". A Step's text and purpose keep their old English the same way.
- Editing a unit goes the other way: it drops its English (`unit: { bn }`).

**Why it matters.** The Owner or Vet reading in English sees what a Step used to say, with nothing on screen to show it.

**What should happen.** Either offer English beside each Bangla box, or clear the English when the Bangla changes and say so (see Owner choices).

**Where.** `apps/web/src/components/playbook/sop-editor.tsx:66-81`; `apps/web/src/components/playbook/sop-steps.tsx:110, 298`; `apps/web/src/lib/sop-draft.ts:446`.

### W11. Proposals: the reason, the answer and the Version they were written against — medium, Traced

**What happens.**

- **Turning one down.** It sends `t("sop.rejectReason")` ("কেন নয়" / "Why not") as the reason, because the server requires one. The Owner never writes a reason. There is no confirmation and no toast.
- **The Manager's side.** The editor gives the Manager nowhere to say why they propose a change, so the Note column is always "—". The Manager is never told of approval or rejection. The list shows only pending proposals, so theirs simply vanishes.
- **Reading one.** The proposal sheet lists the Steps but not what changed, though `describeChanges` exists in the domain.
- **Approving an old one.** `basedOnVersionId` is stored but never read. Approving a proposal made against Version 3 after the Owner published Version 4 quietly replaces 4.
- **Editing an old Version.** The Owner's own Edit starts from the cached list, which may be up to 14 days old. Publish carries no "based on", so editing a stale copy also overwrites a newer Version.

**Why it matters.** The Owner's decision and its reason never reach the person who asked. A change can be undone by approving an older one, and nobody notices.

**What should happen.** Ask for the reason, and let the Manager write one when proposing. Tell the proposer the answer. Show what changed. Refuse, or warn, when the Version has moved on since the proposal or the edit began.

**Where.** `apps/web/src/routes/_authenticated/sops/route.tsx:163-184, 280-282`; `apps/web/src/components/playbook/proposals-tab.tsx:77-110, 205-300`; `packages/api/src/routers/sops.ts:431, 691, 721-818`.

### W12. The editor sees one answer per Step and has no preview — medium, Traced

**What happens.**

- The editor draws only a Step's first answer: its kind, and its unit, range or choices.
- It cannot add a second answer, for example a tick and a photo, or a figure and a note. It cannot make an answer optional, so every new answer is required, including a photo of every animal.
- It cannot show or edit the labels the service and calving answers carry.
- It cannot show what a milker's phone will draw for the Step.

**Why it matters.** The Owner cannot write what the standard procedures themselves contain, such as the cash count's figure and note. They cannot check a Step before the shed meets it. This is how W3 stays hidden.

**What should happen.** List every answer with its label and whether it is required. Add a "how the phone shows it" view of a Step.

**Where.** `apps/web/src/components/playbook/sop-steps.tsx:42-151`.

### W13. Skip reasons of a dose or service Step are hidden — low, Traced

**What happens.** The skip reasons box shows only when a Step is per animal. A prescribed dose and a service may be skipped without being per animal (`maySkip`). For example, the standard dose Step carries "ওষুধ শেষ". For such a Step the reasons are kept but cannot be seen or edited. A new dose procedure cannot be given any.

**What should happen.** Show the box whenever `maySkip(step)` is true.

**Where.** `apps/web/src/components/playbook/sop-steps.tsx:325`; `packages/domain/src/sop.ts` (`maySkip`).

### W14. Rules and alerts: bounds not shown, browser bubbles in the browser's language — low, Traced

**What happens.** Each figure has a min and max, for example cull open days 60–365, but the page never says them. Out of range or empty, the browser's own bubble stops the save ("Value must be greater than or equal to 60"), in the browser's language. That is usually English on a Bangladeshi desk. The digest times box does not say the format beyond "কমা দিয়ে", and its example is in Latin digits.

**What should happen.** Say the range under each box in the reader's language, and check it before saving, as the breed gain dialog does.

**Where.** `apps/web/src/components/farm-parameters.tsx:905-920`.

### W15. Farm name and contact save as two saves under one button — low, Traced

**What happens.** Changing the name and the phone together sends `rename` and `setIdentity`. Each one, on success, clears the whole section's typing. If one succeeds and the other is refused, the refused typing is wiped. Two "saved" toasts show when both succeed. A name changed only by spaces enables Save, sends nothing, and leaves "Changes not saved yet".

**Where.** `apps/web/src/routes/_authenticated/farm/index.tsx:80-99`.

### W16. Standard procedures are recognised by their Bangla name — low, Traced

**What happens.** "Already have it" means a procedure with the same Bangla name. Adopt one, rename it while adopting or later, and the standard card is offered again. Adopting it a second time makes a duplicate procedure.

**Where.** `apps/web/src/components/playbook/standard-sops.tsx:113-122`.

### W17. Editor accessibility — low, Traced

**What happens.**

- "Move this step up" and "down" do not say which Step. The trigger "Remove" does not say which trigger.
- The per-animal box and the answer-kind select go grey when an effect is chosen, with no word of why.
- Each Step's heading is "ধাপ ১" with none of its text, so moving by headings says "Step 1, Step 2…".
- Removing a Step is one tap on a bin beside "move down", with no confirmation and no undo.

**Where.** `apps/web/src/components/playbook/sop-steps.tsx:253-287, 58, 314`; `apps/web/src/components/playbook/sop-when.tsx:241-250`.

### W18. The wall card leaves out what may be chosen — low, Traced

**What happens.** The printed card shows each answer's kind ("পছন্দ", "সংখ্যা · লিটার") but not the choices, the range, or which product a campaign gives. Someone trained from the card does not learn the options the phone will offer.

**Where.** `apps/web/src/routes/_authenticated/sops/$definitionId/card.tsx:66-81`.

### W19. A new Step can take the id of a removed one — low, Traced

**What happens.** A new Step gets `step-<count+1>`. Remove Step 3 and add a new one, and the new one is `step-3`. The changes notice matches Steps by id, so it says Step 3 was reworded (from "টিকা দিন" to "পানির পাত্র ধুয়ে দিন") rather than one removed and one added.

**Where.** `apps/web/src/components/playbook/sop-steps.tsx:350-357`; `packages/domain/src/sop.ts` (`describeChanges`).

---

### Owner choices

1. **Should a choice or skip reason that the farm acts on be marked in the editor and kept with its meaning?** Recommended: yes. Show a small tag ("গরম → প্রজনন", "পাওয়া যায়নি → নিখোঁজ"). Keep the meaning when the words change. Ask "same thing, new words?" before a different word takes a meaning by its place.
2. **Should a half-written procedure survive a reload or a wrong click?** Recommended: yes. Ask before leaving, and keep the draft on this device until it is published or let go.
3. **When the Owner turns down a proposal, should they write why, and should the Manager be told?** Recommended: yes to both. The Manager should also be able to say why they propose a change.
4. **Should approving a proposal, or publishing an edit, be refused when the procedure has had a newer Version since?** Recommended: refuse, show what changed, and ask to start from the newer Version.
5. **English on Steps: add English boxes, or clear the English when the Bangla changes?** Recommended: clear it and say "English needs writing again". Add English boxes only if the Vet asks for them.
6. **Times typed in Bangla digits: accept them, or change the help text?** Recommended: accept them, as course times already do, in both the Playbook and the digest times.

### Checked and holding

- Retiring asks first and says how many pieces of work were called off. Bringing a procedure back is refused, in Bangla, while another procedure already does what only one may (prescription, notifiable report).
- A Manager's proposal is held to the same publish rules as the Owner's publish. The Propose button stays off while anything blocks it.
- A campaign's product list holds only products with withdrawal days written down.
- The wall card prints in Bangla whoever prints it. It names its Version and date, and tightens past eight Steps to stay on one A4 sheet.
- Training is recorded against the Version in force and the list refreshes after marking. Only people who can still sign in are offered.
- The comma list box keeps a trailing comma while typing. `toChoices` keeps each value with its choice when choices are removed or reordered (only same-place replacement is the trouble, W4).
- The fortnightly and monthly ticks exclude each other, and both clear when no day is ticked.
- Rules and alerts save group by group and send only the figures that changed. Unsaved typing in one group survives saving another. Cross-figure refusals (AI window backwards or over a day, quiet hours equal, Investor warning past the cap, keep and milk days) all have Bangla words.
- Breed gain share, market price and Farm Account forms check their own bounds on screen.
- The Bangla catalog for `sop.*`, `params.*`, `identity.*`, `card.*`, `training.*` and `standards.*` has no untranslated English beyond DLS and A4. Step numbers and counts are in Bangla digits.
- The settings menu becomes a scrolling strip on a phone. The procedures and proposals lists turn into cards on a phone. The editor's fields stack to one column at 360px.

Note: an untracked `packages/api/src/routers/zz-playbook-probe.test.ts` is in the working tree. It is not from this survey and was left untouched.
