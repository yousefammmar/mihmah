# Payment provider research (Jordan)

Researched 2026-10-25 from official provider and regulator pages only. Each claim cites the numbered URL list at the end. Nothing here has been confirmed with a provider's sales team. Until a provider and merchant account are confirmed, the app runs with `PAYMENTS_PROVIDER=none` and no money moves (see `server/lib/payments.js`).

Legend: **Doc** = officially documented · **No** = officially not supported · **Unclear** = needs sales confirmation.

## Recommendation

1. **PayTabs (Jordan).** The only candidate whose official docs cover all five needs on a Jordan endpoint: JOD processing [8], auth-then-capture [6], refunds [7], split payouts [3][4], and batch payouts to third-party IBANs [5]. The catch is that split payouts are "only available for PSP merchants… who signed up through the bank directly", with the bank handling KYC [3]. Onboarding would therefore go through a Jordanian partner bank.
2. **MEPS.** A CBJ-licensed Jordanian PSP [26]. Its gateway takes cards, wallets and CliQ QR, and its "Pay In / Pay Out" offers "real-time funding and withdrawals to bank accounts and mobile wallets" [24]. This is the strongest documented local route for student payouts.

**Fallback for payouts:** a business wallet with Dinarak, Zain Cash or Orange Money (all CBJ-licensed), or outgoing CliQ transfers from Mihmah's own bank [26][28].

**Ruled out:** Stripe, because Jordan is not a supported country [1][2]. Tap, because its support page says it accepts no new Jordanian merchants [14].

## Per provider

| Provider | Collect in Jordan / JOD | Platform fee / split | Payouts to individuals in Jordan | Refunds | Escrow / delayed capture |
|---|---|---|---|---|---|
| Stripe | No. Jordan not supported; the only Middle East country is the UAE [1] | No [1] | No. Cross-border payouts only to US/UK/EEA/CA/CH [2] | n/a | n/a |
| PayTabs | Doc. Jordan row lists "USD, JOD, SAR, EUR, AED, ILS" [8]; Jordan endpoint [5] | Doc, limited to bank-onboarded merchants and enabled by an account manager [3][4] | Doc for third-party IBAN batches [4][5]. Rules for individual payees: Unclear | Doc [7] | Delayed capture: Doc, holds "typically… 7 to 14 days" [6]. Escrow: Unclear |
| HyperPay | Doc that it serves Jordan [10]. JOD: Unclear | Unclear. HyperSplit exists [11] and the API has marketplace fields [13]; Jordan not stated | Unclear [11] | Doc, full or partial [12] | Delayed capture: Doc [12]. Escrow: Unclear |
| Tap | No. "We currently do not accept any new merchants from Egypt, Jordan, or Lebanon" [14]. Its marketing page conflicts [16] | Marketplace docs exist; needs commercial registration [17] | No. Payouts only to SA, KW, BH, AE, OM, QA [15] | Not verified | Delayed split documented in general, not for Jordan [17] |
| Checkout.com | Unclear. Jordan not named [20] | Unclear. Sub-entity schemas cover GB/EEA/US only [18][19] | Unclear (page returned 403) | Not verified | Unclear |
| Amazon Payment Services | Doc. Available in Jordan; acquirer Network International; settles in local currency or USD [21] | Unclear. Settlement account must be the merchant's own company [21] | Unclear | Doc [21] | Delayed capture: Doc, "usually 5-7 days maximum" [22] |
| Network International / N-Genius | CBJ-licensed in Jordan for POS and eFAWATEERcom [26]. Online gateway for Jordan: Unclear (403) | Unclear | Unclear | Doc [23] | Delayed capture: Doc, auth plus partial capture [23] |
| MEPS | Doc. Cards, wallets and CliQ QR [24][25]. JOD not named | Unclear | Doc. Pay Out to bank accounts and mobile wallets [24] | Unclear [25] | Unclear |
| CliQ (JoPACC) | Collection via CliQ QR through MEPS [24] | No | Doc. Instant transfers between accounts and wallets [28]. Accessed through banks or PSPs | Unclear (403) | No |
| Zain Cash / Orange Money / Dinarak | n/a | n/a | Doc. Business wallets used to "pay wages, transfer salaries", and by universities for student scholarships [28]. Bulk API: Unclear | n/a | n/a |

## Regulatory notes

- The Electronic Payment and Money Transfer Bylaw No. 111 of 2017 applies. The CBJ licensing guideline treats "money collection services… through e-Commerce portal" as a PSP-licensed activity [27]. No official page found addresses marketplace escrow specifically.
- The CBJ offers an optional pre-application meeting [27]. Use it to confirm whether holding company funds requires Mihmah's own licence or a licensed partner.
- The CBJ register lists MEPS, Network International Jordan, JoPACC, Zain Cash, Dinarak and Petra (Orange Money) [26]. PayTabs, HyperPay, Tap, Checkout.com and APS are not listed, so confirm each one's local licensing route.
- Card authorizations last only 5–14 days [6][22]. Multi-week escrow therefore means captured funds must sit with a licensed party.
- Wallet users must be 18+, or a minor with a guardian [28]. Tax, withholding and labour classification of student earnings were not researched.

