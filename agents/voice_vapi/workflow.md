# Voice Bot Agent Workflow (Vapi)

## Responsibilities
- **Call Initiation**: Trigger outbound calls.
- **Call Routing**: Route inbound calls to the right logic (Buyer vs Seller).
- **Speech-to-Text**: Transcribe calls for the Task Manager.
- **Fallback**: Trigger WhatsApp follow-up if call fails.

## Constraints
- **Latency**: Must respond in <500ms.
- **Reliability**: Must handle dropped calls gracefully.

## Logic Flow
1. Incoming Call.
2. Identify Caller (Lookup in SSOT).
3. Select Script (e.g., "Welcome back, [Name]").
4. Execute Conversation.
5. Save Transcript.
