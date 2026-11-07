# TM01: binary encoding for deterministic single-tape machines

TM01 is a **project-defined, canonical, reversible** binary representation for deterministic single-tape Turing machines. It is intended for experimentation with encodings of machines and pairs such as `⟨M,w⟩` in the study of computability.

**Important:** There is no unique, universally standardized binary representation of a Turing machine. For a universal machine to recognize or simulate this encoding, it must explicitly implement the TM01 decoder (or an equivalent computable translation). A TM01 bit string cannot automatically be fed to an unrelated implementation of `A_TM`.

## Model

A machine contains:

- a nonempty finite set of named states, each with a `normal`, `accept` or `reject` type;
- exactly one initial state;
- a blank tape symbol `□` (U+25A1);
- a finite, partial deterministic transition function `δ(q,a) = (p,b,d)` where `d ∈ {L,R,S}`.

Symbols are individual Unicode code points. The transition function is partial: if no rule is defined for a nonterminal state and its scanned symbol, the simulator halts with **no matching rule**. Accept/reject states always halt. The input is placed from cell `0` onward, the head starts at `0`, and the tape extends indefinitely in both directions. A blank write removes the cell from sparse tape storage.

## Primitive values

- `bits(byte)`: the 8-bit big-endian binary representation of an unsigned byte.
- `utf8(s)`: the sequence of UTF-8 bytes encoding string `s`.
- `γ(n)` for positive integer `n`: Elias gamma code, `0^(floor(log₂(n)))` followed by the ordinary binary representation of `n`.
- `str(s) = γ(|utf8(s)| + 1) || bits(utf8(s))` where `||` denotes concatenation. The plus one permits the empty string.

Examples: `γ(1) = 1`, `γ(2) = 010`, `γ(3) = 011`, `γ(4) = 00100`. All integer and string fields are self-delimiting.

## Canonical machine encoding `⟨M⟩`

Start with 32 bits containing the ASCII bytes for `TM01`:

```text
01010100 01001101 00110000 00110001
   T        M        0        1
```

Append the following fields *in order*, without separators:

1. `str(machine_name)`.
2. `γ(number_of_states)`.
3. For each state, sorted in ascending Unicode/JavaScript string order by **name**: `str(state_name) || γ(state_type)`. The type is `1 = normal`, `2 = accept`, `3 = reject`.
4. `γ(initial_state_index)`, using a 1-based index into the sorted state list.
5. `γ(number_of_tape_symbols)`.
6. For each tape symbol: `str(symbol)`. The blank symbol `□` has index **1**. Other symbols are the distinct read/write symbols from transition rules, sorted ascending by their string values. All indices are 1-based.
7. `γ(number_of_transitions + 1)` (the plus one allows a machine with no rules).
8. For each transition, sorted by `(source_state_index, read_symbol_index)`, append five gamma integers:
   `γ(source_state_index) || γ(read_symbol_index) || γ(destination_state_index) || γ(write_symbol_index) || γ(direction)`.
   Movement codes: `1 = L`, `2 = R`, `3 = S`.

Diagram coordinates, storage IDs and GUI metadata are intentionally not encoded. State names are preserved, but IDs are regenerated upon decoding. This does not affect the simulated machine. Changing the order of the transition array or state array does not change the bits; changing the machine name does.

The encoding is injective for the defined semantic/label fields (with the stated sorting), is computationally decodable, and is self-delimiting. The decoder checks for invalid indices, malformed UTF-8, duplicate rules and extra trailing bits.

## Machine–input pair encoding `⟨M,w⟩`

Let `m = encodeMachine(M)` and let `w` be an ordinary Unicode input string. The pair is encoded as:

```text
γ(|m| + 1) || m || str(w)
```

`|m|` is a **bit count**, not a byte count. The prefix tells the decoder exactly where the machine description ends; `str(w)` contains the input as UTF-8. This pair format is also prefix-free.

For example, the empty input `ε` is represented by `str("") = γ(1) = 1` after the machine bits.

## Limits and interoperability

The browser currently restricts editor machines to 256 states and 65,536 rules, inputs to 5,000 Unicode code points, and binary payloads to 2,000,000 bits to prevent accidental denial of service. These are *implementation safeguards*, not bounds on the mathematical model.

To use TM01 with a universal Turing machine:

1. Implement this grammar or translate TM01 into the universal machine's own finite-description alphabet.
2. Decode the `⟨M,w⟩` wrapper into machine and input descriptions.
3. Simulate the decoded transition table under the single-tape conventions above.

The browser provides the encoder/decoder and the ordinary deterministic simulator, **not** a universal TM preset or an oracle for the undecidable language `A_TM`. No generic algorithm can decide acceptance for every arbitrary Turing-machine/input pair.

## API

The pure `src/core.js` module exports:

```js
import { encodeMachine, decodeMachine, encodePair, decodePair } from './src/core.js';

const bits = encodeMachine(machine);
const restored = decodeMachine(bits);
const pair = encodePair(machine, '0011');
const { machine: decodedMachine, input } = decodePair(pair);
```

Round-trip and canonicality are covered by `tests/core.test.js`.