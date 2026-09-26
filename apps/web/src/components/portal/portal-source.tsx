import { useMutation, useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";

import { animalPhotoKey } from "@/components/portal/animal-photo-key";
import { useT } from "@/i18n/language-provider";
import { client, orpc } from "@/utils/orpc";

// Whose portal is on the screen. An Investor reads their own, from their own sign-in; the Owner reads one Investor's
// as they would see it, from the Owner's own (the Portal Preview). The pages are the same pages either way: they ask
// here for what to show, where their links lead and whether an act is theirs to do. An act — a Request, a password,
// signing devices out — keeps its own call on its page, and in the Preview it is dim and never made.

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

// Each read is asked the Investor's own way, or the Preview's for the Investor being read: whichever portal this is.
// One query either way, so a page's hooks are the same on every render.

/** The Investor being read, for a Preview read; nobody in their own portal, where it is never asked. */
const useWhose = () => ({ investorId: usePreviewing()?.investorId ?? "" });

/** Their record, masked as they see it, and the farm's name and how to reach it. */
export const useTheirRecord = () => {
  const input = useWhose();
  return useQuery(
    usePreviewing()
      ? orpc.portalPreview.me.queryOptions({ input })
      : orpc.portal.me.queryOptions()
  );
};

/** Their Agreements and every taka of theirs that moved. */
export const useTheirPortfolio = () => {
  const input = useWhose();
  return useQuery(
    usePreviewing()
      ? orpc.portalPreview.portfolio.queryOptions({ input })
      : orpc.portal.portfolio.queryOptions()
  );
};

/** The Ventures raising capital the farm is showing them. */
export const useTheirOpenVentures = () => {
  const input = useWhose();
  return useQuery(
    usePreviewing()
      ? orpc.portalPreview.openVentures.queryOptions({ input })
      : orpc.portal.openVentures.queryOptions()
  );
};

/** Their Requests to Join, and where each stands. */
export const useTheirRequests = () => {
  const input = useWhose();
  return useQuery(
    usePreviewing()
      ? orpc.portalPreview.myRequests.queryOptions({ input })
      : orpc.portal.myRequests.queryOptions()
  );
};

/** Where they are signed in to the portal now. */
export const useTheirSignIns = () => {
  const input = useWhose();
  return useQuery(
    usePreviewing()
      ? orpc.portalPreview.signedInOn.queryOptions({ input })
      : orpc.portal.signedInOn.queryOptions()
  );
};

/** One of their Ventures as it stands today. */
export const useTheirVenture = (agreementId: string) => {
  const whose = useWhose();
  return useQuery(
    usePreviewing()
      ? orpc.portalPreview.venture.queryOptions({
          input: { ...whose, agreementId },
        })
      : orpc.portal.venture.queryOptions({ input: { agreementId } })
  );
};

/**
 * One animal's photograph, standing in one of their Ventures — asked only for an animal that has one. Keyed by when it
 * was taken as well, so a photograph the farm replaces is asked for again, and never otherwise: it is up to two
 * megabytes.
 */
export const useTheirAnimalPhoto = (
  agreementId: string,
  tagNumber: string,
  photoAt: Date | string
) => {
  const whose = useWhose();
  const previewing = usePreviewing() !== null;
  const input = { agreementId, tagNumber };
  return useQuery({
    queryKey: animalPhotoKey({
      previewing,
      input: previewing ? { ...whose, ...input } : input,
      photoAt,
    }),
    queryFn: () =>
      previewing
        ? client.portalPreview.animalPhoto({ ...whose, ...input })
        : client.portal.animalPhoto(input),
    staleTime: Number.POSITIVE_INFINITY,
  });
};

/**
 * Marks the Ventures offered to them as looked at, once, when a page showing them has any they have not seen — in
 * their own portal only: the Owner's Preview leaves nothing on their side.
 */
export const useLookedAtOffers = (
  offered: readonly { isNew?: boolean }[] | undefined
) => {
  const previewing = usePreviewing() !== null;
  const marking = useMutation(orpc.portal.sawOffers.mutationOptions());
  const { mutate } = marking;
  const marked = useRef(false);
  // An answer this phone kept from before offers could be new has none that are.
  const anyNew = (offered ?? []).some((one) => one.isNew === true);
  useEffect(() => {
    if (anyNew && !previewing && !marked.current) {
      marked.current = true;
      mutate();
    }
  }, [anyNew, previewing, mutate]);
};

/** «আপনার তথ্য»: the notice as the portal shows it — to anybody in the Investor's own portal, and to the Owner in the
 *  Preview whether the portal is open or shut. */
export const useTheNotice = () =>
  useQuery(
    usePreviewing()
      ? orpc.portalPreview.yourData.queryOptions()
      : orpc.portal.yourData.queryOptions()
  );

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

/** A `$param` in a route, filled in to make its address. */
const ROUTE_PARAM = /\$(?<name>[A-Za-z]+)/gu;

/** A page of the portal to link to: the route and its params, for a `<Link>` or `navigate`. */
export interface PortalLink {
  to: string;
  params: Record<string, string>;
}

/** A page of the portal: how to link to it, and the address it is at, to tell whether it is the page on the screen. */
export interface PortalPlace {
  link: PortalLink;
  path: string;
}

/** The portal's pages, as links from wherever the portal is drawn: `/portal/…`, or the Preview's own address. */
export const usePortalPlaces = () => {
  const previewing = usePreviewing();
  const route = previewing
    ? "/investors/$investorId/as-they-see-it"
    : "/portal";
  const whose: Record<string, string> = previewing
    ? { investorId: previewing.investorId }
    : {};
  /** One page, by its route under the portal; its address is the route with the params filled in. */
  const place = (
    page: string,
    params: Record<string, string> = {}
  ): PortalPlace => {
    const to = page ? `${route}/${page}` : route;
    const all = { ...whose, ...params };
    const path = to.replaceAll(
      ROUTE_PARAM,
      (_, name: string) => all[name] ?? ""
    );
    return { link: { to, params: all }, path };
  };
  return {
    home: place(""),
    money: place("money"),
    papers: place("papers"),
    account: place("account"),
    openVentures: place("open"),
    ventures: place("ventures"),
    requests: place("requests"),
    yourData: place("your-data"),
    venture: (agreementId: string) =>
      place("ventures/$agreementId", { agreementId }),
    openVenture: (ventureId: string) => place("open/$ventureId", { ventureId }),
  };
};

/** Whether an act on the page is the reader's to do, and if not, why. */
export type Acting = { can: true } | { can: false; why: string };

/**
 * Whether an act on the page is the reader's to do. In their own portal it is; in the Preview nothing is, and each
 * act says whose it is instead of doing it.
 */
export const useCanAct = (): Acting => {
  const previewing = usePreviewing();
  const t = useT();
  return previewing
    ? {
        can: false,
        why: t("portal.preview.onlyThey", { name: previewing.name }),
      }
    : { can: true };
};

/** Why an act on the page is dim, said under it as every dim act in the farm's app says why; nothing when it is not. */
export const WhyNot = ({ acting }: { acting: Acting }) =>
  acting.can ? null : (
    <p className="text-muted-foreground text-sm">{acting.why}</p>
  );
