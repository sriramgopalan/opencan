"use client";

import { CheckCircle, Loader2, XCircle } from "lucide-react";
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
    <main className="mx-auto flex max-w-sm flex-col px-4 py-16">
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-md">
        <h1 className="mb-6 text-center text-xl font-semibold tracking-tight text-gray-900">
          Email verification
        </h1>

        {status === "loading" && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" aria-hidden="true" />
            <p className="text-sm text-gray-600">Verifying your email…</p>
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle className="h-8 w-8 text-green-500" aria-hidden="true" />
            <p role="status" className="text-center text-sm text-gray-600">
              {message}
            </p>
            <a
              href="/auth/signin"
              className="mt-2 block w-full rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Sign in
            </a>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-3">
            <XCircle className="h-8 w-8 text-red-500" aria-hidden="true" />
            <p role="alert" className="text-center text-sm text-gray-600">
              {message}
            </p>
            <a
              href="/auth/signin"
              className="mt-2 block w-full rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Back to sign in
            </a>
          </div>
        )}
      </div>
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
