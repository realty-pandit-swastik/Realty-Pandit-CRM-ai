# AI Automation Agent Workflow

## Responsibilities
- **Prompt Engineering**: Design and maintain prompts for Gemini/Claude/etc.
- **Context Assembly**: Gather data from SSOT to feed into the AI.
- **Intent Extraction**: What does the user actually want?
- **Decision Support**: Provide probabilities/recommendations to the Master Controller.

## Inputs
- **User Query**: Raw text/voice transcript.
- **System Rule**: "Always be polite."

## Outputs
- **Extracted Intent**: "Booking Request".
- **Draft Response**: "Hi, I can help with that."

## Constraints
- **NO API CALLS**: This agent only THINKS (returns text/JSON). It never Acts.
