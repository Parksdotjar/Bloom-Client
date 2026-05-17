import { createClient } from "@supabase/supabase-js";
import { animate as animeAnimate } from "animejs";
import "./style.css";
import "./dashboard.css";

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

type SupportOption = {
  slug: string;
  label: string;
  amount_cents: number;
  currency: string;
};

type SiteSession = {
  access_token: string;
  user: SiteUser;
};

type SiteUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

type CommerceProfile = {
  user_id: string;
  username?: string;
  display_name?: string;
  email?: string;
  role?: string;
  profile_image_url?: string;
  bud_license_status?: string;
  bud_plan?: string;
};

type BudPurchase = {
  id: string;
  plan: "lifetime" | "monthly" | "free";
  status: string;
  amount_cents: number;
  currency: string;
  created_at?: string;
  completed_at?: string;
};

type BudLicense = {
  id: string;
  plan: "lifetime" | "monthly" | "free";
  activated: boolean;
  activated_at?: string | null;
  expires_at?: string | null;
  revoked?: boolean;
  created_at?: string;
};

type AppState = {
  release?: Release;
  releaseError?: string;
  sksRelease?: Release;
  sksReleaseError?: string;
  news: NewsItem[];
  newsError?: string;
  supportOptions: SupportOption[];
  supportError?: string;
  session?: SiteSession | null;
  profile?: CommerceProfile | null;
  budPurchases: BudPurchase[];
  budLicenses: BudLicense[];
  budSummaryError?: string;
  budMonthlyAvailable: boolean;
  revealedBudKey?: {
    license_key: string;
    plan: string;
    expires_at?: string | null;
    message: string;
  } | null;
  ownerPanelOpen: boolean;
  ownerUsers: CommerceProfile[];
  ownerError?: string;
};

type Route = "/" | "/downloads" | "/news" | "/staff" | "/support" | "/about" | "/faq" | "/login" | "/dashboard";

const updatesJsonUrl = import.meta.env.VITE_UPDATES_JSON_URL || "/latest.json";
const sksUpdatesJsonUrl = import.meta.env.VITE_SKS_UPDATES_JSON_URL || "/sks-latest.json";

