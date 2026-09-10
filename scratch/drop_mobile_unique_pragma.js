const db = require('../backend/db');

console.log('--- SAFELY REMOVING UNIQUE CONSTRAINT WITH PRAGMA FOREIGN_KEYS = OFF ---');

db.serialize(() => {
  db.run(`DROP TABLE IF EXISTS patients_new`, function(err) {
    if (err) return console.error('Error dropping temp table:', err);

    db.run(`PRAGMA foreign_keys = OFF`, function(errFk) {
      if (errFk) return console.error('Error disabling FKs:', errFk);
      console.log('1. Foreign keys disabled.');

      db.run(`
        CREATE TABLE patients_new (
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
      `, function(errNew) {
        if (errNew) return console.error('Error creating patients_new:', errNew);
        console.log('2. Created patients_new table.');

        db.run(`
          INSERT INTO patients_new (id, skinssence_id, first_name, last_name, mobile, dob, gender, email, address, city, created_at, weight, emergency_mobile, wallet_balance)
          SELECT id, skinssence_id, first_name, last_name, mobile, dob, gender, email, address, city, created_at, weight, emergency_mobile, wallet_balance FROM patients
        `, function(errCopy) {
          if (errCopy) return console.error('Error copying data:', errCopy);
          console.log('3. Copied data. Rows:', this.changes);

          db.run(`DROP TABLE patients`, function(errDrop) {
            if (errDrop) return console.error('Error dropping old patients:', errDrop);
            console.log('4. Dropped old patients table.');

            db.run(`ALTER TABLE patients_new RENAME TO patients`, function(errRename) {
              if (errRename) return console.error('Error renaming:', errRename);
              console.log('5. Renamed patients_new to patients.');

              db.run(`PRAGMA foreign_keys = ON`, function(errOn) {
                console.log('6. Foreign keys re-enabled.');
                console.log('SUCCESS: patients.mobile unique constraint removed!');
              });
            });
          });
        });
      });
    });
  });
});
