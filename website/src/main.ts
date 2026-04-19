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

type ResolvedUpdate = {
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
  release?: ResolvedUpdate;
  releaseError?: string;
  news: NewsItem[];
  newsError?: string;
};

type Route = "/" | "/downloads" | "/news" | "/staff" | "/about";

type NavItem = {
  path: Route;
  label: string;
  section: "main" | "more";
};

const navItems: NavItem[] = [
  { path: "/", label: "Overview", section: "main" },
  { path: "/downloads", label: "Downloads", section: "main" },
  { path: "/news", label: "News", section: "main" },
  { path: "/staff", label: "Staff", section: "main" },
  { path: "/about", label: "About", section: "more" }
];

const updatesJsonUrl = import.meta.env.VITE_UPDATES_JSON_URL || "/latest.json";
const siteUrl = import.meta.env.VITE_SITE_URL || "https://bloomclient.org";

const state: AppState = {
  news: []
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Missing #app root element.");
}
const root = app;

function getRoute(pathname = window.location.pathname): Route {
  if (pathname === "/downloads") {
    return "/downloads";
  }
  if (pathname === "/news") {
    return "/news";
  }
  if (pathname === "/about") {
    return "/about";
  }
  if (pathname === "/staff") {
    return "/staff";
  }
  return "/";
}

function inferAssetName(url?: string): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.split("/");
    return decodeURIComponent(pathname[pathname.length - 1] || "");
  } catch {
    const pathname = url.split("?")[0].split("/");
    return decodeURIComponent(pathname[pathname.length - 1] || "");
  }
}

function parseUpdateManifest(payload: UpdateManifest): ResolvedUpdate {
  const windows = payload.windows || {};

  const exeUrl =
    windows.installerUrl ||
    windows.nsisUrl ||
    payload.installerUrl ||
    payload.fallbackInstallerUrls?.[0] ||
    windows.fallbackInstallerUrls?.[0];

  const exeAssetName =
    windows.assetName ||
    windows.nsisAssetName ||
    payload.assetName ||
    inferAssetName(exeUrl);

  const msiUrl = windows.msiUrl || payload.msiUrl;
  const msiAssetName =
    windows.msiAssetName || payload.msiAssetName || inferAssetName(msiUrl);

  return {
    version: payload.version || "unknown",
    exeUrl,
    exeAssetName,
    msiUrl,
    msiAssetName
  };
}

