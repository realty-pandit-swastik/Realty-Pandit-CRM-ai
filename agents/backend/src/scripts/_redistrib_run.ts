// Manual runner for the lead redistribution. `node _redistrib_run.ts` = dry-run; add `live` to distribute.
import { runDailyDistribution } from '../services/lead_redistribution';
const live = process.argv[2] === 'live';
runDailyDistribution({ dryRun: !live })
    .then((r) => { console.log(JSON.stringify(r, null, 1)); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
