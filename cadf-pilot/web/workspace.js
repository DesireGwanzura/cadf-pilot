'use strict';
// Presentational controls use the same snapshot as chat, plans and project records.
const WorkspaceUI=(()=>{
  const $=id=>document.getElementById(id);
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const collections=new Map();
  let latest=null;let noticeTimer;let contactCatalog=[];let chooseContact=null;let selectedContact='team';
  const compactNavigation=()=>matchMedia('(max-width: 1000px)').matches;
  function syncNavigation(){
    const compact=compactNavigation();if(!compact)document.body.classList.remove('mobile-nav-open');
    const open=compact?document.body.classList.contains('mobile-nav-open'):!document.body.classList.contains('navigation-collapsed');
    const toggle=document.querySelector('.navigation-toggle');toggle?.setAttribute('aria-expanded',String(open));if(toggle)toggle.hidden=open;
    document.querySelector('main').inert=compact&&open;
    document.querySelector('body>aside').inert=compact&&!open;
  }
  function closeNavigation(){document.body.classList.remove('mobile-nav-open');syncNavigation();}
  function toggleSidebar(button){
    if(compactNavigation()){document.body.classList.toggle('mobile-nav-open');syncNavigation();if(document.body.classList.contains('mobile-nav-open'))document.querySelector('.mobile-nav-close').focus();return;}
    const className='navigation-collapsed';document.body.classList.toggle(className);const hidden=document.body.classList.contains(className);button.setAttribute('aria-expanded',String(!hidden));try{localStorage.setItem('cadf-'+className,String(hidden));}catch{}syncNavigation();
  }
  function configureContacts(contacts,selected,choose){contactCatalog=contacts;selectedContact=selected;chooseContact=choose;}
  function renderContacts(){
    const grid=$('contact-orbits');grid.replaceChildren();const query=$('contact-search').value.trim().toLowerCase();
    for(const contact of contactCatalog.filter(c=>c.name.toLowerCase().includes(query))){
      const button=el('button',undefined,'contact-orbit'+(contact.id===selectedContact?' selected':''));button.type='button';button.setAttribute('aria-label','Chat with '+contact.name);button.setAttribute('aria-pressed',String(contact.id===selectedContact));button.title=contact.note;
      button.append(el('span',contact.icon,'orbit-avatar'),el('b',contact.name));
      if(contact.status)button.append(el('small',contact.status));else if(contact.id==='grok')button.append(el('small','Manual'));
      button.addEventListener('click',()=>{$('contact-picker').close();SectionViews.select('conversation','Messages');chooseContact(contact);});grid.append(button);
    }
    if(!grid.children.length)grid.append(el('p','No matching conversations.','muted'));
  }
  function openContacts(){
    const dialog=$('contact-picker');if(!dialog||dialog.open)return;
    $('contact-search').value='';renderContacts();dialog.showModal();$('contact-menu-button')?.setAttribute('aria-expanded','true');
    $('contact-search').focus();
  }
  function notify(message){const toast=$('workspace-toast');if(!toast)return;toast.textContent=message;toast.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>toast.hidden=true,7000);}
  function openProject(id,view='management'){
    const data=Store.get();if(!data?.projects.projects.some(p=>p.id===id))return;
    for(const select of ['pm-project','chat-project','job-project'])$(select).value=id;
    ManagementComponent.update(data);ChatComponent.update(data);VisualWorkspace.update(data);SupervisionUI.update(data);update(data);
    Router.activate('#'+view);SectionViews.select(view,view==='management'?'Table':'Messages');
    $('management').dataset.project=id;
  }
  function downloadLinks(pid,record=''){
    const row=el('div',undefined,'download-actions');
    for(const [format,label] of [['docx','↓ Word'],['html','↓ Formatted document'],['md','↓ Markdown']]){
      const a=el('a',label,'download-link');a.href='/api/export?'+new URLSearchParams({project:pid,record,format});a.setAttribute('download','');row.append(a);
    }
    return row;
  }
  function enhance(id,selector,options={}){
    const host=$(id);if(!host)return;
    let state=collections.get(id);
    if(!state){
      state={page:1,size:8,query:'',filter:'',sort:'recorded'};collections.set(id,state);
      const tools=el('div',undefined,'collection-tools');const search=el('input');search.type='search';search.placeholder=options.placeholder||'Search this view…';search.setAttribute('aria-label',options.label||'Search '+id);
      search.addEventListener('input',()=>{state.query=search.value.toLowerCase();state.page=1;apply();});tools.append(search);
      if(options.filters){const filter=el('select');filter.setAttribute('aria-label','Filter '+(options.label||id));filter.append(new Option('All states',''));for(const [value,label] of options.filters)filter.append(new Option(label,value));filter.addEventListener('change',()=>{state.filter=filter.value;state.page=1;apply();});tools.append(filter);}
      const sort=el('select');sort.setAttribute('aria-label','Sort '+(options.label||id));for(const [value,label] of [['recorded','Recorded order'],['reverse','Reverse order'],['asc','A → Z'],['desc','Z → A']])sort.append(new Option(label,value));sort.addEventListener('change',()=>{state.sort=sort.value;state.page=1;apply();});tools.append(sort);
      const size=el('select');size.setAttribute('aria-label','Items per page for '+(options.label||id));for(const n of [8,16,32])size.append(new Option(n+' per page',String(n)));size.addEventListener('change',()=>{state.size=Number(size.value);state.page=1;apply();});tools.append(size);
      const pager=el('div',undefined,'collection-pager');const count=el('span');const prev=el('button','← Previous');const page=el('span');const next=el('button','Next →');prev.addEventListener('click',()=>{state.page--;apply();});next.addEventListener('click',()=>{state.page++;apply();});pager.append(count,prev,page,next);
      host.before(tools);host.after(pager);Object.assign(state,{tools,pager,count,prev,pageLabel:page,next});
    }
    if(!state.tools.isConnected){host.before(state.tools);host.after(state.pager);}
    state.nodes=[...host.querySelectorAll(selector)];state.apply=apply;apply();
    function apply(){
      const nodes=state.nodes||[];
      let matches=nodes.filter(n=>n.textContent.toLowerCase().includes(state.query)&&(!state.filter||(n.dataset.state?n.dataset.state===state.filter:n.textContent.toLowerCase().includes(state.filter))));
      if(state.sort==='reverse')matches.reverse();
      if(state.sort==='asc'||state.sort==='desc')matches.sort((a,b)=>(state.sort==='asc'?1:-1)*a.textContent.localeCompare(b.textContent));
      const pages=Math.max(1,Math.ceil(matches.length/state.size));state.page=Math.min(Math.max(1,state.page),pages);
      const shown=new Set(matches.slice((state.page-1)*state.size,state.page*state.size));
      nodes.forEach(n=>n.hidden=!shown.has(n));
      // Reorder within each semantic group; headings and status lanes stay in place.
      const parents=new Set(nodes.map(n=>n.parentElement));for(const parent of parents)for(const node of matches.filter(n=>n.parentElement===parent))parent.append(node);
      if(options.groups)host.querySelectorAll(options.groups).forEach(group=>group.hidden=![...group.querySelectorAll(selector)].some(n=>!n.hidden));
      state.count.textContent=matches.length+' item'+(matches.length===1?'':'s')+(state.query||state.filter?' found':'');state.pageLabel.textContent=state.page+' / '+pages;state.prev.disabled=state.page===1;state.next.disabled=state.page===pages;
      state.pager.hidden=!nodes.length&&!state.query&&!state.filter;
    }
  }
  function marketing(data){
    const home=$('marketing-home');home.replaceChildren();const campaigns=data.projects.campaigns||[];
    const hero=el('article',undefined,'marketing-hero');const copy=el('div');copy.append(el('small','YOUR GROWTH STUDIO'),el('h3','From a good idea to a great first impression.'),el('p','Your agents prepare the strategy and content. You review the work before it goes anywhere.'));
    const start=el('button','＋ Start a marketing project','btn-primary');start.addEventListener('click',()=>{Router.activate('#projects');SectionViews.select('projects','Submit project');$('project-name').focus();});copy.append(start);hero.append(copy,el('span','✧','hero-glyph'));home.append(hero);
    const stats=el('div',undefined,'marketing-stats');for(const [label,value,note] of [['Content drafts',campaigns.filter(c=>c.status==='DRAFT').length,'Prepared for review'],['Approved content',campaigns.filter(c=>c.status==='APPROVED').length,'Not published'],['Connected accounts',0,'Meta connection needed'],['Reach & engagement','—','No analytics connection']]){const card=el('article');card.append(el('small',label),el('strong',value),el('span',note));stats.append(card);}home.append(stats);
    const bottom=el('div',undefined,'marketing-bottom');const pipeline=el('article');pipeline.append(el('h3','Content pipeline'));for(const channel of ['Facebook','Instagram','LinkedIn','Threads']){const count=campaigns.filter(c=>c.channel===channel).length;const row=el('div',undefined,'channel-row');const bar=el('div',undefined,'channel-track');const fill=el('span');fill.style.width=(campaigns.length?count/campaigns.length*100:0)+'%';bar.append(fill);row.append(el('b',channel),bar,el('small',count+' drafts'));pipeline.append(row);}if(!campaigns.length)pipeline.append(el('p','Drafts will appear when an approved agent task produces them.','muted'));
    const meta=el('article',undefined,'meta-connection');meta.append(el('span','∞','feature-orb'),el('h3','Meta needs a connection'),el('p','Facebook and Instagram assets have not been authorized in CADF. Publishing and analytics are unavailable.'));
    const connection=el('button','View connections →');connection.addEventListener('click',()=>SectionViews.select('marketing','Connections'));meta.append(connection);bottom.append(pipeline,meta);home.append(bottom);
    const connections=$('marketing-connections');connections.replaceChildren();
    for(const [name,needed,url] of [['Meta Business Suite','Select the Facebook Page and Instagram professional account, then authorize a supported publishing connection.','https://business.facebook.com/'],['Analytics','A verified account and a free eligible analytics connector are needed before results can be shown.',null]]){
      const card=el('article',undefined,'connection-card');card.append(el('span',name==='Meta Business Suite'?'∞':'↗','feature-orb'),el('h3',name),Fmt.badge('NOT CONNECTED'),el('p',needed));if(url){const link=el('a','Open Meta Business Suite ↗','download-link');link.href=url;link.target='_blank';link.rel='noopener noreferrer';card.append(link);}connections.append(card);
    }
    connections.append(el('p','Using the same email does not connect Meta to Google or CADF. No posting permissions, advertising spend or cloud storage are enabled.','muted'));
    const setup=el('article',undefined,'social-setup');setup.append(el('small','WHEN YOU ARE READY'),el('h3','Link your accounts later'),el('p','Prepare your accounts here. Signing in to a provider does not yet connect it to CADF.'));
    const steps=el('ol');
    for(const [title,description,url,label] of [
      ['Choose your Meta accounts','Select your Facebook Page and Instagram professional account in Business Suite.','https://business.facebook.com/','Open account setup ↗'],
      ['Connect a free eligible publishing service','Metricool offers a Free-plan MCP route for supported analytics and scheduling. Existing plan limits still apply.','https://app.metricool.com/','Open Metricool ↗'],
      ['Authorize the client connection','Use the official connection guide when ready. The CADF publishing bridge still needs implementation and a verified connection.','https://help.metricool.com/mcp-limits-and-plan-requirements-h72jg','View supported access & limits ↗']
    ]){const step=el('li');step.append(el('b',title),el('p',description));const link=el('a',label,'download-link');link.href=url;link.target='_blank';link.rel='noopener noreferrer';step.append(link);steps.append(step);}setup.append(steps,el('p','Facebook / Instagram: not connected · other sites require their own supported account connections. Public posts will require your approval.','muted'));connections.append(setup);
    document.querySelectorAll('#campaigncards button').forEach(b=>{if(/Edit Draft/i.test(b.textContent)){b.textContent='Discuss changes';b.replaceWith(Object.assign(el('button','Discuss changes'),{onclick:()=>openProject(b.closest('article')?.dataset.project||data.projects.projects[0]?.id,'conversation')}));}});
    if(!campaigns.length)$('campaigncards').replaceChildren(empty('Your next campaign starts with a conversation','Submit a marketing project. Your team will propose an audience, deliverables and a plan before preparing drafts.'));
  }
  function empty(title,text){const n=el('article',undefined,'designed-empty');n.append(el('span','✧','feature-orb'),el('h3',title),el('p',text));return n;}
  function globalSearch(){
    const q=$('workspace-search').value.trim().toLowerCase();const results=$('workspace-search-results');results.replaceChildren();results.hidden=!q;if(!q||!latest)return;
    const candidates=[];
    for(const p of latest.projects.projects){candidates.push({title:p.name,detail:'Project · '+p.status,text:p.name+' '+p.brief,run:()=>openProject(p.id)});for(const v of p.management?.versions||[])candidates.push({title:p.name+' · '+v.category+' v'+v.number,detail:'Project document',text:v.content,run:()=>{openProject(p.id);SectionViews.select('management','Documents');}});}
    for(const m of latest.projects.messages||[])candidates.push({title:m.sender+' · '+m.content.slice(0,70),detail:'Conversation',text:m.content,run:()=>{openProject(m.project_id,'conversation');SupervisionUI.focusMessage(m);}});
    for(const [path,text] of Object.entries(latest.documents))candidates.push({title:path.split('/').at(-1),detail:'Workspace guide',text:path+' '+text,run:()=>{Router.activate('#documents');$('document').value=path;$('document').dispatchEvent(new Event('change'));}});
    const found=candidates.filter(x=>x.text.toLowerCase().includes(q));for(const result of found.slice(0,12)){const button=el('button');button.append(el('b',result.title),el('small',result.detail));button.addEventListener('click',()=>{result.run();results.hidden=true;});results.append(button);}results.append(el('small',found.length?found.length+' results'+(found.length>12?' · refine to narrow results':''):'No matching records'));
  }
  function beforeMount(){for(const id of ['marketing-home','marketing-connections']){const host=el('div');host.id=id;$('marketing').append(host);}}
  function header(view){document.body.classList.toggle('chat-page',view==='conversation');document.querySelectorAll('header .sectionhead').forEach(head=>head.hidden=head.dataset.section!==view);if(view!=='conversation')$('contact-picker')?.close();closeNavigation();}
  function theme(){const choice=$('theme-mode')?.value||'system';document.documentElement.dataset.theme=choice==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):choice;try{localStorage.setItem('cadf-theme',choice);}catch{}}
  function mount(){
    const toast=el('div',undefined,'workspace-toast');toast.id='workspace-toast';toast.hidden=true;toast.setAttribute('role','status');document.querySelector('main').append(toast);
    const box=el('div',undefined,'global-search');const input=el('input');input.id='workspace-search';input.type='search';input.placeholder='Search your workspace';input.setAttribute('aria-label','Search entire workspace');const list=el('div',undefined,'search-results');list.id='workspace-search-results';list.hidden=true;box.append(input,list);document.querySelector('.header-actions').prepend(box);input.addEventListener('input',globalSearch);input.addEventListener('keydown',e=>{if(e.key==='Escape')list.hidden=true;});document.addEventListener('click',e=>{if(!box.contains(e.target))list.hidden=true;});
    $('chat-shortcuts').hidden=true;document.querySelector('.conversation-list').hidden=true;
    const picker=el('dialog',undefined,'contact-picker');picker.id='contact-picker';picker.setAttribute('aria-label','Choose a conversation');
    const pickerHead=el('div',undefined,'contact-picker-head');pickerHead.append(el('span','Your conversations'));const dismiss=el('button','×','contact-close');dismiss.type='button';dismiss.setAttribute('aria-label','Close conversations');dismiss.addEventListener('click',()=>picker.close());pickerHead.append(dismiss);
    const find=el('input');find.id='contact-search';find.type='search';find.placeholder='Find an agent or group';find.setAttribute('aria-label','Find a conversation');find.addEventListener('input',renderContacts);
    const orbits=el('div',undefined,'contact-orbits');orbits.id='contact-orbits';picker.append(pickerHead,find,orbits);document.body.append(picker);
    picker.addEventListener('click',event=>{const rect=picker.getBoundingClientRect();if(event.target===picker&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))picker.close();});
    picker.addEventListener('close',()=>$('contact-menu-button')?.setAttribute('aria-expanded','false'));
    const pageHeader=document.querySelector('main>header');const slots=el('div',undefined,'page-heading-slot');
    for(const head of document.querySelectorAll('.content-body>section>.sectionhead')){
      const section=head.parentElement;head.dataset.section=section.id;
      const title=head.querySelector('h2');const intro=title?.parentElement;const tabs=section.querySelector(':scope>.section-view-tabs');
      if(intro&&tabs){const label=title.textContent;intro.replaceChildren();intro.classList.add('section-header-content');if(section.id!=='conversation')intro.append(el('small',label,'section-header-label'));intro.append(tabs);}
      slots.append(head);
    }
    document.querySelector('.header-title-wrap').replaceWith(slots);$('refresh').remove();
    const menu=el('button','☰','navigation-toggle');menu.type='button';menu.setAttribute('aria-label','Show or hide main navigation');menu.setAttribute('aria-expanded','true');menu.addEventListener('click',()=>toggleSidebar(menu));const brand=el('div',undefined,'brand-anchor');brand.append(menu);pageHeader.prepend(brand);
    try{if(localStorage.getItem('cadf-navigation-collapsed')==='true'){document.body.classList.add('navigation-collapsed');menu.setAttribute('aria-expanded','false');}}catch{}
    const navClose=el('button','☰','mobile-nav-close');navClose.type='button';navClose.setAttribute('aria-label','Close main navigation');navClose.addEventListener('click',()=>{if(compactNavigation())closeNavigation();else toggleSidebar(menu);menu.focus();});const sideHead=el('div',undefined,'sidebar-brand-row');sideHead.append(document.querySelector('a.brand'),navClose);document.querySelector('body>aside').prepend(sideHead);
    const scrim=el('button',undefined,'navigation-scrim');scrim.type='button';scrim.setAttribute('aria-label','Close main navigation overlay');scrim.addEventListener('click',()=>{closeNavigation();menu.focus();});document.body.append(scrim);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('mobile-nav-open')){closeNavigation();menu.focus();}});
    matchMedia('(max-width: 1000px)').addEventListener('change',syncNavigation);syncNavigation();
    const mode=el('select');mode.id='theme-mode';mode.setAttribute('aria-label','Color theme');for(const [value,label] of [['system','◐ System'],['light','☀ Light'],['dark','◔ Dark']])mode.append(new Option(label,value));try{mode.value=localStorage.getItem('cadf-theme')||'system';}catch{}document.querySelector('.header-actions').append(mode);mode.addEventListener('change',theme);matchMedia('(prefers-color-scheme: dark)').addEventListener('change',theme);theme();
    const types=el('div',undefined,'project-intents');for(const label of ['Business growth','Find opportunities','Marketing','Build & create']){const chip=el('span',label);types.append(chip);}$('project-form-title').after(types);
    $('pm-project').addEventListener('change',()=>latest&&update(latest));
    $('search').addEventListener('input',()=>latest&&update(latest));$('status').addEventListener('change',()=>latest&&update(latest));$('project-filter').addEventListener('change',()=>latest&&update(latest));
    const docsDownload=el('div',undefined,'project-export');docsDownload.id='project-export';$('project-chat-records').before(docsDownload);
    const note=el('p','A formatted copy is generated when you download. Open the HTML copy and print to save a PDF. No extra model call.','muted');$('project-chat-records').before(note);
    document.addEventListener('click',event=>{if(event.target.closest('.section-view-tabs'))requestAnimationFrame(()=>latest&&update(latest));});
  }
  function update(data){
    latest=data;marketing(data);
    const p=data.projects.projects.find(p=>p.id===$('pm-project').value);const exports=$('project-export');exports.replaceChildren();if(p){exports.append(el('h3','Project documents'),el('p','One project pack, generated from the current brief, plan, deliverables and records.','muted'),downloadLinks(p.id));}
    const closed=p&&['COMPLETED','ARCHIVED'].includes(p.status);
    enhance('dashboard-project-table',':scope > tr:not(:first-child)',{label:'dashboard projects',placeholder:'Find a project…'});
    enhance('agentcards',':scope > article',{label:'agents',placeholder:'Find an agent…'});
    enhance('projectcards',':scope > article',{label:'projects',placeholder:'Search projects…'});
    enhance('events',':scope > .event',{label:'activity',placeholder:'Search the audit trail…'});
    enhance('grouped-task-board','.group-task-row',{label:'tasks',placeholder:'Find a task or agent…',groups:'.task-group'});
    enhance('visual-project-board','.pm-date-group tr:not(:first-child),.pm-kanban article,.gantt-row',{label:'deliverables',placeholder:'Search outcomes or agents…',groups:'.pm-date-group',filters:[['working','Working'],['stuck','Blocked'],['review','Review'],['done','Done']]});
    enhance('agent-deliverables',':scope > article',{label:'delivered artifacts',placeholder:'Find a deliverable…'});
    enhance('project-chat-records',':scope > details',{label:'documents',placeholder:'Search project records…',filters:[['decisions','Decisions'],['requirements','Requirements'],['progress','Progress'],['blockers','Blockers'],['ideas','Ideas']]});
    enhance('dispatch-queue',':scope > .queue-item',{label:'queued work',placeholder:'Find a project or agent…'});
    enhance('readiness-cards',':scope > .readiness-card',{label:'readiness',placeholder:'Find a project or blocker…',filters:[['ready','Checks passed'],['waiting','Waiting'],['blocked','Needs attention']]});
    enhance('jobcards',':scope > article',{label:'jobs',placeholder:'Search execution records…',filters:[['succeeded','Succeeded'],['failed','Failed'],['running','Running']]});
    enhance('campaigncards',':scope > article',{label:'campaigns',placeholder:'Search content drafts…',filters:[['facebook','Facebook'],['instagram','Instagram'],['linkedin','LinkedIn']]});
    // Reapply owner-only schedule permissions after any view redraw.
    document.querySelectorAll('#visual-project-board input[aria-label^="Owner"],#visual-project-board select[aria-label^="Status"],#visual-project-board select[aria-label^="Move"]').forEach(n=>n.disabled=true);
    const add=document.querySelector('.pm-table-toolbar>.btn-primary');if(add)add.hidden=true;
  }
  return {beforeMount,mount,update,openProject,downloadLinks,header,notify,configureContacts,openContacts};
})();
