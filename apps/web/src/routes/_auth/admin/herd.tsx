import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@OpenFarm/ui/components/dialog";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FileUp, PencilLine, Plus, Warehouse } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  Notice,
  Page,
  PageHeader,
  StatusBadge,
} from "@/components/page";
import { RegisterAnimal } from "@/components/register-animal";
import { useLanguage } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

/** A new name for a Shed or a Pen. The old one stays in the audit trail; the animals in it do not move. */
const Rename = ({
  current,
  label,
  onRename,
}: {
  current: string;
  label: string;
  onRename: (name: string) => Promise<unknown>;
}) => {
  const { t } = useLanguage();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(current);
  const [saving, setSaving] = useState(false);

  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        setName(current);
      }}
      open={open}
    >
      <DialogTrigger
        render={
          <Button
            aria-label={`${t("herd.rename")}: ${current}`}
            size="sm"
            variant="ghost"
          >
            <PencilLine aria-hidden />
            <span className="sr-only sm:not-sr-only">{t("herd.rename")}</span>
          </Button>
        }
      />
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>
            {t("herd.rename")}: {current}
          </DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            let done = false;
            try {
              await onRename(name.trim());
              done = true;
            } catch (error) {
              toast.error(sayWhy(error, t));
            }
            setSaving(false);
            setOpen(!done);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Input
              id={id}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </div>
          <DialogFooter>
            <Button
              disabled={saving || !name.trim() || name.trim() === current}
              type="submit"
            >
              {saving ? <Spinner /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const HerdPage = () => {
  const { t, language } = useLanguage();
  const ids = useId();
  const queryClient = useQueryClient();
  const sheds = useQuery(orpc.herd.list.queryOptions());
  const animals = useQuery(orpc.animals.list.queryOptions({ input: {} }));
  const [shedName, setShedName] = useState("");
  const [penNames, setPenNames] = useState<Record<string, string>>({});
  const [csv, setCsv] = useState("");

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.herd.key() });
  const onError = (error: Error) => toast.error(sayWhy(error, t));

  const createShed = useMutation(
    orpc.herd.createShed.mutationOptions({
      onSuccess: async () => {
        setShedName("");
        await refresh();
      },
      onError,
    })
  );
  const createPen = useMutation(
    orpc.herd.createPen.mutationOptions({ onSuccess: refresh, onError })
  );
  const renameShed = useMutation(
    orpc.herd.renameShed.mutationOptions({ onSuccess: refresh })
  );
  const renamePen = useMutation(
    orpc.herd.renamePen.mutationOptions({ onSuccess: refresh })
  );
  const importRegister = useMutation(
    orpc.animals.importRegister.mutationOptions({
      onSuccess: async (result) => {
        toast.success(t("herd.imported", { count: result.imported.length }));
        setCsv("");
        await queryClient.invalidateQueries({ queryKey: orpc.animals.key() });
      },
      onError,
    })
  );

  const inPen = new Map<string, number>();
  for (const animal of animals.data ?? []) {
    inPen.set(animal.penId, (inPen.get(animal.penId) ?? 0) + 1);
  }
  const count = (value: number) =>
    t("herd.animalCount", { count: formatNumber(value, language) });

  return (
    <Page>
      <PageHeader
        actions={<RegisterAnimal />}
        description={t("herd.subtitle")}
        title={t("herd.title")}
      />

      <form
        className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          createShed.mutate({ name: shedName.trim() });
        }}
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={`${ids}-shed`}>{t("herd.shedName")}</Label>
          <Input
            id={`${ids}-shed`}
            onChange={(event) => setShedName(event.target.value)}
            required
            value={shedName}
          />
        </div>
        <Button
          disabled={createShed.isPending || !shedName.trim()}
          type="submit"
          variant="outline"
        >
          <Plus aria-hidden />
          {t("herd.addShed")}
        </Button>
      </form>

      {sheds.isError ? (
        <Notice title={t("common.loadFailed")} tone="danger" />
      ) : null}
      {sheds.data ? null : <Skeleton className="h-48 rounded-xl" />}
      {sheds.data?.length === 0 ? (
        <EmptyState
          description={t("herd.noShedsHint")}
          icon={Warehouse}
          title={t("herd.noSheds")}
        />
      ) : null}

      <ul className="grid gap-4 lg:grid-cols-2">
        {(sheds.data ?? []).map((shed) => (
          <li className="surface flex flex-col gap-3 p-4 md:p-5" key={shed.id}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Warehouse
                  aria-hidden
                  className="text-muted-foreground size-5 shrink-0"
                />
                <h2 className="truncate text-lg font-semibold">{shed.name}</h2>
                <StatusBadge tone="neutral">
                  {count(
                    shed.pens.reduce(
                      (sum, pen) => sum + (inPen.get(pen.id) ?? 0),
                      0
                    )
                  )}
                </StatusBadge>
              </div>
              <Rename
                current={shed.name}
                label={t("herd.shedName")}
                onRename={(name) =>
                  renameShed.mutateAsync({ id: shed.id, name })
                }
              />
            </div>
            {shed.pens.length > 0 ? (
              <ul className="divide-y rounded-lg border">
                {shed.pens.map((pen) => (
                  <li
                    className="flex items-center justify-between gap-3 px-3 py-1.5"
                    key={pen.id}
                  >
                    <span className="min-w-0 truncate text-sm font-medium">
                      {pen.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {count(inPen.get(pen.id) ?? 0)}
                      </span>
                      <Rename
                        current={pen.name}
                        label={t("herd.penName")}
                        onRename={(name) =>
                          renamePen.mutateAsync({ id: pen.id, name })
                        }
                      />
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                createPen.mutate({
                  shedId: shed.id,
                  name: (penNames[shed.id] ?? "").trim(),
                });
                setPenNames((names) => ({ ...names, [shed.id]: "" }));
              }}
            >
              <Input
                aria-label={t("herd.penName")}
                onChange={(event) =>
                  setPenNames((names) => ({
                    ...names,
                    [shed.id]: event.target.value,
                  }))
                }
                placeholder={t("herd.penName")}
                required
                value={penNames[shed.id] ?? ""}
              />
              <Button className="shrink-0" type="submit" variant="outline">
                <Plus aria-hidden />
                {t("herd.addPen")}
              </Button>
            </form>
          </li>
        ))}
      </ul>

      <form
        className="surface flex flex-col gap-3 p-4 md:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          importRegister.mutate({ csv });
        }}
      >
        <div className="flex items-center gap-2">
          <FileUp aria-hidden className="text-muted-foreground size-5" />
          <h2 className="text-lg font-semibold">{t("herd.import")}</h2>
        </div>
        <Label htmlFor={`${ids}-csv`}>{t("herd.importHelp")}</Label>
        <Textarea
          className="font-mono text-sm"
          id={`${ids}-csv`}
          onChange={(event) => setCsv(event.target.value)}
          required
          rows={6}
          value={csv}
        />
        <div>
          <Button
            disabled={importRegister.isPending || !csv.trim()}
            type="submit"
          >
            {importRegister.isPending ? <Spinner /> : null}
            {t("herd.importRun")}
          </Button>
        </div>
        {importRegister.data?.failed.length ? (
          <Notice
            title={t("herd.failedRows", {
              count: importRegister.data.failed.length,
            })}
            tone="warning"
          >
            <ul className="flex flex-col gap-0.5">
              {importRegister.data.failed.map((row) => (
                <li key={row.line}>
                  {t("herd.line", { line: row.line })}: {row.reason}
                </li>
              ))}
            </ul>
          </Notice>
        ) : null}
      </form>
    </Page>
  );
};

export const Route = createFileRoute("/_auth/admin/herd")({
  component: HerdPage,
});
