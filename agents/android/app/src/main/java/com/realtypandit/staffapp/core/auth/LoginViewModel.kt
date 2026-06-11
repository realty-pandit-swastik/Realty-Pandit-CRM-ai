package com.realtypandit.staffapp.core.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtypandit.staffapp.core.network.ApiService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class LoginUiState {
    object Idle : LoginUiState()
    object Loading : LoginUiState()
    object Success : LoginUiState()
    data class Error(val message: String) : LoginUiState()
}

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val apiService: ApiService,
    private val authManager: AuthManager
) : ViewModel() {

    private val _uiState = MutableStateFlow<LoginUiState>(LoginUiState.Idle)
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    fun login(phone: String, password: String) {
        viewModelScope.launch {
            _uiState.value = LoginUiState.Loading
            try {
                val response = apiService.loginAgent(phone, password)

                if (response.isSuccessful) {
                    val body = response.body()!!
                    authManager.saveToken(body.token)
                    authManager.saveAgentProfile(body.agent)
                    _uiState.value = LoginUiState.Success
                } else {
                    val errorMsg = when (response.code()) {
                        401 -> "Invalid credentials"
                        404 -> "Agent account not found"
                        else -> "Login failed (${response.code()})"
                    }
                    _uiState.value = LoginUiState.Error(errorMsg)
                }
            } catch (e: Exception) {
                _uiState.value = LoginUiState.Error(
                    "Connection error: ${e.message ?: "Unable to reach server"}"
                )
            }
        }
    }

    fun checkExistingSession() {
        if (authManager.isLoggedIn()) {
            viewModelScope.launch {
                try {
                    val response = apiService.getCurrentUser()
                    if (response.isSuccessful) {
                        response.body()?.let { authManager.saveAgentProfile(it) }
                        _uiState.value = LoginUiState.Success
                    } else if (response.code() == 401) {
                        // Token expired
                        authManager.logout()
                    }
                } catch (_: Exception) {
                    // Offline - use cached profile
                    if (authManager.getAgentProfile() != null) {
                        _uiState.value = LoginUiState.Success
                    }
                }
            }
        }
    }

    fun logout() {
        authManager.logout()
        _uiState.value = LoginUiState.Idle
    }
}
