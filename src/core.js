/** Pure single-tape deterministic Turing machine model and binary codec. */
export const BLANK = '□';
export const DIRECTIONS = ['L', 'R', 'S'];
const MAX_STATES = 256;
const MAX_RULES = 65536;
const MAX_BITS = 2_000_000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const isSymbol = value => typeof value === 'string' && Array.from(value).length === 1;
const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function validateMachine(machine) {
  assert(machine && typeof machine === 'object', 'Invalid machine.');
  assert(typeof machine.name === 'string' && machine.name.trim().length > 0 && machine.name.length <= 120, 'Machine name must contain 1–120 characters.');
  assert(Array.isArray(machine.states) && machine.states.length >= 1 && machine.states.length <= MAX_STATES, 'A machine needs 1–256 states.');
  assert(Array.isArray(machine.transitions) && machine.transitions.length <= MAX_RULES, 'Too many transition rules.');
  const ids = new Set();
  const names = new Set();
  for (const state of machine.states) {
    assert(state && typeof state.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(state.id) && !ids.has(state.id), 'Each state needs a unique simple ID.');
    assert(typeof state.name === 'string' && state.name.trim().length > 0 && state.name.length <= 40 && !names.has(state.name), 'Each state needs a unique name (1–40 characters).');
    assert(['normal', 'accept', 'reject'].includes(state.type), 'Unknown state type.');
    ids.add(state.id);
    names.add(state.name);
  }
  assert(ids.has(machine.initial), 'Initial state does not exist.');
  const seen = new Set();
  const terminal = new Set(machine.states.filter(s => s.type !== 'normal').map(s => s.id));
  for (const rule of machine.transitions) {
    assert(rule && ids.has(rule.from) && ids.has(rule.to), 'A transition references a missing state.');
    assert(isSymbol(rule.read) && isSymbol(rule.write), 'Read and write must each be one tape symbol.');
    assert(DIRECTIONS.includes(rule.move), 'Movement must be L, R, or S.');
    assert(!terminal.has(rule.from), 'Accepting and rejecting states cannot have outgoing transitions.');
    const key = JSON.stringify([rule.from, rule.read]);
    assert(!seen.has(key), 'Nondeterministic rule: each (state, read symbol) may have only one transition.');
    seen.add(key);
  }
  return true;
}

export function makeEmptyMachine() {
  return {
    name: 'Untitled machine', initial: 'q0',
    states: [
      { id: 'q0', name: 'q0', type: 'normal', x: 180, y: 210 },
      { id: 'qa', name: 'q_accept', type: 'accept', x: 475, y: 210 }
    ],
    transitions: []
  };
}

export function createRuntime(machine, input = '') {
  validateMachine(machine);
  assert(typeof input === 'string' && Array.from(input).length <= 5000, 'Input must be at most 5000 symbols.');
  const tape = new Map();
  Array.from(input).forEach((symbol, index) => { if (symbol !== BLANK) tape.set(index, symbol); });
  const state = machine.states.find(s => s.id === machine.initial);
  const status = state.type === 'accept' ? 'accepted' : state.type === 'reject' ? 'rejected' : 'ready';
  return { tape, head: 0, state: machine.initial, steps: 0, status, lastRule: null, history: [] };
}

export function readTape(runtime, position = runtime.head) { return runtime.tape.get(position) ?? BLANK; }

export function stepMachine(machine, runtime) {
  if (['accepted', 'rejected', 'stuck'].includes(runtime.status)) return runtime;
  const before = {
    state: runtime.state, head: runtime.head, steps: runtime.steps,
    status: runtime.status, lastRule: runtime.lastRule,
    oldSymbol: readTape(runtime), rule: null
  };
  const rule = machine.transitions.find(r => r.from === runtime.state && r.read === before.oldSymbol);
  if (!rule) {
    runtime.status = 'stuck';
  } else {
    before.rule = { ...rule };
    if (rule.write === BLANK) runtime.tape.delete(runtime.head);
    else runtime.tape.set(runtime.head, rule.write);
    runtime.head += rule.move === 'L' ? -1 : rule.move === 'R' ? 1 : 0;
    runtime.state = rule.to;
    runtime.steps += 1;
    runtime.lastRule = { ...rule };
    const dest = machine.states.find(s => s.id === runtime.state);
    runtime.status = dest.type === 'accept' ? 'accepted' : dest.type === 'reject' ? 'rejected' : 'active';
  }
  runtime.history.push(before);
  if (runtime.history.length > 2000) runtime.history.shift();
  return runtime;
}

export function undoStep(runtime) {
  const previous = runtime.history.pop();
  if (!previous) return runtime;
  if (previous.rule) {
    if (previous.oldSymbol === BLANK) runtime.tape.delete(previous.head);
    else runtime.tape.set(previous.head, previous.oldSymbol);
  }
  runtime.state = previous.state;
  runtime.head = previous.head;
  runtime.steps = previous.steps;
  runtime.status = previous.status;
  runtime.lastRule = previous.lastRule;
  return runtime;
}

export function tapeContents(runtime) {
  const positions = [...runtime.tape.keys()];
  if (!positions.length) return '';
  const min = Math.min(...positions), max = Math.max(...positions);
  assert(max - min <= 100_000, 'Tape output is too large to render.');
  return Array.from({ length: max - min + 1 }, (_, n) => readTape(runtime, min + n)).join('');
}

