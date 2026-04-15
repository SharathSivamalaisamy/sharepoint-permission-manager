"""
SharePoint Permission Manager — Backend API
============================================
Multi-tenant FastAPI app. MSP signs in once, connects client tenants,
manages permissions across all of them.
"""

import os
import sys
import uuid
import base64
import json
import logging
import re
from pathlib import Path
from datetime import datetime, timedelta

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import requests
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from dotenv import load_dotenv
from msal import ConfidentialClientApplication, SerializableTokenCache
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from sp_client import SharePointClient, _is_system_account
from graph_client import GraphClient

# ── Config ───────────────────────────────────────────────────────────

# In dev, load from .env file; in production (Azure), env vars are set directly
# In dev, load from local .env; in production (Azure), env vars are set directly
_env_path = Path(__file__).parent / "sharepoint.env"
if _env_path.exists():
    load_dotenv(_env_path)
else:
    load_dotenv()  # tries .env in current dir

TENANT_ID = os.getenv("TENANT_ID")
CLIENT_ID = os.getenv("CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET")
SP_DOMAIN = os.getenv("SHAREPOINT_DOMAIN")

REDIRECT_URI = os.getenv("REDIRECT_URI", "http://localhost:8000/api/auth/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

IS_DEV = REDIRECT_URI.startswith("http://localhost")

SESSION_MAX_AGE = timedelta(hours=24)        # absolute lifetime
SESSION_IDLE_TIMEOUT = timedelta(hours=8)    # idle timeout — generous so OAuth
                                             # consent round-trips don't kick
                                             # users out mid-flow

log = logging.getLogger("spm")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# ── App setup ────────────────────────────────────────────────────────

app = FastAPI(
    title="SharePoint Permission Manager",
    docs_url=None if not IS_DEV else "/docs",
    redoc_url=None if not IS_DEV else "/redoc",
    openapi_url=None if not IS_DEV else "/openapi.json",
)

# Rate limiter for auth endpoints (IP-based). Behind Azure's reverse proxy,
# the real client IP is in X-Forwarded-For — fall back to the direct remote.
def _client_key(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return get_remote_address(request)

limiter = Limiter(key_func=_client_key, default_limits=[])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# HTTPS enforcement + security headers middleware
class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Enforce HTTPS in production by honoring X-Forwarded-Proto from Azure
        if not IS_DEV:
            proto = request.headers.get("x-forwarded-proto", "").lower()
            if proto == "http":
                url = request.url.replace(scheme="https")
                return RedirectResponse(url=str(url), status_code=301)

        response = await call_next(request)
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        if not IS_DEV:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


app.add_middleware(SecurityMiddleware)

# Restrict trusted hosts in production to prevent Host header attacks
if not IS_DEV:
    _frontend_host = FRONTEND_URL.replace("https://", "").replace("http://", "").split("/")[0]
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=[_frontend_host, "*.azurewebsites.net"],
    )

_allowed_origins = [FRONTEND_URL]
if IS_DEV and "localhost" not in FRONTEND_URL:
    _allowed_origins.extend(["http://localhost:5173", "http://localhost:5174"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)

# Generic exception handler — never leak stack traces to clients
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )

    # Short correlation ID so support can find the matching traceback
    error_id = uuid.uuid4().hex[:8]

    # requests.HTTPError = upstream SharePoint/Graph returned an error.
    # Surface the upstream status so the user knows this is not our server crashing.
    if isinstance(exc, requests.exceptions.HTTPError):
        resp = exc.response
        upstream_status = resp.status_code if resp is not None else 0
        log.exception(
            "[%s] Upstream HTTP error on %s %s (upstream %s)",
            error_id, request.method, request.url.path, upstream_status,
        )
        if upstream_status == 401:
            # Upstream rejected our tenant token. The MSP session is still
            # valid — return 403 so the frontend doesn't redirect to login.
            detail = (
                "SharePoint rejected the access token for this tenant. "
                f"Please reconnect the tenant. (error {error_id})"
            )
            status = 403
        elif upstream_status == 403:
            detail = (
                "SharePoint refused this request. The signed-in account may "
                "not have permission on this site. (error "
                f"{error_id})"
            )
            status = 403
        elif upstream_status == 404:
            detail = f"Resource not found in SharePoint. (error {error_id})"
            status = 404
        else:
            detail = (
                f"SharePoint returned an error ({upstream_status}). Please "
                f"try again in a moment. If it keeps failing, contact support "
                f"with error ID {error_id}."
            )
            status = 502
        return JSONResponse(
            status_code=status,
            content={"detail": detail, "error_id": error_id},
        )

    if isinstance(exc, requests.exceptions.RequestException):
        log.exception(
            "[%s] Network error on %s %s",
            error_id, request.method, request.url.path,
        )
        return JSONResponse(
            status_code=502,
            content={
                "detail": (
                    "Could not reach SharePoint. Please check your network "
                    f"and try again. (error {error_id})"
                ),
                "error_id": error_id,
            },
        )

    log.exception(
        "[%s] Unhandled error on %s %s",
        error_id, request.method, request.url.path,
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": (
                "Something went wrong on our end. Please try again. "
                f"If it keeps failing, contact support with error ID {error_id}."
            ),
            "error_id": error_id,
        },
    )

