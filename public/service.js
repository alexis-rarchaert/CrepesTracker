// urlB64ToUint8Array is a magic function that will encode the base64 public key
// to Array buffer which is needed by the subscription option
const urlB64ToUint8Array = base64String => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/')
    const rawData = atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
}
const saveSubscription = async subscription => {
    const SERVER_URL = 'https://nuitaliut.preview.notabl.fr:8083/save-subscription'
    const response = await fetch(SERVER_URL, {
        method: 'post',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscription),
    })
    return response.json()
}

// Garder l'activation avec VAPID
self.addEventListener('activate', async () => {
    console.log('Activating service worker!');
    try {
        const applicationServerKey = urlB64ToUint8Array(
            'BPKA_V-IMOyMx8YLS7zBeWdYrznd64Ee5Ll8J-lG4n6cnwYE751PVgwix8RpyGLo4j_1cKMkIrjaPWdGu1whJto'
        );
        const options = { applicationServerKey, userVisibleOnly: true };

        // Vérifier si déjà abonné pour éviter les erreurs redondantes
        const existingSubscription = await self.registration.pushManager.getSubscription();
        if (existingSubscription) {
            console.log('Already subscribed:', existingSubscription);
            const response = await saveSubscription(existingSubscription);
            console.log(response);
            return;
        }

        const subscription = await self.registration.pushManager.subscribe(options);
        console.log('Push subscription successful:', subscription);
        const response = await saveSubscription(subscription);
        console.log(response);
    } catch (err) {
        console.log('Error', err);
        // Afficher plus de détails sur l'erreur
        console.error('Détails de l\'erreur:', err.message, err.stack);
    }
});
self.addEventListener('install', event => {
    console.log('Service worker installing...');
    self.skipWaiting().then(r => console.log('Service worker installed!'));
});
self.addEventListener('push', function(event) {
    if (event.data) {
        showLocalNotification('Nuit à l\'IUT', event.data.text(), self.registration);
    } else {
        console.log('Push event but no data');
    }
});

const showLocalNotification = (title, body, swRegistration) => {
    const options = {
        body,
        icon: '/assets/notion.png',
        badge: '/assets/notion.png'
    };
    swRegistration.showNotification(title, options).then(r => console.log('Notification sent!'));
}
