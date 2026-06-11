# WhatsApp Agent Workflow

## Responsibilities
- **Webhook Handling**: Receive incoming messages.
- **Message Templates**: Manage approved templates.
- **Rate Limiting**: Prevent notification spam.
- **Session State**: Track conversation context (24h window).
- **Logging**: Record all chats to SSOT.

## Constraints
- **NO BUSINESS LOGIC**: This agent only sends/receives. It asks the *Buyer/Seller Agent* what to say.

## API Integration
- Connects to: `config/api_keys.json` (WhatsApp Token).
- Webhook Endpoint: `/api/webhooks/whatsapp`.
