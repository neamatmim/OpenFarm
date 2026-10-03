---
status: accepted
date: 2026-10-03
---

# The farm's currency and clock are set with its server

OpenFarm was built for one farm in Bangladesh, and on 2026-10-03 the Owner decided it should be ready to run outside Bangladesh too. Two things tied it to Bangladesh beyond its words: every sum was named for the taka (`priceBdt`, `sale.baki_bdt`), and the farm's own day was worked out as UTC plus six hours. Both are now settings, chosen once, when a farm's server is set up:

- **`OPENFARM_CURRENCY`**: the ISO 4217 code the farm counts its money in. `BDT` when unset. Each currency OpenFarm can count in is an entry in `CURRENCIES` (`packages/i18n/src/farm-locale.ts`): the sign written before a sum, and the words a sentence says it in. In English that means one of it ("every taka", "every dollar") and a sum after a figure ("200 dollars"). In Bangla it also means the endings for "of" and "in" (টাকার / ডলারের, টাকায় / ডলারে), because a word ending in a vowel takes them differently from one ending in a consonant. Every message can say `{currencySign}`, `{currencyOne}`, `{currencySum}`, `{currencyOf}` and `{currencyIn}` without a screen passing them in.
- **`OPENFARM_TIME_ZONE`**: the IANA zone the farm's own day and clock are read on. `Asia/Dhaka` when unset. The farm clock (`packages/domain/src/farm-clock.ts`) reads the zone's own wall clock, not a fixed offset. A farm whose clocks change for the summer still starts each day at its own midnight, and a day of 23 or 25 hours still counts as one day. The database stays on UTC, as it always has.

**One for the whole server, not a Farm Parameter.** These are fixed when the server is set up, and the Owner can't change them on the farm page. A farm that changed its currency would read every sum it already kept as the new currency. A farm that moved its clock would put every record near midnight on a different day. Neither is a decision about running the farm; both describe where the farm is. The clock is also used in some 160 files, on the server and in the browser, without being told which farm it's for. A setting per farm would have to be passed through all of them, for a server that only ever holds one farm.

**The browser reads what the server wrote.** The server writes both on the page's root (`data-currency`, `data-time-zone`), the way it already writes which address the page is on. Before the page draws anything, the browser reads them back and sets the same farm locale. A phone that opens the page it kept, with no signal, reads its sums and days just as the server would. A page kept from before this was written is read as a farm in Bangladesh, which is what it was.

**Names carry the unit, not the currency.** A sum's field is named `…Money` (`priceMoney`, `sale.baki_money`), beside `…Kg`, `…Litres` and `…Days`. The unit stays in the name because money so often sits next to the same thing in another unit: `milkMoney` beside `milkLitres`, `shortMoney` beside `shortKg`. Dropping the suffix would have made 152 of the 223 names collide with existing ones. A bare sum (`bdt`) is `amount`.

**Consequences:**

- Money is still kept to two decimal places (`numeric(12,2)`, `roundTaka`). A currency with no minor unit counts its zeros, and one with three minor digits cannot be kept exactly. Neither is supported until a farm needs it.
- **The Investor papers and the agreement templates stay Bangladesh's.** These are the joining letter, the statements, the stamp-duty lines and the standard agreements. Their wording was approved by a Bangladeshi lawyer and a Shariah scholar under Bangladesh law. A farm elsewhere needs its own adviser's papers, not these with another currency's sign. The standard procedures' "টাকা" step unit and the seed's demo farm stay as they are too.
- The backup timers (`deploy/*.timer`, `deploy/crontab.example`) name their own zone. On a farm outside Bangladesh, write that farm's zone there as well.
- Bangla and English are still the only languages, and Bangladesh's phone numbers and Eid-ul-Adha are still assumed. Each of those is its own decision, to be made when a farm outside Bangladesh needs it.

**Revisit** if one server ever holds farms in more than one country.
