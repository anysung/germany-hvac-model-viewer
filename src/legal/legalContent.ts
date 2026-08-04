/**
 * The four public policies, in the three UI languages.
 *
 * Plain data, no country branches: DE/GB/FR (and any market added later) render
 * the same documents from the same keys.
 *
 * The Legal Notice (`imprint`) publishes the verified operator identity — trading
 * name, owner, registered address, business registration number and merchant of
 * record — and the Terms and Privacy documents name the operator where it belongs
 * (operator provision / data controller). All of these read the SAME facts from
 * config/legal.ts, so every country edition is identical and nothing is invented.
 * The facts themselves are never translated; only the headings and the
 * surrounding sentences are. Nothing beyond the specified public business
 * information (no personal ID, tax-office data, certificate numbers, etc.) is
 * shown, and there are no "to be completed" placeholders.
 */
import { Language } from '../types';
import {
  PRIVACY_VERSION, SERVICE_NAME, SUPPORT_EMAIL, TERMS_VERSION,
  BRAND_TM, OPERATOR_NAME, OPERATOR_OWNER, BUSINESS_REG_NUMBER, BUSINESS_ADDRESS_LINES, PADDLE_ENTITY,
} from '../config/legal';

export type LegalSection = { h: string; p: string[] };
export type LegalDocContent = { title: string; updated: string; intro?: string; sections: LegalSection[] };

const ver = { terms: TERMS_VERSION, privacy: PRIVACY_VERSION };

/* ── Legal Notice builder ─────────────────────────────────────────────────────
 * The operator identity is published once, from the shared constants, so the
 * Legal Notice is identical across every country edition and cannot drift. Only
 * the headings, the sole-proprietorship label and the two explanatory sentences
 * are localized; the trading name, owner, address, registration number and email
 * are used verbatim. */
type ImprintLabels = {
  title: string;
  /** Short inline label for the operator's personal name — shown in
   *  parentheses under the address (owner 2026-08-04: the name must be
   *  PRESENT and legible for the German Impressum, but carries no separate
   *  heading; a side-business operator's name gets no more prominence than
   *  the law requires). */
  operator: string; ownerShort: string; address: string; regNo: string;
  contact: string; brand: string; payment: string;
  soleProp: string; emailLabel: string;
  brandSentence: string; paymentSentence: string;
};

function buildImprint(L: ImprintLabels): LegalDocContent {
  return {
    title: L.title,
    updated: ver.terms,
    sections: [
      { h: L.operator, p: [OPERATOR_NAME, L.soleProp] },
      { h: L.address, p: [...BUSINESS_ADDRESS_LINES, `(${L.ownerShort}: ${OPERATOR_OWNER})`] },
      { h: L.regNo, p: [BUSINESS_REG_NUMBER] },
      { h: L.contact, p: [`${L.emailLabel} ${SUPPORT_EMAIL}`] },
      { h: L.brand, p: [L.brandSentence] },
      { h: L.payment, p: [L.paymentSentence] },
    ],
  };
}

/* ── English ────────────────────────────────────────────────────────────── */

const EN = {
  privacy: {
    title: 'Privacy Policy',
    updated: ver.privacy,
    intro:
      `${SERVICE_NAME} is a web-based professional database service for the European heat-pump industry. This policy explains what we process when you use the service, and why. We collect the minimum needed to run a professional account.`,
    sections: [
      {
        h: 'Account information we collect',
        p: [
          'When you register we collect: first name, last name, email address and a password (stored only as a hash by Firebase Authentication — we never see it).',
          'We do not ask for a job role, how you heard about us, or any other personal detail that is not needed to operate the account.',
        ],
      },
      {
        h: 'Company information we collect',
        p: [
          'Required: company name and company type. Optional: company city and company website. If you select "Other" as your company type, we store the short description you enter.',
          'Individual professionals and sole traders enter their own name or registered trading name as the company name.',
          'Your registration country is taken automatically from the country edition you sign up on. We do not ask you for it.',
        ],
      },
      {
        h: 'Purpose of processing',
        p: [
          'Providing the database service and your account; identifying professional users; operating team subscriptions (seats, invitations); billing through our payment provider; answering support inquiries; securing the service against misuse and unauthorised data extraction.',
        ],
      },
      {
        h: 'Legal basis',
        p: [
          'Performance of a contract (Art. 6(1)(b) GDPR) for the account, the subscription and support; legitimate interests (Art. 6(1)(f) GDPR) for security, fraud prevention and protection of the database; legal obligations (Art. 6(1)(c) GDPR) for accounting and tax records held by our payment provider.',
        ],
      },
      {
        h: 'Processors and services we use',
        p: [
          'Firebase Authentication (Google) — sign-in and password handling.',
          'Firebase Firestore, Cloud Storage and Hosting (Google) — account data, product datasets and delivery of the application.',
          'Firebase App Check with reCAPTCHA Enterprise (Google) — verifies that requests come from our application and blocks automated extraction.',
          'Paddle — our payment provider and merchant of record. Paddle collects and processes your payment data; we never receive or store card details.',
        ],
      },
      {
        h: 'Billing and merchant of record',
        p: [
          'Subscriptions are sold on the web through Paddle, which acts as merchant of record. Paddle handles payment, invoicing and applicable VAT and is the controller for the payment data it collects. We store only what we need to link your account to your subscription and to support you.',
        ],
      },
      {
        h: 'Support inquiries',
        p: [
          'Inquiries you send from the Account page are stored with your account so our support team can answer and so you can read the reply in the app.',
        ],
      },
      {
        h: 'Security and fraud prevention',
        p: [
          'Accounts are personal and may not be shared. We log account activity to detect account sharing and unauthorised extraction of the database. Product data is served only to signed-in, approved accounts.',
        ],
      },
      {
        h: 'Product usage analytics (first-party, cookieless)',
        p: [
          'To understand which features are used and where searches fail, the app records a small set of usage events first-party: search performed, search with no results, product opened, listing status viewed, comparison opened, and data sheet exported.',
          'Events carry a timestamp, market, interface language, device class (phone/tablet/desktop), subscription tier, a random per-session identifier and a one-way hashed account reference. They never contain your name, email address, IP address, company data or free-typed search text (queries are reduced to normalised tokens with numbers and address-like fragments removed).',
          'No cookies are set for this purpose and no third-party analytics service receives the data; it is stored with our EU-region infrastructure providers listed above and deleted automatically after 13 months. Legal basis: our legitimate interest in operating and improving a professional service (Art. 6(1)(f) GDPR). You may object at any time via the support address below.',
        ],
      },
      {
        h: 'Data retention',
        p: [
          'Account and company data are kept while your account exists. After deletion we retain only what we must for legal, accounting or evidence purposes; billing records are retained by Paddle for statutory periods.',
          'To prevent repeated free-trial use and misuse of the service, we keep a minimal record of the email address used to register for up to one year after account deletion (legitimate interest, Art. 6(1)(f) GDPR). It is used only to check free-trial eligibility and is deleted automatically after that period.',
        ],
      },
      {
        h: 'Data Controller',
        p: [
          `${OPERATOR_NAME} operates ${BRAND_TM} and is the controller for the personal data described in this policy. Operator details are set out in the Legal Notice.`,
          'Registered business address: Seongbuk-gu, Seoul, South Korea (Republic of Korea) — full address in the Legal Notice.',
          `Email: ${SUPPORT_EMAIL}`,
        ],
      },
      {
        h: 'Account deletion',
        p: [
          'You can request deletion at any time from the Account page. Deleting your HeatPump DataBase account does not cancel a subscription — billing must be cancelled separately through Manage billing.',
        ],
      },
      {
        h: 'Your rights',
        p: [
          'Under the GDPR you may request access, rectification, erasure, restriction, portability, and object to processing based on legitimate interests. You may also lodge a complaint with a supervisory authority.',
        ],
      },
      {
        h: 'International processing',
        p: [
          'Our providers may process data outside the EEA. Where that happens, transfers rely on the safeguards those providers offer (including EU Standard Contractual Clauses).',
          'Our operator is established in South Korea (Republic of Korea) and may process your personal data there. Such transfers of EEA and UK user data rely on appropriate safeguards recognised under EU and UK data-protection law — including the adequacy decisions for the Republic of Korea and, where applicable, Standard Contractual Clauses. You can request details of these safeguards using the contact below.',
        ],
      },
      { h: 'Contact', p: [`Use New inquiry on the Account page, or email ${SUPPORT_EMAIL}.`] },
    ],
  },
  terms: {
    title: 'Terms of Use',
    updated: ver.terms,
    intro: `${BRAND_TM} is a software service operated by ${OPERATOR_NAME}, a registered sole proprietorship. Full operator, registration and contact information is available in our Legal Notice. These terms govern your use of the service, a professional web-based B2B database service — please read them before you register.`,
    sections: [
      { h: 'The service', p: [`${SERVICE_NAME} is a professional, web-based subscription service for the European heat-pump industry, operated by ${OPERATOR_NAME}. Subscriptions are purchased on the web and billed by Paddle. Full operator and registration details are in our Legal Notice.`] },
      { h: 'Account eligibility', p: ['Accounts are intended for professional use (manufacturers, wholesalers, installers, engineers, consultancies, housing, public sector, sole traders and comparable roles). New accounts are reviewed before activation.'] },
      { h: 'Account responsibility', p: ['You are responsible for your credentials and for everything done under your account. Keep your password confidential.'] },
      {
        h: 'One account per person',
        p: [
          'Each account is strictly personal and may be used by one individual only. Sharing an account is a breach of these terms and may lead to closure without prior notice and without a refund for the remaining period.',
          'Companies with several users must use a Team plan, which provides one account per person.',
        ],
      },
      {
        h: 'Team plans, seats and owners',
        p: [
          'Team 3 provides three seats and Team 5 provides five seats, in each case including the purchaser. The purchaser becomes the team owner and is responsible for the subscription, for billing and for who occupies the seats.',
          'Active members plus open invitations may never exceed the seat limit. The owner may remove a member at any time; the removed person immediately loses access to the team subscription but keeps their personal account.',
          'A team member may leave the team at any time. Leaving frees the seat and does not cancel the team subscription.',
        ],
      },
      {
        h: 'Free trial',
        p: [
          'Every subscription starts with a 7-day free trial. A valid payment method is required to start the trial. Nothing is charged during the trial.',
          'If you do not cancel before the trial ends, the first payment is taken and the subscription begins.',
        ],
      },
      {
        h: 'Billing, renewal and changes',
        p: [
          'Subscriptions are offered on monthly, 6-month and annual billing terms and renew automatically at the end of each period until cancelled.',
          'Plan and billing term are fixed for the paid period. Changes do not take effect mid-term: a change you request applies from the next renewal, and the new conditions begin only once the current period has ended.',
          'You may cancel at any time. Cancellation stops the next renewal; access continues until the end of the period you have paid for.',
        ],
      },
      { h: 'Payments', p: ['Payments are processed by Paddle, which acts as merchant of record and issues invoices including any applicable VAT.'] },
      {
        h: 'Acceptable use and database protection',
        p: [
          'The database is protected under European database law. You may use the data only in the presentation forms this application offers (in particular the search, comparison views and generated data sheets), and only for your own professional purposes.',
          'Scraping, bulk extraction, automated collection, reproduction, redistribution, use for AI training, and any commercial re-use of the database or a substantial part of it are prohibited without prior written consent.',
          'Attempts to circumvent technical protection measures, or to access the datasets outside the application, lead to account closure and may result in civil and criminal liability.',
        ],
      },
      { h: 'Service availability', p: ['We aim for high availability but do not guarantee uninterrupted service. Maintenance, updates and third-party outages may interrupt access.'] },
      {
        h: 'Data accuracy',
        p: [
          'Product data originates from public registries and manufacturer sources and is provided for professional information only. Eligibility for public funding is decided solely by the responsible authority. Always verify against the official source before making commercial or technical decisions.',
        ],
      },
      { h: 'Liability', p: ['To the extent permitted by law, we are not liable for indirect or consequential loss, or for decisions taken on the basis of the data provided. Nothing in these terms excludes liability that cannot be excluded by law.'] },
      { h: 'Termination and suspension', p: ['We may suspend or close accounts that breach these terms, in particular account sharing and unauthorised data extraction. You may stop using the service at any time and request deletion of your account.'] },
      { h: 'Contact', p: [`Questions about these terms: ${SUPPORT_EMAIL}, or New inquiry on the Account page.`] },
    ],
  },
  refund: {
    title: 'Refund and Cancellation Policy',
    updated: ver.terms,
    intro: `This policy explains what happens when you cancel your ${SERVICE_NAME} subscription, and when a refund is or is not due. Paddle is our merchant of record and handles all payments.`,
    sections: [
      { h: 'During the free trial', p: ['Every subscription begins with a 7-day free trial. Nothing is charged during the trial. Cancel before the trial ends and no payment is taken.'] },
      { h: 'After the trial', p: ['If you do not cancel before the trial ends, the first payment is taken and the paid period begins.'] },
      { h: '14-day refund on your first payment', p: [`If your first payment is taken after the free trial, you may request a full refund of that first payment within 14 days of the charge, for any reason. Send a New inquiry from the Account page or email ${SUPPORT_EMAIL}, and we will process it with Paddle. This 14-day right applies to the first payment only; later renewals are governed by the sections below.`] },
      {
        h: 'Cancelling a paid subscription',
        p: [
          'You may cancel at any time. Cancellation stops the next renewal — it does not end the current period.',
          'Access continues until the end of the period you have already paid for.',
        ],
      },
      { h: 'Unused time', p: ['We do not automatically refund unused time on a period that has already been paid for.'] },
      {
        h: 'How to cancel',
        p: [
          'Cancel through Manage billing on the Account page.',
          'Deleting your HeatPump DataBase account does NOT cancel your subscription. Billing is handled separately and must be cancelled through Manage billing.',
        ],
      },
      { h: 'Exceptional refunds', p: [`If you believe your case is exceptional (for example a duplicate charge), send a New inquiry from the Account page or email ${SUPPORT_EMAIL}, and we will review it with Paddle.`] },
      { h: 'Merchant of record', p: [`Subscription payments are processed by ${PADDLE_ENTITY}, acting as merchant of record for all subscriptions. Invoices and VAT receipts are issued by Paddle. Refund and cancellation requests can be sent to ${SUPPORT_EMAIL}.`] },
    ],
  },
  imprint: buildImprint({
    title: 'Legal Notice',
    operator: 'Service Operator',
    ownerShort: 'Operator',
    address: 'Registered Business Address',
    regNo: 'Business Registration Number',
    contact: 'Contact',
    brand: 'Product and Brand',
    payment: 'Payment Processing',
    soleProp: 'Sole proprietorship',
    emailLabel: 'Email:',
    brandSentence: `${BRAND_TM} is a product brand operated by ${OPERATOR_NAME}.`,
    paymentSentence: `Subscription payments are processed by ${PADDLE_ENTITY}, acting as the merchant of record.`,
  }),
};

