import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import serve
import runner_bridge


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / '.agents').mkdir()
        self.path = self.root / '.agents/PROJECTS.json'
        self.path.write_text(json.dumps({'revision': 0, 'projects': [], 'events': []}))
        self.project = self.act(action='create', name='Runner test', brief='Isolated fixture')['project']
        self.act(action='start')

    def tearDown(self):
        self.temp.cleanup()

    def store(self):
        return json.loads(self.path.read_text())

    def act(self, **payload):
        payload['expected_revision'] = self.store()['revision']
        if hasattr(self, 'project'):
            payload['id'] = self.project['id']
        return serve.update_project(payload, self.root)

    def claim(self):
        job = self.store()['jobs'][0]
        self.act(action='approve_job', job_id=job['id'])
        return runner_bridge.handle({'action': 'claim'}, self.root)['job']

    def test_approval_single_claim_and_lease_authentication(self):
        self.assertIsNone(runner_bridge.handle({'action': 'claim'}, self.root)['job'])
        job = self.claim()
        self.assertIsNone(runner_bridge.handle({'action': 'claim'}, self.root)['job'])
        with self.assertRaises(ValueError):
            runner_bridge.handle({'action': 'context', 'job_id': job['id'], 'lease': 'wrong'}, self.root)

    def test_result_is_idempotent_and_pause_wins(self):
        job = self.claim()
        self.act(action='pause')
        payload = {'action': 'finish', 'job_id': job['id'], 'lease': job['runner_lease'], 'status': 'SUCCEEDED', 'result': 'fixture'}
        runner_bridge.handle(payload, self.root)
        revision = self.store()['revision']
        runner_bridge.handle(payload, self.root)
        self.assertEqual(self.store()['revision'], revision)
        self.assertEqual(self.store()['jobs'][0]['status'], 'PAUSED')

    def test_expired_lease_does_not_retry(self):
        job = self.claim()
        with patch.object(runner_bridge.time, 'time', return_value=job['lease_at'] + 91):
            self.assertIsNone(runner_bridge.handle({'action': 'claim'}, self.root)['job'])
        self.assertEqual(self.store()['jobs'][0]['status'], 'INTERRUPTED')
        self.assertEqual(self.store()['jobs'][0]['attempts'], 1)