function formatDate(dateValue?: string): string {
  if (!dateValue) {
    return "Unscheduled";
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function loadRelease(): Promise<void> {
  try {
    const response = await fetch(updatesJsonUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Manifest request failed (${response.status}).`);
    }

    const payload = (await response.json()) as UpdateManifest;
    state.release = parseUpdateManifest(payload);
  } catch (error) {
    state.releaseError =
      error instanceof Error
        ? error.message
        : "Could not load release manifest.";
  }
}

async function loadNews(): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    state.news = [
      {
        title: "News feed offline",
        summary: "Set Supabase credentials in website/.env to load live posts.",
        published_at: new Date().toISOString()
      }
    ];
    return;
  }

  const table = import.meta.env.VITE_SUPABASE_NEWS_TABLE || "news_posts";
  const fields =
    import.meta.env.VITE_SUPABASE_NEWS_FIELDS ||
    "id,title,slug,summary,published_at";
  const orderColumn =
    import.meta.env.VITE_SUPABASE_NEWS_ORDER_COLUMN || "published_at";
  const publishedColumn =
    import.meta.env.VITE_SUPABASE_NEWS_PUBLISHED_COLUMN || "is_published";
  const limit = Number(import.meta.env.VITE_SUPABASE_NEWS_LIMIT || 8);

  const supabase: any = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false }
  });

  let query: any = supabase
    .from(table)
    .select(fields)
    .order(orderColumn, { ascending: false })
    .limit(Number.isFinite(limit) ? limit : 8);

  if (publishedColumn) {
    query = query.eq(publishedColumn, true);
  }

  const { data, error }: { data: Record<string, unknown>[] | null; error: any } =
    await query;

  if (error || !data) {
    state.newsError =
      error?.message || `Could not load posts from Supabase table "${table}".`;
    state.news = [];
    return;
  }

  state.news = data.map((row: Record<string, unknown>) => ({
    id: (row.id as string | number | undefined) || undefined,
    slug: (row.slug as string | undefined) || undefined,
    title: (row.title as string | undefined) || "Untitled",
    summary:
      (row.summary as string | undefined) ||
      (row.excerpt as string | undefined) ||
      "No summary provided.",
    published_at: (row.published_at as string | undefined) || undefined
  }));
}

function renderSidebar(route: Route): string {
  const renderGroup = (section: "main" | "more", title: string): string => {
    const items = navItems.filter((item) => item.section === section);
    return `
      <div class="nav-group">
        <p class="group-label">${title}</p>
        <nav class="menu">
          ${items
            .map((item) => {
              const active = item.path === route ? "active" : "";
              return `<a class="menu-item ${active}" href="${item.path}" data-route="${item.path}">${item.label}</a>`;
            })
            .join("")}
        </nav>
      </div>
    `;
  };

  return `
    <aside class="sidebar">
      <div class="brand-wrap">
        <img class="brand-logo" src="/logo.png" alt="Bloom Client logo" />
        <div>
          <p class="brand-name">Bloom Client</p>
          <p class="brand-sub">Official Website</p>
        </div>
      </div>
      ${renderGroup("main", "Main")}
      ${renderGroup("more", "More")}
    </aside>
  `;
}

function renderTopbar(route: Route): string {
  const pageTitle = navItems.find((item) => item.path === route)?.label || "Overview";
  return `
    <header class="topbar">
      <h1>${pageTitle}</h1>
      <a class="ghost-link" href="${updatesJsonUrl}" target="_blank" rel="noreferrer">Manifest</a>
    </header>
  `;
}

function renderOverview(): string {
  const version = state.release?.version ? `v${escapeHtml(state.release.version)}` : "Unknown";
  const releaseStatus = state.releaseError
    ? escapeHtml(state.releaseError)
    : `Latest version detected: ${version}`;

  const recent = state.news.slice(0, 3);
  const recentCards =
    recent.length > 0
      ? recent
          .map(
            (item) => `
        <article class="mini-card">
          <p class="mini-title">${escapeHtml(item.title)}</p>
          <p class="mini-meta">${escapeHtml(formatDate(item.published_at))}</p>
        </article>
      `
          )
          .join("")
      : `
      <article class="mini-card">
        <p class="mini-title">No recent posts</p>
        <p class="mini-meta">News entries will show here.</p>
      </article>
    `;

  return `
    <section class="page-grid">
      <article class="card card-hero">
        <p class="eyebrow">Bloom</p>
        <h2>Clean launcher hub with fast access to builds and updates.</h2>
        <p class="muted">${releaseStatus}</p>
      </article>
      <article class="card">
        <h3>Quick Access</h3>
        <div class="stack-actions">
          <a class="solid-btn" href="/downloads" data-route="/downloads">Go to Downloads</a>
          <a class="ghost-btn" href="/news" data-route="/news">Read News</a>
        </div>
      </article>
      <article class="card span-2">
        <h3>Recent News</h3>
        <div class="mini-grid">${recentCards}</div>
      </article>
    </section>
  `;
}

function renderDownloads(): string {
  const release = state.release;
  const versionLabel = release?.version ? `v${escapeHtml(release.version)}` : "Unknown";
  const exeLabel = release?.exeAssetName ? escapeHtml(release.exeAssetName) : "Windows EXE";
  const msiLabel = release?.msiAssetName ? escapeHtml(release.msiAssetName) : "Windows MSI";

  const exeButton = release?.exeUrl
    ? `<a class="solid-btn" href="${escapeHtml(release.exeUrl)}" target="_blank" rel="noreferrer">${exeLabel}</a>`
    : `<span class="disabled-btn">EXE unavailable</span>`;

  const msiButton = release?.msiUrl
    ? `<a class="ghost-btn" href="${escapeHtml(release.msiUrl)}" target="_blank" rel="noreferrer">${msiLabel}</a>`
    : `<span class="disabled-btn">MSI unavailable</span>`;

  const detail = state.releaseError
    ? escapeHtml(state.releaseError)
    : `Source: ${escapeHtml(updatesJsonUrl)}`;

  return `
    <section class="page-grid single">
      <article class="card card-hero">
        <p class="eyebrow">Latest Build</p>
        <h2>${versionLabel}</h2>
        <p class="muted">${detail}</p>
      </article>
      <article class="card">
        <h3>Windows</h3>
        <div class="stack-actions">
          ${exeButton}
          ${msiButton}
        </div>
      </article>
    </section>
  `;
}

function renderNews(): string {
  if (state.newsError) {
    return `
      <section class="page-grid single">
        <article class="card">
          <h3>News feed unavailable</h3>
          <p class="muted">${escapeHtml(state.newsError)}</p>
        </article>
      </section>
    `;
  }

  const cards =
    state.news.length > 0
      ? state.news
          .map(
            (item) => `
        <article class="card">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.summary)}</p>
          <p class="muted">${escapeHtml(formatDate(item.published_at))}${
              item.slug ? ` · #${escapeHtml(item.slug)}` : ""
            }</p>
        </article>
      `
          )
          .join("")
      : `
      <article class="card">
        <h3>No posts yet</h3>
        <p class="muted">Publish news in Supabase to populate this page.</p>
      </article>
    `;

  return `<section class="page-grid single">${cards}</section>`;
}

function renderAbout(): string {
  return `
    <section class="page-grid single">
      <article class="card card-hero">
        <p class="eyebrow">About</p>
        <h2>Official Bloom Client web presence.</h2>
        <p class="muted">This website is VPS-ready and connected to your update flow manifest format.</p>
      </article>
      <article class="card">
        <h3>Production Target</h3>
        <p><code>${escapeHtml(siteUrl)}</code></p>
      </article>
    </section>
  `;
}

function renderStaff(): string {
  const members = [
    {
      name: "Parks",
      role: "Owner",
      image: "/staff/parks.jpg"
    },
    {
      name: "DragonSam",
      role: "Co-Owner",
      image: "/staff/dragonsam.png"
    },
    {
      name: "Sn1cy",
      role: "Head Manager",
      image: "/staff/sn1cy.png"
    },
    {
      name: "Wqfflez",
      role: "Manager",
      image: "/staff/wqfflez.png"
    }
  ];

  const cards = members
    .map(
      (member) => `
        <article class="staff-card">
          <img
            class="staff-avatar"
            src="${member.image}"
            alt="${member.name} profile picture"
            onerror="this.onerror=null;this.src='/staff/placeholder.svg';"
          />
          <h3>${escapeHtml(member.name)}</h3>
          <p class="staff-role">${escapeHtml(member.role)}</p>
        </article>
      `
    )
    .join("");

  return `
    <section class="staff-page">
      <article class="staff-hero">
        <h2>Meet The Bloom Staff</h2>
        <p>Core team members building and running Bloom Client.</p>
      </article>
      <div class="staff-grid">
        ${cards}
      </div>
    </section>
  `;
}

function renderPage(route: Route): string {
  if (route === "/downloads") {
    return renderDownloads();
  }
  if (route === "/news") {
    return renderNews();
  }
  if (route === "/about") {
    return renderAbout();
  }
  if (route === "/staff") {
    return renderStaff();
  }
  return renderOverview();
}

function mount(): void {
  const route = getRoute();

  root.innerHTML = `
    <div class="ambient" aria-hidden="true"></div>
    <main class="shell">
      ${renderSidebar(route)}
      <section class="content">
        ${renderTopbar(route)}
        <div class="view">${renderPage(route)}</div>
      </section>
    </main>
  `;

  root.querySelectorAll<HTMLElement>("[data-route]").forEach((el) => {
    el.addEventListener("click", (event) => {
      event.preventDefault();
      const href = el.getAttribute("data-route");
      if (!href) {
        return;
      }
      window.history.pushState({}, "", href);
      mount();
    });
  });
}

window.addEventListener("popstate", () => {
  mount();
});

void Promise.all([loadRelease(), loadNews()]).finally(() => {
  mount();
});

