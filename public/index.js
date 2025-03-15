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
    const registration = await navigator.serviceWorker.register('sw.js');
    let subscription = await registration.pushManager.getSubscription();

    if(subscription) {
        console.log(subscription);
        return;
    }

    subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: await getPublicKey(),
    });

    saveSubscription(subscription);
}

async function getPublicKey() {
    return "BI_-zsHnL4wu28le_1iEFTqz1Anf-wUAJRFSCvZ3gLrRy2SORJ8xBNdHHdGg6Q8BFaqA6DfSM8IceQF4Wtq71m0";
}

async function saveSubscription(subscription) {
    await fetch('http://nuitaliut.preview.notabl.fr:8080/save-subscription', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify(subscription),
    })
}

main();