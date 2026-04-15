"""
SharePoint REST API Proof-of-Concept
=====================================
Tests whether delegated auth can perform all operations needed for the MVP:
  1. List document libraries in a site
  2. Read permissions (role assignments) on a library
  3. Break role inheritance on a library
  4. Add a user permission to a library
  5. Remove a user permission from a library
  6. Restore role inheritance on a library

Uses SharePoint REST API (_api/web/lists/...) — NOT Microsoft Graph.
Auth: device code flow via MSAL — user signs in interactively.
"""

import os
import sys
import json

# Fix Windows console encoding
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import requests
from dotenv import load_dotenv
from msal import PublicClientApplication

# ── Load credentials ──────────────────────────────────────────────────
ENV_PATH = r"C:\Users\shara\OneDrive\Documents\claude\REDDIT\sharepoint.env"
load_dotenv(ENV_PATH)

TENANT_ID = os.getenv("TENANT_ID")
CLIENT_ID = os.getenv("CLIENT_ID")
SP_DOMAIN = os.getenv("SHAREPOINT_DOMAIN")       # sharathconsulting.sharepoint.com
SP_SITE = os.getenv("SHAREPOINT_SITE")            # TestCompany

SITE_URL = f"https://{SP_DOMAIN}/sites/{SP_SITE}"
API_BASE = f"{SITE_URL}/_api"

# ── Acquire delegated access token via device code flow ──────────────
def get_access_token():
    """Get an access token using device code flow (user signs in)."""
    authority = f"https://login.microsoftonline.com/{TENANT_ID}"
    scopes = [f"https://{SP_DOMAIN}/AllSites.FullControl"]

    app = PublicClientApplication(CLIENT_ID, authority=authority)

    # Try to get a cached token first
    accounts = app.get_accounts()
    if accounts:
        result = app.acquire_token_silent(scopes, account=accounts[0])
        if result and "access_token" in result:
            print("[OK] Access token acquired (cached)")
            return result["access_token"]

    # No cached token — start device code flow
    flow = app.initiate_device_flow(scopes=scopes)
    if "user_code" not in flow:
        print(f"[FAIL] Could not start device flow: {flow}")
        sys.exit(1)

    print(f"\n{'=' * 50}")
    print(f"  Sign in required!")
    print(f"  Go to: {flow['verification_uri']}")
    print(f"  Enter code: {flow['user_code']}")
    print(f"{'=' * 50}\n")

    result = app.acquire_token_by_device_flow(flow)

    if "access_token" in result:
        print("[OK] Access token acquired")
        return result["access_token"]
    else:
        print(f"[FAIL] Could not get token: {result.get('error_description', result)}")
        sys.exit(1)


def sp_headers(token):
    """Standard headers for SharePoint REST API calls."""
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json;odata=verbose",
        "Content-Type": "application/json;odata=verbose",
    }


def sp_get(url, token):
    """GET request with error handling."""
    r = requests.get(url, headers=sp_headers(token))
    if r.ok:
        return r.json()
    else:
        print(f"  [FAIL] {r.status_code}: {r.text[:500]}")
        return None


def sp_post(url, token, data=None):
    """POST request with error handling."""
    r = requests.post(url, headers=sp_headers(token), json=data)
    if r.ok:
        # Some POST responses are empty (204)
        return r.json() if r.text.strip() else {}
    else:
        print(f"  [FAIL] {r.status_code}: {r.text[:500]}")
        return None


# ── Test 1: List document libraries ──────────────────────────────────
def test_list_libraries(token):
    print("\n═══ TEST 1: List document libraries ═══")
    url = f"{API_BASE}/web/lists?$filter=BaseTemplate eq 101&$select=Title,Id,ItemCount,HasUniqueRoleAssignments"
    data = sp_get(url, token)
    if data:
        libs = data["d"]["results"]
        print(f"  [OK] Found {len(libs)} document libraries:")
        for lib in libs:
            print(f"    - {lib['Title']} (items: {lib['ItemCount']}, unique perms: {lib['HasUniqueRoleAssignments']})")
        return libs
    return []


