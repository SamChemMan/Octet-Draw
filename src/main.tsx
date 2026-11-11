import React from "react";
import ReactDOM from "react-dom/client";
// Brand fonts are bundled so the app works offline (OFL-1.1).
import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "../brand/tokens.css"; // before App, which reads drawing tokens at load
import App from "./App";
import { watchErrors } from "./crashlog";

watchErrors();

// A build started with VITE_OCTET_BETA=1 (the octet-mcp-beta preview) shows a badge, so it is never taken for the
// installed Octet. Clicks pass through it.
if (import.meta.env.VITE_OCTET_BETA === "1") {
  const badge = document.createElement("div");
  badge.textContent = "MCP BETA";
  badge.setAttribute("aria-hidden", "true");
  Object.assign(badge.style, {
    position: "fixed", top: "6px", left: "50%", transform: "translateX(-50%)", zIndex: "2147483647",
    pointerEvents: "none", padding: "2px 10px", borderRadius: "999px", background: "#B4500F", color: "#FFFFFF",
    font: "600 11px/16px 'Instrument Sans', system-ui, sans-serif", letterSpacing: "0.08em", opacity: "0.92",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.2)",
  });
  document.body.appendChild(badge);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
