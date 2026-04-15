import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { api, decodeSiteId } from "../api";

export default function SiteOverview() {
  const { tenantId, siteId } = useParams();
  const siteUrl = decodeSiteId(siteId);

  const [libraries, setLibraries] = useState([]);
  const [siteName, setSiteName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    api(`/tenants/${tenantId}/libraries/${siteId}`)
      .then((data) => {
        setLibraries(data?.libraries || data || []);
        setSiteName(data?.siteTitle || "");
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [tenantId, siteId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Loading libraries...
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm">
        {error}
      </div>
    );
  }

  const uniqueCount = libraries.filter((l) => l.hasUniquePermissions).length;

  return (
    <div className="max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-6">
        <Link to="/" className="hover:text-gray-300 transition-colors">Tenants</Link>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <Link to={`/tenant/${tenantId}`} className="hover:text-gray-300 transition-colors">Sites</Link>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-gray-300 truncate max-w-xs">{siteName}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">Document Libraries</h1>
        <div className="flex items-center gap-2">
          <span className="bg-blue-600/20 text-blue-400 text-xs font-semibold px-2.5 py-1 rounded-full">
            {libraries.length} libraries
          </span>
          {uniqueCount > 0 && (
            <span className="bg-amber-600/20 text-amber-400 text-xs font-semibold px-2.5 py-1 rounded-full">
              {uniqueCount} custom
            </span>
          )}
        </div>
      </div>

      {libraries.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm">
          No document libraries found.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {libraries.map((lib) => (
            <Link
              key={lib.id}
              to={`/tenant/${tenantId}/site/${siteId}/library/${encodeURIComponent(lib.title)}`}
              className="group bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-all no-underline"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-violet-600/20 rounded-lg flex items-center justify-center shrink-0">
                    <svg className="w-4.5 h-4.5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors">
                      {lib.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">{lib.itemCount} items</p>
                  </div>
                </div>
                {lib.hasUniquePermissions ? (
                  <span className="bg-amber-600/20 text-amber-400 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                    Custom
                  </span>
                ) : (
                  <span className="bg-emerald-600/20 text-emerald-400 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                    Inherited
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
