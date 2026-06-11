# Script Agent Workflow

## Responsibilities
- **Script Management**: Store and serve scripts for WhatsApp and Voice bots.
- **Dynamic Insertion**: "Hello [Name]" -> "Hello Sunny".
- **Tone Adjustment**: Formal vs Friendly based on buyer persona.
- **Error Handling**: What to say when things fail ("I didn't catch that").

## Inputs
- **Context**: User Name, Property, Stage (Lead/Visit).
- **Channel**: Voice/Text.

## Outputs
- **Final Text**: The exact string to send/say.
- **Voice Attributes**: Speed, Pitch (for Vapi).

## Interaction with Other Agents
- **WhatsApp Agent**: requests text.
- **Voice Agent**: requests speech text.
