import React from "react";
import { createRoot } from "react-dom/client";
Object.assign(window, {
  React,
  renderPreview: (App: React.ComponentType<{input:unknown}>, input:unknown) =>
    createRoot(document.getElementById("preview-root")!).render(<App input={input} />),
});
