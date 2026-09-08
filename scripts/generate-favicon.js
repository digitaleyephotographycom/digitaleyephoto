const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const publicDir = path.resolve(__dirname, "../public");
const appDir = path.resolve(__dirname, "../app");

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Elegant photography brand icon with warm brown squircle and gold camera aperture
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="16" fill="#3b2a20"/>
  <circle cx="32" cy="32" r="18" fill="none" stroke="#e6c79f" stroke-width="4"/>
  <circle cx="32" cy="32" r="8" fill="#e6c79f"/>
  <circle cx="45" cy="19" r="3" fill="#e6c79f"/>
</svg>`;

fs.writeFileSync(path.join(publicDir, "icon.svg"), svg);
fs.writeFileSync(path.join(appDir, "icon.svg"), svg);

async function createFavicon() {
  const pngBuffer = await sharp(Buffer.from(svg))
    .resize(32, 32)
    .png()
    .toBuffer();

  // Write as both PNG-based favicon.ico in public and app
  fs.writeFileSync(path.join(publicDir, "favicon.ico"), pngBuffer);
  fs.writeFileSync(path.join(appDir, "favicon.ico"), pngBuffer);
  console.log("Successfully generated public/favicon.ico, app/favicon.ico, and icon.svg!");
}

createFavicon().catch(console.error);
