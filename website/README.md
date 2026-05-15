# Bloom Client Website

Standalone public website for `bloomclient.org`, built with Vite and TypeScript.

## Features

- Public landing page for Bloom Client
- Downloads page powered by the existing `latest.json` update manifest format
- Optional Supabase-powered news feed
- Staff and about pages
- SEO files for `bloomclient.org`
- Static deploy output in `website/dist`
- VPS/domain-ready `nginx.conf`

## Local Development

```bash
cd website
cp .env.example .env
npm install
npm run dev
```

## Environment Variables

Use `website/.env.example` as the source of truth.

- `VITE_SITE_URL`: canonical production URL
- `VITE_UPDATES_JSON_URL`: public URL/path to the update manifest (`latest.json` format)
- `VITE_SUPABASE_URL`: Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Supabase anon key
- `VITE_SUPABASE_SUPPORT_FUNCTION_URL`: optional override for support checkout calls; defaults to `VITE_SUPABASE_URL/functions/v1/support`
- `VITE_SUPABASE_NEWS_*`: table and column settings for the news feed

## Supabase Storage Downloads

Create a public Supabase Storage bucket named `updates`. Upload the Windows installer, optional MSI, and `latest.json` to that bucket. The website fetches `latest.json` on each page load with `cache: "no-store"`, so updating that one object updates the download buttons without redeploying the website.

Set `VITE_UPDATES_JSON_URL` to the public object URL:

```env
VITE_UPDATES_JSON_URL=https://YOUR_PROJECT_REF.supabase.co/storage/v1/object/public/updates/latest.json
```

Use this manifest shape:

```json
{
  "version": "1.5.6",
  "installerUrl": "https://YOUR_PROJECT_REF.supabase.co/storage/v1/object/public/updates/Bloom%20Client_1.5.6_x64-setup.exe",
  "assetName": "Bloom Client_1.5.6_x64-setup.exe",
  "msiUrl": "https://YOUR_PROJECT_REF.supabase.co/storage/v1/object/public/updates/Bloom%20Client_1.5.6_x64_en-US.msi",
  "msiAssetName": "Bloom Client_1.5.6_x64_en-US.msi",
  "windows": {
    "installerUrl": "https://YOUR_PROJECT_REF.supabase.co/storage/v1/object/public/updates/Bloom%20Client_1.5.6_x64-setup.exe",
    "assetName": "Bloom Client_1.5.6_x64-setup.exe",
    "nsisUrl": "https://YOUR_PROJECT_REF.supabase.co/storage/v1/object/public/updates/Bloom%20Client_1.5.6_x64-setup.exe",
    "nsisAssetName": "Bloom Client_1.5.6_x64-setup.exe",
    "msiUrl": "https://YOUR_PROJECT_REF.supabase.co/storage/v1/object/public/updates/Bloom%20Client_1.5.6_x64_en-US.msi",
    "msiAssetName": "Bloom Client_1.5.6_x64_en-US.msi"
  }
}
```

For a new release, upload the new files first, then replace `updates/latest.json` last. That keeps the website from pointing at files that are not uploaded yet.

## Production Build

```bash
cd website
npm run build
```

Static output is generated in `website/dist`.

## Deploy Options

### Static Hosts

Set the build command to:

```bash
cd website && npm install && npm run build
```

Set the publish/output directory to:

```bash
website/dist
```

Point `bloomclient.org` and `www.bloomclient.org` at that host using the DNS records they provide.

### VPS Deploy (Nginx)

1. Build the site: `npm run build`
2. Upload `website/dist` to your VPS (example: `/var/www/bloom-client-website/dist`)
3. Use `website/deploy/nginx.conf` as your server block
4. Add TLS certificates with Certbot for `bloomclient.org` and `www.bloomclient.org`
