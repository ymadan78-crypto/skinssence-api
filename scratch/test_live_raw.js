async function testLiveRaw() {
  const res = await fetch('https://skinssence-api.onrender.com/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'password123' })
  });
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Body preview:', text.substring(0, 300));
}

testLiveRaw();
