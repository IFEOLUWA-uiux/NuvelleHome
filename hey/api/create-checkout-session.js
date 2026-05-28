const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

function parseBody(req) {
  if (typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

function priceFor(product) {
  const base = Number(product.price || 0);
  const sale = Number(product.sale_price || 0);
  return sale > 0 && sale < base ? sale : base;
}

function customerName(body) {
  return [body.first_name, body.last_name].filter(Boolean).join(" ").trim();
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const siteUrl = process.env.SITE_URL || "https://nuvellhome.vercel.app";

  if (!stripeKey || !supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: "Checkout is not configured yet." });
  }

  const body = parseBody(req);
  const cartItems = Array.isArray(body.items) ? body.items : [];
  if (!cartItems.length) return res.status(400).json({ error: "Your cart is empty." });

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const stripe = new Stripe(stripeKey);

  const ids = cartItems.map(item => item.id).filter(Boolean);
  const slugs = cartItems.map(item => item.slug).filter(Boolean);
  let productRows = [];
  if (ids.length) {
    const { data, error } = await supabase.from("products").select("*").in("id", ids);
    if (error) return res.status(500).json({ error: error.message });
    productRows = productRows.concat(data || []);
  }
  if (slugs.length) {
    const { data, error } = await supabase.from("products").select("*").in("slug", slugs);
    if (error) return res.status(500).json({ error: error.message });
    productRows = productRows.concat(data || []);
  }

  const byKey = new Map();
  productRows.forEach(product => {
    byKey.set(String(product.id), product);
    if (product.slug) byKey.set(product.slug, product);
  });

  const lineItems = [];
  const orderItems = [];
  for (const item of cartItems) {
    const product = byKey.get(String(item.id || "")) || byKey.get(String(item.slug || ""));
    if (!product || product.published === false) continue;
    const quantity = Math.max(1, Number(item.quantity || 1));
    const unitPrice = priceFor(product);
    if (!unitPrice) continue;
    lineItems.push({
      quantity,
      price_data: {
        currency: "usd",
        unit_amount: Math.round(unitPrice * 100),
        product_data: {
          name: product.name || "Nuvelle Home item",
          images: product.image_url ? [product.image_url] : undefined,
          metadata: { product_id: String(product.id), sku: product.sku || "" }
        }
      }
    });
    orderItems.push({
      id: product.id,
      slug: product.slug,
      sku: product.sku,
      name: product.name,
      unit_price: unitPrice,
      quantity,
      final_sale: Boolean(product.is_clearance || product.final_sale)
    });
  }

  if (!lineItems.length) return res.status(400).json({ error: "No available products were found in the cart." });

  const deliveryFee = Math.max(0, Number(body.delivery_fee || 0));
  if (deliveryFee > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: Math.round(deliveryFee * 100),
        product_data: { name: body.white_glove ? "White-glove delivery" : "Delivery" }
      }
    });
  }

  const subtotal = orderItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const total = subtotal + deliveryFee;
  const name = customerName(body);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    customer_email: body.email || undefined,
    phone_number_collection: { enabled: true },
    billing_address_collection: "required",
    shipping_address_collection: { allowed_countries: ["US"] },
    automatic_payment_methods: { enabled: true },
    success_url: `${siteUrl}/order-success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/cart.html`,
    metadata: {
      customer_name: name,
      customer_phone: body.phone || "",
      delivery_method: body.delivery_method || "delivery",
      delivery_zip: body.zip || "",
      preferred_date: body.preferred_date || "",
      white_glove: String(Boolean(body.white_glove))
    }
  });

  await supabase.from("orders").insert([{
    customer_name: name,
    customer_email: body.email || "",
    customer_phone: body.phone || "",
    delivery_address: [body.address, body.city, body.state, body.zip, body.country].filter(Boolean).join(", "),
    delivery_method: body.delivery_method || "delivery",
    delivery_zip: body.zip || "",
    preferred_date: body.preferred_date || null,
    delivery_fee: deliveryFee,
    white_glove: Boolean(body.white_glove),
    notes: body.notes || "",
    items: orderItems,
    subtotal,
    total,
    currency: "USD",
    provider: "stripe",
    payment_reference: session.id,
    payment_status: "pending",
    status: "Payment pending"
  }]);

  return res.status(200).json({ url: session.url });
};
