# Acme Onboarding

Welcome to Acme. This handbook walks you through your first six weeks: accounts, access, your first deploy, and the training that unlocks production. Your manager and your onboarding buddy will help, but this document is the checklist of record.

## Day 1 — accounts and hardware

- Collect your laptop from IT on the 3rd floor; it arrives pre-imaged with the base toolchain.
- Sign in to **Okta** — it is the identity provider for everything at Acme, and every login uses **MFA through Okta Verify**.
- Join Slack and introduce yourself in **#acme-newbies**.
- Accept the invites to GitHub, PagerDuty, and the internal wiki.

## VPN setup

Internal services are only reachable over the VPN:

1. Open the **IT portal** (portal.acme.dev) and download your personal **WireGuard profile**.
2. Install the WireGuard client (pre-installed on your laptop image) and import the profile.
3. Approve the Okta Verify MFA push when connecting for the first time.
4. Verify connectivity by loading the staging dashboard.

Profiles are personal and device-bound. If you get a new device, revoke the old profile in the IT portal and issue a new one — never copy a WireGuard profile between machines.

## Access tiers

| Tier | Grants | When |
|---|---|---|
| **Tier A** | Read-only staging: dashboards, logs, staging database replicas | Day 1, automatic |
| **Tier B** | Production: deploy rights, production logs, on-call tooling | **After you complete security training, in week 4** |

Tier B is never granted early, regardless of seniority. The security training that gates it covers phishing and prompt-injection awareness among other topics; the curriculum is owned by the Security team and summarized in the Security Runbook.

## Week 1 — orientation

Pair with your buddy daily. Read the Deploy Guide, the Billing Policy overview, and the API Reference introduction. Ship a documentation fix or a small test improvement — something that merges, so you see the pipeline run end to end.

## Week 2 — your first deploy

In week 2 you make your **first deploy to staging**. Pick a small, reviewed change; then follow the Deploy Guide for the exact procedure and command — the Deploy Guide is the source of truth for how deploys work, and this handbook deliberately does not duplicate it. Your buddy watches the pipeline with you. Note that merges to `main` reach staging automatically; the point of the exercise is the explicit redeploy, so you learn the tooling you will later use for production promotions.

## Week 4 — security training and production access

Complete the security training course in the LMS (about 3 hours). On completion, Tier B access is granted automatically within one business day. If it has not appeared after that, ask in `#it-help`.

## The buddy program

Every new hire has an onboarding buddy for the **first 6 weeks**: a peer engineer (never your manager) who pairs with you, reviews your early pull requests, and is the person you ask the questions you think are too small for the team channel. Buddies get 20% of their sprint capacity reserved during those six weeks.

## Checklist summary

- [ ] Day 1: laptop, Okta + MFA, Slack `#acme-newbies`, invites accepted
- [ ] VPN: WireGuard profile from the IT portal, first connect with Okta push
- [ ] Week 1: docs read, first small PR merged
- [ ] Week 2: first staging deploy (per the Deploy Guide)
- [ ] Week 4: security training complete → Tier B granted
- [ ] Week 6: buddy program wraps; retro with your manager

Questions about this handbook go to People Ops; access questions go to `#it-help`.
