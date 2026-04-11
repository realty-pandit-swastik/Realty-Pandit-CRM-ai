# DEC-001: Buyer vs Tenant Terminology Rule

## Status
Accepted

## Context
In the real estate domain, terminology is critical for professionalism and clarity. The Platform handles two distinct customer intents:
1.  **Buying** (Intending to purchase a property)
2.  **Renting/Leasing** (Intending to rent a property)

Confusion between these terms ("buyers for rent", "tenants for sale") degrades user trust and causes backend routing errors.

## Decision
We enforce a strict terminology rule across all AI prompts, UI labels, and Backend logic:

1.  **"Buyer" (Kharidar)** is reserved EXCLUSIVELY for the **SALE** intent.
2.  **"Tenant" (Kirkaya)** is reserved EXCLUSIVELY for the **RENT** or **LEASE** intent.

### Implementation Rules

#### 1. System Prompts (AI)
The AI System Prompt must include this explicit instruction:
> "TERMINOLOGY RULE (STRICT):
> - If Property Intent is RENT/LEASE -> Use term 'Tenants'. NEVER say 'Buyers'.
> - If Property Intent is SELL -> Use term 'Buyers'."

#### 2. User Interface
-   Dashboard filters must separate "Buyer Leads" from "Tenant Leads".
-   Inventory status messages must use the correct term (e.g., "Finding tenants for your flat").

#### 3. Codebase Variables
-   Variable names must reflect the role: `isBuyer`, `isTenant`.
-   Avoid generic `customer` where distinction matters.

## Consequences
-   **Positive**: consistent communication, higher user trust, clear data segmentation.
-   **Negative**: Requires strict adherence during development; "lazy" coding (calling everyone a buyer) is prohibited.
