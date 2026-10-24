# logs/

Every run writes its trace here as `logs/<runId>.jsonl`: one JSON line per agent step, with the
agent, the step, the action (for example `queried_zetaris`, `rejected_to_writer`,
`asserted_world_model`), the model, the Zetaris statement's hash and rows returned, verdicts,
latency and tokens. Runs from the app, the worker, the CLI and sample mode all write here.

Traces are not committed (they hold questions people asked). Recorded examples, with their
traces, are in [examples/](../examples/README.md); `pnpm konkyo ask --sample` writes a fresh one
here.
