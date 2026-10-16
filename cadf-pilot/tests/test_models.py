import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import serve
from orchestrator import Worker, worker_command

class ModelTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        (self.root/'.agents').mkdir();self.file=self.root/'.agents/PROJECTS.json'
        self.file.write_text(json.dumps({'revision':0,'projects':[],'events':[]}))
        self.project=self.act('create',name='Team test',brief='Disposable')['project']
        self.act('start');self.act('cancel_job',job_id=self.store()['jobs'][0]['id'])
        self.worker=Worker(self.root)
    def tearDown(self):self.temp.cleanup()
    def store(self):return json.loads(self.file.read_text())
    def act(self,action,**kw):return serve.update_project(dict(kw,action=action,id=getattr(self,'project',{}).get('id'),expected_revision=self.store()['revision']),self.root)
    def team(self):
        self.act('team_job',models=['gemini-3.8-flash-low','claude-sonnet-4-6','gpt-oss-120b-medium'])
        job=self.store()['jobs'][-1]
        self.assertIsNone(self.worker.claim())
        self.act('approve_job',job_id=job['id'])
    def test_three_stage_real_handoffs(self):
        self.team()
        def command(worker,directory,prompt,model):
            return [sys.executable,'-c','print('+repr('Output from '+model)+')'],{}
        for stage in range(3):
            job=self.worker.claim();self.assertEqual(job['team_stage'],stage)
            if stage:self.assertIn('Output from gemini-3.8-flash-low',job['prompt'])
            with patch('orchestrator.worker_command',side_effect=command):self.worker.execute(job)
        self.assertIsNone(self.worker.claim())
        self.assertEqual(len(self.store()['messages']),3)
        self.assertEqual(len([j for j in self.store()['jobs'] if j['status']=='SUCCEEDED']),3)
    def test_failure_stops_team(self):
        self.team();job=self.worker.claim()
        with patch('orchestrator.worker_command',side_effect=ValueError('Quota exhausted')):self.worker.execute(job)
        self.assertIsNone(self.worker.claim());self.assertEqual(len(self.store()['jobs']),2)
    def test_pause_stops_next_stage(self):
        self.team();job=self.worker.claim();self.act('pause');self.worker.finish(job,'SUCCEEDED')
        self.assertIsNone(self.worker.claim());self.assertEqual(len(self.store()['jobs']),2)
    def test_invalid_model_and_same_reviewer(self):
        with self.assertRaises(ValueError):self.act('request_job',worker='antigravity',model='arbitrary',kind='plan')
        with self.assertRaises(ValueError):self.act('team_job',models=['claude-sonnet-4-6']*3)
    def test_cancel_before_launch_makes_no_call(self):
        self.team();job=self.worker.claim();self.act('pause')
        with patch('orchestrator.worker_command') as command:
            self.worker.execute(job);command.assert_not_called()
        self.assertEqual(self.store()['jobs'][-1]['status'],'PAUSED')
    def test_existing_run_directory_is_recorded_failure(self):
        self.team();job=self.worker.claim()
        (self.worker.runtime/'runs'/job['id']).mkdir(parents=True)
        self.worker.execute(job)
        self.assertEqual(self.store()['jobs'][-1]['status'],'FAILED')
    def test_duplicate_finish_does_not_duplicate_handoff(self):
        self.team();job=self.worker.claim();self.worker.finish(job,'FAILED','test')
        before=self.store();self.worker.finish(job,'FAILED','again')
        self.assertEqual(self.store(),before)
    def test_grok_is_manual_only(self):
        count=len(self.store()['jobs'])
        self.act('message',recipient='grok',content='Future project note')
        self.assertEqual(len(self.store()['jobs']),count)
        self.act('grok_reply',content='Owner-pasted response')
        self.assertIn('Owner-pasted',self.store()['messages'][-1]['source'])

    def test_model_flag_and_billing_guard(self):
        settings=self.root/'.gemini/antigravity-cli/settings.json';settings.parent.mkdir(parents=True);settings.write_text('{"useG1Credits":false}')
        with patch('orchestrator.Path.home',return_value=self.root):
            command,_=worker_command('antigravity',self.root,'Hello','claude-sonnet-4-6')
            self.assertEqual(command[-2:],['--model','claude-sonnet-4-6'])
            settings.write_text('{}')
            worker_command('antigravity',self.root,'Hello','claude-sonnet-4-6')
            self.assertIs(json.loads(settings.read_text())['useG1Credits'], False)

if __name__=='__main__':unittest.main()
