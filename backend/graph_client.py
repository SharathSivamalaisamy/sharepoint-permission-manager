"""Microsoft Graph API client — resolves M365 Group members.

Modern SharePoint Team sites use M365 Groups (Azure AD) for membership.
The SharePoint REST API only shows direct SP group members, missing anyone
who was added via the M365 Group (like Jane Dove).

This client calls Graph API to get the REAL member list.
Requires: GroupMember.Read.All (Delegated) permission in Azure AD.
"""

import requests


class GraphClient:
    def __init__(self, token):
        self.token = token
        self.base = "https://graph.microsoft.com/v1.0"

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    def _get(self, url):
        r = requests.get(url, headers=self._headers())
        r.raise_for_status()
        return r.json()

    def get_group_members(self, group_id):
        """Get members of an M365 group (the real source of truth)."""
        url = (
            f"{self.base}/groups/{group_id}/members"
            f"?$select=id,displayName,mail,userPrincipalName"
            f"&$top=999"
        )
        data = self._get(url)
        return [
            {
                "displayName": m.get("displayName", ""),
                "mail": m.get("mail", ""),
                "userPrincipalName": m.get("userPrincipalName", ""),
            }
            for m in data.get("value", [])
            if m.get("@odata.type", "") == "#microsoft.graph.user"
        ]

    def get_group_owners(self, group_id):
        """Get owners of an M365 group."""
        url = (
            f"{self.base}/groups/{group_id}/owners"
            f"?$select=id,displayName,mail,userPrincipalName"
            f"&$top=999"
        )
        data = self._get(url)
        return [
            {
                "displayName": m.get("displayName", ""),
                "mail": m.get("mail", ""),
                "userPrincipalName": m.get("userPrincipalName", ""),
            }
            for m in data.get("value", [])
            if m.get("@odata.type", "") == "#microsoft.graph.user"
        ]
