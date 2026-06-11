package com.realtypandit.staffapp.ai.review

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtypandit.staffapp.core.network.ApiService
import com.realtypandit.staffapp.core.network.models.AIExtraction
import com.realtypandit.staffapp.core.network.models.CallSubmitRequest
import com.realtypandit.staffapp.core.network.models.StaffCallDetails
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class ReviewUiState {
    object Loading : ReviewUiState()
    data class Processing(val status: String, val message: String) : ReviewUiState()
    data class Ready(val callDetails: StaffCallDetails, val editableData: EditableExtraction) : ReviewUiState()
    data class Submitted(val message: String) : ReviewUiState()
    data class Error(val message: String) : ReviewUiState()
}

data class EditableExtraction(
    var intent: String = "OTHER",
    var role: String = "UNKNOWN",
    var propertyType: String = "",
    var bhk: String = "",
    var location: String = "",
    var budgetMin: String = "",
    var budgetMax: String = "",
    var urgency: String = "",
    var summary: String = "",
    var confidence: Float = 0f
)

@HiltViewModel
class CallReviewViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val apiService: ApiService
) : ViewModel() {

    private val _uiState = MutableStateFlow<ReviewUiState>(ReviewUiState.Loading)
    val uiState: StateFlow<ReviewUiState> = _uiState.asStateFlow()

    private var callId: String = ""
    private var pollingActive = false

    fun loadCall(callId: String) {
        this.callId = callId
        startPolling()
    }

    private fun startPolling() {
        pollingActive = true
        viewModelScope.launch {
            while (pollingActive) {
                try {
                    val response = apiService.getCallDetails(callId)
                    if (response.isSuccessful) {
                        val call = response.body()!!
                        when (call.status) {
                            "UPLOADING", "PROCESSING" -> {
                                _uiState.value = ReviewUiState.Processing(
                                    status = call.status,
                                    message = if (call.status == "UPLOADING") "Uploading recording..." else "AI is processing your call..."
                                )
                            }
                            "TRANSCRIBED" -> {
                                _uiState.value = ReviewUiState.Processing(
                                    status = call.status,
                                    message = "Extracting information from transcript..."
                                )
                            }
                            "READY_FOR_REVIEW" -> {
                                pollingActive = false
                                val extraction = call.aiExtraction
                                _uiState.value = ReviewUiState.Ready(
                                    callDetails = call,
                                    editableData = EditableExtraction(
                                        intent = extraction?.intent ?: "OTHER",
                                        role = extraction?.role ?: "UNKNOWN",
                                        propertyType = extraction?.propertyType ?: "",
                                        bhk = extraction?.bhk ?: "",
                                        location = extraction?.location ?: "",
                                        budgetMin = extraction?.budgetMin?.toString() ?: "",
                                        budgetMax = extraction?.budgetMax?.toString() ?: "",
                                        urgency = extraction?.urgency ?: "",
                                        summary = extraction?.summary ?: "",
                                        confidence = extraction?.confidence ?: 0f
                                    )
                                )
                            }
                            "APPROVED" -> {
                                pollingActive = false
                                _uiState.value = ReviewUiState.Submitted("Call already submitted to CRM")
                            }
                            "REJECTED" -> {
                                pollingActive = false
                                _uiState.value = ReviewUiState.Error("Call was rejected or processing failed")
                            }
                            else -> {
                                _uiState.value = ReviewUiState.Processing(
                                    status = call.status,
                                    message = "Processing..."
                                )
                            }
                        }
                    } else {
                        _uiState.value = ReviewUiState.Error("Failed to load call details")
                        pollingActive = false
                    }
                } catch (e: Exception) {
                    _uiState.value = ReviewUiState.Error(e.message ?: "Unknown error")
                    pollingActive = false
                }

                if (pollingActive) {
                    delay(3000) // Poll every 3 seconds
                }
            }
        }
    }

    fun submitToCRM(editedData: EditableExtraction) {
        viewModelScope.launch {
            _uiState.value = ReviewUiState.Loading
            try {
                val extraction = AIExtraction(
                    intent = editedData.intent,
                    role = editedData.role,
                    propertyType = editedData.propertyType.ifBlank { null },
                    bhk = editedData.bhk.ifBlank { null },
                    location = editedData.location.ifBlank { null },
                    budgetMin = editedData.budgetMin.toIntOrNull(),
                    budgetMax = editedData.budgetMax.toIntOrNull(),
                    urgency = editedData.urgency.ifBlank { null },
                    followUpDate = null,
                    appointmentMentioned = null,
                    sentiment = null,
                    summary = editedData.summary,
                    keyPoints = null,
                    confidence = editedData.confidence
                )

                val response = apiService.submitCallToCRM(callId, CallSubmitRequest(extraction))
                if (response.isSuccessful) {
                    _uiState.value = ReviewUiState.Submitted(
                        response.body()?.message ?: "Submitted successfully"
                    )
                } else {
                    _uiState.value = ReviewUiState.Error("Submit failed: ${response.code()}")
                }
            } catch (e: Exception) {
                _uiState.value = ReviewUiState.Error("Submit failed: ${e.message}")
            }
        }
    }

    fun rejectCall() {
        viewModelScope.launch {
            _uiState.value = ReviewUiState.Loading
            try {
                val response = apiService.rejectCall(callId)
                if (response.isSuccessful) {
                    _uiState.value = ReviewUiState.Submitted("Call discarded")
                } else {
                    _uiState.value = ReviewUiState.Error("Reject failed")
                }
            } catch (e: Exception) {
                _uiState.value = ReviewUiState.Error("Reject failed: ${e.message}")
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        pollingActive = false
    }
}
