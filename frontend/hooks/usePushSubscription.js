import { useState, useEffect, useCallback } from 'react';
import * as api from '../lib/api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function usePushSubscription(loggedIn, demoMode) {
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscription, setPushSubscription] = useState(null);
  const [pushPermission, setPushPermission] = useState('default');

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    setPushSupported(supported);
    if (supported) {
      setPushPermission(Notification.permission);
    }
  }, []);

  // Check for existing subscription on mount
  useEffect(() => {
    if (!pushSupported || !loggedIn || demoMode) return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setPushSubscription(sub);
      });
    });
  }, [pushSupported, loggedIn, demoMode]);

  const subscribe = useCallback(async () => {
    if (!pushSupported || demoMode) return false;

    const permission = await Notification.requestPermission();
    setPushPermission(permission);
    if (permission !== 'granted') return false;

    const { ok, data } = await api.apiGetVapidKey();
    if (!ok || !data?.vapid_key) return false;

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.vapid_key),
    });

    const res = await api.apiPushSubscribe(sub);
    if (res.ok) {
      setPushSubscription(sub);
      return true;
    }
    return false;
  }, [pushSupported, demoMode]);

  const unsubscribe = useCallback(async () => {
    if (!pushSubscription) return false;

    await api.apiPushUnsubscribe(pushSubscription.endpoint);
    await pushSubscription.unsubscribe();
    setPushSubscription(null);
    return true;
  }, [pushSubscription]);

  return { pushSupported, pushSubscription, pushPermission, subscribe, unsubscribe };
}
