import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

const HerdPage = () => {
  const t = useT();
  const queryClient = useQueryClient();
  const sheds = useQuery(orpc.herd.list.queryOptions());
  const [shedName, setShedName] = useState("");
  const [penNames, setPenNames] = useState<Record<string, string>>({});
  const [csv, setCsv] = useState("");

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.herd.key() });
  const onError = (error: Error) =>
    toast.error(error.message || t("common.error"));

  const createShed = useMutation(
    orpc.herd.createShed.mutationOptions({
      onSuccess: () => {
        setShedName("");
        refresh();
      },
      onError,
    })
  );
  const createPen = useMutation(
    orpc.herd.createPen.mutationOptions({ onSuccess: refresh, onError })
  );
  const importRegister = useMutation(
    orpc.animals.importRegister.mutationOptions({
      onSuccess: (result) => {
        toast.success(t("herd.imported", { count: result.imported.length }));
        setCsv("");
        queryClient.invalidateQueries({ queryKey: orpc.animals.key() });
      },
      onError,
    })
  );

  return (
    <div className="container mx-auto max-w-3xl space-y-8 px-4 py-6">
      <h1 className="text-2xl font-bold">{t("herd.title")}</h1>

      <form
        className="flex items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          createShed.mutate({ name: shedName });
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="shed">{t("herd.shedName")}</Label>
          <Input
            id="shed"
            value={shedName}
            onChange={(e) => setShedName(e.target.value)}
            required
          />
        </div>
        <Button type="submit" variant="outline">
          {t("herd.addShed")}
        </Button>
      </form>

      {sheds.data?.length ? (
        <ul className="space-y-3">
          {sheds.data.map((shed) => (
            <li key={shed.id} className="space-y-2 rounded-lg border p-4">
              <h2 className="font-medium">{shed.name}</h2>
              <ul className="flex flex-wrap gap-2 text-sm">
                {shed.pens.map((pen) => (
                  <li key={pen.id} className="bg-muted rounded-full px-3 py-1">
                    {pen.name}
                  </li>
                ))}
              </ul>
              <form
                className="flex items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  createPen.mutate({
                    shedId: shed.id,
                    name: penNames[shed.id] ?? "",
                  });
                  setPenNames({ ...penNames, [shed.id]: "" });
                }}
              >
                <Input
                  aria-label={t("herd.penName")}
                  value={penNames[shed.id] ?? ""}
                  onChange={(e) =>
                    setPenNames({ ...penNames, [shed.id]: e.target.value })
                  }
                  placeholder={t("herd.penName")}
                  required
                />
                <Button type="submit" size="sm" variant="outline">
                  {t("herd.addPen")}
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t("herd.noSheds")}</p>
      )}

      <form
        className="space-y-2 rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          importRegister.mutate({ csv });
        }}
      >
        <h2 className="font-medium">{t("herd.import")}</h2>
        <Label htmlFor="csv">{t("herd.importHelp")}</Label>
        <Textarea
          id="csv"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={6}
          required
        />
        <Button type="submit" disabled={importRegister.isPending}>
          {t("herd.importRun")}
        </Button>
        {importRegister.data?.failed.length ? (
          <div className="space-y-1 text-sm">
            <p className="text-warning">
              {t("herd.failedRows", {
                count: importRegister.data.failed.length,
              })}
            </p>
            <ul className="text-muted-foreground">
              {importRegister.data.failed.map((row) => (
                <li key={row.line}>
                  {t("herd.line", { line: row.line })}: {row.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </form>
    </div>
  );
};

export const Route = createFileRoute("/_auth/admin/herd")({
  component: HerdPage,
});
