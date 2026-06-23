import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { NotificationPreferencesForm } from "@/components/settings/NotificationPreferencesForm";
import { getNotificationPreference } from "@/server/repositories/user";

export const metadata = { title: "Settings — OpenCan" };

export default async function SettingsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/auth/signin");
  const notifyOnStatusChange = await getNotificationPreference(userId);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <section aria-labelledby="notifications-heading" className="mt-8">
        <h2
          id="notifications-heading"
          className="text-base font-semibold text-gray-900"
        >
          Notifications
        </h2>
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6">
          <NotificationPreferencesForm initialValue={notifyOnStatusChange} />
        </div>
      </section>
    </main>
  );
}
