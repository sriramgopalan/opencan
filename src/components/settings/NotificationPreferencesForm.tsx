"use client";

import { useState } from "react";

import { Switch } from "@/components/ui/Switch";
import { api } from "@/lib/trpc";

interface Props {
  initialValue: boolean;
}

export function NotificationPreferencesForm({ initialValue }: Props) {
  const [checked, setChecked] = useState(initialValue);
  const [feedback, setFeedback] = useState<"saved" | "error" | null>(null);

  const update = api.auth.updateNotificationPreferences.useMutation({
    onSuccess: () => {
      setFeedback("saved");
      setTimeout(() => setFeedback(null), 2000);
    },
    onError: () => {
      setFeedback("error");
      setTimeout(() => setFeedback(null), 2000);
    },
  });

  function handleChange(value: boolean) {
    setChecked(value);
    update.mutate({ notifyOnStatusChange: value });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <label
            htmlFor="notify-status-change"
            className="text-sm font-medium text-gray-900"
          >
            Status-change emails
          </label>
          <p className="mt-0.5 text-sm text-gray-500">
            Receive an email when an admin updates the status of your post.
          </p>
        </div>
        <Switch
          id="notify-status-change"
          aria-labelledby="notify-status-change"
          checked={checked}
          onCheckedChange={handleChange}
          disabled={update.isPending}
        />
      </div>

      {feedback === "saved" && (
        <p role="status" className="text-sm font-medium text-green-600">
          Preferences saved.
        </p>
      )}
      {feedback === "error" && (
        <p role="alert" className="text-sm font-medium text-red-600">
          Failed to save. Please try again.
        </p>
      )}
    </div>
  );
}
