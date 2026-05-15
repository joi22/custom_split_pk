/**
 * App Proxy root route — /apps/qistbazaar
 *
 * Shopify proxies any request under /apps/qistbazaar to this app.
 * The root path itself just redirects to checkout so it is never a dead end.
 */

import { redirect, type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.public.appProxy(request);

  // Redirect bare root hits to the checkout page
  return redirect("/apps/qistbazaar/checkout");
}
