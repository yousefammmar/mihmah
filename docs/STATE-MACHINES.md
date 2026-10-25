# Workflow state machines

Every transition below is validated on the server inside a database transaction (`server/routes/*.js`). The UI only shows the actions the server would accept. Hiding a button is never the enforcement. Each state lives in exactly one column, so dashboards count rows and never cache numbers.

All times are stored as `timestamptz` (UTC). The UI renders them in **Asia/Amman**. A task deadline is chosen as a calendar date and stored as 23:59:59 Amman time on that date.

## Task (`tasks.status`)

```
draft ──publish──▶ published ──offer accepted──▶ assigned ──project approved──▶ completed
  │                    │                              │
  └──cancel──▶ cancelled ◀──cancel──┘                 └──admin cancels project (dispute)──▶ cancelled
```

| From | To | Who | Rules |
| --- | --- | --- | --- |
| — | draft / published | company | Full validation. Publishing needs a verified email. The deadline must cover the duration. |
| draft | published | owner company | Verified email. Deadline still covers the duration. |
| draft | (deleted) | owner company | Drafts only. |
| draft, published | cancelled | owner company | A reason is required. Submitted applications become `rejected` and pending offers become `withdrawn`. Affected students are notified. |
| published | assigned | system | Only by an offer acceptance (below). |
| assigned | completed | system | When the company approves the project. |
| assigned | cancelled | admin | Only through dispute resolution (project cancel). |

**Editing:** allowed while `draft`, or while `published` with zero applications.

**Moderation:** `moderation_status` (`visible`/`hidden`) is separate from the lifecycle. Hidden tasks disappear from discovery and refuse applications.

## Application (`applications.status`)

```
submitted ──withdraw (student)──▶ withdrawn
    │──reject (company) / task assigned or cancelled──▶ rejected
    └──offer created (company)──▶ offered
```

- One application per student per task, ever. `unique (task_id, student_id)` enforces this, so reapplying after withdrawal is refused.
- Applying requires a verified email, a `published` and visible task, a deadline that hasn't passed, and a delivery time no longer than the task duration.

## Offer (`offers.status`)

```
pending ──accept (student)──▶ accepted
   │──decline (student)──▶ declined
   │──withdraw (company) / another offer accepted / task cancelled──▶ withdrawn
   └──expires_at passed──▶ expired     (OFFER_TTL_HOURS, default 72)
```

- A company may send offers to several applicants. The first acceptance wins.
- **Acceptance is the only path to `assigned`.** One transaction:
  1. Lock the task row (`select … for update`), then the offer row.
  2. Check the offer is `pending` and unexpired and the task is still `published`.
  3. Set the offer to `accepted` and the task to `assigned`.
  4. Withdraw the other pending offers and reject the remaining submitted applications.
  5. Create the project, its conversation, milestones (copied from the task template) and a payment record.
- Concurrency is backed by the database. `offers_one_accepted_per_task` is a partial unique index allowing one accepted offer per task, and `projects.task_id` is unique. `test/concurrency.test.js` races four students five times and checks that exactly one wins each round.
- Expiry is enforced inside the accept transaction and marked by a one-minute sweep (`expireOffers`).

## Project (`projects.status`)

```
in_progress ──submit deliverable (student)──▶ awaiting_review
                                                 │──request revision (company, feedback ≥ 15 chars)──▶ revision_requested ──resubmit──▶ awaiting_review
                                                 └──approve (company, rating 1–5 + comment)──▶ completed
any active ──admin cancel (dispute, reason)──▶ cancelled
```

| Action | Allowed from | Who |
| --- | --- | --- |
| Submit deliverable (note + at least one link or file) | `in_progress`, `revision_requested` | assigned student |
| Request revision | `awaiting_review` | owner company |
| Approve | `awaiting_review` | owner company |
| Add, rename or delete milestones | active | owner company |
| Tick or untick milestones | active | both participants |
| Messages | anything except `cancelled` | both participants |
| Review the company | `completed`, once | student |
| Cancel | active | admin, with a reason |

**Approval does all of the following in one transaction:**
- Records the review on the last deliverable.
- Sets `completed_at` and ticks the remaining milestones.
- Completes the task.
- Stores the company's review of the student, which then appears in the portfolio.

**It does not touch the payment record.**

## Payment (`payments.status`), kept separate from project status

```
pending_integration                       (PAYMENTS_PROVIDER=none: nothing can move it except cancellation)
awaiting_payment ──▶ authorized ──▶ captured ──▶ payout_pending ──▶ paid_out
        │               │              └──▶ refunded
        └──▶ failed ◀───┘ (failed ──▶ awaiting_payment)
any pre-capture state ──admin dispute cancel──▶ cancelled
```

- Created with the project, in status `pending_integration` (no provider) or `awaiting_payment` (sandbox).
- Statuses change only through provider events. Today that means the sandbox simulator in the admin area, recorded in `payment_events` with `source = 'provider_webhook'`. **No user button marks anything paid.**
- `payments.is_live` has a `check (is_live = false)` constraint: live money movement needs a new adapter, a migration and a review. See `PAYMENTS-RESEARCH.md`.

## Report (`reports.status`)

`open → resolved | dismissed` (admin, note required). Each action is also written to `moderation_actions` and `audit_events`.

## Company verification (`company_profiles.verification_status`)

`unverified → pending` (company request, profile complete) `→ verified | rejected` (admin, with a note saying what was checked). Renaming a verified company resets it to `unverified`. The "شركة موثّقة" badge is shown only for `verified`.
