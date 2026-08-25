self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || '유림텔레콤 신규 상담';
  const options = {
    body: data.body || '새로운 인터넷 상담 신청이 접수되었습니다.',
    icon: data.icon || '/ureemchungnam-test/icon-192.png',
    badge: data.badge || '/ureemchungnam-test/icon-192.png',
    tag: data.tag || 'ureem-new-consultation',
    renotify: true,
    data: { url: data.url || '/ureemchungnam-test/admin/dashboard.html' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/ureemchungnam-test/admin/dashboard.html', self.location.origin).href;
  event.waitUntil(clients.matchAll({type:'window', includeUncontrolled:true}).then(list => {
    for (const client of list) {
      if ('focus' in client) { client.navigate(target); return client.focus(); }
    }
    return clients.openWindow(target);
  }));
});
