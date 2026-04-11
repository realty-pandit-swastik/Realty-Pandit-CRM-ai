# DEC-002: Inventory Onboarding API Contract

## Status
Accepted

## Context
Inventory onboarding is a complex, multi-step process involving user interaction via WhatsApp/Voice and structured data persistence. To ensure reliability and scalability, a formal API contract is required between the Client (WhatsApp/Voice/Web) and the Backend.

## Decision
We adopt a **State-Driven, Session-Based** API for inventory onboarding.

### 1. Principles
-   **Phone Number as Identity**: The owner is identified by their phone number.
-   **Session Persistence**: Progress is saved per session (`inventorySessionId`).
-   **Step-by-Step Validation**: Each step is validated before moving to the next.
-   **Draft -> Commit**: Data is held in a "Draft" state until explicit confirmation.

### 2. API Endpoints

#### A. Start Session
**POST** `/inventory/session/start`
-   **Input**: `{ "tenantId": "uuid", "ownerPhoneNumber": "string", "intent": "RENT|SALE" }`
-   **Output**: `{ "inventorySessionId": "string", "state": "PROPERTY_CATEGORY_SELECTION", "reply": { "text": "string", "language": "string" } }`

#### B. Submit Step Data
**POST** `/inventory/step`
-   **Input**: `{ "inventorySessionId": "string", "state": "CURRENT_STATE", "payload": { ...data } }`
-   **Output**: `{ "nextState": "NEXT_STATE", "reply": { "text": "string", "language": "string" } }`

#### C. Confirm & Commit
**POST** `/inventory/commit`
-   **Input**: `{ "inventorySessionId": "string", "confirmed": true }`
-   **Output**: `{ "inventoryId": "string", "status": "ACTIVE", "reply": { "text": "string" } }`

### 3. Safety Boundaries
-   **State Machine Enforcement**: Using `InventoryStateMachine` prevents skipping steps.
-   **Data Validation**: Types (Residential/Commercial) are ENUMs; numeric fields are validated.
-   **Orphaned Sessions**: Sessions expire after 24 hours of inactivity.

## Consequences
-   **Positive**: Deterministic flow, easy to debug, supports multi-channel (WhatsApp/Voice) with one backend.
-   **Negative**: Requires maintaining session state (Redis/DB).