# ── Test 2: Read permissions on a library ─────────────────────────────
def test_read_permissions(token, lib_title):
    print(f"\n═══ TEST 2: Read permissions on '{lib_title}' ═══")
    url = (
        f"{API_BASE}/web/lists/getbytitle('{lib_title}')/roleassignments"
        f"?$expand=Member,RoleDefinitionBindings"
    )
    data = sp_get(url, token)
    if data:
        assignments = data["d"]["results"]
        print(f"  [OK] Found {len(assignments)} role assignments:")
        for ra in assignments:
            member = ra["Member"]
            roles = [rd["Name"] for rd in ra["RoleDefinitionBindings"]["results"]]
            print(f"    - {member['Title']} ({member['PrincipalType']}): {', '.join(roles)}")
        return assignments
    return []


# ── Test 3: Break role inheritance ────────────────────────────────────
def test_break_inheritance(token, lib_title):
    print(f"\n═══ TEST 3: Break role inheritance on '{lib_title}' ═══")
    # copyRoleAssignments=true keeps existing perms, clearSubscopes=false
    url = f"{API_BASE}/web/lists/getbytitle('{lib_title}')/breakroleinheritance(copyRoleAssignments=true, clearSubscopes=false)"
    result = sp_post(url, token)
    if result is not None:
        print("  [OK] Inheritance broken (existing permissions copied)")
        return True
    return False


# ── Test 4: Add a user permission ─────────────────────────────────────
def test_add_permission(token, lib_title):
    print(f"\n═══ TEST 4: Add user permission on '{lib_title}' ═══")

    # First, get a role definition ID (e.g., "Contribute" or "Read")
    print("  Fetching role definitions...")
    url = f"{API_BASE}/web/roledefinitions?$select=Id,Name"
    data = sp_get(url, token)
    if not data:
        return False

    role_defs = {rd["Name"]: rd["Id"] for rd in data["d"]["results"]}
    print(f"  Available roles: {', '.join(role_defs.keys())}")

    # Use "Read" role for safety
    read_role_id = role_defs.get("Read")
    if not read_role_id:
        print("  [FAIL] No 'Read' role definition found")
        return False

    # Get site users to find someone to add
    print("  Fetching site users...")
    url = f"{API_BASE}/web/siteusers?$select=Id,Title,LoginName&$filter=PrincipalType eq 1"
    data = sp_get(url, token)
    if not data:
        return False

    users = data["d"]["results"]
    print(f"  Found {len(users)} users:")
    for u in users:
        print(f"    - ID {u['Id']}: {u['Title']} ({u['LoginName']})")

    if not users:
        print("  [SKIP] No users available to test with")
        return False

    # Pick the last user (least likely to be a system account)
    test_user = users[-1]
    user_id = test_user["Id"]
    print(f"  Adding Read permission for '{test_user['Title']}' (ID: {user_id})...")

    url = (
        f"{API_BASE}/web/lists/getbytitle('{lib_title}')/roleassignments"
        f"/addroleassignment(principalid={user_id}, roledefid={read_role_id})"
    )
    result = sp_post(url, token)
    if result is not None:
        print(f"  [OK] Read permission added for user ID {user_id}")
        return user_id, read_role_id
    return False


# ── Test 5: Remove a user permission ──────────────────────────────────
def test_remove_permission(token, lib_title, user_id, role_id):
    print(f"\n═══ TEST 5: Remove user permission on '{lib_title}' ═══")
    url = (
        f"{API_BASE}/web/lists/getbytitle('{lib_title}')/roleassignments"
        f"/removeroleassignment(principalid={user_id}, roledefid={role_id})"
    )
    result = sp_post(url, token)
    if result is not None:
        print(f"  [OK] Permission removed for user ID {user_id}")
        return True
    return False


# ── Test 6: Restore role inheritance ──────────────────────────────────
def test_restore_inheritance(token, lib_title):
    print(f"\n═══ TEST 6: Restore role inheritance on '{lib_title}' ═══")
    url = f"{API_BASE}/web/lists/getbytitle('{lib_title}')/resetroleinheritance"
    result = sp_post(url, token)
    if result is not None:
        print("  [OK] Inheritance restored")
        return True
    return False


