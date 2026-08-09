/**
 * Notification Event Registry — Single source of truth for all notification events.
 * Every event that can trigger a notification is defined here with defaults.
 */

export interface NotificationEventConfig {
    event: string;
    category: 'inventory' | 'lead' | 'deal' | 'appointment' | 'task' | 'team' | 'system';
    title: (data: Record<string, any>) => string;
    body: (data: Record<string, any>) => string;
    defaultChannels: ('whatsapp' | 'email' | 'push')[];
    actionUrl?: (data: Record<string, any>) => string;
    prefKey?: string; // key in event_preferences JSON to check (falls back to category-level)
    /**
     * Optional Meta-approved WhatsApp template (2026-07-22).
     *
     * Free-form WhatsApp text only delivers inside the 24h customer-service window, which closes
     * 24h after the RECIPIENT last messaged the bot. For STAFF alerts that means notifications
     * silently stop for anyone who doesn't chat with the bot daily — after the Jul-13 outage
     * lapsed every window, 13 of 14 staff stopped receiving lead alerts (error 131047).
     *
     * When set, notify() routes through SessionTracker.smartSend: the richer free-form text
     * inside the window, this approved template outside it. Template params must all be
     * non-empty, hence the 'N/A' fallbacks (same convention as interaction_engine.ts).
     */
    waTemplate?: {
        key: string;
        params: (data: Record<string, any>) => Record<string, string>;
    };
}

