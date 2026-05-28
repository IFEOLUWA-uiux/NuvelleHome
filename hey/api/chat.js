const { createClient } = require("@supabase/supabase-js");

function parseBody(req) {
  if (typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

function client() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

module.exports = async function handler(req, res) {
  const supabase = client();
  if (!supabase) return res.status(500).json({ error: "Chat is not configured yet." });

  if (req.method === "GET") {
    const threadId = req.query.thread_id;
    if (!threadId) return res.status(400).json({ error: "Missing thread." });
    const { data, error } = await supabase.from("chat_messages").select("*").eq("thread_id", threadId).order("created_at", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ messages: data || [] });
  }

  if (req.method === "POST") {
    const body = parseBody(req);
    if (!body.thread_id || !body.message) return res.status(400).json({ error: "Missing message." });
    const { error } = await supabase.from("chat_messages").insert([{
      thread_id: body.thread_id,
      sender: "customer",
      customer_name: body.name || "",
      customer_email: body.email || "",
      message: body.message,
      page_url: body.page_url || ""
    }]);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
