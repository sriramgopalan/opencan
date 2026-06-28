import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy — OpenCan" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold tracking-tight text-gray-900">Privacy Policy</h1>
      <p className="mb-10 text-sm text-gray-400">Last updated: June 2026</p>

      <div className="prose prose-gray max-w-none space-y-8 text-gray-700">
        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">1. Who we are</h2>
          <p>
            OpenCan is an open-source customer feedback management platform. This policy explains
            what personal data we collect, why we collect it, and how we handle it.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">2. Data we collect</h2>
          <p>We collect only what is necessary to provide the service:</p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>
              <strong>Account information</strong> — when you sign in via Google or GitHub we
              receive your email address, display name, and avatar URL from that provider. If you
              sign up with email and password we store your email and a bcrypt-hashed password;
              your plaintext password is never stored.
            </li>
            <li>
              <strong>Content you create</strong> — posts, comments, and votes you submit on
              feedback boards.
            </li>
            <li>
              <strong>Usage data</strong> — standard web server logs (IP address, browser, pages
              visited) retained for up to 30 days for security and debugging purposes.
            </li>
          </ul>
          <p className="mt-3">
            We do not collect payment information, track you across third-party sites, or use
            advertising cookies.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">3. How we use your data</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>To authenticate you and maintain your session.</li>
            <li>
              To send transactional emails — status-change notifications and changelog updates —
              that you can opt out of in your account settings.
            </li>
            <li>To let administrators moderate feedback submitted on their boards.</li>
            <li>To detect and prevent abuse or unauthorised access.</li>
          </ul>
          <p className="mt-3">We do not sell, rent, or share your data with third parties for marketing.</p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">4. Third-party services</h2>
          <p>We use the following sub-processors:</p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>
              <strong>Google / GitHub OAuth</strong> — used for sign-in only. We do not receive
              access to your Google Drive, GitHub repositories, or any other data beyond your
              public profile.
            </li>
            <li>
              <strong>Resend</strong> — transactional email delivery. Your email address is passed
              to Resend solely to send notifications you have requested.
            </li>
            <li>
              <strong>PostgreSQL database</strong> — all application data is stored in a
              PostgreSQL instance that you or your administrator controls.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">5. Data retention</h2>
          <p>
            Your account data is retained for as long as your account exists. You may request
            deletion of your account and associated data at any time by contacting an
            administrator. Posts and comments authored by deleted accounts have their author
            reference removed; the content may remain visible if it was submitted to a public
            board.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">6. Security</h2>
          <p>
            We use industry-standard measures including HTTPS in transit, bcrypt password hashing,
            HMAC-signed webhook payloads, and session invalidation on logout and role changes. No
            system is perfectly secure; please use a strong, unique password and enable OAuth
            sign-in where possible.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">7. Your rights</h2>
          <p>
            Depending on your jurisdiction you may have the right to access, correct, export, or
            delete your personal data. To exercise these rights please contact the administrator
            of the OpenCan instance you are using.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">8. Changes to this policy</h2>
          <p>
            We may update this policy from time to time. Material changes will be announced via
            the changelog. Continued use of the service after changes are posted constitutes
            acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">9. Contact</h2>
          <p>
            Questions about this policy? Contact the administrator of your OpenCan instance or
            open an issue on the{" "}
            <a
              href="https://github.com/sriramgopalan/opencan"
              className="text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              OpenCan GitHub repository
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
