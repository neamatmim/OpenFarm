# Prototype where the Owner reads returns

Status: done

Assignee: Neamat Khan Mim

Type: prototype

Blocked by: —

Map: [OpenFarm: what the money in cattle returns](../map.md)

## Question

Every figure the Owner reads is now decided (tickets 03–08). Make a rough screen, from the seed's numbers, and decide with the Owner where and how they read:

- **Where.** A page of its own under Money, a section of Month by month, the Venture page, the Fattening board, the animal page, or several of these, each reading the same sums.
- **What sits together.** Seasons and Ventures side by side, each with its result, **Return on Cost** (share, days, rate a year), a Venture's **Return on Capital**, the **Bank Rate** line, running ones as ranges «আজকের দামে». Dairy animals with their calves beside them, and the herd added up.
- **Breaking a Season down.** Whether a Season opens into its animals, and whether it breaks down further by haat, trader, breed or weight band to judge the buying inside it.
- **Where the Owner types** the new prices: crossing prices, a bought or opening-herd cow's price, the **Head Prices**, the Bank Rate. Where the gaps are named ("not yet a result: 3 cows not priced") and how they link to what puts them right.
- **The working.** How the average money tied up and the days open under a rate a year.
- **The sentence** saying wages, sheds, equipment, dung and the money's cost are left out.

Use `/prototype`. Link the prototype as an asset. The seed has one settled and one running Venture, a Season of 2027 Eid, and a dairy herd with no prices, so the prototype will need made-up entry prices and Head Prices.

## Resolution

Prototyped and chosen by the Owner, 2026-09-27. The prototype is on branch **`prototype/owner-reads-returns`** (26f6901), at `/months?variant=A|B|C|D` with its verdict in `apps/web/src/prototype/OWNER-RETURNS.md`. It is not merged; every figure in it is invented.

The four variants were: A, a section under Month by month; B, a page of its own; C, each figure on its subject's page; D, one league table ranked by rate a year.

- **Chosen: B, a Returns page of its own, under Money.** It is the Owner's alone. It has:
  - **Prices to set first**: a strip naming every missing price (crossings, bought or opening-herd cows, Head Prices), leading to where each is typed.
  - **A chart** of each finished rate a year as a bar, the Bank Rate locked on its first taka as a dashed mark.
  - **Three tabs**: fattening (finished, then running), dairy (the herd now, then each cow gone with her calves under her), and prices (Bank Rate history, Head Prices, prices outstanding).
  - **Each finished Season or Venture opens** into its Return on Cost line, its working (average days, the sum), a Venture's Return on Capital and the Farm's share. A Season also breaks down **by haat, by trader, by breed, by buying weight and into each animal**, as a share only, never a rate a year.
  - **The left-out sentence** at the foot.
- **The figures also show where their subject lives, each linking back to the page:**
  - **The Venture page**: a settled Venture's Return on Cost and Return on Capital beside its Settlement; a running one's range.
  - **A strip above the Fattening board**: the running Season's range and its missing prices.
  - **The cow's own page**: her return and her calves'.
  - **Month by month**: one line under the year's figures pointing to the page.
  - Already decided: **the Cull Reason list** shows a named cow's return beside her reasons ([What the dairy herd returns](./08-what-the-dairy-herd-returns.md)), and **the crossing to Fattening** asks for its price ([What a return counts](./04-what-a-return-counts.md)).
- **Not chosen:** A had no room to break a Season down; C had nowhere to compare or break down; D ranked unlike things (Return on Cost, Return on Capital, a cow's years) in one list.
- **For the spec:** the page, its strips and the Venture panel read one set of sums. Where the Bank Rate and Head Prices are typed is the page's prices tab, not Settings. The prototype's Bangla wording is a starting point, not settled copy.
