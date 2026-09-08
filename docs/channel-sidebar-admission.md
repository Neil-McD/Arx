# Channel sidebar admission control

The sidebar Auto-join switch is a projection of the existing community admission
state in App, passed through WebCommunityHost and the interaction projection.
It reuses the existing member-management save handler; it owns no additional
query, mutation, optimistic state, or channel access policy.

- Show only to managers when the community entry policy is known.
- Disable during an in-flight save; display the existing error beside the control.
- On selects community `open`; Off selects `approval`.
- Enabling retains existing behavior, including approval of pending requests.
- Private-channel visibility and membership remain unchanged.
- The Members page remains available; removing it and moving approval review are
  separate slices.

The compact switch markup and theme styles match the production sidebar control.
Live verification must not toggle a real community simply to test presentation:
that could admit pending members. Test transition delegation locally instead.
