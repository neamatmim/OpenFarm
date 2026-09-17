# 05 — A Selling Trip is paid for by the animals taken

**What to build:** At Eid the Farm takes a lorry-load to the haat and brings some home again. The Manager records the Selling Trip with the animals taken and what the outing cost — lorry both ways, the stall or space, the men's food and lodging — and the cost splits evenly across every animal taken, sold or not, because a bull that came back still stood on the lorry. A broker's fee for one sale is recorded on that Sale instead.

**Blocked by:** 04

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 1, user story 41; [What a project is charged for](../../openfarm-investor-projects/issues/05-what-a-project-is-charged-for.md); `CONTEXT.md` — **Selling Trip**, **Load**.

- [ ] A Selling Trip records the day, the haat, its costs and the Animals taken on it; taking an Animal is a recorded fact, not derived from who sold
- [ ] Its cost splits evenly across every Animal taken, whether she sold or came home
- [ ] An Animal taken on two trips before she sold carries a share of both
- [ ] Each share shows on her page and in the per-Side report, and comes off her Margin
- [ ] A Selling Trip is not a **Load**: the Transport Card still describes one vehicle to one destination and is unchanged
- [ ] Tests cover twenty taken and fifteen sold, an animal taken twice, and a trip where nothing sold
