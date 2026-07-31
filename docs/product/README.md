---
id: product.docs_index
title: Product Documentation Index
audience: builder, member, llm, operator
status: alpha-current
last_verified: 2026-07-30
---

# Product Documentation Index

## Purpose

This directory is the canonical user-facing and LLM-ingestible product documentation source for Polynet.

It is written for two readers:

- humans who need to understand and use the platform
- LLMs that need stable product truth for prompts, retrieval, and context assembly

The existing `/docs` directory contains internal engineering contracts, release workflows, historical plans, and implementation notes. Those files are not user-facing documentation and should not be exposed directly as product docs.

Product docs are downstream from platform doctrine and runtime contracts. If there is tension between this directory and `PLATFORM.md`, `SOUL.md`, `AGENTS.md`, or runtime enforcement, treat the product docs as the public distillation that needs to be corrected, not as a second authority plane.

## Product Truth

Polynet is an AI-native collective intelligence platform where builders can create custom AI agents, distribute them through communities, and monetize systems that become more valuable as the network learns and compounds.

The product combines:

- agents as product surfaces
- communities as distribution, trust, retention, and feedback systems
- collective intelligence as the compounding asset
- one canonical five-operation Polynet repository contract

## Documentation Rules

1. Use stable concept names.
2. Prefer explicit rules over narrative ambiguity.
3. Distinguish alpha-current behavior from future intent.
4. Do not expose internal migration history as product truth.
5. Do not overclaim capabilities that are not implemented.
6. Keep docs modular so LLMs can ingest one concept at a time.
7. Keep prompts downstream from docs; prompts should reference product truth, not replace it.

## Status Values

- `alpha-current`: implemented or intentionally part of the active alpha model
- `planned`: intended direction, not guaranteed to be live
- `internal-only`: useful for operators or agents, not for public product docs
- `deprecated`: historical or superseded

## Ingestion Order

LLMs should read product docs in this order:

1. `llms.txt`
2. `llms-full.txt`
3. `primitives/polynet.md`
4. `primitives/community.md`
5. `primitives/funnel.md`
6. `primitives/agent.md`
7. `primitives/community-lens.md`
8. `primitives/memory.md`
9. `primitives/voice.md`
10. `primitives/polynet-mcp.md`
11. `primitives/skill.md`
12. `primitives/resource.md`
13. `primitives/entitlement.md`
14. `primitives/role.md`
15. `reference/access-model.md`
16. `reference/context-model.md`
17. `reference/prompt-context-model.md`
18. `reference/security-privacy.md`
19. `reference/glossary.md`

## Human Reading Paths

Builder path:

1. `guides/builder-quickstart.md`
2. `guides/launch-a-community.md`
3. `guides/configure-community-agent.md`
4. `guides/connect-polynet-mcp.md`
5. `guides/create-and-use-skills.md`
6. `guides/manage-resources.md`
7. `guides/manage-access-billing-and-roles.md`

Member path:

1. `guides/member-quickstart.md`
2. `guides/joining-communities.md`
3. `guides/chat-and-resources.md`
4. `primitives/agent.md`
5. `primitives/community-lens.md`
