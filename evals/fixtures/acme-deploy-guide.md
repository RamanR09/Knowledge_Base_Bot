# Acme Deploy Guide

This guide describes how code ships at Acme, from a merged pull request to a healthy production release. It applies to every service in the `acme-platform` monorepo. Read it before your first deploy; the Onboarding handbook schedules that deploy for your second week.

## Environments

Acme runs three environments: **dev**, **staging**, and **production**. Dev is per-engineer and disposable. Staging mirrors production infrastructure at one-quarter scale and receives every merge to `main` automatically. Production changes are always explicit — nothing reaches customers without a human pressing the button.

## The Skylift pipeline

All deploys run through **Skylift**, our CI/CD pipeline. On every merge to `main`, Skylift builds container images, runs the full test suite, and deploys the build to staging automatically. A build that fails any test never produces a deployable artifact.

Promotion to production is manual. The **Release Captain** — a weekly rotating role — reviews the staging soak dashboard and promotes a build with:

```
acme-cli deploy --env production --release <release-id>
```

The same `acme-cli deploy` command targets staging when you need to redeploy a specific build there. Your first staging deploy during onboarding uses exactly this command with `--env staging`.

## Blue-green rollout and health checks

Production deploys are blue-green: the new release comes up alongside the old one, and traffic shifts over gradually. Health checks run for **5 minutes** after the traffic shift completes. If the error rate exceeds **2%** during the health-check window, Skylift rolls the release back automatically and pages the Release Captain.

## Rollbacks

Manual rollback is available for **30 minutes** after a production deploy completes:

```
acme-cli rollback --to <release-id>
```

After the 30-minute window, database migrations and cache warm-up make a straight rollback unsafe — ship a forward fix instead. Never roll back past a release that included a schema migration without consulting the on-call database engineer.

## Deploy windows and freezes

Routine production deploys happen between **09:00 and 17:00 UK time** on business days. Outside those hours, you must page the on-call engineer in PagerDuty **before** deploying, so someone is awake and watching the dashboards while your release rolls out.

A **deploy freeze** is in effect during the **last two business days of every fiscal quarter**. This freeze exists because quarter close is when Finance generates customer invoices, and billing-adjacent regressions during invoicing are disproportionately expensive. Exceptions to the freeze require written approval from the **VP of Engineering** — a Slack message in `#deploys` with the VP's explicit sign-off is sufficient.

## Secrets and configuration

Services pull secrets from **Vault at boot time**. Secrets are never baked into container images and never committed to the repository — Skylift's image scanner fails the build if it detects a credential-shaped string in a layer. Configuration that is not secret lives in the per-environment config maps in the repo. Rotation schedules and incident handling for leaked credentials are owned by Security; see the Security Runbook.

## Deploy checklist

1. Confirm your change soaked in staging for at least one hour.
2. Check the freeze calendar — no production deploys in the last two business days of the quarter without VP Engineering approval.
3. Outside 09:00–17:00 UK time, page on-call first.
4. Promote with `acme-cli deploy --env production --release <release-id>`.
5. Watch the health-check window (5 minutes) and the error-rate panel.
6. If something looks wrong within 30 minutes, `acme-cli rollback --to <release-id>`; after that, forward-fix.

## Observability during rollout

Every deploy is annotated automatically on the Grafana dashboards, so a metric change can be correlated with the release that caused it. During a rollout, watch three panels: the error-rate panel that drives auto-rollback, p95 latency, and the saturation panel for the service you are shipping. Skylift posts the deploy status, the release id, and a dashboard link into `#deploys` at the start and end of every rollout, and tags the Release Captain if the health-check window ends with warnings. If you notice a regression that the automatic checks did not catch, say so in `#deploys` first, then roll back — communication precedes action so nobody double-rolls the same release.

## Ownership

The Deploy Guide is owned by the Platform team. Propose changes by pull request against `docs/deploy-guide.md`; the Release Captain of the week reviews them.
