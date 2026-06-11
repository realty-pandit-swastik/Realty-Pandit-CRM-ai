package com.realtypandit.staffapp.call.overlay

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.*
import com.realtypandit.staffapp.call.upload.CallUploadWorker
import com.realtypandit.staffapp.core.storage.EncryptedFileStorage
import com.realtypandit.staffapp.data.local.dao.CallDao
import com.realtypandit.staffapp.data.local.dao.ContactDao
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

@HiltViewModel
class CallOverlayViewModel @Inject constructor(
    private val callDao: CallDao,
    private val contactDao: ContactDao,
    private val encryptedStorage: EncryptedFileStorage,
    private val workManager: WorkManager
) : ViewModel() {

    private var callId: String = ""
    private var filePath: String = ""
    private var duration: Int = 0
    private var phoneNumber: String? = null

    fun initialize(callId: String, filePath: String, duration: Int, phoneNumber: String?) {
        this.callId = callId
        this.filePath = filePath
        this.duration = duration
        this.phoneNumber = phoneNumber
    }

    /**
     * Classify call as Business -> enqueue upload via WorkManager
     */
    fun classifyAsBusiness() {
        viewModelScope.launch {
            // Update local DB status
            callDao.updateCallStatus(callId, "UPLOADING")

            // Mark contact as business for auto-classification
            phoneNumber?.let { phone ->
                contactDao.markAsBusiness(phone, true)
            }

            // Enqueue upload worker
            val uploadData = workDataOf(
                CallUploadWorker.KEY_CALL_ID to callId,
                CallUploadWorker.KEY_FILE_PATH to filePath,
                CallUploadWorker.KEY_PHONE_NUMBER to (phoneNumber ?: "Unknown"),
                CallUploadWorker.KEY_DURATION to duration,
                CallUploadWorker.KEY_CLASSIFICATION to "OUTBOUND"
            )

            val uploadRequest = OneTimeWorkRequestBuilder<CallUploadWorker>()
                .setInputData(uploadData)
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    WorkRequest.MIN_BACKOFF_MILLIS,
                    java.util.concurrent.TimeUnit.MILLISECONDS
                )
                .addTag("call_upload")
                .addTag("call_$callId")
                .build()

            workManager.enqueueUniqueWork(
                "upload_$callId",
                ExistingWorkPolicy.KEEP,
                uploadRequest
            )
        }
    }

    /**
     * Classify call as Personal -> delete recording
     */
    fun classifyAsPersonal() {
        viewModelScope.launch {
            // Delete local recording
            try {
                File(filePath).delete()
                File("$filePath.enc").delete()
            } catch (_: Exception) { }

            // Delete from local DB
            callDao.deleteCall(callId)
        }
    }
}
