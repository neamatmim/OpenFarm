import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** What a photograph may weigh before the farm refuses it, as `animals.setPhoto` counts it. */
const PHOTO_MAX_BYTES = 1_500_000;

const readAsBase64 = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return btoa(Array.from(bytes, (byte) => String.fromCodePoint(byte)).join(""));
};

/** A blank field means "the farm's own answer", never zero. */
const orNothing = (value: string) =>
  value.trim() === "" ? undefined : Number(value);

const EMPTY = {
  penId: "",
  sex: "male",
  sellerName: "",
  sellerPlace: "",
  sellerPhone: "",
  purchasePriceBdt: "",
  weightKg: "",
  estimatedAgeMonths: "",
  breed: "",
  targetWeightKg: "",
  targetWindowStart: "",
  targetWindowEnd: "",
};

/**
 * Taking a bought-in animal in: where it came from, what it cost, what it weighed, and the
 * window it is being fed for.
 *
 * Almost everything has a default the farm already knows — the Target Window is the next
 * Eid-ul-Adha, the target weight is the Farm Parameter — so the Manager standing by a lorry
 * types the four things only they can know.
 */
const IntakePage = () => {
  const t = useT();
  const navigate = useNavigate();
  const [fields, setFields] = useState(EMPTY);
  // The photograph is the animal's face and the farm's proof of what it bought. Taken here
  // because the Manager is standing next to it; optional, because a lorry at dusk in the rain
  // is not a reason to turn an arrival away (issue 06: prompted later if missing).
  const [photo, setPhoto] = useState<File | null>(null);
  const sheds = useQuery(orpc.herd.list.queryOptions());
  const pens = (sheds.data ?? []).flatMap((shed) =>
    shed.pens.map((pen) => ({ id: pen.id, name: `${shed.name} / ${pen.name}` }))
  );

  const setItsPhoto = useMutation(orpc.animals.setPhoto.mutationOptions({}));
  const record = useMutation(
    orpc.intake.record.mutationOptions({
      onSuccess: async (taken) => {
        toast.success(t("intake.recorded", { tag: taken.tagNumber }));
        // After the animal exists, because a photo belongs to an animal and there was none
        // until a moment ago. A photo that fails to go up does not undo the arrival: the
        // animal is on the farm either way, and its page will ask for one.
        if (photo) {
          try {
            await setItsPhoto.mutateAsync({
              tagNumber: taken.tagNumber,
              contentType:
                photo.type === "image/png" ? "image/png" : "image/jpeg",
              data: await readAsBase64(photo),
            });
          } catch {
            toast.error(t("intake.photoLater"));
          }
        }
        setFields(EMPTY);
        setPhoto(null);
        navigate({
          to: "/animals/$tagNumber",
          params: { tagNumber: taken.tagNumber },
        });
      },
      onError: (error) => toast.error(error.message || t("common.error")),
    })
  );

  const edit = (patch: Partial<typeof fields>) =>
    setFields({ ...fields, ...patch });

  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h1 className="text-lg font-medium">{t("nav.intake")}</h1>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          record.mutate({
            penId: fields.penId,
            sex: fields.sex === "female" ? "female" : "male",
            seller: {
              name: fields.sellerName,
              address: fields.sellerPlace || undefined,
              phone: fields.sellerPhone || undefined,
            },
            purchasePriceBdt: Number(fields.purchasePriceBdt),
            weightKg: Number(fields.weightKg),
            estimatedAgeMonths: Number(fields.estimatedAgeMonths),
            breed: fields.breed || undefined,
            targetWeightKg: orNothing(fields.targetWeightKg),
            targetWindowStart: fields.targetWindowStart || undefined,
            targetWindowEnd: fields.targetWindowEnd || undefined,
          });
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="intake-pen">{t("intake.pen")}</Label>
          <select
            className="bg-background h-9 w-full rounded-md border px-2 text-sm"
            id="intake-pen"
            onChange={(e) => edit({ penId: e.target.value })}
            required
            value={fields.penId}
          >
            <option value="">—</option>
            {pens.map((pen) => (
              <option key={pen.id} value={pen.id}>
                {pen.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="intake-sex">{t("animals.sex")}</Label>
            <select
              className="bg-background h-9 w-full rounded-md border px-2 text-sm"
              id="intake-sex"
              onChange={(e) => edit({ sex: e.target.value })}
              value={fields.sex}
            >
              <option value="male">{t("animals.sex.male")}</option>
              <option value="female">{t("animals.sex.female")}</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="intake-breed">{t("animals.breed")}</Label>
            <Input
              id="intake-breed"
              maxLength={60}
              onChange={(e) => edit({ breed: e.target.value })}
              value={fields.breed}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="intake-seller">{t("intake.sellerName")}</Label>
          <Input
            id="intake-seller"
            maxLength={120}
            onChange={(e) => edit({ sellerName: e.target.value })}
            required
            value={fields.sellerName}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="intake-place">{t("intake.sellerPlace")}</Label>
            <Input
              id="intake-place"
              maxLength={200}
              onChange={(e) => edit({ sellerPlace: e.target.value })}
              value={fields.sellerPlace}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="intake-phone">{t("intake.sellerPhone")}</Label>
            <Input
              id="intake-phone"
              inputMode="tel"
              maxLength={20}
              onChange={(e) => edit({ sellerPhone: e.target.value })}
              value={fields.sellerPhone}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label htmlFor="intake-price">{t("intake.price")}</Label>
            <Input
              id="intake-price"
              inputMode="numeric"
              onChange={(e) => edit({ purchasePriceBdt: e.target.value })}
              required
              type="number"
              value={fields.purchasePriceBdt}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="intake-weight">{t("intake.weight")}</Label>
            <Input
              id="intake-weight"
              inputMode="decimal"
              onChange={(e) => edit({ weightKg: e.target.value })}
              required
              step="0.1"
              type="number"
              value={fields.weightKg}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="intake-age">{t("intake.age")}</Label>
            <Input
              id="intake-age"
              inputMode="numeric"
              onChange={(e) => edit({ estimatedAgeMonths: e.target.value })}
              required
              type="number"
              value={fields.estimatedAgeMonths}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="intake-photo">{t("animals.photoTake")}</Label>
          <input
            accept="image/*"
            capture="environment"
            className="text-sm"
            id="intake-photo"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              if (file && file.size > PHOTO_MAX_BYTES) {
                toast.error(t("common.error"));
                return;
              }
              setPhoto(file);
            }}
            type="file"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="intake-target">{t("intake.targetWeight")}</Label>
          <Input
            id="intake-target"
            inputMode="decimal"
            onChange={(e) => edit({ targetWeightKg: e.target.value })}
            step="0.1"
            type="number"
            value={fields.targetWeightKg}
          />
          <p className="text-muted-foreground text-xs">
            {t("intake.targetWeightNote")}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="intake-from">{t("intake.windowStart")}</Label>
            <Input
              id="intake-from"
              onChange={(e) => edit({ targetWindowStart: e.target.value })}
              type="date"
              value={fields.targetWindowStart}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="intake-to">{t("intake.windowEnd")}</Label>
            <Input
              id="intake-to"
              onChange={(e) => edit({ targetWindowEnd: e.target.value })}
              type="date"
              value={fields.targetWindowEnd}
            />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          {t("intake.windowNote")}
        </p>

        <Button disabled={record.isPending} type="submit">
          {t("intake.record")}
        </Button>
      </form>
    </div>
  );
};

export const Route = createFileRoute("/_auth/admin/intake")({
  component: IntakePage,
});
