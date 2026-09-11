import { allowedNextStates } from "@OpenFarm/domain";
import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AnimalPhoto } from "@/components/animal-photo";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

const PHOTO_MAX_BYTES = 1_500_000;

const readAsBase64 = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const binary = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join(
    ""
  );
  return btoa(binary);
};

const AnimalPage = () => {
  const { tagNumber } = Route.useParams();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [toPenId, setToPenId] = useState("");
  const [nextState, setNextState] = useState("");

  const animal = useQuery(
    orpc.animals.byTag.queryOptions({ input: { tagNumber } })
  );
  const sheds = useQuery(orpc.herd.list.queryOptions());
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.animals.key() });
  const onError = (error: Error) =>
    toast.error(error.message || t("common.error"));

  const move = useMutation(
    orpc.animals.move.mutationOptions({
      onSuccess: () => {
        toast.success(t("animals.moved"));
        refresh();
      },
      onError,
    })
  );
  const setState = useMutation(
    orpc.animals.setState.mutationOptions({
      onSuccess: () => {
        toast.success(t("animals.stateChanged"));
        refresh();
      },
      onError,
    })
  );
  const retag = useMutation(
    orpc.animals.retag.mutationOptions({
      onSuccess: () => {
        toast.success(t("animals.retagged"));
        setReason("");
        refresh();
      },
      onError,
    })
  );
  const setPhoto = useMutation(
    orpc.animals.setPhoto.mutationOptions({
      onSuccess: () => {
        toast.success(t("animals.photoSaved"));
        refresh();
      },
      onError,
    })
  );

  if (animal.isError) {
    return <p className="p-6">{t("animals.notFound")}</p>;
  }
  if (!animal.data) {
    return <p className="p-6">{t("common.loading")}</p>;
  }

  const detail = animal.data;
  const pens =
    sheds.data?.flatMap((s) =>
      s.pens.map((p) => ({ ...p, shedName: s.name }))
    ) ?? [];

  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-6">
      <header className="flex items-center gap-4">
        <AnimalPhoto
          tagNumber={detail.tagNumber}
          photoUpdatedAt={detail.photoUpdatedAt}
          size={80}
        />
        <div>
          <h1 className="text-3xl font-bold">{detail.tagNumber}</h1>
          <p className="text-muted-foreground">
            {t(`animals.side.${detail.side}`)} · {t(`state.${detail.state}`)} ·{" "}
            {detail.pen.shed.name} / {detail.pen.name}
          </p>
          {detail.aliases.length > 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("animals.aliases")}: {detail.aliases.join(", ")}
            </p>
          ) : null}
          {detail.officialTag ? (
            <p className="text-muted-foreground text-sm">
              {t("animals.officialTag")}: {detail.officialTag}
            </p>
          ) : null}
        </div>
      </header>

      <section className="space-y-2 rounded-lg border p-4">
        <Label htmlFor="photo">{t("animals.photoTake")}</Label>
        <input
          id="photo"
          type="file"
          accept="image/*"
          capture="environment"
          className="text-sm"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) {
              return;
            }
            if (file.size > PHOTO_MAX_BYTES) {
              toast.error(t("common.error"));
              return;
            }
            const data = await readAsBase64(file);
            const contentType =
              file.type === "image/png" ? "image/png" : "image/jpeg";
            setPhoto.mutate({ tagNumber: detail.tagNumber, contentType, data });
          }}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <form
          className="space-y-2 rounded-lg border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            move.mutate({
              tagNumber: detail.tagNumber,
              toPenId,
              reason: reason || undefined,
            });
          }}
        >
          <Label htmlFor="pen">{t("animals.moveTo")}</Label>
          <select
            id="pen"
            value={toPenId}
            onChange={(e) => setToPenId(e.target.value)}
            className="bg-background h-9 w-full rounded-md border px-2 text-sm"
            required
          >
            <option value="">—</option>
            {pens.map((p) => (
              <option key={p.id} value={p.id}>
                {p.shedName} / {p.name}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" disabled={!toPenId}>
            {t("animals.move")}
          </Button>
        </form>

        <form
          className="space-y-2 rounded-lg border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            setState.mutate({
              tagNumber: detail.tagNumber,
              state: nextState as Parameters<
                typeof setState.mutate
              >[0]["state"],
              reason: reason || undefined,
            });
          }}
        >
          <Label htmlFor="state">{t("animals.setState")}</Label>
          <select
            id="state"
            value={nextState}
            onChange={(e) => setNextState(e.target.value)}
            className="bg-background h-9 w-full rounded-md border px-2 text-sm"
            required
          >
            <option value="">—</option>
            {allowedNextStates(detail.state).map((s) => (
              <option key={s} value={s}>
                {t(`state.${s}`)}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" disabled={!nextState}>
            {t("animals.setState")}
          </Button>
        </form>
      </section>

      <form
        className="space-y-2 rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          retag.mutate({ tagNumber: detail.tagNumber, reason });
        }}
      >
        <Label htmlFor="reason">{t("animals.reason")}</Label>
        <Input
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button type="submit" variant="outline" disabled={!reason.trim()}>
          {t("animals.retag")}
        </Button>
      </form>

      {detail.observations.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-medium">{t("animals.observations")}</h2>
          <ul className="space-y-1 text-sm">
            {detail.observations.map((seen) => (
              <li
                className={
                  seen.withdrawn
                    ? "text-muted-foreground line-through"
                    : "text-muted-foreground"
                }
                key={seen.id}
              >
                {formatDate(new Date(seen.seenAt), language, "dateTime")} ·{" "}
                {seen.sawLabel}
                {seen.seenByName ? ` · ${seen.seenByName}` : ""}
                {" · "}
                <Link
                  className="underline"
                  params={{ instanceId: seen.instanceId }}
                  to="/work/$instanceId"
                >
                  {t("animals.moveFromWork")}
                </Link>
                {seen.withdrawn ? ` · ${t("animals.observationWithdrawn")}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-medium">{t("animals.movesHistory")}</h2>
        <ul className="space-y-1 text-sm">
          {detail.moves.map((m) => (
            <li className="text-muted-foreground" key={m.id}>
              {formatDate(new Date(m.movedAt), language, "dateTime")} ·{" "}
              {m.fromPenName ? `${m.fromPenName} → ` : ""}
              {m.toPenName}
              {m.reason ? ` · ${m.reason}` : ""}
              {m.instanceId ? (
                <>
                  {" · "}
                  <Link
                    className="underline"
                    params={{ instanceId: m.instanceId }}
                    to="/work/$instanceId"
                  >
                    {t("animals.moveFromWork")}
                  </Link>
                </>
              ) : null}
            </li>
          ))}
        </ul>
        {detail.retags.length > 0 ? (
          <>
            <h2 className="font-medium">{t("animals.retagsHistory")}</h2>
            <ul className="space-y-1 text-sm">
              {detail.retags.map((r) => (
                <li key={r.id} className="text-muted-foreground">
                  {formatDate(new Date(r.retaggedAt), language, "dateTime")} ·{" "}
                  {r.reason}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </div>
  );
};

export const Route = createFileRoute("/_auth/animals/$tagNumber")({
  component: AnimalPage,
});
