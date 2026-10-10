# Invention Disclosure — Network-on-Chip (NoC) Soft IP

> Confidential — Avecas Technologies. Do not disclose outside the firm except to a patent agent under NDA.
> Fill every section. The patent agent drafts the provisional from this; gaps here = weak claims.

## 1. Administrative
- **Title of invention:** (working) _A network-on-chip interconnect architecture for …_
- **Inventors (full legal name, address, nationality, % contribution):**
- **Assignee:** Avecas Technologies (confirm signed assignment from each inventor)
- **Date of conception:**
- **Date RTL first functional:**
- **Any prior public disclosure?** (paper / conf / pitch deck / datasheet / customer demo / repo) — list each with date. **Critical for novelty.**

## 2. The problem (prior-art gap)
- What limitation in existing NoC IP (Arteris, NetSpeed-style, Arm NIC-400/CMN, open NoCs) does this solve?
- Falls short on: latency, throughput/bisection bandwidth, area/wire congestion, power, QoS, scalability, coherency support, configurability?

## 3. The invention — technical core
- One-paragraph plain statement of what is new.
- Topology + microarchitecture diagram (attach). Name: topology (mesh/ring/torus/custom), router microarchitecture, arbitration, flow-control (wormhole/VC), buffering, QoS/arbitration scheme, clock-domain crossing, coherency/ordering support.
- **What specifically is novel** — the mechanism (e.g. a routing/arbitration scheme, a congestion-avoidance structure, a power-gating-aware routing, a specific VC-allocation method, a deadlock-avoidance technique, a latency-reduction microarchitecture).

## 4. The measurable technical effect  ← this defeats §3(k)
Quantify vs. a named baseline NoC:
- Average/worst-case latency (cycles) at given injection rate: ____ vs ____
- Saturation throughput / bisection bandwidth: ____ vs ____
- Area at node ___ (router + links): ____ vs ____
- Dynamic/leakage power: ____ vs ____
- Congestion / buffer utilization improvement: ____
- Any PPA metric with before/after numbers and the traffic pattern used.

## 5. How it works (enablement)
- Packet/flit format, routing algorithm, arbitration, flow control, QoS handling — step by step.
- State machines / protocols that are part of the novelty.
- Deadlock/livelock-freedom argument if the routing is novel.
- Configurability (node count, VC count, link width, topology generation).

## 6. Alternative embodiments (broadens claims)
- Other topologies, buffer schemes, arbitration policies the novel mechanism applies to; synchronous vs GALS; FPGA vs ASIC.

## 7. Claim seeds (agent will formalize)
- Independent claim idea 1 (system): _A network-on-chip comprising a plurality of routers … characterized by …_
- Independent claim idea 2 (method): _A method of routing/arbitrating in a network-on-chip comprising …_
- Dependent claim ideas (configurable/optional features from §5–6).

## 8. Closest known prior art (list patents, products, papers you know of)

## 9. Commercial context
- Target customers / applications (RISC-V multicore SoC, AI accelerator fabric, automotive).
- Standards touched (AXI/ACE/CHI interfaces, coherency protocols).
- Interface-standard-mandated parts vs. proprietary differentiation.

## 10. Trade-secret carve-out
- Which parts to keep as trade secret (NoC generator/compiler tooling, verification env, floorplan-aware synthesis recipe) and keep out of the spec.
