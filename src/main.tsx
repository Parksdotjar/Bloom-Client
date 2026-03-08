import React from "react";
import ReactDOM from "react-dom/client";
import { engine } from "animejs";
import App from "./App";
import { AuthProvider } from "./hooks/useAuth";
import { DownloaderProvider } from "./hooks/useDownloader";
import { InstancesProvider } from "./hooks/useInstances";

engine.defaults.frameRate = 14;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <InstancesProvider>
        <DownloaderProvider>
          <App />
        </DownloaderProvider>
      </InstancesProvider>
    </AuthProvider>
  </React.StrictMode>,
);
