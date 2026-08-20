/**
 * lib/native-bridge.ts
 * Safe Capacitor Native Bridge for Android Notification Listener & Navigation
 */

import { registerPlugin } from "@capacitor/core";

export interface NativeNotification {
  id: number;
  key: string;
  packageName: string;
  appName: string;
  title: string;
  text: string;
  subText?: string;
  bigText?: string;
  postTime: number;
  timestamp: number;
  isClearable?: boolean;
  isOngoing?: boolean;
  category?: string;
}

export interface NotificationListenerPluginInterface {
  isNotificationAccessGranted(): Promise<{ granted: boolean; packageName?: string }>;
  requestNotificationAccess(): Promise<{ success: boolean; message?: string; fallback?: boolean }>;
  openNotificationAccessSettings(): Promise<{ success: boolean; message?: string }>;
  getNotifications(): Promise<{ notifications: NativeNotification[]; count: number }>;
  clearNotifications(): Promise<{ success: boolean; cleared: boolean }>;
  goHome(): Promise<{ success: boolean }>;
  goBack(): Promise<{ success: boolean }>;
  openNotifications(): Promise<{ success: boolean }>;
  openSettings(): Promise<{ success: boolean }>;
  exitApp(): Promise<{ success: boolean }>;
  addListener(
    eventName: "notificationPosted",
    listenerFunc: (notification: NativeNotification) => void
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: "notificationRemoved",
    listenerFunc: (data: { id: number; key: string; packageName: string; postTime?: number }) => void
  ): Promise<{ remove: () => Promise<void> }>;
  removeAllListeners(): Promise<void>;
}

// Safely register the Capacitor plugin
export const NotificationListener = registerPlugin<NotificationListenerPluginInterface>("NotificationListener");

/**
 * Helper to check if currently running in native Android / Capacitor environment
 */
export function isNativePlatform(): boolean {
  if (typeof window === "undefined") return false;
  const isCapacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() ?? false;
  return isCapacitor;
}

/**
 * Check if Android Notification Listener Access is granted
 */
export async function checkNotificationAccess(): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    const res = await NotificationListener.isNotificationAccessGranted();
    return res.granted === true;
  } catch (err) {
    console.warn("[NativeBridge] checkNotificationAccess error:", err);
    return false;
  }
}

/**
 * Request user to open Android Notification Access Settings
 */
export async function requestNotificationAccess(): Promise<boolean> {
  if (!isNativePlatform()) {
    console.info("[NativeBridge] Not running on native Android platform.");
    return false;
  }
  try {
    const res = await NotificationListener.requestNotificationAccess();
    return res.success === true;
  } catch (err) {
    console.warn("[NativeBridge] requestNotificationAccess error:", err);
    return false;
  }
}

/**
 * Retrieve recent notifications captured by the Android listener
 */
export async function getRecentNotifications(): Promise<NativeNotification[]> {
  if (!isNativePlatform()) return [];
  try {
    const res = await NotificationListener.getNotifications();
    return res.notifications || [];
  } catch (err) {
    console.warn("[NativeBridge] getRecentNotifications error:", err);
    return [];
  }
}

/**
 * Clear in-memory notification history
 */
export async function clearNotifications(): Promise<boolean> {
  if (!isNativePlatform()) return true;
  try {
    const res = await NotificationListener.clearNotifications();
    return res.success === true;
  } catch (err) {
    console.warn("[NativeBridge] clearNotifications error:", err);
    return false;
  }
}

/**
 * Subscribe to real-time incoming notification events
 */
export function onNotificationReceived(
  callback: (notification: NativeNotification) => void
): () => void {
  let removeListener: (() => void) | null = null;

  if (isNativePlatform()) {
    NotificationListener.addListener("notificationPosted", (data) => {
      callback(data);
    })
      .then((handle) => {
        removeListener = () => {
          handle.remove().catch(() => {});
        };
      })
      .catch((err) => {
        console.warn("[NativeBridge] Failed to add notification listener:", err);
      });
  }

  return () => {
    if (removeListener) removeListener();
  };
}

/**
 * Native & Web Navigation Actions
 */
export const nativeNav = {
  goHome: async () => {
    if (isNativePlatform()) {
      try {
        await NotificationListener.goHome();
        return;
      } catch (err) {
        console.warn("[NativeBridge] goHome error:", err);
      }
    }
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  },

  goBack: async () => {
    if (isNativePlatform()) {
      try {
        await NotificationListener.goBack();
        return;
      } catch (err) {
        console.warn("[NativeBridge] goBack error:", err);
      }
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    }
  },

  openNotifications: async () => {
    if (isNativePlatform()) {
      try {
        await NotificationListener.openNotifications();
        return;
      } catch (err) {
        console.warn("[NativeBridge] openNotifications error:", err);
      }
    }
  },

  openSettings: async () => {
    if (isNativePlatform()) {
      try {
        await NotificationListener.openSettings();
        return;
      } catch (err) {
        console.warn("[NativeBridge] openSettings error:", err);
      }
    }
  },

  exitApp: async () => {
    if (isNativePlatform()) {
      try {
        await NotificationListener.exitApp();
        return;
      } catch (err) {
        console.warn("[NativeBridge] exitApp error:", err);
      }
    }
  },
};
