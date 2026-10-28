---
id: product.resource
title: Resource
audience: builder, member, llm
status: alpha-current
last_verified: 2026-08-10
---

# Resource

## Definition

A resource is a community-owned knowledge item that can be shared with members and, where allowed, used as agent context.

## Why It Exists

Resources let communities store reusable knowledge instead of relying only on chat history or ad hoc prompts.

## User Mental Model

Members enter Resources through course cards, then read the ordered lessons inside a selected course. Builders see the same course presentation plus manager-only course and lesson authoring controls. Source ingestion belongs to builder knowledge setup rather than the primary course presentation.

## System Mental Model

Resources are community-scoped artifacts. Access to resources should follow community membership and role rules.

The course UI is a presentation model over the existing resource primitives:

- a resource module is presented as a course
- a member-visible page inside that module is presented as a lesson
- source resources remain manager-only intake material and are not lessons

No separate course, lesson, progress, or completion schema is implied by this presentation.

## Rules

1. Resource visibility should follow community access.
2. Resource write access should be role-gated.
3. Resources should not become a dumping ground for private user data.
4. Resource context should be explicitly selected, retrieved, or bounded.
5. Resources should be easier to audit than hidden prompt text.
6. Course visibility remains module-level `draft` or `live`; individual lesson publication is not a separate member-facing control.

## Related Concepts

- `community`
- `agent`
- `memory`
