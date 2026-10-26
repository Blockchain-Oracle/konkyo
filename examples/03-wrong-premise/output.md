# Why did Nishida and Walker find that a daytime nap made motor memory worse?

No: the paper reports that subjects who napped showed a highly significant consolidation enhancement in motor memory performance [1]. Instead, subjects who took a daytime nap showed a highly significant consolidation enhancement in motor memory performance [1]. No nap was associated with no significant performance improvement after 8 hours [2].

**Caveat:** The provided passages do not report any condition in which napping impaired motor memory.

## Sources (2)
_Each quote was found word for word in Zetaris's own reading of the source._

- [1] Nishida and Walker · 2007, Daytime Naps, Motor Memory Consolidation and Regionally Specific Sleep Spindles, p. 1
  > “those that did nap expressed a highly significant consolidation enhancement”
- [2] Nishida and Walker · 2007, Daytime Naps, Motor Memory Consolidation and Regionally Specific Sleep Spindles, p. 1
  > “subjects that did not nap showed no significant performance improvement”

## What the Verifier sent back
- Round 1: unsupported: "Nishida and Walker did not find that a daytime nap made motor memory worse [1]." (The cited passage states that subjects who napped expressed 'a highly significant consolidation enhancement,' while those who did not nap showed 'no significant performance improvement.' The passage does not address whether a nap made motor memory worse; it explicitly finds that napping was associated with improvement, not impairment. The claim misrepresents the finding as a null effect on impairment, whereas the data show a benefit of napping.)

## Checks
- 2 quotes from 1 source checked in one Zetaris statement; verifying, rewrites included, took 17.6 s; 1 rewritten, 0 dropped; 25.8 s in all.
- Models: planner nvidia/nemotron-3-ultra-550b-a55b, writer nvidia/nemotron-3.5-super-vl-120b-a12b, verifier nvidia/nemotron-3.5-lightning-30b-a3b.

The Zetaris statement that checked every quote:

```sql
SELECT q.qid
FROM VALUES
    ('1', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f:p1:0', 'daytimenapsmotormemoryconsolidationandregionallyspecificsleepspindlesmasakinishidamatthewp.walker'),
    ('2', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f:p1:0', 'thosethatdidnapexpressedahighlysignificantconsolidationenhancement'),
    ('3', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f:p1:0', 'subjectsthatdidnotnapshowednosignificantperformanceimprovement')
  AS q(qid, doc, pid, qkey)
JOIN konkyo.konkyo_pdf_text t ON t.doc_id = q.doc
WHERE instr(t.p, q.qkey) > 0
```

_Trace: examples/03-wrong-premise/trace.jsonl (13 steps)_
