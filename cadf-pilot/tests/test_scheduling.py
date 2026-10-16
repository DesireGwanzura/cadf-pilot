from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import scheduling

NOW=datetime(2026,10,16,10,0,tzinfo=timezone.utc)
class SchedulingTests(unittest.TestCase):
    def store(self):
        return {'projects':[{'id':'A','name':'First','status':'SUBMITTED','priority':'LOW'},
                            {'id':'B','name':'Second','status':'SUBMITTED','priority':'HIGH'}],
                'jobs':[{'id':'1','project_id':'A','worker':'codex','kind':'chat','status':'APPROVED','created_at':'2026-10-16T09:59:00+00:00'},
                        {'id':'2','project_id':'B','worker':'codex','kind':'chat','status':'APPROVED','created_at':'2026-10-16T09:59:30+00:00'}]}
    def test_priority_applies_to_eligible_jobs(self):
        s=self.store();self.assertEqual([j['id'] for j in scheduling.queue(s,NOW)],['2','1'])
        s['projects'][1]['status']='PAUSED';q=scheduling.queue(s,NOW)
        self.assertEqual(q[0]['id'],'1');self.assertFalse(q[1]['eligible'])
    def test_old_request_is_not_starved_by_new_high_priority_work(self):
        s=self.store();s['jobs'][0]['created_at']='2026-10-16T09:49:59+00:00'
        q=scheduling.queue(s,NOW);self.assertEqual(q[0]['id'],'1');self.assertTrue(q[0]['aged'])
    def test_scope_mismatch_and_changed_assignment_are_held(self):
        project={'id':'P','status':'STARTED','coordination':{'revision':2,'plans':[]}}
        job={'id':'J','worker':'codex','model':None,'status':'APPROVED','kind':'assigned','workflow':True,'scope_revision':1}
        self.assertIn('scope',scheduling.hold_reason(job,project))
        job.update(scope_revision=2,plan_id='PLAN',task_id='T')
        self.assertIn('approval',scheduling.hold_reason(job,project))
        task={'id':'T','status':'RUNNING','job_id':'J','owner':'codex','model':None,'depends_on':[],
              'title':'Draft','instructions':'Write a draft','deliverable':'Draft','acceptance':'Clear draft','kind':'draft'}
        plan={'id':'PLAN','status':'RUNNING','approved_at':'now','approved_by':'Owner','scope_revision':2,
              'summary':'A draft','category':'general','blockers':[],'tasks':[task]}
        digest=scheduling.workflow.plan_digest(scheduling.workflow.validate_plan(plan))
        plan.update(digest=digest,approval_digest=digest)
        project['coordination']['plans']=[plan];self.assertEqual(scheduling.hold_reason(job,project),'')
        task['owner']='antigravity';self.assertIn('assignment',scheduling.hold_reason(job,project))
        task['owner']='codex';task['depends_on']=['missing'];self.assertIn('deliverable',scheduling.hold_reason(job,project))
        task['depends_on']=[];task['instructions']='Changed after approval'
        self.assertIn('content changed',scheduling.hold_reason(job,project))
        self.assertFalse(scheduling.approval_matches(plan))
        task['instructions']='Write a draft';task['artifact']='Execution output'
        self.assertTrue(scheduling.approval_matches(plan))
    def test_readiness_explains_missing_approval_and_quota(self):
        s=self.store();health={'codex':{'status':'AVAILABLE'},'ag-gemini-low':{'status':'QUOTA_LIMITED'}}
        report=scheduling.readiness(s,{'state':'IDLE'},health)[0]
        self.assertEqual(report['state'],'blocked')
        self.assertTrue(any(c['label']=='Owner approval' and c['state']=='waiting' for c in report['checks']))
        self.assertTrue(any('quota' in c['detail'] for c in report['checks']))

if __name__=='__main__':unittest.main()
