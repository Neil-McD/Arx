---
id: product.guide.manage_resources
title: Manage Resources
audience: builder, member, llm
status: alpha-current
last_verified: 2026-04-26
---

# Manage Resources

## Goal

Maintain durable community knowledge that members and agents can use.

Resources are the community's curated knowledge layer. They should be easier to understand, audit, and reuse than scattered chat history.

## Resource Types

Resources can represent:

- documents
- links
- instructions
- reference material
- playbooks
- curated knowledge

## Mental Model

Chat is live participation. Resources are durable knowledge.

Use resources for information that should remain useful after the original conversation is over.

## Current Alpha Behavior

Community resources are scoped to a community. Members with access can read resources. Resource write actions are manager-gated, which currently means owner/admin authority.

Resources can also feed community retrieval paths where the backend supports
it, but resources remain curated knowledge rather than accepted community
memory or private member-agent conversation history.

## What Belongs In Resources

Good resource candidates:

- canonical methods
- onboarding instructions
- playbooks
- reference links
- decision frameworks
- policies
- frequently reused examples

Poor resource candidates:

- private member data
- temporary chat noise
- raw unreviewed conversation dumps
- secrets
- billing records
- vague motivational copy

## Resource Quality Checklist

1. Clear title.
2. Clear purpose.
3. Useful body or link.
4. Correct community scope.
5. No private data.
6. No stale promise of unavailable capability.
7. Updated when product behavior changes.

## Rules

1. Keep resources scoped to the community.
2. Give write access only to trusted manager roles.
3. Do not store private user data as shared community knowledge.
4. Keep resource titles and descriptions clear.
5. Prefer fewer high-signal resources over many low-signal resources.
6. Do not treat resources as accepted memory without the cognition boundary.
7. Do not let resources override platform access, safety, or entitlement rules.

## Common Mistakes

- Treating every useful chat message as a resource.
- Storing sensitive user-specific context in a shared resource.
- Letting resources become stale while prompts keep referencing them.
- Giving moderators edit authority when the current product policy is owner/admin.
- Using resources for secrets or external-service credentials.

## Related Concepts

- `resource`
- `community`
- `agent`
- `memory`
