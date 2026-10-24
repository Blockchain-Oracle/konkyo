# Why did Nishida and Walker find that a daytime nap made motor memory worse?

No: Nishida and Walker found that a daytime nap was associated with improved motor memory, not worse performance; the nap group showed significant offline consolidation enhancement [1]. Their study reports a 16% consolidation enhancement after the nap [2].

**Caveat:** The passages report findings from this motor-skill task and do not explain why a nap might make motor memory worse.

## Sources (2)
_Each quote was found word for word in Zetaris's own reading of the source._

- [1] Nishida and Walker · 2007, Daytime Naps, Motor Memory Consolidation and Regionally Specific Sleep Spindles, p. 1
  > “those that did nap expressed a highly significant consolidation enhancement”
- [2] Nishida and Walker · 2007, Daytime Naps, Motor Memory Consolidation and Regionally Specific Sleep Spindles, p. 2
  > “demonstrated a highly significant 16% consolidation enhancement”

## Checks
- 2 quotes from 1 source checked in one Zetaris statement (3052 ms); 0 rewritten, 0 dropped; 8.0 s in all.
- Models: planner gpt-6-luna, writer gpt-6-luna, verifier gpt-6-luna.

The Zetaris statement that checked every quote:

```sql
SELECT q.qid
FROM VALUES
    ('1', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f:p1:0', 'thosethatdidnapexpressedahighlysignificantconsolidationenhancement'),
    ('2', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f:p2:3', 'demonstratedahighlysignificant16consolidationenhancement')
  AS q(qid, doc, pid, qkey)
JOIN konkyo.konkyo_pdf_text t ON t.doc_id = q.doc
WHERE instr(t.p, q.qkey) > 0
```

_Trace: examples/03-wrong-premise/trace.jsonl (9 steps)_
