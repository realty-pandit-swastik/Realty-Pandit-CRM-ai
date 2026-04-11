# Reality Pandit -- Project Structure

> Last updated: 2026-02-26

---

## 1. Project Overview

**Reality Pandit** is an AI-powered real estate CRM platform built for the Indian property market. It combines a multi-agent AI backend (powered by Google Gemini), an admin dashboard, a public-facing property website, and a native Android staff app into a single integrated system. The platform automates lead management, buyer/seller workflows, property inventory tracking, WhatsApp and voice communication, marketing campaigns, and partner-agent coordination -- all orchestrated by specialized AI agents.

---

## 2. Technology Stack Summary

| Layer | Technology | Version |
|---|---|---|
| **Backend Runtime** | Node.js / Express.js | Express 5 |
| **Backend Language** | TypeScript | -- |
| **ORM / Database Toolkit** | Prisma | 6 |
| **Primary Database** | PostgreSQL | 16 |
| **Cache / Queue Broker** | Redis | 7 |
| **Job Queue** | BullMQ | 5 |
| **AI / LLM** | Google Gemini | 2.5 Flash |
| **Admin Frontend Framework** | React | 19 |
| **Admin Bundler** | Vite | 7 |
| **Admin Charts** | Recharts | -- |
| **Maps** | Google Maps API | -- |
| **Public Website Framework** | Next.js | 16 |
| **Website Styling** | Tailwind CSS | 4 |
| **Website Animations** | Framer Motion | 12 |
| **Android App Language** | Kotlin | -- |
| **Android UI** | Jetpack Compose | -- |
| **Server OS** | Ubuntu | 24.04 LTS |
| **Reverse Proxy** | Nginx | -- |
| **Process Manager** | PM2 | -- |
| **SSL** | Let's Encrypt | -- |
| **Containerization** | Docker / Docker Compose | -- |
| **CI/CD** | GitHub Actions | -- |

---

## 3. Complete Directory Tree

The tree below shows every directory and significant file in the project. Generated build artifacts (`node_modules/`, `dist/`, `.next/`, `.gradle/`, `build/`) are collapsed with a note.

