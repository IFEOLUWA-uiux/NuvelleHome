(function () {
  const cfg = window.NUVELLE_CONFIG;
  const STORAGE_BUCKET = "product-media";
  const state = { products: [], collections: [], journals: [], orders: [], messages: [], showcaseImages: { categories: {}, subcategories: {}, about: {} }, page: "dashboard", search: "", filter: "all" };
  const storefrontCacheKeys = ["nuvelle-products-cache-v1", "nuvelle-collections-cache-v1", "nuvelle-journal-cache-v1", "nuvelle-settings-cache-v1"];
  let sb = null;

  function $(id) { return document.getElementById(id); }
  function q(selector, root = document) { return root.querySelector(selector); }
  function qa(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }
  function asArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (value && typeof value === "object") return Object.values(value).filter(Boolean);
    return String(value || "").split(",").map(item => item.trim()).filter(Boolean);
  }
  function slugify(value) {
    return String(value || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
  }
  function money(value) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value || 0));
  }
  function categoryLabel(slug) {
    const cat = cfg.categories.find(item => item.slug === slug || item.name.toLowerCase() === String(slug || "").toLowerCase());
    return cat ? cat.name : String(slug || "Furniture").replace(/-/g, " ");
  }
  function defaultShowcaseImages() {
    return { categories: {}, subcategories: {}, about: {} };
  }
  function normalizeShowcaseImages(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      categories: source.categories && typeof source.categories === "object" ? source.categories : {},
      subcategories: source.subcategories && typeof source.subcategories === "object" ? source.subcategories : {},
      about: source.about && typeof source.about === "object" ? source.about : {}
    };
  }
  function showToast(message, error = false) {
    let toast = q("[data-admin-toast]");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      toast.dataset.adminToast = "true";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.background = error ? "var(--danger)" : "var(--ink)";
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
  }
  function setupSupabase() {
    if (!window.supabase) return null;
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    return sb;
  }
  function clearStorefrontCache() {
    storefrontCacheKeys.forEach(key => {
      try { sessionStorage.removeItem(key); } catch {}
      try { localStorage.removeItem(key); } catch {}
    });
  }
  function productImage(p) {
    const gallery = asArray(p.gallery_images || p.images);
    return p.image_url || gallery[0] || "nuvelle-showroom-branded-v2.jpg";
  }
  function isClearance(p) { return Boolean(p.is_clearance || p.clearance_reason || p.category === "clearance"); }
  function currentPrice(p) {
    const sale = Number(p.sale_price || 0);
    const price = Number(p.price || 0);
    return sale > 0 && sale < price ? sale : price;
  }
  function setupCategories() {
    const options = cfg.categories.map(cat => `<option value="${cat.slug}">${escapeHtml(cat.name)}</option>`).join("");
    $("fCategory").innerHTML = options;
    $("cCategory").innerHTML = options;
    populateSubcategories();
  }
  function populateSubcategories(active = "") {
    const category = cfg.categories.find(cat => cat.slug === $("fCategory")?.value) || cfg.categories[0];
    const values = category?.subcategories || [];
    const extra = active && !values.includes(active) ? [`<option value="${escapeHtml(active)}">${escapeHtml(active)}</option>`] : [];
    $("fSubcategory").innerHTML = [`<option value="">Use category only</option>`]
      .concat(values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`), extra)
      .join("");
    $("fSubcategory").value = active || "";
  }
  function populateCollectionOptions(active = "") {
    const options = state.collections
      .filter(collection => collection.published !== false)
      .map(collection => `<option value="${escapeHtml(collection.slug)}">${escapeHtml(collection.title)}</option>`)
      .join("");
    $("fCollectionSlug").innerHTML = `<option value="">No collection</option>${options}`;
    $("fCollectionSlug").value = active || "";
  }
  function switchPage(page) {
    state.page = page;
    qa(".admin-page").forEach(el => el.classList.toggle("active", el.id === `page-${page}`));
    qa("[data-admin-page]").forEach(btn => btn.classList.toggle("active", btn.dataset.adminPage === page));
    $("pageTitle").textContent = ({ dashboard: "Dashboard", products: "Products", "product-form": "Product Editor", collections: "Collections", journal: "Journal", showcase: "Showcase Images", orders: "Orders", messages: "Messages", settings: "Delivery Rules" })[page] || page;
    if (page === "product-form" && !$("fId").value) resetProductForm();
    if (page === "collections") renderCollections();
    if (page === "journal") renderJournals();
    if (page === "showcase") renderShowcaseImages();
    if (page === "settings") renderDeliverySettings();
  }
  function setAuthed(session) {
    $("loginScreen").classList.toggle("hidden", Boolean(session));
    $("adminShell").classList.toggle("hidden", !session);
    $("adminUser").textContent = session?.user?.email || "Not signed in";
    if (session) refreshAll();
  }

  async function refreshAll() {
    await Promise.allSettled([loadProducts(), loadCollections(), loadJournals(), loadShowcaseImages(), loadOrders(), loadMessages()]);
    renderDashboard();
  }
  async function loadProducts() {
    const { data, error } = await sb.from("products").select("*").order("created_at", { ascending: false });
    if (error) {
      state.products = [];
      renderProducts();
      showToast(error.message || "Products could not load.", true);
      return;
    }
    state.products = data || [];
    renderProducts();
  }
  async function loadCollections() {
    const { data, error } = await sb.from("collections").select("*").order("sort_order", { ascending: true });
    if (error) {
      state.collections = [];
      renderCollections();
      populateCollectionOptions();
      return;
    }
    state.collections = data || [];
    renderCollections();
    populateCollectionOptions($("fCollectionSlug")?.value || "");
  }
  async function loadJournals() {
    const { data, error } = await sb.from("journal_posts").select("*").order("sort_order", { ascending: true });
    if (error) {
      state.journals = [];
      renderJournals();
      return;
    }
    state.journals = data || [];
    renderJournals();
  }
  async function loadShowcaseImages() {
    const { data, error } = await sb.from("site_settings").select("value").eq("setting_key", "showcase_images").maybeSingle();
    state.showcaseImages = error ? defaultShowcaseImages() : normalizeShowcaseImages(data?.value);
    renderShowcaseImages();
  }
  async function loadOrders() {
    const { data, error } = await sb.from("orders").select("*").order("created_at", { ascending: false }).limit(100);
    state.orders = error ? [] : (data || []);
    renderOrders();
  }
  async function loadMessages() {
    const { data, error } = await sb.from("chat_messages").select("*").order("created_at", { ascending: false }).limit(120);
    state.messages = error ? [] : (data || []);
    renderMessages();
  }
  function renderDashboard() {
    $("statProducts").textContent = state.products.length;
    $("statClearance").textContent = state.products.filter(isClearance).length;
    $("statCollections").textContent = state.collections.length;
    if ($("statJournals")) $("statJournals").textContent = state.journals.filter(item => item.published !== false).length;
    $("statOrders").textContent = state.orders.length;
    $("statMessages").textContent = state.messages.filter(msg => msg.sender !== "admin").length;
  }
  function filteredProducts() {
    const query = state.search.toLowerCase().trim();
    return state.products.filter(product => {
      const matchesQuery = !query || [product.name, product.sku, product.brand, product.category, product.subcategory, product.style, product.collection_slug, product.materials].join(" ").toLowerCase().includes(query);
      const matchesFilter =
        state.filter === "all" ||
        (state.filter === "clearance" && isClearance(product)) ||
        (state.filter === "published" && product.published !== false) ||
        (state.filter === "draft" && product.published === false);
      return matchesQuery && matchesFilter;
    });
  }
  function renderProducts() {
    const list = filteredProducts();
    $("productsBody").innerHTML = list.length ? list.map(p => `
      <tr>
        <td><img class="admin-thumb" src="${escapeHtml(productImage(p))}" alt=""></td>
        <td><strong>${escapeHtml(p.name || "Untitled")}</strong><div class="muted small">${escapeHtml(p.sku || "-")} / ${escapeHtml(p.brand || "Nuvelle Home")}</div><div class="muted small">${escapeHtml(categoryLabel(p.category))}${p.subcategory ? ` / ${escapeHtml(p.subcategory)}` : ""}${p.collection_slug ? ` / ${escapeHtml(p.collection_slug)}` : ""}</div></td>
        <td><strong>${money(currentPrice(p))}</strong>${p.sale_price ? `<div class="muted small">Regular ${money(p.price)}</div>` : ""}</td>
        <td>${isClearance(p) ? `<span class="status-pill sale">Final Sale</span><div class="muted small">${escapeHtml(p.clearance_reason || "")}</div>` : `<span class="status-pill">No</span>`}</td>
        <td>${Number(p.stock_quantity ?? 0) || "-"} ${p.in_stock === false ? `<span class="status-pill warn">Out</span>` : ""}</td>
        <td><span class="status-pill ${p.published === false ? "warn" : "good"}">${p.published === false ? "Draft" : "Published"}</span></td>
        <td><button class="btn" data-edit="${escapeHtml(p.id)}">Edit</button></td>
      </tr>`).join("") : `<tr><td colspan="7"><div class="empty">No products found.</div></td></tr>`;
    qa("[data-edit]").forEach(btn => btn.addEventListener("click", () => openProductForm(btn.dataset.edit)));
  }
  function renderCollections() {
    const body = $("collectionsBody");
    if (!body) return;
    body.innerHTML = state.collections.length ? state.collections.map(collection => `
      <tr>
        <td><img class="admin-thumb" src="${escapeHtml(collection.hero_image || "nuvelle-showroom-branded-v2.jpg")}" alt=""></td>
        <td><strong>${escapeHtml(collection.title || "Untitled Collection")}</strong><div class="muted small">${escapeHtml(collection.slug || "-")}</div></td>
        <td>${escapeHtml(categoryLabel(collection.category || "living-room"))}</td>
        <td><span class="status-pill ${collection.published === false ? "warn" : "good"}">${collection.published === false ? "Draft" : "Published"}</span></td>
        <td>${Number(collection.sort_order || 1)}</td>
        <td><button class="btn" data-edit-collection="${escapeHtml(collection.id)}">Edit</button></td>
      </tr>`).join("") : `<tr><td colspan="6"><div class="empty">No collections yet.</div></td></tr>`;
    qa("[data-edit-collection]").forEach(btn => btn.addEventListener("click", () => openCollectionForm(btn.dataset.editCollection)));
  }
  function renderOrders() {
    $("ordersBody").innerHTML = state.orders.length ? state.orders.map(order => `
      <tr>
        <td><strong>#${escapeHtml(String(order.id || "").slice(0, 8))}</strong></td>
        <td><strong>${escapeHtml(order.customer_name || "-")}</strong><div class="muted small">${escapeHtml(order.customer_email || "")}</div></td>
        <td><strong>${money(order.total)}</strong></td>
        <td>${escapeHtml(order.delivery_method || "-")}<div class="muted small">${escapeHtml(order.delivery_zip || "")}${order.preferred_date ? ` / ${escapeHtml(order.preferred_date)}` : ""}</div></td>
        <td>${escapeHtml(order.payment_status || "pending")}</td>
        <td><select class="field" data-order-status="${escapeHtml(order.id)}" style="min-height:36px"><option ${order.status === "Payment pending" ? "selected" : ""}>Payment pending</option><option ${order.status === "Paid" ? "selected" : ""}>Paid</option><option ${order.status === "Preparing" ? "selected" : ""}>Preparing</option><option ${order.status === "Ready for pickup" ? "selected" : ""}>Ready for pickup</option><option ${order.status === "Out for delivery" ? "selected" : ""}>Out for delivery</option><option ${order.status === "Completed" ? "selected" : ""}>Completed</option><option ${order.status === "Cancelled" ? "selected" : ""}>Cancelled</option></select></td>
        <td>${escapeHtml(order.created_at ? new Date(order.created_at).toLocaleDateString() : "-")}</td>
        <td><button class="btn" data-save-order="${escapeHtml(order.id)}">Save</button></td>
      </tr>`).join("") : `<tr><td colspan="8"><div class="empty">No orders yet.</div></td></tr>`;
    qa("[data-save-order]").forEach(btn => btn.addEventListener("click", () => updateOrderStatus(btn.dataset.saveOrder)));
  }
  async function updateOrderStatus(id) {
    const status = q(`[data-order-status="${CSS.escape(id)}"]`)?.value;
    if (!status) return;
    const { error } = await sb.from("orders").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { showToast(error.message, true); return; }
    showToast("Order status updated.");
    await loadOrders();
  }
  function renderMessages() {
    const list = $("messagesList");
    if (!list) return;
    if (!state.messages.length) {
      list.innerHTML = `<div class="empty">No customer messages yet.</div>`;
      return;
    }
    const byThread = new Map();
    state.messages.forEach(message => {
      if (!byThread.has(message.thread_id)) byThread.set(message.thread_id, []);
      byThread.get(message.thread_id).push(message);
    });
    list.innerHTML = Array.from(byThread.entries()).map(([thread, messages]) => {
      const latest = messages[0];
      const customer = messages.find(msg => msg.sender !== "admin") || latest;
      return `<article class="message-card">
        <strong>${escapeHtml(customer.customer_name || "Customer")}</strong>
        <div class="muted small">${escapeHtml(customer.customer_email || "")} / ${escapeHtml(new Date(latest.created_at).toLocaleString())}</div>
        <p>${escapeHtml(latest.message || "")}</p>
        <textarea class="field" placeholder="Reply from Nuvelle Care" data-reply-text="${escapeHtml(thread)}"></textarea>
        <button class="btn btn-primary" data-reply="${escapeHtml(thread)}" style="margin-top:8px">Send Reply</button>
      </article>`;
    }).join("");
    qa("[data-reply]").forEach(btn => btn.addEventListener("click", () => sendReply(btn.dataset.reply)));
  }
  async function sendReply(threadId) {
    const text = q(`[data-reply-text="${CSS.escape(threadId)}"]`)?.value.trim();
    if (!text) return;
    const { error } = await sb.from("chat_messages").insert([{ thread_id: threadId, sender: "admin", message: text }]);
    if (error) { showToast(error.message, true); return; }
    showToast("Reply saved.");
    await loadMessages();
  }
  function resetProductForm() {
    ["fId","fName","fSku","fBrand","fStyle","fPrice","fSalePrice","fCompareAtPrice","fStockQuantity","fImage","fGallery","fVideo","fMaterials","fDimensions","fDescription","fColors","fFeatures","fDeliveryType"].forEach(id => { if ($(id)) $(id).value = ""; });
    $("fBrand").value = "Nuvelle Home";
    $("fCategory").value = "living-room";
    populateSubcategories();
    populateCollectionOptions();
    $("fClearanceReason").value = "";
    $("fPublished").checked = true;
    $("fFeatured").checked = false;
    $("fInStock").checked = true;
    $("fClearance").checked = false;
    $("fPickup").checked = true;
    $("fDelivery").checked = true;
    $("formMode").textContent = "New Product";
    $("formTitle").textContent = "Product details";
    ["heroUpload","galleryUpload","videoUpload"].forEach(id => { if ($(id)) $(id).value = ""; });
  }
  function openProductForm(id) {
    resetProductForm();
    const p = state.products.find(item => String(item.id) === String(id));
    if (!p) return;
    $("fId").value = p.id;
    $("fName").value = p.name || "";
    $("fSku").value = p.sku || "";
    $("fBrand").value = p.brand || "Nuvelle Home";
    $("fCategory").value = p.category || "living-room";
    populateSubcategories(p.subcategory || "");
    populateCollectionOptions(p.collection_slug || "");
    $("fStyle").value = p.style || "";
    $("fPrice").value = p.price || "";
    $("fSalePrice").value = p.sale_price || "";
    $("fCompareAtPrice").value = p.compare_at_price || "";
    $("fStockQuantity").value = p.stock_quantity ?? "";
    $("fClearanceReason").value = p.clearance_reason || "";
    $("fImage").value = p.image_url || "";
    $("fGallery").value = asArray(p.gallery_images || p.images).join(", ");
    $("fVideo").value = p.video_url || "";
    $("fMaterials").value = p.materials || "";
    $("fDimensions").value = p.dimensions || "";
    $("fDescription").value = p.description || "";
    $("fColors").value = asArray(p.colors).join(", ");
    $("fFeatures").value = asArray(p.features).join(", ");
    $("fDeliveryType").value = p.delivery_type || p.delivery || "";
    $("fPublished").checked = p.published !== false;
    $("fFeatured").checked = Boolean(p.featured);
    $("fInStock").checked = p.in_stock !== false;
    $("fClearance").checked = isClearance(p);
    $("fPickup").checked = p.allow_pickup !== false;
    $("fDelivery").checked = p.allow_delivery !== false;
    $("formMode").textContent = "Edit Product";
    $("formTitle").textContent = p.name || "Product details";
    switchPage("product-form");
  }
  function productPayload() {
    return {
      name: $("fName").value.trim(),
      sku: $("fSku").value.trim(),
      slug: slugify($("fName").value || $("fSku").value),
      brand: $("fBrand").value.trim() || "Nuvelle Home",
      category: $("fCategory").value,
      subcategory: $("fSubcategory").value,
      style: $("fStyle").value.trim(),
      collection_slug: $("fCollectionSlug").value,
      price: Number($("fPrice").value || 0),
      sale_price: Number($("fSalePrice").value || 0),
      compare_at_price: Number($("fCompareAtPrice").value || 0),
      stock_quantity: Number($("fStockQuantity").value || 0),
      is_clearance: $("fClearance").checked,
      final_sale: $("fClearance").checked,
      clearance_reason: $("fClearance").checked ? $("fClearanceReason").value : "",
      image_url: $("fImage").value.trim(),
      gallery_images: asArray($("fGallery").value),
      video_url: $("fVideo").value.trim(),
      materials: $("fMaterials").value.trim(),
      dimensions: $("fDimensions").value.trim(),
      description: $("fDescription").value.trim(),
      colors: asArray($("fColors").value),
      features: asArray($("fFeatures").value),
      delivery_type: $("fDeliveryType").value.trim(),
      delivery: $("fDeliveryType").value.trim(),
      published: $("fPublished").checked,
      featured: $("fFeatured").checked,
      in_stock: $("fInStock").checked,
      allow_pickup: $("fPickup").checked,
      allow_delivery: $("fDelivery").checked,
      updated_at: new Date().toISOString()
    };
  }
  async function saveProduct(event) {
    event.preventDefault();
    const payload = productPayload();
    if (!payload.name) { showToast("Product name is required.", true); return; }
    const id = $("fId").value;
    const result = id ? await sb.from("products").update(payload).eq("id", id) : await sb.from("products").insert([payload]);
    if (result.error) { showToast(result.error.message, true); return; }
    clearStorefrontCache();
    showToast(id ? "Product updated." : "Product created.");
    await loadProducts();
    switchPage("products");
  }
  function resetCollectionForm() {
    ["cId","cTitle","cSlug","cDateLabel","cHeroImage","cGalleryImages","cExcerpt","cBody"].forEach(id => { if ($(id)) $(id).value = ""; });
    $("cDateLabel").value = "NUVELLE HOME";
    $("cCategory").value = "living-room";
    $("cSortOrder").value = "1";
    $("cPublished").checked = true;
    $("collectionFormMode").textContent = "New Collection";
    $("collectionFormTitle").textContent = "Collection story";
    ["collectionHeroUpload","collectionGalleryUpload"].forEach(id => { if ($(id)) $(id).value = ""; });
  }
  function openCollectionForm(id) {
    resetCollectionForm();
    const collection = state.collections.find(item => String(item.id) === String(id));
    if (!collection) return;
    $("cId").value = collection.id;
    $("cTitle").value = collection.title || "";
    $("cSlug").value = collection.slug || "";
    $("cDateLabel").value = collection.date_label || "";
    $("cCategory").value = collection.category || "living-room";
    $("cSortOrder").value = collection.sort_order || 1;
    $("cHeroImage").value = collection.hero_image || "";
    $("cGalleryImages").value = asArray(collection.gallery_images || collection.images).join(", ");
    $("cExcerpt").value = collection.excerpt || "";
    $("cBody").value = collection.body || "";
    $("cPublished").checked = collection.published !== false;
    $("collectionFormMode").textContent = "Edit Collection";
    $("collectionFormTitle").textContent = collection.title || "Collection story";
    switchPage("collections");
  }
  function collectionPayload() {
    const title = $("cTitle").value.trim();
    const body = $("cBody").value.trim();
    return {
      title,
      slug: slugify($("cSlug").value || title),
      date_label: $("cDateLabel").value.trim() || "NUVELLE HOME",
      category: $("cCategory").value,
      sort_order: Number($("cSortOrder").value || 1),
      hero_image: $("cHeroImage").value.trim(),
      gallery_images: asArray($("cGalleryImages").value),
      excerpt: $("cExcerpt").value.trim(),
      body,
      sections: body ? body.split(/\n{2,}/).map(text => text.trim()).filter(Boolean) : [],
      published: $("cPublished").checked,
      updated_at: new Date().toISOString()
    };
  }
  async function saveCollection(event) {
    event.preventDefault();
    const payload = collectionPayload();
    if (!payload.title) { showToast("Collection title is required.", true); return; }
    const id = $("cId").value;
    const result = id ? await sb.from("collections").update(payload).eq("id", id) : await sb.from("collections").insert([payload]);
    if (result.error) { showToast(result.error.message, true); return; }
    clearStorefrontCache();
    showToast(id ? "Collection updated." : "Collection created.");
    await loadCollections();
    resetCollectionForm();
  }
  function journalImage(post) {
    const images = asArray(post.images || post.gallery_images);
    return post.hero_image || post.image_url || images[0] || "nuvelle-showroom-branded-v2.jpg";
  }
  function renderJournals() {
    const body = $("journalsBody");
    if (!body) return;
    body.innerHTML = state.journals.length ? state.journals.map(post => `
      <tr>
        <td><img class="admin-thumb" src="${escapeHtml(journalImage(post))}" alt=""></td>
        <td><strong>${escapeHtml(post.title || "Untitled Article")}</strong><div class="muted small">${escapeHtml(post.slug || "-")}</div><div class="muted small">${escapeHtml(post.excerpt || "")}</div></td>
        <td><span class="status-pill ${post.published === false ? "warn" : "good"}">${post.published === false ? "Draft" : "Published"}</span></td>
        <td>${Number(post.sort_order || 1)}</td>
        <td><button class="btn" data-edit-journal="${escapeHtml(post.id)}">Edit</button></td>
      </tr>`).join("") : `<tr><td colspan="5"><div class="empty">No journal articles yet.</div></td></tr>`;
    qa("[data-edit-journal]").forEach(btn => btn.addEventListener("click", () => openJournalForm(btn.dataset.editJournal)));
  }
  function resetJournalForm() {
    ["jId","jTitle","jSlug","jDateLabel","jHeroImage","jGalleryImages","jExcerpt","jBody"].forEach(id => { if ($(id)) $(id).value = ""; });
    $("jDateLabel").value = "NUVELLE JOURNAL";
    $("jSortOrder").value = "1";
    $("jPublished").checked = true;
    $("journalFormMode").textContent = "New Journal Article";
    $("journalFormTitle").textContent = "Journal story";
    ["journalHeroUpload","journalGalleryUpload"].forEach(id => { if ($(id)) $(id).value = ""; });
  }
  function openJournalForm(id) {
    resetJournalForm();
    const post = state.journals.find(item => String(item.id) === String(id));
    if (!post) return;
    $("jId").value = post.id;
    $("jTitle").value = post.title || "";
    $("jSlug").value = post.slug || "";
    $("jDateLabel").value = post.label || post.date_label || "";
    $("jSortOrder").value = post.sort_order || 1;
    $("jHeroImage").value = post.hero_image || post.image_url || "";
    $("jGalleryImages").value = asArray(post.images || post.gallery_images).join(", ");
    $("jExcerpt").value = post.excerpt || "";
    $("jBody").value = post.body || asArray(post.sections).join("\n\n");
    $("jPublished").checked = post.published !== false;
    $("journalFormMode").textContent = "Edit Journal Article";
    $("journalFormTitle").textContent = post.title || "Journal story";
    switchPage("journal");
  }
  function journalPayload() {
    const title = $("jTitle").value.trim();
    const body = $("jBody").value.trim();
    return {
      title,
      slug: slugify($("jSlug").value || title),
      label: $("jDateLabel").value.trim() || "NUVELLE JOURNAL",
      sort_order: Number($("jSortOrder").value || 1),
      hero_image: $("jHeroImage").value.trim(),
      images: asArray($("jGalleryImages").value),
      excerpt: $("jExcerpt").value.trim(),
      body,
      sections: body ? body.split(/\n{2,}/).map(text => text.trim()).filter(Boolean) : [],
      published: $("jPublished").checked,
      updated_at: new Date().toISOString()
    };
  }
  async function saveJournal(event) {
    event.preventDefault();
    const payload = journalPayload();
    if (!payload.title) { showToast("Journal title is required.", true); return; }
    const id = $("jId").value;
    const result = id ? await sb.from("journal_posts").update(payload).eq("id", id) : await sb.from("journal_posts").insert([payload]);
    if (result.error) { showToast(result.error.message, true); return; }
    clearStorefrontCache();
    showToast(id ? "Journal article updated." : "Journal article created.");
    await loadJournals();
    resetJournalForm();
  }
  function showcaseInputId(kind, category, label = "") {
    return `showcase-${kind}-${slugify(category)}-${slugify(label || "main")}`;
  }
  function showcaseRows() {
    const rows = [];
    [
      ["hero", "About page hero image"],
      ["story", "About story image"],
      ["living", "About living room image"],
      ["dining", "About dining room image"],
      ["bedroom", "About bedroom image"],
      ["office", "About office image"],
      ["delivery", "About delivery image"]
    ].forEach(([label, title]) => rows.push({
      kind: "about",
      category: "about",
      label,
      title,
      note: "Used on the public About Us page.",
      value: state.showcaseImages.about?.[label] || ""
    }));
    cfg.categories.forEach(cat => {
      rows.push({
        kind: "category",
        category: cat.slug,
        label: "category-card",
        title: `${cat.name} category card`,
        note: "Used on the home and furniture category grids.",
        value: state.showcaseImages.categories?.[cat.slug] || ""
      });
      (cat.subcategories || []).forEach(label => rows.push({
        kind: "subcategory",
        category: cat.slug,
        label,
        title: `${cat.name} / ${label}`,
        note: "Used on the dark room landing showcase.",
        value: state.showcaseImages.subcategories?.[cat.slug]?.[label] || ""
      }));
    });
    return rows;
  }
  function renderShowcaseImages() {
    const editor = $("showcaseEditor");
    if (!editor) return;
    const rows = showcaseRows();
    editor.innerHTML = rows.map(row => {
      const id = showcaseInputId(row.kind, row.category, row.label);
      const image = row.value || "nuvelle-showroom-branded-v2.jpg";
      return `<div class="showcase-row">
        <img class="showcase-preview" src="${escapeHtml(image)}" alt="">
        <div class="showcase-copy"><strong>${escapeHtml(row.title)}</strong><span>${escapeHtml(row.note)}</span></div>
        <input class="field" id="${escapeHtml(id)}" value="${escapeHtml(row.value)}" placeholder="Image URL">
        <input class="field" type="file" accept="image/*" data-showcase-upload data-target="${escapeHtml(id)}" data-kind="${escapeHtml(row.kind)}" data-category="${escapeHtml(row.category)}" data-label="${escapeHtml(row.label)}">
      </div>`;
    }).join("");
    qa("[data-showcase-upload]", editor).forEach(input => input.addEventListener("change", uploadShowcaseImage));
  }
  async function uploadShowcaseImage(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const url = await uploadMedia(file, `showcase/${slugify(input.dataset.category)}/${slugify(input.dataset.label || input.dataset.kind)}`);
      const target = $(input.dataset.target);
      if (target) target.value = url;
      const preview = input.closest(".showcase-row")?.querySelector(".showcase-preview");
      if (preview) preview.src = url;
      showToast("Showcase image uploaded. Save showcase images to publish it.");
    } catch (error) { showToast(error.message || "Upload failed.", true); }
  }
  function showcasePayload() {
    const payload = defaultShowcaseImages();
    cfg.categories.forEach(cat => {
      const categoryValue = $(showcaseInputId("category", cat.slug, "category-card"))?.value.trim();
      if (categoryValue) payload.categories[cat.slug] = categoryValue;
      (cat.subcategories || []).forEach(label => {
        const value = $(showcaseInputId("subcategory", cat.slug, label))?.value.trim();
        if (!value) return;
        if (!payload.subcategories[cat.slug]) payload.subcategories[cat.slug] = {};
        payload.subcategories[cat.slug][label] = value;
      });
    });
    ["hero", "story", "living", "dining", "bedroom", "office", "delivery"].forEach(label => {
      const value = $(showcaseInputId("about", "about", label))?.value.trim();
      if (value) payload.about[label] = value;
    });
    return payload;
  }
  async function saveShowcaseImages(event) {
    event.preventDefault();
    const payload = showcasePayload();
    const { error } = await sb.from("site_settings").upsert({ setting_key: "showcase_images", value: payload, updated_at: new Date().toISOString() });
    if (error) { showToast(error.message, true); return; }
    state.showcaseImages = normalizeShowcaseImages(payload);
    clearStorefrontCache();
    showToast("Showcase images saved.");
  }
  function safeFileName(file) {
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "upload";
    return `${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`.toLowerCase();
  }
  async function uploadMedia(file, folder) {
    const { data: sessionData } = await sb.auth.getSession();
    if (!sessionData.session) throw new Error("Sign in before uploading media.");
    const path = `${folder}/${safeFileName(file)}`;
    const { error } = await sb.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (error) throw error;
    const { data } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }
  async function uploadHero() {
    const file = $("heroUpload").files[0];
    if (!file) return;
    try {
      const url = await uploadMedia(file, `products/${slugify($("fName").value || "product")}/hero`);
      $("fImage").value = url;
      showToast("Main image uploaded. Save product to keep it.");
    } catch (error) { showToast(error.message || "Upload failed.", true); }
  }
  async function uploadGallery() {
    const files = Array.from($("galleryUpload").files || []);
    if (!files.length) return;
    try {
      const urls = [];
      for (const file of files) urls.push(await uploadMedia(file, `products/${slugify($("fName").value || "product")}/gallery`));
      $("fGallery").value = asArray($("fGallery").value).concat(urls).join(", ");
      showToast("Gallery images uploaded. Save product to keep them.");
    } catch (error) { showToast(error.message || "Upload failed.", true); }
  }
  async function uploadVideo() {
    const file = $("videoUpload").files[0];
    if (!file) return;
    try {
      const url = await uploadMedia(file, `products/${slugify($("fName").value || "product")}/video`);
      $("fVideo").value = url;
      showToast("Product video uploaded. Save product to keep it.");
    } catch (error) { showToast(error.message || "Upload failed.", true); }
  }
  async function uploadCollectionHero() {
    const file = $("collectionHeroUpload").files[0];
    if (!file) return;
    try {
      const url = await uploadMedia(file, `collections/${slugify($("cTitle").value || "collection")}/hero`);
      $("cHeroImage").value = url;
      showToast("Collection hero uploaded. Save collection to keep it.");
    } catch (error) { showToast(error.message || "Upload failed.", true); }
  }
  async function uploadCollectionGallery() {
    const files = Array.from($("collectionGalleryUpload").files || []);
    if (!files.length) return;
    try {
      const urls = [];
      for (const file of files) urls.push(await uploadMedia(file, `collections/${slugify($("cTitle").value || "collection")}/gallery`));
      $("cGalleryImages").value = asArray($("cGalleryImages").value).concat(urls).join(", ");
      showToast("Collection gallery uploaded. Save collection to keep it.");
    } catch (error) { showToast(error.message || "Upload failed.", true); }
  }
  async function uploadJournalHero() {
    const file = $("journalHeroUpload").files[0];
    if (!file) return;
    try {
      const url = await uploadMedia(file, `journal/${slugify($("jTitle").value || "article")}/hero`);
      $("jHeroImage").value = url;
      showToast("Journal hero uploaded. Save article to keep it.");
    } catch (error) { showToast(error.message || "Upload failed.", true); }
  }
  async function uploadJournalGallery() {
    const files = Array.from($("journalGalleryUpload").files || []);
    if (!files.length) return;
    try {
      const urls = [];
      for (const file of files) urls.push(await uploadMedia(file, `journal/${slugify($("jTitle").value || "article")}/gallery`));
      $("jGalleryImages").value = asArray($("jGalleryImages").value).concat(urls).join(", ");
      showToast("Journal images uploaded. Save article to keep them.");
    } catch (error) { showToast(error.message || "Upload failed.", true); }
  }
  async function renderDeliverySettings() {
    const defaults = cfg.defaultDeliveryRules;
    let rules = defaults;
    const { data } = await sb.from("site_settings").select("value").eq("setting_key", "delivery_rules").maybeSingle();
    if (data?.value) rules = { ...defaults, ...data.value };
    $("sLocalPrefixes").value = (rules.localZipPrefixes || []).join(", ");
    $("sLocalFee").value = rules.localDeliveryFee || 0;
    $("sFloridaStart").value = rules.floridaZipStart || 32000;
    $("sFloridaEnd").value = rules.floridaZipEnd || 34999;
    $("sFloridaFee").value = rules.floridaDeliveryFee || 0;
    $("sWhiteGloveFee").value = rules.whiteGloveFee || 0;
  }
  async function saveDeliverySettings(event) {
    event.preventDefault();
    const payload = {
      localZipPrefixes: asArray($("sLocalPrefixes").value),
      localDeliveryFee: Number($("sLocalFee").value || 0),
      floridaZipStart: Number($("sFloridaStart").value || 32000),
      floridaZipEnd: Number($("sFloridaEnd").value || 34999),
      floridaDeliveryFee: Number($("sFloridaFee").value || 0),
      whiteGloveFee: Number($("sWhiteGloveFee").value || 0),
      pickupFee: 0,
      outsideFloridaMessage: "Delivery quote required"
    };
    const { error } = await sb.from("site_settings").upsert({ setting_key: "delivery_rules", value: payload, updated_at: new Date().toISOString() });
    if (error) { showToast(error.message, true); return; }
    clearStorefrontCache();
    showToast("Delivery rules saved.");
  }
  function exportProducts() {
    const headers = ["sku","name","brand","category","subcategory","style","collection_slug","price","sale_price","compare_at_price","stock_quantity","is_clearance","clearance_reason","published"];
    const rows = state.products.map(product => headers.map(key => `"${String(product[key] ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "nuvelle-products.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupSupabase();
    setupCategories();
    populateCollectionOptions();
    $("loginForm").addEventListener("submit", async event => {
      event.preventDefault();
      $("loginError").classList.add("hidden");
      const { data, error } = await sb.auth.signInWithPassword({ email: $("loginEmail").value.trim(), password: $("loginPassword").value });
      if (error) {
        $("loginError").textContent = "Invalid admin login.";
        $("loginError").classList.remove("hidden");
        return;
      }
      setAuthed(data.session);
    });
    $("logoutBtn").addEventListener("click", async () => { await sb.auth.signOut(); setAuthed(null); });
    $("refreshBtn").addEventListener("click", refreshAll);
    $("exportProductsBtn").addEventListener("click", exportProducts);
    qa("[data-admin-page]").forEach(btn => btn.addEventListener("click", () => switchPage(btn.dataset.adminPage)));
    qa("[data-admin-page-shortcut]").forEach(btn => btn.addEventListener("click", () => switchPage(btn.dataset.adminPageShortcut)));
    $("productSearch").addEventListener("input", event => { state.search = event.target.value; renderProducts(); });
    $("productFilter").addEventListener("change", event => { state.filter = event.target.value; renderProducts(); });
    $("fCategory").addEventListener("change", () => populateSubcategories());
    $("productForm").addEventListener("submit", saveProduct);
    $("resetProductBtn").addEventListener("click", resetProductForm);
    $("heroUpload").addEventListener("change", uploadHero);
    $("galleryUpload").addEventListener("change", uploadGallery);
    $("videoUpload").addEventListener("change", uploadVideo);
    $("collectionForm").addEventListener("submit", saveCollection);
    $("resetCollectionBtn").addEventListener("click", resetCollectionForm);
    $("collectionHeroUpload").addEventListener("change", uploadCollectionHero);
    $("collectionGalleryUpload").addEventListener("change", uploadCollectionGallery);
    $("journalForm").addEventListener("submit", saveJournal);
    $("resetJournalBtn").addEventListener("click", resetJournalForm);
    $("journalHeroUpload").addEventListener("change", uploadJournalHero);
    $("journalGalleryUpload").addEventListener("change", uploadJournalGallery);
    $("showcaseForm").addEventListener("submit", saveShowcaseImages);
    $("resetShowcaseBtn").addEventListener("click", loadShowcaseImages);
    $("deliveryForm").addEventListener("submit", saveDeliverySettings);
    sb.auth.getSession().then(({ data }) => setAuthed(data.session));
  });
})();
