/* eslint-disable no-undef */
// Firebase Messaging Service Worker for background push notifications
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyALlJ5PSaZGuI9MvAEI0dpzmhWf0q5q86w",
  authDomain: "wms-kemika.firebaseapp.com",
  projectId: "wms-kemika",
  storageBucket: "wms-kemika.firebasestorage.app",
  messagingSenderId: "788659539956",
  appId: "1:788659539956:web:a1312774fb67ac7d91b3a1",
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Background message received:', payload);

  const notificationTitle = payload.notification?.title || 'WMS KEMIKA';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/logo-kemika.png',
    badge: '/favicon.png',
    tag: payload.data?.tag || 'default',
    requireInteraction: payload.data?.requireInteraction === 'true',
    data: payload.data,
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification click:', event);
  event.notification.close();

  const link = event.notification.data?.link || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if available
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(link);
          return;
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(link);
      }
    })
  );
});
