import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { AuthScreen } from "@/components/auth-screen";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { getUser } from "@/functions/get-user";

/** Signing in, opening the farm's first account, or setting a forgotten password again — one card at a time. */
const LoginPage = () => {
  // Signing in is what nearly everybody comes here for; an account is opened once, by the farm's first person,
  // and a forgotten password is why somebody is standing here with a code the farm read out to them.
  const [showing, setShowing] = useState<"signIn" | "signUp" | "forgot">(
    "signIn"
  );

  if (showing === "signUp") {
    return (
      <AuthScreen>
        <SignUpForm onSwitchToSignIn={() => setShowing("signIn")} />
      </AuthScreen>
    );
  }
  if (showing === "forgot") {
    return (
      <AuthScreen>
        <ForgotPasswordForm onDone={() => setShowing("signIn")} />
      </AuthScreen>
    );
  }
  return (
    <AuthScreen>
      <SignInForm
        onForgotPassword={() => setShowing("forgot")}
        onSwitchToSignUp={() => setShowing("signUp")}
      />
    </AuthScreen>
  );
};

export const Route = createFileRoute("/login")({
  // Somebody already signed in has nothing to do here: they go to the page their Role starts on. A phone that cannot
  // ask stays on the form rather than guessing.
  beforeLoad: async () => {
    let session: Awaited<ReturnType<typeof getUser>> = null;
    try {
      session = await getUser();
    } catch {
      return;
    }
    if (session) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: LoginPage,
});