/* ── German ─────────────────────────────────────────────────────────────── */

const DE = {
  privacy: {
    title: 'Datenschutzerklärung',
    updated: ver.privacy,
    intro:
      'HeatPump DataBase ist ein webbasierter, professioneller Datenbankdienst für die europäische Wärmepumpenbranche. Diese Erklärung beschreibt, welche Daten wir bei der Nutzung verarbeiten und warum. Wir erheben nur das Minimum, das für ein professionelles Konto erforderlich ist.',
    sections: [
      {
        h: 'Kontodaten',
        p: [
          'Bei der Registrierung erheben wir: Vorname, Nachname, E-Mail-Adresse und ein Passwort (wird ausschließlich als Hash von Firebase Authentication gespeichert — wir sehen es nie).',
          'Wir fragen weder nach einer Funktion/Position noch danach, wie Sie auf uns aufmerksam wurden, noch nach anderen persönlichen Angaben, die für den Betrieb des Kontos nicht erforderlich sind.',
        ],
      },
      {
        h: 'Unternehmensdaten',
        p: [
          'Erforderlich: Firmenname und Unternehmensart. Optional: Ort und Website. Bei Auswahl von „Sonstige“ speichern wir die von Ihnen eingegebene Kurzbeschreibung.',
          'Einzelunternehmer und selbstständige Fachleute tragen ihren eigenen Namen bzw. ihre eingetragene Geschäftsbezeichnung als Firmennamen ein.',
          'Das Registrierungsland wird automatisch aus der Länderausgabe übernommen, in der Sie sich registrieren. Wir fragen es nicht ab.',
        ],
      },
      {
        h: 'Zwecke der Verarbeitung',
        p: [
          'Bereitstellung des Datenbankdienstes und Ihres Kontos; Identifikation professioneller Nutzer; Betrieb von Team-Abonnements (Plätze, Einladungen); Abrechnung über unseren Zahlungsdienstleister; Beantwortung von Supportanfragen; Absicherung gegen Missbrauch und unbefugte Datenentnahme.',
        ],
      },
      {
        h: 'Rechtsgrundlagen',
        p: [
          'Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO) für Konto, Abonnement und Support; berechtigte Interessen (Art. 6 Abs. 1 lit. f DSGVO) für Sicherheit, Missbrauchsprävention und Schutz der Datenbank; rechtliche Verpflichtungen (Art. 6 Abs. 1 lit. c DSGVO) für die beim Zahlungsdienstleister geführten Buchhaltungs- und Steuerunterlagen.',
        ],
      },
      {
        h: 'Eingesetzte Dienste',
        p: [
          'Firebase Authentication (Google) — Anmeldung und Passwortverwaltung.',
          'Firebase Firestore, Cloud Storage und Hosting (Google) — Kontodaten, Produktdatensätze und Auslieferung der Anwendung.',
          'Firebase App Check mit reCAPTCHA Enterprise (Google) — stellt sicher, dass Anfragen aus unserer Anwendung stammen, und blockiert automatisierte Datenentnahme.',
          'Paddle — Zahlungsdienstleister und Merchant of Record. Paddle erhebt und verarbeitet Ihre Zahlungsdaten; wir erhalten und speichern keine Kartendaten.',
        ],
      },
      {
        h: 'Abrechnung und Merchant of Record',
        p: [
          'Abonnements werden im Web über Paddle verkauft. Paddle tritt als Merchant of Record auf, wickelt Zahlung, Rechnungsstellung und die anwendbare Umsatzsteuer ab und ist für die dabei erhobenen Zahlungsdaten verantwortlich. Wir speichern nur, was zur Zuordnung Ihres Abonnements zu Ihrem Konto und für den Support erforderlich ist.',
        ],
      },
      { h: 'Supportanfragen', p: ['Anfragen, die Sie über die Kontoseite senden, werden Ihrem Konto zugeordnet gespeichert, damit unser Support antworten kann und Sie die Antwort in der App lesen können.'] },
      {
        h: 'Sicherheit und Missbrauchsprävention',
        p: ['Konten sind personengebunden und dürfen nicht geteilt werden. Wir protokollieren Kontoaktivität, um Kontoteilung und unbefugte Datenentnahme zu erkennen. Produktdaten werden nur an angemeldete, freigegebene Konten ausgeliefert.'],
      },
      {
        h: 'Produkt-Nutzungsanalyse (First-Party, ohne Cookies)',
        p: [
          'Um zu verstehen, welche Funktionen genutzt werden und wo Suchen scheitern, zeichnet die App eine kleine Zahl von Nutzungsereignissen selbst auf: Suche ausgeführt, Suche ohne Treffer, Produkt geöffnet, Listenstatus angesehen, Vergleich geöffnet und Datenblatt exportiert.',
          'Ereignisse enthalten Zeitstempel, Markt, Oberflächensprache, Geräteklasse (Telefon/Tablet/Desktop), Abostufe, eine zufällige Sitzungskennung und eine einweg-gehashte Kontoreferenz. Sie enthalten niemals Namen, E-Mail-Adresse, IP-Adresse, Unternehmensdaten oder frei eingegebenen Suchtext (Suchanfragen werden auf normalisierte Begriffe reduziert; Zahlen und adressartige Fragmente werden entfernt).',
          'Es werden hierfür keine Cookies gesetzt und kein Drittanbieter-Analysedienst erhält die Daten; sie werden bei unseren oben genannten EU-Infrastrukturanbietern gespeichert und nach 13 Monaten automatisch gelöscht. Rechtsgrundlage: unser berechtigtes Interesse am Betrieb und an der Verbesserung eines professionellen Dienstes (Art. 6 Abs. 1 lit. f DSGVO). Sie können jederzeit über die unten genannte Support-Adresse widersprechen.',
        ],
      },
      {
        h: 'Speicherdauer',
        p: ['Konto- und Unternehmensdaten werden für die Dauer des Kontos gespeichert. Nach Löschung bewahren wir nur auf, was aus rechtlichen, buchhalterischen oder Nachweisgründen erforderlich ist; Abrechnungsunterlagen werden von Paddle für die gesetzlichen Fristen aufbewahrt.', 'Zur Verhinderung wiederholter kostenloser Testphasen und missbräuchlicher Nutzung speichern wir nach Kontolöschung für bis zu ein Jahr einen minimalen Eintrag der bei der Registrierung verwendeten E-Mail-Adresse (berechtigtes Interesse, Art. 6 Abs. 1 lit. f DSGVO). Er dient ausschließlich der Prüfung der Testphasen-Berechtigung und wird danach automatisch gelöscht.'],
      },
      {
        h: 'Verantwortlicher',
        p: [
          `${OPERATOR_NAME} betreibt ${BRAND_TM} und ist Verantwortlicher für die in dieser Erklärung beschriebenen personenbezogenen Daten. Angaben zum Betreiber finden Sie im Impressum.`,
          'Eingetragene Geschäftsanschrift: Seongbuk-gu, Seoul, Südkorea (Republik Korea) — vollständige Anschrift im Impressum.',
          `E-Mail: ${SUPPORT_EMAIL}`,
        ],
      },
      {
        h: 'Kontolöschung',
        p: ['Sie können die Löschung jederzeit auf der Kontoseite beantragen. Die Löschung Ihres HeatPump-Database-Kontos kündigt kein Abonnement — die Abrechnung muss separat über „Abrechnung verwalten“ gekündigt werden.'],
      },
      {
        h: 'Ihre Rechte',
        p: ['Nach der DSGVO können Sie Auskunft, Berichtigung, Löschung, Einschränkung und Datenübertragbarkeit verlangen sowie der auf berechtigten Interessen beruhenden Verarbeitung widersprechen. Zudem steht Ihnen ein Beschwerderecht bei einer Aufsichtsbehörde zu.'],
      },
      {
        h: 'Internationale Verarbeitung',
        p: [
          'Unsere Dienstleister können Daten außerhalb des EWR verarbeiten. Übermittlungen stützen sich in diesem Fall auf die Garantien dieser Anbieter (u. a. EU-Standardvertragsklauseln).',
          'Unser Betreiber hat seinen Sitz in Südkorea (Republik Korea) und kann Ihre personenbezogenen Daten dort verarbeiten. Solche Übermittlungen von Daten von Nutzern aus dem EWR und dem Vereinigten Königreich stützen sich auf geeignete Garantien nach EU- und UK-Datenschutzrecht — einschließlich der Angemessenheitsbeschlüsse für die Republik Korea und, soweit einschlägig, Standardvertragsklauseln. Einzelheiten zu diesen Garantien können Sie über den unten genannten Kontakt anfordern.',
        ],
      },
      { h: 'Kontakt', p: [`Nutzen Sie „Neue Anfrage“ auf der Kontoseite oder schreiben Sie an ${SUPPORT_EMAIL}.`] },
    ],
  },
  terms: {
    title: 'Nutzungsbedingungen',
    updated: ver.terms,
    intro: `${BRAND_TM} ist ein Softwaredienst, der von ${OPERATOR_NAME}, einem eingetragenen Einzelunternehmen, betrieben wird. Vollständige Angaben zu Betreiber, Registrierung und Kontakt finden Sie in unserem Impressum. Diese Bedingungen regeln die Nutzung des Dienstes, eines professionellen, webbasierten B2B-Datenbankdienstes — bitte lesen Sie sie vor der Registrierung.`,
    sections: [
      { h: 'Der Dienst', p: [`${SERVICE_NAME} ist ein professioneller, webbasierter Abonnementdienst für die europäische Wärmepumpenbranche, betrieben von ${OPERATOR_NAME}. Abonnements werden im Web erworben und über Paddle abgerechnet. Vollständige Angaben zu Betreiber und Registrierung finden Sie in unserem Impressum.`] },
      { h: 'Zulässige Nutzer', p: ['Konten sind für die professionelle Nutzung bestimmt (Hersteller, Großhandel, Installateure, Planung/Ingenieurbüros, Wohnungswirtschaft, öffentliche Hand, Einzelunternehmer und vergleichbare Rollen). Neue Konten werden vor der Freischaltung geprüft.'] },
      { h: 'Verantwortung für das Konto', p: ['Sie sind für Ihre Zugangsdaten und für alle unter Ihrem Konto vorgenommenen Handlungen verantwortlich. Halten Sie Ihr Passwort geheim.'] },
      {
        h: 'Ein Konto pro Person',
        p: [
          'Jedes Konto ist streng personengebunden und darf nur von einer Person genutzt werden. Die gemeinsame Nutzung stellt einen Vertragsverstoß dar und kann ohne Vorankündigung zur Schließung des Kontos führen — ohne Erstattung des verbleibenden Zeitraums.',
          'Unternehmen mit mehreren Nutzern benötigen einen Team-Tarif, der ein Konto pro Person bereitstellt.',
        ],
      },
      {
        h: 'Team-Tarife, Plätze und Team-Inhaber',
        p: [
          'Team 3 umfasst drei, Team 5 fünf Plätze — jeweils einschließlich des Käufers. Der Käufer wird Team-Inhaber und ist für Abonnement, Abrechnung und die Belegung der Plätze verantwortlich.',
          'Aktive Mitglieder zuzüglich offener Einladungen dürfen die Platzanzahl nie überschreiten. Der Inhaber kann Mitglieder jederzeit entfernen; die entfernte Person verliert sofort den Zugang zum Team-Abonnement, behält aber ihr persönliches Konto.',
          'Ein Teammitglied kann das Team jederzeit verlassen. Dadurch wird ein Platz frei; das Team-Abonnement wird nicht gekündigt.',
        ],
      },
      {
        h: 'Kostenlose Testphase',
        p: [
          'Jedes Abonnement beginnt mit einer 7-tägigen kostenlosen Testphase. Für den Start ist eine gültige Zahlungsmethode erforderlich. Während der Testphase erfolgt keine Abbuchung.',
          'Wird nicht vor Ablauf der Testphase gekündigt, erfolgt die erste Zahlung und das Abonnement beginnt.',
        ],
      },
      {
        h: 'Abrechnung, Verlängerung und Änderungen',
        p: [
          'Abonnements werden monatlich, halbjährlich oder jährlich abgerechnet und verlängern sich automatisch, bis sie gekündigt werden.',
          'Tarif und Abrechnungszeitraum sind für die bezahlte Periode fest. Änderungen werden nicht mitten im Zeitraum wirksam: Eine gewünschte Änderung gilt ab der nächsten Verlängerung; die neuen Konditionen beginnen erst nach Ablauf der laufenden Periode.',
          'Sie können jederzeit kündigen. Die Kündigung stoppt die nächste Verlängerung; der Zugang bleibt bis zum Ende der bezahlten Periode bestehen.',
        ],
      },
      { h: 'Zahlungen', p: ['Zahlungen werden von Paddle abgewickelt. Paddle ist Merchant of Record und stellt Rechnungen einschließlich anwendbarer Umsatzsteuer aus.'] },
      {
        h: 'Zulässige Nutzung und Datenbankschutz',
        p: [
          'Die Datenbank ist nach europäischem Datenbankrecht geschützt. Die Nutzung der Daten ist ausschließlich in den von dieser Anwendung angebotenen Darstellungsformen (insbesondere Suche, Vergleiche und generierte Datenblätter) und für eigene berufliche Zwecke gestattet.',
          'Scraping, Massenextraktion, automatisierte Erhebung, Vervielfältigung, Weiterverbreitung, Nutzung für KI-Training sowie jede kommerzielle Weiterverwendung der Datenbank oder wesentlicher Teile davon sind ohne vorherige schriftliche Zustimmung untersagt.',
          'Versuche, technische Schutzmaßnahmen zu umgehen oder außerhalb der Anwendung auf die Datensätze zuzugreifen, führen zur Kontoschließung und können zivil- und strafrechtliche Folgen haben.',
        ],
      },
      { h: 'Verfügbarkeit', p: ['Wir streben eine hohe Verfügbarkeit an, garantieren jedoch keinen unterbrechungsfreien Betrieb. Wartung, Updates und Störungen bei Drittanbietern können den Zugang beeinträchtigen.'] },
      {
        h: 'Datenrichtigkeit',
        p: ['Produktdaten stammen aus öffentlichen Registern und Herstellerquellen und dienen ausschließlich der beruflichen Information. Über die Förderfähigkeit entscheidet allein die zuständige Behörde. Prüfen Sie vor geschäftlichen oder technischen Entscheidungen stets die amtliche Quelle.'],
      },
      { h: 'Haftung', p: ['Soweit gesetzlich zulässig, haften wir nicht für mittelbare Schäden oder Folgeschäden oder für Entscheidungen, die auf Grundlage der bereitgestellten Daten getroffen werden. Gesetzlich zwingende Haftung bleibt unberührt.'] },
      { h: 'Kündigung und Sperrung', p: ['Wir können Konten sperren oder schließen, die gegen diese Bedingungen verstoßen — insbesondere bei Kontoteilung und unbefugter Datenentnahme. Sie können die Nutzung jederzeit beenden und die Löschung Ihres Kontos beantragen.'] },
      { h: 'Kontakt', p: [`Fragen zu diesen Bedingungen: ${SUPPORT_EMAIL} oder „Neue Anfrage“ auf der Kontoseite.`] },
    ],
  },
  refund: {
    title: 'Widerrufs- und Kündigungsregelung',
    updated: ver.terms,
    intro: `Diese Regelung erläutert, was bei der Kündigung Ihres ${SERVICE_NAME}-Abonnements geschieht und wann eine Erstattung erfolgt bzw. nicht erfolgt. Paddle ist unser Merchant of Record und wickelt alle Zahlungen ab.`,
    sections: [
      { h: 'Während der Testphase', p: ['Jedes Abonnement beginnt mit einer 7-tägigen kostenlosen Testphase. Während der Testphase erfolgt keine Abbuchung. Bei Kündigung vor Ablauf der Testphase wird nichts berechnet.'] },
      { h: 'Nach der Testphase', p: ['Wird nicht vor Ablauf der Testphase gekündigt, erfolgt die erste Zahlung und die bezahlte Periode beginnt.'] },
      { h: '14-tägiges Rückerstattungsrecht für Ihre erste Zahlung', p: [`Erfolgt Ihre erste Zahlung nach der kostenlosen Testphase, können Sie innerhalb von 14 Tagen nach der Abbuchung ohne Angabe von Gründen die vollständige Erstattung dieser ersten Zahlung verlangen. Senden Sie eine „Neue Anfrage“ über die Kontoseite oder schreiben Sie an ${SUPPORT_EMAIL} — wir wickeln die Erstattung gemeinsam mit Paddle ab. Dieses 14-Tage-Recht gilt nur für die erste Zahlung; spätere Verlängerungen richten sich nach den nachstehenden Abschnitten.`] },
      {
        h: 'Kündigung eines bezahlten Abonnements',
        p: [
          'Sie können jederzeit kündigen. Die Kündigung stoppt die nächste Verlängerung — die laufende Periode endet dadurch nicht vorzeitig.',
          'Der Zugang bleibt bis zum Ende der bereits bezahlten Periode bestehen.',
        ],
      },
      { h: 'Nicht genutzte Zeit', p: ['Für nicht genutzte Zeit einer bereits bezahlten Periode erfolgt keine automatische anteilige Erstattung.'] },
      {
        h: 'So kündigen Sie',
        p: [
          'Kündigen Sie über „Abrechnung verwalten“ auf der Kontoseite.',
          'Das Löschen Ihres HeatPump-Database-Kontos kündigt das Abonnement NICHT. Die Abrechnung wird separat geführt und muss über „Abrechnung verwalten“ gekündigt werden.',
        ],
      },
      { h: 'Ausnahmefälle', p: [`Wenn Sie Ihren Fall für außergewöhnlich halten (z. B. Doppelbuchung), senden Sie eine „Neue Anfrage“ über die Kontoseite oder schreiben Sie an ${SUPPORT_EMAIL} — wir prüfen den Fall gemeinsam mit Paddle.`] },
      { h: 'Merchant of Record', p: [`Abonnementzahlungen werden von ${PADDLE_ENTITY} als Merchant of Record für alle Abonnements abgewickelt. Rechnungen und Umsatzsteuerbelege werden von Paddle ausgestellt. Anfragen zu Erstattung und Kündigung senden Sie an ${SUPPORT_EMAIL}.`] },
    ],
  },
  imprint: buildImprint({
    title: 'Impressum',
    operator: 'Diensteanbieter',
    ownerShort: 'Inhaber',
    address: 'Eingetragene Geschäftsanschrift',
    regNo: 'Geschäftliche Registrierungsnummer',
    contact: 'Kontakt',
    brand: 'Produkt und Marke',
    payment: 'Zahlungsabwicklung',
    soleProp: 'Einzelunternehmen',
    emailLabel: 'E-Mail:',
    brandSentence: `${BRAND_TM} ist eine Produktmarke, die von ${OPERATOR_NAME} betrieben wird.`,
    paymentSentence: `Abonnementzahlungen werden von ${PADDLE_ENTITY} als Merchant of Record abgewickelt.`,
  }),
};

