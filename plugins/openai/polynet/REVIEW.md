# OpenAI review kit: Polynet

What goes into the dashboard outside the ZIP, the demo video script, and how
to reset the demo between runs.

## Review details (dashboard → Add review information)

- **Login:** support@polynet.ai (WorkOS user user_01M7ZQPHR4MF6VFJJJ4XCRVVRF).
  Email and password; the password is in Neil's password manager. No two-step
  codes, no emailed codes, no magic links: the email is verified and Magic
  Auth is off.
- **How to sign in:** add Polynet in ChatGPT, choose "Continue with email" on
  the Polynet sign-in page, enter the email and password.
- **What's there:** the account hosts one Unlisted demo community, Harbor Run
  Club (harbor-run-club), with made-up members, posts, a weekly Saturday run,
  Track Tuesday, a 3-lesson course "First 10K plan", two people waiting to
  join and two direct messages. The test cases are written against it.
- **Notes for the reviewer:**
  - Some changes wait for a Yes inside Polynet (test case 5: making Jordan
    Lee a moderator). The plugin answers that the request is waiting and where
    to approve it; nothing changes from ChatGPT alone. The reviewer account
    signs in through AI apps only, so it can't open that page in Polynet's
    website (which uses Google sign-in). Expect "waiting for approval" as the
    result, not the change.
  - Asking for the same post twice within a day is refused as a duplicate.
  - Every made-up member has no email address, so nothing the plugin does
    (events, join approvals) sends mail to anyone.

## Reset between review runs

```
npx convex run reviewDemoSeed:resetReviewDemoInternal '{"reviewer":"user_01M7ZQPHR4MF6VFJJJ4XCRVVRF"}' --prod
```

It declines the reviewer's waiting Yes requests, removes every post, puts
Jordan Lee back to member, lifts any ban, and re-seeds with dates from today.
Needs `POLYNET_ALLOW_REVIEW_DEMO=1` on the deployment (set on production).

## Demo video script (about 4 minutes)

Record the screen with sound. Show ChatGPT on the web, then the same on a
phone, then Codex. Before recording: run the reset above, and open a new chat
for each case. Say each case's number as you go; a sentence of narration is
enough.

1. **Setup (20 s).** ChatGPT → Plugins → Polynet is connected as
   support@polynet.ai. "This is Polynet: communities with channels, events
   and courses. The plugin works as the signed-in person."
2. **Case 1, events.** Type: *What events are coming up in Harbor Run Club?*
   Show: two events; the Saturday run listed once as weekly.
3. **Case 2, summary.** *Summarize what people have been talking about in
   Harbor Run Club's General channel lately.* Show: names and what they said;
   nothing posted.
4. **Case 3, search.** *Has anyone in Harbor Run Club talked about knee
   pain?* Show: the #training thread with three people.
5. **Case 4, post.** *Start a new post in Harbor Run Club's General channel:
   "Reminder: Saturday's long run starts at 7am from the boathouse."* Press
   "Allow once" when ChatGPT asks. Show: it says the post is up.
6. **Case 5, needs a Yes.** *Make Jordan Lee a moderator in Harbor Run
   Club.* Allow once. Show: "waiting for your approval in Polynet". Say:
   "Changing roles always waits for a Yes inside Polynet; nothing changes from
   here."
7. **Negative 1.** *Show me the newest posts in the Polynet community Ocean
   Swimmers Collective.* Show: not accessible, no data.
8. **Negative 2.** *Buy me a membership to a paid community on Polynet.*
   Show: joining and paying happen in Polynet; no prices, no checkout.
9. **Negative 3.** *Delete the General channel in Harbor Run Club.* Show:
   not possible, nothing changed.
10. **Phone (40 s).** In the ChatGPT phone app, repeat case 1.
11. **Codex (40 s).** In Codex with the Polynet plugin, repeat case 3.

Upload unlisted to YouTube (or anywhere a link opens without sign-in). The
link goes in plugin.json as `extensions.com.openai.review.demo_recording_url`
(then rebuild the ZIP and upload it as a new version), or in the dashboard's
demo recording field if it offers one.
