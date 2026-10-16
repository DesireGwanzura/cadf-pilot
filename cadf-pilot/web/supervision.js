'use strict';
const SupervisionUI=(()=>{
  let reply=null;
  const replyDrafts=new Map();let activeRoom=null;
  function roomChanged(){const key=$('chat-project').value+':'+$('chat-recipient').value;if(key===activeRoom)return;if(activeRoom)replyDrafts.set(activeRoom,{reply,kind:$('reply-kind').value});const saved=replyDrafts.get(key);reply=saved?.reply||null;activeRoom=key;$('reply-kind').value=saved?.kind||'message';$('reply-banner').hidden=!reply;$('reply-excerpt').textContent=reply?.text||'';$('reply-destination').textContent=$('reply-kind').value==='message'?'':destination($('reply-kind').value);syncMessageType();}
  let sending=false;
  const $=id=>document.getElementById(id);
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  function project(){return Store.get()?.projects.projects.find(p=>p.id===$('chat-project').value);}
  async function action(payload,pid=project()?.id){
    if(sending||!pid)return false;sending=true;
    const feedback=$('supervision-feedback');feedback.textContent='Saving…';
    try{await API.post({...payload,id:pid,expected_revision:Store.get().projects.revision},Store.get().write_token);await AppController.refresh();feedback.textContent='Saved.';WorkspaceUI.notify('Saved.');return true;}
    catch(error){feedback.textContent=error.message;WorkspaceUI.notify(error.message);return false;}finally{sending=false;}
  }
  function replyTo(message,kind){
    if(message.room&&[...$('chat-recipient').options].some(o=>o.value===message.room)){$('chat-recipient').value=message.room;$('chat-recipient').dispatchEvent(new Event('change'));}
    reply={id:message.id,project_id:message.project_id,kind:kind||(['decision_request','blocker'].includes(message.kind)?'decision':'message'),text:message.content};
    $('reply-kind').value=reply.kind;syncMessageType();
    $('reply-banner').hidden=false;
    $('reply-excerpt').textContent=message.sender+': '+message.content.slice(0,160);
    $('reply-destination').textContent=destination(reply.kind);
    SectionViews.select('conversation','Messages');
    $('chat-input').focus();
  }
  function destination(kind){return kind==='message'?'Reply linked to this message.':`This reply will be recorded in ${ {decision:'Decisions',requirement:'Requirements',update:'Progress',idea:'Ideas',blocker:'Blockers'}[kind] } and its versioned project file.`;}
  function payload(){return reply&&reply.project_id===project()?.id?{reply_to:reply.id,record_kind:$('reply-kind').value}:{record_kind:$('reply-kind').value};}
  function reset(){replyDrafts.delete(activeRoom);reply=null;$('reply-banner').hidden=true;$('reply-kind').value='message';$('reply-destination').textContent='';syncMessageType();}
  function decorate(card,msg,row=card){
    if(msg.reply_to){card.prepend(el('blockquote',msg.reply_excerpt||'Reply to message '+msg.reply_to,'message-quote'));}
    if(msg.kind&&msg.kind!=='message')card.append(el('small',msg.kind.replaceAll('_',' '),'record-label'));
    const actions=el('div',undefined,'message-actions');
    for(const [label,kind] of [['Reply',null],['Decision','decision'],['Requirement','requirement']]){const button=el('button',label);button.type='button';button.addEventListener('click',()=>replyTo(msg,kind));actions.append(button);}
    const info=el('button','i','message-info-button');info.type='button';info.setAttribute('aria-label','Message info');info.addEventListener('click',()=>messageInfo(msg));actions.append(info);
    const stamp=el('time',Fmt.date(msg.at),'message-time');stamp.dateTime=msg.at;actions.append(stamp);
    row.append(actions);
    if(msg.plan_id&&msg.kind==='plan'){const review=el('button','Review proposed plan →','plan-chat-link');review.addEventListener('click',()=>SectionViews.select('conversation','Plan review'));card.append(review);}
  }
  function planCard(p,plan){
    const card=el('article',undefined,'proposal-card');card.append(el('small','PLAN '+plan.status.replaceAll('_',' ')),el('h3',p.name),el('p',plan.summary));
    const table=el('table');const head=el('tr');for(const label of ['Work','Assigned agent','Deliverable'])head.append(el('th',label));table.append(head);
    for(const task of plan.tasks){const row=el('tr');row.append(el('td',task.title),el('td',task.owner+(task.model?' · '+task.model:'')),el('td',task.deliverable));table.append(row);}card.append(table);
    const details=el('details');details.append(el('summary','Review scope & acceptance'));
    for(const task of plan.tasks)details.append(el('h4',task.title),el('p',task.instructions),el('p','Done means: '+task.acceptance),el('small','Depends on: '+(task.depends_on.join(', ')||'none')));card.append(details);
    for(const blocker of plan.blockers)card.append(el('p',blocker,'proposal-blocker'));
    if(plan.status==='PROPOSED'){
      const approve=el('button','Approve plan & start team','btn-primary');approve.disabled=Boolean(plan.blockers.length);approve.addEventListener('click',()=>action({action:'approve_plan',plan_id:plan.id,digest:plan.digest},p.id));card.append(approve);
      const change=el('button','Discuss changes');change.addEventListener('click',()=>{$('chat-project').value=p.id;$('chat-project').dispatchEvent(new Event('change'));Router.activate('#conversation');const message=Store.get().projects.messages.find(m=>m.plan_id===plan.id);if(message)replyTo(message,'requirement');});card.append(change);
    }
    if(plan.status==='AWAITING_ACCEPTANCE'){
      const review=el('button','Review delivered artifacts →');review.addEventListener('click',()=>{WorkspaceUI.openProject(p.id);SectionViews.select('management','Deliverables');});card.append(review);
      const accept=el('button','Accept these deliverables');accept.addEventListener('click',()=>action({action:'accept_delivery',plan_id:plan.id},p.id));card.append(accept);
    }
    if(plan.status==='ACCEPTED'){const close=el('button','Close project','btn-primary');close.addEventListener('click',()=>action({action:'close_project'},p.id));card.append(close);}
    return card;
  }
  function renderPlans(host,p){host.replaceChildren();if(!p){host.append(el('p','Submit a project brief to begin. Your agents will propose the deliverables.','muted'));return;}
    const c=p.coordination;const active=(Store.get().projects.jobs||[]).some(j=>j.project_id===p.id&&['RUNNING','APPROVED','CANCEL_REQUESTED'].includes(j.status));
    host.append(el('small','CHATGPT ACCOUNT + GEMINI'),el('h3',c?c.state.replaceAll('_',' '):'Ready for coordinator planning'));
    if(!c||['NOT_PLANNED','NEEDS_REPLAN','BLOCKED'].includes(c.state)){const button=el('button','Ask coordinators to prepare a plan');button.disabled=active||['PAUSED','COMPLETED','ARCHIVED'].includes(p.status);button.addEventListener('click',()=>action({action:'prepare_plan'},p.id));host.append(button);}
    if(c?.state==='PLANNING')host.append(el('p','The coordinators are preparing your proposal. Execution waits for your review.'));
    if(p.status==='PAUSED'){const resume=el('button','Resume planning');resume.addEventListener('click',()=>action({action:'resume_planning'},p.id));host.append(resume);}
    if(['STARTED','SUBMITTED','QUEUED'].includes(p.status)&&active){const pause=el('button','Pause project');pause.addEventListener('click',()=>action({action:'pause'},p.id));host.append(pause);}
    const plan=c?.plans?.at(-1);if(plan)host.append(planCard(p,plan));
  }
  function update(data){
    roomChanged();const p=project();if(reply&&reply.project_id!==p?.id)reset();
    renderPlans($('chat-plan-review'),p);
    const needs=$('needs-you');for(const issue of p?.issues||[]){if(issue.status!=='OPEN')continue;const message=data.projects.messages.find(m=>m.id===issue.message_id);if(!message)continue;const box=el('article',undefined,'attention-item');box.append(el('b',issue.scope==='team'?'Team decision':'Agent issue'),el('p',message.content));const replyButton=el('button','Reply with a decision');replyButton.addEventListener('click',()=>replyTo(message,'decision'));box.append(replyButton);needs.append(box);}
    renderAvailability(data);renderOrchestration(data);
    const orch=$('coordinator-plans');orch.replaceChildren();for(const item of data.projects.projects){const block=el('div');renderPlans(block,item);orch.append(block);}
    const records=$('project-chat-records');records.replaceChildren();const selected=data.projects.projects.find(x=>x.id===$('pm-project').value);
    for(const v of [...(selected?.management?.versions||[])].reverse()){const item=el('details');item.append(el('summary',v.category+' v'+v.number+' · '+(v.room&&v.room!=='team'?'Private / '+v.room+' · ':'Team · ')+Fmt.date(v.at)),WorkspaceUI.downloadLinks(selected.id,v.id),el('pre',v.content));records.append(item);}
    if(!records.children.length)records.append(el('p','Decisions and requirement updates will appear here as you reply in chat.','muted'));
    const artifacts=$('agent-deliverables');artifacts.replaceChildren();for(const item of selected?.management?.items||[]){const card=el('article');card.append(el('h3',item.title),el('p',item.owner||'Coordinator assignment pending'),el('small',item.status==='ACCEPTED'?'Accepted':item.work_status||'Pending'));if(item.artifact){const detail=el('details');detail.append(el('summary','Open deliverable'),el('pre',item.artifact));card.append(detail,WorkspaceUI.downloadLinks(selected.id,item.id));}else card.append(el('p','No artifact delivered yet.','muted'));artifacts.append(card);}
    // Hide former user authoring/assignment controls; schedule edits stay available.
    document.querySelectorAll('.pm-table-toolbar>.btn-primary').forEach(n=>n.hidden=true);
    document.querySelectorAll('#visual-project-board input[aria-label^="Owner"],#visual-project-board select[aria-label^="Status"],#visual-project-board select[aria-label^="Move"]').forEach(n=>n.disabled=true);
    document.querySelectorAll('#projectcards button').forEach(n=>{if(['Start','Resume','Queue','Edit brief','Complete'].includes(n.textContent.trim()))n.hidden=true;});
    $('chat-compose-limit').textContent='Team execution starts only after you approve the coordinator plan. Direct messages request one bounded reply.';
    const schedule=$('project-schedule');if(document.activeElement?.closest('#project-schedule'))return;
    schedule.replaceChildren();if(selected){const fields={start_date:['Start date','date'],end_date:['End date','date'],priority:['Project priority','select']};for(const [key,[label,type]] of Object.entries(fields)){const wrap=el('label',label);const input=el(type==='select'?'select':'input');if(type==='select'){for(const v of ['LOW','NORMAL','HIGH'])input.append(new Option(v,v));}else input.type=type;input.value=selected[key]||'';input.disabled=['COMPLETED','ARCHIVED'].includes(selected.status);input.addEventListener('change',()=>action({action:'project_schedule',[key]:input.value},selected.id));wrap.append(input);schedule.append(wrap);}}
  }
  function richText(content){
    const root=el('div',undefined,'message-body');const lines=String(content).replace(/\r\n/g,'\n').split('\n');
    function inline(host,text){
      const pattern=/(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;let offset=0;
      for(const match of text.matchAll(pattern)){
        host.append(document.createTextNode(text.slice(offset,match.index)));const token=match[0];let child;
        if(token.startsWith('`'))child=el('code',token.slice(1,-1));
        else if(token.startsWith('**'))child=el('strong',token.slice(2,-2));
        else{const split=token.lastIndexOf('](');child=el('a',token.slice(1,split));child.href=token.slice(split+2,-1);child.target='_blank';child.rel='noopener noreferrer';}
        host.append(child);offset=match.index+token.length;
      }
      host.append(document.createTextNode(text.slice(offset)));
    }
    let index=0;
    while(index<lines.length){
      const line=lines[index];
      if(!line.trim()){index++;continue;}
      if(/^\s*```/.test(line)){
        const code=[];index++;while(index<lines.length&&!/^\s*```/.test(lines[index]))code.push(lines[index++]);
        if(index<lines.length)index++;const pre=el('pre');pre.append(el('code',code.join('\n')));root.append(pre);continue;
      }
      const heading=line.match(/^#{1,6}\s+(.+)/);
      if(heading){const h=el('h4');inline(h,heading[1]);root.append(h);index++;continue;}
      const bullet=line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)/);
      if(bullet){
        const ordered=/^\s*\d/.test(line);const list=el(ordered?'ol':'ul');
        if(ordered)list.start=Number(line.match(/\d+/)[0]);
        while(index<lines.length){const match=lines[index].match(ordered?/^\s*\d+[.)]\s+(.+)/:/^\s*[-*•]\s+(.+)/);if(!match)break;const item=el('li');inline(item,match[1]);list.append(item);index++;}
        root.append(list);continue;
      }
      const paragraph=el('p');const block=[line];index++;
      while(index<lines.length&&lines[index].trim()&&!/^\s*(?:#{1,6}\s|```|[-*•]\s|\d+[.)]\s)/.test(lines[index]))block.push(lines[index++]);
      inline(paragraph,block.join('\n'));root.append(paragraph);
    }
    return root;
  }
  function renderOrchestration(data){
    const queue=$('dispatch-queue');const readiness=$('readiness-cards');if(!queue||!readiness)return;
    queue.replaceChildren();readiness.replaceChildren();
    queue.append(el('p','One request at a time. Project priority sets the order; requests waiting 10 minutes move ahead.','muted'));
    let rank=0;
    for(const job of data.queue||[]){
      const card=el('article',undefined,'queue-item');card.dataset.state=job.eligible?'ready':'held';
      const number=job.status==='RUNNING'?'▶':job.eligible?String(++rank):'Ⅱ';card.append(el('span',number,'queue-rank'));
      const content=el('div',undefined,'queue-content');content.append(el('h4',job.project),el('p',job.agent+' · '+({health:'Availability check',chat:'Chat reply',coordinate:'Coordinator planning',assigned:'Approved task'}[job.kind]||job.kind)));
      content.append(el('small',job.status==='RUNNING'?'Working now':job.eligible?(job.aged?'Older request · promoted in queue':'Ready when the worker is free'):job.hold_reason));
      card.append(content,Fmt.badge(job.priority));const open=el('button','Open project');open.addEventListener('click',()=>WorkspaceUI.openProject(job.project_id));card.append(open);queue.append(card);
    }
    if(!(data.queue||[]).length){const empty=el('article',undefined,'designed-empty');empty.append(el('span','✓','feature-orb'),el('h3','Nothing waiting'),el('p','Approved work will appear here in dispatch order.'));queue.append(empty);}
    for(const report of data.readiness||[]){
      const card=el('article',undefined,'readiness-card');card.dataset.state=report.state;
      const head=el('div',undefined,'readiness-head');head.append(el('h3',report.project),Fmt.badge({ready:'Checks passed',blocked:'Needs attention',waiting:'Waiting for review'}[report.state]));card.append(head);
      for(const check of report.checks){const row=el('div',undefined,'readiness-check');row.dataset.state=check.state;row.append(el('span',check.state==='ready'?'✓':check.state==='blocked'?'!':'○','readiness-icon'),el('b',check.label),el('span',check.detail));card.append(row);}
      const footer=el('div',undefined,'readiness-footer');const chat=el('button','Discuss in chat');chat.addEventListener('click',()=>WorkspaceUI.openProject(report.project_id,'conversation'));const agents=el('button','Check agent status');agents.addEventListener('click',()=>{Router.activate('#agents');SectionViews.select('agents','Availability');});footer.append(chat,agents);card.append(footer);readiness.append(card);
    }
  }
  function healthLabel(health){
    if(health?.active)return health.active==='RUNNING'?'Checking / working':'Queued';
    if(health?.status==='MANUAL')return 'Manual · standby';
    if(health?.worker_online===false)return 'Worker offline';
    return {AVAILABLE:'Responded',QUOTA_LIMITED:'Quota limited',AUTH_REQUIRED:'Sign-in needed',UNAVAILABLE:'Unavailable',ERROR:'Needs attention',BUDGET_BLOCKED:'Budget guard',UNTESTED:'Not checked'}[health?.status]||'Not checked';
  }
  async function checkAgents(target){
    const data=Store.get();const p=data.projects.projects.find(p=>!['PAUSED','COMPLETED','ARCHIVED'].includes(p.status));
    if(!p){WorkspaceUI.notify('An open project is needed for an availability check.');return;}
    await action({action:'check_agents',target},p.id);
  }
  function renderAvailability(data){
    const host=$('agent-availability');if(!host)return;host.replaceChildren();
    const toolbar=el('div',undefined,'availability-toolbar');const intro=el('div');intro.append(el('h3','Agent availability'),el('p','Observed results. Checks use a small amount of your existing allowance.','muted'));
    const all=el('button','Check all agents','btn-primary');all.disabled=Object.values(data.agent_health||{}).some(h=>h.active)||!['IDLE','RUNNING'].includes(data.orchestrator.state);all.addEventListener('click',()=>checkAgents('all'));toolbar.append(intro,all);host.append(toolbar);
    const grid=el('div',undefined,'availability-grid');
    for(const [key,name] of [['codex','Codex / ChatGPT'],['antigravity','Antigravity default'],...(data.agent_profiles||[]).map(p=>[p.room,p.name]),['grok','Grok']]){
      const h=data.agent_health?.[key];const card=el('article',undefined,'availability-card');card.dataset.status=h?.status||'UNTESTED';
      card.append(el('span',name.slice(0,2).toUpperCase(),'participant-avatar'),el('h4',name),el('strong',healthLabel(h),'availability-status'));
      card.append(el('small',h?.checked_at?'Observed '+Fmt.date(h.checked_at):'No completed check'));
      if(h?.detail){const detail=el('details');detail.append(el('summary','Details'),el('p',h.detail));card.append(detail);}
      card.append(el('p',key==='grok'?'Free account · manual handoff':'Credit balance and reset time are not supplied by this connection.','muted'));
      if(key!=='grok'){const button=el('button','Check connection');button.disabled=Boolean(h?.active)||!h?.worker_online;button.addEventListener('click',()=>checkAgents(key));card.append(button);}
      grid.append(card);
    }
    host.append(grid);
  }
  function messageInfo(msg){
    const data=Store.get();const room=msg.room||'team';const jobs=data.projects.jobs||[];
    const contacts=room==='team'?[['codex','Codex'],...(data.agent_profiles||[]).map(p=>[p.room,p.name])]:[[room,room==='grok'?'Grok':room==='codex'?'Codex':data.agent_profiles?.find(p=>p.room===room)?.name||'Antigravity']];
    const body=$('detailbody');body.replaceChildren(el('h2','Message info'));
    const list=el('div',undefined,'receipt-list');
    for(const [key,name] of contacts){
      const model=data.agent_profiles?.find(p=>p.room===key)?.model;
      const relevant=jobs.filter(j=>j.project_id===msg.project_id&&(j.message_id===msg.id||j.context_message_ids?.includes(msg.id))&&(key==='codex'?j.worker==='codex':key==='antigravity'?j.worker==='antigravity'&&!j.model:j.model===model));
      const latest=relevant.at(-1);let status='Can receive · not dispatched';
      if(key==='grok')status='Manual handoff · receipt unavailable';
      else if(latest?.status==='SUCCEEDED')status='Response received';
      else if(latest?.status==='APPROVED')status='Queued · not dispatched';
      else if(latest?.status==='RUNNING')status=latest.dispatched_at?'Request dispatched':'Preparing request';
      else if(latest){const reason=latest.failure_kind||(/quota/i.test(latest.error||'')?'QUOTA_LIMITED':/paid-credit/i.test(latest.error||'')?'BUDGET_BLOCKED':'');status=(latest.dispatched_at?'Dispatched · ':reason==='BUDGET_BLOCKED'?'Not delivered · ':'No reply · ')+({QUOTA_LIMITED:'quota limit',BUDGET_BLOCKED:'budget guard',AUTH_REQUIRED:'sign-in needed'}[reason]||Fmt.statusLabel(latest.status));}
      if(msg.sender===name)status='Author';
      const line=el('div',undefined,'receipt-row');line.append(el('b',name),el('span',status));list.append(line);
    }
    body.append(list,el('p','Dispatch evidence only. Providers do not supply read receipts.','muted'));
    for(const job of jobs.filter(j=>j.message_id===msg.id&&['RUNNING','APPROVED'].includes(j.status))){const stop=el('button','Stop '+(job.participant||job.worker));stop.addEventListener('click',async()=>{await action({action:'cancel_job',job_id:job.id},job.project_id);messageInfo(msg);});body.append(stop);}
    if(!$('detail').open)$('detail').showModal();
  }
  function syncMessageType(){const summary=document.querySelector('.message-type-picker>summary');const kind=$('reply-kind');if(summary&&kind){summary.textContent='💡';summary.dataset.kind=kind.value;summary.title=kind.selectedOptions[0]?.textContent||'Message';summary.setAttribute('aria-label','Choose message type: '+summary.title);}}
  function resizeComposer(){syncMessageType();const input=$('chat-input');if(!input)return;input.style.height='44px';input.style.height=Math.min(120,Math.max(44,input.scrollHeight))+'px';}
  function mountComposer(){
    const form=$('chat-form');const bar=el('div',undefined,'slim-composer');
    const picker=el('details',undefined,'message-type-picker');const summary=el('summary','💡');summary.setAttribute('aria-label','Choose message type: Message');summary.title='Choose message type';
    const menu=$('message-type-menu');picker.append(summary,menu);bar.append(picker,$('chat-input'));
    const attach=el('button','⌁','attachment-button');attach.type='button';attach.disabled=true;attach.setAttribute('aria-label','Attachments unavailable · storage planned');attach.title='Chat and shared storage are planned';
    bar.append(attach,$('chat-send'));form.querySelector('.compose-actions').before(bar);
    $('reply-kind').addEventListener('change',()=>{summary.textContent='💡';summary.dataset.kind=$('reply-kind').value;summary.title=$('reply-kind').selectedOptions[0].textContent;picker.open=false;$('chat-input').focus();});
    document.addEventListener('click',event=>{if(!picker.contains(event.target))picker.open=false;});
    picker.addEventListener('keydown',event=>{if(event.key==='Escape'){picker.open=false;summary.focus();}});
  }
  function mount(){
    const typeMenu=el('div',undefined,'message-type-menu');typeMenu.id='message-type-menu';$('chat-form').append(typeMenu);
    const banner=el('div',undefined,'reply-banner');banner.id='reply-banner';banner.hidden=true;const quote=el('span');quote.id='reply-excerpt';const cancel=el('button','×');cancel.type='button';cancel.setAttribute('aria-label','Cancel reply');cancel.addEventListener('click',reset);banner.append(quote,cancel);$('chat-form').prepend(banner);
    const select=el('select');select.id='reply-kind';select.setAttribute('aria-label','Record this message as');for(const [value,label] of [['message','Message'],['decision','Decision'],['requirement','Requirement change'],['update','Progress update'],['idea','Idea'],['blocker','Blocker']])select.append(new Option(label,value));select.addEventListener('change',()=>{$('reply-destination').textContent=destination(select.value);});$('message-type-menu').append(select);
    const destinationNote=el('p');destinationNote.id='reply-destination';$('chat-form').append(destinationNote);
    const feedback=el('p');feedback.id='supervision-feedback';feedback.setAttribute('role','status');$('conversation').append(feedback);
    const limit=el('p',undefined,'muted');limit.id='chat-compose-limit';$('chat-form').append(limit);
    mountComposer();
    $('chat-recipient').addEventListener('change',roomChanged);$('chat-project').addEventListener('change',roomChanged);
    $('pm-project').addEventListener('change',()=>Store.get()&&update(Store.get()));
  }
  return {mount,update,payload,reset,decorate,healthLabel,resizeComposer,richText,focusMessage(message){replyTo(message,'message');}};
})();
