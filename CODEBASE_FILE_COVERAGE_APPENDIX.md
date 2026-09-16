# Appendix A — Complete Git-Tracked File Coverage Catalog

> **Snapshot:** 2026-09-16
> **Scope:** every file returned by `git ls-files` at generation time (3,027 files). This appendix is part of `CODEBASE_ENGINEERING_HANDOVER_AND_AUDIT.md`, section 6.

## What this catalog proves

Every tracked file has an explicit responsibility classification below. `Graphify status` says whether the current graph contains at least one node whose `source_file` equals the file; it is not a review-completeness score. Roles are path- and filename-derived for generated/vendor/document assets, and source-architecture-derived for the operationally critical runtime areas identified in the main audit. It does **not** assert that all 3,027 files were executed or line-by-line behavior-tested.

A `not linked` entry remains covered by this audit catalog. Common examples are migrations, configuration, static assets, third-party vendored files, Android resources, and generated browser-QA material, which often have no AST relationship for Graphify to represent.

## File-by-file coverage

| File | Subsystem | Responsibility | Graphify status |
|---|---|---|---|
| `.code-review-graphignore` | Repository configuration | Version-control or analysis ignore rules. | not linked |
| `.github/workflows/backend-ci.yml` | CI/CD | GitHub Actions workflow for Backend Ci checks, packaging, or release automation. | linked |
| `.github/workflows/website-ci.yml` | CI/CD | GitHub Actions workflow for Website Ci checks, packaging, or release automation. | linked |
| `.gitignore` | Repository configuration | Version-control or analysis ignore rules. | not linked |
| `.serena/.gitignore` | Developer tooling | Developer-agent configuration, memory, or workflow artifact for . | not linked |
| `.serena/project.yml` | Developer tooling | Developer-agent configuration, memory, or workflow artifact for Project. | not linked |
| `.superpowers/brainstorm/1725-1784181484/content/direction.html` | Developer tooling | Developer-agent configuration, memory, or workflow artifact for Direction. | not linked |
| `.superpowers/brainstorm/1725-1784181484/state/server-stopped` | Developer tooling | Developer-agent configuration, memory, or workflow artifact for Server Stopped. | not linked |
| `.superpowers/brainstorm/1763-1784183296/content/direction.html` | Developer tooling | Developer-agent configuration, memory, or workflow artifact for Direction. | not linked |
| `.superpowers/brainstorm/1763-1784183296/state/server-stopped` | Developer tooling | Developer-agent configuration, memory, or workflow artifact for Server Stopped. | not linked |
| `.superpowers/brainstorm/1763-1784183296/state/server.pid` | Developer tooling | Developer-agent configuration, memory, or workflow artifact for Server. | not linked |
| `COMPLETE-IMPLEMENTATION-STATUS.md` | Documentation | Repository documentation: COMPLETE IMPLEMENTATION STATUS. | linked |
| `DEPLOYMENT_GUIDE.md` | Documentation | Repository documentation: DEPLOYMENT GUIDE. | linked |
| `DEPLOYMENT_READY.md` | Documentation | Repository documentation: DEPLOYMENT READY. | linked |
| `DEPLOYMENT_VERIFICATION.md` | Documentation | Repository documentation: DEPLOYMENT VERIFICATION. | linked |
| `GOOGLE_MAPS_SETUP.md` | Documentation | Repository documentation: GOOGLE MAPS SETUP. | linked |
| `IMPLEMENTATION_STATUS.md` | Documentation | Repository documentation: IMPLEMENTATION STATUS. | linked |
| `INVENTORY_WORKFLOW_REPORT.md` | Documentation | Repository documentation: INVENTORY WORKFLOW REPORT. | linked |
| `MASTER_MANUAL.md` | Documentation | Repository documentation: MASTER MANUAL. | linked |
| `PHASE-4-IMPLEMENTATION-SUMMARY.md` | Documentation | Repository documentation: PHASE 4 IMPLEMENTATION SUMMARY. | linked |
| `PROJECT_AUDIT_REPORT.md` | Documentation | Repository documentation: PROJECT AUDIT REPORT. | linked |
| `PROJECT_KNOWLEDGE.md` | Documentation | Repository documentation: PROJECT KNOWLEDGE. | linked |
| `PUSH-UPDATE.bat` | Repository support | Repository configuration, script, data, or support artifact for PUSH UPDATE. | not linked |
| `REALTY_PANDIT_FULL_AUDIT_2026.md` | Documentation | Repository documentation: REALTY PANDIT FULL AUDIT 2026. | linked |
| `REALTY_PANDIT_PROJECT_REPORT.md` | Documentation | Repository documentation: REALTY PANDIT PROJECT REPORT. | linked |
| `UPDATE-SERVER-README.md` | Documentation | Repository documentation: UPDATE SERVER README. | linked |
| `agents/.code-review-graphignore` | Repository configuration | Version-control or analysis ignore rules. | not linked |
| `agents/ai_automation/workflow.md` | Documentation | Repository documentation: Workflow. | linked |
| `agents/analytics/run.js` | Repository support | Repository configuration, script, data, or support artifact for Run. | linked |
| `agents/android/.gitignore` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for . | not linked |
| `agents/android/README.md` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for README. | linked |
| `agents/android/app/build.gradle` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Build. | linked |
| `agents/android/app/proguard-rules.pro` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Proguard Rules. | not linked |
| `agents/android/app/src/main/AndroidManifest.xml` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Android Manifest. | not linked |
| `agents/android/app/src/main/res/drawable/ic_launcher_foreground.xml` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Ic Launcher Foreground. | not linked |
| `agents/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Ic Launcher. | not linked |
| `agents/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Ic Launcher Round. | not linked |
| `agents/android/app/src/main/res/mipmap-hdpi/ic_launcher.png` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Ic Launcher. | not linked |
| `agents/android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Ic Launcher Foreground. | not linked |
| `agents/android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Ic Launcher Round. | not linked |
| `agents/android/app/src/main/res/mipmap-mdpi/ic_launcher.png` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Ic Launcher. | not linked |
| `agents/android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Ic Launcher Foreground. | not linked |
| `agents/android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Ic Launcher Round. | not linked |
| `agents/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Ic Launcher. | not linked |
| `agents/android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Ic Launcher Foreground. | not linked |
| `agents/android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Ic Launcher Round. | not linked |
| `agents/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Ic Launcher. | not linked |
| `agents/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Ic Launcher Foreground. | not linked |
| `agents/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Ic Launcher Round. | not linked |
| `agents/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Ic Launcher. | not linked |
| `agents/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Ic Launcher Foreground. | not linked |
| `agents/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Ic Launcher Round. | not linked |
| `agents/android/app/src/main/res/values/colors.xml` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Colors. | not linked |
| `agents/android/app/src/main/res/values/strings.xml` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Strings. | not linked |
| `agents/android/app/src/main/res/values/themes.xml` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Themes. | not linked |
| `agents/android/app/src/main/res/xml/backup_rules.xml` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Backup Rules. | not linked |
| `agents/android/app/src/main/res/xml/data_extraction_rules.xml` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Data Extraction Rules. | not linked |
| `agents/android/build.gradle` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Build. | linked |
| `agents/android/gradle.properties` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Gradle. | not linked |
| `agents/android/gradle/wrapper/gradle-wrapper.jar` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Gradle Wrapper. | not linked |
| `agents/android/gradle/wrapper/gradle-wrapper.properties` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Gradle Wrapper. | not linked |
| `agents/android/gradlew` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Gradlew. | linked |
| `agents/android/gradlew.bat` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Gradlew. | not linked |
| `agents/android/local.properties.example` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Local Properties. | not linked |
| `agents/android/sentry.properties.example` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Sentry Properties. | not linked |
| `agents/android/settings.gradle` | Android staff app | Android/Kotlin, Gradle, manifest, resource, or build artifact for Settings. | linked |
| `agents/backend/.dockerignore` | Backend support | Backend configuration, deployment, fixture, or support artifact for . | not linked |
| `agents/backend/.env.example` | Backend support | Backend configuration, deployment, fixture, or support artifact for  Env. | not linked |
| `agents/backend/.gitignore` | Backend support | Backend configuration, deployment, fixture, or support artifact for . | not linked |
| `agents/backend/Dockerfile` | Backend support | Backend configuration, deployment, fixture, or support artifact for Dockerfile. | not linked |
| `agents/backend/assets/fonts/DejaVuSans-Bold.ttf` | Backend support | Backend configuration, deployment, fixture, or support artifact for Deja Vu Sans Bold. | not linked |
| `agents/backend/assets/fonts/DejaVuSans.ttf` | Backend support | Backend configuration, deployment, fixture, or support artifact for Deja Vu Sans. | not linked |
| `agents/backend/check-agent.js` | Backend support | Backend configuration, deployment, fixture, or support artifact for Check Agent. | linked |
| `agents/backend/check-agents.js` | Backend support | Backend configuration, deployment, fixture, or support artifact for Check Agents. | linked |
| `agents/backend/create-admin-prod.js` | Backend support | Backend configuration, deployment, fixture, or support artifact for Create Admin Prod. | linked |
| `agents/backend/create-admin.js` | Backend support | Backend configuration, deployment, fixture, or support artifact for Create Admin. | linked |
| `agents/backend/ecosystem.config.js` | Backend support | Backend configuration, deployment, fixture, or support artifact for Ecosystem Config. | linked |
| `agents/backend/list-admins.js` | Backend support | Backend configuration, deployment, fixture, or support artifact for List Admins. | linked |
| `agents/backend/package-lock.json` | Backend dependency metadata | Resolved backend dependency lockfile for reproducible installs. | not linked |
| `agents/backend/package.json` | Backend dependency metadata | Package manifest defining backend scripts and dependencies. | linked |
| `agents/backend/prisma/backfill-categories.ts` | Backend database | Prisma Backfill Categories database schema, migration, or seed support artifact. | linked |
| `agents/backend/prisma/backfill_media_promote.ts` | Backend database | Prisma Backfill Media Promote database schema, migration, or seed support artifact. | linked |
| `agents/backend/prisma/backfill_node_legacy.ts` | Backend database | Prisma Backfill Node Legacy database schema, migration, or seed support artifact. | linked |
| `agents/backend/prisma/backfill_taxonomy.ts` | Backend database | Prisma Backfill Taxonomy database schema, migration, or seed support artifact. | linked |
| `agents/backend/prisma/backfill_thumbnails.ts` | Backend database | Prisma Backfill Thumbnails database schema, migration, or seed support artifact. | linked |
| `agents/backend/prisma/clean_dead_media.ts` | Backend database | Prisma Clean Dead Media database schema, migration, or seed support artifact. | linked |
| `agents/backend/prisma/cleanup_field_catalog.ts` | Backend database | Prisma Cleanup Field Catalog database schema, migration, or seed support artifact. | linked |
| `agents/backend/prisma/data/taxonomy.seed.json` | Backend database | Prisma Taxonomy Seed database schema, migration, or seed support artifact. | not linked |
| `agents/backend/prisma/dedup_config_fields.ts` | Backend database | Prisma Dedup Config Fields database schema, migration, or seed support artifact. | linked |
| `agents/backend/prisma/migrate_classification.ts` | Backend database | Prisma Migrate Classification database schema, migration, or seed support artifact. | linked |
| `agents/backend/prisma/migrations/20260206170857_init_ssot_v3/migration.sql` | Backend database | Prisma migration artifact for 20260206170857 Init Ssot V3 schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260207055725_add_lead_scoring_final/migration.sql` | Backend database | Prisma migration artifact for 20260207055725 Add Lead Scoring Final schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260209211207_add_auth_fields/migration.sql` | Backend database | Prisma migration artifact for 20260209211207 Add Auth Fields schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260210050314_phase6_sessions_language/migration.sql` | Backend database | Prisma migration artifact for 20260210050314 Phase6 Sessions Language schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260211113201_add_website_models/migration.sql` | Backend database | Prisma migration artifact for 20260211113201 Add Website Models schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260212000000_add_partner_agent_marketplace/migration.sql` | Backend database | Prisma migration artifact for 20260212000000 Add Partner Agent Marketplace schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260212125820_add_partner_agent_marketplace/migration.sql` | Backend database | Prisma migration artifact for 20260212125820 Add Partner Agent Marketplace schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260219000000_add_workflow_fields/migration.sql` | Backend database | Prisma migration artifact for 20260219000000 Add Workflow Fields schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260222000000_add_video_urls_lead_reference/migration.sql` | Backend database | Prisma migration artifact for 20260222000000 Add Video Urls Lead Reference schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260223000000_inventory_redesign_v2/migration.sql` | Backend database | Prisma migration artifact for 20260223000000 Inventory Redesign V2 schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260224000000_add_geo_coordinates/migration.sql` | Backend database | Prisma migration artifact for 20260224000000 Add Geo Coordinates schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260224_add_campaign_templates/migration.sql` | Backend database | Prisma migration artifact for 20260224 Add Campaign Templates schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260224_add_projects_tasks/migration.sql` | Backend database | Prisma migration artifact for 20260224 Add Projects Tasks schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260224_add_workflow_automation/migration.sql` | Backend database | Prisma migration artifact for 20260224 Add Workflow Automation schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260304000000_add_builder_flat_back_facing/migration.sql` | Backend database | Prisma migration artifact for 20260304000000 Add Builder Flat Back Facing schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260304100000_add_buyer_demand_fields/migration.sql` | Backend database | Prisma migration artifact for 20260304100000 Add Buyer Demand Fields schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260306000000_add_sub_locality/migration.sql` | Backend database | Prisma migration artifact for 20260306000000 Add Sub Locality schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260306100000_add_inventory_counter/migration.sql` | Backend database | Prisma migration artifact for 20260306100000 Add Inventory Counter schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260306200000_add_display_id_enrichment/migration.sql` | Backend database | Prisma migration artifact for 20260306200000 Add Display Id Enrichment schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260314000000_add_slug_field/migration.sql` | Backend database | Prisma migration artifact for 20260314000000 Add Slug Field schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260319000000_add_notification_preferences/migration.sql` | Backend database | Prisma migration artifact for 20260319000000 Add Notification Preferences schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260403000000_add_agent_personal_email/migration.sql` | Backend database | Prisma migration artifact for 20260403000000 Add Agent Personal Email schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260409000000_add_renovated_to_inventory/migration.sql` | Backend database | Prisma migration artifact for 20260409000000 Add Renovated To Inventory schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260409000001_add_ownership_transferred_action/migration.sql` | Backend database | Prisma migration artifact for 20260409000001 Add Ownership Transferred Action schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260411_contact_refactor/migration.sql` | Backend database | Prisma migration artifact for 20260411 Contact Refactor schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260417000000_partner_ownership/migration.sql` | Backend database | Prisma migration artifact for 20260417000000 Partner Ownership schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260419_agent_gender_language/migration.sql` | Backend database | Prisma migration artifact for 20260419 Agent Gender Language schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260424000000_pipeline_stage_unification/migration.sql` | Backend database | Prisma migration artifact for 20260424000000 Pipeline Stage Unification schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260505000000_add_deal_area_fields/migration.sql` | Backend database | Prisma migration artifact for 20260505000000 Add Deal Area Fields schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260524000000_taxonomy_foundation/migration.sql` | Backend database | Prisma migration artifact for 20260524000000 Taxonomy Foundation schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260525000000_taxonomy_legacy_map/migration.sql` | Backend database | Prisma migration artifact for 20260525000000 Taxonomy Legacy Map schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260528220351_drop_deprecated_inventory_columns/migration.sql` | Backend database | Prisma migration artifact for 20260528220351 Drop Deprecated Inventory Columns schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260529120248_add_demand_taxonomy_node_id_and_schema_values/migration.sql` | Backend database | Prisma migration artifact for 20260529120248 Add Demand Taxonomy Node Id And Schema Values schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260529153711_drop_legacy_demand_columns/migration.sql` | Backend database | Prisma migration artifact for 20260529153711 Drop Legacy Demand Columns schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260610120000_add_pre_rented_columns/migration.sql` | Backend database | Prisma migration artifact for 20260610120000 Add Pre Rented Columns schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260625210449_add_portal_subuser_emails/migration.sql` | Backend database | Prisma migration artifact for 20260625210449 Add Portal Subuser Emails schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260627002438_add_floor_label_display_floor/migration.sql` | Backend database | Prisma migration artifact for 20260627002438 Add Floor Label Display Floor schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260628135019_add_roof_rights/migration.sql` | Backend database | Prisma migration artifact for 20260628135019 Add Roof Rights schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260713000000_partner_teams/migration.sql` | Backend database | Prisma migration artifact for 20260713000000 Partner Teams schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260716000000_add_targets/migration.sql` | Backend database | Prisma migration artifact for 20260716000000 Add Targets schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260717000000_add_contact_assignment_method/migration.sql` | Backend database | Prisma migration artifact for 20260717000000 Add Contact Assignment Method schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260722190000_add_contacts_opted_out_at/migration.sql` | Backend database | Prisma migration artifact for 20260722190000 Add Contacts Opted Out At schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260729000000_add_commercial_use/migration.sql` | Backend database | Prisma migration artifact for 20260729000000 Add Commercial Use schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260731000000_add_contact_shared_with_ids/migration.sql` | Backend database | Prisma migration artifact for 20260731000000 Add Contact Shared With Ids schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260807190000_add_contact_last_wa_inbound_index/migration.sql` | Backend database | Prisma migration artifact for 20260807190000 Add Contact Last Wa Inbound Index schema evolution. | not linked |
| `agents/backend/prisma/migrations/20260807200000_whatsapp_message_attribution/migration.sql` | Backend database | Prisma migration artifact for 20260807200000 Whatsapp Message Attribution schema evolution. | not linked |
| `agents/backend/prisma/schema.prisma` | Backend database | Authoritative Prisma data model, relations, enums, and database-client generation input. | not linked |
| `agents/backend/prisma/seed.ts` | Backend database | Prisma Seed database schema, migration, or seed support artifact. | linked |
| `agents/backend/prisma/seed_flat_types.ts` | Backend database | Prisma Seed Flat Types database schema, migration, or seed support artifact. | linked |
| `agents/backend/prisma/seed_master.ts` | Backend database | Prisma Seed Master database schema, migration, or seed support artifact. | linked |
| `agents/backend/prisma/seed_taxonomy.ts` | Backend database | Prisma Seed Taxonomy database schema, migration, or seed support artifact. | linked |
| `agents/backend/reset-all-admin-passwords.js` | Backend support | Backend configuration, deployment, fixture, or support artifact for Reset All Admin Passwords. | linked |
| `agents/backend/scripts/backfill-inventory-orphans.ts` | Backend support | Backend configuration, deployment, fixture, or support artifact for Backfill Inventory Orphans. | linked |
| `agents/backend/scripts/backfill-missed-callback-tasks.ts` | Backend support | Backend configuration, deployment, fixture, or support artifact for Backfill Missed Callback Tasks. | linked |
| `agents/backend/scripts/backfill-partner-agent-orphans.ts` | Backend support | Backend configuration, deployment, fixture, or support artifact for Backfill Partner Agent Orphans. | linked |
| `agents/backend/scripts/backfill_bhk_from_slug.ts` | Backend support | Backend configuration, deployment, fixture, or support artifact for Backfill Bhk From Slug. | linked |
| `agents/backend/scripts/backfill_last_wa_inbound.ts` | Backend support | Backend configuration, deployment, fixture, or support artifact for Backfill Last Wa Inbound. | linked |
| `agents/backend/scripts/backfill_referral_partner_phone.sql` | Backend support | Backend configuration, deployment, fixture, or support artifact for Backfill Referral Partner Phone. | not linked |
| `agents/backend/scripts/callback-sla-report.ts` | Backend support | Backend configuration, deployment, fixture, or support artifact for Callback Sla Report. | linked |
| `agents/backend/scripts/categorize-unknown-contacts.ts` | Backend support | Backend configuration, deployment, fixture, or support artifact for Categorize Unknown Contacts. | linked |
| `agents/backend/scripts/cleanup-deactivation-orphans.ts` | Backend support | Backend configuration, deployment, fixture, or support artifact for Cleanup Deactivation Orphans. | linked |
| `agents/backend/scripts/deploy_approved_templates.ts` | Backend support | Backend configuration, deployment, fixture, or support artifact for Deploy Approved Templates. | linked |
| `agents/backend/scripts/fix_owner_phones.js` | Backend support | Backend configuration, deployment, fixture, or support artifact for Fix Owner Phones. | linked |
| `agents/backend/scripts/merge_duplicate_contacts.ts` | Backend support | Backend configuration, deployment, fixture, or support artifact for Merge Duplicate Contacts. | linked |
| `agents/backend/scripts/migrate-lead-status-new-to-cold.ts` | Backend support | Backend configuration, deployment, fixture, or support artifact for Migrate Lead Status New To Cold. | linked |
| `agents/backend/scripts/recover_99acres_gap.ts` | Backend support | Backend configuration, deployment, fixture, or support artifact for Recover 99acres Gap. | linked |
| `agents/backend/scripts/report_implausible_specs.ts` | Backend support | Backend configuration, deployment, fixture, or support artifact for Report Implausible Specs. | linked |
| `agents/backend/scripts/retrigger_stuck_deals.ts` | Backend support | Backend configuration, deployment, fixture, or support artifact for Retrigger Stuck Deals. | linked |
| `agents/backend/scripts/social_backlog.ts` | Backend support | Backend configuration, deployment, fixture, or support artifact for Social Backlog. | linked |
| `agents/backend/scripts/submit_improved_templates.ts` | Backend support | Backend configuration, deployment, fixture, or support artifact for Submit Improved Templates. | linked |
| `agents/backend/scripts/submit_meta_templates.js` | Backend support | Backend configuration, deployment, fixture, or support artifact for Submit Meta Templates. | linked |
| `agents/backend/scripts/test_share_all.ts` | Backend support | Backend configuration, deployment, fixture, or support artifact for Test Share All. | linked |
| `agents/backend/scripts/write-release.sh` | Backend support | Backend configuration, deployment, fixture, or support artifact for Write Release. | linked |
| `agents/backend/send_test_emails.ts` | Backend support | Backend configuration, deployment, fixture, or support artifact for Send Test Emails. | linked |
| `agents/backend/src/__tests__/alerts.test.ts` | Backend application | Backend module for Alerts Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/analytics_scope.test.ts` | Backend application | Backend module for Analytics Scope Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/app.test.ts` | Backend application | Backend module for App Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/budget_sanity.test.ts` | Backend application | Backend module for Budget Sanity Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/capture_route_error.test.ts` | Backend application | Backend module for Capture Route Error Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/commission_service.test.ts` | Backend application | Backend module for Commission Service Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/coordination_menu.test.ts` | Backend application | Backend module for Coordination Menu Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/ctwa_attribution.test.ts` | Backend application | Backend module for Ctwa Attribution Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/customer_tools_permission.test.ts` | Backend application | Backend module for Customer Tools Permission Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/deal_search.test.ts` | Backend application | Backend module for Deal Search Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/distribution.test.ts` | Backend application | Backend module for Distribution Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/ensure_deal_multi_requirement.test.ts` | Backend application | Backend module for Ensure Deal Multi Requirement Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/frustration.test.ts` | Backend application | Backend module for Frustration Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/gci.test.ts` | Backend application | Backend module for Gci Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/internal_tools.test.ts` | Backend application | Backend module for Internal Tools Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/inventory_math.test.ts` | Backend application | Backend module for Inventory Math Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/inventory_search.test.ts` | Backend application | Backend module for Inventory Search Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/inventory_to_demand.test.ts` | Backend application | Backend module for Inventory To Demand Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/lead_recycler.test.ts` | Backend application | Backend module for Lead Recycler Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/menu_choice.test.ts` | Backend application | Backend module for Menu Choice Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/menu_loop_guard.test.ts` | Backend application | Backend module for Menu Loop Guard Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/normalize_phone.test.ts` | Backend application | Backend module for Normalize Phone Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/ownership_service.test.ts` | Backend application | Backend module for Ownership Service Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/panditji_daily_briefing.test.ts` | Backend application | Backend module for Panditji Daily Briefing Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/parse_lead_location.test.ts` | Backend application | Backend module for Parse Lead Location Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/partner_auto_create.test.ts` | Backend application | Backend module for Partner Auto Create Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/pdf_brochure.test.ts` | Backend application | Backend module for Pdf Brochure Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/requirement_capture.test.ts` | Backend application | Backend module for Requirement Capture Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/resolve_agent_by_email.test.ts` | Backend application | Backend module for Resolve Agent By Email Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/sanitization_service.test.ts` | Backend application | Backend module for Sanitization Service Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/scoring.test.ts` | Backend application | Backend module for Scoring Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/setup.ts` | Backend application | Backend module for Setup application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/share_outcome.test.ts` | Backend application | Backend module for Share Outcome Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/share_recognition.test.ts` | Backend application | Backend module for Share Recognition Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/share_to_client_guard.test.ts` | Backend application | Backend module for Share To Client Guard Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/specs_filter.test.ts` | Backend application | Backend module for Specs Filter Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/speed_to_lead.test.ts` | Backend application | Backend module for Speed To Lead Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/supply_intent.test.ts` | Backend application | Backend module for Supply Intent Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/taxonomy_filter.test.ts` | Backend application | Backend module for Taxonomy Filter Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/team_metrics.test.ts` | Backend application | Backend module for Team Metrics Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/tokenized_search.test.ts` | Backend application | Backend module for Tokenized Search Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/tool_language.test.ts` | Backend application | Backend module for Tool Language Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/tool_permission.test.ts` | Backend application | Backend module for Tool Permission Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/transition_noop.test.ts` | Backend application | Backend module for Transition Noop Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/validators.test.ts` | Backend application | Backend module for Validators Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/visit_availability.test.ts` | Backend application | Backend module for Visit Availability Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/visit_schedule.test.ts` | Backend application | Backend module for Visit Schedule Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/voice_service.test.ts` | Backend application | Backend module for Voice Service Test application behavior or infrastructure. | linked |
| `agents/backend/src/__tests__/webhook_calendar.test.ts` | Backend application | Backend module for Webhook Calendar Test application behavior or infrastructure. | linked |
| `agents/backend/src/agents/admin_agent.ts` | Backend application | Backend module for Admin Agent application behavior or infrastructure. | linked |
| `agents/backend/src/agents/audit_agent.ts` | Backend application | Backend module for Audit Agent application behavior or infrastructure. | linked |
| `agents/backend/src/agents/classifier_agent.ts` | Backend application | Backend module for Classifier Agent application behavior or infrastructure. | linked |
| `agents/backend/src/agents/coordination_agent.ts` | Backend application | Backend module for Coordination Agent application behavior or infrastructure. | linked |
| `agents/backend/src/agents/index.ts` | Backend application | Backend module for Index application behavior or infrastructure. | linked |
| `agents/backend/src/agents/inventory_agent.ts` | Backend application | Backend module for Inventory Agent application behavior or infrastructure. | linked |
| `agents/backend/src/agents/marketing_agent.ts` | Backend application | Backend module for Marketing Agent application behavior or infrastructure. | linked |
| `agents/backend/src/agents/matching_agent.ts` | Backend application | Backend module for Matching Agent application behavior or infrastructure. | linked |
| `agents/backend/src/agents/notification_agent.ts` | Backend application | Backend module for Notification Agent application behavior or infrastructure. | linked |
| `agents/backend/src/agents/partner_agent.ts` | Backend application | Backend module for Partner Agent application behavior or infrastructure. | linked |
| `agents/backend/src/agents/prompt_engineer_agent.ts` | Backend application | Backend module for Prompt Engineer Agent application behavior or infrastructure. | linked |
| `agents/backend/src/agents/qa_agent.ts` | Backend application | Backend module for Qa Agent application behavior or infrastructure. | linked |
| `agents/backend/src/agents/sales_agent.ts` | Backend application | Backend module for Sales Agent application behavior or infrastructure. | linked |
| `agents/backend/src/agents/security_agent.ts` | Backend application | Backend module for Security Agent application behavior or infrastructure. | linked |
| `agents/backend/src/agents/types.ts` | Backend application | Backend module for Types application behavior or infrastructure. | linked |
| `agents/backend/src/app.ts` | Backend application | Express application composition: middleware, routes, static assets, error handling, and health behavior. | linked |
| `agents/backend/src/config/notification_events.ts` | Backend application | Backend module for Notification Events application behavior or infrastructure. | linked |
| `agents/backend/src/config/permissions.ts` | Backend application | Backend module for Permissions application behavior or infrastructure. | linked |
| `agents/backend/src/config/whatsapp_templates.ts` | Backend application | Backend module for Whatsapp Templates application behavior or infrastructure. | linked |
| `agents/backend/src/cron/ai_boss_jobs.ts` | Backend application | Backend module for Ai Boss Jobs application behavior or infrastructure. | linked |
| `agents/backend/src/cron/qa_daily_jobs.ts` | Backend application | Backend module for Qa Daily Jobs application behavior or infrastructure. | linked |
| `agents/backend/src/data/india_geo.ts` | Backend application | Backend module for India Geo application behavior or infrastructure. | linked |
| `agents/backend/src/db.ts` | Backend application | Prisma client setup and global database extensions/hooks. | linked |
| `agents/backend/src/instrument.ts` | Backend application | Observability initialization and sensitive-data scrubbing before application imports. | linked |
| `agents/backend/src/integrations/99acres.ts` | Backend application | Backend module for 99acres application behavior or infrastructure. | linked |
| `agents/backend/src/integrations/facebook.ts` | Backend application | Backend module for Facebook application behavior or infrastructure. | linked |
| `agents/backend/src/integrations/housing.ts` | Backend application | Backend module for Housing application behavior or infrastructure. | linked |
| `agents/backend/src/integrations/magicbricks.ts` | Backend application | Backend module for Magicbricks application behavior or infrastructure. | linked |
| `agents/backend/src/jobs/cleanup_uploads.ts` | Backend application | Backend module for Cleanup Uploads application behavior or infrastructure. | linked |
| `agents/backend/src/middleware/agent_auth.ts` | Backend middleware | Express middleware for Agent Auth request policy, security, or cross-cutting behavior. | linked |
| `agents/backend/src/middleware/apikey.ts` | Backend middleware | Express middleware for Apikey request policy, security, or cross-cutting behavior. | linked |
| `agents/backend/src/middleware/auth.ts` | Backend middleware | Express middleware for Auth request policy, security, or cross-cutting behavior. | linked |
| `agents/backend/src/middleware/cache.ts` | Backend middleware | Express middleware for Cache request policy, security, or cross-cutting behavior. | linked |
| `agents/backend/src/middleware/contact_visibility.ts` | Backend middleware | Express middleware for Contact Visibility request policy, security, or cross-cutting behavior. | linked |
| `agents/backend/src/middleware/csrf.ts` | Backend middleware | Express middleware for Csrf request policy, security, or cross-cutting behavior. | linked |
| `agents/backend/src/middleware/error_handler.ts` | Backend middleware | Express middleware for Error Handler request policy, security, or cross-cutting behavior. | linked |
| `agents/backend/src/middleware/rate_limit.ts` | Backend middleware | Express middleware for Rate Limit request policy, security, or cross-cutting behavior. | linked |
| `agents/backend/src/middleware/request_logger.ts` | Backend middleware | Express middleware for Request Logger request policy, security, or cross-cutting behavior. | linked |
| `agents/backend/src/middleware/require_super_boss.ts` | Backend middleware | Express middleware for Require Super Boss request policy, security, or cross-cutting behavior. | linked |
| `agents/backend/src/middleware/verify_meta_signature.ts` | Backend middleware | Express middleware for Verify Meta Signature request policy, security, or cross-cutting behavior. | linked |
| `agents/backend/src/queues/connection.ts` | Backend async jobs | BullMQ queue, worker, or scheduler module for Connection asynchronous processing. | linked |
| `agents/backend/src/queues/index.ts` | Backend async jobs | BullMQ queue, worker, or scheduler module for Index asynchronous processing. | linked |
| `agents/backend/src/queues/workers/scheduled_worker.ts` | Backend async jobs | BullMQ queue, worker, or scheduler module for Scheduled Worker asynchronous processing. | linked |
| `agents/backend/src/queues/workers/social_inbound.ts` | Backend async jobs | BullMQ queue, worker, or scheduler module for Social Inbound asynchronous processing. | linked |
| `agents/backend/src/queues/workers/whatsapp_inbound.ts` | Backend async jobs | BullMQ queue, worker, or scheduler module for Whatsapp Inbound asynchronous processing. | linked |
| `agents/backend/src/routes/agent.ts` | Backend HTTP API | Express route module for the Agent API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/agent_dashboard.ts` | Backend HTTP API | Express route module for the Agent Dashboard API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/agent_leads.ts` | Backend HTTP API | Express route module for the Agent Leads API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/ai_chat.ts` | Backend HTTP API | Express route module for the Ai Chat API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/analytics.ts` | Backend HTTP API | Express route module for the Analytics API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/api.ts` | Backend HTTP API | Express route module for the Api API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/auth.ts` | Backend HTTP API | Express route module for the Auth API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/auth_otp.ts` | Backend HTTP API | Express route module for the Auth Otp API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/builder.ts` | Backend HTTP API | Express route module for the Builder API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/calendar.ts` | Backend HTTP API | Express route module for the Calendar API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/chat_workflow.ts` | Backend HTTP API | Express route module for the Chat Workflow API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/classification.ts` | Backend HTTP API | Express route module for the Classification API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/deals.ts` | Backend HTTP API | Express route module for the Deals API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/email.ts` | Backend HTTP API | Express route module for the Email API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/external_leads.ts` | Backend HTTP API | Express route module for the External Leads API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/integrations.ts` | Backend HTTP API | Express route module for the Integrations API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/internal_tools.ts` | Backend HTTP API | Express route module for the Internal Tools API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/inventory.ts` | Backend HTTP API | Express route module for the Inventory API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/leads.ts` | Backend HTTP API | Express route module for the Leads API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/marketing.ts` | Backend HTTP API | Express route module for the Marketing API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/master.ts` | Backend HTTP API | Express route module for the Master API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/notifications.ts` | Backend HTTP API | Express route module for the Notifications API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/omnidim.ts` | Backend HTTP API | Express route module for the Omnidim API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/partner_team.ts` | Backend HTTP API | Express route module for the Partner Team API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/payments.ts` | Backend HTTP API | Express route module for the Payments API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/public.ts` | Backend HTTP API | Express route module for the Public API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/reports.ts` | Backend HTTP API | Express route module for the Reports API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/staff_calls.ts` | Backend HTTP API | Express route module for the Staff Calls API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/tasks.ts` | Backend HTTP API | Express route module for the Tasks API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/taxonomy.ts` | Backend HTTP API | Express route module for the Taxonomy API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/team.ts` | Backend HTTP API | Express route module for the Team API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/transactions.ts` | Backend HTTP API | Express route module for the Transactions API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/user_auth.ts` | Backend HTTP API | Express route module for the User Auth API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/webhooks.ts` | Backend HTTP API | Express route module for the Webhooks API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/workflow.ts` | Backend HTTP API | Express route module for the Workflow API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/workflow_tasks.ts` | Backend HTTP API | Express route module for the Workflow Tasks API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/routes/workflows.ts` | Backend HTTP API | Express route module for the Workflows API surface, request handling, and domain endpoint wiring. | linked |
| `agents/backend/src/scripts/_redistrib_run.ts` | Backend application | Backend module for  Redistrib Run application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/backfill-slugs.ts` | Backend application | Backend module for Backfill Slugs application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/backfill_deal_sync.ts` | Backend application | Backend module for Backfill Deal Sync application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/geocode-properties.ts` | Backend application | Backend module for Geocode Properties application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/migrate_partner_to_owner.ts` | Backend application | Backend module for Migrate Partner To Owner application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/seed_buyer.ts` | Backend application | Backend module for Seed Buyer application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/send_all_templates_test.mjs` | Backend application | Backend module for Send All Templates Test application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/simulate_voice_webhook.ts` | Backend application | Backend module for Simulate Voice Webhook application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/simulate_webhook.ts` | Backend application | Backend module for Simulate Webhook application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/submit_brochure_template.js` | Backend application | Backend module for Submit Brochure Template application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/submit_missing5.mjs` | Backend application | Backend module for Submit Missing5 application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/submit_pipeline_templates.ts` | Backend application | Backend module for Submit Pipeline Templates application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/submit_pipeline_templates_v2.mjs` | Backend application | Backend module for Submit Pipeline Templates V2 application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/submit_property_templates_v5.js` | Backend application | Backend module for Submit Property Templates V5 application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/system_health_check.ts` | Backend application | Backend module for System Health Check application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/test_inventory_flow.ts` | Backend application | Backend module for Test Inventory Flow application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/test_lead_score.ts` | Backend application | Backend module for Test Lead Score application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/test_llm.ts` | Backend application | Backend module for Test Llm application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/test_matching.ts` | Backend application | Backend module for Test Matching application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/test_media_inventory.ts` | Backend application | Backend module for Test Media Inventory application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/test_outbound.ts` | Backend application | Backend module for Test Outbound application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/test_polish.ts` | Backend application | Backend module for Test Polish application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/test_scheduler.ts` | Backend application | Backend module for Test Scheduler application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/test_workflows.ts` | Backend application | Backend module for Test Workflows application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/verify_db.ts` | Backend application | Backend module for Verify Db application behavior or infrastructure. | linked |
| `agents/backend/src/scripts/verify_db_call_log.ts` | Backend application | Backend module for Verify Db Call Log application behavior or infrastructure. | linked |
| `agents/backend/src/server.ts` | Backend application | Node/Express process entry point: environment validation, listener ownership, worker startup, and graceful shutdown. | linked |
| `agents/backend/src/services/agent_auth.ts` | Backend domain service | Backend service module implementing Agent Auth domain operations and integrations. | linked |
| `agents/backend/src/services/ai_boss.ts` | Backend domain service | Backend service module implementing Ai Boss domain operations and integrations. | linked |
| `agents/backend/src/services/alerts.ts` | Backend domain service | Backend service module implementing Alerts domain operations and integrations. | linked |
| `agents/backend/src/services/analytics_scope.ts` | Backend domain service | Backend service module implementing Analytics Scope domain operations and integrations. | linked |
| `agents/backend/src/services/assign_contact.ts` | Backend domain service | Backend service module implementing Assign Contact domain operations and integrations. | linked |
| `agents/backend/src/services/audio_storage.ts` | Backend domain service | Backend service module implementing Audio Storage domain operations and integrations. | linked |
| `agents/backend/src/services/audit_logger.ts` | Backend domain service | Backend service module implementing Audit Logger domain operations and integrations. | linked |
| `agents/backend/src/services/auth.ts` | Backend domain service | Backend service module implementing Auth domain operations and integrations. | linked |
| `agents/backend/src/services/behavior_auditor.ts` | Backend domain service | Backend service module implementing Behavior Auditor domain operations and integrations. | linked |
| `agents/backend/src/services/calendar.ts` | Backend domain service | Backend service module implementing Calendar domain operations and integrations. | linked |
| `agents/backend/src/services/call_extractor.ts` | Backend domain service | Backend service module implementing Call Extractor domain operations and integrations. | linked |
| `agents/backend/src/services/catalog_sync.ts` | Backend domain service | Backend service module implementing Catalog Sync domain operations and integrations. | linked |
| `agents/backend/src/services/chat_handler.ts` | Backend domain service | Backend service module implementing Chat Handler domain operations and integrations. | linked |
| `agents/backend/src/services/commission.ts` | Backend domain service | Backend service module implementing Commission domain operations and integrations. | linked |
| `agents/backend/src/services/commission_service.ts` | Backend domain service | Backend service module implementing Commission Service domain operations and integrations. | linked |
| `agents/backend/src/services/contact_identifier.ts` | Backend domain service | Backend service module implementing Contact Identifier domain operations and integrations. | linked |
| `agents/backend/src/services/contact_identity.ts` | Backend domain service | Backend service module implementing Contact Identity domain operations and integrations. | linked |
| `agents/backend/src/services/ctwa_attribution.ts` | Backend domain service | Backend service module implementing Ctwa Attribution domain operations and integrations. | linked |
| `agents/backend/src/services/date_parser.ts` | Backend domain service | Backend service module implementing Date Parser domain operations and integrations. | linked |
| `agents/backend/src/services/deal_notifications.ts` | Backend domain service | Backend service module implementing Deal Notifications domain operations and integrations. | linked |
| `agents/backend/src/services/deal_reminder.ts` | Backend domain service | Backend service module implementing Deal Reminder domain operations and integrations. | linked |
| `agents/backend/src/services/deal_service.ts` | Backend domain service | Backend service module implementing Deal Service domain operations and integrations. | linked |
| `agents/backend/src/services/deal_visibility.ts` | Backend domain service | Backend service module implementing Deal Visibility domain operations and integrations. | linked |
| `agents/backend/src/services/dealer.ts` | Backend domain service | Backend service module implementing Dealer domain operations and integrations. | linked |
| `agents/backend/src/services/decision_engine.ts` | Backend domain service | Backend service module implementing Decision Engine domain operations and integrations. | linked |
| `agents/backend/src/services/demand_classifier.ts` | Backend domain service | Backend service module implementing Demand Classifier domain operations and integrations. | linked |
| `agents/backend/src/services/disambiguation_router.ts` | Backend domain service | Backend service module implementing Disambiguation Router domain operations and integrations. | linked |
| `agents/backend/src/services/email_lead_parser.ts` | Backend domain service | Backend service module implementing Email Lead Parser domain operations and integrations. | linked |
| `agents/backend/src/services/email_provisioner.ts` | Backend domain service | Backend service module implementing Email Provisioner domain operations and integrations. | linked |
| `agents/backend/src/services/email_service.ts` | Backend domain service | Backend service module implementing Email Service domain operations and integrations. | linked |
| `agents/backend/src/services/ensure_deal.ts` | Backend domain service | Backend service module implementing Ensure Deal domain operations and integrations. | linked |
| `agents/backend/src/services/ensure_owner.ts` | Backend domain service | Backend service module implementing Ensure Owner domain operations and integrations. | linked |
| `agents/backend/src/services/executive_assigner.ts` | Backend domain service | Backend service module implementing Executive Assigner domain operations and integrations. | linked |
| `agents/backend/src/services/flows/booking_flow.json` | Backend domain service | Backend service module implementing Booking Flow domain operations and integrations. | not linked |
| `agents/backend/src/services/flows/search_filter_flow.json` | Backend domain service | Backend service module implementing Search Filter Flow domain operations and integrations. | not linked |
| `agents/backend/src/services/followup_scheduler.ts` | Backend domain service | Backend service module implementing Followup Scheduler domain operations and integrations. | linked |
| `agents/backend/src/services/google_oauth.ts` | Backend domain service | Backend service module implementing Google Oauth domain operations and integrations. | linked |
| `agents/backend/src/services/google_sync.ts` | Backend domain service | Backend service module implementing Google Sync domain operations and integrations. | linked |
| `agents/backend/src/services/housing_poller.ts` | Backend domain service | Backend service module implementing Housing Poller domain operations and integrations. | linked |
| `agents/backend/src/services/image_moderation.ts` | Backend domain service | Backend service module implementing Image Moderation domain operations and integrations. | linked |
| `agents/backend/src/services/interaction_engine.ts` | Backend domain service | Backend service module implementing Interaction Engine domain operations and integrations. | linked |
| `agents/backend/src/services/inventory_broadcast.ts` | Backend domain service | Backend service module implementing Inventory Broadcast domain operations and integrations. | linked |
| `agents/backend/src/services/inventory_to_demand.ts` | Backend domain service | Backend service module implementing Inventory To Demand domain operations and integrations. | linked |
| `agents/backend/src/services/lead_assignment.ts` | Backend domain service | Backend service module implementing Lead Assignment domain operations and integrations. | linked |
| `agents/backend/src/services/lead_auto_engage.ts` | Backend domain service | Backend service module implementing Lead Auto Engage domain operations and integrations. | linked |
| `agents/backend/src/services/lead_notifications.ts` | Backend domain service | Backend service module implementing Lead Notifications domain operations and integrations. | linked |
| `agents/backend/src/services/lead_qualification_caller.ts` | Backend domain service | Backend service module implementing Lead Qualification Caller domain operations and integrations. | linked |
| `agents/backend/src/services/lead_recycler.ts` | Backend domain service | Backend service module implementing Lead Recycler domain operations and integrations. | linked |
| `agents/backend/src/services/lead_redistribution.ts` | Backend domain service | Backend service module implementing Lead Redistribution domain operations and integrations. | linked |
| `agents/backend/src/services/lead_reingest.ts` | Backend domain service | Backend service module implementing Lead Reingest domain operations and integrations. | linked |
| `agents/backend/src/services/lead_score.ts` | Backend domain service | Backend service module implementing Lead Score domain operations and integrations. | linked |
| `agents/backend/src/services/llm.ts` | Backend domain service | Backend service module implementing Llm domain operations and integrations. | linked |
| `agents/backend/src/services/matching.ts` | Backend domain service | Backend service module implementing Matching domain operations and integrations. | linked |
| `agents/backend/src/services/matching_engine.ts` | Backend domain service | Backend service module implementing Matching Engine domain operations and integrations. | linked |
| `agents/backend/src/services/message_router.ts` | Backend domain service | Backend service module implementing Message Router domain operations and integrations. | linked |
| `agents/backend/src/services/meta_conversions.ts` | Backend domain service | Backend service module implementing Meta Conversions domain operations and integrations. | linked |
| `agents/backend/src/services/new_lead_alerts.ts` | Backend domain service | Backend service module implementing New Lead Alerts domain operations and integrations. | linked |
| `agents/backend/src/services/ninety_nine_acres_poller.ts` | Backend domain service | Backend service module implementing Ninety Nine Acres Poller domain operations and integrations. | linked |
| `agents/backend/src/services/notification_batcher.ts` | Backend domain service | Backend service module implementing Notification Batcher domain operations and integrations. | linked |
| `agents/backend/src/services/notification_crons.ts` | Backend domain service | Backend service module implementing Notification Crons domain operations and integrations. | linked |
| `agents/backend/src/services/notification_retry.ts` | Backend domain service | Backend service module implementing Notification Retry domain operations and integrations. | linked |
| `agents/backend/src/services/notify.ts` | Backend domain service | Backend service module implementing Notify domain operations and integrations. | linked |
| `agents/backend/src/services/otp_email.ts` | Backend domain service | Backend service module implementing Otp Email domain operations and integrations. | linked |
| `agents/backend/src/services/otp_sender.ts` | Backend domain service | Backend service module implementing Otp Sender domain operations and integrations. | linked |
| `agents/backend/src/services/owner.ts` | Backend domain service | Backend service module implementing Owner domain operations and integrations. | linked |
| `agents/backend/src/services/owner_digest.ts` | Backend domain service | Backend service module implementing Owner Digest domain operations and integrations. | linked |
| `agents/backend/src/services/ownership_service.ts` | Backend domain service | Backend service module implementing Ownership Service domain operations and integrations. | linked |
| `agents/backend/src/services/panditji_daily_briefing.ts` | Backend domain service | Backend service module implementing Panditji Daily Briefing domain operations and integrations. | linked |
| `agents/backend/src/services/partner_auto_create.ts` | Backend domain service | Backend service module implementing Partner Auto Create domain operations and integrations. | linked |
| `agents/backend/src/services/partner_inapp_notify.ts` | Backend domain service | Backend service module implementing Partner Inapp Notify domain operations and integrations. | linked |
| `agents/backend/src/services/partner_notifications.ts` | Backend domain service | Backend service module implementing Partner Notifications domain operations and integrations. | linked |
| `agents/backend/src/services/payment.ts` | Backend domain service | Backend service module implementing Payment domain operations and integrations. | linked |
| `agents/backend/src/services/pdf_generator.ts` | Backend domain service | Backend service module implementing Pdf Generator domain operations and integrations. | linked |
| `agents/backend/src/services/pending_message_queue.ts` | Backend domain service | Backend service module implementing Pending Message Queue domain operations and integrations. | linked |
| `agents/backend/src/services/performance_monitor.ts` | Backend domain service | Backend service module implementing Performance Monitor domain operations and integrations. | linked |
| `agents/backend/src/services/permission_engine.ts` | Backend domain service | Backend service module implementing Permission Engine domain operations and integrations. | linked |
| `agents/backend/src/services/pipecat_bridge.ts` | Backend domain service | Backend service module implementing Pipecat Bridge domain operations and integrations. | linked |
| `agents/backend/src/services/pipeline_crons.ts` | Backend domain service | Backend service module implementing Pipeline Crons domain operations and integrations. | linked |
| `agents/backend/src/services/property_analytics.ts` | Backend domain service | Backend service module implementing Property Analytics domain operations and integrations. | linked |
| `agents/backend/src/services/property_card_reply_handler.ts` | Backend domain service | Backend service module implementing Property Card Reply Handler domain operations and integrations. | linked |
| `agents/backend/src/services/property_sharing.ts` | Backend domain service | Backend service module implementing Property Sharing domain operations and integrations. | linked |
| `agents/backend/src/services/push_service.ts` | Backend domain service | Backend service module implementing Push Service domain operations and integrations. | linked |
| `agents/backend/src/services/role_context_detector.ts` | Backend domain service | Backend service module implementing Role Context Detector domain operations and integrations. | linked |
| `agents/backend/src/services/sanitization_service.ts` | Backend domain service | Backend service module implementing Sanitization Service domain operations and integrations. | linked |
| `agents/backend/src/services/scheduler.ts` | Backend domain service | Backend service module implementing Scheduler domain operations and integrations. | linked |
| `agents/backend/src/services/scoring.ts` | Backend domain service | Backend service module implementing Scoring domain operations and integrations. | linked |
| `agents/backend/src/services/session/store.ts` | Backend domain service | Backend service module implementing Store domain operations and integrations. | linked |
| `agents/backend/src/services/session_store.ts` | Backend domain service | Backend service module implementing Session Store domain operations and integrations. | linked |
| `agents/backend/src/services/session_tracker.ts` | Backend domain service | Backend service module implementing Session Tracker domain operations and integrations. | linked |
| `agents/backend/src/services/share_recognition.ts` | Backend domain service | Backend service module implementing Share Recognition domain operations and integrations. | linked |
| `agents/backend/src/services/social_lead_capture.ts` | Backend domain service | Backend service module implementing Social Lead Capture domain operations and integrations. | linked |
| `agents/backend/src/services/social_replier.ts` | Backend domain service | Backend service module implementing Social Replier domain operations and integrations. | linked |
| `agents/backend/src/services/speed_to_lead.ts` | Backend domain service | Backend service module implementing Speed To Lead domain operations and integrations. | linked |
| `agents/backend/src/services/storage.ts` | Backend domain service | Backend service module implementing Storage domain operations and integrations. | linked |
| `agents/backend/src/services/subscription.ts` | Backend domain service | Backend service module implementing Subscription domain operations and integrations. | linked |
| `agents/backend/src/services/system_prompt.ts` | Backend domain service | Backend service module implementing System Prompt domain operations and integrations. | linked |
| `agents/backend/src/services/targets.ts` | Backend domain service | Backend service module implementing Targets domain operations and integrations. | linked |
| `agents/backend/src/services/team_inventory_broadcast.ts` | Backend domain service | Backend service module implementing Team Inventory Broadcast domain operations and integrations. | linked |
| `agents/backend/src/services/team_metrics.ts` | Backend domain service | Backend service module implementing Team Metrics domain operations and integrations. | linked |
| `agents/backend/src/services/template_button_router.ts` | Backend domain service | Backend service module implementing Template Button Router domain operations and integrations. | linked |
| `agents/backend/src/services/tool_language.ts` | Backend domain service | Backend service module implementing Tool Language domain operations and integrations. | linked |
| `agents/backend/src/services/tool_permission.ts` | Backend domain service | Backend service module implementing Tool Permission domain operations and integrations. | linked |
| `agents/backend/src/services/transaction_service.ts` | Backend domain service | Backend service module implementing Transaction Service domain operations and integrations. | linked |
| `agents/backend/src/services/transaction_state_machine.ts` | Backend domain service | Backend service module implementing Transaction State Machine domain operations and integrations. | linked |
| `agents/backend/src/services/transcription.ts` | Backend domain service | Backend service module implementing Transcription domain operations and integrations. | linked |
| `agents/backend/src/services/upload.ts` | Backend domain service | Backend service module implementing Upload domain operations and integrations. | linked |
| `agents/backend/src/services/voice.ts` | Backend domain service | Backend service module implementing Voice domain operations and integrations. | linked |
| `agents/backend/src/services/wa_compliance.ts` | Backend domain service | Backend service module implementing Wa Compliance domain operations and integrations. | linked |
| `agents/backend/src/services/wa_message_log.ts` | Backend domain service | Backend service module implementing Wa Message Log domain operations and integrations. | linked |
| `agents/backend/src/services/webhook_processor.ts` | Backend domain service | Backend service module implementing Webhook Processor domain operations and integrations. | linked |
| `agents/backend/src/services/whatsapp.ts` | Backend domain service | Backend service module implementing Whatsapp domain operations and integrations. | linked |
| `agents/backend/src/services/whatsapp_errors.ts` | Backend domain service | Backend service module implementing Whatsapp Errors domain operations and integrations. | linked |
| `agents/backend/src/services/whatsapp_flows.ts` | Backend domain service | Backend service module implementing Whatsapp Flows domain operations and integrations. | linked |
| `agents/backend/src/services/workflow_engine.ts` | Backend domain service | Backend service module implementing Workflow Engine domain operations and integrations. | linked |
| `agents/backend/src/services/workflow_task_service.ts` | Backend domain service | Backend service module implementing Workflow Task Service domain operations and integrations. | linked |
| `agents/backend/src/swagger.ts` | Backend application | Backend module for Swagger application behavior or infrastructure. | linked |
| `agents/backend/src/templates/email_templates.ts` | Backend application | Backend module for Email Templates application behavior or infrastructure. | linked |
| `agents/backend/src/utils/alerter.ts` | Backend utility | Shared backend utility for Alerter. | linked |
| `agents/backend/src/utils/budget_sanity.ts` | Backend utility | Shared backend utility for Budget Sanity. | linked |
| `agents/backend/src/utils/capture.ts` | Backend utility | Shared backend utility for Capture. | linked |
| `agents/backend/src/utils/circuit_breaker.ts` | Backend utility | Shared backend utility for Circuit Breaker. | linked |
| `agents/backend/src/utils/classification.ts` | Backend utility | Shared backend utility for Classification. | linked |
| `agents/backend/src/utils/crypto.ts` | Backend utility | Shared backend utility for Crypto. | linked |
| `agents/backend/src/utils/demand_canonical.ts` | Backend utility | Shared backend utility for Demand Canonical. | linked |
| `agents/backend/src/utils/demand_capture.ts` | Backend utility | Shared backend utility for Demand Capture. | linked |
| `agents/backend/src/utils/demand_defaults.ts` | Backend utility | Shared backend utility for Demand Defaults. | linked |
| `agents/backend/src/utils/demand_taxonomy.ts` | Backend utility | Shared backend utility for Demand Taxonomy. | linked |
| `agents/backend/src/utils/distribution.ts` | Backend utility | Shared backend utility for Distribution. | linked |
| `agents/backend/src/utils/email.ts` | Backend utility | Shared backend utility for Email. | linked |
| `agents/backend/src/utils/floor.ts` | Backend utility | Shared backend utility for Floor. | linked |
| `agents/backend/src/utils/format_price.ts` | Backend utility | Shared backend utility for Format Price. | linked |
| `agents/backend/src/utils/frustration.ts` | Backend utility | Shared backend utility for Frustration. | linked |
| `agents/backend/src/utils/gci.ts` | Backend utility | Shared backend utility for Gci. | linked |
| `agents/backend/src/utils/geocode.ts` | Backend utility | Shared backend utility for Geocode. | linked |
| `agents/backend/src/utils/intent_signals.ts` | Backend utility | Shared backend utility for Intent Signals. | linked |
| `agents/backend/src/utils/inventory_id.ts` | Backend utility | Shared backend utility for Inventory Id. | linked |
| `agents/backend/src/utils/inventory_math.ts` | Backend utility | Shared backend utility for Inventory Math. | linked |
| `agents/backend/src/utils/inventory_search.ts` | Backend utility | Shared backend utility for Inventory Search. | linked |
| `agents/backend/src/utils/logger.ts` | Backend utility | Shared backend utility for Logger. | linked |
| `agents/backend/src/utils/media_promote.ts` | Backend utility | Shared backend utility for Media Promote. | linked |
| `agents/backend/src/utils/menu_choice.ts` | Backend utility | Shared backend utility for Menu Choice. | linked |
| `agents/backend/src/utils/menu_loop_guard.ts` | Backend utility | Shared backend utility for Menu Loop Guard. | linked |
| `agents/backend/src/utils/name_sanitizer.ts` | Backend utility | Shared backend utility for Name Sanitizer. | linked |
| `agents/backend/src/utils/parse_lead_location.ts` | Backend utility | Shared backend utility for Parse Lead Location. | linked |
| `agents/backend/src/utils/partner_scope.ts` | Backend utility | Shared backend utility for Partner Scope. | linked |
| `agents/backend/src/utils/partner_team.ts` | Backend utility | Shared backend utility for Partner Team. | linked |
| `agents/backend/src/utils/pdf_token.ts` | Backend utility | Shared backend utility for Pdf Token. | linked |
| `agents/backend/src/utils/phone.ts` | Backend utility | Shared backend utility for Phone. | linked |
| `agents/backend/src/utils/price_sanity.ts` | Backend utility | Shared backend utility for Price Sanity. | linked |
| `agents/backend/src/utils/quiet_hours.ts` | Backend utility | Shared backend utility for Quiet Hours. | linked |
| `agents/backend/src/utils/redis.ts` | Backend utility | Shared backend utility for Redis. | linked |
| `agents/backend/src/utils/requirement_slots.ts` | Backend utility | Shared backend utility for Requirement Slots. | linked |
| `agents/backend/src/utils/search.ts` | Backend utility | Shared backend utility for Search. | linked |
| `agents/backend/src/utils/slug.ts` | Backend utility | Shared backend utility for Slug. | linked |
| `agents/backend/src/utils/specs_filter.ts` | Backend utility | Shared backend utility for Specs Filter. | linked |
| `agents/backend/src/utils/taxonomy_filter.ts` | Backend utility | Shared backend utility for Taxonomy Filter. | linked |
| `agents/backend/src/utils/team_scope.ts` | Backend utility | Shared backend utility for Team Scope. | linked |
| `agents/backend/src/utils/video_transcode.ts` | Backend utility | Shared backend utility for Video Transcode. | linked |
| `agents/backend/src/utils/visit_availability.ts` | Backend utility | Shared backend utility for Visit Availability. | linked |
| `agents/backend/src/utils/visit_schedule.ts` | Backend utility | Shared backend utility for Visit Schedule. | linked |
| `agents/backend/src/utils/website_lead.ts` | Backend utility | Shared backend utility for Website Lead. | linked |
| `agents/backend/src/validators/auth.validator.ts` | Backend validation | Request/data validation module for Auth Validator. | linked |
| `agents/backend/src/validators/calls.validator.ts` | Backend validation | Request/data validation module for Calls Validator. | linked |
| `agents/backend/src/validators/deals.validator.ts` | Backend validation | Request/data validation module for Deals Validator. | linked |
| `agents/backend/src/validators/index.ts` | Backend validation | Request/data validation module for Index. | linked |
| `agents/backend/src/validators/public.validator.ts` | Backend validation | Request/data validation module for Public Validator. | linked |
| `agents/backend/src/workers/call_processor.ts` | Backend application | Backend module for Call Processor application behavior or infrastructure. | linked |
| `agents/backend/src/workflows/agent_onboarding.ts` | Backend application | Backend module for Agent Onboarding application behavior or infrastructure. | linked |
| `agents/backend/src/workflows/builder_inventory.ts` | Backend application | Backend module for Builder Inventory application behavior or infrastructure. | linked |
| `agents/backend/src/workflows/builder_onboarding.ts` | Backend application | Backend module for Builder Onboarding application behavior or infrastructure. | linked |
| `agents/backend/src/workflows/buyer.ts` | Backend application | Backend module for Buyer application behavior or infrastructure. | linked |
| `agents/backend/src/workflows/buyer_chat_workflow_adapter.ts` | Backend application | Backend module for Buyer Chat Workflow Adapter application behavior or infrastructure. | linked |
| `agents/backend/src/workflows/buyer_conversational_core.ts` | Backend application | Backend module for Buyer Conversational Core application behavior or infrastructure. | linked |
| `agents/backend/src/workflows/buyer_whatsapp_adapter.ts` | Backend application | Backend module for Buyer Whatsapp Adapter application behavior or infrastructure. | linked |
| `agents/backend/src/workflows/buyer_workflow_definition.ts` | Backend application | Backend module for Buyer Workflow Definition application behavior or infrastructure. | linked |
| `agents/backend/src/workflows/buyer_workflow_engine.ts` | Backend application | Backend module for Buyer Workflow Engine application behavior or infrastructure. | linked |
| `agents/backend/src/workflows/chat_workflow_adapter.ts` | Backend application | Backend module for Chat Workflow Adapter application behavior or infrastructure. | linked |
| `agents/backend/src/workflows/conversational_workflow_core.ts` | Backend application | Backend module for Conversational Workflow Core application behavior or infrastructure. | linked |
| `agents/backend/src/workflows/inventory_machine.ts` | Backend application | Backend module for Inventory Machine application behavior or infrastructure. | linked |
| `agents/backend/src/workflows/management.ts` | Backend application | Backend module for Management application behavior or infrastructure. | linked |
| `agents/backend/src/workflows/nlu_parser.ts` | Backend application | Backend module for Nlu Parser application behavior or infrastructure. | linked |
| `agents/backend/src/workflows/partner_agent.ts` | Backend application | Backend module for Partner Agent application behavior or infrastructure. | linked |
| `agents/backend/src/workflows/seller.ts` | Backend application | Backend module for Seller application behavior or infrastructure. | linked |
| `agents/backend/src/workflows/unknown.ts` | Backend application | Backend module for Unknown application behavior or infrastructure. | linked |
| `agents/backend/src/workflows/whatsapp_workflow_adapter.ts` | Backend application | Backend module for Whatsapp Workflow Adapter application behavior or infrastructure. | linked |
| `agents/backend/src/workflows/workflow_definition.ts` | Backend application | Backend module for Workflow Definition application behavior or infrastructure. | linked |
| `agents/backend/src/workflows/workflow_engine.ts` | Backend application | Backend module for Workflow Engine application behavior or infrastructure. | linked |
| `agents/backend/src/workflows/workflow_types.ts` | Backend application | Backend module for Workflow Types application behavior or infrastructure. | linked |
| `agents/backend/test-login.js` | Backend tests | Automated test/specification for Test Login behavior. | linked |
| `agents/backend/test_seed.ts` | Backend tests | Automated test/specification for Test Seed behavior. | linked |
| `agents/backend/tsconfig.json` | Backend support | Backend configuration, deployment, fixture, or support artifact for Tsconfig. | linked |
| `agents/backend/tsconfig.tsbuildinfo` | Backend support | Backend configuration, deployment, fixture, or support artifact for Tsconfig. | not linked |
| `agents/backend/update-admin-password.js` | Backend support | Backend configuration, deployment, fixture, or support artifact for Update Admin Password. | linked |
| `agents/backend/vitest.config.ts` | Backend support | Backend configuration, deployment, fixture, or support artifact for Vitest Config. | linked |
| `agents/backend/workflow.md` | Backend support | Backend configuration, deployment, fixture, or support artifact for Workflow. | linked |
| `agents/backup/run.js` | Repository support | Repository configuration, script, data, or support artifact for Run. | linked |
| `agents/browser-qa/audit-admin-mobile.js` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Audit Admin Mobile. | linked |
| `agents/browser-qa/audit-mobile-inventory.js` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Audit Mobile Inventory. | linked |
| `agents/browser-qa/audit-partner-portal.js` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Audit Partner Portal. | linked |
| `agents/browser-qa/check-inventory.js` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Check Inventory. | linked |
| `agents/browser-qa/config.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Config. | not linked |
| `agents/browser-qa/create-task.js` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Create Task. | linked |
| `agents/browser-qa/final-verify.js` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Final Verify. | linked |
| `agents/browser-qa/mobile-full-audit.js` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Mobile Full Audit. | linked |
| `agents/browser-qa/node_modules/.bin/playwright` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/.bin/playwright-core` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/.bin/playwright-core.cmd` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/.bin/playwright-core.ps1` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/.bin/playwright.cmd` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/.bin/playwright.ps1` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/.package-lock.json` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/LICENSE` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/NOTICE` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/README.md` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/ThirdPartyNotices.txt` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/bin/install_media_pack.ps1` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/bin/install_webkit_wsl.ps1` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/bin/reinstall_chrome_beta_linux.sh` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/bin/reinstall_chrome_beta_mac.sh` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/bin/reinstall_chrome_beta_win.ps1` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/bin/reinstall_chrome_stable_linux.sh` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/bin/reinstall_chrome_stable_mac.sh` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/bin/reinstall_chrome_stable_win.ps1` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/bin/reinstall_msedge_beta_linux.sh` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/bin/reinstall_msedge_beta_mac.sh` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/bin/reinstall_msedge_beta_win.ps1` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/bin/reinstall_msedge_dev_linux.sh` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/bin/reinstall_msedge_dev_mac.sh` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/bin/reinstall_msedge_dev_win.ps1` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/bin/reinstall_msedge_stable_linux.sh` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/bin/reinstall_msedge_stable_mac.sh` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/bin/reinstall_msedge_stable_win.ps1` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/browsers.json` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/cli.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/index.d.ts` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/index.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/index.mjs` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/androidServerImpl.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/browserServerImpl.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/cli/driver.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/cli/program.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/cli/programWithTestStub.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/android.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/api.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/artifact.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/browser.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/browserContext.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/browserType.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/cdpSession.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/channelOwner.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/clientHelper.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/clientInstrumentation.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/clientStackTrace.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/clock.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/connection.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/consoleMessage.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/coverage.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/dialog.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/download.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/electron.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/elementHandle.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/errors.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/eventEmitter.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/events.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/fetch.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/fileChooser.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/fileUtils.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/frame.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/harRouter.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/input.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/jsHandle.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/jsonPipe.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/localUtils.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/locator.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/network.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/page.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/pageAgent.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/platform.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/playwright.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/selectors.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/stream.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/timeoutSettings.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/tracing.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/types.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/video.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/waiter.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/webError.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/webSocket.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/worker.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/client/writableStream.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/generated/bindingsControllerSource.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/generated/clockSource.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/generated/injectedScriptSource.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/generated/pollingRecorderSource.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/generated/storageScriptSource.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/generated/utilityScriptSource.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/generated/webSocketMockSource.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/inProcessFactory.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/inprocess.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/mcpBundle.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/mcpBundleImpl/index.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/outofprocess.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/protocol/serializers.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/protocol/validator.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/protocol/validatorPrimitives.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/remote/playwrightConnection.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/remote/playwrightServer.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/agent/actionRunner.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/agent/actions.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/agent/codegen.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/agent/context.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/agent/expectTools.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/agent/pageAgent.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/agent/performTools.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/agent/tool.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/android/android.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/android/backendAdb.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/artifact.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/bidi/bidiBrowser.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/bidi/bidiChromium.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/bidi/bidiConnection.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/bidi/bidiDeserializer.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/bidi/bidiExecutionContext.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/bidi/bidiFirefox.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/bidi/bidiInput.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/bidi/bidiNetworkManager.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/bidi/bidiOverCdp.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/bidi/bidiPage.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/bidi/bidiPdf.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/bidi/third_party/bidiCommands.d.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/bidi/third_party/bidiKeyboard.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/bidi/third_party/bidiProtocol.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/bidi/third_party/bidiProtocolCore.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/bidi/third_party/bidiProtocolPermissions.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/bidi/third_party/bidiSerializer.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/bidi/third_party/firefoxPrefs.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/browser.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/browserContext.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/browserType.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/callLog.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/chromium/appIcon.png` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/chromium/chromium.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/chromium/chromiumSwitches.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/chromium/crBrowser.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/chromium/crConnection.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/chromium/crCoverage.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/chromium/crDevTools.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/chromium/crDragDrop.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/chromium/crExecutionContext.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/chromium/crInput.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/chromium/crNetworkManager.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/chromium/crPage.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/chromium/crPdf.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/chromium/crProtocolHelper.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/chromium/crServiceWorker.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/chromium/defaultFontFamilies.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/chromium/protocol.d.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/clock.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/codegen/csharp.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/codegen/java.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/codegen/javascript.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/codegen/jsonl.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/codegen/language.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/codegen/languages.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/codegen/python.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/codegen/types.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/console.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/cookieStore.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/debugController.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/debugger.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/deviceDescriptors.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/deviceDescriptorsSource.json` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dialog.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dispatchers/androidDispatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dispatchers/artifactDispatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dispatchers/browserContextDispatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dispatchers/browserDispatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dispatchers/browserTypeDispatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dispatchers/cdpSessionDispatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dispatchers/debugControllerDispatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dispatchers/dialogDispatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dispatchers/dispatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dispatchers/electronDispatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dispatchers/elementHandlerDispatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dispatchers/frameDispatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dispatchers/jsHandleDispatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dispatchers/jsonPipeDispatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dispatchers/localUtilsDispatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dispatchers/networkDispatchers.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dispatchers/pageAgentDispatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dispatchers/pageDispatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dispatchers/playwrightDispatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dispatchers/streamDispatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dispatchers/tracingDispatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dispatchers/webSocketRouteDispatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dispatchers/writableStreamDispatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/dom.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/download.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/electron/electron.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/electron/loader.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/errors.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/fetch.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/fileChooser.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/fileUploadUtils.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/firefox/ffBrowser.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/firefox/ffConnection.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/firefox/ffExecutionContext.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/firefox/ffInput.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/firefox/ffNetworkManager.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/firefox/ffPage.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/firefox/firefox.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/firefox/protocol.d.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/formData.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/frameSelectors.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/frames.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/har/harRecorder.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/har/harTracer.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/harBackend.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/helper.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/index.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/input.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/instrumentation.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/javascript.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/launchApp.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/localUtils.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/macEditingCommands.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/network.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/page.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/pipeTransport.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/playwright.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/progress.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/protocolError.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/recorder.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/recorder/chat.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/recorder/recorderApp.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/recorder/recorderRunner.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/recorder/recorderSignalProcessor.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/recorder/recorderUtils.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/recorder/throttledFile.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/registry/browserFetcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/registry/dependencies.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/registry/index.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/registry/nativeDeps.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/registry/oopDownloadBrowserMain.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/screencast.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/screenshotter.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/selectors.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/socksClientCertificatesInterceptor.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/socksInterceptor.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/trace/recorder/snapshotter.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/trace/recorder/snapshotterInjected.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/trace/recorder/tracing.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/trace/viewer/traceParser.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/trace/viewer/traceViewer.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/transport.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/types.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/usKeyboardLayout.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/ascii.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/comparators.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/crypto.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/debug.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/debugLogger.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/env.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/eventsHelper.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/expectUtils.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/fileUtils.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/happyEyeballs.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/hostPlatform.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/httpServer.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/imageUtils.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/image_tools/colorUtils.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/image_tools/compare.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/image_tools/imageChannel.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/image_tools/stats.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/linuxUtils.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/network.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/nodePlatform.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/pipeTransport.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/processLauncher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/profiler.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/socksProxy.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/spawnAsync.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/task.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/userAgent.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/wsServer.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/zipFile.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/utils/zones.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/videoRecorder.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/webkit/protocol.d.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/webkit/webkit.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/webkit/wkBrowser.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/webkit/wkConnection.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/webkit/wkExecutionContext.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/webkit/wkInput.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/webkit/wkInterceptableRequest.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/webkit/wkPage.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/webkit/wkProvisionalPage.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/server/webkit/wkWorkers.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/third_party/pixelmatch.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/ariaSnapshot.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/assert.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/colors.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/cssParser.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/cssTokenizer.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/headers.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/locatorGenerators.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/locatorParser.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/locatorUtils.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/lruCache.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/manualPromise.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/mimeType.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/multimap.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/protocolFormatter.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/protocolMetainfo.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/rtti.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/selectorParser.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/semaphore.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/stackTrace.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/stringUtils.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/time.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/timeoutRunner.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/trace/entries.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/trace/snapshotRenderer.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/trace/snapshotServer.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/trace/snapshotStorage.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/trace/traceLoader.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/trace/traceModel.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/trace/traceModernizer.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/traceUtils.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/types.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/urlMatch.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/utilityScriptSerializers.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utils/isomorphic/yaml.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utilsBundle.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utilsBundleImpl/index.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/utilsBundleImpl/xdg-open` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/htmlReport/index.html` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/recorder/assets/codeMirrorModule-DYBRYzYX.css` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/recorder/assets/codeMirrorModule-DadYNm1I.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/recorder/assets/codicon-DCmgc-ay.ttf` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/recorder/assets/index-BSjZa4pk.css` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/recorder/assets/index-BhTWtUlo.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/recorder/index.html` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/recorder/playwright-logo.svg` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/traceViewer/assets/codeMirrorModule-a5XoALAZ.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/traceViewer/assets/defaultSettingsView-CJSZINFr.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/traceViewer/assets/xtermModule-CsJ4vdCR.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/traceViewer/codeMirrorModule.DYBRYzYX.css` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/traceViewer/codicon.DCmgc-ay.ttf` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/traceViewer/defaultSettingsView.7ch9cixO.css` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/traceViewer/index.BDwrLSGN.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/traceViewer/index.BVu7tZDe.css` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/traceViewer/index.html` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/traceViewer/manifest.webmanifest` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/traceViewer/playwright-logo.svg` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/traceViewer/snapshot.html` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/traceViewer/sw.bundle.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/traceViewer/uiMode.Btcz36p_.css` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/traceViewer/uiMode.CQJ9SCIQ.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/traceViewer/uiMode.html` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/vite/traceViewer/xtermModule.DYP7pi_n.css` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/zipBundle.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/lib/zipBundleImpl.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/package.json` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/types/protocol.d.ts` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/types/structs.d.ts` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright-core/types/types.d.ts` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/LICENSE` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/NOTICE` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/README.md` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/ThirdPartyNotices.txt` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/cli.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/index.d.ts` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/index.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/index.mjs` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/jsx-runtime.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/jsx-runtime.mjs` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/agents/agentParser.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/agents/copilot-setup-steps.yml` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/agents/generateAgents.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/agents/playwright-test-coverage.prompt.md` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/agents/playwright-test-generate.prompt.md` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/agents/playwright-test-generator.agent.md` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/agents/playwright-test-heal.prompt.md` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/agents/playwright-test-healer.agent.md` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/agents/playwright-test-plan.prompt.md` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/agents/playwright-test-planner.agent.md` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/common/config.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/common/configLoader.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/common/esmLoaderHost.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/common/expectBundle.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/common/expectBundleImpl.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/common/fixtures.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/common/globals.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/common/ipc.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/common/poolBuilder.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/common/process.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/common/suiteUtils.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/common/test.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/common/testLoader.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/common/testType.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/common/validators.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/fsWatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/index.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/internalsForTest.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/isomorphic/events.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/isomorphic/folders.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/isomorphic/stringInternPool.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/isomorphic/teleReceiver.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/isomorphic/teleSuiteUpdater.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/isomorphic/testServerConnection.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/isomorphic/testServerInterface.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/isomorphic/testTree.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/isomorphic/types.d.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/loader/loaderMain.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/matchers/expect.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/matchers/matcherHint.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/matchers/matchers.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/matchers/toBeTruthy.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/matchers/toEqual.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/matchers/toHaveURL.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/matchers/toMatchAriaSnapshot.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/matchers/toMatchSnapshot.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/matchers/toMatchText.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/browserContextFactory.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/browserServerBackend.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/config.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/context.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/response.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/sessionLog.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tab.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tools.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tools/common.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tools/console.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tools/dialogs.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tools/evaluate.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tools/files.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tools/form.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tools/install.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tools/keyboard.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tools/mouse.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tools/navigate.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tools/network.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tools/open.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tools/pdf.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tools/runCode.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tools/screenshot.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tools/snapshot.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tools/tabs.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tools/tool.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tools/tracing.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tools/utils.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tools/verify.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/tools/wait.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/browser/watchdog.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/config.d.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/extension/cdpRelay.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/extension/extensionContextFactory.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/extension/protocol.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/index.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/log.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/program.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/sdk/exports.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/sdk/http.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/sdk/inProcessTransport.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/sdk/server.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/sdk/tool.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/terminal/cli.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/terminal/command.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/terminal/commands.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/terminal/daemon.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/terminal/help.json` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/terminal/helpGenerator.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/terminal/socketConnection.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/test/browserBackend.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/test/generatorTools.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/test/plannerTools.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/test/seed.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/test/streams.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/test/testBackend.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/test/testContext.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/test/testTool.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/mcp/test/testTools.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/plugins/gitCommitInfoPlugin.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/plugins/index.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/plugins/webServerPlugin.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/program.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/reporters/base.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/reporters/blob.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/reporters/dot.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/reporters/empty.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/reporters/github.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/reporters/html.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/reporters/internalReporter.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/reporters/json.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/reporters/junit.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/reporters/line.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/reporters/list.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/reporters/listModeReporter.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/reporters/markdown.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/reporters/merge.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/reporters/multiplexer.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/reporters/reporterV2.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/reporters/teleEmitter.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/reporters/versions/blobV1.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/runner/dispatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/runner/failureTracker.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/runner/lastRun.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/runner/loadUtils.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/runner/loaderHost.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/runner/processHost.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/runner/projectUtils.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/runner/rebase.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/runner/reporters.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/runner/sigIntWatcher.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/runner/storage.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/runner/taskRunner.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/runner/tasks.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/runner/testGroups.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/runner/testRunner.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/runner/testServer.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/runner/uiModeReporter.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/runner/vcs.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/runner/watchMode.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/runner/workerHost.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/third_party/pirates.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/third_party/tsconfig-loader.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/transform/babelBundle.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/transform/babelBundleImpl.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/transform/compilationCache.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/transform/esmLoader.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/transform/md.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/transform/portTransport.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/transform/transform.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/util.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/utilsBundle.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/utilsBundleImpl.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/worker/fixtureRunner.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/worker/testInfo.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/worker/testTracing.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/worker/timeoutManager.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/worker/util.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/lib/worker/workerMain.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/package.json` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/test.d.ts` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/test.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/test.mjs` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/types/test.d.ts` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/node_modules/playwright/types/testReporter.d.ts` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/browser-qa/package-lock.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Package Lock. | not linked |
| `agents/browser-qa/package.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Package. | linked |
| `agents/browser-qa/quick-verify.js` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Quick Verify. | linked |
| `agents/browser-qa/reports/admin-inventory-test.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Inventory Test. | not linked |
| `agents/browser-qa/reports/admin-mobile-audit.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Mobile Audit. | linked |
| `agents/browser-qa/reports/full-flow-verify.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Full Flow Verify. | not linked |
| `agents/browser-qa/reports/inventory-check.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Inventory Check. | not linked |
| `agents/browser-qa/reports/inventory-flow-test.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Inventory Flow Test. | not linked |
| `agents/browser-qa/reports/inventory-submit-test.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Inventory Submit Test. | not linked |
| `agents/browser-qa/reports/latest-report.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Latest Report. | not linked |
| `agents/browser-qa/reports/latest-summary.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Latest Summary. | linked |
| `agents/browser-qa/reports/latest-task-verify.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Latest Task Verify. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-08T05-38-25.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 08 T05 38 25. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-08T06-21-56.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 08 T06 21 56. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-08T06-34-08.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 08 T06 34 08. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-08T07-51-07.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 08 T07 51 07. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-08T11-25-51.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 08 T11 25 51. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-08T11-26-28.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 08 T11 26 28. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-09T12-54-25.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 09 T12 54 25. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-09T16-58-07.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 09 T16 58 07. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-09T17-44-29.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 09 T17 44 29. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-09T18-17-32.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 09 T18 17 32. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-09T18-21-14.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 09 T18 21 14. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-09T18-23-08.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 09 T18 23 08. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-09T19-31-42.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 09 T19 31 42. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-09T19-33-45.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 09 T19 33 45. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-09T20-10-50.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 09 T20 10 50. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-09T20-12-41.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 09 T20 12 41. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-09T20-41-51.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 09 T20 41 51. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-10T04-44-24.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 10 T04 44 24. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-10T04-48-22.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 10 T04 48 22. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-10T05-14-52.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 10 T05 14 52. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-10T05-16-54.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 10 T05 16 54. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-10T05-55-42.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 10 T05 55 42. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-10T07-35-51.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 10 T07 35 51. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-10T07-37-56.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 10 T07 37 56. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-10T08-41-35.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 10 T08 41 35. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-10T08-43-24.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 10 T08 43 24. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-10T09-03-00.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 10 T09 03 00. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-10T09-04-52.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 10 T09 04 52. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-10T09-23-57.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 10 T09 23 57. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-10T09-57-50.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 10 T09 57 50. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-10T09-59-33.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 10 T09 59 33. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-10T10-01-46.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 10 T10 01 46. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-10T11-01-10.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 10 T11 01 10. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-10T11-03-02.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 10 T11 03 02. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-10T11-05-04.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 10 T11 05 04. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-10T19-16-35.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 10 T19 16 35. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-10T19-18-25.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 10 T19 18 25. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-11T08-29-33.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 11 T08 29 33. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-11T09-31-48.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 11 T09 31 48. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-11T09-36-15.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 11 T09 36 15. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-11T09-56-11.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 11 T09 56 11. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-11T09-58-11.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 11 T09 58 11. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-11T10-42-12.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 11 T10 42 12. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-11T11-13-59.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 11 T11 13 59. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-11T11-17-04.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 11 T11 17 04. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-11T11-24-38.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 11 T11 24 38. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-11T11-36-39.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 11 T11 36 39. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-11T11-40-11.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 11 T11 40 11. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-11T11-44-54.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 11 T11 44 54. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-11T11-46-51.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 11 T11 46 51. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-11T11-51-28.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 11 T11 51 28. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-11T11-54-11.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 11 T11 54 11. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-11T12-51-37.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 11 T12 51 37. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-11T15-04-35.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 11 T15 04 35. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-11T17-10-52.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 11 T17 10 52. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-11T18-20-11.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 11 T18 20 11. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-12T05-12-54.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 12 T05 12 54. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-12T05-14-51.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 12 T05 14 51. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-12T06-48-04.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 12 T06 48 04. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-12T07-03-47.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 12 T07 03 47. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-12T07-05-48.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 12 T07 05 48. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-12T07-13-00.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 12 T07 13 00. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-12T11-08-02.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 12 T11 08 02. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-12T11-42-05.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 12 T11 42 05. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-12T12-22-57.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 12 T12 22 57. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-12T15-06-29.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 12 T15 06 29. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-12T19-02-07.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 12 T19 02 07. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-12T19-05-08.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 12 T19 05 08. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-12T19-10-23.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 12 T19 10 23. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-12T19-24-34.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 12 T19 24 34. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-13T08-07-38.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 13 T08 07 38. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-13T08-11-56.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 13 T08 11 56. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-13T08-13-55.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 13 T08 13 55. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-13T08-18-23.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 13 T08 18 23. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-13T08-24-48.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 13 T08 24 48. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-13T08-28-34.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 13 T08 28 34. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-13T10-44-17.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 13 T10 44 17. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-13T10-46-13.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 13 T10 46 13. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-13T10-48-11.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 13 T10 48 11. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-13T11-51-24.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 13 T11 51 24. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-13T15-07-10.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 13 T15 07 10. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-13T16-30-57.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 13 T16 30 57. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-13T16-35-36.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 13 T16 35 36. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-13T16-39-21.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 13 T16 39 21. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-13T16-44-27.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 13 T16 44 27. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-13T19-31-11.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 13 T19 31 11. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-13T19-48-22.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 13 T19 48 22. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-13T20-23-29.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 13 T20 23 29. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-13T21-06-50.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 13 T21 06 50. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-13T21-11-15.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 13 T21 11 15. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-13T21-29-41.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 13 T21 29 41. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-13T21-40-44.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 13 T21 40 44. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-14T11-12-29.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 14 T11 12 29. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-14T11-14-36.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 14 T11 14 36. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-14T11-18-27.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 14 T11 18 27. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-15T06-24-26.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 15 T06 24 26. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-15T06-31-05.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 15 T06 31 05. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-15T06-41-11.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 15 T06 41 11. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-15T06-47-53.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 15 T06 47 53. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-15T06-50-08.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 15 T06 50 08. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-15T08-35-11.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 15 T08 35 11. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-15T08-47-00.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 15 T08 47 00. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-15T09-10-05.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 15 T09 10 05. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-15T10-23-15.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 15 T10 23 15. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-15T10-56-58.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 15 T10 56 58. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-15T11-01-21.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 15 T11 01 21. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-15T11-04-11.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 15 T11 04 11. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-15T14-09-05.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 15 T14 09 05. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-16T04-16-08.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 16 T04 16 08. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-16T04-18-21.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 16 T04 18 21. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-16T04-29-59.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 16 T04 29 59. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-16T04-34-10.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 16 T04 34 10. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-16T05-27-25.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 16 T05 27 25. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-16T06-05-44.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 16 T06 05 44. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-16T06-07-49.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 16 T06 07 49. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-16T07-35-20.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 16 T07 35 20. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-16T08-35-14.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 16 T08 35 14. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-18T19-08-51.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 18 T19 08 51. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-18T19-42-30.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 18 T19 42 30. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-18T19-53-56.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 18 T19 53 56. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-18T20-33-45.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 18 T20 33 45. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-19T06-13-27.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 19 T06 13 27. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-19T06-38-43.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 19 T06 38 43. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-19T06-40-46.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 19 T06 40 46. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-19T07-53-53.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 19 T07 53 53. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-19T07-55-42.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 19 T07 55 42. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-19T09-36-24.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 19 T09 36 24. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-19T09-38-20.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 19 T09 38 20. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-19T15-58-00.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 19 T15 58 00. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-19T16-04-07.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 19 T16 04 07. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-19T16-06-56.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 19 T16 06 56. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-19T16-10-44.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 19 T16 10 44. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-20T14-50-09.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 20 T14 50 09. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-20T16-53-00.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 20 T16 53 00. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-20T16-54-45.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 20 T16 54 45. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-20T17-37-37.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 20 T17 37 37. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-20T17-58-15.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 20 T17 58 15. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-20T18-25-55.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 20 T18 25 55. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-20T19-37-12.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 20 T19 37 12. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-20T19-39-29.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 20 T19 39 29. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-20T19-57-54.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 20 T19 57 54. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-20T20-15-30.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 20 T20 15 30. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-20T20-24-11.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 20 T20 24 11. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-23T08-05-05.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 23 T08 05 05. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-23T08-08-02.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 23 T08 08 02. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-23T08-23-03.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 23 T08 23 03. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-23T08-25-27.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 23 T08 25 27. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-23T09-46-41.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 23 T09 46 41. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-23T10-11-45.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 23 T10 11 45. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-23T11-03-34.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 23 T11 03 34. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-23T12-27-46.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 23 T12 27 46. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-23T12-29-31.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 23 T12 29 31. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-23T12-47-57.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 23 T12 47 57. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-23T12-49-46.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 23 T12 49 46. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-24T08-40-27.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 24 T08 40 27. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-24T10-06-12.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 24 T10 06 12. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-24T10-39-32.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 24 T10 39 32. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-25T09-22-35.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 25 T09 22 35. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-25T09-24-17.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 25 T09 24 17. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-27T14-10-38.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 27 T14 10 38. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-27T14-12-33.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 27 T14 12 33. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-28T04-40-28.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 28 T04 40 28. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-28T04-51-57.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 28 T04 51 57. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-28T04-54-07.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 28 T04 54 07. | not linked |
| `agents/browser-qa/reports/qa-report-2026-03-28T07-04-36.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 03 28 T07 04 36. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-09T10-27-55.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 09 T10 27 55. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-09T10-29-52.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 09 T10 29 52. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-09T10-31-25.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 09 T10 31 25. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-09T11-37-04.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 09 T11 37 04. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-10T07-50-11.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 10 T07 50 11. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-10T08-04-13.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 10 T08 04 13. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-10T08-13-22.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 10 T08 13 22. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-10T08-16-19.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 10 T08 16 19. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-10T09-47-55.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 10 T09 47 55. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-10T09-52-37.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 10 T09 52 37. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-10T11-18-06.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 10 T11 18 06. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-10T11-23-18.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 10 T11 23 18. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-10T13-12-59.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 10 T13 12 59. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-10T17-14-19.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 10 T17 14 19. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-11T03-15-40.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 11 T03 15 40. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-11T04-03-47.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 11 T04 03 47. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-11T05-08-58.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 11 T05 08 58. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-11T18-06-35.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 11 T18 06 35. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-11T19-10-39.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 11 T19 10 39. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-12T14-34-59.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 12 T14 34 59. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-12T14-36-59.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 12 T14 36 59. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-12T15-04-16.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 12 T15 04 16. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-12T15-21-46.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 12 T15 21 46. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-13T10-42-47.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 13 T10 42 47. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-14T16-15-57.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 14 T16 15 57. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-15T13-51-58.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 15 T13 51 58. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T05-17-12.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T05 17 12. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T05-29-36.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T05 29 36. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T07-35-29.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T07 35 29. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T07-49-23.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T07 49 23. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T08-02-30.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T08 02 30. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T08-23-25.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T08 23 25. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T08-53-42.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T08 53 42. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T08-57-30.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T08 57 30. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T09-23-32.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T09 23 32. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T09-27-14.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T09 27 14. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T09-37-47.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T09 37 47. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T10-48-29.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T10 48 29. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T11-08-36.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T11 08 36. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T11-17-04.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T11 17 04. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T11-32-55.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T11 32 55. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T11-35-26.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T11 35 26. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T11-48-13.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T11 48 13. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T11-55-53.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T11 55 53. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T12-03-07.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T12 03 07. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T14-44-41.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T14 44 41. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T16-57-22.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T16 57 22. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T19-01-09.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T19 01 09. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T19-16-24.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T19 16 24. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-16T19-30-05.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 16 T19 30 05. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-17T08-56-24.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 17 T08 56 24. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-17T09-05-27.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 17 T09 05 27. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-17T09-10-27.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 17 T09 10 27. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-17T09-32-54.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 17 T09 32 54. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-17T09-56-14.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 17 T09 56 14. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-17T10-04-49.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 17 T10 04 49. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-17T10-12-15.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 17 T10 12 15. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-17T13-12-01.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 17 T13 12 01. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-17T13-15-50.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 17 T13 15 50. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-17T13-17-59.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 17 T13 17 59. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-17T13-52-47.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 17 T13 52 47. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-17T13-55-36.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 17 T13 55 36. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-17T14-11-14.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 17 T14 11 14. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-17T14-51-15.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 17 T14 51 15. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-17T16-00-25.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 17 T16 00 25. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-17T16-06-09.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 17 T16 06 09. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-17T16-11-37.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 17 T16 11 37. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-18T03-09-56.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 18 T03 09 56. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-18T03-12-24.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 18 T03 12 24. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-18T03-14-28.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 18 T03 14 28. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-18T03-33-51.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 18 T03 33 51. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-18T03-47-38.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 18 T03 47 38. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-18T04-03-25.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 18 T04 03 25. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-18T04-55-41.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 18 T04 55 41. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-18T11-00-04.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 18 T11 00 04. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-18T12-12-32.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 18 T12 12 32. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-18T13-13-50.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 18 T13 13 50. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-18T14-52-21.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 18 T14 52 21. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-18T16-12-58.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 18 T16 12 58. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-20T06-16-43.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 20 T06 16 43. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-20T11-45-32.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 20 T11 45 32. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-20T11-50-13.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 20 T11 50 13. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-20T11-54-11.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 20 T11 54 11. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-20T12-01-08.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 20 T12 01 08. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-20T12-08-21.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 20 T12 08 21. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-21T04-11-38.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 21 T04 11 38. | not linked |
| `agents/browser-qa/reports/qa-report-2026-04-21T05-34-16.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 04 21 T05 34 16. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-01T04-30-57.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 01 T04 30 57. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-01T04-33-04.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 01 T04 33 04. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-01T04-36-06.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 01 T04 36 06. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-01T04-42-45.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 01 T04 42 45. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-01T04-44-54.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 01 T04 44 54. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-03T09-23-08.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 03 T09 23 08. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-03T11-10-29.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 03 T11 10 29. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-05T05-45-10.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 05 T05 45 10. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-05T05-47-17.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 05 T05 47 17. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-05T06-17-55.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 05 T06 17 55. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-05T08-34-25.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 05 T08 34 25. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-05T10-39-04.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 05 T10 39 04. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-05T10-43-20.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 05 T10 43 20. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-06T05-13-21.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 06 T05 13 21. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-06T11-17-12.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 06 T11 17 12. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-06T11-19-18.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 06 T11 19 18. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-06T13-14-06.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 06 T13 14 06. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-09T14-38-18.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 09 T14 38 18. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-15T16-13-39.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 15 T16 13 39. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-16T05-02-04.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 16 T05 02 04. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-17T10-23-36.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 17 T10 23 36. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-17T11-19-59.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 17 T11 19 59. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-18T05-39-19.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 18 T05 39 19. | not linked |
| `agents/browser-qa/reports/qa-report-2026-05-29T10-30-32.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 05 29 T10 30 32. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-04T05-21-47.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 04 T05 21 47. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-04T05-34-50.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 04 T05 34 50. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-04T06-20-31.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 04 T06 20 31. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-04T06-35-15.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 04 T06 35 15. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-04T08-30-19.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 04 T08 30 19. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-04T09-48-49.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 04 T09 48 49. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-05T05-57-24.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 05 T05 57 24. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-05T17-44-40.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 05 T17 44 40. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-06T08-33-53.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 06 T08 33 53. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-06T09-11-41.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 06 T09 11 41. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-06T11-10-20.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 06 T11 10 20. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-06T11-12-42.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 06 T11 12 42. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-06T11-24-30.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 06 T11 24 30. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-06T13-14-23.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 06 T13 14 23. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-06T13-18-38.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 06 T13 18 38. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-06T13-48-28.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 06 T13 48 28. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-06T13-51-45.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 06 T13 51 45. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-06T14-29-30.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 06 T14 29 30. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-06T14-57-47.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 06 T14 57 47. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-06T16-29-23.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 06 T16 29 23. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-06T16-32-36.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 06 T16 32 36. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-07T11-08-51.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 07 T11 08 51. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-07T11-11-13.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 07 T11 11 13. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-07T11-49-26.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 07 T11 49 26. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-07T11-52-22.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 07 T11 52 22. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-07T13-26-58.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 07 T13 26 58. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-08T12-50-07.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 08 T12 50 07. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-08T14-39-13.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 08 T14 39 13. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-08T16-53-29.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 08 T16 53 29. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-08T16-55-31.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 08 T16 55 31. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-08T18-29-10.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 08 T18 29 10. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-11T17-45-19.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 11 T17 45 19. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-14T13-34-37.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 14 T13 34 37. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-14T13-37-15.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 14 T13 37 15. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-14T15-57-40.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 14 T15 57 40. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-14T16-00-50.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 14 T16 00 50. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-14T16-26-56.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 14 T16 26 56. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-14T16-29-15.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 14 T16 29 15. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-14T16-53-46.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 14 T16 53 46. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-14T16-56-28.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 14 T16 56 28. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-14T18-01-21.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 14 T18 01 21. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-14T19-16-09.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 14 T19 16 09. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-14T20-00-51.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 14 T20 00 51. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-15T03-14-25.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 15 T03 14 25. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-15T03-18-16.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 15 T03 18 16. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-15T03-41-51.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 15 T03 41 51. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-15T03-43-47.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 15 T03 43 47. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-17T04-58-00.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 17 T04 58 00. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-17T05-02-02.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 17 T05 02 02. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-17T08-32-48.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 17 T08 32 48. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-17T08-36-15.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 17 T08 36 15. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-18T10-36-45.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 18 T10 36 45. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-18T10-46-29.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 18 T10 46 29. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-18T11-15-02.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 18 T11 15 02. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-18T11-38-23.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 18 T11 38 23. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-18T11-45-57.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 18 T11 45 57. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-18T13-08-03.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 18 T13 08 03. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-18T13-35-41.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 18 T13 35 41. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-18T15-21-56.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 18 T15 21 56. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-18T18-25-55.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 18 T18 25 55. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-18T18-32-07.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 18 T18 32 07. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-18T19-12-32.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 18 T19 12 32. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-19T14-21-35.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 19 T14 21 35. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-19T14-23-44.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 19 T14 23 44. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-19T14-53-21.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 19 T14 53 21. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-19T14-59-15.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 19 T14 59 15. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-19T15-13-44.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 19 T15 13 44. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-19T15-52-36.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 19 T15 52 36. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-19T15-58-14.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 19 T15 58 14. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-19T18-00-25.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 19 T18 00 25. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-19T19-15-02.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 19 T19 15 02. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-19T19-16-58.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 19 T19 16 58. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-20T09-58-57.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 20 T09 58 57. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-20T10-03-11.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 20 T10 03 11. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-20T10-30-15.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 20 T10 30 15. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-20T10-32-26.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 20 T10 32 26. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-20T10-53-47.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 20 T10 53 47. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-20T10-55-55.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 20 T10 55 55. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-20T13-03-24.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 20 T13 03 24. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-20T13-21-02.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 20 T13 21 02. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-20T13-23-09.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 20 T13 23 09. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-21T14-10-59.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 21 T14 10 59. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-21T14-45-15.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 21 T14 45 15. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-21T16-39-40.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 21 T16 39 40. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-21T16-57-27.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 21 T16 57 27. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-21T18-13-25.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 21 T18 13 25. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-22T08-26-16.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 22 T08 26 16. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-22T09-00-02.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 22 T09 00 02. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-22T09-02-11.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 22 T09 02 11. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-22T13-08-44.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 22 T13 08 44. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-22T13-19-39.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 22 T13 19 39. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-22T17-12-13.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 22 T17 12 13. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-22T17-24-56.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 22 T17 24 56. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-22T17-40-20.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 22 T17 40 20. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-22T18-19-00.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 22 T18 19 00. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-22T18-28-34.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 22 T18 28 34. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-22T18-53-03.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 22 T18 53 03. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-22T19-17-29.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 22 T19 17 29. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-22T19-38-28.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 22 T19 38 28. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-22T21-00-27.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 22 T21 00 27. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-23T03-47-39.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 23 T03 47 39. | not linked |
| `agents/browser-qa/reports/qa-report-2026-06-23T05-27-35.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Report 2026 06 23 T05 27 35. | not linked |
| `agents/browser-qa/reports/qa-summary-2026-03-08T05-38-25.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 08 T05 38 25. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-08T06-21-56.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 08 T06 21 56. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-08T06-34-08.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 08 T06 34 08. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-08T07-51-07.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 08 T07 51 07. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-08T11-25-51.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 08 T11 25 51. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-08T11-26-28.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 08 T11 26 28. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-09T12-54-25.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 09 T12 54 25. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-09T16-58-07.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 09 T16 58 07. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-09T17-44-29.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 09 T17 44 29. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-09T18-17-32.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 09 T18 17 32. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-09T18-21-14.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 09 T18 21 14. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-09T18-23-08.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 09 T18 23 08. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-09T19-31-42.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 09 T19 31 42. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-09T19-33-45.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 09 T19 33 45. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-09T20-10-50.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 09 T20 10 50. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-09T20-12-41.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 09 T20 12 41. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-09T20-41-51.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 09 T20 41 51. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-10T04-44-24.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 10 T04 44 24. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-10T04-48-22.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 10 T04 48 22. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-10T05-14-52.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 10 T05 14 52. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-10T05-16-54.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 10 T05 16 54. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-10T05-55-42.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 10 T05 55 42. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-10T07-35-51.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 10 T07 35 51. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-10T07-37-56.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 10 T07 37 56. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-10T08-41-35.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 10 T08 41 35. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-10T08-43-24.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 10 T08 43 24. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-10T09-03-00.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 10 T09 03 00. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-10T09-04-52.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 10 T09 04 52. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-10T09-23-57.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 10 T09 23 57. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-10T09-57-50.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 10 T09 57 50. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-10T09-59-33.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 10 T09 59 33. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-10T10-01-46.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 10 T10 01 46. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-10T11-01-10.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 10 T11 01 10. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-10T11-03-02.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 10 T11 03 02. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-10T11-05-04.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 10 T11 05 04. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-10T19-16-35.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 10 T19 16 35. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-10T19-18-25.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 10 T19 18 25. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-11T08-29-33.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 11 T08 29 33. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-11T09-31-48.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 11 T09 31 48. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-11T09-36-15.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 11 T09 36 15. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-11T09-56-11.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 11 T09 56 11. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-11T09-58-11.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 11 T09 58 11. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-11T10-42-12.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 11 T10 42 12. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-11T11-13-59.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 11 T11 13 59. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-11T11-17-04.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 11 T11 17 04. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-11T11-24-38.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 11 T11 24 38. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-11T11-36-39.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 11 T11 36 39. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-11T11-40-11.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 11 T11 40 11. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-11T11-44-54.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 11 T11 44 54. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-11T11-46-51.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 11 T11 46 51. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-11T11-51-28.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 11 T11 51 28. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-11T11-54-11.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 11 T11 54 11. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-11T12-51-37.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 11 T12 51 37. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-11T15-04-35.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 11 T15 04 35. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-11T17-10-52.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 11 T17 10 52. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-11T18-20-11.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 11 T18 20 11. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-12T05-12-54.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 12 T05 12 54. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-12T05-14-51.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 12 T05 14 51. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-12T06-48-04.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 12 T06 48 04. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-12T07-03-47.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 12 T07 03 47. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-12T07-05-48.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 12 T07 05 48. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-12T07-13-00.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 12 T07 13 00. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-12T11-08-02.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 12 T11 08 02. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-12T11-42-05.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 12 T11 42 05. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-12T12-22-57.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 12 T12 22 57. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-12T15-06-29.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 12 T15 06 29. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-12T19-02-07.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 12 T19 02 07. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-12T19-05-08.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 12 T19 05 08. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-12T19-10-23.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 12 T19 10 23. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-12T19-24-34.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 12 T19 24 34. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-13T08-07-38.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 13 T08 07 38. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-13T08-11-56.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 13 T08 11 56. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-13T08-13-55.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 13 T08 13 55. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-13T08-18-23.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 13 T08 18 23. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-13T08-24-48.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 13 T08 24 48. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-13T08-28-34.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 13 T08 28 34. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-13T10-44-17.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 13 T10 44 17. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-13T10-46-13.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 13 T10 46 13. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-13T10-48-11.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 13 T10 48 11. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-13T11-51-24.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 13 T11 51 24. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-13T15-07-10.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 13 T15 07 10. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-13T16-30-57.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 13 T16 30 57. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-13T16-35-36.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 13 T16 35 36. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-13T16-39-21.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 13 T16 39 21. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-13T16-44-27.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 13 T16 44 27. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-13T19-31-11.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 13 T19 31 11. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-13T19-48-22.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 13 T19 48 22. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-13T20-23-29.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 13 T20 23 29. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-13T21-06-50.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 13 T21 06 50. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-13T21-11-15.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 13 T21 11 15. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-13T21-29-41.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 13 T21 29 41. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-13T21-40-44.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 13 T21 40 44. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-14T11-12-29.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 14 T11 12 29. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-14T11-14-36.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 14 T11 14 36. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-14T11-18-27.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 14 T11 18 27. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-15T06-24-26.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 15 T06 24 26. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-15T06-31-05.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 15 T06 31 05. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-15T06-41-11.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 15 T06 41 11. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-15T06-47-53.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 15 T06 47 53. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-15T06-50-08.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 15 T06 50 08. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-15T08-35-11.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 15 T08 35 11. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-15T08-47-00.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 15 T08 47 00. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-15T09-10-05.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 15 T09 10 05. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-15T10-23-15.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 15 T10 23 15. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-15T10-56-58.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 15 T10 56 58. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-15T11-01-21.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 15 T11 01 21. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-15T11-04-11.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 15 T11 04 11. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-15T14-09-05.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 15 T14 09 05. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-16T04-16-08.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 16 T04 16 08. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-16T04-18-21.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 16 T04 18 21. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-16T04-29-59.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 16 T04 29 59. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-16T04-34-10.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 16 T04 34 10. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-16T05-27-25.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 16 T05 27 25. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-16T06-05-44.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 16 T06 05 44. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-16T06-07-49.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 16 T06 07 49. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-16T07-35-20.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 16 T07 35 20. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-16T08-35-14.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 16 T08 35 14. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-18T19-08-51.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 18 T19 08 51. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-18T19-42-30.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 18 T19 42 30. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-18T19-53-56.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 18 T19 53 56. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-18T20-33-45.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 18 T20 33 45. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-19T06-13-27.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 19 T06 13 27. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-19T06-38-43.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 19 T06 38 43. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-19T06-40-46.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 19 T06 40 46. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-19T07-53-53.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 19 T07 53 53. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-19T07-55-42.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 19 T07 55 42. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-19T09-36-24.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 19 T09 36 24. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-19T09-38-20.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 19 T09 38 20. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-19T15-58-00.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 19 T15 58 00. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-19T16-04-07.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 19 T16 04 07. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-19T16-06-56.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 19 T16 06 56. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-19T16-10-44.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 19 T16 10 44. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-20T14-50-09.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 20 T14 50 09. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-20T16-53-00.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 20 T16 53 00. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-20T16-54-45.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 20 T16 54 45. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-20T17-37-37.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 20 T17 37 37. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-20T17-58-15.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 20 T17 58 15. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-20T18-25-55.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 20 T18 25 55. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-20T19-37-12.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 20 T19 37 12. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-20T19-39-29.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 20 T19 39 29. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-20T19-57-54.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 20 T19 57 54. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-20T20-15-30.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 20 T20 15 30. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-20T20-24-11.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 20 T20 24 11. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-23T08-05-05.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 23 T08 05 05. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-23T08-08-02.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 23 T08 08 02. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-23T08-23-03.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 23 T08 23 03. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-23T08-25-27.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 23 T08 25 27. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-23T09-46-41.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 23 T09 46 41. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-23T10-11-45.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 23 T10 11 45. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-23T11-03-34.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 23 T11 03 34. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-23T12-27-46.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 23 T12 27 46. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-23T12-29-31.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 23 T12 29 31. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-23T12-47-57.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 23 T12 47 57. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-23T12-49-46.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 23 T12 49 46. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-24T08-40-27.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 24 T08 40 27. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-24T10-06-12.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 24 T10 06 12. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-24T10-39-32.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 24 T10 39 32. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-25T09-22-35.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 25 T09 22 35. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-25T09-24-17.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 25 T09 24 17. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-27T14-10-38.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 27 T14 10 38. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-27T14-12-33.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 27 T14 12 33. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-28T04-40-28.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 28 T04 40 28. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-28T04-51-57.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 28 T04 51 57. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-28T04-54-07.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 28 T04 54 07. | linked |
| `agents/browser-qa/reports/qa-summary-2026-03-28T07-04-36.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 03 28 T07 04 36. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-09T10-27-55.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 09 T10 27 55. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-09T10-29-52.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 09 T10 29 52. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-09T10-31-25.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 09 T10 31 25. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-09T11-37-04.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 09 T11 37 04. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-10T07-50-11.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 10 T07 50 11. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-10T08-04-13.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 10 T08 04 13. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-10T08-13-22.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 10 T08 13 22. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-10T08-16-19.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 10 T08 16 19. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-10T09-47-55.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 10 T09 47 55. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-10T09-52-37.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 10 T09 52 37. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-10T11-18-06.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 10 T11 18 06. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-10T11-23-18.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 10 T11 23 18. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-10T13-12-59.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 10 T13 12 59. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-10T17-14-19.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 10 T17 14 19. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-11T03-15-40.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 11 T03 15 40. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-11T04-03-47.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 11 T04 03 47. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-11T05-08-58.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 11 T05 08 58. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-11T18-06-35.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 11 T18 06 35. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-11T19-10-39.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 11 T19 10 39. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-12T14-34-59.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 12 T14 34 59. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-12T14-36-59.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 12 T14 36 59. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-12T15-04-16.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 12 T15 04 16. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-12T15-21-46.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 12 T15 21 46. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-13T10-42-47.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 13 T10 42 47. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-14T16-15-57.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 14 T16 15 57. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-15T13-51-58.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 15 T13 51 58. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T05-17-12.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T05 17 12. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T05-29-36.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T05 29 36. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T07-35-29.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T07 35 29. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T07-49-23.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T07 49 23. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T08-02-30.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T08 02 30. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T08-23-25.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T08 23 25. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T08-53-42.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T08 53 42. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T08-57-30.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T08 57 30. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T09-23-32.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T09 23 32. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T09-27-14.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T09 27 14. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T09-37-47.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T09 37 47. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T10-48-29.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T10 48 29. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T11-08-36.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T11 08 36. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T11-17-04.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T11 17 04. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T11-32-55.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T11 32 55. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T11-35-26.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T11 35 26. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T11-48-13.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T11 48 13. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T11-55-53.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T11 55 53. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T12-03-07.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T12 03 07. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T14-44-41.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T14 44 41. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T16-57-22.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T16 57 22. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T19-01-09.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T19 01 09. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T19-16-24.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T19 16 24. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-16T19-30-05.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 16 T19 30 05. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-17T08-56-24.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 17 T08 56 24. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-17T09-05-27.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 17 T09 05 27. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-17T09-10-27.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 17 T09 10 27. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-17T09-32-54.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 17 T09 32 54. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-17T09-56-14.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 17 T09 56 14. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-17T10-04-49.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 17 T10 04 49. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-17T10-12-15.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 17 T10 12 15. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-17T13-12-01.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 17 T13 12 01. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-17T13-15-50.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 17 T13 15 50. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-17T13-17-59.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 17 T13 17 59. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-17T13-52-47.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 17 T13 52 47. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-17T13-55-36.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 17 T13 55 36. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-17T14-11-14.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 17 T14 11 14. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-17T14-51-15.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 17 T14 51 15. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-17T16-00-25.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 17 T16 00 25. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-17T16-06-09.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 17 T16 06 09. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-17T16-11-37.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 17 T16 11 37. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-18T03-09-56.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 18 T03 09 56. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-18T03-12-24.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 18 T03 12 24. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-18T03-14-28.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 18 T03 14 28. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-18T03-33-51.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 18 T03 33 51. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-18T03-47-38.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 18 T03 47 38. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-18T04-03-25.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 18 T04 03 25. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-18T04-55-41.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 18 T04 55 41. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-18T11-00-04.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 18 T11 00 04. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-18T12-12-32.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 18 T12 12 32. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-18T13-13-50.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 18 T13 13 50. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-18T14-52-21.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 18 T14 52 21. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-18T16-12-58.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 18 T16 12 58. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-20T06-16-43.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 20 T06 16 43. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-20T11-45-32.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 20 T11 45 32. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-20T11-50-13.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 20 T11 50 13. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-20T11-54-11.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 20 T11 54 11. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-20T12-01-08.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 20 T12 01 08. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-20T12-08-21.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 20 T12 08 21. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-21T04-11-38.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 21 T04 11 38. | linked |
| `agents/browser-qa/reports/qa-summary-2026-04-21T05-34-16.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 04 21 T05 34 16. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-01T04-30-57.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 01 T04 30 57. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-01T04-33-04.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 01 T04 33 04. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-01T04-36-06.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 01 T04 36 06. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-01T04-42-45.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 01 T04 42 45. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-01T04-44-54.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 01 T04 44 54. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-03T09-23-08.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 03 T09 23 08. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-03T11-10-29.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 03 T11 10 29. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-05T05-45-10.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 05 T05 45 10. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-05T05-47-17.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 05 T05 47 17. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-05T06-17-55.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 05 T06 17 55. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-05T08-34-25.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 05 T08 34 25. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-05T10-39-04.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 05 T10 39 04. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-05T10-43-20.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 05 T10 43 20. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-06T05-13-21.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 06 T05 13 21. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-06T11-17-12.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 06 T11 17 12. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-06T11-19-18.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 06 T11 19 18. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-06T13-14-06.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 06 T13 14 06. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-09T14-38-18.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 09 T14 38 18. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-15T16-13-39.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 15 T16 13 39. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-16T05-02-04.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 16 T05 02 04. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-17T10-23-36.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 17 T10 23 36. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-17T11-19-59.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 17 T11 19 59. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-18T05-39-19.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 18 T05 39 19. | linked |
| `agents/browser-qa/reports/qa-summary-2026-05-29T10-30-32.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 05 29 T10 30 32. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-04T05-21-47.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 04 T05 21 47. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-04T05-34-50.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 04 T05 34 50. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-04T06-20-31.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 04 T06 20 31. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-04T06-35-15.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 04 T06 35 15. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-04T08-30-19.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 04 T08 30 19. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-04T09-48-49.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 04 T09 48 49. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-05T05-57-24.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 05 T05 57 24. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-05T17-44-40.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 05 T17 44 40. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-06T08-33-53.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 06 T08 33 53. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-06T09-11-41.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 06 T09 11 41. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-06T11-10-20.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 06 T11 10 20. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-06T11-12-42.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 06 T11 12 42. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-06T11-24-30.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 06 T11 24 30. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-06T13-14-23.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 06 T13 14 23. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-06T13-18-38.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 06 T13 18 38. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-06T13-48-28.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 06 T13 48 28. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-06T13-51-45.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 06 T13 51 45. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-06T14-29-30.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 06 T14 29 30. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-06T14-57-47.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 06 T14 57 47. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-06T16-29-23.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 06 T16 29 23. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-06T16-32-36.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 06 T16 32 36. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-07T11-08-51.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 07 T11 08 51. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-07T11-11-13.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 07 T11 11 13. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-07T11-49-26.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 07 T11 49 26. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-07T11-52-22.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 07 T11 52 22. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-07T13-26-58.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 07 T13 26 58. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-08T12-50-07.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 08 T12 50 07. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-08T14-39-13.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 08 T14 39 13. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-08T16-53-29.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 08 T16 53 29. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-08T16-55-31.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 08 T16 55 31. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-08T18-29-10.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 08 T18 29 10. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-11T17-45-19.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 11 T17 45 19. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-14T13-34-37.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 14 T13 34 37. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-14T13-37-15.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 14 T13 37 15. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-14T15-57-40.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 14 T15 57 40. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-14T16-00-50.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 14 T16 00 50. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-14T16-26-56.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 14 T16 26 56. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-14T16-29-15.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 14 T16 29 15. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-14T16-53-46.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 14 T16 53 46. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-14T16-56-28.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 14 T16 56 28. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-14T18-01-21.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 14 T18 01 21. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-14T19-16-09.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 14 T19 16 09. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-14T20-00-51.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 14 T20 00 51. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-15T03-14-25.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 15 T03 14 25. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-15T03-18-16.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 15 T03 18 16. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-15T03-41-51.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 15 T03 41 51. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-15T03-43-47.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 15 T03 43 47. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-17T04-58-00.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 17 T04 58 00. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-17T05-02-02.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 17 T05 02 02. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-17T08-32-48.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 17 T08 32 48. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-17T08-36-15.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 17 T08 36 15. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-18T10-36-45.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 18 T10 36 45. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-18T10-46-29.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 18 T10 46 29. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-18T11-15-02.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 18 T11 15 02. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-18T11-38-23.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 18 T11 38 23. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-18T11-45-57.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 18 T11 45 57. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-18T13-08-03.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 18 T13 08 03. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-18T13-35-41.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 18 T13 35 41. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-18T15-21-56.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 18 T15 21 56. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-18T18-25-55.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 18 T18 25 55. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-18T18-32-07.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 18 T18 32 07. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-18T19-12-32.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 18 T19 12 32. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-19T14-21-35.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 19 T14 21 35. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-19T14-23-44.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 19 T14 23 44. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-19T14-53-21.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 19 T14 53 21. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-19T14-59-15.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 19 T14 59 15. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-19T15-13-44.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 19 T15 13 44. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-19T15-52-36.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 19 T15 52 36. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-19T15-58-14.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 19 T15 58 14. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-19T18-00-25.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 19 T18 00 25. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-19T19-15-02.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 19 T19 15 02. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-19T19-16-58.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 19 T19 16 58. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-20T09-58-57.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 20 T09 58 57. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-20T10-03-11.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 20 T10 03 11. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-20T10-30-15.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 20 T10 30 15. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-20T10-32-26.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 20 T10 32 26. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-20T10-53-47.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 20 T10 53 47. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-20T10-55-55.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 20 T10 55 55. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-20T13-03-24.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 20 T13 03 24. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-20T13-21-02.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 20 T13 21 02. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-20T13-23-09.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 20 T13 23 09. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-21T14-10-59.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 21 T14 10 59. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-21T14-45-15.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 21 T14 45 15. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-21T16-39-40.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 21 T16 39 40. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-21T16-57-27.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 21 T16 57 27. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-21T18-13-25.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 21 T18 13 25. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-22T08-26-16.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 22 T08 26 16. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-22T09-00-02.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 22 T09 00 02. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-22T09-02-11.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 22 T09 02 11. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-22T13-08-44.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 22 T13 08 44. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-22T13-19-39.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 22 T13 19 39. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-22T17-12-13.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 22 T17 12 13. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-22T17-24-56.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 22 T17 24 56. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-22T17-40-20.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 22 T17 40 20. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-22T18-19-00.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 22 T18 19 00. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-22T18-28-34.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 22 T18 28 34. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-22T18-53-03.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 22 T18 53 03. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-22T19-17-29.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 22 T19 17 29. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-22T19-38-28.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 22 T19 38 28. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-22T21-00-27.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 22 T21 00 27. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-23T03-47-39.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 23 T03 47 39. | linked |
| `agents/browser-qa/reports/qa-summary-2026-06-23T05-27-35.md` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Qa Summary 2026 06 23 T05 27 35. | linked |
| `agents/browser-qa/run.js` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Run. | linked |
| `agents/browser-qa/screenshots/about-desktop.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for About Desktop. | not linked |
| `agents/browser-qa/screenshots/about-mobile.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for About Mobile. | not linked |
| `agents/browser-qa/screenshots/about-tablet.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for About Tablet. | not linked |
| `agents/browser-qa/screenshots/admin-add-inventory.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Add Inventory. | not linked |
| `agents/browser-qa/screenshots/admin-add-property.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Add Property. | not linked |
| `agents/browser-qa/screenshots/admin-address-filled.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Address Filled. | not linked |
| `agents/browser-qa/screenshots/admin-address-step.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Address Step. | not linked |
| `agents/browser-qa/screenshots/admin-address-widget.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Address Widget. | not linked |
| `agents/browser-qa/screenshots/admin-address.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Address. | not linked |
| `agents/browser-qa/screenshots/admin-after-address.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin After Address. | not linked |
| `agents/browser-qa/screenshots/admin-after-login.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin After Login. | not linked |
| `agents/browser-qa/screenshots/admin-after-workflow.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin After Workflow. | not linked |
| `agents/browser-qa/screenshots/admin-check.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Check. | not linked |
| `agents/browser-qa/screenshots/admin-final.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Final. | not linked |
| `agents/browser-qa/screenshots/admin-first-question.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin First Question. | not linked |
| `agents/browser-qa/screenshots/admin-home.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Home. | not linked |
| `agents/browser-qa/screenshots/admin-inventory-list-after.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Inventory List After. | not linked |
| `agents/browser-qa/screenshots/admin-inventory-list.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Inventory List. | not linked |
| `agents/browser-qa/screenshots/admin-login.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Login. | not linked |
| `agents/browser-qa/screenshots/admin-mobile-audit/00-logged-in.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 00 Logged In. | not linked |
| `agents/browser-qa/screenshots/admin-mobile-audit/01-home-viewport.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 01 Home Viewport. | not linked |
| `agents/browser-qa/screenshots/admin-mobile-audit/01-home.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 01 Home. | not linked |
| `agents/browser-qa/screenshots/admin-mobile-audit/02-chats-viewport.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 02 Chats Viewport. | not linked |
| `agents/browser-qa/screenshots/admin-mobile-audit/02-chats.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 02 Chats. | not linked |
| `agents/browser-qa/screenshots/admin-mobile-audit/03-inventory-viewport.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 03 Inventory Viewport. | not linked |
| `agents/browser-qa/screenshots/admin-mobile-audit/03-inventory.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 03 Inventory. | not linked |
| `agents/browser-qa/screenshots/admin-mobile-audit/04-team-viewport.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 04 Team Viewport. | not linked |
| `agents/browser-qa/screenshots/admin-mobile-audit/04-team.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 04 Team. | not linked |
| `agents/browser-qa/screenshots/admin-mobile-audit/05-dashboard-viewport.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 05 Dashboard Viewport. | not linked |
| `agents/browser-qa/screenshots/admin-mobile-audit/05-dashboard.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 05 Dashboard. | not linked |
| `agents/browser-qa/screenshots/admin-mobile-audit/05-menu-drawer.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 05 Menu Drawer. | not linked |
| `agents/browser-qa/screenshots/admin-mobile-audit/06-calendar-viewport.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 06 Calendar Viewport. | not linked |
| `agents/browser-qa/screenshots/admin-mobile-audit/06-calendar.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 06 Calendar. | not linked |
| `agents/browser-qa/screenshots/admin-mobile-audit/07-emails-viewport.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 07 Emails Viewport. | not linked |
| `agents/browser-qa/screenshots/admin-mobile-audit/07-emails.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 07 Emails. | not linked |
| `agents/browser-qa/screenshots/admin-mobile-audit/08-call-log-viewport.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 08 Call Log Viewport. | not linked |
| `agents/browser-qa/screenshots/admin-mobile-audit/08-call-log.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 08 Call Log. | not linked |
| `agents/browser-qa/screenshots/admin-share-contact.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Share Contact. | not linked |
| `agents/browser-qa/screenshots/admin-share-name.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Share Name. | not linked |
| `agents/browser-qa/screenshots/admin-step-1.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Step 1. | not linked |
| `agents/browser-qa/screenshots/admin-step-10.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Step 10. | not linked |
| `agents/browser-qa/screenshots/admin-step-11.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Step 11. | not linked |
| `agents/browser-qa/screenshots/admin-step-2.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Step 2. | not linked |
| `agents/browser-qa/screenshots/admin-step-3.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Step 3. | not linked |
| `agents/browser-qa/screenshots/admin-step-4.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Step 4. | not linked |
| `agents/browser-qa/screenshots/admin-step-5.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Step 5. | not linked |
| `agents/browser-qa/screenshots/admin-step-6.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Step 6. | not linked |
| `agents/browser-qa/screenshots/admin-step-7.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Step 7. | not linked |
| `agents/browser-qa/screenshots/admin-step-8.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Step 8. | not linked |
| `agents/browser-qa/screenshots/admin-step-9.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Step 9. | not linked |
| `agents/browser-qa/screenshots/admin-success-page.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Success Page. | not linked |
| `agents/browser-qa/screenshots/admin-test1-question.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Test1 Question. | not linked |
| `agents/browser-qa/screenshots/blog-desktop.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Blog Desktop. | not linked |
| `agents/browser-qa/screenshots/blog-mobile.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Blog Mobile. | not linked |
| `agents/browser-qa/screenshots/blog-tablet.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Blog Tablet. | not linked |
| `agents/browser-qa/screenshots/contact-desktop.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Contact Desktop. | not linked |
| `agents/browser-qa/screenshots/contact-mobile.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Contact Mobile. | not linked |
| `agents/browser-qa/screenshots/contact-tablet.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Contact Tablet. | not linked |
| `agents/browser-qa/screenshots/custom-desktop.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Custom Desktop. | not linked |
| `agents/browser-qa/screenshots/discovered---compare-desktop.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Compare Desktop. | not linked |
| `agents/browser-qa/screenshots/discovered---compare-mobile.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Compare Mobile. | not linked |
| `agents/browser-qa/screenshots/discovered---compare-tablet.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Compare Tablet. | not linked |
| `agents/browser-qa/screenshots/discovered---faq-desktop.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Faq Desktop. | not linked |
| `agents/browser-qa/screenshots/discovered---faq-mobile.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Faq Mobile. | not linked |
| `agents/browser-qa/screenshots/discovered---faq-tablet.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Faq Tablet. | not linked |
| `agents/browser-qa/screenshots/discovered---login-desktop.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Login Desktop. | not linked |
| `agents/browser-qa/screenshots/discovered---login-mobile.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Login Mobile. | not linked |
| `agents/browser-qa/screenshots/discovered---login-tablet.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Login Tablet. | not linked |
| `agents/browser-qa/screenshots/discovered---post-property-desktop.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Post Property Desktop. | not linked |
| `agents/browser-qa/screenshots/discovered---post-property-mobile.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Post Property Mobile. | not linked |
| `agents/browser-qa/screenshots/discovered---post-property-tablet.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Post Property Tablet. | not linked |
| `agents/browser-qa/screenshots/discovered---privacy-desktop.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Privacy Desktop. | not linked |
| `agents/browser-qa/screenshots/discovered---privacy-mobile.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Privacy Mobile. | not linked |
| `agents/browser-qa/screenshots/discovered---privacy-tablet.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Privacy Tablet. | not linked |
| `agents/browser-qa/screenshots/discovered---terms-desktop.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Terms Desktop. | not linked |
| `agents/browser-qa/screenshots/discovered---terms-mobile.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Terms Mobile. | not linked |
| `agents/browser-qa/screenshots/discovered---terms-tablet.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Terms Tablet. | not linked |
| `agents/browser-qa/screenshots/discovered---tools-area-converter-desktop.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Tools Area Converter Desktop. | not linked |
| `agents/browser-qa/screenshots/discovered---tools-area-converter-mobile.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Tools Area Converter Mobile. | not linked |
| `agents/browser-qa/screenshots/discovered---tools-area-converter-tablet.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Tools Area Converter Tablet. | not linked |
| `agents/browser-qa/screenshots/discovered---tools-emi-calculator-desktop.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Tools Emi Calculator Desktop. | not linked |
| `agents/browser-qa/screenshots/discovered---tools-emi-calculator-mobile.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Tools Emi Calculator Mobile. | not linked |
| `agents/browser-qa/screenshots/discovered---tools-emi-calculator-tablet.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Discovered Tools Emi Calculator Tablet. | not linked |
| `agents/browser-qa/screenshots/final-verify/01-dashboard.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 01 Dashboard. | not linked |
| `agents/browser-qa/screenshots/final-verify/01a-login-filled.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 01a Login Filled. | not linked |
| `agents/browser-qa/screenshots/final-verify/02-inventory-list.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 02 Inventory List. | not linked |
| `agents/browser-qa/screenshots/final-verify/03-edit-initial.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 03 Edit Initial. | not linked |
| `agents/browser-qa/screenshots/final-verify/04-scroll-1.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 04 Scroll 1. | not linked |
| `agents/browser-qa/screenshots/final-verify/04-scroll-2.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 04 Scroll 2. | not linked |
| `agents/browser-qa/screenshots/final-verify/04-scroll-3.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 04 Scroll 3. | not linked |
| `agents/browser-qa/screenshots/final-verify/04-scroll-4.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 04 Scroll 4. | not linked |
| `agents/browser-qa/screenshots/final-verify/04-scroll-5.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 04 Scroll 5. | not linked |
| `agents/browser-qa/screenshots/final-verify/04-scroll-6.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 04 Scroll 6. | not linked |
| `agents/browser-qa/screenshots/final-verify/04-scroll-7.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 04 Scroll 7. | not linked |
| `agents/browser-qa/screenshots/final-verify/04-scroll-8.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 04 Scroll 8. | not linked |
| `agents/browser-qa/screenshots/full-flow-address.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Full Flow Address. | not linked |
| `agents/browser-qa/screenshots/full-flow-after-confirm.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Full Flow After Confirm. | not linked |
| `agents/browser-qa/screenshots/full-flow-filled.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Full Flow Filled. | not linked |
| `agents/browser-qa/screenshots/full-flow-final.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Full Flow Final. | not linked |
| `agents/browser-qa/screenshots/full-flow-summary.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Full Flow Summary. | not linked |
| `agents/browser-qa/screenshots/full-flow-validation.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Full Flow Validation. | not linked |
| `agents/browser-qa/screenshots/homepage-check.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Homepage Check. | not linked |
| `agents/browser-qa/screenshots/homepage-desktop.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Homepage Desktop. | not linked |
| `agents/browser-qa/screenshots/homepage-mobile.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Homepage Mobile. | not linked |
| `agents/browser-qa/screenshots/homepage-tablet.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Homepage Tablet. | not linked |
| `agents/browser-qa/screenshots/inventory-final.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Inventory Final. | not linked |
| `agents/browser-qa/screenshots/inventory-step-1.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Inventory Step 1. | not linked |
| `agents/browser-qa/screenshots/inventory-step-10.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Inventory Step 10. | not linked |
| `agents/browser-qa/screenshots/inventory-step-11.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Inventory Step 11. | not linked |
| `agents/browser-qa/screenshots/inventory-step-2.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Inventory Step 2. | not linked |
| `agents/browser-qa/screenshots/inventory-step-3.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Inventory Step 3. | not linked |
| `agents/browser-qa/screenshots/inventory-step-4.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Inventory Step 4. | not linked |
| `agents/browser-qa/screenshots/inventory-step-5.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Inventory Step 5. | not linked |
| `agents/browser-qa/screenshots/inventory-step-6.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Inventory Step 6. | not linked |
| `agents/browser-qa/screenshots/inventory-step-7.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Inventory Step 7. | not linked |
| `agents/browser-qa/screenshots/inventory-step-8.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Inventory Step 8. | not linked |
| `agents/browser-qa/screenshots/inventory-step-9.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Inventory Step 9. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/01-login-page.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 01 Login Page. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/02-after-login.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 02 After Login. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/03-home-viewport.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 03 Home Viewport. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/04-home-full.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 04 Home Full. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/05-chats-viewport.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 05 Chats Viewport. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/06-chats-full.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 06 Chats Full. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/07-inventory-viewport.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 07 Inventory Viewport. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/08-inventory-full.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 08 Inventory Full. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/09-team-viewport.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 09 Team Viewport. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/10-team-full.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 10 Team Full. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/11-menu-drawer-top.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 11 Menu Drawer Top. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/12-menu-drawer-bottom.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 12 Menu Drawer Bottom. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/13-drawer-calendar-viewport.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 13 Drawer Calendar Viewport. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/14-drawer-calendar-full.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 14 Drawer Calendar Full. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/15-drawer-emails-viewport.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 15 Drawer Emails Viewport. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/16-drawer-emails-full.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 16 Drawer Emails Full. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/17-drawer-call-log-viewport.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 17 Drawer Call Log Viewport. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/18-drawer-call-log-full.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 18 Drawer Call Log Full. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/19-drawer-partner-agents-viewport.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 19 Drawer Partner Agents Viewport. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/20-drawer-partner-agents-full.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 20 Drawer Partner Agents Full. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/21-drawer-tasks-viewport.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 21 Drawer Tasks Viewport. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/22-drawer-tasks-full.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 22 Drawer Tasks Full. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/23-hamburger-menu.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 23 Hamburger Menu. | not linked |
| `agents/browser-qa/screenshots/mobile-full-audit/audit-results.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Audit Results. | not linked |
| `agents/browser-qa/screenshots/mobile-inventory-audit/01-dashboard.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 01 Dashboard. | not linked |
| `agents/browser-qa/screenshots/mobile-inventory-audit/02-inventory-list-viewport.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 02 Inventory List Viewport. | not linked |
| `agents/browser-qa/screenshots/mobile-inventory-audit/03-inventory-list-full.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 03 Inventory List Full. | not linked |
| `agents/browser-qa/screenshots/mobile-inventory-audit/04-inventory-list-bottom.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 04 Inventory List Bottom. | not linked |
| `agents/browser-qa/screenshots/mobile-inventory-audit/05-edit-form-initial.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 05 Edit Form Initial. | not linked |
| `agents/browser-qa/screenshots/mobile-inventory-audit/06-all-sections-expanded-full.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 06 All Sections Expanded Full. | not linked |
| `agents/browser-qa/screenshots/mobile-inventory-audit/07-form-scroll-01.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 07 Form Scroll 01. | not linked |
| `agents/browser-qa/screenshots/mobile-inventory-audit/08-form-scroll-02.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 08 Form Scroll 02. | not linked |
| `agents/browser-qa/screenshots/mobile-inventory-audit/09-form-scroll-03.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 09 Form Scroll 03. | not linked |
| `agents/browser-qa/screenshots/mobile-inventory-audit/10-form-scroll-04.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 10 Form Scroll 04. | not linked |
| `agents/browser-qa/screenshots/mobile-inventory-audit/11-final.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 11 Final. | not linked |
| `agents/browser-qa/screenshots/partner-appointments.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Partner Appointments. | not linked |
| `agents/browser-qa/screenshots/partner-dashboard.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Partner Dashboard. | not linked |
| `agents/browser-qa/screenshots/partner-inventory-form.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Partner Inventory Form. | not linked |
| `agents/browser-qa/screenshots/partner-inventory.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Partner Inventory. | not linked |
| `agents/browser-qa/screenshots/partner-leads.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Partner Leads. | not linked |
| `agents/browser-qa/screenshots/partner-login.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Partner Login. | not linked |
| `agents/browser-qa/screenshots/post-property-page.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Post Property Page. | not linked |
| `agents/browser-qa/screenshots/properties-add-page.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Properties Add Page. | not linked |
| `agents/browser-qa/screenshots/properties-desktop.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Properties Desktop. | not linked |
| `agents/browser-qa/screenshots/properties-mobile.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Properties Mobile. | not linked |
| `agents/browser-qa/screenshots/properties-tablet.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Properties Tablet. | not linked |
| `agents/browser-qa/screenshots/quick-verify/full-page.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Full Page. | not linked |
| `agents/browser-qa/screenshots/quick-verify/initial-view.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Initial View. | not linked |
| `agents/browser-qa/screenshots/quick-verify/scroll-to-assignment.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Scroll To Assignment. | not linked |
| `agents/browser-qa/screenshots/quick-verify/scroll-to-save.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Scroll To Save. | not linked |
| `agents/browser-qa/screenshots/services-desktop.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Services Desktop. | not linked |
| `agents/browser-qa/screenshots/services-mobile.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Services Mobile. | not linked |
| `agents/browser-qa/screenshots/services-tablet.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Services Tablet. | not linked |
| `agents/browser-qa/screenshots/step1-owner-selected.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Step1 Owner Selected. | not linked |
| `agents/browser-qa/screenshots/step10-inventory.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Step10 Inventory. | not linked |
| `agents/browser-qa/screenshots/step11-inventory.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Step11 Inventory. | not linked |
| `agents/browser-qa/screenshots/step2-inventory.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Step2 Inventory. | not linked |
| `agents/browser-qa/screenshots/step3-inventory.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Step3 Inventory. | not linked |
| `agents/browser-qa/screenshots/step4-inventory.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Step4 Inventory. | not linked |
| `agents/browser-qa/screenshots/step5-inventory.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Step5 Inventory. | not linked |
| `agents/browser-qa/screenshots/step6-inventory.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Step6 Inventory. | not linked |
| `agents/browser-qa/screenshots/step7-inventory.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Step7 Inventory. | not linked |
| `agents/browser-qa/screenshots/step8-inventory.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Step8 Inventory. | not linked |
| `agents/browser-qa/screenshots/step9-inventory.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Step9 Inventory. | not linked |
| `agents/browser-qa/screenshots/task-verify-final.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Task Verify Final. | not linked |
| `agents/browser-qa/screenshots/task-verify-mobile-_#calendar.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Task Verify Mobile #Calendar. | not linked |
| `agents/browser-qa/screenshots/task-verify-mobile-_#chats.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Task Verify Mobile #Chats. | not linked |
| `agents/browser-qa/screenshots/task-verify-mobile-_#dashboard.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Task Verify Mobile #Dashboard. | not linked |
| `agents/browser-qa/screenshots/task-verify-mobile-_#deals.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Task Verify Mobile #Deals. | not linked |
| `agents/browser-qa/screenshots/task-verify-mobile-_#inventory.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Task Verify Mobile #Inventory. | not linked |
| `agents/browser-qa/screenshots/task-verify-mobile-_#partners.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Task Verify Mobile #Partners. | not linked |
| `agents/browser-qa/screenshots/task-verify-mobile-_#team.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Task Verify Mobile #Team. | not linked |
| `agents/browser-qa/screenshots/task-verify-mobile-_.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Task Verify Mobile . | not linked |
| `agents/browser-qa/screenshots/task-verify-mobile-_agent_deals.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Task Verify Mobile Agent Deals. | not linked |
| `agents/browser-qa/screenshots/task-verify-mobile-_agent_inventory.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Task Verify Mobile Agent Inventory. | not linked |
| `agents/browser-qa/screenshots/task-verify-mobile-_agent_login.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Task Verify Mobile Agent Login. | not linked |
| `agents/browser-qa/screenshots/task-verify-mobile-_agents.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Task Verify Mobile Agents. | not linked |
| `agents/browser-qa/screenshots/task-verify-mobile-_login.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Task Verify Mobile Login. | not linked |
| `agents/browser-qa/screenshots/task-verify-mobile-_post-property.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Task Verify Mobile Post Property. | not linked |
| `agents/browser-qa/screenshots/task-verify-mobile-_properties.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Task Verify Mobile Properties. | not linked |
| `agents/browser-qa/screenshots/verify-address-step.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Verify Address Step. | not linked |
| `agents/browser-qa/screenshots/verify-after-confirm.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Verify After Confirm. | not linked |
| `agents/browser-qa/screenshots/verify-fields-filled.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Verify Fields Filled. | not linked |
| `agents/browser-qa/screenshots/verify-inventory-fix/00-login-page.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 00 Login Page. | not linked |
| `agents/browser-qa/screenshots/verify-inventory-fix/01-after-login.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 01 After Login. | not linked |
| `agents/browser-qa/screenshots/verify-inventory-fix/02-inventory-list.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 02 Inventory List. | not linked |
| `agents/browser-qa/screenshots/verify-inventory-fix/03-edit-form-full.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 03 Edit Form Full. | not linked |
| `agents/browser-qa/screenshots/verify-inventory-fix/03-edit-form-media-section.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 03 Edit Form Media Section. | not linked |
| `agents/browser-qa/screenshots/verify-inventory-fix/03-no-cards-found.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 03 No Cards Found. | not linked |
| `agents/browser-qa/screenshots/verify-inventory-fix/04-assignment-sharing-section.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 04 Assignment Sharing Section. | not linked |
| `agents/browser-qa/screenshots/verify-inventory-fix/05-save-button-bottom.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 05 Save Button Bottom. | not linked |
| `agents/browser-qa/screenshots/verify-validation-error.png` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Verify Validation Error. | not linked |
| `agents/browser-qa/task-verify.js` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Task Verify. | linked |
| `agents/browser-qa/tasks/99acres-pull-api-integration-sync-status-endpoint-.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for 99acres Pull Api Integration Sync Status Endpoint . | not linked |
| `agents/browser-qa/tasks/added-share-to-client-and-book-visit-buttons-on-in.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Added Share To Client And Book Visit Buttons On In. | not linked |
| `agents/browser-qa/tasks/admin-inventory-redesign-card-with-thumbnails-dual.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Inventory Redesign Card With Thumbnails Dual. | not linked |
| `agents/browser-qa/tasks/admin-panel-leads-section-mobile-card-view-partner.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Panel Leads Section Mobile Card View Partner. | not linked |
| `agents/browser-qa/tasks/admin-panel-leads-section-ui-redesign-compact-layo.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Panel Leads Section Ui Redesign Compact Layo. | not linked |
| `agents/browser-qa/tasks/admin-panel-loads-correctly-after-partner-search-u.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Admin Panel Loads Correctly After Partner Search U. | not linked |
| `agents/browser-qa/tasks/backend-fixes-verified-notification-preferences-bu.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Backend Fixes Verified Notification Preferences Bu. | not linked |
| `agents/browser-qa/tasks/backend-phase-a-multi-select-filters-save-count-ne.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Backend Phase A Multi Select Filters Save Count Ne. | not linked |
| `agents/browser-qa/tasks/batch-1-added-4-missing-nav-items-deal-pipeline-pr.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Batch 1 Added 4 Missing Nav Items Deal Pipeline Pr. | not linked |
| `agents/browser-qa/tasks/batch-2-fixed-video-upload-backend-now-accepts-vid.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Batch 2 Fixed Video Upload Backend Now Accepts Vid. | not linked |
| `agents/browser-qa/tasks/batch-3-added-mobilescrollwrapper-to-16-desktop-co.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Batch 3 Added Mobilescrollwrapper To 16 Desktop Co. | not linked |
| `agents/browser-qa/tasks/batch-4-deal-pipeline-mobile-card-view-with-stage-.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Batch 4 Deal Pipeline Mobile Card View With Stage . | not linked |
| `agents/browser-qa/tasks/batch-5-added-403-handling-in-api-client-compact-d.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Batch 5 Added 403 Handling In Api Client Compact D. | not linked |
| `agents/browser-qa/tasks/check-admin-inventory-page-structure-and-functiona.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Check Admin Inventory Page Structure And Functiona. | not linked |
| `agents/browser-qa/tasks/check-all-accordion-section-titles-in-sidebar.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Check All Accordion Section Titles In Sidebar. | not linked |
| `agents/browser-qa/tasks/check-all-filter-dropdowns-and-search-elements-on-.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Check All Filter Dropdowns And Search Elements On . | not linked |
| `agents/browser-qa/tasks/check-if-google-places-input-is-enabled-and-not-sh.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Check If Google Places Input Is Enabled And Not Sh. | not linked |
| `agents/browser-qa/tasks/check-if-master-data-loads-with-scroll-and-longer-.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Check If Master Data Loads With Scroll And Longer . | not linked |
| `agents/browser-qa/tasks/check-property-cards-with-different-selectors-and-.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Check Property Cards With Different Selectors And . | not linked |
| `agents/browser-qa/tasks/check-property-detail-page-elements-what-s-visible.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Check Property Detail Page Elements What S Visible. | not linked |
| `agents/browser-qa/tasks/check-property-listing-page-dropdowns-search-filte.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Check Property Listing Page Dropdowns Search Filte. | not linked |
| `agents/browser-qa/tasks/check-property-listing-page-filters-and-api-connec.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Check Property Listing Page Filters And Api Connec. | not linked |
| `agents/browser-qa/tasks/check-sidebar-visibility-and-accordion-state.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Check Sidebar Visibility And Accordion State. | not linked |
| `agents/browser-qa/tasks/confirm-new-middleman-model-endpoints-are-live.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Confirm New Middleman Model Endpoints Are Live. | not linked |
| `agents/browser-qa/tasks/contact-system-refactor-buyer-tenant-landlord-enum.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Contact System Refactor Buyer Tenant Landlord Enum. | not linked |
| `agents/browser-qa/tasks/count-actual-property-cards-and-check-filter-eleme.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Count Actual Property Cards And Check Filter Eleme. | not linked |
| `agents/browser-qa/tasks/deep-check-of-all-dropdowns-inputs-and-interactive.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Deep Check Of All Dropdowns Inputs And Interactive. | not linked |
| `agents/browser-qa/tasks/deep-check-of-properties-page-content-to-understan.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Deep Check Of Properties Page Content To Understan. | not linked |
| `agents/browser-qa/tasks/deploy-log.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Deploy Log. | not linked |
| `agents/browser-qa/tasks/deployed-6-new-agents-payment-razorpay-notificatio.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Deployed 6 New Agents Payment Razorpay Notificatio. | not linked |
| `agents/browser-qa/tasks/example-task.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Example Task. | not linked |
| `agents/browser-qa/tasks/final-comprehensive-verification-of-all-fixes-on-t.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Final Comprehensive Verification Of All Fixes On T. | not linked |
| `agents/browser-qa/tasks/fixed-agent-deals-form-ui-text-visibility-error-di.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Fixed Agent Deals Form Ui Text Visibility Error Di. | not linked |
| `agents/browser-qa/tasks/fixed-b3-facing-underscore-b5-address-title-case-b.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Fixed B3 Facing Underscore B5 Address Title Case B. | not linked |
| `agents/browser-qa/tasks/fixed-layout-overflow-issues-on-homepage-trustbadg.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Fixed Layout Overflow Issues On Homepage Trustbadg. | not linked |
| `agents/browser-qa/tasks/fixed-login-page-horizontal-overflow-by-adding-ove.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Fixed Login Page Horizontal Overflow By Adding Ove. | not linked |
| `agents/browser-qa/tasks/fixed-sidebar-property-type-categories-from-db-res.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Fixed Sidebar Property Type Categories From Db Res. | not linked |
| `agents/browser-qa/tasks/fixed-sw-update-loop-in-main-tsx-replaced-raw-axio.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Fixed Sw Update Loop In Main Tsx Replaced Raw Axio. | not linked |
| `agents/browser-qa/tasks/fixed-whatsapp-lead-data-gap-buyer-workflow-engine.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Fixed Whatsapp Lead Data Gap Buyer Workflow Engine. | not linked |
| `agents/browser-qa/tasks/fresh-verification-of-all-property-page-fixes-afte.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Fresh Verification Of All Property Page Fixes Afte. | not linked |
| `agents/browser-qa/tasks/full-inventory-edit-ui-overhaul-admin-edit-modal-w.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Full Inventory Edit Ui Overhaul Admin Edit Modal W. | not linked |
| `agents/browser-qa/tasks/full-leads-section-check-verify-all-leads-load-no-.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Full Leads Section Check Verify All Leads Load No . | not linked |
| `agents/browser-qa/tasks/full-mobile-flow-check-all-nav-items-reachable-no-.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Full Mobile Flow Check All Nav Items Reachable No . | not linked |
| `agents/browser-qa/tasks/full-ui-ux-improvement-buy-rent-segmented-control-.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Full Ui Ux Improvement Buy Rent Segmented Control . | not linked |
| `agents/browser-qa/tasks/hardiq-partner-agent-account-created-meenakshi-lin.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Hardiq Partner Agent Account Created Meenakshi Lin. | not linked |
| `agents/browser-qa/tasks/homepage-hero-search-featured-properties-stats-tes.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Homepage Hero Search Featured Properties Stats Tes. | not linked |
| `agents/browser-qa/tasks/homepage-search-bar-replaced-ai-chat-popup-with-re.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Homepage Search Bar Replaced Ai Chat Popup With Re. | not linked |
| `agents/browser-qa/tasks/inventory-edit-modal-save-save-exit-buttons-owner-.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Inventory Edit Modal Save Save Exit Buttons Owner . | not linked |
| `agents/browser-qa/tasks/inventory-wizard-backend-media-upload-endpoint-dep.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Inventory Wizard Backend Media Upload Endpoint Dep. | not linked |
| `agents/browser-qa/tasks/inventory-wizard-with-google-places-source-trackin.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Inventory Wizard With Google Places Source Trackin. | not linked |
| `agents/browser-qa/tasks/last-task.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Last Task. | not linked |
| `agents/browser-qa/tasks/lead-bugs-fixed-transactiontype-sale-rent-contact-.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Lead Bugs Fixed Transactiontype Sale Rent Contact . | not linked |
| `agents/browser-qa/tasks/lead-matching-fixed-bhk-hard-filter-removed-99acre.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Lead Matching Fixed Bhk Hard Filter Removed 99acre. | not linked |
| `agents/browser-qa/tasks/leads-upgrade-4-new-backend-endpoints-externallead.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Leads Upgrade 4 New Backend Endpoints Externallead. | not linked |
| `agents/browser-qa/tasks/leads-upgrade-backend-endpoints-live-401-correct-n.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Leads Upgrade Backend Endpoints Live 401 Correct N. | not linked |
| `agents/browser-qa/tasks/major-property-detail-page-upgrade-cinematic-ken-b.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Major Property Detail Page Upgrade Cinematic Ken B. | not linked |
| `agents/browser-qa/tasks/media-score-column-added-to-inventory-properties-w.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Media Score Column Added To Inventory Properties W. | not linked |
| `agents/browser-qa/tasks/mediagallery-unified-video-photo-toggle-aidescript.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Mediagallery Unified Video Photo Toggle Aidescript. | not linked |
| `agents/browser-qa/tasks/mobile-inventory-edit-form-updated-with-full-featu.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Mobile Inventory Edit Form Updated With Full Featu. | not linked |
| `agents/browser-qa/tasks/partner-agent-buyer-workflow-and-property-showcase.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Partner Agent Buyer Workflow And Property Showcase. | not linked |
| `agents/browser-qa/tasks/partner-agent-deals-pages-agent-deals-list-with-su.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Partner Agent Deals Pages Agent Deals List With Su. | not linked |
| `agents/browser-qa/tasks/partner-agent-inventory-page-rebuilt-as-multi-step.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Partner Agent Inventory Page Rebuilt As Multi Step. | not linked |
| `agents/browser-qa/tasks/partner-agent-search-api-endpoint-for-lead-creatio.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Partner Agent Search Api Endpoint For Lead Creatio. | not linked |
| `agents/browser-qa/tasks/partner-buyer-flow-whatsapp-auto-commits-deals-por.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Partner Buyer Flow Whatsapp Auto Commits Deals Por. | not linked |
| `agents/browser-qa/tasks/partner-inventory-approval-workflow-pending-approv.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Partner Inventory Approval Workflow Pending Approv. | not linked |
| `agents/browser-qa/tasks/partner-ownership-middleman-model-end-to-end-new-b.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Partner Ownership Middleman Model End To End New B. | not linked |
| `agents/browser-qa/tasks/partner-portal-browse-page-loads-my-inventory-tab-.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Partner Portal Browse Page Loads My Inventory Tab . | not linked |
| `agents/browser-qa/tasks/partner-referral-leads-buyer-notifications-smart-a.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Partner Referral Leads Buyer Notifications Smart A. | not linked |
| `agents/browser-qa/tasks/permission-gated-views-load-performance-admin-repo.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Permission Gated Views Load Performance Admin Repo. | not linked |
| `agents/browser-qa/tasks/phase-1-backend-changes-otp-endpoints-assigned-age.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Phase 1 Backend Changes Otp Endpoints Assigned Age. | not linked |
| `agents/browser-qa/tasks/phase-1-lead-management-new-public-lead-requiremen.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Phase 1 Lead Management New Public Lead Requiremen. | not linked |
| `agents/browser-qa/tasks/phase-1-lead-management-system-standardized-lead-c.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Phase 1 Lead Management System Standardized Lead C. | not linked |
| `agents/browser-qa/tasks/phase-2-deal-management-api-routes-admin-deal-pipe.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Phase 2 Deal Management Api Routes Admin Deal Pipe. | not linked |
| `agents/browser-qa/tasks/phase-5-full-deal-management-system-whatsapp-bot-c.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Phase 5 Full Deal Management System Whatsapp Bot C. | not linked |
| `agents/browser-qa/tasks/phase-6-fixes-rate-limit-increased-to-200-for-publ.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Phase 6 Fixes Rate Limit Increased To 200 For Publ. | not linked |
| `agents/browser-qa/tasks/phase-7-1-public-agent-listing-page-agents-and-ind.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Phase 7 1 Public Agent Listing Page Agents And Ind. | not linked |
| `agents/browser-qa/tasks/phase-7-complete-join-agent-registration-agent-log.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Phase 7 Complete Join Agent Registration Agent Log. | not linked |
| `agents/browser-qa/tasks/phase-a-b-fixes-pm2-ecosystem-config-ssr-timeout-g.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Phase A B Fixes Pm2 Ecosystem Config Ssr Timeout G. | not linked |
| `agents/browser-qa/tasks/phase-a-b-website-fixes-deployed-verify-homepage-p.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Phase A B Website Fixes Deployed Verify Homepage P. | not linked |
| `agents/browser-qa/tasks/phase-a-bot-fixes-deployed-a1-stop-free-form-to-ne.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Phase A Bot Fixes Deployed A1 Stop Free Form To Ne. | not linked |
| `agents/browser-qa/tasks/phase-b-property-card-redesign-with-amenities-sche.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Phase B Property Card Redesign With Amenities Sche. | not linked |
| `agents/browser-qa/tasks/phase-c-filter-upgrades-3-tabs-rent-a-property-pro.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Phase C Filter Upgrades 3 Tabs Rent A Property Pro. | not linked |
| `agents/browser-qa/tasks/phase-c-website-group-2-fixes-verify-terms-page-bl.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Phase C Website Group 2 Fixes Verify Terms Page Bl. | not linked |
| `agents/browser-qa/tasks/phase-d-google-places-search-autocomplete-on-prope.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Phase D Google Places Search Autocomplete On Prope. | not linked |
| `agents/browser-qa/tasks/plan-b6-renovated-field-in-public-api-response-and.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Plan B6 Renovated Field In Public Api Response And. | not linked |
| `agents/browser-qa/tasks/production-database-cleanup-inventory-should-be-em.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Production Database Cleanup Inventory Should Be Em. | not linked |
| `agents/browser-qa/tasks/property-detail-page-all-fixes-applied-ken-burns-c.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Property Detail Page All Fixes Applied Ken Burns C. | not linked |
| `agents/browser-qa/tasks/property-detail-page-elements-gallery-images-load-.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Property Detail Page Elements Gallery Images Load . | not linked |
| `agents/browser-qa/tasks/property-detail-page-upgrade-final-verification.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Property Detail Page Upgrade Final Verification. | not linked |
| `agents/browser-qa/tasks/property-detail-page-verify-all-new-components-ren.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Property Detail Page Verify All New Components Ren. | not linked |
| `agents/browser-qa/tasks/property-listing-page-filters.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Property Listing Page Filters. | not linked |
| `agents/browser-qa/tasks/pwa-implementation-for-website-and-admin-panel-wit.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Pwa Implementation For Website And Admin Panel Wit. | not linked |
| `agents/browser-qa/tasks/pwa-implementation-manifest-and-service-worker-for.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Pwa Implementation Manifest And Service Worker For. | not linked |
| `agents/browser-qa/tasks/redesigned-partner-agent-login-page-with-split-scr.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Redesigned Partner Agent Login Page With Split Scr. | not linked |
| `agents/browser-qa/tasks/removed-duplicate-google-places-search-now-only-on.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Removed Duplicate Google Places Search Now Only On. | not linked |
| `agents/browser-qa/tasks/removed-voice-mic-button-from-mobile-admin-panel-s.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Removed Voice Mic Button From Mobile Admin Panel S. | not linked |
| `agents/browser-qa/tasks/replaced-3rd-type-dropdown-with-bhk-configurations.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Replaced 3rd Type Dropdown With Bhk Configurations. | not linked |
| `agents/browser-qa/tasks/replaced-chat-based-inventory-upload-with-modal-wi.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Replaced Chat Based Inventory Upload With Modal Wi. | not linked |
| `agents/browser-qa/tasks/seo-basics-apis-and-page-load-times.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Seo Basics Apis And Page Load Times. | not linked |
| `agents/browser-qa/tasks/sidebar-reorder-property-type-first-with-residenti.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Sidebar Reorder Property Type First With Residenti. | not linked |
| `agents/browser-qa/tasks/test-lead-creation-and-requirements-update-in-admi.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Test Lead Creation And Requirements Update In Admi. | not linked |
| `agents/browser-qa/tasks/tools-contact-projects-compare-pages.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Tools Contact Projects Compare Pages. | not linked |
| `agents/browser-qa/tasks/verify-all-property-page-fixes-filters-bedroom-opt.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Verify All Property Page Fixes Filters Bedroom Opt. | not linked |
| `agents/browser-qa/tasks/verify-backend-document-endpoints-and-classificati.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Verify Backend Document Endpoints And Classificati. | not linked |
| `agents/browser-qa/tasks/verify-batch-2-pwa-no-force-reload-backend-api-hea.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Verify Batch 2 Pwa No Force Reload Backend Api Hea. | not linked |
| `agents/browser-qa/tasks/verify-batch-3-video-filtering-login-responsive-se.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Verify Batch 3 Video Filtering Login Responsive Se. | not linked |
| `agents/browser-qa/tasks/verify-commercial-configs-removed-from-bedroom-fil.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Verify Commercial Configs Removed From Bedroom Fil. | not linked |
| `agents/browser-qa/tasks/verify-google-places-autocomplete-is-working-on-th.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Verify Google Places Autocomplete Is Working On Th. | not linked |
| `agents/browser-qa/tasks/verify-google-places-search-and-nearby-landmarks-e.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Verify Google Places Search And Nearby Landmarks E. | not linked |
| `agents/browser-qa/tasks/verify-new-agent-endpoints-payment-plans-public-fa.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Verify New Agent Endpoints Payment Plans Public Fa. | not linked |
| `agents/browser-qa/tasks/verify-rent-tab-shows-monthly-rent-budget-label-an.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Verify Rent Tab Shows Monthly Rent Budget Label An. | not linked |
| `agents/browser-qa/tasks/verify-stale-build-artifact-fix-website-loads-with.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Verify Stale Build Artifact Fix Website Loads With. | not linked |
| `agents/browser-qa/tasks/verifying-the-new-share-to-client-backend-endpoint.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Verifying The New Share To Client Backend Endpoint. | not linked |
| `agents/browser-qa/tasks/website-admin-and-api-all-healthy-after-plan-a-b-c.json` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Website Admin And Api All Healthy After Plan A B C. | not linked |
| `agents/browser-qa/test-admin-corrections.js` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Test Admin Corrections. | linked |
| `agents/browser-qa/test-admin-inventory.js` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Test Admin Inventory. | linked |
| `agents/browser-qa/test-inventory-flow.js` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Test Inventory Flow. | linked |
| `agents/browser-qa/test-inventory-submit.js` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Test Inventory Submit. | linked |
| `agents/browser-qa/verify-address-fix.js` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Verify Address Fix. | linked |
| `agents/browser-qa/verify-full-flow.js` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Verify Full Flow. | linked |
| `agents/browser-qa/verify-inventory-edit.js` | Browser QA | Browser-based QA script, test fixture, report, screenshot, or support artifact for Verify Inventory Edit. | linked |
| `agents/buyer_workflow/index.ts` | Repository support | Repository configuration, script, data, or support artifact for Index. | linked |
| `agents/buyer_workflow/workflow.md` | Documentation | Repository documentation: Workflow. | linked |
| `agents/call-gateway/node_modules/.package-lock.json` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/call-gateway/node_modules/ws/LICENSE` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/call-gateway/node_modules/ws/README.md` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/call-gateway/node_modules/ws/browser.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/call-gateway/node_modules/ws/index.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/call-gateway/node_modules/ws/lib/buffer-util.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/call-gateway/node_modules/ws/lib/constants.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/call-gateway/node_modules/ws/lib/event-target.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/call-gateway/node_modules/ws/lib/extension.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/call-gateway/node_modules/ws/lib/limiter.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/call-gateway/node_modules/ws/lib/permessage-deflate.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/call-gateway/node_modules/ws/lib/receiver.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/call-gateway/node_modules/ws/lib/sender.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/call-gateway/node_modules/ws/lib/stream.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/call-gateway/node_modules/ws/lib/subprotocol.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/call-gateway/node_modules/ws/lib/validation.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/call-gateway/node_modules/ws/lib/websocket-server.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/call-gateway/node_modules/ws/lib/websocket.js` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/call-gateway/node_modules/ws/package.json` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/call-gateway/node_modules/ws/wrapper.mjs` | Third-party dependency | Vendored dependency artifact; behavior is supplied by its upstream package rather than Realty Pandit application code. | not linked |
| `agents/call-gateway/package-lock.json` | Call gateway support | Call-gateway configuration, dependency, or support artifact for Package Lock. | not linked |
| `agents/call-gateway/package.json` | Call gateway support | Call-gateway configuration, dependency, or support artifact for Package. | linked |
| `agents/call-gateway/src/commands.ts` | Call gateway | Node/WebSocket handset gateway module for Commands call-control or device integration. | linked |
| `agents/call-gateway/src/lines.ts` | Call gateway | Node/WebSocket handset gateway module for Lines call-control or device integration. | linked |
| `agents/call-gateway/src/protocol.ts` | Call gateway | Node/WebSocket handset gateway module for Protocol call-control or device integration. | linked |
| `agents/call-gateway/src/server.ts` | Call gateway | Node/WebSocket handset gateway module for Server call-control or device integration. | linked |
| `agents/call-gateway/test/protocol.test.ts` | Call gateway tests | Protocol or behavior test for Protocol Test. | linked |
| `agents/cleanup/clean-db-remote.js` | Repository support | Repository configuration, script, data, or support artifact for Clean Db Remote. | linked |
| `agents/cleanup/clean-test-data.js` | Repository support | Repository configuration, script, data, or support artifact for Clean Test Data. | linked |
| `agents/connection_api/workflow.md` | Documentation | Repository documentation: Workflow. | linked |
| `agents/dealer_workflow/workflow.md` | Documentation | Repository documentation: Workflow. | linked |
| `agents/deployment/apply-slug-migration.js` | Legacy deployment | Legacy deployment automation or configuration for Apply Slug Migration; superseded operationally by the guarded GitHub release design. | linked |
| `agents/deployment/check-property.js` | Legacy deployment | Legacy deployment automation or configuration for Check Property; superseded operationally by the guarded GitHub release design. | linked |
| `agents/deployment/deploy-agent.js` | Legacy deployment | Legacy deployment automation or configuration for Deploy Agent; superseded operationally by the guarded GitHub release design. | linked |
| `agents/deployment/docker-compose.yml` | Legacy deployment | Legacy deployment automation or configuration for Docker Compose; superseded operationally by the guarded GitHub release design. | not linked |
| `agents/deployment/workflow.md` | Legacy deployment | Legacy deployment automation or configuration for Workflow; superseded operationally by the guarded GitHub release design. | linked |
| `agents/frontend/.gitignore` | CRM support | CRM configuration, static asset, build, or support artifact for . | not linked |
| `agents/frontend/.lighthouserc.json` | CRM support | CRM configuration, static asset, build, or support artifact for  Lighthouserc. | not linked |
| `agents/frontend/README.md` | CRM support | CRM configuration, static asset, build, or support artifact for README. | linked |
| `agents/frontend/deploy/nginx.conf` | CRM support | CRM configuration, static asset, build, or support artifact for Nginx. | not linked |
| `agents/frontend/eslint.config.js` | CRM support | CRM configuration, static asset, build, or support artifact for Eslint Config. | linked |
| `agents/frontend/index.html` | CRM support | CRM configuration, static asset, build, or support artifact for Index. | not linked |
| `agents/frontend/package-lock.json` | CRM dependency metadata | Resolved CRM dependency lockfile for reproducible installs. | not linked |
| `agents/frontend/package.json` | CRM dependency metadata | CRM package manifest defining scripts and dependencies. | linked |
| `agents/frontend/public/icons/icon-192x192.png` | CRM support | CRM configuration, static asset, build, or support artifact for Icon 192x192. | not linked |
| `agents/frontend/public/icons/icon-512x512.png` | CRM support | CRM configuration, static asset, build, or support artifact for Icon 512x512. | not linked |
| `agents/frontend/public/offline.html` | CRM support | CRM configuration, static asset, build, or support artifact for Offline. | not linked |
| `agents/frontend/public/robots.txt` | CRM support | CRM configuration, static asset, build, or support artifact for Robots. | not linked |
| `agents/frontend/public/sw-push.js` | CRM support | CRM configuration, static asset, build, or support artifact for Sw Push. | linked |
| `agents/frontend/public/vite.svg` | CRM support | CRM configuration, static asset, build, or support artifact for Vite. | linked |
| `agents/frontend/scripts/write-release.sh` | CRM support | CRM configuration, static asset, build, or support artifact for Write Release. | linked |
| `agents/frontend/src/App.css` | CRM application | React/Vite CRM module for App application behavior, API integration, state, styling, or utilities. | not linked |
| `agents/frontend/src/App.tsx` | CRM application | React/Vite CRM module for App application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/api/client.ts` | CRM application | React/Vite CRM module for Client application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/assets/react.svg` | CRM application | React/Vite CRM module for React application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/components/AIStatusBadge.tsx` | CRM UI | React CRM component for AIStatus Badge interface and interaction behavior. | linked |
| `agents/frontend/src/components/AddInventory.tsx` | CRM UI | React CRM component for Add Inventory interface and interaction behavior. | linked |
| `agents/frontend/src/components/AddressFields.tsx` | CRM UI | React CRM component for Address Fields interface and interaction behavior. | linked |
| `agents/frontend/src/components/AdvancedAnalytics.tsx` | CRM UI | React CRM component for Advanced Analytics interface and interaction behavior. | linked |
| `agents/frontend/src/components/AgentLogs.tsx` | CRM UI | React CRM component for Agent Logs interface and interaction behavior. | linked |
| `agents/frontend/src/components/AgentOverride.tsx` | CRM UI | React CRM component for Agent Override interface and interaction behavior. | linked |
| `agents/frontend/src/components/BookVisitModal.tsx` | CRM UI | React CRM component for Book Visit Modal interface and interaction behavior. | linked |
| `agents/frontend/src/components/BuyerChatWorkflow.tsx` | CRM UI | React CRM component for Buyer Chat Workflow interface and interaction behavior. | linked |
| `agents/frontend/src/components/CalendarView.tsx` | CRM UI | React CRM component for Calendar View interface and interaction behavior. | linked |
| `agents/frontend/src/components/CallLog.tsx` | CRM UI | React CRM component for Call Log interface and interaction behavior. | linked |
| `agents/frontend/src/components/ChatView.tsx` | CRM UI | React CRM component for Chat View interface and interaction behavior. | linked |
| `agents/frontend/src/components/ChatWorkflow/ChatWorkflow.module.css` | CRM UI | React CRM component for Chat Workflow Module interface and interaction behavior. | not linked |
| `agents/frontend/src/components/ChatWorkflow/ChatWorkflow.tsx` | CRM UI | React CRM component for Chat Workflow interface and interaction behavior. | linked |
| `agents/frontend/src/components/ContactList.tsx` | CRM UI | React CRM component for Contact List interface and interaction behavior. | linked |
| `agents/frontend/src/components/ContactSearchField.tsx` | CRM UI | React CRM component for Contact Search Field interface and interaction behavior. | linked |
| `agents/frontend/src/components/ContactsPage.tsx` | CRM UI | React CRM component for Contacts Page interface and interaction behavior. | linked |
| `agents/frontend/src/components/ConvertToPartnerModal.tsx` | CRM UI | React CRM component for Convert To Partner Modal interface and interaction behavior. | linked |
| `agents/frontend/src/components/CopyChip.tsx` | CRM UI | React CRM component for Copy Chip interface and interaction behavior. | linked |
| `agents/frontend/src/components/DashboardLayout.tsx` | CRM UI | React CRM component for Dashboard Layout interface and interaction behavior. | linked |
| `agents/frontend/src/components/DashboardTabs.tsx` | CRM UI | React CRM component for Dashboard Tabs interface and interaction behavior. | linked |
| `agents/frontend/src/components/DealCloseCommissionDialog.tsx` | CRM UI | React CRM component for Deal Close Commission Dialog interface and interaction behavior. | linked |
| `agents/frontend/src/components/DealPipeline.tsx` | CRM UI | React CRM component for Deal Pipeline interface and interaction behavior. | linked |
| `agents/frontend/src/components/DelayReasonModal.tsx` | CRM UI | React CRM component for Delay Reason Modal interface and interaction behavior. | linked |
| `agents/frontend/src/components/DuplicateAddressWarning.tsx` | CRM UI | React CRM component for Duplicate Address Warning interface and interaction behavior. | linked |
| `agents/frontend/src/components/EmailAccountCard.tsx` | CRM UI | React CRM component for Email Account Card interface and interaction behavior. | linked |
| `agents/frontend/src/components/EmailManagement.tsx` | CRM UI | React CRM component for Email Management interface and interaction behavior. | linked |
| `agents/frontend/src/components/EnrichmentPanel.tsx` | CRM UI | React CRM component for Enrichment Panel interface and interaction behavior. | linked |
| `agents/frontend/src/components/ErrorBoundary.tsx` | CRM UI | React CRM component for Error Boundary interface and interaction behavior. | linked |
| `agents/frontend/src/components/ExternalLeads.tsx` | CRM UI | React CRM component for External Leads interface and interaction behavior. | linked |
| `agents/frontend/src/components/GoogleAccountCard.tsx` | CRM UI | React CRM component for Google Account Card interface and interaction behavior. | linked |
| `agents/frontend/src/components/GooglePlacesInput.tsx` | CRM UI | React CRM component for Google Places Input interface and interaction behavior. | linked |
| `agents/frontend/src/components/InventoryDetailView.tsx` | CRM UI | React CRM component for Inventory Detail View interface and interaction behavior. | linked |
| `agents/frontend/src/components/InventoryList.tsx` | CRM UI | React CRM component for Inventory List interface and interaction behavior. | linked |
| `agents/frontend/src/components/InventoryModal.tsx` | CRM UI | React CRM component for Inventory Modal interface and interaction behavior. | linked |
| `agents/frontend/src/components/InventoryQuickView.tsx` | CRM UI | React CRM component for Inventory Quick View interface and interaction behavior. | linked |
| `agents/frontend/src/components/LeadWorkflowPage.tsx` | CRM UI | React CRM component for Lead Workflow Page interface and interaction behavior. | linked |
| `agents/frontend/src/components/LogActionModal.tsx` | CRM UI | React CRM component for Log Action Modal interface and interaction behavior. | linked |
| `agents/frontend/src/components/LoginPage.tsx` | CRM UI | React CRM component for Login Page interface and interaction behavior. | linked |
| `agents/frontend/src/components/MarkLostModal.tsx` | CRM UI | React CRM component for Mark Lost Modal interface and interaction behavior. | linked |
| `agents/frontend/src/components/MarketingCampaign.tsx` | CRM UI | React CRM component for Marketing Campaign interface and interaction behavior. | linked |
| `agents/frontend/src/components/MyProfile.tsx` | CRM UI | React CRM component for My Profile interface and interaction behavior. | linked |
| `agents/frontend/src/components/MyTeam.tsx` | CRM UI | React CRM component for My Team interface and interaction behavior. | linked |
| `agents/frontend/src/components/NotificationBell.tsx` | CRM UI | React CRM component for Notification Bell interface and interaction behavior. | linked |
| `agents/frontend/src/components/NotificationSettings.tsx` | CRM UI | React CRM component for Notification Settings interface and interaction behavior. | linked |
| `agents/frontend/src/components/ParkingListField.tsx` | CRM UI | React CRM component for Parking List Field interface and interaction behavior. | linked |
| `agents/frontend/src/components/PartnerManagement.tsx` | CRM UI | React CRM component for Partner Management interface and interaction behavior. | linked |
| `agents/frontend/src/components/PartnerProfile.tsx` | CRM UI | React CRM component for Partner Profile interface and interaction behavior. | linked |
| `agents/frontend/src/components/PartnerReassignDialog.tsx` | CRM UI | React CRM component for Partner Reassign Dialog interface and interaction behavior. | linked |
| `agents/frontend/src/components/PartnerSourceAutocomplete.tsx` | CRM UI | React CRM component for Partner Source Autocomplete interface and interaction behavior. | linked |
| `agents/frontend/src/components/PhoneInput.tsx` | CRM UI | React CRM component for Phone Input interface and interaction behavior. | linked |
| `agents/frontend/src/components/PropertyLiveStatus.tsx` | CRM UI | React CRM component for Property Live Status interface and interaction behavior. | linked |
| `agents/frontend/src/components/PropertyMapView.tsx` | CRM UI | React CRM component for Property Map View interface and interaction behavior. | linked |
| `agents/frontend/src/components/PropertyTaxonomy.tsx` | CRM UI | React CRM component for Property Taxonomy interface and interaction behavior. | linked |
| `agents/frontend/src/components/QADashboard.tsx` | CRM UI | React CRM component for QADashboard interface and interaction behavior. | linked |
| `agents/frontend/src/components/QuickCallStrip.tsx` | CRM UI | React CRM component for Quick Call Strip interface and interaction behavior. | linked |
| `agents/frontend/src/components/ReportsView.tsx` | CRM UI | React CRM component for Reports View interface and interaction behavior. | linked |
| `agents/frontend/src/components/SetupPasswordPage.tsx` | CRM UI | React CRM component for Setup Password Page interface and interaction behavior. | linked |
| `agents/frontend/src/components/SharePropertyOptions.tsx` | CRM UI | React CRM component for Share Property Options interface and interaction behavior. | linked |
| `agents/frontend/src/components/ShareToClientModal.tsx` | CRM UI | React CRM component for Share To Client Modal interface and interaction behavior. | linked |
| `agents/frontend/src/components/TaskBoard.tsx` | CRM UI | React CRM component for Task Board interface and interaction behavior. | linked |
| `agents/frontend/src/components/TaxonomyCascade.tsx` | CRM UI | React CRM component for Taxonomy Cascade interface and interaction behavior. | linked |
| `agents/frontend/src/components/TeamDeactivateDialog.tsx` | CRM UI | React CRM component for Team Deactivate Dialog interface and interaction behavior. | linked |
| `agents/frontend/src/components/TeamManagement.tsx` | CRM UI | React CRM component for Team Management interface and interaction behavior. | linked |
| `agents/frontend/src/components/TeamMemberProfile.tsx` | CRM UI | React CRM component for Team Member Profile interface and interaction behavior. | linked |
| `agents/frontend/src/components/VoiceCommands.tsx` | CRM UI | React CRM component for Voice Commands interface and interaction behavior. | linked |
| `agents/frontend/src/components/WhatsAppChatTab.tsx` | CRM UI | React CRM component for Whats App Chat Tab interface and interaction behavior. | linked |
| `agents/frontend/src/components/WorkflowBuilder.tsx` | CRM UI | React CRM component for Workflow Builder interface and interaction behavior. | linked |
| `agents/frontend/src/components/dashboard/LeadIntelligenceDashboard.tsx` | CRM UI | React CRM component for Lead Intelligence Dashboard interface and interaction behavior. | linked |
| `agents/frontend/src/components/dashboard/LeadSourcesDashboard.tsx` | CRM UI | React CRM component for Lead Sources Dashboard interface and interaction behavior. | linked |
| `agents/frontend/src/components/dashboard/MainDashboard.tsx` | CRM UI | React CRM component for Main Dashboard interface and interaction behavior. | linked |
| `agents/frontend/src/components/dashboard/ManagementAlerts.tsx` | CRM UI | React CRM component for Management Alerts interface and interaction behavior. | linked |
| `agents/frontend/src/components/dashboard/MarketTrendsDashboard.tsx` | CRM UI | React CRM component for Market Trends Dashboard interface and interaction behavior. | linked |
| `agents/frontend/src/components/dashboard/PropertyAnalyticsDashboard.tsx` | CRM UI | React CRM component for Property Analytics Dashboard interface and interaction behavior. | linked |
| `agents/frontend/src/components/dashboard/TeamPerformanceDashboard.tsx` | CRM UI | React CRM component for Team Performance Dashboard interface and interaction behavior. | linked |
| `agents/frontend/src/components/dashboard/UserPerformanceDashboard.tsx` | CRM UI | React CRM component for User Performance Dashboard interface and interaction behavior. | linked |
| `agents/frontend/src/components/dashboard/analytics/AsyncState.tsx` | CRM UI | React CRM component for Async State interface and interaction behavior. | linked |
| `agents/frontend/src/components/dashboard/analytics/FilterBar.tsx` | CRM UI | React CRM component for Filter Bar interface and interaction behavior. | linked |
| `agents/frontend/src/components/dashboard/analytics/TargetsEditor.tsx` | CRM UI | React CRM component for Targets Editor interface and interaction behavior. | linked |
| `agents/frontend/src/components/dashboard/analytics/charts.tsx` | CRM UI | React CRM component for Charts interface and interaction behavior. | linked |
| `agents/frontend/src/components/dashboard/analytics/clay.tsx` | CRM UI | React CRM component for Clay interface and interaction behavior. | linked |
| `agents/frontend/src/components/dashboard/analytics/leadData.ts` | CRM UI | React CRM component for Lead Data interface and interaction behavior. | linked |
| `agents/frontend/src/components/deal/CloseWonDialog.tsx` | CRM UI | React CRM component for Close Won Dialog interface and interaction behavior. | linked |
| `agents/frontend/src/components/deal/DealWorkspace.tsx` | CRM UI | React CRM component for Deal Workspace interface and interaction behavior. | linked |
| `agents/frontend/src/components/deal/InventoryFilterCommandBar.tsx` | CRM UI | React CRM component for Inventory Filter Command Bar interface and interaction behavior. | linked |
| `agents/frontend/src/components/deal/LogCallOverlay.tsx` | CRM UI | React CRM component for Log Call Overlay interface and interaction behavior. | linked |
| `agents/frontend/src/components/deal/MatchShareTab.tsx` | CRM UI | React CRM component for Match Share Tab interface and interaction behavior. | linked |
| `agents/frontend/src/components/deal/QualifiedActionsModal.tsx` | CRM UI | React CRM component for Qualified Actions Modal interface and interaction behavior. | linked |
| `agents/frontend/src/components/deal/ReassignModal.tsx` | CRM UI | React CRM component for Reassign Modal interface and interaction behavior. | linked |
| `agents/frontend/src/components/deal/ReminderModal.tsx` | CRM UI | React CRM component for Reminder Modal interface and interaction behavior. | linked |
| `agents/frontend/src/components/deal/RequirementsTab.tsx` | CRM UI | React CRM component for Requirements Tab interface and interaction behavior. | linked |
| `agents/frontend/src/components/deal/SharedTab.tsx` | CRM UI | React CRM component for Shared Tab interface and interaction behavior. | linked |
| `agents/frontend/src/components/deal/TimelineTab.tsx` | CRM UI | React CRM component for Timeline Tab interface and interaction behavior. | linked |
| `agents/frontend/src/components/filters/FilterSheetShared.tsx` | CRM UI | React CRM component for Filter Sheet Shared interface and interaction behavior. | linked |
| `agents/frontend/src/components/inventory/MatchClientsModal.tsx` | CRM UI | React CRM component for Match Clients Modal interface and interaction behavior. | linked |
| `agents/frontend/src/components/leads/BuyerRequirementsForm.tsx` | CRM UI | React CRM component for Buyer Requirements Form interface and interaction behavior. | linked |
| `agents/frontend/src/components/leads/DemandRequirementsForm.tsx` | CRM UI | React CRM component for Demand Requirements Form interface and interaction behavior. | linked |
| `agents/frontend/src/components/leads/LeadCard.tsx` | CRM UI | React CRM component for Lead Card interface and interaction behavior. | linked |
| `agents/frontend/src/components/leads/MatchedPropertiesSection.tsx` | CRM UI | React CRM component for Matched Properties Section interface and interaction behavior. | linked |
| `agents/frontend/src/components/leads/MultiSelectTeam.tsx` | CRM UI | React CRM component for Multi Select Team interface and interaction behavior. | linked |
| `agents/frontend/src/components/mobile/MobileCalendar.tsx` | CRM UI | React CRM component for Mobile Calendar interface and interaction behavior. | linked |
| `agents/frontend/src/components/mobile/MobileChatView.tsx` | CRM UI | React CRM component for Mobile Chat View interface and interaction behavior. | linked |
| `agents/frontend/src/components/mobile/MobileContactList.tsx` | CRM UI | React CRM component for Mobile Contact List interface and interaction behavior. | linked |
| `agents/frontend/src/components/mobile/MobileDashboard.tsx` | CRM UI | React CRM component for Mobile Dashboard interface and interaction behavior. | linked |
| `agents/frontend/src/components/mobile/MobileInventoryEdit.tsx` | CRM UI | React CRM component for Mobile Inventory Edit interface and interaction behavior. | linked |
| `agents/frontend/src/components/mobile/MobileInventoryList.tsx` | CRM UI | React CRM component for Mobile Inventory List interface and interaction behavior. | linked |
| `agents/frontend/src/components/mobile/MobileLayout.tsx` | CRM UI | React CRM component for Mobile Layout interface and interaction behavior. | linked |
| `agents/frontend/src/components/mobile/MobileScrollWrapper.tsx` | CRM UI | React CRM component for Mobile Scroll Wrapper interface and interaction behavior. | linked |
| `agents/frontend/src/components/mobile/MobileSettings.tsx` | CRM UI | React CRM component for Mobile Settings interface and interaction behavior. | linked |
| `agents/frontend/src/components/mobile/MobileTeamView.tsx` | CRM UI | React CRM component for Mobile Team View interface and interaction behavior. | linked |
| `agents/frontend/src/components/ui/ConfirmDialog.tsx` | CRM UI | React CRM component for Confirm Dialog interface and interaction behavior. | linked |
| `agents/frontend/src/components/ui/Toast.tsx` | CRM UI | React CRM component for Toast interface and interaction behavior. | linked |
| `agents/frontend/src/constants/delayReasons.ts` | CRM application | React/Vite CRM module for Delay Reasons application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/constants/lostReasons.ts` | CRM application | React/Vite CRM module for Lost Reasons application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/contexts/AuthContext.tsx` | CRM application | React/Vite CRM module for Auth Context application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/contexts/ConfirmContext.tsx` | CRM application | React/Vite CRM module for Confirm Context application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/contexts/ThemeContext.tsx` | CRM application | React/Vite CRM module for Theme Context application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/contexts/ToastContext.tsx` | CRM application | React/Vite CRM module for Toast Context application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/hooks/useBuyerChatWorkflow.ts` | CRM application | React/Vite CRM module for Use Buyer Chat Workflow application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/hooks/useChatWorkflow.ts` | CRM application | React/Vite CRM module for Use Chat Workflow application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/hooks/useIsMobile.ts` | CRM application | React/Vite CRM module for Use Is Mobile application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/hooks/usePushSubscription.ts` | CRM application | React/Vite CRM module for Use Push Subscription application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/hooks/useWorkflow.ts` | CRM application | React/Vite CRM module for Use Workflow application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/index.css` | CRM application | React/Vite CRM module for Index application behavior, API integration, state, styling, or utilities. | not linked |
| `agents/frontend/src/lib/address.ts` | CRM application | React/Vite CRM module for Address application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/lib/age.ts` | CRM application | React/Vite CRM module for Age application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/lib/analytics.ts` | CRM application | React/Vite CRM module for Analytics application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/lib/api.ts` | CRM application | React/Vite CRM module for Api application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/lib/buildWhatsAppShareText.ts` | CRM application | React/Vite CRM module for Build Whats App Share Text application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/lib/defaultReminder.ts` | CRM application | React/Vite CRM module for Default Reminder application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/lib/drill.ts` | CRM application | React/Vite CRM module for Drill application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/lib/floor.ts` | CRM application | React/Vite CRM module for Floor application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/lib/loadGoogleMaps.ts` | CRM application | React/Vite CRM module for Load Google Maps application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/lib/phone.ts` | CRM application | React/Vite CRM module for Phone application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/lib/specChips.ts` | CRM application | React/Vite CRM module for Spec Chips application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/main.tsx` | CRM application | React/Vite CRM module for Main application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/src/utils/exportHelpers.ts` | CRM application | React/Vite CRM module for Export Helpers application behavior, API integration, state, styling, or utilities. | linked |
| `agents/frontend/tsconfig.app.json` | CRM support | CRM configuration, static asset, build, or support artifact for Tsconfig App. | linked |
| `agents/frontend/tsconfig.json` | CRM support | CRM configuration, static asset, build, or support artifact for Tsconfig. | linked |
| `agents/frontend/tsconfig.node.json` | CRM support | CRM configuration, static asset, build, or support artifact for Tsconfig Node. | linked |
| `agents/frontend/vite.config.ts` | CRM support | CRM configuration, static asset, build, or support artifact for Vite Config. | linked |
| `agents/instagram/run.js` | Repository support | Repository configuration, script, data, or support artifact for Run. | linked |
| `agents/logic_transfer/workflow.md` | Documentation | Repository documentation: Workflow. | linked |
| `agents/mcp-server.js` | Repository support | Repository configuration, script, data, or support artifact for Mcp Server. | linked |
| `agents/meta/run.js` | Repository support | Repository configuration, script, data, or support artifact for Run. | linked |
| `agents/monitor/.gitignore` | Monitoring | Monitoring-related source or configuration for . | not linked |
| `agents/monitor/glitchtip-digest.js` | Monitoring | Monitoring-related source or configuration for Glitchtip Digest. | linked |
| `agents/monitor/register-task.bat` | Monitoring | Monitoring-related source or configuration for Register Task. | not linked |
| `agents/monitor/run.js` | Monitoring | Monitoring-related source or configuration for Run. | linked |
| `agents/notification/run.js` | Repository support | Repository configuration, script, data, or support artifact for Run. | linked |
| `agents/orchestrator.js` | Repository support | Repository configuration, script, data, or support artifact for Orchestrator. | linked |
| `agents/payment/run.js` | Repository support | Repository configuration, script, data, or support artifact for Run. | linked |
| `agents/pipecat/.env.example` | Voice automation | Pipecat voice-service  Env module, dependency, or deployment artifact. | not linked |
| `agents/pipecat/.gitignore` | Voice automation | Pipecat voice-service  module, dependency, or deployment artifact. | not linked |
| `agents/pipecat/Dockerfile` | Voice automation | Pipecat voice-service Dockerfile module, dependency, or deployment artifact. | not linked |
| `agents/pipecat/WHATSAPP_VOICE_BOT_SETUP_PROMPT.md` | Voice automation | Pipecat voice-service WHATSAPP VOICE BOT SETUP PROMPT module, dependency, or deployment artifact. | linked |
| `agents/pipecat/daily_client.py` | Voice automation | Pipecat voice-service Daily Client module, dependency, or deployment artifact. | linked |
| `agents/pipecat/ecosystem.config.js` | Voice automation | Pipecat voice-service Ecosystem Config module, dependency, or deployment artifact. | linked |
| `agents/pipecat/freeswitch/README.md` | Voice automation | Pipecat voice-service README module, dependency, or deployment artifact. | linked |
| `agents/pipecat/freeswitch/docker-compose.yml` | Voice automation | Pipecat voice-service Docker Compose module, dependency, or deployment artifact. | not linked |
| `agents/pipecat/instrument.py` | Voice automation | Pipecat voice-service Instrument module, dependency, or deployment artifact. | linked |
| `agents/pipecat/main.py` | Voice automation | FastAPI/Pipecat voice-service entry point and webhook/runtime integration. | linked |
| `agents/pipecat/pipeline.py` | Voice automation | Pipecat voice-service Pipeline module, dependency, or deployment artifact. | linked |
| `agents/pipecat/prompts/panditji.txt` | Voice automation | Pipecat voice-service Panditji module, dependency, or deployment artifact. | linked |
| `agents/pipecat/prompts/panditji_team_member.txt` | Voice automation | Pipecat voice-service Panditji Team Member module, dependency, or deployment artifact. | not linked |
| `agents/pipecat/requirements.txt` | Voice automation | Pipecat voice-service Requirements module, dependency, or deployment artifact. | not linked |
| `agents/pipecat/scripts/write-release.sh` | Voice automation | Pipecat voice-service Write Release module, dependency, or deployment artifact. | linked |
| `agents/pipecat/sip_server.py.deleted-2026-05-14` | Voice automation | Pipecat voice-service Sip Server Py module, dependency, or deployment artifact. | not linked |
| `agents/pipecat/tools.py` | Voice automation | Pipecat voice-service Tools module, dependency, or deployment artifact. | linked |
| `agents/script_workflow/buyer_scripts.json` | Repository support | Repository configuration, script, data, or support artifact for Buyer Scripts. | not linked |
| `agents/script_workflow/workflow.md` | Documentation | Repository documentation: Workflow. | linked |
| `agents/security/run.js` | Repository support | Repository configuration, script, data, or support artifact for Run. | linked |
| `agents/security/workflow.md` | Documentation | Repository documentation: Workflow. | linked |
| `agents/seller_workflow/workflow.md` | Documentation | Repository documentation: Workflow. | linked |
| `agents/seo/run.js` | Repository support | Repository configuration, script, data, or support artifact for Run. | linked |
| `agents/voice_vapi/fallback.ts` | Repository support | Repository configuration, script, data, or support artifact for Fallback. | linked |
| `agents/voice_vapi/workflow.md` | Documentation | Repository documentation: Workflow. | linked |
| `agents/website/.dockerignore` | Website support | Public website configuration, static asset, build, or support artifact for . | not linked |
| `agents/website/.gitignore` | Website support | Public website configuration, static asset, build, or support artifact for . | not linked |
| `agents/website/.lighthouserc.js` | Website support | Public website configuration, static asset, build, or support artifact for  Lighthouserc. | linked |
| `agents/website/Dockerfile` | Website support | Public website configuration, static asset, build, or support artifact for Dockerfile. | not linked |
| `agents/website/README.md` | Website support | Public website configuration, static asset, build, or support artifact for README. | linked |
| `agents/website/ecosystem.config.js` | Website support | Public website configuration, static asset, build, or support artifact for Ecosystem Config. | linked |
| `agents/website/eslint.config.mjs` | Website support | Public website configuration, static asset, build, or support artifact for Eslint Config. | linked |
| `agents/website/full_test.js` | Website support | Public website configuration, static asset, build, or support artifact for Full Test. | linked |
| `agents/website/next.config.ts` | Website support | Public website configuration, static asset, build, or support artifact for Next Config. | linked |
| `agents/website/package-lock.json` | Website dependency metadata | Resolved website dependency lockfile for reproducible installs. | not linked |
| `agents/website/package.json` | Website dependency metadata | Website package manifest defining scripts and dependencies. | linked |
| `agents/website/postcss.config.mjs` | Website support | Public website configuration, static asset, build, or support artifact for Postcss Config. | linked |
| `agents/website/public/LOGO_PLACEMENT_INSTRUCTIONS.md` | Website support | Public website configuration, static asset, build, or support artifact for LOGO PLACEMENT INSTRUCTIONS. | linked |
| `agents/website/public/favicon.ico` | Website support | Public website configuration, static asset, build, or support artifact for Favicon. | not linked |
| `agents/website/public/file.svg` | Website support | Public website configuration, static asset, build, or support artifact for File. | linked |
| `agents/website/public/globe.svg` | Website support | Public website configuration, static asset, build, or support artifact for Globe. | linked |
| `agents/website/public/grid.svg` | Website support | Public website configuration, static asset, build, or support artifact for Grid. | linked |
| `agents/website/public/icons/icon-192x192.png` | Website support | Public website configuration, static asset, build, or support artifact for Icon 192x192. | not linked |
| `agents/website/public/icons/icon-512x512.png` | Website support | Public website configuration, static asset, build, or support artifact for Icon 512x512. | not linked |
| `agents/website/public/logo.png` | Website support | Public website configuration, static asset, build, or support artifact for Logo. | not linked |
| `agents/website/public/manifest.json` | Website support | Public website configuration, static asset, build, or support artifact for Manifest. | linked |
| `agents/website/public/next.svg` | Website support | Public website configuration, static asset, build, or support artifact for Next. | linked |
| `agents/website/public/screenshot-desktop.png` | Website support | Public website configuration, static asset, build, or support artifact for Screenshot Desktop. | not linked |
| `agents/website/public/screenshot-mobile.png` | Website support | Public website configuration, static asset, build, or support artifact for Screenshot Mobile. | not linked |
| `agents/website/public/sw.js` | Website support | Public website configuration, static asset, build, or support artifact for Sw. | linked |
| `agents/website/public/vercel.svg` | Website support | Public website configuration, static asset, build, or support artifact for Vercel. | not linked |
| `agents/website/public/window.svg` | Website support | Public website configuration, static asset, build, or support artifact for Window. | linked |
| `agents/website/sentry.client.config.ts` | Website support | Public website configuration, static asset, build, or support artifact for Sentry Client Config. | linked |
| `agents/website/sentry.edge.config.ts` | Website support | Public website configuration, static asset, build, or support artifact for Sentry Edge Config. | linked |
| `agents/website/sentry.server.config.ts` | Website support | Public website configuration, static asset, build, or support artifact for Sentry Server Config. | linked |
| `agents/website/src/app/about/layout.tsx` | Public website layout | Next.js layout composition for /about. | linked |
| `agents/website/src/app/about/page.tsx` | Public website route | Next.js public page route for /about. | linked |
| `agents/website/src/app/agent/appointments/page.tsx` | Public website route | Next.js public page route for /agent/appointments. | linked |
| `agents/website/src/app/agent/dashboard/page.tsx` | Public website route | Next.js public page route for /agent/dashboard. | linked |
| `agents/website/src/app/agent/deals/[id]/page.tsx` | Public website route | Next.js public page route for /agent/deals/[id]. | linked |
| `agents/website/src/app/agent/deals/page.tsx` | Public website route | Next.js public page route for /agent/deals. | linked |
| `agents/website/src/app/agent/inventory/browse/page.tsx` | Public website route | Next.js public page route for /agent/inventory/browse. | linked |
| `agents/website/src/app/agent/inventory/page.tsx` | Public website route | Next.js public page route for /agent/inventory. | linked |
| `agents/website/src/app/agent/layout.tsx` | Public website layout | Next.js layout composition for /agent. | linked |
| `agents/website/src/app/agent/leads/page.tsx` | Public website route | Next.js public page route for /agent/leads. | linked |
| `agents/website/src/app/agent/login/page.tsx` | Public website route | Next.js public page route for /agent/login. | linked |
| `agents/website/src/app/agent/subscription/page.tsx` | Public website route | Next.js public page route for /agent/subscription. | linked |
| `agents/website/src/app/agent/team/page.tsx` | Public website route | Next.js public page route for /agent/team. | linked |
| `agents/website/src/app/agents/[id]/page.tsx` | Public website route | Next.js public page route for /agents/[id]. | linked |
| `agents/website/src/app/agents/page.tsx` | Public website route | Next.js public page route for /agents. | linked |
| `agents/website/src/app/blog/[slug]/BlogShareButtons.tsx` | Public website | Next.js module for Blog Share Buttons route, layout, metadata, or page behavior. | linked |
| `agents/website/src/app/blog/[slug]/page.tsx` | Public website route | Next.js public page route for /blog/[slug]. | linked |
| `agents/website/src/app/blog/page.tsx` | Public website route | Next.js public page route for /blog. | linked |
| `agents/website/src/app/builder/appointments/page.tsx` | Public website route | Next.js public page route for /builder/appointments. | linked |
| `agents/website/src/app/builder/dashboard/page.tsx` | Public website route | Next.js public page route for /builder/dashboard. | linked |
| `agents/website/src/app/builder/layout.tsx` | Public website layout | Next.js layout composition for /builder. | linked |
| `agents/website/src/app/builder/leads/page.tsx` | Public website route | Next.js public page route for /builder/leads. | linked |
| `agents/website/src/app/builder/login/page.tsx` | Public website route | Next.js public page route for /builder/login. | linked |
| `agents/website/src/app/builder/projects/[id]/page.tsx` | Public website route | Next.js public page route for /builder/projects/[id]. | linked |
| `agents/website/src/app/builder/projects/new/page.tsx` | Public website route | Next.js public page route for /builder/projects/new. | linked |
| `agents/website/src/app/builder/projects/page.tsx` | Public website route | Next.js public page route for /builder/projects. | linked |
| `agents/website/src/app/builder/subscription/page.tsx` | Public website route | Next.js public page route for /builder/subscription. | linked |
| `agents/website/src/app/compare/layout.tsx` | Public website layout | Next.js layout composition for /compare. | linked |
| `agents/website/src/app/compare/page.tsx` | Public website route | Next.js public page route for /compare. | linked |
| `agents/website/src/app/contact/layout.tsx` | Public website layout | Next.js layout composition for /contact. | linked |
| `agents/website/src/app/contact/page.tsx` | Public website route | Next.js public page route for /contact. | linked |
| `agents/website/src/app/data-deletion/page.tsx` | Public website route | Next.js public page route for /data-deletion. | linked |
| `agents/website/src/app/error.tsx` | Public website | Next.js module for Error route, layout, metadata, or page behavior. | linked |
| `agents/website/src/app/faq/layout.tsx` | Public website layout | Next.js layout composition for /faq. | linked |
| `agents/website/src/app/faq/page.tsx` | Public website route | Next.js public page route for /faq. | linked |
| `agents/website/src/app/favicon.ico` | Public website | Next.js module for Favicon route, layout, metadata, or page behavior. | not linked |
| `agents/website/src/app/global-error.tsx` | Public website | Next.js module for Global Error route, layout, metadata, or page behavior. | linked |
| `agents/website/src/app/globals.css` | Public website | Next.js module for Globals route, layout, metadata, or page behavior. | not linked |
| `agents/website/src/app/join/agent/page.tsx` | Public website route | Next.js public page route for /join/agent. | linked |
| `agents/website/src/app/join/builder/page.tsx` | Public website route | Next.js public page route for /join/builder. | linked |
| `agents/website/src/app/join/page.tsx` | Public website route | Next.js public page route for /join. | linked |
| `agents/website/src/app/layout.tsx` | Public website layout | Next.js layout composition for /. | linked |
| `agents/website/src/app/loading.tsx` | Public website | Next.js module for Loading route, layout, metadata, or page behavior. | linked |
| `agents/website/src/app/login/page.tsx` | Public website route | Next.js public page route for /login. | linked |
| `agents/website/src/app/not-found.tsx` | Public website | Next.js module for Not Found route, layout, metadata, or page behavior. | linked |
| `agents/website/src/app/offline/page.tsx` | Public website route | Next.js public page route for /offline. | linked |
| `agents/website/src/app/page.tsx` | Public website route | Next.js public page route for /. | linked |
| `agents/website/src/app/post-project/page.tsx` | Public website route | Next.js public page route for /post-project. | linked |
| `agents/website/src/app/post-property/page.tsx` | Public website route | Next.js public page route for /post-property. | linked |
| `agents/website/src/app/privacy/page.tsx` | Public website route | Next.js public page route for /privacy. | linked |
| `agents/website/src/app/projects/[id]/page.tsx` | Public website route | Next.js public page route for /projects/[id]. | linked |
| `agents/website/src/app/properties/[id]/PropertyDetailClient.tsx` | Public website | Next.js module for Property Detail Client route, layout, metadata, or page behavior. | linked |
| `agents/website/src/app/properties/[id]/page.tsx` | Public website route | Next.js public page route for /properties/[id]. | linked |
| `agents/website/src/app/properties/in/[city]/CityPageClient.tsx` | Public website | Next.js module for City Page Client route, layout, metadata, or page behavior. | linked |
| `agents/website/src/app/properties/in/[city]/page.tsx` | Public website route | Next.js public page route for /properties/in/[city]. | linked |
| `agents/website/src/app/properties/layout.tsx` | Public website layout | Next.js layout composition for /properties. | linked |
| `agents/website/src/app/properties/page.tsx` | Public website route | Next.js public page route for /properties. | linked |
| `agents/website/src/app/pwa-updater.tsx` | Public website | Next.js module for Pwa Updater route, layout, metadata, or page behavior. | linked |
| `agents/website/src/app/robots.ts` | Public website | Next.js module for Robots route, layout, metadata, or page behavior. | linked |
| `agents/website/src/app/services/layout.tsx` | Public website layout | Next.js layout composition for /services. | linked |
| `agents/website/src/app/services/page.tsx` | Public website route | Next.js public page route for /services. | linked |
| `agents/website/src/app/sitemap.ts` | Public website | Next.js module for Sitemap route, layout, metadata, or page behavior. | linked |
| `agents/website/src/app/terms/page.tsx` | Public website route | Next.js public page route for /terms. | linked |
| `agents/website/src/app/tools/area-converter/page.tsx` | Public website route | Next.js public page route for /tools/area-converter. | linked |
| `agents/website/src/app/tools/emi-calculator/page.tsx` | Public website route | Next.js public page route for /tools/emi-calculator. | linked |
| `agents/website/src/app/tools/layout.tsx` | Public website layout | Next.js layout composition for /tools. | linked |
| `agents/website/src/app/tools/page.tsx` | Public website route | Next.js public page route for /tools. | linked |
| `agents/website/src/app/wishlist/page.tsx` | Public website route | Next.js public page route for /wishlist. | linked |
| `agents/website/src/components/CTASection.tsx` | Public website | Next.js website module for CTASection UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/ContactForm.tsx` | Public website | Next.js website module for Contact Form UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/FeaturedProperties.tsx` | Public website | Next.js website module for Featured Properties UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/Footer.tsx` | Public website | Next.js website module for Footer UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/Hero.tsx` | Public website | Next.js website module for Hero UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/InternalLinks.tsx` | Public website | Next.js website module for Internal Links UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/LeadCapture.tsx` | Public website | Next.js website module for Lead Capture UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/Navbar.tsx` | Public website | Next.js website module for Navbar UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/PropertyCard.tsx` | Public website | Next.js website module for Property Card UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/RequirementCapture.tsx` | Public website | Next.js website module for Requirement Capture UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/StatsCounter.tsx` | Public website | Next.js website module for Stats Counter UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/WhatsAppButton.tsx` | Public website | Next.js website module for Whats App Button UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/agent/ManagerContactBanner.tsx` | Public website | Next.js website module for Manager Contact Banner UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/chat-workflow/ChatBubble.tsx` | Public website | Next.js website module for Chat Bubble UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/chat-workflow/ChatLocationPicker.tsx` | Public website | Next.js website module for Chat Location Picker UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/chat-workflow/ChatMediaUploader.tsx` | Public website | Next.js website module for Chat Media Uploader UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/chat-workflow/ChatProgress.tsx` | Public website | Next.js website module for Chat Progress UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/chat-workflow/ChatSchemaFields.tsx` | Public website | Next.js website module for Chat Schema Fields UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/chat-workflow/ChatSummaryCard.tsx` | Public website | Next.js website module for Chat Summary Card UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/chat-workflow/ChatTaxonomyPicker.tsx` | Public website | Next.js website module for Chat Taxonomy Picker UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/chat-workflow/ChatWorkflow.tsx` | Public website | Next.js website module for Chat Workflow UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/chat-workflow/InlineContactForm.tsx` | Public website | Next.js website module for Inline Contact Form UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/chat-workflow/MultiSelectGrid.tsx` | Public website | Next.js website module for Multi Select Grid UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/chat-workflow/QuickReplies.tsx` | Public website | Next.js website module for Quick Replies UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/chat-workflow/TypingIndicator.tsx` | Public website | Next.js website module for Typing Indicator UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/chat-workflow/WorkflowChatInput.tsx` | Public website | Next.js website module for Workflow Chat Input UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/chat/AIChatModal.tsx` | Public website | Next.js website module for AIChat Modal UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/chat/ChatHeader.tsx` | Public website | Next.js website module for Chat Header UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/chat/ChatInput.tsx` | Public website | Next.js website module for Chat Input UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/chat/ChatMessages.tsx` | Public website | Next.js website module for Chat Messages UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/chat/PropertyChatCard.tsx` | Public website | Next.js website module for Property Chat Card UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/chat/PropertyImageGallery.tsx` | Public website | Next.js website module for Property Image Gallery UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/chat/PropertyMatchCard.tsx` | Public website | Next.js website module for Property Match Card UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/chat/PropertyViewerPanel.tsx` | Public website | Next.js website module for Property Viewer Panel UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/chat/normalizeProperty.ts` | Public website | Next.js website module for Normalize Property UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/chat/usePropertyViewer.ts` | Public website | Next.js website module for Use Property Viewer UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/home/NewProjects.tsx` | Public website | Next.js website module for New Projects UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/home/PropertyCategories.tsx` | Public website | Next.js website module for Property Categories UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/home/PropertyShowcase.tsx` | Public website | Next.js website module for Property Showcase UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/home/ServiceTiles.tsx` | Public website | Next.js website module for Service Tiles UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/home/Testimonials.tsx` | Public website | Next.js website module for Testimonials UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/home/TrustBadges.tsx` | Public website | Next.js website module for Trust Badges UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/home/ValuePropositions.tsx` | Public website | Next.js website module for Value Propositions UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/login/UserLoginModal.tsx` | Public website | Next.js website module for User Login Modal UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/properties/ContactModal.tsx` | Public website | Next.js website module for Contact Modal UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/properties/FilterChips.tsx` | Public website | Next.js website module for Filter Chips UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/properties/PropertyListCard.tsx` | Public website | Next.js website module for Property List Card UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/properties/PropertyPagination.tsx` | Public website | Next.js website module for Property Pagination UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/properties/PropertySidebar.tsx` | Public website | Next.js website module for Property Sidebar UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/properties/PropertySidebarMobile.tsx` | Public website | Next.js website module for Property Sidebar Mobile UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/properties/PropertyToolbar.tsx` | Public website | Next.js website module for Property Toolbar UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/properties/ScheduleVisitModal.tsx` | Public website | Next.js website module for Schedule Visit Modal UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/properties/ShareWhatsAppModal.tsx` | Public website | Next.js website module for Share Whats App Modal UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/property-detail/AIDescription.tsx` | Public website | Next.js website module for AIDescription UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/property-detail/AirbnbImageGrid.tsx` | Public website | Next.js website module for Airbnb Image Grid UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/property-detail/AnimatedSpecsGrid.tsx` | Public website | Next.js website module for Animated Specs Grid UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/property-detail/CompareBar.tsx` | Public website | Next.js website module for Compare Bar UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/property-detail/CompareButton.tsx` | Public website | Next.js website module for Compare Button UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/property-detail/CompareModal.tsx` | Public website | Next.js website module for Compare Modal UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/property-detail/FullscreenLightbox.tsx` | Public website | Next.js website module for Fullscreen Lightbox UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/property-detail/KenBurnsGallery.tsx` | Public website | Next.js website module for Ken Burns Gallery UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/property-detail/MediaGallery.tsx` | Public website | Next.js website module for Media Gallery UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/property-detail/NeighborhoodScores.tsx` | Public website | Next.js website module for Neighborhood Scores UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/property-detail/PhoneRevealButton.tsx` | Public website | Next.js website module for Phone Reveal Button UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/property-detail/PriceValueBadge.tsx` | Public website | Next.js website module for Price Value Badge UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/property-detail/PropertyMap.tsx` | Public website | Next.js website module for Property Map UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/property-detail/ScheduleVisitForm.tsx` | Public website | Next.js website module for Schedule Visit Form UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/property-detail/SmartBreadcrumb.tsx` | Public website | Next.js website module for Smart Breadcrumb UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/property-detail/StickyPriceBar.tsx` | Public website | Next.js website module for Sticky Price Bar UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/property-detail/VirtualTourBadge.tsx` | Public website | Next.js website module for Virtual Tour Badge UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/property-detail/index.ts` | Public website | Next.js website module for Index UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/seo/JsonLd.tsx` | Public website | Next.js website module for Json Ld UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/ui/Accordion.tsx` | Public website | Next.js website module for Accordion UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/ui/Badge.tsx` | Public website | Next.js website module for Badge UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/ui/Button.tsx` | Public website | Next.js website module for Button UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/ui/Card.tsx` | Public website | Next.js website module for Card UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/ui/Carousel.tsx` | Public website | Next.js website module for Carousel UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/ui/Container.tsx` | Public website | Next.js website module for Container UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/ui/Input.tsx` | Public website | Next.js website module for Input UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/ui/Select.tsx` | Public website | Next.js website module for Select UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/ui/Skeleton.tsx` | Public website | Next.js website module for Skeleton UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/ui/Tabs.tsx` | Public website | Next.js website module for Tabs UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/ui/Toast.tsx` | Public website | Next.js website module for Toast UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/workflow/GooglePlacesInput.tsx` | Public website | Next.js website module for Google Places Input UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/workflow/StepConfirmation.tsx` | Public website | Next.js website module for Step Confirmation UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/workflow/StepRenderer.tsx` | Public website | Next.js website module for Step Renderer UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/components/workflow/WorkflowProgress.tsx` | Public website | Next.js website module for Workflow Progress UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/contexts/ThemeContext.tsx` | Public website | Next.js website module for Theme Context UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/contexts/ToastContext.tsx` | Public website | Next.js website module for Toast Context UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/lib/analytics.ts` | Public website | Next.js website module for Analytics UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/lib/api.ts` | Public website | Next.js website module for Api UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/lib/blog-data.ts` | Public website | Next.js website module for Blog Data UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/lib/chatApi.ts` | Public website | Next.js website module for Chat Api UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/lib/constants.ts` | Public website | Next.js website module for Constants UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/lib/floor.ts` | Public website | Next.js website module for Floor UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/lib/propertyUtils.ts` | Public website | Next.js website module for Property Utils UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/lib/seo.ts` | Public website | Next.js website module for Seo UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/lib/specChips.ts` | Public website | Next.js website module for Spec Chips UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/lib/useChatWorkflow.ts` | Public website | Next.js website module for Use Chat Workflow UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/lib/useWorkflow.ts` | Public website | Next.js website module for Use Workflow UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/lib/utils.ts` | Public website | Next.js website module for Utils UI, integration, styling, or shared behavior. | linked |
| `agents/website/src/middleware.ts` | Public website | Next.js website module for Middleware UI, integration, styling, or shared behavior. | linked |
| `agents/website/tsconfig.json` | Website support | Public website configuration, static asset, build, or support artifact for Tsconfig. | linked |
| `agents/whatsapp/templates.json` | Repository support | Repository configuration, script, data, or support artifact for Templates. | not linked |
| `agents/whatsapp/workflow.md` | Documentation | Repository documentation: Workflow. | linked |
| `code-review-graph-20260915T145444Z-1-001.zip` | Repository support | Repository configuration, script, data, or support artifact for Code Review Graph 20260915 T145444 Z 1 001. | not linked |
| `code-review-graphignore` | Repository configuration | Version-control or analysis ignore rules. | not linked |
| `config/api_keys.json` | Repository support | Repository configuration, script, data, or support artifact for Api Keys. | not linked |
| `config/env.json` | Repository support | Repository configuration, script, data, or support artifact for Env. | not linked |
| `config/project.json` | Repository support | Repository configuration, script, data, or support artifact for Project. | not linked |
| `deploy-now.sh` | Repository support | Repository configuration, script, data, or support artifact for Deploy Now. | linked |
| `deploy-to-server.sh` | Repository support | Repository configuration, script, data, or support artifact for Deploy To Server. | linked |
| `deploy.sh` | Repository support | Repository configuration, script, data, or support artifact for Deploy. | linked |
| `deploy/01-setup-server.sh` | Deployment | GitHub-to-Hostinger deployment or rollback automation for 01 Setup Server. | linked |
| `deploy/02-setup-database.sh` | Deployment | GitHub-to-Hostinger deployment or rollback automation for 02 Setup Database. | linked |
| `deploy/03-configure-nginx.sh` | Deployment | GitHub-to-Hostinger deployment or rollback automation for 03 Configure Nginx. | linked |
| `deploy/DEPLOYMENT-GUIDE.md` | Deployment | GitHub-to-Hostinger deployment or rollback automation for DEPLOYMENT GUIDE. | linked |
| `docker-compose.yml` | Infrastructure | Container service composition configuration. | not linked |
| `docs.zip` | Repository support | Repository configuration, script, data, or support artifact for Docs. | not linked |
| `docs/PROJECT_STATUS.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: PROJECT STATUS. | linked |
| `docs/README.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: README. | linked |
| `docs/architecture/admin-panel-map.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Admin Panel Map. | linked |
| `docs/architecture/agent-workflow.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Agent Workflow. | linked |
| `docs/architecture/api-endpoints.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Api Endpoints. | linked |
| `docs/architecture/business-logic.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Business Logic. | linked |
| `docs/architecture/classification-tree.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Classification Tree. | linked |
| `docs/architecture/database-schema.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Database Schema. | linked |
| `docs/architecture/design-system.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Design System. | linked |
| `docs/architecture/frontend-components.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Frontend Components. | linked |
| `docs/architecture/full-reference.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Full Reference. | linked |
| `docs/architecture/integrations.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Integrations. | linked |
| `docs/architecture/inventory-assignment-rules.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Inventory Assignment Rules. | linked |
| `docs/architecture/leads-system.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Leads System. | linked |
| `docs/architecture/llm-and-ai.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Llm And Ai. | linked |
| `docs/architecture/pages-and-routes.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Pages And Routes. | linked |
| `docs/architecture/panel-connections.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Panel Connections. | linked |
| `docs/architecture/system-overview.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: System Overview. | linked |
| `docs/architecture/website-map.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Website Map. | linked |
| `docs/architecture/whatsapp-voice-bot.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Whatsapp Voice Bot. | linked |
| `docs/archive/2026-04-05-bug-fixes.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 05 Bug Fixes. | linked |
| `docs/archive/2026-04-06-architecture-snapshot.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 06 Architecture Snapshot. | linked |
| `docs/archive/2026-04-25-workstream4-progress.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 25 Workstream4 Progress. | linked |
| `docs/archive/2026-07-24-protected-address-rows-review.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 07 24 Protected Address Rows Review. | linked |
| `docs/archive/2026-07-25-staff-as-owner-review-467.csv` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 07 25 Staff As Owner Review 467. | not linked |
| `docs/archive/2026-07-28-owner-flipped-to-partneragent-triage.csv` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 07 28 Owner Flipped To Partneragent Triage. | not linked |
| `docs/archive/2026-07-28-staff-owner-reentry-worklist.csv` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 07 28 Staff Owner Reentry Worklist. | not linked |
| `docs/archive/2026-08-03-99acres-subuser-escalation-email.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 08 03 99acres Subuser Escalation Email. | linked |
| `docs/archive/2026-08-10-99acres-subuser-followup-2.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 08 10 99acres Subuser Followup 2. | linked |
| `docs/archive/BRANDING_INTEGRATION_COMPLETE-snapshot.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: BRANDING INTEGRATION COMPLETE Snapshot. | linked |
| `docs/archive/DEPLOYMENT_AND_INFRASTRUCTURE-snapshot.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: DEPLOYMENT AND INFRASTRUCTURE Snapshot. | linked |
| `docs/archive/ERRORS_AND_ISSUES-snapshot.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: ERRORS AND ISSUES Snapshot. | linked |
| `docs/archive/PROJECT_REPORT-snapshot.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: PROJECT REPORT Snapshot. | linked |
| `docs/archive/PROJECT_STRUCTURE-snapshot.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: PROJECT STRUCTURE Snapshot. | linked |
| `docs/archive/STALE-MASTER_MANUAL.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: STALE MASTER MANUAL. | linked |
| `docs/archive/STALE-PROJECT_KNOWLEDGE.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: STALE PROJECT KNOWLEDGE. | linked |
| `docs/archive/WORK_COMPLETED_2026-02-14.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: WORK COMPLETED 2026 02 14. | linked |
| `docs/archive/partner-agent-system-plan-rough.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Partner Agent System Plan Rough. | linked |
| `docs/backlog/FUTURE_SKILLS.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: FUTURE SKILLS. | linked |
| `docs/backlog/PENDING.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: PENDING. | linked |
| `docs/backlog/whatsapp-staff-templates-to-submit.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Whatsapp Staff Templates To Submit. | linked |
| `docs/claude-memory/README.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: README. | linked |
| `docs/claude-memory/realtypandit/MASTER_OPERATING_RULES.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: MASTER OPERATING RULES. | linked |
| `docs/claude-memory/realtypandit/MEMORY.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: MEMORY. | linked |
| `docs/claude-memory/realtypandit/admin_panel_map.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Admin Panel Map. | linked |
| `docs/claude-memory/realtypandit/agent_workflow.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Agent Workflow. | linked |
| `docs/claude-memory/realtypandit/classification_tree_final.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Classification Tree Final. | linked |
| `docs/claude-memory/realtypandit/deploy_website_realty_user_pm2.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Deploy Website Realty User Pm2. | linked |
| `docs/claude-memory/realtypandit/design_system.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Design System. | linked |
| `docs/claude-memory/realtypandit/feedback_agent_phone_field.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Agent Phone Field. | linked |
| `docs/claude-memory/realtypandit/feedback_ask_before_executing.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Ask Before Executing. | linked |
| `docs/claude-memory/realtypandit/feedback_axios_shared_client.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Axios Shared Client. | linked |
| `docs/claude-memory/realtypandit/feedback_browser_qa.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Browser Qa. | linked |
| `docs/claude-memory/realtypandit/feedback_data_corrections_owned_by_lead_owner.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Data Corrections Owned By Lead Owner. | linked |
| `docs/claude-memory/realtypandit/feedback_dont_underscope_fixes.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Dont Underscope Fixes. | linked |
| `docs/claude-memory/realtypandit/feedback_frontend_build_verify.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Frontend Build Verify. | linked |
| `docs/claude-memory/realtypandit/feedback_glitchtip_instrumentation.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Glitchtip Instrumentation. | linked |
| `docs/claude-memory/realtypandit/feedback_hostinger_ssh_rate_block.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Hostinger Ssh Rate Block. | linked |
| `docs/claude-memory/realtypandit/feedback_inventory_no_classification_relation.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Inventory No Classification Relation. | linked |
| `docs/claude-memory/realtypandit/feedback_investigate_first.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Investigate First. | linked |
| `docs/claude-memory/realtypandit/feedback_jwt_agent_shape.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Jwt Agent Shape. | linked |
| `docs/claude-memory/realtypandit/feedback_lead_assignment_dedup.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Lead Assignment Dedup. | linked |
| `docs/claude-memory/realtypandit/feedback_lead_deal_sync_traps.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Lead Deal Sync Traps. | linked |
| `docs/claude-memory/realtypandit/feedback_legacy_cron_is_dead.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Legacy Cron Is Dead. | linked |
| `docs/claude-memory/realtypandit/feedback_meta_ctw_ads.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Meta Ctw Ads. | linked |
| `docs/claude-memory/realtypandit/feedback_mobile_components.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Mobile Components. | linked |
| `docs/claude-memory/realtypandit/feedback_multi_task_intake.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Multi Task Intake. | linked |
| `docs/claude-memory/realtypandit/feedback_phone_dialable_guard.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Phone Dialable Guard. | linked |
| `docs/claude-memory/realtypandit/feedback_phone_normalization.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Phone Normalization. | linked |
| `docs/claude-memory/realtypandit/feedback_pipecat_vad_guard.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Pipecat Vad Guard. | linked |
| `docs/claude-memory/realtypandit/feedback_poller_intent_budget_trap.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Poller Intent Budget Trap. | linked |
| `docs/claude-memory/realtypandit/feedback_poller_silent_loss.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Poller Silent Loss. | linked |
| `docs/claude-memory/realtypandit/feedback_prisma_column_drop_sweep.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Prisma Column Drop Sweep. | linked |
| `docs/claude-memory/realtypandit/feedback_prisma_enum_as_any.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Prisma Enum As Any. | linked |
| `docs/claude-memory/realtypandit/feedback_prod_backend_paths.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Prod Backend Paths. | linked |
| `docs/claude-memory/realtypandit/feedback_pwa_deploy.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Pwa Deploy. | linked |
| `docs/claude-memory/realtypandit/feedback_pwa_networkonly.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Pwa Networkonly. | linked |
| `docs/claude-memory/realtypandit/feedback_pwa_sw_update_ux.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Pwa Sw Update Ux. | linked |
| `docs/claude-memory/realtypandit/feedback_self_correction.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Self Correction. | linked |
| `docs/claude-memory/realtypandit/feedback_self_improvement.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Self Improvement. | linked |
| `docs/claude-memory/realtypandit/feedback_sentry_v10.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Sentry V10. | linked |
| `docs/claude-memory/realtypandit/feedback_three_mode_protocol.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Three Mode Protocol. | linked |
| `docs/claude-memory/realtypandit/feedback_ui_quality.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Ui Quality. | linked |
| `docs/claude-memory/realtypandit/feedback_verify_before_done.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Verify Before Done. | linked |
| `docs/claude-memory/realtypandit/feedback_visit_models_split.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Visit Models Split. | linked |
| `docs/claude-memory/realtypandit/feedback_webhook_lead_visibility.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Webhook Lead Visibility. | linked |
| `docs/claude-memory/realtypandit/feedback_website_deploy_realty_user.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Website Deploy Realty User. | linked |
| `docs/claude-memory/realtypandit/glitchtip_errors.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Glitchtip Errors. | linked |
| `docs/claude-memory/realtypandit/incident_meta_app_deleted.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Incident Meta App Deleted. | linked |
| `docs/claude-memory/realtypandit/leads_system.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Leads System. | linked |
| `docs/claude-memory/realtypandit/precaution_inventory_media.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Precaution Inventory Media. | linked |
| `docs/claude-memory/realtypandit/project_99acres_gap_recovery_pending.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Project 99acres Gap Recovery Pending. | linked |
| `docs/claude-memory/realtypandit/project_99acres_integration.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Project 99acres Integration. | linked |
| `docs/claude-memory/realtypandit/project_admin_add_inventory_audit.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Project Admin Add Inventory Audit. | linked |
| `docs/claude-memory/realtypandit/project_architecture.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Project Architecture. | linked |
| `docs/claude-memory/realtypandit/project_bot_reply_and_report_overhaul.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Project Bot Reply And Report Overhaul. | linked |
| `docs/claude-memory/realtypandit/project_complete_reference.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Project Complete Reference. | linked |
| `docs/claude-memory/realtypandit/project_csrf_cookie_fix.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Project Csrf Cookie Fix. | linked |
| `docs/claude-memory/realtypandit/project_glitchtip_system.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Project Glitchtip System. | linked |
| `docs/claude-memory/realtypandit/project_google_reminder_sync.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Project Google Reminder Sync. | linked |
| `docs/claude-memory/realtypandit/project_inventory_assignment_rules.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Project Inventory Assignment Rules. | linked |
| `docs/claude-memory/realtypandit/project_magicbricks_integration.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Project Magicbricks Integration. | linked |
| `docs/claude-memory/realtypandit/project_member_self_profile_gap.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Project Member Self Profile Gap. | linked |
| `docs/claude-memory/realtypandit/project_meta_catalog.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Project Meta Catalog. | linked |
| `docs/claude-memory/realtypandit/project_pending_meta_template_utility.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Project Pending Meta Template Utility. | linked |
| `docs/claude-memory/realtypandit/project_team_deactivation.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Project Team Deactivation. | linked |
| `docs/claude-memory/realtypandit/project_voice_bot_training_deferred.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Project Voice Bot Training Deferred. | linked |
| `docs/claude-memory/realtypandit/project_whatsapp_meta_status.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Project Whatsapp Meta Status. | linked |
| `docs/claude-memory/realtypandit/reference_99acres_lead_routing.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference 99acres Lead Routing. | linked |
| `docs/claude-memory/realtypandit/reference_add_inventory_two_renderers.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Add Inventory Two Renderers. | linked |
| `docs/claude-memory/realtypandit/reference_address_society_and_plot_unit.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Address Society And Plot Unit. | linked |
| `docs/claude-memory/realtypandit/reference_admin_frontend_deploy_path.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Admin Frontend Deploy Path. | linked |
| `docs/claude-memory/realtypandit/reference_bullmq_cleanup.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Bullmq Cleanup. | linked |
| `docs/claude-memory/realtypandit/reference_bullmq_cron_ist.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Bullmq Cron Ist. | linked |
| `docs/claude-memory/realtypandit/reference_callback_routing.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Callback Routing. | linked |
| `docs/claude-memory/realtypandit/reference_contact_rekey_cascade.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Contact Rekey Cascade. | linked |
| `docs/claude-memory/realtypandit/reference_ctwa_capi_lead_events.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Ctwa Capi Lead Events. | linked |
| `docs/claude-memory/realtypandit/reference_deal_ai_automation_machine.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Deal Ai Automation Machine. | linked |
| `docs/claude-memory/realtypandit/reference_deal_ai_conversational_card.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Deal Ai Conversational Card. | linked |
| `docs/claude-memory/realtypandit/reference_deal_match_category_fix.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Deal Match Category Fix. | linked |
| `docs/claude-memory/realtypandit/reference_deal_permissions.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Deal Permissions. | linked |
| `docs/claude-memory/realtypandit/reference_deal_reminder.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Deal Reminder. | linked |
| `docs/claude-memory/realtypandit/reference_deal_requirements_save_fix.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Deal Requirements Save Fix. | linked |
| `docs/claude-memory/realtypandit/reference_demand_canonical_sot.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Demand Canonical Sot. | linked |
| `docs/claude-memory/realtypandit/reference_editable_contact_partner_names.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Editable Contact Partner Names. | linked |
| `docs/claude-memory/realtypandit/reference_inventory_classification_mapping.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Inventory Classification Mapping. | linked |
| `docs/claude-memory/realtypandit/reference_inventory_filter_loading_remount.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Inventory Filter Loading Remount. | linked |
| `docs/claude-memory/realtypandit/reference_inventory_search.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Inventory Search. | linked |
| `docs/claude-memory/realtypandit/reference_inventory_share_pdf.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Inventory Share Pdf. | linked |
| `docs/claude-memory/realtypandit/reference_inventory_share_template_fix.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Inventory Share Template Fix. | linked |
| `docs/claude-memory/realtypandit/reference_inventory_specs_sot.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Inventory Specs Sot. | linked |
| `docs/claude-memory/realtypandit/reference_inventory_type_display_and_legacy_map.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Inventory Type Display And Legacy Map. | linked |
| `docs/claude-memory/realtypandit/reference_lead_recycler.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Lead Recycler. | linked |
| `docs/claude-memory/realtypandit/reference_match_intent_and_reflect_fix.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Match Intent And Reflect Fix. | linked |
| `docs/claude-memory/realtypandit/reference_matching_tree_alignment.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Matching Tree Alignment. | linked |
| `docs/claude-memory/realtypandit/reference_meta_ad_performance_log.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Meta Ad Performance Log. | linked |
| `docs/claude-memory/realtypandit/reference_meta_webhooks_live.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Meta Webhooks Live. | linked |
| `docs/claude-memory/realtypandit/reference_new_lead_alerts.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference New Lead Alerts. | linked |
| `docs/claude-memory/realtypandit/reference_origin_accessibility_diagnosis.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Origin Accessibility Diagnosis. | linked |
| `docs/claude-memory/realtypandit/reference_partner_commission_model.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Partner Commission Model. | linked |
| `docs/claude-memory/realtypandit/reference_partner_multi_lead.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Partner Multi Lead. | linked |
| `docs/claude-memory/realtypandit/reference_placeholder_phone_and_admin_fixes_2026-06.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Placeholder Phone And Admin Fixes 2026 06. | linked |
| `docs/claude-memory/realtypandit/reference_pm2_restart_counter.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Pm2 Restart Counter. | linked |
| `docs/claude-memory/realtypandit/reference_portal_lead_location.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Portal Lead Location. | linked |
| `docs/claude-memory/realtypandit/reference_pre_rented_feature.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Pre Rented Feature. | linked |
| `docs/claude-memory/realtypandit/reference_prod_db_backup.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Prod Db Backup. | linked |
| `docs/claude-memory/realtypandit/reference_prod_db_script_pattern.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Prod Db Script Pattern. | linked |
| `docs/claude-memory/realtypandit/reference_property_card_share_flow.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Property Card Share Flow. | linked |
| `docs/claude-memory/realtypandit/reference_property_slug_privacy.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Property Slug Privacy. | linked |
| `docs/claude-memory/realtypandit/reference_public_route_hoist_pattern.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Public Route Hoist Pattern. | linked |
| `docs/claude-memory/realtypandit/reference_qa_scan_false_positives.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Qa Scan False Positives. | linked |
| `docs/claude-memory/realtypandit/reference_reassign_authority.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Reassign Authority. | linked |
| `docs/claude-memory/realtypandit/reference_taxonomy_filters.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Taxonomy Filters. | linked |
| `docs/claude-memory/realtypandit/reference_taxonomy_schema_fields_renderer.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Taxonomy Schema Fields Renderer. | linked |
| `docs/claude-memory/realtypandit/reference_test_tsc_baseline.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Test Tsc Baseline. | linked |
| `docs/claude-memory/realtypandit/reference_website_lead_routing.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Website Lead Routing. | linked |
| `docs/claude-memory/realtypandit/reference_website_leadcapture_taxonomy.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Website Leadcapture Taxonomy. | linked |
| `docs/claude-memory/realtypandit/reference_worktree_fanout.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Reference Worktree Fanout. | linked |
| `docs/claude-memory/realtypandit/skills_master.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Skills Master. | linked |
| `docs/claude-memory/realtypandit/user-roles.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: User Roles. | linked |
| `docs/claude-memory/realtypandit/website_map.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Website Map. | linked |
| `docs/claude-memory/root/MEMORY.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: MEMORY. | linked |
| `docs/claude-memory/root/feedback_skip_code_review_graph.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Skip Code Review Graph. | linked |
| `docs/claude-memory/root/feedback_subagent_overhead.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Feedback Subagent Overhead. | linked |
| `docs/claude-memory/root/user-preferences.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: User Preferences. | linked |
| `docs/claude-memory/workspace-CLAUDE.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Workspace CLAUDE. | linked |
| `docs/decisions/DEC-001-buyer-tenant-terminology.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: DEC 001 Buyer Tenant Terminology. | linked |
| `docs/decisions/DEC-002-inventory-api-contract.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: DEC 002 Inventory Api Contract. | linked |
| `docs/decisions/DEC-003-deal-pipeline-unification.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: DEC 003 Deal Pipeline Unification. | linked |
| `docs/design/2026-07-16-dashboard-redesign-spec.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 07 16 Dashboard Redesign Spec. | linked |
| `docs/investigations/2026-07-15-admin-ui-bugs.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 07 15 Admin Ui Bugs. | linked |
| `docs/investigations/2026-08-07-enterprise-forensic-audit-part1.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 08 07 Enterprise Forensic Audit Part1. | linked |
| `docs/investigations/2026-08-07-enterprise-forensic-audit-part2.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 08 07 Enterprise Forensic Audit Part2. | linked |
| `docs/investigations/2026-08-07-enterprise-forensic-audit-part3.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 08 07 Enterprise Forensic Audit Part3. | linked |
| `docs/investigations/2026-08-11-price-field-mismatch.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 08 11 Price Field Mismatch. | linked |
| `docs/pipeline-analysis/real-chat-findings.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Real Chat Findings. | linked |
| `docs/pipeline-analysis/stage-1-NEW.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Stage 1 NEW. | linked |
| `docs/pipeline-analysis/stage-2-QUALIFIED.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Stage 2 QUALIFIED. | linked |
| `docs/pipeline-analysis/stage-3-VISIT_SCHEDULED.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Stage 3 VISIT SCHEDULED. | linked |
| `docs/pipeline-analysis/stage-4-VISITED.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Stage 4 VISITED. | linked |
| `docs/pipeline-analysis/stage-5-NEGOTIATION.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Stage 5 NEGOTIATION. | linked |
| `docs/plans/2026-04-09-plan-A-leads-fixes-filters.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 09 Plan A Leads Fixes Filters. | linked |
| `docs/plans/2026-04-09-plan-B-inventory-fixes-features.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 09 Plan B Inventory Fixes Features. | linked |
| `docs/plans/2026-04-09-plan-C-ownership-transfer.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 09 Plan C Ownership Transfer. | linked |
| `docs/plans/2026-04-15-glitchtip-error-intelligence.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 15 Glitchtip Error Intelligence. | linked |
| `docs/plans/2026-04-16-master-execution-plan.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 16 Master Execution Plan. | linked |
| `docs/plans/2026-04-17-partner-agent-system-remediation.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 17 Partner Agent System Remediation. | linked |
| `docs/plans/2026-04-18-pipecat-whatsapp-voice-calling.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 18 Pipecat Whatsapp Voice Calling. | linked |
| `docs/plans/2026-04-19-panditji-critical-fixes.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 19 Panditji Critical Fixes. | linked |
| `docs/plans/2026-04-19-panditji-internal-team-member.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 19 Panditji Internal Team Member. | linked |
| `docs/plans/2026-04-19-phase-1-employee-core.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 19 Phase 1 Employee Core. | linked |
| `docs/plans/2026-04-19-phase-2-employee-workflows.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 19 Phase 2 Employee Workflows. | linked |
| `docs/plans/2026-04-20-meta-catalog-whatsapp-flows.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 20 Meta Catalog Whatsapp Flows. | linked |
| `docs/plans/2026-04-20-panditji-voice-performance.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 20 Panditji Voice Performance. | linked |
| `docs/plans/2026-04-20-sw-403-axios-fix.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 20 Sw 403 Axios Fix. | linked |
| `docs/plans/2026-04-23-catalog-fix.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 23 Catalog Fix. | linked |
| `docs/plans/2026-04-24-pipeline-stage-01-new-kra.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 24 Pipeline Stage 01 New Kra. | linked |
| `docs/plans/2026-04-24-pipeline-stage-02-qualified-kra.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 24 Pipeline Stage 02 Qualified Kra. | linked |
| `docs/plans/2026-04-24-pipeline-stage-03-matching-appointment-kra.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 24 Pipeline Stage 03 Matching Appointment Kra. | linked |
| `docs/plans/2026-04-24-pipeline-stage-04-visit-scheduled-kra.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 24 Pipeline Stage 04 Visit Scheduled Kra. | linked |
| `docs/plans/2026-04-24-pipeline-stage-05-visited-kra.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 24 Pipeline Stage 05 Visited Kra. | linked |
| `docs/plans/2026-04-24-pipeline-stage-06-negotiation-kra.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 24 Pipeline Stage 06 Negotiation Kra. | linked |
| `docs/plans/2026-04-25-whatsapp-templates-wiring.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 25 Whatsapp Templates Wiring. | linked |
| `docs/plans/2026-04-28-deal-pipeline-ai-team-coordination.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 28 Deal Pipeline Ai Team Coordination. | linked |
| `docs/plans/2026-04-30-b1-auto-deal-creation-stage-routing.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 30 B1 Auto Deal Creation Stage Routing. | linked |
| `docs/plans/2026-04-30-stage-01-new-ux-redesign.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 30 Stage 01 New Ux Redesign. | linked |
| `docs/plans/2026-05-02-deal-pipeline-ui-ux-overhaul.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 02 Deal Pipeline Ui Ux Overhaul. | linked |
| `docs/plans/2026-05-05-deal-workspace-redesign.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 05 Deal Workspace Redesign. | linked |
| `docs/plans/2026-05-06-deal-workspace-ssot-fix-and-reassign.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 06 Deal Workspace Ssot Fix And Reassign. | linked |
| `docs/plans/2026-05-07-lead-deal-sync-fix.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 07 Lead Deal Sync Fix. | linked |
| `docs/plans/2026-05-11-glitchtip-coverage-plan.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 11 Glitchtip Coverage Plan. | linked |
| `docs/plans/2026-05-12-glitchtip-coverage-shipped.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 12 Glitchtip Coverage Shipped. | linked |
| `docs/plans/2026-05-12-inventory-submit-logout-fix.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 12 Inventory Submit Logout Fix. | linked |
| `docs/plans/2026-05-12-lead-mgmt-cleanup-plan.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 12 Lead Mgmt Cleanup Plan. | linked |
| `docs/plans/2026-05-12-phase5-manual-review-unknowns.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 12 Phase5 Manual Review Unknowns. | linked |
| `docs/plans/2026-05-17-deal-sync-and-welcome-investigation.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 17 Deal Sync And Welcome Investigation. | linked |
| `docs/plans/2026-05-17-duplicate-lead-reassignment.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 17 Duplicate Lead Reassignment. | linked |
| `docs/plans/2026-05-17-website-phone-normalization-fix.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 17 Website Phone Normalization Fix. | linked |
| `docs/plans/2026-05-17-website-visit-not-visible-in-crm.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 17 Website Visit Not Visible In Crm. | linked |
| `docs/plans/2026-05-18-google-calendar-task-reminder-sync.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 18 Google Calendar Task Reminder Sync. | linked |
| `docs/plans/2026-05-18-member-self-profile.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 18 Member Self Profile. | linked |
| `docs/plans/2026-05-19-menu-loop-shared-parser.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 19 Menu Loop Shared Parser. | linked |
| `docs/plans/2026-05-19-report-cadence-and-bot-reply.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 19 Report Cadence And Bot Reply. | linked |
| `docs/plans/2026-05-19-whatsapp-chat-tab.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 19 Whatsapp Chat Tab. | linked |
| `docs/plans/2026-05-23-lead-to-partner-conversion-design.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 23 Lead To Partner Conversion Design. | linked |
| `docs/plans/2026-05-23-lead-to-partner-conversion-plan.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 23 Lead To Partner Conversion Plan. | linked |
| `docs/plans/2026-05-23-property-share-fixes.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 23 Property Share Fixes. | linked |
| `docs/plans/2026-05-24-inventory-config-fields-cleanup-plan.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 24 Inventory Config Fields Cleanup Plan. | linked |
| `docs/plans/2026-05-24-inventory-taxonomy-overhaul-phase1-design.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 24 Inventory Taxonomy Overhaul Phase1 Design. | linked |
| `docs/plans/2026-05-24-inventory-taxonomy-phase1a-data-foundation-plan.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 24 Inventory Taxonomy Phase1a Data Foundation Plan. | linked |
| `docs/plans/2026-05-24-inventory-taxonomy-phase1b-backfill-plan.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 24 Inventory Taxonomy Phase1b Backfill Plan. | linked |
| `docs/plans/2026-05-24-inventory-taxonomy-phase1c-editor-design.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 24 Inventory Taxonomy Phase1c Editor Design. | linked |
| `docs/plans/2026-05-24-inventory-taxonomy-phase1c-editor-plan.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 24 Inventory Taxonomy Phase1c Editor Plan. | linked |
| `docs/plans/2026-05-24-inventory-taxonomy-phase1d-dynamic-form-design.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 24 Inventory Taxonomy Phase1d Dynamic Form Design. | linked |
| `docs/plans/2026-05-24-inventory-taxonomy-phase1d-dynamic-form-plan.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 24 Inventory Taxonomy Phase1d Dynamic Form Plan. | linked |
| `docs/plans/2026-05-24-inventory-taxonomy-phase1d-v2-multi-surface-design.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 24 Inventory Taxonomy Phase1d V2 Multi Surface Design. | linked |
| `docs/plans/2026-05-24-inventory-taxonomy-phase1d-v2-multi-surface-plan.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 24 Inventory Taxonomy Phase1d V2 Multi Surface Plan. | linked |
| `docs/plans/2026-05-27-address-capture-redesign.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 27 Address Capture Redesign. | linked |
| `docs/plans/2026-05-27-edit-inventory-taxonomy-reconciliation.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 27 Edit Inventory Taxonomy Reconciliation. | linked |
| `docs/plans/2026-05-28-address-capture-bug-fixes.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 28 Address Capture Bug Fixes. | linked |
| `docs/plans/2026-05-29-commercial-taxonomy-field-gaps.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 29 Commercial Taxonomy Field Gaps. | linked |
| `docs/plans/2026-05-30-editable-contact-partner-names.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 30 Editable Contact Partner Names. | linked |
| `docs/plans/2026-05-30-inventory-shows-as-flat-fix.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 30 Inventory Shows As Flat Fix. | linked |
| `docs/plans/2026-05-30-partner-agent-profile-management.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 30 Partner Agent Profile Management. | linked |
| `docs/plans/2026-05-31-demand-taxonomy-capture.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 31 Demand Taxonomy Capture. | linked |
| `docs/plans/2026-05-31-inventory-taxonomy-data-cleanup.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 31 Inventory Taxonomy Data Cleanup. | linked |
| `docs/plans/2026-06-10-property-share-templates-v5.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 06 10 Property Share Templates V5. | linked |
| `docs/plans/2026-06-11-p1-requirement-capture.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 06 11 P1 Requirement Capture. | linked |
| `docs/plans/2026-06-12-daily-lead-recycler.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 06 12 Daily Lead Recycler. | linked |
| `docs/plans/2026-06-12-deal-ai-followups.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 06 12 Deal Ai Followups. | linked |
| `docs/plans/2026-06-13-auto-add-lead-on-share.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 06 13 Auto Add Lead On Share. | linked |
| `docs/plans/2026-06-13-brochure-pdf-redesign.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 06 13 Brochure Pdf Redesign. | linked |
| `docs/plans/2026-06-13-dealer-brochure-pdf-and-own-whatsapp-share.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 06 13 Dealer Brochure Pdf And Own Whatsapp Share. | linked |
| `docs/plans/2026-06-13-inventory-media-and-price-fixes.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 06 13 Inventory Media And Price Fixes. | linked |
| `docs/plans/2026-06-13-website-leadcapture-taxonomy.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 06 13 Website Leadcapture Taxonomy. | linked |
| `docs/plans/2026-06-14-dashboard-rbac-analytics-plan.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 06 14 Dashboard Rbac Analytics Plan. | linked |
| `docs/plans/2026-06-15-lead-intelligence-redesign.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 06 15 Lead Intelligence Redesign. | linked |
| `docs/plans/2026-06-22-stage-4-visited-fix.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 06 22 Stage 4 Visited Fix. | linked |
| `docs/plans/2026-06-22-stage-5-negotiation-fix.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 06 22 Stage 5 Negotiation Fix. | linked |
| `docs/plans/2026-06-25-glitchtip-error-remediation.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 06 25 Glitchtip Error Remediation. | linked |
| `docs/plans/2026-06-25-portal-subuser-routing-mapping.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 06 25 Portal Subuser Routing Mapping. | linked |
| `docs/plans/2026-06-26-deal-tile-age.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 06 26 Deal Tile Age. | linked |
| `docs/plans/2026-06-26-deal-tile-last-next-action.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 06 26 Deal Tile Last Next Action. | linked |
| `docs/plans/2026-06-26-inventory-deal-improvements-phased.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 06 26 Inventory Deal Improvements Phased. | linked |
| `docs/plans/2026-07-16-dashboard-phase0.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 07 16 Dashboard Phase0. | linked |
| `docs/plans/2026-07-16-dashboard-phase1-property-analytics.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 07 16 Dashboard Phase1 Property Analytics. | linked |
| `docs/plans/2026-07-16-dashboard-phase2-main-cockpit.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 07 16 Dashboard Phase2 Main Cockpit. | linked |
| `docs/plans/2026-07-16-dashboard-phase3-lead-intelligence.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 07 16 Dashboard Phase3 Lead Intelligence. | linked |
| `docs/plans/2026-07-16-dashboard-phase4-user-team-distribution.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 07 16 Dashboard Phase4 User Team Distribution. | linked |
| `docs/plans/2026-07-16-dashboard-phase5-instrumentation.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 07 16 Dashboard Phase5 Instrumentation. | linked |
| `docs/plans/2026-07-17-phase5c-assignment-method-migration.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 07 17 Phase5c Assignment Method Migration. | linked |
| `docs/plans/2026-07-28-supply-demand-owner-dealer-classification.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 07 28 Supply Demand Owner Dealer Classification. | linked |
| `docs/plans/2026-08-06-ai-calling-android-gateway.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 08 06 Ai Calling Android Gateway. | linked |
| `docs/plans/2026-08-07-audit-remediation-plan.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 08 07 Audit Remediation Plan. | linked |
| `docs/plans/2026-08-11-ab-relaunch-20853.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 08 11 Ab Relaunch 20853. | linked |
| `docs/plans/notes/pipecat-context-api.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Pipecat Context Api. | linked |
| `docs/precautions/csrf-cookie-pattern.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Csrf Cookie Pattern. | linked |
| `docs/precautions/demand-fold-clobber.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Demand Fold Clobber. | linked |
| `docs/precautions/deployment-gotchas.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Deployment Gotchas. | linked |
| `docs/precautions/paginated-sort-trap.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Paginated Sort Trap. | linked |
| `docs/precautions/phone-normalization-pattern.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Phone Normalization Pattern. | linked |
| `docs/precautions/prisma-where-or-pattern.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Prisma Where Or Pattern. | linked |
| `docs/precautions/validation-error-pattern.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Validation Error Pattern. | linked |
| `docs/precautions/workflow-engine-traps.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Workflow Engine Traps. | linked |
| `docs/runbooks/REMOTE-ACCESS.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: REMOTE ACCESS. | linked |
| `docs/runbooks/cloudflare-cutover.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Cloudflare Cutover. | linked |
| `docs/runbooks/deploy.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Deploy. | linked |
| `docs/runbooks/glitchtip.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Glitchtip. | linked |
| `docs/runbooks/inventory-documents.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Inventory Documents. | linked |
| `docs/runbooks/inventory-media-upload.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Inventory Media Upload. | linked |
| `docs/runbooks/inventory-null-agent-recovery.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Inventory Null Agent Recovery. | linked |
| `docs/runbooks/lead-deal-stage-sync.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Lead Deal Stage Sync. | linked |
| `docs/runbooks/meta-ctw-ads.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Meta Ctw Ads. | linked |
| `docs/runbooks/meta-fb-ig-webhook-subscribe.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Meta Fb Ig Webhook Subscribe. | linked |
| `docs/runbooks/meta-product-catalog.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Meta Product Catalog. | linked |
| `docs/runbooks/meta-template-approval.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Meta Template Approval. | linked |
| `docs/runbooks/multi-window-worktree-fanout.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Multi Window Worktree Fanout. | linked |
| `docs/runbooks/new-lead-google-reminder.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: New Lead Google Reminder. | linked |
| `docs/runbooks/partner-conversion.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Partner Conversion. | linked |
| `docs/runbooks/pwa-cache-bust.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Pwa Cache Bust. | linked |
| `docs/runbooks/secrets-recovery.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Secrets Recovery. | linked |
| `docs/runbooks/staff-as-owner-cleanup.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Staff As Owner Cleanup. | linked |
| `docs/runbooks/whatsapp-token-rotation.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Whatsapp Token Rotation. | linked |
| `docs/runbooks/whatsapp-waba-restriction.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Whatsapp Waba Restriction. | linked |
| `docs/superpowers/plans/2026-04-11-contact-system-refactor.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 11 Contact System Refactor. | linked |
| `docs/superpowers/plans/2026-04-12-pwa-ui-redesign.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 12 Pwa Ui Redesign. | linked |
| `docs/superpowers/plans/2026-04-14-filter-sheets-redesign.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 04 14 Filter Sheets Redesign. | linked |
| `docs/superpowers/plans/2026-05-11-memory-restructure.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 11 Memory Restructure. | linked |
| `docs/superpowers/specs/2026-05-11-memory-audit.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 11 Memory Audit. | linked |
| `docs/superpowers/specs/2026-05-11-memory-restructure-design.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: 2026 05 11 Memory Restructure Design. | linked |
| `docs/tasks/SCHEMA.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: SCHEMA. | linked |
| `docs/tasks/TASK-000.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 000. | linked |
| `docs/tasks/TASK-001.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 001. | linked |
| `docs/tasks/TASK-002.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 002. | linked |
| `docs/tasks/TASK-003.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 003. | linked |
| `docs/tasks/TASK-004.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 004. | linked |
| `docs/tasks/TASK-005.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 005. | linked |
| `docs/tasks/TASK-006.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 006. | linked |
| `docs/tasks/TASK-007.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 007. | linked |
| `docs/tasks/TASK-008.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 008. | linked |
| `docs/tasks/TASK-009.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 009. | linked |
| `docs/tasks/TASK-010.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 010. | linked |
| `docs/tasks/TASK-011.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 011. | linked |
| `docs/tasks/TASK-012.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 012. | linked |
| `docs/tasks/TASK-013.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 013. | linked |
| `docs/tasks/TASK-014.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 014. | linked |
| `docs/tasks/TASK-015.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 015. | linked |
| `docs/tasks/TASK-016.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 016. | linked |
| `docs/tasks/TASK-017.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 017. | linked |
| `docs/tasks/TASK-018.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 018. | linked |
| `docs/tasks/TASK-019.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 019. | linked |
| `docs/tasks/TASK-020.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 020. | linked |
| `docs/tasks/TASK-021.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 021. | linked |
| `docs/tasks/TASK-026.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 026. | linked |
| `docs/tasks/TASK-027.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 027. | linked |
| `docs/tasks/TASK-028.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 028. | linked |
| `docs/tasks/TASK-029.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 029. | linked |
| `docs/tasks/TASK-030.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 030. | linked |
| `docs/tasks/TASK-031.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 031. | linked |
| `docs/tasks/TASK-032.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 032. | linked |
| `docs/tasks/TASK-033.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 033. | linked |
| `docs/tasks/TASK-034.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 034. | linked |
| `docs/tasks/TASK-035.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 035. | linked |
| `docs/tasks/TASK-036.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 036. | linked |
| `docs/tasks/TASK-037.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 037. | linked |
| `docs/tasks/TASK-038.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 038. | linked |
| `docs/tasks/TASK-039.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 039. | linked |
| `docs/tasks/TASK-040.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 040. | linked |
| `docs/tasks/TASK-041.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 041. | linked |
| `docs/tasks/TASK-042.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 042. | not linked |
| `docs/tasks/TASK-043.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 043. | not linked |
| `docs/tasks/TASK-044.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 044. | not linked |
| `docs/tasks/TASK-045.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 045. | not linked |
| `docs/tasks/TASK-046.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 046. | not linked |
| `docs/tasks/TASK-047.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 047. | not linked |
| `docs/tasks/TASK-048.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 048. | not linked |
| `docs/tasks/TASK-049.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 049. | not linked |
| `docs/tasks/TASK-050.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 050. | not linked |
| `docs/tasks/TASK-051.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 051. | not linked |
| `docs/tasks/TASK-052.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 052. | not linked |
| `docs/tasks/TASK-053.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 053. | not linked |
| `docs/tasks/TASK-054.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 054. | not linked |
| `docs/tasks/TASK-055.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 055. | not linked |
| `docs/tasks/TASK-056.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 056. | not linked |
| `docs/tasks/TASK-057.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 057. | not linked |
| `docs/tasks/TASK-085.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 085. | linked |
| `docs/tasks/TASK-086.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 086. | linked |
| `docs/tasks/TASK-087.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 087. | linked |
| `docs/tasks/TASK-088.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 088. | linked |
| `docs/tasks/TASK-089.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 089. | linked |
| `docs/tasks/TASK-090.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 090. | linked |
| `docs/tasks/TASK-091.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 091. | linked |
| `docs/tasks/TASK-092.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 092. | linked |
| `docs/tasks/TASK-093.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 093. | linked |
| `docs/tasks/TASK-094.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 094. | linked |
| `docs/tasks/TASK-095.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 095. | linked |
| `docs/tasks/TASK-116.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 116. | not linked |
| `docs/tasks/TASK-117.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 117. | not linked |
| `docs/tasks/TASK-118.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 118. | not linked |
| `docs/tasks/TASK-119.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 119. | not linked |
| `docs/tasks/TASK-120.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 120. | not linked |
| `docs/tasks/TASK-121.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 121. | not linked |
| `docs/tasks/TASK-122.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 122. | not linked |
| `docs/tasks/TASK-123.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 123. | not linked |
| `docs/tasks/TASK-126.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 126. | not linked |
| `docs/tasks/TASK-127.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 127. | not linked |
| `docs/tasks/TASK-128.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 128. | not linked |
| `docs/tasks/TASK-129.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 129. | not linked |
| `docs/tasks/TASK-130.json` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: TASK 130. | not linked |
| `docs/tools-and-skills/USED.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: USED. | linked |
| `docs/tools-and-skills/skills-master.md` | Documentation | Engineering, product, architecture, runbook, plan, or historical document: Skills Master. | linked |
| `github-20260915T145436Z-1-001.zip` | Repository support | Repository configuration, script, data, or support artifact for Github 20260915 T145436 Z 1 001. | not linked |
| `gitignore.txt` | Documentation | Repository documentation: Gitignore. | not linked |
| `pipeline/BACKUP-NOW.bat` | Repository support | Repository configuration, script, data, or support artifact for BACKUP NOW. | not linked |
| `pipeline/HEALTH-CHECK.bat` | Repository support | Repository configuration, script, data, or support artifact for HEALTH CHECK. | not linked |
| `pipeline/README.md` | Documentation | Repository documentation: README. | linked |
| `pipeline/START-PIPELINE.bat` | Repository support | Repository configuration, script, data, or support artifact for START PIPELINE. | not linked |
| `pipeline/backup.sh` | Repository support | Repository configuration, script, data, or support artifact for Backup. | linked |
| `pipeline/health-check.sh` | Repository support | Repository configuration, script, data, or support artifact for Health Check. | linked |
| `pipeline/watch-and-deploy.sh` | Repository support | Repository configuration, script, data, or support artifact for Watch And Deploy. | linked |
| `push-update-scp.sh` | Repository support | Repository configuration, script, data, or support artifact for Push Update Scp. | linked |
| `push-update.sh` | Repository support | Repository configuration, script, data, or support artifact for Push Update. | linked |
| `superpowers-20260915T145435Z-1-001.zip` | Repository support | Repository configuration, script, data, or support artifact for Superpowers 20260915 T145435 Z 1 001. | not linked |
| `update-server.sh` | Repository support | Repository configuration, script, data, or support artifact for Update Server. | linked |
| `upload-to-server.sh` | Repository support | Repository configuration, script, data, or support artifact for Upload To Server. | linked |
