"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

import { EmailPasswordFields } from "@/components/auth/OAuthButtons";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    if (!res.ok) {
      const data = (await res.json()) as { message?: string };
      setError(data.message ?? "Registration failed.");
      setLoading(false);
      return;
    }

    // Auto sign-in after successful registration
    const result = await signIn("credentials", {
      email,
      password,
      callbackUrl: "/",
      redirect: false,
    });

    setLoading(false);
    if (result?.url) {
      window.location.href = result.url;
    } else {
      setError("Registration succeeded but sign-in failed. Please sign in.");
    }
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col px-4 py-16">
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-md">
        <h1 className="mb-6 text-center text-xl font-semibold tracking-tight text-gray-900">
          Create your account
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <EmailPasswordFields
            name={name}
            onName={setName}
            email={email}
            password={password}
            onEmail={setEmail}
            onPassword={setPassword}
            autoCompletePassword="new-password"
            minLengthPassword={12}
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
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{" "}
          <a href="/auth/signin" className="font-medium text-blue-600 hover:text-blue-700">
            Sign in
          </a>
        </p>
      </div>
    </main>
  );
}
