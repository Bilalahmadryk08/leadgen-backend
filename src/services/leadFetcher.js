// File: backend/src/services/leadFetcher.js

import { fetchLeadsFromApify } from './providers/apify.js';
import { fetchLeadsFromApollo } from './providers/apollo.js';
import { scrapeLeadsWithSelenium } from './providers/scraper.js';

export const fetchLeads = async (
  source,
  prompt,
  maxResults
) => {
  switch (source) {
    case 'apify':
      return await fetchLeadsFromApify(prompt, maxResults);
    case 'apollo':
      return await fetchLeadsFromApollo(prompt, maxResults);
    case 'scraper':
      return await scrapeLeadsWithSelenium(prompt);
    default:
      throw new Error('Unknown lead source');
  }
};