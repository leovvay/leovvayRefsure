import type { DecisionSite } from '../decision-site';
import type { SiteId } from '../site-id';
import { dismissSite } from './dismiss';
import { findSite } from './find';
import { locateSite } from './locate';
import { optionMapSite } from './option-map';
import { outcomeSite } from './outcome';
import { pageStateSite } from './page-state';
import { presenceSite } from './presence';

/** Every shipped site by id: one bundle, no lookup by name outside this map. */
export const SITES: Readonly<Record<SiteId, DecisionSite<unknown, unknown, unknown>>> = Object.freeze({
  locate: locateSite,
  find: findSite,
  dismiss: dismissSite,
  'page-state': pageStateSite,
  outcome: outcomeSite,
  presence: presenceSite,
  'option-map': optionMapSite,
});