```
reality-pandit/                                   # Project root
|
|-- .github/
|   +-- workflows/
|       |-- backend-ci.yml                        # Backend CI pipeline
|       +-- website-ci.yml                        # Website CI pipeline
|
|-- agents/                                       # All sub-projects live here
|   |
|   |-- ai_automation/
|   |   +-- workflow.md                           # AI automation agent spec
|   |
|   |-- android/                                  # Kotlin staff mobile app
|   |   |-- README.md
|   |   |-- app-debug.apk                         # Pre-built debug APK
|   |   |-- build.gradle                          # Root Gradle build
|   |   |-- gradle.properties
|   |   |-- gradlew
|   |   |-- gradlew.bat
|   |   |-- local.properties
|   |   |-- settings.gradle
|   |   |-- gradle/
|   |   |   +-- wrapper/
|   |   |       |-- gradle-wrapper.jar
|   |   |       +-- gradle-wrapper.properties
|   |   +-- app/
|   |       |-- build.gradle                      # App-level Gradle build
|   |       |-- proguard-rules.pro
|   |       +-- src/main/
|   |           |-- AndroidManifest.xml
|   |           |-- java/com/realtypandit/staffapp/
|   |           |   |-- MainActivity.kt
|   |           |   |-- StaffApp.kt               # Application class
|   |           |   |-- ai/
|   |           |   |   +-- review/
|   |           |   |       |-- CallReviewActivity.kt
|   |           |   |       |-- CallReviewScreen.kt
|   |           |   |       +-- CallReviewViewModel.kt
|   |           |   |-- call/
|   |           |   |   |-- detection/
|   |           |   |   |   +-- CallDetectorService.kt
|   |           |   |   |-- overlay/
|   |           |   |   |   |-- CallOverlayActivity.kt
|   |           |   |   |   +-- CallOverlayViewModel.kt
|   |           |   |   |-- recording/
|   |           |   |   |   +-- CallRecorder.kt
|   |           |   |   +-- upload/
|   |           |   |       +-- CallUploadWorker.kt
|   |           |   |-- contacts/
|   |           |   |   |-- ContactListScreen.kt
|   |           |   |   |-- ContactListViewModel.kt
|   |           |   |   |-- ContactProfileScreen.kt
|   |           |   |   +-- ContactProfileViewModel.kt
|   |           |   |-- core/
|   |           |   |   |-- auth/
|   |           |   |   |   |-- AuthManager.kt
|   |           |   |   |   |-- ConsentManager.kt
|   |           |   |   |   |-- ConsentScreen.kt
|   |           |   |   |   |-- LoginScreen.kt
|   |           |   |   |   +-- LoginViewModel.kt
|   |           |   |   |-- network/
|   |           |   |   |   |-- ApiService.kt
|   |           |   |   |   |-- NetworkModule.kt
|   |           |   |   |   +-- models/
|   |           |   |   |       +-- ApiModels.kt
|   |           |   |   |-- permissions/
|   |           |   |   |   +-- PermissionManager.kt
|   |           |   |   +-- storage/
|   |           |   |       +-- EncryptedFileStorage.kt
|   |           |   |-- dashboard/
|   |           |   |   |-- DashboardScreen.kt
|   |           |   |   +-- DashboardViewModel.kt
|   |           |   |-- data/
|   |           |   |   +-- local/
|   |           |   |       |-- AppDatabase.kt
|   |           |   |       |-- Converters.kt
|   |           |   |       |-- DatabaseModule.kt
|   |           |   |       |-- dao/
|   |           |   |       |   |-- CallDao.kt
|   |           |   |       |   +-- ContactDao.kt
|   |           |   |       +-- entities/
|   |           |   |           |-- CallEntity.kt
|   |           |   |           +-- ContactEntity.kt
|   |           |   |-- navigation/
|   |           |   |   +-- AppNavigation.kt
|   |           |   +-- ui/
|   |           |       +-- theme/
|   |           |           |-- Theme.kt
|   |           |           +-- Type.kt
|   |           +-- res/
|   |               |-- drawable/
|   |               |   +-- ic_launcher_foreground.xml
|   |               |-- mipmap-anydpi-v26/
|   |               |   |-- ic_launcher.xml
|   |               |   +-- ic_launcher_round.xml
|   |               |-- mipmap-hdpi/
|   |               |   |-- ic_launcher.png
|   |               |   |-- ic_launcher_foreground.png
|   |               |   +-- ic_launcher_round.png
|   |               |-- mipmap-mdpi/
|   |               |   |-- ic_launcher.png
|   |               |   |-- ic_launcher_foreground.png
|   |               |   +-- ic_launcher_round.png
|   |               |-- mipmap-xhdpi/
|   |               |   |-- ic_launcher.png
|   |               |   |-- ic_launcher_foreground.png
|   |               |   +-- ic_launcher_round.png
|   |               |-- mipmap-xxhdpi/
|   |               |   |-- ic_launcher.png
|   |               |   |-- ic_launcher_foreground.png
|   |               |   +-- ic_launcher_round.png
|   |               |-- mipmap-xxxhdpi/
|   |               |   |-- ic_launcher.png
|   |               |   |-- ic_launcher_foreground.png
|   |               |   +-- ic_launcher_round.png
|   |               |-- values/
|   |               |   |-- colors.xml
|   |               |   |-- strings.xml
|   |               |   +-- themes.xml
|   |               +-- xml/
|   |                   |-- backup_rules.xml
|   |                   +-- data_extraction_rules.xml
|   |
|   |-- backend/                                  # Express.js API server
|   |   |-- .dockerignore
|   |   |-- .env
|   |   |-- .env.example
|   |   |-- .env.production
|   |   |-- .gitignore
|   |   |-- Dockerfile
|   |   |-- check-agent.js
|   |   |-- check-agents.js
|   |   |-- create-admin.js
|   |   |-- create-admin-prod.js
|   |   |-- ecosystem.config.js                   # PM2 configuration
|   |   |-- list-admins.js
|   |   |-- package.json
|   |   |-- package-lock.json
|   |   |-- reset-all-admin-passwords.js
|   |   |-- test-login.js
|   |   |-- test_seed.ts
|   |   |-- tsconfig.json
|   |   |-- tsc_error.log
|   |   |-- tsc_error_2.log
|   |   |-- update-admin-password.js
|   |   |-- vitest.config.ts
|   |   |-- workflow.md
|   |   |
|   |   |-- dist/                                 # [compiled JS output -- omitted]
|   |   |-- logs/                                 # Runtime log files
|   |   |   |-- combined-2026-02-*.log
|   |   |   +-- error-2026-02-*.log
|   |   |-- node_modules/                         # [dependencies -- omitted]
|   |   |-- uploads/                              # File upload directories
|   |   |   |-- documents/
|   |   |   |-- pending/
|   |   |   |-- profiles/
|   |   |   |-- projects/
|   |   |   |-- properties/
|   |   |   |-- staff_calls/
|   |   |   +-- temp/
|   |   |
|   |   |-- prisma/
|   |   |   |-- schema.prisma                     # Database schema (SSOT)
|   |   |   |-- seed.ts                           # Database seed script
|   |   |   |-- seed_flat_types.ts                # Flat-type seed data
|   |   |   |-- seed_master.ts                    # Master data seed
|   |   |   +-- migrations/
|   |   |       |-- migration_lock.toml
|   |   |       |-- 20260206170857_init_ssot_v3/
|   |   |       |   +-- migration.sql
|   |   |       |-- 20260207055725_add_lead_scoring_final/
|   |   |       |   +-- migration.sql
|   |   |       |-- 20260209211207_add_auth_fields/
|   |   |       |   +-- migration.sql
|   |   |       |-- 20260210050314_phase6_sessions_language/
|   |   |       |   +-- migration.sql
|   |   |       |-- 20260211113201_add_website_models/
|   |   |       |   +-- migration.sql
|   |   |       |-- 20260212000000_add_partner_agent_marketplace/
|   |   |       |   +-- migration.sql
|   |   |       |-- 20260212125820_add_partner_agent_marketplace/
|   |   |       |   +-- migration.sql
|   |   |       |-- 20260219000000_add_workflow_fields/
|   |   |       |   +-- migration.sql
|   |   |       |-- 20260222000000_add_video_urls_lead_reference/
|   |   |       |   +-- migration.sql
|   |   |       |-- 20260223000000_inventory_redesign_v2/
|   |   |       |   +-- migration.sql
|   |   |       |-- 20260224000000_add_geo_coordinates/
|   |   |       |   +-- migration.sql
|   |   |       |-- 20260224_add_campaign_templates/
|   |   |       |   +-- migration.sql
|   |   |       |-- 20260224_add_projects_tasks/
|   |   |       |   +-- migration.sql
|   |   |       +-- 20260224_add_workflow_automation/
|   |   |           +-- migration.sql
|   |   |
|   |   |-- scripts/
|   |   |   +-- submit_meta_templates.js          # Meta/WhatsApp template submission
|   |   |
|   |   +-- src/
|   |       |-- app.ts                            # Express app setup
|   |       |-- server.ts                         # HTTP server entry point
|   |       |-- db.ts                             # Prisma client instance
|   |       |-- swagger.ts                        # Swagger/OpenAPI config
|   |       |
|   |       |-- __tests__/
|   |       |   |-- app.test.ts
|   |       |   |-- setup.ts
|   |       |   +-- validators.test.ts
|   |       |
|   |       |-- agents/                           # AI agent implementations
|   |       |   |-- index.ts                      # Agent registry/exports
|   |       |   |-- types.ts                      # Shared agent types
|   |       |   |-- admin_agent.ts
|   |       |   |-- audit_agent.ts
|   |       |   |-- classifier_agent.ts
|   |       |   |-- coordination_agent.ts
|   |       |   |-- inventory_agent.ts
|   |       |   |-- marketing_agent.ts
|   |       |   |-- matching_agent.ts
|   |       |   |-- notification_agent.ts
|   |       |   |-- partner_agent.ts
|   |       |   |-- prompt_engineer_agent.ts
|   |       |   |-- qa_agent.ts
|   |       |   |-- sales_agent.ts
|   |       |   +-- security_agent.ts
|   |       |
|   |       |-- config/
|   |       |   |-- permissions.ts                # Role-based permission definitions
|   |       |   +-- whatsapp_templates.ts         # WhatsApp message templates
|   |       |
|   |       |-- cron/
|   |       |   |-- ai_boss_jobs.ts               # Scheduled AI boss tasks
|   |       |   +-- qa_daily_jobs.ts              # Daily QA audit jobs
|   |       |
|   |       |-- data/
|   |       |   +-- india_geo.ts                  # India geography data (states, cities)
|   |       |
|   |       |-- integrations/
|   |       |   |-- 99acres.ts                    # 99acres portal integration
|   |       |   |-- housing.ts                    # Housing.com integration
|   |       |   +-- magicbricks.ts                # MagicBricks integration
|   |       |
|   |       |-- jobs/
|   |       |   +-- cleanup_uploads.ts            # Periodic upload cleanup
|   |       |
|   |       |-- middleware/
|   |       |   |-- agent_auth.ts                 # Agent authentication
|   |       |   |-- apikey.ts                     # API key validation
|   |       |   |-- auth.ts                       # JWT authentication
|   |       |   |-- cache.ts                      # Redis cache middleware
|   |       |   |-- error_handler.ts              # Global error handler
|   |       |   |-- rate_limit.ts                 # Rate limiting
|   |       |   +-- request_logger.ts             # HTTP request logging
|   |       |
|   |       |-- queues/
|   |       |   |-- connection.ts                 # BullMQ Redis connection
|   |       |   |-- index.ts                      # Queue registry
|   |       |   +-- workers/
|   |       |       |-- scheduled_worker.ts       # Scheduled task worker
|   |       |       +-- whatsapp_inbound.ts       # Inbound WhatsApp processor
|   |       |
|   |       |-- routes/
|   |       |   |-- agent.ts                      # Partner agent routes
|   |       |   |-- agent_dashboard.ts            # Agent dashboard API
|   |       |   |-- ai_chat.ts                    # AI chat endpoints
|   |       |   |-- analytics.ts                  # Analytics/reporting
|   |       |   |-- api.ts                        # Main API router
|   |       |   |-- auth.ts                       # Admin authentication
|   |       |   |-- auth_otp.ts                   # OTP-based authentication
|   |       |   |-- builder.ts                    # Builder management
|   |       |   |-- calendar.ts                   # Calendar/scheduling
|   |       |   |-- classification.ts             # Lead classification
|   |       |   |-- email.ts                      # Email management
|   |       |   |-- external_leads.ts             # External lead ingestion
|   |       |   |-- inventory.ts                  # Property inventory CRUD
|   |       |   |-- leads.ts                      # Lead management
|   |       |   |-- marketing.ts                  # Marketing campaigns
|   |       |   |-- master.ts                     # Master data (cities, types)
|   |       |   |-- notifications.ts              # Notification management
|   |       |   |-- public.ts                     # Public website API
|   |       |   |-- reports.ts                    # Report generation
|   |       |   |-- staff_calls.ts                # Staff call logging
|   |       |   |-- tasks.ts                      # Task management
|   |       |   |-- team.ts                       # Team/staff management
|   |       |   |-- transactions.ts               # Transaction tracking
|   |       |   |-- user_auth.ts                  # User (buyer/seller) auth
|   |       |   |-- webhooks.ts                   # Webhook endpoints
|   |       |   |-- workflow.ts                   # Workflow execution
|   |       |   +-- workflows.ts                  # Workflow definitions API
|   |       |
|   |       |-- scripts/
|   |       |   |-- geocode-properties.ts         # Geocode existing properties
|   |       |   |-- migrate_partner_to_owner.ts   # Data migration script
|   |       |   |-- seed_buyer.ts                 # Buyer seed data
|   |       |   |-- simulate_voice_webhook.ts     # Voice webhook simulator
|   |       |   |-- simulate_webhook.ts           # WhatsApp webhook simulator
|   |       |   |-- system_health_check.ts        # System health diagnostics
|   |       |   |-- test_inventory_flow.ts
|   |       |   |-- test_lead_score.ts
|   |       |   |-- test_llm.ts
|   |       |   |-- test_matching.ts
|   |       |   |-- test_media_inventory.ts
|   |       |   |-- test_outbound.ts
|   |       |   |-- test_polish.ts
|   |       |   |-- test_scheduler.ts
|   |       |   |-- test_workflows.ts
|   |       |   |-- verify_db.ts
|   |       |   +-- verify_db_call_log.ts
|   |       |
|   |       |-- services/
|   |       |   |-- agent_auth.ts                 # Agent auth service
|   |       |   |-- ai_boss.ts                    # AI Boss orchestrator
|   |       |   |-- audio_storage.ts              # Audio file storage
|   |       |   |-- audit_logger.ts               # Audit trail logging
|   |       |   |-- auth.ts                       # Auth service (JWT, bcrypt)
|   |       |   |-- calendar.ts                   # Calendar service
|   |       |   |-- call_extractor.ts             # Call data extraction
|   |       |   |-- chat_handler.ts               # AI chat handler
|   |       |   |-- commission.ts                 # Commission calculation
|   |       |   |-- contact_identifier.ts         # Contact identification
|   |       |   |-- date_parser.ts                # Natural language date parsing
|   |       |   |-- dealer.ts                     # Dealer management
|   |       |   |-- decision_engine.ts            # AI decision engine
|   |       |   |-- email_lead_parser.ts          # Email lead parsing
|   |       |   |-- email_provisioner.ts          # Email provisioning
|   |       |   |-- email_service.ts              # Email sending service
|   |       |   |-- ensure_owner.ts               # Owner verification
|   |       |   |-- executive_assigner.ts         # Auto-assign executives
|   |       |   |-- followup_scheduler.ts         # Follow-up scheduling
|   |       |   |-- image_moderation.ts           # Image moderation via AI
|   |       |   |-- interaction_engine.ts         # Interaction tracking
|   |       |   |-- lead_score.ts                 # AI lead scoring
|   |       |   |-- llm.ts                        # LLM (Gemini) client wrapper
|   |       |   |-- matching.ts                   # Property-lead matching
|   |       |   |-- matching_engine.ts            # Advanced matching engine
|   |       |   |-- message_router.ts             # Message routing logic
|   |       |   |-- owner.ts                      # Owner service
|   |       |   |-- pending_message_queue.ts      # Pending message queue
|   |       |   |-- performance_monitor.ts        # Performance monitoring
|   |       |   |-- permission_engine.ts          # RBAC permission engine
|   |       |   |-- role_context_detector.ts      # Role context detection
|   |       |   |-- scheduler.ts                  # Task scheduler
|   |       |   |-- session/
|   |       |   |   +-- store.ts                  # Session store
|   |       |   |-- session_store.ts              # Legacy session store
|   |       |   |-- session_tracker.ts            # Session tracking
|   |       |   |-- storage.ts                    # File storage service
|   |       |   |-- subscription.ts               # Subscription management
|   |       |   |-- system_prompt.ts              # AI system prompts
|   |       |   |-- transaction_service.ts        # Transaction service
|   |       |   |-- transaction_state_machine.ts  # Transaction state machine
|   |       |   |-- transcription.ts              # Audio transcription
|   |       |   |-- upload.ts                     # File upload handler
|   |       |   |-- voice.ts                      # Voice (VAPI) integration
|   |       |   |-- webhook_processor.ts          # Webhook processing
|   |       |   |-- whatsapp.ts                   # WhatsApp Cloud API client
|   |       |   +-- workflow_engine.ts            # Workflow execution engine
|   |       |
|   |       |-- utils/
|   |       |   |-- alerter.ts                    # Alert/notification utility
|   |       |   |-- circuit_breaker.ts            # Circuit breaker pattern
|   |       |   |-- logger.ts                     # Winston logger config
|   |       |   |-- phone.ts                      # Phone number formatting
|   |       |   |-- quiet_hours.ts                # Quiet hours logic
|   |       |   +-- redis.ts                      # Redis client singleton
|   |       |
|   |       |-- validators/
|   |       |   |-- auth.validator.ts
|   |       |   |-- calls.validator.ts
|   |       |   |-- index.ts
|   |       |   +-- public.validator.ts
|   |       |
|   |       |-- workers/
|   |       |   +-- call_processor.ts             # Call processing worker
|   |       |
|   |       +-- workflows/
|   |           |-- builder_inventory.ts          # Builder inventory workflow
|   |           |-- builder_onboarding.ts         # Builder onboarding workflow
|   |           |-- buyer.ts                      # Buyer journey workflow
|   |           |-- inventory_machine.ts          # Inventory state machine
|   |           |-- management.ts                 # Management workflow
|   |           |-- partner_agent.ts              # Partner agent workflow
|   |           |-- seller.ts                     # Seller journey workflow
|   |           |-- unknown.ts                    # Unknown contact workflow
|   |           |-- whatsapp_workflow_adapter.ts   # WhatsApp-workflow bridge
|   |           |-- workflow_definition.ts        # Workflow definitions
|   |           |-- workflow_engine.ts            # Workflow engine core
|   |           +-- workflow_types.ts             # Workflow type definitions
|   |
|   |-- buyer_workflow/
|   |   |-- index.ts                              # Buyer workflow entry
|   |   +-- workflow.md                           # Buyer workflow spec
|   |
|   |-- connection_api/
|   |   +-- workflow.md                           # Connection API spec
|   |
|   |-- dealer_workflow/
|   |   +-- workflow.md                           # Dealer workflow spec
|   |
|   |-- deployment/
|   |   |-- docker-compose.yml                    # Deployment Docker Compose
|   |   +-- workflow.md                           # Deployment workflow spec
|   |
|   |-- email/                                    # (placeholder -- empty)
|   |
|   |-- frontend/                                 # React admin dashboard
|   |   |-- .env
|   |   |-- .env.example
|   |   |-- .env.production
|   |   |-- .gitignore
|   |   |-- README.md
|   |   |-- eslint.config.js
|   |   |-- frontend.tar.gz                       # Build archive
|   |   |-- index.html                            # SPA entry point
|   |   |-- package.json
|   |   |-- package-lock.json
|   |   |-- tsconfig.json
|   |   |-- tsconfig.app.json
|   |   |-- tsconfig.node.json
|   |   |-- vite.config.ts
|   |   |-- dist/                                 # [production build -- omitted]
|   |   |-- node_modules/                         # [dependencies -- omitted]
|   |   |-- public/
|   |   |   +-- vite.svg
|   |   +-- src/
|   |       |-- App.css
|   |       |-- App.tsx                           # Root component
|   |       |-- index.css                         # Global styles
|   |       |-- main.tsx                          # React entry point
|   |       |
|   |       |-- api/
|   |       |   +-- client.ts                     # Axios API client
|   |       |
|   |       |-- assets/
|   |       |   +-- react.svg
|   |       |
|   |       |-- components/
|   |       |   |-- AddInventory.tsx              # Add property form
|   |       |   |-- AdvancedAnalytics.tsx         # Advanced analytics view
|   |       |   |-- AgentLogs.tsx                 # AI agent log viewer
|   |       |   |-- AgentOverride.tsx             # Agent override controls
|   |       |   |-- CalendarView.tsx              # Calendar component
|   |       |   |-- CallLog.tsx                   # Call log viewer
|   |       |   |-- ChatView.tsx                  # Chat interface
|   |       |   |-- ContactList.tsx               # Contact management
|   |       |   |-- DashboardLayout.tsx           # Dashboard shell layout
|   |       |   |-- DashboardTabs.tsx             # Dashboard tab navigation
|   |       |   |-- EmailManagement.tsx           # Email management view
|   |       |   |-- ExternalLeads.tsx             # External lead management
|   |       |   |-- GooglePlacesInput.tsx         # Google Places autocomplete
|   |       |   |-- InventoryList.tsx             # Property inventory list
|   |       |   |-- LoginPage.tsx                 # Admin login
|   |       |   |-- MarketingCampaign.tsx         # Marketing campaign manager
|   |       |   |-- NotificationSettings.tsx      # Notification preferences
|   |       |   |-- PartnerManagement.tsx         # Partner management
|   |       |   |-- PropertyLiveStatus.tsx        # Property live status
|   |       |   |-- PropertyMapView.tsx           # Google Maps property view
|   |       |   |-- QADashboard.tsx               # QA dashboard
|   |       |   |-- ReportsView.tsx               # Reports view
|   |       |   |-- SetupPasswordPage.tsx         # First-time password setup
|   |       |   |-- TaskBoard.tsx                 # Task board (Kanban)
|   |       |   |-- TeamManagement.tsx            # Team management
|   |       |   |-- VoiceCommands.tsx             # Voice commands UI
|   |       |   |-- WorkflowBuilder.tsx           # Visual workflow builder
|   |       |   |
|   |       |   |-- dashboard/
|   |       |   |   |-- LeadSourcesDashboard.tsx  # Lead sources analytics
|   |       |   |   |-- MainDashboard.tsx         # Main overview dashboard
|   |       |   |   |-- MarketTrendsDashboard.tsx # Market trends charts
|   |       |   |   |-- PropertyAnalyticsDashboard.tsx
|   |       |   |   +-- UserPerformanceDashboard.tsx
|   |       |   |
|   |       |   +-- mobile/
|   |       |       |-- MobileCalendar.tsx
|   |       |       |-- MobileChatView.tsx
|   |       |       |-- MobileContactList.tsx
|   |       |       |-- MobileDashboard.tsx
|   |       |       |-- MobileInventoryEdit.tsx
|   |       |       |-- MobileInventoryList.tsx
|   |       |       |-- MobileLayout.tsx
|   |       |       |-- MobileSettings.tsx
|   |       |       +-- MobileTeamView.tsx
|   |       |
|   |       |-- contexts/
|   |       |   |-- AuthContext.tsx                # Auth state management
|   |       |   +-- ThemeContext.tsx               # Dark/light theme
|   |       |
|   |       |-- hooks/
|   |       |   |-- useIsMobile.ts                # Mobile detection hook
|   |       |   +-- useWorkflow.ts                # Workflow state hook
|   |       |
|   |       |-- lib/
|   |       |   +-- api.ts                        # API helper utilities
|   |       |
|   |       +-- utils/
|   |           +-- exportHelpers.ts              # Data export utilities
|   |
|   |-- logic_transfer/
|   |   +-- workflow.md                           # Logic transfer spec
|   |
|   |-- master_inspector/                         # (placeholder -- empty)
|   |
|   |-- script_workflow/
|   |   |-- buyer_scripts.json                    # Buyer call scripts
|   |   +-- workflow.md                           # Script workflow spec
|   |
|   |-- security/
|   |   +-- workflow.md                           # Security agent spec
|   |
|   |-- seller_workflow/
|   |   +-- workflow.md                           # Seller workflow spec
|   |
|   |-- task_manager/                             # (placeholder -- empty)
|   |
|   |-- voice_vapi/
|   |   |-- fallback.ts                           # Voice fallback handler
|   |   +-- workflow.md                           # Voice/VAPI spec
|   |
|   |-- website/                                  # Next.js public website
|   |   |-- .dockerignore
|   |   |-- .env.local
|   |   |-- .env.production
|   |   |-- .gitignore
|   |   |-- Dockerfile
|   |   |-- README.md
|   |   |-- eslint.config.mjs
|   |   |-- next-env.d.ts
|   |   |-- next.config.ts
|   |   |-- package.json
|   |   |-- package-lock.json
|   |   |-- postcss.config.mjs
|   |   |-- tsconfig.json
|   |   |-- tsconfig.tsbuildinfo
|   |   |-- website.tar.gz                        # Build archive
|   |   |-- .next/                                # [Next.js build cache -- omitted]
|   |   |-- node_modules/                         # [dependencies -- omitted]
|   |   |
|   |   |-- public/
|   |   |   |-- LOGO_PLACEMENT_INSTRUCTIONS.md
|   |   |   |-- favicon.ico
|   |   |   |-- file.svg
|   |   |   |-- globe.svg
|   |   |   |-- grid.svg
|   |   |   |-- logo.png
|   |   |   |-- next.svg
|   |   |   |-- vercel.svg
|   |   |   +-- window.svg
|   |   |
|   |   +-- src/
|   |       |-- app/
|   |       |   |-- favicon.ico
|   |       |   |-- globals.css                   # Global Tailwind styles
|   |       |   |-- layout.tsx                    # Root layout
|   |       |   |-- loading.tsx                   # Loading skeleton
|   |       |   |-- not-found.tsx                 # 404 page
|   |       |   |-- page.tsx                      # Homepage
|   |       |   |-- sitemap.ts                    # Dynamic sitemap
|   |       |   |
|   |       |   |-- about/
|   |       |   |   +-- page.tsx
|   |       |   |-- agent/
|   |       |   |   |-- layout.tsx                # Agent portal layout
|   |       |   |   |-- appointments/
|   |       |   |   |   +-- page.tsx
|   |       |   |   |-- dashboard/
|   |       |   |   |   +-- page.tsx
|   |       |   |   |-- inventory/
|   |       |   |   |   +-- page.tsx
|   |       |   |   |-- leads/
|   |       |   |   |   +-- page.tsx
|   |       |   |   |-- login/
|   |       |   |   |   +-- page.tsx
|   |       |   |   +-- subscription/
|   |       |   |       +-- page.tsx
|   |       |   |-- blog/
|   |       |   |   |-- page.tsx
|   |       |   |   +-- [slug]/
|   |       |   |       +-- page.tsx
|   |       |   |-- compare/
|   |       |   |   +-- page.tsx
|   |       |   |-- contact/
|   |       |   |   +-- page.tsx
|   |       |   |-- faq/
|   |       |   |   +-- page.tsx
|   |       |   |-- join/
|   |       |   |   |-- page.tsx
|   |       |   |   |-- agent/
|   |       |   |   |   +-- page.tsx
|   |       |   |   +-- builder/
|   |       |   |       +-- page.tsx
|   |       |   |-- login/
|   |       |   |   +-- page.tsx
|   |       |   |-- post-project/
|   |       |   |   +-- page.tsx
|   |       |   |-- post-property/
|   |       |   |   +-- page.tsx
|   |       |   |-- privacy/
|   |       |   |   +-- page.tsx
|   |       |   |-- projects/
|   |       |   |   +-- [id]/
|   |       |   |       +-- page.tsx
|   |       |   |-- properties/
|   |       |   |   |-- page.tsx                  # Property search/listing
|   |       |   |   |-- [id]/
|   |       |   |   |   +-- page.tsx              # Property detail
|   |       |   |   +-- in/
|   |       |   |       +-- [city]/
|   |       |   |           |-- page.tsx          # City filter
|   |       |   |           +-- [locality]/
|   |       |   |               +-- page.tsx      # Locality filter
|   |       |   |-- services/
|   |       |   |   +-- page.tsx
|   |       |   |-- terms/
|   |       |   |   +-- page.tsx
|   |       |   |-- tools/
|   |       |   |   |-- area-converter/
|   |       |   |   |   +-- page.tsx
|   |       |   |   +-- emi-calculator/
|   |       |   |       +-- page.tsx
|   |       |   +-- wishlist/
|   |       |       +-- page.tsx
|   |       |
|   |       |-- components/
|   |       |   |-- CTASection.tsx
|   |       |   |-- ContactForm.tsx
|   |       |   |-- FeaturedProperties.tsx
|   |       |   |-- Footer.tsx
|   |       |   |-- Hero.tsx
|   |       |   |-- LeadCapture.tsx
|   |       |   |-- Navbar.tsx
|   |       |   |-- PropertyCard.tsx
|   |       |   |-- StatsCounter.tsx
|   |       |   |-- WhatsAppButton.tsx
|   |       |   |
|   |       |   |-- chat/
|   |       |   |   |-- AIChatModal.tsx
|   |       |   |   |-- ChatHeader.tsx
|   |       |   |   |-- ChatInput.tsx
|   |       |   |   |-- ChatMessages.tsx
|   |       |   |   +-- PropertyChatCard.tsx
|   |       |   |-- home/
|   |       |   |   |-- NewProjects.tsx
|   |       |   |   |-- PropertyCategories.tsx
|   |       |   |   |-- ServiceTiles.tsx
|   |       |   |   |-- Testimonials.tsx
|   |       |   |   |-- TrustBadges.tsx
|   |       |   |   +-- ValuePropositions.tsx
|   |       |   |-- login/
|   |       |   |   +-- UserLoginModal.tsx
|   |       |   |-- seo/
|   |       |   |   +-- JsonLd.tsx                # Structured data
|   |       |   |-- ui/
|   |       |   |   |-- Accordion.tsx
|   |       |   |   |-- Badge.tsx
|   |       |   |   |-- Button.tsx
|   |       |   |   |-- Card.tsx
|   |       |   |   |-- Carousel.tsx
|   |       |   |   |-- Container.tsx
|   |       |   |   |-- Input.tsx
|   |       |   |   |-- Select.tsx
|   |       |   |   |-- Skeleton.tsx
|   |       |   |   +-- Tabs.tsx
|   |       |   +-- workflow/
|   |       |       |-- StepConfirmation.tsx
|   |       |       |-- StepRenderer.tsx
|   |       |       +-- WorkflowProgress.tsx
|   |       |
|   |       |-- contexts/
|   |       |   +-- ThemeContext.tsx
|   |       |
|   |       +-- lib/
|   |           |-- api.ts                        # API client
|   |           |-- blog-data.ts                  # Static blog content
|   |           |-- seo.ts                        # SEO metadata helpers
|   |           |-- useMasterData.ts              # Master data hook
|   |           |-- useWorkflow.ts                # Workflow hook
|   |           +-- utils.ts                      # General utilities
|   |
|   +-- whatsapp/
|       |-- templates.json                        # WhatsApp template definitions
|       +-- workflow.md                           # WhatsApp workflow spec
|
|-- config/
|   |-- api_keys.json                             # API keys configuration
|   |-- env.json                                  # Environment config
|   +-- project.json                              # Project metadata
|
|-- deploy/
|   |-- DEPLOYMENT-GUIDE.md                       # Step-by-step deployment guide
|   |-- 01-setup-server.sh                        # Server provisioning script
|   |-- 02-setup-database.sh                      # Database setup script
|   +-- 03-configure-nginx.sh                     # Nginx configuration script
|
|-- docs/
|   |-- BRANDING_INTEGRATION_COMPLETE.md          # Branding integration report
|   |-- PAGES_AND_ROUTES.md                       # Pages and routes reference
|   |-- PROJECT_REPORT.md                         # Full project report
|   |-- PROJECT_STRUCTURE.md                      # This file
|   |-- WORK_COMPLETED_2026-02-14.md              # Work completed log
|   |-- decisions/
|   |   |-- DEC-001-buyer-tenant-terminology.md   # Architecture decision record
|   |   +-- DEC-002-inventory-api-contract.md     # Inventory API contract decision
|   |-- tasks/
|   |   |-- SCHEMA.json                           # Task schema definition
|   |   |-- TASK-000.json through TASK-057.json   # Task tracking files
|   |   |-- TASK-085.json through TASK-095.json
|   |   +-- TASK-116.json through TASK-130.json
|   +-- workflows/                                # (placeholder -- empty)
|
|-- pipeline/
|   |-- README.md                                 # Pipeline documentation
|   |-- BACKUP-NOW.bat                            # Windows backup trigger
|   |-- HEALTH-CHECK.bat                          # Windows health check trigger
|   |-- START-PIPELINE.bat                        # Windows pipeline trigger
|   |-- backup.sh                                 # Database/file backup script
|   |-- health-check.sh                           # Health check script
|   +-- watch-and-deploy.sh                       # File watcher auto-deploy
|
|-- src/                                          # (placeholder -- empty)
|
|-- COMPLETE-IMPLEMENTATION-STATUS.md
|-- DEPLOYMENT_GUIDE.md
|-- DEPLOYMENT_READY.md
|-- DEPLOYMENT_VERIFICATION.md
|-- GOOGLE_MAPS_SETUP.md
|-- IMPLEMENTATION_STATUS.md
|-- INVENTORY_WORKFLOW_REPORT.md
|-- MASTER_MANUAL.md
|-- PHASE-4-IMPLEMENTATION-SUMMARY.md
|-- PROJECT_AUDIT_REPORT.md
|-- PROJECT_KNOWLEDGE.md
|-- REALTY_PANDIT_FULL_AUDIT_2026.md
|-- REALTY_PANDIT_PROJECT_REPORT.md
|-- UPDATE-SERVER-README.md
|-- PUSH-UPDATE.bat
|-- deploy.sh
|-- deploy-now.sh
|-- deploy-to-server.sh
|-- docker-compose.yml
|-- push-update.sh
|-- push-update-scp.sh
|-- update-server.sh
+-- upload-to-server.sh
```

