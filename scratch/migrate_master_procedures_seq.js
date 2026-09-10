const db = require('../backend/db');

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) resolve({ error: err });
      else resolve({ result: this });
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function migrate() {
  console.log('--- EXECUTING SEQUENTIAL SCHEMA MIGRATION ---');

  // 1. Add columns to master_procedures
  console.log('Adding code column...');
  await runAsync("ALTER TABLE master_procedures ADD COLUMN code TEXT");

  console.log('Adding description column...');
  await runAsync("ALTER TABLE master_procedures ADD COLUMN description TEXT DEFAULT ''");

  console.log('Adding created_at column...');
  await runAsync("ALTER TABLE master_procedures ADD COLUMN created_at TEXT");

  console.log('Adding updated_at column...');
  await runAsync("ALTER TABLE master_procedures ADD COLUMN updated_at TEXT");

  // 2. Add procedure_id to procedures
  console.log('Adding procedure_id to procedures...');
  await runAsync("ALTER TABLE procedures ADD COLUMN procedure_id INTEGER");

  // 3. Add procedure_id to patient_packages
  console.log('Adding procedure_id to patient_packages...');
  await runAsync("ALTER TABLE patient_packages ADD COLUMN procedure_id INTEGER");

  // 4. Update codes
  console.log('\nAssigning P001... codes to master_procedures...');
  const rows = await allAsync("SELECT id, name, code FROM master_procedures ORDER BY id ASC");
  console.log(`Found ${rows.length} master procedures.`);

  const nowStr = new Date().toISOString();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const pCode = `P${String(i + 1).padStart(3, '0')}`;
    await runAsync(
      "UPDATE master_procedures SET code = ?, created_at = COALESCE(created_at, ?), updated_at = ? WHERE id = ?",
      [pCode, nowStr, nowStr, row.id]
    );
    console.log(`Assigned ${pCode} -> ${row.name}`);
  }

  // 5. Backfill procedures
  console.log('\n--- Backfilling procedure_id in procedures table ---');
  const masters = await allAsync("SELECT id, name FROM master_procedures");
  const masterMap = {};
  masters.forEach(m => {
    masterMap[m.name.toUpperCase().trim()] = m.id;
  });

  const procs = await allAsync("SELECT id, name, procedure_id FROM procedures WHERE procedure_id IS NULL");
  console.log(`Found ${procs.length} procedures with NULL procedure_id.`);

  for (const p of procs) {
    const upperName = (p.name || '').toUpperCase().trim();
    let matchedId = masterMap[upperName];

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
      await runAsync("UPDATE procedures SET procedure_id = ? WHERE id = ?", [matchedId, p.id]);
      console.log(`Linked procedure #${p.id} "${p.name}" -> Master ID ${matchedId}`);
    } else {
      console.log(`Could not automatically link procedure #${p.id} "${p.name}"`);
    }
  }

  // 6. Verify master_procedures
  const finalCatalog = await allAsync("SELECT id, code, name, category, active FROM master_procedures ORDER BY id ASC");
  console.log('\nFinal Master Procedures Catalog:');
  console.table(finalCatalog);

  const finalProcs = await allAsync("SELECT id, name, procedure_id, amount FROM procedures ORDER BY id DESC LIMIT 10");
  console.log('\nLatest Procedures in DB:');
  console.table(finalProcs);
}

migrate().catch(console.error);
