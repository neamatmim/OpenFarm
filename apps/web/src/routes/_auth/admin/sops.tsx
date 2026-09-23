import type { SopContent } from "@OpenFarm/domain";
import { findPublishBlockers } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BookOpen, GitPullRequestArrow, Hand, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Loaded, Page, PageHeader } from "@/components/page";
import type { Figure } from "@/components/page-kit";
import { PageTabs, SummaryFigures } from "@/components/page-kit";
import type { Proposal, Sop } from "@/components/playbook/playbook-types";
import { contentOf, raisedByHand } from "@/components/playbook/playbook-types";
import { ProceduresTab } from "@/components/playbook/procedures-tab";
import { ProposalsTab } from "@/components/playbook/proposals-tab";
import { SopEditor } from "@/components/playbook/sop-editor";
import { StandardSops } from "@/components/playbook/standard-sops";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { emptySop } from "@/lib/sop-draft";
import { orpc } from "@/utils/orpc";

const TABS = ["procedures", "proposals"] as const;
type Tab = (typeof TABS)[number];

/** The figures the Playbook is judged by: how many procedures are in force, how many changes wait on the Owner, and
 *  how many are raised by hand, which nobody's clock will bring round. */
const usePlaybookFigures = (
  sops: Sop[],
  proposals: Proposal[],
  isOwner: boolean
): Figure[] => {
  const { t, language } = useLanguage();
  const inForce = sops.flatMap((sop) => contentOf(sop) ?? []);
  const byHand = inForce.filter(raisedByHand).length;
  return [
    {
      label: t("sop.kpi.procedures"),
      value: formatNumber(inForce.length, language),
      hint: t("sop.kpi.proceduresHint"),
      icon: BookOpen,
    },
    {
      label: t("sop.kpi.waiting"),
      value: formatNumber(proposals.length, language),
      hint: isOwner ? t("sop.kpi.waitingOwner") : t("sop.kpi.waitingManager"),
      icon: GitPullRequestArrow,
      tone: proposals.length > 0 ? "warning" : "neutral",
    },
    {
      label: t("sop.kpi.byHand"),
      value: formatNumber(byHand, language),
      hint: t("sop.kpi.byHandHint"),
      icon: Hand,
    },
  ];
};

/**
 * The Playbook, by what somebody came to it for: the procedures in force — raising one's work now, reading its card,
 * changing it — or the changes proposed and waiting on the Owner. A procedure is written on a page of its own; the
 * Owner publishes it, and anybody else proposes it. The tab is kept in the address.
 */
