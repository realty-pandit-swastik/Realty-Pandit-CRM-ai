package com.realtypandit.staffapp.core.network.models

import com.google.gson.annotations.SerializedName

// ============= Authentication Models =============

data class LoginResponse(
    val token: String,
    val agent: AgentProfile
)

data class AgentProfile(
    val id: String,
    val name: String,
    val email: String?,
    val phone: String,
    val role: String,
    val permissions: List<String>?
)

// ============= Staff Call Models =============

data class UploadCallResponse(
    val success: Boolean,
    @SerializedName("call_id") val callId: String,
    val message: String
)

data class StaffCallDetails(
    val id: String,
    @SerializedName("phone_number") val phoneNumber: String,
    val contact: ContactInfo?,
    val status: String, // UPLOADING, PROCESSING, TRANSCRIBED, READY_FOR_REVIEW, APPROVED, REJECTED
    val duration: Int?,
    @SerializedName("recording_url") val recordingUrl: String?,
    val transcript: String?,
    @SerializedName("ai_extraction") val aiExtraction: AIExtraction?,
    @SerializedName("confidence_score") val confidenceScore: Float?,
    @SerializedName("staff_edited_data") val staffEditedData: AIExtraction?,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("submitted_at") val submittedAt: String?
)

data class ContactInfo(
    val name: String?,
    @SerializedName("phone_number") val phoneNumber: String,
    @SerializedName("contact_type") val contactType: String,
    val intent: String?
)

data class AIExtraction(
    val intent: String?, // BUY, RENT, SELL, LEASE, OTHER
    val role: String?, // BUYER_TENANT, SELLER_LANDLORD, UNKNOWN
    @SerializedName("propertyType") val propertyType: String?,
    val bhk: String?,
    val location: String?,
    @SerializedName("budgetMin") val budgetMin: Int?,
    @SerializedName("budgetMax") val budgetMax: Int?,
    val urgency: String?, // IMMEDIATE, WITHIN_MONTH, WITHIN_3_MONTHS, FLEXIBLE
    @SerializedName("followUpDate") val followUpDate: String?,
    @SerializedName("appointmentMentioned") val appointmentMentioned: Boolean?,
    val sentiment: String?, // POSITIVE, NEUTRAL, NEGATIVE
    val summary: String,
    @SerializedName("keyPoints") val keyPoints: List<String>?,
    val confidence: Float
)

data class CallSubmitRequest(
    @SerializedName("edited_data") val editedData: AIExtraction
)

data class CallHistoryResponse(
    val calls: List<StaffCallSummary>,
    val pagination: PaginationInfo
)

data class StaffCallSummary(
    val id: String,
    @SerializedName("phone_number") val phoneNumber: String,
    val contact: ContactInfo?,
    val status: String,
    val duration: Int?,
    @SerializedName("confidence_score") val confidenceScore: Float?,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("submitted_at") val submittedAt: String?
)

data class PaginationInfo(
    val page: Int,
    val limit: Int,
    val total: Int,
    @SerializedName("totalPages") val totalPages: Int
)

data class CallStatsResponse(
    @SerializedName("total_calls") val totalCalls: Int,
    @SerializedName("by_status") val byStatus: Map<String, Int>,
    @SerializedName("total_duration_minutes") val totalDurationMinutes: Int,
    @SerializedName("today_calls") val todayCalls: Int
)

// ============= Contact Models =============

data class Contact(
    @SerializedName("phone_number") val phoneNumber: String,
    val name: String?,
    val email: String?,
    @SerializedName("contact_type") val contactType: String,
    val intent: String?,
    @SerializedName("property_type") val propertyType: String?,
    @SerializedName("budget_min") val budgetMin: Double?,
    @SerializedName("budget_max") val budgetMax: Double?,
    @SerializedName("preferred_location") val preferredLocation: String?,
    @SerializedName("lead_status") val leadStatus: String,
    @SerializedName("ai_summary") val aiSummary: String?,
    @SerializedName("last_channel") val lastChannel: String?,
    @SerializedName("last_interaction") val lastInteraction: String?,
    @SerializedName("created_at") val createdAt: String
)

data class Interaction(
    val id: String,
    @SerializedName("phone_number") val phoneNumber: String,
    val channel: String, // whatsapp, voice, staff_call, email
    val direction: String, // inbound, outbound
    @SerializedName("event_type") val eventType: String,
    val content: String?,
    val metadata: Map<String, Any>?,
    @SerializedName("created_at") val createdAt: String
)

// ============= Generic Responses =============

data class GenericSuccessResponse(
    val success: Boolean,
    val message: String
)

data class ErrorResponse(
    val error: String
)
