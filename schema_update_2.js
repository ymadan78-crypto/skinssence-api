
const db = require('./db');
db.serialize(() => {
  db.run('CREATE TABLE IF NOT EXISTS wallet_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id INTEGER, amount REAL, type TEXT, description TEXT, mode TEXT, staff_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)', (err) => { if(err) console.error('T1 Error', err); else console.log('T1 OK'); });
});
