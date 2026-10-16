"""Owner-authorized remote runner leases. Expired work is never automatically retried."""
from datetime import datetime, timezone
import json
import secrets
import time
import threading
import serve
import scheduling
import workflow

LOCK = threading.Lock()


def handle(payload, root):
    action = payload.get('action')
    now = datetime.now(timezone.utc).isoformat()
    with LOCK:
        if action == 'claim':
            with serve.project_transaction(root) as store:
                for job in store['jobs']:
                    if job['status'] in {'RUNNING', 'CANCEL_REQUESTED'}:
                        if job.get('lease_at') and time.time() - job['lease_at'] > 90:
                            job.update(status='INTERRUPTED', error='Runner connection expired. Inspect before an explicit retry.')
                            serve.record_event(store, job['project_id'], 'job_interrupted', job['error'], 'CADF orchestrator')
                            if job.get('workflow'):
                                project = next(p for p in store['projects'] if p['id'] == job['project_id'])
                                workflow.finish(store, project, job, 'INTERRUPTED', '', now, job['error'])
                        else:
                            return {'job': None}
                candidate = next((row for row in scheduling.queue(store) if row['eligible']), None)
                job = next((j for j in store['jobs'] if candidate and j['id'] == candidate['id']), None)
                if not job:
                    heartbeat(root, 'IDLE', now)
                    return {'job': None}
                job.update(status='RUNNING', started_at=now, attempts=job['attempts'] + 1,
                           runner_lease=secrets.token_urlsafe(32), lease_at=time.time())
                serve.record_event(store, job['project_id'], 'job_started', job['id'] + ' leased to owner Mac', 'CADF orchestrator')
                heartbeat(root, 'RUNNING', now, job['id'])
                return {'job': dict(job)}
        with serve.project_transaction(root) as store:
            job = next((j for j in store['jobs'] if j['id'] == payload.get('job_id')), None)
            if not job or not secrets.compare_digest(job.get('runner_lease', ''), payload.get('lease', '')) or not job.get('runner_lease'):
                raise ValueError('Runner lease not accepted')
            project = next(p for p in store['projects'] if p['id'] == job['project_id'])
            if action in {'context', 'dispatched'}:
                job['lease_at'] = time.time()
                if action == 'dispatched' and job['status'] == 'RUNNING' and not job.get('dispatched_at'):
                    job['dispatched_at'] = now
                    serve.record_event(store, job['project_id'], 'request_dispatched', job['id'] + ' sent to Mac CLI', 'CADF orchestrator')
                heartbeat(root, 'RUNNING', now, job['id'])
                # The agent receives only job.prompt, never this full project record.
                return {'job': dict(job), 'project': dict(project)}
            if action != 'finish':
                raise ValueError('Unknown runner action')
            if job['status'] not in {'RUNNING', 'CANCEL_REQUESTED'}:
                return {'status': job['status']}
            status = payload.get('status')
            result = payload.get('result', '')
            error = payload.get('error', '')
            if status not in {'SUCCEEDED', 'FAILED', 'PAUSED'} or not isinstance(result, str) or len(result) > 30000 or not isinstance(error, str):
                raise ValueError('Invalid runner result')
            saved = dict(job)
        from orchestrator import Worker
        worker = Worker(root)
        directory = worker.runtime / 'runs' / saved['id']
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        (directory / 'result.txt').write_text(result)
        worker.finish(saved, status, error[:1000])
        heartbeat(root, 'IDLE', now)
        return {'status': 'recorded'}


def heartbeat(root, state, now, job=None):
    runtime = root / '.cadf-runtime'
    runtime.mkdir(mode=0o700, exist_ok=True)
    path = runtime / 'remote-worker.tmp'
    path.write_text(json.dumps({'state': state, 'at': now, 'job_id': job,
                                'notice': 'Owner Mac runner connected. Model access uses existing local accounts.'}))
    path.replace(runtime / 'worker.json')
