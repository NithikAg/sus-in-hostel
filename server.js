/*
  Sus in Hostel – game server (no packages to install)

  This server relays messages between the host device and the room devices,
  so devices can be on DIFFERENT networks (WiFi, mobile data, anywhere).

  OPTION A – put it online (recommended, gives one permanent link):
    1. Create a free account on https://render.com and a new "Web Service"
       from a GitHub repo containing server.js, package.json and sus-in-hostel.html.
    2. Build command: (leave empty)   Start command: node server.js
    3. Open the address Render gives you (https://something.onrender.com) on the host device.
       Give the join link / QR from the Devices tab to every room device.
    (Railway, Fly.io, Glitch, or any Node host work the same way.)

  OPTION B – run on your laptop and share it with a tunnel:
    1. Install Node.js (https://nodejs.org) and run:   node server.js
    2. In a second terminal run a tunnel, for example:   npx cloudflared tunnel --url http://localhost:3000
       (or: ngrok http 3000). Open the https address it prints on the host device.

  Put server.js, package.json and sus-in-hostel.html in the same folder.
*/
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const PORT = Number(process.env.PORT) || 3000;
const FILE = path.join(__dirname, 'sus-in-hostel.html');

const hostStreams = {};   // hostId -> response
const clientStreams = {}; // hostId -> { deviceId: response }

function lanIps() {
  const out = [];
  Object.values(os.networkInterfaces()).forEach(list => (list || []).forEach(i => {
    if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }));
  return out;
}
function sse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'
  });
  res.write('retry: 2000\n\n');
  const ka = setInterval(() => { try { res.write(': keepalive\n\n'); } catch (e) {} }, 15000);
  res.on('close', () => clearInterval(ka));
}
const push = (res, obj) => { try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); return true; } catch (e) { return false; } };
const json = (res, obj, code) => { res.writeHead(code || 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');

  if (u.pathname === '/ih-info') return json(res, { ih: true, ips: lanIps(), port: PORT });

  if (u.pathname === '/sse') {
    const role = u.searchParams.get('role'), id = u.searchParams.get('id') || '';
    if (!id) { res.writeHead(400); return res.end(); }
    sse(res);
    if (role === 'host') {
      if (hostStreams[id] && hostStreams[id] !== res) { try { hostStreams[id].end(); } catch (e) {} }
      hostStreams[id] = res;
      res.on('close', () => { if (hostStreams[id] === res) delete hostStreams[id]; });
    } else {
      const dev = u.searchParams.get('dev') || '';
      clientStreams[id] = clientStreams[id] || {};
      const old = clientStreams[id][dev];
      clientStreams[id][dev] = res;
      if (old && old !== res) { try { old.end(); } catch (e) {} }
      res.on('close', () => {
        if (clientStreams[id] && clientStreams[id][dev] === res) {
          delete clientStreams[id][dev];
          if (hostStreams[id]) push(hostStreams[id], { dev, msg: { t: '_close' } });
        }
      });
    }
    return;
  }

  if (u.pathname === '/send' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 65536) req.destroy(); });
    req.on('end', () => {
      let m; try { m = JSON.parse(body); } catch (e) { return json(res, { ok: false }, 400); }
      if (m.role === 'host') {
        const s = clientStreams[m.id] && clientStreams[m.id][m.to];
        return json(res, { ok: !!(s && push(s, m.msg)) });
      }
      const h = hostStreams[m.id];
      return json(res, { ok: !!(h && push(h, { dev: m.dev, msg: m.msg })) });
    });
    return;
  }

  fs.readFile(FILE, (err, data) => {
    if (err) { res.writeHead(500); return res.end('Put sus-in-hostel.html next to server.js'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  const ips = lanIps();
  console.log('\n  Sus in Hostel server is running.\n');
  console.log('  Open this on the HOST laptop:');
  (ips.length ? ips : ['localhost']).forEach(ip => console.log('    http://' + ip + ':' + PORT));
  console.log('\n  Show the QR / link from the Devices tab to the room devices.');
  console.log('  If devices cannot connect, allow Node.js through the firewall (Windows asks the first time).\n');
});
