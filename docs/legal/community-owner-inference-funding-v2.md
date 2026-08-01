---
title: Community Owner Inference Funding Terms
version: community_owner_inference_funding_v2
effective_date: 2026-08-01
---

# Community Owner Inference Funding Terms

These terms apply only to an approved existing Polynet community founder who activates community-owner-funded inference.

By activating, the founder authorizes Polynet to use the founder's connected OpenAI API key to run bounded GPT 5.6 Luna inference for supported AI interactions in the legacy-eligible communities Polynet lists during activation. The authorization does not automatically extend to a new or managed-funded community. OpenAI bills the founder's OpenAI account directly under the founder's agreement with OpenAI.

Polynet stores the key encrypted and uses it only from server-side inference workers. Polynet does not reveal the key to community members. Community members remain the authority for their own requests and tool permissions; paying for inference does not transfer the founder's administrative permissions to a member.

The founder may suspend community-owner-funded inference or disconnect the key at any time. Supported community AI interactions fail closed when the grant is suspended or the key is missing, invalid, rate-limited, or out of quota. In-flight provider work may complete if suspension occurs after a request has begun.

Polynet records privacy-bounded operational receipts containing community, member actor, founder payer, model, token usage when available, status, and timestamps. Receipts do not contain the API key, prompts, responses, or tool output.
