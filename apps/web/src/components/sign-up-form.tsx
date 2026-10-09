import { PASSWORD_MIN_LENGTH } from "@OpenFarm/auth/password";
import { SETUP_CODE_HEADER } from "@OpenFarm/auth/setup-code-header";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { PasswordInput } from "@/components/auth/password-input";
import { sayAuthRefusal } from "@/components/auth/refused-notice";
import { BackToSignIn } from "@/components/door-screen";
import { CODE_SPACING, FLOW_CARD, FlowHead, Notice } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { authClient } from "@/lib/auth-client";
import { useNoFarmYet } from "@/lib/farm-name";
import { toast } from "@/lib/toast";

const NAME_MIN = 2;

const SignUpForm = ({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) => {
  const navigate = useNavigate({
    from: "/",
  });
  const { t, language } = useLanguage();
  // The first run: nobody invited whoever opens this account, and they become the farm's Owner.
  const firstFarm = useNoFarmYet();
  // What the farm said when it refused, kept on the card rather than in a toast: a toast is gone before somebody who
  // reads slowly has read it, and both at once said the same thing twice.
  const [refused, setRefused] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      name: "",
      setupCode: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signUp.email(
        {
          email: value.email,
          password: value.password,
          name: value.name,
        },
        {
          // The first Owner's setup code, from the server's log: sent beside the account, never kept on it.
          headers: value.setupCode
            ? { [SETUP_CODE_HEADER]: value.setupCode }
            : undefined,
          onSuccess: () => {
            navigate({
              to: "/",
            });
            toast.success(t("auth.signUpSuccess"));
          },
          onError: (error) => {
            setRefused(sayAuthRefusal(error.error, t, t("common.error")));
          },
        }
      );
    },
    validators: {
      onSubmit: z.object({
        name: z
          .string()
          .min(
            NAME_MIN,
            t("auth.nameTooShort", { min: formatNumber(NAME_MIN, language) })
          ),
        email: z.email(t("auth.invalidEmail")),
        password: z.string().min(
          PASSWORD_MIN_LENGTH,
          t("auth.passwordTooShort", {
            min: formatNumber(PASSWORD_MIN_LENGTH, language),
          })
        ),
        setupCode: z.string(),
      }),
    },
  });

  return (
    <div className={FLOW_CARD}>
      <FlowHead
        hint={t(firstFarm ? "auth.firstFarmHint" : "auth.signUpHint")}
        title={t(firstFarm ? "auth.firstFarmTitle" : "auth.createAccount")}
      />

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
          <Notice title={t("auth.signUpRefused")} tone="danger">
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

        {/* The first run only: on a production server the Owner's account needs the code its log printed. */}
        {firstFarm ? (
          <form.Field name="setupCode">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor={field.name}>{t("auth.setupCode")}</Label>
                <Input
                  aria-describedby={`${field.name}-hint`}
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  className={cn("font-mono", CODE_SPACING)}
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  spellCheck={false}
                  value={field.state.value}
                />
                <p
                  className="text-muted-foreground text-xs"
                  id={`${field.name}-hint`}
                >
                  {t("auth.setupCodeHint")}
                </p>
              </div>
            )}
          </form.Field>
        ) : null}

        <form.Subscribe
          selector={(state) => ({
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ isSubmitting }) => (
            <Button
              type="submit"
              className="mt-1 h-12 w-full text-base md:h-9 md:text-sm"
              disabled={isSubmitting}
            >
              {isSubmitting ? <Spinner /> : null}
              {isSubmitting ? t("auth.submitting") : t("auth.signUp")}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <BackToSignIn onClick={onSwitchToSignIn}>
        {t("auth.haveAccount")}
      </BackToSignIn>
    </div>
  );
};

export default SignUpForm;
