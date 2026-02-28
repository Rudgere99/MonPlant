export function isMobileViewport() {
  // Ajuste o breakpoint se quiser (900 é um bom meio-termo)
  return window.matchMedia("(max-width: 900px)").matches;
}
