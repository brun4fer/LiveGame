"use client";

import { useEffect } from "react";

export function PwaRegistrar() {
  useEffect(() => {
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
    if (!("serviceWorker" in navigator) || (!window.isSecureContext && !local)) return;

    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    const reloadForUpdate = () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", reloadForUpdate);
    navigator.serviceWorker.register("/sw.js").then((registration) => registration.update()).catch(() => undefined);

    return () => navigator.serviceWorker.removeEventListener("controllerchange", reloadForUpdate);
  }, []);
  return null;
}

