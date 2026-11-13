import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import serve
import providers
from orchestrator import Worker, worker_command

def printing(text):
    return lambda *a,**k:([sys.executable,'-c','print('+repr(text)+')'],{})

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
    def test_success_records_stdout_as_result(self):
        job=self.store()['jobs'][0];self.act(action='approve_job',job_id=job['id']);job=self.worker.claim()
        with patch('orchestrator.worker_command',side_effect=printing('test-process-output')):self.worker.execute(job)
        self.assertEqual(self.store()['jobs'][0]['status'],'SUCCEEDED')
        self.assertIn('test-process-output',(self.root/'.cadf-runtime/runs'/job['id']/'result.txt').read_text())
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
        with self.assertRaises(serve.Conflict):self.act(action='request_job',worker='copilot',kind='marketing')
    def test_running_cancel_request(self):
        job=self.store()['jobs'][0];self.act(action='approve_job',job_id=job['id']);job=self.worker.claim()
        self.act(action='pause');self.assertEqual(self.store()['jobs'][0]['status'],'CANCEL_REQUESTED')
        self.worker.finish(job,'SUCCEEDED')
        self.assertEqual(self.store()['jobs'][0]['status'],'PAUSED')
    def test_copilot_command_is_locked_down_and_env_is_clean(self):
        prompt="Line 1\nLine 2 with 'quotes' and $special"
        with patch.dict('os.environ',{'GOOGLE_API_KEY':'a','GEMINI_API_KEY':'b','OPENAI_API_KEY':'c','ANTHROPIC_API_KEY':'d'}),patch('providers.installed',return_value=True):
            cmd,env=worker_command('copilot',Path('.'),prompt,'gpt-6.1-sol')
        self.assertEqual(cmd[cmd.index('--model')+1],'gpt-6.1-sol')
        self.assertIn(prompt,cmd);self.assertIn('--no-ask-user',cmd)
        self.assertTrue(any(a.startswith('--excluded-tools=') and 'bash' in a for a in cmd))
        self.assertTrue(any(a.startswith('--deny-tool') for a in cmd))
        for key in ['GOOGLE_API_KEY','GEMINI_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY']:self.assertNotIn(key,env)
    def test_only_copilot_and_catalogued_models_are_accepted(self):
        with self.assertRaises(ValueError):worker_command('codex',Path('.'),'x',None)
        with self.assertRaises(ValueError):worker_command('copilot',Path('.'),'x','arbitrary-model')
        self.assertEqual(len(providers.MODELS),len(set(providers.MODELS)))
    def test_oversized_prompt_is_rejected(self):
        with patch('providers.installed',return_value=True),self.assertRaises(ValueError):
            worker_command('copilot',Path('.'),'x'*(providers.MAX_PROMPT_BYTES+1),None)
    def test_execution_result_for_copilot_job(self):
        self.act(action='cancel_job',job_id=self.store()['jobs'][0]['id'])
        self.act(action='request_job',worker='copilot',model='claude-sonnet-5.5',kind='review')
        job=next(j for j in self.store()['jobs'] if j['status']=='REQUESTED')
        self.act(action='approve_job',job_id=job['id']);claimed=self.worker.claim()
        self.assertEqual((claimed['worker'],claimed['model']),('copilot','claude-sonnet-5.5'))
        with patch('orchestrator.worker_command',side_effect=printing('Copilot review output')):self.worker.execute(claimed)
        self.assertEqual(next(j for j in self.store()['jobs'] if j['id']==job['id'])['status'],'SUCCEEDED')

if __name__=='__main__':unittest.main()
