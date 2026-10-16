"""Priority-aware queue and owner-visible readiness, without provider calls."""
from datetime import datetime, timezone
import availability
import workflow

AGING_SECONDS = 600


def approval_matches(plan):
    """Compare immutable scope with approval, ignoring execution bookkeeping."""
    try:
        return (bool(plan.get('approved_at')) and plan.get('approved_by') == 'Owner'
                and plan.get('approval_digest') == plan.get('digest')
                and workflow.plan_digest(workflow.validate_plan(plan)) == plan['approval_digest'])
    except (KeyError, TypeError, ValueError, AttributeError):
        return False


def hold_reason(job, project):
    if not project:
        return 'Project is missing'
    if job['status'] != 'APPROVED':
        return 'Waiting for approval or resume'
    if project['status'] != 'STARTED' and not (
            job['kind'] in {'chat', 'coordinate', 'health'} and project['status'] in {'SUBMITTED', 'QUEUED'}):
        return 'Project is paused or closed'
    if job.get('workflow'):
        coordination = project.get('coordination', {})
        if job.get('scope_revision') != coordination.get('revision'):
            return 'Project scope changed; prepare a new plan'
        if job['kind'] == 'assigned':
            plan = next((p for p in coordination.get('plans', []) if p['id'] == job.get('plan_id')), None)
            if not plan or plan['status'] != 'RUNNING' or not plan.get('approved_at') or plan.get('approved_by') != 'Owner' or plan.get('approval_digest') != plan.get('digest'):
                return 'Current plan approval is missing or invalid'
            task = next((t for t in plan['tasks'] if t['id'] == job.get('task_id')), None)
            if not task or task['status'] != 'RUNNING' or task.get('job_id') != job['id'] or task['owner'] != job['worker'] or task.get('model') != job.get('model'):
                return 'Job differs from the approved assignment'
            delivered = {t['id'] for t in plan['tasks'] if t['status'] == 'DELIVERED'}
            if not set(task['depends_on']).issubset(delivered):
                return 'Required deliverable is not available'
            if plan.get('scope_revision') != coordination.get('revision') or not approval_matches(plan):
                return 'Approved plan content changed; review a new plan'
    return ''


def queue(store, now=None):
    now = now or datetime.now(timezone.utc)
    projects = {p['id']: p for p in store['projects']}
    rows = []
    for index, job in enumerate(store.get('jobs', [])):
        if job['status'] not in {'APPROVED', 'REQUESTED', 'PAUSED', 'RUNNING', 'CANCEL_REQUESTED'}:
            continue
        project = projects.get(job['project_id'], {})
        try:
            created = datetime.fromisoformat(job['created_at'].replace('Z', '+00:00'))
            wait = max(0, int((now - created).total_seconds()))
        except (ValueError, TypeError, KeyError):
            wait = 0
        reason = hold_reason(job, project)
        rows.append({'id': job['id'], 'project_id': job['project_id'], 'project': project.get('name', 'Unknown project'),
                     'agent': job.get('participant') or ('Codex' if job['worker']=='codex' else job.get('model') or 'Antigravity'),
                     'kind': job['kind'], 'status': job['status'], 'priority': project.get('priority', 'NORMAL'),
                     'eligible': not reason, 'hold_reason': reason, 'aged': wait >= AGING_SECONDS,
                     'created_at': job.get('created_at', ''), '_order': index})
    rows.sort(key=lambda row: (
        0 if row['status'] in {'RUNNING', 'CANCEL_REQUESTED'} else 1 if row['eligible'] else 2,
        0 if row['aged'] else 1,
        0 if row['aged'] else {'HIGH': 0, 'NORMAL': 1, 'LOW': 2}.get(row['priority'], 1),
        row['created_at'], row['_order']))
    for row in rows:
        row.pop('_order')
    return rows


def readiness(store, worker, health):
    reports = []
    for project in store['projects']:
        coordination = project.get('coordination', {})
        plan = next(iter(reversed(coordination.get('plans', []))), None)
        checks = [{'label': 'Local worker', 'state': 'ready' if worker['state'] in {'IDLE', 'RUNNING'} else 'blocked',
                   'detail': 'Running locally' if worker['state'] in {'IDLE', 'RUNNING'} else 'Start the app with its worker'}]
        checks.append({'label': 'Project', 'state': 'blocked' if project['status'] in {'PAUSED', 'COMPLETED', 'ARCHIVED'} else 'ready',
                       'detail': project['status'].replace('_', ' ').capitalize()})
        valid = plan and plan['status'] in {'RUNNING','AWAITING_ACCEPTANCE','ACCEPTED'} and approval_matches(plan) and plan.get('scope_revision') == coordination.get('revision')
        checks.append({'label': 'Owner approval', 'state': 'ready' if valid else 'waiting',
                       'detail': 'Current plan approved' if valid else 'Review the proposed plan' if plan and plan['status']=='PROPOSED' else 'A current coordinator plan is needed'})
        routes = set()
        if plan:
            routes = {availability.route({'worker': t['owner'], 'model': t['model']}) for t in plan['tasks'] if t['status'] != 'DELIVERED'}
        else:
            routes = {'codex', 'ag-gemini-low'}
        for key in sorted(routes):
            observation = health.get(key, {})
            status = observation.get('status', 'UNTESTED')
            name = workflow.PROFILES[key][0] if key in workflow.PROFILES else 'Codex' if key == 'codex' else 'Antigravity default'
            checks.append({'label': name, 'state': 'ready' if status=='AVAILABLE' else 'waiting' if status=='UNTESTED' else 'blocked',
                           'detail': {'AVAILABLE':'Last check responded','QUOTA_LIMITED':'Last check reached a quota limit',
                                      'AUTH_REQUIRED':'Sign-in required','BUDGET_BLOCKED':'Budget protection blocked dispatch',
                                      'UNTESTED':'Availability has not been checked'}.get(status,'Last request needs attention')})
        reports.append({'project_id': project['id'], 'project': project['name'], 'checks': checks,
                        'state': 'blocked' if any(c['state']=='blocked' for c in checks) else 'waiting' if any(c['state']=='waiting' for c in checks) else 'ready'})
    return reports