function normalizePublicSiteUrl(rawValue?: string): string {
  const fallback = "https://bloomclient.org";
  const raw = String(rawValue || "").trim();
  const currentOrigin = window.location.origin;

  const isLocalOrigin = (value: string): boolean => {
    try {
      const url = new URL(value);
      return ["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname);
    } catch {
      return false;
    }
  };

  if (raw) {
    try {
      const url = new URL(raw);
      if (!isLocalOrigin(url.origin)) return url.origin.replace(/\/+$/, "");
    } catch {
      // Ignore invalid configured values.
    }
  }

  if (!isLocalOrigin(currentOrigin)) return currentOrigin.replace(/\/+$/, "");
  return fallback;
}

const siteUrl = normalizePublicSiteUrl(import.meta.env.VITE_SITE_URL);
const authRedirectUrl = `${siteUrl}/dashboard`;

const state: AppState = {
  news: [],
  supportOptions: [],
  session: null,
  profile: null,
  budPurchases: [],
  budLicenses: [],
  budMonthlyAvailable: false,
  revealedBudKey: null,
  ownerPanelOpen: false,
  ownerUsers: []
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app root.");
const root = app;
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let hasMounted = false;
let isTransitioning = false;
const transitionStorageKey = "bloom-site-transitions";
let transitionsEnabled = localStorage.getItem(transitionStorageKey) !== "off";
let siteSupabase: any;

const navItems: Array<{ path: Route; label: string }> = [
  { path: "/downloads", label: "Downloads" },
  { path: "/news", label: "News" },
  { path: "/staff", label: "Staff" },
  { path: "/support", label: "Support" },
  { path: "/about", label: "About" },
  { path: "/faq", label: "FAQ" }
];

const infoItems: Array<{ path: Route; label: string }> = [
  { path: "/about", label: "About" },
  { path: "/faq", label: "FAQ" }
];

const productCards = [
  {
    title: "Bloom Client",
    body: "A calmer launcher and client experience for Minecraft."
  },
  {
    title: "SkStudio",
    body: "A focused creative workspace for skin and asset editing."
  },
  {
    title: "Production tools",
    body: "Small, useful apps made under the Bloom Productions umbrella."
  },
  {
    title: "Clean releases",
    body: "Official downloads, updates, and project links in one place."
  }
];

const staffMembers = [
  { name: "Parks", role: "Owner", image: "/staff/parks.jpg" },
  { name: "Looking for...", role: "Co-Owner", image: "" },
  { name: "Looking for...", role: "Head Manager", image: "" },
  { name: "Wqfflez", role: "Manager", image: "/staff/wqfflez.png" }
];

const discordInviteUrl = "https://discord.gg/aSCnu2CTm6";
const ownerUserIds = new Set([
  "951a26df-2baa-445e-8dd6-30d4878eade2",
  "edfee06f-d5af-457c-b0f7-36cb0f621fc6"
]);

const faqItems = [
  {
    question: "Why does my antivirus warn about a Bloom Productions app?",
    answer:
      "Some antivirus tools flag new launchers because they download files, start Minecraft, manage folders, and connect to online services. Those actions can look suspicious to scanners, even when the app is doing normal launcher work."
  },
  {
    question: "Why do Bloom Productions apps not have a code signing certificate yet?",
    answer:
      "Code signing costs money and takes setup time. Bloom is still growing, so releases may show extra Windows or antivirus warnings until a certificate is added."
  },
  {
    question: "What is a trojan?",
    answer:
      "A trojan is malware that pretends to be something safe while doing something harmful in the background. A warning name from an antivirus does not always mean that exact malware was found."
  },
  {
    question: "Why do antivirus tools show trojan names if it is not confirmed?",
    answer:
      "Many scanners use patterns and behavior, not full proof. If a file looks similar to something suspicious, the scanner can attach a generic trojan name as a warning."
  },
  {
    question: "What should I do if I get a warning?",
    answer:
      "Download Bloom only from bloomclient.org, keep Windows updated, and scan the file with more than one trusted tool if you want a second opinion."
  },
  {
    question: "Where should I download Bloom Productions apps?",
    answer:
      "Use the Downloads page on bloomclient.org. Avoid random reuploads or links from people you do not trust."
  },
  {
    question: "What Minecraft version does Bloom focus on?",
    answer:
      "Bloom Client currently focuses on modern Fabric instances, with the latest client build shown on the Downloads page."
  },
  {
    question: "Do I need a Bloom account?",
    answer:
      "You can use the launcher normally, but some online features like cosmetics, balance, and account-linked items need sign-in."
  },
  {
    question: "Does Bloom change my Minecraft account?",
    answer:
      "No. Bloom uses your Minecraft sign-in to identify you in the client, but it does not own or replace your Minecraft account."
  },
  {
    question: "Where can I get help?",
    answer:
      "Join the Bloom Productions Discord from the footer. It is the easiest place to ask questions and check current updates."
  }
];

function routeFromPath(pathname = window.location.pathname): Route {
  if (pathname === "/downloads") return "/downloads";
  if (pathname === "/news") return "/news";
  if (pathname === "/staff") return "/staff";
  if (pathname === "/support") return "/support";
  if (pathname === "/about") return "/about";
  if (pathname === "/faq") return "/faq";
  if (pathname === "/login") return "/login";
  if (pathname === "/dashboard") return "/dashboard";
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

function formatMoney(cents?: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format((cents || 0) / 100);
}

function currentUser(): SiteUser | undefined {
  return state.session?.user;
}

function profileName(): string {
  return state.profile?.username || currentUser()?.email?.split("@")[0] || "Account";
}

function avatarMarkup(className = "account-avatar"): string {
  const url = state.profile?.profile_image_url;
  const initials = profileName().slice(0, 2).toUpperCase();
  return url
    ? `<img class="${className}" src="${escapeHtml(url)}" alt="${escapeHtml(profileName())} profile picture" />`
    : `<span class="${className}">${escapeHtml(initials)}</span>`;
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
        title: "Bloom Productions website is live",
        summary: "Updates will show here when there is something new.",
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

function resolveEdgeBase(): string {
  const explicit = import.meta.env.VITE_SUPABASE_SUPPORT_FUNCTION_URL || import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;
  if (explicit) return String(explicit).replace(/\/+$/, "");

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return "";

  try {
    return `${new URL(supabaseUrl).origin.replace(/\/+$/, "")}/functions/v1/support`;
  } catch {
    return `${String(supabaseUrl).replace(/\/+$/, "")}/functions/v1/support`;
  }
}

function resolveBudEdgeBase(): string {
  const explicit = import.meta.env.VITE_SUPABASE_BUD_FUNCTION_URL;
  if (explicit) return String(explicit).replace(/\/+$/, "");

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return "";

  try {
    return `${new URL(supabaseUrl).origin.replace(/\/+$/, "")}/functions/v1/bud-license`;
  } catch {
    return `${String(supabaseUrl).replace(/\/+$/, "")}/functions/v1/bud-license`;
  }
}

async function budFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const edgeBase = resolveBudEdgeBase();
  const token = state.session?.access_token;
  if (!edgeBase) throw new Error("BUD license services are not configured yet.");
  if (!token) throw new Error("Sign in first.");

  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(`${edgeBase}${path}`, { ...init, headers, cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as T & { message?: string; error?: string };
  if (!response.ok) throw new Error(payload.message || payload.error || `Request failed (${response.status}).`);
  return payload;
}

async function loadBudSummary(): Promise<void> {
  if (!state.session) {
    state.profile = null;
    state.budPurchases = [];
    state.budLicenses = [];
    return;
  }
  try {
    const payload = await budFetch<{
      profile?: CommerceProfile | null;
      purchases?: BudPurchase[];
      licenses?: BudLicense[];
      monthly_available?: boolean;
    }>("/summary");
    state.profile = payload.profile ?? null;
    state.budPurchases = payload.purchases ?? [];
    state.budLicenses = payload.licenses ?? [];
    state.budMonthlyAvailable = Boolean(payload.monthly_available);
    state.budSummaryError = undefined;
  } catch (error) {
    state.budSummaryError = error instanceof Error ? error.message : "Could not load dashboard.";
  }
}

async function startBudCheckout(plan: "lifetime" | "monthly"): Promise<string> {
  const payload = await budFetch<{ checkout_url?: string }>("/checkout", {
    method: "POST",
    body: JSON.stringify({ plan, return_origin: window.location.origin })
  });
  if (!payload.checkout_url) throw new Error("Checkout did not return a URL.");
  return payload.checkout_url;
}

async function claimBudKey(): Promise<void> {
  const payload = await budFetch<{
    license_key?: string;
    plan?: string;
    expires_at?: string | null;
    message?: string;
  }>("/claim-key", { method: "POST", body: JSON.stringify({}) });
  if (!payload.license_key) throw new Error("No license key was returned.");
  state.revealedBudKey = {
    license_key: payload.license_key,
    plan: payload.plan || "bud",
    expires_at: payload.expires_at,
    message: payload.message || "Save this key. You will use it inside SkStudio to activate BUD."
  };
}

function isOwnerProfile(): boolean {
  const user = currentUser();
  const isAllowedOwner = user?.id ? ownerUserIds.has(user.id) : false;
  return (
    state.profile?.role === "owner" &&
    (
      isAllowedOwner ||
      (
        profileName().toLowerCase() === "parks" &&
        String(user?.email || state.profile?.email || "").toLowerCase() === "urlocalparks@gmail.com"
      )
    )
  );
}

async function loadOwnerUsers(): Promise<void> {
  if (!isOwnerProfile()) return;
  try {
    const payload = await budFetch<{ users?: CommerceProfile[] }>("/owner/users");
    state.ownerUsers = payload.users ?? [];
    state.ownerError = undefined;
  } catch (error) {
    state.ownerError = error instanceof Error ? error.message : "Could not load users.";
  }
}

async function grantFreeBudLicense(userId: string): Promise<void> {
  await budFetch<{ ok?: boolean }>("/owner/free-license", {
    method: "POST",
    body: JSON.stringify({ user_id: userId })
  });
}

async function loadSupportOptions(): Promise<void> {
  const edgeBase = resolveEdgeBase();
  if (!edgeBase) {
    state.supportOptions = [];
    state.supportError = "Support checkout is not configured yet.";
    return;
  }

  try {
    const response = await fetch(`${edgeBase}/options`, { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      options?: SupportOption[];
      message?: string;
      error?: string;
    };
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || payload.error || `Support options failed (${response.status}).`);
    }

    state.supportOptions = Array.isArray(payload.options) ? payload.options : [];
    state.supportError = undefined;
  } catch (error) {
    state.supportOptions = [];
    state.supportError = error instanceof Error ? error.message : "Could not load support options.";
  }
}

async function createSupportCheckout(optionSlug?: string, amountUsd?: string): Promise<string> {
  const edgeBase = resolveEdgeBase();
  if (!edgeBase) throw new Error("Support checkout is not configured yet.");

  const body: Record<string, string> = {
    return_origin: window.location.origin
  };
  if (optionSlug) body.option_slug = optionSlug;
  if (amountUsd) body.amount_usd = amountUsd;

  const response = await fetch(`${edgeBase}/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    checkout_url?: string | null;
    message?: string;
    error?: string;
  };

  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || payload.error || `Support checkout failed (${response.status}).`);
  }

  const checkoutUrl = payload.checkout_url?.trim();
  if (!checkoutUrl) throw new Error("Support checkout did not return a checkout URL.");
  return checkoutUrl;
}

function releaseButtons(className = "hero-actions"): string {
  const release = state.release;
  const sksRelease = state.sksRelease;
  const client = release?.exeUrl
    ? `<a class="btn primary" href="${escapeHtml(release.exeUrl)}" target="_blank" rel="noreferrer">Download Client</a>`
    : `<span class="btn disabled">Download unavailable</span>`;
  const skstudio = sksRelease?.exeUrl
    ? `<a class="btn secondary" href="${escapeHtml(sksRelease.exeUrl)}" target="_blank" rel="noreferrer">Download SkStudio</a>`
    : `<a class="btn secondary" href="/downloads" data-route="/downloads">View downloads</a>`;
  return `<div class="${className}">${client}${skstudio}</div>`;
}

function getSiteSupabase(): any | null {
  if (siteSupabase) return siteSupabase;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;
  siteSupabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  return siteSupabase;
}

async function loadAuthState(): Promise<void> {
  const supabase = getSiteSupabase();
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  state.session = (data?.session as SiteSession | null) ?? null;
}

function validatePassword(password: string): string[] {
  const messages: string[] = [];
  if (password.length < 12) messages.push("Use at least 12 characters.");
  if (!/[A-Z]/.test(password)) messages.push("Add an uppercase letter.");
  if (!/[a-z]/.test(password)) messages.push("Add a lowercase letter.");
  if (!/[0-9]/.test(password)) messages.push("Add a number.");
  if (!/[^A-Za-z0-9]/.test(password)) messages.push("Add a symbol.");
  return messages;
}

function downloadCard(appName: string, eyebrow: string, release?: Release, error?: string): string {
  const version = release?.version ? `v${escapeHtml(release.version)}` : "Unavailable";
  const detail = error ? "Download info is not available right now." : "The latest Windows build is ready.";

  return `
    <section class="download-panel">
      <div>
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h2>${escapeHtml(appName)} ${version}</h2>
        <p>${detail}</p>
      </div>
      <div class="download-list">
        ${
          release?.exeUrl
            ? `<a class="download-row" href="${escapeHtml(release.exeUrl)}" target="_blank" rel="noreferrer"><span>${escapeHtml(release.exeAssetName || `${appName} Windows installer`)}</span><strong>EXE</strong></a>`
            : `<div class="download-row disabled-row"><span>${escapeHtml(appName)} installer unavailable</span><strong>EXE</strong></div>`
        }
        ${
          release?.msiUrl
            ? `<a class="download-row" href="${escapeHtml(release.msiUrl)}" target="_blank" rel="noreferrer"><span>${escapeHtml(release.msiAssetName || `${appName} Windows MSI`)}</span><strong>MSI</strong></a>`
            : `<div class="download-row disabled-row"><span>${escapeHtml(appName)} MSI unavailable</span><strong>MSI</strong></div>`
        }
      </div>
    </section>
  `;
}

function renderHeader(route: Route): string {
  const accountHref = state.session ? "/dashboard" : "/login";
  return `
    <header class="site-header">
      <a class="brand" href="/" data-route="/">
        <span>Bloom Productions</span>
      </a>
      <nav class="nav">
        ${navItems
          .map(
            (item) =>
              `<a class="${item.path === route ? "active" : ""}" href="${item.path}" data-route="${item.path}">${item.label}</a>`
          )
          .join("")}
      </nav>
      <div class="header-actions">
        <a class="login-link ${route === "/dashboard" || route === "/login" ? "active" : ""}" href="${accountHref}" data-route="${accountHref}">
          ${state.session ? "Dashboard" : "Log in"}
        </a>
        <a class="top-download" href="/downloads" data-route="/downloads">Get started</a>
      </div>
    </header>
  `;
}

function renderHome(): string {
  return `
    <section class="hero-section">
      <div class="hero-copy">
        <p class="pill-link">Status: Beta Test</p>
        <h1>Bloom Productions</h1>
        <p class="lead">Tools for the future, built by the future!</p>
        ${releaseButtons()}
      </div>
    </section>

    <section class="section product-strip">
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
        <p class="eyebrow">Latest builds</p>
        <h2>Download the current releases.</h2>
        <p>Bloom Client and SkStudio installers stay linked from one official place.</p>
      </div>
      <a class="btn secondary" href="/downloads" data-route="/downloads">Open downloads</a>
    </section>
  `;
}

function renderDownloads(): string {
  return `
    <section class="page-hero compact">
      <p class="eyebrow">Downloads</p>
      <h1>Download Bloom Productions</h1>
      <p>Official Windows builds for Bloom Productions apps.</p>
    </section>
    <div class="download-stack">
      ${downloadCard("Bloom Client", "Minecraft client", state.release, state.releaseError)}
      ${downloadCard("SkStudio", "Creative editor", state.sksRelease, state.sksReleaseError)}
    </div>
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
      <p>Simple updates when something changes.</p>
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
          : `<article class="news-card"><h2>No posts yet</h2><p>Check back later for updates.</p></article>`
      }
    </section>
  `;
}

function renderStaff(): string {
  return `
    <section class="page-hero compact">
      <p class="eyebrow">Staff</p>
      <h1>Bloom team</h1>
      <p>The people keeping Bloom running.</p>
    </section>
    <section class="staff-grid">
      ${staffMembers
        .map(
          (member) => `
            <article class="staff-card ${member.image ? "" : "staff-card-open"}">
              ${
                member.image
                  ? `<img src="${member.image}" alt="${member.name} profile picture" onerror="this.onerror=null;this.src='/staff/placeholder.svg';" />`
                  : `<div class="staff-open-mark" aria-hidden="true"></div>`
              }
              <h2>${escapeHtml(member.name)}</h2>
              <p>${escapeHtml(member.role)}</p>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function renderSupport(): string {
  const status = new URLSearchParams(window.location.search).get("status");
  const statusMessage =
    status === "success"
      ? `<article class="support-state success"><h2>Thank you for supporting Bloom.</h2><p>Your contribution helps keep Bloom Productions development moving forward.</p></article>`
      : status === "cancel"
        ? `<article class="support-state"><h2>Checkout canceled.</h2><p>No contribution was made. You can restart checkout whenever you are ready.</p></article>`
        : "";

  const optionsMarkup = state.supportError
    ? `<article class="support-state"><h2>Support checkout is unavailable.</h2><p>${escapeHtml(state.supportError)}</p></article>`
    : state.supportOptions.length
      ? state.supportOptions
          .map(
            (option) => `
              <article class="support-option">
                <div>
                  <p class="eyebrow">Support</p>
                  <h2>${escapeHtml(option.label)}</h2>
                </div>
                <button class="btn primary support-button" type="button" data-support-option="${escapeHtml(option.slug)}">
                  Support Bloom
                </button>
              </article>
            `
          )
          .join("")
      : `<article class="support-state"><h2>No support options are available.</h2><p>Please check back later.</p></article>`;

  return `
    <section class="page-hero compact">
      <p class="eyebrow">Support</p>
      <h1>Support Bloom</h1>
      <p>Help support Bloom Productions development.</p>
    </section>
    <section class="support-panel">
      <div class="support-copy">
      </div>
      ${statusMessage}
      <form class="support-custom support-slider-panel" data-support-custom>
        <div class="support-slider-head">
          <label for="support-custom-amount">Choose an amount</label>
          <strong>$<span data-support-slider-value>25</span></strong>
        </div>
        <input id="support-custom-amount" name="amount" type="range" min="1" max="500" step="1" value="25" aria-label="Custom support amount in USD" />
        <div class="support-slider-scale">
          <span>$1</span>
          <span>$500</span>
        </div>
        <button class="btn primary support-button" type="submit">Support custom amount</button>
      </form>
      <div class="support-options">
        ${optionsMarkup}
      </div>
      <p class="support-note">Checkout opens through McSets and is processed server-side.</p>
    </section>
  `;
}

function renderLogin(): string {
  const configured = Boolean(getSiteSupabase());
  return `
    <section class="page-hero compact">
      <p class="eyebrow">Account</p>
      <h1>Sign in to Bloom Productions</h1>
      <p>Use your account for SkStudio BUD licensing and dashboard access.</p>
    </section>
    <section class="auth-panel">
      ${
        configured
          ? `
            <form class="auth-card" data-auth-form="login">
              <p class="eyebrow">Login</p>
              <h2>Welcome back</h2>
              <label>Email<input name="email" type="email" autocomplete="email" required /></label>
              <label>Password<input name="password" type="password" autocomplete="current-password" required /></label>
              <button class="btn primary" type="submit">Login</button>
              <p class="auth-message" data-auth-message="login"></p>
            </form>
            <form class="auth-card" data-auth-form="signup">
              <p class="eyebrow">Signup</p>
              <h2>Create account</h2>
              <label>Username<input name="username" type="text" autocomplete="username" minlength="3" maxlength="32" required /></label>
              <label>Email<input name="email" type="email" autocomplete="email" required /></label>
              <label>Password<input name="password" type="password" autocomplete="new-password" required /></label>
              <ul class="password-rules">
                <li>12+ characters</li>
                <li>Uppercase and lowercase</li>
                <li>Number and symbol</li>
              </ul>
              <button class="btn primary" type="submit">Create account</button>
              <p class="auth-message" data-auth-message="signup"></p>
            </form>
          `
          : `<article class="support-state"><h2>Accounts are not configured.</h2><p>Add the public Supabase URL and anon key to the website environment.</p></article>`
      }
    </section>
  `;
}

function renderDashboard(): string {
  if (!state.session) {
    return `
      <section class="page-hero compact">
        <p class="eyebrow">Dashboard</p>
        <h1>Sign in required.</h1>
        <p>Login to view your profile, billing, and BUD license.</p>
        <a class="btn primary" href="/login" data-route="/login">Login</a>
      </section>
    `;
  }

  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab") || "profile";
  const latestPurchase = state.budPurchases[0];
  const activeLicense = state.budLicenses.find((license) => !license.revoked) || state.budLicenses[0];
  const keyReveal = state.revealedBudKey
    ? `<div class="dash-license-key">
        <p>${escapeHtml(state.revealedBudKey.message)}</p>
        <div class="dash-key-row">
          <code>${escapeHtml(state.revealedBudKey.license_key)}</code>
          <button class="dash-ghost-button" type="button" data-copy-bud-key="${escapeHtml(state.revealedBudKey.license_key)}">Copy</button>
        </div>
      </div>`
    : "";

  const profileTab = `
    <section class="dash-view dash-profile-view">
      <div class="dash-section-heading">
        <span>Profile</span>
        <h1>Account details</h1>
        <p>Update the identity shown on Bloom Productions services.</p>
      </div>
      <div class="dash-profile-head">
        ${avatarMarkup("dash-avatar")}
        <div>
          <h2>${escapeHtml(profileName())}</h2>
          <p>${escapeHtml(currentUser()?.email || state.profile?.email || "No email")}</p>
        </div>
      </div>
      <form class="dash-form" data-profile-form>
        <label>
          <span>Username</span>
          <input name="username" type="text" value="${escapeHtml(profileName())}" minlength="3" maxlength="32" required />
        </label>
        <label>
          <span>Email</span>
          <input type="email" value="${escapeHtml(currentUser()?.email || state.profile?.email || "")}" disabled />
        </label>
        <label>
          <span>Profile picture</span>
          <input name="avatar" type="file" accept="image/png,image/jpeg,image/webp" />
        </label>
        <button class="dash-primary-button" type="submit">Save profile</button>
        <p class="auth-message" data-profile-message></p>
      </form>
    </section>
  `;

  const budTab = `
    <section class="dash-view dash-license-view">
      <div class="dash-section-heading">
        <span>BUD License</span>
        <h1>License access</h1>
        <p>Manage the license used to activate BUD inside SkStudio.</p>
      </div>
      <div class="dash-license-strip">
        <div>
          <span>LICENSE</span>
          <strong>${escapeHtml(state.profile?.bud_license_status || "none")}</strong>
        </div>
        <div>
          <span>PLAN</span>
          <strong>${escapeHtml(state.profile?.bud_plan || activeLicense?.plan || "none")}</strong>
        </div>
        <div>
          <span>ACTIVATION</span>
          <strong>${activeLicense?.activated ? "Activated" : activeLicense ? "Not activated" : "No key"}</strong>
        </div>
      </div>
      ${state.budSummaryError ? `<p class="auth-message error">${escapeHtml(state.budSummaryError)}</p>` : ""}
      <div class="dash-pricing">
        <article class="dash-price-card dash-price-card-lifetime">
          <span class="dash-price-label">Lifetime</span>
          <div class="dash-price">
            <strong>$50</strong>
            <span>one time</span>
          </div>
          <p>One-time payment.</p>
          <div class="dash-price-line">
            <span>Get a BUD AI license</span>
          </div>
          <button class="dash-price-button" type="button" data-bud-checkout="lifetime">Buy lifetime</button>
        </article>
        <article class="dash-price-card">
          <span class="dash-price-label">Monthly</span>
          <div class="dash-price">
            <strong>$10</strong>
            <span>/month</span>
          </div>
          <p>Monthly billing.</p>
          <div class="dash-price-line">
            <span>Get a BUD AI license</span>
          </div>
          <button class="dash-price-button" type="button" data-bud-checkout="monthly" ${state.budMonthlyAvailable ? "" : "disabled"}>Subscribe monthly</button>
          ${state.budMonthlyAvailable ? "" : `<p class="dash-muted-line">Monthly needs the MCsets subscription price id configured.</p>`}
        </article>
      </div>
      <button class="dash-ghost-button dash-key-button" type="button" data-claim-bud-key>Show new license key</button>
      <p class="dash-warning">Save this key. You will use it inside SkStudio to activate BUD.</p>
      ${keyReveal}
    </section>
  `;

  const billingTab = `
    <section class="dash-view dash-billing-view">
      <div class="dash-section-heading">
        <span>Billing</span>
        <h1>Purchase history</h1>
        <p>Only completed BUD purchases and subscription records appear here.</p>
      </div>
      <div class="dash-billing-list">
      ${
        state.budPurchases.length
          ? state.budPurchases
              .map(
                (purchase) => `
                  <div class="dash-billing-row">
                    <div>
                      <strong>${escapeHtml(purchase.plan)}</strong>
                      <span>${escapeHtml(formatDate(purchase.completed_at || purchase.created_at))}</span>
                    </div>
                    <span>${escapeHtml(purchase.status)}</span>
                    <strong>${escapeHtml(formatMoney(purchase.amount_cents, purchase.currency))}</strong>
                  </div>
                `
              )
              .join("")
          : `<p class="dash-empty">No billing yet. BUD purchases will show here after checkout.</p>`
      }
      </div>
    </section>
  `;

  const dashboardTabs = [
    { id: "profile", label: "Profile", href: "/dashboard?tab=profile" },
    { id: "bud", label: "BUD License", href: "/dashboard?tab=bud" },
    { id: "billing", label: "Billing", href: "/dashboard?tab=billing" }
  ];
  const dashboardEmail = currentUser()?.email || state.profile?.email || "No email";

  return `
    <section class="dash-app" aria-label="Bloom account dashboard">
      <a class="dash-home-back" href="/" data-route="/" aria-label="Back to home">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </a>
      <aside class="dash-sidebar">
        <button class="dash-account-chip" type="button" data-logout title="Sign out">
          ${avatarMarkup("dash-side-avatar")}
          <span>${escapeHtml(profileName())}</span>
          <span class="dash-account-caret">v</span>
        </button>
        <nav class="dash-side-tabs" aria-label="Dashboard tabs">
          ${dashboardTabs
            .map(
              (item) => `
                <a class="${tab === item.id ? "active" : ""}" href="${item.href}" data-route="${item.href}">
                  ${escapeHtml(item.label)}
                </a>
              `
            )
            .join("")}
        </nav>
        <p class="dash-side-email">${escapeHtml(dashboardEmail)}</p>
      </aside>
      <main class="dash-main">
        ${tab === "bud" ? budTab : tab === "billing" ? billingTab : profileTab}
      </main>
    </section>
  `;
}

async function loadSksRelease(): Promise<void> {
  try {
    const response = await fetch(sksUpdatesJsonUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Manifest request failed (${response.status}).`);
    state.sksRelease = parseRelease((await response.json()) as UpdateManifest);
  } catch (error) {
    state.sksReleaseError = error instanceof Error ? error.message : "Could not load the latest SkStudio release.";
  }
}

function renderAbout(): string {
  return `
    <section class="page-hero compact">
      <p class="eyebrow">About</p>
      <h1>Built for the Bloom ecosystem.</h1>
      <p>A cleaner place for Bloom Productions downloads, updates, and links.</p>
    </section>
    <section class="about-grid">
      <article>
        <h2>Launcher first</h2>
        <p>Bloom keeps your launcher, instances, cosmetics, and tools together.</p>
      </article>
      <article>
        <h2>Fast downloads</h2>
        <p>Grab the latest build without searching around.</p>
      </article>
      <article>
        <h2>Official home</h2>
        <p>Use bloomclient.org for the official Bloom Productions site.</p>
      </article>
    </section>
  `;
}

function renderFaq(): string {
  return `
    <section class="page-hero compact">
      <p class="eyebrow">FAQ</p>
      <h1>Common questions.</h1>
      <p>Simple answers for Bloom Productions safety, downloads, and setup.</p>
    </section>
    <section class="faq-list">
      ${faqItems
        .map(
          (item) => `
            <details class="faq-item">
              <summary>
                <span>${escapeHtml(item.question)}</span>
                <span class="faq-arrow" aria-hidden="true"></span>
              </summary>
              <p>${escapeHtml(item.answer)}</p>
            </details>
          `
        )
        .join("")}
    </section>
  `;
}

function renderRoute(route: Route): string {
  if (route === "/downloads") return renderDownloads();
  if (route === "/news") return renderNews();
  if (route === "/staff") return renderStaff();
  if (route === "/support") return renderSupport();
  if (route === "/login") return renderLogin();
  if (route === "/dashboard") return renderDashboard();
  if (route === "/about") return renderAbout();
  if (route === "/faq") return renderFaq();
  return renderHome();
}

function renderFooter(): string {
  const year = new Date().getFullYear();
  return `
    <footer class="site-footer">
      <div class="footer-brand">
        <img src="/logo.png" alt="Bloom Productions logo" />
        <div>
          <strong>Bloom Productions</strong>
          <span>Copyright ${year} Bloom Productions. All rights reserved.</span>
        </div>
      </div>
      <nav class="footer-links" aria-label="Footer links">
        <a href="/downloads" data-route="/downloads">Downloads</a>
        <a href="/news" data-route="/news">News</a>
        <a href="/staff" data-route="/staff">Staff</a>
        <a href="/about" data-route="/about">About</a>
        <a href="/faq" data-route="/faq">FAQ</a>
        <a class="discord-link" href="${discordInviteUrl}" target="_blank" rel="noreferrer" aria-label="Join the Bloom Productions Discord">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19.54 5.34A17.4 17.4 0 0 0 15.2 4l-.21.42c1.54.38 2.26.93 2.26.93a13.54 13.54 0 0 0-5.02-1.44 13.67 13.67 0 0 0-5.68 1.08c-.28.13-.45.22-.45.22s.75-.58 2.38-.96L8.32 4a17.6 17.6 0 0 0-4.36 1.35C1.2 9.48.46 13.5.84 17.46A17.42 17.42 0 0 0 6.18 20s.64-.76 1.15-1.42a7.38 7.38 0 0 1-1.82-.87l.44-.34c3.5 1.62 7.3 1.62 10.76 0l.45.34c-.58.38-1.2.67-1.84.87.51.66 1.14 1.42 1.14 1.42a17.33 17.33 0 0 0 5.36-2.54c.46-4.58-.78-8.56-2.28-12.12ZM8.42 15.04c-1.04 0-1.9-.96-1.9-2.14s.84-2.14 1.9-2.14c1.06 0 1.92.97 1.9 2.14 0 1.18-.84 2.14-1.9 2.14Zm7.17 0c-1.04 0-1.9-.96-1.9-2.14s.84-2.14 1.9-2.14c1.06 0 1.9.97 1.9 2.14s-.84 2.14-1.9 2.14Z" />
          </svg>
          Discord
        </a>
      </nav>
      <p class="footer-note">Not affiliated with Mojang, Microsoft, or Minecraft.</p>
    </footer>
  `;
}

function renderSupportCta(): string {
  return `
    <a class="support-corner" href="/support" data-route="/support" aria-label="Support Bloom">
      <span class="support-corner-panel" aria-hidden="true">
        <span class="support-corner-copy">
          <span class="support-corner-title">Support Bloom</span>
          <span class="support-corner-description">A simple way to support Bloom Productions development directly.</span>
          <span class="support-corner-prompt">click for options</span>
          <span class="support-corner-arrow"></span>
        </span>
      </span>
      <span class="support-corner-button">
        <span class="support-corner-emoji">🫶</span>
        <span class="support-corner-label">Support Bloom</span>
      </span>
    </a>
  `;
}

function renderOwnerPanel(): string {
  if (!isOwnerProfile()) return "";
  const users = state.ownerUsers.length
    ? state.ownerUsers
        .map((user) => {
          const name = user.username || user.display_name || user.email || "Unnamed user";
          const plan = user.bud_plan || "none";
          const status = user.bud_license_status || "none";
          const isFree = plan === "free" && status === "active";
          return `
            <article class="owner-user-row">
              <div>
                <strong>${escapeHtml(name)}</strong>
                <span>${escapeHtml(plan)} · ${escapeHtml(status)}</span>
              </div>
              <button class="btn secondary" type="button" data-owner-free-license="${escapeHtml(user.user_id)}" ${isFree ? "disabled" : ""}>
                ${isFree ? "Free active" : "Give free"}
              </button>
            </article>
          `;
        })
        .join("")
    : `<article class="owner-user-row empty"><strong>No users loaded.</strong><span>Open the panel to refresh.</span></article>`;

  return `
    <aside class="owner-corner ${state.ownerPanelOpen ? "open" : ""}" aria-label="Owner panel">
      <button class="owner-corner-toggle" type="button" data-owner-panel-toggle aria-expanded="${state.ownerPanelOpen ? "true" : "false"}">
        Owner Panel
      </button>
      <section class="owner-corner-panel" aria-hidden="${state.ownerPanelOpen ? "false" : "true"}">
        <div class="owner-panel-head">
          <p class="eyebrow">Owner</p>
          <h2>Users</h2>
        </div>
        ${state.ownerError ? `<p class="auth-message error">${escapeHtml(state.ownerError)}</p>` : ""}
        <div class="owner-user-list">${users}</div>
      </section>
    </aside>
  `;
}

function initParticles(): void {
  if (document.querySelector(".particle-canvas")) return;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return;

  canvas.className = "particle-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);

  const mouse = { x: -1000, y: -1000 };
  const particles: Array<{
    x: number;
    y: number;
    baseX: number;
    baseY: number;
    vx: number;
    vy: number;
    size: number;
    alpha: number;
    drift: number;
  }> = [];

  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    particles.length = 0;
    const count = Math.min(260, Math.max(120, Math.round((width * height) / 6500)));
    for (let index = 0; index < count; index += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      particles.push({
        x,
        y,
        baseX: x,
        baseY: y,
        vx: (Math.random() - 0.5) * 0.075,
        vy: (Math.random() - 0.5) * 0.075,
        size: 0.55 + Math.random() * 1.15,
        alpha: 0.18 + Math.random() * 0.46,
        drift: Math.random() * Math.PI * 2
      });
    }
  };

  const handlePointerMove = (event: PointerEvent) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  };

  const handlePointerLeave = () => {
    mouse.x = -1000;
    mouse.y = -1000;
  };

  const animate = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    context.clearRect(0, 0, width, height);

    for (const particle of particles) {
      particle.drift += 0.0032;
      particle.baseX += Math.cos(particle.drift) * 0.016 + particle.vx;
      particle.baseY += Math.sin(particle.drift * 0.8) * 0.016 + particle.vy;

      if (particle.baseX < -20) particle.baseX = width + 20;
      if (particle.baseX > width + 20) particle.baseX = -20;
      if (particle.baseY < -20) particle.baseY = height + 20;
      if (particle.baseY > height + 20) particle.baseY = -20;

      const dx = particle.x - mouse.x;
      const dy = particle.y - mouse.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 120) {
        const force = (120 - distance) / 120;
        particle.x += (dx / Math.max(distance, 1)) * force * 2.45;
        particle.y += (dy / Math.max(distance, 1)) * force * 2.45;
      }

      particle.x += (particle.baseX - particle.x) * 0.018;
      particle.y += (particle.baseY - particle.y) * 0.018;

      context.fillStyle = `rgba(255, 255, 255, ${Math.min(particle.alpha, 0.84)})`;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();

      if (particle.alpha > 0.48) {
        context.fillStyle = `rgba(120, 238, 255, ${Math.min(particle.alpha * 0.25, 0.22)})`;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size * 1.8, 0, Math.PI * 2);
        context.fill();
      }
    }

    requestAnimationFrame(animate);
  };

  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerleave", handlePointerLeave);
  resize();
  requestAnimationFrame(animate);
}

