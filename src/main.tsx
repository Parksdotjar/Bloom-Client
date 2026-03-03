import React from "react";
import ReactDOM from "react-dom/client";
import { engine } from "animejs";
import App from "./App";
import { AuthProvider } from "./hooks/useAuth";

engine.defaults.frameRate = 14;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);
