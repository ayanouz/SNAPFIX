# AI safety policy

SNAPFIX is a **triage and decision-support tool**, not an emergency service, a certified inspection, or a substitute for a qualified professional.

The model is treated as an untrusted content generator. Safety decisions are made by deterministic code.

## 1. Non-negotiable rules

1. **Never claim to see what was not observed.** Observations must state whether they come from a photo, the user's text, or context.
2. **Never present a hypothesis as a confirmed diagnosis.** Possible causes are labelled as hypotheses with confidence and a verification method.
3. **Never invent a price.** The model is not allowed to output cost ranges. Estimates come only from verified reference data.
4. **Safety overrides the model.** If a hazard is detected, SNAPFIX escalates and removes DIY repair guidance even when the model says the repair is safe.
5. **No dangerous DIY instructions.** Bypassing safety devices, working live, opening pressurised systems, or similar instructions are rejected or removed.
6. **Professional help is a valid outcome.** The app must be willing to say “do not repair this yourself”.
7. **Emergency situations are not repair tasks.** The UI directs users to emergency services or a qualified professional.

## 2. Pipeline

```text
User description + photos
        │
        ▼
Prompt (strict JSON, evidence labels, forbidden advice)
        │
        ▼
AI provider (untrusted output)
        │
        ▼
JSON extraction + Zod validation
        │
        ▼
Base analysis with provider metadata
        │
        ▼
Deterministic safety policy (server, authoritative)
  ├─ hazard regexes in EN/FR/AR
  ├─ identified-type rules
  ├─ unsafe-instruction detection
  ├─ risk ranking
  ├─ escalation / stop guidance
  └─ removal of DIY options
        │
        ▼
Deterministic cost estimator (verified references only)
        │
        ▼
Final schema validation + persistence
        │
        ▼
Client validation + re-application of safety policy
        │
        ▼
UI with safety banner, hypotheses, checks, options
```

## 3. Hazard rules

The safety module matches English, French, and Arabic text. The exact patterns live in `src/domain/diagnosis/safety.ts`; the table summarizes the policy.

| Code                | Typical triggers                                               | Risk     | Result                                                                         |
| ------------------- | -------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| `gas_leak`          | gas smell/leak, “fuite de gaz”, رائحة غاز                      | critical | stop, evacuate/ventilate only if safe, contact gas supplier/emergency services |
| `carbon_monoxide`   | CO, CO alarm/detector, monoxyde de carbone                     | critical | fresh air, emergency services, do not re-enter                                 |
| `fire_smoke`        | fire, flames, smoke, incendie, fumée, حريق/دخان                | critical | evacuate, emergency services, no water on electrical fire                      |
| `electrical_hazard` | exposed/live wires, shocks, sparks, water near outlets         | high     | do not touch, isolate only if safe, qualified electrician                      |
| `high_voltage`      | microwave internals, capacitors, inverters, solar/EV batteries | critical | do not open; qualified technician                                              |
| `structural_hazard` | sagging/collapsing ceiling/roof/floor, structural cracks       | critical | keep away; structural engineer/building manager                                |
| `chemical_hazard`   | asbestos, toxic fumes, corrosives, bleach + ammonia            | high     | avoid fumes, leave area, poison control/emergency services                     |
| `pressure_system`   | pressurised vessels, steam, boiler/water-heater internal work  | high     | do not open; qualified plumber/heating technician                              |
| `vehicle_safety`    | brake/steering/airbag faults                                   | critical | do not drive; professional inspection/recovery                                 |

Additional identified-type rules escalate gas boilers, portable space heaters, microwaves, and smoke alarms.

### What escalation does

When `professional_required` is true, `applySafetyPolicy`:

- raises the risk level to at least `high`
- sets `stop_guidance`
- adds a `professional_required` warning
- adds a “stop work” step and a “contact a qualified professional” step
- removes all `repair_options`
- changes the repairability verdict to `professional` (or preserves `replace`)
- preserves the most relevant hazard escalation message
- adds photo/estimate limitations

