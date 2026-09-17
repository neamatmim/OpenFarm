import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FileUp, Plus, Warehouse } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ImportRegisterSheet } from "@/components/herd/import-register-sheet";
import { NameDialog } from "@/components/herd/name-dialog";
import type { ShedActions, ShedRow } from "@/components/herd/shed-card";
import { ShedCard } from "@/components/herd/shed-card";
import { EmptyState, Notice, Page, PageHeader } from "@/components/page";
import { RegisterAnimal } from "@/components/register-animal";
import { useLanguage } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

/** Which name is being written: a new Shed, a new Pen in a Shed, or a new name for one the farm has. */
type Naming =
  | { kind: "newShed" }
  | { kind: "newPen"; shed: ShedRow }
  | { kind: "renameShed"; id: string; current: string }
  | { kind: "renamePen"; id: string; current: string };

/** The dialog's words for each kind of naming. */
const useNamingWords = (naming: Naming | null) => {
  const { t } = useLanguage();
  if (naming === null) {
    return { title: "", label: "", submit: "" };
  }
  switch (naming.kind) {
    case "newShed": {
      return {
        title: t("herd.addShed"),
        label: t("herd.shedName"),
        submit: t("herd.addShed"),
      };
    }
    case "newPen": {
      return {
        title: `${t("herd.addPen")} — ${naming.shed.name}`,
        label: t("herd.penName"),
        submit: t("herd.addPen"),
      };
    }
    case "renameShed": {
      return {
        title: `${t("herd.rename")}: ${naming.current}`,
        label: t("herd.shedName"),
        submit: t("common.save"),
      };
    }
    default: {
      return {
        title: `${t("herd.rename")}: ${naming.current}`,
        label: t("herd.penName"),
        submit: t("common.save"),
      };
    }
  }
};

/**
 * The farm's Sheds and the Pens inside them, a card to each Shed with its Pens and how many animals stand in each.
 * Registering an animal is the page's own act; a new Shed and the opening register sit over the cards, and a name —
 * new or changed — is written in a dialog. Renaming moves no animal.
 */
const HerdPage = () => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const sheds = useQuery(orpc.herd.list.queryOptions());
  const animals = useQuery(orpc.animals.list.queryOptions({ input: {} }));
  const [naming, setNaming] = useState<Naming | null>(null);
  const [importing, setImporting] = useState(false);
  const words = useNamingWords(naming);

  const done = async () => {
    toast.success(t("work.saved"));
    setNaming(null);
    await queryClient.invalidateQueries({ queryKey: orpc.herd.key() });
  };
  const onError = (error: Error) => toast.error(sayWhy(error, t));
  const createShed = useMutation(
    orpc.herd.createShed.mutationOptions({ onSuccess: done, onError })
  );
  const createPen = useMutation(
    orpc.herd.createPen.mutationOptions({ onSuccess: done, onError })
  );
  const renameShed = useMutation(
    orpc.herd.renameShed.mutationOptions({ onSuccess: done, onError })
  );
  const renamePen = useMutation(
    orpc.herd.renamePen.mutationOptions({ onSuccess: done, onError })
  );
  const pending =
    createShed.isPending ||
    createPen.isPending ||
    renameShed.isPending ||
    renamePen.isPending;

  const save = (name: string) => {
    if (naming === null) {
      return;
    }
    if (naming.kind === "newShed") {
      createShed.mutate({ name });
    } else if (naming.kind === "newPen") {
      createPen.mutate({ shedId: naming.shed.id, name });
    } else if (naming.kind === "renameShed") {
      renameShed.mutate({ id: naming.id, name });
    } else {
      renamePen.mutate({ id: naming.id, name });
    }
  };

  const inPen = new Map<string, number>();
  for (const animal of animals.data ?? []) {
    inPen.set(animal.penId, (inPen.get(animal.penId) ?? 0) + 1);
  }
  const actions: ShedActions = {
    handleAddPen: (shed) => setNaming({ kind: "newPen", shed }),
    handleRenameShed: (shed) =>
      setNaming({ kind: "renameShed", id: shed.id, current: shed.name }),
    handleRenamePen: (pen) =>
      setNaming({ kind: "renamePen", id: pen.id, current: pen.name }),
  };

  return (
    <Page>
      <PageHeader
        actions={<RegisterAnimal />}
        description={t("herd.subtitle")}
        title={t("herd.title")}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => setNaming({ kind: "newShed" })}
          type="button"
          variant="outline"
        >
          <Plus aria-hidden data-icon="inline-start" />
          {t("herd.addShed")}
        </Button>
        <Button
          onClick={() => setImporting(true)}
          type="button"
          variant="outline"
        >
          <FileUp aria-hidden data-icon="inline-start" />
          {t("herd.import")}
        </Button>
      </div>

      {sheds.isError ? (
        <Notice title={t("common.loadFailed")} tone="danger" />
      ) : null}
      {sheds.data ? null : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      )}
      {sheds.data?.length === 0 ? (
        <EmptyState
          action={
            <Button
              onClick={() => setNaming({ kind: "newShed" })}
              type="button"
            >
              <Plus aria-hidden data-icon="inline-start" />
              {t("herd.addShed")}
            </Button>
          }
          description={t("herd.noShedsHint")}
          icon={Warehouse}
          title={t("herd.noSheds")}
        />
      ) : null}

      {sheds.data?.length ? (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {sheds.data.map((shed) => (
            <ShedCard
              actions={actions}
              inPen={inPen}
              key={shed.id}
              shed={shed}
            />
          ))}
        </div>
      ) : null}

      <NameDialog
        current={
          naming?.kind === "renameShed" || naming?.kind === "renamePen"
            ? naming.current
            : ""
        }
        handleSubmit={save}
        key={
          naming ? `${naming.kind}-${"id" in naming ? naming.id : ""}` : "none"
        }
        label={words.label}
        onOpenChange={(open) => {
          if (!open) {
            setNaming(null);
          }
        }}
        open={naming !== null}
        pending={pending}
        submitLabel={words.submit}
        title={words.title}
      />
      <ImportRegisterSheet onOpenChange={setImporting} open={importing} />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/admin/herd")({
  component: HerdPage,
});
