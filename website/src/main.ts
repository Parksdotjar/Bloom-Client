import "./style.css";

if (window.location.pathname !== "/" || window.location.search || window.location.hash) {
  window.history.replaceState({}, "", "/");
}

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root.");
}

document.title = "Bloom Productions | V2";

app.innerHTML = `
  <main class="v2-page" aria-label="Bloom Productions V2">
    <h1>V2<span class="dot dot-one">.</span><span class="dot dot-two">.</span><span class="dot dot-three">.</span></h1>
  </main>
`;
