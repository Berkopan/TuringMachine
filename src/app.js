import { BLANK, validateMachine, makeEmptyMachine, createRuntime, readTape, stepMachine, undoStep, encodeMachine, decodeMachine, encodePair, decodePair } from './core.js';
import { PRESETS, getPreset, cloneMachine } from './presets.js';
import { messages } from './i18n.js';

const $ = id => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
const END_STATUSES = new Set(['accepted', 'rejected', 'stuck']);
const STORAGE_KEY = 'turing-machine-workbench.v1';
let language = navigator.language.toLowerCase().startsWith('tr') ? 'tr' : 'en';
let machine = cloneMachine(getPreset('binary').machine);
let input = getPreset('binary').input;
let runtime = createRuntime(machine, input);
let selectedState = machine.initial;
let editingRule = null;
let currentSource = 'preset:binary';
let savedMachines = [];
let connectMode = false;
let connectFrom = null;
let timer = null;
let toastTimer = null;
let limitReached = false;
let dragged = null;
let runtimeViewportStart = null;

const t = (key, ...args) => {
  const value = messages[language][key] ?? messages.en[key] ?? key;
  return typeof value === 'function' ? value(...args) : value;
};
const esc = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isOneSymbol = s => typeof s === 'string' && Array.from(s).length === 1;
const safeStorage = (action, key, value) => { try { return action === 'read' ? localStorage.getItem(key) : localStorage.setItem(key, value); } catch { return null; } };

