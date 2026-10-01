# Hermes CRM-only morning pilot

This is a **manual, supervised** pilot. Hermes is not installed or scheduled by this repository. Use a staff account with `act_on_deals` permission. The shortage API enforces team scope. The pilot inventory endpoint permits staff only and selects active listings from the same tenant using the CRM's team visibility rules, without contact fields.

1. In the authenticated CRM session, save the JSON response from `GET /api/deals/shortages` as `shortages.json`. Save every page of `GET /api/inventory/hermes-pilot?page=N` as `inventory-page-N.json`. Stop at `totalPages`. Keep raw responses on the staff workstation; shortage demand may still be sensitive. Do not send raw responses to Hermes.
2. Run `node docs/hermes-crm-pilot/pilot.mjs prepare shortages.json inventory-page-*.json > pilot-input.json`. Inspect `pilot-input.json`; it contains only the listed shortage demand fields and property facts, with no owner or contact details. Delete the raw export files after confirming the input. The script rejects missing pages and non-active listings.
3. Start one **interactive** Hermes session with [PROMPT.md](PROMPT.md) and attach only `pilot-input.json`. Browser, external listing sources, CRM write tools, and cron scheduling stay disabled. Save the JSON response as `output.json`.
4. Run `node docs/hermes-crm-pilot/pilot.mjs check pilot-input.json output.json`. A staff member then reviews each referenced CRM listing and proposed stop. Record approvals through the normal CRM workflow; the pilot has no CRM write integration.

The existing backend already creates shortage survey tasks. This pilot only proposes a review order and possible CRM inventory candidates. It cannot discover new supply while restricted to our own listings. It does not validate listing suitability beyond the referenced IDs; staff must check current details and availability.

Hermes [cron documentation](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron/) describes scheduling, but no schedule is created until the manual pilot and data handling have been reviewed. Its [browser](https://hermes-agent.nousresearch.com/docs/user-guide/features/browser/) and [MCP](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/) capabilities are unnecessary for this CRM-only pilot.
