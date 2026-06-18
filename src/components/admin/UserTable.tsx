"use client";

import { useState } from "react";

import { api } from "@/lib/trpc";
import type { AdminUser } from "@/types/admin";

interface UserTableProps {
  initialUsers: AdminUser[];
  total: number;
  page: number;
  totalPages: number;
  search?: string;
}

export function UserTable({ initialUsers, total, page, totalPages, search }: UserTableProps) {
  const [users, setUsers] = useState(initialUsers);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ userId: string; email: string } | null>(null);
  const [deleteEmailInput, setDeleteEmailInput] = useState("");

  const utils = api.useUtils();

  const updateRole = api.admin.updateUserRole.useMutation({
    onSuccess: () => {
      void utils.admin.listUsers.invalidate();
    },
  });

  const suspend = api.admin.suspendUser.useMutation({
    onSuccess: (data) => {
      setUsers((prev) =>
        prev.map((u) => (u.id === data.id ? { ...u, suspendedAt: data.suspendedAt } : u)),
      );
      setPendingAction(null);
    },
  });

  const unsuspend = api.admin.unsuspendUser.useMutation({
    onSuccess: (data) => {
      setUsers((prev) =>
        prev.map((u) => (u.id === data.id ? { ...u, suspendedAt: data.suspendedAt } : u)),
      );
      setPendingAction(null);
    },
  });

  const deleteUser = api.admin.deleteUser.useMutation({
    onSuccess: (_, variables) => {
      setUsers((prev) => prev.filter((u) => u.id !== variables.userId));
      setDeleteConfirm(null);
      setDeleteEmailInput("");
    },
  });

  function pageHref(p: number) {
    const params = new URLSearchParams({ page: String(p) });
    if (search) params.set("search", search);
    return `/admin/users?${params.toString()}`;
  }

  return (
    <div>
      <p className="mb-4 text-sm text-gray-500">
        {total} user{total !== 1 ? "s" : ""}
      </p>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">User</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Role</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Joined</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{user.name ?? "—"}</div>
                  <div className="text-xs text-gray-400">{user.email}</div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      user.role === "ADMIN"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {user.suspendedAt ? (
                    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                      Suspended
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                      Active
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {user.role !== "ADMIN" && (
                      <button
                        type="button"
                        onClick={() => {
                          setPendingAction(user.id);
                          updateRole.mutate({ userId: user.id, role: "ADMIN" });
                        }}
                        disabled={pendingAction === user.id}
                        className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                      >
                        Make admin
                      </button>
                    )}
                    {user.role === "ADMIN" && (
                      <button
                        type="button"
                        onClick={() => {
                          setPendingAction(user.id);
                          updateRole.mutate({ userId: user.id, role: "MEMBER" });
                        }}
                        disabled={pendingAction === user.id}
                        className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                      >
                        Demote
                      </button>
                    )}
                    {!user.suspendedAt && user.role !== "ADMIN" && (
                      <button
                        type="button"
                        onClick={() => {
                          setPendingAction(user.id);
                          suspend.mutate({ userId: user.id });
                        }}
                        disabled={pendingAction === user.id}
                        className="rounded px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 disabled:opacity-50"
                      >
                        Suspend
                      </button>
                    )}
                    {user.suspendedAt && (
                      <button
                        type="button"
                        onClick={() => {
                          setPendingAction(user.id);
                          unsuspend.mutate({ userId: user.id });
                        }}
                        disabled={pendingAction === user.id}
                        className="rounded px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50 disabled:opacity-50"
                      >
                        Unsuspend
                      </button>
                    )}
                    {user.role !== "ADMIN" && (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm({ userId: user.id, email: user.email })}
                        className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <a href={pageHref(page - 1)} className="rounded px-3 py-1 hover:bg-gray-100">
                Previous
              </a>
            )}
            {page < totalPages && (
              <a href={pageHref(page + 1)} className="rounded px-3 py-1 hover:bg-gray-100">
                Next
              </a>
            )}
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-gray-900">Delete user account</h2>
            <p className="mb-4 text-sm text-gray-600">
              This action is irreversible. Type{" "}
              <strong className="font-medium text-gray-900">{deleteConfirm.email}</strong> to
              confirm.
            </p>
            <input
              type="email"
              value={deleteEmailInput}
              onChange={(e) => setDeleteEmailInput(e.target.value)}
              placeholder="Enter email to confirm"
              className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirm(null);
                  setDeleteEmailInput("");
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteUser.mutate({
                    userId: deleteConfirm.userId,
                    confirmEmail: deleteEmailInput,
                  });
                }}
                disabled={deleteEmailInput !== deleteConfirm.email || deleteUser.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteUser.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
