"""One-at-a-time, approval-gated planning jobs using existing account CLIs."""
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import threading
import time

import providers
import serve
import workflow
import availability
import scheduling


def worker_command(worker, directory, prompt, model=None):
    model = providers.selected_model(worker, model)
    if not providers.installed():
        raise ValueError('GitHub Copilot CLI is not installed or not signed in; run `copilot login`')
    return providers.command(prompt, model), providers.environment()


class Worker:
    def __init__(self, root):
        self.root = root.resolve()
        self.runtime = self.root / '.cadf-runtime'
        if self.runtime.is_symlink(): raise ValueError('Runtime symlink rejected')
        self.runtime.mkdir(mode=0o700, exist_ok=True)
        self.stopping = threading.Event()
        self.thread = None
        self.lock = None

    def heartbeat(self, state, job=None):
        data = {'at':datetime.now(timezone.utc).isoformat(), 'state':state, 'job_id':job,
                'notice':'One approved text-only Copilot job at a time. No automatic retries, publishing, or code changes.'}
        temporary = self.runtime / 'worker.tmp'
        temporary.write_text(json.dumps(data))
        os.replace(temporary,self.runtime/'worker.json')

    def start(self):
        descriptor=os.open(str(self.runtime/'worker.lock'), os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
        self.lock=os.fdopen(descriptor,'w')
        try: fcntl.flock(self.lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            self.lock.close(); raise RuntimeError('Another CADF worker already owns this workspace')
        with serve.project_transaction(self.root) as store:
            for job in store['jobs']:
                if job['status'] in {'RUNNING','CANCEL_REQUESTED'}:
                    job['status']='INTERRUPTED'; job['error']='Previous worker ended without a final outcome. No automatic retry.'
                    serve.record_event(store,job['project_id'],'job_interrupted',job['id']+' interrupted; inspect retained output','CADF orchestrator')
                    if job.get('workflow'):
                        project=next(p for p in store['projects'] if p['id']==job['project_id'])
                        workflow.finish(store,project,job,'INTERRUPTED','',datetime.now(timezone.utc).isoformat(),job['error'])
        self.thread=threading.Thread(target=self.loop,daemon=True); self.thread.start()

    def stop(self):
        self.stopping.set()
        if self.thread: self.thread.join(timeout=12)
        self.heartbeat('STOPPED')
        if self.lock: self.lock.close()

    def claim(self):
        with serve.project_transaction(self.root) as store:
            if any(j['status'] in {'RUNNING', 'CANCEL_REQUESTED'} for j in store['jobs']): return None
            candidate=next((row for row in scheduling.queue(store) if row['eligible']),None)
            job=next((j for j in store['jobs'] if candidate and j['id']==candidate['id']),None)
            if job:
                job['status']='RUNNING'; job['started_at']=datetime.now(timezone.utc).isoformat(); job['attempts']+=1
                serve.record_event(store,job['project_id'],'job_started',job['id']+' dispatched to '+job['worker'],'CADF orchestrator')
                return dict(job)
        return None

    def finish(self, job, status, error=''):
        with serve.project_transaction(self.root) as store:
            saved=next(j for j in store['jobs'] if j['id']==job['id'])
            if saved['status'] not in {'RUNNING','CANCEL_REQUESTED'}: return
            # A pause/cancel that raced process exit wins over completion.
            if saved['status']=='CANCEL_REQUESTED': status='PAUSED'
            saved.update(status=status,finished_at=datetime.now(timezone.utc).isoformat(),error=error[:1000])
            if status == 'FAILED': saved['failure_kind'] = availability.failure_kind(error)
            serve.record_event(store,job['project_id'],'job_finished',job['id']+': '+status,'CADF orchestrator')
            if job['kind'] == 'health': return
            if job.get('workflow'):
                project=next(p for p in store['projects'] if p['id']==job['project_id'])
                result=(self.runtime/'runs'/job['id']/'result.txt').read_text(errors='replace')[:30000] if status=='SUCCEEDED' else ''
                workflow.finish(store,project,job,status,result,saved['finished_at'],error)
                return
            if not any(m.get('reply_job_id')==job['id'] for m in store['messages']):
                sender=job.get('participant') or workflow.agent_name(job.get('model'))
                if status=='SUCCEEDED':
                    content=(self.runtime/'runs'/job['id']/'result.txt').read_text(errors='replace')[:30000]
                    source='Actual '+sender+' worker result'+(' · model '+job['model'] if job.get('model') else ' · provider default model')
                else:
                    content=sender+' did not finish this request. '+(error or status)+'. No automatic retry was started.'
                    sender='CADF coordinator';source='Recorded execution outcome'
                store['messages'].append({'id':'MSG-'+job['id'][4:],'project_id':job['project_id'],
                    'at':datetime.now(timezone.utc).isoformat(),'sender':sender,'recipient':'You and the team',
                    'content':content,'source':source,'reply_to':job.get('message_id'),'reply_excerpt':next((m['content'][:240] for m in store['messages'] if m['id']==job.get('message_id')),''),'reply_job_id':job['id'],'room':job.get('chat_room',job['worker'] if job['kind']=='chat' else 'team')})

    @staticmethod
    def terminate(process):
        if process.poll() is not None: return
        try: os.killpg(process.pid,signal.SIGTERM)
        except ProcessLookupError: return
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try: os.killpg(process.pid,signal.SIGKILL)
            except ProcessLookupError: pass
            process.wait(timeout=3)

    def job_context(self, job):
        store = json.loads(serve.read_file(self.root, '.agents/PROJECTS.json'))
        saved = next(j for j in store['jobs'] if j['id'] == job['id'])
        project = next(p for p in store['projects'] if p['id'] == saved['project_id'])
        return saved, project

    def dispatched(self, job):
        with serve.project_transaction(self.root) as store:
            saved = next(j for j in store['jobs'] if j['id'] == job['id'])
            saved['dispatched_at'] = datetime.now(timezone.utc).isoformat()
            serve.record_event(store, job['project_id'], 'request_dispatched', job['id']+' sent to CLI', 'CADF orchestrator')

    def execute(self, job):
        runs=self.runtime/'runs'
        directory=runs/job['id']
        process=None
        try:
            saved, project = self.job_context(job)
            if self.stopping.is_set() or saved['status']=='CANCEL_REQUESTED':
                self.finish(job,'PAUSED','Cancelled before launch; no provider call made.'); return
            if saved['status']!='RUNNING': return
            reason=scheduling.hold_reason(dict(saved,status='APPROVED'),project)
            if reason:
                self.finish(job,'FAILED','Dispatch preflight: '+reason); return
            if runs.is_symlink(): raise ValueError('Run directory symlink rejected')
            directory.mkdir(parents=True,mode=0o700,exist_ok=False)
            (directory/'BRIEF.md').write_text(job['prompt'])
            command,environment=worker_command(job['worker'],directory,job['prompt'],job.get('model'))
            with (directory/'worker.log').open('wb') as output, (directory/'stderr.log').open('wb') as errors:
                process=subprocess.Popen(command,cwd=directory,env=environment,stdin=subprocess.DEVNULL,
                                         stdout=output,stderr=errors,start_new_session=True)
                self.dispatched(job)
                start=time.monotonic()
                while process.poll() is None:
                    self.heartbeat('RUNNING',job['id'])
                    saved, _ = self.job_context(job)
                    status = saved['status']
                    if status not in {'RUNNING', 'CANCEL_REQUESTED'}:
                        self.terminate(process); return
                    if self.stopping.is_set() or status=='CANCEL_REQUESTED':
                        self.terminate(process); self.finish(job,'PAUSED','Stopped by owner or dashboard shutdown; resuming requires a fresh approved job.'); return
                    if time.monotonic()-start > job['timeout_seconds'] or (directory/'worker.log').stat().st_size > 2_000_000:
                        self.terminate(process); self.finish(job,'FAILED','Time or output limit reached. No automatic retry.'); return
                    self.stopping.wait(1)
            log=(directory/'worker.log').read_text(errors='replace')+'\n'+(directory/'stderr.log').read_text(errors='replace')
            provider_limit = any(term in log.lower() for term in ['resource_exhausted', 'quota exceeded', 'quota exhausted', 'rate_limit_exceeded', 'rate limit', 'credits exhausted', 'premium request limit'])
            if provider_limit:
                self.finish(job,'FAILED','Provider quota/usage limit reported. Other models can still run. No paid fallback or automatic retry.'); return
            if process.returncode==0:
                (directory/'result.txt').write_text((directory/'worker.log').read_text(errors='replace')[:30000])
            result=directory/'result.txt'
            if process.returncode==0 and result.exists() and result.stat().st_size:
                self.finish(job,'SUCCEEDED')
            else:
                log=log.lower()
                quota=any(term in log for term in ['quota','resource_exhausted','rate limit','credits exhausted'])
                self.finish(job,'FAILED',('Provider quota/usage limit reported. Wait for reset or choose another model in a revised plan. ' if quota else 'Worker exited '+str(process.returncode)+'. ')+'Inspect local worker.log and stderr.log; no automatic retry or paid fallback.')
        except Exception as error:
            if process: self.terminate(process)
            self.finish(job,'FAILED',str(error))

    def loop(self):
        try:
            while not self.stopping.is_set():
                self.heartbeat('IDLE')
                job=self.claim()
                if job: self.execute(job)
                else: self.stopping.wait(2)
        except Exception as error:
            self.heartbeat('ERROR')
            (self.runtime/'worker-error.txt').write_text(str(error))
