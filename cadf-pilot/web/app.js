'use strict';

// =============================================================================
// CADF Command Centre – Component Architecture
// Each section of the UI is a named Component module with mount/update/destroy.
// The Router drives navigation. The Store holds snapshot state with subscriptions.
// The API module wraps all fetch calls.
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// DOM UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
const DOM = {
  /** Get element by ID */
  get: (id) => document.getElementById(id),

  /** Create element with optional text and className */
  el: (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = text;
    if (className) node.className = className;
    return node;
  },

  /** Set children of el to nodes array */
  children: (el, nodes) => {
    if (typeof el === 'string') el = DOM.get(el);
    el.replaceChildren(...nodes);
    return el;
  },

  /** Append nodes to el */
  append: (el, ...nodes) => {
    if (typeof el === 'string') el = DOM.get(el);
    nodes.forEach(n => el.append(n));
    return el;
  },

  /** Fill a <select> from projects array; restore previous selection */
  fillSelect: (id, projects) => {
    const select = DOM.get(id);
    if (!select) return;
    const prev = select.value;
    select.replaceChildren(...projects.map(p => new Option(p.name, p.id)));
    if (projects.some(p => p.id === prev)) select.value = prev;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// FORMATTERS
// ─────────────────────────────────────────────────────────────────────────────
const Fmt = {
  display: (v) => String(v ?? 'Not recorded'),

  date: (v) => {
    const d = new Date(v);
    return Number.isNaN(d.valueOf()) ? Fmt.display(v) : d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  },

  plainText: (text) => text.replace(/^#{1,6}\s*/gm, '').replace(/\*\*/g, '').trim(),

  statusLabel: (s) => (s || '').replaceAll('_', ' '),

  /** Returns badge colour class for a status string */
  statusClass: (s) => {
    const map = {
      COMPLETED: 'badge-green', APPROVED: 'badge-green', ACCEPTED: 'badge-green', SUCCEEDED: 'badge-green',
      IN_PROGRESS: 'badge-blue', STARTED: 'badge-blue', RUNNING: 'badge-blue', QUEUED: 'badge-blue',
      SUBMITTED: 'badge-blue', APPROVED_JOB: 'badge-blue',
      PAUSED: 'badge-yellow', PENDING: 'badge-yellow', REQUESTED: 'badge-yellow', REVIEW: 'badge-yellow', DRAFT: 'badge-yellow',
      FAILED: 'badge-red', CANCELLED: 'badge-red', INTERRUPTED: 'badge-red', BLOCKED: 'badge-red',
      ARCHIVED: 'badge-muted', CANCEL_REQUESTED: 'badge-red'
    };
    return map[s] || 'badge-muted';
  },

  badge: (text, extraClass = '') => {
    const span = DOM.el('span', Fmt.statusLabel(text), 'tag');
    if (extraClass) span.classList.add(extraClass);
    if (text) span.classList.add(Fmt.statusClass(text));
    return span;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// STORE – reactive snapshot state with subscribers
// ─────────────────────────────────────────────────────────────────────────────
const Store = (() => {
  let _data = null;
  const _subs = [];

  return {
    get: () => _data,
    set: (data) => {
      _data = data;
      _subs.forEach(fn => fn(data));
    },
    subscribe: (fn) => {
      _subs.push(fn);
      if (_data) fn(_data);
    }
  };
})();

// ─────────────────────────────────────────────────────────────────────────────
// API – fetch wrapper
// ─────────────────────────────────────────────────────────────────────────────
const API = {
  async snapshot() {
    const res = await fetch('/api/snapshot', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error('Workspace read failed (' + res.status + '). Check the server terminal.');
    return res.json();
  },

  async post(payload, token) {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CADF-Token': token },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Request failed.');
    return result;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ROUTER – hash-based navigation between component views
// ─────────────────────────────────────────────────────────────────────────────
const Router = (() => {
  let activeView=null;
  const VIEWS = ['conversation','management','projects','orchestration','marketing','tasks','overview','agents','reviews','activity','documents','storage'];

  function activate(hash) {
    const id = (hash || location.hash).replace('#', '') || 'conversation';
    const target = VIEWS.includes(id) ? id : 'conversation';
    if(location.hash !== '#'+target) history.pushState(null,'','#'+target);

    if(activeView!==target){document.querySelector('main').scrollTop=0;activeView=target;}
    WorkspaceUI.header(target);
    document.querySelectorAll('.content-body > section').forEach(sec => {
      sec.classList.toggle('active', sec.id === target);sec.hidden=sec.id!==target;
    });
    document.querySelectorAll('nav a').forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === '#' + target);
    });
  }

  window.addEventListener('hashchange', () => activate(location.hash));
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (link) activate(link.getAttribute('href'));
  });

  return { activate, views: VIEWS };
})();

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT ACTIONS MAP
// ─────────────────────────────────────────────────────────────────────────────
const PROJECT_ACTIONS = {
  SUBMITTED: [['queue','Queue'],['start','Start'],['archive','Archive']],
  QUEUED:    [['start','Start'],['archive','Archive']],
  STARTED:   [['pause','Pause'],['complete','Complete']],
  PAUSED:    [['resume','Resume'],['archive','Archive']],
  COMPLETED: [['archive','Archive']],
  ARCHIVED:  []
};

// =============================================================================
// COMPONENT: ChatComponent (#conversation)
// =============================================================================
const ChatComponent = (() => {
  let _drafts = {};
  let _selectedProject=null;
  let _sending = false;

  function _updateSendButton() {
    const v = DOM.get('chat-recipient').value;
    DOM.get('chat-model').closest('label').hidden=true;
    DOM.get('grok-handoff').open=v==='grok';
    DOM.get('chat-send').textContent = '↑';
    DOM.get('chat-send').setAttribute('aria-label', v==='team'?'Send to everyone':'Send message');
    DOM.get('chat-send-note').textContent = v==='grok'?'Saves a note for manual transfer. Download the brief below; no Grok request is sent.': v === 'team'
      ? 'Broadcasts to Codex + 6 Antigravity profiles (7 replies). Uses account quota; Grok stays manual. Enter sends · Shift+Enter adds a line.'
      : 'Authorizes one bounded reply using existing account quota. No paid fallback, code changes, or publishing.';
  }

  function _renderMessages(messages, jobs, project) {
    const container = DOM.get('messages');
    const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;
    container.replaceChildren();
    for (const msg of messages) {
      const owner = msg.sender === 'You';
      const row = DOM.el('div', undefined, 'message-entry' + (owner ? ' owner' : ''));
      const card = DOM.el('article', undefined, 'message' + (owner ? ' owner' : msg.sender === 'CADF coordinator' ? ' system' : ''));
      if (!owner) card.append(DOM.el('b', msg.sender, 'message-author'));
      const text = msg.content;
      if (text.length > 1100) {
        card.append(SupervisionUI.richText(text.slice(0, 800) + '…'));
        const full = DOM.el('details');
        full.append(DOM.el('summary', 'Read more'), SupervisionUI.richText(text));card.append(full);
      } else card.append(SupervisionUI.richText(text));
      row.append(card);
      SupervisionUI.decorate(card, msg, row);
      container.append(row);
    }
    if (!messages.length) container.append(DOM.el('p', 'Start a conversation.', 'muted'));
    if (wasAtBottom || messages.length <= 2) container.scrollTop = container.scrollHeight;
  }

  function _renderBlockers(jobs, project) {
    const attention = jobs.filter(j => ['REQUESTED','FAILED','INTERRUPTED','CANCEL_REQUESTED'].includes(j.status));
    const container = DOM.get('needs-you');
    container.replaceChildren();

    for (const job of attention) {
      const item = DOM.el('div', undefined, 'attention-item');
      item.append(
        DOM.el('b', job.worker === 'codex' ? 'Codex' : 'Antigravity'),
        DOM.el('p', job.status === 'REQUESTED' ? 'A job is waiting for your approval.' :
                     job.status === 'CANCEL_REQUESTED' ? 'Waiting for worker process to stop.' :
                     job.error || 'Job requires inspection.')
      );
      const link = DOM.el('a', 'Inspect execution queue →');
      link.href = '#orchestration';
      item.append(link);
      container.append(item);
    }

    if (project?.status === 'PAUSED') {
      container.append(DOM.el('p', 'This project is paused. Resume it to continue worker dispatches.', 'attention-item'));
    }
    if (!attention.length && project?.status !== 'PAUSED') {
      container.append(DOM.el('p', 'All clear. No active execution blockers.', 'muted'));
    }

    const latest = jobs.filter(m => m.reply_job_id).slice(-1)[0];
    if (latest && /blocker|need.*you|decision|missing/i.test(latest.prompt || '')) {
      container.append(DOM.el('p', 'The latest job flagged a blocker or decision. Review it above.', 'attention-item'));
    }
  }

  function update(data) {
    for(const profile of data.agent_profiles||[]){if(![...DOM.get('chat-recipient').options].some(o=>o.value===profile.room))DOM.get('chat-recipient').append(new Option(profile.name+' · Antigravity',profile.room));}
    DOM.fillSelect('chat-project', data.projects.projects);
    const selected = DOM.get('chat-project').value;
    const draftKey=selected+':'+DOM.get('chat-recipient').value;
    if(draftKey!==_selectedProject){if(_selectedProject)_drafts[_selectedProject]=DOM.get('chat-input').value;DOM.get('chat-input').value=_drafts[draftKey]||'';_selectedProject=draftKey;}
    const project = data.projects.projects.find(p => p.id === selected);
    const recipient=DOM.get('chat-recipient').value;
    const allMessages=(data.projects.messages||[]).filter(m=>m.project_id===selected);
    const selectedJobs=(data.projects.jobs||[]).filter(j=>j.project_id===selected&&j.worker===recipient);
    const names={codex:'Codex',antigravity:'Antigravity',grok:'Grok'};
    const messages=allMessages.filter(m=>(m.room||'team')===recipient);
    const jobs = (data.projects.jobs || []).filter(j => j.project_id === selected);

    DOM.get('room-summary').textContent = project
      ? `${project.name} · ${Fmt.statusLabel(project.status)} · ${messages.length} message(s)`
      : 'Select a project to begin. Submit a project below to create a shared room.';

    _renderMessages(messages, jobs, project);
    _renderBlockers(jobs, project);
    DOM.get('chat-send').disabled = _sending || !project || ['ARCHIVED','COMPLETED'].includes(project.status);
    VisualWorkspace.rooms(data);
    _updateSendButton();
    SupervisionUI.resizeComposer();
  }

  function mount() {
    DOM.get('chat-model').disabled=DOM.get('chat-recipient').value!=='antigravity';
    DOM.get('chat-recipient').addEventListener('change',()=>{DOM.get('chat-model').disabled=DOM.get('chat-recipient').value!=='antigravity';_updateSendButton();if(Store.get())update(Store.get());});

    DOM.get('chat-project').addEventListener('change', () => {
      const data = Store.get();
      if (!data) return;
      update(data);
      const pmProject = DOM.get('pm-project');
      if (pmProject) pmProject.value = DOM.get('chat-project').value;
      ManagementComponent.update(data);
      VisualWorkspace.update(data);SupervisionUI.update(data);WorkspaceUI.update(data);
    });

    DOM.get('chat-input').addEventListener('input', () => {
      const pid = DOM.get('chat-project').value;
      if (pid) _drafts[pid+':'+DOM.get('chat-recipient').value] = DOM.get('chat-input').value;
      SupervisionUI.resizeComposer();
    });

    DOM.get('chat-input').addEventListener('keydown', (e) => {
      if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing) {
        e.preventDefault();
        DOM.get('chat-form').requestSubmit();
      }
    });

    DOM.get('chat-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Store.get();
      if (_sending || !data || !DOM.get('chat-project').value) return;
      _sending = true;
      DOM.get('chat-send').disabled = true;
      DOM.get('chat-feedback').textContent = 'Sending message…';
      const pid = DOM.get('chat-project').value;
      const room=DOM.get('chat-recipient').value;const sentDraftKey=pid+':'+room;
      const payload = {
        action: 'message',
        broadcast:DOM.get('chat-recipient').value==='team',
        ...SupervisionUI.payload(),
        id: pid,
        recipient: DOM.get('chat-recipient').value,
        model: DOM.get('chat-recipient').value==='antigravity'?DOM.get('chat-model').value:null,
        content: DOM.get('chat-input').value,
        expected_revision: data.projects.revision
      };
      try {
        await API.post(payload, data.write_token);
        if(_selectedProject===sentDraftKey){DOM.get('chat-input').value='';SupervisionUI.reset();}
        delete _drafts[sentDraftKey];
        await AppController.refresh();
        DOM.get('chat-feedback').textContent = '';
        if(payload.record_kind!=='message')WorkspaceUI.notify('Saved to '+payload.record_kind+' records.');
      } catch (err) {
        DOM.get('chat-feedback').textContent = err.message;
      } finally {
        _sending = false;
        const d = Store.get();
        if (d) update(d);
      }
    });
  }

  return { mount, update };
})();

