# Community Recurring Membership And Grandfathering Plan v1

## Goal

Support community pricing that is:

- simple
- durable
- grandfather-safe
- webhook-friendly
- truthful in the members/admin UI

without rug-pulling existing members when prices change.

## First Principles

Reduce the problem to five irreducible objects:

1. `Community`
2. `Membership`
3. `Price point`
4. `Subscription`
5. `Access resolver`

Everything else is a projection or workflow around those five objects.

## Current Ground Truth

The current repo does **not** model recurring paid community memberships yet.

What exists today:

- `communityMemberships`
  - durable roster/access row
- `communityPlans`
  - mutable per-community, per-billing-period rows
- `checkoutSessions`
  - ephemeral checkout record
- `purchaseClaims`
  - pending redeemable join token

Current behavior is effectively:

- `open`
- `approval`
- `paid_unlock`

That is a valid paid-unlock model, but it is not enough for recurring subscriptions with price grandfathering.

## Why The Current Model Is Not Enough

Today, community pricing is updated in place:

- `communityLifecycle.ts` upserts one active monthly plan and one active yearly plan
- checkout only remembers `communityId` and `billingPeriod`
- claim redemption only mints a membership row

That breaks the moment pricing history matters.

Example:

1. community starts free
2. 10 users join for free
3. community changes to `$7/month`
4. 10 users join at `$7/month`
5. community changes to `$20/month`
6. 10 users join at `$20/month`

At that point, the system must preserve **three active cohorts**:

- free grandfathered members
- `$7/month` grandfathered members
- `$20/month` current members

The current schema cannot represent those cohorts truthfully.

## Product Decision

Polynet should distinguish:

1. `paid_unlock`
   - one-time/lifetime style paid access
   - optional to keep as a separate product mode

2. `paid_subscription`
   - recurring paid community access
   - required for Skool/Circle-style grandfathered pricing

Recommendation:

- keep `open`
- keep `approval`
- keep `paid_unlock` only if lifetime paid access is truly wanted
- add `paid_subscription` for recurring memberships

## Required Invariants

1. A price that has ever been sold must be immutable.
2. New sales always target one explicit current price point.
3. Existing members keep the exact price point they joined on.
4. Membership access must not depend on the community's current price alone.
5. Checkout/claim records must bind to an exact `pricePointId`, not just `billingPeriod`.
6. Admin UI must display real cohorts from stored data, not inferred fake plan state.
7. Deleting or archiving a price point must be blocked while active members still depend on it.

## Target Data Model

### 1. `communities`

Keep:

- ownership
- visibility
- `entryPolicy`

Change:

- `entryPolicy` should support `paid_subscription`

Example values:

- `open`
- `approval`
- `paid_unlock`
- `paid_subscription`

### 2. `communityMemberships`

Keep it as the durable roster record, but make it explicit about access source.

Add:

- `role`
  - `owner | admin | member`
- `accessSource`
  - `free_grant`
  - `manual_grant`
  - `paid_unlock`
  - `paid_subscription`
- `pricePointId?`
  - nullable for free/manual memberships
- `subscriptionId?`
  - nullable for non-recurring memberships
- `active`
  - boolean or derived via `revokedAt`
- `revokedAt?`
- `revokedReason?`

Important:

- role and access source are not the same thing
- role controls authority
- access source explains why access exists

### 3. `communityPricePoints`

This is the missing core object.

Add a new table:

- `communityId`
- `kind`
  - `subscription`
  - optional later `unlock`
- `billingPeriod`
  - `monthly | yearly`
- `amountBaseUnits`
- `currency`
- `currencyDecimals`
- `name`
- `description`
- `isCurrent`
- `archivedAt?`
- `providerPriceId?`
- `createdAt`
- `updatedAt`

Rules:

- never overwrite the amount of an old sold row
- when price changes, create a new row and mark it current
- old rows remain for grandfathered cohorts

### 4. `communitySubscriptions`

Add a recurring-access table:

- `communityId`
- `userId`
- `membershipId`
- `pricePointId`
- `status`
  - `active`
  - `past_due`
  - `cancel_at_period_end`
  - `canceled`
  - `ended`
