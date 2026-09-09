/* Fieldnotes - a personal 1:1 tracker.
   Vanilla JS: state → render → event-delegate. No framework, no build.
   State persists to localStorage. Inputs commit on `change` (blur), which
   keeps focus during typing without partial-render bookkeeping. */

(() => {
  'use strict';

  // ─── constants ──────────────────────────────────────────────────────────
  const STORAGE_KEY = 'fieldnotes:v1';
  const ENERGY_RANGE = [55, 95];
  const CHECKIN_NOTES = [
    'All quiet on the reactor front.',
    'Focus levels stable, snack levels critical.',
    'Running three tabs of context ahead of the meeting.',
    'Minor blocker detected, situation contained.',
    'Momentum nominal. Coffee reserves holding.',
    'Detected one heroic Slack thread survived.',
    'Systems green, calendar chaotic as expected.',
    'Shipped a thing. Telling no one until stand-up.',
  ];
  const VACATION_LINES = [
    'Countdown assumes zero surprise Friday deploys.',
    'Out-of-office message drafting itself as we speak.',
    'Calendar has already started ignoring meeting invites.',
    'Sunscreen: pre-purchased. Slack: pre-muted.',
  ];

  const TAG_META = {
    'Needs decision': { color: 'var(--signal)',  chip: 'chip-signal' },
    'Blocked':        { color: 'var(--blocked)', chip: 'chip-blocked' },
    'For discussion': { color: 'var(--ink-3)',   chip: 'chip-plain' },
  };
  const STATUS_META = {
    'On track': 'chip-ok',
    'At risk':  'chip-warn',
    'Blocked':  'chip-blocked',
  };

  const ICON_X = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

  // ─── state ──────────────────────────────────────────────────────────────
  let uid = 100;
  const nextId = () => ++uid;

  const seed = () => ({
    screen: 'landing',
    selectedProjectId: null,
    doneMap: {},
    checkins: [],
    editing: {
      achievements: false, openPoints: false, projects: false, actionItems: false,
      projAch: false, projOpen: false, projAction: false,
      trainings: false, vacation: false,
    },
    trainings: [
      { id: 1, title: 'Prep 1', subtask: 'Module 2: Advanced escalation tactics', progress: 40 },
    ],
    vacation: { name: 'Bali recharge', date: '2026-09-15' },
    achievements: [
      { id: 1, project: 'Checkout revamp', title: 'Shipped the new payment flow', impact: 'Cut checkout drop-off by 14% in the first week - already visible in the funnel dashboard.' },
      { id: 2, project: 'Platform',        title: 'Closed out the API migration',  impact: 'Retired the last legacy endpoint; unblocks the mobile team’s Q3 work.' },
      { id: 3, project: 'Team health',     title: 'Ran onboarding for two new hires', impact: 'Both shipped their first PR in week one - down from the usual two.' },
    ],
    openPoints: [
      { id: 1, title: 'Headcount for Q4',              detail: 'Need a decision before the roadmap review on the 30th.', tagLabel: 'Needs decision', project: '' },
      { id: 2, title: 'Design review backlog',         detail: 'Three specs waiting on sign-off, blocking implementation.', tagLabel: 'Blocked', project: '' },
      { id: 3, title: 'Cross-team dependency on Search', detail: 'Their timeline slipped two weeks; may push our launch.', tagLabel: 'Needs decision', project: 'Search relevance v2' },
      { id: 4, title: 'Career conversation',           detail: 'Want ten minutes to talk through next-level scope.', tagLabel: 'For discussion', project: '' },
    ],
    projects: [
      { id: 1, kicker: 'In progress', name: 'Checkout revamp',       update: 'New flow live for 50% of traffic; watching conversion before full rollout.', status: 'On track', updated: 'Updated today' },
      { id: 2, kicker: 'In progress', name: 'API migration',         update: 'Last legacy endpoint retired this week. Wrapping documentation.',           status: 'On track', updated: 'Updated today' },
      { id: 3, kicker: 'Planning',    name: 'Search relevance v2',   update: 'Waiting on data science for the ranking model before scoping.',             status: 'At risk',  updated: 'Updated yesterday' },
      { id: 4, kicker: 'Ongoing',     name: 'Team onboarding',       update: 'Two new hires ramping well; revised the first-week checklist.',            status: 'On track', updated: '2 days ago' },
    ],
    actionItems: [
      { id: 1, title: 'Get sign-off on Q4 headcount ask',          project: 'Headcount',            due: 'Before next 1:1' },
      { id: 2, title: 'Share checkout conversion numbers',         project: 'Checkout revamp',      due: 'Fri' },
      { id: 3, title: 'Escalate Search team timeline slip',        project: 'Search relevance v2',  due: 'Mon' },
      { id: 4, title: 'Ask about leveling process for promo case', project: 'Career',               due: 'Next 1:1' },
      { id: 5, title: 'Clear design review backlog with team',     project: 'Design ops',           due: 'This week' },
    ],
  });

  let state = load() || seed();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // bump uid past anything the saved state used
      const ids = [];
      ['achievements','openPoints','projects','actionItems','trainings','checkins'].forEach(k => {
        (parsed[k] || []).forEach(it => { if (it && typeof it.id === 'number') ids.push(it.id); });
      });
      if (ids.length) uid = Math.max(uid, ...ids);
      return parsed;
    } catch { return null; }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }
  function setState(patch) {
    state = typeof patch === 'function' ? { ...state, ...patch(state) } : { ...state, ...patch };
    save(); render();
  }

  // ─── helpers ────────────────────────────────────────────────────────────
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const attr = (v) => esc(v);

  function updateList(key, id, patch) {
    setState(s => ({ [key]: s[key].map(it => it.id === id ? { ...it, ...patch } : it) }));
  }
  function removeFromList(key, id) {
    setState(s => ({ [key]: s[key].filter(it => it.id !== id) }));
  }
  function toggleEditSection(key) {
    setState(s => ({ editing: { ...s.editing, [key]: !s.editing[key] } }));
  }
  function toggleItem(id) {
    setState(s => ({ doneMap: { ...s.doneMap, [id]: !s.doneMap[id] } }));
  }
  function goto(screen, extra = {}) { setState({ screen, ...extra }); }

  function addAchievement()     { setState(s => ({ achievements: [...s.achievements, { id: nextId(), project: '', title: '', impact: '' }] })); }
  function addOpenPoint(proj)   { setState(s => ({ openPoints:   [...s.openPoints,   { id: nextId(), title: '', detail: '', tagLabel: 'For discussion', project: proj || '' }] })); }
  function addProject()         { setState(s => ({ projects:     [...s.projects,     { id: nextId(), kicker: 'Planning', name: '', update: '', status: 'On track', updated: 'Just added' }] })); }
  function addActionItem(proj)  { setState(s => ({ actionItems:  [...s.actionItems,  { id: nextId(), title: '', project: proj || '', due: '' }] })); }
  function addTraining()        { setState(s => ({ trainings:    [...s.trainings,    { id: nextId(), title: '', subtask: '', progress: 0 }] })); }
  function addAchievementForProject(name) {
    setState(s => ({ achievements: [...s.achievements, { id: nextId(), project: name, title: '', impact: '' }] }));
  }

  function logCheckin() {
    const now = new Date();
    const energy = Math.round(ENERGY_RANGE[0] + Math.random() * (ENERGY_RANGE[1] - ENERGY_RANGE[0]));
    const note = CHECKIN_NOTES[Math.floor(Math.random() * CHECKIN_NOTES.length)];
    setState(s => ({
      checkins: [{ id: nextId(), date: now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), energy, note }, ...s.checkins],
    }));
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function exportSummary() {
    const s = state;
    const lines = [];
    lines.push('# 1:1 summary -' + new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }));
    lines.push('');
    lines.push('## Achievements & impact');
    s.achievements.forEach(a => lines.push(`- **${a.title}** (${a.project}) - ${a.impact}`));
    lines.push('');
    lines.push('## Open points & support needed');
    s.openPoints.forEach(p => lines.push(`- [${p.tagLabel}] **${p.title}** - ${p.detail}`));
    lines.push('');
    lines.push('## Projects');
    s.projects.forEach(p => lines.push(`- **${p.name}** (${p.status}) - ${p.update}`));
    lines.push('');
    lines.push('## Action items');
    s.actionItems.forEach(ai => lines.push(`- [${s.doneMap[ai.id] ? 'x' : ' '}] ${ai.title} - ${ai.project} (due ${ai.due})`));
    if (s.checkins.length) {
      lines.push(''); lines.push('## Check-ins');
      s.checkins.forEach(c => lines.push(`- ${c.date} (energy ${c.energy}%) - ${c.note}`));
    }
    download(`1-1-summary-${new Date().toISOString().slice(0, 10)}.md`, lines.join('\n'));
  }

  function exportProject() {
    const s = state;
    const proj = s.projects.find(p => p.id === s.selectedProjectId);
    if (!proj) return;
    const related = s.achievements.filter(a => a.project === proj.name);
    const items = s.actionItems.filter(ai => ai.project === proj.name);
    const lines = [];
    lines.push(`# ${proj.name} - one-pager`); lines.push('');
    lines.push(`Status: ${proj.status}`); lines.push('');
    lines.push('## Current update'); lines.push(proj.update); lines.push('');
    lines.push('## Related achievements');
    if (related.length) related.forEach(a => lines.push(`- **${a.title}** - ${a.impact}`));
    else lines.push('- None logged yet.');
    lines.push('');
    lines.push('## Related action items');
    if (items.length) items.forEach(ai => lines.push(`- [${s.doneMap[ai.id] ? 'x' : ' '}] ${ai.title} (due ${ai.due})`));
    else lines.push('- None logged yet.');
    download(`${proj.name.toLowerCase().replace(/\s+/g, '-') || 'project'}-one-pager.md`, lines.join('\n'));
  }

  function reset() {
    if (!confirm('Reset all Fieldnotes data to the seed sample?')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    uid = 100; state = seed(); render();
  }

  // ─── derived ────────────────────────────────────────────────────────────
  function derive() {
    const s = state;
    const now = new Date();
    const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const weekLabel = monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const h = now.getHours();
    const greeting = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const todayLabel = now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    const openActionCount = s.actionItems.filter(ai => !s.doneMap[ai.id]).length;
    const energyLevel = 82;

    let businessDays = 0;
    const vacDate = s.vacation.date ? new Date(s.vacation.date + 'T00:00:00') : null;
    if (vacDate) {
      const cursor = new Date(now); cursor.setHours(0, 0, 0, 0);
      while (cursor < vacDate) {
        cursor.setDate(cursor.getDate() + 1);
        const d = cursor.getDay();
        if (d !== 0 && d !== 6) businessDays++;
      }
    }
    const vacationCountdownLabel = businessDays > 0
      ? `${businessDays} work day${businessDays === 1 ? '' : 's'} to go (weekends don't count, they're already yours)`
      : "It's vacation time - go!";
    const vacationFunnyLine = VACATION_LINES[businessDays % VACATION_LINES.length];

    const activeProject = s.projects.find(p => p.id === s.selectedProjectId) || null;
    let activeMeta = null;
    if (activeProject) {
      const relAch = s.achievements.filter(a => a.project === activeProject.name);
      const relOpen = s.openPoints.filter(p => p.project === activeProject.name);
      const relAct = s.actionItems.filter(ai => ai.project === activeProject.name);
      activeMeta = {
        relatedAchievements: relAch,
        relatedOpenPoints: relOpen,
        relatedActionItems: relAct,
        winsCount: relAch.length,
        sosCount: relOpen.length,
        questsCount: relAct.filter(ai => !s.doneMap[ai.id]).length,
      };
    }

    return { weekLabel, greeting, todayLabel, openActionCount, energyLevel, vacationCountdownLabel, vacationFunnyLine, activeProject, activeMeta };
  }

  // ─── partials ───────────────────────────────────────────────────────────
  const editLabel = (key) => state.editing[key] ? 'Done' : 'Edit';
  const isEditing = (key) => !!state.editing[key];

  function nav(active) {
    const homeActive = active === 'landing' ? 'active' : '';
    const link = (screen, label) => {
      const cls = screen === active ? 'active' : '';
      return `<a href="#" class="${cls}" data-action="goto" data-screen="${screen}">${label}</a>`;
    };

    let extra = '';
    if (active === 'dashboard') {
      extra = `
        <span class="chip chip-ok chip-plain"><span class="tick tick-ok"></span>LIVE</span>
        <button type="button" class="btn btn-secondary" data-action="exportSummary">EXPORT SUMMARY</button>`;
    } else if (active === 'checkin') {
      extra = `<span class="chip chip-plain"><span class="tick tick-ok"></span>SENSORS ARMED</span>`;
    } else if (active === 'project') {
      extra = `<button type="button" class="btn btn-secondary" data-action="exportProject">EXPORT ONE-PAGER</button>`;
    } else {
      extra = `<span class="chip chip-ok chip-plain"><span class="tick tick-ok"></span>SYSTEMS NOMINAL</span>`;
    }

    const links = `
      <a href="#" class="${homeActive}" data-action="goto" data-screen="landing">Home base</a>
      ${link('dashboard', 'Mission control')}
      ${link('checkin', 'Check-in')}
      ${active === 'project' ? `<a href="#" class="active">Dossier</a>` : ''}`;

    return `
      <nav class="nav">
        <a href="#" class="nav-brand" data-action="goto" data-screen="landing">Fieldnotes</a>
        <div class="nav-links">${links}</div>
        <div class="nav-extra">${extra}</div>
      </nav>
    `;
  }

  function sectionHead(title, aside, editKey) {
    return `
      <div class="section-head">
        <h2 class="section-title">${esc(title)} <span class="aside">// ${esc(aside)}</span></h2>
        ${editKey ? `<button type="button" class="edit-toggle" data-action="toggleEdit" data-key="${editKey}">${editLabel(editKey)}</button>` : ''}
      </div>`;
  }

  // ─── views ──────────────────────────────────────────────────────────────
  function viewLanding(d) {
    return `
      ${nav('landing')}
      <div class="hud">
        <span class="hud-cell"><span class="tick tick-ok"></span>STANDUP: <b>ONLINE</b></span>
        <span class="hud-cell"><span class="tick tick-signal"></span>BLOCKERS: <b>DETECTED (${state.openPoints.length})</b></span>
        <span class="hud-cell"><span class="tick tick-off"></span>NEXT 1:1: <b>T-MINUS 2 DAYS</b></span>
      </div>
      <div class="wrap" style="padding-top:var(--s-7);padding-bottom:var(--s-8);">
        <p class="prompt-line"><span class="op">&gt;</span> booting fieldnotes - ${esc(d.greeting)}, Operator<span class="cursor"></span></p>
        <div class="hero">
          <div class="panel-dark hero-display reg">
            <div>
              <div class="label" style="color:var(--display-dim);">FOCUS REACTOR</div>
              <div class="num-big">${d.energyLevel}<span class="pct">%</span></div>
            </div>
            <div class="bar"><div class="fill" style="width:${d.energyLevel}%;"></div></div>
            <div class="meta"><span>LVL 00-100</span><span>NOMINAL</span></div>
          </div>
          <div class="hero-copy">
            <h1>Your 1:1 co-pilot, fully caffeinated.</h1>
            <p class="lead">No teammates, no noise, no Slack pinging you mid-thought - just a quiet HUD for wins, blockers and the asks you keep meaning to raise. Log it as it happens; export a one-pager before your manager can ask "so, what have you been up to?"</p>
            <div style="margin-top:var(--s-5);">
              <button type="button" class="btn btn-primary" data-action="goto" data-screen="dashboard">ENGAGE MISSION CONTROL</button>
            </div>
          </div>
        </div>
        <div class="pull">
          <q>Ship it, log it, forget it - future-you writes the recap.</q>
          <cite>Fieldnotes, probably</cite>
        </div>
      </div>
    `;
  }

  function viewDashboard(d) {
    return `
      ${nav('dashboard')}
      <div class="hud">
        <span class="hud-cell">WEEK: <b>${esc(d.weekLabel)}</b></span>
        <span class="hud-cell"><span class="tick tick-signal"></span>OPEN: <b>${d.openActionCount}</b></span>
        <span class="hud-cell"><span class="tick tick-ok"></span>WINS: <b>${state.achievements.length}</b></span>
      </div>
      <div class="wrap">
        <div class="page-head">
          <div>
            <p class="prompt-line"><span class="op">&gt;</span> loading week of ${esc(d.weekLabel)}...</p>
            <h1>Ready for your 1:1, Operator</h1>
            <p class="lead">Everything that shipped, stalled, or needs backup - tap Edit on any section to update it, then export before the call.</p>
          </div>
        </div>

        <div class="readout-row" style="margin-bottom:var(--s-6);">
          <div class="readout readout-ok"><div class="rl">Wins shipped</div><div class="rv">${state.achievements.length}</div></div>
          <div class="readout readout-signal"><div class="rl">SOS flares</div><div class="rv">${state.openPoints.length}</div></div>
          <div class="readout readout-warn"><div class="rl">Open quests</div><div class="rv">${d.openActionCount}</div></div>
        </div>

        <section style="margin-bottom:var(--s-7);">
          ${sectionHead('Achievements & impact', 'highlight reel', 'achievements')}
          ${isEditing('achievements') ? editAchievements() : viewAchievements()}
        </section>

        <section style="margin-bottom:var(--s-7);">
          ${sectionHead('Open points & support needed', 'mayday channel', 'openPoints')}
          ${isEditing('openPoints') ? editOpenPoints(state.openPoints, 'openPoints') : viewOpenPoints(state.openPoints)}
        </section>

        <section style="margin-bottom:var(--s-7);">
          ${sectionHead('Projects', 'mission log', 'projects')}
          ${viewProjects()}
          ${isEditing('projects') ? `<button type="button" class="btn btn-ghost" style="margin-top:var(--s-3);" data-action="add" data-key="projects">+ ADD PROJECT</button>` : ''}
        </section>

        <section style="margin-bottom:var(--s-7);">
          ${sectionHead('Action items to track', 'quest log', 'actionItems')}
          ${viewActionItems(state.actionItems, isEditing('actionItems'))}
          ${isEditing('actionItems') ? `<button type="button" class="btn btn-ghost" style="margin-top:var(--s-3);" data-action="add" data-key="actionItems">+ ADD ACTION ITEM</button>` : ''}
        </section>

        ${state.checkins.length ? `
          <section style="margin-bottom:var(--s-6);">
            <div class="section-head">
              <h2 class="section-title">Recent check-ins <span class="aside">// pulse log</span></h2>
              <a href="#" class="edit-toggle" data-action="goto" data-screen="checkin" style="text-decoration:none;">LOG ONE</a>
            </div>
            ${viewCheckinList(state.checkins)}
          </section>` : ''}

        <footer>Fieldnotes · personal 1:1 tracker · no assembly required, mostly · <a href="#" data-action="reset">reset</a></footer>
      </div>
    `;
  }

  function viewAchievements() {
    if (!state.achievements.length) {
      return `<div class="panel"><p class="text-muted" style="margin:0;">Nothing logged yet - hit Edit to add one.</p></div>`;
    }
    return `<div class="panel-grid">
      ${state.achievements.map(item => `
        <div class="panel">
          <div class="p-card">
            <div class="p-kicker">${esc(item.project) || '-'}</div>
            <div class="p-title">${esc(item.title) || 'Untitled'}</div>
            <p class="p-body">${esc(item.impact)}</p>
          </div>
        </div>`).join('')}
    </div>`;
  }
  function editAchievements() {
    return `
      <div class="panel-grid">
        ${state.achievements.map(item => `
          <div class="panel intake">
            <div class="intake-head">
              <span class="label">Achievement</span>
              <button type="button" class="icon-x" data-action="remove" data-key="achievements" data-id="${item.id}" aria-label="Remove">${ICON_X}</button>
            </div>
            <div class="field"><label>Project</label><input class="input" value="${attr(item.project)}" data-input="achievements.${item.id}.project" /></div>
            <div class="field"><label>Title</label><input class="input" value="${attr(item.title)}" data-input="achievements.${item.id}.title" /></div>
            <div class="field"><label>Impact</label><textarea class="input" rows="2" data-input="achievements.${item.id}.impact">${esc(item.impact)}</textarea></div>
          </div>`).join('')}
      </div>
      <button type="button" class="btn btn-ghost" style="margin-top:var(--s-3);" data-action="add" data-key="achievements">+ ADD ACHIEVEMENT</button>`;
  }

  function viewOpenPoints(list) {
    if (!list.length) return `<div class="panel"><p class="text-muted" style="margin:0;">All quiet - no open points.</p></div>`;
    return `<div class="row-list">
      ${list.map(item => {
        const meta = TAG_META[item.tagLabel] || TAG_META['For discussion'];
        return `
          <div class="row-item">
            <span class="tick row-mark" style="background:${meta.color};"></span>
            <div class="row-body">
              <div class="row-title">${esc(item.title) || 'Untitled'}</div>
              <div class="row-detail">${esc(item.detail)}</div>
            </div>
            <span class="row-side chip ${meta.chip}">${esc(item.tagLabel)}</span>
          </div>`;
      }).join('')}
    </div>`;
  }
  function editOpenPoints(list, key) {
    return `
      ${list.map(item => `
        <div class="panel intake">
          <div class="intake-head">
            <span class="label">Open point</span>
            <button type="button" class="icon-x" data-action="remove" data-key="${key}" data-id="${item.id}" aria-label="Remove">${ICON_X}</button>
          </div>
          <div class="intake-grid">
            <div class="field"><label>Title</label><input class="input" value="${attr(item.title)}" data-input="${key}.${item.id}.title" /></div>
            <div class="field"><label>Type</label>
              <select class="input" data-input="${key}.${item.id}.tagLabel">
                <option${item.tagLabel === 'Needs decision' ? ' selected' : ''}>Needs decision</option>
                <option${item.tagLabel === 'Blocked' ? ' selected' : ''}>Blocked</option>
                <option${item.tagLabel === 'For discussion' ? ' selected' : ''}>For discussion</option>
              </select>
            </div>
          </div>
          <div class="intake-grid">
            <div class="field"><label>Related project (optional)</label><input class="input" placeholder="e.g. Checkout revamp" value="${attr(item.project)}" data-input="${key}.${item.id}.project" /></div>
          </div>
          <div class="field"><label>Detail</label><textarea class="input" rows="2" data-input="${key}.${item.id}.detail">${esc(item.detail)}</textarea></div>
        </div>`).join('')}
      <button type="button" class="btn btn-ghost" data-action="add" data-key="${key}">+ ADD OPEN POINT</button>`;
  }

  function viewProjects() {
    if (!state.projects.length) return `<div class="panel"><p class="text-muted" style="margin:0;">No projects yet - hit Edit to add one.</p></div>`;
    const editing = isEditing('projects');
    return `<div class="proj-grid">
      ${state.projects.map(proj => {
        const statusClass = STATUS_META[proj.status] || 'chip-plain';
        return `
          <div class="panel clickable" data-action="openProject" data-id="${proj.id}">
            <div class="p-card">
              ${editing ? `<button type="button" class="icon-x" data-action="remove" data-key="projects" data-id="${proj.id}" data-stop="1" style="position:absolute;top:0;right:0;background:var(--panel);" aria-label="Remove">${ICON_X}</button>` : ''}
              <div class="p-kicker">${esc(proj.kicker)}</div>
              <div class="p-title">${esc(proj.name) || 'Untitled project'}</div>
              <p class="p-body">${esc(proj.update)}</p>
              <div class="p-meta">
                <span class="chip ${statusClass}">${esc(proj.status)}</span>
                <span>${esc(proj.updated)}</span>
              </div>
              <span class="p-link" data-action="openProject" data-id="${proj.id}" data-stop="1">OPEN ONE-PAGER →</span>
            </div>
          </div>`;
      }).join('')}
    </div>`;
  }

  function viewActionItems(list, editing) {
    return `
      <table class="table">
        <thead><tr><th style="width:32px;"></th><th>Item</th><th>Related to</th><th>Due</th>${editing ? '<th style="width:40px;"></th>' : ''}</tr></thead>
        <tbody>
          ${list.map(ai => {
            const done = !!state.doneMap[ai.id];
            const rowClass = done ? 'ai-row done' : 'ai-row';
            if (editing) {
              return `
                <tr class="${rowClass}">
                  <td class="ai-cell"><input type="checkbox" class="check" ${done ? 'checked' : ''} data-action="toggle" data-id="${ai.id}" /></td>
                  <td class="ai-cell"><input class="input" value="${attr(ai.title)}" data-input="actionItems.${ai.id}.title" /></td>
                  <td class="ai-cell"><input class="input" value="${attr(ai.project)}" data-input="actionItems.${ai.id}.project" /></td>
                  <td class="ai-cell"><input class="input" value="${attr(ai.due)}" data-input="actionItems.${ai.id}.due" /></td>
                  <td class="ai-cell"><button type="button" class="icon-x" data-action="remove" data-key="actionItems" data-id="${ai.id}" aria-label="Remove">${ICON_X}</button></td>
                </tr>`;
            }
            return `
              <tr class="${rowClass}">
                <td class="ai-cell"><input type="checkbox" class="check" ${done ? 'checked' : ''} data-action="toggle" data-id="${ai.id}" /></td>
                <td>${esc(ai.title)}</td>
                <td class="text-muted mono" style="font-size:12px;">${esc(ai.project)}</td>
                <td class="text-muted mono" style="font-size:12px;">${esc(ai.due)}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  function viewCheckinList(list) {
    return `<div class="row-list">
      ${list.map(c => `
        <div class="row-item">
          <span class="tick tick-signal row-mark"></span>
          <div class="row-body">
            <div class="row-title mono" style="font-size:13px;">${esc(c.date)} · ENERGY ${c.energy}%</div>
            <div class="row-detail">${esc(c.note)}</div>
          </div>
        </div>`).join('')}
    </div>`;
  }

  function viewCheckin(d) {
    return `
      ${nav('checkin')}
      <div class="wrap" style="padding-top:var(--s-6);padding-bottom:var(--s-8);max-width:640px;">
        <p class="prompt-line"><span class="op">&gt;</span> personal check-in - ${esc(d.todayLabel)}</p>
        <h1 style="font-size:26px;margin:0;">How's the reactor running?</h1>
        <p style="font-size:14px;color:var(--ink-2);margin:var(--s-3) 0 var(--s-5);">No forms to fill - the sensors do the guessing. Tap to log a reading.</p>

        <button type="button" class="btn btn-primary" data-action="logCheckin">GENERATE CHECK-IN</button>

        <div style="margin-top:var(--s-7);">
          ${sectionHead('Trainings', 'skill tree', 'trainings')}
          ${isEditing('trainings') ? editTrainings() : viewTrainings()}
        </div>

        <div style="margin-top:var(--s-7);">
          ${sectionHead('Next up: vacation', 'escape sequence', 'vacation')}
          ${isEditing('vacation') ? editVacation() : viewVacation(d)}
        </div>

        ${state.checkins.length ? `
          <div style="margin-top:var(--s-7);">
            <div class="section-head">
              <h2 class="section-title">Past check-ins <span class="aside">// pulse log</span></h2>
            </div>
            ${viewCheckinList(state.checkins)}
          </div>` : ''}
      </div>
    `;
  }

  function viewTrainings() {
    if (!state.trainings.length) return `<div class="panel"><p class="text-muted" style="margin:0;">Nothing on the skill tree - hit Edit to add one.</p></div>`;
    return state.trainings.map(t => `
      <div class="panel" style="margin-bottom:var(--s-3);">
        <div class="p-card">
          <div class="p-title">${esc(t.title) || 'Untitled'}</div>
          <p class="p-body" style="margin-bottom:var(--s-2);">${esc(t.subtask)}</p>
          <div class="bar-solid"><div class="bar-fill" style="width:${Number(t.progress) || 0}%;"></div></div>
          <div class="label" style="margin-top:6px;">${Number(t.progress) || 0}% THROUGH, ALLEGEDLY</div>
        </div>
      </div>`).join('');
  }
  function editTrainings() {
    return `
      ${state.trainings.map(t => `
        <div class="panel intake">
          <div class="intake-head">
            <span class="label">Training</span>
            <button type="button" class="icon-x" data-action="remove" data-key="trainings" data-id="${t.id}" aria-label="Remove">${ICON_X}</button>
          </div>
          <div class="field"><label>Title</label><input class="input" value="${attr(t.title)}" data-input="trainings.${t.id}.title" /></div>
          <div class="field"><label>Sub-section</label><input class="input" value="${attr(t.subtask)}" data-input="trainings.${t.id}.subtask" /></div>
          <div class="field"><label>Progress: ${Number(t.progress) || 0}%</label><input type="range" min="0" max="100" value="${Number(t.progress) || 0}" data-input="trainings.${t.id}.progress" data-num="1" /></div>
        </div>`).join('')}
      <button type="button" class="btn btn-ghost" data-action="add" data-key="trainings">+ ADD TRAINING</button>`;
  }
  function viewVacation(d) {
    return `
      <div class="panel vac-panel">
        <div class="vac-name">${esc(state.vacation.name)}</div>
        <div class="vac-count">${esc(d.vacationCountdownLabel)}</div>
        <p class="vac-note">${esc(d.vacationFunnyLine)}</p>
      </div>`;
  }
  function editVacation() {
    return `
      <div class="panel intake">
        <div class="intake-grid">
          <div class="field"><label>Vacation name</label><input class="input" value="${attr(state.vacation.name)}" data-input="vacation.name" /></div>
          <div class="field"><label>Date</label><input type="date" class="input" value="${attr(state.vacation.date)}" data-input="vacation.date" /></div>
        </div>
      </div>`;
  }

  function viewProject(d) {
    const proj = d.activeProject;
    const meta = d.activeMeta;
    if (!proj) {
      return `
        ${nav('project')}
        <div class="wrap" style="padding-top:var(--s-6);">
          <p class="prompt-line"><span class="op">&gt;</span> no project selected</p>
          <button type="button" class="btn btn-secondary" data-action="goto" data-screen="dashboard">← BACK TO MISSION CONTROL</button>
        </div>`;
    }
    return `
      ${nav('project')}
      <div class="wrap" style="padding-top:var(--s-5);padding-bottom:var(--s-4);">
        <a href="#" class="edit-toggle" data-action="goto" data-screen="dashboard" style="text-decoration:none;border:none;padding-left:0;">← BACK TO PROJECTS</a>
        <div class="intake-grid" style="margin-top:var(--s-4);max-width:640px;">
          <div class="field"><label>Project name</label><input class="input" value="${attr(proj.name)}" data-input="projects.${proj.id}.name" /></div>
          <div class="field"><label>Status</label>
            <select class="input" data-input="projects.${proj.id}.status">
              <option${proj.status === 'On track' ? ' selected' : ''}>On track</option>
              <option${proj.status === 'At risk' ? ' selected' : ''}>At risk</option>
              <option${proj.status === 'Blocked' ? ' selected' : ''}>Blocked</option>
            </select>
          </div>
        </div>
        <div class="field" style="max-width:640px;margin-top:var(--s-3);"><label>Current update</label><textarea class="input" rows="3" data-input="projects.${proj.id}.update">${esc(proj.update)}</textarea></div>
      </div>

      <div class="wrap">
        <div class="readout-row" style="margin:var(--s-5) 0 var(--s-6);">
          <div class="readout readout-ok"><div class="rl">Wins on this</div><div class="rv">${meta.winsCount}</div></div>
          <div class="readout readout-signal"><div class="rl">SOS flares</div><div class="rv">${meta.sosCount}</div></div>
          <div class="readout readout-warn"><div class="rl">Open quests</div><div class="rv">${meta.questsCount}</div></div>
        </div>

        <section style="margin-bottom:var(--s-7);">
          ${sectionHead('Related achievements', 'highlight reel', 'projAch')}
          ${isEditing('projAch') ? editProjAch(meta.relatedAchievements, proj.name) : viewProjAch(meta.relatedAchievements)}
        </section>

        <section style="margin-bottom:var(--s-7);">
          ${sectionHead('Related open points', 'mayday channel', 'projOpen')}
          ${isEditing('projOpen') ? editOpenPoints(meta.relatedOpenPoints, 'openPoints') : viewOpenPoints(meta.relatedOpenPoints)}
          ${isEditing('projOpen') ? `<button type="button" class="btn btn-ghost" data-action="addFor" data-key="openPoints" data-project="${attr(proj.name)}">+ ADD OPEN POINT FOR THIS PROJECT</button>` : ''}
        </section>

        <section style="margin-bottom:var(--s-6);">
          ${sectionHead('Related action items', 'quest log', 'projAction')}
          ${isEditing('projAction') ? editProjAction(meta.relatedActionItems, proj.name) : viewProjAction(meta.relatedActionItems)}
        </section>
      </div>
    `;
  }
  function viewProjAch(list) {
    if (!list.length) return `<div class="panel"><p class="text-muted" style="margin:0;">Nothing tied to this project yet.</p></div>`;
    return `<div class="panel-grid">
      ${list.map(item => `
        <div class="panel">
          <div class="p-card">
            <div class="p-title">${esc(item.title) || 'Untitled'}</div>
            <p class="p-body">${esc(item.impact)}</p>
          </div>
        </div>`).join('')}
    </div>`;
  }
  function editProjAch(list, projectName) {
    return `
      ${list.map(item => `
        <div class="panel intake">
          <div class="intake-head">
            <span class="label">Achievement</span>
            <button type="button" class="icon-x" data-action="remove" data-key="achievements" data-id="${item.id}" aria-label="Remove">${ICON_X}</button>
          </div>
          <div class="field"><label>Title</label><input class="input" value="${attr(item.title)}" data-input="achievements.${item.id}.title" /></div>
          <div class="field"><label>Impact</label><textarea class="input" rows="2" data-input="achievements.${item.id}.impact">${esc(item.impact)}</textarea></div>
        </div>`).join('')}
      <button type="button" class="btn btn-ghost" data-action="addAchievementFor" data-project="${attr(projectName)}">+ ADD ACHIEVEMENT TO THIS PROJECT</button>`;
  }
  function viewProjAction(list) {
    if (!list.length) return `<div class="panel"><p class="text-muted" style="margin:0;">No action items on this project yet.</p></div>`;
    return `
      <table class="table">
        <thead><tr><th style="width:32px;"></th><th>Item</th><th>Due</th></tr></thead>
        <tbody>
          ${list.map(ai => {
            const done = !!state.doneMap[ai.id];
            const rowClass = done ? 'ai-row done' : 'ai-row';
            return `
              <tr class="${rowClass}">
                <td class="ai-cell"><input type="checkbox" class="check" ${done ? 'checked' : ''} data-action="toggle" data-id="${ai.id}" /></td>
                <td>${esc(ai.title)}</td>
                <td class="text-muted mono" style="font-size:12px;">${esc(ai.due)}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }
  function editProjAction(list, projectName) {
    return `
      ${list.map(ai => `
        <div class="panel intake">
          <div class="intake-head">
            <span class="label">Action item</span>
            <button type="button" class="icon-x" data-action="remove" data-key="actionItems" data-id="${ai.id}" aria-label="Remove">${ICON_X}</button>
          </div>
          <div class="intake-grid">
            <div class="field"><label>Item</label><input class="input" value="${attr(ai.title)}" data-input="actionItems.${ai.id}.title" /></div>
            <div class="field"><label>Due</label><input class="input" value="${attr(ai.due)}" data-input="actionItems.${ai.id}.due" /></div>
          </div>
        </div>`).join('')}
      <button type="button" class="btn btn-ghost" data-action="addActionItemFor" data-project="${attr(projectName)}">+ ADD ACTION ITEM FOR THIS PROJECT</button>`;
  }

  // ─── event handling ─────────────────────────────────────────────────────
  const app = document.getElementById('app');

  app.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    if (t.dataset.stop) e.stopPropagation();
    const action = t.dataset.action;

    switch (action) {
      case 'goto':          e.preventDefault(); goto(t.dataset.screen); break;
      case 'toggleEdit':    toggleEditSection(t.dataset.key); break;
      case 'toggle':        toggleItem(Number(t.dataset.id)); break;
      case 'remove':        removeFromList(t.dataset.key, Number(t.dataset.id)); break;
      case 'add': {
        const map = { achievements: addAchievement, openPoints: () => addOpenPoint(), projects: addProject, actionItems: () => addActionItem(), trainings: addTraining };
        const fn = map[t.dataset.key]; if (fn) fn();
        break;
      }
      case 'addFor': {
        if (t.dataset.key === 'openPoints') addOpenPoint(t.dataset.project);
        else if (t.dataset.key === 'actionItems') addActionItem(t.dataset.project);
        break;
      }
      case 'addAchievementFor':  addAchievementForProject(t.dataset.project); break;
      case 'addActionItemFor':   addActionItem(t.dataset.project); break;
      case 'openProject':        e.preventDefault(); goto('project', { selectedProjectId: Number(t.dataset.id) }); break;
      case 'exportSummary':      exportSummary(); break;
      case 'exportProject':      exportProject(); break;
      case 'logCheckin':         logCheckin(); break;
      case 'reset':              e.preventDefault(); reset(); break;
    }
  });

  // inputs commit on `change` (blur) - preserves focus while typing
  app.addEventListener('change', (e) => {
    const el = e.target;
    const spec = el.dataset && el.dataset.input;
    if (!spec) return;
    const parts = spec.split('.');
    let raw = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.num) raw = Number(raw);

    if (parts.length === 2 && parts[0] === 'vacation') {
      setState(s => ({ vacation: { ...s.vacation, [parts[1]]: raw } }));
    } else if (parts.length === 3) {
      const [key, id, field] = parts;
      updateList(key, Number(id), { [field]: raw });
    }
  });

  // live-update the "Progress: N%" label for the training range slider
  app.addEventListener('input', (e) => {
    const el = e.target;
    if (el.type !== 'range') return;
    const spec = el.dataset && el.dataset.input;
    if (!spec || !spec.startsWith('trainings.') || !spec.endsWith('.progress')) return;
    const label = el.closest('.field') && el.closest('.field').querySelector('label');
    if (label) label.textContent = `Progress: ${el.value}%`;
  });

  // ─── render ─────────────────────────────────────────────────────────────
  function render() {
    const d = derive();
    let html = '';
    switch (state.screen) {
      case 'dashboard': html = viewDashboard(d); break;
      case 'checkin':   html = viewCheckin(d);   break;
      case 'project':   html = viewProject(d);   break;
      default:          html = viewLanding(d);
    }
    app.innerHTML = html;
  }

  render();
})();
