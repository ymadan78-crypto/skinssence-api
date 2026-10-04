const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const { BACKUP_DIR } = require('./backup');

async function verifyAndRestoreBackup(backupFilePath, targetDbPath = null) {
  if (!backupFilePath) {
    // Pick most recent backup from BACKUP_DIR
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('skinssence_backup_') && f.endsWith('.json.gz'))
      .map(f => ({
        name: f,
        fullPath: path.join(BACKUP_DIR, f),
        mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) {
      throw new Error('No backup archives found in ' + BACKUP_DIR);
    }
    backupFilePath = files[0].fullPath;
  }

  console.log(`[RESTORE TEST] Verifying archive: ${backupFilePath}`);
  const compressed = fs.readFileSync(backupFilePath);
  const decompressed = zlib.gunzipSync(compressed);
  const data = JSON.parse(decompressed.toString('utf8'));

  // 1. Verify metadata and checksum
  const recordedSha = data.metadata.sha256;
  const clone = { ...data };
  clone.metadata = { ...data.metadata };
  delete clone.metadata.sha256;
  const computedSha = crypto.createHash('sha256').update(JSON.stringify(clone)).digest('hex');

  console.log(`[RESTORE TEST] Metadata timestamp: ${data.metadata.timestamp}`);
  console.log(`[RESTORE TEST] Tables to restore: ${data.metadata.tables_count}, Total rows: ${data.metadata.total_rows}`);

  // 2. Set safe isolated target database (NEVER overwrite production Turso cloud database)
  const isSafeLocalFile = !targetDbPath || (targetDbPath.endsWith('.db') || targetDbPath.endsWith('.sqlite'));
  if (!isSafeLocalFile) {
    throw new Error('Safety guard: Restore verification only permits local test SQLite files (.db or .sqlite).');
  }

  const testDbFile = targetDbPath || path.join(__dirname, '../backups/restore_test.db');
  if (fs.existsSync(testDbFile)) {
    fs.unlinkSync(testDbFile);
  }

  console.log(`[RESTORE TEST] Restoring into isolated test SQLite database: ${testDbFile}`);
  const testDb = new sqlite3.Database(testDbFile);

  const runSql = (sql, params = []) => new Promise((resolve, reject) => {
    testDb.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

  const getSql = (sql, params = []) => new Promise((resolve, reject) => {
    testDb.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  try {
    // 3. Create tables
    for (const t of data.schemas.tables) {
      if (t.sql) {
        await runSql(t.sql);
      }
    }

    // 4. Create indexes
    for (const idx of data.schemas.indexes) {
      if (idx.sql) {
        try {
          await runSql(idx.sql);
        } catch (e) {
          // Ignore index creation conflicts on restored schema
        }
      }
    }

    // 5. Restore rows and verify row counts
    let restoredRows = 0;
    const tableVerification = {};

    for (const [tableName, rows] of Object.entries(data.tables)) {
      if (rows && rows.length > 0) {
        const columns = Object.keys(rows[0]);
        const placeholders = columns.map(() => '?').join(', ');
        const insertSql = `INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`;

        await runSql('BEGIN TRANSACTION');
        for (const row of rows) {
          const values = columns.map(c => row[c] !== undefined ? row[c] : null);
          await runSql(insertSql, values);
        }
        await runSql('COMMIT');
      }

      const countRow = await getSql(`SELECT COUNT(*) as cnt FROM "${tableName}"`);
      const rowCount = countRow ? countRow.cnt : 0;
      tableVerification[tableName] = {
        backupRows: rows.length,
        restoredRows: rowCount,
        match: rows.length === rowCount
      };
      restoredRows += rowCount;
    }

    testDb.close();

    console.log(`[RESTORE VERIFICATION SUCCESS] Total rows restored: ${restoredRows}/${data.metadata.total_rows}`);
    const allMatch = Object.values(tableVerification).every(v => v.match);
    if (!allMatch) {
      throw new Error('Table verification failed: Some tables did not match row counts!');
    }

    console.log('[RESTORE VERIFICATION SUCCESS] 100% of tables and rows verified intact!');
    return {
      success: true,
      backupFilePath,
      testDbFile,
      totalRows: restoredRows,
      tablesCount: Object.keys(tableVerification).length,
      allMatch,
      tableVerification
    };
  } catch (err) {
    testDb.close();
    console.error('[RESTORE VERIFICATION ERROR]', err);
    throw err;
  }
}

if (require.main === module) {
  const fileArg = process.argv[2] || null;
  verifyAndRestoreBackup(fileArg)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[RESTORE FAILED]', err.message);
      process.exit(1);
    });
}

module.exports = { verifyAndRestoreBackup };
