import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./tokens.css";
import { demoFromSearch } from "./demos";
const App = lazy(() => import('./App'));
const Landing = lazy(() => import('./Landing'));
const isPresentation = window.location.pathname.replace(/\/$/, '') === '/apresentacao';
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={<p role="status" style={{fontFamily:'var(--font-ui)',padding:24}}>Abrindo Metalboard…</p>}>
      {isPresentation ? <Landing /> : <App demo={demoFromSearch(window.location.search)} />}
    </Suspense>
  </React.StrictMode>,
);
