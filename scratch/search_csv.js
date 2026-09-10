const fs = require('fs');

const masterCsv = 'backend/Patient_Registrations_2026 - MASTER.csv';

if (fs.existsSync(masterCsv)) {
  const content = fs.readFileSync(masterCsv, 'utf-8');
  const lines = content.split('\n');
  console.log(`Loaded Master CSV with ${lines.length} lines.`);
  console.log('Header line:', lines[0]);

  lines.forEach((line, idx) => {
    if (line.toLowerCase().includes('shreya') || line.toLowerCase().includes('shorya') || line.includes('1601')) {
      console.log(`Match at line ${idx + 1}: ${line}`);
    }
  });
} else {
  console.log('Master CSV not found');
}