---

## 4. Directory Purposes

| Directory | Purpose |
|---|---|
| `.github/workflows/` | GitHub Actions CI/CD pipelines for backend and website |
| `agents/` | **Main source code directory** -- contains all sub-projects (backend, frontend, website, android, and agent specifications) |
| `agents/ai_automation/` | AI automation agent specification and workflow documentation |
| `agents/android/` | Kotlin/Jetpack Compose native Android staff app for field executives |
| `agents/backend/` | Express.js + TypeScript API server -- the core of the platform |
| `agents/buyer_workflow/` | Buyer journey workflow definition and entry point |
| `agents/connection_api/` | Connection/integration API workflow specification |
| `agents/dealer_workflow/` | Dealer/broker workflow specification |
| `agents/deployment/` | Deployment-specific Docker Compose and workflow docs |
| `agents/email/` | Email agent placeholder (functionality in backend services) |
| `agents/frontend/` | React + Vite admin dashboard SPA |
| `agents/logic_transfer/` | Logic transfer agent specification |
| `agents/master_inspector/` | Master inspector agent placeholder |
| `agents/script_workflow/` | Call scripts and script workflow definitions |
| `agents/security/` | Security agent specification |
| `agents/seller_workflow/` | Seller journey workflow specification |
| `agents/task_manager/` | Task manager agent placeholder |
| `agents/voice_vapi/` | Voice AI (VAPI) integration, fallback handler, and spec |
| `agents/website/` | Next.js public-facing property listing website |
| `agents/whatsapp/` | WhatsApp message templates and workflow specification |
| `config/` | Project-level configuration (API keys, environment, project metadata) |
| `deploy/` | Server provisioning and deployment automation scripts |
| `docs/` | Architecture decisions, task tracking, project reports |
| `docs/decisions/` | Architecture Decision Records (ADRs) |
| `docs/tasks/` | JSON-based task tracking system (TASK-000 through TASK-130) |
| `docs/workflows/` | Workflow documentation placeholder |
| `pipeline/` | CI/CD pipeline scripts, backup and health-check utilities |
| `src/` | Legacy/placeholder source directory (currently empty) |

