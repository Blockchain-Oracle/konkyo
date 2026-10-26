# What are the stages of memory, and how does the lecture explain forgetting?

Memory functions through encoding, storage, and retrieval processes as described in the textbook [1]. The lecture identifies transience as a forgetting error where memories fade over time due to storage decay [2]. Ebbinghaus's forgetting curve demonstrates that memory for new information decays quickly and then levels out, with 50% loss after 20 minutes and 70% after 24 hours [3]. Absentmindedness is described as lapses in memory caused by breaks in attention or focus being elsewhere [4]. Proactive and retroactive interference are listed as mechanisms of forgetting alongside passive forgetting [5].

**Caveat:** The passages provide limited detail on the specific mechanisms of each memory stage and do not fully explain how interference processes operate compared to decay.

## Sources (5)
_Each quote was found word for word in Zetaris's own reading of the source._

- [1] 8.1 How Memory Functions, p. 1 _(sentence rewritten after the Verifier's check)_
  > “Memory is the set of processes used to encode, store, and retrieve information over different periods of time”
- [2] 8.3 Problems with Memory, p. 7
  > “Let's look at the first sin of the forgetting errors: transience, which means that memories can fade over time”
- [3] 8.3 Problems with Memory, p. 8
  > “Due to storage decay, an average person will lose 50% of the memorized information after 20 minutes and 70% of the information after 24 hours”
- [4] 8.3 Problems with Memory, p. 8
  > “absentmindedness, which describes lapses in memory caused by breaks in attention or our focus being somewhere else”
- [5] Lecture 10: Memory I (slides), p. 37 _(sentence rewritten after the Verifier's check)_
  > “passive forgetting vs. interference • proactive interference • retroactive interference”

## What the Verifier sent back
- Round 1: [1] quote was not found in the document in Zetaris: "The Three--Stage Model of Memory Sensory Memory Rehearsal Image by MIT OpenCourseWare."
- Round 2: [7] quote was not found in the document in Zetaris: "The Three--Stage Model of Memory Sensory Memory Rehearsal Image by MIT OpenCourseWare."
- Round 2: [8] quote was not found in the document in Zetaris: "The Three--Stage Model of Memory Sensory Memory Rehearsal Image by MIT OpenCourseWare."
- Round 2: [9] quote was not found in the document in Zetaris: "The Three--Stage Model of Memory Sensory Memory Rehearsal Image by MIT OpenCourseWare."
- Round 2: unsupported: "The three-stage model of memory includes sensory memory and rehearsal processes according to multiple lecture slides [7][8][9][4]." (Passages 7, 8, and 9 only show a slide title/image caption ('The Three--Stage Model of Memory Sensory Memory Rehearsal') but do not describe the model's stages or confirm that sensory memory and rehearsal processes are components of it. Passage 4 discusses Ebbinghaus's forgetting curve and storage decay, which is unrelated to the three-stage model's structure.)

## Checks
- 5 quotes from 3 sources checked in one Zetaris statement; verifying, rewrites included, took 33.3 s; 2 rewritten, 1 dropped; 42.3 s in all.
- Models: planner nvidia/nemotron-3-ultra-550b-a55b, writer nvidia/nemotron-3-ultra-550b-a55b, verifier nvidia/nemotron-3-ultra-550b-a55b.

The Zetaris statement that checked every quote:

```sql
SELECT q.qid
FROM VALUES
    ('1', 'cad1c0fd-6ade-4963-886d-e944829b137d', 'cad1c0fd-6ade-4963-886d-e944829b137d:p15:0', 'thethreestagemodelofmemorysensorymemoryrehearsalimagebymitopencourseware.'),
    ('2', 'd04306b0-2fca-47fe-9f7b-e99072757a04', 'd04306b0-2fca-47fe-9f7b-e99072757a04:p1:0', 'memoryisthesetofprocessesusedtoencodestoreandretrieveinformationoverdifferentperiodsoftime'),
    ('3', 'ba228fe2-4bcc-4d5f-9974-6cd2fe043f07', 'ba228fe2-4bcc-4d5f-9974-6cd2fe043f07:p7:1', 'letslookatthefirstsinoftheforgettingerrorstransiencewhichmeansthatmemoriescanfadeovertime'),
    ('4', 'ba228fe2-4bcc-4d5f-9974-6cd2fe043f07', 'ba228fe2-4bcc-4d5f-9974-6cd2fe043f07:p8:0', 'duetostoragedecayanaveragepersonwilllose50ofthememorizedinformationafter20minutesand70oftheinformationafter24hours'),
    ('5', 'ba228fe2-4bcc-4d5f-9974-6cd2fe043f07', 'ba228fe2-4bcc-4d5f-9974-6cd2fe043f07:p8:0', 'absentmindednesswhichdescribeslapsesinmemorycausedbybreaksinattentionorourfocusbeingsomewhereelse'),
    ('6', 'cad1c0fd-6ade-4963-886d-e944829b137d', 'cad1c0fd-6ade-4963-886d-e944829b137d:p37:0', 'passiveforgettingvs.interferenceproactiveinterferenceretroactiveinterference')
  AS q(qid, doc, pid, qkey)
JOIN konkyo.konkyo_pdf_text t ON t.doc_id = q.doc
WHERE instr(t.p, q.qkey) > 0
```

_Trace: examples/04-lecture-and-textbook/trace.jsonl (15 steps)_
