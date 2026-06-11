# Connection & External API Workflow

## Responsibilities
- **Central Config**: Single source for API keys and endpoints.
- **Rate Limits**: Manage quotas for 3rd party services.
- **Failover Rules**: What to do if an API is down.
- **Integration Logic**: How to talk to CRM/Portal APIs.

## Inputs
- **Request**: "Fetch property data from MagicBricks."
- **Service Status**: "WhatsApp API is down."

## Outputs
- **API Response**: Normalized data.
- **Error Signal**: "Service unavailable, retry in 5m."

## Interaction with Other Agents
- **All Agents**: Use this agent to talk to the outside world.
