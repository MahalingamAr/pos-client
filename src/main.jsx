// client/src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { SessionProvider } from "@/context/SessionContext.jsx";

// Global debug flag (keep for future toggles)
window.__RENGAA_DBG__ = (import.meta.env.VITE_DEBUG === "1"); // 0=off, 1=on

ReactDOM.createRoot(document.getElementById("root")).render(
   <React.StrictMode>
    <SessionProvider>
      <App />
    </SessionProvider>
  </React.StrictMode>
);

