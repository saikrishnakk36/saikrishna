# Invention Disclosure — Hardware Root-of-Trust (HRoT) Soft IP

> Confidential — Avecas Technologies. Do not disclose outside the firm except to a patent agent under NDA.
> Fill every section. The patent agent drafts the provisional from this; gaps here = weak claims.

## 1. Administrative
- **Title of invention:** (working) _A hardware root-of-trust architecture for …_
- **Inventors (full legal name, address, nationality, % contribution):**
- **Assignee:** Avecas Technologies (confirm signed assignment from each inventor)
- **Date of conception:**
- **Date RTL first functional:**
- **Any prior public disclosure?** (paper / conf / pitch deck / datasheet / customer demo / GitHub) — list each with date. **Critical for novelty.**

## 2. The problem (prior-art gap)
- What limitation in existing HRoT IP (e.g. ARM TrustZone-adjacent roots, OpenTitan, commercial secure enclaves) does this solve?
- Why do current solutions fall short — on area, power, boot-time, attack surface, side-channel resistance, key-management, attestation latency?

## 3. The invention — technical core
- One-paragraph plain statement of what is new.
- Block diagram (attach). Name every sub-block: secure boot engine, key store / PUF, crypto accelerators, entropy source / TRNG, lifecycle/debug controller, secure bus/firewall, attestation engine, anti-tamper, etc.
- **What specifically is novel** vs. prior art — the mechanism, not the function. (e.g. a particular key-provisioning handshake, a boot-chain verification scheme, a fault/glitch-detection structure, an isolation mechanism.)

## 4. The measurable technical effect  ← this defeats §3(k)
Quantify vs. a named baseline:
- Boot/attestation latency: ____ vs ____
- Area (gate count / µm² at node ___): ____ vs ____
- Power (secure-boot energy, idle): ____ vs ____
- Security property gained (side-channel margin, fault-injection resistance, measured): ____
- Any other PPA or security metric with before/after numbers.

## 5. How it works (enablement)
- Step-by-step operation (boot sequence, key lifecycle, attestation flow, tamper response).
- State machines / protocols that are part of the novelty.
- Parameters/configurability (key sizes, crypto suites, bus widths).

## 6. Alternative embodiments (broadens claims)
- Other ways to implement the novel mechanism (different crypto primitive, different bus, FPGA vs ASIC, soft vs firmware-assisted).

## 7. Claim seeds (agent will formalize)
- Independent claim idea 1 (system): _A hardware root-of-trust comprising … characterized by …_
- Independent claim idea 2 (method): _A method, performed in hardware, of … comprising the steps of …_
- Dependent claim ideas (the configurable/optional features from §5–6).

## 8. Closest known prior art (list patents, products, papers you know of)

## 9. Commercial context
- Target customers / applications (automotive, IoT SoC, RISC-V SoC security subsystem).
- Standards touched (e.g. TCG DICE, FIPS 140-3, Common Criteria, RISC-V security spec).
- Is any part standard-mandated (→ possible SEP) vs. proprietary differentiation?

## 10. Trade-secret carve-out
- Which parts will you NOT disclose in the patent and keep as trade secret (verification env, synthesis recipe, specific key-ceremony tooling)? Note them so the agent keeps them out of the spec.
