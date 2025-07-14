import express from 'express';
import { captchaSolvedSessions } from '../services/providers/scraper.js';

const router = express.Router();

// Store active scraping sessions that are waiting for CAPTCHA resolution
const activeSessions = new Map();

// Route to handle CAPTCHA solving
router.post('/solve', async (req, res) => {
  try {
    const { sessionId, token, captchaToken, prompt } = req.body;

    // Support both new format (token) and legacy format (captchaToken)
    const finalToken = token || captchaToken;

    console.log(`[CAPTCHA] Solve request received:`);
    console.log(`   Session ID: ${sessionId}`);
    console.log(`   Token: ${finalToken ? 'Present' : 'Missing'}`);
    console.log(`   Prompt: ${prompt || 'Not provided'}`);

    if (!sessionId || !finalToken) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and token are required'
      });
    }

    // Get the active session
    const session = activeSessions.get(sessionId);
    if (!session) {
      console.log(`[CAPTCHA] Session not found: ${sessionId}`);
      return res.status(404).json({
        success: false,
        error: 'Session not found or expired'
      });
    }

    console.log(`✅ CAPTCHA token received for session ${sessionId}`);
    console.log(`🔧 Injecting CAPTCHA token into browser...`);

    try {
      // Inject the CAPTCHA token into the browser using the correct method
      await session.driver.executeScript(`
        // Method 1: Set the g-recaptcha-response textarea value
        const responseTextarea = document.getElementById('g-recaptcha-response');
        if (responseTextarea) {
          responseTextarea.innerHTML = '${finalToken}';
          responseTextarea.value = '${finalToken}';
          responseTextarea.style.display = 'block';
          console.log('✅ Set g-recaptcha-response textarea');
        }

        // Method 2: Try alternative selectors
        const altTextarea = document.querySelector('textarea[name="g-recaptcha-response"]');
        if (altTextarea) {
          altTextarea.innerHTML = '${finalToken}';
          altTextarea.value = '${finalToken}';
          altTextarea.style.display = 'block';
          console.log('✅ Set alternative g-recaptcha-response textarea');
        }

        // Method 3: Set window.recaptchaToken for manual checking
        window.recaptchaToken = '${finalToken}';
        window.captchaSolved = true;
        console.log('✅ Set window.recaptchaToken and window.captchaSolved');

        // Method 4: Trigger any waiting callbacks
        if (window.grecaptcha) {
          try {
            // Try to find reCAPTCHA widgets and set their response
            const widgets = document.querySelectorAll('.g-recaptcha');
            widgets.forEach((widget, index) => {
              try {
                if (window.grecaptcha.getResponse) {
                  // Try to manually set the response for this widget
                  const widgetId = widget.getAttribute('data-widget-id') || index;
                  console.log('Found reCAPTCHA widget:', widgetId);
                }
              } catch (e) {
                console.log('Error with widget:', e);
              }
            });
          } catch (e) {
            console.log('Error with grecaptcha:', e);
          }
        }

        return 'CAPTCHA token injected successfully';
      `);

      console.log(`🎯 CAPTCHA token injected successfully`);

      // Mark this session type as having solved CAPTCHA for future headless mode
      if (session.sessionKey) {
        captchaSolvedSessions.add(session.sessionKey);
        console.log(`✅ Session key "${session.sessionKey}" marked as CAPTCHA-solved for future headless mode`);
      }

      // Wait a moment for the token to be processed
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if the CAPTCHA was actually processed on the page
      try {
        const captchaStatus = await session.driver.executeScript(`
          return {
            hasToken: !!window.recaptchaToken,
            tokenLength: window.recaptchaToken ? window.recaptchaToken.length : 0,
            captchaSolved: !!window.captchaSolved,
            responseTextarea: document.getElementById('g-recaptcha-response') ?
              document.getElementById('g-recaptcha-response').value.length : 0
          };
        `);

        console.log(`🔍 CAPTCHA status check:`, captchaStatus);
      } catch (statusError) {
        console.log(`⚠️ Could not check CAPTCHA status:`, statusError.message);
      }

      // Resume the scraping process by resolving the promise
      session.resolve({ success: true, captchaResolved: true });

      // Clean up the session
      activeSessions.delete(sessionId);

      console.log(`🎯 CAPTCHA session resolved and cleaned up`);

      res.json({ 
        success: true, 
        message: 'CAPTCHA solved successfully, scraping resumed' 
      });

    } catch (injectionError) {
      console.error(`💥 Chrome crashed during CAPTCHA injection:`, injectionError.message);

      // Clean up the session immediately
      activeSessions.delete(sessionId);

      // Reject the session with a clear error
      session.reject(new Error(`Chrome crashed during CAPTCHA injection: ${injectionError.message}`));

      res.status(500).json({
        success: false,
        error: 'Chrome crashed during CAPTCHA injection',
        details: injectionError.message
      });
    }

  } catch (error) {
    console.error('CAPTCHA solve error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Route to check session status
router.get('/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = activeSessions.get(sessionId);
  
  res.json({
    exists: !!session,
    sessionId: sessionId
  });
});

// Export functions to be used by the scraper
export const createCaptchaSession = (sessionId, driver, resolve, reject, sessionKey = null) => {
  console.log(`[CAPTCHA] Waiting for solution for session ${sessionId}`);

  activeSessions.set(sessionId, {
    driver,
    resolve,
    reject,
    sessionKey, // Store session key for marking as solved
    createdAt: Date.now()
  });

  // Auto-cleanup after 3 minutes with improved error handling
  setTimeout(() => {
    if (activeSessions.has(sessionId)) {
      console.warn(`⚠️ CAPTCHA session expired - no user interaction: ${sessionId}`);
      const session = activeSessions.get(sessionId);

      // Clean up session first
      activeSessions.delete(sessionId);

      // Reject with timeout error
      session.reject(new Error('CAPTCHA session expired - no user interaction within 3 minutes'));
    }
  }, 180000); // 3 minutes (180 seconds)
};

export const cleanupCaptchaSession = (sessionId) => {
  activeSessions.delete(sessionId);
};

// Route to resume scraping after CAPTCHA is solved
router.post('/resume-scraping', async (req, res) => {
  try {
    const { sessionId, prompt } = req.body;

    console.log(`🔄 Resume scraping request received:`);
    console.log(`   Session ID: ${sessionId}`);
    console.log(`   Prompt: ${prompt}`);

    if (!sessionId || !prompt) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and prompt are required'
      });
    }

    // Import the scraper function dynamically to avoid circular imports
    const { scrapeLeadsWithSelenium } = await import('../services/providers/scraper.js');

    // Attempt to scrape again - this time CAPTCHA should be solved
    const leads = await scrapeLeadsWithSelenium(prompt);

    console.log(`✅ Resumed scraping completed: ${leads ? leads.length : 0} leads found`);

    res.json({
      success: true,
      leads: leads || [],
      message: 'Scraping resumed successfully after CAPTCHA resolution'
    });

  } catch (error) {
    console.error('❌ Error resuming scraping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resume scraping',
      details: error.message
    });
  }
});

export default router;
