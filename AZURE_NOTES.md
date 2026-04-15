# Azure AD App Registration Notes

## App Registration (sharathconsulting tenant)

| Field | Value |
|-------|-------|
| Display name | SharePoint Permission Manager |
| Tenant | sharathconsulting.onmicrosoft.com |
| Tenant ID | fdd9885d-dda8-405d-b9a4-97e08614005b |
| Client ID | (regenerate from Azure Portal if needed) |
| Client Secret | (regenerate — do not store here) |

## Redirect URIs configured
- `http://localhost:8000/api/auth/callback` (local dev)
- `https://<your-azure-app>.azurewebsites.net/api/auth/callback` (production)

## API Permissions granted
- Microsoft Graph: `Sites.Read.All` (delegated)
- Microsoft Graph: `Sites.ReadWrite.All` (delegated)
- Microsoft Graph: `Group.Read.All` (delegated)
- Microsoft Graph: `User.Read` (delegated)
- SharePoint: `AllSites.Read` (delegated)
- SharePoint: `AllSites.Write` (delegated)

## Azure Resources (now deleted)
- App Service: sharepoint-permission-manager (F1 tier → deleted)
- App Service Plan: sharepoint-permissions-plan (deleted)
- Resource Group: sharepoint-permissions-rg (deleted)

## M365 Trial
- Account: SharathSivamalaisamy@sharathconsulting.onmicrosoft.com
- Plan: Business Basic trial (28-day)
- Action: Cancel before day 28 to avoid charge

## To rebuild from scratch
1. Go to portal.azure.com → Azure Active Directory → App registrations → New
2. Set redirect URIs above
3. Certificates & secrets → New client secret (copy it immediately)
4. API permissions → Add the permissions above → Grant admin consent
5. Copy Tenant ID and Client ID into .env
6. Deploy backend to Azure App Service (or run locally)
