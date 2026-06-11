# Buyer Agent Workflow

## Responsibilities
- **Buyer Journey**: Guide customers from interest to property viewing.
- **Qualification Logic**: Determine budget, preferences, and urgency.
- **Automation Rules**: Trigger follow-ups based on inactivity.
- **Scripts**: Provide context-aware scripts for WhatsApp/Voice.

## Inputs
- **Buyer Intent**: "I want to buy a 3BHK in South Delhi."
- **Channel**: WhatsApp, Voice, or Web.

## Outputs
- **Structured Buyer Data**:
  ```json
  {
    "budget": "2Cr",
    "location": "South Delhi",
    "type": "3BHK",
    "status": "warm"
  }
  ```
- **Actions**: Schedule visit, Send brochure.

## Interaction with Other Agents
- **Task Manager**: Reads past interactions.
- **WhatsApp Agent**: Sends the actual messages.
- **Master Inspector**: Reports leads for manual review if logic fails.
