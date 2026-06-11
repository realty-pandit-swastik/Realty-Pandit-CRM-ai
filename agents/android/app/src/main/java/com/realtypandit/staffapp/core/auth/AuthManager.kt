package com.realtypandit.staffapp.core.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.gson.Gson
import com.realtypandit.staffapp.core.network.models.AgentProfile
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages authentication state and secure token storage
 * Uses EncryptedSharedPreferences for secure storage
 */
@Singleton
class AuthManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val gson = Gson()

    private val sharedPreferences: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun saveToken(token: String) {
        sharedPreferences.edit()
            .putString(KEY_TOKEN, token)
            .apply()
    }

    fun getToken(): String? {
        return sharedPreferences.getString(KEY_TOKEN, null)
    }

    fun saveAgentProfile(profile: AgentProfile) {
        sharedPreferences.edit()
            .putString(KEY_PROFILE, gson.toJson(profile))
            .apply()
    }

    fun getAgentProfile(): AgentProfile? {
        val json = sharedPreferences.getString(KEY_PROFILE, null)
        return json?.let { gson.fromJson(it, AgentProfile::class.java) }
    }

    fun isLoggedIn(): Boolean {
        return getToken() != null
    }

    fun logout() {
        sharedPreferences.edit()
            .clear()
            .apply()
    }

    fun hasPermission(permission: String): Boolean {
        return getAgentProfile()?.permissions?.contains(permission) == true
    }

    fun getRole(): String? {
        return getAgentProfile()?.role
    }

    companion object {
        private const val PREFS_NAME = "staff_auth_prefs"
        private const val KEY_TOKEN = "jwt_token"
        private const val KEY_PROFILE = "agent_profile"
    }
}
