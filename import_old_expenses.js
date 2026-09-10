const xlsx = require('xlsx');
const db = require('./db');
const wb = xlsx.readFile('C:/Users/pc/Desktop/Upload_Bills_Here/BILLS.xlsx');
const sheet = wb.Sheets[wb.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(sheet, {header: 1});
let pending = 0; let imported = 0;
data.forEach((row, index) => {
  if (index === 0 || !row[3]) return;
  const vendor = ((row[1] || '') + ' ' + (row[0] || '')).trim();
  const rawDate = String(row[2]).padStart(6, '0');
  const expense_date = '20' + rawDate.substring(0,2) + '-' + rawDate.substring(2,4) + '-' + rawDate.substring(4,6);
  const amount = parseFloat(row[3]);
  const notes = row[4] || '';
  pending++;
  db.run('INSERT INTO expenses (category, vendor, amount, expense_date, notes) VALUES (?, ?, ?, ?, ?)', ['PHARMACY_STOCK', vendor, amount, expense_date, notes], (err) => {
    if (!err) imported++;
    pending--;
    if (pending === 0) { console.log('Imported ' + imported + ' expenses!'); process.exit(0); }
  });
});
