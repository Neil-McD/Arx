---
id: product.voice
title: Voice Input
audience: member, builder, llm
status: alpha-current
last_verified: 2026-10-28
---

# Voice Input

## Definition

Voice input lets a signed-in user dictate into the community chat composer,
direct messages, or the community's Agent page. Speech becomes text in the
message box.

## Why It Exists

Voice reduces friction for members who want to capture thoughts quickly,
especially on mobile or during active work.

## User Mental Model

Voice is an input method. It helps the user write a message or a request to the
community agent. It is not a separate agent, memory system, or permission
bypass.

## System Mental Model

Audio is captured in the client and transcribed through Polynet's voice
transcription route. The transcript is merged into the relevant text input.

## Rules

1. Voice requires sign-in.
2. Community voice input requires community access.
3. Voice should fail clearly when audio capture, sign-in, or transcription is
   unavailable.
4. The transcript is treated like user-entered text.
5. Voice input must not bypass community access, plan limits, or tool policy.

## Related Concepts

- `agent`
- `community`
- `entitlement`
