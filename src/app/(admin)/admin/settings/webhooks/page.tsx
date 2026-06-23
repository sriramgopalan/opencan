import type { Metadata } from "next";

import { EmptyState } from "@/components/ui/EmptyState";
import { listWebhooks } from "@/server/repositories/webhook";
import { WEBHOOK_EVENTS } from "@/types/webhook";

export const metadata: Metadata = { title: "Webhooks — Admin" };

export default async function AdminWebhooksPage() {
  const webhooks = await listWebhooks();

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Webhooks</h1>
          <p className="mt-1 text-sm text-gray-500">
            Receive signed HTTP POST notifications when events occur. Manage via the tRPC API
            (<code className="rounded bg-gray-100 px-1 py-0.5">webhooks.create</code>,{" "}
            <code className="rounded bg-gray-100 px-1 py-0.5">webhooks.delete</code>,{" "}
            <code className="rounded bg-gray-100 px-1 py-0.5">webhooks.test</code>).
          </p>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <strong>Signing:</strong> Each request includes an{" "}
        <code className="rounded bg-blue-100 px-1 py-0.5">X-OpenCan-Signature: sha256=&lt;hex&gt;</code>{" "}
        header. Verify it with HMAC-SHA256 of the raw request body using your webhook secret.
      </div>

      <div className="mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Supported events
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {WEBHOOK_EVENTS.map((event) => (
            <span
              key={event}
              className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
            >
              {event}
            </span>
          ))}
        </div>
      </div>

      {webhooks.length === 0 ? (
        <EmptyState
          title="No webhooks registered"
          message="Create a webhook via the API to start receiving event notifications."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">URL</th>
                <th className="px-4 py-3">Events</th>
                <th className="px-4 py-3">Secret</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {webhooks.map((wh) => (
                <tr key={wh.id} className="transition-colors hover:bg-gray-50">
                  <td className="max-w-xs truncate px-4 py-3 font-mono text-xs text-gray-700">
                    {new URL(wh.url).hostname}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {wh.events.map((ev) => (
                        <span
                          key={ev}
                          className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                        >
                          {ev}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    ****{wh.secretPreview}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        wh.isActive
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {wh.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {wh.createdAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
