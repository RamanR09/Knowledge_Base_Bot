# Acme Billing Policy

This policy defines Acme's subscription plans, pricing, invoicing, refunds, and overage billing. It is the source of truth for what customers pay. Technical limits attached to each plan (request rate limits, monthly API call quotas) are defined in the API Reference; this document defines what those limits cost.

## Plans and pricing

| Plan | Monthly price | Included seats | Contract |
|---|---|---|---|
| Starter | **$49/month** | 5 seats | Monthly, self-serve |
| Growth | **$199/month** | 25 seats | Monthly, self-serve |
| Enterprise | Custom quote | Custom | **Annual contract**, sales-led |

Additional seats beyond the included allowance cost **$12 per seat per month on Starter** and **$9 per seat per month on Growth**. Enterprise seat pricing is set in the order form. A team that needs more than 5 but at most 25 seats fits the Growth plan without any per-seat add-ons.

## Invoicing

Invoices are issued at **fiscal quarter close** with **net-30** payment terms. Acme's fiscal quarters end on **March 31, June 30, September 30, and December 31**. Self-serve plans are charged to the card on file monthly; the quarterly invoice consolidates seat add-ons and API overage for customers who pay by invoice. Because invoice generation runs at quarter close, Engineering freezes production deploys during the final two business days of each quarter (see the Deploy Guide for the freeze rules).

## API overage

Each plan includes a monthly API call quota, defined per plan in the API Reference. Calls above the included quota are billed at **$0.50 per 1,000 calls**, metered daily and settled on the next invoice. Overage is never throttled silently: customers at 80% and 100% of quota receive email alerts to the billing contact. Enterprise plans have unlimited API calls and accrue no overage.

## Refunds

- Monthly self-serve plans (Starter, Growth): refunds are **pro-rated within 14 days of a renewal charge**. After 14 days the charge is final, but you may cancel to prevent future renewals.
- **Enterprise annual contracts are non-refundable.** Early termination is governed by the order form, not this policy.
- Duplicate charges and billing errors are refunded in full regardless of timing — contact billing@acme.dev.

## Upgrades and downgrades

Upgrades take effect immediately: the price difference is pro-rated for the remainder of the current billing period, and new plan limits apply as soon as the payment succeeds. **Downgrades take effect at the next billing cycle** — you keep the higher plan's limits until the period you already paid for ends. Downgrading below your current seat count requires deactivating seats first.

## Taxes and currency

All prices are in USD and exclude VAT/sales tax, which is added at checkout where Acme is registered to collect it. Enterprise invoices can be denominated in EUR or GBP on request, converted at the rate on the order form date.

## Dunning and suspension

Failed card payments are retried on day 1, day 3, and day 7. After the third failed retry the workspace enters read-only mode; after 30 days of non-payment it is suspended. Data is retained for 90 days after suspension and then scheduled for deletion.

## Trials

Every self-serve workspace starts with a 14-day free trial of the Growth plan. No card is required to start a trial; at the end of the trial the workspace must choose a paid plan or it reverts to a read-only state until one is selected. Trial workspaces get full plan limits but are marked as trials on any invoices. One trial per company domain — additional workspaces on the same domain start on the plan the first workspace chose.

## Discounts

Annual prepayment on self-serve plans earns a 10% discount, applied at checkout. Registered non-profits and accredited educational institutions qualify for a 25% discount on Starter and Growth with proof of status; discounts do not stack with each other or with negotiated Enterprise pricing.

## Contact

Billing questions go to billing@acme.dev. Disputes must be raised within 60 days of the invoice date. Sales handles Enterprise quotes and renewals; the Support team can apply goodwill credits up to $200 without Finance approval.
