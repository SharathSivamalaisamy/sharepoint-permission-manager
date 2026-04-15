"""SharePoint REST API client — wraps all _api calls needed by the MVP."""

import logging
import requests

log = logging.getLogger("spm")


def _is_system_account(u):
    """Return True for system/service accounts that should be hidden from UI."""
    title = (u.get("Title") or u.get("title") or "").lower()
    login = (u.get("LoginName") or u.get("loginName") or "").lower()
    skip_titles = {"system account", "sharepoint app"}
    if title in skip_titles:
        return True
    if "app@sharepoint" in login:
        return True
    if "nt service\\" in login or "nt authority\\" in login:
        return True
    if "spsearch" in login or "spfarm" in login or "spadmin" in login:
        return True
    if "c:0(.s|true" in login:  # "Everyone" / "Everyone except external"
        return True
    return False


def _odata_escape(value: str) -> str:
    """Escape a string for use in OData single-quoted literals.
    Single quotes are doubled per the OData spec."""
    return value.replace("'", "''")


class SharePointClient:
    def __init__(self, domain, token):
        self.domain = domain
        self.token = token
        self.base = f"https://{domain}"

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json;odata=verbose",
            "Content-Type": "application/json;odata=verbose",
        }

    def _get(self, url):
        try:
            r = requests.get(url, headers=self._headers(), timeout=30)
        except requests.exceptions.RequestException as e:
            log.warning("[sp_client._get] Request failed for %s: %s", url, e)
            raise
        if not r.ok:
            # Log the SharePoint-side error detail so we know *why* it failed.
            snippet = (r.text or "")[:500]
            log.warning(
                "[sp_client._get] %s %s -> %s %s",
                "GET", url, r.status_code, snippet,
            )
        r.raise_for_status()
        return r.json()

    def _post(self, url, data=None):
        try:
            r = requests.post(url, headers=self._headers(), json=data, timeout=30)
        except requests.exceptions.RequestException as e:
            log.warning("[sp_client._post] Request failed for %s: %s", url, e)
            raise
        if not r.ok:
            snippet = (r.text or "")[:500]
            log.warning(
                "[sp_client._post] %s %s -> %s %s",
                "POST", url, r.status_code, snippet,
            )
        r.raise_for_status()
        return r.json() if r.text.strip() else {}

    # ── Sites ────────────────────────────────────────────────────────

    def list_sites(self):
        """List site collections in the tenant.

        Primary strategy: SharePoint search API (fast, covers all site collections).
        Fallback: Root web + immediate subwebs (works on fresh tenants whose
        search index hasn't been populated yet — search/query returns 500
        on those, but /_api/web/webs still works).
        """
        sites = []
        search_failed = False
        try:
            url = (
                f"{self.base}/_api/search/query"
                f"?querytext='contentclass:STS_Site'"
                f"&selectproperties='Title,Path,WebTemplate'"
                f"&rowlimit=50"
            )
            data = self._get(url)
            rows = (
                data.get("d", {}).get("query", {})
                .get("PrimaryQueryResult", {})
                .get("RelevantResults", {})
                .get("Table", {})
                .get("Rows", {})
                .get("results", [])
            )

            # Auto-generated system sites to hide
            system_paths = {"/portals/", "/sites/contenttypehub", "/sites/allcompany"}

            for row in rows:
                cells = {c["Key"]: c["Value"] for c in row["Cells"]["results"]}
                path = cells.get("Path", "")
                path_lower = path.lower()

                # Skip OneDrive personal sites and known system sites
                if "-my.sharepoint.com" in path_lower:
                    continue
                if any(s in path_lower for s in system_paths):
                    continue

                sites.append({
                    "title": cells.get("Title", "Unknown"),
                    "url": path,
                })
        except requests.exceptions.HTTPError as e:
            status = e.response.status_code if e.response is not None else 0
            log.warning(
                "[list_sites] Search API failed (status=%s) — falling back to root web",
                status,
            )
            search_failed = True
        except (KeyError, ValueError, TypeError) as e:
            log.warning(
                "[list_sites] Unexpected search response shape: %s — falling back",
                e,
            )
            search_failed = True

        if sites:
            return sites

        # Fallback: the root site collection always exists and is always
        # reachable with any SharePoint token. Works on fresh tenants.
        if search_failed:
            log.info("[list_sites] Using fallback (root web enumeration)")
        else:
            log.info("[list_sites] Search returned zero results — using fallback")
        return self._list_sites_fallback()

    def _list_sites_fallback(self):
        """Return at least the root site so fresh tenants aren't blank.

        Uses /_api/web (always works) and /_api/web/webs (direct subwebs).
        Does NOT list other site collections — the search API is the only
        way to get those, and if it's not working we can't enumerate them.
        """
        sites = []
        try:
            data = self._get(f"{self.base}/_api/web?$select=Title,Url")
            root = data.get("d", {})
            if root.get("Url"):
                sites.append({
                    "title": root.get("Title") or "Root site",
                    "url": root["Url"],
                })
        except Exception as e:
            log.warning("[list_sites fallback] Root web fetch failed: %s", e)

        try:
            data = self._get(f"{self.base}/_api/web/webs?$select=Title,Url")
            for w in data.get("d", {}).get("results", []):
                url = w.get("Url")
                if url and not any(s["url"] == url for s in sites):
                    sites.append({
                        "title": w.get("Title") or "Subsite",
                        "url": url,
                    })
        except Exception as e:
            log.warning("[list_sites fallback] Subwebs fetch failed: %s", e)

        return sites

    # ── M365 Group ID ─────────────────────────────────────────────────

    def get_m365_group_id(self, site_url):
        """Get the M365 Group ID for a modern Team site.
        Returns None for classic sites or Communication sites (no group).
        """
        api = f"{site_url}/_api/site?$select=GroupId"
        data = self._get(api)
        group_id = data.get("d", {}).get("GroupId")
        # Non-group sites return all zeros
        if group_id and group_id != "00000000-0000-0000-0000-000000000000":
            return group_id
        return None

    # ── Libraries ────────────────────────────────────────────────────

    def list_libraries(self, site_url):
        api = (
            f"{site_url}/_api/web/lists"
            f"?$filter=BaseTemplate eq 101"
            f"&$select=Title,Id,ItemCount,HasUniqueRoleAssignments"
        )
        data = self._get(api)
        return [
            {
                "title": lib["Title"],
                "id": lib["Id"],
                "itemCount": lib["ItemCount"],
                "hasUniquePermissions": lib["HasUniqueRoleAssignments"],
            }
            for lib in data["d"]["results"]
        ]

    # ── Permissions ──────────────────────────────────────────────────

    def get_permissions(self, site_url, lib_title):
        api = (
            f"{site_url}/_api/web/lists/getbytitle('{_odata_escape(lib_title)}')"
            f"/roleassignments?$expand=Member,RoleDefinitionBindings"
        )
        data = self._get(api)
        return [
            {
                "principalId": ra["Member"]["Id"],
                "principalName": ra["Member"]["Title"],
                "principalType": ra["Member"]["PrincipalType"],
                "roles": [
                    {"id": rd["Id"], "name": rd["Name"]}
                    for rd in ra["RoleDefinitionBindings"]["results"]
                ],
            }
            for ra in data["d"]["results"]
        ]

    def get_role_definitions(self, site_url):
        api = f"{site_url}/_api/web/roledefinitions?$select=Id,Name"
        data = self._get(api)
        # Only show roles MSPs actually use
        allow = {"Full Control", "Edit", "Read"}
        return [
            {"id": rd["Id"], "name": rd["Name"]}
            for rd in data["d"]["results"]
            if rd["Name"] in allow
        ]

    def get_site_users(self, site_url):
        api = (
            f"{site_url}/_api/web/siteusers"
            f"?$select=Id,Title,LoginName,Email"
            f"&$filter=PrincipalType eq 1"
        )
        data = self._get(api)
        return [
            {
                "id": u["Id"],
                "title": u["Title"],
                "loginName": u["LoginName"],
                "email": u.get("Email", ""),
            }
            for u in data["d"]["results"]
        ]

    def get_site_group_members(self, site_url):
        """Fetch site members by combining SP group members AND M365 group members.

        Modern Team sites nest an M365 group inside the classic SP "Members" group.
        /_api/web/sitegroups({id})/users only returns direct SP group members,
        missing anyone in the nested M365 group (like Jane Dove).

        Fix: also pull /_api/web/siteusers (which includes M365 group members)
        and assign unmatched users to Owners (IsSiteAdmin) or Members.
        """
        groups_api = f"{site_url}/_api/web/sitegroups?$select=Id,Title"
        groups_data = self._get(groups_api)

        interesting = {"owners", "members", "visitors"}
        sp_groups = {}
        sp_user_ids = set()

        for g in groups_data["d"]["results"]:
            title_lower = g["Title"].lower()
            if any(kw in title_lower for kw in interesting):
                users_api = (
                    f"{site_url}/_api/web/sitegroups({g['Id']})/users"
                    f"?$select=Id,Title,LoginName,Email,PrincipalType"
                )
                users_data = self._get(users_api)
                users = []
                for u in users_data["d"]["results"]:
                    if u.get("PrincipalType") == 1 and not _is_system_account(u):
                        users.append({
                            "id": u["Id"],
                            "title": u["Title"],
                            "loginName": u["LoginName"],
                            "email": u.get("Email", ""),
                        })
                        sp_user_ids.add(u["Id"])
                sp_groups[g["Title"]] = {
                    "groupName": g["Title"],
                    "groupId": g["Id"],
                    "users": users,
                }

        # Now fetch ALL site users to catch M365 group members and ensure
        # site admins always appear in the Owners group
        all_users_api = (
            f"{site_url}/_api/web/siteusers"
            f"?$select=Id,Title,LoginName,Email,PrincipalType,IsSiteAdmin"
        )
        all_users_data = self._get(all_users_api)

        for u in all_users_data["d"]["results"]:
            if u.get("PrincipalType") != 1:
                continue
            if _is_system_account(u):
                continue

            user_entry = {
                "id": u["Id"],
                "title": u["Title"],
                "loginName": u["LoginName"],
                "email": u.get("Email", ""),
            }

            # Site admins ALWAYS go into Owners, even if already in another group
            if u.get("IsSiteAdmin"):
                owners_group = next(
                    (g for name, g in sp_groups.items() if "owner" in name.lower()),
                    None,
                )
                if owners_group and u["Id"] not in {usr["id"] for usr in owners_group["users"]}:
                    owners_group["users"].append(user_entry)

            # Non-admin users not yet in any group go into Members
            if u["Id"] not in sp_user_ids:
                if not u.get("IsSiteAdmin"):
                    target = next(
                        (g for name, g in sp_groups.items() if "member" in name.lower()),
                        None,
                    )
                    if target:
                        target["users"].append(user_entry)
                sp_user_ids.add(u["Id"])

        # Return ALL groups including empty ones — Graph enrichment in main.py
        # will populate them with M365 group members, then filter empty ones.
        return list(sp_groups.values())

    def ensure_user(self, site_url, email):
        """Resolve an email to a site user, adding them if needed.
        Works for any user in the tenant directory, not just existing site users."""
        api = f"{site_url}/_api/web/ensureuser"
        r = requests.post(
            api,
            headers=self._headers(),
            json={"logonName": email},
        )
        r.raise_for_status()
        u = r.json()["d"]
        return {
            "id": u["Id"],
            "title": u["Title"],
            "loginName": u["LoginName"],
            "email": u.get("Email", ""),
        }

    def add_permission(self, site_url, lib_title, principal_id, role_def_id):
        api = (
            f"{site_url}/_api/web/lists/getbytitle('{_odata_escape(lib_title)}')"
            f"/roleassignments/addroleassignment"
            f"(principalid={principal_id}, roledefid={role_def_id})"
        )
        return self._post(api)

    def remove_permission(self, site_url, lib_title, principal_id, role_def_id):
        api = (
            f"{site_url}/_api/web/lists/getbytitle('{_odata_escape(lib_title)}')"
            f"/roleassignments/removeroleassignment"
            f"(principalid={principal_id}, roledefid={role_def_id})"
        )
        return self._post(api)

    # ── Inheritance ──────────────────────────────────────────────────

    def break_inheritance(self, site_url, lib_title):
        api = (
            f"{site_url}/_api/web/lists/getbytitle('{_odata_escape(lib_title)}')"
            f"/breakroleinheritance(copyRoleAssignments=true, clearSubscopes=false)"
        )
        return self._post(api)

    def restore_inheritance(self, site_url, lib_title):
        api = (
            f"{site_url}/_api/web/lists/getbytitle('{_odata_escape(lib_title)}')"
            f"/resetroleinheritance"
        )
        return self._post(api)

    # ── Combined detail endpoint ─────────────────────────────────────

    def get_site_title(self, site_url):
        """Get the display title of a SharePoint site."""
        data = self._get(f"{site_url}/_api/web?$select=Title")
        return data["d"]["Title"]

    def get_library_detail(self, site_url, lib_title):
        """All data needed for the library detail screen in one call."""
        lib_api = (
            f"{site_url}/_api/web/lists/getbytitle('{_odata_escape(lib_title)}')"
            f"?$select=Title,Id,HasUniqueRoleAssignments"
        )
        lib_data = self._get(lib_api)["d"]

        permissions = self.get_permissions(site_url, lib_title)
        has_unique = lib_data["HasUniqueRoleAssignments"]

        result = {
            "title": lib_data["Title"],
            "siteTitle": self.get_site_title(site_url),
            "hasUniquePermissions": has_unique,
            "permissions": permissions,
            "roleDefinitions": self.get_role_definitions(site_url),
            "siteUsers": self.get_site_users(site_url),
        }

        # When inheritance is broken, include site group members
        # so the UI can show who's missing from library-level permissions
        if has_unique:
            result["siteGroups"] = self.get_site_group_members(site_url)

        return result
