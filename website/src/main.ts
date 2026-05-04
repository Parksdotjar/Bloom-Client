import { createClient } from "@supabase/supabase-js";
import { animate as animeAnimate, stagger } from "animejs";
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

type Route = "/" | "/downloads" | "/news" | "/staff" | "/about" | "/faq";

const updatesJsonUrl = import.meta.env.VITE_UPDATES_JSON_URL || "/latest.json";
const siteUrl = import.meta.env.VITE_SITE_URL || "https://bloomclient.org";

const state: AppState = {
  news: []
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app root.");
const root = app;
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let hasMounted = false;
let isTransitioning = false;

const navItems: Array<{ path: Route; label: string }> = [
  { path: "/", label: "Home" },
  { path: "/downloads", label: "Downloads" },
  { path: "/news", label: "News" },
  { path: "/staff", label: "Staff" }
];

const infoItems: Array<{ path: Route; label: string }> = [
  { path: "/about", label: "About" },
  { path: "/faq", label: "FAQ" }
];

const productCards = [
  {
    title: "Instance launcher",
    body: "Keep your Minecraft installs clean, organized, and easy to start."
  },
  {
    title: "Cosmetics locker",
    body: "Keep your capes and cosmetics in one simple place."
  },
  {
    title: "Marketplace tools",
    body: "Find packs, shaders, and tools without the clutter."
  },
  {
    title: "Built-in games",
    body: "Take a break with small games built into the client."
  }
];

const staffMembers = [
  { name: "Parks", role: "Owner", image: "/staff/parks.jpg" },
  { name: "Looking for...", role: "Co-Owner", image: "" },
  { name: "Looking for...", role: "Head Manager", image: "" },
  { name: "Wqfflez", role: "Manager", image: "/staff/wqfflez.png" }
];

const discordInviteUrl = "https://discord.gg/aSCnu2CTm6";

const faqItems = [
  {
    question: "Why does my antivirus say Bloom Client is a virus?",
    answer:
      "Some antivirus tools flag new launchers because they download files, start Minecraft, manage folders, and connect to online services. Those actions can look suspicious to scanners, even when the app is doing normal launcher work."
  },
  {
    question: "Why does Bloom Client not have a code signing certificate yet?",
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
    question: "Where should I download Bloom Client?",
    answer:
      "Use the Downloads page on bloomclient.org. Avoid random reuploads or links from people you do not trust."
  },
  {
    question: "What Minecraft version does Bloom focus on?",
    answer:
      "Bloom currently focuses on modern Fabric instances, with the latest client build shown on the Downloads page."
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
      "Join the Bloom Client Discord from the footer. It is the easiest place to ask questions and check current updates."
  }
];

function routeFromPath(pathname = window.location.pathname): Route {
  if (pathname === "/downloads") return "/downloads";
  if (pathname === "/news") return "/news";
  if (pathname === "/staff") return "/staff";
  if (pathname === "/about") return "/about";
  if (pathname === "/faq") return "/faq";
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
  const infoActive = route === "/about" || route === "/faq";
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
        <div class="info-menu">
          <button class="info-toggle ${infoActive ? "active" : ""}" type="button" aria-expanded="false">
            Info
            <span class="info-arrow" aria-hidden="true"></span>
          </button>
          <div class="info-dropdown">
            ${infoItems
              .map(
                (item) =>
                  `<a class="${item.path === route ? "active" : ""}" href="${item.path}" data-route="${item.path}">${item.label}</a>`
              )
              .join("")}
          </div>
        </div>
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
        <p class="lead">Welcome to your calmer Minecraft experience.</p>
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
        <p>Install the current build and get back into Minecraft with less noise.</p>
      </div>
      <a class="btn secondary" href="/downloads" data-route="/downloads">Check downloads</a>
    </section>
  `;
}

function renderDownloads(): string {
  const release = state.release;
  const version = release?.version ? `v${escapeHtml(release.version)}` : "Unavailable";
  const detail = state.releaseError
    ? "The download is not available right now."
    : "The latest Windows build is ready.";

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

function renderAbout(): string {
  return `
    <section class="page-hero compact">
      <p class="eyebrow">About</p>
      <h1>Built for the Bloom ecosystem.</h1>
      <p>A cleaner place for Bloom downloads, updates, and links.</p>
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
        <p>Use bloomclient.org for the real Bloom Client site.</p>
      </article>
    </section>
  `;
}

function renderFaq(): string {
  return `
    <section class="page-hero compact">
      <p class="eyebrow">FAQ</p>
      <h1>Common questions.</h1>
      <p>Simple answers for Bloom Client safety, downloads, and setup.</p>
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
  if (route === "/about") return renderAbout();
  if (route === "/faq") return renderFaq();
  return renderHome();
}

function renderFooter(): string {
  const year = new Date().getFullYear();
  return `
    <footer class="site-footer">
      <div class="footer-brand">
        <img src="/logo.png" alt="Bloom Client logo" />
        <div>
          <strong>Bloom Client</strong>
          <span>Copyright ${year} Bloom Client. All rights reserved.</span>
        </div>
      </div>
      <nav class="footer-links" aria-label="Footer links">
        <a href="/downloads" data-route="/downloads">Downloads</a>
        <a href="/news" data-route="/news">News</a>
        <a href="/staff" data-route="/staff">Staff</a>
        <a href="/about" data-route="/about">About</a>
        <a href="/faq" data-route="/faq">FAQ</a>
        <a class="discord-link" href="${discordInviteUrl}" target="_blank" rel="noreferrer" aria-label="Join the Bloom Client Discord">
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

  const ambient = document.createElement("div");
  ambient.className = "page-ambient";
  ambient.setAttribute("aria-hidden", "true");
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

function fadeCurrentPageOut(): Promise<void> {
  fadeParticles(0, 2000);

  return new Promise((resolve) => {
    const targets = root.querySelectorAll<HTMLElement>(".site-header, main, .site-footer");
    if (!targets.length) {
      window.setTimeout(resolve, 2000);
      return;
    }

    animeAnimate(targets, {
      opacity: 0,
      duration: 2000,
      ease: "inOutCubic",
      complete: resolve
    });
  });
}

function runPageAnimations(isRouteChange = false): void {
  if (!isRouteChange) {
    const ambient = document.querySelector<HTMLElement>(".page-ambient");
    if (ambient) {
      animeAnimate(ambient, {
        opacity: [0, 1],
        filter: ["blur(24px)", "blur(0px)"],
        duration: 2000,
        ease: "outCubic"
      });
    }

    fadeParticles(0.84, 2000);
  } else {
    const ambient = document.querySelector<HTMLElement>(".page-ambient");
    if (ambient) {
      ambient.style.opacity = "1";
      ambient.style.filter = "blur(0px)";
    }

    fadeParticles(0.84, 2000);
  }

  animeAnimate(".site-header", {
    opacity: [0, 1],
    ...(isRouteChange ? {} : { translateY: [-28, 0] }),
    duration: 2000,
    delay: isRouteChange ? 0 : 520,
    ease: "outCubic"
  });

  animeAnimate(
    [
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
      ".staff-card",
      ".about-grid article",
      ".faq-item",
      ".site-footer > *"
    ].join(", "),
    {
      opacity: [0, 1],
      translateY: [46, 0],
      duration: 2000,
      delay: stagger(135, { start: isRouteChange ? 0 : 820 }),
      ease: "outCubic"
    }
  );
}

function mount(isRouteChange = false): void {
  const route = routeFromPath();
  const title = [...navItems, ...infoItems].find((item) => item.path === route)?.label;
  document.title = route === "/" ? "Bloom Client | Official Website" : `Bloom Client | ${title || "Info"}`;
  root.innerHTML = `
    ${renderHeader(route)}
    <main>${renderRoute(route)}</main>
    ${renderFooter()}
  `;

  root.querySelectorAll<HTMLAnchorElement>("[data-route]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      if (!href) return;
      event.preventDefault();
      if (href === window.location.pathname) return;
      if (isTransitioning) return;

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

  document.addEventListener(
    "click",
    () => {
      const menu = root.querySelector<HTMLElement>(".info-menu");
      const toggle = root.querySelector<HTMLButtonElement>(".info-toggle");
      menu?.classList.remove("open");
      toggle?.setAttribute("aria-expanded", "false");
    },
    { once: true }
  );

  initAmbientLayer();
  initParticles();
  runPageAnimations(isRouteChange || hasMounted);
  hasMounted = true;
}

window.addEventListener("popstate", () => mount(true));

void Promise.all([loadRelease(), loadNews()]).finally(mount);
