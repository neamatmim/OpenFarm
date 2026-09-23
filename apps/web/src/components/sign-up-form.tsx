import { PASSWORD_MIN_LENGTH } from "@OpenFarm/auth/password";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { PasswordInput } from "@/components/auth/password-input";
import { Notice } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { authClient } from "@/lib/auth-client";

import Loader from "./loader";

const NAME_MIN = 2;

const SignUpForm = ({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) => {
  const navigate = useNavigate({
    from: "/",
  });
  const { isPending } = authClient.useSession();
  const { t, language } = useLanguage();
  // What the farm said when it refused, kept on the card as well as in the toast: a toast is gone before somebody
  // who reads slowly has read it.
  const [refused, setRefused] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      name: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signUp.email(
        {
          email: value.email,
          password: value.password,
          name: value.name,
        },
        {
          onSuccess: () => {
            navigate({
              to: "/dashboard",
            });
            toast.success(t("auth.signUpSuccess"));
          },
          onError: (error) => {
            setRefused(error.error.message || error.error.statusText);
            toast.error(error.error.message || error.error.statusText);
          },
        }
      );
    },
    validators: {
      onSubmit: z.object({
        name: z
          .string()
          .min(NAME_MIN, t("auth.nameTooShort", { min: NAME_MIN })),
        email: z.email(t("auth.invalidEmail")),
        password: z
          .string()
          .min(
            PASSWORD_MIN_LENGTH,
            t("auth.passwordTooShort", {
              min: formatNumber(PASSWORD_MIN_LENGTH, language),
            })
          ),
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
          {t("auth.createAccount")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("auth.signUpHint")}</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setRefused(null);
          form.handleSubmit();
        }}
        className="flex flex-col gap-4"
        noValidate
      >
        {refused ? (
          <Notice title={t("auth.refused")} tone="danger">
            {refused}
          </Notice>
        ) : null}
        <div>
          <form.Field name="name">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor={field.name}>{t("auth.name")}</Label>
                <Input
                  aria-describedby={
                    field.state.meta.errors.length
                      ? `${field.name}-error`
                      : undefined
                  }
                  aria-invalid={field.state.meta.errors.length > 0}
                  autoComplete="name"
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p
                    className="text-danger text-sm"
                    id={`${field.name}-error`}
                    key={error?.message}
                    role="alert"
                  >
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <div>
          <form.Field name="email">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor={field.name}>{t("auth.email")}</Label>
                <Input
                  aria-describedby={
                    field.state.meta.errors.length
                      ? `${field.name}-error`
                      : undefined
                  }
                  aria-invalid={field.state.meta.errors.length > 0}
                  autoComplete="email"
                  id={field.name}
                  inputMode="email"
                  name={field.name}
                  type="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p
                    className="text-danger text-sm"
                    id={`${field.name}-error`}
                    key={error?.message}
                    role="alert"
                  >
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
                <PasswordInput
                  aria-describedby={
                    field.state.meta.errors.length
                      ? `${field.name}-error`
                      : undefined
                  }
                  aria-invalid={field.state.meta.errors.length > 0}
                  autoComplete="new-password"
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p
                    className="text-danger text-sm"
                    id={`${field.name}-error`}
                    key={error?.message}
                    role="alert"
                  >
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
              className="mt-1 h-12 w-full text-base md:h-10"
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? <Spinner /> : null}
              {isSubmitting ? t("auth.submitting") : t("auth.signUp")}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <div className="text-center">
        <Button variant="link" onClick={onSwitchToSignIn}>
          {t("auth.haveAccount")}
        </Button>
      </div>
    </div>
  );
};

export default SignUpForm;
