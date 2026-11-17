---
id: product.guide.manage_resources
title: Manage Resources
audience: builder, member, llm
status: alpha-current
last_verified: 2026-11-17
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

The Resources root (Knowledge) presents each resource module as a course on a shelf, in the order the managers set. Members see a course once it is `live`; a `draft` is visible to managers only. Course name, description, cover, ordering, and `draft` or `live` state are manager-controlled. Managers can also create, reorder, rename, move, edit, and delete lessons.

How a manager edits (design v1, 2026-11-17). There is no edit mode and no course form:

- **New course.** The shelf's "New course" card creates a `draft` course named "Untitled course" at once, opens it with its name ready to type over, and creates its first lesson ("Untitled lesson"). Nothing is shown to members until the course is published.
- **Course details.** The name and the one line about the course are changed where they sit at the top of the lesson list. They save when the manager presses Enter or leaves the field; Escape puts the old words back. Choosing a cover picture saves it at once.
- **Publishing.** One switch in the page header moves a course between `draft` and `live`. A course with no lessons cannot be published. Only a `draft` course can be deleted, after a confirmation.
- **Order.** Courses on the shelf and lessons in a course are dragged by a grip and saved once, when dropped. The grip also takes the arrow keys. A lesson's menu renames it, moves it to the end of another course, or deletes it (with a confirmation).
- **Lessons.** For a manager the lesson page is the editor: the video link, the title, the body and the lesson's links are changed in place. Unlike course details, **nothing about a lesson is saved, and nothing reaches members, until the manager presses Save**; an "Unsaved changes" bar offers Save and Discard, and leaving the lesson with unsaved changes asks first. A lesson has no publish state of its own: members see it when its course is `live`.

Raw links and uploaded files enter during builder knowledge setup. Sources remain separate from the member course outline until a manager turns them into a lesson draft. Existing sources stay available in a manager-only source inbox, and unassigned legacy pages appear in a manager-only maintenance entry rather than as a normal course.

Members mark lessons done and see how far along they are in each course, and each lesson has its own address. Courses are an ordered path: nothing is locked, and members can open any course or lesson. This course presentation does not currently offer certificates or drip schedules.

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
