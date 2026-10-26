# Why did Nishida and Walker find that a daytime nap made motor memory worse?

No: Nishida and Walker found that a daytime nap significantly enhanced motor memory consolidation compared with remaining awake [1]. Subjects who obtained a 60–90 minute midday nap showed a highly significant consolidation enhancement, whereas those who did not nap showed no significant performance improvement [1].

**Caveat:** The question misrepresents the paper’s result; nothing in the passages reports a daytime nap making motor memory worse.

## Sources (1)
_Each quote was found word for word in Zetaris's own reading of the source._

- [1] Nishida and Walker · 2007, Daytime Naps, Motor Memory Consolidation and Regionally Specific Sleep Spindles, p. 1
  > “those that did nap expressed a highly significant consolidation enhancement”

## Checks
- 1 quote from 1 source checked in one Zetaris statement; verifying, rewrites included, took 7.8 s; 0 rewritten, 0 dropped; 45.3 s in all.
- Models: planner nvidia/nemotron-3-ultra-550b-a55b, writer nvidia/nemotron-3.5-super-vl-120b-a12b, verifier nvidia/nemotron-3.5-lightning-30b-a3b.

The Zetaris statement that checked every quote:

```sql
SELECT q.qid
FROM VALUES
    ('1', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f:p1:0', 'thosethatdidnapexpressedahighlysignificantconsolidationenhancement')
  AS q(qid, doc, pid, qkey)
JOIN konkyo.konkyo_pdf_text t ON t.doc_id = q.doc
WHERE instr(t.p, q.qkey) > 0
```

_Trace: examples/03-wrong-premise/trace.jsonl (10 steps)_
