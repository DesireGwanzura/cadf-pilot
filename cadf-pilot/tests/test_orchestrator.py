import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import serve
from orchestrator import Worker

class OrchestrationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        (self.root/'.agents').mkdir()
        self.file=self.root/'.agents/PROJECTS.json'
        self.file.write_text(json.dumps({'revision':0,'projects':[],'events':[]}))
        self.project=self.act(action='create',name='Test',brief='Disposable test')['project']
        self.act(action='start')
        self.worker=Worker(self.root)
    def tearDown(self): self.temp.cleanup()
    def store(self):return json.loads(self.file.read_text())
    def act(self,**payload):
        payload['expected_revision']=self.store()['revision']
        if hasattr(self,'project'):payload.setdefault('id',self.project['id'])
        return serve.update_project(payload,self.root)
    def test_approval_required(self):
        self.assertIsNone(self.worker.claim())
        job=self.store()['jobs'][0]
        self.act(action='approve_job',job_id=job['id'])
        self.assertEqual(self.worker.claim()['status'],'RUNNING')
        self.assertIsNone(self.worker.claim())
    def test_pause_revokes_pending_job(self):
        self.act(action='pause')
        self.assertEqual(self.store()['jobs'][0]['status'],'PAUSED')
        self.assertIsNone(self.worker.claim())
        self.act(action='resume')
        self.assertEqual(self.store()['jobs'][0]['status'],'CANCELLED')
        self.assertEqual(self.store()['jobs'][1]['status'],'REQUESTED')
    def test_success_records_real_process_result(self):
        job=self.store()['jobs'][0];self.act(action='approve_job',job_id=job['id']);job=self.worker.claim()
        def command(worker,directory,prompt):
            code="from pathlib import Path;Path('result.txt').write_text('test-process-output')"
            return [sys.executable,'-c',code],{}
        with patch('orchestrator.worker_command',side_effect=command):self.worker.execute(job)
        self.assertEqual(self.store()['jobs'][0]['status'],'SUCCEEDED')
        self.assertEqual((self.root/'.cadf-runtime/runs'/job['id']/'result.txt').read_text(),'test-process-output')
    def test_auth_failure_stops_without_retry(self):
        job=self.store()['jobs'][0];self.act(action='approve_job',job_id=job['id']);job=self.worker.claim()
        with patch('orchestrator.worker_command',side_effect=ValueError('account blocked')):self.worker.execute(job)
        saved=self.store()['jobs'][0]
        self.assertEqual(saved['status'],'FAILED');self.assertEqual(saved['attempts'],1)
        self.assertIsNone(self.worker.claim())
    def test_marketing_approval_invalidated_by_edit(self):
        payload={'action':'save_campaign','title':'Campaign','audience':'Developers','content':'Draft','channel':'LinkedIn','evidence':'Verified feature notes'}
        self.act(**payload);campaign=self.store()['campaigns'][0]
        with self.assertRaises(ValueError):self.act(action='approve_campaign',campaign_id=campaign['id'],rights_confirmed=False)
        self.act(action='approve_campaign',campaign_id=campaign['id'],rights_confirmed=True)
        self.assertEqual(self.store()['campaigns'][0]['status'],'APPROVED')
        self.act(**dict(payload,campaign_id=campaign['id'],content='Edited copy'))
        revised=self.store()['campaigns'][0]
        self.assertEqual(revised['status'],'DRAFT');self.assertNotIn('approved_at',revised)
    def test_campaign_requires_evidence(self):
        self.act(action='save_campaign',title='Campaign',audience='Readers',content='Draft',channel='Facebook')
        with self.assertRaises(ValueError):self.act(action='approve_campaign',campaign_id=self.store()['campaigns'][0]['id'],rights_confirmed=True)
    def test_no_double_pending_job(self):
        with self.assertRaises(serve.Conflict):self.act(action='request_job',worker='codex',kind='marketing')
    def test_running_cancel_request(self):
        job=self.store()['jobs'][0];self.act(action='approve_job',job_id=job['id']);job=self.worker.claim()
        self.act(action='pause');self.assertEqual(self.store()['jobs'][0]['status'],'CANCEL_REQUESTED')
        self.worker.finish(job,'SUCCEEDED')
        self.assertEqual(self.store()['jobs'][0]['status'],'PAUSED')
    def test_antigravity_command_and_env(self):
        import orchestrator
        multiline_prompt = "Line 1\nLine 2 with 'quotes' and $special\nLine 3"
        with patch.dict('os.environ', {'GOOGLE_API_KEY': 'secret', 'GEMINI_API_KEY': 'secret2', 'OPENAI_API_KEY': 'secret3'}), patch('pathlib.Path.exists',return_value=True), patch('pathlib.Path.read_text',return_value='{"useG1Credits":false}'):
            cmd, env = orchestrator.worker_command('antigravity', Path('.'), multiline_prompt)
        self.assertEqual(cmd[1:6], ['--mode', 'plan', '--sandbox', '--print-timeout', '180s'])
        self.assertEqual(cmd[6], '--print')
        self.assertEqual(cmd[7], multiline_prompt)
        for key in ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY']:
            self.assertNotIn(key, env)
    def test_antigravity_credits_guard(self):
        import orchestrator
        with patch('pathlib.Path.read_text', return_value=json.dumps({'useG1Credits': True})), patch('pathlib.Path.exists', return_value=True):
            with self.assertRaises(ValueError):
                orchestrator.worker_command('antigravity', Path('.'), 'prompt')
    def test_antigravity_restores_omitted_false_without_losing_preferences(self):
        from orchestrator import ensure_antigravity_budget
        settings = self.root / 'settings.json'
        settings.write_text(json.dumps({'theme': 'light', 'custom': {'value': 7}}))
        ensure_antigravity_budget(settings)
        self.assertEqual(json.loads(settings.read_text()),
                         {'theme': 'light', 'custom': {'value': 7}, 'useG1Credits': False})
        self.assertEqual(list(self.root.glob('.cadf-credits-*')), [])
    def test_antigravity_rejects_unsafe_or_invalid_settings_without_rewriting(self):
        from orchestrator import ensure_antigravity_budget
        settings = self.root / 'settings.json'
        for content in ['{"useG1Credits":true}', '{"useG1Credits":null}',
                        '{"useG1Credits":0}', '{"useG1Credits":"false"}', '[]', '{broken']:
            settings.write_text(content)
            with self.assertRaises(ValueError): ensure_antigravity_budget(settings)
            self.assertEqual(settings.read_text(), content)
    def test_antigravity_rejects_missing_and_symlink_settings(self):
        from orchestrator import ensure_antigravity_budget
        settings = self.root / 'settings.json'
        with self.assertRaises(ValueError): ensure_antigravity_budget(settings)
        target = self.root / 'target.json'; target.write_text('{}')
        settings.symlink_to(target)
        with self.assertRaises(ValueError): ensure_antigravity_budget(settings)
        self.assertEqual(target.read_text(), '{}')
    def test_antigravity_execution_result(self):
        job0 = self.store()['jobs'][0]
        self.act(action='cancel_job', job_id=job0['id'])
        self.act(action='request_job', worker='antigravity', kind='review')
        job1 = next(j for j in self.store()['jobs'] if j['worker'] == 'antigravity')
        self.act(action='approve_job', job_id=job1['id'])
        claimed = self.worker.claim()
        self.assertEqual(claimed['worker'], 'antigravity')
        def fake_cmd(worker, directory, prompt):
            code = "print('Antigravity review output')"
            return [sys.executable, '-c', code], {}
        with patch('orchestrator.worker_command', side_effect=fake_cmd):
            self.worker.execute(claimed)
        saved = next(j for j in self.store()['jobs'] if j['id'] == job1['id'])
        self.assertEqual(saved['status'], 'SUCCEEDED')
        result_file = self.root / '.cadf-runtime/runs' / job1['id'] / 'result.txt'
        self.assertIn('Antigravity review output', result_file.read_text())

if __name__=='__main__':unittest.main()
