# Singapore launch checklist

This is an engineering and operating checklist, not legal advice. A Singapore-qualified lawyer and the appointed DPO must review the final data flows, contracts, public wording and fundraising model before launch.

## Corporate and accountability

- [ ] Choose and register the operating entity; obtain UEN/Corppass, maintain required registers, and appoint the company secretary within the applicable deadline. Start with the [ACRA post-registration guide](https://www.acra.gov.sg/register/business/after-registering/local-company/).
- [ ] Appoint a DPO and publish a monitored business contact and complaint route. The PDPC lists accountability, notification, consent, purpose, accuracy, protection, retention, transfer, access/correction and breach notification among the core obligations: [PDPC data protection obligations](https://www.pdpc.gov.sg/overview-of-pdpa/the-legislation/personal-data-protection-act/data-protection-obligations).
- [ ] Approve a DPIA covering precise location, images of bystanders, inferred caregiver routines, moderation evidence and cat identity errors.
- [ ] Maintain a data inventory, subprocesser list, retention schedule, access/correction workflow and consent-withdrawal workflow.

## Privacy and security release gates

- [ ] Give just-in-time notice before location/photo collection; do not bundle optional AI-training consent with contribution consent.
- [ ] Verify cross-border transfer safeguards and contracts for every cloud, email, analytics and AI provider.
- [ ] Complete penetration testing and RLS tests; rotate independent dev/staging/prod keys; prohibit service-role keys in clients.
- [ ] Prove public payloads, logs, analytics and push notifications contain no precise location.
- [ ] Schedule daily ciphertext destruction after 12 months and test deletion of photos, vectors, backups and derived caches.
- [ ] Maintain an incident assessment runbook. A notifiable breach must be reported to the PDPC as soon as practicable and no later than three calendar days after determination: [PDPC breach notification timing](https://www.pdpc.gov.sg/report-data-breach/before-you-report-a-data-breach-3/info).
- [ ] Document why each personal-data attribute is necessary for AI and minimise training data, consistent with the [PDPC AI guidelines](https://www.pdpc.gov.sg/-/media/files/pdpc/pdf-files/advisory-guidelines/advisory-guidelines-on-the-use-of-personal-data-in-ai-recommendation-and-decision-systems.pdf).

## Community and animal welfare

- [ ] Align terminology and operational escalation with AVS and partner caregivers. Singapore’s framework includes TNRM for community cats and encourages responsible caregiving: [AVS Cat Management Framework](https://avs.nparks.gov.sg/noticeboard/cat-management-framework/general-information/).
- [ ] Never present the app as the official AVS registry. Keep microchip identifiers private and verify authority before linking a record.
- [ ] Publish instructions for injured cats, urgent threats and responsible feeding; the app must not delay veterinary or emergency help.
- [ ] Obtain partner consent before naming a welfare group, Town Council, clinic or caregiver network.

## User-generated content and stores

- [ ] Publish terms and community rules; require acceptance before contribution.
- [ ] Filter unsafe uploads, provide in-app reporting, timely moderation, user blocking and public contact information. These are explicit Apple UGC expectations: [Apple App Review Guideline 1.2](https://developer.apple.com/app-store/review/guidelines/).
- [ ] Meet Google Play UGC requirements for terms, objectionable-content rules, reporting and blocking: [Google Play UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en-GB).
- [ ] Keep harmful-content and child-safety controls even if AnimalHelper is not a currently designated social media service; review the [IMDA online safety framework](https://www.imda.gov.sg/regulations-and-licences/regulations/codes-of-practice/codes-of-practice-and-guidelines---media).
- [ ] Complete store privacy labels/data safety forms from the actual production data flow, not design intent.

## Donations and partnerships

- [ ] Keep donations outside the MVP transaction flow until entity, beneficiary, accounting, refund and fraud controls are reviewed.
- [ ] For any online appeal targeting Singapore, disclose accurate beneficiary/purpose/fees and keep proper records. Online charitable appeals are regulated even when conducted by non-charities: [Charity Portal safer giving](https://www.charities.gov.sg/Pages/Fund-Raising/Safer-Giving.aspx).
- [ ] Do not claim tax deductibility unless the recipient and contribution qualify under current IRAS rules.
- [ ] Use a written agreement before raising for a charity/IPC and send funds directly to the beneficiary where required.

## Go/no-go owner sign-off

- [ ] Founder/product: scope and stop conditions.
- [ ] DPO/privacy: DPIA, notices, transfers, retention and incident drill.
- [ ] Safety/moderation: staffing, SLAs, escalation and appeals.
- [ ] ML owner: dataset consent/provenance and held-out gates.
- [ ] Legal/accounting: entity, terms, fundraising and tax wording.
- [ ] Engineering: native builds, RLS/security tests, observability, backups and rollback.

