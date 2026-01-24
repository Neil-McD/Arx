-- Idempotency guardrail for server-generated assistant replies.
--
-- We treat each assistant reply as replying to the most recent user message (reply_to_id),
-- and enforce at most one assistant message per user message.

create unique index if not exists uq_messages_assistant_reply_per_user_message
  on public.messages(thread_id, reply_to_id)
  where role = 'assistant' and reply_to_id is not null;

