import { ENTRY_STATES, sideOfState } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@OpenFarm/ui/components/dialog";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { useT } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

const SELECT =
  "bg-card border-input focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full rounded-md border px-3 text-base outline-none focus-visible:ring-[3px] md:h-9 md:text-sm";

type EntryState = (typeof ENTRY_STATES)[number];

const Field = ({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) => (
  <div className="flex flex-col gap-1.5">
    <Label htmlFor={id}>{label}</Label>
    {children}
  </div>
);

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
 * in outside an Intake. The farm gives her the next Tag Number; the Side follows from the State she arrives in.
 */
export const RegisterAnimal = ({
  variant = "default",
}: {
  variant?: "default" | "outline";
}) => {
  const t = useT();
  const ids = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
        await queryClient.invalidateQueries({ queryKey: orpc.animals.key() });
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
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button variant={variant}>
            <Plus aria-hidden />
            {t("animals.register")}
          </Button>
        }
      />
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{t("animals.register")}</DialogTitle>
          <DialogDescription>{t("animals.registerHint")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
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
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={`${ids}-state`} label={t("animals.state")}>
              <select
                className={SELECT}
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
              </select>
            </Field>
            <Field id={`${ids}-sex`} label={t("animals.sex")}>
              <select
                className={SELECT}
                id={`${ids}-sex`}
                onChange={(event) =>
                  set("sex", event.target.value as "female" | "male")
                }
                value={form.sex}
              >
                <option value="female">{t("animals.sex.female")}</option>
                <option value="male">{t("animals.sex.male")}</option>
              </select>
            </Field>
            <Field id={`${ids}-source`} label={t("animals.source")}>
              <select
                className={SELECT}
                id={`${ids}-source`}
                onChange={(event) =>
                  set("source", event.target.value as "born" | "bought")
                }
                value={form.source}
              >
                <option value="born">{t("animals.source.born")}</option>
                <option value="bought">{t("animals.source.bought")}</option>
              </select>
            </Field>
            <Field id={`${ids}-pen`} label={t("animals.pen")}>
              <select
                className={SELECT}
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
              </select>
            </Field>
            <Field id={`${ids}-breed`} label={t("animals.breed")}>
              <Input
                id={`${ids}-breed`}
                maxLength={60}
                onChange={(event) => set("breed", event.target.value)}
                value={form.breed}
              />
            </Field>
            <Field id={`${ids}-birth`} label={t("animals.birthDate")}>
              <Input
                id={`${ids}-birth`}
                onChange={(event) => set("birthDate", event.target.value)}
                type="date"
                value={form.birthDate}
              />
            </Field>
            <Field id={`${ids}-official`} label={t("animals.officialTag")}>
              <Input
                id={`${ids}-official`}
                maxLength={60}
                onChange={(event) => set("officialTag", event.target.value)}
                value={form.officialTag}
              />
            </Field>
            {form.state === "pregnant_heifer" ? (
              <Field id={`${ids}-calving`} label={t("pregnancy.expectedOn")}>
                <Input
                  id={`${ids}-calving`}
                  onChange={(event) =>
                    set("expectedCalvingOn", event.target.value)
                  }
                  type="date"
                  value={form.expectedCalvingOn}
                />
              </Field>
            ) : null}
          </div>
          <DialogFooter>
            <Button disabled={register.isPending || !form.penId} type="submit">
              {register.isPending ? <Spinner /> : null}
              {t("animals.register")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
