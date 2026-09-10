with open('backend/server.js', 'r', encoding='utf-8') as f:
    code = f.read()

old_chunk = """    const salesQuery = `
      SELECT m.name, MAX(v.visit_date) as last_sale_date
      FROM medicines m
      JOIN visits v ON m.visit_id = v.id
      GROUP BY m.name
    `;
    
    db.all(salesQuery, [], (err, salesRows) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const salesMap = {};
      if (salesRows && salesRows.length > 0) {
        salesRows.forEach(row => {
          if (row.name) salesMap[row.name.toLowerCase().trim()] = new Date(row.last_sale_date);
        });
      }"""

new_chunk = """    const salesQuery = `
      SELECT m.details, MAX(v.visit_date) as last_sale_date
      FROM medicines m
      JOIN visits v ON m.visit_id = v.id
      GROUP BY m.details
    `;
    
    db.all(salesQuery, [], (err, salesRows) => {
      const salesMap = {};
      if (!err && salesRows && salesRows.length > 0) {
        salesRows.forEach(row => {
          if (row.details) {
            const parsed = parseMedicineDetails(row.details);
            if (parsed && parsed.name) {
              salesMap[parsed.name.toLowerCase().trim()] = new Date(row.last_sale_date);
            }
          }
        });
      }"""

if old_chunk in code:
    code = code.replace(old_chunk, new_chunk)
    with open('backend/server.js', 'w', encoding='utf-8') as f:
        f.write(code)
    print("server.js updated successfully!")
else:
    print("Error: Target chunk not found in server.js")
