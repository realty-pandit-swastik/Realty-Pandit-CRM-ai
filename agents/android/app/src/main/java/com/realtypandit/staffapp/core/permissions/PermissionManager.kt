package com.realtypandit.staffapp.core.permissions

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * Permission Manager
 * Handles runtime permission requests for call recording
 */
object PermissionManager {

    // Required permissions for call intelligence
    val REQUIRED_PERMISSIONS = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        arrayOf(
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.POST_NOTIFICATIONS
        )
    } else {
        arrayOf(
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.READ_CALL_LOG
        )
    }

    const val PERMISSION_REQUEST_CODE = 1001
    const val OVERLAY_PERMISSION_REQUEST_CODE = 1002

    /**
     * Check if all required permissions are granted
     */
    fun hasAllPermissions(context: Context): Boolean {
        return REQUIRED_PERMISSIONS.all { permission ->
            ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
        }
    }

    /**
     * Request all required permissions
     */
    fun requestPermissions(activity: Activity) {
        ActivityCompat.requestPermissions(
            activity,
            REQUIRED_PERMISSIONS,
            PERMISSION_REQUEST_CODE
        )
    }

    /**
     * Check which permissions are missing
     */
    fun getMissingPermissions(context: Context): List<String> {
        return REQUIRED_PERMISSIONS.filter { permission ->
            ContextCompat.checkSelfPermission(context, permission) != PackageManager.PERMISSION_GRANTED
        }
    }

    /**
     * Check if overlay permission is granted (for post-call classification)
     */
    fun hasOverlayPermission(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            android.provider.Settings.canDrawOverlays(context)
        } else {
            true
        }
    }

    /**
     * Get user-friendly permission explanation
     */
    fun getPermissionExplanation(permission: String): String {
        return when (permission) {
            Manifest.permission.READ_PHONE_STATE -> "Required to detect incoming and outgoing calls"
            Manifest.permission.RECORD_AUDIO -> "Required to record business calls"
            Manifest.permission.READ_CALL_LOG -> "Required to identify call details and phone numbers"
            Manifest.permission.POST_NOTIFICATIONS -> "Required to notify you about uploads and AI processing"
            else -> "Required for app functionality"
        }
    }
}
