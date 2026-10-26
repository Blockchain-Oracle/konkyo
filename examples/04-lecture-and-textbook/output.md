# What are the stages of memory, and how does the lecture explain forgetting?

The lecture slides identify a three‑stage model of memory that includes sensory memory, short‑term memory, and long‑term memory [1]. The slides also list “passive forgetting vs. interference” and the specific types “proactive interference” and “retroactive interference” as topics within long‑term memory [2]. The textbook notes that forgetting can be caused by lapses in attention [3] and describes Ebbinghaus’s forgetting curve showing rapid decay of new information over time [4].

**Caveat:** The passages do not provide a detailed lecture explanation of forgetting beyond listing interference types and noting attention lapses and decay.

## Sources (4)
_Each quote was found word for word in Zetaris's own reading of the source._

- [1] 8.1 How Memory Functions, p. 3
  > “Sensory Memory, Short-Term Memory, and finally Long-Term Memory”
- [2] Lecture 10: Memory I (slides), p. 37
  > “passive forgetting vs. interference • proactive interference • retroactive interference”
- [3] 8.3 Problems with Memory, p. 7
  > “Forgetting caused by lapses in attention”
- [4] 8.3 Problems with Memory, p. 8
  > “Due to storage decay, an average person will lose 50% of the memorized information after 20 minutes and 70% of the information after 24 hours”

## Checks
- 4 quotes from 3 sources checked in one Zetaris statement; verifying, rewrites included, took 4.9 s; 0 rewritten, 0 dropped; 11.1 s in all.
- Models: planner nvidia/nemotron-3-ultra-550b-a55b, writer nvidia/nemotron-3-ultra-550b-a55b, verifier nvidia/nemotron-3-ultra-550b-a55b.

The Zetaris statement that checked every quote:

```sql
SELECT q.qid
FROM VALUES
    ('1', 'd04306b0-2fca-47fe-9f7b-e99072757a04', 'd04306b0-2fca-47fe-9f7b-e99072757a04:p3:1', 'sensorymemoryshorttermmemoryandfinallylongtermmemory'),
    ('2', 'cad1c0fd-6ade-4963-886d-e944829b137d', 'cad1c0fd-6ade-4963-886d-e944829b137d:p37:0', 'passiveforgettingvs.interferenceproactiveinterferenceretroactiveinterference'),
    ('3', 'ba228fe2-4bcc-4d5f-9974-6cd2fe043f07', 'ba228fe2-4bcc-4d5f-9974-6cd2fe043f07:p7:2', 'forgettingcausedbylapsesinattention'),
    ('4', 'ba228fe2-4bcc-4d5f-9974-6cd2fe043f07', 'ba228fe2-4bcc-4d5f-9974-6cd2fe043f07:p8:0', 'duetostoragedecayanaveragepersonwilllose50ofthememorizedinformationafter20minutesand70oftheinformationafter24hours')
  AS q(qid, doc, pid, qkey)
JOIN konkyo.konkyo_pdf_text t ON t.doc_id = q.doc
WHERE instr(t.p, q.qkey) > 0
```

_Trace: examples/04-lecture-and-textbook/trace.jsonl (8 steps)_
