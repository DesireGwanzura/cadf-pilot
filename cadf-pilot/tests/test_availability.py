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
    def health_jobs(self):return [j for j in self.store()['jobs'] if j['kind']=='health']
    def test_checks_are_bounded_and_unknown_routes_rejected(self):
        self.act(action='check_agents')
        jobs=self.health_jobs();self.assertEqual(len(jobs),6)
        self.assertTrue(all(j['worker']=='copilot' and j['timeout_seconds']<=60 for j in jobs))
        self.assertTrue(all('Test' not in j['prompt'] for j in jobs))
        self.act(action='check_agents');self.assertEqual(len(self.health_jobs()),6)
        with self.assertRaises(ValueError):self.act(action='check_agents',target='grok')
    def test_any_catalogued_model_can_be_checked(self):
        self.act(action='check_agents',target='cp-kimi-k3')
        self.assertEqual(self.health_jobs()[-1]['model'],'kimi-k3')
    def test_quota_failure_does_not_prevent_next_model(self):
        self.act(action='check_agents',target='cp-grok-4.7')
        self.act(action='check_agents',target='cp-kimi-k3')
        worker=Worker(self.root);job=worker.claim()
        worker.finish(job,'FAILED','Provider quota exhausted')
        second=worker.claim();self.assertIsNotNone(second)
        self.assertNotEqual(job['model'],second['model'])
        worker.finish(second,'SUCCEEDED')
        statuses=availability.snapshot(self.store()['jobs'],{'state':'IDLE'})
        self.assertEqual(statuses[availability.route(job)]['status'],'QUOTA_LIMITED')
        self.assertEqual(statuses[availability.route(second)]['status'],'AVAILABLE')
        self.assertEqual(self.store()['messages'],[])
    def test_offline_does_not_erase_last_quota_result(self):
        job={'id':'JOB-test','worker':'copilot','model':'gpt-6.1-sol','kind':'health','status':'FAILED',
             'created_at':'2026-10-16T10:00:00Z','finished_at':'2026-10-16T10:00:01Z','error':'quota limit'}
        h=availability.snapshot([job],{'state':'OFFLINE'})['cp-gpt-6.1-sol']
        self.assertEqual(h['status'],'QUOTA_LIMITED');self.assertFalse(h['worker_online'])
    def test_failure_kinds(self):
        self.assertEqual(availability.failure_kind('Copilot premium request limit reached'),'QUOTA_LIMITED')
        self.assertEqual(availability.failure_kind('Please run copilot login to sign in'),'AUTH_REQUIRED')
    def test_zero_exit_quota_error_is_not_a_successful_reply(self):
        self.act(action='check_agents',target='cp-kimi-k3');worker=Worker(self.root);job=worker.claim()
        with patch('orchestrator.worker_command',return_value=([sys.executable,'-c',"print('RESOURCE_EXHAUSTED: quota exceeded')"],{})):
            worker.execute(job)
        saved=next(j for j in self.store()['jobs'] if j['id']==job['id'])
        self.assertEqual(saved['status'],'FAILED');self.assertEqual(saved['failure_kind'],'QUOTA_LIMITED')

if __name__=='__main__':unittest.main()
