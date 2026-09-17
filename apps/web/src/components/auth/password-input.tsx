import { Input } from "@OpenFarm/ui/components/input";
import { Eye, EyeOff } from "lucide-react";
import type { ComponentProps } from "react";
import { useState } from "react";

import { useT } from "@/i18n/language-provider";

/**
 * A password box with a way to see what was typed: on a phone keyboard, in a shed, one wrong letter is the usual
 * reason a sign-in fails, and seeing it is quicker than typing it all again.
 */
export const PasswordInput = (props: Omit<ComponentProps<"input">, "type">) => {
  const t = useT();
  const [shown, setShown] = useState(false);
  const Icon = shown ? EyeOff : Eye;
  return (
    <div className="relative">
      <Input {...props} className="pe-12" type={shown ? "text" : "password"} />
      <button
        aria-label={shown ? t("auth.hidePassword") : t("auth.showPassword")}
        aria-pressed={shown}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute inset-y-0 end-0 grid w-11 place-items-center rounded-e-md outline-none focus-visible:ring-2"
        onClick={() => setShown((current) => !current)}
        type="button"
      >
        <Icon aria-hidden className="size-4" />
      </button>
    </div>
  );
};
