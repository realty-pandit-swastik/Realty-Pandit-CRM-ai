package com.realtypandit.staffapp.call.detection

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.IBinder
import android.telecom.TelecomManager
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.realtypandit.staffapp.MainActivity
import com.realtypandit.staffapp.R
import com.realtypandit.staffapp.StaffApp
import com.realtypandit.staffapp.call.overlay.CallOverlayActivity
import com.realtypandit.staffapp.call.recording.CallRecorder
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import javax.inject.Inject

/**
 * Foreground Service for Call Detection
 * Listens to phone state changes and triggers recording for business calls
 */
@AndroidEntryPoint
class CallDetectorService : Service() {

    @Inject
    lateinit var callRecorder: CallRecorder

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var telephonyManager: TelephonyManager? = null
    private var telephonyCallback: Any? = null // TelephonyCallback or PhoneStateListener
    private var currentCallNumber: String? = null
    private var isCallActive = false

    override fun onCreate() {
        super.onCreate()
        startForeground(NOTIFICATION_ID, createNotification())
        registerPhoneStateListener()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY // Restart if killed by system
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        unregisterPhoneStateListener()
        serviceScope.cancel()
    }

    private fun registerPhoneStateListener() {
        telephonyManager = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12+ - Use TelephonyCallback
            val callback = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                override fun onCallStateChanged(state: Int) {
                    handleCallStateChange(state)
                }
            }
            telephonyCallback = callback

            if (ActivityCompat.checkSelfPermission(
                    this,
                    Manifest.permission.READ_PHONE_STATE
                ) == PackageManager.PERMISSION_GRANTED
            ) {
                telephonyManager?.registerTelephonyCallback(mainExecutor, callback)
            }
        } else {
            // Android 11 and below - Use PhoneStateListener
            @Suppress("DEPRECATION")
            val listener = object : PhoneStateListener() {
                override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                    currentCallNumber = phoneNumber
                    handleCallStateChange(state)
                }
            }
            telephonyCallback = listener

            if (ActivityCompat.checkSelfPermission(
                    this,
                    Manifest.permission.READ_PHONE_STATE
                ) == PackageManager.PERMISSION_GRANTED
            ) {
                @Suppress("DEPRECATION")
                telephonyManager?.listen(listener, PhoneStateListener.LISTEN_CALL_STATE)
            }
        }
    }

    private fun unregisterPhoneStateListener() {
        telephonyCallback?.let { callback ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                telephonyManager?.unregisterTelephonyCallback(callback as TelephonyCallback)
            } else {
                @Suppress("DEPRECATION")
                telephonyManager?.listen(callback as PhoneStateListener, PhoneStateListener.LISTEN_NONE)
            }
        }
    }

    private fun handleCallStateChange(state: Int) {
        when (state) {
            TelephonyManager.CALL_STATE_RINGING -> {
                // Incoming call - get number if available
                // Number may not be available on newer Android versions
            }

            TelephonyManager.CALL_STATE_OFFHOOK -> {
                // Call is active (answered or outgoing)
                if (!isCallActive) {
                    isCallActive = true
                    tryGetCallNumber()
                    startRecording()
                }
            }

            TelephonyManager.CALL_STATE_IDLE -> {
                // Call ended
                if (isCallActive) {
                    isCallActive = false
                    stopRecording()
                    showClassificationOverlay()
                }
            }
        }
    }

    private fun tryGetCallNumber() {
        // Try to extract call number from TelecomManager (requires permissions)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (ActivityCompat.checkSelfPermission(
                    this,
                    Manifest.permission.READ_CALL_LOG
                ) == PackageManager.PERMISSION_GRANTED
            ) {
                // Note: Getting active call number is restricted on Android 9+
                // Fallback to call log or manual entry in overlay
            }
        }
    }

    private fun startRecording() {
        // Check recording permission
        if (ActivityCompat.checkSelfPermission(
                this,
                Manifest.permission.RECORD_AUDIO
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        callRecorder.startRecording(
            phoneNumber = currentCallNumber,
            onRecordingStarted = {
                updateNotification("Recording call...")
            },
            onRecordingFailed = { error ->
                // Show notification about failure
                updateNotification("Recording failed: $error")
            }
        )
    }

    private fun stopRecording() {
        callRecorder.stopRecording()
        updateNotification("Call recording service active")
    }

    private fun showClassificationOverlay() {
        val recordingInfo = callRecorder.getLastRecordingInfo()

        if (recordingInfo != null) {
            val intent = Intent(this, CallOverlayActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
                putExtra("file_path", recordingInfo.filePath)
                putExtra("duration", recordingInfo.durationSeconds)
                putExtra("phone_number", recordingInfo.phoneNumber)
                putExtra("call_id", recordingInfo.callId)
            }
            startActivity(intent)
        }
    }

    private fun createNotification(): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, StaffApp.CHANNEL_CALL_SERVICE)
            .setContentTitle("Call Recording Active")
            .setContentText("Monitoring calls for business recordings")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .build()
    }

    private fun updateNotification(text: String) {
        val notification = NotificationCompat.Builder(this, StaffApp.CHANNEL_CALL_SERVICE)
            .setContentTitle("Call Recording")
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setOngoing(true)
            .build()

        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    companion object {
        private const val NOTIFICATION_ID = 100

        fun start(context: Context) {
            val intent = Intent(context, CallDetectorService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, CallDetectorService::class.java))
        }
    }
}
