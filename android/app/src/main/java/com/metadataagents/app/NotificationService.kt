package com.metadataagents.app

import android.app.Notification
import android.content.Context
import android.content.pm.PackageManager
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import java.util.Collections

/**
 * Android NotificationListenerService to intercept system notifications safely
 * and relay them to Capacitor JavaScript layer.
 */
class NotificationService : NotificationListenerService() {

    companion object {
        private const val TAG = "NotificationService"
        private const val MAX_HISTORY = 50

        // Active plugin instance reference
        @Volatile
        var pluginInstance: NotificationListenerPlugin? = null

        // In-memory thread-safe notification history cache
        private val notificationHistory: MutableList<JSObject> = Collections.synchronizedList(mutableListOf())

        fun registerPlugin(plugin: NotificationListenerPlugin) {
            pluginInstance = plugin
            Log.d(TAG, "NotificationListenerPlugin registered to NotificationService")
        }

        fun unregisterPlugin(plugin: NotificationListenerPlugin) {
            if (pluginInstance == plugin) {
                pluginInstance = null
                Log.d(TAG, "NotificationListenerPlugin unregistered from NotificationService")
            }
        }

        fun getRecentNotifications(): JSArray {
            val array = JSArray()
            synchronized(notificationHistory) {
                for (item in notificationHistory) {
                    array.put(item)
                }
            }
            return array
        }

        fun clearRecentNotifications() {
            synchronized(notificationHistory) {
                notificationHistory.clear()
            }
        }
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.i(TAG, "NotificationListenerService connected and active")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        Log.w(TAG, "NotificationListenerService disconnected")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        try {
            val data = extractNotificationData(sbn)
            
            // Add to in-memory history cache
            synchronized(notificationHistory) {
                notificationHistory.add(0, data)
                if (notificationHistory.size > MAX_HISTORY) {
                    notificationHistory.removeAt(notificationHistory.size - 1)
                }
            }

            // Relay directly to Capacitor JS listeners if plugin is active
            pluginInstance?.onNotificationPosted(data)
        } catch (e: Exception) {
            Log.e(TAG, "Error processing onNotificationPosted", e)
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        super.onNotificationRemoved(sbn)
        if (sbn == null) return

        try {
            val data = JSObject().apply {
                put("id", sbn.id)
                put("key", sbn.key ?: "")
                put("packageName", sbn.packageName ?: "")
                put("postTime", sbn.postTime)
                put("removedAt", System.currentTimeMillis())
            }

            pluginInstance?.onNotificationRemoved(data)
        } catch (e: Exception) {
            Log.e(TAG, "Error processing onNotificationRemoved", e)
        }
    }

    private fun extractNotificationData(sbn: StatusBarNotification): JSObject {
        val notification = sbn.notification
        val extras: Bundle? = notification?.extras

        val title = extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString()
            ?: extras?.getString(Notification.EXTRA_TITLE)
            ?: ""

        val text = extras?.getCharSequence(Notification.EXTRA_TEXT)?.toString()
            ?: extras?.getString(Notification.EXTRA_TEXT)
            ?: ""

        val subText = extras?.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString()
            ?: extras?.getString(Notification.EXTRA_SUB_TEXT)
            ?: ""

        val bigText = extras?.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
            ?: extras?.getString(Notification.EXTRA_BIG_TEXT)
            ?: ""

        val appName = getAppNameFromPackage(this, sbn.packageName)

        return JSObject().apply {
            put("id", sbn.id)
            put("key", sbn.key ?: "")
            put("packageName", sbn.packageName ?: "")
            put("appName", appName)
            put("title", title)
            put("text", text)
            put("subText", subText)
            put("bigText", bigText)
            put("postTime", sbn.postTime)
            put("timestamp", System.currentTimeMillis())
            put("isClearable", sbn.isClearable)
            put("isOngoing", sbn.isOngoing)
            put("category", notification?.category ?: "")
        }
    }

    private fun getAppNameFromPackage(context: Context, packageName: String?): String {
        if (packageName.isNullOrEmpty()) return "Unknown"
        return try {
            val pm: PackageManager = context.packageManager
            val appInfo = pm.getApplicationInfo(packageName, 0)
            pm.getApplicationLabel(appInfo).toString()
        } catch (e: Exception) {
            packageName
        }
    }
}
