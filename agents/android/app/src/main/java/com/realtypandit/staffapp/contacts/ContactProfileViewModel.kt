package com.realtypandit.staffapp.contacts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtypandit.staffapp.core.network.ApiService
import com.realtypandit.staffapp.core.network.models.Contact
import com.realtypandit.staffapp.core.network.models.Interaction
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class ContactProfileUiState {
    object Loading : ContactProfileUiState()
    data class Success(val contact: Contact, val interactions: List<Interaction>) : ContactProfileUiState()
    data class Error(val message: String) : ContactProfileUiState()
}

@HiltViewModel
class ContactProfileViewModel @Inject constructor(
    private val apiService: ApiService
) : ViewModel() {

    private val _uiState = MutableStateFlow<ContactProfileUiState>(ContactProfileUiState.Loading)
    val uiState: StateFlow<ContactProfileUiState> = _uiState.asStateFlow()

    fun loadProfile(phoneNumber: String) {
        viewModelScope.launch {
            _uiState.value = ContactProfileUiState.Loading
            try {
                // Fetch contacts list and find the matching one
                val contactsResponse = apiService.getContacts()
                val interactionsResponse = apiService.getContactInteractions(phoneNumber)

                val contact = contactsResponse.body()?.find { it.phoneNumber == phoneNumber }
                val interactions = interactionsResponse.body() ?: emptyList()

                if (contact != null) {
                    _uiState.value = ContactProfileUiState.Success(contact, interactions)
                } else {
                    _uiState.value = ContactProfileUiState.Error("Contact not found")
                }
            } catch (e: Exception) {
                _uiState.value = ContactProfileUiState.Error(e.message ?: "Unknown error")
            }
        }
    }
}
