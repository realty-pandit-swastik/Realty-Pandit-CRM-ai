package com.realtypandit.staffapp.navigation

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.realtypandit.staffapp.ai.review.CallReviewScreen
import com.realtypandit.staffapp.contacts.ContactListScreen
import com.realtypandit.staffapp.contacts.ContactProfileScreen
import com.realtypandit.staffapp.core.auth.AuthManager
import com.realtypandit.staffapp.core.auth.ConsentManager
import com.realtypandit.staffapp.core.auth.ConsentScreen
import com.realtypandit.staffapp.core.auth.LoginScreen
import com.realtypandit.staffapp.core.auth.LoginViewModel
import com.realtypandit.staffapp.dashboard.DashboardScreen

sealed class Screen(val route: String, val label: String, val icon: ImageVector) {
    object Dashboard : Screen("dashboard", "Calls", Icons.Default.Phone)
    object Contacts : Screen("contacts", "Contacts", Icons.Default.People)
    object Settings : Screen("settings", "Settings", Icons.Default.Settings)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppNavigation(
    authManager: AuthManager,
    consentManager: ConsentManager
) {
    val navController = rememberNavController()
    val isLoggedIn = authManager.isLoggedIn()
    val hasConsent = consentManager.hasAcceptedConsent()

    val startDestination = when {
        !isLoggedIn -> "login"
        !hasConsent -> "consent"
        else -> Screen.Dashboard.route
    }

    val bottomBarScreens = listOf(Screen.Dashboard, Screen.Contacts, Screen.Settings)
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route
    val showBottomBar = currentRoute in bottomBarScreens.map { it.route }

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    bottomBarScreens.forEach { screen ->
                        NavigationBarItem(
                            icon = { Icon(screen.icon, contentDescription = screen.label) },
                            label = { Text(screen.label) },
                            selected = currentRoute == screen.route,
                            onClick = {
                                if (currentRoute != screen.route) {
                                    navController.navigate(screen.route) {
                                        popUpTo(Screen.Dashboard.route) { saveState = true }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                }
                            }
                        )
                    }
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = startDestination,
            modifier = Modifier.padding(innerPadding)
        ) {
            // Login
            composable("login") {
                LoginScreen(
                    onLoginSuccess = {
                        if (consentManager.hasAcceptedConsent()) {
                            navController.navigate(Screen.Dashboard.route) {
                                popUpTo("login") { inclusive = true }
                            }
                        } else {
                            navController.navigate("consent") {
                                popUpTo("login") { inclusive = true }
                            }
                        }
                    }
                )
            }

            // Consent
            composable("consent") {
                ConsentScreen(
                    onAccept = {
                        consentManager.acceptConsent()
                        navController.navigate(Screen.Dashboard.route) {
                            popUpTo("consent") { inclusive = true }
                        }
                    },
                    onDecline = {
                        // Can't use app without consent - go back to login
                        authManager.logout()
                        navController.navigate("login") {
                            popUpTo("consent") { inclusive = true }
                        }
                    }
                )
            }

            // Dashboard
            composable(Screen.Dashboard.route) {
                DashboardScreen(
                    onCallClick = { callId ->
                        navController.navigate("review/$callId")
                    },
                    onSettingsClick = {
                        navController.navigate(Screen.Settings.route)
                    }
                )
            }

            // Contacts
            composable(Screen.Contacts.route) {
                ContactListScreen(
                    onContactClick = { phoneNumber ->
                        navController.navigate("contact/$phoneNumber")
                    }
                )
            }

            // Contact Profile
            composable("contact/{phoneNumber}") { backStackEntry ->
                val phoneNumber = backStackEntry.arguments?.getString("phoneNumber") ?: return@composable
                ContactProfileScreen(
                    phoneNumber = phoneNumber,
                    onNavigateBack = { navController.popBackStack() },
                    onCallReview = { callId ->
                        navController.navigate("review/$callId")
                    }
                )
            }

            // Call Review
            composable("review/{callId}") { backStackEntry ->
                val callId = backStackEntry.arguments?.getString("callId") ?: return@composable
                CallReviewScreen(
                    callId = callId,
                    onNavigateBack = { navController.popBackStack() }
                )
            }

            // Settings
            composable(Screen.Settings.route) {
                SettingsScreen(
                    authManager = authManager,
                    consentManager = consentManager,
                    onLogout = {
                        authManager.logout()
                        navController.navigate("login") {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    authManager: AuthManager,
    consentManager: ConsentManager,
    onLogout: () -> Unit
) {
    val profile = authManager.getAgentProfile()

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Settings") })
        }
    ) { padding ->
        androidx.compose.foundation.lazy.LazyColumn(
            modifier = Modifier.padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(12.dp)
        ) {
            // Profile Card
            item {
                Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                    androidx.compose.foundation.layout.Column(
                        modifier = Modifier.padding(16.dp)
                    ) {
                        Text("Agent Profile", style = MaterialTheme.typography.titleSmall, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)
                        androidx.compose.foundation.layout.Spacer(modifier = Modifier.height(8.dp))
                        Text("Name: ${profile?.name ?: "N/A"}")
                        Text("Phone: ${profile?.phone ?: "N/A"}")
                        Text("Role: ${profile?.role ?: "N/A"}")
                    }
                }
            }

            // Consent toggle
            item {
                Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                    androidx.compose.foundation.layout.Row(
                        modifier = Modifier.padding(16.dp).fillMaxWidth(),
                        horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween,
                        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically
                    ) {
                        androidx.compose.foundation.layout.Column {
                            Text("Recording Consent", style = MaterialTheme.typography.bodyLarge)
                            Text(
                                "Allow business call recording",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        var checked by remember { mutableStateOf(consentManager.hasAcceptedConsent()) }
                        Switch(
                            checked = checked,
                            onCheckedChange = {
                                checked = it
                                if (it) consentManager.acceptConsent() else consentManager.revokeConsent()
                            }
                        )
                    }
                }
            }

            // Logout button
            item {
                Button(
                    onClick = onLogout,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = androidx.compose.ui.graphics.Color(0xFFEF4444)),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Default.Logout, contentDescription = null)
                    androidx.compose.foundation.layout.Spacer(modifier = Modifier.width(8.dp))
                    Text("Logout")
                }
            }

            // App info
            item {
                Text(
                    text = "Realty Pandit Staff App v1.0.0",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 16.dp)
                )
            }
        }
    }
}
