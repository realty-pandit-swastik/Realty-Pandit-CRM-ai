package com.realtypandit.staffapp.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.realtypandit.staffapp.core.network.ApiService
import com.realtypandit.staffapp.core.network.models.CallStatsResponse
import com.realtypandit.staffapp.core.network.models.StaffCallSummary
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val apiService: ApiService
) : ViewModel() {

    private val _stats = MutableStateFlow<CallStatsResponse?>(null)
    val stats: StateFlow<CallStatsResponse?> = _stats.asStateFlow()

    private val _recentCalls = MutableStateFlow<List<StaffCallSummary>>(emptyList())
    val recentCalls: StateFlow<List<StaffCallSummary>> = _recentCalls.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    fun loadDashboard() {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                // Fetch stats and recent calls in parallel
                launch {
                    try {
                        val response = apiService.getCallStats()
                        if (response.isSuccessful) {
                            _stats.value = response.body()
                        }
                    } catch (_: Exception) { }
                }

                launch {
                    try {
                        val response = apiService.getCallHistory(page = 1, limit = 20)
                        if (response.isSuccessful) {
                            _recentCalls.value = response.body()?.calls ?: emptyList()
                        }
                    } catch (_: Exception) { }
                }
            } finally {
                _isLoading.value = false
            }
        }
    }
}
