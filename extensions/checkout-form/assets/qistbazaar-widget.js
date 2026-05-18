/**
 * QistBazaar Widget — storefront JavaScript
 * Runs on the product page. Handles variant selection and inventory checks.
 */

(function () {
  "use strict";

  function initWidgets() {
    var widgets = document.querySelectorAll(".qistbazaar-widget");

    widgets.forEach(function (widget) {
      var button = widget.querySelector(".qistbazaar-buy-button");
      var warning = widget.querySelector(".qistbazaar-no-sku-warning");
      var handle = widget.dataset.handle;
      var productJson = null;

      if (!button || !handle) return;

      // 1. Fetch full product JSON to have variant details (including inventory)
      fetch("/products/" + handle + ".js")
        .then(function (r) { return r.json(); })
        .then(function (data) {
          productJson = data;
          updateWidgetState();
          listenForVariantChanges();
        })
        .catch(function (e) {
          console.error("[QistBazaar] Failed to load product JSON:", e);
        });

      function updateWidgetState() {
        if (!productJson) return;

        // Find the variant ID from the URL or fallback to the current data-variant-id
        var urlParams = new URLSearchParams(window.location.search);
        var variantId = urlParams.get("variant") || widget.dataset.variantId;
        
        var variant = productJson.variants.find(function (v) {
          return v.id.toString() === variantId.toString();
        });

        if (!variant) {
          // Fallback to first variant if not found
          variant = productJson.variants[0];
        }

        if (variant) {
          // Update widget data attributes
          widget.dataset.variantId = variant.id;
          widget.dataset.price = (variant.price / 100).toFixed(2);
          widget.dataset.sku = variant.sku || "";
          if (variant.featured_image) {
            widget.dataset.image = variant.featured_image.src;
          }

          // Check availability (inventory check)
          var isAvailable = variant.available;
          var hasSku = variant.sku && variant.sku.trim() !== "";

          if (!isAvailable) {
            button.disabled = true;
            button.style.opacity = "0.5";
            button.textContent = "Out of Stock";
            if (warning) warning.style.display = "none";
          } else if (!hasSku) {
            button.disabled = true;
            button.style.opacity = "0.5";
            button.textContent = widget.dataset.originalText || button.textContent;
            if (warning) warning.style.display = "block";
          } else {
            button.disabled = false;
            button.style.opacity = "1";
            button.textContent = widget.dataset.originalText || button.textContent;
            if (warning) warning.style.display = "none";
          }
        }
      }

      function listenForVariantChanges() {
        // Most Shopify themes update the URL when a variant changes
        // We can listen to popstate or just check periodically, 
        // but a more robust way is to watch for changes in the variant ID input.
        var variantInput = document.querySelector('input[name="id"]');
        if (variantInput) {
          var observer = new MutationObserver(function() {
            updateWidgetState();
          });
          // Some themes change the value attribute, some change the property
          observer.observe(variantInput, { attributes: true });
          variantInput.addEventListener('change', updateWidgetState);
        }

        // Also listen for URL changes (common in modern themes)
        window.addEventListener('popstate', updateWidgetState);
        
        // Intercept pushState/replaceState as well
        var originalPushState = history.pushState;
        history.pushState = function() {
          originalPushState.apply(this, arguments);
          updateWidgetState();
        };
      }

      // Store original button text if not already stored
      if (!widget.dataset.originalText) {
        widget.dataset.originalText = button.textContent;
      }

      button.addEventListener("click", function () {
        if (button.disabled) return;

        var productData = {
          productId: widget.dataset.productId,
          variantId: widget.dataset.variantId,
          title: widget.dataset.title,
          price: widget.dataset.price,
          sku: widget.dataset.sku,
          image: widget.dataset.image || "",
        };

        try {
          sessionStorage.setItem("qistbazaarProduct", JSON.stringify(productData));
          window.location.href = "/pages/qistbazaar-checkout";
        } catch (e) {
          console.error("[QistBazaar] sessionStorage write failed:", e);
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWidgets);
  } else {
    initWidgets();
  }
})();
