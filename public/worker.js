const check = () => {
    if (!('serviceWorker' in navigator)) {
        throw new Error('No Service Worker support!')
    }
    if (!('PushManager' in window)) {
        throw new Error('No Push API Support!')
    }
}
const registerServiceWorker = async () => {
    return await navigator.serviceWorker.register('/service.js')
}
const requestNotificationPermission = async () => {
    const permission = await window.Notification.requestPermission()
    if (permission !== 'granted') {
        throw new Error('Permission not granted for Notification')
    }
    return permission
}
const main = async () => {
    console.log('Checking requirements...');
    check();
    console.log('Registering service worker...');
    const swRegistration = await registerServiceWorker();
    console.log('Service worker registered:', swRegistration);
    console.log('Requesting notification permission...');
    const permission = await requestNotificationPermission();
    console.log('Notification permission:', permission);
}
main();