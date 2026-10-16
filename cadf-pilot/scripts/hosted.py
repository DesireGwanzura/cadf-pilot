"""Private HTTPS gateway. Run behind a TLS reverse proxy on the same machine."""
import argparse
import hashlib
import hmac
import http.client
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import threading
import time
from urllib.parse import urlsplit

LOGIN = b'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CADF - Sign in</title><link rel="stylesheet" href="/login.css"><main><div class="logo">C</div><p>YOUR PRIVATE WORKSPACE</p><h1>Welcome to CADF</h1><p>Projects, conversations and your agent team. Together.</p><form><label for="key">Workspace access key</label><input id="key" type="password" autocomplete="current-password" required autofocus><button>Open workspace</button><p id="error" role="alert"></p></form><small>Your access key stays private. Ask your workspace owner if you need access.</small></main><script src="/login.js"></script></html>'''
CSS = b'''*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px -apple-system,BlinkMacSystemFont,sans-serif;color:#26233a;background:radial-gradient(at 15% 20%,#ddd4ff,transparent 60%),#f5f5fa}main{width:min(90vw,440px);padding:40px;background:#ffffffbd;backdrop-filter:blur(24px);border:1px solid #fff;border-radius:28px;box-shadow:0 24px 80px #463d7622}.logo{display:grid;place-items:center;width:48px;height:48px;border-radius:16px;background:#7052df;color:white;font-size:28px;font-weight:700}h1{font-size:30px}p,small{color:#777286;line-height:1.6}label{display:block;margin:24px 0 8px}input,button{width:100%;padding:14px;border-radius:12px;font:inherit}input{border:1px solid #d6d1e3}button{margin-top:16px;border:0;background:#7052df;color:#fff;cursor:pointer}#error{color:#a5223d}@media(prefers-color-scheme:dark){body{background:#15121f;color:#eee}main{background:#252131cc;border-color:#40364e}input{background:#191623;color:#fff;border-color:#504661}p,small{color:#b6afc5}}'''
JS = b'''document.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const b=document.querySelector('button');b.disabled=true;try{const r=await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:document.querySelector('input').value})});if(!r.ok)throw Error(r.status===429?'Please wait a minute before trying again.':'That access key was not accepted.');location.replace('/');}catch(x){document.querySelector('#error').textContent=x.message;}finally{b.disabled=false;}});'''


class Access:
    def __init__(self, key, lifetime=604800):
        if len(key) < 40:
            raise ValueError('Use a randomly generated access key of at least 40 characters')
        self.key = key.encode()
        self.lifetime = lifetime
        self.attempts = {}
        self.lock = threading.Lock()

    def valid_key(self, key):
        return isinstance(key, str) and hmac.compare_digest(self.key, key.encode())

    def session(self):
        value = str(int(time.time())) + '.' + secrets.token_hex(16)
        return value + '.' + hmac.new(self.key, value.encode(), hashlib.sha256).hexdigest()

    def valid_session(self, value):
        try:
            issued, nonce, signature = value.split('.')
            age = time.time() - int(issued)
            expected = hmac.new(self.key, (issued + '.' + nonce).encode(), hashlib.sha256).hexdigest()
            return 0 <= age < self.lifetime and hmac.compare_digest(signature, expected)
        except (ValueError, AttributeError):
            return False

    def allow_attempt(self, peer):
        with self.lock:
            now = time.monotonic()
            self.attempts = {k: v for k, v in self.attempts.items() if now - v[0] < 60}
            started, count = self.attempts.get(peer, (now, 0))
            if count >= 5 or len(self.attempts) >= 10000:
                return False
            self.attempts[peer] = (started, count + 1)
            return True


