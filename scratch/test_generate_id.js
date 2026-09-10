const db = require('../backend/db');

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
};

generateNextId((nextId) => {
  console.log('Next Generated S-Number:', nextId);
});
