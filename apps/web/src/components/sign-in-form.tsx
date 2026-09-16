import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import { useT } from "@/i18n/language-provider";
import { authClient } from "@/lib/auth-client";

import Loader from "./loader";

const PASSWORD_MIN = 8;

export default function SignInForm({
  onSwitchToSignUp,
  onForgotPassword,
}: {
  onSwitchToSignUp: () => void;
  onForgotPassword: () => void;
}) {
  const navigate = useNavigate({
    from: "/",
  });
  const { isPending } = authClient.useSession();
  const t = useT();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            navigate({
              to: "/dashboard",
            });
            toast.success(t("auth.signInSuccess"));
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        }
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email(t("auth.invalidEmail")),
        password: z
          .string()
          .min(PASSWORD_MIN, t("auth.passwordTooShort", { min: PASSWORD_MIN })),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="bg-card flex flex-col gap-6 rounded-2xl border p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("auth.welcomeBack")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("auth.formHint")}</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <form.Field name="email">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor={field.name}>{t("auth.email")}</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-danger text-sm">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <div>
          <form.Field name="password">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor={field.name}>{t("auth.password")}</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-danger text-sm">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <form.Subscribe
          selector={(state) => ({
            canSubmit: state.canSubmit,
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Button
              type="submit"
              className="mt-1 w-full"
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? t("auth.submitting") : t("auth.signIn")}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <div className="flex flex-col items-center gap-1">
        <Button onClick={onForgotPassword} variant="link">
          {t("auth.forgotPassword")}
        </Button>
        <Button variant="link" onClick={onSwitchToSignUp}>
          {t("auth.needAccount")}
        </Button>
      </div>
    </div>
  );
}
