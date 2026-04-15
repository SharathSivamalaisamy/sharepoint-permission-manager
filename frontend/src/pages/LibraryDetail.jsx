import { useState, useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { api, decodeSiteId } from "../api";

const ROLE_COLORS = {
  "Full Control": "bg-red-600/20 text-red-400",
  "Design": "bg-orange-600/20 text-orange-400",
  "Edit": "bg-blue-600/20 text-blue-400",
  "Contribute": "bg-cyan-600/20 text-cyan-400",
  "Read": "bg-emerald-600/20 text-emerald-400",
};

function RoleBadge({ name }) {
  const color = ROLE_COLORS[name] || "bg-gray-700 text-gray-300";
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${color}`}>
      {name}
    </span>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="px-5 py-3 border-b border-gray-800 bg-gray-900/50">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</h3>
      {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

export default function LibraryDetail() {
  const { tenantId, siteId, libTitle } = useParams();
  const siteUrl = decodeSiteId(siteId);
  const title = decodeURIComponent(libTitle);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [selectedUser, setSelectedUser] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [emailLookup, setEmailLookup] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);

  const t = (path) => `/tenants/${tenantId}${path}`;

  const load = () => {
    setLoading(true);
    setActionError(null);
    api(t(`/library-detail/${siteId}/${encodeURIComponent(title)}`))
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  };

  useEffect(load, [tenantId, siteId, title]);

  // Cross-reference: which site members are missing from library permissions?
  const siteGroupAnalysis = useMemo(() => {
    if (!data?.siteGroups || !data?.permissions) return null;

    // Build maps for library-level access
    const libPrincipalIds = new Set();
    const libGroupIds = new Set();
    // Map: principalId → role names (for direct user permissions)
    const libPrincipalRoles = {};
    for (const p of data.permissions) {
      libPrincipalIds.add(p.principalId);
      libPrincipalRoles[p.principalId] = p.roles.map((r) => r.name);
      if (p.principalType === 8) libGroupIds.add(p.principalId);
    }

    // Build map: groupId → library roles for ALL groups
    const groupLibRoles = {};
    for (const group of data.siteGroups) {
      if (libGroupIds.has(group.groupId)) {
        groupLibRoles[group.groupId] = group.libraryRoles || [];
      }
    }

    // Build map: userId → list of groupIds they belong to (across ALL groups)
    const userGroupMembership = {};
    for (const group of data.siteGroups) {
      for (const user of group.users) {
        if (!userGroupMembership[user.id]) userGroupMembership[user.id] = [];
        userGroupMembership[user.id].push(group.groupId);
      }
    }

    let missingCount = 0;
    const seenUserIds = new Set();

    const groups = data.siteGroups.map((group) => {
      const members = group.users.map((user) => {
        const directRoles = libPrincipalRoles[user.id] || [];

        // Check if user has access through ANY of their groups, not just this one
        const allUserGroups = userGroupMembership[user.id] || [];
        const hasAccessViaAnyGroup = allUserGroups.some((gid) => libGroupIds.has(gid));
        const hasAccess = libPrincipalIds.has(user.id) || hasAccessViaAnyGroup;

        // Only count as missing once per user (they may appear in multiple groups)
        if (!hasAccess && !seenUserIds.has(user.id)) {
          missingCount++;
          seenUserIds.add(user.id);
        }

        // Effective roles: combine direct roles + roles from ALL groups the user is in
        const allGroupRoles = allUserGroups
          .filter((gid) => libGroupIds.has(gid))
          .flatMap((gid) => groupLibRoles[gid] || []);
        const effectiveRoles = [...new Set([...directRoles, ...allGroupRoles])];

        return { ...user, hasAccess, groupName: group.groupName, effectiveRoles };
      });
      return { ...group, users: members };
    });

    return { groups, missingCount };
  }, [data]);

  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  const doAction = async (fn) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      load();
    } catch (e) {
      if (e.status === 403 && e.detail?.includes("Write access required")) {
        setShowUpgrade(true);
      } else {
        setActionError(e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      const result = await api(t("/upgrade"), { method: "POST" });
      if (result?.consent_url) {
        window.location.href = result.consent_url;
      } else if (result?.already_upgraded) {
        setShowUpgrade(false);
        load();
      }
    } catch (e) {
      setActionError(e.message);
    } finally {
      setUpgrading(false);
    }
  };

  const handleLookupUser = async () => {
    if (!emailLookup.trim()) return;
    setLookupBusy(true);
    setActionError(null);
    try {
      const user = await api(t(`/ensure-user/${siteId}`), {
        method: "POST",
        body: JSON.stringify({ email: emailLookup.trim() }),
      });
      if (user) {
        setData((prev) => ({
          ...prev,
          siteUsers: prev.siteUsers.some((u) => u.id === user.id)
            ? prev.siteUsers
            : [...prev.siteUsers, user],
        }));
        setSelectedUser(String(user.id));
        setEmailLookup("");
      }
    } catch (e) {
      setActionError(`User not found: ${emailLookup}`);
    } finally {
      setLookupBusy(false);
    }
  };

  const handleAddPermission = (principalId, roleDefId) => {
    const pid = principalId || parseInt(selectedUser);
    const rid = roleDefId || parseInt(selectedRole);
    if (!pid || !rid) return;
    doAction(() =>
      api(t(`/permissions/${siteId}/${encodeURIComponent(title)}`), {
        method: "POST",
        body: JSON.stringify({ principalId: pid, roleDefId: rid }),
      })
    );
  };

  const handleRemovePermission = (principalId, roleDefId) => {
    doAction(() =>
      api(
        t(`/permissions/${siteId}/${encodeURIComponent(title)}/${principalId}/${roleDefId}`),
        { method: "DELETE" }
      )
    );
  };

  const handleBreakInheritance = () => {
    doAction(() =>
      api(t(`/break-inheritance/${siteId}/${encodeURIComponent(title)}`), { method: "POST" })
    );
  };

  const handleRestoreInheritance = () => {
    doAction(() =>
      api(t(`/restore-inheritance/${siteId}/${encodeURIComponent(title)}`), { method: "POST" })
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Loading permissions...
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
  if (!data) return null;

  return (
    <div className="max-w-5xl">
      {/* Upgrade prompt */}
      {showUpgrade && (
        <div className="bg-amber-900/20 border border-amber-800 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-amber-300 mb-1">Write access required</h3>
          <p className="text-sm text-gray-400 mb-4">
            To make changes to permissions, we need additional access. You'll be redirected to Microsoft to grant write permissions.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={handleUpgrade}
              disabled={upgrading}
              className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {upgrading ? "Redirecting..." : "Grant Write Access"}
            </button>
            <button
              onClick={() => setShowUpgrade(false)}
              className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-6 flex-wrap">
        <Link to="/" className="hover:text-gray-300 transition-colors">Tenants</Link>
        <ChevronIcon />
        <Link to={`/tenant/${tenantId}`} className="hover:text-gray-300 transition-colors">Sites</Link>
        <ChevronIcon />
        <Link to={`/tenant/${tenantId}/site/${siteId}`} className="hover:text-gray-300 transition-colors truncate max-w-[200px]">
          {data.siteTitle || siteUrl}
        </Link>
        <ChevronIcon />
        <span className="text-gray-300">{title}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        <div className="flex items-center gap-3">
          {data.hasUniquePermissions ? (
            <>
              <span className="bg-amber-600/20 text-amber-400 text-xs font-semibold px-2.5 py-1 rounded-full">
                Custom permissions
              </span>
              <button
                onClick={handleRestoreInheritance}
                disabled={busy}
                className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
              >
                Restore inheritance
              </button>
            </>
          ) : (
            <>
              <span className="bg-emerald-600/20 text-emerald-400 text-xs font-semibold px-2.5 py-1 rounded-full">
                Inheriting permissions
              </span>
              <button
                onClick={handleBreakInheritance}
                disabled={busy}
                className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
              >
                Break inheritance
              </button>
            </>
          )}
        </div>
      </div>

      {actionError && (
        <div className="bg-red-900/30 border border-red-800 text-red-300 px-4 py-3 rounded-lg mb-6 text-sm">
          {actionError}
        </div>
      )}

      {/* ── SECTION 1: Library-level permissions ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-6">
        <SectionHeader
          title="Library-Level Permissions"
          subtitle={
            data.hasUniquePermissions
              ? "These users/groups have direct access to this library"
              : "Permissions are inherited from the parent site"
          }
        />
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800/50">
              <th className="text-left px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                User / Group
              </th>
              <th className="text-left px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Type
              </th>
              <th className="text-left px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Permissions
              </th>
              {data.hasUniquePermissions && (
                <th className="text-right px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.permissions.map((p) => (
              <tr key={p.principalId} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 bg-gray-800 rounded-full flex items-center justify-center text-xs font-medium text-gray-400 shrink-0">
                      {p.principalType === 8 ? (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      ) : (
                        p.principalName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <span className="text-sm text-gray-200 font-medium">{p.principalName}</span>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
                    {p.principalType === 1 ? "User" : p.principalType === 8 ? "Group" : `Type ${p.principalType}`}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {p.roles.map((r) => (
                      <RoleBadge key={r.id} name={r.name} />
                    ))}
                  </div>
                </td>
                {data.hasUniquePermissions && (
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      {p.roles.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => handleRemovePermission(p.principalId, r.id)}
                          disabled={busy}
                          className="text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 px-2 py-1 rounded transition-colors disabled:opacity-40"
                          title={`Remove ${r.name}`}
                        >
                          Remove
                        </button>
                      ))}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Add permission form */}
        {data.hasUniquePermissions && (
          <div className="border-t border-gray-800 p-5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">
              Add Permission
            </h4>
            <div className="flex gap-2 mb-3">
              <input
                type="email"
                placeholder="Look up user by email..."
                value={emailLookup}
                onChange={(e) => setEmailLookup(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLookupUser()}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
              <button
                onClick={handleLookupUser}
                disabled={lookupBusy || !emailLookup.trim()}
                className="text-sm text-gray-300 hover:text-white border border-gray-700 hover:border-gray-600 px-3 py-2 rounded-lg transition-colors disabled:opacity-40"
              >
                {lookupBusy ? "Looking up..." : "Find user"}
              </button>
            </div>
            <div className="flex gap-2">
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">Select user...</option>
                {data.siteUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.title} ({u.email || u.loginName})
                  </option>
                ))}
              </select>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-600 w-40"
              >
                <option value="">Role...</option>
                {data.roleDefinitions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleAddPermission()}
                disabled={busy || !selectedUser || !selectedRole}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm"
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── SECTION 2: Site-level members (only when inheritance is broken) ── */}
      {data.hasUniquePermissions && siteGroupAnalysis && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <SectionHeader
            title="Site-Level Members"
            subtitle="These users belong to site groups but may not have library access when inheritance is broken"
          />

          {/* Gap warning banner */}
          {siteGroupAnalysis.missingCount > 0 && (
            <div className="mx-5 mt-4 mb-2 flex items-center gap-2 bg-amber-600/10 border border-amber-700/50 text-amber-400 px-4 py-2.5 rounded-lg text-sm">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span>
                <strong>{siteGroupAnalysis.missingCount} site member{siteGroupAnalysis.missingCount > 1 ? "s" : ""}</strong>
                {" "}ha{siteGroupAnalysis.missingCount > 1 ? "ve" : "s"} no access to this library
              </span>
            </div>
          )}

          {siteGroupAnalysis.groups.map((group) => (
            <div key={group.groupId} className="px-5 py-3">
              <div className="text-xs font-semibold text-gray-500 mb-2">{group.groupName}</div>
              <div className="space-y-1">
                {group.users.map((user) => (
                  <MemberRow
                    key={user.id}
                    user={user}
                    groupName={group.groupName}
                    roleDefinitions={data.roleDefinitions}
                    busy={busy}
                    onAddPermission={handleAddPermission}
                  />
                ))}
              </div>
            </div>
          ))}

          {siteGroupAnalysis.groups.length === 0 && (
            <div className="px-5 py-8 text-center text-gray-500 text-sm">
              No standard site groups found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MemberRow({ user, groupName, roleDefinitions, busy, onAddPermission }) {
  const [addRole, setAddRole] = useState("");

  return (
    <div className={`flex items-center justify-between py-2 px-3 rounded-lg ${
      user.hasAccess ? "bg-gray-800/20" : "bg-amber-900/10 border border-amber-800/30"
    }`}>
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 bg-gray-800 rounded-full flex items-center justify-center text-xs font-medium text-gray-400 shrink-0">
          {user.title.charAt(0).toUpperCase()}
        </div>
        <div>
          <span className="text-sm text-gray-200">{user.title}</span>
          {user.email && (
            <span className="text-xs text-gray-500 ml-2">{user.email}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-gray-500">{groupName}</span>
        {user.hasAccess ? (
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {(user.effectiveRoles || []).map((role) => (
                <RoleBadge key={role} name={role} />
              ))}
            </div>
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-amber-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              Missing
            </span>
            <select
              value={addRole}
              onChange={(e) => setAddRole(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-600 w-28"
            >
              <option value="">Role...</option>
              {roleDefinitions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                if (addRole) onAddPermission(user.id, parseInt(addRole));
              }}
              disabled={busy || !addRole}
              className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-2.5 py-1 rounded transition-colors"
            >
              + Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
