// HTTP client helpers.
// Mirrors: src/cljs/nr/ajax.cljs
//
// Returns Promises instead of core.async channels.
// CSRF token read from the same DOM element Sente uses.

export interface AjaxResponse {
  status: number;
  json: unknown;
}

// Mirrors: ?csrf-token in ajax.cljs
function getCsrfToken(): string {
  const el = document.getElementById("sente-csrf-token");
  return el?.getAttribute("data-csrf-token") ?? "";
}

async function request(
  method: string,
  url: string,
  body?: BodyInit | null,
  extraHeaders?: Record<string, string>,
): Promise<AjaxResponse> {
  const headers: Record<string, string> = {
    "X-CSRF-Token": getCsrfToken(),
    ...extraHeaders,
  };
  const res = await fetch(url, { method, headers, body: body ?? undefined });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON response
  }
  return { status: res.status, json };
}

// Mirrors: GET in ajax.cljs
export function GET(url: string): Promise<AjaxResponse> {
  return request("GET", url);
}

// Mirrors: DELETE in ajax.cljs
export function DELETE(url: string): Promise<AjaxResponse> {
  return request("DELETE", url);
}

// Mirrors: POST in ajax.cljs
export function POST(
  url: string,
  params: Record<string, unknown> | FormData | string,
  format?: "json" | "form",
): Promise<AjaxResponse> {
  if (format === "json") {
    return request("POST", url, JSON.stringify(params), {
      "Content-Type": "application/json",
    });
  }
  if (params instanceof FormData || typeof params === "string") {
    return request("POST", url, params);
  }
  const form = new FormData();
  for (const [k, v] of Object.entries(params)) {
    form.append(k, String(v));
  }
  return request("POST", url, form);
}

// Mirrors: PUT in ajax.cljs
export function PUT(
  url: string,
  params: Record<string, unknown> | string,
  format?: "json",
): Promise<AjaxResponse> {
  if (format === "json") {
    return request("PUT", url, JSON.stringify(params), {
      "Content-Type": "application/json",
    });
  }
  if (typeof params === "string") {
    return request("PUT", url, params);
  }
  return request("PUT", url, JSON.stringify(params), {
    "Content-Type": "application/json",
  });
}
