with open('backend/server.js', 'r', encoding='utf-8') as f:
    code = f.read()

old_func = """const generateNextId = (callback) => {
  db.get("SELECT skinssence_id FROM patients WHERE skinssence_id LIKE 'S%' ORDER BY CAST(SUBSTR(skinssence_id, 2) AS INTEGER) DESC LIMIT 1", (err, row) => {
    if (err || !row || !row.skinssence_id) {
      callback('S3070'); // Default starting ID
    } else {
      const match = row.skinssence_id.match(/\\d+/);
      if (match) {
        const nextNum = parseInt(match[0], 10) + 1;
        callback(`S${nextNum}`);
      } else {
        callback('S3070');
      }
    }
  });
};"""

new_func = """const generateNextId = (callback) => {
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

if old_func in code:
    code = code.replace(old_func, new_func)
    print("generateNextId successfully replaced!")
else:
    print("Warning: old_func pattern not matched!")

with open('backend/server.js', 'w', encoding='utf-8') as f:
    f.write(code)
