// src/mobile/isMobile.ts
export function isMobileViewport() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 860px)").matches;
}
