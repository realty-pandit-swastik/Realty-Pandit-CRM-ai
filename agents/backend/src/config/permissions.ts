
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
        'view_all_tenants',
        'bulk_upload',
        'manage_email',
        'manage_transactions',
        'view_transactions',
        'manage_deals',
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
        'manage_transactions',
        'view_transactions',
        'manage_deals',
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
