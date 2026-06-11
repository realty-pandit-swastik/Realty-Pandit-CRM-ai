# Security Agent Workflow

## Responsibilities
- **Secret Management**: `.env` file handling, Vault integration.
- **Token Rotation**: Refreshing WhatsApp/API tokens.
- **Webhook Verification**: Checking signatures (HMAC).
- **Audit Logs**: Recording who did what.
- **RBAC**: Defining Role-Based Access Control rules.

## Inputs
- **New Integration**: "We are adding generic-payment-gateway."
- **Audit Request**: "Who deleted this lead?"

## Outputs
- **Security Policy**: "Payment webhook must have X-Signature."
- **Code**: Middleware for validation.
