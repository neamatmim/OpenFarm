# 01 — An Animal belongs to a Venture, and her money follows her

**What to build:** Every Intake names its owner — a Venture, or the Farm — so that no animal is unowned and an Investor's animal cannot quietly become the Owner's. A Venture only ever owns a bought-in Fattening animal; one born here is the Farm's, and so is one from the opening register. An owner typed wrongly at the haat is put right inside the ordinary Correction Window and not otherwise, because after that the only thing that moves an animal between owners is an Internal Sale. Her page says whose she is, to the people whose business it is.

And her money follows her: the Money Event an Intake books lands on that Venture's **Purse**, and so does the one a Sale of her books. This is the Purse's first writer — until now every Money Event has been the Farm's — so a Venture's buying is its own cost from the first beast, and never the Farm's.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 3, user stories 30, 31, 32, 53; `CONTEXT.md` — **Venture**, **Purse**, **Animal**, **Intake**, **Correction Window**.

- [x] An Animal carries her owner: unsaid for the Farm's own, or the Venture that bought her; everything already standing on the farm is the Farm's and no figure moves
- [x] The Manager names the owner when recording an Intake, and the choice offers only a Venture that is Buying
- [x] A Venture may own only a bought-in Fattening animal: one born here, one from the opening register and a Dairy animal are refused, with a word the reader has
- [x] The owner is correctable inside the ordinary Correction Window like any other part of the Intake, and refused after it
- [x] The Intake's Money Event is booked on its owner's Purse, and so is the Sale's, so a Venture's buying and selling never reach the Farm's period report or the accountant's export
- [x] Her page says whose she is where the reader is the Owner or the Manager, and says nothing of it to Barn Staff
- [x] Tests cover an Intake naming a Venture and one naming nobody, the three refusals, an owner corrected inside the window and refused outside it, and the Farm's figures unchanged to the poisha while a Venture buys

## What was built

- An Animal carries her owner: unsaid for the Farm's own, or the Venture whose money bought her. One
  nullable column, so every beast already standing is the Farm's and no figure moves.
- The Intake names it. The Manager may too — she is the one at the haat — through a narrow read that
  gives her the buying Ventures by name and nothing else about them.
- **The Purse has its first writer.** What she cost and what she fetches land in her owner's purse, so a
  Venture's buying never reaches the Farm's register.
- A slip is put right inside the ordinary Correction Window, and the money moves purses with her — her
  Sale's too, if she has already been sold.
- Her page names her owner to the Owner and the Manager, by the same reading that decides who may see
  what she cost, and says nothing of it to Barn Staff.

## What the reviews caught

- **She could drift across to Dairy.** A Venture's bought-in heifer walked to the milking side stayed
  Venture-owned — a Dairy cow an Investor owns, which the arrangement does not have, and whose ownership
  had changed with nobody selling her. Refused now.
- **The Correction Window was narrowed to nothing.** The check demanded a Venture still *buying*, so a
  haat slip became unfixable the moment the Owner moved that Venture on — on day two of thirty. A
  Correction now reaches any Venture whose run is not over.
- **An approval survived a change of purse.** The Owner approving the farm's ৳151,000 was taken to have
  approved an Investor's. Whose money it is is now part of what she approves, so the farm asks again.
- **The Sale did not follow a corrected owner**, leaving what an animal cost and what she fetched in two
  different purses.
- The owner correction wrote an Audit Event whose before and after were identical, because the snapshot
  did not read the column it was changing.

## A bug in shipped code, found on the way

Every Correction that names only how a record was paid for — a Sale, a Dispatch, a Trip, a feed arrival —
crashed with a raw `No values to set` from the database, because the update was built entirely from
columns that had not changed. Proven with a red test in `money.test.ts`, then fixed in all six kinds
behind one shared word.