/* ── French ─────────────────────────────────────────────────────────────── */

const FR = {
  privacy: {
    title: 'Politique de confidentialité',
    updated: ver.privacy,
    intro:
      "HeatPump DataBase est un service de base de données professionnel sur le web, destiné à la filière européenne des pompes à chaleur. Cette politique explique quelles données nous traitons et pourquoi. Nous ne collectons que le minimum nécessaire au fonctionnement d'un compte professionnel.",
    sections: [
      {
        h: 'Données de compte',
        p: [
          "Lors de l'inscription, nous collectons : prénom, nom, adresse e-mail et un mot de passe (stocké uniquement sous forme de hachage par Firebase Authentication — nous ne le voyons jamais).",
          "Nous ne demandons ni fonction, ni la façon dont vous nous avez connus, ni aucune autre donnée personnelle non nécessaire au fonctionnement du compte.",
        ],
      },
      {
        h: "Données d'entreprise",
        p: [
          "Obligatoire : nom de l'entreprise et type d'entreprise. Facultatif : ville et site web. Si vous choisissez « Autre », nous enregistrons la brève précision que vous saisissez.",
          "Les professionnels indépendants et auto-entrepreneurs saisissent leur propre nom ou leur nom commercial enregistré comme nom d'entreprise.",
          "Le pays d'inscription est repris automatiquement de l'édition nationale sur laquelle vous vous inscrivez. Nous ne vous le demandons pas.",
        ],
      },
      {
        h: 'Finalités du traitement',
        p: [
          "Fourniture du service et de votre compte ; identification des utilisateurs professionnels ; gestion des abonnements d'équipe (sièges, invitations) ; facturation via notre prestataire de paiement ; réponse aux demandes d'assistance ; sécurisation du service contre les abus et l'extraction non autorisée de données.",
        ],
      },
      {
        h: 'Bases légales',
        p: [
          "Exécution du contrat (art. 6-1-b RGPD) pour le compte, l'abonnement et l'assistance ; intérêts légitimes (art. 6-1-f RGPD) pour la sécurité, la prévention de la fraude et la protection de la base de données ; obligations légales (art. 6-1-c RGPD) pour les documents comptables et fiscaux conservés par notre prestataire de paiement.",
        ],
      },
      {
        h: 'Services utilisés',
        p: [
          'Firebase Authentication (Google) — connexion et gestion des mots de passe.',
          "Firebase Firestore, Cloud Storage et Hosting (Google) — données de compte, jeux de données produits et diffusion de l'application.",
          "Firebase App Check avec reCAPTCHA Enterprise (Google) — vérifie que les requêtes proviennent de notre application et bloque l'extraction automatisée.",
          "Paddle — notre prestataire de paiement et marchand officiel (merchant of record). Paddle collecte et traite vos données de paiement ; nous ne recevons ni ne conservons aucune donnée de carte.",
        ],
      },
      {
        h: 'Facturation et marchand officiel',
        p: [
          "Les abonnements sont vendus sur le web via Paddle, qui agit en tant que marchand officiel. Paddle gère le paiement, la facturation et la TVA applicable et est responsable des données de paiement qu'il collecte. Nous ne conservons que ce qui est nécessaire pour relier votre abonnement à votre compte et pour vous assister.",
        ],
      },
      { h: "Demandes d'assistance", p: ["Les demandes envoyées depuis la page Compte sont enregistrées avec votre compte afin que notre équipe puisse y répondre et que vous puissiez lire la réponse dans l'application."] },
      {
        h: 'Sécurité et prévention des abus',
        p: ["Les comptes sont personnels et ne peuvent pas être partagés. Nous journalisons l'activité des comptes afin de détecter le partage de compte et l'extraction non autorisée de la base. Les données produits ne sont servies qu'aux comptes connectés et approuvés."],
      },
      {
        h: "Mesure d'usage du produit (first-party, sans cookies)",
        p: [
          "Pour comprendre quelles fonctions sont utilisées et où les recherches échouent, l'application enregistre elle-même un petit nombre d'événements d'usage : recherche effectuée, recherche sans résultat, produit ouvert, statut de référencement consulté, comparaison ouverte et fiche technique exportée.",
          "Les événements comportent un horodatage, le marché, la langue de l'interface, la classe d'appareil (téléphone/tablette/ordinateur), le niveau d'abonnement, un identifiant de session aléatoire et une référence de compte hachée à sens unique. Ils ne contiennent jamais votre nom, votre adresse e-mail, votre adresse IP, des données d'entreprise ni le texte saisi librement (les requêtes sont réduites à des termes normalisés, chiffres et fragments d'adresse supprimés).",
          "Aucun cookie n'est déposé à cette fin et aucun service d'analyse tiers ne reçoit ces données ; elles sont stockées chez nos prestataires d'infrastructure en région UE cités ci-dessus et supprimées automatiquement après 13 mois. Base juridique : notre intérêt légitime à exploiter et améliorer un service professionnel (art. 6, §1, f du RGPD). Vous pouvez vous y opposer à tout moment via l'adresse de support ci-dessous.",
        ],
      },
      {
        h: 'Durée de conservation',
        p: ["Les données de compte et d'entreprise sont conservées pendant la durée de vie du compte. Après suppression, nous ne conservons que ce qui est requis à des fins légales, comptables ou probatoires ; les documents de facturation sont conservés par Paddle pendant les durées légales.", "Afin de prévenir l'utilisation répétée de l'essai gratuit et les usages abusifs du service, nous conservons un enregistrement minimal de l'adresse e-mail utilisée à l'inscription pendant un an au maximum après la suppression du compte (intérêt légitime, art. 6-1-f RGPD). Il sert uniquement à vérifier l'éligibilité à l'essai gratuit et est supprimé automatiquement à l'issue de cette période."],
      },
      {
        h: 'Responsable du traitement',
        p: [
          `${OPERATOR_NAME} exploite ${BRAND_TM} et est le responsable du traitement des données personnelles décrites dans la présente politique. Les coordonnées de l'exploitant figurent dans les Mentions légales.`,
          'Adresse professionnelle enregistrée : Seongbuk-gu, Séoul, Corée du Sud (République de Corée) — adresse complète dans les Mentions légales.',
          `E-mail : ${SUPPORT_EMAIL}`,
        ],
      },
      {
        h: 'Suppression du compte',
        p: ["Vous pouvez demander la suppression à tout moment depuis la page Compte. La suppression de votre compte HeatPump DataBase n'annule pas l'abonnement — la facturation doit être résiliée séparément via « Gérer la facturation »."],
      },
      {
        h: 'Vos droits',
        p: ["Conformément au RGPD, vous pouvez demander l'accès, la rectification, l'effacement, la limitation et la portabilité, et vous opposer aux traitements fondés sur l'intérêt légitime. Vous pouvez également introduire une réclamation auprès d'une autorité de contrôle."],
      },
      {
        h: 'Traitements internationaux',
        p: [
          "Nos prestataires peuvent traiter des données en dehors de l'EEE. Le cas échéant, les transferts s'appuient sur les garanties offertes par ces prestataires (notamment les clauses contractuelles types de l'UE).",
          "Notre exploitant est établi en Corée du Sud (République de Corée) et peut y traiter vos données personnelles. Ces transferts de données d'utilisateurs de l'EEE et du Royaume-Uni reposent sur des garanties appropriées reconnues par le droit de la protection des données de l'UE et du Royaume-Uni — notamment les décisions d'adéquation concernant la République de Corée et, le cas échéant, les clauses contractuelles types. Vous pouvez demander le détail de ces garanties via le contact ci-dessous.",
        ],
      },
      { h: 'Contact', p: [`Utilisez « Nouvelle demande » sur la page Compte, ou écrivez à ${SUPPORT_EMAIL}.`] },
    ],
  },
  terms: {
    title: "Conditions d'utilisation",
    updated: ver.terms,
    intro: `${BRAND_TM} est un service logiciel exploité par ${OPERATOR_NAME}, une entreprise individuelle enregistrée. Les informations complètes sur l'exploitant, l'enregistrement et le contact figurent dans nos Mentions légales. Ces conditions régissent l'utilisation du service, un service professionnel de base de données B2B sur le web — merci de les lire avant de vous inscrire.`,
    sections: [
      { h: 'Le service', p: [`${SERVICE_NAME} est un service d'abonnement professionnel sur le web pour la filière européenne des pompes à chaleur, exploité par ${OPERATOR_NAME}. Les abonnements sont souscrits sur le web et facturés par Paddle. Les informations complètes sur l'exploitant et l'enregistrement figurent dans nos Mentions légales.`] },
      { h: 'Éligibilité des comptes', p: ["Les comptes sont destinés à un usage professionnel (fabricants, grossistes, installateurs, bureaux d'études, promoteurs, bailleurs, secteur public, indépendants et fonctions comparables). Les nouveaux comptes sont vérifiés avant activation."] },
      { h: 'Responsabilité du compte', p: ['Vous êtes responsable de vos identifiants et de tout ce qui est fait depuis votre compte. Gardez votre mot de passe confidentiel.'] },
      {
        h: 'Un compte par personne',
        p: [
          "Chaque compte est strictement personnel et ne peut être utilisé que par une seule personne. Le partage d'un compte constitue une violation des présentes conditions et peut entraîner sa fermeture sans préavis et sans remboursement de la période restante.",
          "Les entreprises comptant plusieurs utilisateurs doivent souscrire une formule Équipe, qui fournit un compte par personne.",
        ],
      },
      {
        h: 'Formules Équipe, sièges et propriétaire',
        p: [
          "Team 3 comprend trois sièges et Team 5 cinq sièges, acheteur inclus. L'acheteur devient propriétaire de l'équipe et est responsable de l'abonnement, de la facturation et de l'occupation des sièges.",
          "Les membres actifs et les invitations en attente ne peuvent jamais dépasser le nombre de sièges. Le propriétaire peut retirer un membre à tout moment ; la personne retirée perd immédiatement l'accès à l'abonnement d'équipe mais conserve son compte personnel.",
          "Un membre peut quitter l'équipe à tout moment. Cela libère un siège et n'annule pas l'abonnement d'équipe.",
        ],
      },
      {
        h: "Essai gratuit",
        p: [
          "Chaque abonnement commence par un essai gratuit de 7 jours. Un moyen de paiement valide est requis pour démarrer l'essai. Aucun débit n'a lieu pendant l'essai.",
          "Sans résiliation avant la fin de l'essai, le premier paiement est prélevé et l'abonnement débute.",
        ],
      },
      {
        h: 'Facturation, renouvellement et modifications',
        p: [
          "Les abonnements sont proposés en formules mensuelle, semestrielle et annuelle et se renouvellent automatiquement jusqu'à résiliation.",
          "La formule et la période de facturation sont fixes pendant la période payée. Les modifications ne prennent pas effet en cours de période : une modification demandée s'applique au renouvellement suivant, et les nouvelles conditions ne débutent qu'après la fin de la période en cours.",
          "Vous pouvez résilier à tout moment. La résiliation arrête le renouvellement suivant ; l'accès continue jusqu'à la fin de la période payée.",
        ],
      },
      { h: 'Paiements', p: ["Les paiements sont traités par Paddle, marchand officiel, qui émet les factures incluant la TVA applicable."] },
      {
        h: 'Usage autorisé et protection de la base de données',
        p: [
          "La base est protégée par le droit européen des bases de données. Vous ne pouvez utiliser les données que dans les formes de présentation proposées par l'application (recherche, comparaisons et fiches techniques générées) et pour vos propres besoins professionnels.",
          "Le scraping, l'extraction massive, la collecte automatisée, la reproduction, la redistribution, l'utilisation pour l'entraînement d'IA et toute réutilisation commerciale de la base ou d'une partie substantielle sont interdits sans accord écrit préalable.",
          "Toute tentative de contourner les mesures techniques de protection ou d'accéder aux jeux de données en dehors de l'application entraîne la fermeture du compte et peut engager la responsabilité civile et pénale.",
        ],
      },
      { h: 'Disponibilité', p: ["Nous visons une haute disponibilité sans garantir un service ininterrompu. Maintenance, mises à jour et pannes de tiers peuvent interrompre l'accès."] },
      {
        h: 'Exactitude des données',
        p: ["Les données produits proviennent de registres publics et de sources fabricants et sont fournies à titre d'information professionnelle. L'éligibilité aux aides est décidée exclusivement par l'autorité compétente. Vérifiez toujours la source officielle avant toute décision commerciale ou technique."],
      },
      { h: 'Responsabilité', p: ["Dans la limite permise par la loi, nous ne sommes pas responsables des dommages indirects ou consécutifs, ni des décisions prises sur la base des données fournies. Les responsabilités que la loi interdit d'exclure demeurent."] },
      { h: 'Résiliation et suspension', p: ["Nous pouvons suspendre ou fermer les comptes qui violent ces conditions, en particulier le partage de compte et l'extraction non autorisée. Vous pouvez cesser d'utiliser le service à tout moment et demander la suppression de votre compte."] },
      { h: 'Contact', p: [`Questions sur ces conditions : ${SUPPORT_EMAIL}, ou « Nouvelle demande » sur la page Compte.`] },
    ],
  },
  refund: {
    title: 'Politique de remboursement et de résiliation',
    updated: ver.terms,
    intro: `Cette politique explique ce qui se passe lorsque vous résiliez votre abonnement ${SERVICE_NAME}, et quand un remboursement est dû ou non. Paddle est notre marchand officiel et gère tous les paiements.`,
    sections: [
      { h: "Pendant l'essai gratuit", p: ["Chaque abonnement commence par un essai gratuit de 7 jours. Aucun débit n'a lieu pendant l'essai. Résiliez avant la fin de l'essai et aucun paiement n'est prélevé."] },
      { h: "Après l'essai", p: ["Sans résiliation avant la fin de l'essai, le premier paiement est prélevé et la période payée commence."] },
      { h: 'Remboursement sous 14 jours de votre premier paiement', p: [`Si votre premier paiement est prélevé après l'essai gratuit, vous pouvez demander le remboursement intégral de ce premier paiement dans les 14 jours suivant le débit, pour tout motif. Envoyez une « Nouvelle demande » depuis la page Compte ou écrivez à ${SUPPORT_EMAIL} ; nous procéderons au remboursement avec Paddle. Ce droit de 14 jours ne s'applique qu'au premier paiement ; les renouvellements ultérieurs sont régis par les sections ci-dessous.`] },
      {
        h: "Résilier un abonnement payant",
        p: [
          "Vous pouvez résilier à tout moment. La résiliation arrête le renouvellement suivant — elle ne met pas fin à la période en cours.",
          "L'accès continue jusqu'à la fin de la période déjà payée.",
        ],
      },
      { h: 'Temps non utilisé', p: ["Nous ne remboursons pas automatiquement le temps non utilisé d'une période déjà payée."] },
      {
        h: 'Comment résilier',
        p: [
          "Résiliez via « Gérer la facturation » sur la page Compte.",
          "La suppression de votre compte HeatPump DataBase N'ANNULE PAS votre abonnement. La facturation est gérée séparément et doit être résiliée via « Gérer la facturation ».",
        ],
      },
      { h: 'Cas exceptionnels', p: [`Si votre situation est exceptionnelle (par exemple un double débit), envoyez une « Nouvelle demande » depuis la page Compte ou écrivez à ${SUPPORT_EMAIL} ; nous l'examinerons avec Paddle.`] },
      { h: 'Marchand officiel', p: [`Les paiements d'abonnement sont traités par ${PADDLE_ENTITY}, agissant en tant que marchand officiel pour tous les abonnements. Les factures et justificatifs de TVA sont émis par Paddle. Les demandes de remboursement et de résiliation peuvent être adressées à ${SUPPORT_EMAIL}.`] },
    ],
  },
  imprint: buildImprint({
    title: 'Mentions légales',
    operator: "Exploitant du service",
    ownerShort: 'Exploitant',
    address: 'Adresse professionnelle enregistrée',
    regNo: "Numéro d'enregistrement de l'entreprise",
    contact: 'Contact',
    brand: 'Produit et marque',
    payment: 'Traitement des paiements',
    soleProp: 'Entreprise individuelle',
    emailLabel: 'E-mail :',
    brandSentence: `${BRAND_TM} est une marque de produit exploitée par ${OPERATOR_NAME}.`,
    paymentSentence: `Les paiements d'abonnement sont traités par ${PADDLE_ENTITY}, agissant en tant que marchand officiel (merchant of record).`,
  }),
};

