create table if not exists public.legal_documents (
  slug text primary key check (slug in ('tos', 'privacy-policy', 'payment-policy')),
  title text not null,
  summary text not null default '',
  content text not null,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid null references auth.users(id) on delete set null
);

alter table public.legal_documents enable row level security;

create or replace function public.touch_legal_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists legal_documents_set_updated_at on public.legal_documents;
create trigger legal_documents_set_updated_at
before update on public.legal_documents
for each row
execute function public.touch_legal_documents_updated_at();

drop policy if exists legal_documents_public_read on public.legal_documents;
create policy legal_documents_public_read
on public.legal_documents
for select
to anon, authenticated
using (true);

drop policy if exists legal_documents_owner_write on public.legal_documents;
create policy legal_documents_owner_write
on public.legal_documents
for all
to authenticated
using (public.commerce_is_owner(auth.uid()))
with check (public.commerce_is_owner(auth.uid()));

insert into public.legal_documents (slug, title, summary, content)
values
  (
    'tos',
    'Terms of Service',
    'Rules for using Bloom Client, Bloom services, community features, hosted tools, and marketplace-connected functionality.',
    $tos$
Terms of Service

Last updated: April 5, 2026

1. Acceptance
By downloading, installing, accessing, or using Bloom Client, you agree to these Terms of Service. If you do not agree, do not use the software or any related services.

2. Eligibility
You must be legally able to enter into a binding agreement in your jurisdiction. If you are under the age of majority where you live, you may only use Bloom with permission and supervision from a parent or legal guardian.

3. What Bloom Provides
Bloom is a desktop launcher and related service platform for Minecraft-focused tooling and digital features, including instance management, downloads, cosmetics, hosted server tools, marketplace-connected experiences, scripting surfaces, and account-linked features. Some features depend on third-party providers, including Microsoft, Mojang, Supabase, payment processors, relay infrastructure, and external content hosts.

4. No Affiliation With Mojang or Microsoft
Bloom is an independent product. Unless expressly stated otherwise, Bloom is not endorsed by, sponsored by, or affiliated with Mojang Studios, Microsoft, or any game publisher, mod platform, or marketplace provider.

5. Accounts and Access
You are responsible for activity that occurs through your device, account session, linked account, or credentials.
You must provide accurate information where required.
You may not impersonate another person, evade suspensions, or access accounts or systems you do not own or control.
We may require authentication, verification, or additional checks for certain features.

6. Acceptable Use
You agree not to:
use Bloom for unlawful, fraudulent, abusive, deceptive, or malicious purposes;
interfere with security, networking, rate limits, infrastructure, or service availability;
reverse engineer or attempt to extract private keys, secrets, proprietary backend logic, or restricted service data except where non-waivable law permits;
upload, host, distribute, or link malware, spyware, credential stealers, infringing material, or content that violates another party's rights;
use automation, scraping, exploits, or abuse patterns that place unreasonable load on Bloom or connected services;
circumvent feature gates, ownership checks, licensing systems, purchase controls, or moderation decisions.

7. User Content and Uploaded Material
You retain ownership of content you lawfully own, but you grant Bloom a worldwide, non-exclusive, royalty-free license to host, cache, reproduce, process, adapt, display, transmit, and distribute that content as necessary to operate, secure, improve, moderate, and provide the service.
You represent that you have all rights needed to upload, use, distribute, or display your content.
We may remove, restrict, or disable content that we reasonably believe violates law, these Terms, platform rules, or another party's rights.

8. Mods, Packs, Third-Party Content, and Community Items
Bloom may index, surface, install, or help manage third-party mods, packs, servers, cosmetics, media, or user-generated content. We do not own or guarantee third-party content unless specifically stated.
Third-party items may change, break, disappear, become incompatible, or contain bugs.
Your use of third-party content may also be governed by separate licenses, community rules, or platform terms.

9. Hosted Server and Networking Features
Hosted server, tunnel, relay, or remote-access features are provided on an as-available basis.
You are solely responsible for the legality, security, moderation, and operation of servers or content you host or expose through Bloom.
Bloom may impose limits, logging, safety checks, abuse prevention measures, or feature suspensions to protect infrastructure, users, or legal compliance.

10. Software Updates and Remote Changes
Bloom may ship patches, configuration updates, content metadata changes, compatibility fixes, emergency shutdowns, security mitigations, and feature removals without prior notice where necessary for safety, compliance, or service continuity.
If you disable updates or modify the software, features may break or become unavailable.

11. Owner, Admin, and Staff Controls
Certain features may be reserved for owners, operators, moderators, or internal staff. Bloom may change, revoke, or limit elevated access at any time. Elevated users must use administrative tools responsibly and lawfully.

12. Intellectual Property
Bloom, its branding, software, interface design, code, text, graphics, databases, and service materials are protected by intellectual property laws. Except for rights expressly granted in these Terms, no rights are transferred to you.

13. Feedback
If you submit ideas, bug reports, suggestions, or feature requests, you grant Bloom a perpetual, irrevocable, worldwide, sublicensable, royalty-free right to use, modify, publish, and commercialize that feedback without compensation or attribution.

14. Termination and Suspension
We may suspend, restrict, or terminate access, remove content, disable features, or block devices or accounts at any time, with or without notice, if we reasonably believe that:
you violated these Terms;
your use creates legal, operational, security, payment, or reputational risk;
continued service is no longer commercially or technically reasonable.
Sections that by their nature should survive termination will survive.

15. Disclaimers
Bloom is provided on an "as is" and "as available" basis.
To the maximum extent permitted by law, Bloom disclaims all warranties, express or implied, including implied warranties of merchantability, fitness for a particular purpose, title, non-infringement, quiet enjoyment, availability, and error-free operation.
We do not guarantee uninterrupted service, successful downloads, compatibility with every device, mod, pack, server, or version, or that defects will always be corrected.

16. Limitation of Liability
To the maximum extent permitted by law, Bloom and its owners, affiliates, staff, contractors, licensors, and service providers will not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for any loss of profits, revenue, data, goodwill, business opportunity, digital items, or service availability, arising from or related to your use of Bloom.
If liability cannot be excluded, the total aggregate liability for claims relating to Bloom will not exceed the greater of the amount you paid to Bloom in the twelve months before the event giving rise to the claim or fifty U.S. dollars.

17. Indemnity
You agree to defend, indemnify, and hold harmless Bloom and its operators from claims, liabilities, damages, losses, and expenses, including reasonable attorneys' fees, arising out of or related to your content, your hosted services, your misuse of Bloom, your violation of these Terms, or your violation of another party's rights or applicable law.

18. Arbitration and Class Action Waiver
To the maximum extent permitted by applicable law, any dispute arising out of or relating to Bloom or these Terms will be resolved through binding individual arbitration rather than in court, except for small claims matters or requests for injunctive relief related to intellectual property or abuse.
You waive any right to participate in a class action, class arbitration, or representative proceeding.
If arbitration provisions are unenforceable where you live, disputes will be resolved exclusively in the courts specified by governing law below.

19. Governing Law
These Terms are governed by the laws of the State of California, excluding conflict-of-laws rules, except where local consumer law requires otherwise.

20. Changes to These Terms
We may update these Terms from time to time. Updated versions become effective when published in Bloom or through related service surfaces. Continued use after changes take effect means you accept the updated Terms.

21. Contact
For legal notices, support escalations, or policy questions, use the support or contact channel designated by Bloom.
$tos$
  ),
  (
    'privacy-policy',
    'Privacy Policy',
    'How Bloom collects, uses, stores, shares, secures, and deletes account, device, payment-adjacent, and service data.',
    $privacy$
Privacy Policy

Last updated: April 5, 2026

1. Scope
This Privacy Policy explains how Bloom Client and related services collect, use, disclose, and retain information when you use the app, linked services, hosted tools, support channels, and community-connected features.

2. Information We Collect
We may collect:
account identifiers such as user IDs, usernames, display names, linked Microsoft or Minecraft profile identifiers, and authentication state;
device and app data such as IP address, coarse location derived from IP, device type, operating system, app version, crash data, logs, diagnostics, and feature usage events;
content and files you choose to upload, create, or sync, including cosmetics, images, scripts, server data, and related metadata;
commerce and transaction-adjacent data such as wallet balances, purchase records, order references, payment status, refund status, chargeback status, and entitlement records;
communications you send to Bloom, including support tickets, bug reports, moderation appeals, and feedback.

3. Information From Third Parties
We may receive data from Microsoft, Mojang, payment processors, content hosts, authentication providers, relay services, analytics providers, fraud systems, or marketplace partners. The information we receive depends on the permissions, settings, and integrations involved.

4. How We Use Information
We use information to:
provide, maintain, secure, and improve Bloom;
authenticate users and sync ownership, entitlements, or profile-linked features;
process purchases, detect fraud, investigate abuse, enforce policies, and resolve disputes;
operate hosting, relay, update, marketplace, moderation, and support systems;
comply with legal obligations and protect rights, safety, and infrastructure.

5. Legal Bases
Where required by law, we process information based on one or more of the following: performance of a contract, legitimate interests, consent, legal obligation, and protection against fraud, abuse, or security threats.

6. Sharing of Information
We may share information:
with service providers and infrastructure partners that help us host, authenticate, store, moderate, secure, support, or process transactions;
with marketplace, payment, or fraud partners when needed to complete purchases or investigate abuse;
with law enforcement, regulators, courts, or other parties when required by law or reasonably necessary to protect rights, safety, property, or users;
in connection with a merger, financing, acquisition, sale of assets, or reorganization.
We do not sell personal information for money. We may still disclose data to vendors or partners for operational purposes as permitted by law.

7. Public and Shared Content
If you submit content to shared, hosted, or community-visible areas, that content and related metadata may be visible to other users, administrators, or recipients you choose.

8. Data Retention
We keep information for as long as reasonably necessary to operate the service, comply with law, resolve disputes, enforce agreements, prevent fraud, and maintain security or backup integrity. Retention periods may vary by data type, account status, payment history, moderation history, and legal requirements.

9. Security
We use reasonable administrative, technical, and organizational measures to protect information, but no system is perfectly secure. You are responsible for protecting your own devices, credentials, and exported data.

10. International Processing
Your information may be processed and stored in countries other than where you live. Those locations may have different data protection laws. Where required, we use appropriate safeguards for cross-border transfers.

11. Children
Bloom is not directed to children under 13, or a higher minimum age where local law applies. If we learn that we collected personal information from a child without valid authorization where required, we may delete it.

12. Your Rights
Depending on where you live, you may have rights to request access, correction, deletion, portability, restriction, objection, or withdrawal of consent. You may also have the right to appeal certain decisions. We may need to verify your identity before fulfilling a request and may deny or limit requests where permitted by law.

13. U.S. State Privacy Disclosures
Residents of certain U.S. states, including California, may have additional rights regarding access, deletion, correction, and certain disclosures about categories of collected data, sources, purposes, and third-party sharing.

14. Cookies and Similar Technologies
Bloom desktop features may use local storage, cached data, session tokens, device identifiers, and similar technologies to keep you signed in, remember settings, provide security, and improve functionality.

15. Sensitive Information
Please do not submit sensitive personal information unless it is necessary and specifically requested. If you do provide sensitive information, you consent to its processing for the purpose it was provided, subject to applicable law.

16. Changes to This Policy
We may update this Privacy Policy from time to time. Updated versions become effective when published through Bloom or related service surfaces.

17. Contact and Requests
For privacy questions or rights requests, use the contact path designated by Bloom and include enough detail for us to verify and process the request.
$privacy$
  ),
  (
    'payment-policy',
    'Payment Policy',
    'Rules for digital purchases, wallets, entitlements, refunds, disputes, billing errors, and chargeback handling.',
    $payment$
Payment Policy

Last updated: April 5, 2026

1. Scope
This Payment Policy applies to purchases, wallet credits, digital cosmetics, digital goods, premium features, subscriptions if later offered, hosted services, and other paid or value-linked Bloom products.

2. Digital Product Nature
Bloom primarily offers digital goods and services. Unless local law requires otherwise, digital purchases are delivered electronically and may become available immediately after payment confirmation.

3. Pricing and Taxes
Prices may be shown in U.S. dollars or another supported currency.
Taxes, fees, exchange charges, processor charges, and local duties may apply depending on your location and payment method.
Bloom may change prices, product contents, bundle structures, bonuses, or availability at any time before purchase.

4. Wallets, Credits, and Virtual Balances
Wallet credits, virtual balances, points, or Bloom Bucks are limited-license digital items for use within Bloom services where offered.
They are not bank accounts, are not legal tender, have no cash value except where required by law, and are not redeemable, transferable, or resellable except where Bloom expressly allows it.
Bloom may correct balances for fraud, abuse, technical errors, refunds, reversals, or chargebacks.

5. Purchase Authorization
By submitting a purchase, you authorize Bloom and its payment providers to charge the selected payment method for the total amount due, including applicable taxes and fees.

6. Order Review and Fraud Prevention
Bloom may delay, reject, cancel, limit, or reverse transactions if we suspect fraud, abuse, unauthorized activity, payment processor risk, policy violations, or technical failure.

7. Delivery and Entitlements
Most digital entitlements are issued automatically after payment confirmation, but delays can occur because of processor review, network issues, or platform outages.
Bloom is not responsible for delays caused by third-party payment processors, banks, card networks, or platform providers.

8. Refunds
Except where required by law, all purchases of digital goods, wallet credits, virtual currency, cosmetics, instant-delivery items, and consumed services are final and non-refundable.
Refunds may be considered, in Bloom's sole discretion, for duplicate charges, proven technical delivery failures, unauthorized transactions, or cases where required consumer law applies.
If a refund is granted, Bloom may revoke associated entitlements, remove delivered content, reduce wallet balances, or suspend related accounts until negative balances or reversals are resolved.

9. Chargebacks and Payment Disputes
Before filing a chargeback, contact Bloom support to resolve the issue.
If you initiate a chargeback or payment dispute, Bloom may suspend your account, revoke entitlements, remove wallet balances, block future purchases, or require additional verification.
We reserve the right to challenge illegitimate chargebacks and recover associated costs to the extent permitted by law.

10. Subscription and Recurring Billing
If Bloom later offers subscriptions or recurring services, those plans will renew automatically until canceled unless stated otherwise. Billing terms, renewal timing, cancellation deadlines, and pro-rating rules will be disclosed at purchase or in the applicable offer terms.

11. Promotional Credits and Bonuses
Promotional credits, bonuses, gifts, or campaign rewards may expire, may be limited in use, and may be revoked if issued by mistake, obtained through abuse, or linked to a refunded or reversed transaction.

12. User Responsibilities
You are responsible for:
providing accurate billing information;
using a payment method you are authorized to use;
reviewing product details before purchase;
keeping your account and device secure.

13. No Investment or Stored Value Promise
Digital goods, cosmetics, wallet balances, and entitlements are provided for entertainment and service access only. They are not investments, stored-value accounts, securities, or financial instruments.

14. Resale and Transfer Restrictions
Unless Bloom expressly allows it in writing, you may not resell, trade, transfer, broker, or commercially exploit digital purchases, entitlements, accounts, or wallet balances.

15. Payment Processor Terms
Payments may be handled by third-party processors. Your transaction may also be subject to that processor's terms, privacy practices, and fraud checks.

16. Errors and Corrections
Bloom may correct pricing mistakes, fulfillment mistakes, accounting errors, duplicate grants, display bugs, or transaction mismatches, including after a transaction has been submitted where permitted by law.

17. Policy Updates
We may update this Payment Policy from time to time. Updated terms apply to future purchases when published. Continued use of paid features after publication may be subject to the updated policy where permitted by law.

18. Contact
For billing support, purchase disputes, refund requests, or unauthorized transaction reports, use the support path designated by Bloom as soon as possible after the issue is discovered.
$payment$
  )
on conflict (slug) do nothing;

grant select on public.legal_documents to anon, authenticated;
