// Service worker du site sales : reçoit les notifications push.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title || "Kairós", {
    body: d.body || "",
    icon: "icon-192.png",
    data: { url: d.url || "./" }
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if ("focus" in c) return c.focus();
    return clients.openWindow(e.notification.data && e.notification.data.url || "./");
  }));
});
