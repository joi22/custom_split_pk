/**
 * Server-side validation for QistBazaar order payloads.
 * This runs on the backend so the browser cannot bypass it.
 */

/**
 * Validate a QistBazaar order input object.
 * @param {object} input
 * @returns {{ valid: boolean, errors: object }}
 */
export function validateQistOrder(input) {
  const errors = {};

  if (!input) {
    return {
      valid: false,
      errors: { _global: "Invalid request payload." }
    };
  }

  // Name
  if (!input.name || input.name.trim().length < 3) {
    errors.name = "Name is required and must be at least 3 characters.";
  }

  // Email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email || "")) {
    errors.email = "Valid email address is required.";
  }

  // Primary phone  — must start with 03, exactly 11 digits
  if (!/^03\d{9}$/.test(input.phoneNo || "")) {
    errors.phoneNo =
      "Phone number must start with 03 and be exactly 11 digits.";
  }

  // Alternative phone (optional, but if provided must be valid)
  if (
    input.alternativePhoneNo &&
    !/^03\d{9}$/.test(input.alternativePhoneNo)
  ) {
    errors.alternativePhoneNo =
      "Alternative phone must start with 03 and be exactly 11 digits.";
  }

  // CNIC — exactly 13 numeric digits
  if (!/^\d{13}$/.test(input.cnic || "")) {
    errors.cnic = "CNIC must be exactly 13 numeric digits (no dashes).";
  }

  // Address — at least 10 characters
  if (!input.address || input.address.trim().length < 10) {
    errors.address = "Address must be at least 10 characters.";
  }

  // City
  if (!input.city || input.city.trim() === "") {
    errors.city = "City is required.";
  }

  // Product cost
  if (!input.productCost || Number(input.productCost) <= 0) {
    errors.productCost = "Product cost must be a positive number.";
  }

  // Order items
  if (!Array.isArray(input.orderItems) || input.orderItems.length === 0) {
    errors.orderItems = "At least one order item is required.";
  } else {
    const item = input.orderItems[0];

    if (!item.productName || item.productName.trim() === "") {
      errors.productName = "Product name is required in order item.";
    }
    if (!item.itemCode || item.itemCode.trim() === "") {
      errors.itemCode =
        "Item code (SKU) is required in order item. Please ensure the product has a SKU set.";
    }
    if (!item.installmentAmount || Number(item.installmentAmount) <= 0) {
      errors.installmentAmount = "Installment amount must be a positive number.";
    }
    if (!item.advanceAmount || Number(item.advanceAmount) < 0) {
      errors.advanceAmount = "Advance amount must be a non-negative number.";
    }
    if (!item.month || Number(item.month) <= 0) {
      errors.month = "Number of months must be a positive integer.";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
