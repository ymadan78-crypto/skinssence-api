const xlsx = require('xlsx');
const db = require('./db');

try {
  const workbook = xlsx.readFile('C:\\Users\\pc\\Desktop\\Upload_Bills_Here\\BILLS.xlsx');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  console.log(`Processing ${data.length - 1} rows...`);

  // Skip the first row (gibberish header)
  const rows = data.slice(1);
  let successCount = 0;
  let failCount = 0;

  const parseDate = (val) => {
    if (!val) return new Date().toISOString().split('T')[0];
    const str = String(val).padStart(6, '0'); // e.g. "210415"
    // Assume YYMMDD
    const yy = str.substring(0, 2);
    const mm = str.substring(2, 4);
    const dd = str.substring(4, 6);
    const year = parseInt(yy) > 50 ? `19${yy}` : `20${yy}`;
    return `${year}-${mm}-${dd}`;
  };

  db.serialize(() => {
    let pending = rows.length;
    
    rows.forEach(row => {
      const brand = row[0] || 'Unknown Brand';
      const vendor = row[1] || 'Unknown Vendor';
      const dateVal = row[2];
      const amount = parseFloat(row[3]) || 0;
      const items = row[4] || '';

      if (amount === 0) {
        pending--;
        failCount++;
        return; // Skip empty amounts
      }

      const expense_date = parseDate(dateVal);
      const category = "Pharmacy Inventory";
      const finalVendor = `${vendor} (${brand})`;

      db.run(
        `INSERT INTO expenses (category, vendor, amount, expense_date, notes, staff_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [category, finalVendor, amount, expense_date, items, 1],
        (err) => {
          if (err) {
            console.error("Error inserting:", err.message);
            failCount++;
          } else {
            successCount++;
          }
          
          pending--;
          if (pending === 0) {
            console.log(`\nImport Complete!`);
            console.log(`Successfully Imported: ${successCount}`);
            console.log(`Skipped/Failed: ${failCount}`);
            process.exit(0);
          }
        }
      );
    });
  });

} catch (err) {
  console.error(err.message);
}
