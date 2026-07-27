---
id: product.voice
title: Voice Input
audience: member, builder, llm
status: alpha-current
last_verified: 2026-07-27
---

# Voice Input

## Definition

Voice input lets an authenticated user dictate into the member-agent dock or community chat and turn speech into text for the agent or community message composer.

## Why It Exists

Voice reduces friction for members who want to capture thoughts quickly, especially on mobile or during active work.

## User Mental Model

Voice is an input method. It helps the user write a message or prompt. It is not a separate agent, memory system, or permission bypass.

## System Mental Model

Voice capture happens in the client. Transcription is handled through the runtime voice transcription route. The transcript is merged into the relevant text input.

## Rules

1. Voice requires sign-in.
2. Community voice input requires community access.
3. Voice transcription should fail clearly when audio capture, auth, or provider configuration is unavailable.
4. The transcript should be treated like user-entered text after transcription.
5. Voice input must not bypass community access, plan gates, or tool policy.

## Related Concepts

- `agent`
- `community`
- `thread`
- `entitlement`
