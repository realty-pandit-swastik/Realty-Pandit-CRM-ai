# Logic Transfer Agent Workflow

## Responsibilities
- **Translator**: Convert complex business logic into executable code logic.
- **Workflow Mapper**: Define how different agents interact for a specific feature.
- **Rule Engine**: Convert "If buyer says X, do Y" into `if/else` or state machine logic.

## Inputs
- **Business Rule**: "High value customers get routed to Senior Dealer."
- **AI Decision**: "Buyer seems high net worth."

## Outputs
- **Execution Rule**: `if (buyer.budget > 5Cr) return 'senior_dealer'`
- **Routing**: Instructions for the Message Router.

## Interaction with Other Agents
- **Master Inspector**: Receives logic definitions to creating sub-tasks.
- **Backend Agent**: Implements the logic.
