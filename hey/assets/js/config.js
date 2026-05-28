window.NUVELLE_CONFIG = {
  storeName: "NUVELLE HOME",
  tagline: "Comfort meets style",
  ownerName: "Axel",
  phone: "+1 (870) 194-0214",
  phoneHref: "+18701940214",
  whatsapp: "+18701940214",
  email: "nuvellehomedecor@gmail.com",
  address: "801 Brickell Ave #1350, Miami, FL 33131, United States",
  city: "Miami",
  state: "FL",
  country: "United States",
  hours: "Monday-Friday, 9:00 AM-5:00 PM",
  weekendHours: "Closed Saturday-Sunday",
  currency: "USD",
  siteUrl: "https://nuvellhome.vercel.app",
  supabaseUrl: "https://znneeejbsiajdkvghnpf.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpubmVlZWpic2lhamRrdmdobnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzOTg0ODQsImV4cCI6MjA5NDk3NDQ4NH0.ywj3SQjpe-qFZd48KL9Svj3HmDOJnSVKlfD2erXgmzQ",
  mapEmbed: "https://www.google.com/maps?q=801%20Brickell%20Ave%20%231350%2C%20Miami%2C%20FL%2033131%2C%20United%20States&output=embed",
  categories: [
    {
      slug: "living-room",
      name: "Living Room",
      intro: "Sofas, lounge chairs, consoles, media pieces, and occasional seating for composed living spaces.",
      subcategories: ["Sofas & Sectionals", "Lounge Chairs", "Reclining Sofas & Lounge Chairs", "Coffee & Side Tables", "Consoles", "Sideboards & Cupboards", "Ottomans & Benches", "TV Stands", "Wall Units & Bookcases"]
    },
    {
      slug: "dining-room",
      name: "Dining Room",
      intro: "Dining tables, dining chairs, sideboards, bar stools, and entertaining furniture.",
      subcategories: ["Fixed Tables", "Extendable Tables", "Bistro Tables", "Chairs & Armchairs", "Bar Stools & Counter Stools", "Sideboards & Cupboards", "Dining Sets"]
    },
    {
      slug: "bedroom-furniture",
      name: "Bedroom",
      intro: "Beds, nightstands, dressers, benches, and quiet storage pieces for the bedroom.",
      subcategories: ["Double Beds", "Nightstands & Dressers", "Ottomans & Benches", "Chaise Lounges & Day Beds", "Vanities & Make Up Tables", "Artful Headboards"]
    },
    {
      slug: "office-furniture",
      name: "Office",
      intro: "Desks, office seating, bookcases, and refined storage for focused rooms.",
      subcategories: ["Home Desks & Drawers", "Office Desks & Drawers", "Chairs & Armchairs", "Conference Tables", "Sideboards & Bookcases", "Storage"]
    },
    {
      slug: "coffee-side-tables",
      name: "Coffee & Side Tables",
      intro: "Coffee tables, side tables, nesting tables, and sculptural surfaces.",
      subcategories: ["Coffee Tables", "Side Tables", "Nesting Tables", "Pedestals", "Accent Tables"]
    },
    {
      slug: "clearance",
      name: "Clearance Sales",
      intro: "Limited final-sale furniture pieces marked down as inventory changes.",
      subcategories: ["Final Sale", "Limited Quantity", "Floor Sample"]
    }
  ],
  heroVideos: [
    "hero-videos/hero-1.mp4",
    "hero-videos/hero-3.mp4",
    "hero-videos/hero-6.mp4",
    "hero-videos/hero-7.mp4",
    "hero-videos/hero-8.mp4",
    "hero-videos/hero-9.mp4",
    "hero-videos/hero-10.mp4"
  ],
  expertise: [
    { title: "Curated Furniture", text: "Every piece is selected for proportion, finish, and the way it lives in a real home." },
    { title: "Miami-Based Care", text: "Questions about scale, pickup, or delivery go directly to the Nuvelle team." },
    { title: "White-Glove Ready", text: "Large furniture orders can be handled with careful placement and delivery support." },
    { title: "Secure Checkout", text: "Online orders use Stripe checkout with pickup and ZIP-based delivery options." },
    { title: "Clearance With Clarity", text: "Final-sale markdowns clearly show reason, availability, and discount before checkout." }
  ],
  brandFallbacks: ["Marlowe", "Rowan", "Bellamy", "Vale", "Axel"],
  starterCollections: [
    {
      title: "New Living Room Collection",
      slug: "living-room-edit",
      date: "NUVELLE HOME",
      excerpt: "Sofas, lounge chairs, tables, and storage pieces selected for composed living rooms.",
      hero_image: "nuvelle-showroom-branded-v2.jpg",
      category: "living-room"
    },
    {
      title: "New Dining Room Collection",
      slug: "dining-room-edit",
      date: "NUVELLE HOME",
      excerpt: "Tables, chairs, and sideboards selected for generous hosting and polished everyday meals.",
      hero_image: "nuvelle-showroom-branded.jpg",
      category: "dining-room"
    },
    {
      title: "New Bedroom Collection",
      slug: "bedroom-edit",
      date: "NUVELLE HOME",
      excerpt: "Bedroom furniture with calmer lines, warm materials, and storage that keeps the room composed.",
      hero_image: "nuvelle-showroom-branded-v2.jpg",
      category: "bedroom-furniture"
    }
  ],
  defaultDeliveryRules: {
    pickupFee: 0,
    localZipPrefixes: ["331"],
    localDeliveryFee: 149,
    floridaZipStart: 32000,
    floridaZipEnd: 34999,
    floridaDeliveryFee: 249,
    whiteGloveFee: 399,
    outsideFloridaMessage: "Delivery quote required"
  }
};
