# 26 — The Drug List

**What to build:** The farm keeps a list of the products it treats animals with, each carrying how many days its milk and its meat must be withheld. There is no national table for this in Bangladesh — the days come off the label and the prescribing Vet — so the farm's own list is the only place they exist. The Vet maintains it. The Manager may add a product the day it is bought, with the days left blank, so buying is never blocked on the Vet being reachable; a product with blank days cannot be prescribed, which is what stops a treatment starting without a known Withdrawal.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 3, user stories 52 and 53; [Health, medicine and withdrawal](../../openfarm-release-1/issues/08-health-medicine-and-withdrawal.md).

- [x] The Vet adds and edits products with milk and meat withdrawal days; the Manager may add one with the days blank
- [x] A product with either figure blank cannot be prescribed, and says so in the words a person would use
- [x] Products are retired, never removed: a treatment given last March still names the product it used
- [x] Every change is an Audit Event — the withdrawal days are the farm's evidence at slaughter, and who set them matters
- [x] Tests cover adding, filling in the blanks, retiring, and the refusal to prescribe an incomplete product

**How it was built.**

- **The Manager may write down what the farm owns; only the Vet says what it costs the milk.** Adding a product with the days filled in is refused for anybody but the Vet, and the refusal says what to do instead: add it, and the Vet will fill them in. That is the rule the decision doc asked for, in one place, rather than a form that hides fields by Role.
- **Blank is a state the list names**, not an empty cell. A product waiting for the Vet says so on the screen and carries the reason it cannot be prescribed in the same words the refusal will use when ticket 28 tries to prescribe from it — because they are the same question asked twice.
- **Who wrote the days is kept with them.** The withdrawal days are what the farm shows a slaughter vet asking about the last thirty days, so their author and the day they were written are evidence too.
- **Retired, never removed.** A Treatment given last March still names its product.

**And the Drug List does not live behind the admin screens.** The Vet keeps it and is off-site more often than on it; putting it under `/admin` would have turned them away at the door — which is exactly what happened to the SOP Card in ticket 21, caught by review then rather than by a Vet standing in somebody else's yard.

**Review outcomes folded in. The first finding was a document I had not read.**

- **There is a confirmed roles matrix, and I built to my memory of it instead.** `assets/roles-matrix.md` says the Drug List is the Owner's to **read**, the Manager's to **add a product with the days blank**, and the Vet's to **keep** — create, read, update, including the days. I had let the Owner and the Manager retire products and the Owner add them. Retiring is taking something out of what may be prescribed, which is a clinical act. It is the Vet's now, along with bringing one back.
- **A person's permissions are the union of their Roles**, which the matrix says in its second line. The check asked which Role the request happened to be acting under, so an in-house Vet who is also the Manager — the likeliest arrangement on a farm this size — was refused the thing they are the Vet for. It asks what they hold.
- **Half a Withdrawal got through.** Adding a product with only the milk days filled slipped past the Vet check entirely, because the check asked whether *both* were given: the farm ended up with a withdrawal figure nobody was recorded as having written. Both or neither, and the refusal says why.
- **The trail could record a change to a row that was not there.** Both handlers looked the product up outside the transaction and updated inside it; a zero-row update still wrote its Audit Event. The update returns what it changed now, and refuses inside the transaction when it changed nothing.
- **A retired product told the Vet it was waiting for the Vet.** One question, two answers: the list said "not prescribable" while the reason said "no days written down". Now the reason names retirement, and it is the same reason the refusal will give in ticket 28.
- **The reason was an English sentence built in the domain package.** Every other thing a person reads in this codebase is a message key in both languages; this one could not be translated and was asserted, in English, by its own test. The domain returns a reason and the reader's app supplies the words.
- Also: the days are the prescriber's statement, so they cannot be written from a Shed Phone with somebody PIN-switched in; a product bought again under its own name is brought back rather than failing on a unique index; who wrote the days is on the screen rather than only in the column; an English reader sees the English name; and Barn Staff are redirected rather than shown a form that would refuse them.

**Owed, and worth saying.** The matrix gives a **visiting Vet** read-only access to the Drug List, and the farm has no notion of a visiting Vet yet — the Role is one thing today. Ticket 27 puts the Vet on their own phone from outside the farm, which is where that distinction has to be decided.
