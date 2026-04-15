import { Link } from "react-router-dom";

function MicrosoftIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 21 21" fill="none">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

function ShieldIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

const features = [
  {
    title: "See all sites and libraries",
    desc: "Browse every SharePoint site and document library in one unified view across all your client tenants.",
  },
  {
    title: "Spot broken inheritance",
    desc: "Instantly identify libraries where permissions have been customized and no longer match site-level access.",
  },
  {
    title: "Resolve M365 and SP groups",
    desc: "See the actual users behind Microsoft 365 Groups and SharePoint Groups — not just group names.",
  },
  {
    title: "Find permission gaps",
    desc: "Detect users who have site access but are missing from specific libraries, or vice versa.",
  },
  {
    title: "Manage across tenants",
    desc: "Connect multiple client tenants from one dashboard. Built for MSPs managing dozens of organizations.",
  },
  {
    title: "Add and remove permissions",
    desc: "Grant or revoke library-level access directly from the interface. Break or restore inheritance as needed.",
  },
];

const steps = [
  { num: "1", title: "Sign in with Microsoft", desc: "Use any Microsoft 365 work account. We only request read permissions initially." },
  { num: "2", title: "Connect a tenant", desc: "Enter your client's SharePoint domain. Grant consent to read their site structure." },
  { num: "3", title: "See and fix permissions", desc: "Browse sites, drill into libraries, and see exactly who has access to what." },
];

const securityPoints = [
  "We never store your SharePoint data — everything is fetched live per session",
  "We never store credentials — authentication goes directly through Microsoft OAuth2",
  "Sessions are temporary and server-side — no tokens in your browser",
  "All communication uses Microsoft's official Graph and SharePoint REST APIs over HTTPS",
  "Your data is isolated per session — other users cannot see your tenants",
];

const permissionsExplained = [
  { scope: "User.Read", why: "Identify who you are after sign-in" },
  { scope: "Sites.Read.All", why: "Browse your sites and libraries, read permissions (initial consent)" },
  { scope: "AllSites.FullControl", why: "Add/remove permissions, break/restore inheritance (only requested when you take a write action)" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-900">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              SP
            </div>
            <span className="text-white font-semibold">Permission Manager</span>
          </div>
          <a
            href="/api/auth/login"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors no-underline"
          >
            <MicrosoftIcon />
            Sign In
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight max-w-3xl mx-auto">
          See and fix SharePoint library permissions in one view
        </h1>
        <p className="text-lg text-gray-400 mt-6 max-w-2xl mx-auto leading-relaxed">
          Stop clicking through SharePoint admin panels. See who has access to every document library,
          spot broken inheritance, and fix permission gaps — across all your client tenants.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <a
            href="/api/auth/login"
            className="inline-flex items-center gap-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 px-7 rounded-xl transition-colors no-underline text-base"
          >
            <MicrosoftIcon />
            Sign In with Microsoft
          </a>
        </div>
        <p className="text-xs text-gray-600 mt-4">
          Free during beta. No credit card required.
        </p>
      </section>


      {/* Features */}
      <section className="border-t border-gray-900 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-white text-center mb-12">
            Everything you need to manage SharePoint permissions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-gray-900 py-20">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-white text-center mb-12">
            How it works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((s) => (
              <div key={s.num} className="text-center">
                <div className="w-10 h-10 bg-blue-600/20 rounded-full flex items-center justify-center text-blue-400 font-bold text-lg mx-auto mb-4">
                  {s.num}
                </div>
                <h3 className="text-sm font-semibold text-white mb-2">{s.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security / Trust */}
      <section className="border-t border-gray-900 py-20">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-10">
            <ShieldIcon className="w-10 h-10 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-3">
              Built with security in mind
            </h2>
            <p className="text-sm text-gray-400">
              We take your data seriously. Here's exactly what we do and don't do.
            </p>
          </div>

          <div className="space-y-3 mb-10">
            {securityPoints.map((point) => (
              <div key={point} className="flex items-start gap-3 bg-gray-900/50 border border-gray-800/50 rounded-lg p-4">
                <svg className="w-5 h-5 text-green-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-gray-300">{point}</span>
              </div>
            ))}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-white mb-4">Permissions we request and why</h3>
            <div className="space-y-3">
              {permissionsExplained.map((p) => (
                <div key={p.scope} className="flex items-start gap-3">
                  <code className="text-xs bg-gray-800 text-blue-400 px-2 py-1 rounded shrink-0">{p.scope}</code>
                  <span className="text-sm text-gray-400">{p.why}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-gray-900 py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">
            Ready to see your SharePoint permissions clearly?
          </h2>
          <p className="text-gray-400 mb-8 text-sm">
            Sign in with any Microsoft 365 work account. Free during beta.
          </p>
          <a
            href="/api/auth/login"
            className="inline-flex items-center gap-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 px-7 rounded-xl transition-colors no-underline text-base"
          >
            <MicrosoftIcon />
            Sign In with Microsoft
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-900 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center text-white font-bold text-[10px]">
              SP
            </div>
            <span className="text-sm text-gray-500">Permission Manager</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <Link to="/privacy" className="hover:text-gray-300 transition-colors no-underline text-gray-500">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-gray-300 transition-colors no-underline text-gray-500">Terms of Service</Link>
            <a href="mailto:spppermission@gmail.com" className="hover:text-gray-300 transition-colors no-underline text-gray-500">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
