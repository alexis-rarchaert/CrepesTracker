function main() {
    const permission = document.getElementById('button');
    if(
        (!permission &&
        !('Notification' in window) &&
        !('serviceWorker' in navigator)) ||
    (Notification.permission !== 'default')) {
        return;
    }

    permission.addEventListener('click', async () => {
        await askPermission();
    });
}

async function askPermission() {
    const permission = await Notification.requestPermission();
    if(permission == 'granted') {
        registerServiceWorker();
    }
}

async function registerServiceWorker() {
    const registration = await navigator.serviceWorker.register('/sw.js');
    const subscriptions = await registration.pushManager.getSubscription();

    console.log(subscriptions);
}

main();