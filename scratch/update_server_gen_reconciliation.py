with open('backend/server.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update generateNextId to check both active patients and legacy_patients_master
old_gen_id = """// Helper: Generate next Skinssence ID (e.g. 3000-36 -> 3000-37)
const generateNextId = (callback) => {
  db.get("SELECT skinssence_id FROM patients WHERE skinssence_id LIKE 'S%' ORDER BY CAST(SUBSTR(skinssence_id, 2) AS INTEGER) DESC LIMIT 1", (err, row) => {
    if (err || !row || !row.skinssence_id) {
      callback('S3070'); // Default starting ID
    } else {
      const match = row.skinssence_id.match(/S(\d+)/);
      if (match) {
        const nextNum = parseInt(match[1], 10) + 1;
        callback(`S${nextNum}`);
      } else {
        callback('S3070');
      }
    }
  });
};"""

new_gen_id = """// Helper: Generate next Skinssence ID guaranteed never to collide with active or legacy S-numbers
const generateNextId = (callback) => {
  db.get(`
    SELECT MAX(num) as max_num FROM (
      SELECT CAST(SUBSTR(skinssence_id, 2) AS INTEGER) as num FROM patients WHERE skinssence_id LIKE 'S%'
      UNION
      SELECT CAST(SUBSTR(legacy_s_number, 2) AS INTEGER) as num FROM legacy_patients_master WHERE legacy_s_number LIKE 'S%'
    )
  `, (err, row) => {
    const maxNum = (row && row.max_num) ? row.max_num : 3107;
    callback(`S${maxNum + 1}`);
  });
};"""

if old_gen_id in code:
    code = code.replace(old_gen_id, new_gen_id)
    print("Updated generateNextId!")
else:
    print("Warning: old_gen_id pattern not matched!")

# 2. Add GET /api/admin/reconciliation/status
reconciliation_endpoints = """
// --- GENERALIZED LEGACY RECONCILIATION ENDPOINTS ---
app.get('/api/admin/reconciliation/status', authenticateToken, (req, res) => {
  if (req.user.role.toUpperCase() !== 'ADMIN' && req.user.role.toUpperCase() !== 'DOCTOR') {
    return res.status(403).json({ error: 'Access denied' });
  }

  db.all("SELECT * FROM legacy_patients_master", [], (errL, legacyRows) => {
    if (errL) return res.status(500).json({ error: errL.message });

    db.all("SELECT id, skinssence_id, first_name, last_name, mobile, dob FROM patients", [], (errP, activeRows) => {
      if (errP) return res.status(500).json({ error: errP.message });

      const activeBySNum = new Map();
      activeRows.forEach(p => {
        if (p.skinssence_id) activeBySNum.set(p.skinssence_id.trim().toUpperCase(), p);
      });

      let reconciled = 0;
      let unmigrated = 0;
      const unmigratedList = [];

      (legacyRows || []).forEach(l => {
        const sNum = l.legacy_s_number ? l.legacy_s_number.trim().toUpperCase() : '';
        if (activeBySNum.has(sNum)) {
          reconciled++;
        } else {
          unmigrated++;
          unmigratedList.push(l);
        }
      });

      res.json({
        total_legacy_records: (legacyRows || []).length,
        total_active_patients: (activeRows || []).length,
        reconciled_count: reconciled,
        unmigrated_count: unmigrated,
        unmigrated_records: unmigratedList.slice(0, 50)
      });
    });
  });
});
"""

code += reconciliation_endpoints

with open('backend/server.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("server.js updated with generalized reconciliation status endpoint!")
