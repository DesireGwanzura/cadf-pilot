import json
from io import BytesIO
from pathlib import Path
import sys
import tempfile
import unittest
from zipfile import ZipFile
import xml.etree.ElementTree as ET
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import exports
import pm
import serve

TASKS='''| Task | Owner | Days | After | Priority |
|---|---|---|---|---|
| Collect requirements | Dana | 2 | | HIGH |
| Design the layout | Sam | 3 | 1 | NORMAL |
| Build the page | Dana | 4 | 2 | NORMAL |
- [ ] Final sign-off | Sam | 1 | after 3
'''

class WorkItemTests(unittest.TestCase):
    def test_parser_skips_headers_and_reads_dependencies(self):
        rows,_=pm.parse_work_items(TASKS)
        self.assertEqual([r['title'] for r in rows],['Collect requirements','Design the layout','Build the page','Final sign-off'])
        self.assertEqual(rows[1]['days'],3);self.assertEqual(rows[1]['depends'],['1']);self.assertEqual(rows[0]['priority'],'HIGH')
    def test_schedule_respects_dependencies_and_workdays(self):
        rows,_=pm.parse_work_items(TASKS);items=pm.rows_to_items(rows,'intake','2026-11-02T00:00:00Z')
        pm.clean_dependencies(items);pm.schedule(items,pm.parse_date('2026-11-02'))
        by={i['title']:i for i in items}
        self.assertGreater(by['Design the layout']['start_date'],by['Collect requirements']['due_date'])
        self.assertGreater(by['Final sign-off']['start_date'],by['Build the page']['due_date'])
        for item in items:
            self.assertNotIn(pm.parse_date(item['start_date']).weekday(),(5,6))
            self.assertNotIn(pm.parse_date(item['due_date']).weekday(),(5,6))
    def test_dependency_cycles_are_removed(self):
        a=pm.normalise({'id':'a','title':'A','depends_on':['b']});b=pm.normalise({'id':'b','title':'B','depends_on':['a']})
        items=[a,b];pm.clean_dependencies(items)
        self.assertFalse(a['depends_on'] and b['depends_on'])
        pm.schedule(items,pm.parse_date('2026-11-02'))

class BareHeaderTests(unittest.TestCase):
    def test_header_without_separator_line(self):
        rows,_=pm.parse_work_items('Task | Owner | Days | After | Priority\nPlan | Dana | 2 | | HIGH\nBuild | Sam | 3 | 1 | NORMAL')
        self.assertEqual([r['title'] for r in rows],['Plan','Build']);self.assertEqual(rows[1]['depends'],['1']);self.assertEqual(rows[1]['days'],3)

class HumanProjectTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);(self.root/'.agents').mkdir()
        self.file=self.root/'.agents/PROJECTS.json';self.file.write_text(json.dumps({'revision':0,'projects':[],'events':[]}))
        self.project=self.act('create',name='Website',brief='Launch the site',mode='human',start_date='2026-11-02',end_date='2026-12-18',
                              team=[{'name':'Dana','role':'Lead'},{'name':'Sam','role':'Designer'}],tasks_text=TASKS)['project']
    def tearDown(self):self.temp.cleanup()
    def store(self):return json.loads(self.file.read_text())
    def p(self):return self.store()['projects'][0]
    def act(self,action,**kw):return serve.update_project(dict(kw,action=action,id=getattr(self,'project',{}).get('id'),expected_revision=self.store()['revision']),self.root)
    def test_human_project_needs_no_model_and_generates_tickets(self):
        self.assertEqual(self.store().get('jobs',[]),[])
        self.assertEqual(self.p()['mode'],'human');self.assertEqual(len(self.p()['management']['items']),4)
        view=pm.derive(self.p());self.assertEqual(len(view['gantt']['rows']),4);self.assertEqual(view['stats']['total'],4)
    def test_ticket_lifecycle_and_atomic_validation(self):
        self.act('ticket_create',title='Extra task',owner='Sam',estimate_days=2)
        item=self.p()['management']['items'][-1]
        self.act('ticket_update',item_id=item['id'],work_status='DOING')
        before=self.store()
        with self.assertRaises(ValueError):self.act('ticket_update',item_id=item['id'],estimate_days=-3)
        self.assertEqual(before,self.store())
        self.act('ticket_delete',item_id=item['id']);self.assertEqual(len(self.p()['management']['items']),4)
    def test_all_downloads_are_valid(self):
        for fmt in exports.WORK_FORMATS:
            body,mime,name=exports.generate(self.store(),self.project['id'],'',fmt);self.assertTrue(body,fmt)
            if fmt.startswith('svg'):ET.fromstring(body)
            if fmt=='work-docx':
                with ZipFile(BytesIO(body)) as z:
                    for part in z.namelist():ET.fromstring(z.read(part))
    def test_csv_neutralises_formulas_and_html_escapes(self):
        self.act('ticket_create',title='=HYPERLINK("http://x")',owner='<b>Sam</b>')
        csv,_,_=exports.generate(self.store(),self.project['id'],'','csv');self.assertNotIn(b'\n=HYPERLINK',csv);self.assertNotIn(b',=HYPERLINK',csv)
        self.assertNotIn(b",'\n",csv);self.assertNotIn(b",',",csv)
        html,_,_=exports.generate(self.store(),self.project['id'],'','report');self.assertNotIn(b'<b>Sam</b>',html)
    def test_intake_replace_does_not_duplicate(self):
        self.act('intake_generate',tasks_text=TASKS);self.act('intake_generate',tasks_text=TASKS,replace=True)
        self.assertEqual(len(self.p()['management']['items']),4)

if __name__=='__main__':unittest.main()
