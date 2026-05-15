/**
 * QistBazaar Widget — storefront JavaScript
 * Runs on the product page. No credentials here.
 * Passes product data to sessionStorage and redirects to the Shopify checkout page.
 */

(function () {
  "use strict";

  function initWidgets() {
    var widgets = document.querySelectorAll(".qistbazaar-widget");

    widgets.forEach(function (widget) {
      var button = widget.querySelector(".qistbazaar-buy-button");
      var warning = widget.querySelector(".qistbazaar-no-sku-warning");

      if (!button) return;

      // Warn immediately if SKU is missing
      var sku = widget.dataset.sku;
      if (!sku || sku.trim() === "") {
        if (warning) warning.style.display = "block";
        button.disabled = true;
        button.style.opacity = "0.5";
        button.style.cursor = "not-allowed";
        return;
      }

      button.addEventListener("click", function () {
        var productData = {
          productId: widget.dataset.productId,
          variantId: widget.dataset.variantId,
          title: widget.dataset.title,
          price: widget.dataset.price,
          sku: widget.dataset.sku,
          image: widget.dataset.image || "",
        };

        // Store product info for the checkout form page
        try {
          sessionStorage.setItem("qistbazaarProduct", JSON.stringify(productData));
        } catch (e) {
          console.error("[QistBazaar] sessionStorage write failed:", e);
        }

        // Redirect to the Shopify page that has the checkout form block
        window.location.href = "/pages/qistbazaar-checkout";
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWidgets);
  } else {
    initWidgets();
  }
})();