function initAmbientLayer(): void {
  if (document.querySelector(".page-ambient")) return;

  const backdrop = document.createElement("div");
  backdrop.className = "site-backdrop";
  backdrop.setAttribute("aria-hidden", "true");

  const ambient = document.createElement("div");
  ambient.className = "page-ambient";
  ambient.setAttribute("aria-hidden", "true");

  document.body.prepend(backdrop);
  document.body.prepend(ambient);
}

function fadeParticles(opacity: number, duration = 520): void {
  const canvas = document.querySelector<HTMLElement>(".particle-canvas");
  if (!canvas) return;

  animeAnimate(canvas, {
    opacity,
    duration,
    ease: "outCubic"
  });
}

function fadeAmbient(opacity: number, duration = 520): void {
  const layers = document.querySelectorAll<HTMLElement>(".site-backdrop, .page-ambient");
  if (!layers.length) return;

  animeAnimate(layers, {
    opacity,
    duration,
    ease: "inOutCubic"
  });
}

function animatedPageSelector(): string {
  return [
    ".site-header",
    ".eyebrow",
    ".hero-copy > *",
    ".page-hero > *",
    ".section-heading > *",
    ".split-band",
    ".split-band > *",
    ".download-panel",
    ".download-panel > *",
    ".download-link",
    ".feature-card",
    ".news-card",
    ".support-panel",
    ".support-panel > *",
    ".support-option",
    ".support-state",
    ".auth-panel",
    ".auth-card",
    ".dashboard-shell",
    ".dashboard-panel",
    ".staff-card",
    ".about-grid article",
    ".faq-item",
    ".site-footer",
    ".site-footer > *"
  ].join(", ");
}

