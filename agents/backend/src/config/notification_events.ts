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
    task_overdue: {
        event: 'task_overdue',
        category: 'task',
        title: (d) => 'Task Overdue',
        body: (d) => `"${(d.title || 'Task').substring(0, 60)}" is overdue!`,
        defaultChannels: ['push', 'whatsapp'],
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
