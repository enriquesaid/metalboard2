import { createContext, useContext, useLayoutEffect, useMemo, useRef } from "react";
import { getAssetUrlsByImport } from "@tldraw/assets/imports.vite";
import { Download, LockKeyhole, RotateCw, TriangleAlert } from "lucide-react";
import { ErrorBoundary, Tldraw, type TldrawProps } from "tldraw";
import { desktopAvailable } from "./runtime";
import "./board-recovery.css";

export type CanvasIssue = "license" | "error";

type BoardCanvasProps = TldrawProps & {
  issue?: CanvasIssue;
  onUnavailable: (issue: CanvasIssue) => void;
  onExportBackup?: () => Promise<void>;
};

const FailureContext = createContext<BoardCanvasProps["onUnavailable"] | null>(null);
const assetUrls = getAssetUrlsByImport();

function ReportCanvasError() {
  const onUnavailable = useContext(FailureContext);
  useLayoutEffect(() => onUnavailable?.("error"), [onUnavailable]);
  return null;
}

export function BoardCanvas({ issue, onUnavailable, onExportBackup, components, ...props }: BoardCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const editorComponents = useMemo(() => ({ ...components, ErrorFallback: ReportCanvasError }), [components]);
  const missingDesktopKey = import.meta.env.PROD && desktopAvailable && !props.licenseKey?.trim();

  useLayoutEffect(() => {
    if (issue) return;
    if (missingDesktopKey) {
      onUnavailable("license");
      return;
    }

    // tldraw 5.4.2 exposes no public license-status event. Its license gate mounts
    // directly under this root, even if the local store hasn't finished loading.
    const root = host.current?.querySelector(":scope > [data-tldraw]");
    if (!root) return;
    const detectLicenseGate = () => {
      if (root.querySelector(':scope > [data-testid="tl-license-expired"]')) onUnavailable("license");
    };
    const observer = new MutationObserver(detectLicenseGate);
    observer.observe(root, { childList: true });
    detectLicenseGate();
    return () => observer.disconnect();
  }, [issue, missingDesktopKey, onUnavailable]);

  const failure = issue ?? (missingDesktopKey ? "license" : undefined);
  if (failure) {
    const licenseRequired = failure === "license";
    return (
      <section className="board-recovery" aria-labelledby="recovery-title">
        <div className="board-recovery-content">
          {licenseRequired ? <LockKeyhole size={22} aria-hidden="true" /> : <TriangleAlert size={22} aria-hidden="true" />}
          <div role="alert">
            <h1 id="recovery-title">{licenseRequired ? "A edição precisa de uma licença" : "O board não abriu"}</h1>
            <p>{licenseRequired
              ? "Esta versão do Metalboard precisa de uma licença válida do tldraw para abrir o editor."
              : "O editor encontrou um erro ao abrir o canvas. Tente recarregar o Metalboard."}</p>
            {onExportBackup && <p>Você pode exportar a última cópia salva neste dispositivo.</p>}
          </div>
          <div className="board-recovery-actions">
            {onExportBackup && <button type="button" className="ui-action ui-action--primary" onClick={() => void onExportBackup()}><Download size={15} />Exportar cópia local</button>}
            {!licenseRequired && <button type="button" className="ui-action" onClick={() => window.location.reload()}><RotateCw size={15} />Recarregar</button>}
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="board-canvas-host" ref={host}>
      <FailureContext.Provider value={onUnavailable}>
        <ErrorBoundary fallback={ReportCanvasError}>
          <Tldraw assetUrls={assetUrls} {...props} components={editorComponents} />
        </ErrorBoundary>
      </FailureContext.Provider>
    </div>
  );
}
