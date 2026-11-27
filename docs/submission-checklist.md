# HydroGrid competition submission checklist

The competition brief governs this checklist. Keep workshop details and participant information in the organizer’s official form. Use a signed-out browser to check that each submitted link is public.

## Engineering gates

| Gate | Current status | Evidence |
| --- | --- | --- |
| A · Correctness | Passed locally | Fresh Compose, 24 Maven tests, 17 browser/API tests, and two four-case logout batches. [Test report](testing.md) |
| B · Security | Passed for the reviewed prototype scope | Workspace isolation, scoped authentication, credential scan and dependency review. Remaining advisory prerequisites and risk are recorded. [Security review](security.md) |
| C · Product demonstration | Passed | Verified public release and complete synthetic walkthrough. [Deployment](deployment.md) · [Showcase](showcase.md) |
| D · Evidence integrity | Passed for available records | All eight stages, primary records, and inherited model settings documented. [Codex Evidence Pack](evidence/CODEX_EVIDENCE_PACK.md) |
| E · Reproducibility | Passed locally | Fresh isolated Compose, tested commands, accessibility and nine reproducible scenarios. [Setup](setup.md) · [Benchmarks](benchmarks.md) |
| F · Submission | Deployment and public branch evidence verified | Confirm the official form, eligibility, and the public Evidence Pack URL that will be submitted. |

## Package to review

- [ ] Confirm the final review branch and exact commit. Inspect the file list, secret checks, CI and review disposition before approving the PR.
- [ ] Open the [repository](https://github.com/Manu577228/HydroGrid), [live app](https://hydrogrid-demo-7v9f.onrender.com/), [Codex evidence index](judging.md) and [reproducible local setup](setup.md).
- [ ] Match the hosted app to the SHA or tree in the release verification record. Keep the live release SHA distinct from newer submission documentation if they differ.
- [ ] In a signed-out tab, complete the [guest judge walkthrough](demo.md) with synthetic data. A free-host cold wake is excluded from the walkthrough timing.
- [ ] Review the [benchmark tradeoffs](benchmarks.md), [source terms](attribution.md) and published limits. Confirm the deck, form and video describe the exercise and sampled data accurately.
- [ ] Confirm the public images and media show no private participant details, private codes, actual device positions, or operator data. [Gallery](showcase.md) · [Recording checklist](demo-script.md)
- [ ] If a demo video link is used, test public playback in the browser where judges will open it.

## Participant approval and final entry

- [ ] Confirm the official entry form and deadline from the workshop organizer. Confirm eligibility, solo participation, workshop attendance date, and registered email directly with the organizer.
- [ ] Approve any push or merge before it happens. After merge, replace any review-branch references with the final public Evidence Pack and confirm the link while signed out.
- [ ] Confirm creator credit and the scope of the project copyright notice. Third-party data and package terms still apply. [Copyright notice](../COPYRIGHT.md) · [Attribution](attribution.md)
- [ ] Enter the project title **HydroGrid — Real-Time Disaster Response and Rescue Coordination Platform** and final public URLs. Submit from the official entry form when you are satisfied with the evidence.
