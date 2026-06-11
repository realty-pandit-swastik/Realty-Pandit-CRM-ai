package com.realtypandit.staffapp.contacts

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.realtypandit.staffapp.core.network.models.Interaction

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContactProfileScreen(
    phoneNumber: String,
    onNavigateBack: () -> Unit,
    onCallReview: (String) -> Unit,
    viewModel: ContactProfileViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(phoneNumber) {
        viewModel.loadProfile(phoneNumber)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Contact Profile") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        when (val state = uiState) {
            is ContactProfileUiState.Loading -> {
                Box(
                    modifier = Modifier.fillMaxSize().padding(padding),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            }

            is ContactProfileUiState.Success -> {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Contact Header
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(16.dp)
                        ) {
                            Column(
                                modifier = Modifier.padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Surface(
                                    modifier = Modifier.size(72.dp).clip(CircleShape),
                                    color = MaterialTheme.colorScheme.primaryContainer
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Text(
                                            text = (state.contact.name?.firstOrNull() ?: 'U').uppercase(),
                                            style = MaterialTheme.typography.headlineMedium,
                                            fontWeight = FontWeight.Bold,
                                            color = MaterialTheme.colorScheme.onPrimaryContainer
                                        )
                                    }
                                }
                                Spacer(modifier = Modifier.height(12.dp))
                                Text(
                                    text = state.contact.name ?: "Unknown",
                                    style = MaterialTheme.typography.titleLarge,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = state.contact.phoneNumber,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )

                                Spacer(modifier = Modifier.height(16.dp))

                                // Info chips row
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    InfoChip(label = state.contact.contactType, color = MaterialTheme.colorScheme.primary)
                                    LeadStatusBadge(state.contact.leadStatus)
                                    if (state.contact.intent != null) {
                                        InfoChip(label = state.contact.intent, color = Color(0xFF7C3AED))
                                    }
                                }
                            }
                        }
                    }

                    // Details Card
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Column(
                                modifier = Modifier.padding(16.dp),
                                verticalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Text("Details", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)

                                if (state.contact.propertyType != null) {
                                    DetailRow("Property Type", state.contact.propertyType)
                                }
                                if (state.contact.preferredLocation != null) {
                                    DetailRow("Location", state.contact.preferredLocation)
                                }
                                if (state.contact.budgetMin != null || state.contact.budgetMax != null) {
                                    DetailRow(
                                        "Budget",
                                        "${state.contact.budgetMin?.toLong() ?: "?"} - ${state.contact.budgetMax?.toLong() ?: "?"} L"
                                    )
                                }
                                if (state.contact.lastChannel != null) {
                                    DetailRow("Last Channel", state.contact.lastChannel)
                                }
                            }
                        }
                    }

                    // AI Summary
                    if (state.contact.aiSummary != null) {
                        item {
                            Card(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Text("AI Summary", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Text(
                                        text = state.contact.aiSummary,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }

                    // Conversation Timeline
                    item {
                        Text(
                            "Conversation Feed",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }

                    if (state.interactions.isEmpty()) {
                        item {
                            Box(
                                modifier = Modifier.fillMaxWidth().padding(32.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    "No interactions yet",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    } else {
                        items(state.interactions, key = { it.id }) { interaction ->
                            InteractionCard(interaction = interaction, onCallReview = onCallReview)
                        }
                    }
                }
            }

            is ContactProfileUiState.Error -> {
                Box(
                    modifier = Modifier.fillMaxSize().padding(padding),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(state.message, color = Color(0xFFEF4444))
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(onClick = { viewModel.loadProfile(phoneNumber) }) { Text("Retry") }
                    }
                }
            }
        }
    }
}

@Composable
private fun InteractionCard(
    interaction: Interaction,
    onCallReview: (String) -> Unit
) {
    val (icon, color) = when (interaction.channel) {
        "whatsapp" -> Pair(Icons.Default.Chat, Color(0xFF25D366))
        "voice", "staff_call" -> Pair(Icons.Default.Phone, Color(0xFF3B82F6))
        "email" -> Pair(Icons.Default.Email, Color(0xFFF59E0B))
        else -> Pair(Icons.Default.Info, Color(0xFF94A3B8))
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.Top
        ) {
            Surface(
                modifier = Modifier.size(36.dp).clip(CircleShape),
                color = color.copy(alpha = 0.15f)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(20.dp))
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "${interaction.channel} (${interaction.direction})",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = color
                    )
                    Text(
                        text = formatTimestamp(interaction.createdAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                if (interaction.content != null) {
                    Text(
                        text = interaction.content,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }

                // Show review button for staff_call interactions
                if (interaction.channel == "staff_call") {
                    val callId = (interaction.metadata?.get("call_id") as? String)
                    if (callId != null) {
                        TextButton(
                            onClick = { onCallReview(callId) },
                            contentPadding = PaddingValues(0.dp)
                        ) {
                            Text("View Call Details", style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
private fun InfoChip(label: String, color: Color) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = color.copy(alpha = 0.15f)
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = color
        )
    }
}

private fun formatTimestamp(timestamp: String): String {
    // Simple formatting - in production use proper date parser
    return try {
        timestamp.substring(0, 16).replace("T", " ")
    } catch (_: Exception) {
        timestamp
    }
}
