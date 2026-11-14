const https = require('https');

https.get('https://skinssence-api.onrender.com/', (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log('Root status:', res.statusCode);
    console.log('Root body:', body);
  });
}).on('error', e => console.log('Err:', e.message));
