const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceKey) return res.status(500).send("Webhook not configured");

  const stripe = new Stripe(stripeKey);
  const rawBody = await readRawBody(req);
  const signature = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    await supabase.from("orders").update({
      payment_status: session.payment_status || "paid",
      status: "Paid",
      updated_at: new Date().toISOString()
    }).eq("payment_reference", session.id);
  }
  if (event.type === "checkout.session.expired") {
    const session = event.data.object;
    await supabase.from("orders").update({
      payment_status: "expired",
      status: "Expired",
      updated_at: new Date().toISOString()
    }).eq("payment_reference", session.id);
  }
  return res.status(200).json({ received: true });
};