/* ── Polish ─────────────────────────────────────────────────────────────── */

const PL = {
  privacy: {
    title: 'Polityka prywatności',
    updated: ver.privacy,
    intro:
      `${SERVICE_NAME} to internetowy, profesjonalny serwis bazodanowy dla europejskiej branży pomp ciepła. Niniejsza polityka wyjaśnia, jakie dane przetwarzamy podczas korzystania z serwisu i dlaczego. Zbieramy wyłącznie minimum niezbędne do prowadzenia konta profesjonalnego.`,
    sections: [
      {
        h: 'Zbierane dane konta',
        p: [
          'Podczas rejestracji zbieramy: imię, nazwisko, adres e-mail oraz hasło (przechowywane wyłącznie w postaci skrótu przez Firebase Authentication — nigdy go nie widzimy).',
          'Nie pytamy o stanowisko, o to, skąd dowiedzieli się Państwo o nas, ani o żadne inne dane osobowe, które nie są potrzebne do prowadzenia konta.',
        ],
      },
      {
        h: 'Zbierane dane firmowe',
        p: [
          'Wymagane: nazwa firmy i rodzaj firmy. Opcjonalne: miejscowość firmy i strona internetowa firmy. W przypadku wyboru rodzaju firmy „Inne” zapisujemy wprowadzony przez Państwa krótki opis.',
          'Osoby wykonujące zawód samodzielnie oraz osoby prowadzące jednoosobową działalność gospodarczą podają jako nazwę firmy własne imię i nazwisko lub zarejestrowaną nazwę handlową.',
          'Kraj rejestracji jest przejmowany automatycznie z edycji krajowej, w której zakładają Państwo konto. Nie pytamy o niego.',
        ],
      },
      {
        h: 'Cele przetwarzania',
        p: [
          'Świadczenie usługi bazodanowej i prowadzenie Państwa konta; identyfikacja użytkowników profesjonalnych; obsługa subskrypcji zespołowych (miejsca, zaproszenia); rozliczenia za pośrednictwem naszego dostawcy płatności; odpowiadanie na zapytania do pomocy technicznej; zabezpieczenie serwisu przed nadużyciami i nieuprawnionym pozyskiwaniem danych.',
        ],
      },
      {
        h: 'Podstawy prawne',
        p: [
          'Wykonanie umowy (art. 6 ust. 1 lit. b RODO) w zakresie konta, subskrypcji i wsparcia; prawnie uzasadnione interesy (art. 6 ust. 1 lit. f RODO) w zakresie bezpieczeństwa, zapobiegania oszustwom i ochrony bazy danych; obowiązki prawne (art. 6 ust. 1 lit. c RODO) w zakresie dokumentacji księgowej i podatkowej prowadzonej przez naszego dostawcę płatności.',
        ],
      },
      {
        h: 'Podmioty przetwarzające i wykorzystywane usługi',
        p: [
          'Firebase Authentication (Google) — logowanie i obsługa haseł.',
          'Firebase Firestore, Cloud Storage i Hosting (Google) — dane kont, zbiory danych produktowych i dostarczanie aplikacji.',
          'Firebase App Check z reCAPTCHA Enterprise (Google) — weryfikuje, że żądania pochodzą z naszej aplikacji, i blokuje zautomatyzowane pozyskiwanie danych.',
          'Paddle — nasz dostawca płatności i sprzedawca rozliczeniowy (merchant of record). Paddle zbiera i przetwarza Państwa dane płatnicze; my nigdy nie otrzymujemy ani nie przechowujemy danych kart.',
        ],
      },
      {
        h: 'Rozliczenia i merchant of record',
        p: [
          'Subskrypcje są sprzedawane w internecie za pośrednictwem Paddle, który działa jako sprzedawca rozliczeniowy (merchant of record). Paddle obsługuje płatności, fakturowanie i należny podatek VAT oraz jest administratorem zbieranych przez siebie danych płatniczych. Przechowujemy tylko to, co jest niezbędne do powiązania subskrypcji z Państwa kontem i do udzielania Państwu wsparcia.',
        ],
      },
      {
        h: 'Zapytania do pomocy technicznej',
        p: [
          'Zapytania wysyłane ze strony Konto są zapisywane wraz z Państwa kontem, aby nasz zespół wsparcia mógł na nie odpowiedzieć, a Państwo mogli przeczytać odpowiedź w aplikacji.',
        ],
      },
      {
        h: 'Bezpieczeństwo i zapobieganie nadużyciom',
        p: [
          'Konta są osobiste i nie mogą być współdzielone. Rejestrujemy aktywność kont, aby wykrywać współdzielenie kont i nieuprawnione pozyskiwanie zawartości bazy danych. Dane produktowe są udostępniane wyłącznie zalogowanym, zatwierdzonym kontom.',
        ],
      },
      {
        h: 'Analityka użycia produktu (first-party, bez plików cookie)',
        p: [
          'Aby zrozumieć, które funkcje są używane i gdzie wyszukiwania kończą się niepowodzeniem, aplikacja samodzielnie rejestruje niewielki zestaw zdarzeń: wykonane wyszukiwanie, wyszukiwanie bez wyników, otwarcie produktu, wyświetlenie statusu z listy, otwarcie porównania i eksport karty danych.',
          'Zdarzenia zawierają znacznik czasu, rynek, język interfejsu, klasę urządzenia (telefon/tablet/komputer), poziom subskrypcji, losowy identyfikator sesji oraz jednokierunkowo zahaszowane odniesienie do konta. Nigdy nie zawierają imienia i nazwiska, adresu e-mail, adresu IP, danych firmy ani swobodnie wpisanego tekstu (zapytania są redukowane do znormalizowanych tokenów, z usunięciem liczb i fragmentów przypominających adresy).',
          'W tym celu nie są ustawiane żadne pliki cookie, a dane nie trafiają do zewnętrznych usług analitycznych; są przechowywane u naszych dostawców infrastruktury w regionie UE wymienionych powyżej i automatycznie usuwane po 13 miesiącach. Podstawa prawna: nasz prawnie uzasadniony interes w prowadzeniu i ulepszaniu profesjonalnej usługi (art. 6 ust. 1 lit. f RODO). W każdej chwili można wnieść sprzeciw przez podany niżej adres wsparcia.',
        ],
      },
      {
        h: 'Okres przechowywania danych',
        p: [
          'Dane konta i dane firmowe są przechowywane przez czas istnienia konta. Po usunięciu konta zachowujemy tylko to, czego wymagają cele prawne, księgowe lub dowodowe; dokumentacja rozliczeniowa jest przechowywana przez Paddle przez okresy ustawowe.',
          'Aby zapobiegać wielokrotnemu korzystaniu z bezpłatnego okresu próbnego i nadużyciom serwisu, po usunięciu konta przechowujemy przez maksymalnie rok minimalny zapis adresu e-mail użytego przy rejestracji (prawnie uzasadniony interes, art. 6 ust. 1 lit. f RODO). Służy on wyłącznie do weryfikacji uprawnienia do okresu próbnego i po tym okresie jest usuwany automatycznie.',
        ],
      },
      {
        h: 'Administrator danych',
        p: [
          `${OPERATOR_NAME} prowadzi ${BRAND_TM} i jest administratorem danych osobowych opisanych w niniejszej polityce. Dane operatora znajdują się w Nocie prawnej.`,
          'Zarejestrowany adres działalności: Seongbuk-gu, Seul, Korea Południowa (Republika Korei) — pełny adres w Nocie prawnej.',
          `E-mail: ${SUPPORT_EMAIL}`,
        ],
      },
      {
        h: 'Usunięcie konta',
        p: [
          'Usunięcia konta można zażądać w każdej chwili na stronie Konto. Usunięcie konta HeatPump DataBase nie anuluje subskrypcji — rozliczenia należy anulować osobno w sekcji „Zarządzaj rozliczeniami”.',
        ],
      },
      {
        h: 'Państwa prawa',
        p: [
          'Na podstawie RODO mogą Państwo żądać dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania i przenoszenia oraz wnieść sprzeciw wobec przetwarzania opartego na prawnie uzasadnionych interesach. Przysługuje Państwu również prawo wniesienia skargi do organu nadzorczego.',
        ],
      },
      {
        h: 'Przetwarzanie międzynarodowe',
        p: [
          'Nasi dostawcy mogą przetwarzać dane poza EOG. W takim przypadku przekazywanie danych opiera się na zabezpieczeniach oferowanych przez tych dostawców (w tym na standardowych klauzulach umownych UE).',
          'Nasz operator ma siedzibę w Korei Południowej (Republika Korei) i może tam przetwarzać Państwa dane osobowe. Takie przekazywanie danych użytkowników z EOG i Wielkiej Brytanii opiera się na odpowiednich zabezpieczeniach uznanych w prawie ochrony danych UE i Wielkiej Brytanii — w tym na decyzjach stwierdzających odpowiedni stopień ochrony dla Republiki Korei oraz, w stosownych przypadkach, na standardowych klauzulach umownych. Szczegóły tych zabezpieczeń można uzyskać, korzystając z kontaktu podanego poniżej.',
        ],
      },
      { h: 'Kontakt', p: [`Prosimy skorzystać z opcji „Nowe zapytanie” na stronie Konto lub napisać na adres ${SUPPORT_EMAIL}.`] },
    ],
  },
  terms: {
    title: 'Warunki korzystania',
    updated: ver.terms,
    intro: `${BRAND_TM} to usługa oprogramowania prowadzona przez ${OPERATOR_NAME}, zarejestrowaną jednoosobową działalność gospodarczą. Pełne informacje o operatorze, rejestracji i kontakcie znajdują się w Informacjach o usługodawcy. Niniejsze warunki regulują korzystanie z usługi — profesjonalnego, internetowego serwisu bazodanowego B2B — prosimy o ich przeczytanie przed rejestracją.`,
    sections: [
      { h: 'Usługa', p: [`${SERVICE_NAME} to profesjonalna, internetowa usługa subskrypcyjna dla europejskiej branży pomp ciepła, prowadzona przez ${OPERATOR_NAME}. Subskrypcje są nabywane w internecie i rozliczane przez Paddle. Pełne dane operatora i rejestracji znajdują się w Informacjach o usługodawcy.`] },
      { h: 'Kto może założyć konto', p: ['Konta są przeznaczone do użytku profesjonalnego (producenci, hurtownicy, instalatorzy, inżynierowie, firmy doradcze, sektor mieszkaniowy, sektor publiczny, osoby prowadzące jednoosobową działalność gospodarczą i porównywalne role). Nowe konta są weryfikowane przed aktywacją.'] },
      { h: 'Odpowiedzialność za konto', p: ['Odpowiadają Państwo za swoje dane logowania i za wszystkie działania wykonywane w ramach konta. Hasło należy zachować w poufności.'] },
      {
        h: 'Jedno konto na osobę',
        p: [
          'Każde konto jest ściśle osobiste i może być używane tylko przez jedną osobę. Współdzielenie konta stanowi naruszenie niniejszych warunków i może prowadzić do zamknięcia konta bez wcześniejszego powiadomienia i bez zwrotu za pozostały okres.',
          'Firmy z kilkoma użytkownikami muszą korzystać z planu Team, który zapewnia jedno konto na osobę.',
        ],
      },
      {
        h: 'Plany zespołowe, miejsca i właściciele',
        p: [
          'Team 3 zapewnia trzy miejsca, a Team 5 pięć miejsc, w każdym przypadku łącznie z nabywcą. Nabywca zostaje właścicielem zespołu i odpowiada za subskrypcję, rozliczenia oraz za to, kto zajmuje miejsca.',
          'Liczba aktywnych członków wraz z otwartymi zaproszeniami nigdy nie może przekroczyć limitu miejsc. Właściciel może w każdej chwili usunąć członka; usunięta osoba natychmiast traci dostęp do subskrypcji zespołowej, ale zachowuje swoje konto osobiste.',
          'Członek zespołu może w każdej chwili opuścić zespół. Opuszczenie zespołu zwalnia miejsce i nie anuluje subskrypcji zespołowej.',
        ],
      },
      {
        h: 'Bezpłatny okres próbny',
        p: [
          'Każda subskrypcja rozpoczyna się 7-dniowym bezpłatnym okresem próbnym. Do rozpoczęcia okresu próbnego wymagana jest ważna metoda płatności. W okresie próbnym nie są pobierane żadne opłaty.',
          'Jeżeli subskrypcja nie zostanie anulowana przed końcem okresu próbnego, pobierana jest pierwsza płatność i subskrypcja się rozpoczyna.',
        ],
      },
      {
        h: 'Rozliczenia, odnowienia i zmiany',
        p: [
          'Subskrypcje są oferowane w miesięcznym, 6-miesięcznym i rocznym okresie rozliczeniowym i odnawiają się automatycznie na koniec każdego okresu do momentu anulowania.',
          'Plan i okres rozliczeniowy są stałe w opłaconym okresie. Zmiany nie wchodzą w życie w trakcie okresu: zgłoszona przez Państwa zmiana obowiązuje od następnego odnowienia, a nowe warunki zaczynają obowiązywać dopiero po zakończeniu bieżącego okresu.',
          'Subskrypcję można anulować w każdej chwili. Anulowanie wstrzymuje następne odnowienie; dostęp pozostaje aktywny do końca opłaconego okresu.',
        ],
      },
      { h: 'Płatności', p: ['Płatności są przetwarzane przez Paddle, który działa jako sprzedawca rozliczeniowy (merchant of record) i wystawia faktury zawierające należny podatek VAT.'] },
      {
        h: 'Dozwolone korzystanie i ochrona bazy danych',
        p: [
          'Baza danych jest chroniona na podstawie europejskiego prawa ochrony baz danych. Z danych mogą Państwo korzystać wyłącznie w formach prezentacji oferowanych przez tę aplikację (w szczególności wyszukiwanie, widoki porównań i generowane karty danych) i wyłącznie do własnych celów zawodowych.',
          'Scraping, masowe pozyskiwanie, zautomatyzowane zbieranie, powielanie, redystrybucja, wykorzystywanie do trenowania AI oraz jakiekolwiek komercyjne ponowne wykorzystanie bazy danych lub jej istotnej części są zabronione bez uprzedniej pisemnej zgody.',
          'Próby obchodzenia technicznych środków ochrony lub uzyskiwania dostępu do zbiorów danych poza aplikacją prowadzą do zamknięcia konta i mogą skutkować odpowiedzialnością cywilną i karną.',
        ],
      },
      { h: 'Dostępność usługi', p: ['Dążymy do wysokiej dostępności, ale nie gwarantujemy nieprzerwanego działania usługi. Konserwacja, aktualizacje i awarie u dostawców zewnętrznych mogą przerywać dostęp.'] },
      {
        h: 'Poprawność danych',
        p: [
          'Dane produktowe pochodzą z rejestrów publicznych i źródeł producentów i są udostępniane wyłącznie w celach informacji zawodowej. O kwalifikacji do finansowania publicznego decyduje wyłącznie właściwy organ. Przed podjęciem decyzji handlowych lub technicznych zawsze należy zweryfikować dane w oficjalnym źródle.',
        ],
      },
      { h: 'Odpowiedzialność', p: ['W zakresie dozwolonym przez prawo nie ponosimy odpowiedzialności za szkody pośrednie lub następcze ani za decyzje podjęte na podstawie udostępnionych danych. Żadne postanowienie niniejszych warunków nie wyłącza odpowiedzialności, której nie można wyłączyć na mocy prawa.'] },
      { h: 'Rozwiązanie umowy i zawieszenie konta', p: ['Możemy zawiesić lub zamknąć konta naruszające niniejsze warunki, w szczególności w przypadku współdzielenia konta i nieuprawnionego pozyskiwania danych. Mogą Państwo w każdej chwili zaprzestać korzystania z usługi i zażądać usunięcia konta.'] },
      { h: 'Kontakt', p: [`Pytania dotyczące niniejszych warunków: ${SUPPORT_EMAIL} lub „Nowe zapytanie” na stronie Konto.`] },
    ],
  },
  refund: {
    title: 'Zasady zwrotów i anulowania subskrypcji',
    updated: ver.terms,
    intro: `Niniejsze zasady wyjaśniają, co się dzieje po anulowaniu subskrypcji ${SERVICE_NAME} oraz kiedy zwrot przysługuje, a kiedy nie. Paddle jest naszym sprzedawcą rozliczeniowym (merchant of record) i obsługuje wszystkie płatności.`,
    sections: [
      { h: 'W trakcie bezpłatnego okresu próbnego', p: ['Każda subskrypcja rozpoczyna się 7-dniowym bezpłatnym okresem próbnym. W okresie próbnym nie są pobierane żadne opłaty. Jeżeli anulują Państwo subskrypcję przed końcem okresu próbnego, żadna płatność nie zostanie pobrana.'] },
      { h: 'Po okresie próbnym', p: ['Jeżeli subskrypcja nie zostanie anulowana przed końcem okresu próbnego, pobierana jest pierwsza płatność i rozpoczyna się opłacony okres.'] },
      { h: 'Zwrot pierwszej płatności w ciągu 14 dni', p: [`Jeżeli pierwsza płatność zostanie pobrana po bezpłatnym okresie próbnym, mogą Państwo zażądać pełnego zwrotu tej pierwszej płatności w ciągu 14 dni od obciążenia, z dowolnego powodu. Prosimy wysłać „Nowe zapytanie” ze strony Konto lub napisać na adres ${SUPPORT_EMAIL} — zrealizujemy zwrot wspólnie z Paddle. To 14-dniowe prawo dotyczy wyłącznie pierwszej płatności; późniejsze odnowienia regulują poniższe sekcje.`] },
      {
        h: 'Anulowanie płatnej subskrypcji',
        p: [
          'Subskrypcję można anulować w każdej chwili. Anulowanie wstrzymuje następne odnowienie — nie kończy bieżącego okresu.',
          'Dostęp pozostaje aktywny do końca już opłaconego okresu.',
        ],
      },
      { h: 'Niewykorzystany czas', p: ['Nie zwracamy automatycznie środków za niewykorzystany czas w ramach już opłaconego okresu.'] },
      {
        h: 'Jak anulować',
        p: [
          'Subskrypcję anulują Państwo w sekcji „Zarządzaj rozliczeniami” na stronie Konto.',
          'Usunięcie konta HeatPump DataBase NIE anuluje subskrypcji. Rozliczenia są prowadzone osobno i muszą zostać anulowane w sekcji „Zarządzaj rozliczeniami”.',
        ],
      },
      { h: 'Zwroty w wyjątkowych przypadkach', p: [`Jeżeli uważają Państwo, że Państwa przypadek jest wyjątkowy (na przykład podwójne obciążenie), prosimy wysłać „Nowe zapytanie” ze strony Konto lub napisać na adres ${SUPPORT_EMAIL} — rozpatrzymy sprawę wspólnie z Paddle.`] },
      { h: 'Merchant of record', p: [`Płatności za subskrypcje są przetwarzane przez ${PADDLE_ENTITY}, działający jako sprzedawca rozliczeniowy (merchant of record) dla wszystkich subskrypcji. Faktury i dokumenty VAT wystawia Paddle. Wnioski o zwrot i anulowanie można kierować na adres ${SUPPORT_EMAIL}.`] },
    ],
  },
  imprint: buildImprint({
    title: 'Informacje o usługodawcy',
    operator: 'Usługodawca',
    ownerShort: 'Właściciel',
    address: 'Zarejestrowany adres działalności',
    regNo: 'Numer rejestracyjny działalności',
    contact: 'Kontakt',
    brand: 'Produkt i marka',
    payment: 'Przetwarzanie płatności',
    soleProp: 'Jednoosobowa działalność gospodarcza',
    emailLabel: 'E-mail:',
    brandSentence: `${BRAND_TM} to marka produktu prowadzona przez ${OPERATOR_NAME}.`,
    paymentSentence: `Płatności za subskrypcje są przetwarzane przez ${PADDLE_ENTITY}, działający jako sprzedawca rozliczeniowy (merchant of record).`,
  }),
};

