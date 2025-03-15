self.addEventListener('install', async () => {
    skipWaiting();
});

self.addEventListener('push', (event) => {
    console.log(event.data);
    const data = event.data ? event.data.json() : {};
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.message,
            data: data
        })
    );
});