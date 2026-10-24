# What are the stages of memory, and how does the lecture explain forgetting?

Memory has three stages: encoding, which inputs information into the memory system; storage, which retains encoded information; and retrieval, which brings information out of memory and into awareness [1].

The lecture explains forgetting as one part of memory’s fragile nature, and says memories can also become less accurate and distorted rather than remaining records of experience [2]. The passage says that as life goes on, experiences, thoughts, and feelings get mixed together in memory, and that subsequent experiences can change prior memories [3].

**Caveat:** The lecture passage discusses forgetting and memory distortion broadly but does not give a complete account of the mechanisms of forgetting.

## Sources (3)
_Each quote was found word for word in Zetaris's own reading of the source._

- [1] 8.1 How Memory Functions, p. 1
  > “Encoding involves the input of information into the memory system. Storage is the retention of the encoded information. Retrieval, or getting the information out of memory and back into awareness, is the third function.”
- [2] Lecture 10: Memory I (transcript), p. 1
  > “it turns out there's ways in which our memories get less accurate and distorted, are not actual records of our experience”
- [3] Lecture 10: Memory I (transcript), p. 2 _(sentence rewritten after the Verifier's check)_
  > “As life goes on, things get mixed in. And the raw memory is never recoverable from the mixture of subsequent experiences, thoughts, and feelings.”

## What the Verifier sent back
- Round 1: unsupported: "It describes forgetting as occurring as experiences, thoughts, and feelings mix together, with subsequent experiences able to change earlier memories [3]." (The passage links mixing to memory, but does not say mixing causes forgetting.)

## Checks
- 3 quotes from 2 sources checked in one Zetaris statement (8206 ms); 1 rewritten, 0 dropped; 13.4 s in all.
- Models: planner gpt-6-luna, writer gpt-6-luna, verifier gpt-6-luna.

The Zetaris statement that checked every quote:

```sql
SELECT q.qid
FROM VALUES
    ('1', 'd04306b0-2fca-47fe-9f7b-e99072757a04', 'd04306b0-2fca-47fe-9f7b-e99072757a04:p1:0', 'encodinginvolvestheinputofinformationintothememorysystem.storageistheretentionoftheencodedinformation.retrievalorgettingtheinformationoutofmemoryandbackintoawarenessisthethirdfunction.'),
    ('2', '3132be8c-ec00-4973-a501-f9e7fa5e004e', '3132be8c-ec00-4973-a501-f9e7fa5e004e:p1:0', 'itturnsoutthereswaysinwhichourmemoriesgetlessaccurateanddistortedarenotactualrecordsofourexperience'),
    ('4', '3132be8c-ec00-4973-a501-f9e7fa5e004e', '3132be8c-ec00-4973-a501-f9e7fa5e004e:p2:0', 'aslifegoesonthingsgetmixedin.andtherawmemoryisneverrecoverablefromthemixtureofsubsequentexperiencesthoughtsandfeelings.')
  AS q(qid, doc, pid, qkey)
JOIN konkyo.konkyo_pdf_text t ON t.doc_id = q.doc
WHERE instr(t.p, q.qkey) > 0
```

_Trace: examples/04-lecture-and-textbook/trace.jsonl (11 steps)_
