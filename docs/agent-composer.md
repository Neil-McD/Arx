# Agent composer

Agent reuses the channel composer surface, editor layout, toolbar and send/voice
styling. The shared toolbar renders mention and emoji controls only when their
callbacks are supplied; channels retain both and Agent supplies neither.

Agent retains its existing image attachment, paste/drop, dictation, Enter/Shift+Enter,
submission and streaming stop handlers. No new inference, storage or permission
path. The composer remains bottom-positioned, with the desktop 12px bottom inset
matching the navigation Invite button. Agent uses the same workspace surface as
Members rather than the navigation/sidebar surface. Staging-only release.