class Gateway(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Never log URLs, cookies, credentials, or request bodies.

    def reply(self, status, body=b'', mime='application/json', extra=None):
        self.send_response(status)
        for k, v in {'Content-Type': mime, 'Content-Length': str(len(body)),
                     'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
                     'Referrer-Policy': 'no-referrer',
                     'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
                     **(extra or {})}.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def authenticated(self):
        auth = self.headers.get('Authorization', '')
        if auth.startswith('Bearer ') and self.server.access.valid_key(auth[7:]):
            return True
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie', ''))
            return 'cadf_session' in cookie and self.server.access.valid_session(cookie['cadf_session'].value)
        except Exception:
            return False

    def handle_request(self):
        origin = self.server.origin
        if self.headers.get('Host') != urlsplit(origin).netloc:
            return self.reply(403, b'{"error":"Invalid host"}')
        if self.headers.get('Sec-Fetch-Site') == 'cross-site':
            return self.reply(403, b'{"error":"Cross-site request rejected"}')
        if self.command == 'POST' and self.headers.get('Origin') != origin:
            return self.reply(403, b'{"error":"Origin required"}')
        path = urlsplit(self.path).path
        if path == '/healthz' and self.command == 'GET':
            return self.reply(200, b'{"status":"ok","api_version":1}')
        body = b''
        if self.command == 'POST':
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 150000 or self.headers.get('Transfer-Encoding'):
                    raise ValueError()
                self.connection.settimeout(10)
                body = self.rfile.read(length)
                if len(body) != length:
                    raise ValueError()
            except (ValueError, TimeoutError):
                return self.reply(400, b'{"error":"Invalid request length"}')
        if path == '/auth/login' and self.command == 'POST':
            peer = self.headers.get('X-Forwarded-For', self.client_address[0]).split(',')[0].strip()
            if not self.server.access.allow_attempt(peer):
                return self.reply(429, b'{"error":"Try again later"}', extra={'Retry-After': '60'})
            try:
                key = json.loads(body).get('key')
            except (ValueError, AttributeError):
                key = None
            if not self.server.access.valid_key(key):
                return self.reply(401, b'{"error":"Access denied"}')
            cookie = 'cadf_session=' + self.server.access.session() + '; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=604800'
            return self.reply(200, b'{"authenticated":true}', extra={'Set-Cookie': cookie})
        if path == '/auth/logout' and self.command == 'POST':
            return self.reply(200, b'{}', extra={'Set-Cookie': 'cadf_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'})
        if not self.authenticated():
            public = {'/': (LOGIN, 'text/html; charset=utf-8'), '/login.css': (CSS, 'text/css'), '/login.js': (JS, 'text/javascript')}
            if self.command == 'GET' and path in public:
                return self.reply(200, *public[path])
            return self.reply(401, b'{"error":"Sign in required"}')
        # Only the existing allowlisted API/assets can pass to the loopback server.
        connection = http.client.HTTPConnection('127.0.0.1', self.server.backend_port, timeout=20)
        local = '127.0.0.1:' + str(self.server.backend_port)
        headers = {'Host': local, 'Origin': 'http://' + local,
                   'Content-Type': self.headers.get('Content-Type', 'application/json'),
                   'X-CADF-Token': self.headers.get('X-CADF-Token', '')}
        try:
            connection.request(self.command, self.path, body=body or None, headers=headers)
            response = connection.getresponse()
            data = response.read(4_000_001)
            if len(data) > 4_000_000:
                raise ValueError('Response too large')
            extra = {k: v for k, v in response.getheaders() if k.lower() in {'content-disposition', 'content-security-policy'}}
            self.reply(response.status, data, response.getheader('Content-Type', 'application/json'), extra)
        except (OSError, ValueError, http.client.HTTPException):
            self.reply(503, b'{"error":"Workspace temporarily unavailable"}')
        finally:
            connection.close()

    do_GET = handle_request
    do_POST = handle_request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', required=True)
    parser.add_argument('--key-file', type=Path, required=True)
    parser.add_argument('--port', type=int, default=8767)
    parser.add_argument('--backend-port', type=int, default=8765)
    args = parser.parse_args()
    parsed = urlsplit(args.origin)
    if parsed.scheme != 'https' or not parsed.netloc or parsed.path or parsed.query or parsed.fragment:
        parser.error('An exact HTTPS origin is required')
    if args.key_file.stat().st_mode & 0o077:
        parser.error('Key file permissions must be owner-only (0600)')
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Gateway)
    server.access = Access(args.key_file.read_text().strip())
    server.origin = args.origin
    server.backend_port = args.backend_port
    server.serve_forever()


if __name__ == '__main__':
    main()