// =============================================================================
// COMPONENT: ProjectsComponent (#projects)
// =============================================================================
const ProjectsComponent = (() => {
  let _editing = null;
  let _editRevision = null;
  let _busy = false;

  function _message(msg, error = false) {
    const el = DOM.get('project-message');
    el.textContent = msg;
    el.className = error ? 'error' : '';
  }

  function _resetForm() {
    _editing = null;
    _editRevision = null;
    DOM.get('project-form').reset();
    DOM.get('project-form-title').textContent = 'Submit a New Project';
    DOM.get('project-save').textContent = 'Submit Project';
    DOM.get('project-cancel').hidden = true;
  }

  function _edit(project) {
    _editing = project.id;
    _editRevision = Store.get().projects.revision;
    DOM.get('project-name').value = project.name;
    DOM.get('project-brief').value = project.brief;
    DOM.get('project-repository').value = project.repository;
    DOM.get('project-priority').value = project.priority;
    DOM.get('project-form-title').textContent = 'Edit Project Brief';
    DOM.get('project-save').textContent = 'Save Changes';
    DOM.get('project-cancel').hidden = false;
    Router.activate('#projects');
    DOM.get('project-name').focus();
    _message('Editing ' + project.name + '. Changes are applied only on Save.');
  }

  function update(data) {
    const filterVal = DOM.get('project-filter').value;
    const projects = data.projects.projects.filter(p => !filterVal || p.status === filterVal);
    const container = DOM.get('projectcards');
    container.replaceChildren();

    if (!projects.length) {
      container.append(DOM.el('p',
        data.projects.projects.length ? 'No projects match this filter.' : 'No projects submitted yet. Add your first brief to begin.',
        'muted'
      ));
      return;
    }

    for (const project of projects) {
      const card = DOM.el('article', undefined, 'project-card');

      const headerRow = DOM.el('div', undefined, 'project-card-header');
      headerRow.append(Fmt.badge(project.status), DOM.el('small', 'Priority: ' + project.priority));
      card.append(headerRow);
      card.append(DOM.el('h3', project.name));

      const brief = DOM.el('p', project.brief);
      card.append(brief);
      card.append(DOM.el('small', 'ID: ' + project.id + ' · Updated ' + Fmt.date(project.updated_at)));
      if (project.repository) card.append(DOM.el('small', '🔗 ' + project.repository));

      const actions = DOM.el('div', undefined, 'project-actions');
      for (const [action, label] of PROJECT_ACTIONS[project.status] || []) {
        const btn = DOM.el('button', label);
        btn.disabled = _busy;
        btn.addEventListener('click', () => AppController.saveProject({ action, id: project.id, expected_revision: data.projects.revision }));
        actions.append(btn);
      }

      const openChat = DOM.el('button', '💬 Chat');
      openChat.addEventListener('click', () => {
        WorkspaceUI.openProject(project.id,'conversation');
      });
      actions.append(openChat);

      const openPM = DOM.el('button', '📋 PM');
      openPM.addEventListener('click', () => {
        WorkspaceUI.openProject(project.id);
      });
      actions.append(openPM);
      card.append(actions);

      const history = DOM.el('details');
      history.append(DOM.el('summary', 'Audit History'));
      for (const event of data.projects.events.filter(e => e.project_id === project.id).slice().reverse()) {
        history.append(DOM.el('p', Fmt.date(event.at) + ' · ' + event.message));
      }
      card.append(history);
      container.append(card);
    }
  }

  async function _save(payload, fromForm = false) {
    if (_busy || !Store.get()) return;
    _busy = true;
    DOM.get('project-save').disabled = true;
    update(Store.get());
    _message('Saving project…');
    try {
      const result = await API.post(payload, Store.get().write_token);
      if (fromForm) _resetForm();
      await AppController.refresh();
      _message('Saved: ' + result.project.name + ' (' + result.project.status + ').');
      if(payload.action==='create') WorkspaceUI.openProject(result.project.id,'conversation');
    } catch (err) {
      _message(err.message + ' Refresh before retrying if interrupted.', true);
    } finally {
      _busy = false;
      DOM.get('project-save').disabled = false;
      const d = Store.get();
      if (d) { update(d); OrchestrationComponent.update(d); }
    }
  }

  /** Called by AppController for cross-component project saves (lifecycle actions) */
  function setBusy(val) { _busy = val; }
  function isBusy() { return _busy; }

  function mount() {
    DOM.get('project-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Store.get();
      if (!data) { _message('Wait for records to load.', true); return; }
      _save({
        action: _editing ? 'update' : 'create',
        id: _editing,
        expected_revision: _editing ? _editRevision : data.projects.revision,
        name: DOM.get('project-name').value,
        brief: DOM.get('project-brief').value,
        deliverables:DOM.get('project-deliverables').value,
        workflow:'supervised',
        repository: DOM.get('project-repository').value,
        priority: DOM.get('project-priority').value
      }, true);
    });

    DOM.get('project-cancel').addEventListener('click', () => { _resetForm(); _message('Edit cancelled.'); });
    DOM.get('project-filter').addEventListener('change', () => { const d = Store.get(); if (d) update(d); });
  }

  return { mount, update, setBusy, isBusy };
})();

