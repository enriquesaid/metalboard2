import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./tokens.css";
import { demoFromSearch } from "./demos";
import { desktopAvailable } from "./runtime";
const App = lazy(() => import('./App'));
const Landing = lazy(() => import('./Landing'));
const path = window.location.pathname.replace(/\/$/, '') || '/';
const demo = demoFromSearch(window.location.search);
const openBoard = new URLSearchParams(window.location.search).has('board');
const isPresentation = !desktopAvailable && !demo && !openBoard && (path === '/' || path === '/apresentacao');
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={<p role="status" style={{fontFamily:'var(--font-ui)',padding:24}}>Abrindo Metalboard…</p>}>
      {isPresentation ? <Landing /> : <App demo={demo} />}
    </Suspense>
  </React.StrictMode>,
);