# In-memory session store
sessions: dict = {}


# Tenant info is stored per-session (no shared global state)


# ── Helpers ──────────────────────────────────────────────────────────

def build_msal_app(authority_tenant="organizations", cache=None):
    return ConfidentialClientApplication(
        CLIENT_ID,
        authority=f"https://login.microsoftonline.com/{authority_tenant}",
        client_credential=CLIENT_SECRET,
        token_cache=cache,
    )


def encode_state(data: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(data).encode()).decode()


def decode_state(state: str) -> dict:
    padded = state + "=" * (4 - len(state) % 4)
    return json.loads(base64.urlsafe_b64decode(padded).decode())


def decode_site_id(site_id: str, expected_domain: str = None) -> str:
    padded = site_id + "=" * (4 - len(site_id) % 4)
    url = base64.urlsafe_b64decode(padded).decode()
    # Prevent SSRF: validate the decoded URL is a legitimate SharePoint site
    from urllib.parse import urlparse
    parsed = urlparse(url)
    if not parsed.scheme == "https" or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Invalid site ID")
    if not parsed.hostname.endswith(".sharepoint.com"):
        raise HTTPException(status_code=400, detail="Invalid site ID")
    if expected_domain and parsed.hostname != expected_domain:
        raise HTTPException(status_code=400, detail="Invalid site ID")
    return url


def get_session(request: Request) -> dict:
    session_id = request.cookies.get("session_id")
    if not session_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if session_id not in sessions:
        # Cookie exists but session is gone — likely a worker restart
        # (in-memory session store lost) or genuine logout.
        log.info(
            "[session] Cookie %s presented but session not in store (worker "
            "restart or logged out)",
            session_id[:8],
        )
        raise HTTPException(status_code=401, detail="Session expired — please sign in again")
    session = sessions[session_id]
    now = datetime.utcnow()
    # Absolute lifetime cap
    created = session.get("created_at")
    if created and now - datetime.fromisoformat(created) > SESSION_MAX_AGE:
        log.info("[session] %s exceeded max age, deleting", session_id[:8])
        del sessions[session_id]
        raise HTTPException(status_code=401, detail="Session expired — please sign in again")
    # Idle timeout — sliding window
    last_seen = session.get("last_seen")
    if last_seen and now - datetime.fromisoformat(last_seen) > SESSION_IDLE_TIMEOUT:
        idle = now - datetime.fromisoformat(last_seen)
        log.info(
            "[session] %s idle for %s, deleting",
            session_id[:8], idle,
        )
        del sessions[session_id]
        raise HTTPException(status_code=401, detail="Session expired — please sign in again")
    # Update last-seen (sliding window)
    session["last_seen"] = now.isoformat()
    return session


