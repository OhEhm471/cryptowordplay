import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

// Initialize Farcaster Frame SDK
async function initFrame() {
  try {
    const { sdk } = await import("@farcaster/frame-sdk");
    await sdk.actions.ready();
  } catch {
    // Not in a Farcaster frame — normal browser, ignore
  }
}

initFrame();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);