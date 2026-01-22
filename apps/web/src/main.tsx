import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

try {
  const savedTheme = localStorage.getItem("arx-theme");
  document.documentElement.setAttribute("data-theme", savedTheme || "dark");
} catch {
  document.documentElement.setAttribute("data-theme", "dark");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
