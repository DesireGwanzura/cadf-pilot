'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const WorkUI = require('../web/work.js');

test('parseIso accepts only YYYY-MM-DD', () => {
  assert.equal(WorkUI.parseIso('2026-01-02'), Date.UTC(2026, 0, 2));
  assert.equal(WorkUI.parseIso('2026-1-2'), null);
  assert.equal(WorkUI.parseIso(''), null);
  assert.equal(WorkUI.parseIso(undefined), null);
});

test('todayIso uses local calendar date', () => {
  assert.equal(WorkUI.todayIso(new Date(2026, 2, 5, 23, 59)), '2026-03-05');
});

test('laneFor maps display state and falls back to TODO', () => {
  assert.equal(WorkUI.laneFor({ state: 'DOING' }), 'DOING');
  assert.equal(WorkUI.laneFor({ state: 'DONE' }), 'DONE');
  assert.equal(WorkUI.laneFor({ state: 'weird' }), 'TODO');
  assert.equal(WorkUI.laneFor({}), 'TODO');
});

test('lanesWithItems resolves ids and drops unknown ones', () => {
  const work = {
    items: [{ id: 'a' }, { id: 'b' }],
    kanban: [
      { state: 'TODO', label: 'To do', items: ['a', 'zzz'] },
      { state: 'DONE', items: ['b'] }
    ]
  };
  const lanes = WorkUI.lanesWithItems(work);
  assert.deepEqual(lanes[0].items.map(i => i.id), ['a']);
  assert.equal(lanes[1].label, 'Done');
  assert.deepEqual(WorkUI.lanesWithItems(null), []);
});

test('sortItems is stable and puts empty dates last in both directions', () => {
  const items = [
    { id: 1, due_date: '' },
    { id: 2, due_date: '2026-02-01' },
    { id: 3, due_date: '2026-01-01' }
  ];
  assert.deepEqual(WorkUI.sortItems(items, 'due_date', 1).map(i => i.id), [3, 2, 1]);
  assert.deepEqual(WorkUI.sortItems(items, 'due_date', -1).map(i => i.id), [2, 3, 1]);
  const priorities = [{ id: 1, priority: 'LOW' }, { id: 2, priority: 'HIGH' }];
  assert.deepEqual(WorkUI.sortItems(priorities, 'priority').map(i => i.id), [2, 1]);
});

test('ganttLayout places bars, links, and the today marker', () => {
  const gantt = {
    rows: [
      { id: 'a', title: 'A', start: '2026-01-01', due: '2026-01-02', state: 'DONE', depends_on: [] },
      { id: 'b', title: 'B', start: '2026-01-03', due: '2026-01-04', state: 'DOING', depends_on: ['a'] },
      { id: 'c', title: 'C', start: '', due: '', state: 'TODO', depends_on: [] }
    ]
  };
  const layout = WorkUI.ganttLayout(gantt, { today: '2026-01-03', labelWidth: 100, chartWidth: 400 });
  assert.equal(layout.days, 4);
  assert.equal(layout.bars.length, 2);
  assert.equal(layout.bars[0].x, 100);
  assert.equal(layout.bars[0].width, 200);
  assert.equal(layout.bars[1].x, 300);
  assert.equal(layout.links.length, 1);
  assert.equal(layout.links[0].from, 'a');
  assert.equal(layout.todayX, 350);
  assert.equal(WorkUI.ganttLayout({ rows: [] }, { today: '2026-01-03' }).bars.length, 0);
});

test('ganttLayout flags overdue unfinished bars and hides an outside today', () => {
  const gantt = {
    rows: [
      { id: 'a', start: '2026-01-01', due: '2026-01-02', state: 'DOING' },
      { id: 'b', start: '2026-01-01', due: '2026-01-02', state: 'DONE' }
    ]
  };
  const layout = WorkUI.ganttLayout(gantt, { today: '2026-02-01' });
  assert.equal(layout.bars[0].overdue, true);
  assert.equal(layout.bars[1].overdue, false);
  assert.equal(layout.todayX, null);
});

test('burndownPaths breaks the actual line at null values', () => {
  const points = [
    { date: '2026-01-01', ideal: 4, actual: 4 },
    { date: '2026-01-02', ideal: 2, actual: 3 },
    { date: '2026-01-03', ideal: 0, actual: null }
  ];
  const paths = WorkUI.burndownPaths(points);
  assert.equal(paths.max, 4);
  assert.equal(paths.count, 3);
  assert.equal((paths.ideal.match(/L/g) || []).length, 2);
  assert.equal((paths.actual.match(/L/g) || []).length, 1);
  assert.deepEqual(WorkUI.burndownPaths([]).xs, []);
});

test('donutSegments accumulate shares to 100', () => {
  const segments = WorkUI.donutSegments({ TODO: 1, DONE: 3 });
  assert.deepEqual(segments.map(s => s.state), ['TODO', 'DONE']);
  assert.equal(segments[0].share, 25);
  assert.equal(segments[1].offset, 25);
  assert.deepEqual(WorkUI.donutSegments({}), []);
});

test('workloadBars sorts by total load', () => {
  const bars = WorkUI.workloadBars({
    Ann: { open_days: 1, done_days: 1, items: 2, kind: 'human' },
    Bo: { open_days: 4, done_days: 0, items: 1, kind: 'human' }
  });
  assert.deepEqual(bars.map(b => b.owner), ['Bo', 'Ann']);
  assert.equal(bars[0].openShare, 100);
});

test('cleanTeam trims, drops blanks and duplicates', () => {
  assert.deepEqual(
    WorkUI.cleanTeam([{ name: ' Ann ', role: ' Dev ' }, { name: 'ann' }, { name: '' }, { name: 'Bo' }]),
    [{ name: 'Ann', role: 'Dev' }, { name: 'Bo', role: '' }]
  );
});

test('parseDays validates whole days 0-90', () => {
  assert.equal(WorkUI.parseDays(''), null);
  assert.equal(WorkUI.parseDays('5'), 5);
  assert.ok(Number.isNaN(WorkUI.parseDays('1.5')));
  assert.ok(Number.isNaN(WorkUI.parseDays('91')));
});

test('ticketPatch sends only changed fields so dates are not pinned needlessly', () => {
  const item = { title: 'A', owner: 'Ann', start_date: '2026-01-01', due_date: '2026-01-05', estimate_days: 3, depends_on: ['x'] };
  assert.deepEqual(WorkUI.ticketPatch(item, { ...item }), {});
  assert.deepEqual(WorkUI.ticketPatch(item, { ...item, owner: 'Bo', depends_on: ['x', 'y'] }), { owner: 'Bo', depends_on: ['x', 'y'] });
});

test('canEdit blocks AI projects, closed projects and plan-derived agent tickets', () => {
  const agentItem = { assignee_kind: 'agent', plan_id: 'p1' };
  assert.equal(WorkUI.isAgentDriven(agentItem), true);
  assert.equal(WorkUI.canEdit({ mode: 'ai', status: 'STARTED' }, {}), false);
  assert.equal(WorkUI.canEdit({ mode: 'human', status: 'STARTED' }, {}), true);
  assert.equal(WorkUI.canEdit({ mode: 'hybrid', status: 'STARTED' }, agentItem), false);
  assert.equal(WorkUI.canEdit({ mode: 'human', status: 'COMPLETED' }, {}), false);
});
