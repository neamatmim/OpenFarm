# Papers in one language — map

Decided 2026-10-08 with the Owner; the why is [ADR 0021](../../docs/adr/0021-a-paper-is-read-in-bangla-or-in-english.md).

- A switch on every Investor paper: বাংলা or English, never both. The screen and the print follow it. It starts on
  the reader's own app language.
- Any paper may be printed in English only, signed papers too; no governing-language line.
- In scope: Agreement, Amendment, মনোনয়নপত্র, Portal Consent, «আপনার তথ্য», Data Copy, joining letter, progress
  statement, settlement statement, Welcome Letter. Out: farm and authority papers.

What the survey found (2026-10-08): two families of paper.

- **Template papers** (`PaperDocument`, `paperFrom`, drawn by `PaperDocumentView`): Bangla with English beneath; facts
  values, nominee table, letterhead details, closing, `produced` in Bangla or the producer's language; Consent and
  notice strip their English (`englishPrinted: false`). The Data Copy is a `PaperDocument` built by hand, values in
  Bangla.
- **Text papers** (`papers.ts` strings in a `<pre>`): joining letter, progress, settlement. Labels `bn / en` on one
  line; terms, units, letterhead and sentences Bangla only. Look the worst.
- **Welcome Letter**: hand-built JSX, Bangla throughout by design.

| #   | Step                                                                        | State       |
| --- | --------------------------------------------------------------------------- | ----------- |
| 01  | Template papers carry both languages; the dialog draws one, with the switch | done        |
| 02  | Data Copy and «আপনার তথ্য» as a page, in both                               | done        |
| 03  | Joining letter, progress and settlement drawn as documents, in both         | done        |
| 04  | Welcome Letter in both                                                      | done        |
| 05  | The portal's papers start on the Investor's language                        | done        |

Every step ends with somebody opening the paper in both languages, and printing it through an overlay clone.
