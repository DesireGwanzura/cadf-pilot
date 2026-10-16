import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import availability
import serve
from orchestrator import Worker

class AvailabilityTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        (self.root/'.agents').mkdir();self.file=self.root/'.agents/PROJECTS.json'
        self.file.write_text(json.dumps({'revision':0,'projects':[],'events':[]}))
        self.project=self.act(action='create',name='Test',brief='Availability only')['project']
    def tearDown(self):self.temp.cleanup()
    def store(self):return json.loads(self.file.read_text())
    def act(self,**payload):
        payload['expected_revision']=self.store()['revision']
        if hasattr(self,'project'):payload.setdefault('id',self.project['id'])
        return serve.update_project(payload,self.root)
    def test_checks_are_bounded_and_cannot_activate_manual_grok(self):
        self.act(action='check_agents')
        jobs=self.store()['jobs'];self.assertEqual(len(jobs),8)
        self.assertTrue(all(j['kind']=='health' and j['timeout_seconds']==45 for j in jobs))
        self.assertTrue(all('Test' not in j['prompt'] for j in jobs))
        self.act(action='check_agents');self.assertEqual(len(self.store()['jobs']),8)
        with self.assertRaises(ValueError):self.act(action='check_agents',target='grok')
    def test_quota_failure_does_not_prevent_next_model(self):
        self.act(action='check_agents',target='ag-gemini-high')
        self.act(action='check_agents',target='ag-sonnet')
        worker=Worker(self.root);job=worker.claim()
        worker.finish(job,'FAILED','Provider quota exhausted')
        second=worker.claim();self.assertIsNotNone(second)
        self.assertNotEqual(job['model'],second['model'])
        worker.finish(second,'SUCCEEDED')
        statuses=availability.snapshot(self.store()['jobs'],{'state':'IDLE'})
        self.assertEqual(statuses[availability.route(job)]['status'],'QUOTA_LIMITED')
        self.assertEqual(statuses[availability.route(second)]['status'],'AVAILABLE')
        self.assertEqual(self.store()['messages'],[])
        self.assertIsNone(statuses[availability.route(job)]['quota_reset_at'])
    def test_offline_does_not_erase_last_quota_result(self):
        job={'id':'JOB-test','worker':'codex','kind':'health','status':'FAILED',
             'created_at':'2026-10-16T10:00:00Z','finished_at':'2026-10-16T10:00:01Z',
             'error':'quota limit'}
        h=availability.snapshot([job],{'state':'OFFLINE'})['codex']
        self.assertEqual(h['status'],'QUOTA_LIMITED');self.assertFalse(h['worker_online'])
    def test_credit_guard_is_not_mistaken_for_quota(self):
        self.assertEqual(availability.failure_kind('Antigravity paid-credit fallback must be disabled'),'BUDGET_BLOCKED')
        self.assertEqual(availability.failure_kind('Codex ChatGPT login required'),'AUTH_REQUIRED')
    def test_zero_exit_quota_error_is_not_a_successful_reply(self):
        self.act(action='check_agents',target='ag-sonnet');worker=Worker(self.root);job=worker.claim()
        with patch('orchestrator.worker_command',return_value=([sys.executable,'-c',"print('RESOURCE_EXHAUSTED: quota exceeded')"],{})):
            worker.execute(job)
        saved=self.store()['jobs'][0]
        self.assertEqual(saved['status'],'FAILED');self.assertEqual(saved['failure_kind'],'QUOTA_LIMITED')
        self.assertIn('dispatched_at',saved)

if __name__=='__main__':unittest.main()
