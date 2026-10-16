import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from io import BytesIO
from zipfile import ZipFile
import xml.etree.ElementTree as ET
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import serve
import workflow
import exports
from orchestrator import Worker

PLAN={'summary':'Prepare an evidence-labelled opportunity pack.','category':'opportunities','tasks':[
 {'id':'T1','title':'Prepare a positioning draft','owner':'codex','model':None,'kind':'draft','instructions':'Draft positioning from the brief.','deliverable':'Positioning note','acceptance':'Every claim distinguished from assumptions.','depends_on':[]},
 {'id':'T2','title':'Review the positioning','owner':'antigravity','model':'claude-sonnet-4-6','kind':'review','instructions':'Review the draft for unsupported claims.','deliverable':'Review note','acceptance':'Identify evidence gaps.','depends_on':['T1']}], 'blockers':[]}

class SupervisionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);(self.root/'.agents').mkdir();self.file=self.root/'.agents/PROJECTS.json'
        self.file.write_text(json.dumps({'revision':0,'projects':[],'events':[]}));self.project=self.act('create',name='Test opportunities',brief='Prepare a job search plan',workflow='supervised')['project'];self.worker=Worker(self.root)
    def tearDown(self):self.temp.cleanup()
    def store(self):return json.loads(self.file.read_text())
    def p(self):return self.store()['projects'][0]
    def act(self,action,**kw):return serve.update_project(dict(kw,action=action,id=getattr(self,'project',{}).get('id'),expected_revision=self.store()['revision']),self.root)
    def result(self,job,value,status='SUCCEEDED'):
        directory=self.worker.runtime/'runs'/job['id'];directory.mkdir(parents=True,exist_ok=True);(directory/'result.txt').write_text(json.dumps(value) if isinstance(value,dict) else value)
        self.worker.finish(job,status,'Quota unavailable' if status!='SUCCEEDED' else '')
    def proposed(self):
        for stage in [0,1]:
            job=self.worker.claim();self.assertEqual(job['planner_stage'],stage);self.result(job,PLAN)
        self.assertIsNone(self.worker.claim());return self.p()['coordination']['plans'][-1]
    def approved(self):
        plan=self.proposed();self.act('approve_plan',plan_id=plan['id'],digest=plan['digest']);return plan
    def test_submission_needs_only_brief_and_only_planners_start(self):
        self.assertEqual(len(self.store()['jobs']),1);self.assertEqual(self.store()['jobs'][0]['kind'],'coordinate')
        plan=self.proposed();self.assertEqual(plan['status'],'PROPOSED')
        self.assertEqual(self.p()['management']['items'],[])
        with self.assertRaises(serve.Conflict):self.act('start')
        with self.assertRaises(serve.Conflict):self.act('request_job',worker='codex',kind='plan')
    def test_legacy_controls_cannot_bypass_supervised_scope(self):
        plan=self.proposed()
        for action in ['pm_item','pm_accept','pm_collect','pm_version','pm_closeout','complete']:
            with self.assertRaises(serve.Conflict):self.act(action)
        self.act('update',name='Revised project',brief='A new objective')
        self.assertEqual(self.p()['coordination']['state'],'NEEDS_REPLAN')
        with self.assertRaises(ValueError):self.act('approve_plan',plan_id=plan['id'],digest=plan['digest'])
    def test_schedule_cannot_change_assignment_or_fake_completion(self):
        self.approved();job=self.worker.claim()
        self.result(job,{'summary':'Draft ready','artifact':'A real returned draft','issues':[]})
        item=self.p()['management']['items'][0]
        self.act('pm_schedule',item_id=item['id'],start_date='2026-10-16',due_date='2026-10-20',priority='HIGH')
        current=self.p()['management']['items'][0]
        self.assertEqual(current['work_status'],'REVIEW')
        self.assertEqual(current['status'],'OPEN')
        with self.assertRaises(serve.Conflict):self.act('pm_schedule',item_id=item['id'],owner='Other')
        with self.assertRaises(serve.Conflict):self.act('pm_schedule',item_id=item['id'],work_status='DOING')
    def test_grok_import_stays_in_private_room(self):
        self.act('grok_reply',content='Private manual handoff')
        self.assertEqual(self.store()['messages'][-1]['room'],'grok')
        self.assertNotIn('Private manual handoff',workflow.base_context(self.p(),self.store(),'team'))
        self.assertIn('Private manual handoff',workflow.base_context(self.p(),self.store(),'grok'))
    def test_exact_plan_approval_and_ordered_artifacts(self):
        plan=self.approved();job=self.worker.claim();self.assertEqual(job['task_id'],'T1')
        self.result(job,{'summary':'Draft ready','artifact':'Evidence-labelled positioning.','issues':[]})
        second=self.worker.claim();self.assertIn('Evidence-labelled positioning.',second['prompt']);self.assertEqual(second['model'],'claude-sonnet-4-6')
        self.result(second,{'summary':'Review ready','artifact':'No live vacancies were checked.','issues':[]})
        self.assertIsNone(self.worker.claim());self.assertEqual(self.p()['coordination']['state'],'AWAITING_ACCEPTANCE')
        self.act('accept_delivery',plan_id=plan['id']);self.act('close_project');self.assertEqual(self.p()['status'],'COMPLETED')
        with self.assertRaises(ValueError):self.act('prepare_plan')
    def test_stale_or_tampered_approval_is_rejected(self):
        plan=self.proposed()
        with self.assertRaises(ValueError):self.act('approve_plan',plan_id=plan['id'],digest='bad')
        with serve.project_transaction(self.root) as store:store['projects'][0]['coordination']['plans'][-1]['tasks'][0]['instructions']='Changed'
        with self.assertRaises(ValueError):self.act('approve_plan',plan_id=plan['id'],digest=plan['digest'])
    def test_scope_reply_revokes_work_and_records_provenance(self):
        plan=self.approved();job=self.worker.claim();parent=next(m for m in self.store()['messages'] if m.get('kind')=='plan')
        self.act('message',recipient='team',record_kind='requirement',reply_to=parent['id'],content='Include a CV critique.')
        self.assertEqual(self.store()['jobs'][-1]['status'],'CANCEL_REQUESTED')
        self.result(job,{'summary':'stale','artifact':'stale','issues':[]});self.assertIsNone(self.worker.claim())
        versions=self.p()['management']['versions'];record=versions[-1];self.assertEqual(record['reply_to'],parent['id'])
        self.assertIn('CV critique',(self.root/'.agents/project-records'/self.project['id']/('requirements-v'+str(record['number'])+'.md')).read_text())
    def test_planner_failure_stops_and_records_issue(self):
        self.result(self.worker.claim(),'','FAILED');self.assertIsNone(self.worker.claim());self.assertEqual(self.p()['coordination']['state'],'BLOCKED');self.assertEqual(self.p()['issues'][-1]['status'],'OPEN');self.assertEqual(self.p()['management']['versions'][-1]['category'],'blockers')
    def test_quota_failure_allows_independent_tasks_but_blocks_dependencies(self):
        proposal=copy.deepcopy(PLAN)
        independent=copy.deepcopy(proposal['tasks'][0]);independent.update(id='T3',title='Independent draft')
        proposal['tasks'].append(independent)
        for stage in [0,1]:self.result(self.worker.claim(),proposal)
        plan=self.p()['coordination']['plans'][-1]
        self.act('approve_plan',plan_id=plan['id'],digest=plan['digest'])
        self.result(self.worker.claim(),'','FAILED')
        remaining=self.worker.claim();self.assertEqual(remaining['task_id'],'T3')
        self.result(remaining,{'summary':'Independent work ready','artifact':'Returned draft','issues':[]})
        current=self.p()['coordination']['plans'][-1]
        self.assertEqual([t['status'] for t in current['tasks']],['BLOCKED','BLOCKED','DELIVERED'])
        self.assertEqual(current['status'],'BLOCKED');self.assertIsNone(self.worker.claim())
        with self.assertRaises(ValueError):self.act('accept_delivery',plan_id=plan['id'])
    def test_invalid_agent_output_does_not_start_work(self):
        self.result(self.worker.claim(),'not JSON');self.assertEqual(self.p()['coordination']['state'],'BLOCKED');self.assertIsNone(self.worker.claim())
    def test_blocker_routes_to_specific_agent_and_reply_stays_there(self):
        self.approved();job=self.worker.claim();self.result(job,{'summary':'Need a decision','artifact':'','issues':[{'kind':'blocker','scope':'individual','text':'Which audience?'}]})
        message=self.store()['messages'][-1];self.assertEqual(message['room'],'codex')
        before=self.store()
        with self.assertRaises(ValueError):self.act('message',recipient='team',record_kind='decision',reply_to=message['id'],content='Private answer')
        self.assertEqual(before,self.store());self.act('message',recipient='codex',record_kind='decision',reply_to=message['id'],content='Private audience')
        self.assertEqual(self.p()['issues'][-1]['status'],'ANSWERED')
        self.assertNotIn('Private audience',workflow.base_context(self.p(),self.store()))
        self.assertIn('Private audience',workflow.base_context(self.p(),self.store(),'codex'))
    def test_no_cross_room_history_or_records_in_prompts(self):
        self.act('cancel_job',job_id=self.store()['jobs'][0]['id'])
        self.act('message',recipient='codex',record_kind='decision',content='CODEX_SECRET')
        self.act('message',recipient='ag-sonnet',record_kind='decision',content='SONNET_SECRET')
        self.act('message',recipient='ag-opus',content='Private question')
        job=self.store()['jobs'][-1];self.assertEqual(job['model'],'claude-opus-4-6-thinking')
        self.assertNotIn('CODEX_SECRET',job['prompt']);self.assertNotIn('SONNET_SECRET',job['prompt'])
        self.act('cancel_job',job_id=job['id']);self.act('message',recipient='team',broadcast=True,content='Team question')
        group=self.store()['jobs'][-7:];self.assertEqual(len(group),7);self.assertEqual(len({j['model'] for j in group}),7)
        for j in group:self.assertEqual(j['chat_room'],'team');self.assertNotIn('SECRET',j['prompt']);self.assertNotIn('Private question',j['prompt'])
    def test_private_record_versions_do_not_merge_between_profiles(self):
        self.act('message',recipient='ag-sonnet',record_kind='decision',content='SONNET_ONLY')
        self.act('message',recipient='ag-opus',record_kind='decision',content='OPUS_ONLY')
        versions=self.p()['management']['versions'];self.assertNotIn('SONNET_ONLY',versions[-1]['content']);self.assertEqual(versions[-1]['room'],'ag-opus')
    def test_dates_and_priority_validate_atomically(self):
        self.act('project_schedule',start_date='2026-10-17',end_date='2026-10-25',priority='HIGH');before=self.store()
        with self.assertRaises(ValueError):self.act('project_schedule',end_date='2026-10-01')
        self.assertEqual(before,self.store())
    def test_pause_during_planning_prevents_call_and_resume_requires_review(self):
        self.act('pause');self.assertIsNone(self.worker.claim());self.act('resume_planning');self.assertEqual(self.p()['coordination']['state'],'PLANNING');self.assertEqual(self.store()['jobs'][-1]['kind'],'coordinate')
    def test_plan_blockers_cannot_be_approved(self):
        self.result(self.worker.claim(),PLAN);plan=copy.deepcopy(PLAN);plan['blockers']=['Needs an external connector'];self.result(self.worker.claim(),plan);p=self.p()['coordination']['plans'][-1]
        with self.assertRaises(ValueError):self.act('approve_plan',plan_id=p['id'],digest=p['digest'])
        self.assertIsNone(self.worker.claim())
    def test_marketing_draft_is_attributed_and_unpublished(self):
        self.approved();self.result(self.worker.claim(),{'summary':'Draft ready','artifact':'Draft content','issues':[],'campaigns':[{'title':'Launch draft','audience':'Developers','channel':'LinkedIn','content':'Proposed caption','evidence':''}]})
        draft=self.store()['campaigns'][0];self.assertEqual(draft['status'],'DRAFT');self.assertTrue(draft['source_job_id'])
        with self.assertRaises(ValueError):self.act('approve_campaign',campaign_id=draft['id'],rights_confirmed=True)
    def test_self_review_is_rejected(self):
        plan=copy.deepcopy(PLAN);plan['tasks'][1].update(owner='codex',model=None)
        with self.assertRaises(ValueError):workflow.validate_plan(plan)

    def test_downloads_escape_content_and_keep_source(self):
        self.act('message',recipient='team',record_kind='decision',content='<script>alert(1)</script> & test')
        record=self.p()['management']['versions'][-1]['id']
        body,mime,name=exports.generate(self.store(),self.project['id'],record,'html');self.assertNotIn(b'<script>',body);self.assertIn(b'&lt;script&gt;',body)
        body,mime,name=exports.generate(self.store(),self.project['id'],record,'docx')
        with ZipFile(BytesIO(body)) as z:
            for name in z.namelist():ET.fromstring(z.read(name))
            self.assertIn(self.p()['management']['versions'][-1]['message_ids'][0].encode(),z.read('word/document.xml'))
            self.assertIn(b'&lt;script&gt;',z.read('word/document.xml'))
        with self.assertRaises(ValueError):exports.generate(self.store(),self.project['id'],'../../secret','docx')

if __name__=='__main__':unittest.main()
