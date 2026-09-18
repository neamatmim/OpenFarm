import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormField, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

interface Person {
  name: string;
  phone: string;
  address: string;
  nid: string;
  bankAccount: string;
  nomineeName: string;
  nomineePhone: string;
  nomineeRelation: string;
}

const NOBODY_YET: Person = {
  name: "",
  phone: "",
  address: "",
  nid: "",
  bankAccount: "",
  nomineeName: "",
  nomineePhone: "",
  nomineeRelation: "",
};

/** A field left blank is a field the Owner did not answer, not an empty answer. */
const orNothing = (value: string) => (value.trim() === "" ? undefined : value);

/**
 * One Investor, written down once and reused for every Venture they join. The nominee is asked for here
 * rather than on the Agreement, because it is the person the family would come to the farm about, not a
 * term of any one run.
 */
export const RecordInvestorSheet = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [person, setPerson] = useState<Person>(NOBODY_YET);
  const recording = useMutation(
    orpc.investors.record.mutationOptions({
      onError: (error) => toast.error(sayWhy(error, t)),
      onSuccess: async () => {
        setPerson(NOBODY_YET);
        onOpenChange(false);
        await queryClient.invalidateQueries({ queryKey: orpc.investors.key() });
        toast.success(t("investors.recorded"));
      },
    })
  );
  const ready = person.name.trim() !== "" && person.phone.trim() !== "";
  return (
    <FormSheet
      description={t("investors.recordHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        recording.mutate({
          name: person.name,
          phone: person.phone,
          address: orNothing(person.address),
          nid: orNothing(person.nid),
          bankAccount: orNothing(person.bankAccount),
          nominee:
            person.nomineeName.trim() === ""
              ? undefined
              : {
                  name: person.nomineeName,
                  phone: orNothing(person.nomineePhone),
                  relation: orNothing(person.nomineeRelation),
                },
        })
      }
      open={open}
      pending={recording.isPending}
      ready={ready}
      submitLabel={t("investors.record")}
      title={t("investors.record")}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="investor-name" label={t("investors.name")}>
          <Input
            autoComplete="off"
            id="investor-name"
            onChange={(event) =>
              setPerson({ ...person, name: event.target.value })
            }
            value={person.name}
          />
        </FormField>
        <FormField id="investor-phone" label={t("investors.phone")}>
          <Input
            id="investor-phone"
            inputMode="tel"
            onChange={(event) =>
              setPerson({ ...person, phone: event.target.value })
            }
            value={person.phone}
          />
        </FormField>
      </div>
      <FormField id="investor-address" label={t("investors.address")}>
        <Input
          autoComplete="off"
          id="investor-address"
          onChange={(event) =>
            setPerson({ ...person, address: event.target.value })
          }
          value={person.address}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="investor-nid" label={t("investors.nid")}>
          <Input
            autoComplete="off"
            id="investor-nid"
            inputMode="numeric"
            onChange={(event) =>
              setPerson({ ...person, nid: event.target.value })
            }
            value={person.nid}
          />
        </FormField>
        <FormField
          hint={t("investors.bankHint")}
          id="investor-bank"
          label={t("investors.bank")}
        >
          <Input
            autoComplete="off"
            id="investor-bank"
            onChange={(event) =>
              setPerson({ ...person, bankAccount: event.target.value })
            }
            value={person.bankAccount}
          />
        </FormField>
      </div>
      <FormField
        hint={t("investors.nomineeHint")}
        id="investor-nominee"
        label={t("investors.nominee")}
      >
        <Input
          autoComplete="off"
          id="investor-nominee"
          onChange={(event) =>
            setPerson({ ...person, nomineeName: event.target.value })
          }
          value={person.nomineeName}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="investor-nominee-phone"
          label={t("investors.nomineePhone")}
        >
          <Input
            id="investor-nominee-phone"
            inputMode="tel"
            onChange={(event) =>
              setPerson({ ...person, nomineePhone: event.target.value })
            }
            value={person.nomineePhone}
          />
        </FormField>
        <FormField
          id="investor-nominee-relation"
          label={t("investors.nomineeRelation")}
        >
          <Input
            autoComplete="off"
            id="investor-nominee-relation"
            onChange={(event) =>
              setPerson({ ...person, nomineeRelation: event.target.value })
            }
            value={person.nomineeRelation}
          />
        </FormField>
      </div>
    </FormSheet>
  );
};