// =============================================================================
// COMPONENT: ManagementComponent (#management)
// =============================================================================
const ManagementComponent = (() => {
  let _busy = false;

  function _project() {
    return Store.get()?.projects.projects.find(p => p.id === DOM.get('pm-project').value);
  }

  async function _action(payload) {
    if (_busy || !_project()) return false;
    _busy = true;
    DOM.get('pm-feedback').textContent = 'Saving changes…';
    try {
      const data = Store.get();
      await API.post({ ...payload, id: _project().id, expected_revision: data.projects.revision }, data.write_token);
      await AppController.refresh();
      DOM.get('pm-feedback').textContent = 'Saved to project records.';
      return true;
    } catch (err) {
      DOM.get('pm-feedback').textContent = err.message;
      return false;
    } finally {
      _busy = false;
    }
  }

  function update(data) {
    DOM.fillSelect('pm-project', data.projects.projects);
    const project = _project();
    const pm = project?.management || { items: [], versions: [], batches: [] };
    const messages = (data.projects.messages || []).filter(m => m.project_id === project?.id);
    const covered = new Set(pm.batches.flatMap(b => b.message_ids));
    const pending = messages.filter(m => !covered.has(m.id)).length;

    DOM.get('pm-dashboard').replaceChildren();

    if (project) {
      const jobs = (data.projects.jobs || []).filter(j => j.project_id === project.id);
      const accepted = pm.items.filter(i => i.status === 'ACCEPTED').length;
      const active = jobs.filter(j => ['APPROVED','RUNNING','CANCEL_REQUESTED'].includes(j.status));
      const blocked = jobs.filter(j => ['FAILED','INTERRUPTED'].includes(j.status));
      const review = pm.batches.filter(b => b.status === 'REVIEW');

      // ── Project Header Card ──
      const head = DOM.el('article', undefined, 'pm-head');
      const headTop = DOM.el('div', undefined, 'pm-head-top');
      headTop.append(DOM.el('h3', project.name), Fmt.badge(project.status));
      head.append(headTop, DOM.el('p', project.brief));

      const actions = DOM.el('div', undefined, 'project-actions');
      const discuss = DOM.el('button', '💬 Discuss in Chat', 'btn-primary');
      discuss.disabled = ['COMPLETED','ARCHIVED'].includes(project.status);
      discuss.addEventListener('click', () => {
        DOM.get('chat-project').value = project.id;
        ChatComponent.update(Store.get());
        DOM.get('chat-input').value = 'Regarding ' + project.name + ': ';
        DOM.get('chat-recipient').value = 'codex';
        Router.activate('#conversation');
        DOM.get('chat-input').focus();
      });
      const plan = DOM.el('button', '📋 Manage Plan');
      plan.addEventListener('click', () => {
        SectionViews.select('management','Add outcome'); DOM.get('pm-edit').open = true;
        DOM.get('pm-edit').scrollIntoView({ behavior: 'smooth' });
      });
      actions.append(discuss, plan);
      for (const [action, label] of PROJECT_ACTIONS[project.status] || []) {
        const btn = DOM.el('button', label + ' Project');
        btn.addEventListener('click', () => _action({ action }));
        actions.append(btn);
      }
      head.append(actions);
      DOM.get('pm-dashboard').append(head);

      // ── Metrics Row ──
      const metrics = DOM.el('div', undefined, 'metrics');
      for (const [label, value] of [
        ['Outcomes Accepted', accepted + ' / ' + pm.items.length],
        ['Active Responses', active.length],
        ['Uncollected Discussion', pending],
        ['Batches in Review', review.length]
      ]) {
        const card = DOM.el('div', undefined, 'metric');
        card.append(DOM.el('span', label), DOM.el('strong', value));
        metrics.append(card);
      }
      DOM.get('pm-dashboard').append(metrics);

      // ── Delivery Progress & What Happens Next ──
      const grid = DOM.el('div', undefined, 'overviewgrid');
      const delivery = DOM.el('article');
      delivery.append(DOM.el('h3', '📦 Delivery Progress'));
      if (pm.items.length) {
        const prog = DOM.el('progress');
        prog.max = pm.items.length;
        prog.value = accepted;
        prog.setAttribute('aria-label', 'Accepted project outcomes');
        delivery.append(prog);
        const pct = DOM.el('p', Math.round((accepted / pm.items.length) * 100) + '% complete (' + accepted + ' of ' + pm.items.length + ' accepted)', 'muted');
        delivery.append(pct);
      } else {
        delivery.append(DOM.el('p', 'No deliverables planned yet. Define what finished means below.', 'muted'));
      }
      for (const item of pm.items) {
        const row = DOM.el('div', undefined, 'pm-outcome');
        row.append(
          DOM.el('b', (item.status === 'ACCEPTED' ? '✓ ' : '⏳ ') + item.title),
          DOM.el('small', item.kind + ' · ' + (item.accepted_at ? 'Accepted ' + Fmt.date(item.accepted_at) : 'Awaiting evidence'))
        );
        if (item.evidence) {
          row.append(DOM.el('p', 'Evidence: ' + item.evidence));
          if (/^https?:\/\//i.test(item.evidence.trim())) {
            try {
              const url = new URL(item.evidence.trim());
              const link = DOM.el('a', 'Open Deliverable ↗');
              link.href = url.href;
              link.target = '_blank';
              link.rel = 'noopener noreferrer';
              row.append(link);
            } catch {}
          }
        }
        delivery.append(row);
      }

      const next = DOM.el('article');
      next.append(DOM.el('h3', '🗺️ What Happens Next'));
      let guidance = project.status === 'COMPLETED' || project.status === 'ARCHIVED'
        ? 'This project is closed. Start a separate project for new scope.'
        : project.status === 'PAUSED'
        ? 'Work is paused. Resume from Projects when ready.'
        : active.length
        ? 'An agent response is running. Its output will appear in the room.'
        : !pm.items.length
        ? 'Define deliverables and acceptance criteria in the plan below.'
        : pending || review.length
        ? 'Review the discussion batch and approve requirements versions.'
        : accepted < pm.items.length
        ? 'Complete the remaining planned outcomes and record evidence.'
        : !pm.closeout
        ? 'All outcomes accepted! Record the closeout summary below.'
        : 'Closeout accepted. You may now mark the project Complete.';
      next.append(DOM.el('p', guidance));
      if (blocked.length) next.append(DOM.el('p', blocked.length + ' failed or interrupted job(s) recorded.', 'attention-item'));
      const chatBtn = DOM.el('button', '💬 Open Project Conversation →', 'btn-primary');
      chatBtn.style.marginTop = '14px';
      chatBtn.addEventListener('click', () => {
        WorkspaceUI.openProject(project.id,'conversation');
      });
      next.append(chatBtn);
      grid.append(delivery, next);
      DOM.get('pm-dashboard').append(grid);

      // ── Recent Activity ──
      const timeline = DOM.el('article', undefined, 'pm-timeline');
      timeline.append(DOM.el('h3', '⏱️ Recent Project Activity'));
      const events = data.projects.events.filter(e => e.project_id === project.id).slice(-5).reverse();
      for (const event of events) {
        timeline.append(DOM.el('p', Fmt.date(event.at) + ' · ' + event.message));
      }
      if (!events.length) timeline.append(DOM.el('p', 'No activity recorded yet.', 'muted'));
      DOM.get('pm-dashboard').append(timeline);
    }

    DOM.get('pm-summary').textContent = project
      ? `${project.name}: ${pm.items.filter(i => i.status === 'ACCEPTED').length} of ${pm.items.length} planned outcomes accepted. ${pending} uncollected message(s).`
      : 'Select or submit a project to plan its delivery.';

    // ── Outcome Items ──
    DOM.get('pm-items').replaceChildren();
    for (const item of pm.items) {
      const card = DOM.el('article');
      card.append(DOM.el('h4', item.title), DOM.el('p', 'Type: ' + item.kind + ' · Status: ' + item.status), DOM.el('p', 'Done means: ' + item.criteria));
      if (item.status === 'ACCEPTED') {
        card.append(DOM.el('p', 'Accepted ' + Fmt.date(item.accepted_at) + ' · Evidence: ' + item.evidence));
      } else {
        const form = DOM.el('form');
        form.style.cssText = 'display:grid;gap:8px;margin-top:8px';
        const lbl = DOM.el('label', 'Deliverable URL / Path & Verified Evidence');
        const inp = DOM.el('textarea');
        inp.required = true; inp.rows = 2; inp.maxLength = 2000;
        lbl.append(inp);
        form.append(lbl, DOM.el('button', 'Accept Outcome as Done', 'btn-primary'));
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          await _action({ action: 'pm_accept', item_id: item.id, evidence: inp.value });
        });
        card.append(form);
      }
      DOM.get('pm-items').append(card);
    }

    // ── Batch selector ──
    const prevBatch = DOM.get('pm-batch').value;
    DOM.get('pm-batch').replaceChildren(...pm.batches.map(b => new Option(Fmt.date(b.at) + ' · ' + b.status, b.id)));
    if (pm.batches.some(b => b.id === prevBatch)) DOM.get('pm-batch').value = prevBatch;

    // ── Discussion Batches ──
    DOM.get('pm-batches').replaceChildren();
    for (const batch of [...pm.batches].reverse()) {
      const detail = DOM.el('details');
      detail.append(DOM.el('summary', Fmt.date(batch.at) + ' · ' + batch.message_ids.length + ' messages · ' + batch.status));
      for (const proposal of batch.proposals) {
        const box = DOM.el('div');
        box.append(DOM.el('b', 'Suggested ' + proposal.category), DOM.el('p', proposal.text));
        const useBtn = DOM.el('button', 'Prepare This Revision');
        useBtn.addEventListener('click', () => {
          DOM.get('pm-batch').value = batch.id;
          DOM.get('pm-category').value = proposal.category;
          const latest = pm.versions.filter(v => v.category === proposal.category).at(-1);
          DOM.get('pm-content').value = (latest ? latest.content + '\n\n' : '') + proposal.text;
          DOM.get('pm-content').focus();
        });
        box.append(useBtn);
        detail.append(box);
      }
      const sources = DOM.el('details');
      sources.append(DOM.el('summary', 'Read source messages'));
      for (const msg of messages.filter(m => batch.message_ids.includes(m.id))) {
        sources.append(DOM.el('p', msg.sender + ' · ' + Fmt.date(msg.at) + '\n' + msg.content));
      }
      detail.append(sources);
      if (batch.status === 'REVIEW') {
        const doneBtn = DOM.el('button', 'Mark Batch Reviewed', 'btn-primary');
        doneBtn.addEventListener('click', () => _action({ action: 'pm_reviewed', batch_id: batch.id }));
        detail.append(doneBtn);
      }
      DOM.get('pm-batches').append(detail);
    }

    // ── Versions ──
    DOM.get('pm-versions').replaceChildren();
    for (const version of [...pm.versions].reverse()) {
      const detail = DOM.el('details');
      detail.append(DOM.el('summary', version.category + ' v' + version.number + ' · ' + Fmt.date(version.at)), DOM.el('pre', version.content));
      const old = pm.versions.find(v => v.category === version.category && v.number === version.number - 1);
      if (old) {
        const prev = DOM.el('details');
        prev.append(DOM.el('summary', 'Compare previous version (v' + old.number + ')'), DOM.el('pre', old.content));
        detail.append(prev);
      }
      DOM.get('pm-versions').append(detail);
    }

    // ── Closeout ──
    DOM.get('pm-closeout').replaceChildren();
    if (pm.closeout) {
      DOM.get('pm-closeout').append(DOM.el('p', 'Accepted on ' + Fmt.date(pm.closeout.at)), DOM.el('p', pm.closeout.summary));
    }
    DOM.get('pm-collect').disabled = !pending || !project || ['COMPLETED','ARCHIVED'].includes(project.status);
  }

  function mount() {
    DOM.get('pm-project').addEventListener('change', () => {
      for (const id of ['pm-content','pm-close-summary','pm-title','pm-criteria']) DOM.get(id).value = '';
      const d = Store.get();
      if (!d) return;
      update(d);
      const chatProject = DOM.get('chat-project');
      if (chatProject) chatProject.value = DOM.get('pm-project').value;
      ChatComponent.update(d);
    });

    DOM.get('pm-item-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (await _action({ action: 'pm_item', kind: DOM.get('pm-kind').value, title: DOM.get('pm-title').value, criteria: DOM.get('pm-criteria').value })) {
        DOM.get('pm-title').value = '';
        DOM.get('pm-criteria').value = '';
      }
    });

    DOM.get('pm-collect').addEventListener('click', () => _action({ action: 'pm_collect' }));

    DOM.get('pm-version-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (await _action({ action: 'pm_version', batch_id: DOM.get('pm-batch').value, category: DOM.get('pm-category').value, content: DOM.get('pm-content').value })) {
        DOM.get('pm-content').value = '';
      }
    });

    DOM.get('pm-close-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await _action({ action: 'pm_closeout', summary: DOM.get('pm-close-summary').value });
    });

    DOM.get('pm-export').addEventListener('click', () => {
      const project = _project();
      if (!project) return;
      const blob = new Blob([JSON.stringify({ project, events: Store.get().projects.events.filter(e => e.project_id === project.id) }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = DOM.el('a');
      link.href = url;
      link.download = project.id + '-project-records.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  return { mount, update };
})();

// =============================================================================
// COMPONENT: OrchestrationComponent (#orchestration)
// =============================================================================
const OrchestrationComponent = (() => {
  function update(data) {
    DOM.get('worker-state').textContent = data.orchestrator.state;
    DOM.get('worker-notice').textContent = data.orchestrator.notice + (data.orchestrator.at ? ' · Last heartbeat ' + Fmt.date(data.orchestrator.at) : '');
    DOM.fillSelect('job-project', data.projects.projects.filter(p => p.status === 'STARTED'));

    const container = DOM.get('jobcards');
    container.replaceChildren();

    for (const job of (data.projects.jobs || []).slice().reverse()) {
      const project = data.projects.projects.find(p => p.id === job.project_id);
      const card = DOM.el('div');
      card.append(
        Fmt.badge(job.status),
        DOM.el('h3', (project?.name || job.project_id) + ' · ' + job.kind),
        DOM.el('p', 'Worker: ' + job.worker + ' · ' + (job.model||'account default') + (job.team_models?' · Team stage '+(job.team_stage+1)+'/3':'') + ' · ' + job.id + ' (Attempts: ' + job.attempts + ')')
      );

      const detail = DOM.el('details');
      detail.append(DOM.el('summary', 'Review exact prompt'), DOM.el('pre', job.prompt, 'job-prompt'));
      card.append(detail);

      const actions = DOM.el('div', undefined, 'project-actions');
      if (job.status === 'REQUESTED') {
        const approve = DOM.el('button', '✅ Approve & Run (Zero-Cost)', 'btn-primary');
        approve.addEventListener('click', () => AppController.saveProject({ action: 'approve_job', id: job.project_id, job_id: job.id, expected_revision: data.projects.revision }));
        actions.append(approve);
      }
      if (['REQUESTED','APPROVED','RUNNING','PAUSED'].includes(job.status)) {
        const cancel = DOM.el('button', '✕ Cancel Job');
        cancel.addEventListener('click', () => AppController.saveProject({ action: 'cancel_job', id: job.project_id, job_id: job.id, expected_revision: data.projects.revision }));
        actions.append(cancel);
      }
      card.append(actions);

      if (job.error) card.append(DOM.el('p', 'Blocker: ' + job.error, 'attention-item'));
      if (data.orchestrator.results[job.id]) {
        const result = DOM.el('details');
        result.append(DOM.el('summary', 'Read Worker Result (Output Verified)'), DOM.el('pre', data.orchestrator.results[job.id], 'job-result'));
        card.append(result);
      }
      container.append(card);
    }
    if (!(data.projects.jobs || []).length) {
      container.append(DOM.el('p', 'No worker jobs requested yet. Start a submitted project to prepare its plan.', 'muted'));
    }
  }

  function mount() {
    DOM.get('job-model').disabled=DOM.get('job-worker').value!=='antigravity';
    DOM.get('job-worker').addEventListener('change',()=>{DOM.get('job-model').disabled=DOM.get('job-worker').value!=='antigravity';});
    DOM.get('team-reviewer').value='claude-sonnet-4-6';
    DOM.get('team-synthesizer').value='gpt-oss-120b-medium';
    DOM.get('team-request').addEventListener('click',()=>{const data=Store.get();if(!data||!DOM.get('job-project').value)return;AppController.saveProject({action:'team_job',id:DOM.get('job-project').value,models:['team-planner','team-reviewer','team-synthesizer'].map(id=>DOM.get(id).value),expected_revision:data.projects.revision});});
    DOM.get('job-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Store.get();
      if (!DOM.get('job-project').value || !data) return;
      AppController.saveProject({
        action: 'request_job',
        id: DOM.get('job-project').value,
        worker: DOM.get('job-worker').value,
        model: DOM.get('job-worker').value==='antigravity'?DOM.get('job-model').value:null,
        kind: DOM.get('job-kind').value,
        expected_revision: data.projects.revision
      });
    });
  }

  return { mount, update };
})();

// =============================================================================
// COMPONENT: MarketingComponent (#marketing)
// =============================================================================
const MarketingComponent = (() => {
  let _editing = null;
  let _editRevision = null;

  function _reset() {
    _editing = null;
    _editRevision = null;
    DOM.get('campaign-form').reset();
    DOM.get('campaign-save').textContent = 'Save Draft';
    DOM.get('campaign-cancel').hidden = true;
  }

  async function _save(payload) {
    DOM.get('campaign-save').disabled = true;
    try {
      await API.post(payload, Store.get().write_token);
      _reset();
      await AppController.refresh();
      DOM.get('campaign-message').textContent = 'Saved draft successfully.';
    } catch (err) {
      DOM.get('campaign-message').textContent = err.message;
    } finally {
      DOM.get('campaign-save').disabled = false;
    }
  }

  function update(data) {
    DOM.fillSelect('campaign-project', data.projects.projects.filter(p => p.status !== 'ARCHIVED'));
    const container = DOM.get('campaigncards');
    container.replaceChildren();

    for (const campaign of data.projects.campaigns || []) {
      const project = data.projects.projects.find(p => p.id === campaign.project_id);
      const card = DOM.el('article', undefined, 'project-card');card.dataset.project=campaign.project_id;
      card.append(
        Fmt.badge(campaign.status),
        DOM.el('h3', campaign.title),
        DOM.el('small', (project?.name || campaign.project_id) + ' · Channel: ' + campaign.channel),
        DOM.el('p', 'Audience: ' + campaign.audience),
        DOM.el('p', campaign.content),
        DOM.el('small', 'Evidence: ' + (campaign.evidence || 'Not recorded'))
      );
      const actions = DOM.el('div', undefined, 'project-actions');

      const edit = DOM.el('button', '✏️ Edit Draft');
      edit.addEventListener('click', () => {
        _editing = campaign.id;
        _editRevision = data.projects.revision;
        DOM.get('campaign-project').value = campaign.project_id;
        for (const f of ['title','audience','channel','content','evidence']) DOM.get('campaign-' + f).value = campaign[f];
        DOM.get('campaign-save').textContent = 'Save Revised Draft';
        DOM.get('campaign-cancel').hidden = false;
        DOM.get('campaign-title').focus();
      });
      actions.append(edit);

      if (campaign.status === 'DRAFT') {
        const label = DOM.el('label', 'I confirm rights and verified claims');
        label.style.flexDirection = 'row';
        label.style.alignItems = 'center';
        const check = DOM.el('input');
        check.type = 'checkbox';
        label.prepend(check);
        card.append(label);
        const approve = DOM.el('button', '✅ Approve Content', 'btn-primary');
        approve.disabled = true;
        check.addEventListener('change', () => approve.disabled = !check.checked);
        approve.addEventListener('click', () => _save({ action: 'approve_campaign', id: campaign.project_id, campaign_id: campaign.id, expected_revision: data.projects.revision, rights_confirmed: check.checked }));
        actions.append(approve);
      } else {
        card.append(DOM.el('small', 'Approved ' + Fmt.date(campaign.approved_at) + ' (Not published externally)'));
      }
      card.append(actions);
      container.append(card);
    }
    if (!(data.projects.campaigns || []).length) {
      container.append(DOM.el('p', 'No campaign drafts yet. Create your first draft above.', 'muted'));
    }
  }

  function mount() {
    DOM.get('campaign-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Store.get();
      if (!data) return;
      const payload = {
        action: 'save_campaign',
        id: DOM.get('campaign-project').value,
        campaign_id: _editing,
        expected_revision: _editing ? _editRevision : data.projects.revision
      };
      for (const f of ['title','audience','channel','content','evidence']) payload[f] = DOM.get('campaign-' + f).value;
      _save(payload);
    });
    DOM.get('campaign-cancel').addEventListener('click', _reset);
  }

  return { mount, update };
})();

// =============================================================================
// COMPONENT: TaskBoardComponent (#tasks)
// =============================================================================
const TaskBoardComponent = (() => {
  function _details(task) {
    const body = DOM.get('detailbody');
    body.replaceChildren(
      DOM.el('p', task.id, 'eyebrow'),
      DOM.el('h2', task.title),
      Fmt.badge(task.status)
    );
    for (const [label, values] of [
      ['Acceptance Criteria', task.acceptance_criteria],
      ['Deliverables', task.deliverables],
      ['Evidence', task.evidence]
    ]) {
      body.append(DOM.el('h3', label, 'modal-subhead'));
      const list = DOM.el('ul');
      for (const value of (values && values.length) ? values : ['None recorded']) {
        list.append(DOM.el('li', value));
      }
      body.append(list);
    }
    DOM.get('detail').showModal();
  }

  function update(data) {
    const query = DOM.get('search').value.toLowerCase();
    const tasks = [...data.tasks.tasks,...data.projects.projects.flatMap(p=>(p.management?.items||[]).filter(i=>i.plan_id).map(i=>({id:i.id,title:i.title,owner:i.owner||'Unassigned',reviewer:'Owner',status:i.status==='ACCEPTED'?'COMPLETED':({DOING:'IN_PROGRESS',REVIEW:'READY_FOR_REVIEW',BLOCKED:'BLOCKED'}[i.work_status]||'READY'),acceptance_criteria:[i.criteria],deliverables:[i.title],evidence:i.evidence?[i.evidence]:[],dependencies:[],project_id:p.id})))];
    const filtered = tasks.filter(t =>
      JSON.stringify(t).toLowerCase().includes(query) &&
      (!DOM.get('status').value || t.status === DOM.get('status').value)
    );
    const grouped=DOM.get('grouped-task-board');
    const closed=new Set([...grouped.querySelectorAll('details')].filter(d=>!d.open).map(d=>d.dataset.group));
    grouped.replaceChildren();
    const groups=[['To do',['READY'],'todo'],['In progress',['IN_PROGRESS'],'doing'],['On review',['READY_FOR_REVIEW','IN_REVIEW','CHANGES_REQUESTED'],'review'],['Blocked',['BLOCKED'],'blocked'],['Approved',['APPROVED'],'approved'],['Done',['COMPLETED'],'done']];
    for(const [label,statuses,color] of groups){
      const members=filtered.filter(t=>statuses.includes(t.status));
      const section=DOM.el('details',undefined,'task-group task-group-'+color);section.dataset.group=color;section.open=!closed.has(color);
      const summary=DOM.el('summary');summary.append(DOM.el('span',label),DOM.el('b',members.length));section.append(summary);
      const headings=DOM.el('div',undefined,'group-task-head');for(const title of ['Task','Description','Owner','Status','Dependencies'])headings.append(DOM.el('span',title));section.append(headings);
      for(const task of members){const row=DOM.el('div',undefined,'group-task-row');const title=DOM.el('button',task.title,'tasklink');title.addEventListener('click',()=>_details(task));const description=DOM.el('span',task.acceptance_criteria?.[0]||'Open for details','task-description');const owner=DOM.el('span',undefined,'task-owner');owner.append(DOM.el('i',task.owner.slice(0,2).toUpperCase()),DOM.el('span',task.owner));const status=DOM.el('span',Fmt.statusLabel(task.status),'task-pill');const deps=DOM.el('span',task.dependencies.length?task.dependencies.join(', '):'—','task-dependencies');row.append(title,description,owner,status,deps);section.append(row);}
      if(!members.length)section.append(DOM.el('p','No tasks in this group.','group-empty'));
      grouped.append(section);
    }
    DOM.get('taskrows').replaceChildren();
    for (const task of filtered) {
      const row = DOM.el('tr');
      const title = DOM.el('td');
      const btn = DOM.el('button', task.title, 'tasklink');
      btn.addEventListener('click', () => _details(task));
      title.append(btn, DOM.el('small', task.id));

      const owner = DOM.el('td', task.owner);
      owner.append(DOM.el('small', 'Review: ' + task.reviewer));

      const statusCell = DOM.el('td');
      statusCell.append(Fmt.badge(task.status));

      const deps = DOM.el('td');
      if (!task.dependencies.length) { deps.textContent = 'None'; }
      for (const id of task.dependencies) {
        const dep = tasks.find(t => t.id === id);
        deps.append(DOM.el('div', id), DOM.el('small', dep?.status === 'COMPLETED' ? '✓ Satisfied' : '⏳ Waiting'));
      }
      row.append(title, owner, statusCell, deps);
      DOM.get('taskrows').append(row);
    }
    if (!filtered.length) {
      const row = DOM.el('tr');
      const cell = DOM.el('td', 'No tasks match these filters.');
      cell.colSpan = 4;
      row.append(cell);
      DOM.get('taskrows').append(row);
    }

    // Rebuild status filter options
    const prev = DOM.get('status').value;
    DOM.get('status').replaceChildren(new Option('All Statuses', ''), ...Array.from(new Set(tasks.map(t => t.status))).map(s => new Option(Fmt.statusLabel(s), s)));
    DOM.get('status').value = prev;
  }

  function mount() {
    DOM.get('task-list-view').addEventListener('click',()=>{DOM.get('grouped-task-board').classList.remove('cards-view');DOM.get('task-list-view').classList.add('selected');DOM.get('task-card-view').classList.remove('selected');});
    DOM.get('task-card-view').addEventListener('click',()=>{DOM.get('grouped-task-board').classList.add('cards-view');DOM.get('task-card-view').classList.add('selected');DOM.get('task-list-view').classList.remove('selected');});
    DOM.get('search').addEventListener('input', () => { const d = Store.get(); if (d) update(d); });
    DOM.get('status').addEventListener('change', () => { const d = Store.get(); if (d) update(d); });
    DOM.get('close').addEventListener('click', () => DOM.get('detail').close());
  }

  return { mount, update };
})();

// =============================================================================
// COMPONENT: OverviewComponent (#overview)
// =============================================================================
const OverviewComponent = (() => {
  function update(data) {
    const tasks = data.tasks.tasks;
    const metrics = [
      ['Tasks Recorded', tasks.length, 'Canonical definition file'],
      ['In Progress',    tasks.filter(t => t.status === 'IN_PROGRESS').length, 'Active implementation'],
      ['Pending Reviews',data.reviews.reviews.filter(r => r.status === 'PENDING').length, 'Independent 4-eye gate'],
      ['Completed',      tasks.filter(t => t.status === 'COMPLETED').length, 'Human accepted']
    ];
    DOM.get('metrics').replaceChildren(...metrics.map(([label, number, note]) => {
      const card = DOM.el('div', undefined, 'metric');
      card.append(DOM.el('span', label), DOM.el('strong', number), DOM.el('span', note));
      return card;
    }));

    DOM.get('flow').replaceChildren(...data.state.flow.map((step, i) => {
      const row = DOM.el('div', undefined, 'flowitem');
      const text = DOM.el('div');
      text.append(DOM.el('b', step.name), DOM.el('small', step.state));
      row.append(DOM.el('span', i + 1, 'step'), text);
      return row;
    }));

    DOM.get('notice').textContent = data.state.notice;
    DOM.get('git').replaceChildren();
    for (const [key, value] of Object.entries(data.git)) {
      DOM.get('git').append(DOM.el('dt', key), DOM.el('dd', value || (key === 'changes' ? 'Clean working tree' : 'Detached HEAD')));
    }
  }

  return { update };
})();

// =============================================================================
// COMPONENT: AgentsComponent (#agents)
// =============================================================================
const AgentsComponent = (() => {
  function update(data) {
    const container=DOM.get('agentcards');container.replaceChildren();
    const profileAgents=(data.agent_profiles||[]).map(p=>({name:p.name,room:p.room,role:'Model profile · '+p.provider,installation:p.model,authentication:'Available in the installed model list. Current quota is not verified.',participation:'On standby; activated only by a direct message, group broadcast or approved plan.'}));
    for(const agent of [...data.agents.agents,...profileAgents]){
      const card=DOM.el('article',undefined,'participant-card');const head=DOM.el('div',undefined,'participant-top');
      const name=agent.name;const routeKey=agent.room||(name==='Grok'?'grok':name==='Gemini'?'ag-gemini-low':name==='Antigravity'?'antigravity':'codex');const health=data.agent_health?.[routeKey];const mode=SupervisionUI.healthLabel(health);
      const avatar=DOM.el('span',name==='ChatGPT'?'GPT':name.slice(0,2).toUpperCase(),'participant-avatar agent-'+name.toLowerCase());
      head.append(avatar,Fmt.badge(mode));card.append(head,DOM.el('h3',name),DOM.el('p',agent.role,'participant-role'));
      const route=agent.room?'Antigravity · existing account allowance':name==='ChatGPT'?'Planning through your Codex account':name==='Gemini'?'Planning through Antigravity':name==='Grok'?'Manual handoff · no automatic requests':name==='Codex'?'Existing ChatGPT account':'Existing Google account';
      const info=DOM.el('div',undefined,'participant-route');info.append(DOM.el('small','CONNECTION ROUTE'),DOM.el('p',route));card.append(info);
      const details=DOM.el('details');details.open=Boolean(container.closest('.connection-view'));details.append(DOM.el('summary','Connection details'));
      for(const [key,label] of [['installation','Available tooling'],['authentication','Authentication'],['participation','Last recorded participation']]){const row=DOM.el('div',undefined,'participant-fact');row.append(DOM.el('small',label),DOM.el('p',agent[key]));details.append(row);}card.append(details);
      const footer=DOM.el('div',undefined,'participant-footer');footer.append(DOM.el('small',health?.checked_at?'Last checked '+Fmt.date(health.checked_at):'No availability check yet'));
      const chat=DOM.el('button',name==='Grok'?'View handoff':'Open chat →');chat.addEventListener('click',()=>{const project=Store.get().projects.projects[0];if(!project)return;WorkspaceUI.openProject(project.id,'conversation');const recipient=agent.room|| (name==='Grok'?'grok':name==='Gemini'?'ag-gemini-low':name==='Antigravity'?'antigravity':'codex');DOM.get('chat-recipient').value=recipient;DOM.get('chat-recipient').dispatchEvent(new Event('change'));});footer.append(chat);card.append(footer);container.append(card);
    }
  }
  return {update};
})();

// =============================================================================
// COMPONENT: ReviewsComponent (#reviews)
// =============================================================================
const ReviewsComponent = (() => {
  function update(data) {
    DOM.get('reviewcards').replaceChildren(...data.reviews.reviews.map(review => {
      const card = DOM.el('div');
      card.append(Fmt.badge(review.status), DOM.el('h3', review.task + ' · ' + review.reviewer), DOM.el('p', review.evidence));
      return card;
    }));
    if (!data.reviews.reviews.length) {
      DOM.get('reviewcards').append(DOM.el('p', 'No reviews recorded yet.', 'muted'));
    }
  }

  return { update };
})();

// =============================================================================
// COMPONENT: ActivityComponent (#activity)
// =============================================================================
const ActivityComponent = (() => {
  function update(data) {
    DOM.get('events').replaceChildren(...data.activity.slice().reverse().map(event => {
      const row=DOM.el('article',undefined,'event activity-entry');const actor=event.actor||'CADF';
      const marker=DOM.el('span',actor==='CADF orchestrator'?'↗':actor.slice(0,1).toUpperCase(),'activity-avatar');
      const content=DOM.el('div',undefined,'activity-content');const top=DOM.el('div',undefined,'activity-topline');
      top.append(DOM.el('b',actor),DOM.el('span',Fmt.statusLabel(event.kind||'update').toLowerCase(),'activity-kind'));
      const message=DOM.el('p',event.message);content.append(top,message);
      const project=data.projects.projects.find(p=>p.id===event.project_id);
      if(project){const link=DOM.el('button',project.name+' →','activity-project');link.addEventListener('click',()=>WorkspaceUI.openProject(project.id));content.append(link);}
      const time=DOM.el('time',Fmt.date(event.at));time.dateTime=event.at;row.append(marker,content,time);return row;
    }));
    if (!data.activity.length) DOM.get('events').textContent = 'No activity recorded yet.';
  }

  return { update };
})();

// =============================================================================
// COMPONENT: DocumentsComponent (#documents)
// =============================================================================
const DocumentsComponent = (() => {
  function renderDoc() {
    const data = Store.get();
    if (!data) return;
    DOM.get('documentbody').textContent = data.documents[DOM.get('document').value] ?? 'No document selected.';
  }

  function update(data) {
    const prev = DOM.get('document').value;
    DOM.get('document').replaceChildren(...Object.keys(data.documents).map(name => new Option(name, name)));
    DOM.get('document').value = Object.hasOwn(data.documents, prev) ? prev : 'docs/DECISIONS.md';
    renderDoc();
  }

  function mount() {
    DOM.get('document').addEventListener('change', renderDoc);
  }

  return { mount, update };
})();

// =============================================================================
// APP CONTROLLER – orchestrates all components + refresh cycle
// =============================================================================
const AppController = (() => {
  let _projectBusy = false;
  let _refreshing = false;
  let snapshotKey=null;

  async function refresh() {
    if(_refreshing)return;_refreshing=true;
    try {
      const data = await API.snapshot();
      const key=JSON.stringify({...data,read_at:undefined,orchestrator:{state:data.orchestrator.state,job_id:data.orchestrator.job_id,notice:data.orchestrator.notice,results:data.orchestrator.results}});
      if(key!==snapshotKey){Store.set(data);snapshotKey=key;}
      DOM.get('connection').className = '';
      DOM.get('connection').textContent = 'File snapshot refreshed ' + Fmt.date(data.read_at) + ' · loopback only · zero API spend';
    } catch (err) {
      const connection = DOM.get('connection');
      connection.className = 'error';
      connection.textContent = (Store.get() ? 'STALE — showing previous snapshot. ' : 'Records unavailable. ') + err.message;
    } finally {
      _refreshing=false;
    }
  }

  async function saveProject(payload) {
    if (_projectBusy || !Store.get()) return;
    _projectBusy = true;
    ProjectsComponent.setBusy(true);
    const data = Store.get();
    ProjectsComponent.update(data);
    DOM.get('project-message').textContent = 'Saving project…';
    try {
      const result = await API.post(payload, data.write_token);
      await refresh();
      DOM.get('project-message').textContent = 'Saved: ' + (result.project?.name || payload.action) + ' (' + (result.project?.status || 'done') + ').';
    } catch (err) {
      DOM.get('project-message').textContent = err.message + ' Refresh before retrying if interrupted.';
      DOM.get('project-message').className = 'error';
    } finally {
      _projectBusy = false;
      ProjectsComponent.setBusy(false);
      DOM.get('project-save').disabled = false;
      const d = Store.get();
      if (d) { ProjectsComponent.update(d); OrchestrationComponent.update(d); }
    }
  }

  function _renderAll(data) {
    DOM.get('phase').textContent = Fmt.statusLabel(data.state.project.phase);
    ChatComponent.update(data);
    ManagementComponent.update(data);
    ProjectsComponent.update(data);
    OrchestrationComponent.update(data);
    MarketingComponent.update(data);
    TaskBoardComponent.update(data);
    OverviewComponent.update(data);
    AgentsComponent.update(data);
    ReviewsComponent.update(data);
    ActivityComponent.update(data);
    DocumentsComponent.update(data);
    VisualWorkspace.update(data);
    SectionViews.refresh();
    SupervisionUI.update(data);
    WorkspaceUI.update(data);
  }

  function init() {
    // Mount all components (bind events)
    ChatComponent.mount();
    ProjectsComponent.mount();
    ManagementComponent.mount();
    OrchestrationComponent.mount();
    MarketingComponent.mount();
    TaskBoardComponent.mount();
    DocumentsComponent.mount();
    WorkspaceUI.beforeMount();
    SectionViews.mount();
    VisualWorkspace.mount();
    SupervisionUI.mount();
    WorkspaceUI.mount();

    // Subscribe store to render pipeline
    Store.subscribe(_renderAll);

    // Global controls
    setInterval(() => {if(!document.hidden)refresh();}, 12000);
    window.addEventListener('focus',refresh);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});

    // Boot
    Router.activate(location.hash || '#conversation');
    refresh();
  }

  return { init, refresh, saveProject };
})();