---

## 5. Sub-Project Breakdown

### 5.1 Backend API -- `agents/backend/`

| Metric | Count |
|---|---|
| TypeScript source files (`src/**/*.ts`) | 155 |
| Total TS files (incl. prisma seeds, root scripts) | 160 |
| AI Agent modules (`src/agents/`) | 14 |
| API Route files (`src/routes/`) | 26 |
| Service modules (`src/services/`) | 42 |
| Middleware modules (`src/middleware/`) | 7 |
| Workflow definitions (`src/workflows/`) | 12 |
| Prisma migrations | 14 |
| Utility/script files (`src/scripts/`) | 17 |
| Test files (`src/__tests__/`) | 3 |

**Key subdirectories inside `agents/backend/src/`:**

| Directory | Files | Purpose |
|---|---|---|
| `agents/` | 14 | AI agent implementations (classifier, sales, marketing, inventory, etc.) |
| `config/` | 2 | Permission definitions, WhatsApp templates |
| `cron/` | 2 | Scheduled background jobs |
| `data/` | 1 | Static reference data (India geography) |
| `integrations/` | 3 | Third-party portal integrations (99acres, Housing.com, MagicBricks) |
| `jobs/` | 1 | Background job definitions |
| `middleware/` | 7 | Auth, rate limiting, caching, logging, error handling |
| `queues/` | 3 | BullMQ job queues and workers |
| `routes/` | 26 | REST API endpoint handlers |
| `scripts/` | 17 | Testing, seeding, migration, and diagnostic scripts |
| `services/` | 42 | Core business logic (AI, matching, WhatsApp, voice, auth, etc.) |
| `utils/` | 6 | Logger, Redis, circuit breaker, phone formatting |
| `validators/` | 4 | Request validation schemas |
| `workers/` | 1 | Background processing workers |
| `workflows/` | 12 | Workflow state machines (buyer, seller, builder, partner) |

