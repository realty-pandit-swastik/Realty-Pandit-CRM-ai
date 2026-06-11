package com.realtypandit.staffapp.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "calls")
data class CallEntity(
    @PrimaryKey
    val id: String,
    val phoneNumber: String,
    val contactName: String?,
    val status: String, // UPLOADING, PROCESSING, TRANSCRIBED, READY_FOR_REVIEW, APPROVED, REJECTED
    val duration: Int?,
    val localFilePath: String?, // Path to local recording before upload
    val recordingUrl: String?, // Cloud URL after upload
    val transcript: String?,
    val aiExtractionJson: String?, // JSON string
    val confidenceScore: Float?,
    val classification: String, // INBOUND, OUTBOUND
    val createdAt: Long,
    val submittedAt: Long?,
    val syncedToServer: Boolean = false
)
