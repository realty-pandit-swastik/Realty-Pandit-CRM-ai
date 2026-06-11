
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
