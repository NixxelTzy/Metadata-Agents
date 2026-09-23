package com.metadataagents.app

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "NotificationListener")
class NotificationListenerPlugin : Plugin() {

    companion object {
        private const val TAG = "NotificationPlugin"
        const val EVENT_NOTIFICATION_POSTED = "notificationPosted"
        const val EVENT_NOTIFICATION_REMOVED = "notificationRemoved"
    }

    override fun load() {
        super.load()
        NotificationService.registerPlugin(this)
        Log.d(TAG, "NotificationListenerPlugin loaded and bound to NotificationService")
    }

    override fun handleOnDestroy() {
        NotificationService.unregisterPlugin(this)
        super.handleOnDestroy()
    }

    /**
     * Relays notification data directly from NotificationService to Capacitor JS event listeners
     */
    fun onNotificationPosted(data: JSObject) {
        notifyListeners(EVENT_NOTIFICATION_POSTED, data, true)
    }

    /**
     * Relays notification removed event to Capacitor JS event listeners
     */
    fun onNotificationRemoved(data: JSObject) {
        notifyListeners(EVENT_NOTIFICATION_REMOVED, data, true)
    }

    /**
     * Check if Android Notification Access permission is enabled for this application
     */
    @PluginMethod
    fun isNotificationAccessGranted(call: PluginCall) {
        try {
            val ctx = context
            val enabledPackages = NotificationManagerCompat.getEnabledListenerPackages(ctx)
            val isGranted = enabledPackages.contains(ctx.packageName)

            val ret = JSObject().apply {
                put("granted", isGranted)
                put("packageName", ctx.packageName)
            }
            call.resolve(ret)
        } catch (e: Exception) {
            Log.e(TAG, "Error checking notification access", e)
            call.reject("Failed to check notification access: ${e.message}", e)
        }
    }

    /**
     * Open the Android Notification Listener Access settings screen
     */
    @PluginMethod
    fun requestNotificationAccess(call: PluginCall) {
        try {
            val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).apply {
                    val componentName = ComponentName(context, NotificationService::class.java)
                    putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, componentName.flattenToString())
                }
            } else {
                Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            }

            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

            // Verify if there is an activity to handle the intent
            if (intent.resolveActivity(context.packageManager) != null) {
                activity.startActivity(intent)
            } else {
                // Fallback to standard listener settings
                val fallbackIntent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.startActivity(fallbackIntent)
            }

            val ret = JSObject().apply {
                put("success", true)
                put("message", "Opened Notification Access Settings")
            }
            call.resolve(ret)
        } catch (e: Exception) {
            Log.e(TAG, "Error opening notification access settings", e)
            // Fallback to application settings
            try {
                val appSettingsIntent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.startActivity(appSettingsIntent)
                call.resolve(JSObject().put("success", true).put("fallback", true))
            } catch (fallbackError: Exception) {
                call.reject("Failed to open settings: ${e.message}", e)
            }
        }
    }

    /**
     * Alias for requestNotificationAccess
     */
    @PluginMethod
    fun openNotificationAccessSettings(call: PluginCall) {
        requestNotificationAccess(call)
    }

    /**
     * Retrieve buffered recent notifications
     */
    @PluginMethod
    fun getNotifications(call: PluginCall) {
        try {
            val list = NotificationService.getRecentNotifications()
            val ret = JSObject().apply {
                put("notifications", list)
                put("count", list.length())
            }
            call.resolve(ret)
        } catch (e: Exception) {
            Log.e(TAG, "Error retrieving notifications", e)
            call.reject("Failed to get notifications: ${e.message}", e)
        }
    }

    /**
     * Clear buffered notifications from memory
     */
    @PluginMethod
    fun clearNotifications(call: PluginCall) {
        try {
            NotificationService.clearRecentNotifications()
            val ret = JSObject().apply {
                put("success", true)
                put("cleared", true)
            }
            call.resolve(ret)
        } catch (e: Exception) {
            Log.e(TAG, "Error clearing notifications", e)
            call.reject("Failed to clear notifications: ${e.message}", e)
        }
    }

    // ── Native Navigation & System Control Methods ─────────────────────────

    /**
     * Navigate to Home: brings application to Home or main view
     */
    @PluginMethod
    fun goHome(call: PluginCall) {
        try {
            activity.runOnUiThread {
                try {
                    bridge.webView?.let { webView ->
                        // Navigate webview to origin /
                        webView.loadUrl("https://metadata-agents.vercel.app/")
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Webview home navigation error", e)
                }
            }
            call.resolve(JSObject().put("success", true))
        } catch (e: Exception) {
            call.reject("Failed to go home: ${e.message}", e)
        }
    }

    /**
     * Navigate Back: navigates webview history or triggers device back
     */
    @PluginMethod
    fun goBack(call: PluginCall) {
        try {
            activity.runOnUiThread {
                val webView = bridge.webView
                if (webView != null && webView.canGoBack()) {
                    webView.goBack()
                } else {
                    activity.onBackPressedDispatcher.onBackPressed()
                }
            }
            call.resolve(JSObject().put("success", true))
        } catch (e: Exception) {
            call.reject("Failed to go back: ${e.message}", e)
        }
    }

    /**
     * Open Notification Settings / Notification view
     */
    @PluginMethod
    fun openNotifications(call: PluginCall) {
        requestNotificationAccess(call)
    }

    /**
     * Open App System Settings
     */
    @PluginMethod
    fun openSettings(call: PluginCall) {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.startActivity(intent)
            call.resolve(JSObject().put("success", true))
        } catch (e: Exception) {
            call.reject("Failed to open app settings: ${e.message}", e)
        }
    }

    /**
     * Exit Application gracefully
     */
    @PluginMethod
    fun exitApp(call: PluginCall) {
        try {
            activity.runOnUiThread {
                activity.finishAffinity()
            }
            call.resolve(JSObject().put("success", true))
        } catch (e: Exception) {
            call.reject("Failed to exit app: ${e.message}", e)
        }
    }
}
