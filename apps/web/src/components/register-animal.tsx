import { ENTRY_STATES, sideOfState } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { FormField, FormSheet, NativeSelect } from "@/components/page-kit";
import { useT } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

type EntryState = (typeof ENTRY_STATES)[number];

const optional = (value: string) => value.trim() || undefined;

const blank = {
  state: "calf" as EntryState,
  sex: "female" as "female" | "male",
  source: "born" as "born" | "bought",
  penId: "",
  breed: "",
  birthDate: "",
  officialTag: "",
  expectedCalvingOn: "",
};

/**
 * One animal onto the register by hand — a calf born before the Playbook's calving work was running, or one that came
 * in outside an Intake. The farm gives her the next Tag Number; the Side follows from the State she arrives in. A piece
 * of work of its own, so it is written in a sheet beside the page it was opened from.
 */
export const RegisterAnimal = ({
  variant = "default",
}: {
  variant?: "default" | "outline";
}) => {
  const t = useT();
  const ids = useId();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const sheds = useQuery({ ...orpc.herd.list.queryOptions(), enabled: open });
  const set = <K extends keyof typeof blank>(
    key: K,
    value: (typeof blank)[K]
  ) => setForm((current) => ({ ...current, [key]: value }));

  const register = useMutation(
    orpc.animals.register.mutationOptions({
      onSuccess: async ({ tagNumber }) => {
        toast.success(t("animals.registered", { tag: tagNumber }));
        setOpen(false);
        setForm(blank);
        await navigate({ to: "/animals/$tagNumber", params: { tagNumber } });
      },
      onError: (error) => toast.error(sayWhy(error, t)),
    })
  );

  const side = sideOfState(form.state) ?? "dairy";
  const pens = (sheds.data ?? []).flatMap((shed) =>
    shed.pens.map((pen) => ({ id: pen.id, name: `${shed.name} / ${pen.name}` }))
  );

  return (
    <>
      <Button onClick={() => setOpen(true)} type="button" variant={variant}>
        <Plus aria-hidden data-icon="inline-start" />
        {t("animals.register")}
      </Button>
      <FormSheet
        description={t("animals.registerHint")}
        onOpenChange={setOpen}
        onSubmit={() =>
          register.mutate({
            sex: form.sex,
            side,
            state: form.state,
            source: form.source,
            penId: form.penId,
            aliases: [],
            breed: optional(form.breed),
            officialTag: optional(form.officialTag),
            birthDate: form.birthDate ? new Date(form.birthDate) : undefined,
            expectedCalvingOn:
              form.state === "pregnant_heifer"
                ? optional(form.expectedCalvingOn)
                : undefined,
          })
        }
        open={open}
        pending={register.isPending}
        ready={form.penId !== ""}
        submitLabel={t("animals.register")}
        title={t("animals.register")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id={`${ids}-state`} label={t("animals.state")}>
            <NativeSelect
              id={`${ids}-state`}
              onChange={(event) =>
                set("state", event.target.value as EntryState)
              }
              value={form.state}
            >
              {ENTRY_STATES.map((state) => (
                <option key={state} value={state}>
                  {t(`state.${state}`)} ·{" "}
                  {t(`animals.side.${sideOfState(state) ?? "dairy"}`)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id={`${ids}-pen`} label={t("animals.pen")}>
            <NativeSelect
              id={`${ids}-pen`}
              onChange={(event) => set("penId", event.target.value)}
              required
              value={form.penId}
            >
              <option value="">—</option>
              {pens.map((pen) => (
                <option key={pen.id} value={pen.id}>
                  {pen.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id={`${ids}-sex`} label={t("animals.sex")}>
            <NativeSelect
              id={`${ids}-sex`}
              onChange={(event) =>
                set("sex", event.target.value as "female" | "male")
              }
              value={form.sex}
            >
              <option value="female">{t("animals.sex.female")}</option>
              <option value="male">{t("animals.sex.male")}</option>
            </NativeSelect>
          </FormField>
          <FormField id={`${ids}-source`} label={t("animals.source")}>
            <NativeSelect
              id={`${ids}-source`}
              onChange={(event) =>
                set("source", event.target.value as "born" | "bought")
              }
              value={form.source}
            >
              <option value="born">{t("animals.source.born")}</option>
              <option value="bought">{t("animals.source.bought")}</option>
            </NativeSelect>
          </FormField>
          <FormField id={`${ids}-breed`} label={t("animals.breed")}>
            <Input
              id={`${ids}-breed`}
              maxLength={60}
              onChange={(event) => set("breed", event.target.value)}
              value={form.breed}
            />
          </FormField>
          <FormField id={`${ids}-birth`} label={t("animals.birthDate")}>
            <Input
              id={`${ids}-birth`}
              onChange={(event) => set("birthDate", event.target.value)}
              type="date"
              value={form.birthDate}
            />
          </FormField>
          <FormField id={`${ids}-official`} label={t("animals.officialTag")}>
            <Input
              id={`${ids}-official`}
              maxLength={60}
              onChange={(event) => set("officialTag", event.target.value)}
              value={form.officialTag}
            />
          </FormField>
          {form.state === "pregnant_heifer" ? (
            <FormField id={`${ids}-calving`} label={t("pregnancy.expectedOn")}>
              <Input
                id={`${ids}-calving`}
                onChange={(event) =>
                  set("expectedCalvingOn", event.target.value)
                }
                type="date"
                value={form.expectedCalvingOn}
              />
            </FormField>
          ) : null}
        </div>
      </FormSheet>
    </>
  );
};
