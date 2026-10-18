/** Browser-side client for /api/v1 (cookie session). */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public reason?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function apiFetch<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  // FormData (file uploads) is sent as multipart; the browser sets the boundary header itself.
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  const res = await fetch(`/api/v1${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: init.body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: init.body ? (isForm ? (init.body as FormData) : JSON.stringify(init.body)) : undefined,
    credentials: "same-origin",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, json?.error?.message ?? "Có lỗi xảy ra, vui lòng thử lại", json?.error?.reason, json?.error?.details);
  }
  return json?.data as T;
}
