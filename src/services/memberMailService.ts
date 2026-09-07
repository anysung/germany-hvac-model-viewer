/**
 * memberMailService — send a message to a member from support@heatpumpdb.eu.
 *
 * Transport only. The function (google_cloud_function_billing) holds the
 * mailbox credential, checks the admin role, resolves the recipient FROM THE
 * ACCOUNT rather than from this request, and records every send. A browser can
 * name a member; it can never name an address.
 *
 * The address matters: support@heatpumpdb.eu is what the legal pages publish,
 * so it is where a member's reply has to arrive. Sending from anywhere else
 * would ask people to reply into a mailbox nobody reads.
 */
import { auth } from '../firebase';
import { OPS_FN_URL } from './opsService';

export type MemberEmailKind =
  | 'suspension'
  | 'verification_request'
  | 'reactivation'
  | 'trial'
  | 'billing'
  | 'announcement'
  | 'support_reply'
  | 'notice';

/** Every kind the server accepts, in the order the composer offers them.
 *  Keep in step with MEMBER_EMAIL_KINDS in the billing function — the server
 *  silently rewrites anything it does not recognise to 'notice'. */
export const MEMBER_EMAIL_KIND_OPTIONS: MemberEmailKind[] = [
  'notice', 'trial', 'billing', 'support_reply', 'announcement',
  'verification_request', 'reactivation', 'suspension',
];

export interface SentMemberEmail {
  id: string;
  uid: string;
  to: string;
  subject: string;
  body: string;
  kind: MemberEmailKind;
  at: string;
  sentByEmail?: string | null;
  ok?: boolean;
  error?: string;
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('unauthenticated');
  const token = await user.getIdToken();
  const res = await fetch(`${OPS_FN_URL}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    // 'smtp-not-configured' is the one an operator will actually hit first —
    // it means the mailbox secret is not deployed yet, not that the address is
    // wrong. Pass the server's own word through so the UI can say which.
    throw new Error(payload?.error ?? `mail-${res.status}`);
  }
  return payload as T;
}

export const sendMemberEmail = (
  uid: string, subject: string, body: string, kind: MemberEmailKind,
): Promise<{ ok: true; to: string; messageId: string | null }> =>
  call('sendMemberEmail', { uid, subject, body, kind });

export const listMemberEmails = (uid: string): Promise<{ ok: true; items: SentMemberEmail[] }> =>
  call('listMemberEmails', { uid });

/** The rendered letterhead for this draft, produced by the SAME server code that
 *  sends it — so what the composer shows and what the member receives cannot
 *  drift apart. Images come back inlined; a real send still uses attachments. */
export const previewMemberEmail = (uid: string, body: string): Promise<{ ok: true; html: string }> =>
  call('previewMemberEmail', { uid, body });
