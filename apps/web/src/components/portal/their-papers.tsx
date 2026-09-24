import { FileText } from "lucide-react";

import type { TheirAgreements } from "@/components/investors/investor-agreements";
import { EmptyState, Section } from "@/components/page";
import { PortalPapers } from "@/components/portal/portal-papers";
import { useLanguage } from "@/i18n/language-provider";

/**
 * Every paper of theirs in one place, one row per Venture: its joining letter and progress statement, and its
 * settlement statement once there is one — made as the Owner would print it, two clicks from anywhere in the portal.
 * A Venture called off has none to make.
 */
export const TheirPapers = ({
  agreements,
}: {
  agreements: TheirAgreements["agreements"];
}) => {
  const { t } = useLanguage();
  const papered = agreements.filter((one) => one.venture.state !== "cancelled");
  if (papered.length === 0) {
    return <EmptyState icon={FileText} title={t("portal.noPapers")} />;
  }
  return (
    <Section>
      <ul className="flex flex-col divide-y">
        {papered.map((one) => (
          <li
            className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between"
            key={one.id}
          >
            <span className="text-sm font-medium">{one.venture.name}</span>
            <PortalPapers
              agreementId={one.id}
              hasCapital={one.capitalHeldBdt > 0 || one.settlement !== null}
              settled={one.settlement !== null}
              size="sm"
            />
          </li>
        ))}
      </ul>
    </Section>
  );
};
