// The N5 scenario templates, one file per site kind. Each `make(rng, lang, intentLang)` returns one scenario:
// the before page's content per state (before, done, wrong, invalid), its success, wrong-item and confirmation
// wording, and the English phrases the item `why` is built from.
import { adminRole } from './n5-tpl-admin.mjs';
import { bankTransfer } from './n5-tpl-bank.mjs';
import { calendarMove } from './n5-tpl-calendar.mjs';
import { docsRename } from './n5-tpl-docs.mjs';
import { forumTopic } from './n5-tpl-forum.mjs';
import { govPermit } from './n5-tpl-gov.mjs';
import { mailSend } from './n5-tpl-mail.mjs';
import { newsNewsletter } from './n5-tpl-news.mjs';
import { saasTimezone } from './n5-tpl-saas.mjs';
import { shopCart } from './n5-tpl-shop.mjs';
import { storageShare } from './n5-tpl-storage.mjs';
import { supportRequest } from './n5-tpl-support.mjs';
import { tasksMove } from './n5-tpl-tasks.mjs';
import { travelSeat } from './n5-tpl-travel.mjs';

export const TEMPLATES = [
  shopCart, bankTransfer, saasTimezone, newsNewsletter, travelSeat, govPermit, forumTopic,
  docsRename, adminRole, mailSend, calendarMove, tasksMove, storageShare, supportRequest,
];
