import { Builder, By } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import 'chromedriver';

// Store active CAPTCHA sessions
const captchaSessions = new Map();

const delay = (ms) => new Promise(res => setTimeout(res, ms));

export const initializeCaptchaSession = async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Generate unique session ID
    const sessionId = `captcha_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    console.log(`🔐 Initializing CAPTCHA session: ${sessionId}`);
    
    // Set up Chrome options for CAPTCHA handling
    const options = new chrome.Options();
    
    // Use visible browser for CAPTCHA solving
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--window-size=1200,800');
    options.addArguments('--disable-web-security');
    options.addArguments('--disable-features=VizDisplayCompositor');
    
    // Anti-detection measures
    options.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    options.addArguments('--disable-blink-features=AutomationControlled');
    options.addArguments('--disable-automation');
    
    // Create driver
    const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
    
    // Parse the prompt to create search URL
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(prompt)}`;
    
    // Navigate to Google search
    await driver.get(searchUrl);
    await delay(2000);
    
    // Check if CAPTCHA is present
    const captchaElements = await driver.findElements(By.css([
      '[id*="captcha"]',
      '[class*="captcha"]', 
      '[id*="recaptcha"]',
      '[class*="recaptcha"]',
      'iframe[src*="recaptcha"]'
    ].join(', ')));
    
    const currentUrl = await driver.getCurrentUrl();
    const pageTitle = await driver.getTitle();
    
    // Store session data
    captchaSessions.set(sessionId, {
      driver,
      prompt,
      searchUrl,
      currentUrl,
      pageTitle,
      hasCaptcha: captchaElements.length > 0,
      resolved: false,
      createdAt: new Date(),
      lastActivity: new Date()
    });
    
    console.log(`✅ CAPTCHA session created: ${sessionId}`);
    console.log(`   🔍 Search URL: ${searchUrl}`);
    console.log(`   🌐 Current URL: ${currentUrl}`);
    console.log(`   🛡️ CAPTCHA detected: ${captchaElements.length > 0}`);
    
    res.json({
      sessionId,
      hasCaptcha: captchaElements.length > 0,
      currentUrl,
      pageTitle,
      message: captchaElements.length > 0 ? 'CAPTCHA detected - please solve it' : 'No CAPTCHA detected'
    });
    
  } catch (error) {
    console.error('❌ Error initializing CAPTCHA session:', error);
    res.status(500).json({ 
      error: 'Failed to initialize CAPTCHA session',
      message: error.message 
    });
  }
};