---

### 5.2 Admin Dashboard -- `agents/frontend/`

| Metric | Count |
|---|---|
| Source files (`src/`) | 54 |
| Component files (`src/components/`) | 32 |
| Dashboard sub-components | 5 |
| Mobile-responsive components | 9 |
| Context providers | 2 |
| Custom hooks | 2 |

**Key subdirectories inside `agents/frontend/src/`:**

| Directory | Files | Purpose |
|---|---|---|
| `api/` | 1 | Axios HTTP client configuration |
| `assets/` | 1 | Static assets |
| `components/` | 23 | Main dashboard components (inventory, leads, calendar, etc.) |
| `components/dashboard/` | 5 | Analytics dashboard panels (lead sources, market trends, etc.) |
| `components/mobile/` | 9 | Mobile-optimized views |
| `contexts/` | 2 | Auth and theme context providers |
| `hooks/` | 2 | Custom React hooks (mobile detection, workflow) |
| `lib/` | 1 | API helper utilities |
| `utils/` | 1 | Export/download helpers |

---

### 5.3 Public Website -- `agents/website/`

| Metric | Count |
|---|---|
| Source files (`src/`) | 80 |
| Page routes (`src/app/`) | 33 |
| Shared components (`src/components/`) | 30 |
| UI primitives (`src/components/ui/`) | 10 |
| Library/utility files (`src/lib/`) | 6 |

