const jwt = require('jsonwebtoken');
require('dotenv').config();

async function check() {
  const token = jwt.sign({ id: 1, username: 'admin', role: 'DOCTOR' }, process.env.JWT_SECRET || 'secret');
  const res = await fetch('https://skinssence-api.onrender.com/api/inventory', {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('HTTP Status:', res.status);
  const data = await res.json();
  console.log('Total items:', data.length);
  const withComp = data.filter(i => i.company);
  console.log('Items returning company from Render:', withComp.length);
  if (withComp.length > 0) {
    console.log('Sample item with company:', withComp[0].medicine_name, '=>', withComp[0].company);
  }
  const sample = data.find(i => i.medicine_name.toLowerCase().includes('depiscreen'));
  console.log('Depiscreen in Render response:', sample ? JSON.stringify(sample) : 'not found');
}

check().catch(console.error);