## Questions for sales teams

1. Can you onboard a Jordan-registered marketplace that settles in JOD? Which CBJ licence or acquiring bank covers this?
2. Can each payment be split between our fee and a student with no commercial registration? What KYC do you need from payees?
3. Can you pay out to IBANs via CliQ, and to Zain Cash, Orange Money or Dinarak wallets? What are the fees, limits, speed and bulk API options?
4. Can captured funds be held until the company approves the work (days to weeks)? Who legally holds them?
5. What are the maximum authorization hold and the partial-capture rules? How do refunds work after a split or payout?
6. Who carries chargeback liability, and what reserves do you require?
7. Does your licence cover us as a sub-merchant or payfac, or do we need our own CBJ licence?
8. Do you support CliQ request-to-pay and eFAWATEERcom?
9. PayTabs: which Jordanian banks support the "PSP merchant" split-payout model?
10. Tap: is the "no new Jordanian merchants" note still current?

## How this maps to the code

- `server/lib/payments.js` defines the provider boundary and the allowed status transitions.
- `PAYMENTS_PROVIDER=none` (the default): payments stay `pending_integration` and the UI says so.
- `PAYMENTS_PROVIDER=sandbox` (development/demo only): statuses change only through simulated provider events from the admin area, recorded in `payment_events` with `source = provider_webhook`.
- The `payments.is_live` column is constrained to `false` in the schema. Enabling real money needs a new adapter, a migration and a review.

## URLs consulted (all opened 2026-10-25)

1. https://stripe.com/global
2. https://docs.stripe.com/connect/cross-border-payouts
3. https://docs.paytabs.com/manuals/PT-API-Endpoints/Deposit-and-Payouts/Split-Payouts/Step-1-Understanding-Workflow-and-Prerequisites/Split-Payouts-Prerequisites/
4. https://docs.paytabs.com/manuals/PT-API-Endpoints/Deposit-and-Payouts/Deposit-and-Payouts-Landing/
5. https://docs.paytabs.com/manuals/PT-API-Endpoints/Deposit-and-Payouts/External-Payouts/Step-2-Initiating-Payout-Requests/Step-2-Initiating-Payout-Requests-Landing/
6. https://docs.paytabs.com/manuals/PT-API-Endpoints/Integration-Types-Manuals/Hosted-Payment-Page/HPP-Step-7-Manage-Transactions/HPP-Step-7-Capture-Transaction/
7. https://docs.paytabs.com/manuals/PT-API-Endpoints/Integration-Types-Manuals/Hosted-Payment-Page/HPP-Step-7-Manage-Transactions/HPP-Step-7-Refund-Transaction/
8. https://ai.paytabs.com/en/faq/
9. https://ai.paytabs.com/en/jordan-payment-gateway/
10. https://www.hyperpay.com/frequently-asked-questions/
11. https://www.hyperpay.com/hypersplit/
12. https://hyperpay.docs.oppwa.com/integrations/backoffice
13. https://hyperpay.docs.oppwa.com/reference/parameters
14. https://support.tap.company/en/support/solutions/articles/153000140298-what-countries-are-supported-by-tap-payments-
15. https://support.tap.company/en/support/solutions/articles/153000140204-what-countries-does-tap-process-payouts-to-
16. https://www.tap.company/en-jo
17. https://developers.tap.company/docs/marketplace-overview
18. https://www.checkout.com/docs/platforms
19. https://www.checkout.com/docs/platforms/for-payfac/onboard-sub-entities/submit-application/onboard-with-the-api
20. https://www.checkout.com/solutions/international-coverage
21. https://paymentservices.amazon.com/support-center/faq
22. https://paymentservices.amazon.com/docs/managing-payments/capturing-payment
23. https://docs.ngenius-payments.com/docs/payment-actions
24. https://www.mepspay.com/point-of-sale-accruing
25. https://www.mepspay.com/e-commerce
26. https://www.cbj.gov.jo/EBV4.0/Root_Storage/AR/Domestic/A_general_register_of_licensed_companies.pdf
27. https://www.cbj.gov.jo/ebv4.0/root_storage/en/eb_list_page/licensing_guideline_for_electronic_payments_and_money_transfer_activities-0.pdf
28. https://www.jopacc.com/sites/default/files/2026-05/Mobile%20Wallets%20Handbook_EN.pdf

Could not access (403/404): jopacc.com CliQ service pages, jordan.network.global, Checkout.com bank-payout country article, dinarak.com/business-solutions.