/* ── Italian ────────────────────────────────────────────────────────────── */

const IT = {
  privacy: {
    title: 'Informativa sulla privacy',
    updated: ver.privacy,
    intro:
      `${SERVICE_NAME} è un servizio di banca dati professionale via web per il settore europeo delle pompe di calore. La presente informativa spiega quali dati trattiamo quando utilizzate il servizio e perché. Raccogliamo solo il minimo necessario alla gestione di un account professionale.`,
    sections: [
      {
        h: 'Dati dell’account che raccogliamo',
        p: [
          'Al momento della registrazione raccogliamo: nome, cognome, indirizzo e-mail e una password (conservata esclusivamente in forma di hash da Firebase Authentication — non la vediamo mai).',
          'Non chiediamo la funzione ricoperta, come ci avete conosciuti, né altri dati personali non necessari alla gestione dell’account.',
        ],
      },
      {
        h: 'Dati aziendali che raccogliamo',
        p: [
          'Obbligatori: ragione sociale e tipo di azienda. Facoltativi: città e sito web dell’azienda. Se selezionate «Altro» come tipo di azienda, memorizziamo la breve descrizione da voi inserita.',
          'I professionisti autonomi e le ditte individuali indicano come ragione sociale il proprio nome o la propria denominazione commerciale registrata.',
          'Il paese di registrazione è ricavato automaticamente dall’edizione nazionale su cui vi registrate. Non ve lo chiediamo.',
        ],
      },
      {
        h: 'Finalità del trattamento',
        p: [
          'Fornitura del servizio di banca dati e del vostro account; identificazione degli utenti professionali; gestione degli abbonamenti di team (posti, inviti); fatturazione tramite il nostro fornitore di pagamenti; risposta alle richieste di assistenza; protezione del servizio contro abusi ed estrazione non autorizzata di dati.',
        ],
      },
      {
        h: 'Basi giuridiche',
        p: [
          'Esecuzione del contratto (art. 6, par. 1, lett. b del GDPR — Regolamento (UE) 2016/679) per l’account, l’abbonamento e l’assistenza; legittimo interesse (art. 6, par. 1, lett. f del GDPR) per la sicurezza, la prevenzione delle frodi e la protezione della banca dati; obblighi legali (art. 6, par. 1, lett. c del GDPR) per la documentazione contabile e fiscale conservata dal nostro fornitore di pagamenti.',
        ],
      },
      {
        h: 'Responsabili del trattamento e servizi utilizzati',
        p: [
          'Firebase Authentication (Google) — accesso e gestione delle password.',
          'Firebase Firestore, Cloud Storage e Hosting (Google) — dati degli account, set di dati dei prodotti e distribuzione dell’applicazione.',
          'Firebase App Check con reCAPTCHA Enterprise (Google) — verifica che le richieste provengano dalla nostra applicazione e blocca l’estrazione automatizzata di dati.',
          'Paddle — il nostro fornitore di pagamenti e venditore ufficiale (merchant of record). Paddle raccoglie e tratta i vostri dati di pagamento; noi non riceviamo né conserviamo mai i dati delle carte.',
        ],
      },
      {
        h: 'Fatturazione e merchant of record',
        p: [
          'Gli abbonamenti sono venduti sul web tramite Paddle, che agisce come venditore ufficiale (merchant of record). Paddle gestisce il pagamento, la fatturazione e l’IVA applicabile ed è titolare del trattamento dei dati di pagamento che raccoglie. Conserviamo solo quanto necessario per collegare l’abbonamento al vostro account e per assistervi.',
        ],
      },
      {
        h: 'Richieste di assistenza',
        p: [
          'Le richieste inviate dalla pagina Account vengono memorizzate insieme al vostro account, affinché il nostro team di assistenza possa rispondere e voi possiate leggere la risposta nell’applicazione.',
        ],
      },
      {
        h: 'Sicurezza e prevenzione degli abusi',
        p: [
          'Gli account sono personali e non possono essere condivisi. Registriamo l’attività degli account per rilevare la condivisione degli account e l’estrazione non autorizzata della banca dati. I dati dei prodotti sono forniti esclusivamente ad account autenticati e approvati.',
        ],
      },
      {
        h: "Analisi d'uso del prodotto (first-party, senza cookie)",
        p: [
          "Per capire quali funzioni vengono usate e dove le ricerche falliscono, l'app registra in proprio un piccolo insieme di eventi d'uso: ricerca eseguita, ricerca senza risultati, prodotto aperto, stato di catalogo visualizzato, confronto aperto e scheda tecnica esportata.",
          "Gli eventi contengono data e ora, mercato, lingua dell'interfaccia, classe di dispositivo (telefono/tablet/desktop), livello di abbonamento, un identificatore di sessione casuale e un riferimento all'account con hash unidirezionale. Non contengono mai nome, indirizzo e-mail, indirizzo IP, dati aziendali né testo digitato liberamente (le query sono ridotte a token normalizzati, con numeri e frammenti simili a indirizzi rimossi).",
          "A questo scopo non vengono impostati cookie e nessun servizio di analisi di terze parti riceve i dati; sono conservati presso i nostri fornitori di infrastruttura in regione UE elencati sopra ed eliminati automaticamente dopo 13 mesi. Base giuridica: il nostro legittimo interesse a gestire e migliorare un servizio professionale (art. 6, par. 1, lett. f GDPR). È possibile opporsi in qualsiasi momento tramite l'indirizzo di supporto indicato sotto.",
        ],
      },
      {
        h: 'Conservazione dei dati',
        p: [
          'I dati dell’account e i dati aziendali sono conservati per la durata dell’account. Dopo la cancellazione conserviamo solo quanto richiesto per finalità legali, contabili o probatorie; la documentazione di fatturazione è conservata da Paddle per i periodi previsti dalla legge.',
          'Per prevenire l’uso ripetuto della prova gratuita e gli abusi del servizio, dopo la cancellazione dell’account conserviamo per un massimo di un anno una registrazione minima dell’indirizzo e-mail usato in fase di registrazione (legittimo interesse, art. 6, par. 1, lett. f del GDPR). Serve esclusivamente a verificare l’idoneità alla prova gratuita e viene eliminata automaticamente al termine di tale periodo.',
        ],
      },
      {
        h: 'Titolare del trattamento',
        p: [
          `${OPERATOR_NAME} gestisce ${BRAND_TM} ed è il titolare del trattamento dei dati personali descritti nella presente informativa. I dati del gestore sono riportati nelle Note legali.`,
          'Indirizzo commerciale registrato: Seongbuk-gu, Seoul, Corea del Sud (Repubblica di Corea) — indirizzo completo nelle Note legali.',
          `E-mail: ${SUPPORT_EMAIL}`,
        ],
      },
      {
        h: 'Cancellazione dell’account',
        p: [
          'Potete richiedere la cancellazione in qualsiasi momento dalla pagina Account. La cancellazione dell’account HeatPump DataBase non annulla l’abbonamento — la fatturazione deve essere disdetta separatamente tramite «Gestisci fatturazione».',
        ],
      },
      {
        h: 'I vostri diritti',
        p: [
          'Ai sensi del GDPR (Regolamento (UE) 2016/679) potete richiedere l’accesso, la rettifica, la cancellazione, la limitazione e la portabilità dei dati, nonché opporvi ai trattamenti basati sul legittimo interesse. Potete inoltre proporre reclamo a un’autorità di controllo (in Italia, il Garante per la protezione dei dati personali).',
        ],
      },
      {
        h: 'Trattamenti internazionali',
        p: [
          'I nostri fornitori possono trattare dati al di fuori del SEE. In tal caso i trasferimenti si basano sulle garanzie offerte da tali fornitori (comprese le clausole contrattuali standard dell’UE).',
          'Il nostro operatore ha sede in Corea del Sud (Repubblica di Corea) e può trattarvi i vostri dati personali. Tali trasferimenti di dati degli utenti del SEE e del Regno Unito si basano su garanzie adeguate riconosciute dal diritto dell’UE e del Regno Unito in materia di protezione dei dati — comprese le decisioni di adeguatezza relative alla Repubblica di Corea e, ove applicabile, le clausole contrattuali standard. Potete richiedere i dettagli di tali garanzie utilizzando il contatto indicato di seguito.',
        ],
      },
      { h: 'Contatto', p: [`Utilizzate «Nuova richiesta» sulla pagina Account oppure scrivete a ${SUPPORT_EMAIL}.`] },
    ],
  },
  terms: {
    title: 'Condizioni d’uso',
    updated: ver.terms,
    intro: `${BRAND_TM} è un servizio software gestito da ${OPERATOR_NAME}, impresa individuale registrata. Le informazioni complete su gestore, registrazione e contatti sono disponibili nelle nostre Note legali. Le presenti condizioni disciplinano l’utilizzo del servizio, un servizio professionale di banca dati B2B via web — vi invitiamo a leggerle prima di registrarvi.`,
    sections: [
      { h: 'Il servizio', p: [`${SERVICE_NAME} è un servizio professionale in abbonamento via web per il settore europeo delle pompe di calore, gestito da ${OPERATOR_NAME}. Gli abbonamenti si acquistano sul web e sono fatturati da Paddle. Le informazioni complete su gestore e registrazione sono nelle nostre Note legali.`] },
      { h: 'Requisiti per l’account', p: ['Gli account sono destinati a un uso professionale (produttori, grossisti, installatori, ingegneri, società di consulenza, settore abitativo, settore pubblico, ditte individuali e ruoli comparabili). I nuovi account vengono verificati prima dell’attivazione.'] },
      { h: 'Responsabilità dell’account', p: ['Siete responsabili delle vostre credenziali e di tutto ciò che avviene tramite il vostro account. Mantenete riservata la vostra password.'] },
      {
        h: 'Un account per persona',
        p: [
          'Ogni account è strettamente personale e può essere utilizzato da una sola persona. La condivisione di un account costituisce una violazione delle presenti condizioni e può comportarne la chiusura senza preavviso e senza rimborso del periodo residuo.',
          'Le aziende con più utenti devono utilizzare un piano Team, che fornisce un account per persona.',
        ],
      },
      {
        h: 'Piani Team, posti e titolari',
        p: [
          'Team 3 fornisce tre posti e Team 5 cinque posti, in ogni caso incluso l’acquirente. L’acquirente diventa titolare del team ed è responsabile dell’abbonamento, della fatturazione e dell’assegnazione dei posti.',
          'I membri attivi più gli inviti in sospeso non possono mai superare il limite dei posti. Il titolare può rimuovere un membro in qualsiasi momento; la persona rimossa perde immediatamente l’accesso all’abbonamento del team ma conserva il proprio account personale.',
          'Un membro del team può lasciare il team in qualsiasi momento. L’uscita libera il posto e non annulla l’abbonamento del team.',
        ],
      },
      {
        h: 'Prova gratuita',
        p: [
          'Ogni abbonamento inizia con una prova gratuita di 7 giorni. Per avviare la prova è richiesto un metodo di pagamento valido. Durante la prova non viene addebitato nulla.',
          'Se non disdite prima della fine della prova, viene prelevato il primo pagamento e l’abbonamento ha inizio.',
        ],
      },
      {
        h: 'Fatturazione, rinnovo e modifiche',
        p: [
          'Gli abbonamenti sono offerti con periodi di fatturazione mensile, semestrale e annuale e si rinnovano automaticamente alla fine di ogni periodo fino alla disdetta.',
          'Piano e periodo di fatturazione sono fissi per il periodo pagato. Le modifiche non hanno effetto a metà periodo: una modifica richiesta si applica dal rinnovo successivo e le nuove condizioni iniziano solo al termine del periodo in corso.',
          'Potete disdire in qualsiasi momento. La disdetta blocca il rinnovo successivo; l’accesso continua fino alla fine del periodo già pagato.',
        ],
      },
      { h: 'Pagamenti', p: ['I pagamenti sono elaborati da Paddle, che agisce come venditore ufficiale (merchant of record) ed emette le fatture comprensive dell’IVA applicabile.'] },
      {
        h: 'Uso consentito e protezione della banca dati',
        p: [
          'La banca dati è protetta dal diritto europeo delle banche dati. Potete utilizzare i dati solo nelle forme di presentazione offerte da questa applicazione (in particolare la ricerca, le viste di confronto e le schede tecniche generate) e solo per le vostre finalità professionali.',
          'Scraping, estrazione massiva, raccolta automatizzata, riproduzione, ridistribuzione, utilizzo per l’addestramento di IA e qualsiasi riutilizzo commerciale della banca dati o di una sua parte sostanziale sono vietati senza previo consenso scritto.',
          'I tentativi di aggirare le misure tecniche di protezione o di accedere ai set di dati al di fuori dell’applicazione comportano la chiusura dell’account e possono determinare responsabilità civile e penale.',
        ],
      },
      { h: 'Disponibilità del servizio', p: ['Puntiamo a un’elevata disponibilità ma non garantiamo un servizio ininterrotto. Manutenzione, aggiornamenti e guasti di terzi possono interrompere l’accesso.'] },
      {
        h: 'Esattezza dei dati',
        p: [
          'I dati dei prodotti provengono da registri pubblici e da fonti dei produttori e sono forniti esclusivamente a scopo di informazione professionale. L’ammissibilità agli incentivi pubblici è decisa esclusivamente dall’autorità competente. Verificate sempre la fonte ufficiale prima di prendere decisioni commerciali o tecniche.',
        ],
      },
      { h: 'Responsabilità', p: ['Nei limiti consentiti dalla legge, non rispondiamo di danni indiretti o consequenziali, né di decisioni prese sulla base dei dati forniti. Nulla nelle presenti condizioni esclude responsabilità che non possono essere escluse per legge.'] },
      { h: 'Risoluzione e sospensione', p: ['Possiamo sospendere o chiudere gli account che violano le presenti condizioni, in particolare in caso di condivisione dell’account ed estrazione non autorizzata di dati. Potete cessare di utilizzare il servizio in qualsiasi momento e richiedere la cancellazione del vostro account.'] },
      { h: 'Contatto', p: [`Domande sulle presenti condizioni: ${SUPPORT_EMAIL}, oppure «Nuova richiesta» sulla pagina Account.`] },
    ],
  },
  refund: {
    title: 'Politica di rimborso e disdetta',
    updated: ver.terms,
    intro: `La presente politica spiega cosa accade quando disdite il vostro abbonamento ${SERVICE_NAME} e quando un rimborso è dovuto o meno. Paddle è il nostro venditore ufficiale (merchant of record) e gestisce tutti i pagamenti.`,
    sections: [
      { h: 'Durante la prova gratuita', p: ['Ogni abbonamento inizia con una prova gratuita di 7 giorni. Durante la prova non viene addebitato nulla. Se disdite prima della fine della prova, nessun pagamento viene prelevato.'] },
      { h: 'Dopo la prova', p: ['Se non disdite prima della fine della prova, viene prelevato il primo pagamento e inizia il periodo pagato.'] },
      { h: 'Rimborso entro 14 giorni sul primo pagamento', p: [`Se il primo pagamento viene prelevato dopo la prova gratuita, potete richiedere il rimborso completo di tale primo pagamento entro 14 giorni dall'addebito, per qualsiasi motivo. Inviate una «Nuova richiesta» dalla pagina Account oppure scrivete a ${SUPPORT_EMAIL}: procederemo al rimborso insieme a Paddle. Questo diritto di 14 giorni si applica solo al primo pagamento; i rinnovi successivi sono disciplinati dalle sezioni seguenti.`] },
      {
        h: 'Disdire un abbonamento a pagamento',
        p: [
          'Potete disdire in qualsiasi momento. La disdetta blocca il rinnovo successivo — non pone fine al periodo in corso.',
          'L’accesso continua fino alla fine del periodo già pagato.',
        ],
      },
      { h: 'Tempo non utilizzato', p: ['Non rimborsiamo automaticamente il tempo non utilizzato di un periodo già pagato.'] },
      {
        h: 'Come disdire',
        p: [
          'Disdite tramite «Gestisci fatturazione» sulla pagina Account.',
          'La cancellazione dell’account HeatPump DataBase NON disdice l’abbonamento. La fatturazione è gestita separatamente e deve essere disdetta tramite «Gestisci fatturazione».',
        ],
      },
      { h: 'Rimborsi eccezionali', p: [`Se ritenete che il vostro caso sia eccezionale (ad esempio un addebito doppio), inviate una «Nuova richiesta» dalla pagina Account oppure scrivete a ${SUPPORT_EMAIL}: lo esamineremo insieme a Paddle.`] },
      { h: 'Merchant of record', p: [`I pagamenti degli abbonamenti sono elaborati da ${PADDLE_ENTITY}, che agisce come venditore ufficiale (merchant of record) per tutti gli abbonamenti. Fatture e documenti IVA sono emessi da Paddle. Le richieste di rimborso e disdetta possono essere inviate a ${SUPPORT_EMAIL}.`] },
    ],
  },
  imprint: buildImprint({
    title: 'Note legali',
    operator: 'Gestore del servizio',
    ownerShort: 'Titolare',
    address: 'Indirizzo commerciale registrato',
    regNo: 'Numero di registrazione dell’impresa',
    contact: 'Contatto',
    brand: 'Prodotto e marchio',
    payment: 'Elaborazione dei pagamenti',
    soleProp: 'Impresa individuale',
    emailLabel: 'E-mail:',
    brandSentence: `${BRAND_TM} è un marchio di prodotto gestito da ${OPERATOR_NAME}.`,
    paymentSentence: `I pagamenti degli abbonamenti sono elaborati da ${PADDLE_ENTITY}, che agisce come venditore ufficiale (merchant of record).`,
  }),
};

export const LEGAL_CONTENT: Record<Language, Record<'privacy' | 'terms' | 'refund' | 'imprint', LegalDocContent>> = {
  en: EN,
  de: DE,
  fr: FR,
  pl: PL,
  it: IT,
};
