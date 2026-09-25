import { Button } from "@OpenFarm/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
} from "@tanstack/react-router";
import { Users } from "lucide-react";

import { EmptyState, Page } from "@/components/page";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalPreviewSource } from "@/components/portal/portal-source";
import { PreviewBand } from "@/components/portal/preview-band";
import { getUser } from "@/functions/get-user";
import { useT } from "@/i18n/language-provider";
import { getDeviceToken } from "@/lib/device";
import { wordOf } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

/** Why a Preview has nothing to show, in the reader's words: no Investor by that address on this farm. */
const REFUSALS = {
  no_such_investor: "investors.page.notFound",
} as const;

/**
 * The Portal Preview: one Investor's portal as they would read it today, drawn in the portal's own frame for the
 * Owner, with the band over every page saying whose it is. Reached from that Investor's page; never their session.
 */
const PreviewLayout = () => {
  const { investorId } = Route.useParams();
  const them = useQuery({
    ...orpc.portalPreview.me.queryOptions({ input: { investorId } }),
    // Nobody by that address is an answer, not a failure: asked again, it would say the same.
    retry: (count, error) => wordOf(error) !== "no_such_investor" && count < 1,
  });
  const t = useT();
  const name = them.data?.name ?? "";
  if (them.isPending) {
    // The band names whose portal this is: nothing is drawn until it can.
    return null;
  }
  if (them.isError && wordOf(them.error) === "no_such_investor") {
    return (
      <Page>
        <EmptyState
          action={
            <Button render={<Link to="/investors" />} variant="outline">
              {t("investors.page.back")}
            </Button>
          }
          icon={Users}
          title={t(REFUSALS.no_such_investor)}
        />
      </Page>
    );
  }
  return (
    <PortalPreviewSource investorId={investorId} name={name}>
      <PortalShell band={<PreviewBand investorId={investorId} name={name} />}>
        <Outlet />
      </PortalShell>
    </PortalPreviewSource>
  );
};

export const Route = createFileRoute("/investors/$investorId/as-they-see-it")({
  ssr: false,
  // The Owner alone, on their own phone: a Shed Phone is anybody's who picks it up, and anybody else has no
  // business reading an Investor's portal.
  beforeLoad: async ({ context }) => {
    if (getDeviceToken()) {
      throw redirect({ to: "/dashboard" });
    }
    let session: Awaited<ReturnType<typeof getUser>> = null;
    try {
      session = await getUser();
    } catch {
      throw redirect({ to: "/login" });
    }
    if (!session) {
      throw redirect({ to: "/login" });
    }
    const me = await context.queryClient.fetchQuery({
      ...context.orpc.people.me.queryOptions(),
      staleTime: 0,
    });
    if (!me.roles.includes("owner")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: PreviewLayout,
});
