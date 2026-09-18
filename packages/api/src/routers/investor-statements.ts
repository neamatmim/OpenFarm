import { joiningLetter } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { z } from "zod";

import { audited } from "../audit";
import { assertRegistered, exportedPaper } from "../export-store";
import { protectedProcedure } from "../index";
import { assertCapitalHeld, hisStanding } from "../investor-statement-store";
import { joiningTerms } from "../investor-statement-words";
import { languageOf } from "../reader-language";
import { OWNER_ONLY, requireOnly, requirePersonalSession } from "../roles";

export const investorStatementsRouter = {
  /**
   * যোগদানপত্র — the paper an Investor is handed when his money lands: that the Farm has it, how much, on
   * what day and by which bank reference, and what he has agreed to in seven plain lines.
   *
   * Asked for by **Agreement**, which is the paper the money was signed for: it froze his Units, his
   * split, his Target Window and his Arbitrator, and another man on the same Venture may hold different
   * ones.
   *
   * The Owner's alone, as every Venture act is: who trusted her with money is not the Manager's business.
   */
  joining: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ agreementId: z.string() }))
    .handler(async ({ context, input }) => {
      assertRegistered(context.farm, "an investor's joining letter");
      const now = context.clock.now();
      const language = await languageOf(context.db, context.actor.id);
      const standing = await hisStanding(
        context.db,
        context.farm.id,
        input.agreementId
      );
      assertCapitalHeld(standing);
      const day = (farmDay: string) =>
        formatDate(new Date(`${farmDay}T00:00:00Z`), language, "date");
      const taka = (bdt: number) => formatNumber(bdt, language);
      const text = joiningLetter({
        farm: context.farm,
        him: standing.him,
        ventureName: standing.venture.name,
        unitPrice: taka(standing.venture.unitPriceBdt),
        units: formatNumber(standing.agreement.units, language),
        capital: standing.capital.map((one) => ({
          kind: one.kind,
          amount: taka(one.amountBdt),
          on: day(one.movedOn),
          reference: one.reference,
        })),
        totalCapital: taka(standing.capitalBdt),
        terms: joiningTerms(standing, context.farm.windUpDays),
        stamp: {
          value: taka(standing.agreement.stampValueBdt),
          on: day(standing.agreement.stampedOn),
          serial: standing.agreement.stampSerial,
        },
        producedBy: context.actor.name,
        producedAt: formatDate(now, language, "dateTime"),
      });
      await audited(context).write(
        {
          // Filed against the Agreement, which is what the paper is about: one man, one Venture, one set
          // of terms. "What did we send that man, and when" is then a question the trail answers.
          entity: "investment_agreement",
          entityId: standing.agreement.id,
          action: "export",
          after: exportedPaper(context.farm, "joining_letter", {
            ventureId: standing.venture.id,
            investorId: standing.him.id,
            movements: standing.capital.length,
            capitalBdt: standing.capitalBdt,
          }),
        },
        () => Promise.resolve()
      );
      return { text, agreementId: standing.agreement.id };
    }),
};
