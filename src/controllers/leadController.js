import { fetchLeads } from '../services/leadFetcher.js';
import { fetchLeadsFromApify } from '../services/providers/apify.js';
import { fetchLeadsFromApollo } from '../services/providers/apollo.js';
import { scrapeLeadsWithSelenium, scrapeLeadsWithCaptchaSession } from '../services/providers/scraper.js';

export const generateLeads = async (req, res) => {
  console.log(`\n🚀 ===== LEAD CONTROLLER DEBUG =====`);
  console.log(`⏰ Request received at: ${new Date().toISOString()}`);
  console.log(`🌐 Request method: ${req.method}`);
  console.log(`📍 Request URL: ${req.url}`);
  console.log(`📋 Request headers:`, JSON.stringify(req.headers, null, 2));
  console.log(`📦 Request body:`, JSON.stringify(req.body, null, 2));

  try {
    const { prompt, source, maxResults, sessionId } = req.body;

    console.log(`\n📥 PARSED REQUEST DATA:`);
    console.log(`   🎯 Source: "${source}"`);
    console.log(`   💬 Prompt: "${prompt}"`);
    console.log(`   📊 Max Results: ${maxResults || 'not specified'}`);
    console.log(`   🔐 Session ID: ${sessionId || 'none'}`);
    console.log(`   ⏰ Timestamp: ${new Date().toISOString()}`);

    if (!prompt || !source) {
      console.log(`\n❌ VALIDATION ERROR:`);
      console.log(`   📝 Prompt provided: ${!!prompt}`);
      console.log(`   🎯 Source provided: ${!!source}`);
      return res.status(400).json({ error: 'prompt and source are required' });
    }

    console.log(`✅ Request validation passed`);

    let leads = [];
    const startTime = Date.now();

    if (source === 'apify') {
      console.log(`🔄 Processing with Apify...`);
      leads = await fetchLeadsFromApify(prompt, maxResults || 50);
    } else if (source === 'apollo') {
      console.log(`🔄 Processing with Apollo...`);
      leads = await fetchLeadsFromApollo(prompt, maxResults || 50);
    } else if (source === 'scraper') {
      console.log(`\n🔄 PROCESSING WITH SELENIUM SCRAPER:`);
      console.log(`   📝 Prompt: "${prompt}"`);
      console.log(`   📊 Max Results: ${maxResults || 'default'}`);
      console.log(`   ⏰ Scraper start time: ${new Date().toISOString()}`);

      try {
        console.log(`🚀 CALLING SCRAPER FUNCTION...`);

        // Use CAPTCHA session if provided
        if (sessionId) {
          console.log(`🔐 Using CAPTCHA session: ${sessionId}`);
          leads = await scrapeLeadsWithCaptchaSession(prompt, sessionId);
        } else {
          leads = await scrapeLeadsWithSelenium(prompt);
        }

        // Check if CAPTCHA is required
        if (leads && leads.requiresCaptcha) {
          console.log(`🛡️ CAPTCHA required for scraping`);
          return res.status(202).json({
            requiresCaptcha: true,
            sessionId: leads.sessionId,
            message: 'CAPTCHA verification required',
            captchaUrl: `/api/captcha/page/${leads.sessionId}`
          });
        }

        console.log(`\n✅ SCRAPER COMPLETED SUCCESSFULLY:`);
        console.log(`   📊 Leads returned: ${leads ? leads.length : 0}`);
        console.log(`   📋 Lead sample: ${leads && leads.length > 0 ? JSON.stringify(leads[0], null, 2) : 'No leads'}`);

        // Ensure we have an array
        if (!Array.isArray(leads)) {
          console.log(`⚠️ Scraper returned non-array, converting...`);
          leads = [];
        }

      } catch (scraperError) {
        console.log(`\n❌ SCRAPER ERROR:`);
        console.log(`   🚨 Error message: ${scraperError.message}`);
        console.log(`   📚 Error stack: ${scraperError.stack}`);

        // Return empty array instead of throwing
        leads = [];
        console.log(`🔄 Returning empty leads array due to error`);
      }
    } else {
      console.log(`❌ Unknown source: ${source}`);
      return res.status(400).json({ error: 'Invalid source. Use: apify, apollo, or scraper' });
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log(`✅ Request completed:`);
    console.log(`   Generated: ${leads.length} leads`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Source: ${source}`);

    res.json({
      leads,
      meta: {
        count: leads.length,
        source: source,
        duration: duration,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`❌ Error in generateLeads:`, error);
    res.status(500).json({
      error: 'Failed to generate leads',
      message: error.message
    });
  }
};

export const scrapeLeads = async (req, res) => {
  try {
    const { source, prompt, maxResults } = req.body;
    if (!source || !prompt) {
      return res.status(400).json({ error: 'source and prompt are required' });
    }
    const leads = await fetchLeads(source, prompt, maxResults || 50);
    return res.status(200).json({ leads });
  } catch (error) {
    console.error('Scrape failed:', error.message);
    return res.status(500).json({ error: 'Scraping failed' });
  }
};

