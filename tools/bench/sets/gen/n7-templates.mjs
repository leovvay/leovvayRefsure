// The N7 scenario templates, one file per site kind. Each `make(rng, lang)` returns one scenario: chrome, the
// page body around an event slot, the people, and per category the page-language texts the events show.
// Every template has English and one other language (uk, de or es) in `langs`.
import { adminUsers } from './n7-tpl-admin.mjs';
import { bankPayments } from './n7-tpl-bank.mjs';
import { docsPortal } from './n7-tpl-docs.mjs';
import { forumThread } from './n7-tpl-forum.mjs';
import { govApplication } from './n7-tpl-gov.mjs';
import { mailCompose } from './n7-tpl-mail.mjs';
import { newsSearch } from './n7-tpl-news.mjs';
import { saasMembers } from './n7-tpl-saas.mjs';
import { shopCheckout } from './n7-tpl-shop.mjs';
import { storageUpload } from './n7-tpl-storage.mjs';
import { supportRequest } from './n7-tpl-support.mjs';
import { travelBooking } from './n7-tpl-travel.mjs';

export const TEMPLATES = [
  shopCheckout, bankPayments, saasMembers, newsSearch, travelBooking, govApplication,
  forumThread, docsPortal, adminUsers, mailCompose, storageUpload, supportRequest,
];
