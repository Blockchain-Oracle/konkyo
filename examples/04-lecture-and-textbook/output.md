# What are the stages of memory, and how does the lecture explain forgetting?

The three stages of memory are sensory memory, short-term memory, and long-term memory [1]. Forgetting is explained by the Ebbinghaus forgetting curve, which shows memory for new information decays quickly and then levels out [2]. An average person loses 50% of memorized information after 20 minutes and 70% after 24 hours due to storage decay [2].

**Caveat:** The sources do not detail other theories of forgetting beyond Ebbinghaus's storage decay model.

## Sources (2)
_Each quote was found word for word in Zetaris's own reading of the source._

- [1] 8.1 How Memory Functions, p. 3
  > “Sensory Memory, Short-Term Memory, and finally Long-Term Memory. These stages were first proposed by Richard Atkinson and Richard Shiffrin (1968).”
- [2] 8.3 Problems with Memory, p. 8
  > “Due to storage decay, an average person will lose 50% of the memorized information after 20 minutes and 70% of the information after 24 hours (Ebbinghaus, 1885/1964). Your memory for new information decays quickly and then eventually levels out.”

## What the Verifier sent back
- Round 1: [2] quote was not found in the document in Zetaris: "The Three--Stage Model of Memory Sensory Memory Rehearsal Image by MIT OpenCourseWare."
- Round 1: [10] quote was not found in the document in Zetaris: "Ebbinghaus’’ Curve of Forgetting Days since learning 9 hours 1 hour 20 minutes Immediate recall Image by MIT OpenCourseWare."
- Round 2: [13] quote was not found in the document in Zetaris: "The Three--Stage Model of Memory Sensory Memory Rehearsal Image by MIT OpenCourseWare."
- Round 2: [14] quote was not found in the document in Zetaris: "Ebbinghaus Curve of Forgetting Days since learning 9 hours 1 hour 20 minutes Immediate recall Image by MIT OpenCourseWare."

## Checks
- 2 quotes from 2 sources checked in one Zetaris statement; verifying, rewrites included, took 48.1 s; 0 rewritten, 2 dropped; 57.7 s in all.
- Models: planner nvidia/nemotron-3-ultra-550b-a55b, writer nvidia/nemotron-3-ultra-550b-a55b, verifier nvidia/nemotron-3-ultra-550b-a55b.

The Zetaris statement that checked every quote:

```sql
SELECT q.qid
FROM VALUES
    ('4', 'd04306b0-2fca-47fe-9f7b-e99072757a04', 'd04306b0-2fca-47fe-9f7b-e99072757a04:p3:1', 'sensorymemoryshorttermmemoryandfinallylongtermmemory.thesestageswerefirstproposedbyrichardatkinsonandrichardshiffrin1968.'),
    ('2', 'cad1c0fd-6ade-4963-886d-e944829b137d', 'cad1c0fd-6ade-4963-886d-e944829b137d:p15:0', 'thethreestagemodelofmemorysensorymemoryrehearsalimagebymitopencourseware.'),
    ('12', 'ba228fe2-4bcc-4d5f-9974-6cd2fe043f07', 'ba228fe2-4bcc-4d5f-9974-6cd2fe043f07:p8:0', 'duetostoragedecayanaveragepersonwilllose50ofthememorizedinformationafter20minutesand70oftheinformationafter24hoursebbinghaus18851964.yourmemoryfornewinformationdecaysquicklyandtheneventuallylevelsout.'),
    ('10', 'cad1c0fd-6ade-4963-886d-e944829b137d', 'cad1c0fd-6ade-4963-886d-e944829b137d:p53:0', 'ebbinghauscurveofforgettingdayssincelearning9hours1hour20minutesimmediaterecallimagebymitopencourseware.')
  AS q(qid, doc, pid, qkey)
JOIN konkyo.konkyo_pdf_text t ON t.doc_id = q.doc
WHERE instr(t.p, q.qkey) > 0
```

_Trace: examples/04-lecture-and-textbook/trace.jsonl (16 steps)_
