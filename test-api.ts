
import fetch from 'node-fetch';

async function test() {
  try {
    const endpoints = ['/api/health', '/api/projects'];
    for (const endpoint of endpoints) {
      const res = await fetch(`http://localhost:3000${endpoint}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
        }
      });
      console.log(`${endpoint} status:`, res.status);
      console.log(`${endpoint} content-type:`, res.headers.get('content-type'));
      const text = await res.text();
      console.log(`${endpoint} body start:`, text.substring(0, 200));
    }
  } catch (e) {
    console.error('Fetch failed:', e.message);
  }
}

test();
