# Avecas Soft IP Filing — Action Plan (HRoT + NoC)

**Owner:** Sai Krishna / Avecas Technologies
**Entity status:** DPIIT-recognized Startup → eligible for 80% fee rebate + Form 18A expedited examination
**Cores in this batch:** (1) Hardware Root-of-Trust (HRoT) soft IP, (2) Network-on-Chip (NoC) soft IP
**Jurisdiction:** Indian Patent Office — Chennai branch (territorial for Hyderabad)

---

## The protection stack for each core (do all four)

| Layer | Protects | Instrument | When |
|---|---|---|---|
| Architecture / method | The inventive concept (survives re-coding) | **Patent** (provisional now → complete in 12 mo) | Start now |
| RTL source code | Literal expression (copying the HDL) | **Copyright**, Form XIV | After design freeze |
| Unreleased source, testbench, scripts, know-how | Everything not disclosed | **Trade secret** (NDA + access control + IEEE-1735 delivery) | Ongoing |
| Hardened layout (only if/when a customer hardens on a node) | Physical topography | **SICLD** | Not now — ignore until hardening |

> §3(k) note for both cores: claim them as **hardware systems / hardware-implemented methods with a measurable technical effect** (lower power, lower latency, higher throughput, smaller area, security property). Never claim "an algorithm." This is where a weak draft dies.

---

## This week — concrete steps

- [ ] **Step 1 (today): Fill the invention disclosures.** Use `01-DISCLOSURE-HRoT.md` and `02-DISCLOSURE-NoC.md`. Get your lead engineer on each core to complete the technical sections. This is the only thing blocking a provisional filing.
- [ ] **Step 2: Resolve ownership.** Confirm every contributing engineer has a signed IP-assignment to Avecas. If any HRoT/NoC contributor is a BITS-affiliated researcher or the work overlaps your PhD, clear the BITS IP policy **before filing** (see risk note below).
- [ ] **Step 3: Engage a VLSI-literate patent agent.** Not a generalist. Shortlist 2–3 Hyderabad/Chennai firms with EE/semiconductor drafting experience. Send them the completed disclosures under NDA. (I can build this shortlist + a vetting checklist — ask me.)
- [ ] **Step 4: File provisional(s).** Agent drafts Form 2 provisional spec per core; you file Form 1 + Form 2 + Form 3 + Form 26 + Form 28 (startup) online. Locks priority date cheaply.
- [ ] **Step 5: Clear Foreign Filing License (FFL)** before any foreign filing, since inventors are India-resident (Patents Act §39). Either file India-first and wait 6 weeks, or get the FFL. Route via the agent.

## Fees (DPIIT startup / small-entity slab, e-filing, per application)

- Provisional/complete filing: ~₹1,600
- Request for examination (Form 18A expedited): ~₹8,000 (startup slab)
- Agent drafting (good VLSI spec): ~₹60k–₹1.5L per core — **do not cheap out here**
- Copyright registration (Form XIV): ~₹500 per work

## Deadlines to put on the calendar once you file

- **+6 weeks** from Indian provisional → FFL window clears for foreign filing
- **+12 months** → complete specification (Form 2) must be filed; also the Paris/PCT foreign-filing window closes
- **+18 months** → automatic publication (or file Form 9 for early publication)
- **+31 months** (if PCT) → national-phase entry deadlines
- **Annual renewals** from year 3 after grant

## Decision per core: patent vs. trade secret

Both HRoT and NoC architectures are **visible in the delivered/synthesized product**, so a competitor can reverse-engineer them → **patent them.** Keep the *construction method, verification environment, and synthesis/constraint recipes* as **trade secret** (not shipped). Run both tracks in parallel.

## ⚠️ Risk to close before filing

1. **Ownership chain** — any unassigned contributor creates a co-ownership dispute. Fix firm-wide IP-assignment clauses now.
2. **PhD / BITS overlap** — if either core draws on BITS-funded research, the institute may claim rights. Get written clarification first.
3. **Prior public disclosure** — if either core was shown at a conference, in a paper, a pitch deck, a datasheet, or to a customer without NDA, your novelty may already be compromised. India has no general grace period — **file before any further disclosure.** Tell the agent about every prior disclosure.
