import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/page";
import { usePortalPlaces } from "@/components/portal/portal-source";
import { useLanguage } from "@/i18n/language-provider";
import { wordOf } from "@/lib/saying";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

type Notice = NonNullable<
  Awaited<ReturnType<typeof client.portal.yourData>>["notice"]
>;

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
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed">
          {part.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    ))}
  </article>
);

/**
 * «আপনার তথ্য»: what the farm keeps about an Investor, why, where, for how long, and how to ask — the same words as
 * the paper they were handed, open before they sign in and after. While the farm has not written down one of its own
 * facts the notice is not shown at all, and the page says whom to ask instead.
 */
export const YourData = () => {
  const { t } = useLanguage();
  const read = useQuery(orpc.portal.yourData.queryOptions());
  const { home } = usePortalPlaces();
  const closed = wordOf(read.error) === "portal_closed";
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
      {read.isPending ? <Skeleton className="h-96 rounded-xl" /> : null}
      {closed ? (
        <EmptyState icon={ShieldCheck} title={t("portal.yourData.closed")} />
      ) : null}
      {read.data?.notice ? <TheNotice notice={read.data.notice} /> : null}
      {read.data && !read.data.notice ? (
        <EmptyState
          description={
            read.data.farm.phone
              ? t("portal.yourData.notReadyHint", {
                  farm: read.data.farm.name,
                  phone: read.data.farm.phone,
                })
              : undefined
          }
          icon={ShieldCheck}
          title={t("portal.yourData.notReady")}
        />
      ) : null}
    </div>
  );
};
