# Turing Machine Workbench

**A visual simulator and editor for deterministic single-tape Turing machines.**

Build machines by placing states and connecting them with transition rules. Enter a string, then run, pause, step forward or rewind to see exactly what happens to the tape. All computation happens in the browser; no account or server is required.

**Languages:** English · Türkçe ([Türkçe README](./docs/README.tr.md))

## What you can do

- **Draw state diagrams.** Add, rename, drag and delete states; mark initial, accepting and rejecting states; connect states and specify read/write/move rules.
- **Inspect execution.** See the infinite-in-both-directions tape, the read/write head below the current cell, current state, executed steps and a recent transition trace. Step backward through the available history (up to 2,000 steps).
- **Try classic machines.** Binary and unary incrementers, binary palindrome recognition, recognition of `0ⁿ1ⁿ`, equal counts of zeros and ones, even parity, and the 2-state Busy Beaver.
- **Save and exchange designs.** Save machines in local browser storage, or import/export portable JSON files.
- **Encode machines as binary.** Generate and decode a canonical `⟨M⟩` representation, as well as `⟨M,w⟩` for a machine paired with an input string. The format is documented and tested.
- **Switch languages.** The interface supports both English and Turkish.

## Try it locally

No build system or external dependencies are required. Serve the project directory with any static HTTP server (JavaScript modules generally require HTTP rather than `file://`):

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

For the Node.js test suite (Node.js 20+):

```bash
npm test
npm run check
```

## How to define a machine

A rule consists of a source state, one symbol to read, one symbol to write, a head movement (`L`, `R`, or `S`), and a destination state.

```text
δ(scan, 1) = (scan, 1, R)
δ(scan, □) = (accept, 1, S)
```

`□` denotes the blank symbol, and `S` means *stay*. At most one rule may exist for each `(state, read symbol)` pair. Once the machine reaches an accepting or rejecting state, it halts. If no rule applies in a nonterminal state, execution halts with a separate **No matching rule** status (not an explicit reject). An execution step limit protects the browser from unbounded runs.

To draw a rule, click **Connect states**, choose the source and destination circles, and complete the rule in the editor. You can also add rules directly in the transition form. Double-click empty diagram space to create a state.

## Binary encoding

The binary encoder uses **TM01**, a versioned, prefix-free, fully reversible encoding defined by this project. It includes state names/types, the start state, the tape alphabet and the deterministic transition function. A separate length-delimited encoding represents `⟨M,w⟩`.

There is no single universal bit-level convention for Turing-machine descriptions. A universal machine or an implementation of the language `A_TM` must decode the *same* convention to interpret these strings correctly. TM01 is **not** claimed to be compatible with arbitrary existing universal Turing machines.

See the [TM01 binary encoding specification](./docs/encoding.md) for the exact grammar, symbol indexing and examples of the algorithm.

## Project structure

```text
index.html           Browser interface
style.css            Plain CSS layout and diagram styles
src/core.js          Deterministic TM runtime, validation and binary codec
src/presets.js       Example machines
src/i18n.js          English/Turkish strings
src/app.js           SVG editor, tape display and browser interactions
tests/core.test.js   Node.js tests for examples, execution and encoding
docs/encoding.md     TM01 technical specification
```

## Contributing

Issues and pull requests are welcome. Please keep the simulator focused on **deterministic, single-tape** machines; implement new behavior in the pure runtime where possible and add a reproducible test for each bug fix or example. The application deliberately avoids frameworks, hosted fonts, analytics and runtime third-party dependencies.