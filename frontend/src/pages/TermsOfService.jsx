import { Link } from "react-router-dom";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gray-950">
      <nav className="border-b border-gray-900">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">SP</div>
            <span className="text-white font-semibold">Permission Manager</span>
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: April 2026</p>

        <div className="space-y-8 text-sm text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Acceptance of Terms</h2>
            <p>
              By accessing and using SharePoint Permission Manager ("the Service"), you agree to be bound by these
              Terms of Service. If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Description of Service</h2>
            <p>
              SharePoint Permission Manager is a web-based tool that allows IT administrators and Managed Service
              Providers to view and manage SharePoint document library permissions across Microsoft 365 tenants.
              The Service is currently in beta and provided free of charge.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Beta Service</h2>
            <p>
              The Service is currently in beta. This means:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>Features may change, be added, or removed without notice</li>
              <li>The Service may experience downtime or interruptions</li>
              <li>We may discontinue the Service at any time</li>
              <li>The Service is provided on a best-effort basis</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Your Responsibilities</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>You must have appropriate authorization to access and manage the SharePoint tenants you connect</li>
              <li>You are responsible for any permission changes you make through the Service</li>
              <li>You must not use the Service to access tenants or data you are not authorized to manage</li>
              <li>You must not attempt to circumvent security measures or access other users' sessions</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Limitation of Liability</h2>
            <p>
              The Service is provided "as is" and "as available" without warranties of any kind, either express or
              implied. We are not liable for any damages arising from:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>Permission changes made through the Service (you review and confirm all changes)</li>
              <li>Service interruptions, downtime, or data loss</li>
              <li>Unauthorized access to your Microsoft 365 tenant (authentication is handled by Microsoft)</li>
              <li>Any indirect, incidental, or consequential damages</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Intellectual Property</h2>
            <p>
              The Service and its original content, features, and functionality are owned by the developer.
              Your SharePoint data remains entirely yours — we claim no ownership or rights over your data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Termination</h2>
            <p>
              You may stop using the Service at any time by signing out and revoking app access in your Azure
              Portal. We may terminate or suspend access to the Service at any time without prior notice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Changes to Terms</h2>
            <p>
              We reserve the right to modify these terms at any time. Changes will be posted on this page with
              an updated date. Continued use of the Service after changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Contact</h2>
            <p>
              For questions about these terms, contact us at:{" "}
              <a href="mailto:spppermission@gmail.com" className="text-blue-400 hover:text-blue-300">
                spppermission@gmail.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
