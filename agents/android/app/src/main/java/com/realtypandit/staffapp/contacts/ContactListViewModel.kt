package com.realtypandit.staffapp.contacts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtypandit.staffapp.core.network.ApiService
import com.realtypandit.staffapp.core.network.models.Contact
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class ContactListUiState {
    object Loading : ContactListUiState()
    data class Success(val contacts: List<Contact>) : ContactListUiState()
    data class Error(val message: String) : ContactListUiState()
}

@HiltViewModel
class ContactListViewModel @Inject constructor(
    private val apiService: ApiService
) : ViewModel() {

    private val _uiState = MutableStateFlow<ContactListUiState>(ContactListUiState.Loading)
    val uiState: StateFlow<ContactListUiState> = _uiState.asStateFlow()

    private var allContacts: List<Contact> = emptyList()

    fun loadContacts() {
        viewModelScope.launch {
            _uiState.value = ContactListUiState.Loading
            try {
                val response = apiService.getContacts()
                if (response.isSuccessful) {
                    allContacts = response.body() ?: emptyList()
                    _uiState.value = ContactListUiState.Success(allContacts)
                } else {
                    _uiState.value = ContactListUiState.Error("Failed to load contacts")
                }
            } catch (e: Exception) {
                _uiState.value = ContactListUiState.Error(e.message ?: "Unknown error")
            }
        }
    }

    fun searchContacts(query: String) {
        if (query.isBlank()) {
            _uiState.value = ContactListUiState.Success(allContacts)
            return
        }

        val q = query.lowercase()
        val filtered = allContacts.filter { contact ->
            contact.name?.lowercase()?.contains(q) == true ||
            contact.phoneNumber.contains(q) ||
            contact.intent?.lowercase()?.contains(q) == true ||
            contact.preferredLocation?.lowercase()?.contains(q) == true
        }
        _uiState.value = ContactListUiState.Success(filtered)
    }
}
