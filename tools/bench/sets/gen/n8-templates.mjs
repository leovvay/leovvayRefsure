// The N8 page templates, one file per site family. Each template: `id`, `kind` (N5's look), `hosts` (the domains
// it can carry, each with its own field label, or null for the domain's default label) and `make(rng, lang, domain)`.
import { bankPayment, travelBooking } from './n8-tpl-bank.mjs';
import { docsPage, forumThread, newsAccount } from './n8-tpl-media.mjs';
import { calendarEvent, mailSettings, tasksBoard } from './n8-tpl-office.mjs';
import { govForm, supportContact } from './n8-tpl-public.mjs';
import { shopCatalog, shopCheckout } from './n8-tpl-shop.mjs';
import { adminUsers, saasSettings, storageShare } from './n8-tpl-work.mjs';

export const TEMPLATES = [
  shopCheckout, shopCatalog, bankPayment, travelBooking, saasSettings, adminUsers, storageShare, newsAccount,
  forumThread, docsPage, mailSettings, calendarEvent, tasksBoard, govForm, supportContact,
];