**Key subdirectories inside `agents/website/src/`:**

| Directory | Files | Purpose |
|---|---|---|
| `app/` | 33 | Next.js App Router pages (home, properties, blog, agent portal, tools) |
| `app/agent/` | 7 | Partner agent portal (dashboard, leads, inventory, appointments) |
| `app/properties/` | 5 | Property listing and detail pages with dynamic city/locality routes |
| `app/blog/` | 2 | Blog listing and individual post pages |
| `app/tools/` | 2 | Utility tools (EMI calculator, area converter) |
| `components/` | 10 | Shared layout and feature components |
| `components/chat/` | 5 | AI chat modal and related components |
| `components/home/` | 6 | Homepage sections (categories, testimonials, trust badges) |
| `components/ui/` | 10 | Reusable UI primitives (Button, Card, Input, etc.) |
| `components/workflow/` | 3 | Multi-step workflow components |
| `components/seo/` | 1 | JSON-LD structured data |
| `components/login/` | 1 | User login modal |
| `contexts/` | 1 | Theme context |
| `lib/` | 6 | API client, SEO helpers, blog data, hooks, utilities |

---

### 5.4 Android Staff App -- `agents/android/`

| Metric | Count |
|---|---|
| Kotlin source files (`.kt`) | 36 |
| Resource files (XML, PNG) | 24 |
| Total source files (`app/src/`) | 60 |

