/**
 * Consumer mailbox providers — used to decide whether to WARN, never to refuse.
 *
 * A tradesman running a two-person installation business on a gmail address is
 * exactly our customer, so nothing here blocks a signup. The list exists for one
 * purpose: the account email cannot be changed afterwards, and Paddle sends the
 * receipt to it, so someone who will need that receipt for an expense claim
 * should be told BEFORE they commit rather than after.
 *
 * Someone typing a company address gets no dialog at all — a warning shown to a
 * person who already did the right thing is pure friction.
 *
 * Regional coverage matters more than length: a German installer types
 * @t-online.de and a Polish one @wp.pl far more often than either types
 * @gmail.com, and a list that only knows the American providers would miss the
 * people it is meant to help.
 */
const FREE_MAIL_DOMAINS = new Set([
  // global
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'msn.com', 'yahoo.com', 'ymail.com', 'aol.com', 'icloud.com', 'me.com',
  'mac.com', 'proton.me', 'protonmail.com', 'pm.me', 'mail.com', 'zoho.com',
  'gmx.com', 'yandex.com',
  // Germany / Austria / Switzerland
  'web.de', 'gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch', 't-online.de',
  'freenet.de', 'arcor.de', 'posteo.de', 'mailbox.org', 'online.de',
  'hotmail.de', 'outlook.de', 'yahoo.de', 'bluewin.ch', 'aon.at',
  // France
  'orange.fr', 'wanadoo.fr', 'free.fr', 'laposte.net', 'sfr.fr', 'bbox.fr',
  'neuf.fr', 'hotmail.fr', 'outlook.fr', 'yahoo.fr', 'live.fr',
  // Italy
  'libero.it', 'virgilio.it', 'alice.it', 'tin.it', 'tiscali.it', 'inwind.it',
  'hotmail.it', 'outlook.it', 'yahoo.it', 'live.it', 'email.it', 'fastwebnet.it',
  // Poland
  'wp.pl', 'o2.pl', 'interia.pl', 'interia.eu', 'onet.pl', 'op.pl', 'gazeta.pl',
  'poczta.onet.pl', 'tlen.pl', 'vp.pl', 'hotmail.pl', 'outlook.pl',
  // United Kingdom / Ireland
  'btinternet.com', 'sky.com', 'virginmedia.com', 'talktalk.net', 'ntlworld.com',
  'yahoo.co.uk', 'hotmail.co.uk', 'outlook.co.uk', 'live.co.uk', 'eircom.net',
]);

/** True when the address belongs to a consumer mailbox provider. */
export function isFreeMailAddress(email: string): boolean {
  const domain = String(email ?? '').trim().toLowerCase().split('@')[1];
  return !!domain && FREE_MAIL_DOMAINS.has(domain);
}
