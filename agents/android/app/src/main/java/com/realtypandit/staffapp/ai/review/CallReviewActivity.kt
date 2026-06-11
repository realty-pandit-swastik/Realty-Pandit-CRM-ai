package com.realtypandit.staffapp.ai.review

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.realtypandit.staffapp.ui.theme.RealtyPanditStaffTheme
import dagger.hilt.android.AndroidEntryPoint

/**
 * Activity wrapper for CallReviewScreen
 * Can be launched from notifications or from the dashboard
 */
@AndroidEntryPoint
class CallReviewActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val callId = intent.getStringExtra("call_id") ?: run {
            finish()
            return
        }

        setContent {
            RealtyPanditStaffTheme {
                CallReviewScreen(
                    callId = callId,
                    onNavigateBack = { finish() }
                )
            }
        }
    }
}