const SopsPage = () => {
  const { t } = useLanguage();
  const refused = useRefused();
  const navigate = useNavigate({ from: Route.fullPath });
  const { tab = "procedures" } = Route.useSearch();
  const [draft, setDraft] = useState<{
    content: SopContent;
    definitionId: string | null;
  } | null>(null);

  const me = useQuery(orpc.people.me.queryOptions());
  // The Pens a moving Step may walk an animal to, named as the farm names them.
  const sheds = useQuery(orpc.herd.list.queryOptions());
  const pens = (sheds.data ?? []).flatMap((shed) =>
    shed.pens.map((pen) => ({
      id: pen.id,
      name: `${shed.name} / ${pen.name}`,
    }))
  );
  // What a campaign may give: the farm's own Drug List, and only what has its withdrawal days
  // written down — a campaign that gave anything else would be milk nobody could call safe.
  const drugs = useQuery(orpc.drugs.list.queryOptions());
  const products = (drugs.data ?? [])
    .filter((one) => one.prescribable)
    .map((one) => ({ id: one.id, name: one.nameBn, vaccine: one.vaccine }));
  const sops = useQuery(orpc.sops.list.queryOptions());
  const proposals = useQuery(orpc.sops.proposals.queryOptions());
  const isOwner = me.data?.roles.includes("owner") ?? false;

  const onError = refused;
  const onPublished = (result: { number: number }) => {
    toast.success(t("sop.published", { number: result.number }));
    setDraft(null);
  };

  const create = useMutation(
    orpc.sops.create.mutationOptions({ onSuccess: onPublished, onError })
  );
  const publish = useMutation(
    orpc.sops.publish.mutationOptions({ onSuccess: onPublished, onError })
  );
  const propose = useMutation(
    orpc.sops.propose.mutationOptions({
      onSuccess: () => {
        toast.success(t("sop.proposed"));
        setDraft(null);
      },
      onError,
    })
  );
  const approve = useMutation(
    orpc.sops.approveProposal.mutationOptions({
      onSuccess: onPublished,
      onError,
    })
  );
  const reject = useMutation(
    orpc.sops.rejectProposal.mutationOptions({ onError })
  );

  const save = () => {
    if (!draft) {
      return;
    }
    if (!isOwner) {
      if (draft.definitionId) {
        propose.mutate({
          definitionId: draft.definitionId,
          content: draft.content,
        });
      }
      return;
    }
    if (draft.definitionId) {
      publish.mutate({
        definitionId: draft.definitionId,
        content: draft.content,
      });
    } else {
      create.mutate({ content: draft.content });
    }
  };

  const figures = usePlaybookFigures(
    sops.data ?? [],
    proposals.data ?? [],
    isOwner
  );

  if (draft) {
    return (
      <SopEditor
        blockers={findPublishBlockers(draft.content)}
        canPublish={isOwner}
        content={draft.content}
        isNew={draft.definitionId === null}
        onCancel={() => setDraft(null)}
        onChange={(content) => setDraft({ ...draft, content })}
        onSave={save}
        pending={create.isPending || publish.isPending || propose.isPending}
        pens={pens}
        products={products}
      />
    );
  }

  return (
    <Page>
      <PageHeader
        actions={
          isOwner ? (
            <Button
              onClick={() =>
                setDraft({ content: emptySop(), definitionId: null })
              }
              type="button"
            >
              <Plus aria-hidden data-icon="inline-start" />
              {t("sop.new")}
            </Button>
          ) : null
        }
        description={t("sop.subtitle")}
        title={t("sop.title")}
      />

      <SummaryFigures figures={figures} />

      <PageTabs
        onChange={(value) =>
          navigate({
            replace: true,
            search: value === "procedures" ? {} : { tab: value },
          })
        }
        tabs={[
          {
            value: "procedures",
            label: t("sop.tab.procedures"),
            icon: BookOpen,
            content: (
              <Loaded query={sops}>
                <div className="flex flex-col gap-6">
                  <ProceduresTab
                    isOwner={isOwner}
                    onEdit={(definitionId, content) =>
                      setDraft({ content, definitionId })
                    }
                    sops={sops.data ?? []}
                  />
                  {/* Publishing is the Owner's; anybody else would only be proposing a procedure that is not there. */}
                  {isOwner ? (
                    <StandardSops
                      onAdopt={(content) =>
                        setDraft({ content, definitionId: null })
                      }
                      pens={pens}
                      products={products}
                      sops={sops.data ?? []}
                    />
                  ) : null}
                </div>
              </Loaded>
            ),
          },
          {
            value: "proposals",
            label: t("sop.tab.proposals"),
            icon: GitPullRequestArrow,
            count: proposals.data?.length,
            content: (
              <Loaded query={proposals}>
                <ProposalsTab
                  deciding={approve.isPending || reject.isPending}
                  isOwner={isOwner}
                  onApprove={(id) => approve.mutate({ id })}
                  onReject={(id) =>
                    reject.mutate({ id, note: t("sop.rejectReason") })
                  }
                  proposals={proposals.data ?? []}
                />
              </Loaded>
            ),
          },
        ]}
        value={tab}
      />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/admin/sops")({
  component: SopsPage,
  /** Which tab, kept in the address so the page comes back as it was left. */
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    TABS.includes(search.tab as Tab) && search.tab !== "procedures"
      ? { tab: search.tab as Tab }
      : {},
});