function toast(message, error = false) {
  const box = $('toast');
  box.textContent = message;
  box.className = `visible${error ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.className = '', 3300);
}
function reportError(error) { toast(error instanceof Error ? error.message : String(error), true); }
function storeDraft() {
  safeStorage('write', STORAGE_KEY, JSON.stringify({language, machine, input, currentSource, savedMachines}));
}
function restoreDraft() {
  try {
    const raw = safeStorage('read', STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.language === 'en' || data.language === 'tr') language = data.language;
    if (Array.isArray(data.savedMachines)) savedMachines = data.savedMachines.filter(x => {
      try { validateMachine(x.machine); return typeof x.id === 'string'; } catch { return false; }
    }).slice(0, 50);
    if (data.machine) {
      validateMachine(data.machine);
      machine = data.machine;
      input = typeof data.input === 'string' ? data.input.slice(0, 5000) : '';
      currentSource = typeof data.currentSource === 'string' ? data.currentSource : 'current';
      selectedState = machine.initial;
      runtime = createRuntime(machine, input);
    }
  } catch { /* Fall back to the bundled example if saved JSON is invalid. */ }
}

function localize() {
  document.documentElement.lang = language;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  $('language-en').setAttribute('aria-pressed', String(language === 'en'));
  $('language-tr').setAttribute('aria-pressed', String(language === 'tr'));
  document.title = language === 'tr' ? 'Turing Makinesi — Simülatör ve Editör' : 'Turing Machine — Simulator & Editor';
  $('run-label').textContent = t(timer ? 'pause' : 'run');
  $('rule-save').textContent = t(editingRule === null ? 'addRule' : 'updateRule');
  renderMachineChoices();
  renderStateForm();
  renderRuleFormChoices();
  renderRules();
  renderRuntime();
  renderTrace();
  renderConnectPrompt();
}
function renderMachineChoices() {
  const select = $('machine-select');
  const value = currentSource;
  select.replaceChildren();
  const current = document.createElement('option');
  current.value = 'current'; current.textContent = t('customOption');
  select.append(current);
  const examples = document.createElement('optgroup'); examples.label = t('builtIn');
  for (const preset of PRESETS) {
    const option = document.createElement('option'); option.value = `preset:${preset.id}`;
    option.textContent = language === 'tr' ? preset.titleTr : preset.title;
    examples.append(option);
  }
  select.append(examples);
  if (savedMachines.length) {
    const group = document.createElement('optgroup'); group.label = t('customGroup');
    for (const entry of savedMachines) {
      const option = document.createElement('option'); option.value = `saved:${entry.id}`; option.textContent = entry.machine.name;
      group.append(option);
    }
    select.append(group);
  }
  select.value = select.querySelector(`option[value="${CSS.escape(value)}"]`) ? value : 'current';
  const preset = currentSource.startsWith('preset:') ? getPreset(currentSource.slice(7)) : null;
  $('preset-description').textContent = preset ? (language === 'tr' ? preset.descriptionTr : preset.description) : '';
}
function setSourceCustom() { currentSource = 'current'; renderMachineChoices(); }
function stopRunning() {
  if (timer !== null) { clearInterval(timer); timer = null; }
  $('run-label').textContent = t('run');
  $('run-icon').textContent = '▶';
}
function resetRuntime() {
  stopRunning(); limitReached = false;
  runtime = createRuntime(machine, input);
  runtimeViewportStart = null;
  renderRuntime(); renderDiagram(); renderTrace();
}
function loadMachine(nextMachine, nextInput = '', source = 'current') {
  validateMachine(nextMachine);
  stopRunning();
  machine = cloneMachine(nextMachine);
  input = nextInput;
  currentSource = source;
  selectedState = machine.initial;
  editingRule = null;
  connectMode = false; connectFrom = null;
  $('connect-states').setAttribute('aria-pressed', 'false');
  $('diagram').classList.remove('connect-mode');
  $('machine-name').value = machine.name;
  $('input-string').value = input;
  resetRuntime(); renderMachineChoices(); renderStateForm(); renderRuleFormChoices(); clearRuleForm(); renderRules(); renderFormal(); renderConnectPrompt();
  storeDraft();
}
function editMachine(mutator) {
  const draft = cloneMachine(machine);
  mutator(draft);
  validateMachine(draft);
  machine = draft;
  setSourceCustom();
  resetRuntime(); renderStateForm(); renderRuleFormChoices(); clearRuleForm(); renderRules(); renderFormal(); storeDraft();
}
function getRuntimeWindow(cellCount) {
  const safeCount = Math.max(7, cellCount % 2 === 0 ? cellCount - 1 : cellCount);
  const margin = Math.max(2, Math.floor(safeCount / 5));
  if (runtimeViewportStart === null) runtimeViewportStart = runtime.head - Math.floor(safeCount / 2);
  const minStart = runtime.head - (safeCount - 1 - margin);
  const maxStart = runtime.head - margin;
  runtimeViewportStart = Math.max(minStart, Math.min(maxStart, runtimeViewportStart));
  return { start: runtimeViewportStart, end: runtimeViewportStart + safeCount - 1, count: safeCount };
}

function renderRuntime() {
  const viewport = $('tape-viewport');
  const estimatedCellWidth = 62;
  const rawCount = Math.max(7, Math.min(19, Math.floor((viewport.clientWidth || 850) / estimatedCellWidth)));
  const { start, end } = getRuntimeWindow(rawCount);
  const tape = document.createDocumentFragment();
  for (let index = start; index <= end; index++) {
    const symbol = readTape(runtime, index);
    const cell = document.createElement('div');
    cell.className = `tape-cell${index === runtime.head ? ' active' : ''}${symbol === BLANK ? ' blank' : ''}`;
    cell.setAttribute('aria-label', `Cell ${index}: ${symbol}`);
    const number = document.createElement('span'); number.className = 'cell-number'; number.textContent = String(index);
    const value = document.createElement('span'); value.className = 'cell-symbol'; value.textContent = symbol;
    cell.append(number, value); tape.append(cell);
  }
  $('tape-track').replaceChildren(tape);
  const activeCell = $('tape-track').querySelector('.tape-cell.active');
  const headTrack = $('head-track');
  const headElement = $('tape-head');
  const cellBox = activeCell.getBoundingClientRect();
  const trackBox = headTrack.getBoundingClientRect();
  const left = cellBox.left + (cellBox.width - headElement.offsetWidth) / 2 - trackBox.left;
  // Match the highlighted cell on every step. A delayed CSS transition makes
  // the head lag behind during fast runs and when the tape window shifts.
  headElement.style.left = `${Math.round(left)}px`;
  headElement.setAttribute('aria-label', t('headLabel'));
  const status = limitReached ? 'limit' : timer !== null && runtime.status === 'active' ? 'running' : runtime.status;
  const state = machine.states.find(s => s.id === runtime.state);
  $('status-text').textContent = t(status === 'limit' ? 'limitReached' : status);
  $('status-text').dataset.status = status === 'running' ? 'active' : status;
  $('current-state').textContent = state?.name ?? runtime.state;
  $('step-count').textContent = String(runtime.steps);
  $('head-position').textContent = String(runtime.head);
  $('nonblank-count').textContent = String(runtime.tape.size);
  $('back-button').disabled = runtime.history.length === 0;
  $('step-button').disabled = END_STATUSES.has(runtime.status);
  $('run-button').disabled = END_STATUSES.has(runtime.status) && timer === null;
}
function doStep() {
  const limit = Math.max(1, Math.min(1000000, Number($('step-limit').value) || 10000));
  if (runtime.steps >= limit) {
    stopRunning(); limitReached = true;
    toast(t('limitStop'));
    renderRuntime(); return false;
  }
  if (END_STATUSES.has(runtime.status)) return false;
  limitReached = false;
  stepMachine(machine, runtime);
  renderRuntime(); renderDiagram(); renderTrace();
  if (END_STATUSES.has(runtime.status)) { stopRunning(); renderRuntime(); return false; }
  return true;
}
function toggleRun() {
  if (timer !== null) { stopRunning(); renderRuntime(); return; }
  if (END_STATUSES.has(runtime.status)) return;
  limitReached = false;
  $('run-label').textContent = t('pause'); $('run-icon').textContent = 'Ⅱ';
  const speed = Number($('speed').value);
  timer = setInterval(doStep, Math.max(40, Math.floor(850 / Math.pow(speed + 0.8, 1.3))));
  renderRuntime();
}
function renderTrace() {
  const history = runtime.history.filter(h => h.rule).slice(-8).reverse();
  const list = $('trace-list'); list.replaceChildren();
  for (const entry of history) {
    const li = document.createElement('li');
    const rule = entry.rule;
    const from = machine.states.find(s=>s.id===rule.from)?.name ?? rule.from;
    const to = machine.states.find(s=>s.id===rule.to)?.name ?? rule.to;
    const text = document.createElement('span'); text.textContent = `${from}  ${rule.read}/${rule.write},${rule.move}  ${to}`;
    const index = document.createElement('span'); index.className = 'trace-step'; index.textContent = `#${entry.steps + 1}`;
    li.append(text, index); list.append(li);
  }
  $('trace-empty').hidden = history.length > 0;
}
function stateOptions(select, picked, excludeTerminal = false) {
  const fragment = document.createDocumentFragment();
  for (const state of machine.states) {
    if (excludeTerminal && state.type !== 'normal') continue;
    const option = document.createElement('option'); option.value = state.id; option.textContent = state.name;
    fragment.append(option);
  }
  select.replaceChildren(fragment);
  if ([...select.options].some(o => o.value === picked)) select.value = picked;
}
function renderStateForm() {
  const state = machine.states.find(s=>s.id===selectedState) ?? machine.states[0];
  if (!state) return;
  selectedState = state.id;
  stateOptions($('state-select'), selectedState);
  $('state-name').value = state.name;
  $('state-type').value = state.type;
  $('state-initial').checked = state.id === machine.initial;
  $('state-initial').disabled = state.id === machine.initial;
  $('delete-state').disabled = machine.states.length <= 1;
}
function renderRuleFormChoices() {
  stateOptions($('transition-from'), $('transition-from').value || machine.initial);
  stateOptions($('transition-to'), $('transition-to').value || machine.states.at(-1).id);
  const symbols = new Set([BLANK,'0','1',...machine.transitions.flatMap(rule=>[rule.read,rule.write])]);
  const options = document.createDocumentFragment();
  for (const symbol of symbols) { const option = document.createElement('option'); option.value = symbol; options.append(option); }
  $('symbol-options').replaceChildren(options);
}
function clearRuleForm() {
  editingRule = null;
  $('transition-from').value = selectedState;
  $('transition-to').value = machine.states.find(s => s.id !== selectedState)?.id ?? selectedState;
  $('transition-read').value = '';
  $('transition-write').value = '';
  $('transition-move').value = 'R';
  $('rule-save').textContent = t('addRule');
  renderRules();
}
function selectRule(index) {
  const rule = machine.transitions[index];
  if (!rule) return;
  editingRule = index;
  $('transition-from').value = rule.from;
  $('transition-to').value = rule.to;
  $('transition-read').value = rule.read;
  $('transition-write').value = rule.write;
  $('transition-move').value = rule.move;
  $('rule-save').textContent = t('updateRule');
  renderRules();
}
function renderRules() {
  const body = $('rules-body');
  const fragment = document.createDocumentFragment();
  for (let i=0; i<machine.transitions.length; i++) {
    const rule = machine.transitions[i], tr = document.createElement('tr');
    tr.dataset.index = String(i);
    if (i === editingRule) tr.className = 'selected';
    const vals = [machine.states.find(s=>s.id===rule.from)?.name,rule.read,rule.write,rule.move,machine.states.find(s=>s.id===rule.to)?.name];
    for (const value of vals) { const td = document.createElement('td'); td.textContent = value ?? '?'; tr.append(td); }
    const td = document.createElement('td'), button = document.createElement('button');
    button.type = 'button'; button.className = 'rule-delete'; button.dataset.deleteRule = String(i);
    button.setAttribute('aria-label', `${t('delete')} ${i+1}`); button.textContent = '×';
    td.append(button); tr.append(td); fragment.append(tr);
  }
  body.replaceChildren(fragment);
  $('rule-count').textContent = t('ruleCount',machine.transitions.length);
  $('no-rules').hidden = machine.transitions.length > 0;
}
function svg(tag, attrs = {}, text = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key,value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = String(text);
  return node;
}
function renderDiagram() {
  const diagram = $('diagram');
  const height = Math.max(460, ...machine.states.map(s=>Math.min(1500, (Number(s.y)||0)+95)));
  diagram.setAttribute('viewBox', `0 0 920 ${height}`);
  const edges = $('diagram-edges'), nodes = $('diagram-nodes');
  edges.replaceChildren(); nodes.replaceChildren();
  const map = new Map(machine.states.map(s=>[s.id,s]));
  const groups = new Map();
  for (let i=0; i<machine.transitions.length; i++) {
    const rule = machine.transitions[i], key = JSON.stringify([rule.from,rule.to]);
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push({ ...rule, index: i });
  }
  for (const [key,rules] of groups) {
    const first = rules[0], from = map.get(first.from), to = map.get(first.to);
    if (!from || !to) continue;
    const group = svg('g',{class: `edge${rules.some(r=>runtime.lastRule && runtime.lastRule.from===r.from && runtime.lastRule.read===r.read && runtime.lastRule.to===r.to) ? ' active' : ''}`});
    let path, labelX, labelY;
    if (from.id === to.id) {
      path = `M ${from.x-12} ${from.y-24} C ${from.x-65} ${from.y-116}, ${from.x+65} ${from.y-116}, ${from.x+12} ${from.y-24}`;
      labelX = from.x; labelY = from.y-91;
    } else {
      const dx = to.x-from.x, dy = to.y-from.y, len = Math.max(1,Math.hypot(dx,dy));
      const nx = -dy/len, ny = dx/len, ux = dx/len, uy = dy/len;
      const paired = groups.has(JSON.stringify([to.id,from.id]));
      const bend = paired ? 54 : 0;
      const x1=from.x+ux*28, y1=from.y+uy*28, x2=to.x-ux*29, y2=to.y-uy*29;
      const cx=(x1+x2)/2+nx*bend, cy=(y1+y2)/2+ny*bend;
      path = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
      labelX = (x1+2*cx+x2)/4; labelY = (y1+2*cy+y2)/4 - (paired ? 5 : 13);
    }
    group.append(svg('path',{d:path,class:'edge-path'}));
    const hit = svg('path',{d:path,class:'edge-hit','data-edge-index':first.index}); group.append(hit);
    const rows = rules.slice(0,3).map(r=>`${r.read}/${r.write},${r.move}`);
    if (rules.length > 3) rows.push(`+${rules.length-3}`);
    const labelWidth = Math.min(230,Math.max(52, ...rows.map(x=>x.length*7+18)));
    const labelHeight = rows.length*17+8;
    group.append(svg('rect',{x:labelX-labelWidth/2,y:labelY-labelHeight/2,width:labelWidth,height:labelHeight,rx:3,class:'edge-label-bg','data-edge-index':first.index}));
    rows.forEach((row,i)=>group.append(svg('text',{x:labelX,y:labelY-labelHeight/2+17+i*17,class:'edge-label'},row)));
    const title = svg('title',{},rules.map(r=>`${r.read} → ${r.write}, ${r.move}`).join(' · ')); group.append(title);
    edges.append(group);
  }
  for (const state of machine.states) {
    const active = state.id === runtime.state;
    const selected = state.id === selectedState;
    const cls = `node ${state.type}${active ? ' active' : ''}${selected ? ' selected' : ''}`;
    const g = svg('g',{class:cls,'data-state-id':state.id,tabindex:0,role:'button','aria-label':state.name});
    if (state.id === machine.initial) {
      g.append(svg('path',{d:`M ${state.x-72} ${state.y} L ${state.x-29} ${state.y}`,class:'initial-arrow'}));
      g.append(svg('text',{x:state.x-72,y:state.y-9,class:'start-label'},t('startLabel')));
    }
    g.append(svg('circle',{cx:state.x,cy:state.y,r:27,class:'node-circle'}));
    if (state.type === 'accept') g.append(svg('circle',{cx:state.x,cy:state.y,r:21,fill:'none',stroke:'#3d9365','stroke-width':1.6,'pointer-events':'none'}));
    if (state.type === 'reject') g.append(svg('path',{d:`M ${state.x-5} ${state.y-39} L ${state.x+5} ${state.y-39}`,stroke:'#c96868','stroke-width':2.6,'stroke-linecap':'round'}));
    const display = Array.from(state.name).length > 12 ? Array.from(state.name).slice(0,11).join('')+'…' : state.name;
    g.append(svg('text',{x:state.x,y:state.y+1,class:'node-name'},display));
    g.append(svg('title',{},state.name));
    nodes.append(g);
  }
}
function renderFormal() {
  const nonBlank = new Set(machine.transitions.flatMap(r=>[r.read,r.write]).filter(s=>s!==BLANK));
  const alphabet = [...nonBlank].sort();
  const lines = [
    `Q  = { ${machine.states.map(s=>s.name).join(', ')} }`,
    `Σ  = { ${alphabet.join(', ')} }`,
    `Γ  = { ${[BLANK,...alphabet].join(', ')} }`,
    `q₀ = ${machine.states.find(s=>s.id===machine.initial)?.name}`,
    `F  = { ${machine.states.filter(s=>s.type==='accept').map(s=>s.name).join(', ')} }`,
    `R  = { ${machine.states.filter(s=>s.type==='reject').map(s=>s.name).join(', ')} }`,
    '', 'δ:'
  ];
  for (const rule of machine.transitions.slice(0,80)) {
    const from=machine.states.find(s=>s.id===rule.from)?.name, to=machine.states.find(s=>s.id===rule.to)?.name;
    lines.push(`  δ(${from}, ${rule.read}) → (${to}, ${rule.write}, ${rule.move})`);
  }
  if (machine.transitions.length>80) lines.push(`  … (${machine.transitions.length-80} more rules)`);
  $('formal-output').textContent = lines.join('\n');
}
function renderConnectPrompt() {
  $('connect-prompt').textContent = !connectMode ? '' : connectFrom ? t('connectSecond') : t('connectFirst');
}
function selectDiagramState(id) {
  if (connectMode) {
    if (connectFrom === null) { connectFrom = id; renderConnectPrompt(); return; }
    const from = connectFrom;
    connectMode = false; connectFrom = null;
    $('connect-states').setAttribute('aria-pressed','false');
    $('diagram').classList.remove('connect-mode');
    clearRuleForm();
    $('transition-from').value = from;
    $('transition-to').value = id;
    $('transition-read').focus();
    renderConnectPrompt();
    toast(t('connected'));
    return;
  }
  selectedState = id;
  renderStateForm(); renderDiagram();
}
function diagramPosition(event) {
  const diagram = $('diagram'), rect = diagram.getBoundingClientRect(), view = diagram.viewBox.baseVal;
  return {x:(event.clientX-rect.left)*view.width/rect.width,y:(event.clientY-rect.top)*view.height/rect.height};
}
function addState(x, y) {
  let i = 0;
  while (machine.states.some(s=>s.id===`q${i}` || s.name===`q${i}`)) i++;
  const id = `q${i}`;
  try {
    editMachine(draft=>draft.states.push({id,name:id,type:'normal',x:Math.round(x),y:Math.round(y)}));
    selectedState = id;
    renderStateForm(); renderDiagram();
    toast(t('addedState'));
  } catch (error) { reportError(error); }
}
function wireDiagram() {
  const diagram = $('diagram');
  diagram.addEventListener('pointerdown',event=>{
    const group = event.target.closest?.('[data-state-id]');
    if (!group || connectMode || event.button !== 0) return;
    const state = machine.states.find(s=>s.id===group.dataset.stateId);
    if (!state) return;
    const p = diagramPosition(event);
    dragged = {id:state.id, x:p.x,y:p.y, sx:state.x,sy:state.y,moved:false};
    diagram.setPointerCapture(event.pointerId);
  });
  diagram.addEventListener('pointermove',event=>{
    if (!dragged) return;
    const p = diagramPosition(event);
    if (!dragged.moved && Math.hypot(p.x-dragged.x,p.y-dragged.y)<4) return;
    dragged.moved = true;
    const state = machine.states.find(s=>s.id===dragged.id);
    if (!state) return;
    state.x = Math.min(865,Math.max(86,Math.round(dragged.sx+p.x-dragged.x)));
    state.y = Math.min(1400,Math.max(75,Math.round(dragged.sy+p.y-dragged.y)));
    renderDiagram();
  });
  diagram.addEventListener('pointerup',event=>{
    if (!dragged) return;
    const drag = dragged; dragged = null;
    if (diagram.hasPointerCapture(event.pointerId)) diagram.releasePointerCapture(event.pointerId);
    if (drag.moved) storeDraft();
    else selectDiagramState(drag.id);
  });
  diagram.addEventListener('pointercancel',()=>{ dragged = null; });
  diagram.addEventListener('click',event=>{
    const group = event.target.closest?.('[data-state-id]');
    if (connectMode && group) selectDiagramState(group.dataset.stateId);
    const edge = event.target.closest?.('[data-edge-index]');
    if (edge && !connectMode) { selectRule(Number(edge.dataset.edgeIndex)); $('transition-form').scrollIntoView({behavior:'smooth',block:'nearest'}); }
  });
  diagram.addEventListener('keydown',event=>{
    const group = event.target.closest?.('[data-state-id]');
    if (group && (event.key==='Enter' || event.key===' ')) {event.preventDefault();selectDiagramState(group.dataset.stateId);}
  });
  diagram.addEventListener('dblclick',event=>{
    if (event.target.closest?.('[data-state-id]') || event.target.closest?.('[data-edge-index]')) return;
    const p = diagramPosition(event);
    addState(Math.max(90,Math.min(850,p.x)),Math.max(80,Math.min(1350,p.y)));
  });
}

