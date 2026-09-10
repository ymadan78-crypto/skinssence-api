const db = require('../backend/db');

console.log('--- SAFELY REMOVING UNIQUE CONSTRAINT FROM patients.mobile ---');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS patients_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skinssence_id TEXT UNIQUE,
      first_name TEXT,
      last_name TEXT,
      mobile TEXT, 
      dob TEXT,
      gender TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      weight TEXT,
      emergency_mobile TEXT,
      wallet_balance REAL DEFAULT 0
    )
  `, function(err) {
    if (err) return console.error('Error creating patients_new:', err);
    console.log('1. Created patients_new table.');

    db.run(`
      INSERT INTO patients_new (id, skinssence_id, first_name, last_name, mobile, dob, gender, email, address, city, created_at, weight, emergency_mobile, wallet_balance)
      SELECT id, skinssence_id, first_name, last_name, mobile, dob, gender, email, address, city, created_at, weight, emergency_mobile, wallet_balance FROM patients
    `, function(err2) {
      if (err2) return console.error('Error copying patients:', err2);
      console.log('2. Copied all patients to patients_new. Rows:', this.changes);

      db.run(`DROP TABLE patients`, function(err3) {
        if (err3) return console.error('Error dropping old table:', err3);
        console.log('3. Dropped old patients table.');

        db.run(`ALTER TABLE patients_new RENAME TO patients`, function(err4) {
          if (err4) return console.error('Error renaming table:', err4);
          console.log('4. Renamed patients_new to patients.');
          console.log('SUCCESS: UNIQUE constraint on mobile successfully removed!');
        });
      });
    });
  });
});
