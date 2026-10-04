const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const db = require('../db');

const BACKUP_DIR = path.join(__dirname, '../backups');

async function performBackup(options = {}) {
  const startTime = Date.now();
  console.log('[BACKUP] Starting automated database backup...');

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // 1. Fetch all tables from sqlite_master
  const tables = await db.allAsync(`
    SELECT name, sql FROM sqlite_master 
    WHERE type='table' 
      AND name NOT LIKE 'sqlite_%' 
      AND name NOT LIKE '_test_%'
    ORDER BY name
  `);

  // 2. Fetch all indexes
  const indexes = await db.allAsync(`
    SELECT name, tbl_name, sql FROM sqlite_master 
    WHERE type='index' 
      AND sql IS NOT NULL 
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `);

  const backupData = {
    metadata: {
      app: 'Skinssence Clinic Management',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      turso_url: process.env.TURSO_DATABASE_URL ? process.env.TURSO_DATABASE_URL.replace(/:[^:@]*@/, ':***@') : 'unknown',
      tables_count: tables.length,
      indexes_count: indexes.length,
      total_rows: 0
    },
    schemas: {
      tables: tables,
      indexes: indexes
    },
    tables: {}
  };

  let totalRows = 0;

  // 3. Dump each table's data
  for (const t of tables) {
    const tableName = t.name;
    const rows = await db.allAsync(`SELECT * FROM "${tableName}"`);
    backupData.tables[tableName] = rows;
    totalRows += rows.length;
    console.log(`[BACKUP] Table "${tableName}": ${rows.length} rows backed up`);
  }

  backupData.metadata.total_rows = totalRows;

  // 4. Calculate content hash
  const jsonString = JSON.stringify(backupData);
  const hash = crypto.createHash('sha256').update(jsonString).digest('hex');
  backupData.metadata.sha256 = hash;

  // 5. Compress and write to disk
  const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `skinssence_backup_${timestampStr}.json.gz`;
  const filePath = path.join(BACKUP_DIR, filename);

  const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(backupData), 'utf8'));
  fs.writeFileSync(filePath, compressed);

  const durationMs = Date.now() - startTime;
  const fileSizeMb = (compressed.length / (1024 * 1024)).toFixed(2);
  console.log(`[BACKUP SUCCESS] Saved to ${filePath} (${fileSizeMb} MB, ${totalRows} total rows, duration: ${durationMs}ms, sha256: ${hash})`);

  // 6. Prune old backups (Retention: keep last 30 backups)
  pruneOldBackups(30);

  return {
    success: true,
    filename,
    filePath,
    fileSizeMb,
    totalRows,
    durationMs,
    sha256: hash,
    tablesCount: tables.length
  };
}

function pruneOldBackups(maxKeep = 30) {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('skinssence_backup_') && f.endsWith('.json.gz'))
      .map(f => ({
        name: f,
        fullPath: path.join(BACKUP_DIR, f),
        mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length > maxKeep) {
      const toDelete = files.slice(maxKeep);
      toDelete.forEach(file => {
        fs.unlinkSync(file.fullPath);
        console.log(`[BACKUP RETENTION] Pruned old backup: ${file.name}`);
      });
    }
  } catch (err) {
    console.error('[BACKUP RETENTION] Error pruning old backups:', err.message);
  }
}

if (require.main === module) {
  performBackup()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[BACKUP FAILED]', err);
      process.exit(1);
    });
}

module.exports = { performBackup, pruneOldBackups, BACKUP_DIR };
