"use client";

import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Suspense, useState } from "react";

import { EmailPasswordFields, OAuthButtons } from "@/components/auth/OAuthButtons";

function SignInForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await signIn("credentials", {
      email,
      password,
      callbackUrl,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError("Invalid email or password.");
    } else if (result?.url) {
      window.location.href = result.url;
    }
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col px-4 py-16">
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-md">
        <h1 className="mb-6 text-center text-xl font-semibold tracking-tight text-gray-900">
          Sign in to OpenCan
        </h1>
        <form onSubmit={handleCredentials} className="space-y-4">
          <EmailPasswordFields
            email={email}
            password={password}
            onEmail={setEmail}
            onPassword={setPassword}
          />
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-gray-200" />
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">or</span>
          <span className="h-px flex-1 bg-gray-200" />
        </div>

        <OAuthButtons callbackUrl={callbackUrl} />

        <div className="mt-6 space-y-1 text-center text-sm text-gray-500">
          <p>
            <a
              href={`/auth/signin?mode=magic&callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className="font-medium text-blue-600 hover:text-blue-700"
            >
              Sign in with magic link
            </a>
          </p>
          <p>
            No account?{" "}
            <a href="/auth/register" className="font-medium text-blue-600 hover:text-blue-700">
              Create one
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
