const BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1";
export async function featureRequest(
  path,
  token,
  { method = "GET", body, csv = false } = {},
) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 204) return null;
  if (csv && response.ok) return response.text();
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const e = new Error(
      data?.error?.message || "Request failed. Please try again.",
    );
    e.status = response.status;
    throw e;
  }
  return data;
}
export function queryString(values) {
  const q = new URLSearchParams(
    Object.entries(values).filter(
      ([, v]) => v !== "" && v !== null && v !== undefined,
    ),
  );
  return q.size ? `?${q}` : "";
}
