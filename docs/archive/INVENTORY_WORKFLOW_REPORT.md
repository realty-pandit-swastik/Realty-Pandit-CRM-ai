# Realty Pandit — Inventory Upload Workflow
## Comprehensive Project Report

**Project**: Realty Pandit (realtypandit.in)
**Report Date**: 21 February 2026
**Version**: Workflow Engine v2 (Unified Multi-Channel)
**Prepared For**: Sunny Sharma (Client)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Workflow Definition — All 22 Steps](#3-workflow-definition--all-22-steps)
4. [Workflow Engine — Core Logic](#4-workflow-engine--core-logic)
5. [Channel 1: Admin Panel (Internal Team)](#5-channel-1-admin-panel-internal-team)
6. [Channel 2: Public Website (External Users)](#6-channel-2-public-website-external-users)
7. [Channel 3: WhatsApp Bot (Panditji)](#7-channel-3-whatsapp-bot-panditji)
8. [API Endpoints Reference](#8-api-endpoints-reference)
9. [Database Schema — Complete Field Reference](#9-database-schema--complete-field-reference)
10. [SSOT Pattern — Data Flow](#10-ssot-pattern--data-flow)
11. [Validation Rules & Conditional Logic](#11-validation-rules--conditional-logic)
12. [Media & Document Handling](#12-media--document-handling)
13. [Security & Access Control](#13-security--access-control)
14. [Helper Services](#14-helper-services)
15. [Geographic Data](#15-geographic-data)
16. [Error Handling & Edge Cases](#16-error-handling--edge-cases)
17. [File Reference Map](#17-file-reference-map)

---

## 1. Executive Summary

The Realty Pandit Inventory Upload Workflow is a **unified, multi-channel property listing system** that enables property data collection through three distinct channels — all converging on a single backend engine:

| Channel | Interface | Source Tag | Users |
|---------|-----------|------------|-------|
| **Admin Panel** | React/Vite SPA | `admin` | Internal team (super_boss, manager, employee) |
| **Public Website** | Next.js 16 App | `web` | Property owners, sellers, landlords |
| **WhatsApp Bot** | Panditji AI Bot | `whatsapp` | Anyone messaging the business number |

### Key Design Principles

- **Single Source of Truth (SSOT)**: Every property submission creates/updates Contact + Owner + Inventory + Interaction in one atomic operation
- **Platform Agnostic**: One workflow definition drives all three channels. Step rendering adapts per platform (buttons for WhatsApp, forms for web, cards for admin)
- **Conditional Steps**: Steps show/hide dynamically based on property sub-category validation rules (e.g., BHK not asked for plots, furnishing not asked for land)
- **Composite Blocks**: Address and Owner data collected as single composite steps containing multiple fields
- **Hierarchical Classification**: 4-level property taxonomy — Category → Sub-Category → Type → Configuration (all DB-driven, dynamic)
- **No Cloud Storage**: All media stored locally on VPS disk at `/uploads/` directory

### Workflow at a Glance

```
User starts workflow (any channel)
    ↓
Classification (4-5 steps): Intent → Category → Sub-Category → Type → Configuration
    ↓
Specifications (5-7 steps): Bathrooms → Area → Total Floors → Furnishing → Facing → Age → Lift
    ↓
Pricing (1 step): Expected Price in INR
    ↓
Address (1 composite step): Flat No + Floor + Plot + Society + Locality + District + State + Pincode
    ↓
Features & Description (2 steps): Amenities multi-select → Description
    ↓
Media (2 steps): Photos upload → Documents upload
    ↓
Contact (4 steps): Owner Block → Key Holder Type → Key Holder Name → Key Holder Phone
    ↓
Confirmation: Review summary → Submit
    ↓
SSOT Commit: Contact upsert + Owner ensure + Inventory create + Documents + Interaction log
```

---

## 2. Architecture Overview

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND CHANNELS                            │
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐    │
│  │ Admin Panel   │   │ Website      │   │ WhatsApp (Meta API)  │    │
│  │ React/Vite    │   │ Next.js 16   │   │ Panditji Bot         │    │
│  │ Port: 5173    │   │ Port: 3000   │   │ Webhook              │    │
│  │ source=admin  │   │ source=web   │   │ source=whatsapp      │    │
│  └──────┬───────┘   └──────┬───────┘   └──────────┬───────────┘    │
│         │                  │                       │                 │
└─────────┼──────────────────┼───────────────────────┼─────────────────┘
          │                  │                       │
          ▼                  ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     BACKEND (Express.js — Port 7071)                │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    API Routes Layer                             │ │
│  │  /api/workflow/*  (JWT Auth)    /public/post-property (Public) │ │
│  │  /api/inventory/* (JWT + RBAC)  /webhook/whatsapp    (API Key) │ │
│  └────────────────────────────────┬───────────────────────────────┘ │
│                                   │                                 │
│  ┌────────────────────────────────▼───────────────────────────────┐ │
│  │                    Workflow Engine v2                           │ │
│  │  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │ │
│  │  │Definition│  │Validation│  │Navigation│  │   Commit()   │   │ │
│  │  │ 22 steps │  │ per-step │  │next/prev │  │  SSOT atomic │   │ │
│  │  └─────────┘  └──────────┘  └──────────┘  └──────┬───────┘   │ │
│  └───────────────────────────────────────────────────┼───────────┘ │
│                                                      │             │
│  ┌───────────────────────────────────────────────────▼───────────┐ │
│  │                    Database Layer (Prisma ORM)                 │ │
│  │  Contact ← Owner ← Inventory → InventoryDocument             │ │
│  │           ↕ Interaction                                        │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                    PostgreSQL 16 (Port 5432)                   │ │
│  │                    DB: reality_pandit                          │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Admin Panel | React + Vite + TypeScript | React 18, Vite 5 |
| Website | Next.js + Tailwind CSS + Framer Motion | Next 16, Tailwind v4, Framer 12 |
| Backend | Express.js + TypeScript | Express 4 |
| ORM | Prisma | 5.x |
| Database | PostgreSQL | 16 |
| AI Brain | Google Gemini | gemini-2.5-pro |
| WhatsApp | Meta Cloud API | v21 |
| Auth | JWT (jsonwebtoken + bcryptjs) | — |
| Validation | Zod (backend), Custom (frontend) | — |
| File Storage | Local VPS disk (`/uploads/`) | — |

---

## 3. Workflow Definition — All 22 Steps

The workflow is defined in `agents/backend/src/workflows/workflow_definition.ts` and organized into **7 groups** with **22 steps** (some conditional).

### 3.1 Groups

| # | Group ID | Label | Icon | Steps |
|---|----------|-------|------|-------|
| 1 | classification | Classification | 📋 | 5 steps |
| 2 | specs | Specifications | 📐 | 7 steps (many conditional) |
| 3 | pricing | Pricing | 💰 | 1 step |
| 4 | address | Address | 📍 | 1 composite step |
| 5 | features | Features | ✨ | 2 steps |
| 6 | media | Photos & Docs | 📷 | 2 steps |
| 7 | contact | Contact | 👤 | 4 steps |

### 3.2 Complete Step Reference

#### GROUP 1: CLASSIFICATION (5 Steps)

| Step ID | Question | Input Type | Required | Source | Options | Conditional Logic |
|---------|----------|------------|----------|--------|---------|-------------------|
| `intent` | What do you want to do with this property? / Aap is property ka kya karna chahte hain? | radio | Yes | static | sell (Bechna), rent (Kiraye pe dena), lease (Lease pe dena) | None — always shown |
| `category_id` | What type of property is this? / Yeh kaunsi category ki property hai? | dropdown | Yes | dynamic | Fetched from `/public/master/categories` | None — always shown |
| `sub_category_id` | What specific category? | dropdown | Yes | filtered | Fetched from `/public/master/categories/{category_id}/subcategories` | Filtered by `category_id` |
| `type_id` | What is the property type? | dropdown | Yes | filtered | Fetched from `/public/master/subcategories/{sub_category_id}/types` | Filtered by `sub_category_id` |
| `configuration_id` | What is the configuration? (e.g., 2 BHK) | dropdown | No | dynamic | Fetched from `/public/master/configurations` | Show only when sub_category has `bhk_required=true` |

#### GROUP 2: SPECIFICATIONS (7 Steps — Many Conditional)

| Step ID | Question | Input Type | Required | Validation | Conditional Logic |
|---------|----------|------------|----------|------------|-------------------|
| `bathrooms` | How many bathrooms? | number | No | min=1, max=20 | Show only when `bhk_required=true` |
| `area` | What is the total area? | compound | No | min=1, max=1,000,000 | None — always shown. Secondary field: `area_unit` (sqft/sqyd/sqm) |
| `total_floors` | How many floors in the building? | number | No | min=1, max=200 | Show only when `floor_required=true` |
| `furnishing` | Furnishing status? | dropdown | No | — | Skip when sub_category slug in: plot_land, residential_plot, industrial_park |
| `facing` | Which direction does property face? | dropdown | No | — | None — always shown. Options: N/S/E/W/NE/NW/SE/SW |
| `property_age` | How old is the property? | dropdown | No | — | Skip when sub_category slug in: plot_land, residential_plot, industrial_park |
| `lift_available` | Is there a lift in the building? | radio | No | — | Show only when `floor_number >= 3` |

#### GROUP 3: PRICING (1 Step)

| Step ID | Question | Input Type | Required | Validation |
|---------|----------|------------|----------|------------|
| `price` | Expected price in INR? | number | Yes | min=1 |

#### GROUP 4: ADDRESS (1 Composite Step)

| Step ID | Question | Input Type | Required | Inner Fields |
|---------|----------|------------|----------|--------------|
| `address_block` | Property Address / Property ka address bharein | address_block | Yes | flat_no*, floor_number*, plot_no, apartment_name*, locality*, district*, state*, pincode* |

**Address Block Inner Fields:**

| Field | Label | Required | Validation | Auto-fill |
|-------|-------|----------|------------|-----------|
| flat_no | Flat / Unit No | Yes | Non-empty | Manual |
| floor_number | Floor No | Yes | Non-empty | Manual |
| plot_no | Plot No | No | — | Manual |
| apartment_name | Society / Apartment | Yes | Non-empty | Google Places |
| locality | Locality | Yes | Non-empty | Google Places |
| district | District | Yes | Non-empty | Google Places |
| state | State | Yes | From dropdown (36 states + UTs) | Google Places |
| pincode | Pincode | Yes | Regex: `^[1-9][0-9]{5}$` | Google Places |

**Google Places Integration** (Admin Panel only):
- Uses Google Maps Places Autocomplete API
- API Key: `AIzaSyDkEd_JjVb4ZvGM8X48XBUTT7PNH7r8tIA`
- Restricted to India (`componentRestrictions: { country: 'in' }`)
- Auto-fills: locality, district, state, pincode, full_address
- Falls back to manual input if API fails (8-second timeout)

#### GROUP 5: FEATURES & DESCRIPTION (2 Steps)

| Step ID | Question | Input Type | Required | Options |
|---------|----------|------------|----------|---------|
| `features` | Select available amenities | multi_select | No | parking, lift, garden, pool, gym, security, power_backup, water_supply, club_house, intercom, gas_pipeline, park |
| `description` | Additional details about the property? | textarea | No | Placeholder: "Describe surroundings, highlights, landmarks..." |

**Note**: Features step is skipped for plot_land, residential_plot, industrial_park sub-categories.

#### GROUP 6: MEDIA (2 Steps)

| Step ID | Question | Input Type | Required | Limits |
|---------|----------|------------|----------|--------|
| `photos` | Upload property photos | media_upload | No | Max 10 files, 10MB each, JPEG/PNG/WebP |
| `documents` | Upload documents (title deed, NOC, etc.) | document_upload | No | Max 20MB, PDF/JPEG/PNG/WebP/DOC/DOCX |

**Document Types Supported:**

| Value | Label |
|-------|-------|
| title_deed | Title Deed |
| noc | NOC (No Objection Certificate) |
| layout_plan | Layout Plan / Floor Plan |
| sale_agreement | Sale Agreement |
| encumbrance | Encumbrance Certificate |
| tax_receipt | Property Tax Receipt |
| completion_certificate | Completion Certificate |
| occupancy_certificate | Occupancy Certificate |
| other | Other Document |

#### GROUP 7: CONTACT & KEY HOLDER (4 Steps)

| Step ID | Question | Input Type | Required | Conditional Logic |
|---------|----------|------------|----------|-------------------|
| `owner_block` | Are you the owner of this property? | owner_block | Yes | None — always shown |
| `key_holder_type` | Who holds the property key? | radio | Yes | Options: UPLOADER (I hold the key), OWNER (Owner holds the key), EXTERNAL (External agent) |
| `key_holder_name` | Key holder's name | text | No | Show only when `key_holder_type = EXTERNAL` |
| `key_holder_phone` | Key holder's phone number | text | No | Show only when `key_holder_type = EXTERNAL`. Validation: `^[+]?[0-9]{10,15}$` |

**Owner Block Inner Fields:**

| Field | Label | Required | Notes |
|-------|-------|----------|-------|
| is_owner | Are you the owner? | Yes | Boolean toggle (Yes/No) |
| owner_name | Owner Name | Yes | Always required |
| owner_phone | Owner Phone | Yes* | Required for admin panel (team uploads). Required for website (DB constraint: owner_phone is non-nullable in Inventory) |

---

## 4. Workflow Engine — Core Logic

**File**: `agents/backend/src/workflows/workflow_engine.ts`

The `WorkflowEngine` class is the central orchestrator that powers all three channels.

### 4.1 Public Methods

| Method | Signature | Purpose |
|--------|-----------|---------|
| `getDefinition()` | `→ WorkflowStep[]` | Returns full step definitions for frontend rendering |
| `getVisibleSteps(answers)` | `→ Promise<WorkflowStep[]>` | Returns only steps visible based on current answers (for progress bar) |
| `getNextStep(currentStepId, answers)` | `→ Promise<StepResult \| null>` | Returns next visible step with resolved options. Returns `null` when workflow is complete |
| `getPreviousStep(currentStepId, answers)` | `→ Promise<StepResult \| null>` | Returns previous visible step for back navigation |
| `validateStep(stepId, value, answers)` | `→ Promise<ValidationResult>` | Validates a single step's answer. Returns `{ valid, error? }` |
| `buildSummary(answers)` | `→ Promise<WorkflowSummary>` | Builds human-readable confirmation summary |
| `commit(answers, source, agentId?)` | `→ Promise<{ inventory_id }>` | **CRITICAL**: Creates Inventory + Contact + Owner + Interaction atomically |
| `getStepOptions(step, answers)` | `→ Promise<StepOption[]>` | Resolves options for dropdown/radio steps (static, dynamic, or filtered) |

### 4.2 Step Navigation Logic

```
getNextStep(currentStepId, answers):
    1. If currentStepId is null → start from first step
    2. Find current step's index in step array
    3. Iterate through remaining steps
    4. For each step, check isStepVisible(step, answers)
    5. Return first visible step with resolved options
    6. If no more visible steps → return null (workflow done)
```

### 4.3 Conditional Visibility System

Two types of conditions:

**`show_when` (AND logic)**: Step shown ONLY when ALL rules are true
```typescript
// Example: configuration_id shown only when bhk_required=true
show_when: [{ field: 'sub_category_id', operator: 'from_validation_rules', validation_rule_key: 'bhk_required' }]
```

**`skip_when` (OR logic)**: Step skipped when ANY rule is true
```typescript
// Example: furnishing skipped for plots
skip_when: [{ field: '_sub_category_slug', operator: 'in', value: ['plot_land', 'residential_plot', 'industrial_park'] }]
```

**Condition Operators:**

| Operator | Description | Example |
|----------|-------------|---------|
| `equals` | Exact match | `{ field: 'key_holder_type', operator: 'equals', value: 'EXTERNAL' }` |
| `not_equals` | Not equal | `{ field: 'intent', operator: 'not_equals', value: 'lease' }` |
| `in` | Value in array | `{ field: 'slug', operator: 'in', value: ['plot_land', 'residential_plot'] }` |
| `not_in` | Value not in array | Same as above, negated |
| `exists` | Field has a value | `{ field: 'category_id', operator: 'exists' }` |
| `not_exists` | Field is empty/null | Same, negated |
| `gt` / `gte` | Greater than / equal | `{ field: 'floor_number', operator: 'gte', value: 3 }` |
| `lt` / `lte` | Less than / equal | — |
| `from_validation_rules` | Checks sub-category's validation_rules JSON | `{ validation_rule_key: 'bhk_required' }` |

### 4.4 Validation Rules Cache

The engine caches sub-category validation rules per workflow session to avoid repeated DB queries:

```
First access: query PropertySubCategory.validation_rules → cache[sub_category_id]
Subsequent: read from cache Map
```

Validation rules are JSON stored in PropertySubCategory:
```json
{
  "bhk_required": true,
  "floor_required": true,
  "builtup_area_required": true
}
```

### 4.5 Commit Operation (SSOT Atomic Flow)

The `commit()` method performs 6 database operations in sequence:

```
Step 1: Extract owner info
    └── Prefer owner_block composite → fall back to flat answers
    └── Normalize phone to E.164 format
    └── Throw error if phone missing (DB constraint)

Step 2: Get tenant
    └── prisma.tenant.findFirst()

Step 3: Resolve classification IDs → legacy strings
    └── category_id → PropertyCategory.slug (e.g., "residential")
    └── type_id → PropertyType.slug (e.g., "flat")

Step 4: SSOT — Upsert Contact
    └── prisma.contact.upsert({ where: { phone_number } })
    └── Create as SELLER_LANDLORD with lead_status=NEW
    └── Update name + updated_at if exists

Step 5: SSOT — Ensure Owner
    └── ensureOwner(ownerPhone, tenantId)
    └── Creates Owner + FREE Subscription if not exists
    └── Returns owner_id

Step 6: Build specs, features, address objects
    └── Extract from composite blocks or flat answers
    └── Compute full_address from parts
    └── Compute location string

Step 7: Create Inventory record (30+ fields)
    └── All classification IDs + legacy strings
    └── Specs JSON, Features JSON
    └── Structured address (flat_no, plot_no, apartment_name, locality, district, state, pincode)
    └── Price, media_urls, status=active

Step 8: Create InventoryDocuments (if any)
    └── For each document: create with doc_type, title, file_url, mime_type, file_size

Step 9: Log Interaction
    └── prisma.interaction.create
    └── event_type: 'inventory_commit'
    └── content: "Property listed: {type} for {intent} in {location}"

Step 10: Return { inventory_id }
```

---

## 5. Channel 1: Admin Panel (Internal Team)

### 5.1 Component Architecture

**File**: `agents/frontend/src/components/AddInventory.tsx` (~820 lines)

```
AddInventory (Main Component)
├── useWorkflow() hook — manages all state
├── ProgressBar — visual group progress
├── StepPanel — renders current step
│   ├── OptionCards — for radio/dropdown (card grid with search)
│   ├── NumberField — number input with min/max
│   ├── TextField — text input
│   ├── TextAreaField — multi-line text
│   ├── CompoundField — number + unit selector (e.g., area + sqft)
│   ├── MultiSelectField — checkbox grid (3 columns)
│   ├── MediaUpload — photo upload with thumbnails
│   ├── DocumentUpload — doc type selector + file upload
│   ├── AddressBlockField — Google Places + all address fields
│   └── OwnerBlockField — is_owner toggle + name + phone
├── ConfirmationPanel — review summary before submit
└── SuccessPanel — shows inventory ID after submission
```

### 5.2 Workflow Hook (`useWorkflow.ts`)

The `useWorkflow()` hook manages the complete workflow lifecycle:

**State Variables:**
```typescript
loading: boolean          // Initial definition loading
stepLoading: boolean      // Step transition loading
submitting: boolean       // Final submit in progress
error: string             // Current error message
groups: WorkflowGroup[]   // Group definitions
documentTypes: DocType[]  // Allowed doc types
currentStep: WorkflowStep // Active step
currentOptions: StepOption[] // Active step's options
answers: Record<string, any> // All accumulated answers
stepHistory: string[]     // Stack of visited step IDs
done: boolean             // All steps completed
submitted: boolean        // Final submission successful
inventoryId: string       // Returned property ID
summary: Record<string, string> // Confirmation summary
```

**Key Functions:**

| Function | What It Does |
|----------|-------------|
| `answerStep(value, secondaryValue?)` | Validates → saves answer → fetches next step |
| `goBack()` | Navigates to previous step, removes last answer |
| `skipStep()` | Skips optional step, advances to next |
| `submit()` | Calls `commitWorkflow(answers, 'admin')` |
| `reset()` | Clears all state, restarts workflow |
| `uploadPhotos(files)` | Uploads media files, returns URLs |
| `uploadDocument(file, docType, title)` | Uploads single document |

### 5.3 AddressBlockField Component

```
┌─ Property Address ─────────────────────────────┐
│                                                  │
│  🔍 Search Location (auto-fills fields below)   │
│  ┌──────────────────────────────────────────┐    │
│  │ Type to search (e.g. Gaur City 2...)    │    │  ← GooglePlacesInput
│  └──────────────────────────────────────────┘    │
│                                                  │
│  ┌─ Flat No* ─────┐  ┌─ Floor No* ────────┐    │  ← 2-column grid
│  │ A-1201          │  │ 5                  │    │
│  └─────────────────┘  └────────────────────┘    │
│  ┌─ Plot No ──────┐  ┌─ Society/Apt* ─────┐    │
│  │ Plot 42         │  │ Gaur City 2        │    │
│  └─────────────────┘  └────────────────────┘    │
│  ┌─ Locality* ──────────────────────────────┐   │
│  │ Sector 150                                │   │  ← Auto-filled
│  └───────────────────────────────────────────┘   │
│  ┌─ District* ────┐  ┌─ State* ───────────┐    │
│  │ Noida           │  │ Uttar Pradesh ▼    │    │  ← Dropdown
│  └─────────────────┘  └────────────────────┘    │
│  ┌─ Pincode* ───────────────────────────────┐   │
│  │ 201310                                    │   │  ← 6-digit validation
│  └───────────────────────────────────────────┘   │
│                                    [Next →]      │
└──────────────────────────────────────────────────┘
```

### 5.4 OwnerBlockField Component

```
┌─ Are you the owner of this property? ────────────┐
│                                                    │
│  ┌─ Yes, I am ─────┐  ┌─ No, someone else ─────┐ │
│  │   ✓ Selected     │  │                        │ │  ← Toggle buttons
│  └──────────────────┘  └────────────────────────┘ │
│                                                    │
│  ┌─ Owner Name* ──────────────────────────────┐   │
│  │ Rajesh Kumar                                │   │  ← Always required
│  └─────────────────────────────────────────────┘   │
│  ┌─ Owner Phone* ─────────────────────────────┐   │
│  │ 9876543210                                  │   │  ← Required (admin)
│  └─────────────────────────────────────────────┘   │
│  ℹ️ Phone is mandatory for team uploads.           │
│  Owner will be mapped in SSOT for future tracking. │
│                                    [Next →]        │
└────────────────────────────────────────────────────┘
```

### 5.5 API Client Functions (Admin)

**File**: `agents/frontend/src/api/client.ts`

| Function | HTTP | Endpoint | Purpose |
|----------|------|----------|---------|
| `getWorkflowDefinition()` | GET | `/api/workflow/definition` | Fetch all steps, groups, doc types |
| `getWorkflowNextStep(stepId, answers)` | POST | `/api/workflow/next-step` | Get next visible step |
| `getWorkflowPreviousStep(stepId, answers)` | POST | `/api/workflow/previous-step` | Navigate back |
| `validateWorkflowStep(stepId, value, answers)` | POST | `/api/workflow/validate` | Validate step input |
| `getWorkflowOptions(stepId, answers)` | POST | `/api/workflow/options` | Get dynamic/filtered options |
| `getWorkflowSummary(answers)` | POST | `/api/workflow/summary` | Generate review summary |
| `commitWorkflow(answers, source)` | POST | `/api/workflow/commit` | Final submission |
| `uploadWorkflowMedia(files)` | POST | `/api/workflow/upload-media` | Upload photos (multipart) |
| `uploadWorkflowDocument(file, docType, title)` | POST | `/api/workflow/upload-document` | Upload document (multipart) |
| `getStates()` | GET | `/public/geo/states` | Fetch Indian states for address dropdown |

### 5.6 Authentication

- Admin panel uses JWT tokens stored in `localStorage`
- Auto-set via Axios interceptor: `Authorization: Bearer {token}`
- Login via phone number + password (phone-based auth)
- Token refresh available via refresh token

---

## 6. Channel 2: Public Website (External Users)

### 6.1 Page Structure

**File**: `agents/website/src/app/post-property/page.tsx`

```
Post Property Page (/post-property)
├── Hero Section
│   └── Gradient background (emerald→teal) with "Post Your Property" headline
├── Workflow Container
│   ├── Loading State → Spinner
│   ├── Active State
│   │   ├── WorkflowProgress — top progress indicator
│   │   ├── StepRenderer — current step input with animations
│   │   └── StepConfirmation — review summary before submit
│   └── Success State → Celebration screen with Property ID
└── Navigation
    ├── Back to Home
    ├── Browse Properties
    └── Post Another Property (resets workflow)
```

### 6.2 StepRenderer Component

**File**: `agents/website/src/components/workflow/StepRenderer.tsx` (~837 lines)

Renders each step type with Tailwind CSS dark mode support and Framer Motion animations:

| Input Type | Component | Features |
|------------|-----------|----------|
| `radio` | RadioInput | 2-3 column card grid with Hindi translations |
| `dropdown` | DropdownInput | Cards for ≤6 options, searchable list for >6 |
| `number` | NumberInput | Min/max validation, increment/decrement |
| `text` | TextInput | Enter key to submit |
| `textarea` | TextAreaInput | Resizable, character count |
| `compound` | CompoundInput | Number + unit selector side-by-side |
| `multi_select` | MultiSelectInput | Checkbox grid with visual checkmarks |
| `media_upload` | MediaUploadInput | Drag-drop zone, 3-4 column preview grid |
| `document_upload` | DocumentUploadInput | Type selector + title + file list |
| `address_block` | AddressBlockInput | All address fields + state dropdown |
| `owner_block` | OwnerBlockInput | Toggle + name + phone (all required) |

### 6.3 Styling & Animations

- **Dark Mode**: Full Tailwind `dark:` variant support across all components
- **Animations**: Framer Motion for step transitions (`opacity: 0, x: 30` → `opacity: 1, x: 0`)
- **Colors**: Emerald (primary/success), Slate (neutral), Red (errors), Blue (info)
- **Responsive**: Mobile-first design with grid breakpoints

### 6.4 Website API Client

**File**: `agents/website/src/lib/api.ts`

Same endpoint structure as admin panel but uses `NEXT_PUBLIC_API_URL` as base URL. All workflow functions mirror the admin client.

---

## 7. Channel 3: WhatsApp Bot (Panditji)

### 7.1 Message Flow Architecture

```
WhatsApp Message Received
    ↓
Webhook Handler (/webhook/whatsapp)
    ↓
Message Router (message_router.ts)
    ├── Contact Type: UNKNOWN → ClassifierAgent (determines type)
    ├── Contact Type: BUYER_TENANT → SalesAgent (property search)
    ├── Contact Type: SELLER_LANDLORD → SalesAgent (property listing)
    ├── Contact Type: PARTNER_AGENT → PartnerAgent
    └── Contact Type: MANAGEMENT → AdminAgent
    ↓
If SELLER_LANDLORD + PROPERTY intent:
    → WhatsApp Workflow Adapter
    → Conversational step-by-step property collection
```

### 7.2 WhatsApp Session Management

Sessions are stored in PostgreSQL via `ConversationSession` model:

```typescript
WhatsAppWorkflowSession {
    workflow: "inventory_v2",
    state: "in_progress" | "awaiting_media" | "awaiting_documents" |
           "awaiting_confirm" | "awaiting_multi_select",
    answers: WorkflowAnswer,          // Accumulated answers
    current_step_id: string | null,
    current_step_options: StepOption[],
    pending_media: string[],          // Photo URLs collected so far
    pending_docs: Array<{             // Documents collected so far
        file_url: string,
        file_name: string,
        mime_type: string,
        file_size: number
    }>,
    pending_multi_select: string[],
    failed_attempts: number,          // Consecutive parse failures
    started_at: string
}
```

### 7.3 Step Rendering for WhatsApp

WhatsApp renders differently from web/admin based on the `whatsapp_type` hint:

| whatsapp_type | Rendering | Example |
|---------------|-----------|---------|
| `buttons` | WhatsApp Reply Buttons (max 3) | Intent: [Sell] [Rent] [Lease] |
| `list` | WhatsApp Interactive List (max 10 rows) | Property types in scrollable list |
| `text` | Free text prompt, parse response | "Enter expected price in INR" |
| `media` | Accept image/document messages | "Send property photos, type 'done' when finished" |

### 7.4 Special WhatsApp Commands

| Command | Hindi | Effect |
|---------|-------|--------|
| `back` | `wapas` | Go to previous step |
| `skip` | `aage` | Skip optional step |
| `cancel` | `band karo` | Abort entire workflow |
| `done` | — | Finish media/multi-select collection |
| `help` | — | Show available commands |

### 7.5 Frustration Detection

The bot detects user frustration via keywords and auto-sends help:

Keywords: `help`, `stuck`, `lost`, `??`, `kya`, `confused`, `problem`, `why`, `kyu`, `pagal`

### 7.6 Failed Attempt Protection

- Counter tracks consecutive parse failures per step
- After **5 failed attempts** → auto-cancel session and send apology message
- Counter resets on each successful answer

### 7.7 Multi-Select Collection (WhatsApp)

Since WhatsApp lists have a 10-row limit, multi-select (amenities) works differently:

1. Send numbered text list of all amenities
2. User sends comma-separated numbers: `1,3,5,7`
3. System parses selected indices
4. Accumulated in `pending_multi_select`
5. User sends `done` to finalize

### 7.8 Media Collection (WhatsApp)

1. Bot prompts: "Send property photos. Type 'done' when finished."
2. User sends image → downloaded from WhatsApp servers → uploaded to `/uploads/pending/`
3. Bot confirms: "✅ Photo 1 received!"
4. Repeat until user sends "done" or max 10 reached
5. URLs accumulated in `pending_media` array

### 7.9 WhatsApp Confirmation Flow

```
Bot sends:
┌──────────────────────────────────────┐
│ 📋 *Property Summary — Please Confirm* │
│                                        │
│ • *Category*: Residential              │
│ • *Type*: 2 BHK Flat                  │
│ • *Location*: Sector 150, Noida       │
│ • *Area*: 1200 sqft                   │
│ • *Price*: ₹55,00,000                 │
│ • *Amenities*: Parking, Lift, Gym     │
│ • *Furnishing*: Semi-furnished        │
│ • *Owner*: Rajesh Kumar (9876543210)  │
│                                        │
│ Is everything correct?                 │
│                                        │
│ [✅ Yes, Submit]   [❌ No, Go Back]   │
└──────────────────────────────────────┘

User taps "Yes" → commit() → Success message with property ID
User taps "No" → goBack() to last step
```

---

## 8. API Endpoints Reference

### 8.1 Workflow Endpoints (Protected — JWT Auth)

| Method | Endpoint | Request Body | Response |
|--------|----------|-------------|----------|
| GET | `/api/workflow/definition` | — | `{ steps[], groups[], document_types[] }` |
| POST | `/api/workflow/next-step` | `{ current_step_id, answers }` | `{ done, step, options }` |
| POST | `/api/workflow/previous-step` | `{ current_step_id, answers }` | `{ step, options }` |
| POST | `/api/workflow/validate` | `{ step_id, value, answers }` | `{ valid, error? }` |
| POST | `/api/workflow/options` | `{ step_id, answers }` | `{ options[] }` |
| POST | `/api/workflow/visible-steps` | `{ answers }` | `{ steps[], groups[] }` |
| POST | `/api/workflow/summary` | `{ answers }` | `{ summary: Record<string,string> }` |
| POST | `/api/workflow/commit` | `{ answers, source }` | `{ inventory_id }` |
| POST | `/api/workflow/upload-media` | Multipart (photos) | `{ urls[], count }` |
| POST | `/api/workflow/upload-document` | Multipart (document + doc_type + title) | `{ url, doc_type, title, file_name, mime_type, file_size }` |

### 8.2 Public Endpoints (No Auth Required)

| Method | Endpoint | Request Body | Response |
|--------|----------|-------------|----------|
| POST | `/public/post-property` | `{ intent, category_id, type_id, location, price, specs, features, owner_name, phone, email }` | `{ success, property_id, message }` |
| GET | `/public/geo/states` | — | `string[]` (36 Indian states + UTs) |
| GET | `/public/master/categories` | — | `[{ id, name, slug }]` |
| GET | `/public/master/configurations` | — | `[{ id, name }]` |

### 8.3 Media Upload Constraints

| Parameter | Photos | Documents |
|-----------|--------|-----------|
| Max Files Per Request | 10 | 1 |
| Max File Size | 10MB | 20MB |
| Allowed MIME Types | image/jpeg, image/png, image/webp | application/pdf, image/jpeg, image/png, image/webp, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document |
| Storage Location | `/uploads/pending/` | `/uploads/pending/` |
| Filename Pattern | `{UUID}-{timestamp}.{ext}` | `{UUID}-{timestamp}.{ext}` |

---

## 9. Database Schema — Complete Field Reference

### 9.1 Inventory Model (Primary Property Record)

**50+ fields** — complete breakdown:

| Field | Type | Nullable | Default | Purpose |
|-------|------|----------|---------|---------|
| `id` | String (UUID) | No | uuid() | Primary key |
| `tenant_id` | String | No | — | FK → Tenant |
| `owner_id` | String | No | — | FK → Owner (cascade delete) |
| `owner_phone` | String | No | — | FK → Contact (E.164) |
| `assigned_agent_id` | String | Yes | null | FK → Agent (sales agent) |
| `key_holder_contact_id` | String | Yes | null | FK → Contact |
| `key_holder_type` | Enum | Yes | null | UPLOADER / OWNER / EXTERNAL |
| `key_holder_name` | String | Yes | null | External key holder name |
| `key_holder_phone` | String | Yes | null | External key holder phone |
| `owner_contact_id` | String | Yes | null | FK → Contact (owner) |
| `category_id` | String | Yes | null | FK → PropertyCategory |
| `sub_category_id` | String | Yes | null | FK → PropertySubCategory |
| `type_id` | String | Yes | null | FK → PropertyType |
| `configuration_id` | String | Yes | null | FK → PropertyConfiguration |
| `usage_type_id` | String | Yes | null | FK → UsageType |
| `investment_type_id` | String | Yes | null | FK → InvestmentType |
| `category` | String | No | — | Legacy: "residential"/"commercial" |
| `type` | String | No | — | Legacy: "flat"/"house"/"plot" etc. |
| `intent` | String | No | — | "sell" or "rent" |
| `specs` | Json | Yes | null | `{bedrooms, bathrooms, area, unit}` |
| `features` | Json | Yes | null | `{parking: true, lift: true, ...}` |
| `description` | Text | Yes | null | Free-text description |
| `furnishing` | String | Yes | null | unfurnished/semi_furnished/fully_furnished |
| `floor_number` | Int | Yes | null | Unit's floor number |
| `total_floors` | Int | Yes | null | Building's total floors |
| `facing` | String | Yes | null | N/S/E/W/NE/NW/SE/SW |
| `property_age` | String | Yes | null | new/1-3years/3-5years/5-10years/10+ |
| `flat_no` | String | Yes | null | "A-1201", "B-304" |
| `plot_no` | String | Yes | null | Plot number |
| `apartment_name` | String | Yes | null | Society/Project name |
| `state` | String | Yes | null | Indian state full name |
| `district` | String | Yes | null | City/District |
| `locality` | String | Yes | null | Sector/Area |
| `pincode` | String | Yes | null | 6-digit Indian pincode |
| `full_address` | String | Yes | null | Computed: "Flat, Society, Locality, District, State - Pincode" |
| `location` | String | Yes | null | Legacy: "Locality, State" |
| `price` | Decimal | Yes | null | Price in INR |
| `price_unit` | String | Yes | null | "Lakh"/"Crore" |
| `status` | String | No | "active" | active/sold/rented/withdrawn |
| `media_urls` | String[] | No | [] | Array of photo URLs |
| `uploaded_by_agent_id` | String | Yes | null | FK → Agent (who uploaded) |
| `created_at` | DateTime | No | now() | Creation timestamp |
| `updated_at` | DateTime | No | @updatedAt | Last update |

**Database Indexes:**
- `location`
- `owner_id`
- `uploaded_by_agent_id`
- `(category_id, sub_category_id, type_id)` — composite
- `(status, intent, created_at)` — composite
- `(status, price)` — composite
- `(state, district)` — composite

### 9.2 Contact Model (SSOT Identity)

Phone number is the **primary key** — all identity flows through Contact.

| Field | Type | Nullable | Default | Purpose |
|-------|------|----------|---------|---------|
| `phone_number` | String | No | — | **PK** (E.164: "+919876543210") |
| `tenant_id` | String | No | — | FK → Tenant |
| `name` | String | Yes | null | Contact name |
| `email` | String | Yes | null | Email address |
| `source` | String | No | "manual" | website/whatsapp/voice/manual/99acres/magicbricks/housing |
| `contact_type` | Enum | No | UNKNOWN | BUYER_TENANT/SELLER_LANDLORD/PARTNER_AGENT/REAL_ESTATE_BUILDER/MANAGEMENT/UNKNOWN |
| `intent` | String | Yes | null | buy/sell/rent/commercial |
| `property_type` | String | Yes | null | flat/house/plot |
| `budget_min` | Decimal | Yes | null | Minimum budget |
| `budget_max` | Decimal | Yes | null | Maximum budget |
| `preferred_location` | String | Yes | null | Preferred area |
| `timeline` | String | Yes | null | immediate/1-3months |
| `lead_status` | String | No | "cold" | cold/warm/hot/closed/lost |
| `lifecycle_stage` | String | No | "NEW" | NEW→QUALIFIED→MATCHED→VISIT_SCHEDULED→VISITED→NEGOTIATION→CLOSED_WON/CLOSED_LOST |
| `assigned_agent_id` | String | Yes | null | FK → Agent |
| `last_channel` | String | Yes | null | whatsapp/voice |
| `last_interaction` | DateTime | Yes | null | Last interaction time |
| `preferred_language` | String | Yes | null | english/hindi/hinglish |
| `ai_summary` | Text | Yes | null | AI-generated context |
| `notes` | Text | Yes | null | Free-text notes |
| `created_at` | DateTime | No | now() | Created |
| `updated_at` | DateTime | No | @updatedAt | Updated |

### 9.3 Owner Model (Unified Ownership)

| Field | Type | Nullable | Default | Purpose |
|-------|------|----------|---------|---------|
| `id` | String (UUID) | No | uuid() | PK |
| `scope` | Enum | No | — | INTERNAL / EXTERNAL |
| `externalType` | Enum | Yes | null | INDIVIDUAL_AGENT / PROPERTY_AGENT / REAL_ESTATE_BUILDER |
| `contact_phone` | String | No | @unique | FK → Contact (E.164) |
| `status` | Enum | No | PENDING_VERIFICATION | ACTIVE / SUSPENDED / EXPIRED / PENDING_VERIFICATION |
| `listing_limit` | Int | No | 10 | Max properties allowed |
| `priority_score` | Int | No | 50 | Matching priority (higher = preferred) |
| `created_at` | DateTime | No | now() | Created |
| `updated_at` | DateTime | No | @updatedAt | Updated |

### 9.4 Interaction Model (Unified Activity Log)

| Field | Type | Nullable | Default | Purpose |
|-------|------|----------|---------|---------|
| `id` | String (UUID) | No | uuid() | PK |
| `tenant_id` | String | No | — | FK → Tenant |
| `phone_number` | String | No | — | FK → Contact |
| `channel` | String | No | — | whatsapp/voice/email/website |
| `direction` | String | No | — | inbound/outbound |
| `event_type` | String | No | — | message/call/form_submit/inventory_commit |
| `content` | Text | Yes | null | Message content or description |
| `metadata` | Json | Yes | null | `{inventory_id, source, workflow, owner_name}` |
| `created_at` | DateTime | No | now() | Timestamp |

### 9.5 InventoryDocument Model

| Field | Type | Nullable | Default | Purpose |
|-------|------|----------|---------|---------|
| `id` | String (UUID) | No | uuid() | PK |
| `inventory_id` | String | No | — | FK → Inventory |
| `doc_type` | String | No | — | title_deed/noc/layout_plan/etc. |
| `title` | String | No | — | Document title |
| `file_url` | String | No | — | Path to uploaded file |
| `file_name` | String | No | — | Original filename |
| `mime_type` | String | No | — | application/pdf, image/jpeg, etc. |
| `file_size` | Int | Yes | null | File size in bytes |
| `uploaded_via` | String | No | — | web/admin/whatsapp/voice |
| `created_at` | DateTime | No | now() | Timestamp |

---

## 10. SSOT Pattern — Data Flow

### 10.1 What is SSOT?

**Single Source of Truth** — Every property submission, regardless of channel, creates exactly the same set of database records:

```
                    ┌─────────────────────────┐
                    │      SSOT Commit()      │
                    └────────────┬────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                       │
          ▼                      ▼                       ▼
   ┌──────────────┐     ┌──────────────┐      ┌──────────────┐
   │   Contact    │     │    Owner     │      │  Inventory   │
   │   (Upsert)   │     │  (Ensure)    │      │  (Create)    │
   │              │     │              │      │              │
   │ phone_number │◄───►│ contact_phone│      │ owner_id     │
   │ contact_type │     │ scope        │      │ owner_phone  │
   │ =SELLER_     │     │ status       │      │ 30+ fields   │
   │  LANDLORD    │     │ listing_limit│      │              │
   └──────┬───────┘     └──────────────┘      └──────┬───────┘
          │                                           │
          │                                           │
          ▼                                           ▼
   ┌──────────────┐                          ┌──────────────────┐
   │ Interaction  │                          │ InventoryDocument │
   │   (Create)   │                          │    (Create x N)   │
   │              │                          │                   │
   │ event_type=  │                          │ doc_type, title   │
   │ inventory_   │                          │ file_url, mime    │
   │ commit       │                          │ uploaded_via      │
   └──────────────┘                          └──────────────────┘
```

### 10.2 Contact Upsert Logic

```typescript
prisma.contact.upsert({
    where: { phone_number: ownerPhone },  // E.164 format
    update: {
        name: ownerName || undefined,
        updated_at: new Date(),
    },
    create: {
        phone_number: ownerPhone,
        tenant_id: tenant.id,
        name: ownerName || null,
        contact_type: 'SELLER_LANDLORD',
        lead_status: 'NEW',
    },
});
```

**Key Behavior:**
- If contact exists → only updates name and timestamp
- If contact is new → creates as SELLER_LANDLORD with NEW lead status
- Phone number is PRIMARY KEY — guarantees uniqueness

### 10.3 Owner Ensure Logic

```typescript
async function ensureOwner(phone: string, tenantId: string): Promise<string> {
    // 1. Normalize phone to E.164
    const normalized = normalizePhone(phone);

    // 2. Check if owner exists (using phone format variants)
    const existing = await prisma.owner.findFirst({
        where: { contact_phone: { in: phoneVariants(normalized) } }
    });
    if (existing) return existing.id;

    // 3. Create in atomic transaction
    return prisma.$transaction(async (tx) => {
        // Upsert contact (idempotent)
        await tx.contact.upsert({ where: { phone_number: normalized }, ... });

        // Create owner
        const owner = await tx.owner.create({
            scope: 'INTERNAL',
            contact_phone: normalized,
            status: 'ACTIVE',
            listing_limit: 10,
            priority_score: 50,
        });

        // Create FREE subscription
        await tx.subscription.create({
            owner_id: owner.id,
            plan_type: 'FREE',
            status: 'ACTIVE',
        });

        return owner.id;
    });
}
```

---

## 11. Validation Rules & Conditional Logic

### 11.1 Step-Level Validation

| Step | Validation Rule | Error Message |
|------|----------------|---------------|
| `intent` | Required, must be one of options | "What do you want to do with this property? is required" |
| `category_id` | Required | "What type of property is this? is required" |
| `sub_category_id` | Required | Required |
| `type_id` | Required | Required |
| `configuration_id` | Optional, shown only when bhk_required | — |
| `bathrooms` | Optional, min=1, max=20 | "Must be between 1 and 20" |
| `area` | Optional, min=1, max=1,000,000 | "Must be between 1 and 1000000" |
| `total_floors` | Optional, min=1, max=200 | "Must be between 1 and 200" |
| `price` | Required, min=1 | "Expected price in INR is required" |
| `address_block` | Composite validation (see below) | Per-field errors |
| `owner_block` | Composite validation (see below) | Per-field errors |
| `key_holder_phone` | Pattern: `^[+]?[0-9]{10,15}$` | "Invalid format" |

### 11.2 Address Block Validation

| Inner Field | Validation | Error |
|-------------|-----------|-------|
| flat_no | Non-empty required | "Flat / Unit No is required" |
| floor_number | Non-empty required | "Floor No is required" |
| apartment_name | Non-empty required | "Society / Apartment is required" |
| locality | Non-empty required | "Locality is required" |
| district | Non-empty required | "District is required" |
| state | Non-empty required | "State is required" |
| pincode | Regex: `^[1-9][0-9]{5}$` | "Valid 6-digit pincode is required" |

### 11.3 Owner Block Validation

| Inner Field | Validation | Error |
|-------------|-----------|-------|
| owner_name | Non-empty required (always) | "Owner name is required" |
| owner_phone | Required (admin + website). Validated via normalizePhone, must be 10+ digits | "Please enter a valid phone number" |

### 11.4 Sub-Category Validation Rules

Stored as JSON in `PropertySubCategory.validation_rules`:

```json
{
    "bhk_required": true,      // Show configuration_id step
    "floor_required": true,     // Show total_floors step
    "builtup_area_required": true // Require area input
}
```

**Steps affected by validation_rules:**
- `configuration_id`: Show when `bhk_required=true`
- `bathrooms`: Show when `bhk_required=true`
- `total_floors`: Show when `floor_required=true`

### 11.5 Sub-Category Slug Skip Rules

Steps skipped when sub_category slug is plot/land type:

| Step | Skipped When Slug In |
|------|---------------------|
| `furnishing` | plot_land, residential_plot, industrial_park |
| `property_age` | plot_land, residential_plot, industrial_park |
| `features` | plot_land, residential_plot, industrial_park |

---

## 12. Media & Document Handling

### 12.1 Photo Upload Flow

```
User selects files (JPEG/PNG/WebP, max 10MB each)
    ↓
Frontend creates FormData with "photos" field
    ↓
POST /api/workflow/upload-media
    ↓
Multer middleware processes multipart data
    ↓
Files saved to /uploads/pending/{UUID}-{timestamp}.{ext}
    ↓
Returns array of URLs
    ↓
URLs stored in answers.photos[]
    ↓
On commit: URLs stored in Inventory.media_urls
```

### 12.2 Document Upload Flow

```
User selects file + doc_type + title
    ↓
Frontend creates FormData with "document", "doc_type", "title" fields
    ↓
POST /api/workflow/upload-document
    ↓
File saved to /uploads/pending/{UUID}-{timestamp}.{ext}
    ↓
Returns { url, doc_type, title, file_name, mime_type, file_size }
    ↓
Stored in answers.documents[]
    ↓
On commit: InventoryDocument records created
```

### 12.3 Storage Rules

| Rule | Value |
|------|-------|
| Storage Type | Local VPS disk (NO cloud storage) |
| Base Directory | `/uploads/` |
| Pending Directory | `/uploads/pending/` |
| Final Directory | `/uploads/properties/{inventory_id}/` |
| Max Photo Size | 10MB per file |
| Max Photos Per Request | 10 |
| Max Document Size | 20MB per file |
| Filename Pattern | `{UUID}-{timestamp}.{extension}` |
| Allowed Photo Types | JPEG, PNG, WebP |
| Allowed Doc Types | PDF, JPEG, PNG, WebP, DOC, DOCX |

---

## 13. Security & Access Control

### 13.1 Authentication Methods

| Channel | Auth Method | How It Works |
|---------|------------|--------------|
| Admin Panel | JWT Bearer Token | `Authorization: Bearer {token}` header. Token obtained via phone + password login |
| Website | Optional JWT | Public endpoint doesn't require auth. If user is logged in, agent token is sent |
| WhatsApp | Phone Identity | Contact identified by WhatsApp phone number (E.164) |
| Public API | None / API Key | `/public/*` endpoints are open. External integrations use `X-API-Key` header |

### 13.2 JWT Token Structure

```json
{
    "id": "agent-uuid",
    "email": "agent@realtypandit.in",
    "role": "super_boss",
    "tenant_id": "tenant-uuid",
    "iat": 1708521600,
    "exp": 1708608000
}
```

### 13.3 Role-Based Access Control (RBAC)

| Role | Visibility | Permissions |
|------|-----------|-------------|
| `super_boss` | ALL inventory across all agents | Full CRUD + team management |
| `manager` | Own + direct reports' inventory | Edit + assign + view reports |
| `employee` | Only own uploaded inventory | Create + edit own |

### 13.4 Middleware Chain

```
Admin Workflow Routes:
    authMiddleware → (verifies JWT, populates req.agent) → Handler

Admin Inventory Routes:
    authMiddleware → requireRole('super_boss','manager') → Handler

Public Routes:
    No middleware → Handler

External Integration Routes:
    apiKeyAuth → (verifies X-API-Key header) → Handler
```

---

## 14. Helper Services

### 14.1 Phone Normalization (`normalizePhone`)

**File**: `agents/backend/src/utils/phone.ts`

Converts any Indian phone format to E.164 canonical format:

| Input | Output |
|-------|--------|
| `9876543210` | `+919876543210` |
| `+919876543210` | `+919876543210` |
| `919876543210` | `+919876543210` |
| `09876543210` | `+919876543210` |
| `+91-987-654-3210` | `+919876543210` |
| ` (098) 765-43210 ` | `+919876543210` |

**Validation**: Must match `^[6-9]\d{9}$` (Indian mobile numbers start with 6-9).

### 14.2 Phone Variants (`phoneVariants`)

Generates all 3 format variants for database lookups (handles legacy records):

```typescript
phoneVariants("+919876543210")
// Returns: ["+919876543210", "919876543210", "9876543210"]
```

### 14.3 Ensure Owner (`ensureOwner`)

**File**: `agents/backend/src/services/ensure_owner.ts`

Atomically finds or creates Owner record with Contact and Subscription:

1. Normalize phone → E.164
2. Check if Owner exists (using all 3 phone variants)
3. If exists → return `owner.id`
4. If not → atomic transaction:
   - Upsert Contact (SELLER_LANDLORD)
   - Create Owner (scope=INTERNAL, status=ACTIVE, listing_limit=10, priority_score=50)
   - Create FREE Subscription (plan_type=FREE, status=ACTIVE)
5. Return new `owner.id`

---

## 15. Geographic Data

### 15.1 States & Union Territories (36 Total)

**File**: `agents/backend/src/data/india_geo.ts`

**28 States**: Andhra Pradesh, Arunachal Pradesh, Assam, Bihar, Chhattisgarh, Goa, Gujarat, Haryana, Himachal Pradesh, Jharkhand, Karnataka, Kerala, Madhya Pradesh, Maharashtra, Manipur, Meghalaya, Mizoram, Nagaland, Odisha, Punjab, Rajasthan, Sikkim, Tamil Nadu, Telangana, Tripura, Uttar Pradesh, Uttarakhand, West Bengal

**8 Union Territories**: Andaman & Nicobar Islands, Chandigarh, Dadra & Nagar Haveli and Daman & Diu, Delhi, Jammu & Kashmir, Ladakh, Lakshadweep, Puducherry

### 15.2 Active States (WhatsApp Focus — 7)

Optimized for WhatsApp list rendering (max 10 rows):

1. Delhi (DL)
2. Uttar Pradesh (UP)
3. Haryana (HR)
4. Punjab (PB)
5. Uttarakhand (UK)
6. Chandigarh (CH)
7. Rajasthan (RJ)

### 15.3 Districts by State

Major real-estate-active districts per state. NCR-heavy focus:

- **Uttar Pradesh**: Noida, Greater Noida, Ghaziabad, Lucknow, Agra, Varanasi, Kanpur (15 cities)
- **Haryana**: Gurgaon, Faridabad, Panchkula, Karnal (14 cities)
- **Delhi**: New Delhi + North/South/East/West Delhi + 12+ localities
- **Maharashtra**: Mumbai, Pune, Nagpur, Thane (16 cities)
- **Karnataka**: Bengaluru, Mysuru, Hubli-Dharwad (9 cities)
- And all other states with major real estate hubs

---

## 16. Error Handling & Edge Cases

### 16.1 Common Error Scenarios

| Scenario | Error | Resolution |
|----------|-------|------------|
| Missing owner phone | 400: "Owner phone number is required" | Frontend validates before submit |
| Invalid pincode | 400: "Valid 6-digit pincode is required" | Regex: `^[1-9][0-9]{5}$` |
| No tenant in DB | 500: "No tenant found" | Requires seeded tenant record |
| Invalid phone format | Normalization returns empty string | normalizePhone handles all formats |
| Google Places API fails | Input enables after 8s timeout | Manual entry fallback |
| Upload too large | 400: "File too large. Max 10MB per image" | Frontend shows file size warning |
| Session expired (WhatsApp) | Bot sends "Session expired" message | User restarts workflow |
| 5 failed attempts (WhatsApp) | Auto-cancel + apology message | User can restart |
| Duplicate media upload | Files get unique UUID names | No conflicts |
| JWT expired | 401: Unauthorized | Frontend redirects to login |

### 16.2 Data Integrity Guarantees

| Guarantee | How It's Enforced |
|-----------|-------------------|
| Owner phone uniqueness | Contact.phone_number is PRIMARY KEY |
| Owner-Contact link | Owner.contact_phone has @unique constraint |
| Inventory-Owner link | Inventory.owner_id FK with CASCADE delete |
| Atomic operations | `ensureOwner()` uses Prisma `$transaction` |
| No orphan media | Media URLs stored in Inventory.media_urls array |
| Interaction trail | Every commit creates Interaction record |

### 16.3 Known Limitations

| Limitation | Current Status | Impact |
|-----------|---------------|--------|
| No cloud storage | Local `/uploads/` only | Media lost if disk fails |
| No session timeout (WhatsApp) | Sessions persist until manual cancel | Stale sessions possible |
| No orphan file cleanup | Abandoned pending files remain on disk | Disk space waste |
| WhatsApp list max 10 rows | Multi-select falls back to text parsing | Less user-friendly |
| Google Places India-only | `componentRestrictions: { country: 'in' }` | NRI properties unsupported |

---

## 17. File Reference Map

### Backend Files

| File | Purpose | Lines |
|------|---------|-------|
| `agents/backend/src/workflows/workflow_types.ts` | TypeScript types & interfaces for workflow | ~82 |
| `agents/backend/src/workflows/workflow_definition.ts` | All 22 step definitions + groups + doc types | ~430 |
| `agents/backend/src/workflows/workflow_engine.ts` | Core engine: navigation, validation, commit | ~576 |
| `agents/backend/src/workflows/inventory_machine.ts` | WhatsApp state machine | ~300 |
| `agents/backend/src/workflows/whatsapp_workflow_adapter.ts` | WhatsApp-specific workflow adapter | ~400 |
| `agents/backend/src/routes/workflow.ts` | Workflow API endpoints | ~200 |
| `agents/backend/src/routes/public.ts` | Public endpoints incl. post-property | ~350 |
| `agents/backend/src/routes/inventory.ts` | Inventory CRUD + upload routes | ~300 |
| `agents/backend/src/services/ensure_owner.ts` | Owner SSOT creation service | ~60 |
| `agents/backend/src/utils/phone.ts` | Phone normalization utility | ~40 |
| `agents/backend/src/data/india_geo.ts` | States, districts, geography data | ~500 |
| `agents/backend/src/middleware/auth.ts` | JWT auth + RBAC middleware | ~80 |
| `agents/backend/src/middleware/apikey.ts` | API key auth middleware | ~30 |
| `agents/backend/src/services/message_router.ts` | WhatsApp message routing orchestrator | ~400 |
| `agents/backend/src/agents/sales_agent.ts` | Sales agent (handles seller property flow) | ~300 |
| `agents/backend/src/services/system_prompt.ts` | AI system prompts (Panditji personality) | ~200 |
| `agents/backend/prisma/schema.prisma` | Complete DB schema (all models) | ~1200 |
| `agents/backend/src/validators/auth.validator.ts` | Zod validation schemas | ~39 |
| `agents/backend/src/services/auth.ts` | Auth service (login by phone, JWT) | ~97 |

### Frontend Files (Admin Panel)

| File | Purpose | Lines |
|------|---------|-------|
| `agents/frontend/src/components/AddInventory.tsx` | Complete inventory workflow UI | ~820 |
| `agents/frontend/src/hooks/useWorkflow.ts` | Workflow state management hook | ~273 |
| `agents/frontend/src/api/client.ts` | Axios API client | ~352 |
| `agents/frontend/src/components/GooglePlacesInput.tsx` | Google Places autocomplete input | ~155 |
| `agents/frontend/src/contexts/AuthContext.tsx` | Auth context (phone-based login) | ~101 |
| `agents/frontend/src/components/LoginPage.tsx` | Login page UI (phone + password) | ~547 |

### Website Files (Next.js)

| File | Purpose | Lines |
|------|---------|-------|
| `agents/website/src/app/post-property/page.tsx` | Post property page | ~171 |
| `agents/website/src/components/workflow/StepRenderer.tsx` | Step renderer with all input types | ~837 |
| `agents/website/src/lib/api.ts` | Website API client | ~668 |

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total Workflow Steps | 22 (7 conditional) |
| Step Groups | 7 |
| Input Types | 12 (radio, dropdown, number, text, textarea, compound, multi_select, media_upload, document_upload, confirm, address_block, owner_block) |
| Document Types | 9 |
| Database Models Involved | 5 (Inventory, Contact, Owner, InventoryDocument, Interaction) |
| Inventory Fields | 50+ |
| Indian States Supported | 36 |
| Active States (WhatsApp) | 7 (NCR focus) |
| Max Photos Per Property | 10 (10MB each) |
| Max Document Size | 20MB |
| Channels | 3 (Admin, Website, WhatsApp) |
| API Endpoints | 10 workflow + 3 public |
| Authentication Methods | JWT (admin), Optional JWT (web), Phone identity (WhatsApp), API Key (external) |

---

*Report generated on 21 February 2026 for Realty Pandit (realtypandit.in)*
*All code references are from the local development repository at `c:\Users\Varchasv Bhardwaj\Project\clients\sunny-sharma\projects\reality-pandit\`*
