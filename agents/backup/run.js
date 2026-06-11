const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const config = {
  sshKey: '/tmp/rp_key',
  sshUser: 'root',
  serverIp: '72.62.231.224',
  remotePath: '/var/www/realty-pandit',
  backupDir: '/root/backups',
  localBackupDir: path.resolve(__dirname, 'downloads'),
  reportDir: './reports'
};

const args = process.argv.slice(2);
const action = args[0]; // full, code, db, list, restore, download

class BackupAgent {
  constructor() {
    this.startTime = Date.now();
  }

  log(msg) {
    console.log(`[Backup] ${msg}`);
  }

  prepareSSH() {
    try {
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      const keySource = path.join(homeDir, '.ssh', 'realty_pandit_key');
      if (fs.existsSync(keySource)) {
        execSync(`cp "${keySource}" /tmp/rp_key && chmod 600 /tmp/rp_key`, { stdio: 'pipe' });
        return true;
      }
      return false;
    } catch { return false; }
  }

  ssh(cmd) {
    try {
      return execSync(
        `ssh -i ${config.sshKey} -o StrictHostKeyChecking=no ${config.sshUser}@${config.serverIp} "${cmd}"`,
        { encoding: 'utf8', timeout: 300000, stdio: 'pipe' }
      ).trim();
    } catch (e) {
      this.log(`SSH ERROR: ${e.message}`);
      return null;
    }
  }

  async run() {
    this.log(`Backup Agent - Action: ${action || 'none'}\n`);

    if (!this.prepareSSH()) {
      this.log('SSH key not found. Cannot proceed.');
      return;
    }

    // Ensure remote backup dir
    this.ssh(`mkdir -p ${config.backupDir}`);

    switch (action) {
      case 'full':
        await this.fullBackup();
        break;
      case 'code':
        await this.codeBackup();
        break;
      case 'db':
        await this.dbBackup();
        break;
      case 'list':
        await this.listBackups();
        break;
      case 'download':
        await this.downloadLatest();
        break;
      case 'cleanup':
        await this.cleanup();
        break;
      default:
        console.log('Usage: node run.js <full|code|db|list|download|cleanup>');
        console.log('  full     - Full backup (code + database)');
        console.log('  code     - Backup source code only');
        console.log('  db       - Backup database only');
        console.log('  list     - List existing backups on server');
        console.log('  download - Download latest backup to local');
        console.log('  cleanup  - Remove backups older than 30 days');
    }

    this.log(`\nDone in ${((Date.now() - this.startTime) / 1000).toFixed(1)}s`);
  }

  async fullBackup() {
    this.log('Creating full backup (code + database)...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupName = `full-backup-${timestamp}`;

    // Code backup
    this.log('Backing up code...');
    this.ssh(`cd ${config.remotePath} && tar czf ${config.backupDir}/${backupName}-code.tar.gz --exclude=node_modules --exclude=.next --exclude=dist website/ backend/ frontend/ 2>&1`);

    // DB backup
    this.log('Backing up database...');
    const dbUrl = this.ssh(`grep DATABASE_URL ${config.remotePath}/backend/.env 2>/dev/null | cut -d= -f2-`);
    if (dbUrl) {
      // Try pg_dump for PostgreSQL
      this.ssh(`pg_dump "${dbUrl}" > ${config.backupDir}/${backupName}-db.sql 2>/dev/null || echo "DB dump may have failed"`);
    } else {
      this.log('Could not find DATABASE_URL in backend .env');
    }

    // Backup env files
    this.log('Backing up environment files...');
    this.ssh(`tar czf ${config.backupDir}/${backupName}-env.tar.gz ${config.remotePath}/backend/.env ${config.remotePath}/website/.env.local 2>/dev/null || true`);

    // Backup nginx config
    this.ssh(`cp /etc/nginx/sites-available/realtypandit ${config.backupDir}/${backupName}-nginx.conf 2>/dev/null || true`);

    // Verify
    const size = this.ssh(`ls -lh ${config.backupDir}/${backupName}* 2>/dev/null`);
    this.log(`\nBackup files:\n${size}`);
  }

  async codeBackup() {
    this.log('Creating code-only backup...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.ssh(`cd ${config.remotePath} && tar czf ${config.backupDir}/code-${timestamp}.tar.gz --exclude=node_modules --exclude=.next --exclude=dist website/ backend/ frontend/`);
    this.log('Code backup created.');
  }

  async dbBackup() {
    this.log('Creating database backup...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dbUrl = this.ssh(`grep DATABASE_URL ${config.remotePath}/backend/.env 2>/dev/null | cut -d= -f2-`);
    if (dbUrl) {
      this.ssh(`pg_dump "${dbUrl}" > ${config.backupDir}/db-${timestamp}.sql 2>/dev/null`);
      this.log('Database backup created.');
    } else {
      this.log('DATABASE_URL not found.');
    }
  }

  async listBackups() {
    this.log('Backups on server:\n');
    const list = this.ssh(`ls -lhtr ${config.backupDir}/ 2>/dev/null`);
    console.log(list || 'No backups found.');

    const totalSize = this.ssh(`du -sh ${config.backupDir}/ 2>/dev/null`);
    this.log(`\nTotal size: ${totalSize}`);
  }

  async downloadLatest() {
    fs.mkdirSync(config.localBackupDir, { recursive: true });
    const latest = this.ssh(`ls -t ${config.backupDir}/*.tar.gz 2>/dev/null | head -1`);
    if (latest) {
      this.log(`Downloading: ${latest}`);
      const localFile = path.join(config.localBackupDir, path.basename(latest));
      execSync(`scp -i ${config.sshKey} -o StrictHostKeyChecking=no ${config.sshUser}@${config.serverIp}:${latest} "${localFile}"`, { stdio: 'inherit', timeout: 300000 });
      this.log(`Downloaded to: ${localFile}`);
    } else {
      this.log('No backups found on server.');
    }
  }

  async cleanup() {
    this.log('Removing backups older than 30 days...');
    const result = this.ssh(`find ${config.backupDir} -type f -mtime +30 -delete -print 2>/dev/null`);
    this.log(result || 'Nothing to clean up.');
  }
}

const agent = new BackupAgent();
agent.run().catch(e => { console.error('Backup failed:', e); process.exit(1); });
