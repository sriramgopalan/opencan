import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "@/tests/msw/server";

import {
  sendAccountDeletedEmail,
  sendChangelogNotification,
  sendMagicLinkEmail,
  sendPasswordChangedEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
} from "./email";

describe("email", () => {
  it("sendWelcomeEmail sends to Resend", async () => {
    let captured: unknown;
    server.use(
      http.post("https://api.resend.com/emails", async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ id: "test-id" });
      }),
    );

    await sendWelcomeEmail("user@example.com");
    expect((captured as { to: string }).to).toBe("user@example.com");
  });

  it("sendVerificationEmail includes verify URL", async () => {
    let captured: unknown;
    server.use(
      http.post("https://api.resend.com/emails", async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ id: "test-id" });
      }),
    );

    await sendVerificationEmail("user@example.com", "https://example.com/verify");
    const body = captured as { html: string };
    expect(body.html).toContain("https://example.com/verify");
  });

  it("sendMagicLinkEmail includes browser warning", async () => {
    let captured: unknown;
    server.use(
      http.post("https://api.resend.com/emails", async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ id: "test-id" });
      }),
    );

    await sendMagicLinkEmail("user@example.com", "https://example.com/magic");
    const body = captured as { html: string };
    expect(body.html).toContain("browser where you click it");
  });

  it("sendPasswordChangedEmail sends security notice", async () => {
    let captured: unknown;
    server.use(
      http.post("https://api.resend.com/emails", async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ id: "test-id" });
      }),
    );

    await sendPasswordChangedEmail("user@example.com");
    const body = captured as { subject: string };
    expect(body.subject).toContain("password was changed");
  });

  it("sendAccountDeletedEmail sends deletion confirmation", async () => {
    let captured: unknown;
    server.use(
      http.post("https://api.resend.com/emails", async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ id: "test-id" });
      }),
    );

    await sendAccountDeletedEmail("user@example.com");
    const body = captured as { html: string };
    expect(body.html).toContain("permanently deleted");
  });

  it("sendChangelogNotification includes entry title and URL", async () => {
    let captured: unknown;
    server.use(
      http.post("https://api.resend.com/emails", async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ id: "test-id" });
      }),
    );

    await sendChangelogNotification(
      "voter@example.com",
      "Big Release v3",
      "https://example.com/changelog/big-release-v3",
    );
    const body = captured as { subject: string; html: string };
    expect(body.subject).toContain("Big Release v3");
    expect(body.html).toContain("https://example.com/changelog/big-release-v3");
  });

  it("throws when Resend returns an error", async () => {
    server.use(
      http.post("https://api.resend.com/emails", () => {
        return HttpResponse.json({ name: "validation_error", message: "Invalid from" }, { status: 422 });
      }),
    );

    await expect(sendWelcomeEmail("bad@example.com")).rejects.toBeDefined();
  });
});
