import { FileText } from "lucide-react";

import type { TheirAgreements } from "@/components/investors/investor-agreements";
import { EmptyState, Section } from "@/components/page";
import { PortalPapers } from "@/components/portal/portal-papers";
import { useLanguage } from "@/i18n/language-provider";

/**
 * Every paper of theirs in one place, one card per Venture listing its joining letter, progress statement and
 * settlement statement — made as the Owner would print it, two clicks from anywhere in the portal. A Venture called
 * off has none to make.
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
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {papered.map((one) => (
        <Section key={one.id} title={one.venture.name}>
          <PortalPapers
            agreementId={one.id}
            hasCapital={one.capitalHeldBdt > 0 || one.settlement !== null}
            settled={one.settlement !== null}
          />
        </Section>
      ))}
    </div>
  );
};
