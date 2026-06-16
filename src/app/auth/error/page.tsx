"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const ERROR_MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked:
    "This email is already registered with a different sign-in method.",
  NoEmail: "Your account does not have an email address.",
  Configuration: "There is a server configuration error.",
  AccessDenied: "Access was denied.",
  Verification: "The verification link is invalid or has expired.",
  LinkExpired: "This sign-in link has expired. Please request a new one.",
  InvalidLink: "This sign-in link is invalid or has already been used.",
  UserNotFound: "No account found for this email address. Please register first.",
};

function ErrorContent() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error") ?? "Configuration";
  const provider = searchParams.get("provider");

  const baseMessage = ERROR_MESSAGES[errorCode] ?? "An unexpected error occurred.";
  const message =
    errorCode === "OAuthAccountNotLinked" && provider
      ? `This email is already registered with ${provider}.`
      : baseMessage;

  return (
    <main>
      <h1>Authentication error</h1>
      <p role="alert">{message}</p>
      <a href="/auth/signin">Back to sign in</a>
    </main>
  );
}

export default function ErrorPage() {
  return (
    <Suspense>
      <ErrorContent />
    </Suspense>
  );
}
