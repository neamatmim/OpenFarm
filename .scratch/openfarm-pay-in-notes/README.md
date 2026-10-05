# Investors tell the farm they have paid

The Owner, 2026-10-05: "could a portal user submit their payment" — then, asked whether to plan a way for an Investor
to say "I have paid" for the Owner to confirm: "yes".

Today an Investor pays outside the app, into the **Venture Account**, writing the **Pay-in Code** on the transfer. The
portal shows what is still owed and where to pay (ADR 0008), and nothing else. The Owner finds the money on the bank
statement and records it (`ventures.takeCapital`), and only then does the portal show it paid. Between the two the
Investor has no way to say "I sent it", and the Owner has nothing to match the statement against but the code.

A **Pay-in Note** is that word: the Investor, from the portal, saying they sent so much, on such a day, by such a way,
with the transaction's reference, and a photo of the slip if they like. It **moves no money and records no capital**.
The Owner checks the bank, and either records the capital from it (which closes it as **received**) or answers **not
found** with a line to the Investor. Capital is still the Owner's act alone, behind every guard it has today.

## Decided by the Owner (2026-10-05)

1. **The Owner is told right away**, not in the Digest: an immediate notice, pushed to their phone. An Investor who
   has sent money is waiting on the answer.
2. **A photo of the slip or screenshot, optional.** Shrunk on the phone before upload, as the stamped Agreement photo
   is.
3. **Built behind a switch, off by default**, as the Agreements in the app were. The lawyer approved "show where to
   pay" but not "take payment in the portal" (ADR 0008); this takes no money, but it is new, so the advisers see it
   first and the Owner turns it on.
4. **Bank and Mobile Money.** The Investor may say they sent it by bank transfer, cheque, deposit slip, or Mobile Money
   (bKash), with the transaction ID.

## Open for the Owner

- **Mobile Money, read as "bKash into the Venture Account".** bKash can send to a bank account, and that arrives in
  the Venture Account as a bank credit, so the Owner records it as today (by bank, the TrxID as the reference) and the
  rule that a Venture takes capital by bank only stands. If the Owner means a **bKash wallet** taking capital, that
  changes the Venture Account itself and is a separate decision for the advisers. Planned here as the first.

## Shape

| Today                                                 | With Pay-in Notes                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Investor pays, says nothing in the app                | Investor sends a Pay-in Note: amount, day, way, reference, photo       |
| Owner finds it on the statement by the Pay-in Code    | Owner is told at once, and checks the bank against the note            |
| Owner records the capital from scratch                | Owner records it **from the note**, filled in; the note reads received |
| Investor sees "still to pay" unchanged until it lands | Investor sees their note: sent → received, or not found with why       |
| No word from the farm if it never arrived             | "Not found", with the Owner's line                                     |

What it is **not**: no payment in the portal, no gateway, no money held, no capital recorded on the Investor's word.
The portal's footer ("no money moves through it") stays true.

## Tickets

| #   | Ticket                                                                | Blocked by |
| --- | --------------------------------------------------------------------- | ---------- |
| 01  | [Words, ADR and the advisers' sheet](issues/01-words-and-advisers.md) | done       |
| 02  | [An Investor sends a Pay-in Note](issues/02-send-a-note.md)           | 01         |
| 03  | [The Owner answers it](issues/03-owner-answers.md)                    | 02         |
| 04  | [The portal's screens](issues/04-portal-screens.md)                   | 02         |
| 05  | [Seeded, and opened](issues/05-seed-and-open.md)                      | 03, 04     |

03 and 04 may be built side by side. Nothing needs the advisers' answer to be built — only to be switched on.
