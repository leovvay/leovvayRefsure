// The N6 scenario templates, one file per site kind. Each `make(rng, lang)` returns one scenario: a record (its
// ref and near twin, a person, a number), its status ladder and target, its result, the wording that stands in
// for a missing result (pending, queued, refused), the page's main and sidebar, and the expectation writer.
import { adminUser } from './n6-tpl-admin.mjs';
import { bankTransfer } from './n6-tpl-bank.mjs';
import { calendarEvent } from './n6-tpl-calendar.mjs';
import { docsRelease } from './n6-tpl-docs.mjs';
import { forumTopic } from './n6-tpl-forum.mjs';
import { govPermit } from './n6-tpl-gov.mjs';
import { mailMessage } from './n6-tpl-mail.mjs';
import { newsComment } from './n6-tpl-news.mjs';
import { saasExport } from './n6-tpl-saas.mjs';
import { shopOrder } from './n6-tpl-shop.mjs';
import { storageFile } from './n6-tpl-storage.mjs';
import { supportTicket } from './n6-tpl-support.mjs';
import { tasksCard } from './n6-tpl-tasks.mjs';
import { travelBooking } from './n6-tpl-travel.mjs';

export const TEMPLATES = [
  shopOrder, bankTransfer, saasExport, newsComment, travelBooking, govPermit, forumTopic,
  docsRelease, adminUser, mailMessage, calendarEvent, tasksCard, storageFile, supportTicket,
];
