import type { Language } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { ShieldCheck } from "lucide-react";

import {
  BackLink,
  EmptyState,
  PageHeader,
  SECTION_TITLE,
} from "@/components/page";
import {
  usePortalPlaces,
  useTheNotice,
} from "@/components/portal/portal-source";
import { useLanguage } from "@/i18n/language-provider";
import { wordOf } from "@/lib/saying";
import type { client } from "@/utils/orpc";

type Answer = Awaited<ReturnType<typeof client.portal.yourData>>;
type Notice = NonNullable<Answer["notice"]>;

/** The notice as the Investor reads it, in the language it is drawn in: its title, its opening, and each part with what
 *  it says. */
const TheNotice = ({
  notice,
  language,
}: {
  notice: Notice;
  language: Language;
}) => (
  <article className="flex max-w-3xl flex-col gap-5" lang={language}>
    <PageHeader description={notice.preamble} title={notice.title} />
    {notice.parts.map((part) => (
      <section className="flex flex-col gap-2" key={part.heading}>
        <h2 className={SECTION_TITLE}>{part.heading}</h2>
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
  const { t, language } = useLanguage();
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
  const { notice, inEnglish, farm } = read.data;
  // In the reader's own language (ADR 0021). An answer kept from before the notice was read in English has none, and
  // is drawn in Bangla until it is asked again.
  if (language === "en" && inEnglish) {
    return <TheNotice language="en" notice={inEnglish} />;
  }
  if (notice) {
    return <TheNotice language="bn" notice={notice} />;
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
      <BackLink params={home.link.params} to={home.link.to}>
        {t("portal.yourData.back")}
      </BackLink>
      <WhatIsRead />
    </div>
  );
};
