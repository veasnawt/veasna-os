import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import "./index.css";
import App from "./App.tsx";

// index.css reads this to decide whether to apply `env(safe-area-inset-*)` padding itself — Android
// already gets pushed down natively (see capacitor.config.ts's `adjustMarginsForEdgeToEdge: "force"`),
// so applying it again here would double the inset.
document.documentElement.dataset.platform = Capacitor.getPlatform();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
