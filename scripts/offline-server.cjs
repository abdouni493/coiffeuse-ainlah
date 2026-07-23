const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 5000;
const baseDir = path.resolve(__dirname, '..', 'dist');

const mime = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

const server = http.createServer((req, res) => {
  try {
    const reqUrl = decodeURI(req.url.split('?')[0]);
    let filePath = path.join(baseDir, reqUrl);

    if (reqUrl === '/' || reqUrl === '') {
      filePath = path.join(baseDir, 'index.html');
    }

    if (!filePath.startsWith(baseDir)) {
      res.writeHead(400);
      return res.end('Bad Request');
    }

    fs.stat(filePath, (err, stats) => {
      if (err || (stats && stats.isDirectory())) {
        // SPA fallback: serve index.html for unknown routes
        filePath = path.join(baseDir, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const type = mime[ext] || 'application/octet-stream';

      fs.readFile(filePath, (readErr, data) => {
        if (readErr) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
          return res.end('Internal Server Error');
        }

        res.writeHead(200, { 'Content-Type': type });
        res.end(data);
      });
    });
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
    res.end('Internal Server Error');
  }
});

server.listen(port, () => {
  console.log(`Offline server running at http://localhost:${port}`);
  console.log('Serving folder:', baseDir);
});
