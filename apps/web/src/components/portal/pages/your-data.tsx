import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/page";
import {
  usePortalPlaces,
  useTheNotice,
} from "@/components/portal/portal-source";
import { useLanguage } from "@/i18n/language-provider";
import { wordOf } from "@/lib/saying";
import type { client } from "@/utils/orpc";

type Answer = Awaited<ReturnType<typeof client.portal.yourData>>;
type Notice = NonNullable<Answer["notice"]>;

/** The notice as the Investor reads it: its title, its opening, and each part with what it says, in Bangla. */
const TheNotice = ({ notice }: { notice: Notice }) => (
  <article className="flex flex-col gap-5" lang="bn">
    <header className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold text-balance">{notice.title}</h1>
      <p className="text-muted-foreground">{notice.preamble}</p>
    </header>
    {notice.parts.map((part) => (
      <section className="flex flex-col gap-2" key={part.heading}>
        <h2 className="text-base font-semibold">{part.heading}</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
          {part.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    ))}
  </article>
);

/** What the page shows, once it has asked: the notice, or why there is none and whom to ask. */
const WhatIsRead = () => {
  const { t } = useLanguage();
  const read = useTheNotice();
  if (read.isPending) {
    return <Skeleton className="h-96 rounded-xl" />;
  }
  if (read.isError) {
    const closed = wordOf(read.error) === "portal_closed";
    return (
      <EmptyState
        icon={ShieldCheck}
        title={t(closed ? "portal.yourData.closed" : "portal.yourData.failed")}
      />
    );
  }
  const { notice, farm } = read.data;
  if (notice) {
    return <TheNotice notice={notice} />;
  }
  return (
    <EmptyState
      description={
        farm.phone
          ? t("portal.yourData.notReadyHint", {
              farm: farm.name,
              phone: farm.phone,
            })
          : t("portal.yourData.notReadyAsk", { farm: farm.name })
      }
      icon={ShieldCheck}
      title={t("portal.yourData.notReady")}
    />
  );
};

/**
 * «আপনার তথ্য»: what the farm keeps about an Investor, why, where, for how long, and how to ask — the same words as
 * the paper they were handed, open before they sign in and after. While the farm has not written down a fact it names
 * the notice is not shown at all, and the page says whom to ask instead.
 */
export const YourData = () => {
  const { t } = useLanguage();
  const { home } = usePortalPlaces();
  return (
    <div className="flex flex-col gap-6">
      <Link
        className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm"
        params={home.link.params}
        to={home.link.to}
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t("portal.yourData.back")}
      </Link>
      <WhatIsRead />
    </div>
  );
};
