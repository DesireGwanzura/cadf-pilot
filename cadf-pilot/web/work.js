'use strict';
// Work section: table, kanban, gantt, charts, intake and downloads for one project.
// Every view reads only snapshot.work[project_id] (pm.derive output); nothing here keeps its own copy of tickets.
// All text from records reaches the page through textContent, never innerHTML.
const WorkUI = (() => {
  const DAY_MS = 86400000;
  const STATES = ['TODO', 'DOING', 'BLOCKED', 'REVIEW', 'DONE'];
  const STATE_LABELS = {
    TODO: 'To do',
    DOING: 'Working on it',
    BLOCKED: 'Stuck',
    REVIEW: 'On review',
    DONE: 'Done'
  };
  const PRIORITY_ORDER = { HIGH: 0, NORMAL: 1, LOW: 2 };
  const TYPES = ['task', 'story', 'bug', 'risk', 'milestone'];
  const MODE_INFO = {
    ai: 'AI project: Copilot agents plan, draft and review everything. Tickets fill in from the approved plan and your documents.',
    human: 'Human project: your team does the work. Tickets come from what you paste or add; no AI is used.',
    hybrid: 'Hybrid project: an AI plan with human action tasks. People finish their tickets and the agents continue.'
  };
  const DOWNLOADS = [
    ['csv', 'Tickets (CSV)'],
    ['svg-gantt', 'Gantt (SVG)'],
    ['svg-status', 'Status chart (SVG)'],
    ['svg-workload', 'Workload chart (SVG)'],
    ['svg-burndown', 'Burndown chart (SVG)'],
    ['report', 'Report (HTML)'],
    ['work-md', 'Work plan (Markdown)'],
    ['work-docx', 'Work plan (Word)']
  ];
  const SORT_KEYS = [
    ['title', 'Ticket'],
    ['owner', 'Owner'],
    ['state', 'Status'],
    ['priority', 'Priority'],
    ['estimate_days', 'Days'],
    ['start_date', 'Start'],
    ['due_date', 'Due']
  ];

  // ───────────────────────── Pure helpers (unit tested) ─────────────────────────

  function parseIso(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const ms = Date.parse(value + 'T00:00:00Z');
    return Number.isNaN(ms) ? null : ms;
  }

  function todayIso(now = new Date()) {
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return now.getFullYear() + '-' + month + '-' + day;
  }

  function shortDate(iso) {
    return typeof iso === 'string' && iso.length >= 10 ? iso.slice(5, 10) : '';
  }

  // Agent tickets that come from an approved plan cannot be edited by hand.
  function isAgentDriven(item) {
    return item.assignee_kind === 'agent' && Boolean(item.plan_id);
  }

  function canEdit(project, item) {
    if (!project || project.mode === 'ai') return false;
    if (['COMPLETED', 'ARCHIVED'].includes(project.status)) return false;
    return !isAgentDriven(item);
  }

  function stateLabel(state) {
    return STATE_LABELS[state] || String(state || '').replaceAll('_', ' ');
  }

  // Lane id for an item: the server's display state (DONE once accepted).
  function laneFor(item) {
    return STATES.includes(item.state) ? item.state : 'TODO';
  }

  // Resolve the kanban lanes from derive() output into lanes holding item objects.
  function lanesWithItems(work) {
    const byId = new Map((work?.items || []).map(item => [item.id, item]));
    return (work?.kanban || []).map(lane => ({
      state: lane.state,
      label: lane.label || stateLabel(lane.state),
      items: lane.items.map(id => byId.get(id)).filter(Boolean)
    }));
  }

  function sortValue(item, key) {
    if (key === 'priority') return PRIORITY_ORDER[item.priority] ?? 1;
    if (key === 'state') return STATES.indexOf(laneFor(item));
    if (key === 'estimate_days') return Number(item.estimate_days) || 0;
    return String(item[key] || '').toLowerCase();
  }

  // Stable sort; empty dates always go last.
  function sortItems(items, key, direction = 1) {
    if (!key) return items.slice();
    const dated = key === 'start_date' || key === 'due_date';
    return items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const left = sortValue(a.item, key);
        const right = sortValue(b.item, key);
        if (dated && (left === '' || right === '') && left !== right) return left === '' ? 1 : -1;
        if (left < right) return -direction;
        if (left > right) return direction;
        return a.index - b.index;
      })
      .map(entry => entry.item);
  }

  function isOverdue(row, today) {
    const due = parseIso(row.due);
    const now = parseIso(today);
    return due !== null && now !== null && due < now && row.state !== 'DONE';
  }

  // Bar geometry for the SVG timeline.
  function ganttLayout(gantt, options = {}) {
    const labelWidth = options.labelWidth ?? 190;
    const chartWidth = options.chartWidth ?? 640;
    const rowHeight = options.rowHeight ?? 30;
    const headerHeight = options.headerHeight ?? 26;
    const today = options.today || todayIso();
    const rows = (gantt?.rows || []).filter(row => parseIso(row.start) !== null && parseIso(row.due) !== null);
    const empty = { width: labelWidth + chartWidth, height: headerHeight, bars: [], links: [], ticks: [], todayX: null, days: 0, labelWidth };
    if (!rows.length) return empty;

    const startMs = Math.min(...rows.map(row => parseIso(row.start)));
    const endMs = Math.max(...rows.map(row => parseIso(row.due)));
    const days = Math.round((endMs - startMs) / DAY_MS) + 1;
    const dayWidth = chartWidth / days;
    const xFor = ms => labelWidth + ((ms - startMs) / DAY_MS) * dayWidth;

    const bars = rows.map((row, index) => {
      const x = xFor(parseIso(row.start));
      const span = Math.round((parseIso(row.due) - parseIso(row.start)) / DAY_MS) + 1;
      const y = headerHeight + index * rowHeight;
      return {
        id: row.id,
        title: row.title,
        owner: row.owner,
        state: row.state,
        type: row.type,
        start: row.start,
        due: row.due,
        x,
        y,
        width: Math.max(span * dayWidth, 4),
        height: rowHeight - 10,
        centerY: y + (rowHeight - 10) / 2 + 5,
        overdue: isOverdue(row, today)
      };
    });

    const byId = new Map(bars.map(bar => [bar.id, bar]));
    const links = [];
    rows.forEach(row => {
      const target = byId.get(row.id);
      for (const dependencyId of row.depends_on || []) {
        const source = byId.get(dependencyId);
        if (!source) continue;
        const fromX = source.x + source.width;
        const midX = Math.max(fromX + 6, target.x - 6);
        links.push({
          from: dependencyId,
          to: row.id,
          path: 'M' + fromX + ' ' + source.centerY + ' H' + midX + ' V' + target.centerY + ' H' + target.x
        });
      }
    });

    const tickCount = Math.min(days, 6);
    const ticks = [];
    for (let n = 0; n < tickCount; n++) {
      const offset = tickCount === 1 ? 0 : Math.round((n * (days - 1)) / (tickCount - 1));
      const ms = startMs + offset * DAY_MS;
      ticks.push({ x: xFor(ms), label: shortDate(new Date(ms).toISOString()) });
    }

    const todayMs = parseIso(today);
    const todayX = todayMs !== null && todayMs >= startMs && todayMs <= endMs ? xFor(todayMs) + dayWidth / 2 : null;
    return { width: labelWidth + chartWidth, height: headerHeight + rows.length * rowHeight + 6, bars, links, ticks, todayX, days, labelWidth };
  }

  function linePath(points) {
    let path = '';
    let drawing = false;
    for (const point of points) {
      if (point === null) {
        drawing = false;
        continue;
      }
      path += (drawing ? ' L' : (path ? ' M' : 'M')) + point.x.toFixed(1) + ' ' + point.y.toFixed(1);
      drawing = true;
    }
    return path;
  }

  // Ideal vs actual remaining work as two SVG path strings.
  function burndownPaths(points, options = {}) {
    const width = options.width ?? 520;
    const height = options.height ?? 220;
    const pad = options.pad ?? 30;
    if (!points || !points.length) return { ideal: '', actual: '', max: 0, count: 0, xs: [] };
    const max = Math.max(1, ...points.flatMap(point => [point.ideal || 0, point.actual ?? 0]));
    const innerWidth = width - pad * 2;
    const innerHeight = height - pad * 2;
    const xAt = index => pad + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
    const yAt = value => pad + innerHeight - (value / max) * innerHeight;
    return {
      ideal: linePath(points.map((point, index) => ({ x: xAt(index), y: yAt(point.ideal || 0) }))),
      actual: linePath(points.map((point, index) => (point.actual === null || point.actual === undefined ? null : { x: xAt(index), y: yAt(point.actual) }))),
      max,
      count: points.length,
      xs: points.map((_, index) => xAt(index))
    };
  }

  // Segments for a donut drawn with stroke-dasharray on a circle of circumference 100.
  function donutSegments(byState) {
    const total = STATES.reduce((sum, state) => sum + (byState?.[state] || 0), 0);
    let offset = 0;
    return STATES.filter(state => (byState?.[state] || 0) > 0).map(state => {
      const share = total ? (byState[state] / total) * 100 : 0;
      const segment = { state, count: byState[state], share, offset };
      offset += share;
      return segment;
    });
  }

  function workloadBars(workload) {
    const entries = Object.entries(workload || {}).map(([owner, data]) => ({
      owner,
      kind: data.kind,
      items: data.items,
      open: data.open_days,
      done: data.done_days
    }));
    const max = Math.max(1, ...entries.map(entry => entry.open + entry.done));
    return entries
      .sort((a, b) => b.open + b.done - (a.open + a.done) || a.owner.localeCompare(b.owner))
      .map(entry => ({ ...entry, openShare: (entry.open / max) * 100, doneShare: (entry.done / max) * 100 }));
  }

  function cleanTeam(rows) {
    const seen = new Set();
    const team = [];
    for (const row of rows || []) {
      const name = String(row.name || '').trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      team.push({ name, role: String(row.role || '').trim() });
    }
    return team;
  }

  function parseDays(text) {
    if (String(text).trim() === '') return null;
    const days = Number(text);
    return Number.isInteger(days) && days >= 0 && days <= 90 ? days : NaN;
  }

  // Only the fields the person changed; unchanged dates must not be sent (sending both would pin the ticket).
  function ticketPatch(item, values) {
    const patch = {};
    for (const key of ['title', 'description', 'owner', 'type', 'priority', 'start_date', 'due_date']) {
      if (key in values && String(values[key] ?? '') !== String(item[key] ?? '')) patch[key] = values[key];
    }
    if ('estimate_days' in values && values.estimate_days !== null && values.estimate_days !== item.estimate_days) {
      patch.estimate_days = values.estimate_days;
    }
    if ('depends_on' in values) {
      const before = [...(item.depends_on || [])].sort().join(',');
      if ([...values.depends_on].sort().join(',') !== before) patch.depends_on = values.depends_on;
    }
    return patch;
  }

  // ───────────────────────── DOM helpers ─────────────────────────

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function svg(tag, attributes = {}, text) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(label, onClick, className) {
    const node = el('button', label, className);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  }

  function field(labelText, input, className) {
    const label = el('label', undefined, className);
    label.append(el('span', labelText), input);
    return label;
  }

  function input(type, value, attributes = {}) {
    const node = el('input');
    node.type = type;
    if (value !== undefined && value !== null) node.value = value;
    for (const [name, attribute] of Object.entries(attributes)) node.setAttribute(name, attribute);
    return node;
  }

  function select(options, value, label) {
    const node = el('select');
    for (const [optionValue, optionLabel] of options) node.append(new Option(optionLabel, optionValue));
    if (value !== undefined) node.value = value;
    if (label) node.setAttribute('aria-label', label);
    return node;
  }

  function stateBadge(state) {
    const badge = el('span', stateLabel(state), 'wk-state wk-state-' + String(state).toLowerCase());
    return badge;
  }

  // Name + role rows shared by the create form and the intake panel.
  function teamEditor(initial = []) {
    const root = el('div', undefined, 'wk-team');
    const list = el('div', undefined, 'wk-team-rows');
    const add = button('+ Add person', () => addRow('', ''), 'wk-small');
    root.append(list, add);

    function addRow(name, role) {
      const row = el('div', undefined, 'wk-team-row');
      const nameInput = input('text', name, { maxlength: '80', placeholder: 'Name', 'aria-label': 'Team member name' });
      const roleInput = input('text', role, { maxlength: '80', placeholder: 'Role (optional)', 'aria-label': 'Team member role' });
      const remove = button('Remove', () => row.remove(), 'wk-small');
      remove.setAttribute('aria-label', 'Remove team member');
      row.append(nameInput, roleInput, remove);
      list.append(row);
    }

    function set(team) {
      list.replaceChildren();
      for (const member of team?.length ? team : [{ name: '', role: '' }]) addRow(member.name || '', member.role || '');
    }

    function get() {
      return cleanTeam([...list.children].map(row => {
        const [nameInput, roleInput] = row.querySelectorAll('input');
        return { name: nameInput.value, role: roleInput.value };
      }));
    }

    set(initial);
    return { element: root, get, set };
  }

  // ───────────────────────── State and actions ─────────────────────────

  const state = {
    view: 'table',
    download: 'csv',
    sort: { key: null, direction: 1 },
    busy: false,
    feedback: { text: '', error: false },
    ticketDraft: { title: '', description: '', owner: '', type: 'task', priority: 'NORMAL', estimate_days: '1', start_date: '', due_date: '' },
    intakeDraft: { text: '', replace: false, source: 'intake', team: null },
    host: null,
    setupHost: null,
    data: null,
    projectId: null,
    pending: false,
    dialog: null
  };

  function currentProject() {
    return state.data?.projects.projects.find(project => project.id === state.projectId) || null;
  }

  function currentWork() {
    return state.data?.work?.[state.projectId] || null;
  }

  function setFeedback(text, error = false) {
    state.feedback = { text, error };
    for (const root of [state.host, state.setupHost]) {
      const line = root?.querySelector('.wk-feedback');
      if (!line) continue;
      line.textContent = text;
      line.classList.toggle('error', error);
    }
  }

  async function act(payload, success = 'Saved.') {
    if (state.busy || !state.data || !state.projectId) return false;
    state.busy = true;
    setFeedback('Saving…');
    try {
      const data = Store.get();
      await API.post({ ...payload, id: state.projectId, expected_revision: data.projects.revision }, data.write_token);
      await AppController.refresh();
      setFeedback(success);
      return true;
    } catch (error) {
      setFeedback(error.message, true);
      if (typeof WorkspaceUI !== 'undefined') WorkspaceUI.notify(error.message);
      return false;
    } finally {
      state.busy = false;
    }
  }

  // ───────────────────────── Rendering ─────────────────────────

  function isTyping() {
    const active = document.activeElement;
    return Boolean(active && [state.host, state.setupHost].some(root => root?.contains(active)) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName));
  }

  function update(host, data, projectId, setupHost = null) {
    state.host = host;
    state.setupHost = setupHost;
    state.data = data;
    state.projectId = projectId;
    if (isTyping()) {
      state.pending = true;
      return;
    }
    render();
  }

  function render() {
    state.pending = false;
    const host = state.host;
    if (!host) return;
    const project = currentProject();
    const work = currentWork();
    const setup = state.setupHost;
    host.classList.add('wk-root');
    setup?.classList.add('wk-root');
    if (!project || !work) {
      host.replaceChildren(el('p', 'Select or submit a project to see its work plan.', 'muted'));
      setup?.replaceChildren(el('p', 'Select or submit a project to see its setup.', 'muted'));
      return;
    }
    const toolbar = el('div', undefined, 'wk-toolbar');
    toolbar.append(tabs(), downloads(project));
    host.replaceChildren(toolbar, panel(project, work), feedbackLine());
    if (setup) {
      const parts = [projectPicker(), header(project, work)];
      if (work.warnings.length) parts.push(warnings(work));
      parts.push(intakeView(project), feedbackLine());
      setup.replaceChildren(...parts);
    }
  }

  function projectPicker() {
    const choice = select(state.data.projects.projects.map(item => [item.id, item.name]), state.projectId, 'Project');
    choice.addEventListener('change', () => {
      const main = document.getElementById('pm-project');
      if (!main) return;
      main.value = choice.value;
      choice.blur();
      main.dispatchEvent(new Event('change'));
    });
    return field('Selected project', choice);
  }

  function feedbackLine() {
    const feedback = el('p', state.feedback.text, 'wk-feedback' + (state.feedback.error ? ' error' : ''));
    feedback.setAttribute('role', 'status');
    return feedback;
  }

  function header(project, work) {
    const box = el('article', undefined, 'wk-head');
    const top = el('div', undefined, 'wk-head-top');
    top.append(el('h3', project.name), el('span', work.mode.toUpperCase(), 'tag wk-mode wk-mode-' + work.mode), Fmt.badge(project.status));
    const stats = el('div', undefined, 'wk-stats');
    for (const [label, value] of [
      ['Tickets', work.stats.total],
      ['Done', work.stats.done + ' (' + work.stats.percent + '%)'],
      ['Overdue', work.stats.overdue],
      ['Blocked', work.stats.blocked]
    ]) {
      const stat = el('div');
      stat.append(el('span', label), el('strong', value));
      stats.append(stat);
    }
    const progress = el('progress');
    progress.max = 100;
    progress.value = work.stats.percent;
    progress.setAttribute('aria-label', 'Work completed');
    box.append(top, el('p', MODE_INFO[work.mode] || '', 'muted'), stats, progress);
    return box;
  }

  function warnings(work) {
    const box = el('details', undefined, 'wk-warnings');
    box.open = true;
    box.append(el('summary', 'Warnings (' + work.warnings.length + ')'));
    const list = el('ul');
    for (const text of work.warnings) list.append(el('li', text));
    box.append(list);
    return box;
  }

  function downloads(project) {
    const bar = el('div', undefined, 'wk-downloads');
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Download this work plan');
    const choice = select(DOWNLOADS, state.download, 'Download format');
    const go = el('a', '↓ Download', 'download-link');
    const link = () => {
      state.download = choice.value;
      go.href = '/api/export?' + new URLSearchParams({ project: project.id, format: choice.value });
    };
    link();
    choice.addEventListener('change', link);
    go.setAttribute('download', '');
    bar.append(choice, go);
    return bar;
  }

  function tabs() {
    const bar = el('div', undefined, 'wk-tabs');
    bar.setAttribute('role', 'tablist');
    bar.setAttribute('aria-label', 'Work views');
    for (const [id, label] of [['table', 'Table'], ['kanban', 'Kanban'], ['gantt', 'Gantt'], ['charts', 'Charts']]) {
      const tab = button(label, () => {
        state.view = id;
        render();
      }, state.view === id ? 'selected' : '');
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(state.view === id));
      bar.append(tab);
    }
    return bar;
  }

  function panel(project, work) {
    const body = el('div', undefined, 'wk-panel');
    body.setAttribute('role', 'tabpanel');
    const views = { table: tableView, kanban: kanbanView, gantt: ganttView, charts: chartsView };
    body.append((views[state.view] || tableView)(project, work));
    return body;
  }

  // ── Table ──

  function tableView(project, work) {
    const box = el('div');
    const items = sortItems(work.items, state.sort.key, state.sort.direction);
    if (!work.items.length) {
      box.append(el('p', project.mode === 'ai'
        ? 'Tickets appear here once the approved plan starts, and from documents the agents deliver.'
        : 'No tickets yet. Add one below or paste a list in Project setup.', 'muted'));
    } else {
      const wrap = el('div', undefined, 'wk-table-wrap');
      const table = el('table', undefined, 'wk-table');
      const head = el('tr');
      for (const [key, label] of SORT_KEYS) {
        const cell = el('th');
        cell.scope = 'col';
        const active = state.sort.key === key;
        cell.setAttribute('aria-sort', active ? (state.sort.direction === 1 ? 'ascending' : 'descending') : 'none');
        cell.append(button(label + (active ? (state.sort.direction === 1 ? ' ▲' : ' ▼') : ''), () => {
          state.sort = { key, direction: active ? -state.sort.direction : 1 };
          render();
        }, 'wk-sort'));
        head.append(cell);
      }
      head.append(el('th', 'After'), el('th', 'Actions'));
      const thead = el('thead');
      thead.append(head);
      table.append(thead);
      const body = el('tbody');
      for (const item of items) body.append(tableRow(project, work, item));
      table.append(body);
      wrap.append(table);
      box.append(wrap);
    }
    if (canEdit(project, { assignee_kind: 'human' })) box.append(addTicketForm(project, work));
    else if (project.mode === 'ai') box.append(el('p', 'Agent tickets are read-only: the approved plan drives their status, owner and schedule.', 'muted'));
    return box;
  }

  function tableRow(project, work, item) {
    const row = el('tr');
    row.dataset.state = item.state.toLowerCase();
    if (item.overdue) row.classList.add('wk-overdue');
    const editable = canEdit(project, item);
    const titleCell = el('td');
    titleCell.append(el('b', item.title), el('small', item.type + ' · ' + (item.source || 'manual')));
    if (item.description) titleCell.append(el('small', item.description, 'wk-description'));

    const ownerCell = el('td', item.owner);
    if (item.model) ownerCell.append(el('small', item.model));
    if (isAgentDriven(item)) ownerCell.append(el('small', 'Agent-driven · read-only'));

    const stateCell = el('td');
    if (editable) {
      const picker = select(STATES.map(value => [value, stateLabel(value)]), laneFor(item), 'Status for ' + item.title);
      picker.addEventListener('change', () => act({ action: 'ticket_update', item_id: item.id, state: picker.value }, 'Status updated.'));
      stateCell.append(picker);
    } else {
      stateCell.append(stateBadge(item.state));
    }

    const titles = new Map(work.items.map(other => [other.id, other.title]));
    const after = el('td', (item.depends_on || []).map(id => titles.get(id) || id).join(', ') || '—');
    if (item.blocked_by?.length) after.append(el('small', 'Waiting on ' + item.blocked_by.length));

    row.append(
      titleCell,
      ownerCell,
      stateCell,
      el('td', item.priority),
      el('td', String(item.estimate_days ?? '')),
      el('td', item.start_date || '—'),
      dueCell(item),
      after
    );

    const actions = el('td', undefined, 'wk-actions');
    if (editable) {
      const edit = button('Edit', () => openEditor(project, work, item));
      edit.setAttribute('aria-label', 'Edit ' + item.title);
      const remove = button('Delete', () => {
        if (confirm('Delete ticket "' + item.title + '"?')) act({ action: 'ticket_delete', item_id: item.id }, 'Ticket deleted.');
      });
      remove.setAttribute('aria-label', 'Delete ' + item.title);
      actions.append(edit);
      if (!item.plan_id) actions.append(remove);
    }
    row.append(actions);
    return row;
  }

  function dueCell(item) {
    const cell = el('td', item.due_date || '—');
    if (item.overdue) cell.append(el('small', 'Overdue', 'wk-late'));
    return cell;
  }

  function addTicketForm(project, work) {
    const draft = state.ticketDraft;
    const form = el('form', undefined, 'wk-form');
    const heading = el('h4', 'Add a ticket');
    const title = input('text', draft.title, { maxlength: '200', required: '', placeholder: 'What needs doing?' });
    const description = el('textarea');
    description.maxLength = 4000;
    description.rows = 2;
    description.value = draft.description;
    const owner = input('text', draft.owner, { maxlength: '120', list: 'wk-team-names', placeholder: 'Unassigned' });
    const names = el('datalist');
    names.id = 'wk-team-names';
    for (const member of project.team || []) names.append(new Option(member.name, member.name));
    const type = select(TYPES.map(value => [value, value]), draft.type);
    const priority = select(['HIGH', 'NORMAL', 'LOW'].map(value => [value, value]), draft.priority);
    const days = input('number', draft.estimate_days, { min: '0', max: '90', step: '1' });
    const start = input('date', draft.start_date);
    const due = input('date', draft.due_date);
    const controls = { title, description, owner, type, priority, estimate_days: days, start_date: start, due_date: due };
    for (const [key, control] of Object.entries(controls)) control.addEventListener('input', () => { draft[key] = control.value; });

    const grid = el('div', undefined, 'wk-form-grid');
    grid.append(
      field('Title', title, 'wk-wide'),
      field('Description', description, 'wk-wide'),
      field('Owner', owner),
      field('Type', type),
      field('Priority', priority),
      field('Estimate (working days)', days),
      field('Start (optional)', start),
      field('Due (optional)', due)
    );
    const submit = el('button', 'Add ticket', 'btn-primary');
    submit.type = 'submit';
    form.append(heading, grid, names, submit, el('p', 'Leave dates empty to let Auto-schedule place the ticket from estimates and dependencies.', 'muted'));
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const estimate = parseDays(days.value);
      if (Number.isNaN(estimate)) {
        setFeedback('Estimate must be a whole number from 0 to 90.', true);
        return;
      }
      const payload = { action: 'ticket_create', title: title.value, description: description.value, owner: owner.value, type: type.value, priority: priority.value };
      if (estimate !== null) payload.estimate_days = estimate;
      if (start.value) payload.start_date = start.value;
      if (due.value) payload.due_date = due.value;
      if (await act(payload, 'Ticket added.')) {
        Object.assign(state.ticketDraft, { title: '', description: '', owner: '', start_date: '', due_date: '', estimate_days: '1' });
        render();
      }
    });
    return form;
  }

  function openEditor(project, work, item) {
    if (!state.dialog) {
      state.dialog = el('dialog', undefined, 'wk-dialog');
      state.dialog.setAttribute('aria-label', 'Edit ticket');
      document.body.append(state.dialog);
    }
    const dialog = state.dialog;
    const form = el('form', undefined, 'wk-form');
    const title = input('text', item.title, { maxlength: '200', required: '' });
    const description = el('textarea');
    description.maxLength = 4000;
    description.rows = 3;
    description.value = item.description || '';
    const owner = input('text', item.owner, { maxlength: '120', list: 'wk-team-names' });
    const type = select(TYPES.map(value => [value, value]), item.type);
    const priority = select(['HIGH', 'NORMAL', 'LOW'].map(value => [value, value]), item.priority);
    const days = input('number', item.estimate_days, { min: '0', max: '90', step: '1' });
    const start = input('date', item.start_date || '');
    const due = input('date', item.due_date || '');
    const dependencies = el('select');
    dependencies.multiple = true;
    dependencies.size = Math.min(6, Math.max(3, work.items.length));
    dependencies.setAttribute('aria-label', 'Tickets this one comes after');
    for (const other of work.items) {
      if (other.id === item.id) continue;
      const option = new Option(other.title, other.id);
      option.selected = (item.depends_on || []).includes(other.id);
      dependencies.append(option);
    }
    const lockNote = item.plan_id ? 'This ticket belongs to the approved plan: its title and agent-side scope stay as planned.' : '';
    const grid = el('div', undefined, 'wk-form-grid');
    grid.append(
      field('Title', title, 'wk-wide'),
      field('Description', description, 'wk-wide'),
      field('Owner', owner),
      field('Type', type),
      field('Priority', priority),
      field('Estimate (working days)', days),
      field('Start', start),
      field('Due', due),
      field('Comes after (Ctrl/Cmd-click for several)', dependencies, 'wk-wide')
    );
    const save = el('button', 'Save changes', 'btn-primary');
    save.type = 'submit';
    const cancel = button('Cancel', () => dialog.close());
    form.append(el('h3', 'Edit ticket'), grid, lockNote ? el('p', lockNote, 'muted') : el('span'), el('div', undefined, 'wk-actions'));
    form.lastChild.append(save, cancel);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const estimate = parseDays(days.value);
      if (Number.isNaN(estimate)) {
        setFeedback('Estimate must be a whole number from 0 to 90.', true);
        return;
      }
      const patch = ticketPatch(item, {
        title: title.value,
        description: description.value,
        owner: owner.value,
        type: type.value,
        priority: priority.value,
        estimate_days: estimate,
        start_date: start.value,
        due_date: due.value,
        depends_on: [...dependencies.selectedOptions].map(option => option.value)
      });
      if (!Object.keys(patch).length) {
        dialog.close();
        return;
      }
      await act({ action: 'ticket_update', item_id: item.id, ...patch }, 'Ticket updated.');
      dialog.close();
    });
    dialog.replaceChildren(form);
    dialog.showModal();
    title.focus();
  }

  // ── Kanban ──

  function kanbanView(project, work) {
    const board = el('div', undefined, 'wk-kanban');
    for (const lane of lanesWithItems(work)) {
      const column = el('section', undefined, 'wk-lane wk-lane-' + lane.state.toLowerCase());
      column.dataset.state = lane.state;
      column.setAttribute('aria-label', lane.label + ', ' + lane.items.length + ' tickets');
      column.append(el('h4', lane.label + ' · ' + lane.items.length));
      column.addEventListener('dragover', event => {
        event.preventDefault();
        column.classList.add('wk-drop');
      });
      column.addEventListener('dragleave', () => column.classList.remove('wk-drop'));
      column.addEventListener('drop', event => {
        event.preventDefault();
        column.classList.remove('wk-drop');
        moveTicket(project, work, event.dataTransfer.getData('text/plain'), lane.state);
      });
      for (const item of lane.items) column.append(kanbanCard(project, item));
      if (!lane.items.length) column.append(el('p', 'Nothing here', 'muted'));
      board.append(column);
    }
    return board;
  }

  function moveTicket(project, work, itemId, target) {
    const item = work.items.find(candidate => candidate.id === itemId);
    if (!item || laneFor(item) === target) return;
    if (!canEdit(project, item)) {
      setFeedback(isAgentDriven(item) ? 'The agents drive this ticket; it cannot be moved by hand.' : 'This project is read-only.', true);
      return;
    }
    act({ action: 'ticket_update', item_id: item.id, state: target }, 'Moved to ' + stateLabel(target) + '.');
  }

  function kanbanCard(project, item) {
    const card = el('article', undefined, 'wk-card' + (item.overdue ? ' wk-overdue' : ''));
    card.dataset.state = item.state.toLowerCase();
    card.append(el('b', item.title), el('small', item.owner + (item.model ? ' · ' + item.model : '')));
    card.append(el('small', item.priority + ' · ' + (item.estimate_days ?? 0) + ' d · ' + (item.due_date ? 'due ' + item.due_date : 'no due date')));
    if (item.blocked_by?.length) card.append(el('small', 'Waiting on ' + item.blocked_by.length + ' ticket(s)', 'wk-late'));
    if (canEdit(project, item)) {
      card.draggable = true;
      card.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', item.id));
      const mover = select(STATES.map(value => [value, 'Move to ' + stateLabel(value)]), laneFor(item), 'Move ' + item.title);
      mover.addEventListener('change', () => moveTicket(project, currentWork(), item.id, mover.value));
      card.append(mover);
    } else {
      card.append(el('small', isAgentDriven(item) ? '🔒 Agent-driven' : '🔒 Read-only', 'muted'));
    }
    return card;
  }

  // ── Gantt ──

  function ganttView(project, work) {
    const box = el('div');
    const layout = ganttLayout(work.gantt, { today: todayIso() });
    if (!layout.bars.length) {
      box.append(el('p', 'No scheduled tickets yet. Add start and due dates, or press Auto-schedule.', 'muted'));
    } else {
      const wrap = el('div', undefined, 'wk-gantt-wrap');
      const chart = svg('svg', { viewBox: '0 0 ' + layout.width + ' ' + layout.height, width: layout.width, height: layout.height, role: 'img', class: 'wk-gantt' });
      chart.append(svg('title', {}, 'Schedule from ' + work.gantt.start + ' to ' + work.gantt.end));
      for (const tick of layout.ticks) {
        chart.append(svg('line', { x1: tick.x, x2: tick.x, y1: 18, y2: layout.height, class: 'wk-grid' }));
        chart.append(svg('text', { x: tick.x + 2, y: 12, class: 'wk-axis' }, tick.label));
      }
      layout.bars.forEach(bar => {
        chart.append(svg('text', { x: 4, y: bar.centerY + 4, class: 'wk-label' }, bar.title.length > 28 ? bar.title.slice(0, 27) + '…' : bar.title));
        chart.append(svg('line', { x1: 0, x2: layout.width, y1: bar.y + 30 - 1, y2: bar.y + 30 - 1, class: 'wk-grid' }));
        const classes = 'wk-bar wk-fill-' + bar.state.toLowerCase() + (bar.overdue ? ' wk-bar-overdue' : '');
        let shape;
        if (bar.type === 'milestone') {
          const cx = bar.x + 8;
          shape = svg('path', { d: 'M' + cx + ' ' + (bar.y + 3) + ' l8 8 l-8 8 l-8 -8 z', class: classes });
        } else {
          shape = svg('rect', { x: bar.x, y: bar.y + 3, width: bar.width, height: bar.height, rx: 4, class: classes });
        }
        shape.append(svg('title', {}, bar.title + ' · ' + bar.owner + ' · ' + bar.start + ' to ' + bar.due + (bar.overdue ? ' · OVERDUE' : '')));
        chart.append(shape);
      });
      for (const link of layout.links) chart.append(svg('path', { d: link.path, class: 'wk-link' }));
      if (layout.todayX !== null) {
        chart.append(svg('line', { x1: layout.todayX, x2: layout.todayX, y1: 14, y2: layout.height, class: 'wk-today' }));
        chart.append(svg('text', { x: layout.todayX + 3, y: layout.height - 2, class: 'wk-today-label' }, 'Today'));
      }
      wrap.append(chart);
      box.append(wrap, el('p', 'Lines join a ticket to the ticket it comes after. Red outline = overdue. Dashed line = today.', 'muted'));
    }
    const scheduled = new Set(layout.bars.map(bar => bar.id));
    const unscheduled = work.items.filter(item => !scheduled.has(item.id));
    if (unscheduled.length) {
      const list = el('details', undefined, 'wk-unscheduled');
      list.open = true;
      list.append(el('summary', 'Not scheduled (' + unscheduled.length + ')'));
      const items = el('ul');
      for (const item of unscheduled) items.append(el('li', item.title + ' — ' + item.owner));
      list.append(items);
      list.append(autoscheduleButton());
      box.append(list);
    }
    return box;
  }

  function autoscheduleButton() {
    const node = button('Auto-schedule', () => act({ action: 'autoschedule' }, 'Rescheduled from estimates and dependencies.'));
    node.title = 'Recalculate dates from estimates and dependencies (clears manual date pins)';
    return node;
  }

  // ── Charts ──

  function chartsView(project, work) {
    const grid = el('div', undefined, 'wk-charts');
    grid.append(statusChart(work), priorityChart(work), workloadChart(work), burndownChart(work));
    return grid;
  }

  function chartCard(title, note) {
    const card = el('article', undefined, 'wk-chart');
    card.append(el('h4', title));
    if (note) card.append(el('p', note, 'muted'));
    return card;
  }

  function statusChart(work) {
    const card = chartCard('Status', work.stats.total + ' tickets · ' + work.stats.percent + '% done');
    const segments = donutSegments(work.stats.by_state);
    const chart = svg('svg', { viewBox: '0 0 42 42', width: 150, height: 150, role: 'img', class: 'wk-donut' });
    chart.append(svg('title', {}, 'Tickets by status'));
    chart.append(svg('circle', { cx: 21, cy: 21, r: 15.9155, class: 'wk-donut-track' }));
    for (const segment of segments) {
      const arc = svg('circle', {
        cx: 21, cy: 21, r: 15.9155,
        class: 'wk-donut-arc wk-stroke-' + segment.state.toLowerCase(),
        'stroke-dasharray': segment.share.toFixed(2) + ' ' + (100 - segment.share).toFixed(2),
        'stroke-dashoffset': (25 - segment.offset).toFixed(2)
      });
      arc.append(svg('title', {}, stateLabel(segment.state) + ': ' + segment.count));
      chart.append(arc);
    }
    chart.append(svg('text', { x: 21, y: 23, 'text-anchor': 'middle', class: 'wk-donut-text' }, work.stats.percent + '%'));
    const legend = el('ul', undefined, 'wk-legend');
    for (const state of STATES) {
      const item = el('li');
      item.append(el('span', undefined, 'wk-swatch wk-fill-' + state.toLowerCase()), document.createTextNode(stateLabel(state) + ': ' + (work.stats.by_state[state] || 0)));
      legend.append(item);
    }
    const row = el('div', undefined, 'wk-chart-row');
    row.append(chart, legend);
    card.append(row);
    return card;
  }

  function priorityChart(work) {
    const card = chartCard('Priority');
    const total = Math.max(1, work.stats.total);
    for (const priority of ['HIGH', 'NORMAL', 'LOW']) {
      const count = work.stats.by_priority[priority] || 0;
      card.append(barRow(priority, count, (count / total) * 100, 'wk-fill-doing'));
    }
    return card;
  }

  function barRow(label, valueText, share, fillClass) {
    const row = el('div', undefined, 'wk-bar-row');
    const track = el('div', undefined, 'wk-track');
    const fill = el('span', undefined, 'wk-fill ' + fillClass);
    fill.style.width = Math.max(0, Math.min(100, share)) + '%';
    track.append(fill);
    row.append(el('span', label), track, el('b', String(valueText)));
    return row;
  }

  function workloadChart(work) {
    const bars = workloadBars(work.workload);
    const card = chartCard('Workload per person', 'Working days: open (solid) and done (light)');
    if (!bars.length) {
      card.append(el('p', 'No assigned tickets yet.', 'muted'));
      return card;
    }
    for (const entry of bars) {
      const row = el('div', undefined, 'wk-bar-row wk-bar-stacked');
      const track = el('div', undefined, 'wk-track');
      const open = el('span', undefined, 'wk-fill wk-fill-doing');
      open.style.width = entry.openShare + '%';
      const done = el('span', undefined, 'wk-fill wk-fill-done');
      done.style.width = entry.doneShare + '%';
      track.append(open, done);
      row.append(el('span', entry.owner + (entry.kind === 'agent' ? ' 🤖' : '')), track, el('small', entry.open + 'd open · ' + entry.done + 'd done · ' + entry.items + ' tickets', 'wk-bar-note'));
      card.append(row);
    }
    return card;
  }

  function burndownChart(work) {
    const card = chartCard('Burndown', 'Remaining working days: ideal vs actual');
    if (!work.burndown.length) {
      card.append(el('p', 'Needs scheduled tickets. Press Auto-schedule in Project setup.', 'muted'));
      return card;
    }
    const width = 520;
    const height = 220;
    const paths = burndownPaths(work.burndown, { width, height });
    const chart = svg('svg', { viewBox: '0 0 ' + width + ' ' + height, width, height, role: 'img', class: 'wk-burndown' });
    chart.append(svg('title', {}, 'Burndown from ' + work.burndown[0].date + ' to ' + work.burndown.at(-1).date));
    chart.append(svg('line', { x1: 30, x2: 30, y1: 30, y2: height - 30, class: 'wk-axis-line' }));
    chart.append(svg('line', { x1: 30, x2: width - 30, y1: height - 30, y2: height - 30, class: 'wk-axis-line' }));
    chart.append(svg('text', { x: 4, y: 34, class: 'wk-axis' }, String(Math.round(paths.max))));
    chart.append(svg('text', { x: 4, y: height - 30, class: 'wk-axis' }, '0'));
    chart.append(svg('text', { x: 30, y: height - 12, class: 'wk-axis' }, shortDate(work.burndown[0].date)));
    chart.append(svg('text', { x: width - 30, y: height - 12, 'text-anchor': 'end', class: 'wk-axis' }, shortDate(work.burndown.at(-1).date)));
    chart.append(svg('path', { d: paths.ideal, class: 'wk-line-ideal', fill: 'none' }));
    chart.append(svg('path', { d: paths.actual, class: 'wk-line-actual', fill: 'none' }));
    const wrap = el('div', undefined, 'wk-gantt-wrap');
    wrap.append(chart);
    const legend = el('p', 'Dashed = ideal · Solid = actual', 'muted');
    card.append(wrap, legend);
    return card;
  }

  // ── Intake ──

  function optionToggle(project, key, label, hint) {
    const wrap = el('label', undefined, 'wk-check');
    const box = input('checkbox');
    box.checked = project[key] === undefined ? key === 'autopilot' : Boolean(project[key]);
    box.addEventListener('change', async () => {
      if (!(await act({ action: 'set_options', [key]: box.checked }, 'Option saved.'))) box.checked = !box.checked;
    });
    const text = el('span');
    text.append(el('b', label), el('small', hint));
    wrap.append(box, text);
    return wrap;
  }

  function intakeView(project) {
    const box = el('div', undefined, 'wk-intake');
    const closed = ['COMPLETED', 'ARCHIVED'].includes(project.status);
    if (project.mode !== 'human') {
      const options = el('div', undefined, 'wk-options');
      options.append(
        el('h4', 'Automation'),
        optionToggle(project, 'autopilot', 'Autopilot', 'Accept and close automatically once every draft has an approving review from a different model and no issues are open.'),
        optionToggle(project, 'auto_approve', 'Start agents automatically', 'Opt-in. Off by default: you approve the exact plan before any agent starts.')
      );
      box.append(options);
    }
    if (project.mode === 'ai') {
      box.append(el('p', 'AI projects take their tickets from the approved plan and from documents the agents deliver. Use a hybrid or human project to add tickets by hand.', 'muted'));
      box.append(autoscheduleButton());
      return box;
    }

    const form = el('form', undefined, 'wk-form');
    form.append(el('h4', 'Team'), el('p', 'People who can own tickets. Names in your pasted list are added automatically.', 'muted'));
    const team = teamEditor(state.intakeDraft.team || project.team || []);
    team.element.addEventListener('input', () => { state.intakeDraft.team = team.get(); });
    const saveTeam = button('Save team', () => act({ action: 'set_team', team: team.get() }, 'Team saved.'));
    form.append(team.element, saveTeam);

    const text = el('textarea');
    text.rows = 8;
    text.maxLength = 60000;
    text.value = state.intakeDraft.text;
    text.placeholder = '- [ ] Draft the brief\n- Review the budget\n\nor a table:\nTask | Owner | Days | After | Priority\nWrite spec | Amy | 2 | | HIGH';
    text.addEventListener('input', () => { state.intakeDraft.text = text.value; });
    const source = select([['intake', 'Requirements / task list'], ['document', 'Document text']], state.intakeDraft.source);
    source.addEventListener('change', () => { state.intakeDraft.source = source.value; });
    const replace = input('checkbox');
    replace.checked = state.intakeDraft.replace;
    replace.addEventListener('change', () => { state.intakeDraft.replace = replace.checked; });
    const replaceLabel = el('label', undefined, 'wk-check');
    replaceLabel.append(replace, el('span', 'Replace generated tickets (open, untouched intake/document tickets are removed first)'));

    form.append(
      el('h4', 'Generate tickets'),
      field('Paste a checklist, bullet list or table, or document text', text, 'wk-wide'),
      field('Treat this as', source),
      replaceLabel
    );
    const generate = el('button', 'Generate tickets', 'btn-primary');
    generate.type = 'submit';
    generate.disabled = closed;
    form.append(generate, autoscheduleButton());
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!text.value.trim()) {
        setFeedback('Paste some task information first.', true);
        return;
      }
      const payload = { action: 'intake_generate', tasks_text: text.value, team: team.get(), replace: replace.checked, source: source.value };
      if (await act(payload, 'Tickets generated and scheduled.')) {
        state.intakeDraft.text = '';
        state.intakeDraft.team = null;
        render();
      }
    });
    box.append(form);
    return box;
  }

  const api = {
    update,
    render,
    teamEditor,
    parseIso,
    todayIso,
    isAgentDriven,
    canEdit,
    laneFor,
    lanesWithItems,
    sortItems,
    ganttLayout,
    burndownPaths,
    donutSegments,
    workloadBars,
    cleanTeam,
    parseDays,
    ticketPatch,
    isOverdue,
    STATES,
    DOWNLOADS
  };
  return api;
})();

if (typeof module !== 'undefined') module.exports = WorkUI;