def get_token_for_tenant(request: Request, tenant_id: str) -> str:
    """Get a valid access token for a specific tenant, refreshing if needed.

    NOTE: Tenant-token problems are returned as 403, not 401. 401 is reserved
    for "the MSP session is gone" so the frontend can safely redirect to
    login on 401. A tenant token going stale must not kick the user out of
    the app — they should just reconnect that one tenant.
    """
    session = get_session(request)
    tenant_caches = session.get("tenant_caches", {})
    tenants = session.get("tenants", {})

    if tenant_id not in tenant_caches:
        raise HTTPException(status_code=403, detail="Tenant not connected in this session")

    tenant = tenants.get(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    cache = SerializableTokenCache()
    cache.deserialize(tenant_caches[tenant_id])

    sp_domain = tenant["domain"]
    access_level = tenant.get("access_level", "read")
    if access_level == "write":
        scopes = [f"https://{sp_domain}/AllSites.FullControl"]
    else:
        scopes = [f"https://{sp_domain}/AllSites.Read"]

    msal_app = build_msal_app(tenant_id, cache)
    accounts = msal_app.get_accounts()

    if not accounts:
        log.info("[token] No MSAL accounts for tenant %s — needs reconnect", sp_domain)
        raise HTTPException(
            status_code=403,
            detail="This tenant's connection has expired. Click 'Reconnect' on the tenant to continue.",
        )

    result = msal_app.acquire_token_silent(scopes, account=accounts[0])

    if cache.has_state_changed:
        tenant_caches[tenant_id] = cache.serialize()

    if result and "access_token" in result:
        return result["access_token"]

    log.info(
        "[token] Silent refresh failed for tenant %s: %s",
        sp_domain, (result or {}).get("error_description", "unknown"),
    )
    raise HTTPException(
        status_code=403,
        detail="Could not refresh SharePoint access for this tenant. Please reconnect it.",
    )


def get_sp_for_tenant(request: Request, tenant_id: str) -> SharePointClient:
    session = get_session(request)
    tenant = session.get("tenants", {}).get(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    token = get_token_for_tenant(request, tenant_id)
    return SharePointClient(tenant["domain"], token)


def get_graph_token_for_tenant(tenant_id: str):
    """Get a Microsoft Graph API token using client_credentials (app-only).

    Uses the app's own credentials — no user session needed.
    Requires GroupMember.Read.All as APPLICATION permission (not Delegated).
    """
    msal_app = ConfidentialClientApplication(
        CLIENT_ID,
        authority=f"https://login.microsoftonline.com/{tenant_id}",
        client_credential=CLIENT_SECRET,
    )
    result = msal_app.acquire_token_for_client(
        scopes=["https://graph.microsoft.com/.default"]
    )
    if result and "access_token" in result:
        return result["access_token"]

    log.warning("[Graph token] client_credentials grant failed for tenant")
    return None


def enrich_site_groups_with_graph(site_groups, sp, site_url, graph_owners, graph_members):
    """Merge M365 Group members (from Graph API) into SP group data.

    The SP REST API only returns direct group members, missing anyone who's
    in the nested M365 Group. This function adds those missing users by
    matching Graph results against existing SP data and calling ensure_user
    to resolve new users.
    """
    # Find the Owners and Members groups in the SP group data
    owners_group = next(
        (g for g in site_groups if "owner" in g["groupName"].lower()), None
    )
    members_group = next(
        (g for g in site_groups if "member" in g["groupName"].lower()), None
    )

    def existing_emails(group):
        """Collect all known emails/UPNs already in a group."""
        emails = set()
        for u in group["users"]:
            if u.get("email"):
                emails.add(u["email"].lower())
            if u.get("loginName"):
                # loginName format: "i:0#.f|membership|user@domain.com"
                parts = u["loginName"].split("|")
                if len(parts) >= 3:
                    emails.add(parts[-1].lower())
        return emails

    def add_graph_users(graph_users, target_group):
        if not target_group:
            return
        known = existing_emails(target_group)
        for gu in graph_users:
            email = gu.get("mail") or gu.get("userPrincipalName") or ""
            if not email or email.lower() in known:
                continue

            # Resolve the user in SharePoint to get their SP principal ID.
            # ensure_user is lightweight — it just adds them to the site's
            # user information list if they're not already there.
            try:
                sp_user = sp.ensure_user(site_url, email)
                target_group["users"].append(sp_user)
                known.add(email.lower())
            except Exception as e:
                # If ensure_user fails, still show the user but with a flag
                log.warning("[Graph enrich] ensure_user failed for a user")
                target_group["users"].append({
                    "id": -hash(email) % 100000,  # Synthetic ID
                    "title": gu.get("displayName", email),
                    "loginName": email,
                    "email": email,
                })
                known.add(email.lower())

    add_graph_users(graph_owners, owners_group)
    add_graph_users(graph_members, members_group)


# ── Auth routes ──────────────────────────────────────────────────────

@app.get("/api/auth/login")
@limiter.limit("10/minute")
async def login(request: Request):
    """Initial MSP sign-in. Authenticates user identity only.
    SharePoint-specific scopes are requested per-tenant via connect flow."""
    state = encode_state({
        "type": "signin",
        "nonce": str(uuid.uuid4()),
    })

    msal_app = build_msal_app("organizations")
    auth_url = msal_app.get_authorization_request_url(
        ["User.Read"],
        redirect_uri=REDIRECT_URI,
        state=state,
    )
    return RedirectResponse(auth_url)


@app.get("/api/auth/callback")
@limiter.limit("20/minute")
async def auth_callback(request: Request):
    code = request.query_params.get("code")
    error = request.query_params.get("error")
    state_raw = request.query_params.get("state", "")

    if error:
        return RedirectResponse(f"{FRONTEND_URL}/?error=Authentication+failed.+Please+try+again.")

    try:
        state = decode_state(state_raw)
    except Exception:
        return RedirectResponse(f"{FRONTEND_URL}/?error=Invalid+state")

    flow_type = state.get("type", "signin")
    domain = state.get("domain", "")
    cache = SerializableTokenCache()

    # Always use "organizations" authority — works for any tenant
    msal_app = build_msal_app("organizations", cache)

    if flow_type == "signin":
        # Sign-in: just get identity (openid + profile)
        result = msal_app.acquire_token_by_authorization_code(
            code, scopes=["User.Read"], redirect_uri=REDIRECT_URI
        )

        if "id_token_claims" not in result:
            log.warning("[Signin] Token exchange failed: %s", result.get("error_description", "unknown"))
            return RedirectResponse(f"{FRONTEND_URL}/?error=Sign+in+failed.+Please+try+again.")

        claims = result.get("id_token_claims", {})
        session_id = str(uuid.uuid4())
        now_iso = datetime.utcnow().isoformat()
        sessions[session_id] = {
            "user": claims,
            "created_at": now_iso,
            "last_seen": now_iso,
            "tenant_caches": {},
            "tenants": {},
        }
        log.info("[Signin] New session created")

        response = RedirectResponse(f"{FRONTEND_URL}/")
        response.set_cookie(
            "session_id", session_id,
            httponly=True, samesite="lax", max_age=86400,
            secure=not IS_DEV,
        )
        return response

    elif flow_type in ("connect", "upgrade"):
        # Connect tenant or upgrade to write access
        access_level = state.get("access_level", "read")
        if access_level == "write":
            scopes = [f"https://{domain}/AllSites.FullControl"]
        else:
            scopes = [f"https://{domain}/AllSites.Read"]

        result = msal_app.acquire_token_by_authorization_code(
            code, scopes=scopes, redirect_uri=REDIRECT_URI
        )

        if "access_token" not in result:
            log.warning("[%s] Token exchange failed: %s", flow_type, result.get("error_description", "unknown"))
            return RedirectResponse(f"{FRONTEND_URL}/?error=Token+exchange+failed.+Please+try+again.")

        claims = result.get("id_token_claims", {})
        tenant_id = claims.get("tid", "")

        session_id = request.cookies.get("session_id")
        if not session_id or session_id not in sessions:
            return RedirectResponse(f"{FRONTEND_URL}/?error=Session+expired+-+please+sign+in+again+then+add+tenant")

        session = sessions[session_id]
        session["tenant_caches"][tenant_id] = cache.serialize()

        if "tenants" not in session:
            session["tenants"] = {}

        if flow_type == "connect":
            session["tenants"][tenant_id] = {
                "tenant_id": tenant_id,
                "domain": domain,
                "display_name": state.get("display_name", domain.split(".")[0]),
                "connected_at": datetime.utcnow().isoformat(),
                "connected_by": session["user"].get("preferred_username", ""),
                "access_level": "read",
            }
            log.info("[Connect] Tenant %s connected (read-only)", domain)
        else:
            # Upgrade: keep existing tenant info, just update access level and cache
            if tenant_id in session["tenants"]:
                session["tenants"][tenant_id]["access_level"] = "write"
            log.info("[Upgrade] Tenant %s upgraded to write access", domain)

        return RedirectResponse(f"{FRONTEND_URL}/")

    return RedirectResponse(f"{FRONTEND_URL}/?error=Unknown+flow+type")


@app.get("/api/auth/me")
async def me(request: Request):
    session = get_session(request)
    claims = session.get("user", {})
    return {
        "name": claims.get("name", "Unknown"),
        "email": claims.get("preferred_username", ""),
    }


@app.post("/api/auth/logout")
async def logout(request: Request):
    session_id = request.cookies.get("session_id")
    if session_id and session_id in sessions:
        del sessions[session_id]
    response = RedirectResponse(f"{FRONTEND_URL}/", status_code=303)
    response.delete_cookie("session_id")
    return response


# ── Tenant management ────────────────────────────────────────────────

@app.get("/api/tenants")
async def list_tenants(request: Request):
    session = get_session(request)
    return list(session.get("tenants", {}).values())


class ConnectTenantBody(BaseModel):
    domain: str
    display_name: str


@app.post("/api/tenants/connect")
@limiter.limit("20/minute")
async def connect_tenant(body: ConnectTenantBody, request: Request):
    session_id = request.cookies.get("session_id")
    if not session_id or session_id not in sessions:
        raise HTTPException(status_code=401)

    # Validate domain is a legit SharePoint domain
    domain = body.domain.strip().lower()
    if not re.match(r'^[a-z0-9-]+\.sharepoint\.com$', domain):
        raise HTTPException(status_code=400, detail="Domain must be a valid *.sharepoint.com domain")

    # Validate display name — prevent injection/long strings
    display_name = body.display_name.strip()
    if not display_name or len(display_name) > 100:
        raise HTTPException(status_code=400, detail="Display name required (1–100 chars)")
    if not re.match(r'^[\w\s\-.,&()]+$', display_name):
        raise HTTPException(status_code=400, detail="Display name contains invalid characters")

    log.info("[Connect] Starting tenant connect flow")

    state = encode_state({
        "type": "connect",
        "domain": domain,
        "display_name": display_name,
        "nonce": str(uuid.uuid4()),
    })

    scopes = [f"https://{domain}/AllSites.Read"]
    msal_app = build_msal_app("organizations")
    auth_url = msal_app.get_authorization_request_url(
        scopes,
        redirect_uri=REDIRECT_URI,
        state=state,
        prompt="consent",
    )

    return {"consent_url": auth_url}


@app.delete("/api/tenants/{tenant_id}")
async def disconnect_tenant(tenant_id: str, request: Request):
    session = get_session(request)
    if tenant_id not in session.get("tenant_caches", {}):
        raise HTTPException(status_code=403, detail="Not authorized to disconnect this tenant")
    session.get("tenant_caches", {}).pop(tenant_id, None)
    session.get("tenants", {}).pop(tenant_id, None)
    return {"ok": True}


@app.post("/api/tenants/{tenant_id}/upgrade")
async def upgrade_tenant_access(tenant_id: str, request: Request):
    """Request write access for a tenant (incremental consent)."""
    session = get_session(request)
    tenant = session.get("tenants", {}).get(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    if tenant.get("access_level") == "write":
        return {"already_upgraded": True}

    domain = tenant["domain"]
    state = encode_state({
        "type": "upgrade",
        "domain": domain,
        "access_level": "write",
        "nonce": str(uuid.uuid4()),
    })

    scopes = [f"https://{domain}/AllSites.FullControl"]
    msal_app = build_msal_app("organizations")
    auth_url = msal_app.get_authorization_request_url(
        scopes,
        redirect_uri=REDIRECT_URI,
        state=state,
        prompt="consent",
    )

    return {"consent_url": auth_url}


def require_write_access(request: Request, tenant_id: str):
    """Check that the tenant has write access. Raises 403 if read-only."""
    session = get_session(request)
    tenant = session.get("tenants", {}).get(tenant_id)
    if not tenant or tenant.get("access_level", "read") != "write":
        raise HTTPException(
            status_code=403,
            detail="Write access required. Please upgrade permissions for this tenant.",
        )


# ── Tenant-scoped API routes ─────────────────────────────────────────

@app.get("/api/tenants/{tenant_id}/sites")
async def list_sites(tenant_id: str, request: Request):
    return get_sp_for_tenant(request, tenant_id).list_sites()


@app.get("/api/tenants/{tenant_id}/libraries/{site_id}")
async def list_libraries(tenant_id: str, site_id: str, request: Request):
    site_url = decode_site_id(site_id)
    sp = get_sp_for_tenant(request, tenant_id)
    libraries = sp.list_libraries(site_url)
    site_title = sp.get_site_title(site_url)
    return {"siteTitle": site_title, "libraries": libraries}


@app.get("/api/tenants/{tenant_id}/library-detail/{site_id}/{lib_title}")
async def library_detail(tenant_id: str, site_id: str, lib_title: str, request: Request):
    site_url = decode_site_id(site_id)
    sp = get_sp_for_tenant(request, tenant_id)
    result = sp.get_library_detail(site_url, lib_title)

    # When inheritance is broken, enrich site groups with M365 Group members
    # via Microsoft Graph API. This catches users like Jane Dove who are in
    # the M365 Group but not directly in the classic SP group.
    if result.get("hasUniquePermissions") and result.get("siteGroups") is not None:
        try:
            group_id = sp.get_m365_group_id(site_url)
            if group_id:
                graph_token = get_graph_token_for_tenant(tenant_id)
                if graph_token:
                    graph = GraphClient(graph_token)
                    graph_owners = graph.get_group_owners(group_id)
                    graph_members = graph.get_group_members(group_id)
                    enrich_site_groups_with_graph(
                        result["siteGroups"], sp, site_url,
                        graph_owners, graph_members,
                    )
                    log.info("[Graph] Enriched site groups with Graph data")
                else:
                    log.warning("[Graph] No Graph token available — check app permissions")
        except Exception:
            # Graph failure is non-fatal — the page still works with SP data only
            log.warning("[Graph] Enrichment failed (non-fatal)")

    # Filter system accounts from site groups and add group role info
    if result.get("siteGroups"):
        # Build a map: groupId → roles from library permissions
        group_roles = {}
        for p in result.get("permissions", []):
            if p["principalType"] == 8:  # SharePoint group
                group_roles[p["principalId"]] = [r["name"] for r in p["roles"]]

        for group in result["siteGroups"]:
            group["users"] = [u for u in group["users"] if not _is_system_account(u)]
            group["libraryRoles"] = group_roles.get(group["groupId"], [])

        # Remove empty groups and sort: Owners → Members → Visitors
        def group_sort_key(g):
            name = g["groupName"].lower()
            if "owner" in name:
                return 0
            if "member" in name:
                return 1
            if "visitor" in name:
                return 2
            return 3

        result["siteGroups"] = sorted(
            [g for g in result["siteGroups"] if g["users"]],
            key=group_sort_key,
        )

    return result


# ── Permission mutations (tenant-scoped) ─────────────────────────────

class EnsureUserBody(BaseModel):
    email: str


@app.post("/api/tenants/{tenant_id}/ensure-user/{site_id}")
async def ensure_user(tenant_id: str, site_id: str, body: EnsureUserBody, request: Request):
    require_write_access(request, tenant_id)
    email = body.email.strip()
    if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email):
        raise HTTPException(status_code=400, detail="Invalid email format")
    site_url = decode_site_id(site_id)
    return get_sp_for_tenant(request, tenant_id).ensure_user(site_url, email)


class AddPermissionBody(BaseModel):
    principalId: int
    roleDefId: int


@app.post("/api/tenants/{tenant_id}/permissions/{site_id}/{lib_title}")
async def add_permission(
    tenant_id: str, site_id: str, lib_title: str, body: AddPermissionBody, request: Request
):
    require_write_access(request, tenant_id)
    site_url = decode_site_id(site_id)
    sp = get_sp_for_tenant(request, tenant_id)
    sp.add_permission(site_url, lib_title, body.principalId, body.roleDefId)
    return {"ok": True}


@app.delete("/api/tenants/{tenant_id}/permissions/{site_id}/{lib_title}/{principal_id}/{role_def_id}")
async def remove_permission(
    tenant_id: str, site_id: str, lib_title: str, principal_id: int, role_def_id: int,
    request: Request,
):
    require_write_access(request, tenant_id)
    site_url = decode_site_id(site_id)
    sp = get_sp_for_tenant(request, tenant_id)
    sp.remove_permission(site_url, lib_title, principal_id, role_def_id)
    return {"ok": True}


@app.post("/api/tenants/{tenant_id}/break-inheritance/{site_id}/{lib_title}")
async def break_inheritance(tenant_id: str, site_id: str, lib_title: str, request: Request):
    require_write_access(request, tenant_id)
    site_url = decode_site_id(site_id)
    get_sp_for_tenant(request, tenant_id).break_inheritance(site_url, lib_title)
    return {"ok": True}


@app.post("/api/tenants/{tenant_id}/restore-inheritance/{site_id}/{lib_title}")
async def restore_inheritance(tenant_id: str, site_id: str, lib_title: str, request: Request):
    require_write_access(request, tenant_id)
    site_url = decode_site_id(site_id)
    get_sp_for_tenant(request, tenant_id).restore_inheritance(site_url, lib_title)
    return {"ok": True}


# ── Static file serving (production) ─────────────────────────────────
# In production, Vite builds the React app into backend/static/.
# FastAPI serves those files and falls back to index.html for SPA routing.

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

_candidates = [
    Path(__file__).parent / "static",
    Path("/home/site/wwwroot/static"),
    Path.cwd() / "static",
]
STATIC_DIR = None
for _c in _candidates:
    if _c.exists() and (_c / "index.html").exists():
        STATIC_DIR = _c
        break

if STATIC_DIR:
    log.info("Serving static files from %s", STATIC_DIR)
    if (STATIC_DIR / "assets").exists():
        app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = STATIC_DIR / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(STATIC_DIR / "index.html")
else:
    log.warning("No static dir found. Checked: %s", [str(c) for c in _candidates])


# ── Run ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
