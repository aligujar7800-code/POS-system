import http from 'http';
import fs from 'fs';

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/inspect') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      console.log(`Received file of size: ${buffer.length} bytes`);
      fs.writeFileSync('debug_audio.bin', buffer);
      console.log('Hex dump of first 64 bytes:');
      console.log(buffer.subarray(0, 64).toString('hex'));
      res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
      res.end('OK');
    });
  } else if (req.method === 'OPTIONS') {
    res.writeHead(200, { 
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    });
    res.end();
  }
});
server.listen(8001, () => console.log('Inspector listening on 8001'));
