import { useMutation, useQuery } from "@tanstack/react-query";
import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";

import { useT } from "@/i18n/language-provider";
import { client, orpc } from "@/utils/orpc";

// Whose portal is on the screen. An Investor reads their own, from their own sign-in; the Owner reads one Investor's
// as they would see it, from the Owner's own (the Portal Preview). The pages are the same pages either way: they ask
// here for what to show, where their links lead and whether an act is theirs to do, and never call the portal's
// procedures themselves.

/** The Investor whose portal the Owner is reading, or nobody when an Investor reads their own. */
interface Previewing {
  investorId: string;
  name: string;
}

const PortalSource = createContext<Previewing | null>(null);

/** Everything under it reads one Investor's portal for the Owner; without it, the signed-in Investor's own. */
export const PortalPreviewSource = ({
  investorId,
  name,
  children,
}: Previewing & { children: ReactNode }) => {
  const previewing = useMemo(() => ({ investorId, name }), [investorId, name]);
  return (
    <PortalSource.Provider value={previewing}>{children}</PortalSource.Provider>
  );
};

/** The Investor whose portal the Owner is reading, or null in an Investor's own portal. */
export const usePreviewing = (): Previewing | null => useContext(PortalSource);

// Each read is asked both ways and only one is switched on, so a page's hooks are the same on every render whichever
// portal it is drawn in.

/** Their record, masked as they see it, and the farm's name and how to reach it. */
export const useTheirRecord = () => {
  const previewing = usePreviewing();
  const theirOwn = useQuery({
    ...orpc.portal.me.queryOptions(),
    enabled: previewing === null,
  });
  const seen = useQuery({
    ...orpc.portalPreview.me.queryOptions({
      input: { investorId: previewing?.investorId ?? "" },
    }),
    enabled: previewing !== null,
  });
  return previewing ? seen : theirOwn;
};

/** Their Agreements and every taka of theirs that moved. */
export const useTheirPortfolio = () => {
  const previewing = usePreviewing();
  const theirOwn = useQuery({
    ...orpc.portal.portfolio.queryOptions(),
    enabled: previewing === null,
  });
  const seen = useQuery({
    ...orpc.portalPreview.portfolio.queryOptions({
      input: { investorId: previewing?.investorId ?? "" },
    }),
    enabled: previewing !== null,
  });
  return previewing ? seen : theirOwn;
};

/** The Ventures raising capital the farm is showing them. */
export const useTheirOpenVentures = () => {
  const previewing = usePreviewing();
  const theirOwn = useQuery({
    ...orpc.portal.openVentures.queryOptions(),
    enabled: previewing === null,
  });
  const seen = useQuery({
    ...orpc.portalPreview.openVentures.queryOptions({
      input: { investorId: previewing?.investorId ?? "" },
    }),
    enabled: previewing !== null,
  });
  return previewing ? seen : theirOwn;
};

/** Their Requests to Join, and where each stands. */
export const useTheirRequests = () => {
  const previewing = usePreviewing();
  const theirOwn = useQuery({
    ...orpc.portal.myRequests.queryOptions(),
    enabled: previewing === null,
  });
  const seen = useQuery({
    ...orpc.portalPreview.myRequests.queryOptions({
      input: { investorId: previewing?.investorId ?? "" },
    }),
    enabled: previewing !== null,
  });
  return previewing ? seen : theirOwn;
};

/** Where they are signed in to the portal now. */
export const useTheirSignIns = () => {
  const previewing = usePreviewing();
  const theirOwn = useQuery({
    ...orpc.portal.signedInOn.queryOptions(),
    enabled: previewing === null,
  });
  const seen = useQuery({
    ...orpc.portalPreview.signedInOn.queryOptions({
      input: { investorId: previewing?.investorId ?? "" },
    }),
    enabled: previewing !== null,
  });
  return previewing ? seen : theirOwn;
};

/** One of their Ventures as it stands today. */
export const useTheirVenture = (agreementId: string) => {
  const previewing = usePreviewing();
  const theirOwn = useQuery({
    ...orpc.portal.venture.queryOptions({ input: { agreementId } }),
    enabled: previewing === null,
  });
  const seen = useQuery({
    ...orpc.portalPreview.venture.queryOptions({
      input: { investorId: previewing?.investorId ?? "", agreementId },
    }),
    enabled: previewing !== null,
  });
  return previewing ? seen : theirOwn;
};

type PaperAsked = Parameters<typeof client.portal.paper>[0];

/** Making one of their papers: theirs in their own portal, the Owner's own Export in the Preview. */
export const useTheirPaper = (onError: (error: Error) => void) => {
  const previewing = usePreviewing();
  return useMutation({
    mutationFn: (asked: PaperAsked) =>
      previewing
        ? client.portalPreview.paper({
            ...asked,
            investorId: previewing.investorId,
          })
        : client.portal.paper(asked),
    onError,
  });
};

/** A page of the portal to link to, and the address it is at. */
export interface PortalPlace {
  to: string;
  params: Record<string, string>;
  /** The address itself, to tell whether it is the page on the screen. */
  path: string;
}

/** The portal's pages, as links from wherever the portal is drawn: `/portal/…`, or the Preview's own address. */
export const usePortalPlaces = () => {
  const previewing = usePreviewing();
  const base = previewing
    ? `/investors/${previewing.investorId}/as-they-see-it`
    : "/portal";
  const route = previewing
    ? "/investors/$investorId/as-they-see-it"
    : "/portal";
  const whose: Record<string, string> = previewing
    ? { investorId: previewing.investorId }
    : {};
  const place = (
    page: string,
    params: Record<string, string> = {},
    path = page
  ): PortalPlace => ({
    to: page ? `${route}/${page}` : route,
    params: { ...whose, ...params },
    path: path ? `${base}/${path}` : base,
  });
  return {
    home: place(""),
    money: place("money"),
    papers: place("papers"),
    account: place("account"),
    open: place("open"),
    venture: (agreementId: string) =>
      place(
        "ventures/$agreementId",
        { agreementId },
        `ventures/${agreementId}`
      ),
    openVenture: (ventureId: string) =>
      place("open/$ventureId", { ventureId }, `open/${ventureId}`),
  };
};

/**
 * Whether an act on the page is the reader's to do. In their own portal it is; in the Preview nothing is, and each
 * act says whose it is instead of doing it.
 */
export const useCanAct = (): { can: true } | { can: false; why: string } => {
  const previewing = usePreviewing();
  const t = useT();
  return previewing
    ? {
        can: false,
        why: t("portal.preview.onlyThey", { name: previewing.name }),
      }
    : { can: true };
};

/** Why an act on the page is dim: said under it, as every dim act in the farm's app says why. */
export const WhyNot = ({ why }: { why: string }) => (
  <p className="text-muted-foreground text-sm">{why}</p>
);
