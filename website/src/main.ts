import { createClient } from "@supabase/supabase-js";
import "./style.css";

type UpdatePlatform = {
  installerUrl?: string;
  assetName?: string;
  nsisUrl?: string;
  nsisAssetName?: string;
  msiUrl?: string;
  msiAssetName?: string;
  fallbackInstallerUrls?: string[];
};

type UpdateManifest = {
  version?: string;
  installerUrl?: string;
  assetName?: string;
  msiUrl?: string;
  msiAssetName?: string;
  fallbackInstallerUrls?: string[];
  windows?: UpdatePlatform;
};

type Release = {
  version: string;
  exeUrl?: string;
  exeAssetName?: string;
  msiUrl?: string;
  msiAssetName?: string;
};

type NewsItem = {
  id?: string | number;
  slug?: string;
  title: string;
  summary: string;
  published_at?: string;
};

type AppState = {
  release?: Release;
  releaseError?: string;
  news: NewsItem[];
  newsError?: string;
};

type Route = "/" | "/downloads" | "/news" | "/staff" | "/about";

const updatesJsonUrl = import.meta.env.VITE_UPDATES_JSON_URL || "/latest.json";
const siteUrl = import.meta.env.VITE_SITE_URL || "https://bloomclient.org";

const state: AppState = {
  news: []
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app root.");
const root = app;

const navItems: Array<{ path: Route; label: string }> = [
  { path: "/", label: "Home" },
  { path: "/downloads", label: "Downloads" },
  { path: "/news", label: "News" },
  { path: "/staff", label: "Staff" },
  { path: "/about", label: "About" }
];

const productCards = [
  {
    title: "Instance launcher",
    body: "Create Fabric 1.21.11 instances, manage memory, launch profiles, and keep your setup organized."
  },
  {
    title: "Cosmetics locker",
    body: "Equip capes, preview cosmetics, manage Bloom Bucks, and sync account-owned items."
  },
  {
    title: "Marketplace tools",
    body: "Browse downloads, packs, resource packs, shaders, and curated client utilities."
  },
  {
    title: "Built-in games",
    body: "Play client-side games like tower defense, Tetris, and 3D paddle games directly in Bloom."
  }
];

const staffMembers = [
  { name: "Parks", role: "Owner", image: "/staff/parks.jpg" },
  { name: "DragonSam", role: "Co-Owner", image: "/staff/dragonsam.png" },
  { name: "Sn1cy", role: "Head Manager", image: "/staff/sn1cy.png" },
  { name: "Wqfflez", role: "Manager", image: "/staff/wqfflez.png" }
];

function routeFromPath(pathname = window.location.pathname): Route {
  if (pathname === "/downloads") return "/downloads";
  if (pathname === "/news") return "/news";
  if (pathname === "/staff") return "/staff";
  if (pathname === "/about") return "/about";
  return "/";
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value?: string): string {
  if (!value) return "Unscheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function inferAssetName(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.split("/").pop() || "");
  } catch {
    return decodeURIComponent(url.split("?")[0].split("/").pop() || "");
  }
}

function parseRelease(payload: UpdateManifest): Release {
  const windows = payload.windows || {};
  const exeUrl =
    windows.installerUrl ||
    windows.nsisUrl ||
    payload.installerUrl ||
    windows.fallbackInstallerUrls?.[0] ||
    payload.fallbackInstallerUrls?.[0];
  const msiUrl = windows.msiUrl || payload.msiUrl;

  return {
    version: payload.version || "unknown",
    exeUrl,
    exeAssetName:
      windows.assetName ||
      windows.nsisAssetName ||
      payload.assetName ||
      inferAssetName(exeUrl),
    msiUrl,
    msiAssetName: windows.msiAssetName || payload.msiAssetName || inferAssetName(msiUrl)
  };
}

