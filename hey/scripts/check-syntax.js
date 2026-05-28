const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const files = [
  "assets/js/config.js",
  "assets/js/storefront.js",
  "assets/js/admin.js",
  "api/create-checkout-session.js",
  "api/stripe-webhook.js",
  "api/chat.js"
];

let failed = false;
for (const file of files) {
  const full = path.join(root, file);
  try {
    new Function(fs.readFileSync(full, "utf8"));
    console.log(`ok ${file}`);
  } catch (error) {
    failed = true;
    console.error(`fail ${file}: ${error.message}`);
  }
}

process.exit(failed ? 1 : 0);
