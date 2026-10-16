import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError
spec = importlib.util.spec_from_file_location('serve', Path(__file__).resolve().parents[1] / 'scripts/serve.py')
serve = importlib.util.module_from_spec(spec)
spec.loader.exec_module(serve)

class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / 'workspace'
        shutil.copytree(serve.ROOT, self.root)
    def tearDown(self): self.temp.cleanup()
    def test_disk_changes(self):
        path = self.root / '.agents/TASKS.yaml'
        data = json.loads(path.read_text()); data['tasks'][0]['title'] = 'Changed on disk'
        path.write_text(json.dumps(data))
        self.assertEqual(serve.snapshot(self.root)['tasks']['tasks'][0]['title'], 'Changed on disk')
    def test_missing_source(self):
        (self.root / '.agents/REVIEWS.json').unlink()
        with self.assertRaises(OSError): serve.snapshot(self.root)
    def test_invalid_source(self):
        (self.root / '.agents/TASKS.yaml').write_text('not json')
        with self.assertRaises(ValueError): serve.snapshot(self.root)
    def test_symlink(self):
        path = self.root / '.agents/AGENTS.json'; path.unlink(); path.symlink_to(serve.ROOT / '.agents/AGENTS.json')
        with self.assertRaises(ValueError): serve.snapshot(self.root)
    def test_research_excluded(self):
        self.assertFalse(any('research/' in key for key in serve.snapshot(self.root)['documents']))

class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original_root = serve.ROOT
        cls.temp = tempfile.TemporaryDirectory()
        serve.ROOT = Path(cls.temp.name) / 'workspace'
        shutil.copytree(cls.original_root, serve.ROOT)
        cls.server = serve.ThreadingHTTPServer(('127.0.0.1', 0), serve.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True); cls.thread.start()
        cls.url = 'http://127.0.0.1:' + str(cls.server.server_port)
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join()
        serve.ROOT = cls.original_root; cls.temp.cleanup()
    def test_snapshot_headers(self):
        with urlopen(self.url + '/api/snapshot') as response:
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
            self.assertIn("frame-ancestors 'none'", response.headers['Content-Security-Policy'])
            self.assertTrue(json.load(response)['tasks']['tasks'])
    def test_project_write_protocol(self):
        with urlopen(self.url + '/api/snapshot') as response: snapshot = json.load(response)
        payload = {'action':'create','name':'HTTP test project','brief':'Disposable test','expected_revision':snapshot['projects']['revision']}
        headers = {'Content-Type':'application/json', 'Origin':self.url, 'X-CADF-Token':snapshot['write_token']}
        encoded = json.dumps(payload).encode()
        with urlopen(Request(self.url + '/api/projects', data=encoded, headers=headers)) as response:
            self.assertEqual(response.status, 201)
            self.assertEqual(json.load(response)['project']['status'], 'SUBMITTED')
        with self.assertRaises(HTTPError) as caught:
            urlopen(Request(self.url + '/api/projects', data=encoded, headers=headers))
        self.assertEqual(caught.exception.code, 409)
        headers['Origin'] = 'https://evil.example'
        with self.assertRaises(HTTPError) as caught:
            urlopen(Request(self.url + '/api/projects', data=encoded, headers=headers))
        self.assertEqual(caught.exception.code, 403)

    def test_document_download(self):
        with urlopen(self.url+'/api/snapshot') as response:data=json.load(response)
        result=serve.update_project({'action':'create','name':'Export fixture','brief':'A private test project','expected_revision':data['projects']['revision']},serve.ROOT)
        path='/api/export?project='+result['project']['id']+'&format=docx'
        with urlopen(self.url+path) as response:
            self.assertIn('attachment',response.headers['Content-Disposition'])
            self.assertEqual(response.headers['Cache-Control'],'no-store')
            self.assertEqual(response.read()[:2],b'PK')
        with self.assertRaises(HTTPError) as error:urlopen(Request(self.url+path,headers={'Sec-Fetch-Site':'cross-site'}))
        self.assertEqual(error.exception.code,403)
        with self.assertRaises(HTTPError) as error:urlopen(self.url+'/api/export?project=missing')
        self.assertEqual(error.exception.code,400)

    def test_assets(self):
        for path in ['/', '/app.js', '/style.css','/glass.css','/workspace.js','/supervision.js']:
            with urlopen(self.url + path) as response: self.assertEqual(response.status, 200)
    def test_private_paths(self):
        for path in ['/.git/config', '/.agents/TASKS.yaml', '/../AGENTS.md', '/%2e%2e/.env', '/docs/research/independent/gemini/report.md']:
            with self.assertRaises(HTTPError) as caught: urlopen(self.url + path)
            self.assertEqual(caught.exception.code, 404)
    def test_host_cross_site(self):
        for headers in [{'Host':'evil.example'}, {'Sec-Fetch-Site':'cross-site'}]:
            with self.assertRaises(HTTPError) as caught: urlopen(Request(self.url + '/api/snapshot',headers=headers))
            self.assertEqual(caught.exception.code, 403)
    def test_no_mutations(self):
        with self.assertRaises(HTTPError) as caught: urlopen(Request(self.url + '/api/snapshot', data=b'{}',method='POST'))
        self.assertEqual(caught.exception.code, 403)
    def test_error_503(self):
        original = serve.ROOT
        with tempfile.TemporaryDirectory() as temp:
            try:
                serve.ROOT = Path(temp)
                with self.assertRaises(HTTPError) as caught: urlopen(self.url + '/api/snapshot')
                self.assertEqual(caught.exception.code, 503)
            finally: serve.ROOT = original

class ProjectTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / '.agents').mkdir()
        self.file = self.root / '.agents/PROJECTS.json'
        self.file.write_text(json.dumps({'revision':0,'projects':[],'events':[]}))
    def tearDown(self): self.temp.cleanup()
    def create(self):
        return serve.update_project({'action':'create','expected_revision':0,'name':'Test project','brief':'Test brief'},self.root)['project']
    def change(self, action, project):
        revision=json.loads(self.file.read_text())['revision']
        return serve.update_project({'action':action,'id':project['id'],'expected_revision':revision},self.root)['project']
    def test_lifecycle_and_audit(self):
        project=self.create()
        for action,status in [('queue','QUEUED'),('start','STARTED'),('pause','PAUSED'),('resume','STARTED'),('complete','COMPLETED'),('archive','ARCHIVED')]:
            project=self.change(action,project); self.assertEqual(project['status'],status)
        store=json.loads(self.file.read_text())
        self.assertEqual(store['revision'],7); self.assertEqual(len(store['events']),7)
        self.assertTrue(all(e['project_id']==project['id'] for e in store['events']))
    def test_stale_write_preserves_state(self):
        self.create(); before=self.file.read_bytes()
        with self.assertRaises(serve.Conflict): self.create()
        self.assertEqual(self.file.read_bytes(),before)
    def test_invalid_transition_preserves_state(self):
        project=self.create(); before=self.file.read_bytes()
        with self.assertRaises(serve.Conflict): self.change('pause',project)
        self.assertEqual(self.file.read_bytes(),before)
    def test_invalid_input(self):
        for payload in [{'name':'','brief':'x'}, {'name':'x','brief':'x','priority':'URGENT'}, {'name':'x','brief':'x'*10001}]:
            with self.assertRaises(ValueError): serve.update_project(dict(payload,action='create',expected_revision=0),self.root)
        self.assertEqual(json.loads(self.file.read_text())['revision'],0)
    def test_edit(self):
        project=self.create()
        result=serve.update_project({'action':'update','id':project['id'],'expected_revision':1,'name':'Edited','brief':'Changed','priority':'HIGH'},self.root)
        self.assertEqual(result['project']['name'],'Edited')
        self.assertEqual(result['project']['status'],'SUBMITTED')
        self.assertEqual(len(json.loads(self.file.read_text())['events']),2)
    def test_symlink_write_rejected(self):
        target=self.root/'outside.json'; self.file.rename(target); self.file.symlink_to(target)
        with self.assertRaises(ValueError): self.create()
        self.assertEqual(json.loads(target.read_text())['revision'],0)
    def test_simultaneous_stale_create(self):
        from concurrent.futures import ThreadPoolExecutor
        def run():
            try: self.create(); return 'saved'
            except serve.Conflict: return 'conflict'
        with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(lambda _:run(),range(2)))
        self.assertEqual(sorted(results),['conflict','saved'])
        self.assertEqual(len(json.loads(self.file.read_text())['projects']),1)

if __name__ == '__main__': unittest.main()
