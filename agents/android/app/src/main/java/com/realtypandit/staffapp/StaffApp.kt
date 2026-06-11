package com.realtypandit.staffapp

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import dagger.hilt.android.HiltAndroidApp
import io.sentry.Sentry
import io.sentry.SentryEvent
import io.sentry.SentryOptions
import io.sentry.android.core.SentryAndroid
import io.sentry.android.core.SentryAndroidOptions
import javax.inject.Inject

/**
 * Staff Call Intelligence App
 * Main application class with Hilt DI and WorkManager configuration
 */
@HiltAndroidApp
class StaffApp : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    override fun onCreate() {
        super.onCreate()
        initGlitchTip()
        createNotificationChannels()
    }

    /**
     * Initialize GlitchTip (Sentry-protocol) error reporting.
     * No-op if BuildConfig.GLITCHTIP_DSN is empty (set via local.properties).
     */
    private fun initGlitchTip() {
        val dsn = BuildConfig.GLITCHTIP_DSN
        if (dsn.isBlank()) return

        SentryAndroid.init(this) { options: SentryAndroidOptions ->
            options.dsn = dsn
            options.environment = if (BuildConfig.DEBUG) "debug" else "production"
            // Tag every event with the APK version so we can filter by deploy.
            options.release = "${BuildConfig.VERSION_NAME}+${BuildConfig.VERSION_CODE}"
            options.tracesSampleRate = 0.1
            // ANR detection lives on the Android-specific options subclass.
            options.isAnrEnabled = true
            // Never collect PII automatically (user ID, IP). We mask manually below.
            options.isSendDefaultPii = false

            options.beforeSend = SentryOptions.BeforeSendCallback { event, _ ->
                scrubEvent(event)
                event
            }
        }

        // Tag every event so the shared GlitchTip project can be filtered by
        // service (backend / frontend / pipecat / android).
        Sentry.configureScope { scope -> scope.setTag("service", "android") }
    }

    private fun scrubEvent(event: SentryEvent) {
        // Mask phone numbers in any extra/tag string we set explicitly elsewhere.
        // (Request headers / bodies don't apply on mobile — OkHttp interceptor scrubs URLs.)
        event.tags?.let { tags ->
            for ((key, value) in tags.toMap()) {
                if (key.lowercase().contains("phone") ||
                    key.lowercase().contains("mobile") ||
                    key.lowercase().contains("contact_number")) {
                    tags[key] = maskPhone(value)
                }
            }
        }
        // Auth tokens / DSNs shouldn't reach extras, but scrub defensively.
        val extras = event.getExtras()
        if (extras != null) {
            for (key in extras.keys.toList()) {
                val lower = key.lowercase()
                if (lower in setOf("password", "token", "refresh_token", "access_token",
                        "auth_token", "jwt", "otp", "authorization")) {
                    event.setExtra(key, "[REDACTED]")
                } else if (lower.contains("phone") || lower.contains("mobile") ||
                    lower.contains("contact_number")) {
                    val v = extras[key]
                    if (v is String) event.setExtra(key, maskPhone(v))
                }
            }
        }
    }

    private fun maskPhone(value: String?): String {
        if (value.isNullOrBlank()) return value ?: ""
        val cleaned = value.replace(Regex("[\\s-]"), "")
        if (!cleaned.matches(Regex("[+]?\\d{10,15}"))) return value
        val last4 = cleaned.takeLast(4)
        return "*".repeat(cleaned.length - 4) + last4
    }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channels = listOf(
                NotificationChannel(
                    CHANNEL_CALL_SERVICE,
                    "Call Recording Service",
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = "Shows when call recording is active"
                },
                NotificationChannel(
                    CHANNEL_UPLOAD,
                    "Call Upload",
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = "Shows progress of call recording uploads"
                },
                NotificationChannel(
                    CHANNEL_ALERTS,
                    "Alerts",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Important notifications and alerts"
                }
            )

            val notificationManager = getSystemService(NotificationManager::class.java)
            channels.forEach { notificationManager.createNotificationChannel(it) }
        }
    }

    companion object {
        const val CHANNEL_CALL_SERVICE = "call_service"
        const val CHANNEL_UPLOAD = "upload"
        const val CHANNEL_ALERTS = "alerts"
    }
}
