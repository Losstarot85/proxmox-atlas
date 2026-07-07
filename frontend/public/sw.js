// Service Worker for Proxmox Atlas Push Notifications

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SHOW_NOTIFICATION") {
    const { title, body, url, tag } = event.data;
    event.waitUntil(
      self.registration.showNotification(title, {
        body: body,
        icon: "/logo.png",
        badge: "/favicon.svg",
        tag: tag || "atlas-alert",
        renotify: true,
        data: { url: url || "/" },
      })
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Find a window client that is already open
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(urlToOpen) && "focus" in client) {
          return client.focus();
        }
      }
      // If we have any open window but url is different, navigate it
      if (windowClients.length > 0) {
        const client = windowClients[0];
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) {
            return client.navigate(urlToOpen);
          }
        }
      }
      // If no windows are open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
