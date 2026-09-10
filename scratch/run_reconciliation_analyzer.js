const db = require('../backend/db');

console.log('--- RUNNING GENERALIZED RECONCILIATION ANALYZER ---');

db.all("SELECT * FROM legacy_patients_master", [], (err, legacyRows) => {
  if (err) return console.error(err);

  db.all("SELECT id, skinssence_id, first_name, last_name, mobile, dob FROM patients", [], (err2, activeRows) => {
    if (err2) return console.error(err2);

    const activeBySNum = new Map();
    const activeByPhoneName = new Map();

    activeRows.forEach(p => {
      if (p.skinssence_id) activeBySNum.set(p.skinssence_id.trim().toUpperCase(), p);
      if (p.mobile) {
        const key = `${p.mobile.trim()}_${(p.first_name || '').trim().toLowerCase()}`;
        activeByPhoneName.set(key, p);
      }
    });

    let reconciledCount = 0;
    let conflictSNumCount = 0;
    let unmigratedCount = 0;
    let mappedExistingCount = 0;

    const conflicts = [];
    const unmigrated = [];

    legacyRows.forEach(l => {
      const lSNum = l.legacy_s_number ? l.legacy_s_number.trim().toUpperCase() : '';
      const matchedBySNum = activeBySNum.get(lSNum);

      if (matchedBySNum) {
        // Check if name is reasonably matching
        const lFirst = (l.first_name || '').toLowerCase().trim();
        const aFirst = (matchedBySNum.first_name || '').toLowerCase().trim();
        if (lFirst && aFirst && !lFirst.includes(aFirst) && !aFirst.includes(lFirst)) {
          conflictSNumCount++;
          conflicts.push({ legacy: l, active: matchedBySNum });
        } else {
          reconciledCount++;
        }
      } else {
        // Check if matched by phone + name
        const key = `${(l.mobile || '').trim()}_${(l.first_name || '').trim().toLowerCase()}`;
        const matchedByPerson = activeByPhoneName.get(key);
        if (matchedByPerson) {
          mappedExistingCount++;
        } else {
          unmigratedCount++;
          unmigrated.push(l);
        }
      }
    });

    console.log('\n--- RECONCILIATION REPORT ---');
    console.log(`Total Master Archive Records: ${legacyRows.length}`);
    console.log(`Total Active Database Records: ${activeRows.length}`);
    console.log(`✅ Fully Reconciled Records: ${reconciledCount}`);
    console.log(`👥 Mapped Under Alternate S-Num: ${mappedExistingCount}`);
    console.log(`⚠️ S-Number Conflicts: ${conflictSNumCount}`);
    console.log(`📦 Unmigrated Legacy Records: ${unmigratedCount}`);

    // Check Shreya Shaurya (S1601)
    const shreyaLegacy = legacyRows.find(l => l.legacy_s_number === 'S1601');
    const shreyaActive = activeBySNum.get('S1601');
    console.log('\n--- KNOWN TEST CASE: SHREYA SHOURYA (S1601) ---');
    console.log('Legacy Archive Record:', shreyaLegacy);
    console.log('Active Database Record:', shreyaActive);
    console.log('Is Shreya Reconciled?:', (shreyaActive && shreyaActive.skinssence_id === 'S1601') ? '✅ YES' : '❌ NO');
  });
});
