/**
 * QistBazaar API Service (SERVER ONLY)
 * All credentials and tokens stay here — never exposed to the browser.
 */

let cachedToken: string | null = null;
let tokenCreatedAt = 0;

// Token TTL: 25 minutes (QistBazaar tokens typically last 30 min)
const TOKEN_TTL = 1000 * 60 * 25;

function getBaseUrl(): string {
  if (!process.env.QIST_BASE_URL) {
    throw new Error("QIST_BASE_URL environment variable is missing");
  }
  return process.env.QIST_BASE_URL.replace(/\/$/, "");
}

/**
 * Authenticate with QistBazaar and cache the token.
 */
async function loginToQistBazaar(): Promise<string> {
  const url = `${getBaseUrl()}/user/login`;
  console.log(`[QistBazaar] Attempting login to: ${url}`);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userName: process.env.QIST_USERNAME,
      email: process.env.QIST_USERNAME,
      password: process.env.QIST_PASSWORD,
    }),
  });

  const data = await response.json();
  console.log(`[QistBazaar] Login response status: ${response.status}`, data);

  if (!response.ok || !data.token || data.success === false) {
    throw new Error(
      `QistBazaar login failed: ${data?.message || data?.error || response.statusText}`
    );
  }

  cachedToken = data.token;
  tokenCreatedAt = Date.now();
  console.log("[QistBazaar] Login successful, token cached.");

  return cachedToken as string;
}

/**
 * Return a valid token, refreshing if expired.
 */
async function getToken(): Promise<string> {
  const isExpired = !cachedToken || Date.now() - tokenCreatedAt > TOKEN_TTL;
  if (isExpired) {
    return await loginToQistBazaar();
  }
  return cachedToken as string;
}

/**
 * Core authenticated request to QistBazaar.
 * Retries once on 401 (token expired mid-session).
 */
async function qistRequest(path: string, options: RequestInit = {}, retry = true): Promise<any> {
  const token = await getToken();
  console.log(`[QistBazaar] ${options.method || "GET"} Request to: ${path}`);
  if (options.body) console.log("[QistBazaar] Request Body:", options.body);

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-access-token": token,
      ...(options.headers || {}),
    },
  });

  // Token expired — invalidate cache and retry once
  if (response.status === 401 && retry) {
    console.warn("[QistBazaar] 401 Unauthorized - invalidating token and retrying...");
    cachedToken = null;
    await loginToQistBazaar();
    return qistRequest(path, options, false);
  }

  const data = await response.json().catch(() => null);
  console.log(`[QistBazaar] Response from ${path} (${response.status}):`, data);

  // Handle case where status is 200 but the body contains a QB-401 error code
  const internalError = data?.result?.statusCode || data?.statusCode;
  if (internalError === "QB-401" && retry) {
    console.warn("[QistBazaar] Internal QB-401 detected - invalidating token and retrying...");
    cachedToken = null;
    await loginToQistBazaar();
    return qistRequest(path, options, false);
  }

  if (!response.ok || data?.success === false || internalError === "QB-401") {
    throw new Error(
      data?.message || data?.result?.message || `QistBazaar API error ${response.status} on ${path}`
    );
  }

  return data;
}

// ─── Public API functions ────────────────────────────────────────────────────

/**
 * Fetch EMI installment plans for a given product cost.
 * @param {number|string} productCost
 */
export async function getEmiPlans(productCost: number | string): Promise<any> {
  return qistRequest(
    `/emi/?productCost=${encodeURIComponent(productCost)}`,
    { method: "GET" }
  );
}

/**
 * Fetch all available cities.
 */
export async function getCities(): Promise<any> {
  return qistRequest("/cities/get", { method: "GET" });
}

/**
 * Fetch all areas (filter by cityName client-side or pass cityName for server filtering).
 * @param {string|null} cityName
 */
export async function getAreas(cityName: string | null = null): Promise<any[]> {
  const data = await qistRequest("/areas/get", { method: "GET" });
  let areas = data?.data || [];

  if (cityName) {
    areas = areas.filter(
      (area: any) =>
        String(area.cityName).toLowerCase() ===
        String(cityName).toLowerCase()
    );
  }

  return areas;
}

/**
 * Create a QistBazaar installment order.
 * @param {object} payload
 */
export async function createQistOrder(payload: any): Promise<any> {
  return qistRequest("/orders/post", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Fetch B2B orders (all or by filter).
 * @param {object} params  { orderID, orderStatus, _start, _limit }
 */
export async function fetchB2BOrders(params: {
  orderID?: string;
  orderStatus?: string;
  _start?: number;
  _limit?: number;
} = {}): Promise<any> {
  const qs = new URLSearchParams();
  if (params.orderID) qs.set("orderID", params.orderID);
  if (params.orderStatus) qs.set("orderStatus", params.orderStatus);
  if (params._start) qs.set("_start", String(params._start));
  if (params._limit) qs.set("_limit", String(params._limit));

  const query = qs.toString() ? `?${qs.toString()}` : "";
  return qistRequest(`/orders/b2b/fetch${query}`, { method: "GET" });
}