export const getCaptchaPage = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = captchaSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Update last activity
    session.lastActivity = new Date();
    
    // Get current page source
    const pageSource = await session.driver.getPageSource();
    const currentUrl = await session.driver.getCurrentUrl();
    
    // Create a modified HTML that works well in iframe
    const iframeHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Solve CAPTCHA</title>
        <style>
            body { 
                margin: 0; 
                padding: 20px; 
                font-family: Arial, sans-serif;
                background: #f5f5f5;
            }
            .captcha-container {
                background: white;
                border-radius: 8px;
                padding: 20px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                max-width: 600px;
                margin: 0 auto;
            }
            .header {
                text-align: center;
                margin-bottom: 20px;
                color: #333;
            }
            .status {
                background: #e3f2fd;
                border: 1px solid #2196f3;
                border-radius: 4px;
                padding: 10px;
                margin-bottom: 20px;
                text-align: center;
            }
            .refresh-btn {
                background: #4CAF50;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 4px;
                cursor: pointer;
                margin: 10px 5px;
            }
            .refresh-btn:hover {
                background: #45a049;
            }
            iframe {
                width: 100%;
                height: 400px;
                border: 1px solid #ddd;
                border-radius: 4px;
            }
        </style>
    </head>
    <body>
        <div class="captcha-container">
            <div class="header">
                <h2>🔐 CAPTCHA Verification Required</h2>
                <p>Please solve the CAPTCHA below to continue with lead generation</p>
            </div>
            
            <div class="status">
                <strong>Session:</strong> ${sessionId}<br>
                <strong>Current URL:</strong> <a href="${currentUrl}" target="_blank">${currentUrl}</a>
            </div>
            
            <div style="text-align: center; margin-bottom: 15px;">
                <button class="refresh-btn" onclick="refreshPage()">🔄 Refresh Page</button>
                <button class="refresh-btn" onclick="checkStatus()">✅ Check if Solved</button>
            </div>
            
            <iframe src="${currentUrl}" frameborder="0"></iframe>
            
            <div style="text-align: center; margin-top: 15px;">
                <p><small>💡 Solve the CAPTCHA in the frame above, then click "Check if Solved"</small></p>
            </div>
        </div>
        
        <script>
            function refreshPage() {
                location.reload();
            }
            
            function checkStatus() {
                fetch('/api/captcha/status/${sessionId}')
                    .then(response => response.json())
                    .then(data => {
                        if (data.resolved) {
                            // Show success message
                            document.body.innerHTML = \`
                                <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
                                    <div style="background: #e8f5e8; border: 2px solid #4CAF50; border-radius: 10px; padding: 30px; max-width: 500px; margin: 0 auto;">
                                        <h2 style="color: #2e7d32; margin-bottom: 20px;">🎉 CAPTCHA Solved Successfully!</h2>
                                        <p style="color: #2e7d32; font-size: 18px; margin-bottom: 20px;">
                                            Great job! We're now generating your leads.
                                        </p>
                                        <div style="background: #4CAF50; color: white; padding: 10px; border-radius: 5px; margin: 20px 0;">
                                            🚀 Lead generation is in progress...
                                        </div>
                                        <p style="color: #666; font-size: 14px;">
                                            This window will close automatically.
                                        </p>
                                    </div>
                                </div>
                            \`;

                            // Notify parent window
                            window.parent.postMessage({type: 'captcha-resolved', sessionId: '${sessionId}'}, '*');

                            // Auto-close after 3 seconds
                            setTimeout(() => {
                                window.parent.postMessage({type: 'close-captcha'}, '*');
                            }, 3000);
                        } else {
                            // Update status without alert
                            const statusDiv = document.querySelector('.status');
                            if (statusDiv) {
                                statusDiv.innerHTML = \`
                                    <strong>Status:</strong> ⏳ Please complete the CAPTCHA verification<br>
                                    <strong>Session:</strong> ${sessionId}<br>
                                    <small>The system will automatically detect when you've solved it.</small>
                                \`;
                            }
                        }
                    })
                    .catch(error => {
                        console.error('Error checking status:', error);
                        const statusDiv = document.querySelector('.status');
                        if (statusDiv) {
                            statusDiv.innerHTML = \`
                                <strong>Error:</strong> ❌ Could not check CAPTCHA status<br>
                                <small>Please try refreshing the page.</small>
                            \`;
                        }
                    });
            }
            
            // Auto-check status every 5 seconds
            setInterval(checkStatus, 5000);
        </script>
    </body>
    </html>`;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(iframeHtml);
    
  } catch (error) {
    console.error('❌ Error getting CAPTCHA page:', error);
    res.status(500).json({ 
      error: 'Failed to get CAPTCHA page',
      message: error.message 
    });
  }
};

export const checkCaptchaStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = captchaSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Update last activity
    session.lastActivity = new Date();
    
    // Check if CAPTCHA is resolved by looking for search results
    const searchResultElements = await session.driver.findElements(By.css([
      'div[data-ved]',
      'div.g', 
      'h3',
      '#search'
    ].join(', ')));
    
    const captchaElements = await session.driver.findElements(By.css([
      '[id*="captcha"]',
      '[class*="captcha"]',
      '[id*="recaptcha"]',
      '[class*="recaptcha"]'
    ].join(', ')));
    
    const resolved = searchResultElements.length > 0 && captchaElements.length === 0;
    
    // Update session
    session.resolved = resolved;
    session.hasCaptcha = captchaElements.length > 0;
    
    console.log(`🔍 CAPTCHA status check for ${sessionId}:`);
    console.log(`   ✅ Resolved: ${resolved}`);
    console.log(`   🛡️ CAPTCHA present: ${captchaElements.length > 0}`);
    console.log(`   📊 Search results: ${searchResultElements.length}`);
    
    res.json({
      sessionId,
      resolved,
      hasCaptcha: captchaElements.length > 0,
      searchResultsFound: searchResultElements.length,
      message: resolved ? 'CAPTCHA resolved successfully' : 'CAPTCHA still needs to be solved'
    });
    
  } catch (error) {
    console.error('❌ Error checking CAPTCHA status:', error);
    res.status(500).json({ 
      error: 'Failed to check CAPTCHA status',
      message: error.message 
    });
  }
};

export const resolveCaptcha = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = captchaSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (!session.resolved) {
      return res.status(400).json({ error: 'CAPTCHA not yet resolved' });
    }
    
    console.log(`✅ CAPTCHA resolved for session: ${sessionId}`);
    console.log(`🚀 Continuing with lead scraping...`);
    
    // Here you would continue with the actual lead scraping
    // For now, we'll return the driver state for the scraper to continue
    
    res.json({
      sessionId,
      resolved: true,
      message: 'CAPTCHA resolved - ready to continue scraping',
      driverReady: true
    });
    
  } catch (error) {
    console.error('❌ Error resolving CAPTCHA:', error);
    res.status(500).json({ 
      error: 'Failed to resolve CAPTCHA',
      message: error.message 
    });
  }
};

// Cleanup function to remove old sessions
export const cleanupSessions = () => {
  const now = new Date();
  const maxAge = 30 * 60 * 1000; // 30 minutes
  
  for (const [sessionId, session] of captchaSessions.entries()) {
    if (now - session.lastActivity > maxAge) {
      console.log(`🧹 Cleaning up expired session: ${sessionId}`);
      try {
        session.driver.quit();
      } catch (e) {
        console.log(`⚠️ Error closing driver for session ${sessionId}:`, e.message);
      }
      captchaSessions.delete(sessionId);
    }
  }
};

// Run cleanup every 10 minutes
setInterval(cleanupSessions, 10 * 60 * 1000);

// Export the sessions map for use in scraper
export { captchaSessions };
