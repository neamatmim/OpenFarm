# 17 — A Venture's Margin and Cost of Gain

**What is wrong:** Story 50 wants a Venture's **Margin** and **Cost of Gain** to read per animal and per
Venture, "so that I can see which bull earned and which did not". Both figures exist per animal and are
shown on the costs screen for any animal on the farm. Neither is readable for a Venture: the Owner cannot
open a Venture and see which of its bulls made money.

`ventures.herd` already gathers a Venture's cattle — how many stand, what they weigh, what they are
putting on — and carries no money at all. It is also called by no screen.

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) story 50. `CONTEXT.md` — **Margin**,
**Cost of Gain**.

- [x] A Venture reports each of its animals' Margin and Cost of Gain, and its own totals
- [x] Only once she is sold, as a Margin is: a bull still standing has not earned anything yet
- [x] The Owner reads it on a screen, per animal, worst first
- [x] Nothing about it reaches an Investor's paper

## Checked before starting

**Margin is the Animal's, not the owner's.** `CONTEXT.md`: "The same sum for every Animal, whoever owns
her. Worked out, never stored, and only once she is sold." So a Venture's Margin is the sum of its
animals' Margins rather than a different arithmetic, and `economicsOfAnimal`
(`packages/api/src/cost-store.ts:551`) already works one out — `marginBdt`, `costOfGainBdt`, `gainKg`,
`purchaseBdt`, `saleBdt`.

**Cost of Gain per Venture is not the mean of the per-animal rates.** `CONTEXT.md` defines it as
everything charged to her over the weight she gained. For a Venture that is everything charged to all of
them over everything they gained — the same choice `theirProgress` already made and documented for the
herd's daily gain, "these bulls put on this much a day between them". Averaging the rates would let a
bull who arrived last week count as much as one here since January.

**Nothing may reach the Investor's paper.** `theirProgress` is what the **অগ্রগতি** is built from, and
its doc comment is explicit that no projection belongs on a paper a man keeps. Money per animal is not a
projection, but it is also not an Investor's business — he is shown what the run cost in total, not which
bull disappointed. This goes in its own procedure rather than widening `theirProgress`.

**The screen is a sheet.** Ventures are one route and sheets, never pages
(`.scratch/openfarm-ventures-finishing/issues/09-*`, and the card list this sits on). This joins
কাগজপত্র and টাকা আসা-যাওয়া on the card.

## A doc comment that reads as a bug and is not

`theirProgress` (`packages/api/src/venture-herd-store.ts:107`) carries a doc comment saying "Whose an
Animal is, is asked of the day rather than off her record … reading `ownerVentureId` would move her
retrospectively — off one Venture's paper and onto another's for months she was never theirs." The query
immediately below it reads `ownerVentureId`.

The behaviour is deliberate and covered: `venture-herd.test.ts:311` is called "moves an internally sold
animal onto the Venture that now owns her", and the test above it says in as many words that "whose she
is, is asked of the day it is printed". So the query is right and the comment's second sentence — the one
warning against `ownerVentureId` — describes the **costing** rule rather than this one, where reading her
record would indeed move months of charges. Left alone rather than reworded underneath somebody, but
worth knowing before anyone reads that comment and 'fixes' the query beneath it.

This ticket follows the same rule as the sheet it sits beside: a Venture's animals are the ones it owns
now. An Internal Sale hands the beast and her whole Margin to the Venture that bought her.

## What was decided while building

**Worst first, and the unsold last.** The question is which bull did not earn, so the list opens on him.
A beast with no Margin yet is not the worst of them — she is not in the running — so she follows rather
than sorting as though she had lost money.

**Two farms, two halves of the proof.** The test farm in `venture-herd.test.ts` weighs its animals and
never feeds them; the one in `settlement.test.ts` feeds and carries them and never puts them back on the
scale. So each proves the half it can: gain with nothing charged, and charges with nothing gained. The
second is the more useful of the two — a rate over no gain is not zero and not infinity, it is
unanswerable, and it now says so rather than dividing by nothing.

**The Owner's alone.** The Manager reads what a Venture's cattle weigh, because he looks after them; what
a beast made is the money side of a Venture and that is hers. An Investor never sees it at all.

## Read off the demo farm afterwards

কোরবানি ২০২৬, all six sold, worst first:

| tag | Margin | a kilogram | bought · sold |
| --- | --- | --- | --- |
| F-0015 | ৳২৩,২৮৪.১৪ | ৳৫৮৯.৯৩ | ৳১,২২,৫০০ · ৳১,৮০,০০০ |
| F-0017 | ৳২৬,৫৩৪.৬৯ | ৳৫০৬.৯৪ | ৳১,০২,৫০০ · ৳১,৬৩,০০০ |
| F-0019 | ৳৩৩,০৪১.৭২ | ৳৫৪৯.৩ | ৳৯৭,০০০ · ৳১,৬৩,০০০ |
| F-0016 | ৳৩৪,৬৩৩.৭৮ | ৳৪৯৮ | ৳১,০৫,০০০ · ৳১,৭৩,০০০ |
| F-0018 | ৳৩৯,৩৩৪.৩২ | ৳৫২৫.২৪ | ৳১,২৪,০০০ · ৳১,৯৮,০০০ |
| F-0020 | ৳৪৭,৪৪১.৩৫ | ৳৪৮৬.৭৪ | ৳১,১৭,০০০ · ৳১,৯৯,০০০ |

The six add to **৳২,০৪,২৭০**, which is exactly the herd figure the sheet prints above them, and the
herd's ৳৫২৩.৭৩ a kilogram sits inside the per-animal spread of ৳৪৮৬.৭৪ to ৳৫৮৯.৯৩ rather than being the
mean of them. The cheapest kilogram and the biggest Margin are the same bull; the dearest kilogram is the
smallest Margin. That is the whole point of the sheet.
