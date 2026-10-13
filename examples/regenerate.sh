#!/bin/sh
# Regenerates every committed example output offline from the recorded LLM responses.
# Run from the repository root after `npm run build` (or use `npm run examples`).
set -e
EX=examples/bluefin-dispatch
CLI="node dist/bin.js"

$CLI brief "$EX/materials" -o "$EX/output" --replay "$EX/cassette.json"
$CLI write "$EX/output" --approve --replay "$EX/cassette.json"
$CLI write "$EX/output" --approve --nda --replay "$EX/cassette.json"