function fadeCurrentPageOut(): Promise<void> {
  return Promise.resolve();
}

function runPageAnimations(isRouteChange = false): void {
  const backgroundLayers = document.querySelectorAll<HTMLElement>(".site-backdrop, .page-ambient");
  if (isRouteChange || motionQuery.matches) {
    backgroundLayers.forEach((layer) => {
      layer.style.opacity = "1";
      layer.style.filter = "blur(0px)";
    });
    root.querySelectorAll<HTMLElement>(animatedPageSelector()).forEach((element) => {
      element.style.opacity = "1";
      element.style.transform = "none";
    });
    return;
  }

  document.querySelectorAll<HTMLElement>(".site-backdrop").forEach((layer) => {
    layer.style.opacity = "0";
  });

  document.querySelectorAll<HTMLElement>(".page-ambient").forEach((layer) => {
    layer.style.opacity = "0";
    layer.style.filter = "blur(24px)";
  });

  root.querySelectorAll<HTMLElement>(animatedPageSelector()).forEach((element) => {
    element.style.opacity = "0";
    element.style.transform = "translateY(32px)";
  });

  const header = root.querySelector<HTMLElement>(".site-header");
  if (header) {
    header.style.opacity = "0";
    header.style.transform = "translateY(-24px)";
  }

  const pageTargets = Array.from(root.querySelectorAll<HTMLElement>(animatedPageSelector().replace(".site-header,", "")));

  requestAnimationFrame(() => {
    document.querySelectorAll<HTMLElement>(".site-backdrop").forEach((layer) => {
      const animation = layer.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 2200,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both"
      });
      animation.finished.then(() => {
        layer.style.opacity = "1";
      }).catch(() => undefined);
    });

    document.querySelectorAll<HTMLElement>(".page-ambient").forEach((layer) => {
      const animation = layer.animate(
        [
          { opacity: 0, filter: "blur(24px)" },
          { opacity: 1, filter: "blur(0px)" }
        ],
        {
          duration: 2200,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "both"
        }
      );
      animation.finished.then(() => {
        layer.style.opacity = "1";
        layer.style.filter = "blur(0px)";
      }).catch(() => undefined);
    });

    if (header) {
      const animation = header.animate(
        [
          { opacity: 0, transform: "translateY(-24px)" },
          { opacity: 1, transform: "translateY(0)" }
        ],
        {
          duration: 2200,
          delay: 180,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "both"
        }
      );
      animation.finished.then(() => {
        header.style.opacity = "1";
        header.style.transform = "translateY(0)";
      }).catch(() => undefined);
    }

    pageTargets.forEach((element, index) => {
      const animation = element.animate(
        [
          { opacity: 0, transform: "translateY(32px)" },
          { opacity: 1, transform: "translateY(0)" }
        ],
        {
          duration: 2200,
          delay: 320 + index * 80,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "both"
        }
      );
      animation.finished.then(() => {
        element.style.opacity = "1";
        element.style.transform = "translateY(0)";
      }).catch(() => undefined);
    });
  });
}

