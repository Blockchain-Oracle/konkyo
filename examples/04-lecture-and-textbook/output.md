# What are the stages of memory, and how does the lecture explain forgetting?

The lecture explains forgetting as memory being fragile, where we forget things and where our memories get less accurate and distorted rather than being actual records of experience [1].

**Caveat:** The sources name sensory memory and long-term memory explicitly but do not clearly identify the third stage beyond the repeated phrase "Sensory Memory Rehearsal."

## Sources (1)
_Each quote was found word for word in Zetaris's own reading of the source._

- [1] Lecture 10: Memory I (transcript), p. 1
  > “it turns out there's ways in which our memories get less accurate and distorted, are not actual records of our experience but rather interpretations or our memory of our memory. And we'll talk about experiments that reveal that.”

## What the Verifier sent back
- Round 1: [3] quote was not found in the document in Zetaris: "The Three--Stage Model of Memory Sensory Memory Rehearsal"
- Round 1: unsupported: "The three stages of memory are sensory memory, rehearsal, and long-term memory [3]." (The cited passage [3] only provides the title "The Three--Stage Model of Memory Sensory Memory Rehearsal" and does not state or list the three stages as sensory memory, rehearsal, and long-term memory. The title mentions only sensory memory and rehearsal, and does not mention long-term memory. Therefore, the passage does not support the claim.)
- Round 2: [3] quote was not found in the document in Zetaris: "The Three--Stage Model of Memory Sensory Memory Rehearsal"
- Round 2: unsupported: "The three stages of memory are sensory memory, rehearsal, and long-term memory [3]." (The cited passage [3] only provides the title "The Three--Stage Model of Memory Sensory Memory Rehearsal" and does not state or list the three stages as sensory memory, rehearsal, and long-term memory. The title mentions only sensory memory and rehearsal, and does not mention long-term memory. Therefore, the passage does not support the claim.)

## Checks
- 1 quote from 1 source checked in one Zetaris statement; verifying, rewrites included, took 10.8 s; 0 rewritten, 1 dropped; 15.4 s in all.
- Models: planner nvidia/nemotron-3.5-lightning-30b-a3b, writer nvidia/nemotron-3.5-super-vl-120b-a12b, verifier nvidia/nemotron-3.5-lightning-30b-a3b.

The Zetaris statement that checked every quote:

```sql
SELECT q.qid
FROM VALUES
    ('3', 'cad1c0fd-6ade-4963-886d-e944829b137d', 'cad1c0fd-6ade-4963-886d-e944829b137d:p6:0', 'thethreestagemodelofmemorysensorymemoryrehearsal'),
    ('4', '3132be8c-ec00-4973-a501-f9e7fa5e004e', '3132be8c-ec00-4973-a501-f9e7fa5e004e:p1:0', 'itturnsoutthereswaysinwhichourmemoriesgetlessaccurateanddistortedarenotactualrecordsofourexperiencebutratherinterpretationsorourmemoryofourmemory.andwelltalkaboutexperimentsthatrevealthat.')
  AS q(qid, doc, pid, qkey)
JOIN konkyo.konkyo_pdf_text t ON t.doc_id = q.doc
WHERE instr(t.p, q.qkey) > 0
```

_Trace: examples/04-lecture-and-textbook/trace.jsonl (16 steps)_
