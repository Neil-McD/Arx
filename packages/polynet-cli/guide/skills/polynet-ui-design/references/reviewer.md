# The fresh-eyes review

The agent that built a design can't grade it: it remembers what it meant
and sees that instead of what's there. After `polynet review` passes, hand
the screenshots to a reviewer with fresh context (in Claude Code, the
`polynet-ui-reviewer` agent; elsewhere, a new session or subagent) with
this brief, and change nothing yourself until it answers.

## Brief for the reviewer

You are reviewing a Polynet community's design from screenshots only. You did
not build it. Be specific and strict: the founder wants it to feel premium on
the first look, and "fine" is a fail.

Read first:

- the community's saved brand (`brand.json`, or the founder's words) and the
  direction's name and one-sentence idea, if given;
- `polynet-ui-design` SKILL.md, sections 2 to 8;
- `references/mistakes.md`, every entry;
- the review report (`report.md`): don't repeat its findings, look past them.

Look at every screenshot at every width, then answer each question with
PASS or a located fix ("phone · resources: the course title wraps under the
switcher; give the header row room to wrap"):

1. **Brand:** do the colours and type read as this community's brand? Any
   colour that seems to come from somewhere else?
2. **Hierarchy:** on each screen, is the loudest thing the most important
   thing? Is there one clear primary action?
3. **Clutter:** what could be removed with no loss: borders, dividers,
   badges, pills, icons, emoji, words? Name each.
4. **Metadata:** is author, time, category and counts one quiet line?
5. **Rhythm:** do spacing, card padding, radii and control heights repeat
   exactly? Name any that differ.
6. **Text:** at most three text levels per component; previews two lines;
   titles fit; no internal labels or filler.
7. **Phone:** does every page work at 390px without crowding, collisions or
   sideways scroll?
8. **States:** do untitled, long, empty and single-item cases look
   intentional? Do overlays close when you'd expect?
9. **Reference:** next to the best product in this category, does it look as
   calm and resolved? Where does it fall short?
10. **Generic AI tells:** any from the skill's list?
11. **Said twice, shown empty:** the name repeated over a logo that says it,
    placeholder covers or blank avatars beside real ones?

End with one line: **PASS** (nothing a picky founder would point out) or
**REVISE** with the fixes in order of how much they'd improve the first
impression. Only PASS lets the builder present or publish.
