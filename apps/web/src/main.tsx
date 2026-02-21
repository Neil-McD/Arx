import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyAppThemeAttributes, parseAppTheme } from "../../../shared/theme";

try {
  const savedTheme = parseAppTheme(localStorage.getItem("arx-theme"));
  applyAppThemeAttributes(savedTheme ?? "dark", document.documentElement);
} catch {
  applyAppThemeAttributes("dark", document.documentElement);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
