import { formatDate, formatNumber } from "@OpenFarm/i18n";
import type { MessageKey } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { Paper } from "@/components/paper";
import type { PaperId } from "@/components/paper";
import { useLanguage } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
import { orpc } from "@/utils/orpc";

type Report = "registration" | "herd_summary";

const PAPER_OF: Record<Report, PaperId> = {
  registration: "registration-record",
  herd_summary: "herd-summary",
};

const Line = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex justify-between gap-2">
    <span className="text-muted-foreground">{label}</span>
    <span>{children}</span>
  </div>
);

/**
 * The Inspector View: the one screen the Manager opens for a DLS inspector. Every register on it is shown here
 * and handed over as a paper; the inspector never touches the phone. An inspection is a rehearsed five
 * minutes, not a scramble through the sheds' notebooks.
 */
const InspectorPage = () => {
  const { t, language } = useLanguage();
  const view = useQuery(orpc.inspector.view.queryOptions());
  const certificate = useQuery({
    ...orpc.farm.certificate.queryOptions({ input: {} }),
    enabled: Boolean(view.data?.registration.certificate),
  });
  const [paper, setPaper] = useState<{ report: Report; text: string } | null>(
    null
  );
  const print = useMutation(
    orpc.inspector.print.mutationOptions({
      onSuccess: ({ text }, { report }) => setPaper({ report, text }),
      onError: (error) =>
        toast.error(
          wordedRefusal(error, t) ?? (error.message || t("common.error"))
        ),
    })
  );

  if (!view.data) {
    return (
      <p className="p-6">
        {view.isError ? t("common.error") : t("common.loading")}
      </p>
    );
  }
  const { registration, herd } = view.data;
  const day = (at: Date | null) =>
    at ? formatDate(at, language, "date") : "—";
  const printButton = (report: Report) => (
    <Button
      disabled={print.isPending}
      onClick={() => print.mutate({ report })}
      size="sm"
      variant="outline"
    >
      {t("inspector.print")}
    </Button>
  );

  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h1 className="text-lg font-medium">{t("inspector.title")}</h1>

      <section className="space-y-2 rounded-lg border p-3 text-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{t("inspector.registration")}</h2>
          {printButton("registration")}
        </div>
        <Line label={t("identity.registrationNumber")}>
          {registration.number ?? "—"}
        </Line>
        <Line label={t("identity.registrationOffice")}>
          {registration.office ?? "—"}
        </Line>
        <Line label={t("identity.registrationIssuedOn")}>
          {day(registration.issuedOn)}
        </Line>
        <Line label={t("identity.registrationExpiresOn")}>
          {day(registration.expiresOn)}
          {registration.expired ? ` · ${t("inspector.expired")}` : ""}
          {registration.endingSoon ? ` · ${t("inspector.endingSoon")}` : ""}
        </Line>
        {certificate.data ? (
          <img
            alt={t("certificate.title")}
            className="max-h-96 rounded-lg"
            src={`data:${certificate.data.contentType};base64,${certificate.data.data}`}
          />
        ) : (
          <p className="text-muted-foreground">{t("certificate.none")}</p>
        )}
      </section>

      <section className="space-y-2 rounded-lg border p-3 text-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{t("inspector.herd")}</h2>
          {printButton("herd_summary")}
        </div>
        <Line label={t("inspector.animals")}>
          {formatNumber(herd.total, language)}
        </Line>
        {herd.bySideAndState.map((line) => (
          <Line
            key={`${line.side}-${line.state}`}
            label={`${t(`animals.side.${line.side}` as MessageKey)} · ${t(`state.${line.state}` as MessageKey)}`}
          >
            {formatNumber(line.animals, language)}
          </Line>
        ))}
        <h3 className="pt-2 font-medium">{t("inspector.byPen")}</h3>
        {herd.byPen.map((line) => (
          <Line key={line.penId} label={`${line.shed} · ${line.pen}`}>
            {formatNumber(line.animals, language)}
          </Line>
        ))}
      </section>

      {paper ? (
        <Paper
          id={PAPER_OF[paper.report]}
          image={
            paper.report === "registration" && certificate.data
              ? { ...certificate.data, alt: t("certificate.title") }
              : undefined
          }
          text={paper.text}
        />
      ) : null}
    </div>
  );
};

export const Route = createFileRoute("/_auth/inspector")({
  beforeLoad: ({ context }) => {
    // What the farm shows an inspector is the Owner's and the Manager's to show.
    const { roles } = context.me;
    if (!(roles.includes("owner") || roles.includes("manager"))) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: InspectorPage,
});
