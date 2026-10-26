# Why did Nishida and Walker find that a daytime nap made motor memory worse?

No: the paper reports that subjects in the nap group demonstrated a highly significant 16% consolidation enhancement (3.5 seq/trial), improving from 23.4 seq/trial (post-training) to 27.0 seq/trial (test) with a paired t-test showing t(13) = 4.05, p = 0.001 [1].

**Caveat:** The sources do not report any finding that a daytime nap made motor memory worse; they only describe enhancement.

## Sources (1)
_Each quote was found word for word in Zetaris's own reading of the source._

- [1] Nishida and Walker · 2007, Daytime Naps, Motor Memory Consolidation and Regionally Specific Sleep Spindles, p. 2 _(sentence rewritten after the Verifier's check)_
  > “improving from 23.4 seq/trial (post-training) to 27.0 seq/ trial (test; paired t-test t(13) = 4.05, p = 0.001; Figure 2b)”

## What the Verifier sent back
- Round 1: unsupported: "No: the paper reports that subjects in the nap group demonstrated a highly significant 16% consolidation enhancement (3.5 seq/trial, p = 0.002), improving from 23.4 seq/trial (post-training) to 27.0 seq/trial (test) [5]." (The claim states the p-value for the 16% consolidation enhancement is p = 0.002. The cited passage contains two different p-values for this enhancement: 'p = 0.002' in the first clause and 'p = 0.001' in the parenthetical paired t-test result (t(13) = 4.05, p = 0.001). The claim selects the first value but the passage does not uniquely support p = 0.002 over p = 0.001; the two values conflict, so the claim's specific number is not reliably supported.)

## Checks
- 1 quote from 1 source checked in one Zetaris statement; verifying, rewrites included, took 9.8 s; 1 rewritten, 0 dropped; 17.1 s in all.
- Models: planner nvidia/nemotron-3-ultra-550b-a55b, writer nvidia/nemotron-3-ultra-550b-a55b, verifier nvidia/nemotron-3-ultra-550b-a55b.

The Zetaris statement that checked every quote:

```sql
SELECT q.qid
FROM VALUES
    ('6', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f:p2:3', 'improvingfrom23.4seqtrialposttrainingto27.0seqtrialtestpairedttestt134.05p0.001figure2b')
  AS q(qid, doc, pid, qkey)
JOIN konkyo.konkyo_pdf_text t ON t.doc_id = q.doc
WHERE instr(t.p, q.qkey) > 0
```

_Trace: examples/03-wrong-premise/trace.jsonl (12 steps)_
