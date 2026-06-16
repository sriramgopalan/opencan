"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const email = searchParams.get("email") ?? "";
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token || !email) {
      setStatus("error");
      setMessage("Invalid verification link.");
      return;
    }

    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, email }),
    })
      .then(async (res) => {
        if (res.ok) {
          setStatus("success");
          setMessage("Your email has been verified. You can now sign in.");
        } else {
          const data = (await res.json()) as { error?: string };
          setStatus("error");
          setMessage(data.error ?? "Verification failed.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("An unexpected error occurred.");
      });
  }, [token, email]);

  return (
    <main>
      <h1>Email verification</h1>
      {status === "loading" && <p>Verifying your email…</p>}
      {status === "success" && (
        <>
          <p role="status">{message}</p>
          <a href="/auth/signin">Sign in</a>
        </>
      )}
      {status === "error" && (
        <>
          <p role="alert">{message}</p>
          <a href="/auth/signin">Back to sign in</a>
        </>
      )}
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
