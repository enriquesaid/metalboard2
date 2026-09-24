// O wheel dentro de conteúdo rolável dos blocos é interceptado pelo canvas do
// tldraw (listener nativo em fase de bolha que faz preventDefault e move a
// câmera), então notas e saídas ficam "cortadas" sem como rolar. Este listener
// roda em captura no documento — antes do tldraw — e só interrompe a
// propagação quando o elemento sob o cursor realmente consegue consumir o
// scroll naquela direção; nas bordas o evento segue para o canvas (pan).
export function installScrollThrough() {
  const onWheel = (event: WheelEvent) => {
    // pinch-zoom do trackpad continua sendo zoom do canvas
    if (event.ctrlKey || event.metaKey) return;
    let node = event.target as HTMLElement | null;
    while (node && node !== document.body) {
      if (node.nodeType === 1) {
        const { overflowY } = getComputedStyle(node);
        if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) {
          const canConsume =
            event.deltaY < 0
              ? node.scrollTop > 0
              : node.scrollTop + node.clientHeight < node.scrollHeight - 1;
          if (canConsume) {
            event.stopPropagation();
            return;
          }
        }
      }
      node = node.parentElement;
    }
  };
  document.addEventListener("wheel", onWheel, { capture: true, passive: true });
  return () => document.removeEventListener("wheel", onWheel, { capture: true });
}
