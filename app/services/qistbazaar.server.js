/**
 * QistBazaar API Service (SERVER ONLY)
 * All credentials and tokens stay here — never exposed to the browser.
 */

let cachedToken = null;
let tokenCreatedAt = 0;

// Token TTL: 25 minutes (QistBazaar tokens typically last 30 min)
const TOKEN_TTL = 1000 * 60 * 25;

function getBaseUrl() {
  if (!process.env.QIST_BASE_URL) {
    throw new Error("QIST_BASE_URL environment variable is missing");
  }
  return process.env.QIST_BASE_URL.replace(/\/$/, "");
}

/**
 * Authenticate with QistBazaar and cache the token.
 */
async function loginToQistBazaar() {
  const url = `${getBaseUrl()}/user/login`;

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

  if (!response.ok || !data.token) {
    throw new Error(
      `QistBazaar login failed: ${data?.message || response.statusText}`
    );
  }

  cachedToken = data.token;
  tokenCreatedAt = Date.now();

  return cachedToken;
}

/**
 * Return a valid token, refreshing if expired.
 */
async function getToken() {
  const isExpired = !cachedToken || Date.now() - tokenCreatedAt > TOKEN_TTL;
  if (isExpired) {
    return await loginToQistBazaar();
  }
  return cachedToken;
}

/**
 * Core authenticated request to QistBazaar.
 * Retries once on 401 (token expired mid-session).
 */
async function qistRequest(path, options = {}, retry = true) {
  const token = await getToken();

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
    cachedToken = null;
    await loginToQistBazaar();
    return qistRequest(path, options, false);
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.message || data?.result?.message || `QistBazaar API error ${response.status} on ${path}`
    );
  }

  if (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    data.success === false
  ) {
    throw new Error(
      data?.message || data?.result?.message || `QistBazaar API error on ${path}`
    );
  }

  return data;
}

function extractQistList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (typeof payload === "object") {
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && typeof payload.data === "object" && Array.isArray(payload.data.data)) {
      return payload.data.data;
    }
    if (Array.isArray(payload.result)) return payload.result;
  }
  return [];
}

// ─── Public API functions ────────────────────────────────────────────────────

/**
 * Fetch EMI installment plans for a given product cost.
 * @param {number|string} productCost
 */
export async function getEmiPlans(productCost) {
  return qistRequest(
    `/emi/?productCost=${encodeURIComponent(productCost)}`,
    { method: "GET" }
  );
}

/**
 * Fetch all available cities.
 */
export async function getCities() {
  return qistRequest("/cities/get", { method: "GET" });
}

/**
 * Fetch all areas (filter by cityName client-side or pass cityName for server filtering).
 * @param {string|null} cityName
 */
export async function getAreas(cityName = null) {
  const data = await qistRequest("/areas/get", { method: "GET" });
  let areas = extractQistList(data);

  if (cityName) {
    areas = areas.filter(
      (area) =>
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
export async function createQistOrder(payload) {
  return qistRequest("/orders/post", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Fetch B2B orders (all or by filter).
 * @param {object} params  { orderID, orderStatus, _start, _limit }
 */
export async function fetchB2BOrders(params = {}) {
  const qs = new URLSearchParams();
  if (params.orderID) qs.set("orderID", params.orderID);
  if (params.orderStatus) qs.set("orderStatus", params.orderStatus);
  if (params._start) qs.set("_start", params._start);
  if (params._limit) qs.set("_limit", params._limit);

  const query = qs.toString() ? `?${qs.toString()}` : "";
  return qistRequest(`/orders/b2b/fetch${query}`, { method: "GET" });
}
