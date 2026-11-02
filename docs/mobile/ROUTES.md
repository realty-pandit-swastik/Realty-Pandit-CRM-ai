# Current-source route trace inventory

This is a navigation index generated from current route modules, not a security certification. Follow the actual route body and linked service before integrating each action. `app.ts` supplies mounts and `routes/api.ts` supplies the shared `/api` authentication boundary. `middleware/auth.ts` applies the partner default-deny fence. Database query extensions do not add tenant scope.

## auth

Source: `agents/backend/src/routes/auth.ts`. Models and services below are actual references, not inferred capabilities.

Services/guards: `../services/auth`, `../middleware/auth`, `../middleware/csrf`, `../validators`, `../validators/auth.validator`, `../utils/logger`, `../utils/phone`, `../utils/redis`, `../services/otp_sender`, `../utils/capture`

Database delegates: `agent`, `partnerAgent`, `tenant`

- `POST /login` — line 53; , validate(loginSchema), async (req, res) => {
- `GET /google` — line 72; , async (req, res) => {
- `GET /google/callback` — line 88; , async (req, res) => {
- `POST /register` — line 131; , authMiddleware, checkPermission('create_agents'), validate(registerSchema), async (req, res) => {
- `POST /refresh` — line 154; , async (req, res) => {
- `POST /logout` — line 181; , authMiddleware, async (req, res) => {
- `GET /csrf` — line 200; , authMiddleware, (req, res) => {
- `GET /me` — line 207; , authMiddleware, async (req, res) => {
- `POST /setup` — line 261; , validate(setupSchema), async (req, res) => {
- `POST /forgot-password` — line 286; , validate(forgotPasswordSchema), async (req, res) => {
- `POST /verify-reset-otp` — line 335; , validate(resetPasswordOtpSchema), async (req, res) => {
- `POST /resend-otp` — line 372; , async (req, res) => {
- `POST /change-password` — line 421; , authMiddleware, async (req, res) => {
- `GET /validate-setup-token` — line 466; , async (req, res) => {
- `POST /setup-password` — line 494; , validate(setupPasswordSchema), async (req, res) => {

## api

Source: `agents/backend/src/routes/api.ts`. Models and services below are actual references, not inferred capabilities.

Services/guards: `../middleware/auth`, `../middleware/require_super_boss`, `../services/partner_notifications`, `../utils/phone`, `../services/contact_identifier`, `../middleware/contact_visibility`, `../services/ownership_service`, `../utils/logger`, `../utils/capture`, `../services/contact_identity`

Database delegates: `agent`, `appointment`, `commission`, `contact`, `dealCommissionEntry`, `interaction`, `inventory`, `owner`, `partnerAgent`, `propertyShare`, `transaction`

- `GET /contacts` — line 22; , async (req, res) => {
- `GET /contacts/directory` — line 53; , async (req, res) => {
- `GET /contacts/:phone/interactions` — line 142; , async (req, res) => {
- `PATCH /contacts/:phone` — line 187; , async (req, res) => {
- `PATCH /contacts/:phone/profile` — line 213; , async (req, res) => {
- `GET /contacts/search` — line 274; , async (req, res) => {
- `GET /contacts/identify` — line 302; , async (req, res) => {
- `GET /contacts/recent` — line 335; , async (req, res) => {
- `POST /contacts/ensure` — line 361; , async (req, res) => {
- `GET /activity/team` — line 391; , async (req, res) => {
- `GET /agents` — line 449; , requireRole('super_boss', 'manager'), async (_req, res) => {
- `GET /dashboard/stats` — line 468; , requireRole('super_boss', 'manager'), async (_req, res) => {
- `POST /partners` — line 500; , checkPermission('manage_agents'), async (req, res) => {
- `GET /partners/search` — line 613; , async (req: any, res) => {
- `GET /partners` — line 654; , checkPermission('manage_agents'), async (req, res) => {
- `GET /partners/:id` — line 678; , checkPermission('manage_agents'), async (req, res) => {
- `PATCH /partners/:id` — line 707; , checkPermission('manage_agents'), async (req, res) => {
- `PATCH /partners/:id/verify` — line 771; , checkPermission('manage_agents'), async (req, res) => {
- `POST /partners/:id/revert-to-customer` — line 800; , checkPermission('manage_agents'), async (req: any, res) => {
- `PATCH /partners/:id/status` — line 897; , checkPermission('manage_agents'), async (req, res) => {
- `PATCH /partners/:id/commission` — line 919; , checkPermission('manage_agents'), async (req, res) => {
- `PATCH /partners/:id/category` — line 942; , checkPermission('manage_agents'), async (req, res) => {
- `PATCH /partners/:id/package` — line 979; , checkPermission('manage_agents'), async (req, res) => {
- `GET /partners/:id/inventory` — line 1019; , checkPermission('manage_agents'), async (req, res) => {
- `GET /partners/:id/leads` — line 1045; , checkPermission('manage_agents'), async (req, res) => {
- `GET /partners/:id/commissions` — line 1070; , checkPermission('manage_agents'), async (req, res) => {
- `POST /partners/:id/set-password` — line 1092; , checkPermission('manage_agents'), async (req, res) => {
- `POST /partners/:id/reassign` — line 1116; , requireSuperBoss, async (req, res) => {
- `GET /commissions` — line 1135; , checkPermission('view_reports'), async (_req, res) => {

## leads

Source: `agents/backend/src/routes/leads.ts`. Models and services below are actual references, not inferred capabilities.

Services/guards: `../services/lead_score`, `../utils/demand_defaults`, `../services/matching_engine`, `../utils/phone`, `../utils/classification`, `../utils/demand_taxonomy`, `../utils/demand_canonical`, `../utils/taxonomy_filter`, `../utils/lead_search`, `../middleware/auth`, `../utils/geocode`, `../services/lead_notifications`, `../services/partner_auto_create`, `../services/ensure_deal`, `../services/notify`, `../services/partner_notifications`, `../services/contact_identity`, `../middleware/contact_visibility`, `../utils/capture`, `../utils/logger`, `../services/contact_shares`, `../utils/team_scope`, `../services/lead_stage_sync`

Database delegates: `agent`, `contact`, `contactShare`, `conversationSession`, `interaction`, `lead`, `leadScore`, `partnerAgent`, `propertyShare`, `tenant`, `transaction`

- `GET /by-source` — line 63; , async (req: any, res) => {
- `GET /recent-external` — line 149; , async (req: any, res) => {
- `PATCH /:phone/status` — line 540; , async (req, res) => {
- `POST /:phone/share` — line 595; , async (req: any, res) => {
- `PATCH /:phone/reassign` — line 673; , async (req: any, res) => {
- `POST /bulk-reassign` — line 784; , async (req: any, res) => {
- `POST /bulk-stage` — line 869; , async (req: any, res) => {
- `POST /:phone/convert-to-partner` — line 1046; , checkPermission('act_on_deals'), async (req: any, res) => {
- `POST /:phone/approve-partner-claim` — line 1161; , checkPermission('edit_inventory'), async (req: any, res) => {
- `POST /:phone/reject-partner-claim` — line 1236; , checkPermission('edit_inventory'), async (req: any, res) => {
- `GET /pending-partner-claims` — line 1296; , checkPermission('edit_inventory'), async (req: any, res) => {
- `GET /search` — line 1338; , async (req: any, res) => {
- `POST /` — line 1416; , async (req: any, res) => {
- `GET /:phone/score` — line 1767; , async (req, res) => {
- `PATCH /:phone/mark-lost` — line 1790; , async (req, res) => {
- `PATCH /:phone/delay-reason` — line 1893; , async (req, res) => {
- `POST /:phone/no-show` — line 1947; , async (req, res) => {
- `GET /:phone` — line 1972; , async (req, res) => {
- `POST /:phone/partner-assign` — line 2046; , async (req: any, res) => {
- `POST /:phone/match` — line 2081; , async (req, res) => {
- `PATCH /:phone/assign` — line 2153; , async (req, res) => {
- `GET /:phone/session` — line 2202; , async (req, res) => {
- `PATCH /:phone` — line 2222; , checkPermission('edit_contact'), async (req, res) => {
- `PATCH /:phone/requirements` — line 2260; , async (req, res) => {

## inventory

Source: `agents/backend/src/routes/inventory.ts`. Models and services below are actual references, not inferred capabilities.

Services/guards: `../services/catalog_sync`, `../services/session/store`, `../services/storage`, `../services/ensure_owner`, `../services/partner_auto_create`, `../middleware/auth`, `../utils/logger`, `../utils/price_sanity`, `../utils/video_transcode`, `../utils/phone`, `../utils/client_role`, `../utils/inventory_search`, `../utils/inventory_id`, `../utils/inventory_source`, `../utils/team_scope`, `../utils/partner_scope`, `../utils/taxonomy_filter`, `../services/whatsapp`, `../services/notify`, `../services/sanitization_service`, `../services/inventory_broadcast`, `../services/team_inventory_broadcast`, `../utils/demand_taxonomy`, `../utils/demand_canonical`, `../utils/redis`, `../services/portal_harvest`, `../middleware/portal_ingestion_auth`, `../utils/capture`

Database delegates: `agent`, `appointment`, `contact`, `interaction`, `inventory`, `inventoryDocument`, `owner`, `partnerAgent`, `portalListing`, `propertyCategory`, `propertyShare`, `propertySubCategory`, `propertyType`, `task`, `taxonomyNode`, `tenant`, `transaction`, `transactionLog`

- `POST /` — line 141; , authMiddleware, checkPermission('edit_inventory'), async (req, res) => {
- `POST /harvest` — line 447; , authMiddleware, checkPermission('edit_inventory'), harvestHandler);
- `POST /harvest/service` — line 448; , portalIngestionAuth, checkPermission('edit_inventory'), harvestHandler);
- `GET /harvest/candidates` — line 449; , authMiddleware, checkPermission('edit_inventory'), async (req: any, res) => {
- `POST /harvest/:candidateId/owner-call` — line 477; , authMiddleware, checkPermission('edit_inventory'), async (req: any, res) => {
- `POST /:id/partner-assign` — line 505; , authMiddleware, async (req: any, res) => {
- `GET /` — line 528; , authMiddleware, async (req, res) => {
- `GET /hermes-pilot` — line 913; , authMiddleware, checkPermission('act_on_deals'), async (req, res) => {
- `GET /:id` — line 954; , authMiddleware, async (req, res, next) => {
- `POST /:id/clone` — line 1049; , authMiddleware, checkPermission('edit_inventory'), async (req, res) => {
- `PATCH /:id` — line 1088; , authMiddleware, checkPermission('edit_inventory'), async (req, res) => {
- `POST /:id/share` — line 1417; , authMiddleware, checkPermission('share_inventory'), async (req, res) => {
- `POST /share-pdf` — line 1483; , authMiddleware, async (req: any, res) => {
- `GET /:id/share-link` — line 1585; , authMiddleware, async (req: any, res) => {
- `GET /:id/matching-clients` — line 1628; , authMiddleware, async (req: any, res) => {
- `POST /:id/share-to-client` — line 1806; , authMiddleware, async (req, res) => {
- `POST /share-batch-to-client` — line 2031; , authMiddleware, async (req: any, res) => {
- `POST /share/add-lead` — line 2134; , authMiddleware, async (req: any, res) => {
- `POST /bulk-transfer` — line 2236; , authMiddleware, checkPermission('transfer_inventory'), async (req, res) => {
- `POST /:id/transfer` — line 2305; , authMiddleware, checkPermission('transfer_inventory'), async (req, res) => {
- `POST /:id/transfer-ownership` — line 2414; , authMiddleware, checkPermission('manage_inventory'), async (req: any, res) => {
- `POST /:id/mark-sold` — line 2529; , authMiddleware, checkPermission('edit_inventory'), async (req: any, res) => {
- `POST /:id/mark-on-hold` — line 2569; , authMiddleware, checkPermission('edit_inventory'), async (req: any, res) => {
- `POST /:id/approve` — line 2602; , authMiddleware, checkPermission('edit_inventory'), async (req, res) => {
- `POST /:id/reject` — line 2687; , authMiddleware, checkPermission('edit_inventory'), async (req, res) => {
- `DELETE /:id` — line 2743; , authMiddleware, checkPermission('delete_inventory'), async (req, res) => {
- `POST /session/start` — line 2843; , async (req, res) => {
- `POST /step` — line 2856; , async (req, res) => {
- `POST /commit` — line 2869; , async (req, res) => {
- `POST /:id/upload` — line 2976; , uploadMedia, async (req, res) => {
- `DELETE /:id/media/:filename` — line 3048; , async (req, res) => {
- `GET /:id/media` — line 3100; , async (req, res) => {
- `GET /:id/brochure.pdf` — line 3131; , async (req: any, res) => {
- `GET /:id/wa-image.jpg` — line 3173; , async (req: any, res) => {
- `GET /:id/contacts` — line 3211; , authMiddleware, async (req, res) => {
- `GET /:id/enrichment` — line 3254; , authMiddleware, async (req, res) => {
- `PATCH /:id/enrich` — line 3313; , authMiddleware, async (req, res) => {
- `POST /:id/documents` — line 3550; , authMiddleware, checkPermission('edit_inventory'), uploadDocument, async (req, res) => {
- `DELETE /:id/documents/:docId` — line 3619; , authMiddleware, checkPermission('edit_inventory'), async (req, res) => {
- `PATCH /:id/documents/:docId` — line 3665; , authMiddleware, checkPermission('edit_inventory'), async (req, res) => {
- `GET /:id/documents/:docId/download` — line 3701; , authMiddleware, async (req, res) => {
- `GET /:id/documents/:docId/public` — line 3756; , async (req: any, res) => {
- `POST /:id/documents/:docId/share` — line 3787; , authMiddleware, checkPermission('edit_inventory'), async (req, res) => {
- `GET /filter-counts` — line 3907; , authMiddleware, async (req, res) => {

## workflow

Source: `agents/backend/src/routes/workflow.ts`. Models and services below are actual references, not inferred capabilities.

Services/guards: `../services/image_moderation`, `../middleware/auth`, `../utils/logger`, `../utils/capture`, `../middleware/error_handler`

Database delegates: `inventory`

- `GET /definition` — line 90; , (_req: Request, res: Response) => {
- `POST /next-step` — line 112; , async (req: Request, res: Response) => {
- `POST /previous-step` — line 144; , async (req: Request, res: Response) => {
- `POST /validate` — line 171; , async (req: Request, res: Response) => {
- `POST /options` — line 193; , async (req: Request, res: Response) => {
- `POST /visible-steps` — line 222; , async (req: Request, res: Response) => {
- `POST /summary` — line 239; , async (req: Request, res: Response) => {
- `POST /commit` — line 262; , async (req: Request, res: Response) => {
- `POST /upload-media` — line 335; , authMiddleware, (req: Request, res: Response) => {
- `POST /upload-video` — line 478; , authMiddleware, (req: Request, res: Response) => {
- `POST /upload-document` — line 503; , authMiddleware, (req: Request, res: Response) => {

## deals

Source: `agents/backend/src/routes/deals.ts`. Models and services below are actual references, not inferred capabilities.

Services/guards: `../middleware/auth`, `../validators`, `../validators/deals.validator`, `../services/deal_service`, `../services/transaction_state_machine`, `../services/deal_notifications`, `../services/notify`, `../services/commission_service`, `../services/deal_reminder`, `../utils/team_scope`, `../utils/logger`, `../utils/capture`, `../utils/demand_canonical`, `../utils/geocode`, `../services/shortage_book`

Database delegates: `agent`, `appointment`, `contact`, `dealQuery`, `interaction`, `inventory`, `partnerAgent`, `propertyShare`, `shortageEntry`, `task`, `teamAction`, `tenant`, `transaction`, `transactionLog`

- `GET /shortages` — line 45; , checkPermission('act_on_deals'), async (req: any, res) => {
- `PATCH /shortages/settings` — line 55; , checkPermission('manage_settings'), async (req: any, res) => {
- `POST /shortages/generate-tasks` — line 73; , checkPermission('act_on_deals'), async (req: any, res) => {
- `POST /shortages/:id/refresh` — line 86; , checkPermission('act_on_deals'), async (req: any, res) => {
- `POST /` — line 109; , checkPermission('manage_deals'), validate(createDealSchema), async (req: any, res) => {
- `GET /` — line 178; , async (req: any, res) => {
- `GET /pipeline` — line 235; , async (req: any, res) => {
- `POST /:id/partner-assign` — line 261; , async (req: any, res) => {
- `GET /:id` — line 283; , async (req: any, res) => {
- `GET /:id/timeline` — line 310; , async (req: any, res) => {
- `PATCH /:id/match` — line 323; , checkPermission('act_on_deals'), validate(matchPropertySchema), async (req: any, res) => {
- `PATCH /:id/status` — line 345; , checkPermission('act_on_deals'), validate(updateDealStatusSchema), async (req: any, res) => {
- `POST /:id/share-next-property` — line 423; , checkPermission('act_on_deals'), async (req: any, res) => {
- `PATCH /:id/requirements` — line 444; , checkPermission('act_on_deals'), async (req: any, res) => {
- `PATCH /:id/reassign` — line 584; , checkPermission('act_on_deals'), async (req: any, res) => {
- `POST /match-counts` — line 708; , checkPermission('act_on_deals'), async (req: any, res) => {
- `GET /:id/matched-inventory` — line 794; , checkPermission('act_on_deals'), async (req: any, res) => {
- `POST /:id/share-properties` — line 1010; , checkPermission('act_on_deals'), async (req: any, res) => {
- `POST /:id/record-personal-share` — line 1065; , checkPermission('act_on_deals'), async (req: any, res) => {
- `POST /:id/book-appointment` — line 1102; , checkPermission('act_on_deals'), async (req: any, res) => {
- `POST /:id/visit-outcome` — line 1199; , checkPermission('act_on_deals'), async (req: any, res) => {
- `POST /:id/query` — line 1349; , validate(createDealQuerySchema), async (req: any, res) => {
- `PATCH /:id/query/:qid` — line 1380; , checkPermission('act_on_deals'), validate(answerDealQuerySchema), async (req: any, res) => {
- `GET /:id/queries` — line 1413; , async (req: any, res) => {
- `POST /:id/commission-entries` — line 1436; , checkPermission('manage_deals'), async (req: any, res) => {
- `GET /:id/commission-entries` — line 1457; , checkPermission('manage_deals'), async (req: any, res) => {
- `POST /:id/log-action` — line 1482; , checkPermission('act_on_deals'), async (req: any, res) => {
- `POST /:id/reminder` — line 1555; , checkPermission('act_on_deals'), async (req: any, res) => {
- `GET /:id/property-shares` — line 1693; , async (req: any, res) => {
- `POST /:id/log-call` — line 1871; , checkPermission('act_on_deals'), async (req: any, res) => {

## calendar

Source: `agents/backend/src/routes/calendar.ts`. Models and services below are actual references, not inferred capabilities.

Services/guards: `../middleware/auth`, `../services/calendar`, `../services/whatsapp`, `../services/notify`, `../utils/capture`

Database delegates: `agent`, `appointment`, `interaction`, `inventory`

- `GET /appointments` — line 19; , authMiddleware, async (req, res) => {
- `GET /appointments/:id` — line 126; , authMiddleware, async (req, res) => {
- `POST /appointments` — line 166; , authMiddleware, async (req, res) => {
- `PATCH /appointments/:id` — line 297; , authMiddleware, async (req, res) => {
- `DELETE /appointments/:id` — line 380; , authMiddleware, async (req, res) => {
- `GET /summary` — line 430; , authMiddleware, async (req, res) => {

## tasks

Source: `agents/backend/src/routes/tasks.ts`. Models and services below are actual references, not inferred capabilities.

Services/guards: `../services/notify`, `../utils/capture`

Database delegates: `agent`, `contact`, `interaction`, `inventory`, `task`, `workProject`

- `GET /projects` — line 18; , async (req: Request, res: Response) => {
- `GET /projects/:id` — line 48; , async (req: Request, res: Response) => {
- `POST /projects` — line 76; , async (req: Request, res: Response) => {
- `PATCH /projects/:id` — line 114; , async (req: Request, res: Response) => {
- `DELETE /projects/:id` — line 152; , async (req: Request, res: Response) => {
- `GET /tasks` — line 174; , async (req: Request, res: Response) => {
- `GET /tasks/:id` — line 231; , async (req: Request, res: Response) => {
- `POST /tasks` — line 253; , async (req: Request, res: Response) => {
- `PATCH /tasks/:id` — line 359; , async (req: Request, res: Response) => {
- `DELETE /tasks/:id` — line 511; , async (req: Request, res: Response) => {
- `POST /tasks/bulk-import` — line 560; , async (req: Request, res: Response) => {
- `GET /tasks/stats/summary` — line 669; , async (req: Request, res: Response) => {

## team

Source: `agents/backend/src/routes/team.ts`. Models and services below are actual references, not inferred capabilities.

Services/guards: `../utils/inventory_id`, `../utils/logger`, `../middleware/auth`, `../middleware/require_super_boss`, `../services/email_provisioner`, `../services/ensure_owner`, `../services/whatsapp`, `../services/notify`, `../services/ownership_service`, `../services/analytics_scope`, `../utils/capture`, `../services/targets`

Database delegates: `agent`, `agentActionLog`, `contact`, `interaction`, `inventory`, `propertyCategory`, `propertyConfiguration`, `propertySubCategory`, `propertyType`, `tenant`

- `GET /inventory/bulk-template` — line 28; , (req, res) => {
- `GET /me` — line 57; , async (req: any, res) => {
- `PATCH /me/portal-email` — line 83; , async (req: any, res) => {
- `PATCH /me/profile` — line 118; , async (req: any, res) => {
- `POST /me/mailbox-password` — line 163; , async (req: any, res) => {
- `GET /me/email-config` — line 214; , async (req: any, res) => {
- `PUT /me/email-config` — line 253; , async (req: any, res) => {
- `GET /me/google/connect` — line 320; , async (req: any, res) => {
- `GET /me/google-config` — line 342; , async (req: any, res) => {
- `PUT /me/google-config` — line 380; , async (req: any, res) => {
- `DELETE /me/google` — line 407; , async (req: any, res) => {
- `GET /members-list` — line 445; , checkPermission('view_inventory'), async (req, res) => {
- `GET /targets` — line 462; , checkPermission('manage_team'), async (req, res) => {
- `PUT /targets` — line 476; , checkPermission('manage_team'), async (req, res) => {
- `GET /members` — line 496; , checkPermission('manage_team'), async (req, res) => {
- `GET /email-preview` — line 548; , checkPermission('manage_team'), async (req, res) => {
- `POST /members` — line 563; , checkPermission('create_agents'), async (req, res) => {
- `GET /members/:id` — line 704; , checkPermission('manage_team'), async (req, res) => {
- `PATCH /members/:id` — line 727; , checkPermission('manage_team'), async (req, res) => {
- `POST /members/:id/transfer-assets` — line 805; , checkPermission('manage_settings'), async (req, res) => {
- `PATCH /members/:id/deactivate` — line 842; , checkPermission('manage_settings'), async (req, res) => {
- `GET /members/:id/ownership-summary` — line 893; , requireSuperBoss, async (req, res) => {
- `PATCH /members/:id/reset-password` — line 904; , checkPermission('manage_team'), async (req, res) => {
- `PATCH /members/:id/set-password` — line 952; , checkPermission('manage_team'), async (req, res) => {
- `POST /members/:id/resend-setup` — line 1011; , checkPermission('manage_team'), async (req, res) => {
- `GET /members-without-phone` — line 1045; , checkPermission('manage_team'), async (req, res) => {
- `POST /inventory/bulk-upload` — line 1066; , checkPermission('bulk_upload'), upload.single('file'), async (req, res) => {

## partner_team

Source: `agents/backend/src/routes/partner_team.ts`. Models and services below are actual references, not inferred capabilities.

Services/guards: `../utils/logger`, `../middleware/auth`, `../utils/partner_team`, `../utils/phone`, `../utils/capture`

Database delegates: `contact`, `inventory`, `partnerAgent`, `tenant`, `transaction`

- `GET /team` — line 25; , authMiddleware, async (req: any, res) => {
- `GET /team/assignable` — line 71; , authMiddleware, async (req: any, res) => {
- `POST /team` — line 102; , authMiddleware, async (req: any, res) => {
- `PATCH /team/:subId` — line 169; , authMiddleware, async (req: any, res) => {

## analytics

Source: `agents/backend/src/routes/analytics.ts`. Models and services below are actual references, not inferred capabilities.

Services/guards: `../middleware/auth`, `../utils/capture`, `../services/analytics_scope`, `../services/team_metrics`, `../services/scoring`, `../services/alerts`, `../services/property_analytics`, `../utils/distribution`, `../utils/gci`, `../services/speed_to_lead`, `../services/targets`

Database delegates: `agent`, `contact`, `dealCommissionEntry`, `inventory`, `transaction`

- `GET /market-trends` — line 46; , authMiddleware, async (req, res) => {
- `GET /user-performance` — line 121; , authMiddleware, async (req, res) => {
- `GET /distribution` — line 256; , authMiddleware, async (req, res) => {
- `GET /gci-forecast` — line 327; , authMiddleware, async (req, res) => {
- `GET /speed-to-lead` — line 359; , authMiddleware, async (req, res) => {
- `GET /lead-sources` — line 382; , authMiddleware, async (req, res) => {
- `GET /property-trends` — line 450; , authMiddleware, async (req, res) => {
- `GET /financial-summary` — line 538; , authMiddleware, async (req, res) => {
- `GET /advanced` — line 598; , authMiddleware, async (req, res) => {
- `GET /team-performance` — line 766; , authMiddleware, async (req, res) => {
- `GET /alerts` — line 855; , authMiddleware, async (req, res) => {

## reports

Source: `agents/backend/src/routes/reports.ts`. Models and services below are actual references, not inferred capabilities.

Services/guards: `../middleware/auth`, `../utils/capture`

Database delegates: `appointment`, `contact`, `inventory`, `transaction`, `voiceCall`

- `GET /account/customer-outstanding` — line 39; , async (req: Request, res: Response) => {
- `GET /account/vendor-outstanding` — line 81; , async (req: Request, res: Response) => {
- `GET /account/monthly-sales` — line 124; , async (req: Request, res: Response) => {
- `GET /account/monthly-purchase` — line 156; , async (req: Request, res: Response) => {
- `GET /user/performance` — line 192; , async (req: Request, res: Response) => {
- `GET /user/task-completion` — line 226; , async (req: Request, res: Response) => {
- `GET /call/all-logs` — line 263; , async (req: Request, res: Response) => {
- `GET /call/by-date` — line 295; , async (req: Request, res: Response) => {
- `GET /call/by-month` — line 324; , async (req: Request, res: Response) => {
- `GET /lead/all-leads` — line 357; , async (req: Request, res: Response) => {
- `GET /lead/last-contact` — line 394; , async (req: Request, res: Response) => {
- `GET /lead/summary` — line 421; , async (req: Request, res: Response) => {
- `GET /lead/cancelled-reasons` — line 465; , async (req: Request, res: Response) => {
- `GET /sold/by-property` — line 522; , async (req: Request, res: Response) => {
- `GET /sold/by-area` — line 561; , async (req: Request, res: Response) => {
- `GET /sold/by-unit-type` — line 590; , async (req: Request, res: Response) => {
- `GET /visit/all-visits` — line 623; , async (req: Request, res: Response) => {
- `GET /visit/property-count` — line 658; , async (req: Request, res: Response) => {
- `GET /customer/converted-not-sold` — line 709; , async (req: Request, res: Response) => {
- `GET /property/all-properties` — line 736; , async (req: Request, res: Response) => {
- `GET /property/on-hold` — line 765; , async (req: Request, res: Response) => {
- `GET /property/availability-summary` — line 781; , async (req: Request, res: Response) => {

## transactions

Source: `agents/backend/src/routes/transactions.ts`. Models and services below are actual references, not inferred capabilities.

Services/guards: `../middleware/auth`, `../services/transaction_service`, `../services/transaction_state_machine`, `../services/executive_assigner`, `../utils/logger`, `../utils/capture`

Database delegates: `transaction`

- `GET /` — line 38; , checkPermission('view_transactions'), async (req: Request, res: Response) => {
- `GET /pipeline` — line 91; , checkPermission('view_transactions'), async (req: Request, res: Response) => {
- `GET /executive/:agentId` — line 109; , checkPermission('view_transactions'), async (req: Request, res: Response) => {
- `GET /:id` — line 145; , checkPermission('view_transactions'), async (req: Request, res: Response) => {
- `PATCH /:id/status` — line 175; , checkPermission('manage_transactions'), async (req: Request, res: Response) => {
- `PATCH /:id/reassign` — line 212; , checkPermission('manage_transactions'), async (req: Request, res: Response) => {
- `POST /:id/note` — line 236; , checkPermission('view_transactions'), async (req: Request, res: Response) => {

## marketing

Source: `agents/backend/src/routes/marketing.ts`. Models and services below are actual references, not inferred capabilities.

Services/guards: `../utils/capture`

Database delegates: `campaign`, `campaignTemplate`, `contact`

- `GET /templates` — line 19; , async (req: Request, res: Response) => {
- `GET /templates/:id` — line 44; , async (req: Request, res: Response) => {
- `POST /templates` — line 78; , async (req: Request, res: Response) => {
- `PATCH /templates/:id` — line 115; , async (req: Request, res: Response) => {
- `DELETE /templates/:id` — line 151; , async (req: Request, res: Response) => {
- `GET /campaigns` — line 173; , async (req: Request, res: Response) => {
- `GET /campaigns/:id` — line 206; , async (req: Request, res: Response) => {
- `POST /campaigns` — line 228; , async (req: Request, res: Response) => {
- `PATCH /campaigns/:id` — line 281; , async (req: Request, res: Response) => {
- `DELETE /campaigns/:id` — line 330; , async (req: Request, res: Response) => {
- `GET /campaigns/:id/analytics` — line 348; , async (req: Request, res: Response) => {
- `POST /campaigns/:id/test` — line 385; , async (req: Request, res: Response) => {
- `POST /campaigns/:id/launch` — line 432; , async (req: Request, res: Response) => {
- `POST /campaigns/:id/toggle-pause` — line 520; , async (req: Request, res: Response) => {
- `POST /audience/preview` — line 550; , async (req: Request, res: Response) => {

## email

Source: `agents/backend/src/routes/email.ts`. Models and services below are actual references, not inferred capabilities.

Services/guards: `../services/email_service`, `../middleware/auth`, `../utils/logger`, `../utils/capture`

Database delegates: `agent`, `email`

- `POST /webhook/incoming` — line 19; , async (req: Request, res: Response) => {
- `POST /send` — line 60; , authMiddleware, async (req: Request, res: Response) => {
- `GET /contact/:phone` — line 106; , authMiddleware, async (req: Request, res: Response) => {
- `GET /search` — line 125; , authMiddleware, async (req: Request, res: Response) => {
- `GET /all` — line 150; , authMiddleware, async (req: Request, res: Response) => {
- `DELETE /:id` — line 225; , authMiddleware, async (req: Request, res: Response) => {
- `POST /bulk-send` — line 252; , authMiddleware, async (req: Request, res: Response) => {

## workflows

Source: `agents/backend/src/routes/workflows.ts`. Models and services below are actual references, not inferred capabilities.

Services/guards: `../utils/capture`

Database delegates: `workflow`, `workflowExecution`

- `GET /` — line 13; , async (req: Request, res: Response) => {
- `GET /:id` — line 44; , async (req: Request, res: Response) => {
- `POST /` — line 69; , async (req: Request, res: Response) => {
- `PATCH /:id` — line 116; , async (req: Request, res: Response) => {
- `POST /:id/toggle` — line 158; , async (req: Request, res: Response) => {
- `DELETE /:id` — line 182; , async (req: Request, res: Response) => {
- `GET /:id/executions` — line 200; , async (req: Request, res: Response) => {
- `GET /:id/stats` — line 225; , async (req: Request, res: Response) => {
- `POST /:id/test` — line 253; , async (req: Request, res: Response) => {

## agent_dashboard

Source: `agents/backend/src/routes/agent_dashboard.ts`. Models and services below are actual references, not inferred capabilities.

Services/guards: `../services/performance_monitor`, `../middleware/auth`, `../utils/logger`, `../utils/capture`

Database delegates: `qALog`

- `GET /health` — line 38; , async (req: Request, res: Response) => {
- `GET /metrics` — line 55; , async (req: Request, res: Response) => {
- `GET /funnel` — line 72; , async (req: Request, res: Response) => {
- `GET /logs` — line 90; , async (req: Request, res: Response) => {
- `GET /qa-logs` — line 114; , async (req: Request, res: Response) => {
- `GET /campaigns` — line 137; , async (req: Request, res: Response) => {
- `POST /campaigns` — line 155; , async (req: Request, res: Response) => {
- `POST /campaigns/:id/execute` — line 186; , async (req: Request, res: Response) => {
- `POST /campaigns/:id/cancel` — line 201; , async (req: Request, res: Response) => {
- `GET /campaigns/analytics` — line 216; , async (req: Request, res: Response) => {
- `PATCH /qa-logs/:id/review` — line 233; , async (req: Request, res: Response) => {
- `PATCH /qa-logs/:id/flag` — line 255; , async (req: Request, res: Response) => {
- `GET /winning-templates` — line 275; , async (req: Request, res: Response) => {

## staff_calls

Source: `agents/backend/src/routes/staff_calls.ts`. Models and services below are actual references, not inferred capabilities.

Services/guards: `../middleware/auth`, `../services/audio_storage`, `../validators`, `../validators/calls.validator`, `../utils/logger`, `../utils/capture`, `../utils/phone`, `../services/staff_call_processing`, `../services/staff_call_upload`, `../services/call_followup`, `../services/call_demand`, `../middleware/contact_visibility`, `../utils/team_scope`, `../services/matching_engine`

Database delegates: `agent`, `contact`, `interaction`, `shortageEntry`, `staffCall`, `transaction`, `voiceCall`

- `GET /voice-log/:id/audio` — line 37; , authMiddleware, checkPermission('view_reports'), async (req, res) => {
- `GET /:id/audio` — line 46; , authenticateAgent, async (req, res) => {
- `POST /upload` — line 75; , authenticateAgent, upload.single('audio'), async (req, res) => {
- `GET /caller-id` — line 151; , authenticateAgent, async (req, res) => {
- `GET /:id` — line 261; , authenticateAgent, async (req, res) => {
- `POST /:id/match-preview` — line 314; , authenticateAgent, validate(callSubmitSchema), async (req, res) => {
- `POST /:id/retry` — line 325; , authenticateAgent, async (req, res) => {
- `POST /:id/submit` — line 339; , authenticateAgent, validate(callSubmitSchema), async (req, res) => {
- `POST /:id/reject` — line 508; , authenticateAgent, async (req, res) => {
- `GET /` — line 554; , authenticateAgent, async (req, res) => {
- `GET /stats/overview` — line 618; , authenticateAgent, async (req, res) => {
- `GET /voice-log/all` — line 675; , authMiddleware, checkPermission('view_reports'), async (req, res) => {

## notifications

Source: `agents/backend/src/routes/notifications.ts`. Models and services below are actual references, not inferred capabilities.

Services/guards: `../middleware/auth`, `../services/push_service`, `../utils/logger`, `../utils/capture`

Database delegates: `agent`, `notification`, `pushSubscription`

- `GET /preferences` — line 45; , authMiddleware, async (req: Request, res: Response) => {
- `POST /preferences` — line 100; , authMiddleware, async (req: Request, res: Response) => {
- `POST /test` — line 169; , authMiddleware, async (req: Request, res: Response) => {
- `GET /push/vapid-key` — line 231; , (req: Request, res: Response) => {
- `POST /push/subscribe` — line 238; , authMiddleware, async (req: Request, res: Response) => {
- `DELETE /push/subscribe` — line 276; , authMiddleware, async (req: Request, res: Response) => {
- `GET /history` — line 298; , authMiddleware, async (req: Request, res: Response) => {
- `GET /unread-count` — line 329; , authMiddleware, async (req: Request, res: Response) => {
- `POST /:id/read` — line 346; , authMiddleware, async (req: Request, res: Response) => {
- `POST /read-all` — line 361; , authMiddleware, async (req: Request, res: Response) => {
- `POST /:id/click` — line 376; , authMiddleware, async (req: Request, res: Response) => {

## builder

Source: `agents/backend/src/routes/builder.ts`. Models and services below are actual references, not inferred capabilities.

Services/guards: `../services/owner`, `../services/permission_engine`, `../services/upload`, `../utils/logger`, `../utils/redis`, `../middleware/auth`, `../utils/capture`

Database delegates: `builderAppointment`, `builderLead`, `contact`, `interaction`, `owner`, `project`, `projectMedia`, `projectUnit`, `tenant`

- `POST /register` — line 80; , async (req, res) => {
- `POST /login-otp` — line 145; , async (req, res) => {
- `POST /verify-otp` — line 188; , async (req, res) => {
- `GET /me` — line 258; , authenticateBuilder, requireBuilder, async (req: any, res) => {
- `POST /projects` — line 296; , authenticateBuilder, requireBuilder, async (req: any, res) => {
- `GET /projects` — line 356; , authenticateBuilder, requireBuilder, async (req: any, res) => {
- `GET /projects/:id` — line 397; , authenticateBuilder, requireBuilder, async (req: any, res) => {
- `PUT /projects/:id` — line 446; , authenticateBuilder, requireBuilder, async (req: any, res) => {
- `PATCH /projects/:id/activate` — line 501; , authenticateBuilder, requireBuilder, async (req: any, res) => {
- `PATCH /projects/:id/pause` — line 553; , authenticateBuilder, requireBuilder, async (req: any, res) => {
- `POST /projects/:projectId/units` — line 588; , authenticateBuilder, requireBuilder, async (req: any, res) => {
- `PUT /units/:unitId` — line 657; , authenticateBuilder, requireBuilder, async (req: any, res) => {
- `DELETE /units/:unitId` — line 725; , authenticateBuilder, requireBuilder, async (req: any, res) => {
- `POST /projects/:projectId/media` — line 774; ,
- `DELETE /media/:mediaId` — line 858; , authenticateBuilder, requireBuilder, async (req: any, res) => {
- `GET /leads` — line 902; , authenticateBuilder, requireBuilder, async (req: any, res) => {
- `GET /leads/:id` — line 957; , authenticateBuilder, requireBuilder, async (req: any, res) => {
- `PATCH /leads/:id/status` — line 1013; , authenticateBuilder, requireBuilder, async (req: any, res) => {
- `GET /appointments` — line 1078; , authenticateBuilder, requireBuilder, async (req: any, res) => {
- `PATCH /appointments/:id/status` — line 1130; , authenticateBuilder, requireBuilder, async (req: any, res) => {
- `GET /dashboard/stats` — line 1200; , authenticateBuilder, requireBuilder, async (req: any, res) => {

## agent

Source: `agents/backend/src/routes/agent.ts`. Models and services below are actual references, not inferred capabilities.

Services/guards: `../services/commission`, `../services/permission_engine`, `../services/sanitization_service`, `../validators`, `../validators/calls.validator`, `../utils/logger`, `../utils/redis`, `../utils/phone`, `../middleware/rate_limit`, `../utils/demand_canonical`, `../services/otp_sender`, `../services/ensure_owner`, `../services/storage`, `../middleware/auth`, `../services/deal_service`, `../validators/deals.validator`, `../utils/capture`

Database delegates: `agent`, `contact`, `dealCommissionEntry`, `dealQuery`, `interaction`, `inventory`, `notification`, `owner`, `partnerAgent`, `scheduledVisit`, `tenant`, `transaction`

- `POST /login-otp` — line 107; , validate(agentLoginOtpSchema), async (req, res) => {
- `POST /verify-otp` — line 153; , validate(agentVerifyOtpSchema), async (req, res) => {
- `POST /register` — line 220; , registerLimiter, validate(agentRegisterSchema), async (req, res) => {
- `POST /login-password` — line 283; , async (req, res) => {
- `POST /set-password` — line 339; , authenticateAgent, async (req: any, res) => {
- `GET /coordinator` — line 375; , authenticateAgent, async (req: any, res) => {
- `GET /dashboard` — line 457; , authenticateAgent, async (req: any, res) => {
- `GET /commissions` — line 489; , authenticateAgent, async (req: any, res) => {
- `GET /notifications` — line 530; , authenticateAgent, async (req: any, res) => {
- `POST /notifications/read` — line 547; , authenticateAgent, async (req: any, res) => {
- `GET /inventory` — line 563; , authenticateAgent, async (req: any, res) => {
- `GET /inventory/browse` — line 603; , authenticateAgent, async (req: any, res) => {
- `POST /inventory` — line 651; , authenticateAgent, async (req: any, res) => {
- `POST /inventory/:id/upload` — line 748; , authenticateAgent, upload.array('files', 20), async (req: any, res) => {
- `GET /inventory` — line 812; , authenticateAgent, async (req: any, res) => {
- `PATCH /inventory/:id` — line 848; , authenticateAgent, async (req: any, res) => {
- `DELETE /inventory/:id` — line 912; , authenticateAgent, async (req: any, res) => {
- `DELETE /inventory/:id/media/:filename` — line 948; , authenticateAgent, async (req: any, res) => {
- `GET /leads` — line 987; , authenticateAgent, async (req: any, res) => {
- `GET /referred-leads` — line 1036; , authenticateAgent, async (req: any, res) => {
- `PATCH /referred-leads/:phone` — line 1060; , authenticateAgent, async (req: any, res) => {
- `POST /referred-leads/:phone/done` — line 1120; , authenticateAgent, async (req: any, res) => {
- `GET /appointments` — line 1190; , authenticateAgent, async (req: any, res) => {
- `POST /visits/:id/close` — line 1234; , authenticateAgent, validate(closeDealSchema), async (req: any, res) => {
- `GET /team` — line 1257; , authenticateAgent, async (req: any, res) => {
- `POST /team` — line 1280; , authenticateAgent, async (req: any, res) => {
- `POST /deals` — line 1348; , authenticateAgent, validate(partnerCreateDealSchema), async (req: any, res) => {
- `GET /deals` — line 1467; , authenticateAgent, async (req: any, res) => {
- `GET /deals/:id` — line 1538; , authenticateAgent, async (req: any, res) => {
- `GET /deals/:id/matches` — line 1594; , authenticateAgent, async (req: any, res) => {
- `POST /deals/:id/schedule-visit` — line 1632; , authenticateAgent, async (req: any, res) => {
- `POST /deals/:id/query` — line 1673; , authenticateAgent, validate(createDealQuerySchema), async (req: any, res) => {
