"""Work items: one record type behind tickets, kanban, gantt and charts.

AI, human and hybrid projects all store the same items in project['management']['items'].
Views are pure derivations, so they cannot drift from the records, and they need no model call.
"""
from datetime import date, datetime, timedelta
import re
import uuid

PRIORITIES = ('HIGH', 'NORMAL', 'LOW')
WORK_STATES = ('TODO', 'DOING', 'BLOCKED', 'REVIEW')
TYPES = ('task', 'story', 'bug', 'risk', 'milestone')
LANES = (('TODO', 'To do'), ('DOING', 'Working on it'), ('BLOCKED', 'Stuck'),
         ('REVIEW', 'On review'), ('DONE', 'Done'))
MODES = ('ai', 'human', 'hybrid')
MAX_ITEMS = 300


def new_id():
    return 'ITEM-' + uuid.uuid4().hex[:12]


def parse_date(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.strptime(value, '%Y-%m-%d').date()
    except ValueError:
        return None
    return parsed if parsed.isoformat() == value else None


def is_workday(day):
    return day.weekday() < 5


def next_workday(day):
    while not is_workday(day):
        day += timedelta(days=1)
    return day


def add_workdays(start, days):
    """Last day of a task that starts on `start` and needs `days` working days."""
    day = next_workday(start)
    for _ in range(max(1, int(days)) - 1):
        day = next_workday(day + timedelta(days=1))
    return day


def normalise(item):
    """Fill defaults so records created by older versions and by every project mode render alike."""
    item.setdefault('kind', 'deliverable')
    item.setdefault('type', 'milestone' if item['kind'] == 'milestone' else 'task')
    item.setdefault('description', '')
    item.setdefault('criteria', '')
    item.setdefault('owner', 'Unassigned')
    item.setdefault('assignee_kind', 'agent' if str(item.get('owner', '')).startswith('cp-') else 'human')
    item.setdefault('priority', 'NORMAL')
    item.setdefault('work_status', 'TODO')
    item.setdefault('estimate_days', 1)
    item.setdefault('depends_on', [])
    item.setdefault('labels', [])
    item.setdefault('source', 'manual')
    return item


def display_state(item):
    return 'DONE' if item.get('status') == 'ACCEPTED' else item.get('work_status', 'TODO')


def clean_dependencies(items):
    """Drop references to missing items and any edge that would close a cycle. Returns warnings."""
    ids = {item['id'] for item in items}
    warnings = []
    graph = {}
    for item in items:
        keep = []
        for dep in item.get('depends_on', []):
            if dep == item['id'] or dep not in ids:
                continue
            graph[item['id']] = keep + [dep]
            if reaches(graph, dep, item['id']):
                warnings.append('Dependency loop removed: "' + item['title'] + '"')
                graph[item['id']] = keep
                continue
            keep.append(dep)
        graph[item['id']] = keep
        item['depends_on'] = keep
    return warnings


def reaches(graph, start, target):
    seen, stack = set(), [start]
    while stack:
        node = stack.pop()
        if node == target:
            return True
        if node in seen:
            continue
        seen.add(node)
        stack.extend(graph.get(node, []))
    return False


def schedule(items, start, level=True):
    """Assign start/due dates from estimates and dependencies; pinned dates are kept.

    With `level`, one assignee works one item at a time, which is what makes
    human workloads and agent hand-offs realistic on the gantt chart.
    """
    start = next_workday(start)
    warnings = clean_dependencies(items)
    by_id = {item['id']: item for item in items}
    order, state = [], {}

    def visit(item):
        if state.get(item['id']):
            return
        state[item['id']] = 1
        for dep in item['depends_on']:
            visit(by_id[dep])
        order.append(item)

    rank = {name: index for index, name in enumerate(PRIORITIES)}
    for item in sorted(items, key=lambda i: (rank.get(i.get('priority', 'NORMAL'), 1))):
        visit(item)
    free_from = {}
    for item in order:
        fixed = item.get('pinned') or item.get('status') == 'ACCEPTED'
        if fixed and parse_date(item.get('start_date')) and parse_date(item.get('due_date')):
            continue
        earliest = start
        for dep in item['depends_on']:
            finish = parse_date(by_id[dep].get('due_date'))
            if finish:
                earliest = max(earliest, next_workday(finish + timedelta(days=1)))
        lane = item.get('owner', 'Unassigned')
        if level and lane != 'Unassigned' and lane in free_from:
            earliest = max(earliest, free_from[lane])
        if item.get('type') == 'milestone' or item.get('kind') == 'milestone':
            finishes = [parse_date(by_id[d].get('due_date')) for d in item['depends_on']]
            item['start_date'] = item['due_date'] = max([f for f in finishes if f] or [earliest]).isoformat()
            continue
        due = add_workdays(earliest, item.get('estimate_days', 1))
        item['start_date'], item['due_date'] = next_workday(earliest).isoformat(), due.isoformat()
        if lane != 'Unassigned':
            free_from[lane] = next_workday(due + timedelta(days=1))
    return warnings


SPLIT = re.compile(r'\s*\|\s*|\t')


HEADERS = {'task': 'title', 'title': 'title', 'name': 'title', 'ticket': 'title', 'owner': 'assignee', 'assignee': 'assignee', 'who': 'assignee',
           'responsible': 'assignee', 'days': 'days', 'duration': 'days', 'estimate': 'days', 'effort': 'days', 'after': 'depends',
           'depends': 'depends', 'dependson': 'depends', 'dependency': 'depends', 'dependencies': 'depends', 'predecessor': 'depends',
           'priority': 'priority', 'type': 'type', 'notes': 'description', 'description': 'description'}


def parse_work_items(text, team=None):
    """Turn pasted text (checklists, bullets, `title | assignee | days | depends | priority | type` rows) into items.

    Dependencies are row numbers (`2,3`) or titles. Nothing is invented: unparseable lines are reported.
    """
    members = {member['name'].lower(): member['name'] for member in (team or [])}
    rows, warnings = [], []
    columns = []
    lines = (text or '').splitlines()
    for number, raw in enumerate(lines, 1):
        line = raw.strip()
        if not line or set(line) <= set('|-: ') or line.startswith('#') and '|' not in line:
            continue
        following = next((l.strip() for l in lines[number:] if l.strip()), '')
        guessed = [HEADERS.get(re.sub(r'[^a-z]', '', cell.lower()), '') for cell in SPLIT.split(line.strip('|'))]
        separated = '|' in following and set(following) <= set('|-: ') and '-' in following
        bare = '|' in line and not columns and guessed[0] == 'title' and sum(1 for g in guessed if g) >= 2
        if separated or bare:
            columns = guessed
            continue  # table header row: remember what each column means
        line = re.sub(r'^(?:[-*+]\s+(?:\[[ xX]\]\s*)?|\d+[.)]\s+|\[[ xX]\]\s*)', '', line)
        done = bool(re.match(r'^\s*[-*+]\s+\[[xX]\]', raw))
        cells = [cell.strip() for cell in SPLIT.split(line.strip('|')) if cell.strip() != '' or '|' in line]
        title = cells[0] if cells else ''
        if not title or len(title) > 200:
            warnings.append('Line ' + str(number) + ' skipped: missing or overlong title')
            continue
        row = {'title': title, 'line': number, 'done': done, 'assignee': '', 'days': 1,
               'depends': [], 'priority': 'NORMAL', 'type': 'task', 'description': ''}
        for position, cell in enumerate(cells[1:], 1):
            low = cell.lower()
            field = columns[position] if position < len(columns) else ''
            if not cell:
                continue
            if field == 'assignee':
                row['assignee'] = members.get(low, cell[:60])
            elif field == 'days' and re.fullmatch(r'\d+(?:\.\d+)?\s*d?(?:ays?)?', low):
                row['days'] = max(1, round(float(re.sub(r'[^\d.]', '', low))))
            elif field == 'depends':
                row['depends'] += [part.strip().lstrip('#') for part in re.split(r'[,;]', re.sub(r'^(after|depends)(\s+on)?\s*:?\s*', '', cell, flags=re.I)) if part.strip().lstrip('#')]
            elif field == 'priority' and low in {'high', 'normal', 'low'}:
                row['priority'] = low.upper()
            elif field == 'type' and low in TYPES:
                row['type'] = low
            elif field == 'description':
                row['description'] = (row['description'] + ' ' + cell).strip()
            elif low in {'high', 'normal', 'low'}:
                row['priority'] = low.upper()
            elif low in TYPES:
                row['type'] = low
            elif re.fullmatch(r'\d+(?:\.\d+)?\s*d(?:ays?)?|\d+(?:\.\d+)?', low):
                row['days'] = max(1, round(float(re.sub(r'[^\d.]', '', low))))
            elif low.startswith(('after', 'depends', '#')):
                refs = re.sub(r'^(after|depends)(\s+on)?\s*:?\s*', '', cell, flags=re.I)
                row['depends'] += [part.strip().lstrip('#') for part in refs.split(',') if part.strip().lstrip('#')]
            elif low in members:
                row['assignee'] = members[low]
            elif not row['assignee'] and (not members or low in members) and len(cell) <= 60:
                row['assignee'] = cell
            else:
                row['description'] = (row['description'] + ' ' + cell).strip()
        rows.append(row)
    if len(rows) > MAX_ITEMS:
        warnings.append('Only the first ' + str(MAX_ITEMS) + ' rows were used')
        rows = rows[:MAX_ITEMS]
    return rows, warnings


def rows_to_items(rows, source, now, default_owner='Unassigned', assignee_kind='human'):
    items = []
    for row in rows:
        items.append(normalise({'id': new_id(), 'kind': 'milestone' if row['type'] == 'milestone' else 'ticket',
            'type': row['type'], 'title': row['title'], 'description': row['description'],
            'criteria': row['description'] or 'Owner confirms this is complete.',
            'owner': row['assignee'] or default_owner, 'assignee_kind': assignee_kind,
            'estimate_days': 0 if row['type'] == 'milestone' else row['days'], 'priority': row['priority'],
            'status': 'ACCEPTED' if row['done'] else 'OPEN', 'work_status': 'TODO', 'source': source,
            'created_at': now, '_depends': row['depends'], '_line': row['line']}))
    by_index = {index: item for index, item in enumerate(items, 1)}
    by_title = {item['title'].lower(): item for item in items}
    for item in items:
        for ref in item.pop('_depends'):
            target = by_index.get(int(ref)) if ref.isdigit() else by_title.get(ref.lower())
            if target and target is not item:
                item['depends_on'].append(target['id'])
        item.pop('_line')
    return items


def extract_from_document(text):
    """Find action items in a delivered document: checklist lines and bullets under task-like headings."""
    heading = re.compile(r'^#{1,6}\s*(.*(?:task|action|next step|to-?do|milestone|deliverable|plan|step)s?.*)$', re.I)
    capture, found = False, []
    for raw in (text or '').splitlines():
        if raw.lstrip().startswith('#'):
            capture = bool(heading.match(raw.strip()))
            continue
        checklist = re.match(r'^\s*[-*+]\s+\[[ xX]\]\s+(.+)$', raw)
        bullet = re.match(r'^\s*(?:[-*+]|\d+[.)])\s+(.+)$', raw)
        if checklist or (capture and bullet):
            found.append(raw)
    return found[:MAX_ITEMS]


def apply_schedule(project, today=None):
    management = project.setdefault('management', {'items': [], 'versions': [], 'batches': []})
    anchor = parse_date(project.get('start_date')) or today or date.today()
    items = [normalise(item) for item in management['items']]
    return schedule(items, anchor)


def derive(project, today=None):
    """Everything the UI and downloads show, computed from the stored items."""
    today = today or date.today()
    items = [normalise(dict(item)) for item in project.get('management', {}).get('items', [])]
    warnings = clean_dependencies(items)
    rows = []
    for item in items:
        state = display_state(item)
        due = parse_date(item.get('due_date'))
        overdue = bool(due and due < today and state != 'DONE')
        rows.append(dict(item, state=state, overdue=overdue,
                         blocked_by=[d for d in item['depends_on'] if next((i for i in items if i['id'] == d and display_state(i) != 'DONE'), None)]))
        if overdue:
            warnings.append('Overdue: "' + item['title'] + '" was due ' + item['due_date'])
        if item['assignee_kind'] == 'human' and item['owner'] == 'Unassigned' and state != 'DONE':
            warnings.append('Unassigned: "' + item['title'] + '"')
    lanes = [{'state': key, 'label': label, 'items': [r['id'] for r in rows if r['state'] == key]} for key, label in LANES]
    dated = [r for r in rows if parse_date(r.get('start_date')) and parse_date(r.get('due_date'))]
    gantt = {'rows': [{'id': r['id'], 'title': r['title'], 'owner': r['owner'], 'start': r['start_date'], 'due': r['due_date'],
                       'state': r['state'], 'type': r['type'], 'depends_on': r['depends_on']} for r in dated],
             'start': min((r['start_date'] for r in dated), default=None),
             'end': max((r['due_date'] for r in dated), default=None)}
    total = sum(1 for r in rows if r['type'] != 'milestone') or 0
    done = sum(1 for r in rows if r['state'] == 'DONE' and r['type'] != 'milestone')
    workload = {}
    for r in rows:
        if r['type'] == 'milestone':
            continue
        bucket = workload.setdefault(r['owner'], {'open_days': 0, 'done_days': 0, 'items': 0, 'kind': r['assignee_kind']})
        bucket['items'] += 1
        bucket['done_days' if r['state'] == 'DONE' else 'open_days'] += r.get('estimate_days', 1)
    stats = {'total': len(rows), 'done': done, 'percent': round(100 * done / total) if total else 0,
             'overdue': sum(1 for r in rows if r['overdue']), 'blocked': sum(1 for r in rows if r['state'] == 'BLOCKED'),
             'by_state': {key: sum(1 for r in rows if r['state'] == key) for key, _ in LANES},
             'by_priority': {key: sum(1 for r in rows if r['priority'] == key) for key in PRIORITIES}}
    return {'items': rows, 'kanban': lanes, 'gantt': gantt, 'stats': stats, 'workload': workload,
            'burndown': burndown(rows, today), 'warnings': warnings[:50], 'mode': project.get('mode', 'ai')}


def burndown(rows, today):
    """Ideal versus actual remaining work-days between the first start and last due date."""
    work = [r for r in rows if r['type'] != 'milestone' and parse_date(r.get('start_date')) and parse_date(r.get('due_date'))]
    if not work:
        return []
    first = min(parse_date(r['start_date']) for r in work)
    last = max(parse_date(r['due_date']) for r in work)
    total = sum(r.get('estimate_days', 1) for r in work)
    span = max(1, (last - first).days)
    points = []
    for offset in range(span + 1):
        day = first + timedelta(days=offset)
        finished = sum(r.get('estimate_days', 1) for r in work
                       if r['state'] == 'DONE' and (parse_date((r.get('accepted_at') or '')[:10]) or today) <= day)
        points.append({'date': day.isoformat(), 'ideal': round(total * (1 - offset / span), 2),
                       'actual': (total - finished) if day <= today else None})
    return points
