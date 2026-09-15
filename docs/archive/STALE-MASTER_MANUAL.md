---
description: Master Inspector Manual for Realty Pandit
---

# 🕵️‍♂️ Master Inspector Manual (Realty Pandit)

This document serves as the **Operating Manual** for the Master Inspector (You/Me).
All work on "Realty Pandit" MUST follow this protocol.

## 🧠 Core Responsibility
1.  **Analyze** requests.
2.  **Break down** into tasks.
3.  **Assign** to specialized Agent Workflows.
4.  **Record** in Task Manager.

---

## 📂 Project Structure (Agent Workshop)

```text
/agents             -> Code and logic for specific domains
/docs/tasks         -> MEMORY (JSON files) - Source of Truth for Progress
/docs/decisions     -> ARCHITECTURE DECISIONS (ADR)
/config             -> Shared environment and keys
```

---

```

---

## 🔍 Task Search Heuristics
Before creating a new task, always ask:
1.  **Does this touch WhatsApp/Voice?** (Check `/agents/whatsapp`, `/agents/voice_vapi`)
2.  **Does this modify SSOT?** (Check `task_manager`, `backend`)
3.  **Does this affect User/Dealer flow?** (Check `buyer_workflow`, `dealer_workflow`)

**Then Search**:
- `domain` in Task Files.
- `files_touched`.
- `/docs/decisions` for architectural rules.

---

## ⚖️ Decision vs Task
**Tasks** (`/docs/tasks/`) track "Work Done".
**Decisions** (`/docs/decisions/`) track "Rules Set".

**When to log a Decision?**
- "We will use phone number as primary ID." (Decision)
- "Implement phone number lookup." (Task)

---

## 🛠️ Master Commands

### 1. 📝 Create New Task
Use this template to create a new task.
**Path**: `./clients/sunny-sharma/projects/reality-pandit/docs/tasks/TASK-{XXX}.json`

```json
{
  "task_id": "TASK-XXX",
  "title": "Title",
  "status": "planned",
  "priority": "high",
  "classification": "Feature",
  "domain": ["Backend", "Frontend"],
  "created_at": "{TIMESTAMP}",
  "goal": "Description...",
  "dependencies": [],
  "acceptance_criteria": [
    "Criteria 1"
  ]
}
```

### 2. 📜 Log Decision
Use this when a major architectural or business decision is made.
**Path**: `./clients/sunny-sharma/projects/reality-pandit/docs/decisions/DEC-{XXX}.md`

```markdown
# DEC-XXX: Title
**Status**: Accepted
**Date**: {DATE}

## Decision
...

## Reason
...
```

### 3. 💾 Update Task Status
Always update the JSON file when:
- Workflow starts (`in_progress`)
- Workflow finishes (`completed`) -- **Fill `result_summary` and `files_touched`**

---

## 🤖 Agent Roster

| Agent | Directory | Responsibility |
|-------|-----------|----------------|
| **Buyer** | `/agents/buyer_workflow` | Customer journey, qualification |
| **Seller** | `/agents/seller_workflow` | Onboarding, listings |
| **Dealer** | `/agents/dealer_workflow` | Admin dashboard, permissions |
| **Logic Transfer** | `/agents/logic_transfer` | Business logic -> Code logic adapter |
| **Script** | `/agents/script_workflow` | Response text, Voice attributes |
| **WhatsApp** | `/agents/whatsapp` | Webhooks, templates |
| **Voice** | `/agents/voice_vapi` | Call routing, Vapi config |
| **Email** | `/agents/email` | Inbound/Outbound email handling |
| **AI Automation** | `/agents/ai_automation` | Prompts, Intent extraction |
| **Backend** | `/agents/backend` | API, DB, Auth, Lead Scoring |
| **Frontend** | `/agents/frontend` | Next.js UI |
| **Security** | `/agents/security` | Secrets, Rotation, Audit |
| **Deployment** | `/agents/deployment` | CI/CD, Infra |
| **Connection** | `/agents/connection_api` | External API config, Rate limits |

---

## 🚀 Standard Workflow loop

1.  **Receive Request**: "Add WhatsApp notification for new leads."
2.  **Search Memory**: Check `/docs/tasks` for similar/past work.
3.  **Plan**: Create `TASK-005.json` (Status: `planned`).
4.  **Delegate**:
    *   Initialize `Task-005` in `task.md` (Global).
    *   Go to `/agents/whatsapp` and Implement.
    *   Go to `/agents/backend` and Integrate.
5.  **Finalize**:
    *   Update `TASK-005.json` (Status: `completed`, add `files_touched`).
    *   Update Global `task.md`.

---

## 🏃‍♂️ How to Run (Operation Guide)

### 1. Requirements
- Node.js (v18+)
- PostgreSQL (Active)

### 2. Services

#### Backend (API + Webhooks + Scheduler)
Runs on Port **3002**.
```bash
cd agents/backend
npx ts-node src/server.ts
```

#### Frontend (Dashboard)
Runs on Port **5173**.
```bash
cd agents/frontend
npm run dev
```

### 3. Verification & Simulation

#### Simulate Webhook (Buyer/Seller)
Send mock WhatsApp messages to test workflows.
```bash
npx ts-node src/scripts/simulate_webhook.ts
```

#### Simulate Voice Call (Vapi)
Send mock "End of Call" report to test voice logging + interactions.
```bash
npx ts-node src/scripts/simulate_voice_webhook.ts
```

#### System Health Check
Verify Database, Scheduler, and recent logs.
```bash
npx ts-node src/scripts/system_health_check.ts
```

