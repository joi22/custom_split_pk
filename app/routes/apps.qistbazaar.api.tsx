/**
 * App Proxy API Route — /apps/qistbazaar/api
 *
 * Handles all backend data requests from the storefront widget and checkout page.
 * All QistBazaar credentials and tokens are kept here — never in the browser.
 *
 * Supported actions (query param: ?action=...):
 *   GET  ?action=emi&productCost=40000   → EMI plans
 *   GET  ?action=cities                  → city list
 *   GET  ?action=areas&cityName=Karachi  → area list
 *   POST ?action=order                   → create installment order
 */

import { data, type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getEmiPlans,
  getCities,
  getAreas,
  createQistOrder,
  extractQistList,
} from "../services/qistbazaar.server";
import { validateQistOrder } from "../services/validation.server";

function debugLog(msg: string, obj?: any) {
  try {
    const timestamp = new Date().toISOString();
    let logMsg = `[QistBazaar API Debug] ${msg}`;
    if (obj) {
      if (obj instanceof Error) {
        console.error(logMsg, `\nError: ${obj.message}\nStack: ${obj.stack}`);
      } else {
        console.log(logMsg, JSON.stringify(obj, null, 2));
      }
    } else {
      console.log(logMsg);
    }
  } catch (e) {
    console.error("Failed to print debug log:", e);
  }
}

// ─── GET requests (EMI, Cities, Areas) ───────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  debugLog(`[API Loader] Incoming request: ${request.url}`);
  debugLog(`[API Loader] Headers:`, Object.fromEntries(request.headers.entries()));
  
  // Validate the request came through Shopify's app proxy
  try {
    debugLog(`[API Loader] Environment check: QIST_BASE_URL=${process.env.QIST_BASE_URL}, QIST_USERNAME=${process.env.QIST_USERNAME}`);
    debugLog(`[API Loader] Shopify Env check: SHOPIFY_API_KEY=${process.env.SHOPIFY_API_KEY}, HAS_SECRET=${!!process.env.SHOPIFY_API_SECRET}`);
    
    await authenticate.public.appProxy(request);
    debugLog("[API Loader] App Proxy authentication successful");
  } catch (authErr: any) {
    debugLog("[API Loader] App Proxy authentication failed", authErr);
    // If it's a response (e.g. 400 Bad Request thrown by shopify), we should rethrow it or return it
    if (authErr instanceof Response) {
      debugLog(`[API Loader] Rethrowing auth response: status=${authErr.status}`);
      throw authErr;
    }
    return data(
      { success: false, error: "App Proxy authentication failed: " + (authErr.message || String(authErr)) },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  try {
    // ── EMI Plans ──────────────────────────────────────────────────────────
    if (action === "emi") {
      const productCost = url.searchParams.get("productCost");

      if (!productCost || Number(productCost) <= 0) {
        return data(
          { success: false, error: "productCost query param is required and must be > 0" },
          { status: 400 }
        );
      }

      const plans = await getEmiPlans(productCost);

      return data({
        success: true,
        data: Array.isArray(plans) ? plans : [],
      });
    }

    // ── Cities ─────────────────────────────────────────────────────────────
    if (action === "cities") {
      const result = await getCities();
      return data({ success: true, data: result });
    }

    // ── Areas ──────────────────────────────────────────────────────────────
    if (action === "areas") {
      const cityName = url.searchParams.get("cityName");
      const areas = await getAreas(cityName || null);
      return data({ success: true, data: areas });
    }

    return data(
      { success: false, error: `Unknown action: "${action}"` },
      { status: 400 }
    );
  } catch (err: any) {
    debugLog("[API Loader] Main block caught exception", err);
    console.error("[QistBazaar API loader]", err);
    return data(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── POST requests (Create Order) ────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  // Validate the request came through Shopify's app proxy
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const actionType = url.searchParams.get("action");

  if (actionType !== "order") {
    return data(
      { success: false, error: `Invalid POST action: "${actionType}"` },
      { status: 400 }
    );
  }

  try {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return data({ success: false, error: "Invalid or empty JSON body" }, { status: 400 });
    }
    console.log("[QistBazaar API] POST Order request received:", body);

    // Server-side validation
    const validation = validateQistOrder(body);
    if (!validation.valid) {
      return data(
        { success: false, errors: validation.errors },
        { status: 422 }
      );
    }

    // Extract real IP (Shopify passes it via x-forwarded-for)
    let ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
    
    // Fallback to a valid public IP if localhost or empty (prevents API validation errors in dev/testing)
    if (!ipAddress || ipAddress === "127.0.0.1" || ipAddress === "::1" || ipAddress === "0.0.0.0") {
      ipAddress = "103.74.22.151";
    }

    // Calculate cartTotal based on EMI items: (installmentAmount * month) + advanceAmount
    let calculatedCartTotal = 0;
    if (body.orderItems && Array.isArray(body.orderItems)) {
      for (const item of body.orderItems) {
        const inst = Number(item.installmentAmount) || 0;
        const adv = Number(item.advanceAmount) || 0;
        const mths = Number(item.month) || 0;
        calculatedCartTotal += (inst * mths) + adv;
      }
    }
    const cartTotalVal = body.cartTotal !== undefined ? body.cartTotal : calculatedCartTotal;

    // Optionally append area name to address (QistBazaar /orders/post does not take area/areaID fields).
    const address = String(body.address || "").trim();
    const areaName = body.area ? String(body.area).trim() : "";
    const fullAddress =
      areaName && !address.toLowerCase().includes(areaName.toLowerCase())
        ? `${address}, ${areaName}`
        : address;

    // Build the QistBazaar payload strictly compliant with their working schema
    const payload: any = {
      name: body.name,
      cnic: body.cnic,
      address: fullAddress,
      city: body.city,
      cartDiscountTotal: Number(body.cartDiscountTotal || 0).toFixed(2),
      cartTotal: Number(cartTotalVal).toFixed(2),
      ipAddress,
      orderStatus: body.orderStatus || "pending",
      phoneNo: body.phoneNo,
      alternativePhoneNo: body.alternativePhoneNo || "",
      email: body.email,
      orderNote: body.orderNote || "",
      orderSource: (body.orderSource === "web" || body.orderSource === "app") ? body.orderSource : "app",
      purchaseSource: "facebook",
      // purchaseSource: (body.purchaseSource === "facebook" || body.purchaseSource === "web" || body.purchaseSource === "website" || body.purchaseSource === "instagram" || body.purchaseSource === "google") ? body.purchaseSource : "facebook",
      couponID: body.couponID !== undefined && body.couponID !== null ? String(body.couponID) : "",
      productCost: String(body.productCost || 0),
      orderItems: body.orderItems.map((item: any) => ({
        installmentAmount: Number(item.installmentAmount || 0).toFixed(2),
        advanceAmount: Number(item.advanceAmount || 0).toFixed(2),
        productName: item.productName,
        itemCode: item.itemCode,
        month: String(item.month || 0),
      })),
    };

    const result = await createQistOrder(payload);
    console.log("[QistBazaar API] Order creation result:", result);

    return data({ success: true, result });
  } catch (err: any) {
    console.error("[QistBazaar API action]", err);
    return data(
      { success: false, error: err.message || "Order submission failed" },
      { status: 500 }
    );
  }
}
