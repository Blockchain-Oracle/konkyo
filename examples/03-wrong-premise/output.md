# Why did Nishida and Walker find that a daytime nap made motor memory worse?

No: the paper reports that the nap group expressed a highly significant consolidation enhancement compared with the no‑nap group [1]. The non‑nap group showed no significant improvement, while nappers improved significantly across the 8‑hour delay [2].

## Sources (2)
_Each quote was found word for word in Zetaris's own reading of the source._

- [1] Nishida and Walker · 2007, Daytime Naps, Motor Memory Consolidation and Regionally Specific Sleep Spindles, p. 1 _(sentence rewritten after the Verifier's check)_
  > “At testing, subjects that did not nap showed no significant performance improvement, yet those that did nap expressed a highly significant consolidation enhancement.”
- [2] Nishida and Walker · 2007, Daytime Naps, Motor Memory Consolidation and Regionally Specific Sleep Spindles, p. 2 _(sentence rewritten after the Verifier's check)_
  > “Specifically, performance in the no-nap group changed from 22.0 seq/trial (post-training) to 22.8 seq/trial (test; paired t-test t(11) = 0.80, p = 0.44), representing a non-significant 3.8% (0.8 seq/trial) increase at later testing (p = 0.29; Figure 2a).”

## What the Verifier sent back
- Round 1: [1] has no source line naming one of the given passages
- Round 1: [8] has no source line naming one of the given passages
- Round 1: unsupported: "No: the paper reports that the nap group expressed a highly significant consolidation enhancement compared with the no‑nap group [1]." (The claim states that 'the paper reports that the nap group expressed a highly significant consolidation enhancement compared with the no‑nap group' and cites '[1]', but no passage is provided for citation [1]. Without a cited passage, the factual assertion cannot be verified and therefore is not supported.)
- Round 1: unsupported: "The non‑nap group showed no significant improvement, while nappers improved significantly across the 8‑hour delay [8]." (The claim states that 'The non‑nap group showed no significant improvement, while nappers improved significantly across the 8‑hour delay' and cites '[8]', but no passage is provided for citation [8]. Without a cited passage, the factual assertion cannot be verified and therefore is not supported.)

## Checks
- 2 quotes from 1 source checked in one Zetaris statement; verifying, rewrites included, took 40.9 s; 2 rewritten, 0 dropped; 48.4 s in all.
- Models: planner nvidia/nemotron-3-ultra-550b-a55b, writer nvidia/nemotron-3-ultra-550b-a55b, verifier nvidia/nemotron-3-ultra-550b-a55b.

The Zetaris statement that checked every quote:

```sql
SELECT q.qid
FROM VALUES
    ('1', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f:p1:0', 'attestingsubjectsthatdidnotnapshowednosignificantperformanceimprovementyetthosethatdidnapexpressedahighlysignificantconsolidationenhancement.'),
    ('2', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f', 'c82eb252-2ceb-4ba1-bd91-5cf985ab660f:p2:2', 'specificallyperformanceinthenonapgroupchangedfrom22.0seqtrialposttrainingto22.8seqtrialtestpairedttestt110.80p0.44representinganonsignificant3.80.8seqtrialincreaseatlatertestingp0.29figure2a.')
  AS q(qid, doc, pid, qkey)
JOIN konkyo.konkyo_pdf_text t ON t.doc_id = q.doc
WHERE instr(t.p, q.qkey) > 0
```

_Trace: examples/03-wrong-premise/trace.jsonl (11 steps)_
