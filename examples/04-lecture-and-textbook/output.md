# What are the stages of memory, and how does the lecture explain forgetting?

The Atkinson-Shiffrin model describes three distinct stages — Sensory Memory, Short-Term Memory, and Long-Term Memory — that information must pass through to be stored permanently [1]. Forgetting is explained by storage decay, with an average person losing 50% of memorized information after 20 minutes and 70% after 24 hours according to Ebbinghaus's forgetting curve [2]. Absentmindedness, caused by lapses in attention, is also identified as a memory error contributing to forgetting [2]. Interference effects such as proactive and retroactive interference are listed among long-term memory topics related to forgetting [3].

**Caveat:** The lecture slides list forgetting-related concepts but do not elaborate on their mechanisms; the transcript excerpt uses a punch-bowl metaphor but does not define stages or forgetting explicitly.

## Sources (3)
_Each quote was found word for word in Zetaris's own reading of the source._

- [1] 8.1 How Memory Functions, p. 3
  > “it has to pass through three distinct stages: Sensory Memory, Short-Term Memory, and finally Long-Term Memory”
- [2] 8.3 Problems with Memory, p. 8 _(sentence rewritten after the Verifier's check)_
  > “an average person will lose 50% of the memorized information after 20 minutes and 70% of the information after 24 hours”
- [3] Lecture 10: Memory I (slides), p. 37 _(sentence rewritten after the Verifier's check)_
  > “proactive interference • retroactive interference • memory for gist • flashbulb memories • false memories”

## What the Verifier sent back
- Round 1: [2] quote was not found in the document in Zetaris: "The Three--Stage Model of Memory Sensory Memory Rehearsal"
- Round 2: [5] quote was not found in the document in Zetaris: "The Three--Stage Model of Memory Sensory Memory Rehearsal"

## Checks
- 3 quotes from 3 sources checked in one Zetaris statement; verifying, rewrites included, took 38.6 s; 3 rewritten, 1 dropped; 50.0 s in all.
- Models: planner nvidia/nemotron-3-ultra-550b-a55b, writer nvidia/nemotron-3-ultra-550b-a55b, verifier nvidia/nemotron-3-ultra-550b-a55b.

The Zetaris statement that checked every quote:

```sql
SELECT q.qid
FROM VALUES
    ('1', 'd04306b0-2fca-47fe-9f7b-e99072757a04', 'd04306b0-2fca-47fe-9f7b-e99072757a04:p3:1', 'ithastopassthroughthreedistinctstagessensorymemoryshorttermmemoryandfinallylongtermmemory'),
    ('2', 'cad1c0fd-6ade-4963-886d-e944829b137d', 'cad1c0fd-6ade-4963-886d-e944829b137d:p15:0', 'thethreestagemodelofmemorysensorymemoryrehearsal'),
    ('3', 'ba228fe2-4bcc-4d5f-9974-6cd2fe043f07', 'ba228fe2-4bcc-4d5f-9974-6cd2fe043f07:p8:0', 'anaveragepersonwilllose50ofthememorizedinformationafter20minutesand70oftheinformationafter24hours'),
    ('4', 'cad1c0fd-6ade-4963-886d-e944829b137d', 'cad1c0fd-6ade-4963-886d-e944829b137d:p37:0', 'proactiveinterferenceretroactiveinterferencememoryforgistflashbulbmemoriesfalsememories')
  AS q(qid, doc, pid, qkey)
JOIN konkyo.konkyo_pdf_text t ON t.doc_id = q.doc
WHERE instr(t.p, q.qkey) > 0
```

_Trace: examples/04-lecture-and-textbook/trace.jsonl (14 steps)_
