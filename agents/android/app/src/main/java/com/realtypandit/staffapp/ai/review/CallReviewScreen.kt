package com.realtypandit.staffapp.ai.review

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CallReviewScreen(
    callId: String,
    onNavigateBack: () -> Unit,
    viewModel: CallReviewViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(callId) {
        viewModel.loadCall(callId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Review Call") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when (val state = uiState) {
                is ReviewUiState.Loading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                }

                is ReviewUiState.Processing -> {
                    ProcessingView(state)
                }

                is ReviewUiState.Ready -> {
                    ReviewContent(
                        callDetails = state.callDetails,
                        editableData = state.editableData,
                        onSubmit = { viewModel.submitToCRM(it) },
                        onDiscard = { viewModel.rejectCall() }
                    )
                }

                is ReviewUiState.Submitted -> {
                    SubmittedView(state.message, onNavigateBack)
                }

                is ReviewUiState.Error -> {
                    ErrorView(state.message, onNavigateBack)
                }
            }
        }
    }
}

@Composable
private fun ProcessingView(state: ReviewUiState.Processing) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        CircularProgressIndicator(modifier = Modifier.size(64.dp))
        Spacer(modifier = Modifier.height(24.dp))
        Text(
            text = state.message,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Status: ${state.status}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun ReviewContent(
    callDetails: com.realtypandit.staffapp.core.network.models.StaffCallDetails,
    editableData: EditableExtraction,
    onSubmit: (EditableExtraction) -> Unit,
    onDiscard: () -> Unit
) {
    var data by remember { mutableStateOf(editableData) }
    var isEditing by remember { mutableStateOf(false) }
    var showTranscript by remember { mutableStateOf(false) }
    var showDiscardDialog by remember { mutableStateOf(false) }

    // Force edit if low confidence
    val forceEdit = editableData.confidence < 0.6f

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Call Info Header
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = callDetails.contact?.name ?: callDetails.phoneNumber,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = callDetails.phoneNumber,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    ConfidenceBadge(editableData.confidence)
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Duration: ${formatCallDuration(callDetails.duration ?: 0)}",
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }

        // Confidence Warning
        if (forceEdit) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFFEF2F2)),
                shape = RoundedCornerShape(12.dp)
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Warning,
                        contentDescription = null,
                        tint = Color(0xFFEF4444)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        text = "Low confidence (${(editableData.confidence * 100).toInt()}%). Please review and edit the fields below before submitting.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color(0xFF991B1B)
                    )
                }
            }
        }

        // Transcript Section (Expandable)
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { showTranscript = !showTranscript },
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Transcript", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    Icon(
                        if (showTranscript) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                        contentDescription = "Toggle transcript"
                    )
                }
                AnimatedVisibility(visible = showTranscript) {
                    Text(
                        text = callDetails.transcript ?: "No transcript available",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 12.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        // AI Extracted Fields
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("AI Extraction", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    TextButton(onClick = { isEditing = !isEditing }) {
                        Text(if (isEditing) "Done" else "Edit")
                    }
                }

                // Intent
                DropdownField(
                    label = "Intent",
                    value = data.intent,
                    options = listOf("BUY", "RENT", "SELL", "LEASE", "OTHER"),
                    enabled = isEditing || forceEdit,
                    onValueChange = { data = data.copy(intent = it) }
                )

                // Role
                DropdownField(
                    label = "Role",
                    value = data.role,
                    options = listOf("BUYER_TENANT", "SELLER_LANDLORD", "UNKNOWN"),
                    enabled = isEditing || forceEdit,
                    onValueChange = { data = data.copy(role = it) }
                )

                // Property Type
                EditableField(
                    label = "Property Type",
                    value = data.propertyType,
                    enabled = isEditing || forceEdit,
                    onValueChange = { data = data.copy(propertyType = it) }
                )

                // BHK
                EditableField(
                    label = "BHK",
                    value = data.bhk,
                    enabled = isEditing || forceEdit,
                    onValueChange = { data = data.copy(bhk = it) }
                )

                // Location
                EditableField(
                    label = "Location",
                    value = data.location,
                    enabled = isEditing || forceEdit,
                    onValueChange = { data = data.copy(location = it) }
                )

                // Budget
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    EditableField(
                        label = "Budget Min (L)",
                        value = data.budgetMin,
                        enabled = isEditing || forceEdit,
                        onValueChange = { data = data.copy(budgetMin = it) },
                        modifier = Modifier.weight(1f)
                    )
                    EditableField(
                        label = "Budget Max (L)",
                        value = data.budgetMax,
                        enabled = isEditing || forceEdit,
                        onValueChange = { data = data.copy(budgetMax = it) },
                        modifier = Modifier.weight(1f)
                    )
                }

                // Urgency
                DropdownField(
                    label = "Urgency",
                    value = data.urgency,
                    options = listOf("IMMEDIATE", "WITHIN_MONTH", "WITHIN_3_MONTHS", "FLEXIBLE", ""),
                    enabled = isEditing || forceEdit,
                    onValueChange = { data = data.copy(urgency = it) }
                )

                // Summary
                OutlinedTextField(
                    value = data.summary,
                    onValueChange = { data = data.copy(summary = it) },
                    label = { Text("Summary") },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = isEditing || forceEdit,
                    minLines = 3
                )
            }
        }

        // Action Buttons
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            OutlinedButton(
                onClick = { showDiscardDialog = true },
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFEF4444))
            ) {
                Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Discard")
            }

            Button(
                onClick = { onSubmit(data) },
                modifier = Modifier.weight(2f),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
            ) {
                Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Submit to CRM")
            }
        }

        Spacer(modifier = Modifier.height(32.dp))
    }

    // Discard confirmation dialog
    if (showDiscardDialog) {
        AlertDialog(
            onDismissRequest = { showDiscardDialog = false },
            title = { Text("Discard Call?") },
            text = { Text("This will permanently delete the recording and AI data. This action cannot be undone.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDiscardDialog = false
                        onDiscard()
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = Color(0xFFEF4444))
                ) {
                    Text("Discard")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDiscardDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
private fun ConfidenceBadge(confidence: Float) {
    val (color, label) = when {
        confidence >= 0.75f -> Pair(Color(0xFF22C55E), "High")
        confidence >= 0.6f -> Pair(Color(0xFFF59E0B), "Medium")
        else -> Pair(Color(0xFFEF4444), "Low")
    }

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = color.copy(alpha = 0.15f)
    ) {
        Text(
            text = "$label ${(confidence * 100).toInt()}%",
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = color
        )
    }
}

@Composable
private fun EditableField(
    label: String,
    value: String,
    enabled: Boolean,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        modifier = modifier.fillMaxWidth(),
        enabled = enabled,
        singleLine = true
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DropdownField(
    label: String,
    value: String,
    options: List<String>,
    enabled: Boolean,
    onValueChange: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }

    ExposedDropdownMenuBox(
        expanded = expanded && enabled,
        onExpandedChange = { if (enabled) expanded = it }
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = {},
            label = { Text(label) },
            readOnly = true,
            enabled = enabled,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier.menuAnchor().fillMaxWidth()
        )
        ExposedDropdownMenu(
            expanded = expanded && enabled,
            onDismissRequest = { expanded = false }
        ) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option.ifBlank { "(None)" }) },
                    onClick = {
                        onValueChange(option)
                        expanded = false
                    }
                )
            }
        }
    }
}

@Composable
private fun SubmittedView(message: String, onBack: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            Icons.Default.CheckCircle,
            contentDescription = null,
            modifier = Modifier.size(80.dp),
            tint = Color(0xFF22C55E)
        )
        Spacer(modifier = Modifier.height(24.dp))
        Text(text = message, style = MaterialTheme.typography.titleMedium)
        Spacer(modifier = Modifier.height(24.dp))
        Button(onClick = onBack) { Text("Back to Dashboard") }
    }
}

@Composable
private fun ErrorView(message: String, onBack: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            Icons.Default.Error,
            contentDescription = null,
            modifier = Modifier.size(80.dp),
            tint = Color(0xFFEF4444)
        )
        Spacer(modifier = Modifier.height(24.dp))
        Text(text = message, style = MaterialTheme.typography.titleMedium)
        Spacer(modifier = Modifier.height(24.dp))
        Button(onClick = onBack) { Text("Go Back") }
    }
}

private fun formatCallDuration(seconds: Int): String {
    val m = seconds / 60
    val s = seconds % 60
    return "${m}m ${s}s"
}
