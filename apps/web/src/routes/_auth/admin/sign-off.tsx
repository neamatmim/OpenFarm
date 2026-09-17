import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ClipboardCheck, Clock, Gavel } from "lucide-react";

import { NeedsReview } from "@/components/needs-review";
import { Page, PageHeader } from "@/components/page";
import { PageTabs } from "@/components/page-kit";
import { CheckTab } from "@/components/sign-off/check-tab";
import { LateTab } from "@/components/sign-off/late-tab";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

const TABS = ["check", "review", "late"] as const;
type Tab = (typeof TABS)[number];

/**
 * The Manager's queues, by what they came to decide: work done and waiting to be checked, entries the farm could not
 * put right on its own, and work that has gone late. Each tab carries how many are waiting, and the tab is kept in the
 * address, so a Manager sent here from the day's screen lands on the queue they were sent to.
 */
const SignOffPage = () => {
  const { t } = useLanguage();
  const navigate = useNavigate({ from: Route.fullPath });
  const { tab = "check" } = Route.useSearch();

  const queue = useQuery(orpc.instances.signOffQueue.queryOptions());
  const review = useQuery(orpc.review.open.queryOptions());
  const late = useQuery(orpc.instances.overdue.queryOptions());

  return (
    <Page>
      <PageHeader
        description={t("signOff.subtitle")}
        title={t("signOff.title")}
      />

      <PageTabs
        onChange={(value) =>
          navigate({
            replace: true,
            search: value === "check" ? {} : { tab: value },
          })
        }
        tabs={[
          {
            value: "check",
            label: t("home.signOff"),
            icon: ClipboardCheck,
            count: queue.data?.length,
            content: <CheckTab queue={queue} />,
          },
          {
            value: "review",
            label: t("review.title"),
            icon: Gavel,
            count: review.data?.length,
            content: <NeedsReview queue={review} />,
          },
          {
            value: "late",
            label: t("work.overdueTitle"),
            icon: Clock,
            count: late.data?.length,
            content: <LateTab late={late} />,
          },
        ]}
        value={tab}
      />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/admin/sign-off")({
  component: SignOffPage,
  /** Which queue, kept in the address so the page comes back as it was left. */
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    TABS.includes(search.tab as Tab) && search.tab !== "check"
      ? { tab: search.tab as Tab }
      : {},
});
