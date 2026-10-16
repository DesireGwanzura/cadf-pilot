"""Connect the owner's existing local CLIs to an authenticated hosted CADF queue."""
import argparse
import json
from pathlib import Path
import time
from urllib.request import Request, urlopen
from urllib.parse import urlsplit
from orchestrator import Worker


class RemoteWorker(Worker):
    def __init__(self, root, origin, key):
        super().__init__(root)
        self.origin = origin
        self.key = key
        self.token = ''
        self.current = None

    def rpc(self, payload):
        if not self.token:
            request = Request(self.origin + '/api/snapshot', headers={'Authorization': 'Bearer ' + self.key})
            with urlopen(request, timeout=20) as response:
                self.token = json.load(response)['write_token']
        request = Request(self.origin + '/api/runner', data=json.dumps(payload).encode(), headers={
            'Authorization': 'Bearer ' + self.key, 'Origin': self.origin,
            'X-CADF-Token': self.token, 'Content-Type': 'application/json'})
        try:
            with urlopen(request, timeout=20) as response:
                return json.load(response)
        except Exception:
            self.token = ''
            raise

    def payload(self, action, job):
        return {'action': action, 'job_id': job['id'], 'lease': job['runner_lease']}

    def claim(self):
        self.current = self.rpc({'action': 'claim'})['job']
        return self.current

    def job_context(self, job):
        value = self.rpc(self.payload('context', job))
        return value['job'], value['project']

    def dispatched(self, job):
        self.rpc(self.payload('dispatched', job))

    def finish(self, job, status, error=''):
        result_path = self.runtime / 'runs' / job['id'] / 'result.txt'
        result = result_path.read_text(errors='replace')[:30000] if status == 'SUCCEEDED' and result_path.exists() else ''
        payload = dict(self.payload('finish', job), status=status, error=error, result=result)
        try:
            self.rpc(payload)
        except Exception:
            # Retain outcome locally; never repeat the provider request on uncertainty.
            pending = self.runtime / ('pending-' + job['id'] + '.json')
            pending.write_text(json.dumps(payload))
            pending.chmod(0o600)
            raise

    def run(self):
        import fcntl, os
        descriptor = os.open(str(self.runtime / 'worker.lock'), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, 'w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            while not self.stopping.is_set():
                try:
                    for pending in self.runtime.glob('pending-JOB-*.json'):
                        self.rpc(json.loads(pending.read_text()))
                        pending.unlink()
                    job = self.claim()
                    if job:
                        self.execute(job)
                    else:
                        self.stopping.wait(5)
                except Exception:
                    self.heartbeat('OFFLINE')
                    self.stopping.wait(15)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', required=True)
    parser.add_argument('--key-file', type=Path, required=True)
    parser.add_argument('--workspace', type=Path, required=True)
    args = parser.parse_args()
    url = urlsplit(args.origin)
    if url.scheme != 'https' or url.path or not url.netloc:
        parser.error('Exact HTTPS workspace origin required')
    if args.key_file.stat().st_mode & 0o077:
        parser.error('Key must be owner-readable only')
    args.workspace.mkdir(parents=True, exist_ok=True, mode=0o700)
    worker = RemoteWorker(args.workspace, args.origin, args.key_file.read_text().strip())
    try:
        worker.run()
    except KeyboardInterrupt:
        worker.stopping.set()


if __name__ == '__main__':
    main()
