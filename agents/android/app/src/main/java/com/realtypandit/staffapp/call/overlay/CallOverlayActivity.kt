package com.realtypandit.staffapp.call.overlay

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.realtypandit.staffapp.ui.theme.RealtyPanditStaffTheme
import dagger.hilt.android.AndroidEntryPoint

/**
 * Call Overlay Activity
 * Shows immediately after call ends to classify as Business or Personal
 */
@AndroidEntryPoint
class CallOverlayActivity : ComponentActivity() {

    private val viewModel: CallOverlayViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val filePath = intent.getStringExtra("file_path")
        val duration = intent.getIntExtra("duration", 0)
        val phoneNumber = intent.getStringExtra("phone_number")
        val callId = intent.getStringExtra("call_id")

        if (filePath == null || callId == null) {
            finish()
            return
        }

        viewModel.initialize(
            callId = callId,
            filePath = filePath,
            duration = duration,
            phoneNumber = phoneNumber
        )

        setContent {
            RealtyPanditStaffTheme {
                ClassificationDialog(
                    phoneNumber = phoneNumber,
                    duration = duration,
                    onBusinessClick = {
                        viewModel.classifyAsBusiness()
                        finish()
                    },
                    onPersonalClick = {
                        viewModel.classifyAsPersonal()
                        finish()
                    },
                    onDismiss = {
                        // Auto-classify as personal if dismissed
                        viewModel.classifyAsPersonal()
                        finish()
                    }
                )
            }
        }
    }
}

@Composable
fun ClassificationDialog(
    phoneNumber: String?,
    duration: Int,
    onBusinessClick: () -> Unit,
    onPersonalClick: () -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            dismissOnBackPress = true,
            dismissOnClickOutside = true
        )
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 8.dp
        ) {
            Column(
                modifier = Modifier
                    .padding(24.dp)
                    .fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = "Classify This Call",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )

                if (phoneNumber != null) {
                    Text(
                        text = phoneNumber,
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Text(
                    text = "${formatDuration(duration)} • Just now",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Divider(modifier = Modifier.padding(vertical = 8.dp))

                // Business Button
                Button(
                    onClick = onBusinessClick,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        text = "📞 Business Call",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                }

                // Personal Button
                OutlinedButton(
                    onClick = onPersonalClick,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = MaterialTheme.colorScheme.onSurface
                    )
                ) {
                    Text(
                        text = "👤 Personal Call",
                        style = MaterialTheme.typography.titleMedium
                    )
                }

                Text(
                    text = "Business calls will be uploaded for AI processing",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
        }
    }
}

private fun formatDuration(seconds: Int): String {
    val minutes = seconds / 60
    val secs = seconds % 60
    return if (minutes > 0) {
        "${minutes}m ${secs}s"
    } else {
        "${secs}s"
    }
}
