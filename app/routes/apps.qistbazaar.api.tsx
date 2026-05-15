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
} from "../services/qistbazaar.server";
import { validateQistOrder } from "../services/validation.server";

// ─── GET requests (EMI, Cities, Areas) ───────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  // Validate the request came through Shopify's app proxy
  await authenticate.public.appProxy(request);

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
    const body = await request.json();

    // Server-side validation
    const validation = validateQistOrder(body);
    if (!validation.valid) {
      return data(
        { success: false, errors: validation.errors },
        { status: 422 }
      );
    }

    // Extract real IP (Shopify passes it via x-forwarded-for)
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "0.0.0.0";

    // Build the QistBazaar payload
    const payload = {
      name: body.name,
      cnic: body.cnic,
      address: body.address,
      area: body.area,
      areaID: Number(body.areaID),
      city: body.city,
      cartDiscountTotal: Number(body.cartDiscountTotal) || 0,
      ipAddress,
      creditCheck: body.creditCheck || "",
      phoneNo: body.phoneNo,
      alternativePhoneNo: body.alternativePhoneNo || "",
      email: body.email,
      orderNote: body.orderNote || "Shopify QistBazaar order",
      orderSource: "shopify",
      purchaseSource: "shopify_store",
      couponID: body.couponID || null,
      productCost: Number(body.productCost),
      orderItems: body.orderItems.map((item: any) => ({
        installmentAmount: Number(item.installmentAmount),
        advanceAmount: Number(item.advanceAmount),
        productName: item.productName,
        itemCode: item.itemCode,
        month: Number(item.month),
      })),
    };

    const result = await createQistOrder(payload);

    return data({ success: true, result });
  } catch (err: any) {
    console.error("[QistBazaar API action]", err);
    return data(
      { success: false, error: err.message || "Order submission failed" },
      { status: 500 }
    );
  }
}