function mount(isRouteChange = false, skipAnimations = false): void {
  const route = routeFromPath();
  const dashboardMode = route === "/dashboard";
  const title = [...navItems, ...infoItems].find((item) => item.path === route)?.label;
  const fallbackTitle = route === "/support" ? "Support" : route === "/login" ? "Login" : route === "/dashboard" ? "Dashboard" : "Info";
  document.title = route === "/" ? "Bloom Productions | Official Website" : `Bloom Productions | ${title || fallbackTitle}`;
  document.body.classList.toggle("dashboard-page", dashboardMode);
  root.innerHTML = `
    ${dashboardMode ? "" : renderHeader(route)}
    <main>${renderRoute(route)}</main>
    ${dashboardMode ? "" : renderFooter()}
    ${renderOwnerPanel()}
  `;

  if (isRouteChange || hasMounted) {
    const header = root.querySelector<HTMLElement>(".site-header");
    if (header) header.style.transform = "translateY(-28px)";
  }

  root.querySelectorAll<HTMLAnchorElement>("[data-route]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      if (!href) return;
      event.preventDefault();
      if (href === window.location.pathname) return;
      if (isTransitioning) return;

      if (!transitionsEnabled) {
        window.history.pushState({}, "", href);
        mount(true, true);
        window.scrollTo({ top: 0 });
        return;
      }

      isTransitioning = true;
      void fadeCurrentPageOut().then(() => {
        window.history.pushState({}, "", href);
        mount(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
        isTransitioning = false;
      });
    });
  });

  root.querySelector<HTMLButtonElement>(".info-toggle")?.addEventListener("click", (event) => {
    event.stopPropagation();
    const menu = root.querySelector<HTMLElement>(".info-menu");
    const toggle = event.currentTarget as HTMLButtonElement;
    const isOpen = menu?.classList.toggle("open") || false;
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  root.querySelector<HTMLButtonElement>(".settings-toggle")?.addEventListener("click", (event) => {
    event.stopPropagation();
    const menu = root.querySelector<HTMLElement>(".settings-menu");
    const toggle = event.currentTarget as HTMLButtonElement;
    const isOpen = menu?.classList.toggle("open") || false;
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  root.querySelector<HTMLInputElement>(".transition-toggle")?.addEventListener("change", (event) => {
    const input = event.currentTarget as HTMLInputElement;
    transitionsEnabled = input.checked;
    localStorage.setItem(transitionStorageKey, transitionsEnabled ? "on" : "off");
  });

  root.querySelector<HTMLInputElement>("#support-custom-amount")?.addEventListener("input", (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const output = root.querySelector<HTMLElement>("[data-support-slider-value]");
    if (output) output.textContent = input.value;
  });

  root.querySelectorAll<HTMLButtonElement>("[data-support-option]").forEach((button) => {
    button.addEventListener("click", async () => {
      const optionSlug = button.dataset.supportOption;
      if (!optionSlug || button.disabled) return;

      const originalText = button.textContent || "Support Bloom";
      button.disabled = true;
      button.textContent = "Loading...";
      try {
        const checkoutUrl = await createSupportCheckout(optionSlug);
        window.location.href = checkoutUrl;
      } catch (error) {
        button.disabled = false;
        button.textContent = originalText;
        const message = error instanceof Error ? error.message : "Could not start support checkout.";
        const panel = root.querySelector<HTMLElement>(".support-options");
        if (panel) {
          panel.insertAdjacentHTML(
            "beforebegin",
            `<article class="support-state"><h2>Checkout could not start.</h2><p>${escapeHtml(message)}</p></article>`
          );
        }
      }
    });
  });

  root.querySelector<HTMLFormElement>("[data-support-custom]")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;
    const input = form.querySelector<HTMLInputElement>("#support-custom-amount");
    const button = form.querySelector<HTMLButtonElement>("button");
    const amount = input?.value.trim() ?? "";
    const messageTarget = root.querySelector<HTMLElement>(".support-options");

    form.querySelector<HTMLElement>(".support-inline-error")?.remove();
    if (!/^\d+$/.test(amount) || Number.parseInt(amount, 10) < 1) {
      form.insertAdjacentHTML("beforeend", `<p class="support-inline-error">Enter a whole dollar amount of at least $1.</p>`);
      input?.focus();
      return;
    }
    if (!button || button.disabled) return;

    const originalText = button.textContent || "Support Bloom";
    button.disabled = true;
    button.textContent = "Loading...";
    try {
      const checkoutUrl = await createSupportCheckout(undefined, amount);
      window.location.href = checkoutUrl;
    } catch (error) {
      button.disabled = false;
      button.textContent = originalText;
      const message = error instanceof Error ? error.message : "Could not start support checkout.";
      if (messageTarget) {
        messageTarget.insertAdjacentHTML(
          "beforebegin",
          `<article class="support-state"><h2>Checkout could not start.</h2><p>${escapeHtml(message)}</p></article>`
        );
      }
    }
  });

  root.querySelector<HTMLFormElement>('[data-auth-form="login"]')?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const supabase = getSiteSupabase();
    const form = event.currentTarget as HTMLFormElement;
    const message = root.querySelector<HTMLElement>('[data-auth-message="login"]');
    const button = form.querySelector<HTMLButtonElement>("button");
    if (!supabase || !button) return;
    button.disabled = true;
    message!.textContent = "Signing in...";
    const formData = new FormData(form);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(formData.get("email") || ""),
      password: String(formData.get("password") || "")
    });
    if (error) {
      message!.textContent = error.message;
      message!.classList.add("error");
      button.disabled = false;
      return;
    }
    await loadAuthState();
    await loadBudSummary();
    window.history.pushState({}, "", "/dashboard");
    mount(true);
  });

  root.querySelector<HTMLFormElement>('[data-auth-form="signup"]')?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const supabase = getSiteSupabase();
    const form = event.currentTarget as HTMLFormElement;
    const message = root.querySelector<HTMLElement>('[data-auth-message="signup"]');
    const button = form.querySelector<HTMLButtonElement>("button");
    if (!supabase || !button) return;
    const formData = new FormData(form);
    const password = String(formData.get("password") || "");
    const passwordIssues = validatePassword(password);
    if (passwordIssues.length) {
      message!.textContent = passwordIssues.join(" ");
      message!.classList.add("error");
      return;
    }
    button.disabled = true;
    message!.textContent = "Creating account...";
    const { error } = await supabase.auth.signUp({
      email: String(formData.get("email") || ""),
      password,
      options: {
        emailRedirectTo: authRedirectUrl,
        data: {
          username: String(formData.get("username") || "").trim()
        }
      }
    });
    if (error) {
      message!.textContent = error.message;
      message!.classList.add("error");
      button.disabled = false;
      return;
    }
    await loadAuthState();
    await loadBudSummary();
    message!.textContent = state.session ? "Account created." : "Check your email to confirm your account.";
    if (state.session) {
      window.history.pushState({}, "", "/dashboard");
      mount(true);
    }
  });

  root.querySelector<HTMLButtonElement>("[data-logout]")?.addEventListener("click", async () => {
    await getSiteSupabase()?.auth.signOut();
    state.session = null;
    state.profile = null;
    state.budPurchases = [];
    state.budLicenses = [];
    state.revealedBudKey = null;
    state.ownerPanelOpen = false;
    state.ownerUsers = [];
    window.history.pushState({}, "", "/");
    mount(true);
  });

  root.querySelector<HTMLFormElement>("[data-profile-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const supabase = getSiteSupabase();
    const user = currentUser();
    const message = root.querySelector<HTMLElement>("[data-profile-message]");
    const form = event.currentTarget as HTMLFormElement;
    const button = form.querySelector<HTMLButtonElement>("button");
    if (!supabase || !user || !button) return;
    button.disabled = true;
    message!.textContent = "Saving...";
    try {
      const formData = new FormData(form);
      const username = String(formData.get("username") || "").trim();
      let profileImageUrl = state.profile?.profile_image_url;
      const file = formData.get("avatar");
      if (file instanceof File && file.size > 0) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "png";
        const path = `${user.id}/avatar-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("profile-images").upload(path, file, {
          cacheControl: "3600",
          upsert: true
        });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from("profile-images").getPublicUrl(path);
        profileImageUrl = data.publicUrl;
      }
      const { error } = await supabase.from("commerce_profiles").upsert({
        user_id: user.id,
        username,
        email: user.email,
        profile_image_url: profileImageUrl
      });
      if (error) throw error;
      await loadBudSummary();
      message!.textContent = "Profile saved.";
      mount(true, true);
    } catch (error) {
      message!.textContent = error instanceof Error ? error.message : "Could not save profile.";
      message!.classList.add("error");
      button.disabled = false;
    }
  });

  root.querySelectorAll<HTMLButtonElement>("[data-bud-checkout]").forEach((button) => {
    button.addEventListener("click", async () => {
      const plan = button.dataset.budCheckout === "monthly" ? "monthly" : "lifetime";
      button.disabled = true;
      const original = button.textContent || "Checkout";
      button.textContent = "Loading...";
      try {
        window.location.href = await startBudCheckout(plan);
      } catch (error) {
        button.textContent = error instanceof Error ? error.message : "Checkout failed.";
      } finally {
        window.setTimeout(() => {
          button.disabled = false;
          button.textContent = original;
        }, 2400);
      }
    });
  });

  root.querySelector<HTMLButtonElement>("[data-claim-bud-key]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    button.textContent = "Checking...";
    try {
      await claimBudKey();
      await loadBudSummary();
      mount(true, true);
    } catch (error) {
      button.textContent = error instanceof Error ? error.message : "Could not show key.";
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = "Show new license key";
      }, 2600);
    }
  });

  root.querySelector<HTMLButtonElement>("[data-copy-bud-key]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const key = button.dataset.copyBudKey || "";
    await navigator.clipboard.writeText(key);
    button.textContent = "Copied";
  });

  root.querySelector<HTMLButtonElement>("[data-owner-panel-toggle]")?.addEventListener("click", async () => {
    state.ownerPanelOpen = !state.ownerPanelOpen;
    if (state.ownerPanelOpen) await loadOwnerUsers();
    mount(true, true);
  });

  root.querySelectorAll<HTMLButtonElement>("[data-owner-free-license]").forEach((button) => {
    button.addEventListener("click", async () => {
      const userId = button.dataset.ownerFreeLicense || "";
      if (!userId) return;
      button.disabled = true;
      button.textContent = "Saving...";
      try {
        await grantFreeBudLicense(userId);
        await Promise.all([loadOwnerUsers(), loadBudSummary()]);
        mount(true, true);
      } catch (error) {
        state.ownerError = error instanceof Error ? error.message : "Could not give free license.";
        mount(true, true);
      }
    });
  });

  document.addEventListener(
    "click",
    () => {
      const menu = root.querySelector<HTMLElement>(".info-menu");
      const toggle = root.querySelector<HTMLButtonElement>(".info-toggle");
      const settingsMenu = root.querySelector<HTMLElement>(".settings-menu");
      const settingsToggle = root.querySelector<HTMLButtonElement>(".settings-toggle");
      menu?.classList.remove("open");
      toggle?.setAttribute("aria-expanded", "false");
      settingsMenu?.classList.remove("open");
      settingsToggle?.setAttribute("aria-expanded", "false");
    },
    { once: true }
  );

  initAmbientLayer();
  initParticles();
  if (skipAnimations) {
    document.querySelectorAll<HTMLElement>(".site-backdrop, .page-ambient").forEach((layer) => {
      layer.style.opacity = "1";
      layer.style.filter = "blur(0px)";
    });

    const particles = document.querySelector<HTMLElement>(".particle-canvas");
    if (particles) particles.style.opacity = "0.84";

    root.querySelectorAll<HTMLElement>(animatedPageSelector()).forEach((element) => {
      element.style.opacity = "1";
      element.style.transform = "translateY(0)";
    });
  } else {
    runPageAnimations(isRouteChange || hasMounted);
  }
  hasMounted = true;
}

window.addEventListener("popstate", () => mount(true, !transitionsEnabled));

void (async () => {
  await Promise.all([loadRelease(), loadSksRelease(), loadNews(), loadSupportOptions(), loadAuthState()]);
  await loadBudSummary();
  getSiteSupabase()?.auth.onAuthStateChange(async (_event: string, session: SiteSession | null) => {
    state.session = session;
    await loadBudSummary();
    mount(true, true);
  });
  mount();
})();
