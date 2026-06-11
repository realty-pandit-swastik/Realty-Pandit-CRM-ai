package com.realtypandit.staffapp.core.network

import com.realtypandit.staffapp.core.network.models.*
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.*

/**
 * API Service Interface
 * Maps to backend routes at /api/calls and /auth
 */
interface ApiService {

    // ============= Authentication =============

    @POST("/auth/agent-login")
    @FormUrlEncoded
    suspend fun loginAgent(
        @Field("phone") phone: String,
        @Field("password") password: String
    ): Response<LoginResponse>

    @GET("/auth/me")
    suspend fun getCurrentUser(): Response<AgentProfile>

    // ============= Staff Calls =============

    @Multipart
    @POST("/api/calls/upload")
    suspend fun uploadCallRecording(
        @Part audio: MultipartBody.Part,
        @Part("phone_number") phoneNumber: RequestBody,
        @Part("classification") classification: RequestBody,
        @Part("duration") duration: RequestBody
    ): Response<UploadCallResponse>

    @GET("/api/calls/{id}")
    suspend fun getCallDetails(
        @Path("id") callId: String
    ): Response<StaffCallDetails>

    @POST("/api/calls/{id}/submit")
    suspend fun submitCallToCRM(
        @Path("id") callId: String,
        @Body editedData: CallSubmitRequest
    ): Response<GenericSuccessResponse>

    @POST("/api/calls/{id}/reject")
    suspend fun rejectCall(
        @Path("id") callId: String
    ): Response<GenericSuccessResponse>

    @GET("/api/calls")
    suspend fun getCallHistory(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20,
        @Query("status") status: String? = null,
        @Query("phone_number") phoneNumber: String? = null
    ): Response<CallHistoryResponse>

    @GET("/api/calls/stats/overview")
    suspend fun getCallStats(): Response<CallStatsResponse>

    // ============= Contacts =============

    @GET("/api/contacts")
    suspend fun getContacts(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50
    ): Response<List<Contact>>

    @GET("/api/contacts/{phone}/interactions")
    suspend fun getContactInteractions(
        @Path("phone") phoneNumber: String
    ): Response<List<Interaction>>
}
