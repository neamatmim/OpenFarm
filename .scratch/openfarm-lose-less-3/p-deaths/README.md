# P — A death nobody looks at

Survey item P (`../survey.md`), opened 2026-10-02 at the Owner's asking. A bull sold on the quiet and written "died,
buried" leaves no Sale and no alarm: the death is a form with a cause anyone can type, and the Owner learns of it from
a count on her home page.

**What the app already does** (read from the code, 2026-10-02):

- A death or a cull is written by `animals.recordMortality` (`routers/animals.ts:882-948`), the Owner's or a
  Manager's: died or culled, the cause — picked from the calf's or a grown animal's short list, or typed, and stored as
  text (`apps/web/src/components/animal/animal-acts.tsx:147-160`) — a Diagnosis of hers where there is one
  (`mortality-store.ts:29-47`), the disposal and when. One `mortality` row per animal (`db/schema/herd.ts:309-343`);
  **no photograph**.
- **The only other way a death is written** is a Calving's stillborn calf (`calving-store.ts:48-70`): cause
  stillbirth, disposal awaiting, written later by `animals.recordDisposal` (`routers/animals.ts:955-990`). The opening
  register takes live States only (`routers/animals.ts:127-133`); the shed phone's Entries are Moves, Observations and
  Step Completions (`packages/api/src/entries/`), and no Effect writes a death. The seed writes deaths through
  `recordMortality` (`seed/herd.ts:385`, `seed/script.ts:929`).
- **Photos:** one profile photo per animal, replaceable (`animal_photo`, `db/schema/herd.ts:249-261`), set by
  `animals.setPhoto` (`routers/animals.ts:1322-1374`) on a live animal only (`loadLiveAnimal`): nothing can be added
  once she has gone, and the one she has may be months old. The pattern for a record's own photo is a base64 row
  downscaled on the phone — `money_receipt` (`db/schema/money.ts:290-302`), `PhotoField`
  (`apps/web/src/components/photo-field.tsx`), `PHOTO_MAX_BYTES`. `animals.photo` is read by the Owner, a Manager,
  Staff and the Vet, a visiting Vet too (`routers/animals.ts:1376-1395`).
- **No notice kind for a death** (`db/schema/alert-kinds.ts`). The Owner sees thirty days' died and culled as two counts
  (`routers/home.ts:493-495`) and the yearly rate by cause.
- **Notices:** `tell` (`notice.ts:326-362`) writes rows inside the act's transaction and sends to the kind's whole
  audience — nothing leaves out the person who wrote it. The push goes after the transaction closes: from the router
  for a notifiable Diagnosis (`routers/diagnoses.ts:225-229`), from the sweep for `animal_missing`
  (`the-day-turns.ts:489-510`); an Effect raising inside a Step's transaction is not pushed by itself. A push opens
  `/today` unless it is about work (`push.ts:77`). Quiet hours hold back every push but the two safety kinds
  (`push-send.ts:36-47`).
- **What she cost** is her purchase plus everything charged to her (`economicsOfAnimal`, `chargedOf`,
  `cost-store.ts:641-668`), as `sold_under_cost` (`animal-price-store.ts:209-214`) and the Lost on the home page
  (`missing-store.ts:317-345`) read it — Owner-only, as every price and cost is.

| #   | Ticket                                   | Blocked by |
| --- | ---------------------------------------- | ---------- |
| 01  | A photograph of her tag with every death | —          |
| 02  | The Owner told at once                   | 01         |
| 03  | The Vet told when no Diagnosis was named | 02         |

**Settled with the Owner, 2026-10-02, and not to be re-asked:**

- **A photograph of the dead animal showing her tag is required** to record a death or a cull (P1).
- **The Owner is told by push at once**, naming the animal, the cause, the photograph and what she cost; **the Vet is
  told too if no Diagnosis was named** (P2).

**Settled in drafting** (the Owner may overrule; nothing here was asked):

- **The photograph is the death's own**, never her profile photo: kept with the Mortality, one or more. A Correction may
  add a newer one and never takes one away — the earlier stays, shown as replaced. Deaths written before have none (no
  start day), and say so.
- **Calves:** a calf that dies after her birth is like any animal. A stillborn calf's Calving — often a Staff Step, often
  on the shed phone — asks for no photograph; it is asked when the Manager writes what was done with her
  (`recordDisposal`), and the Owner is told then. A newborn may not wear her ear tag yet: her photograph shows her
  beside her dam's.
- **A Venture's animal:** the Owner is told, with whose she was. Investors are not: a Notice reaches the Farm's people
  only, and they read her death in their Investor Statement as now.
- **The Owner writing it herself** is told nothing — no push and no notice in her list. The Vet's still goes.
- **Two kinds, because the cost is the Owner's alone:** `mortality_recorded` to the Owner, with what she cost;
  `mortality_undiagnosed` to the Vet, without it. Named after the glossary's **Mortality**.
- **A Correction tells nobody again**, whatever it changes — each is about the one death, once.
- **At once, not at night:** sent now and not one of the kinds that wake the farm. A death written at 23:00 is in her
  list in the morning, as a Missing is.
- **The push opens her page**, where the photograph is; the push carries the news and not the picture.