**Key packages inside `com.realtypandit.staffapp`:**

| Package | Files | Purpose |
|---|---|---|
| `ai/review/` | 3 | AI call review (activity, screen, view model) |
| `call/detection/` | 1 | Automatic call detection service |
| `call/overlay/` | 2 | In-call overlay with lead info |
| `call/recording/` | 1 | Call recording functionality |
| `call/upload/` | 1 | Background call upload worker |
| `contacts/` | 4 | Contact list and profile screens with view models |
| `core/auth/` | 5 | Authentication (login, consent, auth manager) |
| `core/network/` | 3 | Retrofit API service and models |
| `core/permissions/` | 1 | Runtime permission management |
| `core/storage/` | 1 | Encrypted file storage |
| `dashboard/` | 2 | Main dashboard screen and view model |
| `data/local/` | 5 | Room database, DAOs, entities |
| `navigation/` | 1 | Jetpack Navigation component |
| `ui/theme/` | 2 | Material 3 theme and typography |

---

### 5.5 Agent Specification Directories

These directories contain workflow specifications (Markdown) and occasional configuration files that define the behavior of each logical AI agent:

| Directory | Files | Contents |
|---|---|---|
| `agents/ai_automation/` | 1 | `workflow.md` |
| `agents/buyer_workflow/` | 2 | `index.ts`, `workflow.md` |
| `agents/connection_api/` | 1 | `workflow.md` |
| `agents/dealer_workflow/` | 1 | `workflow.md` |
| `agents/deployment/` | 2 | `docker-compose.yml`, `workflow.md` |
| `agents/email/` | 0 | (empty placeholder) |
| `agents/logic_transfer/` | 1 | `workflow.md` |
| `agents/master_inspector/` | 0 | (empty placeholder) |
| `agents/script_workflow/` | 2 | `buyer_scripts.json`, `workflow.md` |
| `agents/security/` | 1 | `workflow.md` |
| `agents/seller_workflow/` | 1 | `workflow.md` |
| `agents/task_manager/` | 0 | (empty placeholder) |
| `agents/voice_vapi/` | 2 | `fallback.ts`, `workflow.md` |
| `agents/whatsapp/` | 2 | `templates.json`, `workflow.md` |

---

## 6. Configuration Files

### Root-Level Configuration

| File | Purpose |
|---|---|
| `docker-compose.yml` | Root Docker Compose for full-stack orchestration |
| `config/api_keys.json` | API key storage for third-party services |
| `config/env.json` | Environment variable configuration |
| `config/project.json` | Project metadata and settings |

### Backend Configuration (`agents/backend/`)

| File | Purpose |
|---|---|
| `.env` | Local environment variables |
| `.env.example` | Environment variable template |
| `.env.production` | Production environment variables |
| `.gitignore` | Git ignore rules |
| `.dockerignore` | Docker build ignore rules |
| `Dockerfile` | Docker container build definition |
| `ecosystem.config.js` | PM2 process manager configuration |
| `package.json` | Node.js dependencies and scripts |
| `tsconfig.json` | TypeScript compiler configuration |
| `vitest.config.ts` | Vitest test runner configuration |
| `prisma/schema.prisma` | Database schema (single source of truth) |

### Frontend Configuration (`agents/frontend/`)