// =============================================================================
// BOOT
// =============================================================================

const VisualWorkspace=(()=>{
 let projectView="table";
 function jump(id){const select=DOM.get('chat-project');select.value=id;select.dispatchEvent(new Event('change'));Router.activate('#conversation');}
 const contacts=[{id:'team',name:'Everyone',icon:'✦',note:'Shared project conversation'},{id:'codex',name:'Codex',icon:'C',note:'Connected · account worker'},{id:'antigravity',name:'Antigravity',icon:'A',note:'Connected · choose a model'},{id:'grok',name:'Grok',icon:'G',note:'Standby · manual handoff'}];
 const recent=[];
 function openContact(contact){
   DOM.get('chat-recipient').value=contact.id;
   DOM.get('chat-recipient').dispatchEvent(new Event('change'));
   if(!recent.includes(contact.id))recent.unshift(contact.id);
   if(Store.get()){ChatComponent.update(Store.get());rooms(Store.get());}
   DOM.get('chat-input').focus();
 }
 function rooms(data){
  for(const profile of data.agent_profiles||[]){if(!contacts.some(c=>c.id===profile.room))contacts.push({id:profile.room,name:profile.name,icon:profile.name.slice(0,1),note:'Standby · '+profile.model});}
   const list=DOM.get('room-list');list.replaceChildren();const query=DOM.get('room-search').value.toLowerCase();const selected=DOM.get('chat-recipient').value;
   for(const contact of contacts.filter(c=>c.name.toLowerCase().includes(query))){const row=DOM.el('button',undefined,'room-item'+(contact.id===selected?' selected':''));row.setAttribute('aria-label','Chat with '+contact.name);const text=DOM.el('span');text.append(DOM.el('b',contact.name),DOM.el('small',contact.note));row.append(DOM.el('span',contact.icon,'room-avatar'),text);row.addEventListener('click',()=>openContact(contact));list.append(row);}
   for(const c of contacts){if(c.id!=='team'){c.status=SupervisionUI.healthLabel(data.agent_health?.[c.id]);c.note=c.status+(c.id==='antigravity'?' · account default':'');}}
   WorkspaceUI.configureContacts(contacts,selected,openContact);
   const contact=contacts.find(c=>c.id===selected);const project=data.projects.projects.find(p=>p.id===DOM.get('chat-project').value);
   const switcher=DOM.el('button',undefined,'contact-menu-button');switcher.id='contact-menu-button';switcher.type='button';switcher.setAttribute('aria-label','Choose conversation, current '+(contact?.name||'Everyone'));switcher.setAttribute('aria-haspopup','dialog');switcher.setAttribute('aria-controls','contact-picker');switcher.setAttribute('aria-expanded',String(Boolean(DOM.get('contact-picker')?.open)));switcher.title='Choose an agent or group';switcher.append(DOM.el('span',contact?.icon||'✦','room-avatar'));switcher.addEventListener('click',WorkspaceUI.openContacts);
   DOM.get('room-summary').replaceChildren(switcher,DOM.el('b',contact?.name||'Everyone'),DOM.el('small',selected==='team'?'Group conversation':selected==='grok'?'Private · manual handoff':'Private conversation'));
 }

 function update(data){rooms(data);const host=DOM.get('visual-analytics');host.replaceChildren();const projects=data.projects.projects;const done=projects.filter(p=>p.status==='COMPLETED').length;
  const stats=DOM.el('div',undefined,'reference-stats');for(const [name,value] of [['Total projects',projects.length],['Completed',done],['In progress',projects.filter(p=>p.status==='STARTED').length],['Waiting',projects.filter(p=>['SUBMITTED','QUEUED'].includes(p.status)).length]]){const card=DOM.el('article');card.append(DOM.el('span',name),DOM.el('strong',value),DOM.el('small','From project records'));stats.append(card);}host.append(stats);
  const charts=DOM.el('div',undefined,'reference-charts');const activity=DOM.el('article');activity.append(DOM.el('h3','Workspace activity'),DOM.el('p','Recorded events · last 7 days','muted'));const bars=DOM.el('div',undefined,'activity-bars');const dates=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-6+i);return d;});const counts=dates.map(d=>data.activity.filter(e=>new Date(e.at).toDateString()===d.toDateString()).length);const max=Math.max(1,...counts);dates.forEach((d,i)=>{const bar=DOM.el('div');const fill=DOM.el('span',String(counts[i]));fill.style.height=(counts[i]/max*140+4)+'px';bar.append(fill,DOM.el('small',d.toLocaleDateString(undefined,{weekday:'short'})));bars.append(bar);});activity.append(bars);
  const progress=DOM.el('article');progress.append(DOM.el('h3','Project completion'));const percent=projects.length?Math.round(done/projects.length*100):0;const donut=DOM.el('div',undefined,'progress-ring');donut.style.background=`conic-gradient(#7954eb ${percent*3.6}deg,#eeebf5 0)`;const middle=DOM.el('span');middle.append(DOM.el('strong',projects.length?percent+'%':'—'),DOM.el('small',projects.length?'Completed':'No projects yet'));donut.append(middle);progress.append(donut);charts.append(activity,progress);host.append(charts);
  const team=DOM.el('article',undefined,'dashboard-team');team.append(DOM.el('h3','Team collaboration'));for(const agent of data.agents.agents){const row=DOM.el('div',undefined,'team-person');const identity=DOM.el('div');identity.append(DOM.el('b',agent.name),DOM.el('small',agent.role));const status=agent.name==='Grok'?'Standby':['Codex','Antigravity'].includes(agent.name)?'Configured':'Manual';row.append(DOM.el('span',agent.name.slice(0,1),'room-avatar'),identity,DOM.el('span',status,'team-state'));team.append(row);}host.append(team);
  const portfolio=DOM.el('article',undefined,'dashboard-portfolio');const heading=DOM.el('div',undefined,'portfolio-heading');heading.append(DOM.el('h3','Projects'));const add=DOM.el('a','＋ Add project');add.href='#projects';heading.append(add);portfolio.append(heading);const portfolioTable=DOM.el('table');portfolioTable.id='dashboard-project-table';const tr=DOM.el('tr');for(const label of ['Project','Status','Priority','Updated',''])tr.append(DOM.el('th',label));portfolioTable.append(tr);for(const p of projects){const row=DOM.el('tr');row.append(DOM.el('td',p.name),DOM.el('td',Fmt.statusLabel(p.status)),DOM.el('td',p.priority),DOM.el('td',Fmt.date(p.updated_at)));const cell=DOM.el('td');const button=DOM.el('button','Open →');button.addEventListener('click',()=>WorkspaceUI.openProject(p.id));cell.append(button);row.append(cell);portfolioTable.append(row);}portfolio.append(portfolioTable);if(!projects.length)portfolio.append(DOM.el('p','Your next project starts here.','muted'));host.append(portfolio);
  const board=DOM.get('visual-project-board');if(document.activeElement?.closest('#visual-project-board input,#visual-project-board select'))return;board.replaceChildren();const p=projects.find(p=>p.id===DOM.get('pm-project').value);const items=p?.management?.items||[];
  const views=DOM.el('div',undefined,'pm-view-tabs');for(const [id,label] of [['table','▤ Main table'],['kanban','▦ Kanban'],['gantt','▥ Gantt']]){const button=DOM.el('button',label,projectView===id?'selected':'');button.addEventListener('click',()=>{projectView=id;update(Store.get());});views.append(button);}board.append(views);
  const feedback=DOM.el('p',undefined,'pm-inline-feedback');feedback.setAttribute('role','status');board.append(feedback);
  async function save(item,field,value){try{await API.post({action:'pm_schedule',id:p.id,item_id:item.id,[field]:value,expected_revision:Store.get().projects.revision},Store.get().write_token);await AppController.refresh();}catch(e){feedback.textContent=e.message;}}
  const today=new Date();const month=today.toISOString().slice(0,7);const next=new Date(today.getFullYear(),today.getMonth()+1,1).toLocaleDateString('sv-SE').slice(0,7);
  const groups=[['This month & overdue',items.filter(i=>i.due_date&&i.due_date.slice(0,7)<=month)],['Next month',items.filter(i=>i.due_date?.startsWith(next))],['Later',items.filter(i=>i.due_date&&i.due_date.slice(0,7)>next)],['Unscheduled',items.filter(i=>!i.due_date)]];
  if(projectView==='table') for(const [name,group] of groups){if(!group.length)continue;const section=DOM.el('div',undefined,'pm-date-group');section.append(DOM.el('h3',name));const table=DOM.el('table');const headings=DOM.el('tr');for(const label of ['Outcome','Owner','Status','Start','Due date','Priority',''])headings.append(DOM.el('th',label));table.append(headings);
    for(const item of group){const row=DOM.el('tr');row.dataset.state=item.status==='ACCEPTED'?'done':({DOING:'working',BLOCKED:'stuck',REVIEW:'review',TODO:'todo'}[item.work_status]||'todo');const title=DOM.el('td');title.append(DOM.el('b',item.title),DOM.el('small',item.kind));row.append(title);const locked=item.status==='ACCEPTED'||['COMPLETED','ARCHIVED'].includes(p.status);
      const ownerCell=DOM.el('td');const owner=DOM.el('input');owner.value=item.owner||'Unassigned';owner.maxLength=120;owner.setAttribute('aria-label','Owner for '+item.title);owner.disabled=locked;owner.addEventListener('change',()=>save(item,'owner',owner.value));ownerCell.append(owner);row.append(ownerCell);
      const stateCell=DOM.el('td',undefined,'pm-status-cell');const state=DOM.el('select');for(const [value,label] of [['TODO','To do'],['DOING','Working on it'],['BLOCKED','Stuck'],['REVIEW','On review'],...(item.status==='ACCEPTED'?[['DONE','Done']]:[])])state.append(new Option(label,value));state.value=item.status==='ACCEPTED'?'DONE':item.work_status||'TODO';state.className='state-'+state.value.toLowerCase();state.disabled=locked;state.setAttribute('aria-label','Status for '+item.title);state.addEventListener('change',()=>save(item,'work_status',state.value));stateCell.append(state);row.append(stateCell);
      const startCell=DOM.el('td');const startInput=DOM.el('input');startInput.type='date';startInput.value=item.start_date||'';startInput.disabled=locked;startInput.setAttribute('aria-label','Start date for '+item.title);startInput.addEventListener('change',()=>save(item,'start_date',startInput.value));startCell.append(startInput);row.append(startCell);
      const dueCell=DOM.el('td');const due=DOM.el('input');due.type='date';due.value=item.due_date||'';due.disabled=locked;due.setAttribute('aria-label','Due date for '+item.title);due.addEventListener('change',()=>save(item,'due_date',due.value));dueCell.append(due);row.append(dueCell);
      const priCell=DOM.el('td');const pri=DOM.el('select');for(const [value,label] of [['LOW','☆ Low'],['NORMAL','★ Normal'],['HIGH','★★ High']])pri.append(new Option(label,value));pri.value=item.priority||'NORMAL';pri.disabled=locked;pri.setAttribute('aria-label','Priority for '+item.title);pri.addEventListener('change',()=>save(item,'priority',pri.value));priCell.append(pri);row.append(priCell);
      const action=DOM.el('td');const details=DOM.el('button',item.status==='ACCEPTED'?'Evidence':'Review');details.addEventListener('click',()=>{const body=DOM.get('detailbody');body.replaceChildren(DOM.el('h2',item.title),DOM.el('p','Done means: '+item.criteria),DOM.el('p',item.evidence||'No delivered evidence yet.'));if(item.artifact)body.append(DOM.el('pre',item.artifact));if(!locked&&!item.plan_id){const form=DOM.el('form');const evidence=DOM.el('textarea');evidence.required=true;evidence.maxLength=2000;evidence.placeholder='Artifact reference and acceptance evidence';evidence.setAttribute('aria-label','Acceptance evidence');form.append(evidence,DOM.el('button','Accept as done'));form.addEventListener('submit',async e=>{e.preventDefault();try{await API.post({action:'pm_accept',id:p.id,item_id:item.id,evidence:evidence.value,expected_revision:Store.get().projects.revision},Store.get().write_token);DOM.get('detail').close();await AppController.refresh();}catch(error){feedback.textContent=error.message;}});body.append(form);}DOM.get('detail').showModal();});action.append(details);row.append(action);table.append(row);}
    section.append(table);board.append(section);
  }
  if(projectView==='kanban'){
    const lanes=DOM.el('div',undefined,'pm-kanban');for(const [state,label] of [['TODO','To do'],['DOING','Working on it'],['BLOCKED','Stuck'],['REVIEW','On review'],['DONE','Done']]){const lane=DOM.el('div');const members=items.filter(i=>(i.status==='ACCEPTED'?'DONE':i.work_status||'TODO')===state);lane.append(DOM.el('h3',label+' · '+members.length));for(const item of members){const card=DOM.el('article');card.dataset.state=item.status==='ACCEPTED'?'done':({DOING:'working',BLOCKED:'stuck',REVIEW:'review',TODO:'todo'}[item.work_status]||'todo');card.append(DOM.el('b',item.title),DOM.el('p',item.criteria),DOM.el('small',(item.owner||'Unassigned')+' · '+(item.due_date||'No due date')));if(item.status!=='ACCEPTED'&&!['COMPLETED','ARCHIVED'].includes(p.status)){const select=DOM.el('select');select.setAttribute('aria-label','Move '+item.title);for(const [value,name] of [['TODO','To do'],['DOING','Working on it'],['BLOCKED','Stuck']])select.append(new Option(name,value));select.value=item.work_status||'TODO';select.addEventListener('change',()=>save(item,'work_status',select.value));card.append(select);}lane.append(card);}lanes.append(lane);}board.append(lanes);
  }
  if(projectView==='gantt'){
    const scheduled=items.filter(i=>i.start_date&&i.due_date);const unscheduled=items.filter(i=>!i.start_date||!i.due_date);
    if(scheduled.length){const day=86400000;const parse=v=>Date.parse(v+'T00:00:00Z');const min=Math.min(...scheduled.map(i=>parse(i.start_date)));const max=Math.max(...scheduled.map(i=>parse(i.due_date)));const span=Math.max(day,max-min+day);const chart=DOM.el('div',undefined,'gantt-chart');const axis=DOM.el('div',undefined,'gantt-axis');axis.append(DOM.el('span','Outcome'));const labels=DOM.el('div');for(let n=0;n<=4;n++)labels.append(DOM.el('small',new Date(min+(max-min)*n/4).toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'})));axis.append(labels);chart.append(axis);
      for(const item of scheduled){const row=DOM.el('div',undefined,'gantt-row');row.dataset.state=item.status==='ACCEPTED'?'done':({DOING:'working',BLOCKED:'stuck',REVIEW:'review',TODO:'todo'}[item.work_status]||'todo');const name=DOM.el('div');name.append(DOM.el('b',item.title),DOM.el('small',item.start_date+' → '+item.due_date));const track=DOM.el('div',undefined,'gantt-track');const bar=DOM.el('span',item.owner||'Unassigned','gantt-bar '+(item.status==='ACCEPTED'?'done':''));bar.style.marginLeft=((parse(item.start_date)-min)/span*100)+'%';bar.style.width=((parse(item.due_date)-parse(item.start_date)+day)/span*100)+'%';bar.title=item.title+': '+item.start_date+' to '+item.due_date;track.append(bar);row.append(name,track);chart.append(row);}board.append(chart);
    }else board.append(DOM.el('p','Set start and due dates in Main table to build your Gantt chart.','gantt-empty'));
    if(unscheduled.length){const list=DOM.el('div',undefined,'gantt-unscheduled');list.append(DOM.el('h3','Unscheduled · '+unscheduled.length));for(const item of unscheduled)list.append(DOM.el('p',item.title+' — '+(!item.start_date&&!item.due_date?'dates needed':!item.start_date?'start date needed':'due date needed')));board.append(list);}
  }
  if(!items.length){const empty=DOM.el('div',undefined,'pm-empty');empty.append(DOM.el('h3','A clear plan starts with the first outcome'),DOM.el('p','Your coordinators will propose outcomes and acceptance criteria. Review their plan in Team chat.'));board.append(empty);}

 }
 function mount(){DOM.get('room-search').addEventListener('input',()=>Store.get()&&rooms(Store.get()));DOM.get('pm-project').addEventListener('change',()=>Store.get()&&update(Store.get()));
  DOM.get('grok-brief').addEventListener('click',()=>{const data=Store.get();const p=data?.projects.projects.find(p=>p.id===DOM.get('chat-project').value);if(!p)return;const messages=(data.projects.messages||[]).filter(m=>m.project_id===p.id&&(m.room||'team')==='grok').slice(-8);const content='# CADF handoff to Grok\nProject: '+p.name+'\nBrief: '+p.brief+'\n\nReply with recommendations, evidence gaps and owner decisions. Do not claim tool access or completed work.\n\n'+messages.map(m=>m.sender+': '+m.content).join('\n\n');const url=URL.createObjectURL(new Blob([content],{type:'text/plain'}));const a=DOM.el('a');a.href=url;a.download='CADF-Grok-brief.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  DOM.get('grok-import').addEventListener('click',async()=>{const data=Store.get();if(!data||!DOM.get('chat-project').value)return;try{await API.post({action:'grok_reply',id:DOM.get('chat-project').value,content:DOM.get('grok-response').value,expected_revision:data.projects.revision},data.write_token);DOM.get('grok-response').value='';await AppController.refresh();DOM.get('chat-feedback').textContent='Grok response imported with owner-supplied attribution.';}catch(e){DOM.get('chat-feedback').textContent=e.message;}});
 }
 return {rooms,update,mount,setView(view){projectView=view;if(Store.get())update(Store.get());}};
})();
const SectionViews=(()=>{
 const registry={};
 const node=id=>DOM.get(id);
 function panel(section,elements){const box=DOM.el('div',undefined,'section-view-panel');box.setAttribute('role','tabpanel');for(const el of elements.filter(Boolean))box.append(el);section.append(box);return box;}
 function tabs(id,definitions){const section=node(id),bar=DOM.el('div',undefined,'section-view-tabs');bar.setAttribute('role','tablist');bar.setAttribute('aria-label',id+' views');section.querySelector('.sectionhead').after(bar);registry[id]={definitions,bar,selected:definitions[0].name};for(const def of definitions){const button=DOM.el('button',def.name);button.setAttribute('role','tab');button.addEventListener('click',()=>select(id,def.name));bar.append(button);}select(id,definitions[0].name);}
 function select(id,name){const r=registry[id];if(!r)return;r.selected=name;const all=new Set(r.definitions.flatMap(d=>d.panels||[]));for(const p of all)p.hidden=true;const def=r.definitions.find(d=>d.name===name);if(!def)return;for(const p of def.panels||[])p.hidden=false;[...r.bar.children].forEach((b,i)=>{const chosen=r.definitions[i]===def;b.classList.toggle('selected',chosen);b.setAttribute('aria-selected',String(chosen));});if(def.action)def.action();if(id==='agents')node('agentcards').querySelectorAll('details').forEach(d=>d.open=name==='Connections');if(Store.get()){SupervisionUI.update(Store.get());WorkspaceUI.update(Store.get());}}
 function refresh(){for(const [id,r] of Object.entries(registry)){const def=r.definitions.find(d=>d.name===r.selected);if(def?.filter)def.filter();}}
 function mount(){
  const pm=node('management');const table=panel(pm,[node('visual-project-board')]);const summary=panel(pm,[pm.querySelector('.pm-summary-drawer'),node('pm-summary')]);summary.querySelector('details').open=true;
  const add=panel(pm,[node('pm-item-form').closest('article')]);const discussion=panel(pm,[node('pm-batches').closest('article')]);const records=panel(pm,[node('pm-version-form').closest('article')]);const close=panel(pm,[node('pm-close-form').closest('article')]);pm.append(node('pm-feedback'));node('pm-edit').hidden=true;
  for(const old of [summary,add,discussion,records,close])old.hidden=true;
  const files=panel(pm,[node('project-chat-records')]);const delivered=panel(pm,[node('agent-deliverables')]);const dates=panel(pm,[node('project-schedule')]);
  tabs('management',[...['Table','Kanban','Gantt'].map(name=>({name,panels:[table],action:()=>VisualWorkspace.setView(name.toLowerCase())})),{name:'Deliverables',panels:[delivered]},{name:'Documents',panels:[files]},{name:'Dates & priority',panels:[dates]}]);
  const chat=node('conversation');const handoff=panel(chat,[node('grok-handoff')]);node('grok-handoff').open=true;const attention=panel(chat,[chat.querySelector('.attention-panel')]);const room=panel(chat,[node('chat-shortcuts'),chat.querySelector('.room-layout')]);const reviewPlan=panel(chat,[node('chat-plan-review')]);tabs('conversation',[{name:'Messages',panels:[room]},{name:'Plan review',panels:[reviewPlan]},{name:'Needs you',panels:[attention]},{name:'Manual handoffs',panels:[handoff]}]);
  const projects=node('projects');const submit=panel(projects,[node('project-form').closest('article')]);const portfolio=panel(projects,[node('projectcards')]);tabs('projects',[{name:'Portfolio',panels:[portfolio]},{name:'Submit project',panels:[submit]}]);
  const orch=node('orchestration');orch.querySelector('.sectionhead').append(node('job-project').closest('label'));const single=panel(orch,[node('job-form')]);const team=panel(orch,[node('team-request').closest('article')]);const jobs=panel(orch,[node('worker-notice'),node('jobcards')]);for(const h of orch.querySelectorAll(':scope > h3'))h.hidden=true;single.hidden=true;team.hidden=true;node('job-project').closest('label').hidden=true;const plans=panel(orch,[node('coordinator-plans')]);const upcoming=panel(orch,[node('dispatch-queue')]);const readiness=panel(orch,[node('readiness-cards')]);tabs('orchestration',[{name:'Coordinator plans',panels:[plans]},{name:'Queue',panels:[upcoming]},{name:'Readiness',panels:[readiness]},{name:'Execution record',panels:[jobs]}]);
  const marketing=node('marketing');const compose=panel(marketing,[node('campaign-form').closest('article')]);const campaigns=panel(marketing,[node('campaigncards')]);compose.hidden=true;const marketingHome=panel(marketing,[node('marketing-home')]);const marketingConnections=panel(marketing,[node('marketing-connections')]);tabs('marketing',[{name:'Dashboard',panels:[marketingHome]},{name:'Agent drafts',panels:[campaigns]},{name:'Connections',panels:[marketingConnections]}]);
  const overview=node('overview');const dashboard=panel(overview,[node('visual-analytics')]);const audit=panel(overview,[overview.querySelector('.dashboard-records')]);audit.querySelector('details').open=true;tabs('overview',[{name:'Dashboard',panels:[dashboard]},{name:'Workspace records',panels:[audit]}]);
  const tasks=node('tasks');const taskBoard=panel(tasks,[node('grouped-task-board')]);tasks.querySelector('.task-view-toggle').hidden=true;tabs('tasks',[{name:'List',panels:[taskBoard],action:()=>node('task-list-view').click()},{name:'Board',panels:[taskBoard],action:()=>node('task-card-view').click()}]);
  const agents=node('agents');const directory=panel(agents,[node('agentcards')]);const availability=panel(agents,[node('agent-availability')]);tabs('agents',[{name:'Team',panels:[directory]},{name:'Availability',panels:[availability]},{name:'Connections',panels:[directory],action:()=>directory.classList.add('connection-view')}]);registry.agents.definitions[0].action=()=>directory.classList.remove('connection-view');
  const reviews=node('reviews');const queue=panel(reviews,[node('reviewcards')]);tabs('reviews',[{name:'Review queue',panels:[queue]}]);
  const activity=node('activity');const timeline=panel(activity,[activity.querySelector(':scope > article')]);tabs('activity',[{name:'Activity log',panels:[timeline]}]);
  const docs=node('documents');const document=panel(docs,[node('documentbody')]);tabs('documents',[...['Decisions','Guides','Connections'].map(name=>({name,panels:[document],action:()=>{const path={Decisions:'docs/DECISIONS.md',Guides:'docs/PROJECT-MANAGEMENT.md',Connections:'docs/INTEGRATIONS.md'}[name];if([...node('document').options].some(o=>o.value===path)){node('document').value=path;node('document').dispatchEvent(new Event('change'));}}}))]);
  documentGlobalLinks();
 }
 function documentGlobalLinks(){document.addEventListener('click',e=>{const button=e.target.closest('button');if(button&&/Prepare.*revision/i.test(button.textContent))select('management','Requirements');if(button&&/^Edit brief$/i.test(button.textContent))select('projects','Submit project');if(button&&/^Edit draft$/i.test(button.textContent))select('marketing','Create draft');const a=e.target.closest('a[href="#projects"]');if(a&&/new|add|submit/i.test(a.textContent||a.getAttribute('aria-label')||''))select('projects','Submit project');});}
 return {mount,select,refresh};
})();
AppController.init();
