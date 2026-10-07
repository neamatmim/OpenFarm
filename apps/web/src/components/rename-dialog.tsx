import { Input } from "@OpenFarm/ui/components/input";
import { useId, useState } from "react";

import { FormDialog, FormField } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";

/**
 * A name put right where it stands — a Category's, an account's, a disease's — starting from the name it has: a slip
 * typed once, mended without a second entry and the first retired. With an English box where the list keeps one. Given
 * a `key` of the entry renamed, so each opening starts from that entry's own name.
 */
export const RenameDialog = ({
  open,
  onOpenChange,
  title,
  description,
  bn,
  en,
  withEnglish = false,
  pending,
  handleSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  bn: string;
  en?: string | null;
  withEnglish?: boolean;
  pending: boolean;
  handleSave: (name: { bn: string; en?: string }) => void;
}) => {
  const { t } = useLanguage();
  const id = useId();
  const [name, setName] = useState(bn);
  const [english, setEnglish] = useState(en ?? "");
  return (
    <FormDialog
      description={description}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        handleSave({
          bn: name.trim(),
          ...(withEnglish && english.trim() ? { en: english.trim() } : {}),
        })
      }
      open={open}
      pending={pending}
      ready={
        name.trim() !== "" &&
        (name.trim() !== bn || english.trim() !== (en ?? ""))
      }
      submitLabel={t("common.save")}
      title={title}
    >
      <FormField id={`${id}-bn`} label={t("sop.bangla")}>
        <Input
          id={`${id}-bn`}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </FormField>
      {withEnglish ? (
        <FormField id={`${id}-en`} label={t("feed.english")}>
          <Input
            id={`${id}-en`}
            onChange={(event) => setEnglish(event.target.value)}
            value={english}
          />
        </FormField>
      ) : null}
    </FormDialog>
  );
};
