# Why did Nishida and Walker find that a daytime nap made motor memory worse?

They did not find that a daytime nap made motor memory worse: Nishida and Walker report significant motor-memory improvement after a nap, while the no-nap group showed no significant delayed improvement [1]. The nap group’s improvement was associated with stage-2 NREM sleep and with the difference in spindle density between the learning and non-learning hemispheres [2].

**Caveat:** The passages report results for a specific motor-skill task and nap experiment, not every kind of motor memory or nap.

## Sources (2)
_Each quote was found word for word in Zetaris's own reading of the source._

- [1] Nishida and Walker · 2007, Daytime Naps, Motor Memory Consolidation and Regionally Specific Sleep Spindles, p. 1
  > “those that did nap expressed a highly significant consolidation enhancement”
- [2] Nishida and Walker · 2007, Daytime Naps, Motor Memory Consolidation and Regionally Specific Sleep Spindles, p. 3
  > “a significant positive correlation was identified between the amount of offline motor skill improvement across the nap and the density of spindles”

## Checks
- 2 quotes from 1 source checked in one Zetaris statement; verifying, rewrites included, took 4.0 s; 0 rewritten, 0 dropped; 17.9 s in all.
- Models: planner nvidia/nemotron-3-ultra-550b-a55b, writer gpt-6-luna, verifier gpt-6-luna.

The Zetaris statement that checked every quote:

```sql
SELECT q.qid
FROM VALUES
    ('1', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f:p1:0', 'thosethatdidnapexpressedahighlysignificantconsolidationenhancement'),
    ('2', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f:p3:0', 'asignificantpositivecorrelationwasidentifiedbetweentheamountofofflinemotorskillimprovementacrossthenapandthedensityofspindles')
  AS q(qid, doc, pid, qkey)
JOIN konkyo.konkyo_pdf_text t ON t.doc_id = q.doc
WHERE instr(t.p, q.qkey) > 0
```

_Trace: examples/03-wrong-premise/trace.jsonl (10 steps)_
