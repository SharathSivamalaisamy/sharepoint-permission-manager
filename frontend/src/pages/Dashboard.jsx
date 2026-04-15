import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { api, encodeSiteId } from "../api";

export default function Dashboard() {
  const { tenantId } = useParams();
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api(`/tenants/${tenantId}/sites`)
      .then((data) => {
        setSites(data || []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.detail || e.message || "Failed to load sites");
        setLoading(false);
      });
  }, [tenantId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Loading sites...
      </div>
    );
  }
  if (error) {
    return (
      <div className="max-w-2xl">
        <div className="bg-red-900/30 border border-red-800 text-red-200 px-4 py-3 rounded-lg text-sm">
          <div className="font-semibold mb-1">Couldn't load sites</div>
          <div className="text-red-300">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-6">
        <Link to="/" className="hover:text-gray-300 transition-colors">Tenants</Link>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-gray-300">Sites</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">SharePoint Sites</h1>
        <span className="bg-blue-600/20 text-blue-400 text-xs font-semibold px-2.5 py-1 rounded-full">
          {sites.length} sites
        </span>
      </div>

      {sites.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm">
          No sites found in this tenant.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sites.map((site) => (
            <Link
              key={site.url}
              to={`/tenant/${tenantId}/site/${encodeSiteId(site.url)}`}
              className="group bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-all no-underline"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-emerald-600/20 rounded-lg flex items-center justify-center shrink-0">
                  <svg className="w-4.5 h-4.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors">
                    {site.title}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 truncate">{site.url}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
