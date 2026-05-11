# Reality Pandit - Database Schema Documentation

> **Database**: PostgreSQL
> **ORM**: Prisma
> **Schema file**: `agents/backend/prisma/schema.prisma`
> **Last updated**: 2026-02-26

---

## Table of Contents

1. [Enums](#enums)
2. [Models](#models)
   - [Tenant](#1-tenant)
   - [Contact](#2-contact)
   - [Interaction](#3-interaction)
   - [WhatsAppMessage](#4-whatsappmessage)
   - [VoiceCall](#5-voicecall)
   - [Email](#6-email)
   - [TaskFollowup](#7-taskfollowup)
   - [Agent](#8-agent)
   - [Inventory](#9-inventory)
   - [InventoryDocument](#10-inventorydocument)
   - [FlatPropertyType](#11-flatpropertytype)
   - [PropertyCategory](#12-propertycategory)
   - [PropertySubCategory](#13-propertysubcategory)
   - [PropertyType](#14-propertytype)
   - [PropertyConfiguration](#15-propertyconfiguration)
   - [UsageType](#16-usagetype)
   - [InvestmentType](#17-investmenttype)
   - [PartnerAgent](#18-partneragent)
   - [LeadScore](#19-leadscore)
   - [ConversationSession](#20-conversationsession)
   - [WebsiteLead](#21-websitelead)
   - [NewsletterSubscriber](#22-newslettersubscriber)
   - [ScheduledVisit](#23-scheduledvisit)
   - [Appointment](#24-appointment)
   - [Commission](#25-commission)
   - [StaffCall](#26-staffcall)
   - [Owner](#27-owner)
   - [Subscription](#28-subscription)
   - [Project](#29-project)
   - [ProjectUnit](#30-projectunit)
   - [ProjectMedia](#31-projectmedia)
   - [BuilderLead](#32-builderlead)
   - [BuilderAppointment](#33-builderappointment)
   - [AgentActionLog](#34-agentactionlog)
   - [QALog](#35-qalog)
   - [Transaction](#36-transaction)
   - [TransactionLog](#37-transactionlog)
   - [CampaignTemplate](#38-campaigntemplate)
   - [Campaign](#39-campaign)
   - [WorkProject](#40-workproject)
   - [Task](#41-task)
   - [AuditReport](#42-auditreport)
   - [PromptOverride](#43-promptoverride)
   - [PendingMessage](#44-pendingmessage)
   - [Workflow](#45-workflow)
   - [WorkflowExecution](#46-workflowexecution)
3. [Entity Relationships](#entity-relationships)

---

## Enums

### ContactType
Classifies contacts across the system.

| Value | Description |
|-------|-------------|
| `BUYER_TENANT` | Buyers or tenants looking for properties |
| `SELLER_LANDLORD` | Sellers or landlords listing properties |
| `PARTNER_AGENT` | External marketplace agents |
| `REAL_ESTATE_BUILDER` | Builders with projects (PHASE 12) |
| `MANAGEMENT` | Internal management contacts |
| `UNKNOWN` | Unclassified contacts |

### KeyHolderType
Identifies who holds the physical property key.

| Value | Description |
|-------|-------------|
| `UPLOADER` | The agent who uploaded holds the key |
| `OWNER` | The property owner holds the key |
| `EXTERNAL` | An external agent/dealer holds the key |

### OwnershipType
Describes property ownership classification for inventory listings.

| Value | Description |
|-------|-------------|
| `OWNER` | Property owner directly uploading |
| `EXTERNAL_AGENT` | External dealer listing on behalf of owner |
| `AGENT_OWNER` | Internal team agent who also owns the property |

### CallStatus
Processing pipeline status for staff call recordings.

| Value | Description |
|-------|-------------|
| `UPLOADING` | Recording being uploaded |
| `PROCESSING` | AI transcription in progress |
| `TRANSCRIBED` | Transcript available |
| `READY_FOR_REVIEW` | Awaiting human review |
| `APPROVED` | Reviewed and approved |
| `REJECTED` | Reviewed and rejected |

### AppointmentType
Types of calendar appointments.

| Value | Description |
|-------|-------------|
| `property_visit` | Physical property visit |
| `follow_up_call` | Phone follow-up |
| `meeting` | General meeting |
| `site_visit` | Construction site visit |
| `documentation` | Documentation/paperwork |
| `negotiation` | Price negotiation session |
| `contract_signing` | Contract signing ceremony |
| `handover` | Property handover |
| `other` | Other appointment type |

### AppointmentStatus
Lifecycle states for appointments.

| Value | Description |
|-------|-------------|
| `scheduled` | Appointment created |
| `confirmed` | Contact confirmed attendance |
| `in_progress` | Appointment currently happening |
| `completed` | Appointment finished |
| `cancelled` | Appointment cancelled |
| `rescheduled` | Moved to another time |
| `no_show` | Contact did not attend |

### AgentPackage
Subscription tier for partner agents.

| Value | Description |
|-------|-------------|
| `FREE` | Free tier (10 listings) |
| `PRO` | Pro tier (50 listings) |
| `ADVANCE_PRO` | Unlimited listings (999) |

### AgentStatus
Status of partner agent accounts.

| Value | Description |
|-------|-------------|
| `ACTIVE` | Active account |
| `SUSPENDED` | Suspended account |
| `EXPIRED` | Subscription expired |
| `PENDING_PAYMENT` | Awaiting payment |

### OwnerScope
Distinguishes internal vs external property owners (PHASE 12).

| Value | Description |
|-------|-------------|
| `INTERNAL` | Staff-managed owner |
| `EXTERNAL` | External agent/builder |

### ExternalOwnerType
Sub-classification for external owners (PHASE 12).

| Value | Description |
|-------|-------------|
| `INDIVIDUAL_AGENT` | Individual property agent |
| `PROPERTY_AGENT` | Property agency |
| `REAL_ESTATE_BUILDER` | Real estate builder/developer |

### OwnerStatus
Status of unified owner accounts.

| Value | Description |
|-------|-------------|
| `ACTIVE` | Active owner |
| `SUSPENDED` | Suspended |
| `EXPIRED` | Expired |
| `PENDING_VERIFICATION` | Awaiting verification |

### PlanType
Subscription plan tiers.

| Value | Description |
|-------|-------------|
| `FREE` | Free plan |
| `BASIC` | Basic plan |
| `PRO` | Professional plan |
| `PREMIUM` | Premium plan |

### SubscriptionStatus
Status of owner subscriptions.

| Value | Description |
|-------|-------------|
| `ACTIVE` | Active subscription |
| `EXPIRED` | Expired subscription |
| `CANCELLED` | Cancelled subscription |
| `PENDING_PAYMENT` | Awaiting payment |

### ProjectType
Types of builder projects.

| Value | Description |
|-------|-------------|
| `RESIDENTIAL` | Residential project |
| `COMMERCIAL` | Commercial project |
| `MIXED_USE` | Mixed-use project |

### ProjectStatus
Construction/delivery status of projects.

| Value | Description |
|-------|-------------|
| `UPCOMING` | Upcoming launch |
| `UNDER_CONSTRUCTION` | Currently under construction |
| `READY_TO_MOVE` | Completed, ready for possession |
| `DELIVERED` | Fully delivered |

### ProjectListingStatus
Visibility status for project listings.

| Value | Description |
|-------|-------------|
| `DRAFT` | Draft, not visible |
| `ACTIVE` | Live and visible |
| `PAUSED` | Temporarily hidden |
| `SOLD_OUT` | All units sold |
| `ARCHIVED` | Archived listing |

### MediaType
Types of project media assets.

| Value | Description |
|-------|-------------|
| `IMAGE` | Photograph |
| `VIDEO` | Video |
| `FLOOR_PLAN` | Floor plan diagram |
| `BROCHURE` | Marketing brochure |
| `MASTER_PLAN` | Master plan layout |

### BuilderLeadStatus
Lifecycle status for builder project leads.

| Value | Description |
|-------|-------------|
| `NEW` | New lead |
| `CONTACTED` | Initial contact made |
| `VISIT_SCHEDULED` | Site visit scheduled |
| `VISITED` | Site visit completed |
| `NEGOTIATION` | In negotiation |
| `CONVERTED` | Lead converted to sale |
| `LOST` | Lead lost |

### BuilderAppointmentStatus
Status of builder site visit appointments.

| Value | Description |
|-------|-------------|
| `SCHEDULED` | Visit scheduled |
| `CONFIRMED` | Confirmed by buyer |
| `VISITED` | Visit completed |
| `NO_SHOW` | Buyer did not show up |
| `CANCELLED` | Visit cancelled |

### TransactionType
Types of property deals.

| Value | Description |
|-------|-------------|
| `SALE` | Property sale |
| `RENT` | Property rental |

### TransactionStatus
Lifecycle states for property transactions/deals.

| Value | Description |
|-------|-------------|
| `NEW` | New transaction created |
| `MATCHED` | Buyer matched to property |
| `VISIT_SCHEDULED` | Property visit scheduled |
| `VISITED` | Property visited |
| `NEGOTIATION` | In negotiation |
| `CLOSED_WON` | Deal closed successfully |
| `CLOSED_LOST` | Deal lost |
| `ON_HOLD` | Temporarily paused |

### RoleContext
Context in which a contact participates in a transaction.

| Value | Description |
|-------|-------------|
| `DEMAND` | Buyer/tenant side |
| `SUPPLY` | Seller/landlord side |
| `INTERNAL` | Internal staff |

### TransactionLogAction
Types of transaction audit log events.

| Value | Description |
|-------|-------------|
| `CREATED` | Transaction created |
| `STATUS_CHANGED` | Status transition |
| `EXECUTIVE_ASSIGNED` | Executive agent assigned |
| `EXECUTIVE_CHANGED` | Executive agent changed |
| `APPOINTMENT_LINKED` | Appointment linked to transaction |
| `APPOINTMENT_COMPLETED` | Linked appointment completed |
| `NEGOTIATION_UPDATE` | Negotiation terms updated |
| `PARTY_NOTIFIED` | Party (buyer/seller) notified |
| `DUPLICATE_BLOCKED` | Duplicate transaction blocked |
| `CLOSED` | Transaction closed |
| `REOPENED` | Transaction reopened |
| `NOTE_ADDED` | Note added to transaction |
| `FOLLOWUP_SENT` | Follow-up message sent |

---

## Models

### 1. Tenant

**Description**: Property dealer / business entity. Root of the multi-tenant architecture. All operational data is scoped to a tenant.

**Database table**: `tenants`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `business_name` | `String` | required | Business name |
| `owner_name` | `String` | required | Owner/manager name |
| `primary_phone` | `String` | required | Primary phone number |
| `email` | `String?` | optional | Email address |
| `website` | `String?` | optional | Website URL |
| `timezone` | `String` | `@default("Asia/Kolkata")` | Timezone setting |
| `status` | `String` | `@default("active")` | active, suspended |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Relations (has many)**:
- `contacts` -> `Contact[]`
- `interactions` -> `Interaction[]`
- `agents` -> `Agent[]`
- `tasks` -> `TaskFollowup[]`
- `whatsapp_msgs` -> `WhatsAppMessage[]`
- `voice_calls` -> `VoiceCall[]`
- `emails` -> `Email[]`
- `inventory` -> `Inventory[]`
- `staff_calls` -> `StaffCall[]`
- `appointments` -> `Appointment[]`
- `transactions` -> `Transaction[]`

---

### 2. Contact

**Description**: Single Source of Truth (SSOT) for all people in the system. Uses `phone_number` in E.164 format as the primary key, making the phone number the universal identity.

**Database table**: `contacts`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `phone_number` | `String` | `@id` | **Primary key** - E.164 phone number |
| `tenant_id` | `String` | FK -> Tenant.id | Owning tenant |
| `name` | `String?` | optional | Contact name |
| `email` | `String?` | optional | Email address |
| `source` | `String` | `@default("manual")` | Lead source: website, whatsapp, voice, manual, 99acres, magicbricks, housing |
| `contact_type` | `ContactType` | `@default(UNKNOWN)` | Contact classification enum |
| `intent` | `String?` | optional | buy, sell, rent, commercial |
| `property_type` | `String?` | optional | flat, house, plot |
| `budget_min` | `Decimal?` | optional | Minimum budget |
| `budget_max` | `Decimal?` | optional | Maximum budget |
| `preferred_location` | `String?` | optional | Preferred area/locality |
| `timeline` | `String?` | optional | immediate, 1-3 months |
| `lead_status` | `String` | `@default("cold")` | cold, warm, hot, closed, lost |
| `lifecycle_stage` | `String` | `@default("NEW")` | NEW, QUALIFIED, MATCHED, VISIT_SCHEDULED, VISITED, NEGOTIATION, CLOSED_WON, CLOSED_LOST |
| `assigned_agent_id` | `String?` | FK -> Agent.id | Assigned internal agent |
| `last_channel` | `String?` | optional | whatsapp, voice |
| `last_interaction` | `DateTime?` | optional | Timestamp of last interaction |
| `next_action_at` | `DateTime?` | optional | Scheduled next action time |
| `next_action_type` | `String?` | optional | Type of next action |
| `last_wa_inbound` | `DateTime?` | optional | Last inbound WhatsApp message (for 24h session window) |
| `ai_summary` | `String?` | `@db.Text` | AI-generated contact summary |
| `notes` | `String?` | `@db.Text` | Free-text notes |
| `preferred_language` | `String?` | optional | english, hindi, hinglish |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Foreign Keys**:
- `tenant_id` -> `Tenant.id`
- `assigned_agent_id` -> `Agent.id`

**Relations (has many / has one)**:
- `interactions` -> `Interaction[]`
- `tasks` -> `TaskFollowup[]`
- `whatsapp_msgs` -> `WhatsAppMessage[]`
- `voice_calls` -> `VoiceCall[]`
- `emails` -> `Email[]`
- `lead_score` -> `LeadScore?`
- `inventory` -> `Inventory[]`
- `key_holder_properties` -> `Inventory[]` (named: KeyHolderProperties)
- `owned_properties` -> `Inventory[]` (named: OwnedProperties)
- `scheduled_visits` -> `ScheduledVisit[]`
- `appointments` -> `Appointment[]`
- `partner_profile` -> `PartnerAgent?`
- `sessions` -> `ConversationSession[]`
- `staff_calls` -> `StaffCall[]`
- `owner` -> `Owner?` (PHASE 12)
- `builder_leads` -> `BuilderLead[]` (PHASE 12)
- `demand_transactions` -> `Transaction[]` (named: DemandTransactions)
- `supply_transactions` -> `Transaction[]` (named: SupplyTransactions)
- `work_tasks` -> `Task[]`

**Indexes**:
- `[tenant_id, phone_number]`
- `[contact_type]`
- `[lead_status]`
- `[lifecycle_stage]`
- `[next_action_at]`
- `[contact_type, lead_status]`
- `[last_interaction]`
- `[assigned_agent_id]`

---

### 3. Interaction

**Description**: Unified communication log. Every inbound/outbound event across all channels (WhatsApp, voice, email, website) is recorded here as a single timeline.

**Database table**: `interactions`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `tenant_id` | `String` | FK -> Tenant.id | Owning tenant |
| `phone_number` | `String` | FK -> Contact.phone_number | Contact phone |
| `channel` | `String` | required | whatsapp, voice, email, website |
| `direction` | `String` | required | inbound, outbound |
| `event_type` | `String` | required | message, call, form_submit |
| `content` | `String?` | `@db.Text` | Message/event content |
| `metadata` | `Json?` | optional | duration, message_id, etc. |
| `created_at` | `DateTime` | `@default(now())` | Event timestamp |

**Foreign Keys**:
- `tenant_id` -> `Tenant.id`
- `phone_number` -> `Contact.phone_number`

**Indexes**:
- `[tenant_id, phone_number, created_at]`
- `[channel, direction, created_at]`

---

### 4. WhatsAppMessage

**Description**: Individual WhatsApp messages with delivery status tracking.

**Database table**: `whatsapp_messages`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `tenant_id` | `String` | FK -> Tenant.id | Owning tenant |
| `phone_number` | `String` | FK -> Contact.phone_number | Contact phone |
| `wa_message_id` | `String?` | `@unique` | WhatsApp platform message ID |
| `direction` | `String` | required | inbound, outbound |
| `message_type` | `String` | required | text, image, template |
| `body` | `String?` | `@db.Text` | Message body text |
| `media_url` | `String?` | optional | Media attachment URL |
| `status` | `String` | `@default("sent")` | sent, delivered, read, failed |
| `created_at` | `DateTime` | `@default(now())` | Message timestamp |

**Foreign Keys**:
- `tenant_id` -> `Tenant.id`
- `phone_number` -> `Contact.phone_number`

---

### 5. VoiceCall

**Description**: Voice call records with optional transcription and AI summary.

**Database table**: `voice_calls`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `tenant_id` | `String` | FK -> Tenant.id | Owning tenant |
| `phone_number` | `String` | FK -> Contact.phone_number | Contact phone |
| `call_sid` | `String?` | `@unique` | Telephony platform call SID |
| `direction` | `String` | required | inbound, outbound |
| `call_status` | `String` | required | answered, missed, failed |
| `duration` | `Int?` | optional | Call duration in seconds |
| `recording_url` | `String?` | optional | Call recording URL |
| `transcript` | `String?` | `@db.Text` | Call transcript |
| `ai_call_summary` | `String?` | `@db.Text` | AI-generated call summary |
| `started_at` | `DateTime` | `@default(now())` | Call start time |
| `ended_at` | `DateTime?` | optional | Call end time |

**Foreign Keys**:
- `tenant_id` -> `Tenant.id`
- `phone_number` -> `Contact.phone_number`

---

### 6. Email

**Description**: Email records with full header tracking, threading support, and AI processing capabilities.

**Database table**: `emails`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `tenant_id` | `String` | FK -> Tenant.id | Owning tenant |
| `phone_number` | `String?` | FK -> Contact.phone_number | Linked contact (optional) |
| `from_email` | `String` | required | Sender email address |
| `to_email` | `String` | required | Recipient email address |
| `cc` | `String?` | `@db.Text` | Comma-separated CC addresses |
| `bcc` | `String?` | `@db.Text` | Comma-separated BCC addresses |
| `subject` | `String?` | optional | Email subject line |
| `body` | `String?` | `@db.Text` | Plain-text body |
| `html` | `String?` | `@db.Text` | HTML body |
| `direction` | `String` | required | inbound, outbound |
| `status` | `String` | `@default("pending")` | pending, sent, delivered, failed, bounced |
| `message_id` | `String?` | `@unique` | Email Message-ID header |
| `in_reply_to` | `String?` | optional | In-Reply-To header (threading) |
| `references` | `String?` | optional | References header (threading) |
| `attachments` | `Json?` | optional | Array of attachment URLs |
| `ai_processed` | `Boolean` | `@default(false)` | Whether AI has processed this email |
| `ai_response` | `String?` | `@db.Text` | AI-generated response |
| `ai_confidence` | `Float?` | optional | AI confidence score |
| `sent_at` | `DateTime?` | optional | When email was sent |
| `delivered_at` | `DateTime?` | optional | When email was delivered |
| `opened_at` | `DateTime?` | optional | When email was opened |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Foreign Keys**:
- `tenant_id` -> `Tenant.id`
- `phone_number` -> `Contact.phone_number` (optional)

**Indexes**:
- `[from_email]`
- `[to_email]`
- `[message_id]`
- `[created_at]`

---

### 7. TaskFollowup

**Description**: Scheduled follow-up tasks for contacts (call-backs, WhatsApp messages, site visit reminders).

**Database table**: `tasks_followups`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `tenant_id` | `String` | FK -> Tenant.id | Owning tenant |
| `phone_number` | `String` | FK -> Contact.phone_number | Contact phone |
| `task_type` | `String` | required | call, whatsapp, site_visit |
| `status` | `String` | `@default("pending")` | pending, completed, skipped |
| `scheduled_at` | `DateTime` | required | When the follow-up is due |
| `executed_at` | `DateTime?` | optional | When the follow-up was executed |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |

**Foreign Keys**:
- `tenant_id` -> `Tenant.id`
- `phone_number` -> `Contact.phone_number`

**Indexes**:
- `[scheduled_at, status]`

---

### 8. Agent

**Description**: Internal staff members with role-based access, authentication, and management hierarchy.

**Database table**: `agents`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `tenant_id` | `String` | FK -> Tenant.id | Owning tenant |
| `name` | `String` | required | Agent name |
| `email` | `String` | `@unique` | Login email (unique) |
| `phone` | `String?` | optional | Phone number |
| `role` | `String` | `@default("employee")` | super_boss, manager, employee |
| `department` | `String?` | optional | property_sales, operations, management, software_sales |
| `status` | `String` | `@default("active")` | Account status |
| `password_hash` | `String?` | optional | Hashed password |
| `refresh_token` | `String?` | optional | JWT refresh token |
| `last_login_at` | `DateTime?` | optional | Last login timestamp |
| `setup_token` | `String?` | `@unique` | One-time setup token |
| `setup_token_expires` | `DateTime?` | optional | Setup token expiry |
| `reports_to_id` | `String?` | FK -> Agent.id (self) | Manager in hierarchy |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Foreign Keys**:
- `tenant_id` -> `Tenant.id`
- `reports_to_id` -> `Agent.id` (self-referential hierarchy)

**Relations (has many)**:
- `subordinates` -> `Agent[]` (self-referential via AgentHierarchy)
- `assigned_leads` -> `Contact[]`
- `assigned_properties` -> `Inventory[]` (named: AssignedProperties)
- `uploaded_inventory` -> `Inventory[]` (named: UploadedInventory)
- `reference_inventory` -> `Inventory[]` (named: ReferenceInventory)
- `staff_calls` -> `StaffCall[]`
- `appointments` -> `Appointment[]`
- `executive_transactions` -> `Transaction[]` (named: ExecutiveTransactions)

---

### 9. Inventory

**Description**: Properties listing with unified ownership model, hierarchical classification, structured addressing, geo-coordinates, dual pricing, and comprehensive assignment/key management. Core of the real estate marketplace.

**Database table**: `inventory`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `tenant_id` | `String` | FK -> Tenant.id | Owning tenant |
| `owner_id` | `String` | FK -> Owner.id | Unified owner (PHASE 12), cascade delete |
| `owner_phone` | `String` | FK -> Contact.phone_number | Legacy: direct contact lookup |
| `assigned_agent_id` | `String?` | FK -> Agent.id | Internal sales agent |
| `key_holder_contact_id` | `String?` | FK -> Contact.phone_number | Contact who holds the key |
| `key_holder_type` | `KeyHolderType?` | enum | UPLOADER, OWNER, EXTERNAL |
| `key_holder_name` | `String?` | optional | Key holder name (EXTERNAL) |
| `key_holder_phone` | `String?` | optional | Key holder phone (EXTERNAL) |
| `owner_contact_id` | `String?` | FK -> Contact.phone_number | Owner contact for easy reference |
| `category_id` | `String?` | FK -> PropertyCategory.id | Hierarchical category |
| `sub_category_id` | `String?` | FK -> PropertySubCategory.id | Sub-category |
| `type_id` | `String?` | FK -> PropertyType.id | Property type |
| `configuration_id` | `String?` | FK -> PropertyConfiguration.id | BHK configuration |
| `usage_type_id` | `String?` | FK -> UsageType.id | Self-use, Investment, Rental |
| `investment_type_id` | `String?` | FK -> InvestmentType.id | Pre-launch, Under Construction, Ready |
| `category` | `String` | required | **Legacy**: residential, commercial |
| `type` | `String` | required | **Legacy**: flat, house, plot, office, shop |
| `specs` | `Json?` | optional | `{ bedrooms, bathrooms, area, unit }` |
| `features` | `Json?` | optional | `{ parking, lift, ... }` |
| `description` | `String?` | `@db.Text` | Free-text description |
| `furnishing` | `String?` | optional | unfurnished, semi_furnished, fully_furnished |
| `floor_number` | `Int?` | optional | Floor number |
| `total_floors` | `Int?` | optional | Total floors in building |
| `facing` | `String?` | optional | north, south, east, west, etc. |
| `property_age` | `String?` | optional | new, 1-3years, 3-5years, 5-10years, 10+years |
| `flat_no` | `String?` | optional | "A-1201", "B-304" |
| `plot_no` | `String?` | optional | "Plot 42" or building name |
| `apartment_name` | `String?` | optional | "Gaur City 2", "ATS Pristine" |
| `state` | `String?` | optional | Indian state |
| `district` | `String?` | optional | City/District |
| `locality` | `String?` | optional | Area/Sector |
| `pincode` | `String?` | optional | 6-digit pincode |
| `full_address` | `String?` | optional | Computed full address |
| `location` | `String?` | optional | **Legacy**: auto-populated from structured fields |
| `latitude` | `Float?` | optional | Geocoded latitude |
| `longitude` | `Float?` | optional | Geocoded longitude |
| `price` | `Decimal?` | optional | Property price |
| `price_unit` | `String?` | optional | Lakh, Crore/Cr |
| `customer_price` | `Decimal?` | optional | Owner's actual asking price (internal only) |
| `display_price` | `Decimal?` | optional | Price shown on website |
| `city` | `String?` | optional | City name (user-facing) |
| `status` | `String` | `@default("active")` | active, sold, rented, withdrawn |
| `intent` | `String` | required | sell, rent, rent_lease, lease |
| `media_urls` | `String[]` | array | Array of image URLs |
| `video_urls` | `String[]` | array | Array of video URLs |
| `lead_reference` | `String?` | optional | Who referred this lead/property |
| `flat_property_type_id` | `String?` | FK -> FlatPropertyType.id | Flat property type (Redesign v2) |
| `ownership_type` | `OwnershipType?` | enum | OWNER, EXTERNAL_AGENT, AGENT_OWNER |
| `upload_source` | `String?` | optional | website, admin, whatsapp, voice, mobile_app |
| `uploader_phone` | `String?` | optional | Phone of uploader |
| `uploader_name` | `String?` | optional | Name of uploader |
| `uploader_email` | `String?` | optional | Email of uploader |
| `uploaded_by_agent_id` | `String?` | FK -> Agent.id | Agent who uploaded |
| `reference_agent_phone` | `String?` | optional | Phone of referring agent |
| `reference_agent_id` | `String?` | FK -> Agent.id | Referring agent |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Foreign Keys**:
- `tenant_id` -> `Tenant.id`
- `owner_id` -> `Owner.id` (cascade delete)
- `owner_phone` -> `Contact.phone_number`
- `assigned_agent_id` -> `Agent.id`
- `key_holder_contact_id` -> `Contact.phone_number`
- `owner_contact_id` -> `Contact.phone_number`
- `category_id` -> `PropertyCategory.id`
- `sub_category_id` -> `PropertySubCategory.id`
- `type_id` -> `PropertyType.id`
- `configuration_id` -> `PropertyConfiguration.id`
- `usage_type_id` -> `UsageType.id`
- `investment_type_id` -> `InvestmentType.id`
- `flat_property_type_id` -> `FlatPropertyType.id`
- `uploaded_by_agent_id` -> `Agent.id`
- `reference_agent_id` -> `Agent.id`

**Relations (has many)**:
- `documents` -> `InventoryDocument[]`
- `appointments` -> `Appointment[]`
- `transactions` -> `Transaction[]`
- `work_tasks` -> `Task[]`

**Indexes**:
- `[location]`
- `[owner_id]`
- `[uploaded_by_agent_id]`
- `[reference_agent_id]`
- `[category_id, sub_category_id, type_id]`
- `[status, intent, created_at]`
- `[status, price]`
- `[state, district]`
- `[city]`
- `[flat_property_type_id]`
- `[latitude, longitude]` (spatial indexing for map queries)

---

### 10. InventoryDocument

**Description**: Property documents (title deeds, NOC, layout plans, sale agreements, etc.) attached to inventory.

**Database table**: `inventory_documents`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `inventory_id` | `String` | FK -> Inventory.id | Parent property, cascade delete |
| `doc_type` | `String` | required | title_deed, noc, layout_plan, sale_agreement, encumbrance, tax_receipt, other |
| `title` | `String` | required | User-given label |
| `file_url` | `String` | required | Storage path/URL |
| `file_name` | `String` | required | Original filename |
| `mime_type` | `String` | required | application/pdf, image/jpeg, etc. |
| `file_size` | `Int?` | optional | File size in bytes |
| `uploaded_via` | `String` | `@default("web")` | web, admin, whatsapp |
| `created_at` | `DateTime` | `@default(now())` | Upload timestamp |

**Foreign Keys**:
- `inventory_id` -> `Inventory.id` (cascade delete)

**Indexes**:
- `[inventory_id]`

---

### 11. FlatPropertyType

**Description**: Single-level flat property type list replacing hierarchical classification. Contains 37 types: 11 Residential + 25 Commercial + 1 Agricultural (Redesign v2).

**Database table**: `flat_property_types`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `name` | `String` | required | "Residential Apartment", "Commercial Shops", etc. |
| `slug` | `String` | `@unique` | URL-safe identifier |
| `main_category` | `String` | required | "residential", "commercial", "agricultural" |
| `icon` | `String?` | optional | Icon identifier |
| `display_order` | `Int` | `@default(0)` | Sort order |
| `is_active` | `Boolean` | `@default(true)` | Whether type is active |
| `bhk_required` | `Boolean` | `@default(false)` | Whether BHK config is required |
| `floor_required` | `Boolean` | `@default(false)` | Whether floor number is required |
| `plot_area_required` | `Boolean` | `@default(false)` | Whether plot area is required |
| `legacy_category_slug` | `String?` | optional | Maps to legacy hierarchy (e.g., "residential") |
| `legacy_type_slug` | `String?` | optional | Maps to legacy hierarchy (e.g., "flat") |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Relations (has many)**:
- `inventory` -> `Inventory[]`

**Indexes**:
- `[main_category, is_active]`

---

### 12. PropertyCategory

**Description**: Top-level property classification (Residential, Commercial). Part of the PHASE 7 hierarchical master data system.

**Database table**: `master_categories`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `name` | `String` | required | Residential, Commercial |
| `slug` | `String` | `@unique` | URL-safe identifier |
| `description` | `String?` | optional | Category description |
| `icon` | `String?` | optional | Icon identifier (e.g., "home", "building") |
| `display_order` | `Int` | `@default(0)` | Sort order |
| `is_active` | `Boolean` | `@default(true)` | Whether category is active |
| `labels_json` | `Json?` | optional | Multi-language labels: `{ "en": "Residential", "hi": "..." }` |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Relations (has many)**:
- `sub_categories` -> `PropertySubCategory[]`
- `inventory` -> `Inventory[]`

---

### 13. PropertySubCategory

**Description**: Second-level property classification (Apartment, Individual Housing, etc.). Child of PropertyCategory.

**Database table**: `master_sub_categories`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `category_id` | `String` | FK -> PropertyCategory.id | Parent category, cascade delete |
| `name` | `String` | required | Apartment, Individual Housing |
| `slug` | `String` | required | URL-safe identifier |
| `icon` | `String?` | optional | Icon identifier |
| `display_order` | `Int` | `@default(0)` | Sort order |
| `is_active` | `Boolean` | `@default(true)` | Whether sub-category is active |
| `labels_json` | `Json?` | optional | Multi-language labels |
| `validation_rules` | `Json?` | optional | `{ "bhk_required": true, "floor_required": true, ... }` |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Foreign Keys**:
- `category_id` -> `PropertyCategory.id` (cascade delete)

**Unique Constraints**:
- `[category_id, slug]`

**Relations (has many)**:
- `property_types` -> `PropertyType[]`
- `inventory` -> `Inventory[]`

---

### 14. PropertyType

**Description**: Third-level property classification (Studio, 1 BHK, Villa, etc.). Child of PropertySubCategory.

**Database table**: `master_property_types`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `sub_category_id` | `String` | FK -> PropertySubCategory.id | Parent sub-category, cascade delete |
| `name` | `String` | required | Studio, 1 BHK, Villa |
| `slug` | `String` | required | URL-safe identifier |
| `icon` | `String?` | optional | Icon identifier |
| `display_order` | `Int` | `@default(0)` | Sort order |
| `is_active` | `Boolean` | `@default(true)` | Whether type is active |
| `labels_json` | `Json?` | optional | Multi-language labels |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Foreign Keys**:
- `sub_category_id` -> `PropertySubCategory.id` (cascade delete)

**Unique Constraints**:
- `[sub_category_id, slug]`

**Relations (has many)**:
- `inventory` -> `Inventory[]`

---

### 15. PropertyConfiguration

**Description**: BHK and furnishing configurations (1 BHK, 2 BHK, 3 BHK, Furnished Office, etc.).

**Database table**: `master_configurations`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `name` | `String` | required | 1 BHK, 2 BHK, 3 BHK, Furnished Office |
| `slug` | `String` | `@unique` | URL-safe identifier |
| `icon` | `String?` | optional | Icon identifier |
| `display_order` | `Int` | `@default(0)` | Sort order |
| `is_active` | `Boolean` | `@default(true)` | Whether config is active |
| `labels_json` | `Json?` | optional | Multi-language labels |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Relations (has many)**:
- `inventory` -> `Inventory[]`

---

### 16. UsageType

**Description**: Property usage intent classification (Self-use, Investment, Rental Income).

**Database table**: `master_usage_types`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `name` | `String` | required | Self-use, Investment, Rental Income |
| `slug` | `String` | `@unique` | URL-safe identifier |
| `icon` | `String?` | optional | Icon identifier |
| `display_order` | `Int` | `@default(0)` | Sort order |
| `is_active` | `Boolean` | `@default(true)` | Whether type is active |
| `labels_json` | `Json?` | optional | Multi-language labels |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Relations (has many)**:
- `inventory` -> `Inventory[]`

---

### 17. InvestmentType

**Description**: Property investment stage classification (Pre-launch, Under Construction, Ready to Move).

**Database table**: `master_investment_types`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `name` | `String` | required | Pre-launch, Under Construction, Ready to Move |
| `slug` | `String` | `@unique` | URL-safe identifier |
| `icon` | `String?` | optional | Icon identifier |
| `display_order` | `Int` | `@default(0)` | Sort order |
| `is_active` | `Boolean` | `@default(true)` | Whether type is active |
| `labels_json` | `Json?` | optional | Multi-language labels |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Relations (has many)**:
- `inventory` -> `Inventory[]`

---

### 18. PartnerAgent

**Description**: External marketplace agents with subscription-based package tiers and listing limits. Legacy model; PHASE 12 migrates relations to the unified Owner model.

**Database table**: `partner_agents`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `phone_number` | `String` | `@unique`, FK -> Contact.phone_number | Contact phone (unique) |
| `name` | `String` | required | Agent name |
| `email` | `String?` | optional | Email address |
| `company_name` | `String?` | optional | Agency/company name |
| `city` | `String?` | optional | Operating city |
| `package_type` | `AgentPackage` | `@default(FREE)` | FREE, PRO, ADVANCE_PRO |
| `status` | `AgentStatus` | `@default(ACTIVE)` | ACTIVE, SUSPENDED, EXPIRED, PENDING_PAYMENT |
| `listing_limit` | `Int` | `@default(10)` | Max listings: FREE=10, PRO=50, ADVANCE_PRO=999 |
| `priority_score` | `Int` | `@default(50)` | Matching ranking priority |
| `subscription_start` | `DateTime?` | optional | Subscription start date |
| `subscription_end` | `DateTime?` | optional | Subscription end date |
| `agency_name` | `String?` | optional | **Legacy**: Agency name |
| `partner_type` | `String?` | optional | **Legacy**: HAS_PROPERTIES, HAS_BUYERS, BOTH |
| `verified` | `Boolean` | `@default(false)` | Verification status |
| `commission_rate` | `Decimal?` | optional | Commission percentage |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Foreign Keys**:
- `phone_number` -> `Contact.phone_number`

**Indexes**:
- `[phone_number]`
- `[package_type, status]`

---

### 19. LeadScore

**Description**: Lead scoring metrics computed from engagement, intent signals, reliability history, and urgency indicators.

**Database table**: `lead_scores`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `phone_number` | `String` | `@id` | **Primary key** - FK -> Contact.phone_number |
| `tenant_id` | `String` | required | Tenant ID (not FK-constrained) |
| `intent_score` | `Int` | `@default(0)` | Intent signal score |
| `engagement_score` | `Int` | `@default(0)` | Engagement level score |
| `reliability_score` | `Int` | `@default(0)` | Reliability score |
| `urgency_score` | `Int` | `@default(0)` | Urgency score |
| `total_score` | `Int` | `@default(0)` | Computed total score |
| `no_show_count` | `Int` | `@default(0)` | Number of no-shows |
| `last_no_show_at` | `DateTime?` | optional | Last no-show timestamp |
| `last_updated_at` | `DateTime` | `@updatedAt` | Last score update |

**Foreign Keys**:
- `phone_number` -> `Contact.phone_number`

---

### 20. ConversationSession

**Description**: Persistent workflow state for multi-step conversation flows. Tracks active workflow, current state, and context data for each contact.

**Database table**: `conversation_sessions`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `phone_number` | `String` | FK -> Contact.phone_number | Contact phone |
| `workflow` | `String` | required | buyer, seller, unknown, partner_agent, management |
| `state` | `String` | required | Current workflow state (e.g., INTAKE, QUALIFICATION) |
| `context` | `Json?` | optional | Workflow-specific context data |
| `active` | `Boolean` | `@default(true)` | Whether session is active |
| `created_at` | `DateTime` | `@default(now())` | Session creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Foreign Keys**:
- `phone_number` -> `Contact.phone_number`

**Indexes**:
- `[phone_number, active]`
- `[phone_number, active, workflow]`

---

### 21. WebsiteLead

**Description**: Leads captured from website popups, cookies, contact forms, and newsletter signups. Tracks conversion to Contact records.

**Database table**: `website_leads`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `name` | `String?` | optional | Visitor name |
| `phone` | `String?` | optional | Visitor phone |
| `email` | `String?` | optional | Visitor email |
| `interest` | `String?` | optional | buy, rent, sell, invest, browse |
| `source` | `String` | `@default("popup")` | popup, cookie, newsletter, contact_form |
| `page_url` | `String?` | optional | Page URL where lead was captured |
| `user_agent` | `String?` | optional | Browser user agent |
| `ip_address` | `String?` | optional | Visitor IP address |
| `cookie_consent` | `Boolean` | `@default(false)` | Cookie consent status |
| `consent_timestamp` | `DateTime?` | optional | When consent was given |
| `converted_to_contact` | `Boolean` | `@default(false)` | Whether converted to Contact |
| `contact_phone` | `String?` | optional | Linked Contact phone if converted |
| `created_at` | `DateTime` | `@default(now())` | Capture timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Indexes**:
- `[email]`
- `[phone]`

---

### 22. NewsletterSubscriber

**Description**: Newsletter email subscribers with subscription lifecycle tracking.

**Database table**: `newsletter_subscribers`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `email` | `String` | `@unique` | Subscriber email (unique) |
| `name` | `String?` | optional | Subscriber name |
| `status` | `String` | `@default("active")` | active, unsubscribed |
| `source` | `String` | `@default("website")` | website, footer, popup |
| `subscribed_at` | `DateTime` | `@default(now())` | Subscription date |
| `unsubscribed_at` | `DateTime?` | optional | Unsubscribe date |

---

### 23. ScheduledVisit

**Description**: Property site visit scheduling with external agent coordination and buyer info masking for free-tier agents.

**Database table**: `scheduled_visits`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `contact_id` | `String` | FK -> Contact.phone_number | Visitor contact (SSOT) |
| `property_id` | `String` | required | Property being visited |
| `name` | `String?` | optional | Visitor name |
| `phone` | `String?` | optional | Visitor phone |
| `email` | `String?` | optional | Visitor email |
| `preferred_date` | `DateTime?` | optional | Preferred visit date |
| `preferred_time` | `String?` | optional | Preferred time slot |
| `message` | `String?` | optional | Additional message |
| `source` | `String?` | optional | website_chat, website_form, whatsapp, voice, manual |
| `status` | `String` | `@default("pending")` | pending, confirmed, completed, cancelled |
| `agent_id` | `String?` | optional | External agent ID (if agent's property) |
| `internal_handler_id` | `String?` | optional | Internal staff coordinator |
| `buyer_info_masked` | `Boolean` | `@default(false)` | TRUE for FREE agent appointments |
| `metadata` | `Json?` | optional | Session ID, booking details |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Foreign Keys**:
- `contact_id` -> `Contact.phone_number`

**Indexes**:
- `[contact_id]`
- `[property_id]`
- `[agent_id]`

---

### 24. Appointment

**Description**: Unified calendar appointment system supporting property visits, follow-up calls, meetings, documentation, negotiation, and more. Integrates with WhatsApp reminders and transaction lifecycle.

**Database table**: `appointments`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `contact_id` | `String` | FK -> Contact.phone_number | Contact (SSOT) |
| `title` | `String` | required | Appointment title |
| `description` | `String?` | `@db.Text` | Detailed description |
| `type` | `AppointmentType` | enum | property_visit, follow_up_call, meeting, etc. |
| `scheduled_at` | `DateTime` | required | Appointment date/time |
| `duration` | `Int` | `@default(30)` | Duration in minutes |
| `end_time` | `DateTime?` | optional | Calculated or manual end time |
| `assigned_to_agent_id` | `String?` | FK -> Agent.id | Internal agent handling it |
| `property_id` | `String?` | FK -> Inventory.id | Linked property |
| `transaction_id` | `String?` | FK -> Transaction.id | Linked transaction |
| `status` | `AppointmentStatus` | `@default(scheduled)` | scheduled, confirmed, completed, etc. |
| `source` | `String?` | optional | website_chat, whatsapp, voice, manual, ai_bot |
| `channel` | `String?` | optional | whatsapp, voice, website |
| `reminder_sent` | `Boolean` | `@default(false)` | Whether reminder was sent |
| `reminder_sent_at` | `DateTime?` | optional | When reminder was sent |
| `confirmation_received` | `Boolean` | `@default(false)` | Whether contact confirmed |
| `whatsapp_message_id` | `String?` | optional | WhatsApp message ID for reminder |
| `location` | `String?` | optional | Physical meeting location |
| `notes` | `String?` | `@db.Text` | Additional notes |
| `metadata` | `Json?` | optional | Session ID, booking details, AI context |
| `tenant_id` | `String` | FK -> Tenant.id | Owning tenant |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Foreign Keys**:
- `contact_id` -> `Contact.phone_number`
- `assigned_to_agent_id` -> `Agent.id`
- `property_id` -> `Inventory.id`
- `transaction_id` -> `Transaction.id`
- `tenant_id` -> `Tenant.id`

**Indexes**:
- `[contact_id]`
- `[assigned_to_agent_id]`
- `[property_id]`
- `[transaction_id]`
- `[scheduled_at]`
- `[status]`

---

### 25. Commission

**Description**: Agent commission tracking for property deals, linked to the unified Owner model (PHASE 12).

**Database table**: `commissions`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `owner_id` | `String` | FK -> Owner.id | Owner (cascade delete) |
| `visit_id` | `String` | required | Reference to ScheduledVisit or deal |
| `property_id` | `String` | required | Property ID |
| `transaction_id` | `String?` | optional | Link to Transaction |
| `deal_value` | `Decimal?` | optional | Final deal amount |
| `commission_rate` | `Decimal` | `@default(2.0)` | Percentage (e.g., 2%) |
| `commission_amount` | `Decimal?` | optional | Calculated commission |
| `status` | `String` | `@default("PENDING")` | PENDING, APPROVED, PAID, DISPUTED |
| `paid_at` | `DateTime?` | optional | Payment date |
| `notes` | `String?` | `@db.Text` | Additional notes |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Foreign Keys**:
- `owner_id` -> `Owner.id` (cascade delete)

**Indexes**:
- `[owner_id, status]`

---

### 26. StaffCall

**Description**: Staff call recordings with AI transcription, extraction, and human-in-the-loop review workflow (PHASE 8).

**Database table**: `staff_calls`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `tenant_id` | `String` | FK -> Tenant.id | Owning tenant |
| `staff_agent_id` | `String` | FK -> Agent.id | Staff agent who made/received the call |
| `phone_number` | `String` | FK -> Contact.phone_number | Contact phone (business call) |
| `recording_url` | `String?` | optional | Cloud storage URL |
| `duration` | `Int?` | optional | Duration in seconds |
| `transcript` | `String?` | `@db.Text` | Call transcript |
| `ai_extraction` | `Json?` | optional | Full AI extracted data (intent, location, budget, etc.) |
| `confidence_score` | `Float?` | optional | AI confidence 0.0-1.0 |
| `call_type` | `String` | `@default("BUSINESS")` | BUSINESS, PERSONAL |
| `classification` | `String` | required | INBOUND, OUTBOUND |
| `status` | `CallStatus` | `@default(UPLOADING)` | Processing pipeline status |
| `staff_edited_data` | `Json?` | optional | Staff edits/corrections |
| `submitted_at` | `DateTime?` | optional | When staff submitted review |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Foreign Keys**:
- `tenant_id` -> `Tenant.id`
- `staff_agent_id` -> `Agent.id`
- `phone_number` -> `Contact.phone_number`

**Indexes**:
- `[staff_agent_id]`
- `[phone_number]`
- `[status]`

---

### 27. Owner

**Description**: Unified ownership model (PHASE 12 - Marketplace Transformation). Replaces scattered ownership references. An owner can be INTERNAL (staff-managed) or EXTERNAL (agent/builder).

**Database table**: `owners`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `scope` | `OwnerScope` | enum | INTERNAL or EXTERNAL |
| `externalType` | `ExternalOwnerType?` | enum | Required if EXTERNAL: INDIVIDUAL_AGENT, PROPERTY_AGENT, REAL_ESTATE_BUILDER |
| `contact_phone` | `String` | `@unique`, FK -> Contact.phone_number | SSOT link to Contact (cascade delete) |
| `status` | `OwnerStatus` | `@default(PENDING_VERIFICATION)` | ACTIVE, SUSPENDED, EXPIRED, PENDING_VERIFICATION |
| `listing_limit` | `Int` | `@default(10)` | Maximum allowed listings |
| `priority_score` | `Int` | `@default(50)` | Matching ranking priority |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Foreign Keys**:
- `contact_phone` -> `Contact.phone_number` (cascade delete)

**Relations (has many / has one)**:
- `subscription` -> `Subscription?`
- `inventory` -> `Inventory[]`
- `projects` -> `Project[]`
- `commissions` -> `Commission[]`

**Indexes**:
- `[scope, externalType]`
- `[status]`

---

### 28. Subscription

**Description**: Owner subscription plans with billing period tracking and auto-renewal.

**Database table**: `subscriptions`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `owner_id` | `String` | `@unique`, FK -> Owner.id | Owner (one-to-one, cascade delete) |
| `plan_type` | `PlanType` | enum | FREE, BASIC, PRO, PREMIUM |
| `status` | `SubscriptionStatus` | `@default(ACTIVE)` | ACTIVE, EXPIRED, CANCELLED, PENDING_PAYMENT |
| `start_date` | `DateTime?` | optional | Subscription start |
| `end_date` | `DateTime?` | optional | Subscription end |
| `auto_renew` | `Boolean` | `@default(false)` | Auto-renewal enabled |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Foreign Keys**:
- `owner_id` -> `Owner.id` (cascade delete)

**Indexes**:
- `[plan_type, status]`

---

### 29. Project

**Description**: Builder projects with unit configurations, media, and lead management (PHASE 12).

**Database table**: `projects`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `owner_id` | `String` | FK -> Owner.id | Builder/owner (cascade delete) |
| `name` | `String` | required | Project name |
| `project_type` | `ProjectType` | enum | RESIDENTIAL, COMMERCIAL, MIXED_USE |
| `city` | `String` | required | City |
| `locality` | `String` | required | Locality/area |
| `google_map_link` | `String?` | optional | Google Maps link |
| `rera_number` | `String?` | optional | RERA registration number |
| `possession_date` | `DateTime?` | optional | Expected possession date |
| `project_status` | `ProjectStatus` | enum | UPCOMING, UNDER_CONSTRUCTION, READY_TO_MOVE, DELIVERED |
| `short_description` | `String` | `@db.Text` | Brief description |
| `long_description` | `String?` | `@db.Text` | Detailed description |
| `status` | `ProjectListingStatus` | `@default(DRAFT)` | DRAFT, ACTIVE, PAUSED, SOLD_OUT, ARCHIVED |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Foreign Keys**:
- `owner_id` -> `Owner.id` (cascade delete)

**Relations (has many)**:
- `units` -> `ProjectUnit[]`
- `media` -> `ProjectMedia[]`
- `leads` -> `BuilderLead[]`
- `appointments` -> `BuilderAppointment[]`

**Indexes**:
- `[owner_id]`
- `[city, locality]`
- `[status, project_status]`

---

### 30. ProjectUnit

**Description**: Individual unit configurations within a builder project (e.g., "1 BHK", "2 BHK", "Office 500sqft") with area ranges and pricing.

**Database table**: `project_units`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `project_id` | `String` | FK -> Project.id | Parent project (cascade delete) |
| `configuration` | `String` | required | "1 BHK", "2 BHK", "Office 500sqft" |
| `area_min` | `Float?` | optional | Minimum area |
| `area_max` | `Float?` | optional | Maximum area |
| `price_min` | `Float?` | optional | Minimum price |
| `price_max` | `Float?` | optional | Maximum price |
| `available_units` | `Int` | `@default(0)` | Number of available units |
| `is_active` | `Boolean` | `@default(true)` | Whether unit config is active |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Foreign Keys**:
- `project_id` -> `Project.id` (cascade delete)

**Indexes**:
- `[project_id]`

---

### 31. ProjectMedia

**Description**: Media assets (images, videos, floor plans, brochures, master plans) attached to builder projects.

**Database table**: `project_media`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `project_id` | `String` | FK -> Project.id | Parent project (cascade delete) |
| `media_type` | `MediaType` | enum | IMAGE, VIDEO, FLOOR_PLAN, BROCHURE, MASTER_PLAN |
| `url` | `String` | required | Media URL |
| `title` | `String?` | optional | Media title/caption |
| `created_at` | `DateTime` | `@default(now())` | Upload timestamp |

**Foreign Keys**:
- `project_id` -> `Project.id` (cascade delete)

**Indexes**:
- `[project_id]`

---

### 32. BuilderLead

**Description**: Leads generated for builder projects from various channels (PHASE 12).

**Database table**: `builder_leads`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `project_id` | `String` | FK -> Project.id | Target project (cascade delete) |
| `contact_phone` | `String` | FK -> Contact.phone_number | Lead contact |
| `source` | `String` | required | WEBSITE, WHATSAPP, CALL, CAMPAIGN |
| `configuration` | `String?` | optional | Interested unit configuration |
| `status` | `BuilderLeadStatus` | `@default(NEW)` | NEW, CONTACTED, VISIT_SCHEDULED, VISITED, NEGOTIATION, CONVERTED, LOST |
| `created_at` | `DateTime` | `@default(now())` | Lead capture timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Foreign Keys**:
- `project_id` -> `Project.id` (cascade delete)
- `contact_phone` -> `Contact.phone_number`

**Relations (has many)**:
- `appointments` -> `BuilderAppointment[]`

**Indexes**:
- `[project_id]`
- `[contact_phone]`
- `[status]`

---

### 33. BuilderAppointment

**Description**: Site visit appointments for builder project leads (PHASE 12).

**Database table**: `builder_appointments`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `lead_id` | `String` | FK -> BuilderLead.id | Associated lead (cascade delete) |
| `project_id` | `String` | FK -> Project.id | Target project (cascade delete) |
| `visit_date` | `DateTime` | required | Visit date |
| `visit_time` | `String` | required | Visit time |
| `status` | `BuilderAppointmentStatus` | `@default(SCHEDULED)` | SCHEDULED, CONFIRMED, VISITED, NO_SHOW, CANCELLED |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Foreign Keys**:
- `lead_id` -> `BuilderLead.id` (cascade delete)
- `project_id` -> `Project.id` (cascade delete)

**Indexes**:
- `[lead_id]`
- `[project_id]`
- `[visit_date]`

---

### 34. AgentActionLog

**Description**: Multi-agent AI audit trail. Every action taken by AI agents (master, sales, matching, appointment, etc.) is logged with input/output summaries and quality scores.

**Database table**: `agent_action_logs`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `agent_name` | `String` | required | master, sales, matching, appointment, etc. |
| `task_type` | `String` | required | classify, match, schedule, follow_up, respond, etc. |
| `phone_number` | `String?` | optional | Contact involved (if any) |
| `input_summary` | `String?` | `@db.Text` | What the agent received |
| `output_summary` | `String?` | `@db.Text` | What the agent returned |
| `quality_score` | `Float?` | optional | QA agent's score (0-10) |
| `duration_ms` | `Int?` | optional | Execution duration in ms |
| `status` | `String` | `@default("success")` | success, failed, escalated |
| `error_message` | `String?` | `@db.Text` | Error details if failed |
| `created_at` | `DateTime` | `@default(now())` | Action timestamp |

**Indexes**:
- `[agent_name]`
- `[phone_number]`
- `[created_at]`
- `[status]`
- `[agent_name, status, created_at]`

---

### 35. QALog

**Description**: Quality assurance tracking for AI agent responses. Stores quality scores, issue detection, sentiment analysis, and human review flagging.

**Database table**: `qa_logs`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `interaction_id` | `String?` | optional | Reference to Interaction being scored |
| `phone_number` | `String` | required | Contact involved |
| `agent_name` | `String` | required | Which AI agent produced the response |
| `quality_score` | `Float` | required | Score 0-10 (10 = perfect) |
| `issues` | `Json?` | optional | `[{type: 'hallucination', detail: '...'}, ...]` |
| `sentiment` | `String?` | optional | positive, neutral, negative, frustrated |
| `flagged` | `Boolean` | `@default(false)` | TRUE = needs human review |
| `reviewed_by` | `String?` | optional | Human agent who reviewed |
| `created_at` | `DateTime` | `@default(now())` | Log timestamp |

**Indexes**:
- `[phone_number]`
- `[agent_name]`
- `[flagged]`
- `[created_at]`

---

### 36. Transaction

**Description**: Property deal lifecycle management. Built on the "4 Pillars" pattern: Demand (buyer) + Supply (seller) + Executive (internal agent) + Inventory (property). Tracks the full journey from lead to close.

**Database table**: `transactions`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `tenant_id` | `String` | FK -> Tenant.id | Owning tenant |
| `demand_contact_id` | `String` | FK -> Contact.phone_number | Buyer/Tenant phone (REQUIRED) |
| `supply_contact_id` | `String?` | FK -> Contact.phone_number | Seller/Landlord phone (null until matched) |
| `executive_agent_id` | `String?` | FK -> Agent.id | Internal sales executive |
| `inventory_id` | `String?` | FK -> Inventory.id | Property reference (null until matched) |
| `type` | `TransactionType` | enum | SALE or RENT |
| `status` | `TransactionStatus` | `@default(NEW)` | NEW, MATCHED, VISIT_SCHEDULED, etc. |
| `priority` | `Int` | `@default(0)` | Higher = more important |
| `demand_property_type` | `String?` | optional | flat, house, plot, commercial |
| `demand_location` | `String?` | optional | Preferred locality/city |
| `demand_budget_min` | `Float?` | optional | Min budget |
| `demand_budget_max` | `Float?` | optional | Max budget |
| `demand_bedrooms` | `String?` | optional | 1BHK, 2BHK, etc. |
| `demand_notes` | `String?` | `@db.Text` | Additional requirements |
| `final_price` | `Float?` | optional | Agreed price (on CLOSED_WON) |
| `close_reason` | `String?` | optional | Why closed (won or lost) |
| `commission_amount` | `Float?` | optional | Commission earned |
| `source` | `String` | `@default("whatsapp")` | whatsapp, web, voice, admin |
| `previous_status` | `TransactionStatus?` | optional | For ON_HOLD recovery |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |
| `closed_at` | `DateTime?` | optional | When deal was closed |

**Foreign Keys**:
- `tenant_id` -> `Tenant.id`
- `demand_contact_id` -> `Contact.phone_number`
- `supply_contact_id` -> `Contact.phone_number`
- `executive_agent_id` -> `Agent.id`
- `inventory_id` -> `Inventory.id`

**Relations (has many)**:
- `logs` -> `TransactionLog[]`
- `appointments` -> `Appointment[]` (named: TransactionAppointments)

**Indexes**:
- `[demand_contact_id]`
- `[supply_contact_id]`
- `[executive_agent_id]`
- `[inventory_id]`
- `[status]`
- `[tenant_id, status]`

---

### 37. TransactionLog

**Description**: Immutable audit trail for transaction state changes. Every status transition, assignment change, and notable event is logged.

**Database table**: `transaction_logs`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `transaction_id` | `String` | FK -> Transaction.id | Parent transaction (cascade delete) |
| `action` | `TransactionLogAction` | enum | CREATED, STATUS_CHANGED, EXECUTIVE_ASSIGNED, etc. |
| `old_status` | `TransactionStatus?` | optional | Previous status |
| `new_status` | `TransactionStatus?` | optional | New status |
| `performed_by` | `String?` | optional | phone_number or agent_id of who triggered |
| `channel` | `String?` | optional | whatsapp, web, voice, system |
| `details` | `Json?` | optional | Flexible payload (notes, reason, metadata) |
| `created_at` | `DateTime` | `@default(now())` | Log timestamp |

**Foreign Keys**:
- `transaction_id` -> `Transaction.id` (cascade delete)

**Indexes**:
- `[transaction_id]`
- `[action]`
- `[created_at]`

---

### 38. CampaignTemplate

**Description**: Reusable message templates for marketing campaigns across channels (WhatsApp, email, SMS, voice).

**Database table**: `campaign_templates`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `name` | `String` | required | "Welcome Message", "Follow-up Reminder" |
| `channel` | `String` | required | whatsapp, email, sms, voice |
| `category` | `String?` | optional | welcome, followup, promotional, reminder, transactional |
| `subject` | `String?` | optional | For email templates |
| `body` | `String` | `@db.Text` | Template with `{{variables}}` |
| `variables` | `Json` | `@default("[]")` | `[{"name": "first_name", "required": true, "default": "Customer"}, ...]` |
| `avg_score` | `Float?` | optional | Average quality score |
| `times_used` | `Int` | `@default(0)` | Usage count |
| `avg_open_rate` | `Float?` | optional | Email open rate |
| `avg_reply_rate` | `Float?` | optional | WhatsApp reply rate |
| `created_by` | `String?` | optional | Agent ID |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Relations (has many)**:
- `campaigns` -> `Campaign[]`

**Indexes**:
- `[channel]`
- `[category]`

---

### 39. Campaign

**Description**: Marketing campaigns (broadcasts, drip sequences, launch promos) with audience targeting, scheduling, recurrence, and A/B testing.

**Database table**: `campaigns`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `name` | `String` | required | "Noida Flat Launch", "Follow-up Wave 3" |
| `type` | `String` | `@default("broadcast")` | broadcast, drip, launch_promo, follow_up |
| `channel` | `String` | `@default("whatsapp")` | whatsapp, email, voice |
| `template_id` | `String?` | FK -> CampaignTemplate.id | Template reference (set null on delete) |
| `audience` | `Json?` | optional | Filter criteria: `{city, budget_min, contact_type, property_type}` |
| `message` | `String` | `@db.Text` | Message content (can override template) |
| `subject` | `String?` | optional | For email campaigns |
| `status` | `String` | `@default("draft")` | draft, scheduled, sending, completed, cancelled |
| `sent_count` | `Int` | `@default(0)` | Messages sent |
| `delivered` | `Int` | `@default(0)` | Messages delivered |
| `responded` | `Int` | `@default(0)` | Responses received |
| `failed_count` | `Int` | `@default(0)` | Failed deliveries |
| `scheduled_at` | `DateTime?` | optional | Scheduled send time |
| `completed_at` | `DateTime?` | optional | Campaign completion time |
| `recurrence_rule` | `String?` | optional | Cron format: "0 9 * * 1" |
| `ab_test_config` | `Json?` | optional | A/B test configuration |
| `created_by` | `String?` | optional | Agent ID who created |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Foreign Keys**:
- `template_id` -> `CampaignTemplate.id` (set null on delete)

**Indexes**:
- `[status]`
- `[type]`
- `[created_at]`
- `[template_id]`

---

### 40. WorkProject

**Description**: Project boards for task management (Phase 3.3). Groups related tasks under a named project with team assignment.

**Database table**: `work_projects`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `name` | `String` | required | Project name |
| `description` | `String?` | optional | Project description |
| `status` | `String` | `@default("ACTIVE")` | ACTIVE, COMPLETED, ON_HOLD, CANCELLED |
| `start_date` | `DateTime` | `@default(now())` | Project start date |
| `end_date` | `DateTime?` | optional | Project end date |
| `owner_id` | `String?` | optional | Agent ID (project owner) |
| `team_members` | `Json?` | optional | Array of agent IDs with access |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Relations (has many)**:
- `tasks` -> `Task[]`

**Indexes**:
- `[status]`
- `[owner_id]`

---

### 41. Task

**Description**: Work tasks for project management. Linked to contacts and properties via SSOT pattern. Supports tagging, priority levels, and completion tracking.

**Database table**: `tasks`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `project_id` | `String?` | FK -> WorkProject.id | Parent project (set null on delete) |
| `title` | `String` | required | Task title |
| `description` | `String?` | `@db.Text` | Detailed description |
| `assigned_to` | `String` | required | Agent ID |
| `due_date` | `DateTime` | required | Due date |
| `priority` | `String` | `@default("MEDIUM")` | LOW, MEDIUM, HIGH, URGENT |
| `status` | `String` | `@default("TODO")` | TODO, IN_PROGRESS, DONE, BLOCKED |
| `contact_phone` | `String?` | FK -> Contact.phone_number | Linked contact (set null on delete) |
| `property_id` | `String?` | FK -> Inventory.id | Linked property (set null on delete) |
| `tags` | `String[]` | array | Categorization tags: ["follow-up", "payment", "documentation"] |
| `completed_at` | `DateTime?` | optional | Completion timestamp |
| `completed_by` | `String?` | optional | Agent who completed |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Foreign Keys**:
- `project_id` -> `WorkProject.id` (set null on delete)
- `contact_phone` -> `Contact.phone_number` (set null on delete)
- `property_id` -> `Inventory.id` (set null on delete)

**Indexes**:
- `[assigned_to]`
- `[status]`
- `[due_date]`
- `[project_id]`
- `[contact_phone]`
- `[property_id]`

---

### 42. AuditReport

**Description**: AI Boss daily conversation audit reports with quality scoring, issue categorization, agent breakdown, and prompt engineering actions.

**Database table**: `audit_reports`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `report_date` | `DateTime` | `@default(now())` | Audit date |
| `total_conversations` | `Int` | required | Total conversations audited |
| `total_flagged` | `Int` | required | Number flagged for review |
| `avg_quality_score` | `Float?` | optional | Average quality score |
| `issues_found` | `Json` | required | `[{category, count, severity, examples[], suggestion}]` |
| `agent_breakdown` | `Json?` | optional | `{sales: {count, avg_score}, classifier: {...}, ...}` |
| `sentiment_stats` | `Json?` | optional | `{positive: N, neutral: N, negative: N, frustrated: N}` |
| `actions_taken` | `Json?` | optional | `[{prompt_key, section, content, reason}]` |
| `deployments` | `Int` | `@default(0)` | Number of prompt deployments |
| `email_sent` | `Boolean` | `@default(false)` | Whether summary email was sent |
| `email_sent_to` | `String?` | optional | Recipient email |
| `created_at` | `DateTime` | `@default(now())` | Report creation timestamp |

**Indexes**:
- `[report_date]`

---

### 43. PromptOverride

**Description**: AI-learned rules for runtime prompt injection. The prompt engineer agent can deploy overrides that modify AI behavior without code changes.

**Database table**: `prompt_overrides`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `prompt_key` | `String` | required | core_behavior, buyer_prompt, seller_prompt, identification, partner_prompt |
| `section` | `String` | required | greeting_rules, language_rules, qualification_rules, response_format, classification_rules |
| `content` | `String` | `@db.Text` | The override/addition text |
| `priority` | `Int` | `@default(0)` | Higher = applied later |
| `active` | `Boolean` | `@default(true)` | Whether override is active |
| `reason` | `String?` | `@db.Text` | Why this override was created |
| `audit_report_id` | `String?` | optional | Reference to triggering audit report |
| `deployed_by` | `String` | `@default("prompt_engineer_agent")` | Who deployed this override |
| `version` | `Int` | `@default(1)` | Version number |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Indexes**:
- `[prompt_key, active]`
- `[created_at]`

---

### 44. PendingMessage

**Description**: Queue for LLM-generated WhatsApp messages awaiting session re-open (when the 24-hour session window has expired).

**Database table**: `pending_messages`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `phone_number` | `String` | required | Recipient phone number |
| `message` | `String` | `@db.Text` | Message content |
| `context` | `String?` | optional | "followup", "ai_response", etc. |
| `status` | `String` | `@default("pending")` | pending, sent, expired |
| `created_at` | `DateTime` | `@default(now())` | Queue timestamp |
| `expires_at` | `DateTime` | required | Auto-expire after 48h |

**Indexes**:
- `[phone_number, status]`
- `[expires_at]`

---

### 45. Workflow

**Description**: Workflow automation rules (Phase 3.1). Trigger-condition-action pattern for automating lead assignments, notifications, task creation, and more.

**Database table**: `workflows`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `name` | `String` | required | Workflow name |
| `description` | `String?` | optional | Description |
| `trigger` | `String` | required | LEAD_CREATED, STATUS_CHANGED, PROPERTY_ADDED, APPOINTMENT_SCHEDULED, APPOINTMENT_COMPLETED, INTERACTION_RECEIVED |
| `conditions` | `Json` | `@default("[]")` | AND-logic conditions: `[{field, operator, value}]` |
| `actions` | `Json` | `@default("[]")` | Ordered actions: `[{type, params}]`. Types: ASSIGN_AGENT, SEND_WHATSAPP, SEND_EMAIL, CREATE_TASK, UPDATE_STATUS, SEND_VOICE_CALL |
| `delay_minutes` | `Int` | `@default(0)` | Delay before execution (0 = immediate) |
| `enabled` | `Boolean` | `@default(true)` | Whether workflow is active |
| `priority` | `Int` | `@default(0)` | Higher priority executes first |
| `max_executions_per_day` | `Int?` | optional | Spam prevention limit |
| `created_by` | `String?` | optional | Creator agent ID |
| `created_at` | `DateTime` | `@default(now())` | Record creation timestamp |
| `updated_at` | `DateTime` | `@updatedAt` | Last update timestamp |

**Relations (has many)**:
- `executions` -> `WorkflowExecution[]`

**Indexes**:
- `[trigger, enabled]`
- `[enabled, priority]`

---

### 46. WorkflowExecution

**Description**: Execution log for workflow runs. Records trigger data, action results, execution status, and performance metrics.

**Database table**: `workflow_executions`

| Field | Type | Attributes | Description |
|-------|------|------------|-------------|
| `id` | `String` | `@id @default(uuid())` | Primary key (UUID) |
| `workflow_id` | `String` | FK -> Workflow.id | Parent workflow (cascade delete) |
| `trigger_data` | `Json` | required | Full event data at time of execution |
| `status` | `String` | required | SUCCESS, FAILED, SKIPPED, PENDING |
| `error_message` | `String?` | `@db.Text` | Error details if failed |
| `actions_log` | `Json` | `@default("[]")` | `[{type, status, result}]` |
| `executed_at` | `DateTime` | `@default(now())` | Execution timestamp |
| `duration_ms` | `Int?` | optional | Execution duration in ms |

**Foreign Keys**:
- `workflow_id` -> `Workflow.id` (cascade delete)

**Indexes**:
- `[workflow_id, status]`
- `[executed_at]`

---

## Entity Relationships

### Core Multi-Tenant Architecture

```
Tenant (1) ----< (N) Contact
Tenant (1) ----< (N) Agent
Tenant (1) ----< (N) Interaction
Tenant (1) ----< (N) WhatsAppMessage
Tenant (1) ----< (N) VoiceCall
Tenant (1) ----< (N) Email
Tenant (1) ----< (N) TaskFollowup
Tenant (1) ----< (N) Inventory
Tenant (1) ----< (N) StaffCall
Tenant (1) ----< (N) Appointment
Tenant (1) ----< (N) Transaction
```

### Contact as SSOT (Central Hub)

The `Contact` model (keyed by `phone_number`) is the single source of truth for all people. Nearly every operational model links back to a Contact.

```
Contact (1) ----< (N) Interaction
Contact (1) ----< (N) WhatsAppMessage
Contact (1) ----< (N) VoiceCall
Contact (1) ----< (N) Email
Contact (1) ----< (N) TaskFollowup
Contact (1) ----< (N) StaffCall
Contact (1) ----< (N) ScheduledVisit
Contact (1) ----< (N) Appointment
Contact (1) ----< (N) ConversationSession
Contact (1) ----< (N) BuilderLead
Contact (1) ----< (N) Task

Contact (1) ----> (1) LeadScore
Contact (1) ----> (1) PartnerAgent
Contact (1) ----> (1) Owner

Contact (1) ----< (N) Inventory          [as owner_phone]
Contact (1) ----< (N) Inventory          [as key_holder - "KeyHolderProperties"]
Contact (1) ----< (N) Inventory          [as owner_contact - "OwnedProperties"]

Contact (1) ----< (N) Transaction        [as demand_contact - "DemandTransactions"]
Contact (1) ----< (N) Transaction        [as supply_contact - "SupplyTransactions"]
```

### Agent Hierarchy & Assignments

```
Agent (1) ----< (N) Agent                [self-referential: reports_to / subordinates]
Agent (1) ----< (N) Contact              [assigned leads]
Agent (1) ----< (N) Inventory            [assigned properties - "AssignedProperties"]
Agent (1) ----< (N) Inventory            [uploaded properties - "UploadedInventory"]
Agent (1) ----< (N) Inventory            [referenced properties - "ReferenceInventory"]
Agent (1) ----< (N) StaffCall
Agent (1) ----< (N) Appointment
Agent (1) ----< (N) Transaction          [as executive - "ExecutiveTransactions"]
```

### Inventory (Property) Relationships

```
Inventory (N) >---- (1) Owner            [unified ownership - PHASE 12]
Inventory (N) >---- (1) Contact          [owner_phone]
Inventory (N) >---- (1) Agent            [assigned_agent]
Inventory (N) >---- (1) Agent            [uploaded_by_agent]
Inventory (N) >---- (1) Agent            [reference_agent]
Inventory (N) >---- (1) Contact          [key_holder_contact]
Inventory (N) >---- (1) Contact          [owner_contact]

Inventory (N) >---- (1) PropertyCategory
Inventory (N) >---- (1) PropertySubCategory
Inventory (N) >---- (1) PropertyType
Inventory (N) >---- (1) PropertyConfiguration
Inventory (N) >---- (1) UsageType
Inventory (N) >---- (1) InvestmentType
Inventory (N) >---- (1) FlatPropertyType

Inventory (1) ----< (N) InventoryDocument
Inventory (1) ----< (N) Appointment
Inventory (1) ----< (N) Transaction
Inventory (1) ----< (N) Task
```

### Property Classification Hierarchy (PHASE 7)

```
PropertyCategory (1) ----< (N) PropertySubCategory (1) ----< (N) PropertyType
                                    |
                                    +------ validation_rules (JSON)
```

### Unified Ownership Model (PHASE 12)

```
Owner (1) ----> (1) Contact              [contact_phone - SSOT link]
Owner (1) ----> (1) Subscription         [one-to-one]
Owner (1) ----< (N) Inventory            [properties owned]
Owner (1) ----< (N) Project              [builder projects]
Owner (1) ----< (N) Commission           [commissions earned]
```

### Builder Project Ecosystem (PHASE 12)

```
Project (N) >---- (1) Owner              [builder/owner]
Project (1) ----< (N) ProjectUnit
Project (1) ----< (N) ProjectMedia
Project (1) ----< (N) BuilderLead
Project (1) ----< (N) BuilderAppointment

BuilderLead (N) >---- (1) Contact        [contact_phone]
BuilderLead (1) ----< (N) BuilderAppointment
```

### Transaction Lifecycle (4 Pillars)

```
Transaction (N) >---- (1) Contact        [demand_contact - Buyer/Tenant]
Transaction (N) >---- (1) Contact        [supply_contact - Seller/Landlord]
Transaction (N) >---- (1) Agent          [executive_agent - Internal handler]
Transaction (N) >---- (1) Inventory      [property reference]
Transaction (N) >---- (1) Tenant

Transaction (1) ----< (N) TransactionLog [immutable audit trail]
Transaction (1) ----< (N) Appointment    ["TransactionAppointments"]
```

### Campaign System

```
CampaignTemplate (1) ----< (N) Campaign
```

### Workflow Automation

```
Workflow (1) ----< (N) WorkflowExecution
```

### Task Management

```
WorkProject (1) ----< (N) Task
Task (N) >---- (1) Contact               [contact_phone - SSOT]
Task (N) >---- (1) Inventory             [property_id - SSOT]
```

### AI Quality & Audit Pipeline

```
AgentActionLog  -- standalone audit trail for AI agent actions
QALog           -- quality scores per interaction
AuditReport     -- daily rollup reports
PromptOverride  -- runtime AI behavior modifications
```

---

## Database Naming Conventions

| Prisma Model | Database Table | Notes |
|-------------|---------------|-------|
| Tenant | `tenants` | |
| Contact | `contacts` | PK = `phone_number` |
| Interaction | `interactions` | |
| WhatsAppMessage | `whatsapp_messages` | |
| VoiceCall | `voice_calls` | |
| Email | `emails` | |
| TaskFollowup | `tasks_followups` | |
| Agent | `agents` | |
| Inventory | `inventory` | Singular |
| InventoryDocument | `inventory_documents` | |
| FlatPropertyType | `flat_property_types` | |
| PropertyCategory | `master_categories` | Prefixed with `master_` |
| PropertySubCategory | `master_sub_categories` | Prefixed with `master_` |
| PropertyType | `master_property_types` | Prefixed with `master_` |
| PropertyConfiguration | `master_configurations` | Prefixed with `master_` |
| UsageType | `master_usage_types` | Prefixed with `master_` |
| InvestmentType | `master_investment_types` | Prefixed with `master_` |
| PartnerAgent | `partner_agents` | |
| LeadScore | `lead_scores` | PK = `phone_number` |
| ConversationSession | `conversation_sessions` | |
| WebsiteLead | `website_leads` | |
| NewsletterSubscriber | `newsletter_subscribers` | |
| ScheduledVisit | `scheduled_visits` | |
| Appointment | `appointments` | |
| Commission | `commissions` | |
| StaffCall | `staff_calls` | |
| Owner | `owners` | |
| Subscription | `subscriptions` | |
| Project | `projects` | |
| ProjectUnit | `project_units` | |
| ProjectMedia | `project_media` | |
| BuilderLead | `builder_leads` | |
| BuilderAppointment | `builder_appointments` | |
| AgentActionLog | `agent_action_logs` | |
| QALog | `qa_logs` | |
| Transaction | `transactions` | |
| TransactionLog | `transaction_logs` | |
| CampaignTemplate | `campaign_templates` | |
| Campaign | `campaigns` | |
| WorkProject | `work_projects` | |
| Task | `tasks` | |
| AuditReport | `audit_reports` | |
| PromptOverride | `prompt_overrides` | |
| PendingMessage | `pending_messages` | |
| Workflow | `workflows` | |
| WorkflowExecution | `workflow_executions` | |
