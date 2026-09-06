# digitalphoto

A private client photo-proofing site: you upload a shoot, share a gallery
code + password, your client taps their favourite photos and sends the
list back to you, ready to print — full 4K quality throughout.

Built with **Next.js (App Router) + React**. Full-quality photos are stored
in **Backblaze B2** (S3-compatible, free tier: 10GB storage / 1GB downloads
per day). Gallery details (name, hashed password, photo list, client
selections) are stored as small JSON files in that same B2 bucket, so
there's no separate database to set up.

---

## 1. Create your Backblaze B2 bucket (free)

1. Sign up at [backblaze.com/b2](https://www.backblaze.com/cloud-storage) (free tier, no card required to start).
2. Go to **B2 Cloud Storage → Buckets → Create a Bucket**.
   - Name it anything (e.g. `digitalphoto-studio`).
   - Set **Files in Bucket** to **Private**. All photo access and viewing
     uses temporary, short-lived signed URLs generated on-demand by the
     server after password verification.
3. Open the bucket → note the **Endpoint** (e.g. `s3.us-east-005.backblazeb2.com`)
   and the **Bucket Region** (e.g. `us-east-005`) shown on the bucket page.
4. Go to **App Keys → Add a New Application Key**.
   - Scope it to just this bucket if you can.
   - Copy the **keyID** and **applicationKey** — the applicationKey is only
     shown once.
5. Still in the bucket settings, add a **CORS Rule** (needed so the browser
   can upload photos directly to B2):
   - Allowed Origins: `*` (or your real domain once deployed)
   - Allowed Operations: `s3_put`, `s3_get`, `s3_head`
   - Allowed Headers: `*`
   - Expose Headers: `ETag`

## 2. Configure the app

```bash
cp .env.local.example .env.local
```

Fill in `.env.local` with the values from step 1:

```
B2_KEY_ID=...
B2_APPLICATION_KEY=...
B2_BUCKET_NAME=...
B2_REGION=us-east-005
B2_ENDPOINT=https://s3.us-east-005.backblazeb2.com
GALLERY_TOKEN_SECRET=any-long-random-string
```

## 3. Run it locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Choose **Photographer** to create a gallery
and upload photos; choose **Client gallery** and enter the code + password
to try the client side.

## 4. Deploy for free

The easiest free host for a Next.js app is **Vercel**:

1. Push this project to a GitHub repo.
2. Go to [vercel.com](https://vercel.com) → **New Project** → import the repo.
3. Add the same environment variables from `.env.local` in Vercel's
   **Settings → Environment Variables**.
4. Deploy. You'll get a live URL you can share with clients.

## How the flow works

- **Photographer** creates a gallery (name, event type, password) and
  drags in photos. Each photo uploads **directly from the browser to
  Backblaze B2** using a short-lived signed upload URL — originals never
  pass through the Next.js server, so there's no file-size limit to worry
  about.
- The app generates a short gallery code (e.g. `PA-4471`) to share
  alongside the password.
- **Client** enters the code + password on `/gallery`. Once verified, they
  browse the full-quality photos, tap to select, and hit **Send** — this
  writes their selection back to the gallery's metadata.
- **Photographer** opens the gallery in the dashboard, switches to the
  **Client selections** tab, and downloads the shortlist as a single ZIP
  for printing.

## Notes and limits to know about

- **Passwords are hashed** (bcrypt) before being stored — the app never
  keeps or displays the plain password, so keep a note of it yourself
  when you create a gallery.
- **No thumbnails are generated** — this keeps the app simple and free,
  but means every photo loads at full resolution in the grid. Fine for
  galleries of a few hundred photos; for very large shoots you'd want to
  add a resizing step (e.g. `sharp` in the upload route, or a Cloudflare
  Image Resizing worker in front of the bucket).
- **ZIP downloads** are built by the server fetching each selected
  original from B2 and streaming it into a ZIP — for very large
  selections this can take a while and is bounded by your hosting
  provider's request timeout (Vercel's free tier allows up to 60s per
  request by default).
- Backblaze B2's free tier includes 10GB storage and 1GB/day of downloads
  at no cost, with no bandwidth fee beyond that allowance from B2 itself —
  comfortably enough for one photographer's active client galleries.
