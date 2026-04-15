import { useState, useEffect } from "react";
import { Routes, Route, Link, useNavigate, useParams, useLocation } from "react-router-dom";
import TenantList from "./pages/TenantList";
import Dashboard from "./pages/Dashboard";
import SiteOverview from "./pages/SiteOverview";
import LibraryDetail from "./pages/LibraryDetail";
import LandingPage from "./pages/LandingPage";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import { api } from "./api";

function Sidebar({ user, tenants, onLogout }) {
  const location = useLocation();
  const pathParts = location.pathname.split("/");
  const activeTenantId = pathParts[1] === "tenant" ? pathParts[2] : null;

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-800">
        <Link to="/" className="flex items-center gap-2.5 no-underline">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            SP
          </div>
          <div>
            <div className="text-sm font-semibold text-white leading-tight">Permission</div>
            <div className="text-xs text-gray-400 leading-tight">Manager</div>
          </div>
        </Link>
      </div>

      {/* Tenants nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 px-2 mb-2">
          Client Tenants
        </div>
        {tenants.map((t) => (
          <Link
            key={t.tenant_id}
            to={`/tenant/${t.tenant_id}`}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm no-underline mb-0.5 transition-colors ${
              activeTenantId === t.tenant_id
                ? "bg-gray-700/50 text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            <div className="w-7 h-7 bg-gray-800 rounded-md flex items-center justify-center text-xs font-semibold text-gray-300 shrink-0">
              {t.display_name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate font-medium text-[13px]">{t.display_name}</div>
              <div className="truncate text-[11px] text-gray-500">{t.domain}</div>
            </div>
          </Link>
        ))}

        <Link
          to="/"
          className="flex items-center gap-2 px-3 py-2 mt-2 rounded-lg text-sm text-gray-500 hover:text-gray-300 hover:bg-gray-800 no-underline transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add tenant
        </Link>
      </nav>

      {/* User footer */}
      <div className="border-t border-gray-800 px-4 py-3">
        <div className="min-w-0 mb-2">
          <div className="text-sm font-medium text-gray-200 truncate">{user.name}</div>
          <div className="text-xs text-gray-500 truncate">{user.email}</div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setUser(data);
        if (data) {
          api("/tenants").then((t) => setTenants(t || []));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const refreshTenants = () => {
    api("/tenants").then((t) => setTenants(t || []));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
    );
  }

  return (
    <div className="min-h-screen">
      <Sidebar
        user={user}
        tenants={tenants}
        onLogout={() => {
          fetch("/api/auth/logout", { method: "POST", credentials: "include" }).then(() => {
            setUser(null);
            setTenants([]);
            navigate("/");
          });
        }}
      />
      <main className="ml-64 p-8">
        <Routes>
          <Route path="/" element={<TenantList onTenantAdded={refreshTenants} />} />
          <Route path="/tenant/:tenantId" element={<Dashboard />} />
          <Route path="/tenant/:tenantId/site/:siteId" element={<SiteOverview />} />
          <Route path="/tenant/:tenantId/site/:siteId/library/:libTitle" element={<LibraryDetail />} />
        </Routes>
      </main>
    </div>
  );
}