The final Zod schema independently rejects contradictory output, such as `professional_required: true` with a `diy` verdict.

## 4. Unsafe-instruction detection

The deterministic detector looks for phrases such as:

- bypass/disable/remove a safety interlock, fuse, ground, or breaker
- work/test live or energised equipment
- open a gas/refrigerant/pressurised line
- disconnect grounding/bonding
- use water on an electrical fire
- skip/ignore a safety warning or lockout
- equivalent French and Arabic phrases

If a model step matches, it is removed. If any unsafe step was present, the whole analysis is escalated and a warning is added. The user never sees the removed instruction.

This is a defence-in-depth filter, not a complete natural-language safety classifier. Prompt rules and human review remain necessary.

## 5. Prompt rules (summary)

The system prompt instructs the model to:

- return strict JSON matching the contract, with no markdown
- distinguish observations, hypotheses, checks, and professional escalation
- never claim certainty from a photo
- never provide prices or currency ranges
- never recommend bypassing safety devices or working on live/pressurised equipment
- use the requested locale
- set `professional_required` and `stop_guidance` when appropriate
- avoid diagnostic claims that require physical inspection

The prompt is not trusted as a security boundary. All output is parsed, validated, and passed through the policy.

## 6. Prompt injection and untrusted content

Images and user text are untrusted. The system prompt says that any instructions found inside the image or description must be ignored as data. The server:

- sends only the minimum context needed
- does not expose secrets, service keys, or other users' data to the provider
- validates the provider response against a strict schema
- never executes model-provided code or URLs
- applies the safety policy after generation

If a model response attempts to instruct the app to run, install, download, or transmit something, it is treated as content, not a command. The app has no tool execution path for model output.

## 7. Cost estimates

The model is explicitly excluded from pricing.

- `estimateRepair` requires a recent (≤365 days), verified reference matching category, currency, region, and cause keywords.
- No match → `status: "unavailable"` with `no_verified_local_pricing`, `no_pricing_in_currency`, `insufficient_detail`, or `professional_quote_required`.
- Available estimates include source name, verification date, parts/labor flags, assumptions, and a confidence band.
- The UI always labels a range as a non-binding estimate, not a quote.
- Quote comparison uses only user-entered quotes and refuses cross-currency savings.

The seed file contains no price data. Until an operator supplies verified references, “estimate unavailable” is the correct result.

## 8. Limitations

- Photo-based analysis cannot confirm hidden mechanical, electrical, or structural faults.
- The hazard regexes can miss unusual phrasing, spelling variants, or mixed languages. They are conservative but not exhaustive.
- The unsafe-instruction detector is pattern-based and can produce false negatives.
- A model can still produce plausible but incorrect hypotheses; the UI labels them as hypotheses and asks for verification.
- No system can guarantee safety from a remote description. Users must stop when in doubt and contact a professional.
- The live AI path has not been exercised with real provider keys in this environment.

## 9. Testing

Current automated coverage includes:

- gas and electrical hazard escalation
- low-risk descriptions remaining low risk
- unsafe-instruction detection
- removal of repair options after a hazard is introduced
- risk ranking
- schema rejection of contradictory professional/DIY output
- cost reference matching, expiry, currency, region, and cause mismatch
- i18n parity for safety strings

See [TESTING.md](TESTING.md).

## 10. Incident response

If a dangerous recommendation is discovered:

1. Disable the affected provider or analysis path (set `AI_ALLOW_DEMO=false` and remove/rotate the provider key, or pause the function).
2. Preserve the diagnosis ID and provider metadata for investigation; do not expose other users' data.
3. Add a regression case to the safety tests.
4. Update the deterministic rules and prompt.
5. Re-deploy the Edge Function and rebuild the app if client rules changed.
6. Notify affected users and follow applicable incident/legal requirements.
