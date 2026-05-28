(function () {
  const cfg = window.NUVELLE_CONFIG;
  const storageKeys = {
    cart: "nuvelle-cart-v2",
    favorites: "nuvelle-favorites-v2",
    chatThread: "nuvelle-chat-thread-v1",
    productsCache: "nuvelle-products-cache-v1",
    collectionsCache: "nuvelle-collections-cache-v1",
    journalCache: "nuvelle-journal-cache-v1",
    settingsCache: "nuvelle-settings-cache-v1"
  };
  const icons = {
    bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l-1 13H7L6 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 5.6a5.1 5.1 0 0 0-7.2 0L12 7.2l-1.6-1.6a5.1 5.1 0 1 0-7.2 7.2L12 21l8.8-8.2a5.1 5.1 0 0 0 0-7.2Z"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>',
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
  };
  const shopCategories = cfg.categories.filter(cat => cat.slug !== "clearance");
  const excludedCategoryTerms = ["decor", "lighting", "accessories", "accessory"];
  const fallbackShowroomImage = "nuvelle-showroom-branded-v2.jpg";
  const categoryFallbacks = {
    "living-room": fallbackShowroomImage,
    "dining-room": fallbackShowroomImage,
    "bedroom-furniture": fallbackShowroomImage,
    "office-furniture": fallbackShowroomImage,
    "coffee-side-tables": fallbackShowroomImage,
    clearance: fallbackShowroomImage
  };

  let sb = null;
  let productCache = null;
  let settingsCache = null;
  let showcaseImages = { categories: {}, subcategories: {}, about: {} };
  let collectionCache = null;
  let journalCache = null;
  const resourceHints = new Set();
  const cacheMaxAgeMs = 60000;

  function initSupabase() {
    if (!sb && window.supabase && cfg.supabaseUrl && cfg.supabaseAnonKey) {
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    }
    return sb;
  }
  async function supabaseRest(table, query = "") {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return [];
    const endpoint = `${cfg.supabaseUrl.replace(/\/$/, "")}/rest/v1/${table}${query}`;
    const response = await fetch(endpoint, {
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: `Bearer ${cfg.supabaseAnonKey}`,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) throw new Error(`${table} could not load`);
    return response.json();
  }
  function addResourceHint(rel, href, as = "") {
    if (!href || typeof document === "undefined") return;
    const key = `${rel}:${as}:${href}`;
    if (resourceHints.has(key)) return;
    resourceHints.add(key);
    const link = document.createElement("link");
    link.rel = rel;
    link.href = href;
    if (as) link.as = as;
    if (/^https?:\/\//i.test(href)) link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }
  function warmNetwork() {
    if (cfg.supabaseUrl) {
      try {
        const origin = new URL(cfg.supabaseUrl).origin;
        addResourceHint("dns-prefetch", origin);
        addResourceHint("preconnect", origin);
      } catch {}
    }
    addResourceHint("preload", "nuvelle-showroom-branded-v2.jpg", "image");
  }
  function $(selector, root = document) { return root.querySelector(selector); }
  function $all(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }
  function slugify(value) {
    return String(value || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
  }
  function titleCase(value) {
    return String(value || "").replace(/-/g, " ").replace(/\b\w/g, letter => letter.toUpperCase()).trim();
  }
  function asArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (value && typeof value === "object") return Object.values(value).filter(Boolean);
    return String(value || "").split(",").map(item => item.trim()).filter(Boolean);
  }
  function money(value) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cfg.currency || "USD", maximumFractionDigits: 0 }).format(Number(value || 0));
  }
  function categoryLabel(slug) {
    const cat = cfg.categories.find(item => item.slug === slug || item.name.toLowerCase() === String(slug || "").toLowerCase());
    return cat ? cat.name : titleCase(slug || "Furniture");
  }
  function isExcludedCategory(value) {
    const raw = String(value || "").toLowerCase();
    return excludedCategoryTerms.some(term => raw.includes(term));
  }
  function normalizeCategory(value) {
    const raw = String(value || "").trim();
    const lower = raw.toLowerCase();
    const direct = cfg.categories.find(cat => cat.slug === raw || cat.name.toLowerCase() === lower);
    if (direct) return direct.slug;
    if (lower.includes("clearance")) return "clearance";
    if (lower.includes("dining") || lower.includes("bar stool") || lower.includes("sideboard")) return "dining-room";
    if (lower.includes("bed") || lower.includes("nightstand") || lower.includes("dresser") || lower.includes("vanit")) return "bedroom-furniture";
    if (lower.includes("office") || lower.includes("desk") || lower.includes("bookcase") || lower.includes("conference")) return "office-furniture";
    if (lower.includes("coffee") || lower.includes("side table") || lower.includes("end table") || lower.includes("nesting") || lower.includes("pedestal")) return "coffee-side-tables";
    if (lower.includes("living") || lower.includes("sofa") || lower.includes("sectional") || lower.includes("lounge") || lower.includes("console") || lower.includes("media")) return "living-room";
    return "living-room";
  }
  function deriveSubcategory(row) {
    if (row.subcategory) return String(row.subcategory).trim();
    const raw = String(row.category || "").trim();
    if (!raw) return "";
    const normalized = normalizeCategory(raw);
    const broad = cfg.categories.find(cat => cat.slug === normalized);
    if (broad && (raw === broad.slug || raw.toLowerCase() === broad.name.toLowerCase())) return "";
    if (isExcludedCategory(raw)) return "";
    return titleCase(raw);
  }
  function optimizedImage(src, width = 760) {
    const raw = String(src || "").trim();
    if (!raw || !/^https?:\/\//i.test(raw)) return raw || "nuvelle-showroom-branded-v2.jpg";
    try {
      const url = new URL(raw);
      if (url.hostname.includes("supabase.co") && url.pathname.includes("/storage/v1/object/public/")) {
        url.pathname = url.pathname.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
        url.searchParams.set("width", String(width));
        url.searchParams.set("quality", "72");
        url.searchParams.set("resize", "contain");
        return url.href;
      }
      if (url.hostname.includes("images.unsplash.com")) {
        url.searchParams.set("w", String(width));
        url.searchParams.set("q", "72");
        url.searchParams.set("auto", "format");
        return url.href;
      }
    } catch {}
    return raw;
  }
  function productImage(product, width = 620) {
    return optimizedImage(product.image || product.images?.[0] || "nuvelle-showroom-branded-v2.jpg", width);
  }
  function preloadImages(urls, max = 8) {
    Array.from(new Set(urls.filter(Boolean))).slice(0, max).forEach(src => addResourceHint("preload", src, "image"));
  }
  function cardImageWidth() {
    return window.matchMedia?.("(max-width: 640px)")?.matches ? 420 : 560;
  }
  function imageAttrs(priority = false) {
    return `${priority ? `loading="eager" fetchpriority="high"` : `loading="lazy"`} decoding="async"`;
  }
  function currentPrice(product) {
    const sale = Number(product.salePrice || 0);
    const base = Number(product.price || 0);
    return sale > 0 && sale < base ? sale : base;
  }
  function comparePrice(product) {
    const compare = Number(product.compareAtPrice || 0);
    const price = Number(product.price || 0);
    const sale = Number(product.salePrice || 0);
    if (compare > currentPrice(product)) return compare;
    if (sale > 0 && price > sale) return price;
    return 0;
  }
  function discountPercent(product) {
    const compare = comparePrice(product);
    const current = currentPrice(product);
    if (!compare || !current || compare <= current) return 0;
    return Math.round(((compare - current) / compare) * 100);
  }
  function isClearance(product) {
    return Boolean(product.isClearance || product.category === "clearance" || product.clearanceReason);
  }
  function mapProduct(row) {
    const gallery = asArray(row.gallery_images || row.images);
    const hero = row.image_url || gallery[0] || "";
    return {
      id: row.id,
      sku: row.sku || "",
      brand: row.brand || "Nuvelle Home",
      name: row.name || "Untitled Product",
      slug: row.slug || slugify(row.name || row.sku || row.id),
      rawCategory: row.category || "",
      category: normalizeCategory(row.category),
      subcategory: deriveSubcategory(row),
      style: row.style || "",
      collectionSlug: row.collection_slug || "",
      price: Number(row.price || 0),
      salePrice: Number(row.sale_price || 0),
      compareAtPrice: Number(row.compare_at_price || 0),
      materials: row.materials || "",
      dimensions: row.dimensions || "",
      description: row.description || "",
      colors: asArray(row.colors),
      features: asArray(row.features),
      delivery: row.delivery || row.lead_time || "Delivery or pickup options available at checkout.",
      deliveryType: row.delivery_type || "Delivery or pickup",
      stockQuantity: Number(row.stock_quantity ?? 0),
      inStock: row.in_stock !== false,
      featured: Boolean(row.featured),
      published: row.published !== false && row.status !== "archived",
      isClearance: Boolean(row.is_clearance),
      clearanceReason: row.clearance_reason || "",
      finalSale: row.final_sale !== false,
      allowPickup: row.allow_pickup !== false,
      allowDelivery: row.allow_delivery !== false,
      image: hero || "",
      images: [hero, ...gallery.filter(src => src && src !== hero)].filter(Boolean),
      video: row.video_url || "",
      createdAt: row.created_at || ""
    };
  }
  async function getProducts() {
    if (productCache) return productCache;
    const cached = readSessionCache(storageKeys.productsCache);
    if (cached?.length) {
      productCache = cached;
      return productCache;
    }
    initSupabase();
    let data = [];
    try {
      if (sb) {
        const response = await sb.from("products").select("*").order("created_at", { ascending: false });
        if (response.error) throw response.error;
        data = response.data || [];
      } else {
        data = await supabaseRest("products", "?select=*&order=created_at.desc");
      }
    } catch (error) {
      try {
        data = await supabaseRest("products", "?select=*&order=created_at.desc");
      } catch (fallbackError) {
        console.error(error || fallbackError);
        showToast("Products could not load. Please refresh or contact Nuvelle Home.", true);
        productCache = [];
        return productCache;
      }
    }
    const visibleRows = (data || []).filter(row => !isExcludedCategory(row.category));
    const rows = visibleRows.length ? visibleRows : (data || []);
    productCache = rows
      .map(mapProduct)
      .filter(product => product.published);
    writeSessionCache(storageKeys.productsCache, productCache);
    return productCache;
  }
  async function getSettings() {
    if (settingsCache) return settingsCache;
    const cached = readSessionCache(storageKeys.settingsCache);
    if (cached) {
      settingsCache = cached;
      showcaseImages = normalizeShowcaseSettings(settingsCache.showcaseImages);
      return settingsCache;
    }
    initSupabase();
    settingsCache = { deliveryRules: cfg.defaultDeliveryRules, showcaseImages: { categories: {}, subcategories: {}, about: {} } };
    try {
      const data = sb
        ? (await sb.from("site_settings").select("setting_key,value").in("setting_key", ["delivery_rules", "showcase_images"])).data
        : await supabaseRest("site_settings", "?select=setting_key,value&setting_key=in.(delivery_rules,showcase_images)");
      (data || []).forEach(row => {
        if (row.setting_key === "delivery_rules" && row.value) settingsCache.deliveryRules = { ...cfg.defaultDeliveryRules, ...row.value };
        if (row.setting_key === "showcase_images" && row.value) settingsCache.showcaseImages = normalizeShowcaseSettings(row.value);
      });
      showcaseImages = settingsCache.showcaseImages;
      writeSessionCache(storageKeys.settingsCache, settingsCache);
    } catch {
      settingsCache = { deliveryRules: cfg.defaultDeliveryRules, showcaseImages: { categories: {}, subcategories: {}, about: {} } };
      showcaseImages = settingsCache.showcaseImages;
    }
    return settingsCache;
  }
  function normalizeShowcaseSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      categories: source.categories && typeof source.categories === "object" ? source.categories : {},
      subcategories: source.subcategories && typeof source.subcategories === "object" ? source.subcategories : {},
      about: source.about && typeof source.about === "object" ? source.about : {}
    };
  }
  function mapCollection(row) {
    return {
      id: row.id || row.slug,
      title: row.title || "Untitled Collection",
      slug: row.slug || slugify(row.title),
      date: row.date_label || row.published_at || row.created_at || "",
      excerpt: row.excerpt || row.body || "",
      body: row.body || row.excerpt || "",
      heroImage: optimizedImage(row.hero_image || row.image_url || "nuvelle-showroom-branded-v2.jpg", 1200),
      gallery: asArray(row.gallery_images || row.images).map(src => optimizedImage(src, 900)),
      sections: asArray(row.sections),
      category: normalizeCategory(row.category || ""),
      published: row.published !== false,
      sortOrder: Number(row.sort_order || 1)
    };
  }
  async function getCollections() {
    if (collectionCache) return collectionCache;
    const cached = readSessionCache(storageKeys.collectionsCache);
    if (cached?.length) {
      collectionCache = cached;
      return collectionCache;
    }
    initSupabase();
    const fallback = (cfg.starterCollections || []).map(mapCollection);
    if (!sb) {
      try {
        const data = await supabaseRest("collections", "?select=*&published=eq.true&order=sort_order.asc");
        collectionCache = data?.length ? data.map(mapCollection).filter(item => item.published) : fallback;
      } catch {
        collectionCache = fallback;
      }
      writeSessionCache(storageKeys.collectionsCache, collectionCache);
      return collectionCache;
    }
    try {
      const { data, error } = await sb.from("collections").select("*").eq("published", true).order("sort_order", { ascending: true });
      if (error || !data?.length) {
        collectionCache = fallback;
        writeSessionCache(storageKeys.collectionsCache, collectionCache);
        return collectionCache;
      }
      collectionCache = data.map(mapCollection).filter(item => item.published);
      writeSessionCache(storageKeys.collectionsCache, collectionCache);
    } catch {
      collectionCache = fallback;
      writeSessionCache(storageKeys.collectionsCache, collectionCache);
    }
    return collectionCache;
  }
  async function findProduct(slugOrId) {
    const products = await getProducts();
    return products.find(product => product.slug === slugOrId || String(product.id) === String(slugOrId));
  }

  function loadJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch { return fallback; }
  }
  function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function readSessionCache(key, maxAgeMs = cacheMaxAgeMs) {
    const read = store => {
      try {
        const cached = JSON.parse(store.getItem(key) || "null");
        if (!cached || !cached.time || Date.now() - cached.time > maxAgeMs) return null;
        return cached.value || null;
      } catch {
        return null;
      }
    };
    try {
      const cached = read(sessionStorage) || read(localStorage);
      return cached || null;
    } catch {
      return null;
    }
  }
  function writeSessionCache(key, value) {
    try {
      const payload = JSON.stringify({ time: Date.now(), value });
      sessionStorage.setItem(key, payload);
      localStorage.setItem(key, payload);
    } catch {}
  }
  function getCart() { return loadJson(storageKeys.cart, []); }
  function saveCart(cart) {
    saveJson(storageKeys.cart, cart);
    updateCounters();
    renderStickyCheckout();
  }
  function getFavorites() { return loadJson(storageKeys.favorites, []); }
  function saveFavorites(items) {
    saveJson(storageKeys.favorites, items);
    updateCounters();
  }
  function cartCount() { return getCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0); }
  function favoritesCount() { return getFavorites().length; }
  async function enrichedCart() {
    const products = await getProducts();
    return getCart().map(item => {
      const product = products.find(p => String(p.id) === String(item.id) || p.slug === item.slug);
      return product ? { ...item, ...product, quantity: item.quantity } : item;
    });
  }
  function addToCart(product, quantity = 1) {
    const cart = getCart();
    const key = String(product.id || product.slug);
    const existing = cart.find(item => item.key === key);
    if (existing) existing.quantity += Number(quantity || 1);
    else cart.push({
      key,
      id: product.id,
      slug: product.slug,
      name: product.name,
      image: productImage(product, 360),
      price: currentPrice(product),
      quantity: Number(quantity || 1)
    });
    saveCart(cart);
    showToast(`${product.name} added to cart`);
  }
  function updateCartItem(key, quantity) {
    const next = getCart().map(item => item.key === key ? { ...item, quantity: Math.max(1, Number(quantity || 1)) } : item);
    saveCart(next);
  }
  function removeCartItem(key) {
    saveCart(getCart().filter(item => item.key !== key));
    showToast("Item removed from cart");
  }
  function toggleFavorite(product) {
    const favorites = getFavorites();
    const key = String(product.id || product.slug);
    const exists = favorites.some(item => item.key === key);
    const next = exists ? favorites.filter(item => item.key !== key) : favorites.concat([{ key, id: product.id, slug: product.slug, name: product.name, image: productImage(product, 360) }]);
    saveFavorites(next);
    showToast(exists ? "Removed from favorites" : "Saved to favorites");
    $all(`[data-favorite="${CSS.escape(product.slug)}"]`).forEach(btn => btn.classList.toggle("active", !exists));
  }
  function subtotal(items = getCart()) {
    return items.reduce((sum, item) => sum + Number(item.price || currentPrice(item) || 0) * Number(item.quantity || 0), 0);
  }

  function categoryHref(cat) {
    return cat.slug === "clearance" ? "clearance.html" : `furniture.html?category=${cat.slug}`;
  }
  function headerHtml() {
    const megaColumns = shopCategories.map(cat => `
      <div class="mega-column">
        <a class="mega-heading" href="${categoryHref(cat)}">${escapeHtml(cat.name)}</a>
        ${(cat.subcategories || []).map(item => `<a href="shop.html?category=${cat.slug}&subcategory=${encodeURIComponent(item)}">${escapeHtml(item)}</a>`).join("")}
      </div>`).join("");
    const mobileLinks = cfg.categories.map(cat => `<a href="${categoryHref(cat)}">${escapeHtml(cat.name)}</a>`).join("");
    return `
      <header class="luxury-header">
        <div class="container luxury-nav">
          <nav class="primary-nav" aria-label="Primary">
            <div class="nav-dropdown">
              <button type="button" data-mega-toggle>Shop</button>
              <div class="mega-menu" data-mega-menu>
                <div class="mega-menu__inner">
                  <div class="mega-rail">
                    <a href="furniture.html">Furniture</a>
                    <a href="clearance.html">Clearance Sales</a>
                    <a href="recently-added.html">Recently Added</a>
                    <a href="collections.html">New Collections</a>
                    <a class="btn btn-primary" href="shop.html">Shop All Products</a>
                  </div>
                  <div class="mega-grid">${megaColumns}</div>
                </div>
              </div>
            </div>
            <div class="nav-dropdown nav-dropdown--simple">
              <button type="button">Company</button>
              <div class="simple-menu">
                <a href="about.html">About Us</a>
                <a href="design-services.html">Design Services</a>
                <a href="journal.html">Our Journal</a>
                <a href="contact.html">Contact</a>
              </div>
            </div>
            <a href="contact.html">Contact Us</a>
          </nav>
          <a class="brand-wordmark" href="index.html" aria-label="${cfg.storeName} home">
            <strong>${cfg.storeName}</strong>
            <span>${cfg.tagline}</span>
          </a>
          <div class="nav-actions">
            <button class="nav-text-btn" type="button" data-search-open>Search</button>
            <a class="icon-btn" href="favorites.html" aria-label="Favorites">${icons.heart}<span class="counter" data-favorites-count>0</span></a>
            <a class="icon-btn" href="cart.html" aria-label="Cart">${icons.bag}<span class="counter" data-cart-count>0</span></a>
            <button class="icon-btn mobile-menu-btn" data-menu-toggle aria-label="Menu">${icons.menu}</button>
          </div>
        </div>
        <div class="search-panel" data-search-panel>
          <form class="container search-panel__form" data-site-search>
            <input class="field" name="search" placeholder="Search furniture">
            <button class="btn btn-primary" type="submit">Search</button>
            <button class="icon-btn" type="button" data-search-close aria-label="Close search">${icons.close}</button>
          </form>
        </div>
        <div class="mobile-drawer" data-mobile-drawer>
          <div class="mobile-drawer__head">
            <strong>${cfg.storeName}</strong>
            <button class="icon-btn" type="button" data-menu-close aria-label="Close menu">${icons.close}</button>
          </div>
          <nav>${mobileLinks}<a href="collections.html">New Collections</a><a href="recently-added.html">Recently Added</a><a href="about.html">Company</a><a href="contact.html">Contact Us</a></nav>
        </div>
      </header>`;
  }
  function socialHtml() {
    return `
      <a class="social-instagram" href="https://instagram.com/nuvellehomedecorr" target="_blank" rel="noopener" aria-label="Instagram"><svg viewBox="0 0 24 24"><path d="M7.8 2h8.4A5.8 5.8 0 0 1 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8A5.8 5.8 0 0 1 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2Zm0 2A3.8 3.8 0 0 0 4 7.8v8.4A3.8 3.8 0 0 0 7.8 20h8.4a3.8 3.8 0 0 0 3.8-3.8V7.8A3.8 3.8 0 0 0 16.2 4H7.8Zm8.95 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM12 7.1a4.9 4.9 0 1 1 0 9.8 4.9 4.9 0 0 1 0-9.8Zm0 2a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8Z"/></svg></a>
      <a class="social-tiktok" href="https://www.tiktok.com/@nuvellehomedecorr" target="_blank" rel="noopener" aria-label="TikTok"><svg viewBox="0 0 24 24"><path d="M16 2c.4 3 2.2 5 5 5.2V12c-1.9.1-3.6-.5-5-1.5v5.9c0 3.3-2.3 5.6-5.7 5.6A5.5 5.5 0 0 1 4.7 16c0-3.8 3.6-6.3 7.1-5.3v4.9c-1.4-.9-3.2 0-3.2 1.6 0 1.1.8 1.9 1.9 1.9 1.2 0 2-.8 2-2.2V2h3.5Z"/></svg></a>
      <a class="social-x" href="https://x.com/nuvellehomedecorr" target="_blank" rel="noopener" aria-label="X"><svg viewBox="0 0 24 24"><path d="M14.5 10.4 22 2h-2.2l-6.3 7.1L8.5 2H2l8 11.4L2 22h2.2l6.8-7.6 5.4 7.6H22l-7.5-11.6ZM12 12.9l-.9-1.2L4.6 3.7h2.8l5.1 6.9.8 1.2 6.8 8.7h-2.8L12 12.9Z"/></svg></a>`;
  }
  function footerHtml() {
    const categoryLinks = cfg.categories.map(cat => `<li><a href="${categoryHref(cat)}">${escapeHtml(cat.name)}</a></li>`).join("");
    return `
      <footer class="site-footer luxury-footer">
        <div class="container footer-main">
          <div>
            <div class="footer-brand">${cfg.storeName}</div>
            <p>${cfg.tagline}. Luxury furniture from Miami, with pickup, delivery, white-glove service, and secure checkout.</p>
            <div class="footer-note"><strong>Customer care</strong><br><a href="tel:${cfg.phoneHref}">${cfg.phone}</a><br><a href="mailto:${cfg.email}">${cfg.email}</a></div>
          </div>
          <div><h3>Furniture</h3><ul>${categoryLinks}</ul></div>
          <div><h3>Collections</h3><ul><li><a href="collections.html">New Collections</a></li><li><a href="recently-added.html">Recently Added</a></li><li><a href="clearance.html">Clearance Sales</a></li><li><a href="favorites.html">Favorites</a></li></ul></div>
          <div><h3>Company</h3><ul><li><a href="about.html">About Us</a></li><li><a href="design-services.html">Design Services</a></li><li><a href="shipping.html">Shipping</a></li><li><a href="faq.html">Frequently Asked Questions</a></li><li><a href="collections.html">New Collections</a></li><li><a href="journal.html">Our Journal</a></li><li><a href="contact.html">Contact Us</a></li></ul></div>
          <div><h3>Miami</h3><p>${cfg.address}</p><p>${cfg.hours}<br>${cfg.weekendHours}</p><div class="social-row">${socialHtml()}</div></div>
        </div>
        <div class="container footer-bottom">
          <span>2026 ${cfg.storeName}. All rights reserved.</span>
          <span><a href="sitemap.html">Sitemap</a></span>
          <span><a href="privacy.html">Privacy Policy</a></span>
          <span><a href="shipping.html">Shipping Policy</a></span>
          <span><a href="terms.html">Terms & Conditions</a></span>
          <span><a href="accessibility.html">Accessibility</a></span>
        </div>
      </footer>`;
  }
  function chatHtml() {
    return `
      <div class="chat-widget">
        <div class="chat-panel" data-chat-panel>
          <div class="chat-head"><strong>Nuvelle Care</strong><div class="muted small">Ask about products, pickup, delivery, or clearance availability.</div></div>
          <div class="chat-messages" data-chat-messages><div class="muted small">Send a note to Nuvelle Care. Replies come from the store team during business hours.</div></div>
          <form class="chat-form" data-chat-form>
            <input class="field" name="name" placeholder="Name" autocomplete="name">
            <input class="field" name="email" type="email" placeholder="Email" autocomplete="email">
            <textarea class="field" name="message" placeholder="Write your message" required></textarea>
            <button class="btn btn-primary" type="submit">Send Message</button>
          </form>
        </div>
        <button class="chat-toggle" data-chat-toggle>Chat with care</button>
      </div>`;
  }
  function injectChrome() {
    const header = $("[data-header]");
    const footer = $("[data-footer]");
    const chat = $("[data-chat]");
    if (header) header.innerHTML = headerHtml();
    if (footer) footer.innerHTML = footerHtml();
    if (chat) chat.innerHTML = chatHtml();
    bindChrome();
    updateCounters();
  }
  function setupHeaderStop() {
    const header = $("[data-header]");
    const stop = $(".newsletter-band") || $("[data-footer]");
    if (!header || !stop) return;
    if (header.dataset.stopReady === "true") return;
    header.dataset.stopReady = "true";
    const update = () => {
      const threshold = header.offsetHeight || 88;
      header.classList.toggle("header-paused", stop.getBoundingClientRect().top <= threshold);
    };
    update();
    [120, 650, 1400].forEach(delay => window.setTimeout(update, delay));
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    window.addEventListener("load", update, { once: true });
  }
  function setupHeroVideo() {
    const video = $("[data-hero-video]");
    const videos = (cfg.heroVideos || []).filter(Boolean);
    if (!video || !videos.length || video.dataset.ready === "true") return;
    video.dataset.ready = "true";
    let index = Math.floor(Math.random() * videos.length);
    let attempts = 0;
    addResourceHint("preload", videos[index % videos.length], "video");
    const setSource = () => {
      if (!videos.length || attempts > videos.length + 2) return;
      attempts += 1;
      video.src = videos[index % videos.length];
      index += 1;
      video.load();
      addResourceHint("preload", videos[index % videos.length], "video");
    };
    const playCurrent = () => {
      const playing = video.play?.();
      if (playing?.catch) playing.catch(() => {});
    };
    video.loop = false;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.addEventListener("ended", () => {
      attempts = 0;
      setSource();
      playCurrent();
    });
    video.addEventListener("error", () => setTimeout(() => {
      setSource();
      playCurrent();
    }, 250));
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(entries => entries.forEach(entry => {
        if (entry.isIntersecting) {
          const resume = video.play?.();
          if (resume?.catch) resume.catch(() => {});
        } else {
          video.pause?.();
        }
      }), { threshold: .18 });
      observer.observe(video);
    }
    if (navigator.connection?.saveData) return;
    setSource();
    const startVideo = () => setTimeout(playCurrent, 1000);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startVideo, { once: true });
    else startVideo();
  }
  function bindChrome() {
    const openMobileDrawer = () => {
      $("[data-mobile-drawer]")?.classList.add("open");
      document.body.classList.add("drawer-open");
    };
    const closeMobileDrawer = () => {
      $("[data-mobile-drawer]")?.classList.remove("open");
      document.body.classList.remove("drawer-open");
    };
    $all("[data-mega-toggle]").forEach(btn => btn.addEventListener("click", event => {
      event.stopPropagation();
      $("[data-mega-menu]")?.classList.toggle("open");
    }));
    $("[data-mega-menu]")?.addEventListener("click", event => event.stopPropagation());
    document.addEventListener("click", event => {
      if (!event.target.closest(".nav-dropdown")) $all("[data-mega-menu].open").forEach(menu => menu.classList.remove("open"));
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") $all("[data-mega-menu].open").forEach(menu => menu.classList.remove("open"));
      if (event.key === "Escape") closeJournal();
      if (event.key === "Escape") closeMobileDrawer();
    });
    $all("[data-search-open]").forEach(btn => btn.addEventListener("click", () => $("[data-search-panel]")?.classList.add("open")));
    $all("[data-search-close]").forEach(btn => btn.addEventListener("click", () => $("[data-search-panel]")?.classList.remove("open")));
    $all("[data-menu-toggle]").forEach(btn => btn.addEventListener("click", openMobileDrawer));
    $all("[data-menu-close]").forEach(btn => btn.addEventListener("click", closeMobileDrawer));
    $all("[data-mobile-drawer] nav a").forEach(link => link.addEventListener("click", closeMobileDrawer));
    $all("[data-site-search]").forEach(form => form.addEventListener("submit", event => {
      event.preventDefault();
      const query = new FormData(form).get("search");
      location.href = `shop.html?search=${encodeURIComponent(query || "")}`;
    }));
    $all("[data-newsletter]").forEach(form => form.addEventListener("submit", event => {
      event.preventDefault();
      form.reset();
      showToast("Thank you. You are on the Nuvelle Home list.");
    }));
    const toggle = $("[data-chat-toggle]");
    const panel = $("[data-chat-panel]");
    if (toggle && panel) toggle.addEventListener("click", () => {
      panel.classList.toggle("open");
      if (panel.classList.contains("open")) loadChatMessages();
    });
    const chatForm = $("[data-chat-form]");
    if (chatForm) chatForm.addEventListener("submit", sendChatMessage);
    $all("[data-close-journal]").forEach(btn => btn.addEventListener("click", closeJournal));
    if (localStorage.getItem(storageKeys.chatThread)) {
      loadChatMessages();
      setInterval(loadChatMessages, 20000);
    }
  }
  function updateCounters() {
    $all("[data-cart-count]").forEach(el => el.textContent = cartCount());
    $all("[data-favorites-count]").forEach(el => el.textContent = favoritesCount());
  }
  function showToast(message, isError = false) {
    let toast = $("[data-toast]");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      toast.dataset.toast = "true";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.background = isError ? "var(--danger)" : "var(--ink)";
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function productCard(product, priority = false) {
    const discount = discountPercent(product);
    const clearance = isClearance(product);
    const favoriteActive = getFavorites().some(item => item.key === String(product.id || product.slug));
    const compare = comparePrice(product);
    const brand = productBrandName(product) || product.brand || "Nuvelle Home";
    const productType = product.subcategory || categoryLabel(product.category);
    const sku = String(product.sku || "").trim();
    const meta = [productType, sku ? `SKU ${sku}` : ""].filter(Boolean).join(" / ");
    const detailUrl = `product.html?slug=${encodeURIComponent(product.slug)}`;
    return `
      <article class="product-card">
        <a class="product-link" href="${detailUrl}" aria-label="View ${escapeHtml(product.name)}">
          <span class="product-media"><img src="${escapeHtml(productImage(product, cardImageWidth()))}" alt="${escapeHtml(product.name)}" ${imageAttrs(priority)}></span>
          <span class="product-body">
            <span class="product-kicker">${escapeHtml(meta)}</span>
            <h3>${escapeHtml(product.name)}</h3>
            <span class="product-brand">by ${escapeHtml(brand)}</span>
            <span class="price-row">${compare ? `<span class="compare">${money(compare)}</span>` : ""}<span class="price ${compare || clearance ? "sale-price" : ""}">${money(currentPrice(product))}</span></span>
          </span>
        </a>
        <div class="badge-row">
          <div>${clearance ? `<span class="badge sale">Final Sale${discount ? ` - ${discount}% Off` : ""}</span>` : ""}</div>
          <button class="favorite-btn ${favoriteActive ? "active" : ""}" data-favorite="${escapeHtml(product.slug)}" aria-label="Save ${escapeHtml(product.name)}">${icons.heart}</button>
        </div>
      </article>`;
  }
  function bindProductActions(root = document) {
    $all(".product-link", root).forEach(link => link.addEventListener("pointerenter", () => addResourceHint("prefetch", link.href), { once: true }));
    $all("[data-add]", root).forEach(btn => btn.addEventListener("click", async () => {
      const product = await findProduct(btn.dataset.add);
      if (product) addToCart(product, $("#productQty")?.value || 1);
    }));
    $all("[data-favorite]", root).forEach(btn => btn.addEventListener("click", async event => {
      event.preventDefault();
      const product = await findProduct(btn.dataset.favorite);
      if (product) toggleFavorite(product);
    }));
  }
  function renderGrid(selector, products) {
    const el = $(selector);
    if (!el) return;
    preloadImages(products.map(product => productImage(product, cardImageWidth())), 8);
    el.innerHTML = products.length ? products.map((product, index) => productCard(product, index < 6)).join("") : `<div class="empty">No products are available in this section yet.</div>`;
    bindProductActions(el);
  }
  function renderLoadingCards(selector, count = 6) {
    const el = $(selector);
    if (!el || el.dataset.loaded === "true") return;
    el.innerHTML = Array.from({ length: count }, () => `<article class="skeleton-card"><div></div><span></span><strong></strong><em></em></article>`).join("");
  }
  function renderRail(selector, products) {
    const el = $(selector);
    if (!el) return;
    preloadImages(products.map(product => productImage(product, cardImageWidth())), 8);
    el.innerHTML = products.length ? products.map((product, index) => productCard(product, index < 5)).join("") : `<div class="empty">No products are available in this section yet.</div>`;
    bindProductActions(el);
  }
  function categoryImage(slug, products) {
    const override = showcaseImages.categories?.[slug];
    if (override) return optimizedImage(override, 900);
    const product = products.find(item => item.category === slug && productImage(item));
    return product ? productImage(product, 900) : optimizedImage(categoryFallbacks[slug] || categoryFallbacks["living-room"], 900);
  }
  function categoryCard(cat, products, priority = false) {
    return `
      <a class="category-card" href="${categoryHref(cat)}">
        <img src="${escapeHtml(categoryImage(cat.slug, products))}" alt="${escapeHtml(cat.name)}" ${imageAttrs(priority)}>
        <div class="category-card__body"><h3>${escapeHtml(cat.name)} Furniture</h3></div>
      </a>`;
  }
  function collectionCard(collection, compact = false, priority = false) {
    return `
      <article class="collection-card ${compact ? "compact" : ""}">
        <a href="collection.html?slug=${encodeURIComponent(collection.slug)}"><img src="${escapeHtml(collection.heroImage)}" alt="${escapeHtml(collection.title)}" ${imageAttrs(priority)}></a>
        <div>
          <span class="label">${escapeHtml(collection.date ? String(collection.date).slice(0, 18) : "NUVELLE HOME")}</span>
          <h3><a href="collection.html?slug=${encodeURIComponent(collection.slug)}">${escapeHtml(collection.title)}</a></h3>
          <p>${escapeHtml(collection.excerpt || "")}</p>
          <a class="text-link" href="collection.html?slug=${encodeURIComponent(collection.slug)}">View collection</a>
        </div>
      </article>`;
  }
  function collectionTile(collection, large = false, priority = false) {
    return `
      <a class="collection-tile ${large ? "large" : ""}" href="collection.html?slug=${encodeURIComponent(collection.slug)}">
        <img src="${escapeHtml(collection.heroImage)}" alt="${escapeHtml(collection.title)}" ${imageAttrs(priority)}>
        <span>${escapeHtml(collection.date ? String(collection.date).slice(0, 18) : "NUVELLE HOME")}</span>
        <h3>${escapeHtml(collection.title)}</h3>
      </a>`;
  }
  function expertiseIcon(index) {
    const iconSet = [
      '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 36c0-10 8-18 18-18s18 8 18 18"/><path d="M14 36h36M32 18c-5 6-8 12-8 18s3 12 8 18M32 18c5 6 8 12 8 18s-3 12-8 18"/><path class="accent" d="m45 45 8 8M53 45l-8 8"/></svg>',
      '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 40h28l6 7h5"/><path d="M17 30h19l6 10"/><path d="M18 47a4 4 0 1 0 0 .1M43 47a4 4 0 1 0 0 .1"/><path class="accent" d="M10 22h19M10 29h14M10 36h9"/></svg>',
      '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 15h18v34H18zM36 19h10v30H36z"/><path d="M22 22h10M22 30h10M22 38h10"/><path class="accent" d="M47 18v32M51 18v32"/></svg>',
      '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M15 22h34v24H15z"/><path d="M21 29h16M21 37h11"/><path class="accent" d="M44 38c4 0 7-3 7-7M47 45l-3-7 7 3"/></svg>',
      '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="m32 10 6 12 13 2-9 9 2 13-12-6-12 6 2-13-9-9 13-2 6-12z"/><path class="accent" d="M21 52h22"/></svg>'
    ];
    return iconSet[index % iconSet.length];
  }
  function renderCollectionMosaic(selector, collections) {
    const el = $(selector);
    if (!el) return;
    preloadImages(collections.map(item => item.heroImage), 5);
    el.innerHTML = collections.length ? collections.map((item, index) => collectionTile(item, index === 0, index < 5)).join("") : `<div class="empty">Collections will appear here soon.</div>`;
  }
  function renderExpertise() {
    const rail = $("#expertiseRail");
    if (!rail) return;
    const items = (cfg.expertise || []).concat(cfg.expertise || []);
    rail.innerHTML = `<div class="expertise-track">${items.map((item, index) => `<article class="expertise-card"><div class="expertise-icon">${expertiseIcon(index)}</div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p></article>`).join("")}</div>`;
  }

  async function renderHome() {
    renderLoadingCards("#recentGrid", 5);
    renderLoadingCards("#homeCategories", 5);
    renderLoadingCards("#homeCollections", 5);
    await getSettings();
    const products = await getProducts();
    const collections = await getCollections();
    const recent = products.slice(0, 5);
    renderRail("#recentGrid", recent);
    renderCollectionMosaic("#homeCollections", collections.slice(0, 5));
    const catGrid = $("#homeCategories");
    preloadImages(shopCategories.map(cat => categoryImage(cat.slug, products)), 6);
    if (catGrid) catGrid.innerHTML = shopCategories.map((cat, index) => categoryCard(cat, products, index < 5)).join("");
    renderExpertise();
    await renderHomeJournal();
  }
  function roomTitle(cat) {
    if (!cat) return "Furniture";
    return cat.slug === "coffee-side-tables" ? cat.name : `${cat.name} Furniture`;
  }
  function matchesSubcategory(product, label) {
    const haystack = [product.name, product.subcategory, product.rawCategory, product.description].join(" ").toLowerCase();
    const words = String(label || "").toLowerCase().replace(/&/g, " ").split(/\s+/).filter(word => word.length > 2);
    return words.length ? words.some(word => haystack.includes(word)) : false;
  }
  function subcategoryTargetCategory(cat, label) {
    const lower = String(label || "").toLowerCase();
    if (lower.includes("coffee") || lower.includes("side table") || lower.includes("nesting") || lower.includes("pedestal")) return "coffee-side-tables";
    return cat.slug;
  }
  function subcategoryImage(cat, label, products) {
    const target = subcategoryTargetCategory(cat, label);
    const override = showcaseImages.subcategories?.[cat.slug]?.[label] || showcaseImages.subcategories?.[target]?.[label];
    if (override) return optimizedImage(override, 420);
    const product = products.find(item => item.category === target && matchesSubcategory(item, label));
    return product ? productImage(product, 320) : categoryImage(target, products);
  }
  function subcategoryTile(cat, label, products) {
    const target = subcategoryTargetCategory(cat, label);
    return `
      <a class="subcategory-tile" href="shop.html?category=${target}&subcategory=${encodeURIComponent(label)}">
        <img src="${escapeHtml(subcategoryImage(cat, label, products))}" alt="${escapeHtml(label)}" ${imageAttrs()}>
        <strong>${escapeHtml(label)}</strong>
      </a>`;
  }
  function productBrandName(product) {
    const brand = String(product.brand || "").trim();
    if (brand && !/^nuvelle home$/i.test(brand)) return titleCase(brand);
    const first = String(product.name || "").trim().split(/\s+/)[0] || "";
    const known = cfg.brandFallbacks || [];
    return known.find(item => item.toLowerCase() === first.toLowerCase()) || "";
  }
  function uniqueBrands(products) {
    return Array.from(new Set(products.map(product => productBrandName(product) || String(product.brand || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }
  function roomBrands(cat, products) {
    const grouped = new Map();
    products.forEach(product => {
      const brand = productBrandName(product);
      if (!brand) return;
      const existing = grouped.get(brand) || { name: brand, count: 0, image: productImage(product, 560) };
      existing.count += 1;
      if (!existing.image) existing.image = productImage(product, 560);
      grouped.set(brand, existing);
    });
    const cards = Array.from(grouped.values()).sort((a, b) => b.count - a.count).slice(0, 5);
    (cfg.brandFallbacks || []).forEach(name => {
      if (cards.length < 5 && !cards.some(card => card.name.toLowerCase() === name.toLowerCase())) {
        cards.push({ name, count: 0, image: categoryImage(cat.slug, products) });
      }
    });
    return cards.slice(0, 5);
  }
  function roomStory(cat) {
    const stories = {
      "living-room": {
        heading: "Luxury Living Room Furniture for a Composed Home",
        intro: "Build the room around generous seating, balanced tables, and storage that keeps the space calm. NUVELLE HOME living room pieces are selected for comfort, scale, and the quiet polish expected in a finished home.",
        more: [
          "Start with the pieces that shape how the room is used: a sofa or sectional for the main conversation area, lounge chairs for softness, then coffee and side tables that give the room rhythm without crowding it.",
          "For a more tailored layout, consoles, TV stands, wall units, and bookcases can make the room feel complete while keeping the eye on the furniture, materials, and proportions."
        ],
        links: ["Sofas & Sectionals", "Lounge Chairs", "Coffee & Side Tables", "Consoles", "Wall Units & Bookcases"]
      },
      "dining-room": {
        heading: "Luxury Dining Room Furniture Made for Hosting",
        intro: "A dining room should feel ready for family dinners, holidays, and slower evenings around the table. Explore tables, chairs, bar seating, and storage chosen for strong silhouettes and a refined hosting experience.",
        more: [
          "Fixed tables create a grounded formal room, while extendable tables keep the space flexible when more guests arrive. Chairs and armchairs should carry the look without giving up comfort.",
          "Sideboards, cupboards, bar stools, and counter stools finish the room with practical storage and a more complete dining story."
        ],
        links: ["Fixed Tables", "Extendable Tables", "Chairs & Armchairs", "Bar Stools & Counter Stools", "Sideboards & Cupboards"]
      },
      "bedroom-furniture": {
        heading: "Luxury Bedroom Furniture with Quiet Presence",
        intro: "The bedroom should feel settled, private, and easy to live in. NUVELLE HOME bedroom furniture focuses on calm forms, useful storage, and pieces that make the room feel intentional from the bed outward.",
        more: [
          "Choose the bed first, then balance it with nightstands, dressers, benches, or a chaise when the room allows. The goal is a space that feels restful without looking unfinished.",
          "Vanities, headboards, and storage pieces add detail in a way that still keeps the room soft, organized, and comfortable."
        ],
        links: ["Double Beds", "Nightstands & Dressers", "Ottomans & Benches", "Chaise Lounges & Day Beds", "Artful Headboards"]
      },
      "office-furniture": {
        heading: "Luxury Office Furniture for Focus and Finish",
        intro: "A home office has to work hard without looking temporary. Shop desks, chairs, conference pieces, and storage that keep the room professional, composed, and comfortable for long hours.",
        more: [
          "Start with the desk and seating, then add bookcases, drawers, or sideboards to keep the room clear. Good office furniture should make work feel easier while still belonging to the home.",
          "For shared workspaces or client-facing rooms, conference tables and storage pieces help the room feel finished and deliberate."
        ],
        links: ["Home Desks & Drawers", "Office Desks & Drawers", "Chairs & Armchairs", "Conference Tables", "Sideboards & Bookcases"]
      },
      "coffee-side-tables": {
        heading: "Luxury Coffee and Side Tables with Sculptural Detail",
        intro: "Coffee and side tables bring the room together. They hold everyday life, but they also define the spacing, texture, and visual weight around sofas, lounge chairs, and beds.",
        more: [
          "Use coffee tables for the central statement, side tables for balance, and nesting tables when a room needs flexibility. The best pieces feel useful first, then reveal their detail up close.",
          "Pedestals and accent tables can add height, contrast, or a small moment of interest without making the room feel busy."
        ],
        links: ["Coffee Tables", "Side Tables", "Nesting Tables", "Pedestals", "Accent Tables"]
      }
    };
    return stories[cat.slug] || {
      heading: `Luxury ${roomTitle(cat)} for Real Homes`,
      intro: `${roomTitle(cat)} at NUVELLE HOME is selected for scale, finish, and everyday comfort.`,
      more: ["Use the category links above to move into the right pieces, then refine the listing by brand, size, price, and clearance availability."],
      links: cat.subcategories || []
    };
  }
  function storyLink(cat, label) {
    const target = subcategoryTargetCategory(cat, label);
    return `shop.html?category=${target}&subcategory=${encodeURIComponent(label)}`;
  }
  async function renderRoomLanding(cat, products) {
    const shell = $("#furnitureShell");
    if (!shell || !cat) return false;
    const title = roomTitle(cat);
    const roomProducts = products.filter(product => product.category === cat.slug);
    const popular = (roomProducts.length ? roomProducts : products).slice(0, 10);
    const brands = roomBrands(cat, roomProducts.length ? roomProducts : products);
    const story = roomStory(cat);
    document.title = `${title} | ${cfg.storeName}`;
    shell.innerHTML = `
      <section class="room-landing-hero">
        <div class="container">
          <div class="page-kicker"><a href="index.html">Home</a><a href="shop.html">Products</a><a href="furniture.html">Furniture</a><span>${escapeHtml(title)}</span></div>
          <div class="edge-head">
            <h1>${escapeHtml(title)}</h1>
            <a class="text-link" href="furniture.html">Back to Furniture</a>
          </div>
          <div class="subcategory-grid">${(cat.subcategories || []).map(label => subcategoryTile(cat, label, products)).join("")}</div>
        </div>
      </section>
      <section class="section room-brand-section">
        <div class="container">
          <div class="edge-head"><h2>Shop by ${escapeHtml(title)} brands</h2><a class="btn btn-primary" href="shop.html?category=${cat.slug}">Shop All Brands</a></div>
          <div class="brand-rail">${brands.map(brand => `<a class="brand-card" href="shop.html?category=${cat.slug}${brand.count ? `&brand=${encodeURIComponent(brand.name)}` : ""}"><strong>${escapeHtml(brand.name)}</strong><img src="${escapeHtml(brand.image)}" alt="${escapeHtml(brand.name)}" ${imageAttrs()}></a>`).join("")}</div>
        </div>
      </section>
      <section class="section room-picks">
        <div class="container">
          <div class="edge-head"><h2>Popular picks in ${escapeHtml(title)}</h2><a class="text-link" href="shop.html?category=${cat.slug}">View All</a></div>
          <div class="product-rail" id="roomPopular"></div>
        </div>
      </section>
      <section class="section room-story">
        <div class="container room-story__inner">
          <h2>${escapeHtml(story.heading)}</h2>
          <p>${escapeHtml(story.intro)}</p>
          <details class="story-more"><summary><span data-more-text>Show More</span></summary><div class="room-story__more">
            ${(story.more || []).map(text => `<p>${escapeHtml(text)}</p>`).join("")}
            ${(story.links || []).length ? `<div class="room-story__links">${story.links.map(label => `<a href="${storyLink(cat, label)}">${escapeHtml(label)}</a>`).join("")}</div>` : ""}
          </div></details>
        </div>
      </section>
      <section class="section expertise-section">
        <div class="container">
          <h2>Our Expertise</h2>
          <div class="expertise-marquee" id="expertiseRail"></div>
        </div>
      </section>`;
    renderRail("#roomPopular", popular);
    renderExpertise();
    $all(".story-more", shell).forEach(details => details.addEventListener("toggle", () => {
      const label = $("[data-more-text]", details);
      if (label) label.textContent = details.open ? "Show Less" : "Show More";
    }));
    return true;
  }
  async function renderFurniturePage() {
    renderLoadingCards("#furnitureCategories", 5);
    renderLoadingCards("#featuredGrid", 8);
    await getSettings();
    const products = await getProducts();
    const params = new URLSearchParams(location.search);
    const requestedCategory = params.get("category");
    const selectedCategory = requestedCategory ? normalizeCategory(requestedCategory) : "";
    const cat = shopCategories.find(item => item.slug === selectedCategory);
    if (cat && await renderRoomLanding(cat, products)) return;
    const catGrid = $("#furnitureCategories");
    preloadImages(shopCategories.map(cat => categoryImage(cat.slug, products)), 6);
    if (catGrid) catGrid.innerHTML = shopCategories.map((cat, index) => categoryCard(cat, products, index < 5)).join("");
    const featured = products.filter(product => product.featured).slice(0, 8);
    renderGrid("#featuredGrid", featured.length ? featured : products.slice(0, 8));
    renderExpertise();
  }
  function countBy(products, getter) {
    const counts = new Map();
    products.forEach(product => {
      const value = getter(product);
      if (!value) return;
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    return counts;
  }
  function productSizeBucket(product) {
    const details = [product.dimensions, product.name, product.subcategory, categoryLabel(product.category)].join(" ").toLowerCase();
    const numbers = Array.from(details.matchAll(/\d+(?:\.\d+)?/g)).map(match => Number(match[0])).filter(Boolean);
    const max = numbers.length ? Math.max(...numbers) : 0;
    if (max >= 96 || /\b(sectional|conference|wall unit|king|queen)\b/.test(details)) return "Oversized";
    if (max >= 60 || /\b(sofa|bed|bookcase|sideboard|cabinet|dining table|dresser)\b/.test(details)) return "Large";
    if (max >= 32 || /\b(chair|lounge|ottoman|nightstand|coffee table|console)\b/.test(details)) return "Medium";
    return "Small";
  }
  function productDescription(product) {
    const written = String(product.description || "").trim();
    if (written) return written;
    const type = product.subcategory || categoryLabel(product.category);
    const brand = productBrandName(product) || product.brand || "Nuvelle Home";
    const material = product.materials ? ` Materials listed for this piece include ${product.materials}.` : "";
    const descriptions = {
      "living-room": `A composed ${type} selected for living rooms that need comfort, proportion, and a finished look. Use this piece to anchor the room, soften the layout, or add a polished layer around existing seating.${material}`,
      "dining-room": `A refined ${type} for dining rooms made to host everyday meals and special gatherings with the same sense of ease. Pair it with complementary seating, storage, or table pieces to create a room that feels deliberate without feeling formal.${material}`,
      "bedroom-furniture": `A quiet ${type} chosen for bedrooms that need calm presence, storage, and comfort. It is meant to work with layered bedding, warm finishes, and the softer rhythm of a private room.${material}`,
      "office-furniture": `A practical ${type} for a home office that should feel focused, organized, and permanent. The scale and finish are intended to support real work while still belonging to the rest of the home.${material}`,
      "coffee-side-tables": `A sculptural ${type} that gives the room a useful surface without making the layout feel heavy. Style it beside seating, at the center of the room, or wherever a smaller architectural detail is needed.${material}`,
      clearance: `A final-sale ${type} from the Nuvelle Home clearance edit. Review the details, dimensions, and delivery options carefully before checkout because clearance pieces are limited and final sale.${material}`
    };
    return descriptions[product.category] || `A ${type} selected by ${brand} for homes that need furniture with presence, comfort, and a cleaner finish.${material}`;
  }
  function categoryFilteredProducts(products, category) {
    if (category === "clearance") return products.filter(isClearance);
    if (category && category !== "all") return products.filter(item => item.category === category);
    return products.slice();
  }
  function filterOption(label, value, active, _count, dataName) {
    return `
      <button class="filter-option ${active ? "active" : ""}" type="button" data-${dataName}="${escapeHtml(value)}">
        <span class="filter-mark"></span>
        <span class="filter-label">${escapeHtml(label)}</span>
      </button>`;
  }
  function renderCategoryLinks(active, products = [], recentOnly = false) {
    const side = $("#categoryList");
    if (!side) return;
    const rows = [
      { label: recentOnly ? "All Recently Added" : "All Furniture", value: "all", count: products.length },
      ...cfg.categories.map(cat => ({
        label: cat.name,
        value: cat.slug,
        count: cat.slug === "clearance" ? products.filter(isClearance).length : products.filter(product => product.category === cat.slug).length
      }))
    ];
    side.innerHTML = rows.map(row => filterOption(row.label, row.value, active === row.value, row.count, "filter-category")).join("");
  }
  function renderValueFilters(state, products) {
    let scoped = categoryFilteredProducts(products, state.category);
    if (state.clearance && state.category !== "clearance") scoped = scoped.filter(isClearance);
    const brandCounts = countBy(scoped, product => productBrandName(product) || String(product.brand || "").trim());
    const brands = Array.from(brandCounts.keys()).sort((a, b) => a.localeCompare(b));
    const brandList = $("#brandFilterList");
    if (brandList) {
      brandList.innerHTML = brands.length
        ? brands.map(brand => filterOption(brand, brand, state.brand === brand, brandCounts.get(brand), "filter-brand")).join("")
        : `<p class="muted small">Brands will appear here as products are assigned.</p>`;
    }
    const sizeCounts = countBy(scoped, productSizeBucket);
    const sizeList = $("#sizeFilterList");
    if (sizeList) {
      const sizes = ["Small", "Medium", "Large", "Oversized"].filter(size => sizeCounts.has(size));
      sizeList.innerHTML = sizes.length
        ? sizes.map(size => filterOption(size, size, state.size === size, sizeCounts.get(size), "filter-size")).join("")
        : `<p class="muted small">Sizes will appear here as product dimensions are added.</p>`;
    }
    const clearance = $("#clearanceFilter");
    if (clearance) clearance.checked = Boolean(state.clearance || state.category === "clearance");
  }
  function setupMobileFilters() {
    const panel = $(".filter-panel");
    const shopbar = $(".shopbar");
    if (!panel || !shopbar || panel.dataset.mobileReady === "true") return;
    panel.dataset.mobileReady = "true";
    if (!shopbar.querySelector("[data-filter-open]")) {
      shopbar.insertAdjacentHTML("afterbegin", `<button class="btn btn-soft filter-toggle-mobile" type="button" data-filter-open>Filters</button>`);
    }
    if (!panel.querySelector(".filter-mobile-head")) {
      panel.insertAdjacentHTML("afterbegin", `<div class="filter-mobile-head"><strong>Filters</strong><button class="icon-btn filter-close-mobile" type="button" data-filter-close aria-label="Close filters">${icons.close}</button></div>`);
    }
    const closeFilters = () => {
      panel.classList.remove("open");
      document.body.classList.remove("filter-open");
    };
    const openFilters = () => {
      panel.classList.add("open");
      document.body.classList.add("filter-open");
    };
    $("[data-filter-open]", shopbar)?.addEventListener("click", openFilters);
    $("[data-filter-close]", panel)?.addEventListener("click", closeFilters);
    panel.addEventListener("click", event => {
      if (event.target.closest(".filter-option") && window.matchMedia?.("(max-width: 840px)")?.matches) {
        window.setTimeout(closeFilters, 80);
      }
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeFilters();
    });
  }
  function updateCatalogUrl(state, recentOnly) {
    const next = new URLSearchParams();
    if (state.category && state.category !== "all") next.set("category", state.category);
    if (state.subcategory) next.set("subcategory", state.subcategory);
    if (state.brand) next.set("brand", state.brand);
    if (state.size) next.set("size", state.size);
    if (state.clearance && state.category !== "clearance") next.set("clearance", "true");
    if (state.search) next.set("search", state.search);
    if (state.sort && state.sort !== "new") next.set("sort", state.sort);
    const query = next.toString();
    history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}`);
  }
  async function renderCatalogPage({ recentOnly = false } = {}) {
    renderLoadingCards("#productGrid", 6);
    const params = new URLSearchParams(location.search);
    const requestedCategory = params.get("category");
    const category = !requestedCategory || requestedCategory === "all" ? "all" : normalizeCategory(requestedCategory);
    const products = await getProducts();
    let state = {
      category,
      search: (params.get("search") || "").toLowerCase().trim(),
      sort: params.get("sort") || (recentOnly ? "new" : "new"),
      subcategory: params.get("subcategory") || "",
      brand: params.get("brand") || "",
      size: params.get("size") || "",
      clearance: params.get("clearance") === "true" || category === "clearance"
    };
    let visibleLimit = Number(params.get("limit") || 12);
    setupMobileFilters();
    renderCategoryLinks(state.category, products, recentOnly);
    renderValueFilters(state, products);
    const searchInput = $("#shopSearch");
    const sortSelect = $("#sortSelect");
    if (searchInput) searchInput.value = state.search;
    if (sortSelect) sortSelect.value = state.sort;
    const apply = (resetLimit = false) => {
      if (resetLimit) visibleLimit = 12;
      state.search = (searchInput?.value || "").toLowerCase().trim();
      state.sort = sortSelect?.value || "new";
      const min = Number($("#minPrice")?.value || 0);
      const max = Number($("#maxPrice")?.value || 0);
      let list = products.slice();
      if (state.category !== "all" && state.category !== "clearance") list = list.filter(item => item.category === state.category);
      if (state.category === "clearance" || state.clearance) list = list.filter(isClearance);
      if (state.subcategory) list = list.filter(item => item.subcategory === state.subcategory || matchesSubcategory(item, state.subcategory));
      if (state.brand) list = list.filter(item => item.brand === state.brand || productBrandName(item) === state.brand);
      if (state.size) list = list.filter(item => productSizeBucket(item) === state.size);
      if (min) list = list.filter(item => currentPrice(item) >= min);
      if (max) list = list.filter(item => currentPrice(item) <= max);
      if (state.search) list = list.filter(item => [item.name, item.brand, item.sku, item.materials, item.description, item.subcategory, item.style, categoryLabel(item.category)].join(" ").toLowerCase().includes(state.search));
      if (state.sort === "new") list.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      if (state.sort === "priceAsc") list.sort((a, b) => currentPrice(a) - currentPrice(b));
      if (state.sort === "priceDesc") list.sort((a, b) => currentPrice(b) - currentPrice(a));
      if (state.sort === "nameAsc") list.sort((a, b) => a.name.localeCompare(b.name));
      if (state.sort === "clearance") list.sort((a, b) => Number(isClearance(b)) - Number(isClearance(a)));
      if (state.sort === "featured") list.sort((a, b) => Number(b.featured) - Number(a.featured));
      const title = $("#shopTitle");
      if (title && !recentOnly) title.textContent = state.subcategory || (state.category === "all" ? "Shop Luxury Furniture" : categoryLabel(state.category));
      const total = list.length;
      const visible = list.slice(0, visibleLimit);
      renderGrid("#productGrid", visible);
      const more = $("#productMore");
      if (more) {
        more.innerHTML = total > visible.length ? `<button class="btn btn-soft" type="button" data-load-more-products>Show More</button>` : "";
        $("[data-load-more-products]", more)?.addEventListener("click", () => {
          visibleLimit += 12;
          apply();
        });
      }
      updateCatalogUrl(state, recentOnly);
    };
    $("#categoryList")?.addEventListener("click", event => {
      const button = event.target.closest("[data-filter-category]");
      if (!button) return;
      state.category = button.dataset.filterCategory || "all";
      state.brand = "";
      state.size = "";
      state.clearance = state.category === "clearance";
      renderCategoryLinks(state.category, products, recentOnly);
      renderValueFilters(state, products);
      apply(true);
    });
    $("#brandFilterList")?.addEventListener("click", event => {
      const button = event.target.closest("[data-filter-brand]");
      if (!button) return;
      const value = button.dataset.filterBrand || "";
      state.brand = state.brand === value ? "" : value;
      renderValueFilters(state, products);
      apply(true);
    });
    $("#sizeFilterList")?.addEventListener("click", event => {
      const button = event.target.closest("[data-filter-size]");
      if (!button) return;
      const value = button.dataset.filterSize || "";
      state.size = state.size === value ? "" : value;
      renderValueFilters(state, products);
      apply(true);
    });
    $("#clearanceFilter")?.addEventListener("change", event => {
      state.clearance = event.target.checked;
      if (!state.clearance && state.category === "clearance") state.category = "all";
      renderCategoryLinks(state.category, products, recentOnly);
      renderValueFilters(state, products);
      apply(true);
    });
    ["#shopSearch", "#sortSelect", "#minPrice", "#maxPrice"].forEach(selector => {
      const el = $(selector);
      if (el) el.addEventListener(selector === "#shopSearch" ? "input" : "change", () => apply(true));
      if (selector === "#minPrice" || selector === "#maxPrice") el?.addEventListener("input", () => apply(true));
    });
    apply();
  }
  async function renderCollectionsPage() {
    const list = $("#collectionsList");
    if (list && !list.dataset.loaded) {
      const starter = (cfg.starterCollections || []).map(mapCollection);
      preloadImages(starter.map(collection => collection.heroImage), 6);
      list.innerHTML = starter.map((collection, index) => collectionCard(collection, false, index < 6)).join("");
    }
    const collections = await getCollections();
    preloadImages(collections.map(collection => collection.heroImage), 6);
    if (list) list.innerHTML = collections.map((collection, index) => collectionCard(collection, false, index < 6)).join("");
  }
  async function renderCollectionPage() {
    const slug = new URLSearchParams(location.search).get("slug");
    const shell = $("#collectionShell");
    if (!shell) return;
    shell.innerHTML = `<section class="editorial-hero"><div class="editorial-hero__copy"><span class="label">NUVELLE HOME</span><h1>Loading collection</h1><p>Preparing this collection story.</p></div><div class="skeleton-panel"></div></section>`;
    const collections = await getCollections();
    const collection = collections.find(item => item.slug === slug) || collections[0];
    if (!shell || !collection) return;
    document.title = `${collection.title} | ${cfg.storeName}`;
    const products = await getProducts();
    const related = products.filter(product => product.collectionSlug === collection.slug || product.category === collection.category).slice(0, 8);
    const paragraphs = String(collection.body || collection.excerpt || "").split(/\n+/).filter(Boolean);
    shell.innerHTML = `
      <section class="editorial-hero">
        <div class="editorial-hero__copy">
          <div class="page-kicker"><a href="index.html">Home</a><a href="collections.html">Collections</a><span>${escapeHtml(collection.title)}</span></div>
          <span class="label">${escapeHtml(collection.date ? String(collection.date).slice(0, 18) : "NUVELLE HOME")}</span>
          <h1>${escapeHtml(collection.title)}</h1>
          ${paragraphs.slice(0, 2).map(text => `<p>${escapeHtml(text)}</p>`).join("")}
          <div class="return-actions"><a class="btn btn-soft" href="collections.html">Back to Collections</a><a class="btn btn-soft" href="shop.html">Back to Shop</a></div>
        </div>
        <img src="${escapeHtml(collection.heroImage)}" alt="${escapeHtml(collection.title)}" ${imageAttrs(true)}>
      </section>
      <section class="section">
        <div class="container editorial-body">
          ${paragraphs.slice(2).map(text => `<p>${escapeHtml(text)}</p>`).join("")}
          ${collection.gallery.length ? `<div class="editorial-gallery">${collection.gallery.map(src => `<img src="${escapeHtml(src)}" alt="${escapeHtml(collection.title)}" ${imageAttrs()}>`).join("")}</div>` : ""}
        </div>
      </section>
      <section class="section tint">
        <div class="container">
          <div class="edge-head"><h2>Shop the collection</h2><div class="return-actions"><a class="text-link" href="shop.html?category=${collection.category}">View More</a><a class="btn btn-soft" href="shop.html">Back to Shop</a></div></div>
          <div class="product-grid" id="collectionProducts"></div>
        </div>
      </section>`;
    renderGrid("#collectionProducts", related);
  }
  async function renderProductPage() {
    const slug = new URLSearchParams(location.search).get("slug");
    const shell = $("#productShell");
    if (!shell) return;
    shell.innerHTML = `<div class="skeleton-panel"></div><aside class="product-panel"><div class="skeleton-card"><span></span><strong></strong><em></em></div></aside>`;
    const product = await findProduct(slug);
    if (!product) {
      shell.innerHTML = `<div class="empty">This product is no longer available.</div>`;
      return;
    }
    document.title = `${product.name} | ${cfg.storeName}`;
    const images = (product.images.length ? product.images : [productImage(product)]).map(src => optimizedImage(src, 1000));
    const compare = comparePrice(product);
    const discount = discountPercent(product);
    shell.innerHTML = `
      <div>
        <div class="gallery-main"><img id="mainProductImage" src="${escapeHtml(images[0])}" alt="${escapeHtml(product.name)}" ${imageAttrs(true)}></div>
        <div class="gallery-thumbs">${images.map((src, index) => `<button data-thumb="${index}"><img src="${escapeHtml(src)}" alt="${escapeHtml(product.name)} view ${index + 1}" ${imageAttrs()}></button>`).join("")}</div>
      </div>
      <aside class="product-panel">
        <div class="page-kicker product-breadcrumb"><a href="index.html">Home</a><a href="shop.html">Products</a><a href="shop.html?category=${encodeURIComponent(product.category)}">${escapeHtml(categoryLabel(product.category))}</a><span>${escapeHtml(product.name)}</span></div>
        <div class="return-actions product-return"><a class="btn btn-soft" href="shop.html">Back to Shop</a></div>
        ${isClearance(product) ? `<span class="badge sale">Clearance Final Sale${discount ? ` - Save ${discount}%` : ""}</span>` : `<span class="label">${escapeHtml(productBrandName(product) || product.brand || "Nuvelle Home")}</span>`}
        <h1>${escapeHtml(product.name)}</h1>
        <div class="muted">${escapeHtml(product.subcategory || categoryLabel(product.category))} ${product.sku ? `/ ${escapeHtml(product.sku)}` : ""}</div>
        <div class="price-row" style="font-size:22px">${compare ? `<span class="compare">${money(compare)}</span>` : ""}<span class="price ${compare || isClearance(product) ? "sale-price" : ""}">${money(currentPrice(product))}</span></div>
        <p>${escapeHtml(productDescription(product))}</p>
        <div class="detail-list">
          <div><span>Category</span><strong>${escapeHtml(categoryLabel(product.category))}</strong></div>
          ${product.style ? `<div><span>Style</span><strong>${escapeHtml(product.style)}</strong></div>` : ""}
          ${product.materials ? `<div><span>Materials</span><strong>${escapeHtml(product.materials)}</strong></div>` : ""}
          ${product.dimensions ? `<div><span>Dimensions</span><strong>${escapeHtml(product.dimensions)}</strong></div>` : ""}
        </div>
        <div class="qty-row">
          <div class="qty-control"><button type="button" data-qty-minus>${icons.minus}</button><input id="productQty" value="1" inputmode="numeric"><button type="button" data-qty-plus>${icons.plus}</button></div>
          <button class="btn btn-primary" data-add="${escapeHtml(product.slug)}">Add to Cart</button>
        </div>
        <button class="btn btn-soft" style="width:100%;margin-top:10px" data-favorite="${escapeHtml(product.slug)}">${icons.heart} Save to Favorites</button>
        <div class="ask-card"><strong>Ask about this item</strong><p class="muted small">Questions go straight to Nuvelle Care.</p><button class="btn btn-soft" data-open-product-chat>Ask Customer Care</button></div>
        ${isClearance(product) ? `<div class="care-card"><strong>Clearance terms</strong><p class="muted small">Clearance items are final sale. Discounts may reflect discontinued inventory, new inventory arriving, or packaging changes.</p></div>` : ""}
      </aside>`;
    $all("[data-thumb]", shell).forEach(btn => btn.addEventListener("click", () => { $("#mainProductImage").src = images[Number(btn.dataset.thumb)]; }));
    $("[data-qty-minus]", shell)?.addEventListener("click", () => { const input = $("#productQty"); input.value = Math.max(1, Number(input.value || 1) - 1); });
    $("[data-qty-plus]", shell)?.addEventListener("click", () => { const input = $("#productQty"); input.value = Number(input.value || 1) + 1; });
    $("[data-open-product-chat]", shell)?.addEventListener("click", () => {
      $("[data-chat-panel]")?.classList.add("open");
      const msg = $("[data-chat-form] textarea");
      if (msg) msg.value = `I have a question about ${product.name}.`;
      msg?.focus();
    });
    bindProductActions(shell);
  }

  async function renderCartPage() {
    document.body.classList.add("has-sticky-checkout");
    const list = $("#cartList");
    const items = await enrichedCart();
    if (list) {
      list.innerHTML = items.length ? items.map(item => `
        <article class="cart-item">
        <img src="${escapeHtml(productImage(item, 260))}" alt="${escapeHtml(item.name)}" ${imageAttrs(true)}>
          <div><h3>${escapeHtml(item.name)}</h3><div class="muted small">${escapeHtml(item.brand || "Nuvelle Home")}</div><div class="cart-item-actions"><div class="qty-control" style="width:112px"><button type="button" data-cart-dec="${escapeHtml(item.key)}">${icons.minus}</button><input value="${Number(item.quantity || 1)}" data-cart-qty="${escapeHtml(item.key)}"><button type="button" data-cart-inc="${escapeHtml(item.key)}">${icons.plus}</button></div><button class="remove-btn" data-cart-remove="${escapeHtml(item.key)}">Remove</button></div></div>
          <div class="price-row"><strong>${money(currentPrice(item) * Number(item.quantity || 1))}</strong></div>
        </article>`).join("") : `<div class="empty">Your cart is empty. Start with the latest arrivals or clearance pieces.</div>`;
    }
    bindCartControls();
    renderSummary(items);
    renderStickyCheckout();
  }
  function bindCartControls() {
    $all("[data-cart-inc]").forEach(btn => btn.addEventListener("click", () => {
      const item = getCart().find(entry => entry.key === btn.dataset.cartInc);
      if (item) { updateCartItem(item.key, Number(item.quantity || 1) + 1); renderCartPage(); }
    }));
    $all("[data-cart-dec]").forEach(btn => btn.addEventListener("click", () => {
      const item = getCart().find(entry => entry.key === btn.dataset.cartDec);
      if (item) { updateCartItem(item.key, Math.max(1, Number(item.quantity || 1) - 1)); renderCartPage(); }
    }));
    $all("[data-cart-qty]").forEach(input => input.addEventListener("change", () => { updateCartItem(input.dataset.cartQty, input.value); renderCartPage(); }));
    $all("[data-cart-remove]").forEach(btn => btn.addEventListener("click", () => { removeCartItem(btn.dataset.cartRemove); renderCartPage(); }));
  }
  function renderSummary(items = getCart(), delivery = 0) {
    const el = $("#cartSummary");
    if (!el) return;
    const sub = subtotal(items);
    el.innerHTML = `
      <div class="summary-card">
        <span class="label">Order Summary</span>
        <div class="summary-line"><span>Subtotal</span><strong>${money(sub)}</strong></div>
        <div class="summary-line"><span>Estimated delivery</span><strong>${delivery ? money(delivery) : "Calculated by ZIP"}</strong></div>
        <div class="summary-line"><span>Total before tax</span><strong>${money(sub + Number(delivery || 0))}</strong></div>
        <a class="btn btn-primary" style="width:100%;margin-top:12px" href="checkout.html">Proceed to Secure Checkout</a>
        <a class="btn btn-soft" style="width:100%;margin-top:8px" href="shop.html">Continue Shopping</a>
      </div>`;
  }
  function renderStickyCheckout() {
    const sticky = $("[data-sticky-checkout]");
    if (!sticky) return;
    const isCheckout = document.body.dataset.page === "checkout";
    sticky.innerHTML = `<div class="sticky-checkout__inner"><div><strong>${money(subtotal())}</strong><div class="muted small">${isCheckout ? "Ready when details are complete" : "Secure checkout"}</div></div>${isCheckout ? `<button class="btn btn-primary" type="button" data-submit-checkout>Pay</button>` : `<a class="btn btn-primary" href="checkout.html">Checkout</a>`}</div>`;
  }
  async function deliveryQuote(method, zip, whiteGlove) {
    const { deliveryRules: rules } = await getSettings();
    if (method === "pickup") return { fee: Number(rules.pickupFee || 0), label: "Pickup" };
    const digits = String(zip || "").replace(/\D/g, "");
    if (digits.length !== 5) return { fee: null, label: "Enter a 5-digit ZIP" };
    let fee = null;
    if ((rules.localZipPrefixes || []).some(prefix => digits.startsWith(String(prefix)))) fee = Number(rules.localDeliveryFee || 0);
    else {
      const zipNum = Number(digits);
      if (zipNum >= Number(rules.floridaZipStart || 32000) && zipNum <= Number(rules.floridaZipEnd || 34999)) fee = Number(rules.floridaDeliveryFee || 0);
    }
    if (fee === null) return { fee: null, label: rules.outsideFloridaMessage || "Delivery quote required" };
    if (whiteGlove) fee += Number(rules.whiteGloveFee || 0);
    return { fee, label: whiteGlove ? "White-glove delivery" : "Delivery" };
  }
  async function renderCheckoutPage() {
    document.body.classList.add("has-sticky-checkout");
    const items = await enrichedCart();
    const review = $("#checkoutItems");
    if (review) review.innerHTML = items.length ? items.map(item => `<div class="summary-line"><span>${escapeHtml(item.name)} x ${Number(item.quantity || 1)}</span><strong>${money(currentPrice(item) * Number(item.quantity || 1))}</strong></div>`).join("") : `<div class="empty">Your cart is empty.</div>`;
    const form = $("#checkoutForm");
    const methodInputs = $all("input[name='delivery_method']");
    const update = async () => {
      const method = $("input[name='delivery_method']:checked")?.value || "delivery";
      const quote = await deliveryQuote(method, $("#zip")?.value, $("#whiteGlove")?.checked);
      const total = subtotal(items) + Number(quote.fee || 0);
      $("#deliveryEstimate").textContent = quote.fee === null ? quote.label : money(quote.fee);
      $("#checkoutSubtotal").textContent = money(subtotal(items));
      $("#checkoutTotal").textContent = money(total);
      const submit = $("#checkoutSubmit");
      if (submit) submit.disabled = !items.length || (method !== "pickup" && quote.fee === null);
      const stickySubmit = $("[data-submit-checkout]");
      if (stickySubmit) stickySubmit.disabled = submit?.disabled || false;
    };
    $("#zip")?.addEventListener("input", update);
    $("#whiteGlove")?.addEventListener("change", update);
    methodInputs.forEach(input => input.addEventListener("change", update));
    form?.addEventListener("submit", async event => {
      event.preventDefault();
      const method = $("input[name='delivery_method']:checked")?.value || "delivery";
      const quote = await deliveryQuote(method, $("#zip")?.value, $("#whiteGlove")?.checked);
      if (method !== "pickup" && quote.fee === null) { showToast("Enter a Florida delivery ZIP or choose pickup.", true); return; }
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.white_glove = Boolean($("#whiteGlove")?.checked);
      payload.delivery_fee = quote.fee || 0;
      payload.items = getCart();
      try {
        $("#checkoutSubmit").textContent = "Opening Secure Checkout...";
        const response = await fetch("/api/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok || !data.url) throw new Error(data.error || "Checkout is not available yet.");
        location.href = data.url;
      } catch (error) {
        $("#checkoutSubmit").textContent = "Proceed to Payment";
        showToast(error.message || "Checkout could not start.", true);
      }
    });
    await update();
    renderStickyCheckout();
    $("[data-submit-checkout]")?.addEventListener("click", () => $("#checkoutSubmit")?.click());
    await update();
  }
  async function renderFavoritesPage() {
    renderLoadingCards("#favoritesGrid", 6);
    const products = await getProducts();
    const favoriteKeys = getFavorites().map(item => item.key);
    const list = products.filter(product => favoriteKeys.includes(String(product.id || product.slug)));
    renderGrid("#favoritesGrid", list);
  }
  async function renderClearancePage() {
    renderLoadingCards("#clearancePageGrid", 6);
    const products = (await getProducts()).filter(isClearance);
    renderGrid("#clearancePageGrid", products);
    const best = products.reduce((max, item) => Math.max(max, discountPercent(item)), 0);
    const badge = $("#clearanceSave");
    if (badge && best) badge.textContent = `Save up to ${best}%`;
  }
  function mapJournalPost(post) {
    const images = asArray(post.images || post.gallery_images).map(src => optimizedImage(src, 900));
    const hero = optimizedImage(post.hero_image || post.image_url || images[0] || "nuvelle-showroom-branded-v2.jpg", 1000);
    const sectionSource = Array.isArray(post.sections) && post.sections.length
      ? post.sections
      : String(post.body || "").split(/\n+/).filter(Boolean);
    const sections = sectionSource.map(section => Array.isArray(section) ? section : [String(section || "")]).filter(section => section.join("").trim());
    return {
      id: String(post.slug || post.id || slugify(post.title)),
      title: post.title || "Nuvelle Journal",
      date: post.label || post.date_label || post.created_at || "Nuvelle Journal",
      excerpt: post.excerpt || "",
      image: hero,
      images: [hero, ...images.filter(src => src && src !== hero)].filter(Boolean),
      sections
    };
  }
  async function loadJournalPosts(limit = 0) {
    if (journalCache) return limit ? journalCache.slice(0, limit) : journalCache;
    const cached = readSessionCache(storageKeys.journalCache);
    if (cached?.length) {
      journalCache = cached;
      return limit ? journalCache.slice(0, limit) : journalCache;
    }
    initSupabase();
    let data = [];
    try {
      if (sb) {
        const response = await sb.from("journal_posts").select("*").eq("published", true).order("sort_order", { ascending: true });
        if (response.error) throw response.error;
        data = response.data || [];
      } else {
        data = await supabaseRest("journal_posts", "?select=*&published=eq.true&order=sort_order.asc");
      }
    } catch {
      try {
        data = await supabaseRest("journal_posts", "?select=*&published=eq.true&order=sort_order.asc");
      } catch {
        data = [];
      }
    }
    journalCache = (data || []).map(mapJournalPost);
    writeSessionCache(storageKeys.journalCache, journalCache);
    return limit ? journalCache.slice(0, limit) : journalCache;
  }
  function journalCard(post) {
    return `
      <button class="journal-card" type="button" data-journal="${escapeHtml(post.id)}">
        <img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}" loading="lazy" decoding="async">
        <div class="journal-card__body">
          <span class="label">${escapeHtml(String(post.date).slice(0, 22))}</span>
          <h3>${escapeHtml(post.title)}</h3>
          <p>${escapeHtml(post.excerpt)}</p>
          <span class="text-link">Read article</span>
        </div>
      </button>`;
  }
  function bindJournalCards(root = document) {
    $all("[data-journal]", root).forEach(btn => btn.addEventListener("click", () => openJournal(btn.dataset.journal)));
  }
  async function openJournal(id) {
    const posts = await loadJournalPosts();
    const post = posts.find(item => item.id === id) || posts[0];
    const modal = $("#journalModal");
    const article = $("#journalArticle");
    if (!post || !modal || !article) return;
    const bodyImages = post.images.filter(src => src !== post.image);
    const body = post.sections.map((section, index) => {
      const text = section.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join("");
      const image = bodyImages[index % bodyImages.length];
      return `${text}${image ? `<figure><img src="${escapeHtml(image)}" alt="${escapeHtml(post.title)}" loading="lazy" decoding="async"><figcaption>${escapeHtml(post.title)}</figcaption></figure>` : ""}`;
    }).join("");
    const related = posts.filter(item => item.id !== post.id).slice(0, 3);
    article.innerHTML = `
      <div class="page-kicker title-breadcrumb journal-modal-breadcrumb"><a href="index.html">Home</a><a href="journal.html">Journal</a><span>${escapeHtml(post.title)}</span></div>
      <div class="journal-hero">
        <img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}" loading="eager" decoding="async">
        <div>
          <span class="label">${escapeHtml(String(post.date).slice(0, 22))}</span>
          <h1>${escapeHtml(post.title)}</h1>
          <p>${escapeHtml(post.excerpt)}</p>
        </div>
      </div>
      <div class="journal-body">
        ${body || `<p>${escapeHtml(post.excerpt)}</p>`}
        ${related.length ? `<h2>More Journal</h2><div class="related-grid">${related.map(journalCard).join("")}</div>` : ""}
      </div>`;
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    bindJournalCards(article);
  }
  function closeJournal() {
    const modal = $("#journalModal");
    if (!modal) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }
  async function renderJournalPage() {
    const grid = $("#journalGrid");
    if (!grid) return;
    const posts = await loadJournalPosts();
    if (!posts.length) {
      grid.innerHTML = `<div class="empty">Journal stories will appear here soon.</div>`;
      return;
    }
    grid.innerHTML = posts.map(journalCard).join("");
    bindJournalCards(grid);
  }
  async function renderAboutPage() {
    await getSettings();
    const aboutImages = showcaseImages.about || {};
    $all("[data-about-image]").forEach(img => {
      const key = img.dataset.aboutImage;
      const src = aboutImages[key];
      if (src) img.src = optimizedImage(src, key === "hero" ? 1400 : 900);
    });
  }
  function setupFaqSearch() {
    const input = $("[data-faq-search]");
    if (!input) return;
    input.addEventListener("input", () => {
      const query = input.value.trim().toLowerCase();
      $all(".faq-list details").forEach(item => {
        item.hidden = query && !item.textContent.toLowerCase().includes(query);
      });
    });
  }
  async function renderHomeJournal() {
    const grid = $("#homeJournalGrid");
    if (!grid) return;
    const posts = await loadJournalPosts();
    if (!posts.length) {
      const section = grid.closest("section");
      if (section) section.style.display = "none";
      return;
    }
    grid.innerHTML = posts.map(journalCard).join("");
    bindJournalCards(grid);
  }
  async function sendChatMessage(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.message) return;
    const thread = localStorage.getItem(storageKeys.chatThread) || crypto.randomUUID();
    localStorage.setItem(storageKeys.chatThread, thread);
    const list = $("[data-chat-messages]");
    if (list) list.insertAdjacentHTML("beforeend", `<div class="chat-message">${escapeHtml(data.message)}</div>`);
    form.message.value = "";
    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, thread_id: thread, page_url: location.href })
      });
      showToast("Message sent to Nuvelle Care");
      loadChatMessages();
    } catch {
      showToast("Message saved here. Please email us if you need urgent help.", true);
    }
  }
  async function loadChatMessages() {
    const thread = localStorage.getItem(storageKeys.chatThread);
    const list = $("[data-chat-messages]");
    if (!thread || !list) return;
    try {
      const response = await fetch(`/api/chat?thread_id=${encodeURIComponent(thread)}`);
      if (!response.ok) return;
      const data = await response.json();
      const messages = data.messages || [];
      if (!messages.length) return;
      list.innerHTML = messages.map(message => `<div class="chat-message ${message.sender === "admin" ? "admin" : ""}">${escapeHtml(message.message)}</div>`).join("");
      list.scrollTop = list.scrollHeight;
    } catch {}
  }

  window.NuvelleStore = { getProducts, money, addToCart, getCart, saveCart, showToast };

  document.addEventListener("DOMContentLoaded", async () => {
    warmNetwork();
    injectChrome();
    setupHeaderStop();
    setupHeroVideo();
    const page = document.body.dataset.page;
    if (page === "home") await renderHome();
    if (page === "shop") await renderCatalogPage();
    if (page === "recently-added") await renderCatalogPage({ recentOnly: true });
    if (page === "furniture") await renderFurniturePage();
    if (page === "collections") await renderCollectionsPage();
    if (page === "collection") await renderCollectionPage();
    if (page === "product") await renderProductPage();
    if (page === "cart") await renderCartPage();
    if (page === "checkout") await renderCheckoutPage();
    if (page === "favorites") await renderFavoritesPage();
    if (page === "clearance") await renderClearancePage();
    if (page === "journal") await renderJournalPage();
    if (page === "about") await renderAboutPage();
    setupFaqSearch();
    renderStickyCheckout();
  });
})();
