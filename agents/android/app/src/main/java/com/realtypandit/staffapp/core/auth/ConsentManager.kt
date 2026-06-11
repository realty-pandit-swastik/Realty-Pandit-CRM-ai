package com.realtypandit.staffapp.core.auth

import android.content.Context
import android.content.SharedPreferences
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages user consent for call recording
 * First-launch consent is required before recording can be enabled
 */
@Singleton
class ConsentManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val prefs: SharedPreferences = context.getSharedPreferences(
        PREFS_NAME, Context.MODE_PRIVATE
    )

    fun hasAcceptedConsent(): Boolean {
        return prefs.getBoolean(KEY_CONSENT_ACCEPTED, false)
    }

    fun acceptConsent() {
        prefs.edit()
            .putBoolean(KEY_CONSENT_ACCEPTED, true)
            .putLong(KEY_CONSENT_TIMESTAMP, System.currentTimeMillis())
            .apply()
    }

    fun revokeConsent() {
        prefs.edit()
            .putBoolean(KEY_CONSENT_ACCEPTED, false)
            .apply()
    }

    fun getConsentTimestamp(): Long {
        return prefs.getLong(KEY_CONSENT_TIMESTAMP, 0)
    }

    companion object {
        private const val PREFS_NAME = "consent_prefs"
        private const val KEY_CONSENT_ACCEPTED = "consent_accepted"
        private const val KEY_CONSENT_TIMESTAMP = "consent_timestamp"
    }
}
