You are preparing a **staff review queue**, using only the attached `pilot-input.json` exported from our own CRM. Do not browse the web, use external portals, look up owners, or call any write tool.

For each open shortage, suggest at most three distinct active CRM listings from `inventory` that might fit. Compare the stated intent, budget, and area conservatively. `sell` inventory may serve `buy` demand; `rent` inventory may serve `rent` demand. If any required fact is missing or uncertain, explain that in the reason; never assert a match you cannot establish. Deduplicate by `inventory.id`. Do not repeat a shortage/listing pair. Empty candidate lists are acceptable.

Propose one field survey stop per shortage with a known area. Use the shortage area only. These are suggested stops for a staff member, not evidence that an external listing exists.

Return **JSON only** with this exact shape:

```json
{
  "candidates": [
    { "shortage_id": "CRM shortage ID", "inventory_id": "CRM inventory ID", "reason": "Why staff should review this listing, including uncertainty" }
  ],
  "survey_stops": [
    { "shortage_id": "CRM shortage ID", "area": "Area from shortage", "reason": "Why staff should survey here" }
  ]
}
```

This output is a proposal only. A staff member must inspect the CRM record and approve each candidate or survey stop. Do not write to the CRM or contact anyone.
