import http from 'node:http';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const appId = 'kiyas-local';
const healthPath = '/__kiyas_health';
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const distPath = path.resolve(projectRoot, 'dist');
const requestedPort = process.env.PORT ?? '4173';

if (!/^\d+$/.test(requestedPort) || Number(requestedPort) < 1 || Number(requestedPort) > 65535) {
  console.error('PORT, 1 ile 65535 arasında bir sayı olmalıdır. Varsayılan port: 4173.');
  process.exit(1);
}

const port = Number(requestedPort);
const origin = `http://127.0.0.1:${port}`;
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

let distRoot;
try {
  distRoot = await realpath(distPath);
  if (!(await stat(path.join(distRoot, 'index.html'))).isFile()) throw new Error('index.html eksik');
} catch {
  console.error('Uygulamanın derlenmiş dosyaları bulunamadı.');
  console.error('Proje klasöründe önce npm.cmd install, ardından npm.cmd run build çalıştırın.');
  console.error('Windows üzerinde Baslat.cmd dosyası bu hazırlığı otomatik yapar.');
  process.exit(1);
}

function isInsideDist(filePath) {
  const relative = path.relative(distRoot, filePath);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function respond(response, status, message, method) {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(method === 'HEAD' ? undefined : message);
}

const server = http.createServer(async (request, response) => {
  const method = request.method;
  if (method !== 'GET' && method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    respond(response, 405, 'Yalnızca GET ve HEAD desteklenir.', method);
    return;
  }

  let pathname;
  try {
    // Decode before validating: URL normalization must not hide encoded traversal.
    pathname = decodeURIComponent((request.url ?? '/').split(/[?#]/, 1)[0]);
  } catch {
    respond(response, 400, 'Geçersiz adres.', method);
    return;
  }
  if (!pathname.startsWith('/') || /[\\\x00-\x1f\x7f]/.test(pathname)
    || pathname.split('/').some((segment) => segment === '..')) {
    respond(response, 403, 'Bu dosyaya erişilemiyor.', method);
    return;
  }

  if (pathname === healthPath) {
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(method === 'HEAD' ? undefined : JSON.stringify({ app: appId, version: 1 }));
    return;
  }

  const candidate = path.resolve(distRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!isInsideDist(candidate)) {
    respond(response, 403, 'Bu dosyaya erişilemiyor.', method);
    return;
  }

  try {
    // Also check the real path so a symlink inside dist cannot expose other files.
    const filePath = await realpath(candidate);
    if (!isInsideDist(filePath)) {
      respond(response, 403, 'Bu dosyaya erişilemiyor.', method);
      return;
    }
    const file = await stat(filePath);
    if (!file.isFile()) {
      respond(response, 404, 'Dosya bulunamadı.', method);
      return;
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': file.size,
      'Cache-Control': path.extname(filePath) === '.html' ? 'no-store' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (method === 'HEAD') {
      response.end();
      return;
    }
    const stream = createReadStream(filePath);
    stream.on('error', () => response.destroy());
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  } catch {
    respond(response, 404, 'Dosya bulunamadı.', method);
  }
});

function openBrowser() {
  if (process.env.KIYAS_NO_OPEN === '1') return;
  const command = process.platform === 'win32' ? 'rundll32.exe'
    : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', origin] : [origin];
  const browser = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  browser.on('error', () => console.log(`Tarayıcı otomatik açılamadı. Bu adresi açın: ${origin}`));
  browser.unref();
}

function hasRunningInstance() {
  return new Promise((resolve) => {
    const request = http.get(`${origin}${healthPath}`, { timeout: 1500 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
        if (body.length > 1024) request.destroy();
      });
      response.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve(response.statusCode === 200 && result.app === appId && result.version === 1);
        } catch {
          resolve(false);
        }
      });
      response.on('error', () => resolve(false));
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

server.on('error', async (error) => {
  if (error.code === 'EADDRINUSE' && await hasRunningInstance()) {
    console.log(`Kıyas zaten çalışıyor: ${origin}`);
    openBrowser();
    return;
  }
  if (error.code === 'EADDRINUSE') {
    console.error(`${port} numaralı portu başka bir uygulama kullanıyor.`);
    console.error('Bu uygulamayı kapatıp yeniden deneyin. Kıyas, taslaklar aynı adreste kalsın diye portu otomatik değiştirmez.');
  } else {
    console.error(`Kıyas başlatılamadı: ${error.message}`);
  }
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Kıyas hazır: ${origin}`);
  console.log('Bu pencere açık kaldığı sürece uygulama çalışır. Durdurmak için Ctrl+C kullanın.');
  openBrowser();
});