# ── Discover sites ───────────────────────────────────────────────────
def discover_sites(token):
    """Find all SharePoint sites in the tenant."""
    print("\n═══ DISCOVERY: Finding all SharePoint sites ═══")

    # Try the configured site first
    headers = sp_headers(token)
    r = requests.get(f"{API_BASE}/web?$select=Title,Url", headers=headers)
    if r.ok:
        d = r.json()["d"]
        print(f"  [OK] Configured site found: {d['Title']} ({d['Url']})")
        return None  # No change needed

    print(f"  Configured site '{SP_SITE}' returned {r.status_code} — searching for sites...")

    # Try root site
    root_url = f"https://{SP_DOMAIN}/_api/web?$select=Title,Url"
    r = requests.get(root_url, headers=headers)
    if r.ok:
        d = r.json()["d"]
        print(f"  Root site: {d['Title']} ({d['Url']})")

    # Use search to find all site collections
    search_url = (
        f"https://{SP_DOMAIN}/_api/search/query"
        f"?querytext='contentclass:STS_Site'"
        f"&selectproperties='Title,Path'"
        f"&rowlimit=50"
    )
    r = requests.get(search_url, headers=headers)
    if r.ok:
        try:
            rows = r.json()["d"]["query"]["PrimaryQueryResult"]["RelevantResults"]["Table"]["Rows"]["results"]
            print(f"  Found {len(rows)} site(s):")
            sites = []
            for row in rows:
                cells = {c["Key"]: c["Value"] for c in row["Cells"]["results"]}
                title = cells.get("Title", "?")
                path = cells.get("Path", "?")
                print(f"    - {title}: {path}")
                sites.append(path)
            return sites
        except Exception as e:
            print(f"  Search parse error: {e}")

    # Fallback: try common URL patterns
    print("  Trying URL variations...")
    variations = [
        f"https://{SP_DOMAIN}/sites/TestCompany",
        f"https://{SP_DOMAIN}/sites/testcompany",
        f"https://{SP_DOMAIN}/sites/Test%20Company",
        f"https://{SP_DOMAIN}/sites/Test-Company",
    ]
    for url in variations:
        r = requests.get(f"{url}/_api/web?$select=Title,Url", headers=headers)
        if r.ok:
            d = r.json()["d"]
            print(f"  [FOUND] {d['Title']}: {d['Url']}")
            return [d["Url"]]
        else:
            print(f"    {r.status_code}: {url}")

    return []


# ── Main ──────────────────────────────────────────────────────────────
def main():
    global API_BASE, SITE_URL

    print("SharePoint REST API — Proof of Concept")
    print(f"Target: {SITE_URL}")
    print("=" * 50)

    token = get_access_token()

    # Discover the correct site URL
    sites = discover_sites(token)
    if sites:
        # Use the first discovered site that contains our site name
        match = next((s for s in sites if SP_SITE.lower() in s.lower()), sites[0])
        SITE_URL = match.rstrip("/")
        API_BASE = f"{SITE_URL}/_api"
        print(f"\n>>> Using discovered site: {SITE_URL} <<<")

    # Test 1: List libraries
    libs = test_list_libraries(token)
    if not libs:
        print("\n[ABORT] Cannot list libraries — nothing else will work.")
        return

    # Pick a library to test with (prefer "Documents" or the first one)
    test_lib = next((l for l in libs if l["Title"] == "Documents"), libs[0])
    lib_title = test_lib["Title"]
    print(f"\n>>> Using library '{lib_title}' for remaining tests <<<")

    # Test 2: Read current permissions
    test_read_permissions(token, lib_title)

    # Test 3: Break inheritance
    if not test_break_inheritance(token, lib_title):
        print("\n[ABORT] Cannot break inheritance — skipping add/remove tests.")
        return

    # Test 4: Add permission
    add_result = test_add_permission(token, lib_title)

    # Test 5: Remove the permission we just added (cleanup)
    if add_result and isinstance(add_result, tuple):
        user_id, role_id = add_result
        test_remove_permission(token, lib_title, user_id, role_id)
    else:
        print("\n═══ TEST 5: Remove permission ═══")
        print("  [SKIP] No permission was added, nothing to remove")

    # Test 6: Restore inheritance (cleanup)
    test_restore_inheritance(token, lib_title)

    # Summary
    print("\n" + "=" * 50)
    print("POC COMPLETE — Review results above.")
    print("If all 6 tests show [OK], the product is technically viable.")


if __name__ == "__main__":
    main()
