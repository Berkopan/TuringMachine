import { BLANK } from './core.js';

const B = BLANK;
function machine(name, initial, states, transitions) {
  return {
    name, initial,
    states: states.map(([id, type = 'normal', x = 140, y = 160]) => ({id, name: id, type, x, y})),
    transitions: transitions.map(([from, read, write, move, to]) => ({from, read, write, move, to}))
  };
}

export const PRESETS = [
  {
    id: 'binary', title: 'Binary incrementer', titleTr: 'İkili sayı artırıcı',
    description: 'Adds one to an unsigned binary number.', descriptionTr: 'İkili bir sayıya bir ekler.',
    input: '1011',
    machine: machine('Binary incrementer', 'scan', [
      ['scan','normal',180,160], ['carry','normal',450,160], ['accept','accept',720,160]
    ], [
      ['scan','0','0','R','scan'], ['scan','1','1','R','scan'], ['scan',B,B,'L','carry'],
      ['carry','1','0','L','carry'], ['carry','0','1','S','accept'], ['carry',B,'1','S','accept']
    ])
  },
  {
    id: 'unary', title: 'Unary incrementer', titleTr: 'Tekli sayı artırıcı',
    description: 'Appends a 1 to a unary number.', descriptionTr: 'Tekli sayının sonuna 1 ekler.',
    input: '111',
    machine: machine('Unary incrementer', 'scan', [
      ['scan','normal',240,200], ['accept','accept',630,200]
    ], [ ['scan','1','1','R','scan'], ['scan',B,'1','S','accept'] ])
  },
  {
    id: 'palindrome', title: 'Binary palindrome', titleTr: 'İkili palindrom',
    description: 'Recognizes palindromes over {0, 1}.', descriptionTr: '{0, 1} üzerinde palindromları tanır.',
    input: '0110',
    machine: machine('Binary palindrome', 'start', [
      ['start','normal',120,120], ['seek0','normal',315,75], ['check0','normal',510,75],
      ['seek1','normal',315,260], ['check1','normal',510,260], ['back','normal',710,200],
      ['accept','accept',710,365], ['reject','reject',845,75]
    ], [
      ['start','0',B,'R','seek0'], ['start','1',B,'R','seek1'], ['start',B,B,'S','accept'],
      ['seek0','0','0','R','seek0'], ['seek0','1','1','R','seek0'], ['seek0',B,B,'L','check0'],
      ['seek1','0','0','R','seek1'], ['seek1','1','1','R','seek1'], ['seek1',B,B,'L','check1'],
      ['check0','0',B,'L','back'], ['check0','1','1','S','reject'], ['check0',B,B,'S','accept'],
      ['check1','1',B,'L','back'], ['check1','0','0','S','reject'], ['check1',B,B,'S','accept'],
      ['back','0','0','L','back'], ['back','1','1','L','back'], ['back',B,B,'R','start']
    ])
  },
  {
    id: 'zero-one', title: '0ⁿ1ⁿ recognizer', titleTr: '0ⁿ1ⁿ tanıyıcı',
    description: 'Recognizes strings with n zeros followed by n ones (including ε).',
    descriptionTr: 'Önce n sıfır, sonra n bir bulunan dizeleri (ε dâhil) tanır.',
    input: '0011',
    machine: machine('0^n1^n recognizer', 'find0', [
      ['find0','normal',130,155], ['seek1','normal',340,155], ['return','normal',540,155],
      ['verify','normal',340,355], ['accept','accept',720,355], ['reject','reject',735,75]
    ], [
      ['find0','X','X','R','find0'], ['find0','0','X','R','seek1'], ['find0','Y','Y','R','verify'],
      ['find0','1','1','S','reject'], ['find0',B,B,'S','accept'],
      ['seek1','0','0','R','seek1'], ['seek1','Y','Y','R','seek1'],
      ['seek1','1','Y','L','return'], ['seek1',B,B,'S','reject'],
      ['return','0','0','L','return'], ['return','1','1','L','return'],
      ['return','X','X','L','return'], ['return','Y','Y','L','return'], ['return',B,B,'R','find0'],
      ['verify','Y','Y','R','verify'], ['verify',B,B,'S','accept'],
      ['verify','0','0','S','reject'], ['verify','1','1','S','reject']
    ])
  },
  {
    id: 'balanced', title: 'Equal 0s and 1s', titleTr: 'Eşit sayıda 0 ve 1',
    description: 'Recognizes binary strings with equally many zeros and ones, in any order.',
    descriptionTr: 'Sırası fark etmeksizin eşit sayıda sıfır ve bir içeren dizeleri tanır.',
    input: '0101',
    machine: machine('Equal numbers of 0 and 1', 'find', [
      ['find','normal',125,190], ['seek0','normal',340,80], ['seek1','normal',340,285],
      ['return','normal',590,190], ['accept','accept',750,325], ['reject','reject',750,55]
    ], [
      ['find','X','X','R','find'], ['find','Y','Y','R','find'],
      ['find','0','X','R','seek1'], ['find','1','Y','R','seek0'], ['find',B,B,'S','accept'],
      ['seek1','0','0','R','seek1'], ['seek1','X','X','R','seek1'], ['seek1','Y','Y','R','seek1'],
      ['seek1','1','Y','L','return'], ['seek1',B,B,'S','reject'],
      ['seek0','1','1','R','seek0'], ['seek0','X','X','R','seek0'], ['seek0','Y','Y','R','seek0'],
      ['seek0','0','X','L','return'], ['seek0',B,B,'S','reject'],
      ['return','0','0','L','return'], ['return','1','1','L','return'],
      ['return','X','X','L','return'], ['return','Y','Y','L','return'], ['return',B,B,'R','find']
    ])
  },
  {
    id: 'parity', title: 'Even number of 1s', titleTr: 'Çift sayıda 1',
    description: 'A two-state parity checker (even count is accepted).',
    descriptionTr: 'İki durumlu parite denetleyici (çift sayı kabul edilir).',
    input: '1010',
    machine: machine('Even number of 1s', 'even', [
      ['even','normal',205,190], ['odd','normal',490,190],
      ['accept','accept',205,365], ['reject','reject',490,365]
    ], [
      ['even','0','0','R','even'], ['even','1','1','R','odd'], ['even',B,B,'S','accept'],
      ['odd','0','0','R','odd'], ['odd','1','1','R','even'], ['odd',B,B,'S','reject']
    ])
  },
  {
    id: 'beaver', title: 'Busy Beaver (2-state)', titleTr: 'Busy Beaver (2 durum)',
    description: 'The classic 2-state, 2-symbol Busy Beaver (6 steps, 4 ones).',
    descriptionTr: 'Klasik iki durumlu Busy Beaver (6 adım, 4 tane bir).',
    input: '',
    machine: machine('Busy Beaver (2-state)', 'A', [
      ['A','normal',190,200], ['B','normal',470,200], ['halt','accept',720,200]
    ], [
      ['A',B,'1','R','B'], ['A','1','1','L','B'],
      ['B',B,'1','L','A'], ['B','1','1','R','halt']
    ])
  }
];

export function getPreset(id) { return PRESETS.find(p => p.id === id); }
export function cloneMachine(machine) { return JSON.parse(JSON.stringify(machine)); }