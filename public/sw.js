const version = "chavario-shell-glass-7";
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(version)
      .then((c) =>
        c.addAll([
          "/",
          "/style.css",
          "/app.js",
          "/flows.js",
          "/views.js",
          "/dashboard.js",
          "/ui.js",
          "/vendor/icons.js",
          "/keyring.webp",
          "/icon-192.png",
        ]),
      ),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("chavario-shell-") && k !== version)
            .map((k) => caches.delete(k)),
        ),
      ),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin !== location.origin ||
    url.pathname.startsWith("/api/") ||
    event.request.method !== "GET"
  )
    return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then((v) => v || Response.error()),
    ),
  );
});
