import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { AuthScreen } from "@/components/auth-screen";
import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { getUser } from "@/functions/get-user";

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
  component: RouteComponent,
});

function RouteComponent() {
  // Signing in is what nearly everybody comes here for; an account is opened once, by the farm's first person.
  const [showSignIn, setShowSignIn] = useState(true);

  return (
    <AuthScreen>
      {showSignIn ? (
        <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
      ) : (
        <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
      )}
    </AuthScreen>
  );
}
