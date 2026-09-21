import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "tldraw/tldraw.css";
import "./tokens.css";
import "./style.css";
import "./dataflow.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
