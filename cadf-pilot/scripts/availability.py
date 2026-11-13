"""Observed per-route availability; never estimates a provider's credit balance."""
import providers
import workflow


def route(job):
    return providers.room_for_model(job.get('model'))


def failure_kind(text):
    text = text.lower()
    if any(term in text for term in ['max-ai-credits', 'credit limit', 'budget']):
        return 'BUDGET_BLOCKED'
    if any(term in text for term in ['quota', 'resource_exhausted', 'rate limit', 'rate-limit', 'credits exhausted', 'premium request', 'too many requests', '429']):
        return 'QUOTA_LIMITED'
    if any(term in text for term in ['authentication', 'unauthenticated', 'login required', 'unauthorized', 'sign in', 'not logged in', 'copilot login', '/login']):
        return 'AUTH_REQUIRED'
    if any(term in text for term in ['connection refused', 'network unavailable', 'could not resolve', 'no such file']):
        return 'UNAVAILABLE'
    return 'ERROR'


def snapshot(jobs, worker):
    result = {}
    for key in [*workflow.PROFILES, 'cp-auto']:
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
    return result
