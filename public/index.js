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
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('userId');

    try {
        const registration = await navigator.serviceWorker.register('sw.js');
        console.log('Service Worker registered');

        // Attendre que le Service Worker soit activé
        await navigator.serviceWorker.ready;
        console.log('Service Worker ready');

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: await getPublicKey(),
            });
        }

        await saveSubscription(subscription, userId);
    } catch (error) {
        console.error('Service Worker registration failed:', error);
    }
}

async function getPublicKey() {
    return "BI_-zsHnL4wu28le_1iEFTqz1Anf-wUAJRFSCvZ3gLrRy2SORJ8xBNdHHdGg6Q8BFaqA6DfSM8IceQF4Wtq71m0";
}

async function saveSubscription(subscription, userId) {
    await fetch('https://nuitaliut.preview.notabl.fr/save-subscription', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({
            subscription: subscription,
            userId: userId
        }),
    })
}

main();