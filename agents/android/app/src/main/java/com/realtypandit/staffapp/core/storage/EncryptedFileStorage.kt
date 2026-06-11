package com.realtypandit.staffapp.core.storage

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Encrypted File Storage
 * Encrypts call recordings using AES-256-GCM from Android Keystore
 */
@Singleton
class EncryptedFileStorage @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val keyStore: KeyStore = KeyStore.getInstance("AndroidKeyStore").apply {
        load(null)
    }

    init {
        // Generate encryption key if it doesn't exist
        if (!keyStore.containsAlias(KEY_ALIAS)) {
            generateKey()
        }
    }

    /**
     * Encrypt a file in-place
     * Creates encrypted version and deletes original
     */
    fun encryptFile(filePath: String): String {
        val inputFile = File(filePath)
        if (!inputFile.exists()) {
            throw IllegalArgumentException("File not found: $filePath")
        }

        val encryptedFilePath = "$filePath.enc"
        val encryptedFile = File(encryptedFilePath)

        try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, getKey())

            val iv = cipher.iv // Initialization vector

            FileOutputStream(encryptedFile).use { output ->
                // Write IV first (12 bytes for GCM)
                output.write(iv)

                // Encrypt and write file content
                FileInputStream(inputFile).use { input ->
                    val buffer = ByteArray(BUFFER_SIZE)
                    var bytesRead: Int

                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        val encryptedBytes = cipher.update(buffer, 0, bytesRead)
                        if (encryptedBytes != null) {
                            output.write(encryptedBytes)
                        }
                    }

                    // Write final block
                    val finalBytes = cipher.doFinal()
                    if (finalBytes != null) {
                        output.write(finalBytes)
                    }
                }
            }

            // Delete original unencrypted file
            inputFile.delete()

            return encryptedFilePath

        } catch (e: Exception) {
            // Clean up encrypted file if encryption failed
            encryptedFile.delete()
            throw e
        }
    }

    /**
     * Decrypt a file to temporary location for playback
     */
    fun decryptFile(encryptedFilePath: String): String {
        val encryptedFile = File(encryptedFilePath)
        if (!encryptedFile.exists()) {
            throw IllegalArgumentException("Encrypted file not found: $encryptedFilePath")
        }

        val decryptedFilePath = "$encryptedFilePath.dec"
        val decryptedFile = File(decryptedFilePath)

        try {
            FileInputStream(encryptedFile).use { input ->
                // Read IV (first 12 bytes)
                val iv = ByteArray(IV_SIZE)
                input.read(iv)

                val cipher = Cipher.getInstance(TRANSFORMATION)
                val spec = GCMParameterSpec(TAG_LENGTH, iv)
                cipher.init(Cipher.DECRYPT_MODE, getKey(), spec)

                // Decrypt file content
                FileOutputStream(decryptedFile).use { output ->
                    val buffer = ByteArray(BUFFER_SIZE)
                    var bytesRead: Int

                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        val decryptedBytes = cipher.update(buffer, 0, bytesRead)
                        if (decryptedBytes != null) {
                            output.write(decryptedBytes)
                        }
                    }

                    // Write final block
                    val finalBytes = cipher.doFinal()
                    if (finalBytes != null) {
                        output.write(finalBytes)
                    }
                }
            }

            return decryptedFilePath

        } catch (e: Exception) {
            // Clean up decrypted file if decryption failed
            decryptedFile.delete()
            throw e
        }
    }

    /**
     * Delete encrypted file securely
     */
    fun deleteEncryptedFile(filePath: String) {
        File(filePath).delete()
        // Also delete any temp decrypted versions
        File("$filePath.dec").delete()
    }

    private fun generateKey() {
        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            "AndroidKeyStore"
        )

        val keyGenParameterSpec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()

        keyGenerator.init(keyGenParameterSpec)
        keyGenerator.generateKey()
    }

    private fun getKey(): SecretKey {
        return keyStore.getKey(KEY_ALIAS, null) as SecretKey
    }

    companion object {
        private const val KEY_ALIAS = "call_recording_key"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val BUFFER_SIZE = 8192
        private const val IV_SIZE = 12 // GCM standard IV size
        private const val TAG_LENGTH = 128 // GCM tag length in bits
    }
}
