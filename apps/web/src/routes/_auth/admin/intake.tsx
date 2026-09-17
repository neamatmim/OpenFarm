import { Button } from "@OpenFarm/ui/components/button";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import type { IntakeFields } from "@/components/intake/intake-fields";
import {
  EMPTY,
  missingFrom,
  orNothing,
  windowIsWhole,
} from "@/components/intake/intake-fields";
import {
  AnimalSection,
  PriceSection,
  SellerSection,
  TargetSection,
} from "@/components/intake/intake-sections";
import { IntakeSummary } from "@/components/intake/intake-summary";
import { RecentIntakes } from "@/components/intake/recent-intakes";
import { Page, PageHeader } from "@/components/page";
import { useT } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

const readAsBase64 = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return btoa(Array.from(bytes, (byte) => String.fromCodePoint(byte)).join(""));
};

/**
 * The button at the foot of the form on a phone and a tablet, held in sight the whole way down it — above the phone's
 * bottom bar, which the kit's `StickyAction` (made for a Step, where the bar steps aside) would sit behind. Beside the
 * form on a wide screen the summary carries the button instead, so this bar is not drawn there.
 */
const SubmitBar = ({ children }: { children: ReactNode }) => (
  <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-[calc(3.8rem+max(env(safe-area-inset-bottom),0.25rem))] z-20 -mx-4 border-t px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 lg:hidden">
    {children}
  </div>
);

/**
 * Taking a bought-in animal in: where it came from, what it cost, what it weighed, and the
 * window it is being fed for.
 *
 * Almost everything has a default the farm already knows — the Target Window is the next
 * Eid-ul-Adha, the target weight is the Farm Parameter — so the Manager standing by a lorry
 * types the four things only they can know.
 *
 * The page is the form, since taking an animal in is the only thing anybody comes here to do: its four parts one
 * under the other, what will be written read back beside them — with the farm's own answers filled in for what was
 * left blank — and the newest arrivals beneath, so a beast is not written up twice.
 */
const IntakePage = () => {
  const t = useT();
  const navigate = useNavigate();
  const [fields, setFields] = useState<IntakeFields>(EMPTY);
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
      onError: (error) => toast.error(sayWhy(error, t)),
    })
  );

  const edit = (patch: Partial<IntakeFields>) =>
    setFields({ ...fields, ...patch });
  const ready = missingFrom(fields).length === 0 && windowIsWhole(fields);
  // The photograph goes up after the animal exists, so the whole arrival is pending until it has.
  const pending = record.isPending || setItsPhoto.isPending;

  return (
    <Page>
      <PageHeader description={t("intake.subtitle")} title={t("nav.intake")} />

      <form
        className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) {
            return;
          }
          record.mutate({
            penId: fields.penId,
            sex: fields.sex,
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
            paymentMethod: fields.paymentMethod,
          });
        }}
      >
        <div className="flex min-w-0 flex-col gap-4">
          <AnimalSection
            fields={fields}
            onEdit={edit}
            onPhoto={setPhoto}
            pens={pens}
            photoName={photo?.name ?? null}
          />
          <SellerSection fields={fields} onEdit={edit} />
          <PriceSection fields={fields} onEdit={edit} />
          <TargetSection fields={fields} onEdit={edit} />
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20 lg:row-span-2">
          <IntakeSummary
            fields={fields}
            pending={pending}
            pens={pens}
            photoName={photo?.name ?? null}
          />
        </aside>

        <SubmitBar>
          <Button
            className="w-full sm:w-auto"
            disabled={!ready || pending}
            size="lg"
            type="submit"
          >
            {pending ? (
              <Spinner />
            ) : (
              <ClipboardCheck aria-hidden data-icon="inline-start" />
            )}
            {t("intake.record")}
          </Button>
        </SubmitBar>
      </form>

      <RecentIntakes />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/admin/intake")({
  component: IntakePage,
});
