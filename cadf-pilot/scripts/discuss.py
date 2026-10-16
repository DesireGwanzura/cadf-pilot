#!/usr/bin/env python3
"""Record an attributed agent handoff in the shared conversation; never dispatch."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import uuid
import serve

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--list-projects',action='store_true')
    parser.add_argument('--project')
    parser.add_argument('--sender',choices=['Codex','Antigravity','ChatGPT','Gemini'])
    parser.add_argument('--to',default='You and the team')
    parser.add_argument('--file',type=Path)
    args=parser.parse_args()
    if args.list_projects:
        for project in json.loads(serve.read_file(serve.ROOT,'.agents/PROJECTS.json'))['projects']:
            print(project['id']+'  '+project['name'])
        return
    if not args.project or not args.sender or not args.file: parser.error('--project, --sender and --file are required')
    content=args.file.read_text()
    if not content.strip() or len(content)>30000: parser.error('Handoff must contain 1–30000 characters')
    with serve.project_transaction(serve.ROOT) as store:
        if not any(p['id']==args.project for p in store['projects']): parser.error('Unknown project ID')
        message={'id':'MSG-'+uuid.uuid4().hex[:12],'project_id':args.project,
                 'at':datetime.now(timezone.utc).isoformat(),'sender':args.sender,'recipient':args.to,
                 'content':content,'source':'Local handoff; author self-reported as '+args.sender}
        store['messages'].append(message)
        serve.record_event(store,args.project,'handoff',args.sender+' added a local handoff',args.sender+' (self-reported)')
    print('Handoff recorded. No agent reply or external message was triggered.')

if __name__=='__main__':main()
