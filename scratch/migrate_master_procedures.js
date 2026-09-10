const db = require('../backend/db');

console.log('--- RUNNING DATABASE MIGRATION FOR MASTER PROCEDURES ---');

db.serialize(() => {
  // 1. Add columns to master_procedures
  db.run("ALTER TABLE master_procedures ADD COLUMN code TEXT", (err) => {
    if (err && !err.message.includes('duplicate column')) console.log('code col info:', err.message);
  });
  db.run("ALTER TABLE master_procedures ADD COLUMN description TEXT DEFAULT ''", (err) => {
    if (err && !err.message.includes('duplicate column')) console.log('desc col info:', err.message);
  });
  db.run("ALTER TABLE master_procedures ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP", (err) => {
    if (err && !err.message.includes('duplicate column')) console.log('created_at col info:', err.message);
  });
  db.run("ALTER TABLE master_procedures ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP", (err) => {
    if (err && !err.message.includes('duplicate column')) console.log('updated_at col info:', err.message);
  });

  // 2. Add procedure_id to procedures
  db.run("ALTER TABLE procedures ADD COLUMN procedure_id INTEGER", (err) => {
    if (err && !err.message.includes('duplicate column')) console.log('procedure_id in procedures:', err.message);
  });

  // 3. Add procedure_id to patient_packages
  db.run("ALTER TABLE patient_packages ADD COLUMN procedure_id INTEGER", (err) => {
    if (err && !err.message.includes('duplicate column')) console.log('procedure_id in patient_packages:', err.message);
  });

  // 4. Assign sequential P-codes (P001, P002...) to all master_procedures where code is NULL or empty
  db.all("SELECT id, name, code FROM master_procedures ORDER BY id ASC", [], (err, rows) => {
    if (err) return console.error(err);
    console.log(`Found ${rows.length} master procedures to verify codes.`);
    
    let pending = rows.length;
    if (pending === 0) return;

    rows.forEach((row, index) => {
      const pCode = `P${String(index + 1).padStart(3, '0')}`;
      if (!row.code) {
        db.run("UPDATE master_procedures SET code = ? WHERE id = ?", [pCode, row.id], (upErr) => {
          if (upErr) console.error('Error updating code for', row.name, upErr.message);
          else console.log(`Assigned ${pCode} -> ${row.name}`);
          pending--;
          if (pending === 0) backfillProcedures();
        });
      } else {
        pending--;
        if (pending === 0) backfillProcedures();
      }
    });
  });

  function backfillProcedures() {
    console.log('\n--- Backfilling procedure_id in procedures table ---');
    db.all("SELECT id, name FROM master_procedures", [], (err, masters) => {
      if (err) return console.error(err);
      
      const masterMap = {};
      masters.forEach(m => {
        masterMap[m.name.toUpperCase().trim()] = m.id;
      });

      db.all("SELECT id, name, procedure_id FROM procedures WHERE procedure_id IS NULL", [], (errP, procs) => {
        if (errP) return console.error(errP);
        console.log(`Found ${procs.length} procedures with NULL procedure_id.`);

        let pCount = procs.length;
        if (pCount === 0) {
          console.log('All procedures already mapped.');
          return verifyResults();
        }

        procs.forEach(p => {
          const upperName = (p.name || '').toUpperCase().trim();
          let matchedId = masterMap[upperName];

          // Partial match heuristic for known names
          if (!matchedId) {
            if (upperName.includes('SCALP GFC PRP')) matchedId = masterMap['SCALP GFC PRP'];
            else if (upperName.includes('SCALP PRP')) matchedId = masterMap['SCALP PRP'];
            else if (upperName.includes('FACE PRP')) matchedId = masterMap['FACE PRP'];
            else if (upperName.includes('LHR')) matchedId = masterMap['LHR'];
            else if (upperName.includes('HYDRAFACIAL') || upperName.includes('HYDRA FACIAL')) matchedId = masterMap['HYDRAFACIAL'];
            else if (upperName.includes('WATERLESS')) matchedId = masterMap['WATERLESS FACIAL'];
            else if (upperName.includes('PUMPKIN')) matchedId = masterMap['PUMPKIN FACIAL'];
            else if (upperName.includes('TATTOO')) matchedId = masterMap['TATTOO REMOVAL'];
            else if (upperName.includes('RETISES')) matchedId = masterMap['RETISES CT'];
            else if (upperName.includes('AZELAIC')) matchedId = masterMap['AZELAIC M'];
            else if (upperName.includes('CONSULTATION')) matchedId = masterMap['CONSULTATION FEE'];
          }

          if (matchedId) {
            db.run("UPDATE procedures SET procedure_id = ? WHERE id = ?", [matchedId, p.id], () => {
              console.log(`Linked procedure #${p.id} "${p.name}" -> Master ID ${matchedId}`);
              pCount--;
              if (pCount === 0) verifyResults();
            });
          } else {
            console.log(`Could not automatically link procedure #${p.id} "${p.name}" (can be merged by Admin)`);
            pCount--;
            if (pCount === 0) verifyResults();
          }
        });
      });
    });
  }

  function verifyResults() {
    db.all("SELECT id, code, name, category, active FROM master_procedures ORDER BY id ASC", [], (err, rows) => {
      console.log('\nMaster Procedures Catalog:');
      console.table(rows);
    });
  }
});
