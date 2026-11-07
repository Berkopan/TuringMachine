import test from 'node:test';
import assert from 'node:assert/strict';
import { BLANK, createRuntime, readTape, stepMachine, undoStep, tapeContents, validateMachine, encodeMachine, decodeMachine, encodePair, decodePair, makeEmptyMachine } from '../src/core.js';
import { PRESETS, cloneMachine, getPreset } from '../src/presets.js';

function run(id, input, limit = 10000) {
  const machine = getPreset(id).machine;
  const runtime = createRuntime(machine, input);
  while (!['accepted', 'rejected', 'stuck'].includes(runtime.status) && runtime.steps < limit) stepMachine(machine, runtime);
  return runtime;
}

test('every built-in is deterministic and correctly formed', () => {
  for (const p of PRESETS) assert.equal(validateMachine(p.machine), true, p.id);
});
test('unary and binary incrementers', () => {
  assert.equal(tapeContents(run('unary', '111')), '1111');
  assert.equal(tapeContents(run('binary', '1011')), '1100');
  assert.equal(tapeContents(run('binary', '111')), '1000');
  assert.equal(tapeContents(run('binary', '')), '1');
});
test('palindrome accepts and rejects', () => {
  for (const input of ['', '0', '0110', '010', '10101']) assert.equal(run('palindrome', input).status, 'accepted', input);
  for (const input of ['01', '0101', '0010']) assert.equal(run('palindrome', input).status, 'rejected', input);
});
test('0^n1^n recognizer', () => {
  for (const input of ['', '01', '0011', '000111']) assert.equal(run('zero-one', input).status, 'accepted', input);
  for (const input of ['0', '1', '001', '0101', '011']) assert.equal(run('zero-one', input).status, 'rejected', input);
});
test('equal 0/1 counts in any order', () => {
  for (const input of ['', '01', '10', '0011', '1010', '010101']) assert.equal(run('balanced', input).status, 'accepted', input);
  for (const input of ['1', '0001', '011', '111']) assert.equal(run('balanced', input).status, 'rejected', input);
});
test('even parity and busy beaver', () => {
  assert.equal(run('parity', '1010').status, 'accepted');
  assert.equal(run('parity', '111').status, 'rejected');
  const beaver = run('beaver', '');
  assert.equal(beaver.status, 'accepted');
  assert.equal(beaver.steps, 6);
  assert.equal([...beaver.tape.values()].filter(s=>s==='1').length, 4);
});
test('rewind restores tape, state and head', () => {
  const m = getPreset('binary').machine;
  const r = createRuntime(m, '11');
  stepMachine(m,r); stepMachine(m,r); stepMachine(m,r);
  assert.equal(r.steps, 3);
  undoStep(r); undoStep(r); undoStep(r);
  assert.equal(r.steps, 0);
  assert.equal(r.status, 'ready');
  assert.equal(r.head, 0);
  assert.equal(tapeContents(r), '11');
  assert.equal(readTape(r,99), BLANK);
});
test('missing rule is a distinct halting status and can be undone', () => {
  const m = makeEmptyMachine(), r = createRuntime(m,'0');
  stepMachine(m,r);
  assert.equal(r.status, 'stuck');
  undoStep(r);
  assert.equal(r.status, 'ready');
});
test('reject nondeterministic rules and terminal outgoing rules', () => {
  const m = cloneMachine(getPreset('unary').machine);
  m.transitions.push({ ...m.transitions[0] });
  assert.throws(() => validateMachine(m), /Nondeterministic/);
  m.transitions.pop();
  m.transitions.push({ from:'accept', read:'0', write:'0', move:'S', to:'accept' });
  assert.throws(() => validateMachine(m), /outgoing/);
});
test('canonical, decodable encoding round trips all machines', () => {
  for (const preset of PRESETS) {
    const bits = encodeMachine(preset.machine);
    assert.match(bits,/^[01]+$/);
    const restored = decodeMachine(bits);
    assert.equal(encodeMachine(restored),bits,preset.id);
    const shuffled = cloneMachine(preset.machine);
    shuffled.states.reverse(); shuffled.transitions.reverse();
    assert.equal(encodeMachine(shuffled), bits, `canonical ${preset.id}`);
  }
});
test('machine/input pair is reversible (including Unicode)', () => {
  const machine = makeEmptyMachine();
  machine.transitions.push({from:'q0',read:'🍋',write:'1',move:'S',to:'qa'});
  const paired = encodePair(machine,'🍋🍋');
  const decoded = decodePair(paired);
  assert.equal(decoded.input,'🍋🍋');
  assert.equal(encodeMachine(decoded.machine), encodeMachine(machine));
  assert.throws(() => decodePair(paired+'1'), /Unexpected/);
});
test('truncated or non-binary encodings fail', () => {
  const bits = encodeMachine(getPreset('unary').machine);
  assert.throws(() => decodeMachine(bits.slice(0,-3)));
  assert.throws(() => decodeMachine('not-bits'));
});