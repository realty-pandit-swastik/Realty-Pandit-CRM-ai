
/**
 * RBAC Permission Matrix for Realty Pandit.
 * Defines what each role can do.
 */
export const PERMISSIONS: Record<string, string[]> = {
    super_boss: [
        'view_all_leads',
        'assign_leads',
        'view_reports',
        'manage_agents',
        'create_agents',
        'manage_team',
        'view_inventory',
        'edit_inventory',
        'delete_inventory',
        'manage_settings',
        'edit_contact',
        'view_all_tenants',
        'bulk_upload',
        'manage_email',
        'manage_transactions',
        'view_transactions',
        'manage_deals',
        'act_on_deals',
        'view_deals',
        'share_inventory',
        'transfer_inventory'
    ],
    manager: [
        'view_all_leads',
        'assign_leads',
        'view_reports',
        'manage_agents',
        'create_agents',
        'manage_team',
        'view_inventory',
        'edit_inventory',
        'bulk_upload',
        'edit_contact',
        'manage_transactions',
        'view_transactions',
        'manage_deals',
        'act_on_deals',
        'view_deals',
        'share_inventory',
        'transfer_inventory'
    ],
    employee: [
        'view_assigned_leads',
        'update_lead_status',
        'view_inventory',
        'edit_inventory',
        'view_transactions',
        'view_deals',
        // 2026-05-15: employees can now act on deals they SEE — log calls, edit
        // requirements (qualify), change stage, share properties, view matched
        // inventory. They still CANNOT create new deals or reassign deals to others
        // (those remain `manage_deals` for super_boss + manager).
        'act_on_deals',
        'share_inventory',
        'transfer_inventory'
    ],
    // 2026-07-12: EXTERNAL PARTNER AGENT. Logs into the same admin app but is locked to
    // their OWN leads/deals + redacted inventory. These permission strings only pass the
    // per-route `checkPermission` gates for the actions a partner is allowed; the REAL
    // boundary is the partner default-deny guard in middleware/auth.ts (a partner token can
    // reach ONLY an explicit route allow-list) + per-endpoint data scoping + partner
    // redaction (SanitizationService). Never grant view_reports / manage_agents / manage_team.
    partner: [
        'view_inventory',
        'edit_inventory',      // add/edit their OWN listings (scoped)
        'share_inventory',     // share their listing / a matched property (redacted, via team)
        'view_deals',
        'act_on_deals',        // work their OWN deals (scoped)
        'view_transactions',
        'update_lead_status',
        'edit_contact'         // edit their OWN referred leads (scoped)
    ]
};

export function hasPermission(role: string, permission: string): boolean {
    const rolePerms = PERMISSIONS[role];
    if (!rolePerms) return false;
    return rolePerms.includes(permission);
}

export function getAllPermissions(role: string): string[] {
    return PERMISSIONS[role] || [];
}