function bindActions() {
  $('language-en').addEventListener('click',()=>{language='en';localize();renderDiagram();renderFormal();storeDraft();});
  $('language-tr').addEventListener('click',()=>{language='tr';localize();renderDiagram();renderFormal();storeDraft();});
  $('machine-select').addEventListener('change',event=>{
    const value = event.target.value;
    if (value === 'current') { currentSource = 'current'; storeDraft(); return; }
    if (value.startsWith('preset:')) {
      const preset = getPreset(value.slice(7)); if(!preset) return;
      loadMachine(preset.machine,preset.input,value); toast(t('presetLoad'));
    } else if (value.startsWith('saved:')) {
      const entry = savedMachines.find(x=>x.id===value.slice(6));
      if (entry) { loadMachine(entry.machine,entry.input,value); toast(t('imported')); }
    }
  });
  $('machine-name').addEventListener('change',event=>{
    try { editMachine(m=>{m.name=event.target.value.trim();}); }
    catch(error) { $('machine-name').value=machine.name; reportError(error); }
  });
  $('new-machine').addEventListener('click',()=>{const blank=makeEmptyMachine(); blank.name=t('blankName');loadMachine(blank,'');toast(t('machineCreated'));});
  $('save-machine').addEventListener('click',()=>{
    const name=window.prompt(t('namePrompt'),machine.name);
    if (name === null) return;
    if (!name.trim() || name.length>120) {toast(t('invalidInput'),true);return;}
    try {
      const copy=cloneMachine(machine); copy.name=name.trim(); validateMachine(copy);
      const existing=savedMachines.find(s=>s.machine.name===copy.name);
      if (existing) {existing.machine=copy;existing.input=input;currentSource=`saved:${existing.id}`;}
      else {const id=String(Date.now())+'-'+Math.random().toString(36).slice(2,6);savedMachines.push({id,machine:copy,input});currentSource=`saved:${id}`;}
      machine.name=copy.name;$('machine-name').value=machine.name;renderMachineChoices();storeDraft();toast(t('saved'));
    } catch(error) { reportError(error); }
  });
  $('import-json').addEventListener('click',()=>$('import-file').click());
  $('import-file').addEventListener('change',async event=>{
    const file=event.target.files?.[0]; if(!file) return;
    try {
      if(file.size>1_000_000)throw new Error(t('invalidFile'));
      const parsed=JSON.parse(await file.text());
      const loaded=parsed.machine??parsed;
      validateMachine(loaded);
      loadMachine(loaded,typeof parsed.input==='string'?parsed.input:'');toast(t('imported'));
    } catch(error) {reportError(error);} finally {event.target.value='';}
  });
  $('export-json').addEventListener('click',()=>{
    const json=JSON.stringify({format:'turing-machine-workbench/1',machine,input},null,2);
    const blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=`${machine.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'machine'}.json`;
    a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(t('exported'));
  });
  $('input-form').addEventListener('submit',event=>{
    event.preventDefault();input=$('input-string').value;try{resetRuntime();storeDraft();toast(t('loaded'));}catch(error){reportError(error);}
  });
  $('run-button').addEventListener('click',toggleRun);
  $('step-button').addEventListener('click',()=>{stopRunning();doStep();});
  $('back-button').addEventListener('click',()=>{stopRunning();limitReached=false;undoStep(runtime);renderRuntime();renderDiagram();renderTrace();});
  $('reset-button').addEventListener('click',resetRuntime);
  $('speed').addEventListener('change',()=>{if(timer!==null){stopRunning();toggleRun();}});
  $('step-limit').addEventListener('change',()=>{limitReached=false;renderRuntime();});
  $('add-state').addEventListener('click',()=>{
    const n=machine.states.length;addState(160+(n%4)*185,110+Math.floor(n/4)*145);
  });
  $('connect-states').addEventListener('click',()=>{
    connectMode=!connectMode;connectFrom=null;
    $('connect-states').setAttribute('aria-pressed',String(connectMode));
    $('diagram').classList.toggle('connect-mode',connectMode);renderConnectPrompt();
  });
  $('state-select').addEventListener('change',event=>selectDiagramState(event.target.value));
  $('state-form').addEventListener('submit',event=>{
    event.preventDefault();
    const name=$('state-name').value.trim(), type=$('state-type').value, initial=$('state-initial').checked;
    try {
      editMachine(m=>{
        const s=m.states.find(x=>x.id===selectedState);
        s.name=name;s.type=type;if(initial)m.initial=s.id;
      });
      toast(t('applied'));
    } catch(error) {reportError(error);renderStateForm();}
  });
  $('delete-state').addEventListener('click',()=>{
    if (machine.states.length<2) return;
    if(!window.confirm(t('deleteConfirm')))return;
    try {
      const id=selectedState;
      editMachine(m=>{
        m.states=m.states.filter(s=>s.id!==id);
        m.transitions=m.transitions.filter(r=>r.from!==id&&r.to!==id);
        if(m.initial===id)m.initial=m.states[0].id;
      });
      selectedState=machine.initial;renderStateForm();renderDiagram();toast(t('deleted'));
    } catch(error){reportError(error);}
  });
  document.querySelectorAll('[data-insert-blank]').forEach(button=>button.addEventListener('click',()=>{
    $(button.dataset.insertBlank).value=BLANK;$(button.dataset.insertBlank).focus();
  }));
  $('transition-form').addEventListener('submit',event=>{
    event.preventDefault();
    const rule={from:$('transition-from').value,to:$('transition-to').value,read:$('transition-read').value,write:$('transition-write').value,move:$('transition-move').value};
    if(!isOneSymbol(rule.read)||!isOneSymbol(rule.write)) {toast(t('useOneSymbol'),true);return;}
    const isUpdate=editingRule!==null;
    try {
      editMachine(m=>{
        if(isUpdate)m.transitions.splice(editingRule,1);
        m.transitions.push(rule);
      });
      toast(t('ruleSaved'));
    } catch(error){reportError(error);}
  });
  $('rule-cancel').addEventListener('click',clearRuleForm);
  $('rules-body').addEventListener('click',event=>{
    const button=event.target.closest('[data-delete-rule]');
    if(button){const index=Number(button.dataset.deleteRule);try{editMachine(m=>m.transitions.splice(index,1));toast(t('ruleDeleted'));}catch(error){reportError(error);}return;}
    const row=event.target.closest('tr[data-index]');if(row)selectRule(Number(row.dataset.index));
  });
  $('show-encoding').addEventListener('click',()=>{
    try{
      const bits=encodeMachine(machine),paired=encodePair(machine,input);
      $('machine-bits').value=bits;$('pair-bits').value=paired;
      $('machine-bit-count').textContent=t('bitCount',bits.length);$('pair-bit-count').textContent=t('bitCount',paired.length);
      $('encoding-dialog').showModal();
    }catch(error){reportError(error);}
  });
  $('close-encoding').addEventListener('click',()=>$('encoding-dialog').close());
  $('encoding-dialog').addEventListener('click',event=>{if(event.target===$('encoding-dialog'))$('encoding-dialog').close();});
  async function copyBits(id){
    const textarea=$(id);
    try {await navigator.clipboard.writeText(textarea.value);toast(t('copied'));}
    catch {textarea.focus();textarea.select();toast(t('copiedFallback'),true);}
  }
  $('copy-machine').addEventListener('click',()=>copyBits('machine-bits'));
  $('copy-pair').addEventListener('click',()=>copyBits('pair-bits'));
  $('decode-machine').addEventListener('click',()=>{
    try{const m=decodeMachine($('decode-input').value.trim());loadMachine(m,'');$('encoding-dialog').close();toast(t('decoded'));}
    catch(error){reportError(error);}
  });
  $('decode-pair').addEventListener('click',()=>{
    try{const decoded=decodePair($('decode-input').value.trim());loadMachine(decoded.machine,decoded.input);$('encoding-dialog').close();toast(t('pairDecoded'));}
    catch(error){reportError(error);}
  });
  document.addEventListener('keydown',event=>{
    if(event.key!==' ' || event.ctrlKey || event.metaKey || event.altKey || event.repeat || $('encoding-dialog').open)return;
    const tag=document.activeElement?.tagName;
    if(['INPUT','TEXTAREA','SELECT','BUTTON'].includes(tag) || document.activeElement?.isContentEditable) return;
    event.preventDefault();stopRunning();doStep();
  });
  window.addEventListener('resize',renderRuntime);
}

restoreDraft();
bindActions();
wireDiagram();
$('machine-name').value=machine.name;
$('input-string').value=input;
localize();
renderStateForm();
renderRuleFormChoices();
clearRuleForm();
renderDiagram();
renderFormal();
storeDraft();