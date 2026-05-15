import { useEffect, useState } from "react";
import { data, type LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

interface QistProduct {
  productId: string;
  variantId: string;
  title: string;
  price: string | number;
  sku: string;
  image?: string;
}

interface City {
  cityID: number | string;
  cityName: string;
}

interface Area {
  areaID: number | string;
  areaName: string;
  cityName: string;
}

interface EmiPlan {
  noOfMonths: number;
  totalPrice: number;
  advanceAmount: number;
  amountPerMonth: number;
}

interface FormState {
  name: string;
  email: string;
  phoneNo: string;
  alternativePhoneNo: string;
  cnic: string;
  address: string;
  city: string;
  cityID: string;
  area: string;
  areaID: string;
}

interface OrderSuccess {
  message: string;
  orderID: number;
  EcibStatus: string;
  EcibStatusCode: string;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  return data({
    productId: url.searchParams.get("product_id"),
    variantId: url.searchParams.get("variant_id"),
  });
}

export default function QistBazaarCheckout() {
  const { productId, variantId } = useLoaderData<typeof loader>();

  const [product, setProduct] = useState<QistProduct | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [plans, setPlans] = useState<EmiPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<EmiPlan | null>(null);
  const [success, setSuccess] = useState<OrderSuccess | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState<FormState>({
    name: "", email: "", phoneNo: "", alternativePhoneNo: "",
    cnic: "", address: "", city: "", cityID: "", area: "", areaID: "",
  });

  useEffect(() => {
    const stored = sessionStorage.getItem("qistbazaarProduct");
    if (stored) {
      const parsed = JSON.parse(stored) as QistProduct;
      setProduct(parsed);
      loadEmi(parsed.price);
    }
    loadCities();
  }, []);

  async function loadCities() {
    const res = await fetch("/apps/qistbazaar/api?action=cities");
    const result = await res.json();
    if (result.success) setCities(result.data?.data || []);
  }

  async function loadAreas(cityName: string) {
    const res = await fetch(`/apps/qistbazaar/api?action=areas&cityName=${encodeURIComponent(cityName)}`);
    const result = await res.json();
    if (result.success) setAreas(result.data || []);
  }

  async function loadEmi(productCost: string | number) {
    const res = await fetch(`/apps/qistbazaar/api?action=emi&productCost=${encodeURIComponent(productCost)}`);
    const result = await res.json();
    if (result.success) setPlans(Array.isArray(result.data) ? result.data : []);
  }

  function updateField(name: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name || form.name.trim().length < 3) e.name = "Name must be at least 3 characters.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Valid email is required.";
    if (!/^03\d{9}$/.test(form.phoneNo)) e.phoneNo = "Phone must start with 03 and be 11 digits.";
    if (form.alternativePhoneNo && !/^03\d{9}$/.test(form.alternativePhoneNo)) e.alternativePhoneNo = "Alt phone must start with 03 and be 11 digits.";
    if (!/^\d{13}$/.test(form.cnic)) e.cnic = "CNIC must be 13 digits (no dashes).";
    if (!form.address || form.address.trim().length < 10) e.address = "Address must be at least 10 characters.";
    if (!form.cityID) e.city = "Please select a city.";
    if (!form.areaID) e.area = "Please select an area.";
    if (!selectedPlan) e.plan = "Please select an EMI plan.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submitOrder() {
    if (!validate() || !product || !selectedPlan) return;
    setSubmitting(true);

    const payload = {
      name: form.name, email: form.email, phoneNo: form.phoneNo,
      alternativePhoneNo: form.alternativePhoneNo, cnic: form.cnic,
      address: form.address, city: form.city, area: form.area,
      areaID: Number(form.areaID), productCost: Number(product.price),
      cartDiscountTotal: 0, orderNote: "Shopify QistBazaar order",
      orderSource: "shopify", purchaseSource: "shopify_store", couponID: null,
      orderItems: [{
        installmentAmount: Number(selectedPlan.amountPerMonth),
        advanceAmount: Number(selectedPlan.advanceAmount),
        productName: product.title,
        itemCode: product.sku,
        month: Number(selectedPlan.noOfMonths),
      }],
    };

    const res = await fetch("/apps/qistbazaar/api?action=order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    setSubmitting(false);

    if (result.success) {
      setSuccess(result.result);
    } else {
      setErrors({ submit: result.error || "Order submission failed." });
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────
  if (success) {
    const isDefaulter = success.EcibStatusCode === "ECIB-400";
    return (
      <div className="qist-page">
        <div className="qist-card">
          {isDefaulter ? (
            <>
              <div className="qist-status-icon qist-status-fail">✕</div>
              <h1>Order Cannot Be Processed</h1>
              <p className="qist-status-msg error">
                Sorry, your order cannot be processed for installment at this time.
              </p>
            </>
          ) : (
            <>
              <div className="qist-status-icon qist-status-ok">✓</div>
              <h1>Order Submitted!</h1>
              <p className="qist-status-msg">
                Your installment order has been submitted to QistBazaar.
              </p>
              <div className="qist-order-details">
                <p><strong>Order ID:</strong> {success.orderID}</p>
                <p><strong>Status:</strong> {success.EcibStatus}</p>
              </div>
              <p className="qist-contact-note">
                QistBazaar team will contact you for verification.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Main checkout form ──────────────────────────────────────────────────
  return (
    <div className="qist-page">
      <style>{INLINE_CSS}</style>
      <div className="qist-card">
        <div className="qist-header">
          <h1>QistBazaar Installments</h1>
          <p className="qist-subtitle">Complete your installment application below</p>
        </div>

        {product && (
          <div className="qist-product">
            {product.image && (
              <img src={product.image} alt={product.title} className="qist-product-img" />
            )}
            <div className="qist-product-info">
              <strong>{product.title}</strong>
              <span className="qist-price">Rs. {Number(product.price).toLocaleString()}</span>
            </div>
          </div>
        )}

        <section className="qist-section">
          <h3>Customer Information</h3>

          <div className="qist-field">
            <label>Full Name *</label>
            <input placeholder="e.g. Ali Hassan" value={form.name}
              onChange={(e) => updateField("name", e.target.value)} />
            {errors.name && <p className="error">{errors.name}</p>}
          </div>

          <div className="qist-field">
            <label>Email Address *</label>
            <input type="email" placeholder="you@email.com" value={form.email}
              onChange={(e) => updateField("email", e.target.value)} />
            {errors.email && <p className="error">{errors.email}</p>}
          </div>

          <div className="qist-row">
            <div className="qist-field">
              <label>Phone Number *</label>
              <input placeholder="03XXXXXXXXX" value={form.phoneNo}
                onChange={(e) => updateField("phoneNo", e.target.value)} />
              {errors.phoneNo && <p className="error">{errors.phoneNo}</p>}
            </div>
            <div className="qist-field">
              <label>Alternative Phone</label>
              <input placeholder="03XXXXXXXXX (optional)" value={form.alternativePhoneNo}
                onChange={(e) => updateField("alternativePhoneNo", e.target.value)} />
              {errors.alternativePhoneNo && <p className="error">{errors.alternativePhoneNo}</p>}
            </div>
          </div>

          <div className="qist-field">
            <label>CNIC *</label>
            <input placeholder="13 digits without dashes" value={form.cnic} maxLength={13}
              onChange={(e) => updateField("cnic", e.target.value.replace(/\D/g, ""))} />
            {errors.cnic && <p className="error">{errors.cnic}</p>}
          </div>

          <div className="qist-field">
            <label>Full Address *</label>
            <input placeholder="House No, Street, Block, Area..." value={form.address}
              onChange={(e) => updateField("address", e.target.value)} />
            {errors.address && <p className="error">{errors.address}</p>}
          </div>

          <div className="qist-row">
            <div className="qist-field">
              <label>City *</label>
              <select value={form.cityID}
                onChange={(e) => {
                  const opt = e.target.selectedOptions[0];
                  updateField("cityID", e.target.value);
                  updateField("city", opt.text);
                  updateField("areaID", "");
                  updateField("area", "");
                  setAreas([]);
                  if (e.target.value) loadAreas(opt.text);
                }}>
                <option value="">Select City</option>
                {cities.map((c) => (
                  <option key={c.cityID} value={c.cityID}>{c.cityName}</option>
                ))}
              </select>
              {errors.city && <p className="error">{errors.city}</p>}
            </div>

            <div className="qist-field">
              <label>Area *</label>
              <select value={form.areaID}
                onChange={(e) => {
                  const opt = e.target.selectedOptions[0];
                  updateField("areaID", e.target.value);
                  updateField("area", opt.text);
                }}>
                <option value="">Select Area</option>
                {areas.map((a) => (
                  <option key={a.areaID} value={a.areaID}>{a.areaName}</option>
                ))}
              </select>
              {errors.area && <p className="error">{errors.area}</p>}
            </div>
          </div>
        </section>

        <section className="qist-section">
          <h3>Select EMI Plan *</h3>
          {plans.length === 0 && (
            <p className="qist-loading">Loading installment plans…</p>
          )}
          <div className="qist-plans">
            {plans.map((plan, i) => (
              <button type="button" key={i}
                className={`qist-plan${selectedPlan?.noOfMonths === plan.noOfMonths ? " selected" : ""}`}
                onClick={() => setSelectedPlan(plan)}>
                <span className="plan-months">{plan.noOfMonths} Months</span>
                <span className="plan-monthly">Rs. {Number(plan.amountPerMonth).toLocaleString()} / mo</span>
                <span className="plan-advance">Rs. {Number(plan.advanceAmount).toLocaleString()} upfront</span>
                <span className="plan-total">Total: Rs. {Number(plan.totalPrice).toLocaleString()}</span>
              </button>
            ))}
          </div>
          {errors.plan && <p className="error">{errors.plan}</p>}
        </section>

        {errors.submit && <p className="error qist-submit-error">{errors.submit}</p>}

        <button type="button" className="submit-btn" onClick={submitOrder} disabled={submitting}>
          {submitting ? "Submitting…" : "Proceed with Installment"}
        </button>
      </div>
    </div>
  );
}

// Inline CSS so the page is self-contained when served via app proxy
const INLINE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

.qist-page {
  font-family: 'Inter', sans-serif;
  background: linear-gradient(135deg, #f0f4ff 0%, #fafafa 100%);
  min-height: 100vh;
  padding: 32px 16px;
}

.qist-card {
  max-width: 720px;
  margin: 0 auto;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
  overflow: hidden;
}

.qist-header {
  background: linear-gradient(135deg, #008080, #005f5f);
  color: white;
  padding: 32px 36px 28px;
  text-align: center;
}
.qist-header h1 { font-size: 28px; font-weight: 700; margin-bottom: 6px; }
.qist-subtitle { font-size: 14px; opacity: 0.85; }

.qist-product {
  display: flex; align-items: center; gap: 16px;
  padding: 20px 36px; border-bottom: 1px solid #f0f0f0; background: #fafbff;
}
.qist-product-img { width: 80px; height: 80px; object-fit: cover; border-radius: 8px; }
.qist-product-info { display: flex; flex-direction: column; gap: 4px; }
.qist-product-info strong { font-size: 15px; font-weight: 600; color: #111; }
.qist-price { font-size: 20px; font-weight: 700; color: #008080; }

.qist-section { padding: 28px 36px; border-bottom: 1px solid #f0f0f0; }
.qist-section h3 { font-size: 16px; font-weight: 600; color: #333; margin-bottom: 18px; }

.qist-field { margin-bottom: 14px; }
.qist-field label { display: block; font-size: 13px; font-weight: 500; color: #555; margin-bottom: 6px; }
.qist-field input, .qist-field select {
  width: 100%; padding: 11px 14px; border: 1.5px solid #ddd; border-radius: 8px;
  font-size: 14px; font-family: inherit; color: #111; transition: border-color 0.2s;
  background: #fff;
}
.qist-field input:focus, .qist-field select:focus {
  outline: none; border-color: #008080; box-shadow: 0 0 0 3px rgba(0,128,128,0.1);
}

.qist-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

.error { color: #e03e3e; font-size: 12px; margin-top: 4px; }
.qist-submit-error { padding: 0 36px; margin-bottom: 12px; text-align: center; font-size: 14px; }

.qist-loading { color: #888; font-size: 14px; }

.qist-plans { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.qist-plan {
  display: flex; flex-direction: column; gap: 4px; text-align: left;
  background: #fff; border: 2px solid #e8e8e8; border-radius: 10px;
  padding: 16px; cursor: pointer; transition: border-color 0.2s, box-shadow 0.2s;
  font-family: inherit;
}
.qist-plan:hover { border-color: #008080; }
.qist-plan.selected { border-color: #008080; background: #f0fafa; box-shadow: 0 0 0 3px rgba(0,128,128,0.12); }
.plan-months { font-size: 15px; font-weight: 700; color: #008080; }
.plan-monthly { font-size: 13px; font-weight: 600; color: #111; }
.plan-advance { font-size: 12px; color: #555; }
.plan-total { font-size: 11px; color: #888; }

.submit-btn {
  display: block; width: calc(100% - 72px); margin: 28px 36px;
  background: linear-gradient(135deg, #008080, #005f5f);
  color: white; border: none; padding: 15px; border-radius: 10px;
  font-size: 16px; font-weight: 600; cursor: pointer; font-family: inherit;
  transition: opacity 0.2s, transform 0.1s;
}
.submit-btn:hover:not(:disabled) { opacity: 0.92; transform: translateY(-1px); }
.submit-btn:disabled { opacity: 0.55; cursor: not-allowed; }

.qist-status-icon {
  width: 72px; height: 72px; border-radius: 50%; display: flex;
  align-items: center; justify-content: center; font-size: 32px;
  margin: 36px auto 20px;
}
.qist-status-ok { background: #e6f7f0; color: #008040; }
.qist-status-fail { background: #fdecea; color: #c0392b; }

.qist-card h1 { text-align: center; padding: 0 36px; font-size: 24px; color: #111; }
.qist-status-msg { text-align: center; padding: 10px 36px; font-size: 15px; color: #444; }
.qist-status-msg.error { color: #c0392b; }
.qist-order-details { background: #f5fafa; border: 1px solid #d0eded; border-radius: 10px; margin: 20px 36px; padding: 16px 20px; }
.qist-order-details p { font-size: 14px; color: #333; padding: 4px 0; }
.qist-contact-note { text-align: center; padding: 0 36px 36px; font-size: 13px; color: #888; }

@media (max-width: 640px) {
  .qist-plans { grid-template-columns: 1fr; }
  .qist-row { grid-template-columns: 1fr; }
  .qist-section { padding: 20px 20px; }
  .qist-product { padding: 16px 20px; }
  .submit-btn { width: calc(100% - 40px); margin: 20px; }
  .qist-header { padding: 24px 20px; }
}
`;
