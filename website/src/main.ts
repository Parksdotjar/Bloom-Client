import "./style.css";

if (window.location.pathname !== "/" || window.location.search || window.location.hash) {
  window.history.replaceState({}, "", "/");
}

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root.");
}

document.title = "Bloom Productions | Rework in Progress";

app.innerHTML = `
  <main class="maintenance-page">
    <div class="star-field" aria-hidden="true"></div>
    <section class="maintenance-card" aria-labelledby="maintenance-title">
      <div class="logo-wrap">
        <img src="/logo.png" alt="Bloom Productions" />
      </div>
      <p class="eyebrow">Bloom Productions</p>
      <h1 id="maintenance-title">A major rework is underway.</h1>
      <p class="maintenance-copy">The website will return soon.</p>
      <div class="status" aria-label="Website status">
        <span aria-hidden="true"></span>
        Rebuilding Bloom
      </div>
    </section>
  </main>
`;
