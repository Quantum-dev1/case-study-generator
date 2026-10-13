# Contributing

Thanks for helping make case studies more honest.

## Setup

```bash
npm install
npm run typecheck
npm test
npm run build
```

Node.js 22+ is needed for the dev toolchain (Vitest 5); the published CLI runs on Node.js 20+.

## Ground rules

- **No network in tests.** Use `MockLLM` from `test/helpers.ts` or a cassette with `ReplayLLM`.
- **Keep the example in sync.** If you change prompts, chunking or rendering, run `npm run examples`
  and commit the regenerated files in `examples/`. The golden test in `test/pipeline.test.ts` fails otherwise.
- **Zero runtime dependencies** is a feature. Discuss in an issue before adding one.
- Every new check in the fact-checker needs a test that shows a claim being kept and a claim being removed.

## Pull requests

1. Fork and create a branch from `main`.
2. Add tests for your change.
3. Make sure `npm run typecheck && npm test && npm run build` passes.
4. Describe the problem and the behaviour change in the PR.
