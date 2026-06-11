/**
 * Server-side DB cleanup script for Realty Pandit
 * Runs on the production server inside /var/www/realty-pandit/backend/
 * Uses the server's Prisma client from node_modules
 *
 * Usage: cd /var/www/realty-pandit/backend && node /tmp/clean-db-remote.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('=== Realty Pandit Production Cleanup ===');
    console.log('Started at:', new Date().toISOString());

    // Step 0: Collect protected phone numbers
    console.log('\n--- Step 0: Identifying protected contacts ---');

    const agents = await prisma.agent.findMany({
        where: { phone: { not: null } },
        select: { phone: true, name: true, role: true }
    });

    const partners = await prisma.partnerAgent.findMany({
        select: { phone_number: true }
    });

    const mgmtContacts = await prisma.contact.findMany({
        where: { contact_type: 'MANAGEMENT' },
        select: { phone_number: true, name: true }
    });

    const protectedPhones = new Set([
        ...agents.map(a => a.phone).filter(Boolean),
        ...partners.map(p => p.phone_number),
        ...mgmtContacts.map(c => c.phone_number),
    ]);

    console.log(`Protected agents (${agents.length}):`);
    agents.forEach(a => console.log(`  - ${a.name} (${a.role}): ${a.phone}`));
    console.log(`Protected partners: ${partners.length}`);
    console.log(`Protected management contacts: ${mgmtContacts.length}`);
    console.log(`Total protected phone numbers: ${protectedPhones.size}`);
    console.log(`Phones: ${[...protectedPhones].join(', ')}`);

    // Count records before deletion
    console.log('\n--- Pre-cleanup record counts ---');
    const preCounts = {};
    const tables = [
        'transactionLog', 'dealQuery', 'appointment', 'transaction',
        'builderAppointment', 'builderLead', 'projectMedia', 'projectUnit',
        'project', 'commission', 'subscription', 'inventoryDocument',
        'task', 'inventory', 'owner',
        'workflowExecution', 'workProject', 'campaign',
        'staffCall', 'scheduledVisit', 'taskFollowup',
        'leadScore', 'conversationSession', 'chatWorkflowSession',
        'pendingMessage', 'agentOnboardingSession', 'builderOnboardingSession',
        'auditReport', 'agentActionLog', 'qALog',
        'email', 'voiceCall', 'whatsAppMessage', 'interaction',
        'websiteLead', 'newsletterSubscriber', 'contact'
    ];

    for (const t of tables) {
        try {
            preCounts[t] = await prisma[t].count();
            console.log(`  ${t}: ${preCounts[t]}`);
        } catch (e) {
            console.log(`  ${t}: (error counting: ${e.message})`);
            preCounts[t] = 0;
        }
    }

    // Count contacts that will be deleted vs preserved
    const totalContacts = await prisma.contact.count();
    const preservedContactCount = await prisma.contact.count({
        where: { phone_number: { in: [...protectedPhones] } }
    });
    console.log(`\nContacts: ${totalContacts} total, ${preservedContactCount} preserved, ${totalContacts - preservedContactCount} to delete`);

    // Execute all deletions in a single transaction
    console.log('\n--- Executing cleanup transaction ---');
    const summary = {};

    await prisma.$transaction(async (tx) => {
        // Step 1: TransactionLog
        const r1 = await tx.transactionLog.deleteMany({});
        summary.transactionLog = r1.count;
        console.log(`  [1/38] TransactionLog: ${r1.count} deleted`);

        // Step 2: DealQuery
        const r2 = await tx.dealQuery.deleteMany({});
        summary.dealQuery = r2.count;
        console.log(`  [2/38] DealQuery: ${r2.count} deleted`);

        // Step 3: Appointment
        const r3 = await tx.appointment.deleteMany({});
        summary.appointment = r3.count;
        console.log(`  [3/38] Appointment: ${r3.count} deleted`);

        // Step 4: Transaction
        const r4 = await tx.transaction.deleteMany({});
        summary.transaction = r4.count;
        console.log(`  [4/38] Transaction: ${r4.count} deleted`);

        // Step 5: BuilderAppointment
        const r5 = await tx.builderAppointment.deleteMany({});
        summary.builderAppointment = r5.count;
        console.log(`  [5/38] BuilderAppointment: ${r5.count} deleted`);

        // Step 6: BuilderLead
        const r6 = await tx.builderLead.deleteMany({});
        summary.builderLead = r6.count;
        console.log(`  [6/38] BuilderLead: ${r6.count} deleted`);

        // Step 7: ProjectMedia
        const r7 = await tx.projectMedia.deleteMany({});
        summary.projectMedia = r7.count;
        console.log(`  [7/38] ProjectMedia: ${r7.count} deleted`);

        // Step 8: ProjectUnit
        const r8 = await tx.projectUnit.deleteMany({});
        summary.projectUnit = r8.count;
        console.log(`  [8/38] ProjectUnit: ${r8.count} deleted`);

        // Step 9: Project
        const r9 = await tx.project.deleteMany({});
        summary.project = r9.count;
        console.log(`  [9/38] Project: ${r9.count} deleted`);

        // Step 10: Commission
        const r10 = await tx.commission.deleteMany({});
        summary.commission = r10.count;
        console.log(`  [10/38] Commission: ${r10.count} deleted`);

        // Step 11: Subscription
        const r11 = await tx.subscription.deleteMany({});
        summary.subscription = r11.count;
        console.log(`  [11/38] Subscription: ${r11.count} deleted`);

        // Step 12: InventoryDocument
        const r12 = await tx.inventoryDocument.deleteMany({});
        summary.inventoryDocument = r12.count;
        console.log(`  [12/38] InventoryDocument: ${r12.count} deleted`);

        // Step 13: Task
        const r13 = await tx.task.deleteMany({});
        summary.task = r13.count;
        console.log(`  [13/38] Task: ${r13.count} deleted`);

        // Step 14: Inventory
        const r14 = await tx.inventory.deleteMany({});
        summary.inventory = r14.count;
        console.log(`  [14/38] Inventory: ${r14.count} deleted`);

        // Step 15: Owner
        const r15 = await tx.owner.deleteMany({});
        summary.owner = r15.count;
        console.log(`  [15/38] Owner: ${r15.count} deleted`);

        // Step 16: WorkflowExecution
        const r16 = await tx.workflowExecution.deleteMany({});
        summary.workflowExecution = r16.count;
        console.log(`  [16/38] WorkflowExecution: ${r16.count} deleted`);

        // Step 17: WorkProject
        const r17 = await tx.workProject.deleteMany({});
        summary.workProject = r17.count;
        console.log(`  [17/38] WorkProject: ${r17.count} deleted`);

        // Step 18: Campaign
        const r18 = await tx.campaign.deleteMany({});
        summary.campaign = r18.count;
        console.log(`  [18/38] Campaign: ${r18.count} deleted`);

        // Step 19: StaffCall
        const r19 = await tx.staffCall.deleteMany({});
        summary.staffCall = r19.count;
        console.log(`  [19/38] StaffCall: ${r19.count} deleted`);

        // Step 20: ScheduledVisit
        const r20 = await tx.scheduledVisit.deleteMany({});
        summary.scheduledVisit = r20.count;
        console.log(`  [20/38] ScheduledVisit: ${r20.count} deleted`);

        // Step 21: TaskFollowup
        const r21 = await tx.taskFollowup.deleteMany({});
        summary.taskFollowup = r21.count;
        console.log(`  [21/38] TaskFollowup: ${r21.count} deleted`);

        // Step 22: LeadScore
        const r22 = await tx.leadScore.deleteMany({});
        summary.leadScore = r22.count;
        console.log(`  [22/38] LeadScore: ${r22.count} deleted`);

        // Step 23: ConversationSession
        const r23 = await tx.conversationSession.deleteMany({});
        summary.conversationSession = r23.count;
        console.log(`  [23/38] ConversationSession: ${r23.count} deleted`);

        // Step 24: ChatWorkflowSession
        const r24 = await tx.chatWorkflowSession.deleteMany({});
        summary.chatWorkflowSession = r24.count;
        console.log(`  [24/38] ChatWorkflowSession: ${r24.count} deleted`);

        // Step 25: PendingMessage
        const r25 = await tx.pendingMessage.deleteMany({});
        summary.pendingMessage = r25.count;
        console.log(`  [25/38] PendingMessage: ${r25.count} deleted`);

        // Step 26: AgentOnboardingSession
        const r26 = await tx.agentOnboardingSession.deleteMany({});
        summary.agentOnboardingSession = r26.count;
        console.log(`  [26/38] AgentOnboardingSession: ${r26.count} deleted`);

        // Step 27: BuilderOnboardingSession
        const r27 = await tx.builderOnboardingSession.deleteMany({});
        summary.builderOnboardingSession = r27.count;
        console.log(`  [27/38] BuilderOnboardingSession: ${r27.count} deleted`);

        // Step 28: AuditReport
        const r28 = await tx.auditReport.deleteMany({});
        summary.auditReport = r28.count;
        console.log(`  [28/38] AuditReport: ${r28.count} deleted`);

        // Step 29: AgentActionLog
        const r29 = await tx.agentActionLog.deleteMany({});
        summary.agentActionLog = r29.count;
        console.log(`  [29/38] AgentActionLog: ${r29.count} deleted`);

        // Step 30: QALog
        const r30 = await tx.qALog.deleteMany({});
        summary.qALog = r30.count;
        console.log(`  [30/38] QALog: ${r30.count} deleted`);

        // Step 31: Email
        const r31 = await tx.email.deleteMany({});
        summary.email = r31.count;
        console.log(`  [31/38] Email: ${r31.count} deleted`);

        // Step 32: VoiceCall
        const r32 = await tx.voiceCall.deleteMany({});
        summary.voiceCall = r32.count;
        console.log(`  [32/38] VoiceCall: ${r32.count} deleted`);

        // Step 33: WhatsAppMessage
        const r33 = await tx.whatsAppMessage.deleteMany({});
        summary.whatsAppMessage = r33.count;
        console.log(`  [33/38] WhatsAppMessage: ${r33.count} deleted`);

        // Step 34: Interaction
        const r34 = await tx.interaction.deleteMany({});
        summary.interaction = r34.count;
        console.log(`  [34/38] Interaction: ${r34.count} deleted`);

        // Step 35: WebsiteLead
        const r35 = await tx.websiteLead.deleteMany({});
        summary.websiteLead = r35.count;
        console.log(`  [35/38] WebsiteLead: ${r35.count} deleted`);

        // Step 36: NewsletterSubscriber
        const r36 = await tx.newsletterSubscriber.deleteMany({});
        summary.newsletterSubscriber = r36.count;
        console.log(`  [36/38] NewsletterSubscriber: ${r36.count} deleted`);

        // Step 37: Contact (only non-protected)
        const r37 = await tx.contact.deleteMany({
            where: { phone_number: { notIn: [...protectedPhones] } }
        });
        summary.contact = r37.count;
        console.log(`  [37/38] Contact: ${r37.count} deleted (${protectedPhones.size} preserved)`);

        // Step 38: Reset InventoryCounter
        const r38 = await tx.inventoryCounter.updateMany({
            data: { counter: 20000 }
        });
        summary.inventoryCounter = `reset (${r38.count} rows)`;
        console.log(`  [38/38] InventoryCounter: reset to 20000 (${r38.count} rows)`);

        // Step 39: Reset preserved contacts' test interaction data
        const r39 = await tx.contact.updateMany({
            where: { phone_number: { in: [...protectedPhones] } },
            data: {
                lead_status: 'cold',
                lifecycle_stage: 'NEW',
                ai_summary: null,
                notes: null,
                last_interaction: null,
                next_action_at: null,
                next_action_type: null,
                last_wa_inbound: null,
                last_channel: null,
            }
        });
        summary.contactsReset = r39.count;
        console.log(`  [39] Reset ${r39.count} preserved contacts' interaction data`);

    }, { timeout: 300000 }); // 5 minute timeout

    // Final summary
    console.log('\n=== CLEANUP COMPLETE ===');
    console.log('Summary:', JSON.stringify(summary, null, 2));

    // Post-cleanup verification
    console.log('\n--- Post-cleanup verification ---');
    const tenantCount = await prisma.tenant.count();
    const agentCount = await prisma.agent.count();
    const partnerCount = await prisma.partnerAgent.count();
    const contactCount = await prisma.contact.count();
    const inventoryCount = await prisma.inventory.count();
    const catCount = await prisma.propertyCategory.count();
    const configCount = await prisma.propertyConfiguration.count();

    console.log(`  Tenants: ${tenantCount} (preserved)`);
    console.log(`  Agents: ${agentCount} (preserved)`);
    console.log(`  Partners: ${partnerCount} (preserved)`);
    console.log(`  Contacts: ${contactCount} (preserved)`);
    console.log(`  Inventory: ${inventoryCount} (should be 0)`);
    console.log(`  PropertyCategories: ${catCount} (preserved)`);
    console.log(`  PropertyConfigurations: ${configCount} (preserved)`);

    console.log('\nFinished at:', new Date().toISOString());
    console.log('__CLEANUP_SUCCESS__');
}

main()
    .catch(e => {
        console.error('CLEANUP FAILED:', e.message);
        console.error(e.stack);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
