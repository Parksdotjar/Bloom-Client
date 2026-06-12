import "./style.css";

if (window.location.pathname !== "/" || window.location.search || window.location.hash) {
  window.history.replaceState({}, "", "/");
}

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root.");
}

document.title = "Bloom Productions | Away From Keyboard";

app.innerHTML = `
  <main class="maintenance-page">
    <section class="visual-panel" aria-label="Minecraft landscape">
      <div class="visual-shade" aria-hidden="true"></div>
      <a class="brand" href="/" aria-label="Bloom Productions home">
        <img src="/logo.png" alt="" />
        <span>Bloom Productions</span>
      </a>
      <p class="visual-caption">Building the next chapter.</p>
    </section>

    <section class="content-panel" aria-labelledby="maintenance-title">
      <div class="content-inner">
        <p class="status-line"><span aria-hidden="true"></span> WEBSITE_REWORK_ACTIVE</p>
        <h1 id="maintenance-title">Currently Away From Keyboard..</h1>
        <p class="maintenance-copy">
          Bloom Productions is getting a full rebuild. Quality takes time, and we are making this one count.
        </p>

        <div class="discord-block">
          <p>FOLLOW THE REBUILD</p>
          <a class="remind-button" href="https://discord.gg/m5uNPsNF39" target="_blank" rel="noreferrer">
            <span>REMIND ME</span>
            <span class="arrow" aria-hidden="true">→</span>
          </a>
          <small>Join the Discord for progress updates and the return announcement.</small>
        </div>

        <div class="hover-card" tabindex="0">
          <div class="hover-trigger">
            <span>HOVER ME!</span>
            <span aria-hidden="true">→</span>
          </div>
          <div class="hover-reveal">
            The old pages are offline while we rebuild the website, dashboard, and project experience from the ground up.
          </div>
        </div>
      </div>
    </section>
  </main>
`;
