# Examples

Five real runs of Konkyo's answer pipeline, recorded on 2026 against a sample library
of openly licensed sources (see [Sources and licences](#sources-and-licences)). Each folder holds:

| File | What it is |
|---|---|
| `input.json` | The question, the folder it was asked in, and when it was recorded |
| `output.md` | What Konkyo answered: the answer, every citation with its quote, the agree/disagree matrix when there is one, what the Verifier sent back, and the Zetaris statement that checked the quotes |
| `trace.jsonl` | The agents' trace: one line per step (which agent, which model, which Zetaris statement by hash, rows returned, verdicts, latency, tokens) |
| `tape.jsonl` | The replies from outside services (OpenAI, Zetaris, the library search, H-MEM recall) that sample mode replays |

| # | Question | Shows |
|---|---|---|
| [01](01-cited-answer/output.md) | What happens during sleep that helps memories consolidate? | A cited answer across the papers; every quote found in Zetaris |
| [02](02-agree-disagree/output.md) | What role do sleep spindles play in memory, and do these papers agree about it? | The Analyst's agree/disagree matrix, its quotes checked in Zetaris and its stances kept in the World Model |
| [03](03-wrong-premise/output.md) | Why did Nishida and Walker find that a daytime nap made motor memory worse? | A false premise, corrected from the source |
| [04](04-lecture-and-textbook/output.md) | What are the stages of memory, and how does the lecture explain forgetting? | A textbook and a lecture transcript together; the Verifier sends back a sentence and the Writer rewrites it |
| [05](05-not-in-library/output.md) | What is the boiling point of ethanol at sea level? | Nothing in the library covers it, so Konkyo says so instead of answering |

## Replay them

```bash
pnpm konkyo samples            # the list
pnpm konkyo ask --sample 2     # replay one (by number, name, or its exact question)
```

Sample mode needs no keys and no services. It hands the recorded replies back in place of the
services, and every step of Konkyo's own logic runs again on them: planning, citation parsing,
the code check of each quote, the Verifier's verdicts and rewrites, the matrix, the World Model
(written to a scratch folder), and a new trace in `logs/`. A question that was not recorded is
refused rather than invented.

## Record your own

With the services and `.env` set up (see the main README):

```bash
pnpm konkyo seed --user you@example.com
pnpm konkyo ask "<question>" --user you@example.com --folder "Essay starter: Sleep and learning" --record 06-my-question
```

## Sources and licences

The sample library is the onboarding starter set (`packages/config/src/starters.ts`):

- Nishida & Walker (2007), *Daytime Naps, Motor Memory Consolidation and Regionally Specific
  Sleep Spindles*, PLOS ONE. CC BY.
- Diekelmann (2014), *Sleep for cognitive enhancement*, Frontiers in Systems Neuroscience. CC BY 3.0.
- Muehlroth et al. (2019), *Precise Slow Oscillation–Spindle Coupling Promotes Memory
  Consolidation in Younger and Older Adults*, Scientific Reports. CC BY 4.0.
- Spielman, Jenkins & Lovett, *Psychology 2e*, sections 8.1–8.3, OpenStax (2020). CC BY-NC-SA 4.0.
  Access for free at https://openstax.org/books/psychology-2e/pages/1-introduction
- John Gabrieli, *9.00SC Introduction to Psychology*, Lecture 10: Memory I (slides and
  transcript), MIT OpenCourseWare, Fall 2011. CC BY-NC-SA 4.0. https://ocw.mit.edu
