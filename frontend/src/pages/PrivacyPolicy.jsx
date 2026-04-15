import { Link } from "react-router-dom";

export default function PrivacyPolicy() {
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
        <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: April 2026</p>

        <div className="space-y-8 text-sm text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">What This App Does</h2>
            <p>
              SharePoint Permission Manager is a web application that helps IT administrators and Managed Service Providers (MSPs)
              view and manage document library permissions across Microsoft 365 SharePoint tenants. The app connects to your
              SharePoint environment via Microsoft's official OAuth2 authentication and REST APIs.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">What Data We Access</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Your Microsoft 365 user profile (name and email) for session identification</li>
              <li>SharePoint site collection list and metadata (site names, URLs)</li>
              <li>Document library names and settings</li>
              <li>Permission assignments: which users and groups have access to which libraries, and at what permission level</li>
              <li>Microsoft 365 Group membership to resolve group members</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">What Data We Do NOT Access</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>File contents — we never read, download, or index any documents or files</li>
              <li>Email, calendar, or any other Microsoft 365 services beyond SharePoint</li>
              <li>Personal files or OneDrive content</li>
              <li>Passwords or authentication credentials (handled entirely by Microsoft)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">What Data We Store</h2>
            <p>
              We store <strong className="text-white">nothing persistent</strong>. All data exists only in your active server-side session:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>OAuth access tokens are held in server memory for the duration of your session only</li>
              <li>Session data (your name, email, connected tenants) is deleted when you sign out or when the session expires (24 hours)</li>
              <li>No data is written to any database, file system, or persistent storage</li>
              <li>No analytics, tracking cookies, or telemetry data is collected</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Data Isolation</h2>
            <p>
              Each user session is completely isolated. Your session data (tokens, tenant connections, permission data)
              is stored in a separate server-side session keyed by a random UUID. Other users cannot access your session
              data under any circumstances.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Third-Party Sharing</h2>
            <p>
              We do not share, sell, or transmit your data to any third party. The only external services we communicate
              with are Microsoft's authentication servers (login.microsoftonline.com) and SharePoint/Graph APIs — both
              required to provide the app's functionality.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Microsoft Permissions Requested</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><code className="bg-gray-800 px-1.5 py-0.5 rounded text-blue-400">User.Read</code> — Read your basic profile (name, email) to identify your session</li>
              <li><code className="bg-gray-800 px-1.5 py-0.5 rounded text-blue-400">Sites.Read.All</code> — Read SharePoint site and library structure and permissions (initial consent)</li>
              <li><code className="bg-gray-800 px-1.5 py-0.5 rounded text-blue-400">AllSites.FullControl</code> — Modify permissions when you explicitly request a write action (requested only when needed)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Revoking Access</h2>
            <p>
              You can revoke this app's access to your Microsoft 365 tenant at any time by:
            </p>
            <ol className="list-decimal pl-5 space-y-2 mt-2">
              <li>Going to the Azure Portal → Enterprise Applications</li>
              <li>Finding "SharePoint Permission Manager" in the list</li>
              <li>Clicking "Delete" to remove the app's consent</li>
            </ol>
            <p className="mt-2">
              Since we store nothing persistently, revoking access immediately and completely removes our ability
              to access your data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Contact</h2>
            <p>
              For questions about this privacy policy or how your data is handled, contact us at:{" "}
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
