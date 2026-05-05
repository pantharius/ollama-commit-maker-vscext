import React from "react";
import { createRoot } from "react-dom/client";
import "react-diff-view/style/index.css";
import "./styles.css";
import { App } from "./App";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing root element.");
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
