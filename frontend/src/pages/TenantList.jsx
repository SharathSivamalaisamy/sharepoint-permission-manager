import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function TenantList({ onTenantAdded }) {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [domain, setDomain] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [connecting, setConnecting] = useState(false);

  const load = () => {
    api("/tenants")
      .then((data) => {
        setTenants(data || []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  };

  useEffect(load, []);

  const handleConnect = async () => {
    if (!domain.trim() || !displayName.trim()) return;
    setConnecting(true);
    setError(null);
    try {
      const result = await api("/tenants/connect", {
        method: "POST",
        body: JSON.stringify({
          domain: domain.trim(),
          display_name: displayName.trim(),
        }),
      });
      if (result?.consent_url) {
        window.location.href = result.consent_url;
      }
    } catch (e) {
      setError(e.message);
      setConnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Loading tenants...
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Client Tenants</h1>
          <p className="text-sm text-gray-400 mt-1">
            Manage SharePoint permissions across your client organizations.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Client Tenant
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-300 px-4 py-3 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Add tenant form */}
      {showAdd && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
          <h3 className="text-base font-semibold text-white mb-1">Connect a Client Tenant</h3>
          <p className="text-sm text-gray-400 mb-5">
            Enter the client's SharePoint domain. You'll sign in with credentials that have access to their tenant.
          </p>
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-400">Display Name</label>
              <input
                type="text"
                placeholder="e.g. Acme Corp"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent w-48"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-400">SharePoint Domain</label>
              <input
                type="text"
                placeholder="e.g. acmecorp.sharepoint.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent w-64"
              />
            </div>
            <button
              onClick={handleConnect}
              disabled={connecting || !domain.trim() || !displayName.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
            >
              {connecting ? "Connecting..." : "Connect & Sign In"}
            </button>
          </div>
        </div>
      )}

      {/* Tenant grid */}
      {tenants.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <svg className="w-12 h-12 mx-auto mb-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <p className="text-sm">No tenants connected yet. Click "Add Client Tenant" to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tenants.map((t) => (
            <Link
              key={t.tenant_id}
              to={`/tenant/${t.tenant_id}`}
              className="group bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 hover:bg-gray-900/80 transition-all no-underline"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center text-blue-400 font-bold text-lg shrink-0">
                  {t.display_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors truncate">
                    {t.display_name}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{t.domain}</p>
                  <p className="text-xs text-gray-600 mt-2">
                    Connected {new Date(t.connected_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
