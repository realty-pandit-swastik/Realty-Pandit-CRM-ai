package com.realtypandit.staffapp.call.recording

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import com.realtypandit.staffapp.core.storage.EncryptedFileStorage
import com.realtypandit.staffapp.data.local.dao.CallDao
import com.realtypandit.staffapp.data.local.entities.CallEntity
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.io.File
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Call Recorder Wrapper
 * Handles MediaRecorder lifecycle and encrypted file storage
 */
@Singleton
class CallRecorder @Inject constructor(
    @ApplicationContext private val context: Context,
    private val encryptedStorage: EncryptedFileStorage,
    private val callDao: CallDao
) {
    private var mediaRecorder: MediaRecorder? = null
    private var currentRecording: RecordingInfo? = null
    private val recordingScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var recordingStartTime: Long = 0

    fun startRecording(
        phoneNumber: String?,
        onRecordingStarted: () -> Unit,
        onRecordingFailed: (String) -> Unit
    ) {
        try {
            val callId = UUID.randomUUID().toString()
            val fileName = "call_${System.currentTimeMillis()}.3gp"
            val outputFile = File(context.getExternalFilesDir("call_recordings"), fileName)

            // Ensure directory exists
            outputFile.parentFile?.mkdirs()

            // Initialize MediaRecorder
            mediaRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(context)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }.apply {
                setAudioSource(MediaRecorder.AudioSource.VOICE_COMMUNICATION) // Best for calls
                setOutputFormat(MediaRecorder.OutputFormat.THREE_GPP)
                setAudioEncoder(MediaRecorder.AudioEncoder.AMR_NB) // Low bitrate for calls
                setOutputFile(outputFile.absolutePath)

                try {
                    prepare()
                    start()
                } catch (e: Exception) {
                    release()
                    throw e
                }
            }

            recordingStartTime = System.currentTimeMillis()

            currentRecording = RecordingInfo(
                callId = callId,
                filePath = outputFile.absolutePath,
                phoneNumber = phoneNumber,
                startTime = recordingStartTime,
                durationSeconds = 0
            )

            // Save to local database
            recordingScope.launch {
                callDao.insertCall(
                    CallEntity(
                        id = callId,
                        phoneNumber = phoneNumber ?: "Unknown",
                        contactName = null,
                        status = "RECORDING",
                        duration = null,
                        localFilePath = outputFile.absolutePath,
                        recordingUrl = null,
                        transcript = null,
                        aiExtractionJson = null,
                        confidenceScore = null,
                        classification = "OUTBOUND", // Will be updated in overlay
                        createdAt = recordingStartTime,
                        submittedAt = null,
                        syncedToServer = false
                    )
                )
            }

            onRecordingStarted()

        } catch (e: Exception) {
            onRecordingFailed(e.message ?: "Unknown error")
            cleanup()
        }
    }

    fun stopRecording() {
        try {
            mediaRecorder?.apply {
                stop()
                release()
            }

            val recording = currentRecording
            if (recording != null) {
                val duration = ((System.currentTimeMillis() - recordingStartTime) / 1000).toInt()
                recording.durationSeconds = duration

                // Update database
                recordingScope.launch {
                    callDao.updateCall(
                        callDao.getCallById(recording.callId)!!.copy(
                            duration = duration,
                            status = "PENDING_CLASSIFICATION"
                        )
                    )
                }

                // Encrypt the file
                encryptedStorage.encryptFile(recording.filePath)
            }

        } catch (e: Exception) {
            // Silently handle stop errors (recorder might already be stopped)
        } finally {
            cleanup()
        }
    }

    fun getLastRecordingInfo(): RecordingInfo? = currentRecording

    private fun cleanup() {
        mediaRecorder?.release()
        mediaRecorder = null
    }

    data class RecordingInfo(
        val callId: String,
        val filePath: String,
        val phoneNumber: String?,
        val startTime: Long,
        var durationSeconds: Int
    )
}
