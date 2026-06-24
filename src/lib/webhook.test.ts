// jscpd:ignore-start
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/server/repositories/webhook", () => ({
  getActiveWebhooksForEvent: vi.fn(),
}));

vi.mock("@/lib/flags", () => ({
  isEnabled: vi.fn().mockReturnValue(true),
}));

const { dispatchWebhook, testWebhookDelivery } = await import("@/lib/webhook");
const { getActiveWebhooksForEvent } = await import("@/server/repositories/webhook");
const { isEnabled } = await import("@/lib/flags");

const WEBHOOK = {
  id: "cwh1234567890000",
  url: "https://example.com/hook",
  secret: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890", // gitleaks:allow
};
// jscpd:ignore-end

describe("dispatchWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isEnabled).mockReturnValue(true);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  });

  it("is a no-op when WEBHOOKS flag is disabled", async () => {
    vi.mocked(isEnabled).mockReturnValue(false);
    await dispatchWebhook("post.created", {});
    expect(getActiveWebhooksForEvent).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("is a no-op when no webhooks are subscribed to the event", async () => {
    vi.mocked(getActiveWebhooksForEvent).mockResolvedValue([]);
    await dispatchWebhook("post.created", {});
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("POSTs the payload to subscribed webhooks", async () => {
    vi.mocked(getActiveWebhooksForEvent).mockResolvedValue([WEBHOOK]);
    await dispatchWebhook("post.created", { id: "post1" });

    expect(global.fetch).toHaveBeenCalledOnce();
    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(WEBHOOK.url);
    expect(opts.method).toBe("POST");

    const headers = opts.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-OpenCan-Signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);

    const body = JSON.parse(opts.body as string) as { event: string; occurredAt: string; data: unknown };
    expect(body.event).toBe("post.created");
    expect(body.data).toEqual({ id: "post1" });
  });

  it("retries once on failure and does not throw", async () => {
    vi.mocked(getActiveWebhooksForEvent).mockResolvedValue([WEBHOOK]);
    global.fetch = vi.fn().mockRejectedValue(new Error("timeout"));
    await expect(dispatchWebhook("post.created", {})).resolves.toBeUndefined();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("logs warning but does not throw on non-2xx response", async () => {
    vi.mocked(getActiveWebhooksForEvent).mockResolvedValue([WEBHOOK]);
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(dispatchWebhook("post.created", {})).resolves.toBeUndefined();
  });

  it("does not call fetch for private IP webhook (10.x.x.x)", async () => {
    vi.mocked(getActiveWebhooksForEvent).mockResolvedValue([
      { ...WEBHOOK, url: "https://10.0.0.1/hook" },
    ]);
    await expect(dispatchWebhook("post.created", {})).resolves.toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("testWebhookDelivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  });

  it("returns ok:true with status when delivery succeeds", async () => {
    const result = await testWebhookDelivery(WEBHOOK);
    expect(result).toEqual({ ok: true, status: 200 });
  });

  it("returns ok:false with fixed error string on network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("connection refused"));
    const result = await testWebhookDelivery(WEBHOOK);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Delivery failed");
  });

  it("returns ok:false with fixed error string for private IP URL (192.168.x.x)", async () => {
    const result = await testWebhookDelivery({ ...WEBHOOK, url: "https://192.168.1.1/hook" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Delivery failed");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns ok:false for localhost URL", async () => {
    const result = await testWebhookDelivery({ ...WEBHOOK, url: "https://localhost/hook" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Delivery failed");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns ok:false for loopback IP URL (127.0.0.1)", async () => {
    const result = await testWebhookDelivery({ ...WEBHOOK, url: "https://127.0.0.1/hook" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Delivery failed");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns ok:false with status when server returns non-2xx", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const result = await testWebhookDelivery(WEBHOOK);
    expect(result).toEqual({ ok: false, status: 500 });
  });
});
