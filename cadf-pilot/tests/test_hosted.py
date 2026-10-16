import http.client
import importlib.util
from pathlib import Path
import threading
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('hosted', Path(__file__).resolve().parents[1] / 'scripts/hosted.py')
hosted = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hosted)


class AccessTests(unittest.TestCase):
    def test_signature_expiration_and_rotation(self):
        access = hosted.Access('a' * 48, lifetime=60)
        with patch.object(hosted.time, 'time', return_value=100):
            token = access.session()
        with patch.object(hosted.time, 'time', return_value=110):
            self.assertTrue(access.valid_session(token))
            self.assertFalse(access.valid_session(token + 'x'))
            self.assertFalse(hosted.Access('b' * 48).valid_session(token))
        with patch.object(hosted.time, 'time', return_value=161):
            self.assertFalse(access.valid_session(token))

    def test_throttling_and_reset(self):
        access = hosted.Access('a' * 48)
        with patch.object(hosted.time, 'monotonic', return_value=100):
            self.assertTrue(all(access.allow_attempt('peer') for _ in range(5)))
            self.assertFalse(access.allow_attempt('peer'))
        with patch.object(hosted.time, 'monotonic', return_value=161):
            self.assertTrue(access.allow_attempt('peer'))


class GatewayTests(unittest.TestCase):
    def setUp(self):
        self.server = hosted.ThreadingHTTPServer(('127.0.0.1', 0), hosted.Gateway)
        self.server.origin = 'https://cadf.example'
        self.server.access = hosted.Access('a' * 48)
        self.server.backend_port = 1
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, path, method='GET', body=None, **headers):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        connection.request(method, path, body, headers={'Host': 'cadf.example', **headers})
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_private_routes_require_authentication(self):
        for path in ['/api/snapshot', '/api/export?project=private', '/app.js', '/.agents/PROJECTS.json']:
            self.assertEqual(self.request(path)[0], 401)
        self.assertEqual(self.request('/')[0], 200)
        self.assertEqual(self.request('/', Host='evil.example')[0], 403)

    def test_login_origin_and_cookie(self):
        body = '{"key":"' + 'a' * 48 + '"}'
        self.assertEqual(self.request('/auth/login', 'POST', body)[0], 403)
        code, headers, _ = self.request('/auth/login', 'POST', body, Origin='https://cadf.example')
        self.assertEqual(code, 200)
        for flag in ['Secure', 'HttpOnly', 'SameSite=Strict']:
            self.assertIn(flag, headers['Set-Cookie'])
        cookie = headers['Set-Cookie'].split(';')[0]
        self.assertEqual(self.request('/api/snapshot', Cookie=cookie)[0], 503)
        self.assertEqual(self.request('/api/snapshot', Cookie=cookie, **{'Sec-Fetch-Site': 'cross-site'})[0], 403)
        self.assertEqual(self.request('/api/snapshot', Authorization='Bearer ' + 'b' * 48)[0], 401)
        self.assertEqual(self.request('/api/snapshot', Authorization='Bearer ' + 'a' * 48)[0], 503)