async function loadRelease(): Promise<void> {
  try {
    const response = await fetch(updatesJsonUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Manifest request failed (${response.status}).`);
    state.release = parseRelease((await response.json()) as UpdateManifest);
  } catch (error) {
    state.releaseError = error instanceof Error ? error.message : "Could not load the latest release.";
  }
}

async function loadNews(): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    state.news = [
      {
        title: "Bloom Client website is live",
        summary: "Release notes and client updates will appear here.",
        published_at: new Date().toISOString()
      }
    ];
    return;
  }

  const table = import.meta.env.VITE_SUPABASE_NEWS_TABLE || "news_posts";
  const fields = import.meta.env.VITE_SUPABASE_NEWS_FIELDS || "id,title,slug,summary,published_at";
  const orderColumn = import.meta.env.VITE_SUPABASE_NEWS_ORDER_COLUMN || "published_at";
  const publishedColumn = import.meta.env.VITE_SUPABASE_NEWS_PUBLISHED_COLUMN || "is_published";
  const limit = Number(import.meta.env.VITE_SUPABASE_NEWS_LIMIT || 8);

  const supabase: any = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false }
  });

  let query: any = supabase
    .from(table)
    .select(fields)
    .order(orderColumn, { ascending: false })
    .limit(Number.isFinite(limit) ? limit : 8);

  if (publishedColumn) query = query.eq(publishedColumn, true);

  const { data, error }: { data: Record<string, unknown>[] | null; error: { message?: string } | null } = await query;
  if (error || !data) {
    state.news = [];
    state.newsError = error?.message || `Could not load posts from "${table}".`;
    return;
  }

  state.news = data.map((row: Record<string, unknown>) => ({
    id: row.id as string | number | undefined,
    slug: row.slug as string | undefined,
    title: (row.title as string | undefined) || "Untitled",
    summary:
      (row.summary as string | undefined) ||
      (row.excerpt as string | undefined) ||
      "No summary provided.",
    published_at: row.published_at as string | undefined
  }));
}

function releaseButtons(className = "hero-actions"): string {
  const release = state.release;
  const exe = release?.exeUrl
    ? `<a class="btn primary" href="${escapeHtml(release.exeUrl)}" target="_blank" rel="noreferrer">Download Windows</a>`
    : `<span class="btn disabled">Download unavailable</span>`;
  const msi = release?.msiUrl
    ? `<a class="btn secondary" href="${escapeHtml(release.msiUrl)}" target="_blank" rel="noreferrer">Download MSI</a>`
    : `<a class="btn secondary" href="/downloads" data-route="/downloads">View downloads</a>`;
  return `<div class="${className}">${exe}${msi}</div>`;
}

function renderHeader(route: Route): string {
  return `
    <header class="site-header">
      <a class="brand" href="/" data-route="/">
        <img src="/logo.png" alt="Bloom Client logo" />
        <span>Bloom Client</span>
      </a>
      <nav class="nav">
        ${navItems
          .map(
            (item) =>
              `<a class="${item.path === route ? "active" : ""}" href="${item.path}" data-route="${item.path}">${item.label}</a>`
          )
          .join("")}
      </nav>
      <a class="top-download" href="/downloads" data-route="/downloads">Start download</a>
    </header>
  `;
}

function renderHome(): string {
  return `
    <section class="hero-section">
      <div class="hero-copy">
        <p class="eyebrow">Official Bloom Client</p>
        <h1>Bloom Client</h1>
        <p class="lead">A focused Minecraft launcher for clean instances, synced cosmetics, marketplace tools, account utilities, and creator-ready client features.</p>
        ${releaseButtons()}
      </div>
    </section>

    <section class="section">
      <div class="section-heading">
        <p class="eyebrow">Client tools</p>
        <h2>Built around the client, not a landing page.</h2>
      </div>
      <div class="feature-grid">
        ${productCards
          .map(
            (card) => `
              <article class="feature-card">
                <h3>${escapeHtml(card.title)}</h3>
                <p>${escapeHtml(card.body)}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>

    <section class="section split-band">
      <div>
        <p class="eyebrow">Updates</p>
        <h2>Get the latest Bloom Client build.</h2>
        <p>Download the current Windows release and stay ready for launcher updates, cosmetics, marketplace tools, and client features.</p>
      </div>
      <a class="btn secondary" href="/downloads" data-route="/downloads">Check downloads</a>
    </section>
  `;
}

function renderDownloads(): string {
  const release = state.release;
  const version = release?.version ? `v${escapeHtml(release.version)}` : "Unavailable";
  const detail = state.releaseError
    ? "Downloads are temporarily unavailable."
    : "Latest Windows release, ready to install.";

  return `
    <section class="page-hero compact">
      <p class="eyebrow">Downloads</p>
      <h1>Download Bloom</h1>
      <p>${detail}</p>
    </section>
    <section class="download-panel">
      <div>
        <p class="eyebrow">Current Windows build</p>
        <h2>${version}</h2>
      </div>
      <div class="download-list">
        ${
          release?.exeUrl
            ? `<a class="download-row" href="${escapeHtml(release.exeUrl)}" target="_blank" rel="noreferrer"><span>${escapeHtml(release.exeAssetName || "Windows installer")}</span><strong>EXE</strong></a>`
            : `<div class="download-row disabled-row"><span>Windows installer unavailable</span><strong>EXE</strong></div>`
        }
        ${
          release?.msiUrl
            ? `<a class="download-row" href="${escapeHtml(release.msiUrl)}" target="_blank" rel="noreferrer"><span>${escapeHtml(release.msiAssetName || "Windows MSI")}</span><strong>MSI</strong></a>`
            : `<div class="download-row disabled-row"><span>MSI unavailable</span><strong>MSI</strong></div>`
        }
      </div>
    </section>
  `;
}

function renderNews(): string {
  if (state.newsError) {
    return `
      <section class="page-hero compact">
        <p class="eyebrow">News</p>
        <h1>Bloom updates</h1>
        <p>News posts are temporarily unavailable.</p>
      </section>
    `;
  }

  return `
    <section class="page-hero compact">
      <p class="eyebrow">News</p>
      <h1>Bloom updates</h1>
      <p>Release notes, client changes, and project posts.</p>
    </section>
    <section class="news-list">
      ${
        state.news.length
          ? state.news
              .map(
                (item) => `
                  <article class="news-card">
                    <time>${escapeHtml(formatDate(item.published_at))}</time>
                    <h2>${escapeHtml(item.title)}</h2>
                    <p>${escapeHtml(item.summary)}</p>
                  </article>
                `
              )
              .join("")
          : `<article class="news-card"><h2>No posts yet</h2><p>Published news will appear here.</p></article>`
      }
    </section>
  `;
}

function renderStaff(): string {
  return `
    <section class="page-hero compact">
      <p class="eyebrow">Staff</p>
      <h1>Bloom team</h1>
      <p>The people building, shipping, and moderating Bloom Client.</p>
    </section>
    <section class="staff-grid">
      ${staffMembers
        .map(
          (member) => `
            <article class="staff-card">
              <img src="${member.image}" alt="${member.name} profile picture" onerror="this.onerror=null;this.src='/staff/placeholder.svg';" />
              <h2>${escapeHtml(member.name)}</h2>
              <p>${escapeHtml(member.role)}</p>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function renderAbout(): string {
  return `
    <section class="page-hero compact">
      <p class="eyebrow">About</p>
      <h1>Built for the Bloom ecosystem.</h1>
      <p>This site hosts public downloads, project updates, staff information, and official Bloom Client resources.</p>
    </section>
    <section class="about-grid">
      <article>
        <h2>Launcher first</h2>
        <p>Bloom focuses on Minecraft client workflows: instances, launch settings, cosmetics, wallets, marketplace content, scripts, and in-client tools.</p>
      </article>
      <article>
        <h2>Fast downloads</h2>
        <p>Installers are hosted for simple access, so players can grab the latest Windows build without digging through release pages.</p>
      </article>
      <article>
        <h2>Official home</h2>
        <p>Use bloomclient.org for Bloom Client downloads, project news, staff information, and trusted links.</p>
      </article>
    </section>
  `;
}

function renderRoute(route: Route): string {
  if (route === "/downloads") return renderDownloads();
  if (route === "/news") return renderNews();
  if (route === "/staff") return renderStaff();
  if (route === "/about") return renderAbout();
  return renderHome();
}

function mount(): void {
  const route = routeFromPath();
  document.title = route === "/" ? "Bloom Client | Official Website" : `Bloom Client | ${navItems.find((item) => item.path === route)?.label}`;
  root.innerHTML = `
    ${renderHeader(route)}
    <main>${renderRoute(route)}</main>
    <footer class="site-footer">
      <span>Bloom Client</span>
      <span>${escapeHtml(siteUrl.replace(/^https?:\/\//, ""))}</span>
    </footer>
  `;

  root.querySelectorAll<HTMLAnchorElement>("[data-route]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      if (!href) return;
      event.preventDefault();
      window.history.pushState({}, "", href);
      mount();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

window.addEventListener("popstate", mount);

void Promise.all([loadRelease(), loadNews()]).finally(mount);
