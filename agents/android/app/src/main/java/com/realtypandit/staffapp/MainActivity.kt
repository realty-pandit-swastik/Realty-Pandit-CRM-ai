package com.realtypandit.staffapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.realtypandit.staffapp.core.auth.AuthManager
import com.realtypandit.staffapp.core.auth.ConsentManager
import com.realtypandit.staffapp.navigation.AppNavigation
import com.realtypandit.staffapp.ui.theme.RealtyPanditStaffTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var authManager: AuthManager

    @Inject
    lateinit var consentManager: ConsentManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            RealtyPanditStaffTheme {
                AppNavigation(
                    authManager = authManager,
                    consentManager = consentManager
                )
            }
        }
    }
}