| File | Purpose |
|---|---|
| `.env` | Local environment variables |
| `.env.example` | Environment variable template |
| `.env.production` | Production environment variables |
| `.gitignore` | Git ignore rules |
| `eslint.config.js` | ESLint configuration |
| `index.html` | SPA HTML entry point |
| `package.json` | Node.js dependencies and scripts |
| `tsconfig.json` | Root TypeScript config |
| `tsconfig.app.json` | App TypeScript config |
| `tsconfig.node.json` | Node/Vite TypeScript config |
| `vite.config.ts` | Vite bundler configuration |

### Website Configuration (`agents/website/`)

| File | Purpose |
|---|---|
| `.env.local` | Local environment variables |
| `.env.production` | Production environment variables |
| `.gitignore` | Git ignore rules |
| `.dockerignore` | Docker build ignore rules |
| `Dockerfile` | Docker container build definition |
| `eslint.config.mjs` | ESLint configuration |
| `next.config.ts` | Next.js framework configuration |
| `next-env.d.ts` | Next.js TypeScript declarations |
| `package.json` | Node.js dependencies and scripts |
| `postcss.config.mjs` | PostCSS / Tailwind CSS pipeline |
| `tsconfig.json` | TypeScript compiler configuration |

### Android Configuration (`agents/android/`)

| File | Purpose |
|---|---|
| `build.gradle` | Root Gradle build script |
| `app/build.gradle` | App-level Gradle build script |
| `gradle.properties` | Gradle properties |
| `settings.gradle` | Gradle settings (module definitions) |
| `local.properties` | Local SDK paths |
| `app/proguard-rules.pro` | ProGuard obfuscation rules |
| `app/src/main/AndroidManifest.xml` | Android app manifest |

### CI/CD Configuration (`.github/workflows/`)

| File | Purpose |
|---|---|
| `backend-ci.yml` | Backend continuous integration (build, lint, test) |
| `website-ci.yml` | Website continuous integration (build, lint) |

---

## 7. Documentation Files

### Root-Level Documentation (Markdown)

| File | Size | Description |
|---|---|---|
| `COMPLETE-IMPLEMENTATION-STATUS.md` | 35 KB | Comprehensive implementation status across all phases |
| `DEPLOYMENT_GUIDE.md` | 11 KB | Step-by-step deployment instructions |
| `DEPLOYMENT_READY.md` | 8 KB | Deployment readiness checklist |
| `DEPLOYMENT_VERIFICATION.md` | 10 KB | Post-deployment verification procedures |
| `GOOGLE_MAPS_SETUP.md` | 9 KB | Google Maps API setup and configuration guide |
| `IMPLEMENTATION_STATUS.md` | 23 KB | Feature implementation tracking |
| `INVENTORY_WORKFLOW_REPORT.md` | 66 KB | Detailed inventory workflow documentation |
| `MASTER_MANUAL.md` | 5 KB | Master operations manual |
| `PHASE-4-IMPLEMENTATION-SUMMARY.md` | 20 KB | Phase 4 implementation summary |
| `PROJECT_AUDIT_REPORT.md` | 22 KB | Full project audit report |
| `PROJECT_KNOWLEDGE.md` | 9 KB | Project knowledge base |
| `REALTY_PANDIT_FULL_AUDIT_2026.md` | 74 KB | Complete 2026 audit report |
| `REALTY_PANDIT_PROJECT_REPORT.md` | 47 KB | Comprehensive project report |
| `UPDATE-SERVER-README.md` | 4 KB | Server update instructions |

### Documentation in `docs/`

| File | Description |
|---|---|
| `docs/BRANDING_INTEGRATION_COMPLETE.md` | Branding integration completion report |
| `docs/PAGES_AND_ROUTES.md` | Full pages and routes reference |
| `docs/PROJECT_REPORT.md` | Detailed project report |
| `docs/PROJECT_STRUCTURE.md` | This file |
| `docs/WORK_COMPLETED_2026-02-14.md` | Work completed log for Feb 14, 2026 |
| `docs/decisions/DEC-001-buyer-tenant-terminology.md` | ADR: Buyer/tenant terminology standardization |
| `docs/decisions/DEC-002-inventory-api-contract.md` | ADR: Inventory API contract design |

### Deployment & Pipeline Documentation

| File | Description |
|---|---|
| `deploy/DEPLOYMENT-GUIDE.md` | Detailed server deployment guide |
| `pipeline/README.md` | Pipeline usage documentation |

### Shell Scripts (Deployment/Operations)

| File | Description |
|---|---|
| `deploy.sh` | Basic deployment script |
| `deploy-now.sh` | Immediate deployment script |
| `deploy-to-server.sh` | Full server deployment automation |
| `push-update.sh` | Push code updates to server |
| `push-update-scp.sh` | SCP-based code push |
| `update-server.sh` | Server update script |
| `upload-to-server.sh` | Upload artifacts to server |
| `PUSH-UPDATE.bat` | Windows batch wrapper for push-update |
| `deploy/01-setup-server.sh` | Server initial setup (Ubuntu, Node, PM2, etc.) |
| `deploy/02-setup-database.sh` | PostgreSQL + Redis setup |
| `deploy/03-configure-nginx.sh` | Nginx reverse proxy + SSL setup |

---

## 8. Task Tracking

The project uses a JSON-based task tracking system located in `docs/tasks/`. Each task is stored as an individual JSON file following the schema defined in `docs/tasks/SCHEMA.json`.

**Task file ranges present:**
- TASK-000 through TASK-057 (core tasks, 54 files)
- TASK-085 through TASK-095 (extended tasks, 11 files)
- TASK-116 through TASK-130 (latest tasks, 13 files)

**Total task files:** 78

---

## 9. Database Migrations Timeline

All Prisma migrations are stored in `agents/backend/prisma/migrations/`:

| Migration | Description |
|---|---|
| `20260206170857_init_ssot_v3` | Initial schema (SSOT v3) |
| `20260207055725_add_lead_scoring_final` | Lead scoring system |
| `20260209211207_add_auth_fields` | Authentication fields |
| `20260210050314_phase6_sessions_language` | Session and language support |
| `20260211113201_add_website_models` | Website-related models |
| `20260212000000_add_partner_agent_marketplace` | Partner agent marketplace (v1) |
| `20260212125820_add_partner_agent_marketplace` | Partner agent marketplace (v2) |
| `20260219000000_add_workflow_fields` | Workflow tracking fields |
| `20260222000000_add_video_urls_lead_reference` | Video URLs and lead references |
| `20260223000000_inventory_redesign_v2` | Inventory schema redesign |
| `20260224000000_add_geo_coordinates` | Geographic coordinates for properties |
| `20260224_add_campaign_templates` | Marketing campaign templates |
| `20260224_add_projects_tasks` | Project and task management models |
| `20260224_add_workflow_automation` | Workflow automation support |
