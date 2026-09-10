
const db = require('./db');
db.serialize(() => {
  db.run('CREATE TABLE IF NOT EXISTS patient_packages (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id INTEGER, package_name TEXT, total_sessions INTEGER, sessions_used INTEGER DEFAULT 0, price_paid REAL, mode TEXT, staff_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)', (err) => { if(err) console.error('T1 Error', err); else console.log('T1 OK'); });
  db.run('ALTER TABLE wallet_transactions ADD COLUMN mode TEXT', (err) => { if(err) console.error('T2 Error', err); else console.log('T2 OK'); });
  db.run('ALTER TABLE wallet_transactions ADD COLUMN staff_id INTEGER', (err) => { if(err) console.error('T3 Error', err); else console.log('T3 OK'); });
});
