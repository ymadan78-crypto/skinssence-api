const { createClient } = require('@libsql/client');
const client = createClient({
  url: 'libsql://skinssence-skinssence.aws-ap-south-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODc1NzI5MTMsImlkIjoiMDFhMDMzOWEtMTQwMS03OWFjLTlhNDQtY2MxNDQ5NGJjNTcyIiwia2lkIjoiR2FCTDVNaHZBYy1XRDh3SVBXbWlxcm9ZZ2ZxZmgxWGx5ajNORWpHVVc4MCIsInJpZCI6ImEwMWU3MTVhLTdiM2MtNDBiMS1iYWVlLWNjODJjMzU4MDI2NyJ9.iMhg3KM_Y-s1OyOfN5xisfSuZlE3i3dvyxjMgBC_vfwWs18Hb-btL6RSfpUQ_FvpMPnf7uDyJ3LT-CPI-7kpBQ'
});

async function run() {
  try {
    const tx = await client.transaction();
    await tx.execute('PRAGMA foreign_keys=OFF');
    await tx.execute('CREATE TABLE patients_new (id INTEGER PRIMARY KEY AUTOINCREMENT, skinssence_id TEXT UNIQUE, first_name TEXT, last_name TEXT, mobile TEXT, dob TEXT, gender TEXT, email TEXT, address TEXT, city TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, weight TEXT, emergency_mobile TEXT, wallet_balance REAL DEFAULT 0)');
    await tx.execute('INSERT INTO patients_new SELECT id, skinssence_id, first_name, last_name, mobile, dob, gender, email, address, city, created_at, weight, emergency_mobile, wallet_balance FROM patients');
    await tx.execute('DROP TABLE patients');
    await tx.execute('ALTER TABLE patients_new RENAME TO patients');
    await tx.execute('PRAGMA foreign_keys=ON');
    await tx.commit();
    console.log('Successfully removed UNIQUE constraint from mobile');
  } catch (e) {
    console.error(e);
  }
}
run();
