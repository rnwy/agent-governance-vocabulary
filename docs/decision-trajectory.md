# Decision Trajectory — Longitudinal Primitives

> Contributed by [@nanookclaw](https://github.com/nanookclaw) from PDR Section 8 longitudinal analysis.
> Discussion: [aeoess/agent-passport-system#13](https://github.com/aeoess/agent-passport-system/issues/13).
> Promised reply date: 2026-04-10.

This document is the long-form rationale for the `decision_trajectory`
section in `vocabulary.yaml`. The YAML carries the short field
descriptions; everything that needs space to explain the *why* lives
here.

## A different class of primitive

The signal types already in the vocabulary — `wallet_state`,
`behavioral_trust`, `compliance_risk`, `passport_grade`,
`reasoning_integrity`, and the rest — share one structural property:
each one answers a question of the form "what is the verdict *now*?"
They are momentary attestations. An issuer signs a snapshot, a verifier
checks the signature, a consumer applies a policy to the snapshot. The
temporal dimension on these primitives is single-point: at issuance,
at acceptance, at processing.

Trajectory primitives are not snapshots. They answer questions of the
form "how is the verdict *moving*?" That distinction is structural,
not just lexical. A momentary attestation is a value. A trajectory
primitive is a *sequence* (or a derivative of one). You cannot replace
a trajectory primitive with a more recent snapshot; the older points
are part of the meaning.

Concretely, the four terms in this section serve different roles:

- `decision_lineage` is the full ordered sequence of decisions
  affecting a single agent.
- `baseline_revision` is a version identifier that tells you which
  baseline a snapshot was *evaluated against*, so two snapshots from
  different times can be compared coherently.
- `divergence_signal` is a quantitative measurement of how far the
  agent's current behavior is from a declared baseline.
- `trust_velocity` is the derivative of `trust_score` over a declared
  observation window.

These compose. Together they implement a longitudinal trust model:
snapshot + baseline version + deviation measurement + rate of change.
PDR uses all four in production research; the canonical names matter
because longitudinal research crosses multi-issuer boundaries the same
way single-point attestations do.

## Why decision_lineage is implementation-specific in v0.1

The `scheme` field on `decision_lineage` is set to
`content_addressable_implementation_specific`. This is a deliberate
loose declaration. The vocabulary asserts:

1. The lineage is **content-addressable**. Each entry is referenced by
   a hash of its content rather than by an external identifier the
   issuer assigns. This is the property that makes the lineage
   replayable and tamper-evident.
2. The lineage is **ordered**. Each entry references its predecessor.
3. The exact hash format and the exact entry envelope are
   **implementation-specific** in v0.1.

The reason for the looseness: PDR, APS, MolTrust, and other potential
issuers each already have a content-addressing scheme they use
internally. PDR uses one canonical hash; APS uses a JCS-based SHA-256
that includes specific delegation context; MolTrust uses yet another
shape. Forcing a single canonical scheme in v0.1 would either (a)
break the in-production receipts on at least two of these systems or
(b) require all of them to add a translation layer before the
vocabulary has demonstrated cross-system value.

The path forward is the same path the vocabulary takes elsewhere:
ship loose, observe what cross-system queries actually fail, tighten
in v0.2 if and when a shared canonical hash format becomes the cheaper
solution. Tightening prematurely is the failure mode this whole
vocabulary exists to prevent.

A consumer that wants to verify a `decision_lineage` from an issuer it
does not natively support uses the crosswalk layer (see
`crosswalk_match_types` in `vocabulary.yaml`) to declare the partial
match: same primitive shape, different hash format. The
`structural` match type is the right designation here.

## The triad: baseline_revision + divergence_signal + trust_velocity

A consumer can ask three different governance questions about the same
agent at the same moment:

1. *Where is this agent now?* → `behavioral_trust` (snapshot).
2. *How far is this agent from the baseline I trust?* →
   `divergence_signal` against a declared `baseline_revision`.
3. *Which way is this agent moving?* → `trust_velocity` over a
   declared `observation_window`.

These are not redundant. A `behavioral_trust` score of 0.85 means
something completely different in three scenarios:

| trust_score | baseline_rev | divergence | trust_velocity | governance reading                                  |
|-------------|--------------|------------|----------------|-----------------------------------------------------|
| 0.85        | v3           | 0.02       | +0.001/day     | Stable. No action.                                  |
| 0.85        | v3           | 0.02       | -0.04/day      | Trending down. Watch.                               |
| 0.85        | v4           | 0.18       | +0.002/day     | Recovering after baseline tightened. No action.     |
| 0.85        | v3           | 0.21       | -0.06/day      | Drifting from baseline AND falling. Escalate.       |

Without `baseline_revision` the second and third rows are
indistinguishable from the consumer's side: same `trust_score`, same
issuer, but the agent's situation is materially different because the
baseline tightened. Without `trust_velocity` the first and second rows
look identical at the moment of inspection. The triad makes each of
these governance situations expressible without the consumer having
to reach back into raw history every time.

This is also why `baseline_revision` is marked `required_on:
[behavioral_trust, divergence_signal, decision_lineage]`. The
requirement is asymmetric: a snapshot can omit the baseline and still
be parseable, but the consumer has to fall back to "I don't know what
this means relative to anything." Marking it required at the
vocabulary layer pushes issuers toward declaring the baseline they
evaluated against, even when the snapshot stands alone.

## The observation_window requirement

`trust_velocity` is a derivative. A derivative is meaningless without
the interval it was computed over. A 3% increase in `trust_score`
"per day" and "per hour" are different governance situations. A
divergence measurement aggregated over 1 hour and over 30 days are
different governance signals.

`observation_window` lives in the new `constraints` section because it
is not itself a signal — it is a *parameter* that signals must declare
to be reproducible. Two issuers reporting the same `divergence_signal`
value over different observation windows are not actually saying the
same thing, and the vocabulary should not let them present as if they
were.

A consumer that ignores `observation_window` is computing on noise.
A consumer that respects it can compare divergence signals across
issuers as long as the windows align.

## Concrete envelope example

This is a multi-attestation envelope using all four trajectory terms
plus the existing `behavioral_trust` snapshot they sit alongside. The
envelope shape itself is the one already in production for the 9
issuers — the new fields slot in at the same level as existing signal
types.

```json
{
  "envelope_version": "1.0",
  "subject": {
    "agent_id": "aeoess-bound-demo",
    "wallet_ref": [
      { "chain": "ethereum", "address": "0x1234...5678" }
    ]
  },
  "issuers": [
    {
      "issuer_id": "PDR",
      "issued_at": "2026-04-10T18:32:00Z",
      "signature": "...",
      "signals": {
        "behavioral_trust": {
          "score": 0.85,
          "baseline_revision": "pdr-baseline-v3.2"
        },
        "divergence_signal": {
          "value": 0.18,
          "baseline_revision": "pdr-baseline-v3.2",
          "observation_window": "P14D"
        },
        "trust_velocity": {
          "value": -0.04,
          "unit": "score_per_day",
          "observation_window": "P14D"
        },
        "decision_lineage": {
          "scheme": "pdr-blake3-v1",
          "head_hash": "b3:9c4f...e21a",
          "length": 47,
          "baseline_revision": "pdr-baseline-v3.2"
        }
      }
    }
  ]
}
```

A consumer reading this envelope can answer all four governance
questions for `aeoess-bound-demo`:

1. **Snapshot:** `behavioral_trust.score = 0.85` against
   `pdr-baseline-v3.2`.
2. **Distance from baseline:** `divergence_signal.value = 0.18` over
   the last 14 days against the same baseline. Material divergence.
3. **Direction:** `trust_velocity = -0.04 score_per_day`. Falling.
4. **History:** `decision_lineage.head_hash` points at the latest
   entry in a 47-entry signed sequence. The consumer can replay it
   end to end if it cares to, or treat the head as a tamper-evident
   summary if it does not.

The combined reading — high score, material divergence, falling
velocity, 47-entry replayable history — is the kind of input PDR's
longitudinal model takes as a single coherent observation. Without
the trajectory section, the consumer would have to either compute
the divergence and velocity itself from raw history (different
result on every consumer) or treat the snapshot as authoritative
and miss the trend (the failure mode PDR Section 8 documents).

## What this section is not

A few things this section deliberately does not do:

- **It is not a replacement for `behavioral_trust`.** Snapshots and
  trajectories are complementary primitives. A consumer that only
  cares about the moment can still read `behavioral_trust` and
  ignore the trajectory section entirely.

- **It is not a model.** The vocabulary names the inputs PDR's model
  consumes. It does not standardize the model itself. Consumers
  applying their own models against the same inputs is a feature.

- **It is not a single canonical hash format.** v0.1 leaves the
  addressing scheme implementation-specific. v0.2 may tighten this
  if cross-system replay surfaces the need.

- **It is not a real-time metric.** `observation_window` is a
  required declaration; consumers reading windowed signals must
  respect the window. There is no implicit "this is current" reading.

## Open questions for v0.2

Three questions the WG should answer before tightening: (1) does the
addressing scheme become canonical, driven by whether cross-system
replay actually surfaces in v0.1; (2) should `baseline_revision`
become a structured object instead of a string (PDR uses semver, APS
will likely need floor-version + validator-version + delegation
context); (3) should `trust_velocity` allow per-task units for
sparse-action agents, not just per-time.

Until then, the four terms above are the v0.1 surface, contributed
from PDR Section 8 longitudinal analysis. Attribution to
[@nanookclaw](https://github.com/nanookclaw) is in the YAML and the
commit message and here. The vocabulary catches up to the work, not
the other way around.
