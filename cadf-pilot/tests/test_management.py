import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import serve

class ManagementTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / '.agents').mkdir()
        self.path = self.root / '.agents/PROJECTS.json'
        self.path.write_text(json.dumps({'revision':0,'projects':[],'events':[]}))
        self.project = self.act('create',name='Delivery',brief='Test outcomes')['project']
    def tearDown(self): self.temp.cleanup()
    def store(self): return json.loads(self.path.read_text())
    def act(self, action, **fields):
        return serve.update_project(dict(fields,action=action,id=getattr(self,'project',{}).get('id'),expected_revision=self.store()['revision']),self.root)
    def pm(self): return self.store()['projects'][0]['management']
    def note(self, content): self.act('message',content=content,recipient='team')
    def test_batch_is_explicit_idempotent_and_retains_unlabelled(self):
        self.note('Requirement: Export reports')
        self.note('Could we discuss timing?')
        self.assertNotIn('management',self.store()['projects'][0])
        self.act('pm_collect')
        batch=self.pm()['batches'][0]
        self.assertEqual(len(batch['message_ids']),2)
        self.assertEqual(batch['proposals'][0]['category'],'requirements')
        self.assertEqual(self.pm()['versions'],[])
        with self.assertRaises(serve.Conflict): self.act('pm_collect')
        self.assertEqual(len(self.pm()['batches']),1)
    def test_immutable_versions_with_source(self):
        self.note('Requirement: Export reports');self.act('pm_collect')
        batch=self.pm()['batches'][0]['id']
        self.act('pm_version',batch_id=batch,category='requirements',content='Export PDF')
        self.act('pm_version',batch_id=batch,category='requirements',content='Export PDF and CSV')
        versions=self.pm()['versions']
        self.assertEqual([v['number'] for v in versions],[1,2])
        self.assertEqual(versions[0]['content'],'Export PDF')
        self.assertTrue(versions[0]['message_ids'])
    def test_closeout_requires_evidence_and_review(self):
        self.act('start')
        self.act('pm_item',kind='deliverable',title='Report',criteria='Reviewed PDF')
        with self.assertRaises(serve.Conflict): self.act('pm_closeout',summary='Done')
        item=self.pm()['items'][0]['id']
        with self.assertRaises(ValueError): self.act('pm_accept',item_id=item,evidence='')
        self.act('pm_accept',item_id=item,evidence='https://example.com/report.pdf')
        self.note('Decision: Accept delivered report')
        with self.assertRaises(serve.Conflict): self.act('pm_closeout',summary='Done')
        self.act('pm_collect')
        with self.assertRaises(serve.Conflict): self.act('pm_closeout',summary='Done')
        self.act('pm_reviewed',batch_id=self.pm()['batches'][0]['id'])
        self.act('pm_closeout',summary='Delivered report, no follow-up')
        self.act('complete')
        self.assertEqual(self.store()['projects'][0]['status'],'COMPLETED')
        self.assertEqual(self.store()['jobs'][0]['status'],'CANCELLED')
        with self.assertRaises(serve.Conflict): self.note('New work')
        with self.assertRaises(serve.Conflict): self.act('pm_item',kind='milestone',title='Extra',criteria='Done')
    def test_new_scope_invalidates_closeout(self):
        self.act('pm_item',kind='milestone',title='Review',criteria='Accepted')
        self.act('pm_accept',item_id=self.pm()['items'][0]['id'],evidence='Owner review')
        self.act('pm_closeout',summary='Done')
        self.note('Requirement: New scope')
        self.assertNotIn('closeout',self.pm())
    def test_revised_records_feed_future_workers(self):
        self.note('Requirement: Export reports');self.act('pm_collect')
        batch=self.pm()['batches'][0]['id']
        self.act('start')
        self.act('pm_version',batch_id=batch,category='requirements',content='Export a signed PDF')
        self.assertEqual(self.store()['jobs'][0]['status'],'CANCELLED')
        self.act('message',recipient='team',broadcast=True,content='Plan this work')
        self.assertIn('Export a signed PDF',self.store()['jobs'][-1]['prompt'])

    def test_schedule_and_acceptance_are_separate(self):
        self.act('pm_item',kind='deliverable',title='Dashboard',criteria='Owner accepts UI')
        item=self.pm()['items'][0]['id']
        self.act('pm_schedule',item_id=item,owner='Codex',work_status='DOING',priority='HIGH',due_date='2026-11-01')
        self.assertEqual(self.pm()['items'][0]['status'],'OPEN')
        self.assertEqual(self.pm()['items'][0]['work_status'],'DOING')
        with self.assertRaises(ValueError):self.act('pm_schedule',item_id=item,due_date='2026-02-31')
        with self.assertRaises(ValueError):self.act('pm_schedule',item_id=item,start_date='2026-12-01')
        self.act('pm_schedule',item_id=item,start_date='2026-10-16')
        self.assertEqual(self.pm()['items'][0]['start_date'],'2026-10-16')
        with self.assertRaises(ValueError):self.act('pm_schedule',item_id=item,work_status='DONE')
        self.act('pm_accept',item_id=item,evidence='Owner verified')
        with self.assertRaises(serve.Conflict):self.act('pm_schedule',item_id=item,owner='Other')

    def test_chat_send_queues_one_real_reply(self):
        self.note('Requirement: An accessible report')
        self.act('message',recipient='codex',content='Review this requirement')
        job=self.store()['jobs'][0]
        self.assertEqual(job['status'],'APPROVED')
        self.assertNotIn('accessible report',job['prompt'])  # Team-room text stays out of a private room.
        with self.assertRaises(serve.Conflict): self.act('message',recipient='codex',content='Again')

if __name__=='__main__': unittest.main()
