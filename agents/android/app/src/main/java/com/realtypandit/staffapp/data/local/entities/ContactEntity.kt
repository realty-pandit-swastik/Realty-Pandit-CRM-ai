package com.realtypandit.staffapp.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "contacts")
data class ContactEntity(
    @PrimaryKey
    val phoneNumber: String,
    val name: String?,
    val email: String?,
    val contactType: String,
    val intent: String?,
    val propertyType: String?,
    val leadStatus: String,
    val aiSummary: String?,
    val lastChannel: String?,
    val lastInteraction: Long?,
    val isBusiness: Boolean = false, // Cached classification for overlay
    val createdAt: Long,
    val updatedAt: Long
)
