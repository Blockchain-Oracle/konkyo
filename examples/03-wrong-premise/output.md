# Why did Nishida and Walker find that a daytime nap made motor memory worse?

They did not find that daytime naps made motor memory worse [1]. Subjects who napped showed a highly significant consolidation enhancement [1], while those who remained awake showed no significant performance improvement [2]. In fact, previous motor skill studies showed periods of daytime wake with learning-effector immobilization can produce learning deteriorations [3].

**Caveat:** The passages do not report any condition in which a nap itself impaired motor memory.

## Sources (3)
_Each quote was found word for word in Zetaris's own reading of the source._

- [1] Nishida and Walker · 2007, Daytime Naps, Motor Memory Consolidation and Regionally Specific Sleep Spindles, p. 1 _(sentence rewritten after the Verifier's check)_
  > “those that did nap expressed a highly significant consolidation enhancement”
- [2] Nishida and Walker · 2007, Daytime Naps, Motor Memory Consolidation and Regionally Specific Sleep Spindles, p. 1 _(sentence rewritten after the Verifier's check)_
  > “subjects that did not nap showed no significant performance improvement”
- [3] Nishida and Walker · 2007, Daytime Naps, Motor Memory Consolidation and Regionally Specific Sleep Spindles, p. 5 _(sentence rewritten after the Verifier's check)_
  > “daytime wake with learning-effector immobilization (negating corresponding limb interference, hence offering the opportunity for consolidation), not only result in the absence of any memory improvement, but can produce learning deteriorations”

## What the Verifier sent back
- Round 1: [3] quote is not verbatim in p5: "periods of daytime wake with learning-effector immobilization ... can produce learning deteriorations"
- Round 1: unsupported: "In fact, waking periods with effector immobilization can produce learning deteriorations [3], but naps enhanced rather than worsened memory." (Passage p5 is only referenced by citation [3] and a brief quote 'periods of daytime wake with learning-effector immobilization ... can produce learning deteriorations.' However, the provided context for p5 does not contain any statement about naps enhancing memory or comparing naps to immobilization. The other references (p26, p28, etc.) are listed in a bibliography-style snippet but no actual passage text is given that discusses naps worsening or enhancing memory in the context of immobilization. Therefore, the cited passages do not support claim 3.)

## Checks
- 3 quotes from 1 source checked in one Zetaris statement; verifying, rewrites included, took 57.9 s; 3 rewritten, 0 dropped; 65.7 s in all.
- Models: planner nvidia/nemotron-3-ultra-550b-a55b, writer nvidia/nemotron-3.5-super-vl-120b-a12b, verifier nvidia/nemotron-3.5-lightning-30b-a3b.

The Zetaris statement that checked every quote:

```sql
SELECT q.qid
FROM VALUES
    ('7', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f:p1:0', 'subjectsthatdidnotnapshowednosignificantperformanceimprovement'),
    ('4', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f:p5:2', 'daytimewakewithlearningeffectorimmobilizationnegatingcorrespondinglimbinterferencehenceofferingtheopportunityforconsolidationnotonlyresultintheabsenceofanymemoryimprovementbutcanproducelearningdeteriorations')
  AS q(qid, doc, pid, qkey)
JOIN konkyo.konkyo_pdf_text t ON t.doc_id = q.doc
WHERE instr(t.p, q.qkey) > 0
```

_Trace: examples/03-wrong-premise/trace.jsonl (16 steps)_
