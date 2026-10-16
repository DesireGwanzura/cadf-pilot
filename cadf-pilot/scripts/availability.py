"""Observed per-route availability; never estimates a provider's credit balance."""
import workflow


def route(job):
    if job.get('worker') == 'codex':
        return 'codex'
    return next((key for key, value in workflow.PROFILES.items()
                 if value[1] == job.get('model')), 'antigravity')


def failure_kind(text):
    text = text.lower()
    if any(term in text for term in ['paid-credit', 'credit settings', 'no-credit setting', 'budget check']):
        return 'BUDGET_BLOCKED'
    if any(term in text for term in ['quota', 'resource_exhausted', 'rate limit', 'credits exhausted']):
        return 'QUOTA_LIMITED'
    if any(term in text for term in ['authentication', 'unauthenticated', 'login required', 'unauthorized', 'sign in']):
        return 'AUTH_REQUIRED'
    if any(term in text for term in ['connection refused', 'network unavailable', 'could not resolve', 'no such file']):
        return 'UNAVAILABLE'
    return 'ERROR'


def snapshot(jobs, worker):
    result = {}
    for key in ['codex', 'antigravity', *workflow.PROFILES]:
        matching = [j for j in jobs if route(j) == key]
        completed = [j for j in matching if j['status'] in {'SUCCEEDED', 'FAILED', 'INTERRUPTED'}]
        last = max(completed, key=lambda j: j.get('finished_at', j['created_at']), default=None)
        status = ('AVAILABLE' if last['status'] == 'SUCCEEDED' else
                  last.get('failure_kind') or failure_kind(last.get('error', ''))) if last else 'UNTESTED'
        active = next((j for j in matching if j['status'] in {'RUNNING', 'APPROVED'}), None)
        result[key] = {'status': status, 'checked_at': last.get('finished_at') if last else None,
                       'detail': last.get('error', '') if last else '',
                       'job_id': last['id'] if last else None, 'active': active['status'] if active else None,
                       'worker_online': worker.get('state') in {'IDLE', 'RUNNING'},
                       'remaining_credits': None, 'quota_reset_at': None}
    result['grok'] = {'status': 'MANUAL', 'worker_online': False, 'remaining_credits': None}
    return result
