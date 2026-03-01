// src/mobile/useIsMobile.ts
import { useEffect, useState } from "react";
import { isMobileViewport } from "./isMobile";

export function useIsMobile() {
  const [mobile, setMobile] = useState(isMobileViewport());

  useEffect(() => {
    const onResize = () => setMobile(isMobileViewport());
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return mobile;
}
