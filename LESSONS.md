# SharePoint Permission Manager — Lessons Learned

## What this project was
A GUI tool to view and manage SharePoint site permissions using the Microsoft Graph API and SharePoint REST API. FastAPI backend, React/Vite/Tailwind frontend. OAuth flow via MSAL (Microsoft Authentication Library). Targeted at IT admins who find the SharePoint admin center painful to use.

## What worked

### The OAuth flow with MSAL
MSAL's Python library handles token caching and refresh cleanly. The on-behalf-of flow (user logs in, backend uses their delegated permissions) worked well and is the right approach for per-user SharePoint access rather than app-only credentials.

### FastAPI + Starlette sessions
Storing tenant auth state in server-side sessions (encrypted cookie) worked reliably. The `tenants.json` approach for persisting connected tenants across restarts was simple and effective for a single-instance tool.

### Graph API for group membership
`/groups/{id}/members` and `/groups/{id}/transitiveMembers` both worked well. Transitive membership is essential — you need it to see nested group memberships or the results are misleading.

## What was painful

### SharePoint REST API vs Graph API — they're not interchangeable
The SharePoint REST API (`/_api/web/roleassignments`) and Graph API (`/sites/{id}/permissions`) expose different things. Graph is cleaner but incomplete — it doesn't expose all permission levels. For full permission detail you need the SharePoint REST API, which has a much worse DX.

### Delegated vs Application permissions
If you use application permissions (no user context), you get more API access but you bypass SharePoint's permission model — the app can see everything. Delegated permissions are safer but mean you can only see what the logged-in user can see. Design decision: delegated is the right call for an admin tool, but required the full OAuth redirect dance.

### Azure App Service cold starts
F1 (free) tier has cold starts of 30-60 seconds. For a tool that people open occasionally, this is a terrible user experience. B1 ($13/mo) would eliminate this. Worth it if the product ever goes live.

### CORS in production
Local dev was fine (frontend on :5173, backend on :8000). Azure deployment required explicit CORS configuration and the redirect URI had to be updated in both the app registration and the .env. Obvious in hindsight, always a surprise in the moment.

### tenants.json is not production-ready
Storing connected tenant metadata in a JSON file on disk works for a prototype. In production this needs a proper database — the file gets wiped on every App Service deployment.

## Why I paused
Evaluated the market more rigorously. The ICP is IT admins at mid-sized companies. The buying process is long (security review, procurement), competition is established (SysKit, ShareGate), and the free tier of SharePoint admin center has improved. The technical work is solid but the business case doesn't clear the bar for a solo indie product. Good learning project. Would make a better internal tool than a SaaS.

## What I'd do differently
- Start with a proper DB (SQLite at minimum) instead of JSON files
- Deploy on Railway or Render instead of Azure — less friction, similar cost
- Validate the ICP with 5 sales calls before writing a line of code
