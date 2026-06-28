import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service — OpenCan" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold tracking-tight text-gray-900">Terms of Service</h1>
      <p className="mb-10 text-sm text-gray-400">Last updated: June 2026</p>

      <div className="prose prose-gray max-w-none space-y-8 text-gray-700">
        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">1. Acceptance of terms</h2>
          <p>
            By accessing or using OpenCan you agree to be bound by these Terms of Service. If you
            do not agree, do not use the service.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">2. Description of service</h2>
          <p>
            OpenCan is a customer feedback management platform that allows users to submit, vote
            on, and discuss product feedback. Administrators can moderate submissions, update
            statuses, and publish changelog entries.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">3. Your account</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>You are responsible for keeping your account credentials secure.</li>
            <li>
              You must provide accurate information when creating your account. Impersonating
              another person or organisation is prohibited.
            </li>
            <li>
              You may not share your account with others or create accounts for automated purposes
              without explicit permission.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">4. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>Post content that is unlawful, abusive, defamatory, or infringes third-party rights.</li>
            <li>Attempt to gain unauthorised access to any part of the service or its infrastructure.</li>
            <li>Use the service to transmit spam, malware, or other harmful content.</li>
            <li>Reverse-engineer, scrape, or systematically harvest data from the service.</li>
            <li>Interfere with the availability or performance of the service for other users.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">5. Content ownership</h2>
          <p>
            You retain ownership of content you submit (posts, comments). By submitting content
            you grant the operator of this OpenCan instance a non-exclusive, royalty-free licence
            to display and distribute that content to other users of the service for the purpose
            of operating the feedback platform.
          </p>
          <p className="mt-3">
            Administrators may remove or moderate any content that violates these terms or their
            own community guidelines.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">6. Account suspension and termination</h2>
          <p>
            Administrators may suspend or delete accounts that violate these terms. You may
            request deletion of your account at any time. Termination does not automatically
            remove content you have posted to public boards.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">7. Disclaimers</h2>
          <p>
            The service is provided <strong>&ldquo;as is&rdquo;</strong> without warranties of any kind,
            express or implied, including but not limited to merchantability, fitness for a
            particular purpose, or non-infringement. We do not warrant that the service will be
            uninterrupted, error-free, or free of harmful components.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">8. Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, the operators of this OpenCan instance shall
            not be liable for any indirect, incidental, special, or consequential damages arising
            from your use of or inability to use the service, even if advised of the possibility
            of such damages.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">9. Open-source software</h2>
          <p>
            OpenCan is open-source software. The source code is available under its licence on{" "}
            <a
              href="https://github.com/sriramgopalan/opencan"
              className="text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            . These Terms of Service govern use of the hosted service, not the software licence.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">10. Changes to these terms</h2>
          <p>
            We may update these terms from time to time. Continued use of the service after
            changes are posted constitutes acceptance of the revised terms. Material changes will
            be communicated via the changelog.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">11. Contact</h2>
          <p>
            Questions about these terms? Contact the administrator of your OpenCan instance or
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
