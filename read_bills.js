const xlsx = require('xlsx');
try {
  const workbook = xlsx.readFile('C:\\Users\\pc\\Desktop\\Upload_Bills_Here\\BILLS.xlsx');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  console.log("Found", data.length, "rows.");
  console.log("First 10 rows:");
  data.slice(0, 10).forEach(r => console.log(JSON.stringify(r)));
} catch (err) {
  console.error(err.message);
}
