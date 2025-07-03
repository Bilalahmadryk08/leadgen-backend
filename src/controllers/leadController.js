import { fetchLeads } from '../services/leadFetcher.js';
import { fetchLeadsFromApify } from '../services/providers/apify.js';
import { fetchLeadsFromApollo } from '../services/providers/apollo.js';
import { scrapeLeadsWithSelenium } from '../services/providers/scraper.js';

export const generateLeads = async (req, res) => {
  console.log(`\n🚀 ===== LEAD CONTROLLER DEBUG =====`);
  console.log(`⏰ Request received at: ${new Date().toISOString()}`);
  console.log(`🌐 Request method: ${req.method}`);
  console.log(`📍 Request URL: ${req.url}`);
  console.log(`📋 Request headers:`, JSON.stringify(req.headers, null, 2));
  console.log(`📦 Request body:`, JSON.stringify(req.body, null, 2));

  try {
    const { prompt, source, maxResults } = req.body;

    console.log(`\n📥 PARSED REQUEST DATA:`);
    console.log(`   🎯 Source: "${source}"`);
    console.log(`   💬 Prompt: "${prompt}"`);
    console.log(`   📊 Max Results: ${maxResults || 'not specified'}`);
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
        const scraperResult = await scrapeLeadsWithSelenium(prompt);

        // Check if CAPTCHA is required
        if (scraperResult && scraperResult.captchaRequired) {
          console.log(`🔒 CAPTCHA required - returning CAPTCHA response`);
          return res.json({
            captchaRequired: true,
            sessionId: scraperResult.sessionId,
            siteKey: scraperResult.siteKey,
            message: scraperResult.message
          });
        }

        leads = scraperResult || [];
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

        // Check if this is a CAPTCHA error
        try {
          const errorData = JSON.parse(scraperError.message);
          if (errorData.captchaRequired) {
            console.log(`🔒 CAPTCHA required - returning CAPTCHA response`);
            return res.json({
              captchaRequired: true,
              sessionId: errorData.sessionId,
              siteKey: errorData.siteKey,
              message: errorData.message
            });
          }
        } catch (parseError) {
          // Not a CAPTCHA error, continue with normal error handling
        }

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

// Streaming endpoint for real-time progress
export const generateLeadsStream = async (req, res) => {
  const { source, prompt, maxResults = 50 } = req.query;

  // Set up Server-Sent Events with proper CORS
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://leadgen-frontend-git-main-saudkhanbpks-projects.vercel.app'
  ];

  const origin = req.headers.origin;
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });

  const sendProgress = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    sendProgress('progress', {
      message: 'Starting lead generation...',
      percent: 0,
      leadsFound: 0
    });

    if (source === 'scraper') {
      // Import scraper dynamically to avoid circular imports
      const { scrapeLeads } = await import('../services/providers/scraper.js');

      // Create a progress callback
      const progressCallback = (progressData) => {
        sendProgress('progress', progressData);
      };

      const scraperResult = await scrapeLeads(prompt, maxResults, progressCallback);

      // Check if CAPTCHA is required
      if (scraperResult && scraperResult.captchaRequired) {
        sendProgress('captcha', scraperResult);
        res.end();
        return;
      }

      const leads = scraperResult.leads || scraperResult;
      sendProgress('complete', { leads, count: leads.length });

    } else {
      // For other sources, simulate progress and use existing logic
      sendProgress('progress', {
        message: 'Processing request...',
        percent: 50,
        leadsFound: 0
      });

      let leads = [];
      if (source === 'apify') {
        const { fetchLeadsFromApify } = await import('../services/providers/apify.js');
        leads = await fetchLeadsFromApify(prompt, maxResults);
      } else if (source === 'apollo') {
        const { fetchLeadsFromApollo } = await import('../services/providers/apollo.js');
        leads = await fetchLeadsFromApollo(prompt, maxResults);
      }

      sendProgress('progress', {
        message: 'Finalizing results...',
        percent: 100,
        leadsFound: leads.length
      });

      sendProgress('complete', { leads, count: leads.length });
    }

  } catch (error) {
    console.error('❌ Streaming error:', error);
    sendProgress('error', { message: error.message });
  }

  res.end();
};

