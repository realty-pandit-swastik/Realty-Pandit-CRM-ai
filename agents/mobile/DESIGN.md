# Native CRM design direction

Mode: Operate. Adaptive Android/iOS phone app, code first. The user confirmed assigned follow-ups and visits as the first home screen. User-pinned palette and native CRM structure override marketing/experimental prescriptions.

Direction: a clear daily agenda. Home opens with the signed-in person's name and next work, followed by upcoming visits. Standard five-destination navigation leads to Home, Leads, Inventory, Tasks and More. Records use scannable native rows and detail stacks; forms use labeled fields and a single primary action. No dashboard KPIs without real source data.

Impeccable context/init, native iOS/Android guidance, new-work and craft floor were read; concept seed `seed:14a8f70a1281d411` assigned candidate 5. Grounded candidate families considered: property register, appointment diary, municipal wayfinding, field notebook, daily agenda (selected), executive brief and property catalogue. The user's pinned agenda task/native controls own the topology. Challenger disciplines retained: stable row alignment (departure board), clear time ordering (notation), restrained emphasis (catalogue). Their decorative materials, coded labels and nonstandard interaction models do not fit the confirmed native CRM brief.

Tokens: Deep Navy `#10243A` for primary text/navigation; Emerald Teal `#087F75` for primary actions/selected controls; Soft White `#F7F9FB` for ground; Slate Gray `#526174` for secondary text. White action text on teal, and slate/navy on soft white require measured AA contrast. Semantic errors use `#A62632` plus explicit text. System fonts, a 14/16/20/28 type scale, 4-unit spacing rhythm, 8-unit control radii, hairline row dividers, 52-unit controls. Text scaling remains enabled.

Every async screen includes loading, retryable error, empty and refresh behavior. Offline status is explicit; writes and provider actions require a connection. Refresh retains existing rows. No automatic mutation retry. Forms retain input after errors and flag ambiguous saves. Safe areas and native stacks supply platform navigation; keyboard avoidance and accessible text labels are required. Frequent interactions use immediate press feedback; no decorative motion or startup choreography. Reduced-motion users receive the same functional experience without custom movement.

Native screenshots, text scaling, keyboard and denied-permission evidence remain required. Browser captures and bundles do not substitute for Android/iOS evidence. See docs/mobile/EVIDENCE.md.

Appointment detail leads with the visit, person, time, location and current state. Staff can add outcome notes and explicitly complete, record a no-show or cancel a pending appointment. Confirmations describe the change; server scope and the canonical appointment enum remain authoritative. Offline disables writes, an ambiguous save requires a fresh status check, and failures retain the notes. Scheduling/rescheduling and deal-linked outcomes remain separate parity work.

Local form drafts are a functional state, not another card. Lead notes and new-task forms show whether an encrypted device draft is saving, saved or unavailable. Restore only the same tenant/account/role/device-session partition after authentication. Saving to the server clears the draft; explicit discard requires confirmation. Lead-note submission compares the current server notes with the draft’s base before overwriting. Drafts expire after 24 hours and never queue automatic writes. Assigned-record snapshots remain a separate open capability.


## Inventory catalogue, 2026-10-18

Inventory uses a navy record header, light photo-led catalogue, compact search/scope controls and grouped single-column native details. Gallery navigation is explicit; videos use platform playback controls. Forms use server taxonomy and workflow definitions. Sharing separates CRM WhatsApp provider acceptance from My WhatsApp user handoff, with a recipient/package review and separate PDF step. Customer text uses recorded facts and display prices. Initial Android inspection findings and final verification limits are retained in docs/mobile/INVENTORY_EVIDENCE.md.
