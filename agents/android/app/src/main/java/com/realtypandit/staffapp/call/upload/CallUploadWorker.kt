package com.realtypandit.staffapp.call.upload

import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.realtypandit.staffapp.R
import com.realtypandit.staffapp.StaffApp
import com.realtypandit.staffapp.core.network.ApiService
import com.realtypandit.staffapp.core.storage.EncryptedFileStorage
import com.realtypandit.staffapp.data.local.dao.CallDao
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File

/**
 * Background Upload Worker
 * Handles reliable call recording upload via WorkManager
 * Survives app kill, retries on network failure with exponential backoff
 */
@HiltWorker
class CallUploadWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val apiService: ApiService,
    private val callDao: CallDao,
    private val encryptedStorage: EncryptedFileStorage
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val callId = inputData.getString(KEY_CALL_ID) ?: return Result.failure()
        val filePath = inputData.getString(KEY_FILE_PATH) ?: return Result.failure()
        val phoneNumber = inputData.getString(KEY_PHONE_NUMBER) ?: return Result.failure()
        val duration = inputData.getInt(KEY_DURATION, 0)
        val classification = inputData.getString(KEY_CLASSIFICATION) ?: "OUTBOUND"

        showProgressNotification(callId, "Uploading call recording...")

        try {
            // Decrypt file for upload (if encrypted)
            val uploadFilePath = if (filePath.endsWith(".enc")) {
                encryptedStorage.decryptFile(filePath)
            } else {
                filePath
            }

            val uploadFile = File(uploadFilePath)
            if (!uploadFile.exists()) {
                callDao.updateCallStatus(callId, "REJECTED")
                return Result.failure()
            }

            // Create multipart request
            val audioPart = MultipartBody.Part.createFormData(
                "audio",
                uploadFile.name,
                uploadFile.asRequestBody("audio/3gpp".toMediaTypeOrNull())
            )

            val phoneBody = phoneNumber.toRequestBody("text/plain".toMediaTypeOrNull())
            val classificationBody = classification.toRequestBody("text/plain".toMediaTypeOrNull())
            val durationBody = duration.toString().toRequestBody("text/plain".toMediaTypeOrNull())

            // Upload to backend
            val response = apiService.uploadCallRecording(
                audio = audioPart,
                phoneNumber = phoneBody,
                classification = classificationBody,
                duration = durationBody
            )

            if (response.isSuccessful && response.body()?.success == true) {
                val serverCallId = response.body()!!.callId

                // Update local record with server ID and mark as synced
                val localCall = callDao.getCallById(callId)
                if (localCall != null) {
                    callDao.updateCall(
                        localCall.copy(
                            id = serverCallId,
                            status = "PROCESSING",
                            syncedToServer = true
                        )
                    )
                    // Delete old record if ID changed
                    if (serverCallId != callId) {
                        callDao.deleteCall(callId)
                    }
                }

                // Delete local files
                cleanupLocalFiles(filePath, uploadFilePath)

                showSuccessNotification(callId, "Call uploaded successfully")
                return Result.success()

            } else {
                val errorMsg = response.errorBody()?.string() ?: "Upload failed"

                if (runAttemptCount < MAX_RETRIES) {
                    showProgressNotification(callId, "Upload failed, retrying...")
                    return Result.retry()
                } else {
                    callDao.updateCallStatus(callId, "REJECTED")
                    showFailureNotification(callId, "Upload failed: $errorMsg")
                    return Result.failure()
                }
            }

        } catch (e: Exception) {
            if (runAttemptCount < MAX_RETRIES) {
                showProgressNotification(callId, "Upload failed: ${e.message}, retrying...")
                return Result.retry()
            } else {
                callDao.updateCallStatus(callId, "REJECTED")
                showFailureNotification(callId, "Upload failed after retries")
                return Result.failure()
            }
        }
    }

    private fun cleanupLocalFiles(originalPath: String, decryptedPath: String) {
        try {
            File(originalPath).delete()
            if (decryptedPath != originalPath) {
                File(decryptedPath).delete()
            }
            // Also delete any .enc version
            File("$originalPath.enc").delete()
        } catch (_: Exception) { }
    }

    private fun showProgressNotification(callId: String, text: String) {
        val notification = NotificationCompat.Builder(applicationContext, StaffApp.CHANNEL_UPLOAD)
            .setContentTitle("Call Upload")
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setOngoing(true)
            .setProgress(0, 0, true)
            .build()

        val notificationManager = applicationContext.getSystemService(NotificationManager::class.java)
        notificationManager.notify(NOTIFICATION_ID_BASE + callId.hashCode(), notification)
    }

    private fun showSuccessNotification(callId: String, text: String) {
        val notification = NotificationCompat.Builder(applicationContext, StaffApp.CHANNEL_UPLOAD)
            .setContentTitle("Upload Complete")
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setAutoCancel(true)
            .build()

        val notificationManager = applicationContext.getSystemService(NotificationManager::class.java)
        notificationManager.notify(NOTIFICATION_ID_BASE + callId.hashCode(), notification)
    }

    private fun showFailureNotification(callId: String, text: String) {
        val notification = NotificationCompat.Builder(applicationContext, StaffApp.CHANNEL_ALERTS)
            .setContentTitle("Upload Failed")
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setAutoCancel(true)
            .build()

        val notificationManager = applicationContext.getSystemService(NotificationManager::class.java)
        notificationManager.notify(NOTIFICATION_ID_BASE + callId.hashCode(), notification)
    }

    companion object {
        const val KEY_CALL_ID = "call_id"
        const val KEY_FILE_PATH = "file_path"
        const val KEY_PHONE_NUMBER = "phone_number"
        const val KEY_DURATION = "duration"
        const val KEY_CLASSIFICATION = "classification"

        private const val MAX_RETRIES = 5
        private const val NOTIFICATION_ID_BASE = 2000
    }
}
