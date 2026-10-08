import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import {
  PortalSwitch,
  ShownToInvestorsSwitch,
  SigningCodeWays,
} from "@/components/investors/portal-access";
import { Loaded, Page, PageHeader, Section } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { orpc } from "@/utils/orpc";

/**
 * What invited Investors see, the Owner's alone: whether the portal is open at all, and whether it shows projections,
 * settled returns, Agreements to agree in the app and Pay-in Notes. Set once and read rarely, so they live with the
 * farm's settings rather than over the list of Investors.
 */
const PortalSettingsPage = () => {
  const { t } = useLanguage();
  const investors = useQuery(orpc.investors.list.queryOptions());
  const standing = investors.data;
  return (
    <Page>
      <PageHeader
        description={t("investors.whatTheySee")}
        eyebrow={t("nav.identity")}
        title={t("settings.section.portal")}
      />
      <Loaded query={investors}>
        {standing ? (
          <Section>
            <div className="divide-border flex flex-col divide-y">
              <PortalSwitch open={standing.portalOpen} />
              {/* An answer this phone kept from before projections, or settled returns, could be shown says nothing
                  of them: hidden. */}
              <ShownToInvestorsSwitch
                shown={standing.projectionsShown ?? false}
                what="projections"
              />
              <ShownToInvestorsSwitch
                shown={standing.returnsShown ?? false}
                what="returns"
              />
              {/* Missing from an answer kept from before Agreements could be agreed in the app: off. */}
              <ShownToInvestorsSwitch
                shown={standing.agreementsInApp ?? false}
                what="agreements"
              />
              <SigningCodeWays codesBy={standing.codesBy} />
              {/* Missing from an answer kept from before Pay-in Notes: off. */}
              <ShownToInvestorsSwitch
                shown={standing.payInNotes ?? false}
                what="payInNotes"
              />
            </div>
          </Section>
        ) : null}
      </Loaded>
    </Page>
  );
};

export const Route = createFileRoute("/_authenticated/farm/portal")({
  /** The Owner's alone, as the switches are. */
  beforeLoad: onlyFor("owner"),
  component: PortalSettingsPage,
});
