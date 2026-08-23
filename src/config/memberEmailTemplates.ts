/**
 * memberEmailTemplates — starting points for a message to a member.
 *
 * A template is a DRAFT, never a send. Every one of these opens in an editable
 * composer because the facts differ per case and the admin is the one who
 * knows them.
 *
 * WHAT A SUSPENSION NOTICE SAYS, AND WHAT IT WITHHOLDS
 * It states that a review found an irregularity and that access is suspended
 * while that stands — and it does not itemise what was seen. That is deliberate
 * (owner decision, 2026-08-23): describing the signal teaches the next person
 * how to avoid it, and a reader with nothing to hide simply replies, which is
 * the outcome the appeal line is there to produce. What it must never do is
 * claim a specific finding we could not stand behind if asked, so the wording
 * stays at the level we can defend: a review, an irregularity, a decision.
 *
 * THE MULTI-EDITION PARAGRAPH IS NOT PART OF THE REASON
 * One account per national edition exists for the operational integrity of the
 * service, not to ration access, and a member who wants two editions is told
 * plainly to register each with its own address. It sits in the notice as
 * guidance, deliberately separate from the suspension: presenting it as the
 * cause would tell a reader who used two addresses that they were punished for
 * following the very rule we are quoting.
 *
 * The data-protection paragraph is a different matter and belongs in the
 * suspension notice: it restates the Data-use term the member already accepted
 * at registration, in the conditional. It never counts our defences or names
 * them — a reader who learns how many layers there are, or that published rows
 * carry markers of a particular kind, has learned how to work around them.
 *
 * English is the default because it is the one language every market's members
 * share. Translate in the composer when the member's market makes that kinder.
 */
import { User } from '../types';
import { COUNTRY_PROFILES } from './countryProfiles';
import type { MemberEmailKind } from '../services/memberMailService';

export interface MemberEmailTemplate {
  id: string;
  /** Admin-facing name in the composer's picker. */
  label: string;
  kind: MemberEmailKind;
  /** What an admin must fill in before sending — shown as a checklist. */
  fillIn?: string[];
  build: (user: User) => { subject: string; body: string };
}

/** "— France edition", never "— FR edition": the member reads a market name. */
const editionOf = (u: User): string => {
  const name = u.country ? COUNTRY_PROFILES[u.country as keyof typeof COUNTRY_PROFILES]?.name : null;
  return name ? ` — ${name} edition` : '';
};

const salutation = (u: User): string => {
  const last = (u.lastName ?? '').trim();
  const first = (u.firstName ?? '').trim();
  if (last) return `Dear ${first ? `${first} ${last}` : last},`;
  return first ? `Dear ${first},` : 'Dear customer,';
};

/* No sign-off here. The server appends the signature — a letterhead in the HTML
   part, the same lines as text in the plain part — so a template cannot ship a
   second one, and an admin cannot delete it by editing the body. */
const signOff = 'Regards,';

/** The paragraph that restates the accepted Data-use term. Conditional, and
 *  specific about nothing: it is a reminder of the contract, not a threat and
 *  not a description of our controls. */
const DATA_PARAGRAPH = `Data protection. The HeatPump DB product database is protected by copyright and database rights. Access is monitored, and the published data carries protective measures that allow unauthorised copying to be identified after the data has left our systems. Automated collection, bulk copying, redistribution or unauthorised commercial use of the data by means the service does not provide is not permitted, and may lead to legal liability under our Terms of Use and applicable law.`;

/** Formal guidance, not an accusation — see the note at the top of the file. */
const MULTI_EDITION = `Using more than one national edition. Our accounts are issued one per national edition. That is an operational rule — each edition serves a different market's data and correspondence — and it is not a limit on who may use the service. If you need access to more than one edition, register each with its own email address, and with registration details that identify you and your organisation accurately.`;

/** Names the address explicitly: a suspended member cannot open the in-app
 *  support thread, and "reply to this message" alone is easy to overlook. */
const APPEAL = (days = 14) =>
  `If you believe this decision is mistaken, reply to this message or write to support@heatpumpdb.eu within ${days} days, and we will review it.`;

export const MEMBER_EMAIL_TEMPLATES: MemberEmailTemplate[] = [
  {
    id: 'suspension_irregularity',
    label: 'Suspension — irregularity found in review',
    kind: 'suspension',
    fillIn: [
      'List every account being suspended, with its market — one line each',
      'Remove the billing line if the member did hold a paid subscription',
      'Do not add what the irregularity was; the appeal line is what opens that conversation',
    ],
    build: (u) => ({
      subject: 'HeatPump DB — your account has been suspended',
      body: `${salutation(u)}

The following HeatPump DB account has been suspended:

• ${u.email}${editionOf(u)}

Reason. A review of this registration identified an irregularity, and access is suspended while that remains unresolved. We are not able to set out the detail of what was identified.

${MULTI_EDITION}

${DATA_PARAGRAPH}

Billing. This account held no paid subscription. No payment was taken and no amount is owed.

${APPEAL()}

${signOff}`,
    }),
  },
  {
    id: 'verification_request',
    label: 'Registration details — verification request',
    kind: 'verification_request',
    fillIn: [
      'Name the field that cannot be verified (company name, website, city)',
      'Set the deadline you intend to hold to',
    ],
    build: (u) => ({
      subject: 'HeatPump DB — please confirm your registration details',
      body: `${salutation(u)}

We are reviewing the registration details on your HeatPump DB account (${u.email}) and are unable to verify the company information provided${u.companyName ? ` ("${u.companyName}")` : ''}.

HeatPump DB is a business service, and accounts are issued to identifiable businesses. Please reply with your company name, its website, and your role there.

If we do not hear from you within 14 days, the account will be deactivated. You can ask us to restore it at any time afterwards by replying with the same information.

${signOff}`,
    }),
  },
  {
    id: 'suspension_data_use',
    label: 'Suspension — data-use term',
    kind: 'suspension',
    fillIn: [
      'REQUIRED: state the observation this rests on (what was measured, when)',
      'Do not send this template without that observation — use the duplicate-account one instead',
    ],
    build: (u) => ({
      subject: 'HeatPump DB — your account has been suspended',
      body: `${salutation(u)}

Your HeatPump DB account (${u.email}) has been suspended under the Data-use term you accepted at registration.

Observation. [State here exactly what was observed and when — the volume, the pattern, the dates. If this cannot be stated concretely, this is not the right notice to send.]

${DATA_PARAGRAPH}

${APPEAL()}

${signOff}`,
    }),
  },
  {
    id: 'reactivation',
    label: 'Account restored',
    kind: 'reactivation',
    build: (u) => ({
      subject: 'HeatPump DB — your account has been restored',
      body: `${salutation(u)}

Your HeatPump DB account (${u.email}) has been restored and you can sign in again.

Thank you for clarifying the matter.

${signOff}`,
    }),
  },
  {
    id: 'blank',
    label: 'Blank message',
    kind: 'notice',
    build: (u) => ({
      subject: 'HeatPump DB',
      body: `${salutation(u)}

${signOff}`,
    }),
  },
];