- `providerSubscriptionId`
- `providerCustomerId?`
- `currentPeriodStartAt?`
- `currentPeriodEndAt?`
- `cancelAtPeriodEnd`
- `endedAt?`
- `createdAt`
- `updatedAt`

This is what webhooks mutate.

### 5. `checkoutSessions` and `purchaseClaims`

Current flaw:

- they only bind to community + billing period

Required change:

- bind to exact `pricePointId`

Add:

- `pricePointId`
- optional cached amount/currency snapshot for audit

Then claim redemption can mint the correct membership/subscription cohort.

## Access Resolution

Community access should resolve from:

1. `entryPolicy`
2. `membership`
3. `subscription state`

Rules:

- `open`
  - membership is created immediately
- `approval`
  - membership is created on approval
- `paid_unlock`
  - membership is created on successful paid unlock
- `paid_subscription`
  - membership exists only while:
    - access source is complimentary/manual/free_grant
    - or linked subscription is active/grace-valid

The access resolver should no longer ask:

- "is this community currently paid?"

It should ask:

- "does this user have an active access record for this community?"

## Grandfathering Behavior

Canonical example:

### Phase 1: free

10 members join.

Rows:

- `communityMemberships.accessSource = free_grant`
- no subscription rows
- no price point attached

### Phase 2: `$7/month`

Create price point:

- `pp_monthly_7`

Set current sellable price:

- `pp_monthly_7.isCurrent = true`

10 members join:

- membership row with `accessSource = paid_subscription`
- `pricePointId = pp_monthly_7`
- active `communitySubscriptions` row referencing `pp_monthly_7`

### Phase 3: `$20/month`

Create new price point:

- `pp_monthly_20`

Switch current sellable price:

- `pp_monthly_7.isCurrent = false`
- `pp_monthly_20.isCurrent = true`

10 new members join:

- membership row with `pricePointId = pp_monthly_20`
- active subscription row referencing `pp_monthly_20`

Net result:

- first 10 stay free
- next 10 stay on `$7`
- next 10 pay `$20`

No rug pull.

## Admin/Product Semantics

The community settings page should behave like this:

- `Current price`
  - price used for new signups
- `Historical active cohorts`
  - old price points still referenced by active members
- `Archived prices`
  - old price points with no active members

Admin actions:

- create new current price point
- archive price point only if no active members depend on it
- optionally comp a member into the community
- optionally move a member to another price point only through an explicit migration flow

Important:

- changing the community price should never mutate existing subscribers in place

## Membership Surface Truth

Once this model exists, the members page can truthfully show:

- role
- access source
- joined at
- current cohort price
- billing period
- subscription status

But it should only show those once they are real backend data.

## Recommended Role Model

Use:

- `owner`
- `admin`
- `member`

Do not reintroduce `mod` unless a specific permission set is first defined.

## Migration Plan

### Phase 1: Schema introduction

Add:

- `paid_subscription` entry policy
- `communityPricePoints`
- `communitySubscriptions`
- new membership access-source fields

Do not delete old plan rows yet.

### Phase 2: Checkout rebinding

Update:

- settings writes to create new immutable price points
- public checkout to target exact `pricePointId`
- purchase claims to store `pricePointId`

### Phase 3: Access resolver upgrade

Update canonical community access resolver to understand:

- free/manual memberships
- recurring subscriptions
- grandfathered cohorts

### Phase 4: Admin/member UI truth

Update members/admin UI to show real cohort data from:

- `communityMemberships`
- `communitySubscriptions`
- `communityPricePoints`

### Phase 5: Legacy cleanup

Delete or demote:

- mutable in-place plan updating
- any assumptions that one community has exactly one monthly and one yearly price forever
- fake inferred member plan semantics

## What To Preserve

- current UI style
- current membership-based access architecture
- public funnel shape
- checkout/claim flow concept

## What To Delete

- mutable price-in-place semantics for recurring communities
- `mod`
- fake member plan projection logic
- billing-period-only checkout identity

## Best Direction

The simplest high-quality system is:

- role is simple
- access source is explicit
- prices are immutable
- subscriptions reference exact prices
- access is resolved from real records, not current community config alone

That is the minimum viable architecture for Skool-style grandfathering and Circle-style payment migrations without future billing chaos.
