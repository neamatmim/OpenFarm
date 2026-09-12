import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useLanguage, useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

const onError = (error: Error) => toast.error(error.message);

/**
 * The farm's list of diseases that must be reported to DLS without delay.
 *
 * Not a table shipped with the software: the schedule of the Animal Disease Rules could not be
 * sourced, so what is reportable is what the Upazila Livestock Officer confirms to this farm —
 * and the note beside each one is the farm's answer to "why did you report that one".
 */
const NotifiablePage = () => {
  const t = useT();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const list = useQuery(orpc.notifiable.list.queryOptions());
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [note, setNote] = useState("");
  /** Which disease is being taken off, and why — typed in place, because a browser dialog
   *  blocks everything else on the phone. */
  const [comingOff, setComingOff] = useState<string | null>(null);
  const [why, setWhy] = useState("");

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.notifiable.key() });
  const add = useMutation(
    orpc.notifiable.add.mutationOptions({
      onSuccess: () => {
        setName("");
        setNameEn("");
        setNote("");
        refresh();
      },
      onError,
    })
  );
  const retire = useMutation(
    orpc.notifiable.retire.mutationOptions({ onSuccess: refresh, onError })
  );

  return (
    <div className="container mx-auto max-w-2xl space-y-5 px-4 py-6">
      <h1 className="text-lg font-medium">{t("notifiable.title")}</h1>

      {list.data?.length ? (
        <ul className="space-y-2">
          {list.data.map((disease) => (
            <li
              className="space-y-1 rounded-lg border p-3 text-sm"
              key={disease.id}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={disease.retiredAt ? "text-muted-foreground" : ""}
                >
                  {language === "en" && disease.nameEn
                    ? disease.nameEn
                    : disease.nameBn}
                  {disease.retiredAt ? ` · ${t("notifiable.retired")}` : ""}
                </span>
                {disease.retiredAt ? null : (
                  <Button
                    onClick={() => setComingOff(disease.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {t("notifiable.retire")}
                  </Button>
                )}
              </div>
              {comingOff === disease.id ? (
                <form
                  className="flex items-end gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    retire.mutate({ id: disease.id, reason: why.trim() });
                    setComingOff(null);
                    setWhy("");
                  }}
                >
                  <div className="flex-1 space-y-1">
                    <Label htmlFor={`why-${disease.id}`}>
                      {t("notifiable.why")}
                    </Label>
                    <Input
                      id={`why-${disease.id}`}
                      onChange={(event) => setWhy(event.target.value)}
                      value={why}
                    />
                  </div>
                  <Button disabled={!why.trim()} size="sm" type="submit">
                    {t("notifiable.retire")}
                  </Button>
                </form>
              ) : null}
              {disease.note ? (
                <p className="text-muted-foreground text-xs">{disease.note}</p>
              ) : null}
              {disease.addedByName ? (
                <p className="text-muted-foreground text-xs">
                  {t("notifiable.addedBy", { name: disease.addedByName })} ·{" "}
                  {formatDate(new Date(disease.createdAt), language, "date")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t("notifiable.none")}</p>
      )}

      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) {
            add.mutate({
              // The English name too, when the farm has one: a Vet who writes "Anthrax" and a
              // list that only says "তড়কা" would not match, and the farm would not report.
              name: {
                bn: name.trim(),
                ...(nameEn.trim() ? { en: nameEn.trim() } : {}),
              },
              ...(note.trim() ? { note: note.trim() } : {}),
            });
          }
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="disease-name">{t("notifiable.name")}</Label>
          <Input
            id="disease-name"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="disease-name-en">{t("notifiable.nameEn")}</Label>
          <Input
            id="disease-name-en"
            onChange={(event) => setNameEn(event.target.value)}
            value={nameEn}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="disease-note">{t("notifiable.note")}</Label>
          <Input
            id="disease-note"
            onChange={(event) => setNote(event.target.value)}
            value={note}
          />
        </div>
        <Button disabled={!name.trim()} type="submit">
          {t("notifiable.add")}
        </Button>
      </form>
    </div>
  );
};

export const Route = createFileRoute("/_auth/notifiable")({
  /** The Owner, the Manager and the Vet keep this list (roles matrix); Barn Staff have no
   *  business in it, so they are sent away rather than shown a form that would refuse them. */
  beforeLoad: ({ context }) => {
    const allowed = new Set(["owner", "manager", "vet"]);
    if (!context.me.roles.some((role) => allowed.has(role))) {
      throw redirect({ to: "/today", search: {} });
    }
  },
  component: NotifiablePage,
});
