# Bloom Client Website

Standalone Vite + TypeScript website for Bloom Client.

## Features

- Minimal black/white responsive design
- Supabase-powered news feed
- Download section that reads the existing `latest.json` format
- Basic SEO setup (`robots.txt`, `sitemap.xml`, social metadata)
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
- `VITE_UPDATES_JSON_URL`: URL/path to update manifest (`latest.json` format)
- `VITE_SUPABASE_URL`: Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Supabase anon key
- `VITE_SUPABASE_NEWS_*`: table and column settings for the news feed

## Production Build

```bash
cd website
npm run build
```

Static output is generated in `website/dist`.

## VPS Deploy (Nginx)

1. Build the site: `npm run build`
2. Upload `website/dist` to your VPS (example: `/var/www/bloom-client-website/dist`)
3. Use `website/deploy/nginx.conf` as your server block
4. Add TLS certificates with Certbot for `bloomclient.org` and `www.bloomclient.org`
