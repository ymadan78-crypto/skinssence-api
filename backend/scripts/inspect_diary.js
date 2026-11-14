const fs = require('fs');

const s = fs.readFileSync('server.js', 'utf8');
const start = s.indexOf("app.get('/api/admin/diary'");
const end = s.indexOf("// --- AUDIT LOGS ---", start);
console.log('Diary endpoint span:', start, end);
fs.writeFileSync('scratch/diary_endpoint_dump.js', s.slice(start, end > 0 ? end : start + 30000));
console.log('Dumped to scratch/diary_endpoint_dump.js');
