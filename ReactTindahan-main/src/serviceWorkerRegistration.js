export function register() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/public/service-worker.js")
        .then(() => console.log("🔵 PWA Ready — Service Worker Registered"))
        .catch((err) => console.log("Service Worker Failed:", err));
    });
  }
}
