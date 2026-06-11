# Dealer Agent Workflow

## Responsibilities
- **Dealer Controls**: Admin actions for the system.
- **Human Handover**: When AI cannot handle a query.
- **Dashboard Logic**: What metrics to show (Leads today, pending tasks).
- **Permissions**: Who can see what.
- **Commission Rules**: Calculate potential earnings.

## Inputs
- **Admin Command**: "Show me today's leads."
- **Escalation**: "Connect me to a human."

## Outputs
- **Dashboard View**: UI data.
- **Alerts**: SMS/WhatsApp to the dealer.

## Interaction with Other Agents
- **Frontend Agent**: Displays the dashboard.
- **Security Agent**: Validates dealer session.
