# What are the stages of memory, and how does the lecture explain forgetting?

The stages of memory are sensory memory, short-term memory, and long-term memory [1]. The lecture compares memory to ingredients blended together that can no longer be retrieved separately [2].

**Caveat:** The lecture passage gives these metaphors but does not explain specific causes of forgetting.

## Sources (2)
_Each quote was found word for word in Zetaris's own reading of the source._

- [1] 8.1 How Memory Functions, p. 3
  > “Sensory Memory, Short-Term Memory, and finally Long-Term Memory”
- [2] Lecture 10: Memory I (transcript), p. 1 _(sentence rewritten after the Verifier's check)_
  > “you can no more get the specific milk, or the specific orange juice”

## What the Verifier sent back
- Round 1: unsupported: "The lecture describes forgetting as sometimes being unable to access a memory without the right cue or path, and also compares memory to ingredients blended together that can no longer be retrieved separately [2]." (The passage compares blended ingredients to memory but does not say they represent forgetting.)

## Checks
- 2 quotes from 2 sources checked in one Zetaris statement; verifying, rewrites included, took 8.5 s; 1 rewritten, 0 dropped; 19.0 s in all.
- Models: planner nvidia/nemotron-3-ultra-550b-a55b, writer gpt-6-luna, verifier gpt-6-luna.

The Zetaris statement that checked every quote:

```sql
SELECT q.qid
FROM VALUES
    ('1', 'd04306b0-2fca-47fe-9f7b-e99072757a04', 'd04306b0-2fca-47fe-9f7b-e99072757a04:p3:1', 'sensorymemoryshorttermmemoryandfinallylongtermmemory'),
    ('3', '3132be8c-ec00-4973-a501-f9e7fa5e004e', '3132be8c-ec00-4973-a501-f9e7fa5e004e:p1:1', 'youcannomoregetthespecificmilkorthespecificorangejuice')
  AS q(qid, doc, pid, qkey)
JOIN konkyo.konkyo_pdf_text t ON t.doc_id = q.doc
WHERE instr(t.p, q.qkey) > 0
```

_Trace: examples/04-lecture-and-textbook/trace.jsonl (14 steps)_
