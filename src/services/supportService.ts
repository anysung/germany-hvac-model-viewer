/**
 * supportService — in-app support tickets (user inquiries ↔ admin replies).
 *
 * The support channel for this web-based B2B service. Tickets live in the
 * `supportTickets` Firestore collection so the
 * admin console can receive, answer, and close them; users see the full
 * thread on their Account page. Every ticket carries the market country
 * code so the unified admin can filter per country after expansion.
 */
import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc,
  query, where, orderBy, limit, arrayUnion,
} from 'firebase/firestore';
import { db } from '../firebase';
import { SupportTicket, TicketCategory, TicketMessage, TicketStatus, User } from '../types';
import { ACTIVE_COUNTRY } from '../config/countryProfiles';
import { logActivity } from './authService';

const TICKETS = 'supportTickets';

const nowIso = () => new Date().toISOString();

export async function createTicket(
  user: User,
  category: TicketCategory,
  subject: string,
  text: string,
): Promise<string> {
  const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
  const message: TicketMessage = { from: 'user', authorName: userName, text, at: nowIso() };
  const ticket: Omit<SupportTicket, 'id'> = {
    userId: user.id,
    userEmail: user.email,
    userName,
    country: user.country || ACTIVE_COUNTRY.code,
    category,
    subject,
    status: 'open',
    messages: [message],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const ref = await addDoc(collection(db, TICKETS), ticket);
  await logActivity(user.id, 'SUPPORT_TICKET_CREATED', `Ticket "${subject}" (${category})`, user.email, userName);
  return ref.id;
}

/** Member deletes a past inquiry from their own view. SOFT delete: the doc
 *  stays for the admin inbox/audit; the member's list simply hides it. */
export async function deleteMyTicket(ticketId: string): Promise<void> {
  await updateDoc(doc(db, TICKETS, ticketId), { userDeletedAt: new Date().toISOString() });
}

export async function getMyTickets(userId: string): Promise<SupportTicket[]> {
  try {
    const q = query(collection(db, TICKETS), where('userId', '==', userId));
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }) as SupportTicket);
    // User-deleted tickets disappear from the member's view only — the admin
    // inbox keeps the full history (support conversations are ops records).
    return list
      .filter(tk => !(tk as any).userDeletedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (e) {
    console.error('getMyTickets error', e);
    return [];
  }
}

export async function getAllTickets(): Promise<SupportTicket[]> {
  try {
    const q = query(collection(db, TICKETS), orderBy('updatedAt', 'desc'), limit(500));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as SupportTicket);
  } catch (e) {
    console.error('getAllTickets error', e);
    return [];
  }
}

/** User adds a follow-up message — reopens an answered ticket. */
export async function userReply(ticket: SupportTicket, user: User, text: string): Promise<void> {
  const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
  const message: TicketMessage = { from: 'user', authorName: userName, text, at: nowIso() };
  await updateDoc(doc(db, TICKETS, ticket.id), {
    messages: arrayUnion(message),
    status: 'open',
    updatedAt: nowIso(),
  });
}

/** Admin reply — appends to the thread and marks the ticket answered. */
export async function adminReply(ticketId: string, adminName: string, text: string): Promise<void> {
  const message: TicketMessage = { from: 'admin', authorName: adminName, text, at: nowIso() };
  await updateDoc(doc(db, TICKETS, ticketId), {
    messages: arrayUnion(message),
    status: 'answered',
    updatedAt: nowIso(),
  });
  await logActivity('ADMIN', 'SUPPORT_TICKET_REPLIED', `Ticket ${ticketId} answered`, '', adminName);
}

export async function setTicketStatus(ticketId: string, status: TicketStatus, adminName = 'Admin'): Promise<void> {
  await updateDoc(doc(db, TICKETS, ticketId), { status, updatedAt: nowIso() });
  await logActivity('ADMIN', 'SUPPORT_TICKET_STATUS', `Ticket ${ticketId} → ${status}`, '', adminName);
}

export async function getTicket(ticketId: string): Promise<SupportTicket | null> {
  const snap = await getDoc(doc(db, TICKETS, ticketId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as SupportTicket) : null;
}