export const NOTIFICATION_EVENTS: Record<string, NotificationEventConfig> = {
    // ─── INVENTORY ────────────────────────────────────────────
    inventory_created: {
        event: 'inventory_created',
        category: 'inventory',
        title: (d) => 'New Inventory Listed',
        body: (d) => `${d.uploader_name || 'Someone'} listed a ${d.property_type || 'property'} in ${d.location || 'N/A'}`,
        defaultChannels: ['push'],
        actionUrl: (d) => `#/inventory?highlight=${d.inventory_id}`,
        prefKey: 'new_inventory',
    },
    inventory_approved: {
        event: 'inventory_approved',
        category: 'inventory',
        title: (d) => 'Inventory Approved',
        body: (d) => `${d.display_id || 'Your property'} has been approved and is now LIVE`,
        defaultChannels: ['whatsapp', 'email', 'push'],
        actionUrl: (d) => `#/inventory?highlight=${d.inventory_id}`,
    },
    inventory_rejected: {
        event: 'inventory_rejected',
        category: 'inventory',
        title: (d) => 'Inventory Rejected',
        body: (d) => `${d.display_id || 'Your property'} was rejected${d.reason ? ': ' + d.reason : ''}`,
        defaultChannels: ['whatsapp', 'email', 'push'],
        actionUrl: (d) => `#/inventory?highlight=${d.inventory_id}`,
    },
    inventory_shared: {
        event: 'inventory_shared',
        category: 'inventory',
        title: (d) => 'Property Shared with You',
        body: (d) => `${d.sharer_name || 'Someone'} shared ${d.display_id || 'a property'} with you`,
        defaultChannels: ['push', 'whatsapp'],
        actionUrl: (d) => `#/inventory?highlight=${d.inventory_id}`,
    },
    inventory_transferred: {
        event: 'inventory_transferred',
        category: 'inventory',
        title: (d) => 'Property Transferred',
        body: (d) => `${d.display_id || 'A property'} has been transferred to you by ${d.from_agent || 'admin'}`,
        defaultChannels: ['whatsapp', 'email', 'push'],
        actionUrl: (d) => `#/inventory?highlight=${d.inventory_id}`,
    },
    inventory_transferred_away: {
        event: 'inventory_transferred_away',
        category: 'inventory',
        title: (d) => 'Property Reassigned',
        body: (d) => `${d.display_id || 'A property'} you handled was reassigned to ${d.to_agent || 'another agent'}${d.reason ? ' — ' + d.reason : ''}`,
        defaultChannels: ['push'],
        actionUrl: (d) => `#/inventory?highlight=${d.inventory_id}`,
    },
    inventory_status_changed: {
        event: 'inventory_status_changed',
        category: 'inventory',
        title: (d) => `Property ${d.new_status?.toUpperCase() || 'Updated'}`,
        body: (d) => `${d.display_id || 'A property'} status changed to ${d.new_status || 'unknown'}`,
        defaultChannels: ['push'],
        actionUrl: (d) => `#/inventory?highlight=${d.inventory_id}`,
    },
    inventory_shared_to_client: {
        event: 'inventory_shared_to_client',
        category: 'inventory',
        title: (d) => 'Property Shared to Client',
        body: (d) => `${d.display_id || 'A property'} was shared with client ${d.client_name || d.client_phone || ''}`,
        defaultChannels: ['push'],
    },

    // ─── LEADS ────────────────────────────────────────────────
    lead_created: {
        event: 'lead_created',
        category: 'lead',
        title: (d) => `New Lead: ${d.source || 'Website'}`,
        body: (d) => `${d.name || 'New contact'} (${d.phone || ''}) — ${d.intent || 'inquiry'}`,
        defaultChannels: ['whatsapp', 'email', 'push'],
        actionUrl: (d) => `#/leads`,
        prefKey: 'new_lead_notification',
    },
    lead_assigned: {
        event: 'lead_assigned',
        category: 'lead',
        title: (d) => 'New Lead Assigned to You',
        body: (d) => `${d.name || 'A lead'} (${d.phone || ''}) — ${d.property_label || d.source || 'new lead'} assigned to you`,
        defaultChannels: ['whatsapp', 'push'],
        // Highest-value staff alert — a new lead needs contact within 24h, so it must arrive
        // even when the agent's session window has closed.
        waTemplate: {
            key: 'rp_tx_lead_assigned',
            params: (d) => ({
                name: d.name || d.lead_name || 'New lead',
                property_type: d.property_label || d.property_type || 'N/A',
                location: d.location || 'N/A',
                budget: d.budget || 'N/A',
                type: d.type || 'Sale',
                source: d.source || 'N/A',
            }),
        },
        actionUrl: (d) => `#/leads`,
        prefKey: 'new_lead_notification',
    },
    lead_escalation: {
        event: 'lead_escalation',
        category: 'lead',
        title: () => 'Lead Not Contacted — Escalated',
        body: (d) => `${d.lead_name || 'A lead'} (${d.phone_number || ''}) was not contacted by ${d.original_agent_name || 'assigned agent'} within 20 min. Auto-assigned to you.`,
        defaultChannels: ['whatsapp', 'push'],
        actionUrl: () => `#/leads`,
        prefKey: 'new_lead_notification',
    },
    lead_reassigned_to_me: {
        event: 'lead_reassigned_to_me',
        category: 'lead',
        title: (d) => 'Lead Reassigned to You',
        body: (d) => `${d.lead_name || 'A lead'} (${d.phone || ''}) reassigned to you by ${d.from_agent || 'a team member'}${d.reason ? ' — ' + d.reason : ''}`,
        defaultChannels: ['whatsapp', 'push'],
        // Approved 2026-07-22 — delivers even when the agent's 24h window has closed.
        waTemplate: {
            key: 'rp_agent_lead_reassigned',
            params: (d) => ({
                lead: d.lead_name || d.name || 'A lead',
                phone: d.phone || 'N/A',
                from: d.from_agent || 'a team member',
                reason: d.reason || 'N/A',
            }),
        },
        actionUrl: (d) => `#/leads`,
        prefKey: 'new_lead_notification',
    },
    // 2026-08-09: sharing a lead told the recipient NOTHING — the share endpoint wrote
    // shared_with_ids and returned, with zero notification calls. The teammate only found out if
    // someone phoned them. Modelled on inventory_shared (the structural twin, above).
    //
    // NOTE the wording: "shared" is collaborative access with the owner UNCHANGED, unlike
    // lead_reassigned_to_me above which is a transfer of ownership. Do not conflate them.
    //
    // No waTemplate yet — there is no approved Meta template for a lead share, and
    // rp_agent_lead_reassigned would misstate what happened. Without one, notify() falls back to
    // free-form text, which only delivers inside the recipient's 24h window; the in-app bell row is
    // written unconditionally either way. Submit rp_agent_lead_shared as UTILITY (see
    // docs/backlog/whatsapp-staff-templates-to-submit.md) and add the waTemplate block here once
    // approved — smartSend then covers the out-of-window case automatically.
    lead_shared: {
        event: 'lead_shared',
        category: 'lead',
        title: (d) => 'Lead Shared with You',
        body: (d) => `${d.sharer_name || 'A team member'} shared ${d.lead_name || 'a lead'}${d.phone ? ` (${d.phone})` : ''} with you — you can view and work it; the owner is unchanged`,
        defaultChannels: ['whatsapp', 'push'],
        actionUrl: (d) => `#/leads`,
        prefKey: 'new_lead_notification',
    },
    lead_reassigned_away: {
        event: 'lead_reassigned_away',
        category: 'lead',
        title: (d) => 'Lead Reassigned',
        body: (d) => `${d.lead_name || 'A lead'} (${d.phone || ''}) you managed was reassigned to ${d.to_agent || 'another agent'}`,
        defaultChannels: ['push'],
        actionUrl: (d) => `#/leads`,
    },
    lead_status_changed: {
        event: 'lead_status_changed',
        category: 'lead',
        title: (d) => `Lead Status: ${d.new_status || 'Updated'}`,
        body: (d) => `${d.name || 'A lead'} status changed to ${d.new_status || 'unknown'}`,
        defaultChannels: ['push'],
    },
    partner_lead_closed: {
        event: 'partner_lead_closed',
        category: 'lead',
        title: (d) => 'Partner Closed a Lead',
        body: (d) => `${d.partner_name || 'A partner'} marked lead "${d.client_name || d.client_phone || 'Unknown'}" as done — handled with their own inventory`,
        defaultChannels: ['whatsapp', 'push'],
        actionUrl: (d) => `#/leads`,
        prefKey: 'new_lead_notification',
    },
    lead_followup_due: {
        event: 'lead_followup_due',
        category: 'lead',
        title: (d) => 'Follow-up Due',
        body: (d) => `${d.name || 'A lead'} needs follow-up — no interaction in ${d.hours || 48}h`,
        defaultChannels: ['push'],
    },
    external_lead_captured: {
        event: 'external_lead_captured',
        category: 'lead',
        title: (d) => `Lead from ${d.source || 'Portal'}`,
        body: (d) => `${d.name || 'New lead'} captured from ${d.source || 'external portal'}`,
        defaultChannels: ['whatsapp', 'push'],
        actionUrl: (d) => `#/leads`,
        prefKey: 'new_lead_notification',
    },

    // ─── DEALS ────────────────────────────────────────────────
    deal_created: {
        event: 'deal_created',
        category: 'deal',
        title: (d) => 'New Deal Created',
        body: (d) => `Deal ${d.deal_id || ''} created for ${d.customer_name || 'customer'}`,
        defaultChannels: ['whatsapp', 'email', 'push'],
        actionUrl: (d) => `#/deals`,
    },
    deal_matched: {
        event: 'deal_matched',
        category: 'deal',
        title: (d) => 'Property Matched',
        body: (d) => `${d.property_info || 'A property'} matched to deal ${d.deal_id || ''}`,
        defaultChannels: ['whatsapp', 'email', 'push'],
        actionUrl: (d) => `#/deals`,
        prefKey: 'property_match_notification',
    },
    deal_status_changed: {
        event: 'deal_status_changed',
        category: 'deal',
        title: (d) => `Deal ${d.new_status || 'Updated'}`,
        body: (d) => `Deal ${d.deal_id || ''} moved to ${d.new_status || 'next stage'}`,
        defaultChannels: ['whatsapp', 'email', 'push'],
        actionUrl: (d) => `#/deals`,
    },
    deal_query_raised: {
        event: 'deal_query_raised',
        category: 'deal',
        title: (d) => 'Query on Deal',
        body: (d) => `${d.from_name || 'Someone'} raised a query: "${(d.query || '').substring(0, 80)}"`,
        defaultChannels: ['whatsapp', 'push'],
        actionUrl: (d) => `#/deals`,
    },
    deal_query_answered: {
        event: 'deal_query_answered',
        category: 'deal',
        title: (d) => 'Query Answered',
        body: (d) => `Your query on deal ${d.deal_id || ''} has been answered`,
        defaultChannels: ['whatsapp', 'push'],
        actionUrl: (d) => `#/deals`,
    },
    deal_closed_won: {
        event: 'deal_closed_won',
        category: 'deal',
        title: (d) => 'Deal Closed — Won!',
        body: (d) => `Deal ${d.deal_id || ''} has been successfully closed`,
        defaultChannels: ['whatsapp', 'email', 'push'],
        actionUrl: (d) => `#/deals`,
    },
    deal_closed_lost: {
        event: 'deal_closed_lost',
        category: 'deal',
        title: (d) => 'Deal Closed — Lost',
        body: (d) => `Deal ${d.deal_id || ''} did not proceed${d.reason ? ': ' + d.reason : ''}`,
        defaultChannels: ['whatsapp', 'email', 'push'],
        actionUrl: (d) => `#/deals`,
    },
    deal_reassigned_to_me: {
        event: 'deal_reassigned_to_me',
        category: 'deal',
        title: (d) => 'Deal Reassigned to You',
        body: (d) => `Deal ${d.deal_id || ''} (${d.customer_name || 'customer'}) reassigned to you by ${d.from_agent || 'a team member'}${d.reason ? ' — ' + d.reason : ''}`,
        defaultChannels: ['whatsapp', 'push'],
        // Approved 2026-07-22 — delivers even when the agent's 24h window has closed.
        waTemplate: {
            key: 'rp_agent_deal_reassigned',
            params: (d) => ({
                deal: String(d.deal_id || '').slice(0, 8) || 'N/A',
                customer: d.customer_name || 'a customer',
                from: d.from_agent || 'a team member',
                reason: d.reason || 'N/A',
            }),
        },
        actionUrl: (d) => `#/deals?highlight=${d.deal_id}`,
    },
    deal_reassigned_away: {
        event: 'deal_reassigned_away',
        category: 'deal',
        title: (d) => 'Deal Reassigned',
        body: (d) => `Deal ${d.deal_id || ''} (${d.customer_name || 'customer'}) you managed was reassigned to ${d.to_agent || 'another agent'}`,
        defaultChannels: ['push'],
        actionUrl: (d) => `#/deals?highlight=${d.deal_id}`,
    },

    // ─── APPOINTMENTS ─────────────────────────────────────────
    appointment_created: {
        event: 'appointment_created',
        category: 'appointment',
        title: (d) => 'Visit Scheduled',
        body: (d) => `Visit booked for ${d.property_info || 'property'} on ${d.date || 'TBD'} at ${d.time || 'TBD'}`,
        defaultChannels: ['whatsapp', 'email', 'push'],
        actionUrl: (d) => `#/calendar`,
        prefKey: 'appointment_reminder',
    },
    appointment_confirmed: {
        event: 'appointment_confirmed',
        category: 'appointment',
        title: (d) => 'Visit Confirmed',
        body: (d) => `${d.confirmed_by || 'Buyer'} confirmed the visit for ${d.date || 'scheduled date'}`,
        defaultChannels: ['whatsapp', 'push'],
        actionUrl: (d) => `#/calendar`,
        prefKey: 'appointment_reminder',
    },
    appointment_cancelled: {
        event: 'appointment_cancelled',
        category: 'appointment',
        title: (d) => 'Visit Cancelled',
        body: (d) => `Visit for ${d.property_info || 'property'} has been cancelled${d.reason ? ': ' + d.reason : ''}`,
        defaultChannels: ['whatsapp', 'push'],
        actionUrl: (d) => `#/calendar`,
        prefKey: 'appointment_reminder',
    },
    appointment_rescheduled: {
        event: 'appointment_rescheduled',
        category: 'appointment',
        title: (d) => 'Visit Rescheduled',
        body: (d) => `Visit rescheduled to ${d.new_date || 'new date'} at ${d.new_time || 'new time'}`,
        defaultChannels: ['whatsapp', 'push'],
        actionUrl: (d) => `#/calendar`,
        prefKey: 'appointment_reminder',
    },
    appointment_reminder: {
        event: 'appointment_reminder',
        category: 'appointment',
        title: (d) => 'Visit Reminder',
        body: (d) => `Reminder: Visit for ${d.property_info || 'property'} ${d.time_until || 'soon'}`,
        defaultChannels: ['whatsapp', 'push'],
        prefKey: 'appointment_reminder',
    },

    // ─── TASKS ────────────────────────────────────────────────
    task_assigned: {
        event: 'task_assigned',
        category: 'task',
        title: (d) => 'New Task Assigned',
        body: (d) => `"${(d.title || 'Task').substring(0, 60)}" assigned to you${d.due_date ? ' — due ' + d.due_date : ''}`,
        defaultChannels: ['push', 'whatsapp'],
        // Approved 2026-07-24 — delivers the task alert even when the agent's 24h window has closed.
        waTemplate: {
            key: 'rp_agent_task_assigned',
            params: (d) => ({
                task: (d.title || 'CRM task').toString().replace(/\s+/g, ' ').trim().slice(0, 200) || 'CRM task',
                regarding: d.customer_name || d.contact_name || d.regarding || d.lead_name || 'N/A',
                due: d.due_date ? String(d.due_date) : 'soon',
            }),
        },
        actionUrl: (d) => `#/tasks`,
        prefKey: 'task_due_reminder',
    },
    task_completed: {
        event: 'task_completed',
        category: 'task',
        title: (d) => 'Task Completed',
        body: (d) => `"${(d.title || 'Task').substring(0, 60)}" has been completed by ${d.completed_by || 'assignee'}`,
        defaultChannels: ['push'],
        actionUrl: (d) => `#/tasks`,
    },
    task_due_reminder: {
        event: 'task_due_reminder',
        category: 'task',
        title: (d) => 'Task Due Soon',
        body: (d) => `"${(d.title || 'Task').substring(0, 60)}" is due ${d.time_until || 'tomorrow'}`,
        defaultChannels: ['push'],
        prefKey: 'task_due_reminder',
    },
    // Self-set deal follow-up reminder (T8). Dedicated event so it can go via
    // WhatsApp with the full task details the member entered (name/phone/note)
    // WITHOUT changing behaviour of the shared generic `task_due_reminder`
    // used by the daily digest / workflow tasks.
    // See docs/plans/2026-05-18-google-calendar-task-reminder-sync.md
    deal_reminder_due: {
        event: 'deal_reminder_due',
        category: 'task',
        title: (d) => `⏰ Reminder: follow up with ${d.customer_name || d.customer_phone || 'client'}`,
        body: (d) => [
            `Hi ${d.agent_name || 'there'}, your reminder is due ${d.time_until || 'now'}.`,
            ``,
            `👤 ${d.customer_name || 'Client'}`,
            ...(d.customer_phone ? [`📞 ${d.customer_phone}`] : []),
            ...(d.note ? [`📝 ${d.note}`] : []),
            ``,
            `Open the deal in CRM to log your call.`,
        ].join('\n'),
        defaultChannels: ['push', 'whatsapp'],
        actionUrl: (d) => `#/deals${d.deal_id ? `?id=${d.deal_id}` : ''}`,
        prefKey: 'task_due_reminder',
    },
    task_overdue: {
        event: 'task_overdue',
        category: 'task',
        title: (d) => 'Task Overdue',
        body: (d) => `"${(d.title || 'Task').substring(0, 60)}" is overdue!`,
        defaultChannels: ['push', 'whatsapp'],
        prefKey: 'task_due_reminder',
    },
    // P4 — the member's stored Google token went dead (revoked/expired); their
    // reminders/visits stopped syncing. Push-only (no WhatsApp template).
    // See docs/plans/2026-05-18-google-calendar-task-reminder-sync.md
    google_disconnected: {
        event: 'google_disconnected',
        category: 'task',
        title: () => 'Google sync disconnected',
        body: () => 'Your Google account was disconnected, so reminders & visits stopped syncing to your Calendar. Open your profile and click “Connect Google” to reconnect.',
        defaultChannels: ['push'],
        actionUrl: () => `#/profile`,
        prefKey: 'task_due_reminder',
    },

    // ─── WORKFLOW ENGINE ────────────────────────────────────────
    workflow_task_created: {
        event: 'workflow_task_created',
        category: 'task',
        title: (d: any) => `New ${d.stage_label || 'Workflow'} Task`,
        body: (d: any) => `${d.stage_label || 'Task'} for ${d.contact_name || d.contact_phone || 'lead'} — due ${d.due_date ? new Date(d.due_date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'soon'}`,
        defaultChannels: ['push', 'whatsapp'],
        actionUrl: (d: any) => `#/lead-tasks`,
        prefKey: 'task_due_reminder',
    },
    // 2026-05-14: New lead just entered the CRM. Fires push + in-app for super_boss + assigned agent.
    // WhatsApp text is sent separately by new_lead_alerts.ts (not via this pipeline) to keep the message
    // format unchanged from what the team is used to.
    new_lead_arrived: {
        event: 'new_lead_arrived',
        category: 'lead',
        title: (d: any) => `🆕 New ${d.contact_type || 'Lead'} — ${d.source || 'CRM'}`,
        body: (d: any) => {
            const parts = [`${d.contact_name || 'Unknown'} (${d.contact_phone || '—'})`];
            if (d.intent) parts.push(d.intent);
            if (d.location) parts.push(`📍 ${d.location}`);
            if (d.assigned_agent_name) parts.push(`→ ${d.assigned_agent_name}`);
            return parts.join(' · ');
        },
        defaultChannels: ['push'],
        actionUrl: () => `#/ext-leads`,
        prefKey: 'new_lead_arrived',
    },

    // High-priority lead-action task (callback/visit request from WhatsApp/voice)
    lead_action_task_created: {
        event: 'lead_action_task_created',
        category: 'task',
        title: (d: any) => `${d.action_label || 'Lead Action'} — ACT NOW`,
        body: (d: any) => `${d.contact_name || d.contact_phone || 'Lead'} requested action via ${d.source_channel || 'WhatsApp'}. SLA ${d.sla_minutes || 15} min — auto-escalates to super_boss if missed.`,
        defaultChannels: ['push', 'whatsapp'],
        actionUrl: (d: any) => `#/lead-tasks`,
        prefKey: 'task_due_reminder',
    },
    // SLA breach — task auto-reassigned to super_boss
    lead_action_sla_breach: {
        event: 'lead_action_sla_breach',
        category: 'task',
        title: (d: any) => `⚠️ SLA BREACH — Escalated to You`,
        body: (d: any) => `${d.contact_name || d.contact_phone || 'Lead'}'s ${d.action_label || 'request'} was not actioned by ${d.original_agent_name || 'the assigned agent'} within ${d.sla_minutes || 15} min. Now assigned to you — call NOW.`,
        defaultChannels: ['push', 'whatsapp'],
        actionUrl: (d: any) => `#/lead-tasks`,
    },
    workflow_stage_completed: {
        event: 'workflow_stage_completed',
        category: 'task',
        title: (d: any) => `${d.stage_label || 'Stage'} Completed`,
        body: (d: any) => `${d.agent_name || 'Agent'} completed ${d.stage_label || 'a stage'} for ${d.contact_name || 'lead'}`,
        defaultChannels: ['push'],
        actionUrl: (d: any) => `#/lead-tasks`,
    },
    workflow_snooze_expired: {
        event: 'workflow_snooze_expired',
        category: 'task',
        title: (d: any) => 'Snoozed Task Ready',
        body: (d: any) => `Your snoozed task "${(d.title || 'Lead task').substring(0, 50)}" is ready — call ${d.contact_phone || 'the lead'} now`,
        defaultChannels: ['push', 'whatsapp'],
        actionUrl: (d: any) => `#/lead-tasks`,
        prefKey: 'task_due_reminder',
    },
    workflow_escalated: {
        event: 'workflow_escalated',
        category: 'task',
        title: (d: any) => 'Task Escalated to You',
        body: (d: any) => `Lead ${d.contact_name || d.contact_phone || ''} not contacted after 3 attempts — reassigned to you`,
        defaultChannels: ['push', 'whatsapp'],
        actionUrl: (d: any) => `#/lead-tasks`,
    },
    workflow_lead_lost: {
        event: 'workflow_lead_lost',
        category: 'lead',
        title: (d: any) => 'Lead Closed (Lost)',
        body: (d: any) => `${d.contact_name || 'Lead'} marked as lost${d.reason ? ': ' + d.reason : ''}`,
        defaultChannels: ['push'],
    },
    workflow_deal_won: {
        event: 'workflow_deal_won',
        category: 'deal',
        title: (d: any) => 'Deal Closed! 🎉',
        body: (d: any) => `Deal for ${d.contact_name || 'client'} closed${d.final_price ? ' at ₹' + d.final_price.toLocaleString('en-IN') : ''}!`,
        defaultChannels: ['push', 'whatsapp', 'email'],
        actionUrl: (d: any) => `#/deals`,
    },
    workflow_property_selected: {
        event: 'workflow_property_selected',
        category: 'deal',
        title: (d: any) => 'Property Selected',
        body: (d: any) => `${d.contact_name || 'Client'} selected a property — entering negotiation`,
        defaultChannels: ['push', 'whatsapp'],
        actionUrl: (d: any) => `#/lead-tasks`,
    },
    workflow_loop_back: {
        event: 'workflow_loop_back',
        category: 'task',
        title: (d: any) => `Client Needs More ${d.loop_type === 'SHARE' ? 'Options' : 'Visits'}`,
        body: (d: any) => `${d.contact_name || 'Client'} wants ${d.loop_type === 'SHARE' ? 'more properties' : 'another visit'} — Round ${d.round || 2}`,
        defaultChannels: ['push'],
        actionUrl: (d: any) => `#/lead-tasks`,
    },

    // ─── TEAM ─────────────────────────────────────────────────
    team_member_joined: {
        event: 'team_member_joined',
        category: 'team',
        title: (d) => 'New Team Member',
        body: (d) => `${d.name || 'Someone'} joined the team as ${d.role || 'member'}`,
        defaultChannels: ['push'],
    },
    team_member_deactivated: {
        event: 'team_member_deactivated',
        category: 'team',
        title: (d) => 'Team Member Deactivated',
        body: (d) => `${d.name || 'A member'} has been deactivated`,
        defaultChannels: ['push'],
    },
    partner_registered: {
        event: 'partner_registered',
        category: 'team',
        title: (d) => 'New Partner Registered',
        body: (d) => `${d.name || 'New partner'} registered as a partner agent`,
        defaultChannels: ['push', 'whatsapp', 'email'],
    },

    // ─── SYSTEM ───────────────────────────────────────────────
    security_alert: {
        event: 'security_alert',
        category: 'system',
        title: (d) => 'Security Alert',
        body: (d) => d.message || 'Anomaly detected in the system',
        defaultChannels: ['push', 'whatsapp'],
    },
    daily_summary: {
        event: 'daily_summary',
        category: 'system',
        title: (d) => 'Daily Summary',
        body: (d) => `${d.leads || 0} leads, ${d.appointments || 0} visits, ${d.deals || 0} deals today`,
        defaultChannels: ['push', 'email'],
    },
    whatsapp_message_received: {
        event: 'whatsapp_message_received',
        category: 'system',
        title: (d) => `Message from ${d.contact_name || d.phone || 'contact'}`,
        body: (d) => (d.preview || 'New WhatsApp message').substring(0, 100),
        defaultChannels: ['push'],
        prefKey: 'message_received_notification',
    },
};

export function getEventConfig(event: string): NotificationEventConfig | undefined {
    return NOTIFICATION_EVENTS[event];
}

export function getAllEvents(): NotificationEventConfig[] {
    return Object.values(NOTIFICATION_EVENTS);
}

export function getEventsByCategory(category: string): NotificationEventConfig[] {
    return Object.values(NOTIFICATION_EVENTS).filter(e => e.category === category);
}
