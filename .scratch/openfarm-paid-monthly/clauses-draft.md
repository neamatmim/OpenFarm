# Ticket 05 — drafted wording for a Venture paid by the month

Drafted 2026-10-02 from the advisers' answers (`answers.md`). Q1 approved _adding_ clauses; these are the clauses. They
go to the lawyer and the Shariah scholar on `clauses-sheet.html` before any of them is published as a wording Version.
Nothing here changes a paper yet.

**Where they go.** Only on the Investment Agreement of a Venture paid by the month — a Venture paid before buying prints
exactly what it prints today, and every Agreement already signed keeps the wording it was signed in. The stamp stays on
the whole capital signed for, and the schedule is in the Agreement itself (Q7).

**New fields the farm fills in** (to add to `TEMPLATE_FIELDS`): `cattlePart` (one Unit's Cattle Part), `monthlySum`
(one Unit's Monthly Sum), `lastMonthlySum` (the last, where the division left it different), `firstSumDue`,
`lastSumDue` (the first and last 10th), `sums` (how many).

## A. Investment Agreement — "ভেঞ্চার ও মূলধন / Venture and capital"

Two rows after "মোট মূলধন / Total capital":

| Label                                                | Value                                                                                                                         |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| গরু কেনার অংশ (প্রতি ইউনিট) / Cattle Part (per Unit) | {cattlePart} টাকা — কেনা শুরুর আগে / before buying starts                                                                     |
| মাসের টাকা (প্রতি ইউনিট) / Monthly Sum (per Unit)    | {monthlySum} টাকা, {firstSumDue} থেকে {lastSumDue} পর্যন্ত প্রতি মাসের ১০ তারিখে ({sums} মাস); শেষ মাসে {lastMonthlySum} টাকা |

The "শেষ মাসে …" part is printed only where the last sum differs.

## B. Investment Agreement — "শর্তাবলি / Terms"

After the mudarabah, profit and loss clauses, before the sale window:

**M1 — Capital in two parts (Q1, Q7)**

- বিনিয়োগকারী তাঁর মূলধন দুই ভাগে দেবেন: প্রতি ইউনিটের গরু কেনার অংশ কেনা শুরুর আগে, আর বাকিটা ওপরের তালিকা অনুযায়ী প্রতি মাসের ১০ তারিখে। তাঁর মোট মূলধন ওপরে লেখা পুরো অঙ্ক।
- The Investor pays their capital in two parts: each Unit's Cattle Part before buying starts, and the rest in the Monthly Sums above, each on the 10th of its month. Their total capital is the full amount written above.

**M2 — What each part is for**

- গরু কেনার অংশ দিয়ে কেবল পশু কেনা হবে; মাসের টাকা দিয়ে পশুর খাবার, ওষুধ ও যত্ন। সব বিনিয়োগকারীর গরু কেনার অংশ না আসা পর্যন্ত কেনা শুরু হবে না।
- The Cattle Parts buy the animals only; the Monthly Sums keep them — feed, medicine and care. Buying does not start until every Investor's Cattle Part is in.

**M3 — A missed month (Q5)**

- কোনো মাসের টাকা সেই মাসের ১০ তারিখের পর সাত দিনের মধ্যে না এলে তা বাকি পড়েছে বলে গণ্য হবে। বাকি পড়া টাকা পশু বিক্রি শুরুর আগ পর্যন্ত দেওয়া যাবে, এবং দেওয়া হলে তা অন্য যেকোনো মূলধনের মতোই গণ্য হবে; বিক্রি শুরুর পর আর নেওয়া হবে না।
- A Monthly Sum not received within seven days of its 10th is missed. A missed sum may still be paid until selling begins, and then counts like any other capital; once selling has begun it is not taken.

**M4 — Shared by what was paid (Q2)**

- হিসাব নিকাশে মুনাফা বা ক্ষতির ভাগ হবে প্রত্যেক বিনিয়োগকারী আসলে যত মূলধন দিয়েছেন তার অনুপাতে। সব মাসের টাকা দিলে এই ভাগ তাঁর ইউনিট অনুযায়ী ভাগের সমান।
- At Settlement, profit or loss is shared in proportion to the capital each Investor actually paid. Paid in full, that is the same as their share by Units.

**M5 — No fine (Q4)**

- দেরিতে দেওয়া বা না দেওয়ার জন্য খামার কোনো জরিমানা, চার্জ বা অতিরিক্ত টাকা নেবে না।
- The Farm takes no fine, charge or extra payment of any kind for a sum paid late or not paid.

**M6 — The animals are still fed (Q3)** _— the advisers to say whether this belongs in the Agreement or is the Owner's
own matter_

- কোনো মাসের টাকা না এলেও পশুর খাওয়া বন্ধ হবে না: খামারের মালিক নিজের টাকা সুদ ছাড়া অগ্রিম দিতে পারেন। হিসাব নিকাশে মূলধন ফেরতের আগে তিনি কেবল যত দিয়েছেন ততটুকুই ফেরত পাবেন; এ টাকায় তাঁর কোনো মুনাফা বা ক্ষতি নেই।
- If a month's money does not come, the animals are still fed: the Owner may advance her own money, interest-free. At Settlement it is repaid before capital, and no more than was advanced; it earns nothing and bears no loss.

**M7 — Someone stops paying (Q6)**

- কোনো বিনিয়োগকারী মাসের টাকা দেওয়া বন্ধ করলে তাঁর চুক্তি বহাল থাকবে এবং তিনি যত দিয়েছেন তার অনুপাতে ভাগ পাবেন; তাঁর না-দেওয়া অংশ অন্য কাউকে দেওয়া হবে না।
- If an Investor stops paying their Monthly Sums, their Agreement stands and they share in proportion to what they paid; the part they did not pay is not offered to anyone else.

**M8 — If the Investor dies with sums to come (Q8)** — placed after the heirs clause _— "or, with none, the lawful heirs"
is the farm's reading; Q8 named only the Nominee_

- মাসের টাকা বাকি থাকা অবস্থায় বিনিয়োগকারীর মৃত্যু হলে তাঁর নমিনি — নমিনি না থাকলে আইনগত উত্তরাধিকারীরা — বাকি মাসগুলোর টাকা দিতে পারবেন; না দিলে যত দেওয়া হয়েছে তার ভিত্তিতে হিসাব হবে।
- If the Investor dies with Monthly Sums still to come, their Nominee — or, with none, their lawful heirs — may pay the rest; otherwise they are settled on what was paid.

## C. The farm's other papers

These are the farm's own statements, approved as built on 2026-09-26; the lines below are additions for a Venture paid
by the month only.

**যোগদানপত্র / Joining letter** — after "প্রাপ্ত মূলধন / Capital received":

- মাসের টাকার তালিকা / Monthly Sums — one line per sum: `{date} · {amount} টাকা` for his Units.
- A sentence: এই পত্র গরু কেনার অংশ প্রাপ্তির স্বীকৃতি; মাসের টাকা এলে তা অগ্রগতি প্রতিবেদনে দেখানো হবে। / This letter acknowledges the Cattle Part received; Monthly Sums, as they come, are shown on the progress statement.

**অগ্রগতি / Progress statement** — under his Units:

- মাসের টাকা / Monthly Sums: {of} মাসের {paid}টি দেওয়া · বাকি পড়েছে {missed} টাকা · পরেরটি {date}, {amount} টাকা — the last two only where they apply.

**হিসাব নিকাশ / Settlement statement** — where his Units are printed:

- দেওয়া মূলধন অনুযায়ী ইউনিট / Units held, by capital paid: {held} (সই করা {signed}) — the bracket only where they differ.
- বাকি পড়া মাসের টাকা / Monthly Sums not paid: {unpaid} টাকা — only where any are.

## After the advisers answer

Each clause marked approved, or changed in their words, goes into a new wording Version of the Investment Agreement
(and, if they say so, the Venture Schedule), with the fields above; then the three statements; then somebody opens
every paper in both languages for one Venture paid by the month (ticket 05's last box).
