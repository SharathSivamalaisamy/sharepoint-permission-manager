export async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (res.status === 401) {
    // Session expired / gone. Return to root so the landing page can
    // show a sign-in button instead of jumping straight into OAuth.
    window.location.href = "/";
    return null;
  }

  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      detail = parsed?.detail || text;
    } catch {}
    const err = new Error(detail || res.statusText);
    err.status = res.status;
    err.detail = detail;
    throw err;
  }

  return res.json();
}

export function encodeSiteId(url) {
  return btoa(url).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeSiteId(id) {
  const base64 = id.replace(/-/g, "+").replace(/_/g, "/");
  return atob(base64);
}
