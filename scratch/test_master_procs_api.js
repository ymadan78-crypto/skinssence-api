const jwt = require('../backend/node_modules/jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_for_local_testing';
const doctorToken = jwt.sign({ id: 1, username: 'admin', role: 'DOCTOR', name: 'Dr. Ashima' }, JWT_SECRET, { expiresIn: '7d' });

async function runApiTests() {
  console.log('--- TESTING MASTER PROCEDURES API & SIMILARITY ENGINE ---\n');

  // 1. GET Master Procedures
  console.log('>>> 1. Fetching master procedures with dynamic reference prices:');
  const getRes = await fetch('http://localhost:3000/api/procedures/master', {
    headers: { Authorization: `Bearer ${doctorToken}` }
  });
  const list = await getRes.json();
  console.log(`Received ${list.length} active master procedures.`);
  console.log('Sample item:', list[0]);

  // 2. Test Exact Duplicate Check (e.g. "hydrafacial" or "HYDRA FACIAL")
  console.log('\n>>> 2. Testing Exact Duplicate Detection:');
  const dupRes = await fetch('http://localhost:3000/api/procedures/master', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${doctorToken}` },
    body: JSON.stringify({ name: 'hydrafacial', category: 'Facial' })
  });
  console.log('Exact duplicate status:', dupRes.status);
  const dupData = await dupRes.json();
  console.log('Response:', dupData);

  // 3. Test Fuzzy Similarity Warning (e.g. "Carbon Facial" vs "Carbon Laser Facial" or "Hydra-Facial Glow")
  console.log('\n>>> 3. Testing Fuzzy Similarity Warning Prompt:');
  const simRes = await fetch('http://localhost:3000/api/procedures/master', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${doctorToken}` },
    body: JSON.stringify({ name: 'Hydra Facial Glow', category: 'Facial' })
  });
  console.log('Similar warning status:', simRes.status);
  const simData = await simRes.json();
  console.log('Response:', simData);

  // 4. Test Confirmed Creation with force_create = true
  console.log('\n>>> 4. Testing Confirmed Creation with force_create = true:');
  const addRes = await fetch('http://localhost:3000/api/procedures/master', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${doctorToken}` },
    body: JSON.stringify({ name: 'Korean Glass Skin Facial', category: 'Facial', description: 'Deep hydration glass skin protocol', force_create: true })
  });
  console.log('Add status:', addRes.status);
  const addData = await addRes.json();
  console.log('Response:', addData);
  const newProcId = addData.procedure ? addData.procedure.id : null;

  if (newProcId) {
    // 5. Test Merge API (e.g. merge Korean Glass Skin Facial into Hydrafacial P003)
    console.log('\n>>> 5. Testing Merge API:');
    const mergeRes = await fetch('http://localhost:3000/api/procedures/master/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${doctorToken}` },
      body: JSON.stringify({ source_id: newProcId, target_id: 3 })
    });
    console.log('Merge status:', mergeRes.status);
    const mergeData = await mergeRes.json();
    console.log('Response:', mergeData);
  }

  // 6. Test Reports Grouping by Master Procedure ID
  console.log('\n>>> 6. Testing GET /api/reports/procedures Grouped by Master Procedure ID:');
  const repRes = await fetch('http://localhost:3000/api/reports/procedures', {
    headers: { Authorization: `Bearer ${doctorToken}` }
  });
  const repList = await repRes.json();
  console.log(`Reports returned ${repList.length} aggregated procedure rows:`);
  console.table(repList.slice(0, 5));
}

runApiTests().catch(console.error);
