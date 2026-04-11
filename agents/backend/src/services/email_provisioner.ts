
import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger';

const execAsync = promisify(exec);

const DOMAIN = 'realtypandit.in';
const VMAIL_BASE = '/var/mail/vhosts';
const VMAILBOX_FILE = '/etc/postfix/vmailbox';
const DOVECOT_USERS_FILE = '/etc/dovecot/users';

export class EmailProvisioner {

    /**
     * Convert a full name to a @realtypandit.in email address.
     * "Rahul Sharma" → "rahul.sharma@realtypandit.in"
     */
    public generateEmailLocal(name: string): string {
        return name
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '.')
            .replace(/[^a-z0-9.]/g, '');
    }

    public generateEmail(name: string): string {
        return `${this.generateEmailLocal(name)}@${DOMAIN}`;
    }

    /**
     * Check if an email username is already taken in the Postfix vmailbox file.
     */
    public async isEmailTaken(emailLocal: string): Promise<boolean> {
        try {
            const { stdout } = await execAsync(`grep -c "^${emailLocal}@${DOMAIN}" "${VMAILBOX_FILE}" 2>/dev/null || echo 0`);
            return parseInt(stdout.trim()) > 0;
        } catch {
            return false;
        }
    }

    /**
     * Generate a unique email, appending a number if taken.
     * "rahul.sharma" → "rahul.sharma@realtypandit.in" (or "rahul.sharma2@...")
     */
    public async generateUniqueEmail(name: string): Promise<string> {
        const base = this.generateEmailLocal(name);
        let candidate = base;
        let counter = 2;
        while (await this.isEmailTaken(candidate)) {
            candidate = `${base}${counter}`;
            counter++;
        }
        return `${candidate}@${DOMAIN}`;
    }

    /**
     * Provision a full Postfix + Dovecot virtual mailbox.
     * Called when a new team member is created.
     */
    public async provision(email: string, password: string): Promise<void> {
        const [local] = email.split('@');

        logger.info(`[EmailProvisioner] Provisioning mailbox for ${email}`);

        try {
            // 1. Create Maildir structure
            const maildir = `${VMAIL_BASE}/${DOMAIN}/${local}`;
            await execAsync(`mkdir -p "${maildir}/cur" "${maildir}/new" "${maildir}/tmp"`);
            await execAsync(`chown -R vmail:vmail "${maildir}" 2>/dev/null || true`);

            // 2. Add to Postfix vmailbox map (if not already present)
            const { stdout: existing } = await execAsync(
                `grep -c "^${email}" "${VMAILBOX_FILE}" 2>/dev/null || echo 0`
            );
            if (parseInt(existing.trim()) === 0) {
                await execAsync(`echo "${email}  ${DOMAIN}/${local}/" >> "${VMAILBOX_FILE}"`);
                await execAsync(`postmap "${VMAILBOX_FILE}"`);
                await execAsync(`postfix reload`);
            }

            // 3. Add to Dovecot users file (plain password - Dovecot handles hashing)
            const dovecotExisting = await execAsync(
                `grep -c "^${email}:" "${DOVECOT_USERS_FILE}" 2>/dev/null || echo 0`
            );
            if (parseInt(dovecotExisting.stdout.trim()) === 0) {
                await execAsync(`echo "${email}:{PLAIN}${password}" >> "${DOVECOT_USERS_FILE}"`);
            } else {
                // Update existing password
                await execAsync(
                    `sed -i "s|^${email}:.*|${email}:{PLAIN}${password}|" "${DOVECOT_USERS_FILE}"`
                );
            }

            // 4. Restart Dovecot to pick up changes
            await execAsync(`systemctl reload dovecot 2>/dev/null || service dovecot reload 2>/dev/null || true`);

            logger.info(`[EmailProvisioner] ✅ Mailbox provisioned: ${email}`);
        } catch (error: any) {
            // Log but don't fail the agent creation — email can be set up manually
            logger.error(`[EmailProvisioner] Failed to provision mailbox for ${email}: ${error.message}`);
            console.error(`[EmailProvisioner] Warning: Could not provision mailbox — ${error.message}`);
        }
    }

    /**
     * Update the password for an existing mailbox.
     */
    public async updatePassword(email: string, newPassword: string): Promise<void> {
        try {
            await execAsync(
                `sed -i "s|^${email}:.*|${email}:{PLAIN}${newPassword}|" "${DOVECOT_USERS_FILE}"`
            );
            await execAsync(`systemctl reload dovecot 2>/dev/null || service dovecot reload 2>/dev/null || true`);
            logger.info(`[EmailProvisioner] Password updated for ${email}`);
        } catch (error: any) {
            logger.error(`[EmailProvisioner] Failed to update password for ${email}: ${error.message}`);
        }
    }

    /**
     * One-time server setup: ensure Postfix virtual mailbox config is in place.
     * Call this once during initial server bootstrap.
     */
    public async ensureServerConfig(): Promise<void> {
        try {
            // Create vmail user if not exists
            await execAsync(`id vmail 2>/dev/null || useradd -r -s /sbin/nologin -d "${VMAIL_BASE}" vmail`);
            await execAsync(`mkdir -p "${VMAIL_BASE}/${DOMAIN}"`);
            await execAsync(`chown -R vmail:vmail "${VMAIL_BASE}" 2>/dev/null || true`);

            // Create vmailbox file if not exists
            await execAsync(`touch "${VMAILBOX_FILE}"`);
            await execAsync(`postmap "${VMAILBOX_FILE}" 2>/dev/null || true`);

            // Create Dovecot users file if not exists
            await execAsync(`touch "${DOVECOT_USERS_FILE}"`);
            await execAsync(`chmod 640 "${DOVECOT_USERS_FILE}"`);

            logger.info('[EmailProvisioner] Server config verified');
        } catch (error: any) {
            logger.error(`[EmailProvisioner] Server config check failed: ${error.message}`);
        }
    }
}

export const emailProvisioner = new EmailProvisioner();