// Project-specific, prefix-free format TM01. See docs/encoding.md.
const HEADER = [...new TextEncoder().encode('TM01')].map(x => x.toString(2).padStart(8, '0')).join('');
const bitsByte = n => n.toString(2).padStart(8, '0');
function gamma(n) {
  assert(Number.isSafeInteger(n) && n >= 1, 'Gamma encoding requires a positive integer.');
  const bits = n.toString(2);
  return '0'.repeat(bits.length - 1) + bits;
}
function textBits(text) {
  const bytes = new TextEncoder().encode(text);
  return gamma(bytes.length + 1) + [...bytes].map(bitsByte).join('');
}
function reader(bits) {
  assert(typeof bits === 'string' && /^[01]*$/.test(bits) && bits.length <= MAX_BITS, 'Expected binary data (at most 2,000,000 bits).');
  let cursor = 0;
  const take = size => {
    assert(cursor + size <= bits.length, 'Truncated binary encoding.');
    const part = bits.slice(cursor, cursor + size);
    cursor += size;
    return part;
  };
  const number = () => {
    let zeros = 0;
    while (cursor < bits.length && bits[cursor] === '0') { zeros++; cursor++; }
    assert(zeros <= 50 && cursor + zeros + 1 <= bits.length, 'Invalid gamma integer.');
    return parseInt(take(zeros + 1), 2);
  };
  const string = () => {
    const count = number() - 1;
    assert(count >= 0 && count <= 25000, 'Invalid UTF-8 field length.');
    const bytes = new Uint8Array(count);
    for (let i = 0; i < count; i++) bytes[i] = parseInt(take(8), 2);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  };
  return { take, number, string, finished: () => cursor === bits.length };
}

export function encodeMachine(machine) {
  validateMachine(machine);
  const states = [...machine.states].sort((a,b) => compareText(a.name,b.name));
  const stateCode = new Map(states.map((state,i) => [state.id, i+1]));
  const alphabet = [BLANK, ...new Set(machine.transitions.flatMap(t => [t.read,t.write]).filter(s => s !== BLANK))].sort((a,b) => a === BLANK ? -1 : b === BLANK ? 1 : compareText(a,b));
  const symbolCode = new Map(alphabet.map((symbol,i) => [symbol, i+1]));
  const types = { normal: 1, accept: 2, reject: 3 };
  const moves = { L: 1, R: 2, S: 3 };
  const rules = [...machine.transitions].sort((a,b) => stateCode.get(a.from)-stateCode.get(b.from) || symbolCode.get(a.read)-symbolCode.get(b.read));
  let bits = HEADER + textBits(machine.name) + gamma(states.length);
  for (const state of states) bits += textBits(state.name) + gamma(types[state.type]);
  bits += gamma(stateCode.get(machine.initial)) + gamma(alphabet.length);
  for (const symbol of alphabet) bits += textBits(symbol);
  bits += gamma(rules.length + 1);
  for (const r of rules) bits += [stateCode.get(r.from), symbolCode.get(r.read), stateCode.get(r.to), symbolCode.get(r.write), moves[r.move]].map(gamma).join('');
  assert(bits.length <= MAX_BITS, 'Machine encoding is too large.');
  return bits;
}

export function decodeMachine(bits) {
  const r = reader(bits.trim());
  assert(r.take(HEADER.length) === HEADER, 'Not a TM01 machine encoding.');
  const name = r.string(), stateCount = r.number();
  assert(stateCount >= 1 && stateCount <= MAX_STATES, 'Invalid state count.');
  const types = ['', 'normal', 'accept', 'reject'];
  const states = [];
  for (let i=0; i<stateCount; i++) {
    const stateName = r.string(), code = r.number();
    assert(types[code], 'Invalid state type.');
    states.push({ id: `s${i}`, name: stateName, type: types[code], x: 125 + (i%4)*185, y: 105 + Math.floor(i/4)*135 });
  }
  const start = r.number()-1;
  assert(start >= 0 && start < stateCount, 'Invalid initial state index.');
  const alphabetCount = r.number();
  assert(alphabetCount >= 1 && alphabetCount <= 256, 'Invalid symbol count.');
  const symbols = Array.from({length: alphabetCount}, () => r.string());
  assert(symbols[0] === BLANK && symbols.every(isSymbol) && new Set(symbols).size === symbols.length, 'Invalid alphabet.');
  const count = r.number()-1;
  assert(count >= 0 && count <= MAX_RULES, 'Invalid transition count.');
  const transitions = [];
  for (let i=0; i<count; i++) {
    const [from,read,to,write,move] = Array.from({length:5}, () => r.number());
    assert(from <= states.length && to <= states.length && read <= symbols.length && write <= symbols.length && move <= 3, 'Invalid transition code.');
    transitions.push({ from: states[from-1].id, read: symbols[read-1], to: states[to-1].id, write: symbols[write-1], move: DIRECTIONS[move-1] });
  }
  assert(r.finished(), 'Unexpected bits after the machine.');
  const machine = { name, initial: states[start].id, states, transitions };
  validateMachine(machine);
  return machine;
}

export function encodePair(machine, input = '') {
  assert(typeof input === 'string' && Array.from(input).length <= 5000, 'Invalid input string.');
  const binary = encodeMachine(machine);
  return gamma(binary.length + 1) + binary + textBits(input);
}

export function decodePair(bits) {
  const r = reader(bits.trim());
  const length = r.number() - 1;
  assert(length >= HEADER.length && length <= MAX_BITS, 'Invalid machine bit length.');
  const machine = decodeMachine(r.take(length));
  const input = r.string();
  assert(r.finished(), 'Unexpected bits after the pair.');
  return { machine, input };
}