const db = require('../db');

(async () => {
  try {
    console.log('Adding clinic_daily_sessions table and session_num to payments...');

    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS clinic_daily_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_date TEXT NOT NULL,
        session_number INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'OPEN',
        opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        closed_at DATETIME,
        closed_by_id INTEGER,
        closed_by_name TEXT,
        procedure_collection REAL DEFAULT 0,
        medicine_collection REAL DEFAULT 0,
        grand_total REAL DEFAULT 0,
        reopened_at DATETIME,
        reopened_by_id INTEGER,
        reopened_by_name TEXT,
        reopen_reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_date, session_number)
      )
    `);
    console.log('clinic_daily_sessions created successfully!');

    try {
      await db.runAsync('ALTER TABLE payments ADD COLUMN session_num INTEGER DEFAULT 1');
      console.log('Added session_num to payments');
    } catch (e) {
      console.log('payments.session_num already exists or:', e.message);
    }

    const cols = await db.allAsync('PRAGMA table_info(clinic_daily_sessions)');
    console.log('clinic_daily_sessions columns:', cols.map(c => c.name));

    const payCols = await db.allAsync('PRAGMA table_info(payments)');
    console.log('payments columns:', payCols.map(c => c.name));

  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    process.exit(0);
  }
})();
