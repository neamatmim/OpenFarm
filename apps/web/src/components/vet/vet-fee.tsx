import { farmDayOf } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Receipt } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { Nothing, SaidDate } from "@/components/list-cells";
import { EmptyState, Loaded, Section, TagChip } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

type Fee = Awaited<ReturnType<typeof orpc.money.myFees.call>>[number];

/** How many fees a page shows before the next. */
const FEE_PAGE = 20;

/** Tags as the Vet types them: separated by commas or spaces. */
const TAG_SEPARATORS = /[\s,]+/u;

const VisitedOnCell = ({ row }: { row: { original: Fee } }) => (
  <span className="whitespace-nowrap">
    <SaidDate at={row.original.visitedOn} />
  </span>
);

const AmountCell = ({ row }: { row: { original: Fee } }) => {
  const { language } = useLanguage();
  return (
    <span className="font-medium whitespace-nowrap">
      ৳{formatNumber(row.original.amountBdt, language)}
    </span>
  );
};

/** The animals seen on a visit, each as her tag. */
const Tags = ({ tags }: { tags: string[] }) => {
  if (tags.length === 0) {
    return <Nothing />;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <TagChip key={tag}>{tag}</TagChip>
      ))}
    </div>
  );
};

const AnimalsCell = ({ row }: { row: { original: Fee } }) => (
  <Tags tags={row.original.tagNumbers} />
);

const NoteCell = ({ row }: { row: { original: Fee } }) =>
  row.original.note ?? <Nothing />;

const column = createListColumns<Fee>();
const feeColumns = column.columns([
  column.accessor((fee) => new Date(fee.visitedOn).getTime(), {
    id: "visitedOn",
    header: listHeader("vetFee.visitedOn"),
    cell: VisitedOnCell,
  }),
  column.accessor("amountBdt", {
    header: listHeader("vetFee.amount"),
    cell: AmountCell,
    meta: { align: "end" },
  }),
  column.accessor((fee) => fee.tagNumbers.join(", "), {
    id: "animals",
    header: listHeader("vetFee.animals"),
    cell: AnimalsCell,
  }),
  column.accessor((fee) => fee.note ?? undefined, {
    id: "note",
    header: listHeader("vetFee.note"),
    cell: NoteCell,
  }),
]);

/** A fee on a phone: the day, the fee large, the animals and the note beneath. */
const FeeCard = ({ row }: { row: Fee }) => {
  const { language } = useLanguage();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-muted-foreground text-sm">
        {formatDate(row.visitedOn, language)}
      </span>
      <span className="text-lg font-semibold tabular-nums">
        ৳{formatNumber(row.amountBdt, language)}
      </span>
      {row.tagNumbers.length > 0 ? <Tags tags={row.tagNumbers} /> : null}
      {row.note ? (
        <span className="text-muted-foreground text-xs">{row.note}</span>
      ) : null}
    </div>
  );
};

const feeCard = (row: Fee) => <FeeCard row={row} />;

const FeeList = ({ fees }: { fees: Fee[] }) => {
  const { t } = useLanguage();
  const table = useListTable({
    columns: feeColumns,
    data: fees,
    getRowId: (row) => row.id,
  });
  if (fees.length === 0) {
    return <EmptyState bare icon={Receipt} title={t("vetFee.none")} />;
  }
  return (
    <DataTable
      card={feeCard}
      minWidth="40rem"
      pageSize={FEE_PAGE}
      table={table}
    />
  );
};

/** A visit's fee, in a sheet: how much, the day, the animals seen, and a note. */
const FeeSheet = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [amount, setAmount] = useState("");
  const [visitedOn, setVisitedOn] = useState(() => farmDayOf(new Date()));
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const record = useMutation(
    orpc.money.vetFee.mutationOptions({
      onSuccess: () => {
        setAmount("");
        setTags("");
        setNote("");
        toast.success(t("vetFee.recorded"));
        onOpenChange(false);
      },
      onError: refused,
    })
  );
  return (
    <FormSheet
      description={t("vetFee.hint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        record.mutate({
          amountBdt: Number(amount),
          visitedOn,
          animalTags: tags.split(TAG_SEPARATORS).filter(Boolean),
          note: note.trim() || undefined,
        })
      }
      open={open}
      pending={record.isPending}
      ready={Number(amount) > 0}
      submitLabel={t("vetFee.record")}
      title={t("vetFee.record")}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="fee-amount" label={t("vetFee.amount")}>
          <Input
            id="fee-amount"
            inputMode="numeric"
            min={0}
            onChange={(event) => setAmount(event.target.value)}
            type="number"
            value={amount}
          />
        </FormField>
        <FormField id="fee-on" label={t("vetFee.visitedOn")}>
          <Input
            id="fee-on"
            onChange={(event) => setVisitedOn(event.target.value)}
            type="date"
            value={visitedOn}
          />
        </FormField>
      </div>
      <FormField
        hint={t("vetFee.animalsHint")}
        id="fee-tags"
        label={t("vetFee.animals")}
      >
        <Input
          autoComplete="off"
          id="fee-tags"
          onChange={(event) => setTags(event.target.value)}
          placeholder="D-0001, F-0002"
          value={tags}
        />
      </FormField>
      <FormField id="fee-note" label={t("vetFee.note")}>
        <Input
          id="fee-note"
          maxLength={300}
          onChange={(event) => setNote(event.target.value)}
          value={note}
        />
      </FormField>
    </FormSheet>
  );
};

/**
 * The Vet's own fee for a visit: how much, the day, and the animals seen. The only money the Vet enters,
 * and the only money the Vet sees.
 */
export const FeeTab = () => {
  const { t } = useLanguage();
  const [recording, setRecording] = useState(false);
  const fees = useQuery(orpc.money.myFees.queryOptions());
  return (
    <Section
      action={
        <Button onClick={() => setRecording(true)} type="button">
          <Plus aria-hidden data-icon="inline-start" />
          {t("vetFee.record")}
        </Button>
      }
      description={t("vetFee.hint")}
      title={t("vetFee.title")}
    >
      <Loaded query={fees}>
        <FeeList fees={fees.data ?? []} />
      </Loaded>
      <FeeSheet onOpenChange={setRecording} open={recording} />
    </Section>
  );
};
