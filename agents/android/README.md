# Realty Pandit Staff App - Android

Native Kotlin Android app for staff call intelligence with AI-powered transcription and extraction.

## Tech Stack

- **Language**: Kotlin
- **Min SDK**: 26 (Android 8.0)
- **Target SDK**: 34 (Android 14)
- **Architecture**: MVVM + Clean Architecture
- **UI**: Jetpack Compose + Material 3
- **DI**: Hilt
- **Network**: Retrofit + OkHttp
- **Database**: Room
- **Background Jobs**: WorkManager
- **Security**: EncryptedSharedPreferences

## Project Structure

```
com.realtypandit.staffapp/
├── core/
│   ├── network/          # Retrofit API client, interceptors
│   ├── auth/             # JWT token management
│   ├── storage/          # File encryption and storage
│   └── permissions/      # Runtime permission handlers
├── call/
│   ├── detection/        # Call detection service (TelephonyManager)
│   ├── recording/        # MediaRecorder wrapper
│   ├── overlay/          # Post-call classification UI
│   └── upload/           # Upload worker (WorkManager)
├── ai/
│   ├── review/           # Call review screen
│   └── transcript/       # Transcript viewer
├── dashboard/            # Main dashboard UI
├── contacts/             # Contact profile screens
└── data/
    ├── local/            # Room database (DAOs, entities)
    ├── remote/           # API data sources
    └── repository/       # Repository pattern
```

## Key Features

### Phase 1 (TASK-069): Project Setup ✅
- Gradle configuration with all dependencies
- Hilt dependency injection setup
- Room database with CallDao and ContactDao
- Retrofit API client with JWT auth
- EncryptedSharedPreferences for secure token storage
- Jetpack Compose theme and navigation
- Notification channels configuration

### Phase 2 (TASK-070): Call Detection & Recording
- Foreground service for call detection
- MediaRecorder integration
- Local encrypted file storage
- Permission handling

### Phase 3 (TASK-071): Post-Call Overlay
- SYSTEM_ALERT_WINDOW overlay UI
- Business/Personal classification
- Auto-classification for known contacts

### Phase 4 (TASK-072): Background Upload
- WorkManager for reliable uploads
- Retry logic with exponential backoff
- Progress notifications
- Auto-deletion after upload

### Phase 5 (TASK-073): Review Screen
- Compose UI for AI results
- Editable extraction fields
- Confidence badges
- Playback controls

### Phase 6 (TASK-074): Contact Management
- Contact list with sync
- Conversation timeline
- Recording playback

### Phase 7 (TASK-075): Authentication
- JWT login flow
- Role-based access control
- Token refresh
- Secure storage

### Phase 8 (TASK-076): Legal Compliance
- First-launch consent
- HTTPS-only connections
- AES file encryption
- Data retention policies

## Backend Integration

Connects to backend API at:
- **Debug**: `http://10.0.2.2:3000` (Android emulator localhost)
- **Release**: `https://api.realtypandit.com`

### API Endpoints Used

- `POST /auth/agent-login` - Agent authentication
- `POST /api/calls/upload` - Upload call recording (multipart)
- `GET /api/calls/:id` - Poll call processing status
- `POST /api/calls/:id/submit` - Submit reviewed call to CRM
- `POST /api/calls/:id/reject` - Reject and delete call
- `GET /api/calls` - Call history with pagination
- `GET /api/calls/stats/overview` - Dashboard statistics
- `GET /api/contacts` - Contact list
- `GET /api/contacts/:phone/interactions` - Contact timeline

## Build Instructions

```bash
# Clean build
./gradlew clean

# Debug build
./gradlew assembleDebug

# Release build (requires signing configuration)
./gradlew assembleRelease

# Install on connected device
./gradlew installDebug

# Run tests
./gradlew test
```

## Permissions Required

```xml
<uses-permission android:name="android.permission.READ_PHONE_STATE" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.READ_CALL_LOG" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_PHONE_CALL" />
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.INTERNET" />
```

All permissions are requested at runtime with user-friendly explanations.

## Security

- **JWT Tokens**: Stored in EncryptedSharedPreferences (AES256-GCM)
- **Call Recordings**: Encrypted with AES before storage
- **Network**: HTTPS-only in production (cleartext allowed only in debug)
- **Backup**: Auth data and recordings excluded from Android backup
- **ProGuard**: Enabled in release builds for code obfuscation

## Development Status

- [x] TASK-069: Android Project Setup & Architecture
- [x] TASK-070: Call Detection & Recording Service
- [x] TASK-071: Post-Call Classification Overlay
- [x] TASK-072: Background Upload Worker
- [x] TASK-073: Staff Call Review Screen
- [x] TASK-074: Contact Profile & Conversation Feed
- [x] TASK-075: Authentication & Role-Based Access
- [x] TASK-076: Legal Compliance & Security

## Notes

- Uses Android emulator localhost mapping (`10.0.2.2`) for debug builds
- Database schema uses `fallbackToDestructiveMigration()` for development
- WorkManager automatically handles network retry and battery optimization
- Call recording may not work on all devices due to manufacturer restrictions
