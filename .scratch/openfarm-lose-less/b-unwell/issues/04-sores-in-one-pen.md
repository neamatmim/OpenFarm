# 04 — Sores in one Pen tell the Owner

**What to build:** When K animals in one Pen are seen with `mouth_foot_sores` within H hours, the Owner and the Manager
are told at once. The words say what was seen, never a disease.

**Blocked by:** 01

**Status:** done, 2026-09-30.

- [x] **Notice** `pen_sores_seen`: immediate (push, not at night, no SMS), Owner + Manager, urgent in the app's list,
      leading to the Observations page. Facts: the Pen, how many animals, since which day. Words: "3 animals in {pen}
      seen with sores on the mouth or feet since…" / "…পশুর মুখে বা ক্ষুরে ঘা দেখা গেছে"; the push says to ring the Vet
      and keep the Pen apart. No disease named.
- [x] **Sweep:** `tellAboutSores` in `theSweep`, beside the missing animals, pushed there. `soresInPens`
      (`sores-store.ts`): standing sore Observations within the hours, each animal once, by the Pen she stands in now,
      only animals still on the farm. Told once per Pen and first sighting in the window (`entityId` = Pen + that
      Observation), so more seen in the same Pen are not told again; told again only after the window has moved past it.
- [x] **Farm Parameters:** `sores_tell_animals` (3) and `sores_tell_hours` (48), the Manager's to set (the running of the
      farm, not the Owner's alone); group "Sores in one Pen".
- [x] **Report without a round:** "Sores on mouth or feet" added to the words anybody may report (`OBSERVATION_WORDS`).
- [x] **Glossary:** **Observation** says so, and that naming the disease is the Vet's.
- [x] **Tests** (`routers/sores-in-a-pen.test.ts`, 4): at once; two animals nothing, the third tells Owner and Manager,
      a fourth next morning not again; one animal three times nothing, three spread over five days nothing; the Manager's
      own number. **Proved by switching off** counting each animal once, the hours window, and the told-once key (each
      one red).
- [x] **Somebody opens it** (seed, 2026-09-30): sores reported on D-0056, D-0057, F-0014 in ষাঁড় পেন ক → the Today
      alerts lead with "৩০ সেপ্টেম্বর, ২০২৬ থেকে ষাঁড় পেন ক-এ ৩টি পশুর মুখে বা ক্ষুরে ঘা দেখা গেছে" and "যা দেখা গেছে
      খুলুন"; in English "3 animals in ষাঁড় পেন ক seen with sores…"; the parameters page shows 3 animals within 48
      hours.
