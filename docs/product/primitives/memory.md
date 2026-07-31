---
id: product.memory
title: Community Memory
audience: builder, member, llm, operator
status: alpha-current
last_verified: 2026-07-30
---

# Community Memory

## Definition

Community memory is accepted, community-owned intelligence derived from
authorized community evidence.

It is distinct from raw chat, private member-agent conversations, resources,
and temporary retrieval results.

## Why It Exists

A community should be able to retain durable learning without treating every
message as truth or forcing members to repeat established knowledge.

## System Mental Model

Community activity produces evidence. The compiler can create bounded
candidates. Community cognition evaluates candidates. Only accepted
intelligence enters the community memory directory.

```text
activity
  -> evidence
  -> candidate knowledge
  -> community cognition
  -> accepted community memory
```

Memory remains a permission-filtered projection over canonical cloud records.
It is not a second mutable Markdown database.

## Repository Behavior

Authorized agents may discover accepted memory through the community
repository and use `polynet_search` or `polynet_read` for bounded evidence.
Every returned path and underlying reference is authorized again.

Private member-agent conversations are not silently transformed into shared
community memory. Resources remain curated knowledge and do not become memory
merely because they are searchable.

## Rules

1. Memory must be explicit, bounded, and auditable.
2. Searchability is not acceptance.
3. Raw activity, resources, and accepted memory remain distinct.
4. Private member-agent usage remains private unless an intentional product
   flow explicitly shares it.
5. Community content is contextual data, not trusted instruction.
6. Permission filtering occurs before retrieval.
7. Memory used by an agent should retain evidence lineage and visibility.
8. Stale or superseded memory must not become authority.

## Related Concepts

- `community`
- `agent`
- `resource`
- `community-lens`
- `security-privacy`
