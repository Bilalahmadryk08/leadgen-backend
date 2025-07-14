// seleniumScraper.js
import { Builder, By } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import 'chromedriver';
import { createCaptchaSession, cleanupCaptchaSession } from '../../routes/captchaRoutes.js';
import { v4 as uuidv4 } from 'uuid';

const delay = (ms) => new Promise(res => setTimeout(res, ms));

function extractNameFromURL(url) {
  try {
    let hostname = new URL(url).hostname;

    // Remove common subdomains
    hostname = hostname.replace(/^(www\.|get\.|app\.|portal\.|login\.)/i, '');

    // Take first part of remaining hostname
    let name = hostname.split('.')[0];

    // Capitalize the first letter
    name = name.charAt(0).toUpperCase() + name.slice(1);

    return name;
  } catch (e) {
    console.error(`Error extracting name from URL: ${e.message}`);
    return null;
  }
}

// Track sessions that have solved CAPTCHA to enable headless mode
export const captchaSolvedSessions = new Set();

// Store active scraping sessions waiting for CAPTCHA resolution
const pendingScrapingSessions = new Map();

// Function to detect CAPTCHA and extract site key
const detectCaptcha = async (driver) => {
  try {
    // Check for various CAPTCHA indicators
    const captchaSelectors = [
      '[id*="captcha"]',
      '[class*="captcha"]',
      '[id*="recaptcha"]',
      '[class*="recaptcha"]',
      'iframe[src*="recaptcha"]',
      '.g-recaptcha',
      '[data-sitekey]'
    ];

    const captchaElements = await driver.findElements(By.css(captchaSelectors.join(', ')));

    if (captchaElements.length > 0) {
      console.log(`🔍 CAPTCHA detected! Found ${captchaElements.length} CAPTCHA elements`);

      // Try to extract the site key
      let siteKey = null;

      try {
        // Method 1: Look for data-sitekey attribute
        const siteKeyElement = await driver.findElement(By.css('[data-sitekey]'));
        siteKey = await siteKeyElement.getAttribute('data-sitekey');
        console.log(`🔑 Site key found via data-sitekey: ${siteKey}`);
      } catch (e) {
        // Method 2: Look in iframe src
        try {
          const iframe = await driver.findElement(By.css('iframe[src*="recaptcha"]'));
          const src = await iframe.getAttribute('src');
          const match = src.match(/k=([^&]+)/);
          if (match) {
            siteKey = match[1];
            console.log(`🔑 Site key found via iframe src: ${siteKey}`);
          }
        } catch (e2) {
          // Method 3: Look in page source for site key
          try {
            const pageSource = await driver.getPageSource();
            const match = pageSource.match(/data-sitekey=["']([^"']+)["']/);
            if (match) {
              siteKey = match[1];
              console.log(`🔑 Site key found in page source: ${siteKey}`);
            }
          } catch (e3) {
            console.log(`⚠️ Could not extract site key, using default`);
            // Use a common Google reCAPTCHA site key as fallback
            siteKey = '6LfW3QkTAAAAAHqPn3vIwDlWx_JpC0pkTiYKjbxj';
          }
        }
      }

      return {
        detected: true,
        siteKey: siteKey
      };
    }

    return { detected: false };
  } catch (error) {
    console.log(`⚠️ Error detecting CAPTCHA: ${error.message}`);
    return { detected: false };
  }
};

const parsePrompt = (prompt) => {
  // First, extract the lead count using a clean regex that looks for "generate X"
  const countMatch = prompt.match(/generate\s+(\d+)/i);
  const count = countMatch ? parseInt(countMatch[1], 10) : 50; // Default to 50 only if no number found

  console.log(`🔢 Extracted lead count: ${count} from prompt: "${prompt}"`);

  // Then parse the category and location using simplified patterns
  const patterns = [
    /generate\s+\d+\s+leads\s+of\s+(.+?)\s+in\s+(.+)/i,
    /generate\s+\d+\s+(.+?)\s+leads\s+in\s+(.+)/i,
    /generate\s+\d+\s+(.+?)\s+in\s+(.+)/i,
    /\d+\s+leads\s+of\s+(.+?)\s+in\s+(.+)/i,
    /\d+\s+(.+?)\s+leads\s+in\s+(.+)/i,
    /find\s+\d+\s+(.+?)\s+in\s+(.+)/i,
    /(.+?)\s+in\s+(.+)/i
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (match) {
      const category = match[1].trim();
      const location = match[2].trim();
      return { count, category, location };
    }
  }

  throw new Error('❌ Invalid prompt. Use: "generate 10 leads of restaurants in California"');
};

const scrapeWebsite = async (driver, url, category) => {
  try {
    console.log(`   🌐 Loading: ${url}`);
    await driver.get(url);
    await delay(3000); // Increased wait time for page to fully load

    // Try to find contact information using targeted selectors first
    let phones = [];
    let emails = [];
    let address = 'Address not available';

    // Enhanced phone number extraction with targeted selectors
    const phoneSelectors = [
      'a[href^="tel:"]',
      '[class*="phone"]',
      '[id*="phone"]',
      '[class*="contact"]',
      '[id*="contact"]',
      '[class*="call"]',
      '[id*="call"]',
      'span:contains("Phone")',
      'div:contains("Phone")',
      'p:contains("Phone")'
    ];

    // Enhanced email extraction with targeted selectors
    const emailSelectors = [
      'a[href^="mailto:"]',
      '[class*="email"]',
      '[id*="email"]',
      '[class*="contact"]',
      '[id*="contact"]',
      'span:contains("Email")',
      'div:contains("Email")',
      'p:contains("Email")'
    ];

    // Address selectors
    const addressSelectors = [
      '[class*="address"]',
      '[id*="address"]',
      '[class*="location"]',
      '[id*="location"]',
      'span:contains("Address")',
      'div:contains("Address")',
      'p:contains("Address")'
    ];

    console.log(`   🔍 Searching for contact info using targeted selectors...`);

    // Extract phone numbers using targeted approach
    for (const selector of phoneSelectors) {
      try {
        const elements = await driver.findElements(By.css(selector));
        for (const element of elements) {
          try {
            let text = '';
            if (selector === 'a[href^="tel:"]') {
              text = await element.getAttribute('href');
              text = text.replace('tel:', '').trim();
            } else {
              text = await element.getText();
            }

            if (text) {
              const phoneMatches = text.match(/(\+?1[-.\s]?)?\(?([2-9][0-9]{2})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g);
              if (phoneMatches) {
                phones.push(...phoneMatches);
                console.log(`   📞 Found phone via selector "${selector}": ${phoneMatches[0]}`);
              }
            }
          } catch (e) {
            // Continue to next element
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Extract emails using targeted approach
    for (const selector of emailSelectors) {
      try {
        const elements = await driver.findElements(By.css(selector));
        for (const element of elements) {
          try {
            let text = '';
            if (selector === 'a[href^="mailto:"]') {
              text = await element.getAttribute('href');
              text = text.replace('mailto:', '').split('?')[0].split('&')[0].trim(); // Remove query params and fragments
              // Decode URL encoding
              text = decodeURIComponent(text);
            } else {
              text = await element.getText();
              // Also check the innerHTML for hidden emails
              try {
                const innerHTML = await element.getAttribute('innerHTML');
                if (innerHTML && innerHTML.includes('@')) {
                  text = text + ' ' + innerHTML;
                }
              } catch (e) {
                // Continue
              }
            }

            if (text) {
              // More comprehensive email regex that handles various formats
              const emailMatches = text.match(/[a-zA-Z0-9][a-zA-Z0-9._%+-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}/g);
              if (emailMatches) {
                // Clean and decode each email
                const cleanEmails = emailMatches.map(email => {
                  // Remove any URL encoding
                  let cleanEmail = decodeURIComponent(email);
                  // Remove any leading/trailing non-email characters
                  cleanEmail = cleanEmail.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9.]+$/g, '');
                  return cleanEmail;
                }).filter(email => email.includes('@') && email.includes('.'));

                emails.push(...cleanEmails);
                console.log(`   📧 Found email via selector "${selector}": ${cleanEmails[0]}`);
              }
            }
          } catch (e) {
            // Continue to next element
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Extract address using targeted approach
    for (const selector of addressSelectors) {
      try {
        const elements = await driver.findElements(By.css(selector));
        for (const element of elements) {
          try {
            const text = await element.getText();
            if (text && text.length > 10 && text.length < 200) {
              // Basic validation for address-like text
              if (text.match(/\d+.*[a-zA-Z].*\d{5}/) || text.match(/\d+.*street|ave|road|blvd|dr|st/i)) {
                address = text.trim();
                console.log(`   📍 Found address via selector "${selector}": ${address.substring(0, 50)}...`);
                break;
              }
            }
          } catch (e) {
            // Continue to next element
          }
        }
        if (address !== 'Address not available') break;
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: If no targeted results, use page source with improved patterns
    if (phones.length === 0 || emails.length === 0) {
      console.log(`   🔄 Using fallback page source extraction...`);
      const pageSource = await driver.getPageSource();

      if (phones.length === 0) {
        const phonePatterns = [
          /(\+?1[-.\s]?)?\(?([2-9][0-9]{2})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
          /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
          /\(\d{3}\)\s?\d{3}[-.]?\d{4}/g
        ];

        phonePatterns.forEach(pattern => {
          const matches = pageSource.match(pattern);
          if (matches) {
            // Filter out obviously wrong numbers (like dates, IDs, etc.)
            const validPhones = matches.filter(phone => {
              const digits = phone.replace(/\D/g, '');
              return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
            });
            phones.push(...validPhones);
          }
        });
      }

      if (emails.length === 0) {
        // Try multiple email patterns including URL-encoded ones
        const emailPatterns = [
          /[a-zA-Z0-9][a-zA-Z0-9._%+-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}/g,
          /mailto:[a-zA-Z0-9][a-zA-Z0-9._%+-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}/g,
          /%20[a-zA-Z0-9][a-zA-Z0-9._%+-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}/g
        ];

        emailPatterns.forEach(pattern => {
          const matches = pageSource.match(pattern);
          if (matches) {
            const cleanEmails = matches.map(email => {
              // Clean up the email
              let cleanEmail = email.replace('mailto:', '').replace('%20', '');
              // Decode any URL encoding
              cleanEmail = decodeURIComponent(cleanEmail);
              // Remove any leading/trailing non-email characters
              cleanEmail = cleanEmail.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9.]+$/g, '');
              return cleanEmail;
            }).filter(email => email.includes('@') && email.includes('.') && email.length > 5);

            emails.push(...cleanEmails);
          }
        });
      }
    }

    // Clean and filter results
    phones = [...new Set(phones)].filter(phone => {
      const digits = phone.replace(/\D/g, '');
      return digits.length >= 10 && !phone.includes('1234567890') && !phone.includes('0000000000');
    });

    emails = [...new Set(emails)].map(email => {
      // Final cleanup and decoding
      let cleanEmail = decodeURIComponent(email);
      // Remove any remaining URL encoding artifacts
      cleanEmail = cleanEmail.replace(/%20/g, '').replace(/%40/g, '@');
      // Remove any leading/trailing whitespace or special characters
      cleanEmail = cleanEmail.trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
      return cleanEmail;
    }).filter(email => {
      // Comprehensive email validation
      const emailRegex = /^[a-zA-Z0-9][a-zA-Z0-9._%+-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/;
      return emailRegex.test(email) &&
        !email.includes('noreply') &&
        !email.includes('no-reply') &&
        !email.includes('example.com') &&
        !email.includes('test.com') &&
        !email.includes('domain.com') &&
        !email.includes('yoursite.com') &&
        !email.includes('website.com') &&
        !email.includes('placeholder') &&
        !email.includes('sample') &&
        email.length > 5 &&
        email.length < 100 &&
        !email.startsWith('.') &&
        !email.endsWith('.') &&
        email.split('@').length === 2; // Exactly one @ symbol
    });

    // Enhanced business name extraction
    let name = await driver.getTitle();
    name = name.replace(/\s*[-|].*$/, '').replace(/contact.*$/i, '').replace(/home.*$/i, '').trim();

    // Try to find better business name using targeted selectors
    if (!name || name.length < 3 || name.toLowerCase().includes('home') || name.toLowerCase().includes('welcome')) {
      const nameSelectors = [
        'h1',
        '[class*="business-name"]',
        '[id*="business-name"]',
        '[class*="company-name"]',
        '[id*="company-name"]',
        '[class*="brand"]',
        '[id*="brand"]',
        '.logo',
        '#logo'
      ];

      for (const selector of nameSelectors) {
        try {
          const elements = await driver.findElements(By.css(selector));
          for (const element of elements) {
            try {
              const text = await element.getText();
              if (text && text.length > 2 && text.length < 100 && !text.toLowerCase().includes('menu')) {
                name = text.trim();
                console.log(`   🏢 Found business name via selector "${selector}": ${name}`);
                break;
              }
            } catch (e) {
              // Continue to next element
            }
          }
          if (name && name.length > 2) break;
        } catch (e) {
          // Continue to next selector
        }
      }
    }

    // Final fallback for name
    if (!name || name.length < 3) {
      try {
        const domain = new URL(url).hostname.replace('www.', '').split('.')[0];
        name = domain.charAt(0).toUpperCase() + domain.slice(1) + ` ${category}`;
      } catch (e) {
        name = `${category} Business`;
      }
    }

    // ✅ UPDATED: Only return lead if we have BOTH phone AND email
    if (phones.length > 0 && emails.length > 0) {
      // ✅ ALWAYS replace the lead's name using its website URL
      const extractedName = extractNameFromURL(url);
      const finalName = extractedName || name || 'Business'; // Use extracted name, fallback to original or 'Business'

      if (extractedName) {
        console.log(`   🔄 Name extracted from URL "${url}" → "${finalName}"`);
      } else {
        console.log(`   ⚠️ Could not extract name from URL, using fallback: "${finalName}"`);
      }

      const lead = {
        name: finalName,
        phone: phones[0],
        email: emails[0],
        website: url,
        address: address,
        source: 'selenium_scraper'
      };

      console.log(`   ✅ VALID LEAD FOUND: ${lead.name} | ${lead.phone} | ${lead.email} | ${lead.address.substring(0, 30)}...`);
      return lead;
    }

    // Log why lead was rejected
    if (phones.length === 0 && emails.length === 0) {
      console.log(`   ❌ REJECTED - No phone or email found on: ${url}`);
    } else if (phones.length === 0) {
      console.log(`   ❌ REJECTED - No phone number found on: ${url}`);
    } else if (emails.length === 0) {
      console.log(`   ❌ REJECTED - No email address found on: ${url}`);
    }
    return null;

  } catch (e) {
    console.log(`   ❌ Error scraping ${url}: ${e.message}`);
    return null;
  }
};

export const scrapeLeadsWithSelenium = async (prompt, progressCallback = null) => {
  console.log(`\n🔍 SCRAPER STARTED - Prompt: "${prompt}"`);

  try {
    const { count, category, location } = parsePrompt(prompt);
    console.log(`🎯 Target: ${count} ${category} in ${location}`);

    // Send initial progress update
    if (progressCallback) {
      progressCallback({
        message: `Starting search for ${category} in ${location}...`,
        percent: 5,
        leadsFound: 0
      });
    }

    // Create a session identifier for this scraping session
    const sessionKey = `${category}_${location}`.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const isHeadlessAllowed = captchaSolvedSessions.has(sessionKey);

    console.log(`🚀 Setting up Chrome options...`);
    console.log(`🔍 Session key: ${sessionKey}`);
    console.log(`🤖 Headless mode: ${isHeadlessAllowed ? 'ENABLED (CAPTCHA previously solved)' : 'DISABLED (First-time CAPTCHA solving)'}`);

    const options = new chrome.Options();
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');

    // Use headless mode only if CAPTCHA was previously solved for this session type
    if (isHeadlessAllowed) {
      options.addArguments('--headless');
      console.log(`✅ Using headless mode - CAPTCHA previously solved for this session type`);
    } else {
      console.log(`🖥️ Using non-headless mode - First-time CAPTCHA solving required`);
    }

    options.addArguments('--disable-blink-features=AutomationControlled');
    options.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    console.log(`🚀 Building Chrome driver...`);
    const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
    console.log(`✅ Chrome driver created successfully`);

    const leads = [];

    try {
      // Log the original prompt and parsed keywords
      console.log(`📥 Prompt received: ${prompt}`);
      console.log(`🔍 Parsed keywords: ${category} in ${location}`);

      // Build the search query
      const searchQuery = `${category} in ${location}`;
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;

      // Log the final search URL before navigation
      console.log(`🌐 Final search URL: ${searchUrl}`);
      console.log(`🔍 Google search query: ${searchUrl}`);

      await driver.get(searchUrl);

      // Check for CAPTCHA immediately after page load
      console.log("🛑 Checking for CAPTCHA...");
      await delay(2000); // Wait for page to load

      const captchaCheck = await detectCaptcha(driver);

      if (captchaCheck.detected) {
        console.log("🔒 CAPTCHA detected! Requesting frontend solving...");

        // Generate session ID for this CAPTCHA solving session
        const sessionId = uuidv4();
        console.log(`🆔 CAPTCHA Session ID: ${sessionId}`);

        // Store the current scraping state to resume later
        const scrapingState = {
          driver,
          prompt,
          count,
          category,
          location,
          sessionKey,
          currentUrl: await driver.getCurrentUrl()
        };

        // Create a promise that will be resolved when CAPTCHA is solved
        const captchaPromise = new Promise((resolve, reject) => {
          // Store the session with driver and promise resolvers
          createCaptchaSession(sessionId, driver, resolve, reject, sessionKey);
        });

        // Return CAPTCHA required response to frontend immediately
        // The frontend will handle the CAPTCHA and call /api/captcha/solve
        // which will resolve the captchaPromise and allow us to continue
        return {
          captchaRequired: true,
          sessionId: sessionId,
          siteKey: captchaCheck.siteKey,
          message: 'CAPTCHA solving required'
        };
      }

      // Check for search result indicators to ensure page loaded properly
      const searchResultElements = await driver.findElements(By.css([
        'div[data-ved]', // Google search result containers
        'div.g', // Google result divs
        'h3', // Result titles
        '#search' // Search results container
      ].join(', ')));

      if (searchResultElements.length === 0) {
        console.log("⚠️ No search results found, page may not have loaded properly");
        // Still continue with scraping attempt
      } else {
        console.log("✅ Search results detected - proceeding with scraping");
      }

      // Additional wait for page to fully stabilize
      console.log("⏳ Waiting for search results to fully load...");
      await delay(2000);

      // ✅ NEW: Function to extract URLs from current page
      const extractUrlsFromCurrentPage = async () => {
        // Try multiple selectors for Google search results
        let resultEls = [];
        const selectors = [
          'div[data-ved] a[href^="http"]:not([href*="google.com"])', // Main search results
          'h3 a[href^="http"]:not([href*="google.com"])', // Title links
          'a[href^="http"]:not([href*="google.com"]):not([href*="youtube.com"]):not([href*="facebook.com"])', // General links excluding social media
          'div.g a[href^="http"]' // Google result container links
        ];

        for (const selector of selectors) {
          try {
            console.log(`🔍 Trying selector: ${selector}`);
            resultEls = await driver.findElements(By.css(selector));
            if (resultEls.length > 0) {
              console.log(`✅ Found ${resultEls.length} elements with selector: ${selector}`);
              break;
            }
          } catch (e) {
            console.log(`⚠️ Selector failed: ${selector} - ${e.message}`);
          }
        }

        if (resultEls.length === 0) {
          console.log("❌ No search result links found. Trying fallback approach...");
          // Fallback: get all links and filter them
          const allLinks = await driver.findElements(By.css('a[href]'));
          console.log(`📊 Found ${allLinks.length} total links on page`);

          for (let link of allLinks) {
            try {
              const href = await link.getAttribute('href');
              if (href && href.startsWith('http') &&
                  !href.includes('google.com') &&
                  !href.includes('youtube.com') &&
                  !href.includes('facebook.com') &&
                  !href.includes('instagram.com') &&
                  !href.includes('twitter.com')) {
                resultEls.push(link);
              }
            } catch (e) {}
          }
        }

        let urls = [];
        const seenDomains = new Set(); // Track seen domains to avoid duplicates
        console.log(`📊 Processing ${resultEls.length} potential result links`);

        for (let el of resultEls) {
          try {
            const href = await el.getAttribute('href');
            if (href && href.startsWith('http') &&
                !href.includes('google.com') &&
                !href.includes('youtube.com') &&
                !href.includes('facebook.com') &&
                !href.includes('instagram.com') &&
                !href.includes('twitter.com')) {

              // Parse URL to get hostname and pathname
              const url = new URL(href);
              const hostname = url.hostname.toLowerCase();
              const pathname = url.pathname.toLowerCase();

              // Skip unwanted domains
              if (hostname.includes('social-plugins.line.me') ||
                  hostname.includes('facebook.com') ||
                  hostname.includes('instagram.com') ||
                  hostname.includes('twitter.com') ||
                  hostname.includes('linkedin.com') ||
                  hostname.includes('youtube.com')) {
                console.log(`🚫 Skipped social/unwanted domain: ${hostname}`);
                continue;
              }

              // Skip unwanted paths
              if (pathname.includes('/contact') ||
                  pathname.includes('/ads') ||
                  pathname.includes('/share') ||
                  pathname.includes('/about') ||
                  pathname.includes('/ja/') ||
                  pathname.includes('/contactus') ||
                  pathname.includes('/contact-us') ||
                  pathname.includes('/privacy') ||
                  pathname.includes('/terms')) {
                console.log(`🚫 Skipped unwanted path: ${hostname}${pathname}`);
                continue;
              }

              // Check if we've already seen this domain
              if (seenDomains.has(hostname)) {
                console.log(`� Skipped duplicate domain: ${hostname} (already processed)`);
                continue;
              }

              // Add domain to seen set and URL to results
              seenDomains.add(hostname);
              urls.push(href);
              console.log(`✅ Added unique domain URL: ${href}`);
            }
          } catch (e) {
            console.log(`⚠️ Error processing URL: ${e.message}`);
          }
        }

        console.log(`🎯 Final result: ${urls.length} unique domain URLs from ${seenDomains.size} domains`);
        return urls; // Return domain-deduplicated URLs
      };

      // ✅ NEW: Function to try infinite scroll with safety measures
      const tryInfiniteScroll = async () => {
        try {
          console.log(`🔍 Trying infinite scroll method...`);

          // Safety measure: Track scroll attempts to prevent infinite loops
          let scrollAttempts = 0;
          const maxScrollAttempts = 5;

          // Get current page height and content before scrolling
          const beforeScrollHeight = await driver.executeScript("return document.body.scrollHeight");
          const beforeContent = await driver.getPageSource();
          const beforeContentLength = beforeContent.length;

          console.log(`📏 Page height before scroll: ${beforeScrollHeight}px`);
          console.log(`📄 Content length before scroll: ${beforeContentLength} characters`);

          // Perform infinite scroll
          await driver.executeScript("window.scrollTo(0, document.body.scrollHeight)");
          console.log(`🔄 Scrolled to bottom of page - waiting for new content...`);

          // Wait for potential new content to load (increased wait time)
          await delay(3000);

          // Check if new content loaded
          const afterScrollHeight = await driver.executeScript("return document.body.scrollHeight");
          const afterContent = await driver.getPageSource();
          const afterContentLength = afterContent.length;

          console.log(`📏 Page height after scroll: ${afterScrollHeight}px`);
          console.log(`📄 Content length after scroll: ${afterContentLength} characters`);

          // Verify if new content actually loaded
          const heightIncreased = afterScrollHeight > beforeScrollHeight;
          const contentIncreased = afterContentLength > beforeContentLength;

          if (heightIncreased || contentIncreased) {
            console.log(`✅ Infinite scroll successful - new content detected!`);
            console.log(`   📏 Height change: ${beforeScrollHeight}px → ${afterScrollHeight}px`);
            console.log(`   📄 Content change: ${beforeContentLength} → ${afterContentLength} characters`);

            // Additional wait for content to stabilize
            await delay(2000);
            return true;
          } else {
            console.log(`❌ No new content loaded after infinite scroll`);

            // Try scrolling to different positions as fallback (with safety limits)
            while (scrollAttempts < maxScrollAttempts) {
              scrollAttempts++;
              console.log(`🔄 Trying alternative scroll positions (attempt ${scrollAttempts}/${maxScrollAttempts})...`);

              // Scroll to different positions
              const scrollPositions = [0.75, 0.5, 0.9]; // 75%, 50%, 90% of page height
              const scrollPosition = scrollPositions[scrollAttempts - 1] || 0.75;

              await driver.executeScript(`window.scrollTo(0, document.body.scrollHeight * ${scrollPosition})`);
              await delay(2000);

              // Then scroll to bottom again
              await driver.executeScript("window.scrollTo(0, document.body.scrollHeight)");
              await delay(3000);

              // Check again for new content
              const finalScrollHeight = await driver.executeScript("return document.body.scrollHeight");
              const finalContent = await driver.getPageSource();

              if (finalScrollHeight > afterScrollHeight || finalContent.length > afterContentLength) {
                console.log(`✅ Alternative scroll method successful on attempt ${scrollAttempts}!`);
                await delay(2000);
                return true;
              } else {
                console.log(`❌ Scroll attempt ${scrollAttempts} failed - no new content`);
              }
            }

            console.log(`❌ Infinite scroll exhausted after ${maxScrollAttempts} attempts - no more content available`);
            return false;
          }
        } catch (error) {
          console.log(`❌ Error during infinite scroll: ${error.message}`);
          return false;
        }
      };

      // ✅ ENHANCED: Function to check for and click "Load More" button
      const loadMoreResults = async () => {
        try {
          console.log(`🔍 Looking for Load More button...`);

          // Wait a moment for any dynamic content to load
          await delay(1000);

          // Multiple selectors for "Load More" buttons (comprehensive list)
          const loadMoreSelectors = [
            'button[aria-label*="Load more"]',
            'button[aria-label*="Show more"]',
            'button[aria-label*="See more"]',
            'button[aria-label*="More results"]',
            'button[aria-label*="More search results"]',
            'a[aria-label*="Load more"]',
            'a[aria-label*="Show more"]',
            'a[aria-label*="See more"]',
            'a[aria-label*="More results"]',
            'a[aria-label*="More search results"]',
            '.load-more',
            '.show-more',
            '.see-more',
            '.more-results',
            '.more-search-results',
            '[data-testid*="load-more"]',
            '[data-testid*="show-more"]',
            '[data-testid*="see-more"]',
            '[data-testid*="More results"]',
            '[data-testid*="More search results"]',
            '[class*="load-more"]',
            '[class*="show-more"]',
            '[class*="see-more"]',
            '[class*="More results"]',
            '[class*="More search results"]',
            '[id*="load-more"]',
            '[id*="show-more"]',
            '[id*="see-more"]',
            '[id*="More results"]',
            '[id*="More search results"]'
          ];

          console.log(`🔍 Trying ${loadMoreSelectors.length} different Load More button selectors...`);

          for (const selector of loadMoreSelectors) {
            try {
              console.log(`🔍 Trying Load More selector: ${selector}`);

              // Skip :contains selectors as they're not supported in Selenium
              if (selector.includes(':contains')) {
                // Use XPath instead for text-based searches (comprehensive list)
                const xpathSelectors = [
                  "//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'load more')]",
                  "//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'show more')]",
                  "//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'see more')]",
                  "//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'more results')]",
                  "//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'more search results')]",
                  "//a[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'load more')]",
                  "//a[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'show more')]",
                  "//a[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'see more')]",
                  "//span[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'load more')]",
                  "//span[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'show more')]",
                  "//div[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'load more')]",
                  "//div[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'show more')]"
                ];

                for (const xpath of xpathSelectors) {
                  try {
                    const loadMoreButtons = await driver.findElements(By.xpath(xpath));
                    console.log(`🔍 Found ${loadMoreButtons.length} elements with XPath: ${xpath}`);

                    for (let loadMoreButton of loadMoreButtons) {
                      const isEnabled = await loadMoreButton.isEnabled();
                      const isDisplayed = await loadMoreButton.isDisplayed();
                      const text = await loadMoreButton.getText();

                      console.log(`🔍 Found Load More button - Text: "${text}", Enabled: ${isEnabled}, Displayed: ${isDisplayed}`);

                      if (isEnabled && isDisplayed) {
                        console.log(`🔄 Found valid Load More button with XPath: ${xpath}`);

                        // Get current page content to verify new content loads
                        const beforeContent = await driver.getPageSource();

                        await loadMoreButton.click();
                        console.log(`✅ Clicked Load More button - waiting for new content to load...`);
                        await delay(3000); // Wait for new content to load

                        // Verify new content actually loaded
                        const afterContent = await driver.getPageSource();
                        if (afterContent.length > beforeContent.length) {
                          console.log(`✅ New content loaded successfully!`);
                          await delay(2000); // Additional wait for content to stabilize
                          return true;
                        } else {
                          console.log(`⚠️ No new content detected after clicking Load More`);
                        }
                      }
                    }
                  } catch (e) {
                    console.log(`⚠️ XPath failed: ${xpath} - ${e.message}`);
                  }
                }
                continue; // Skip the CSS selector version
              }

              // Try CSS selectors
              const loadMoreButtons = await driver.findElements(By.css(selector));
              console.log(`🔍 Found ${loadMoreButtons.length} elements with selector: ${selector}`);

              for (let loadMoreButton of loadMoreButtons) {
                try {
                  const isEnabled = await loadMoreButton.isEnabled();
                  const isDisplayed = await loadMoreButton.isDisplayed();
                  const text = await loadMoreButton.getText();

                  console.log(`🔍 Found Load More button - Text: "${text}", Enabled: ${isEnabled}, Displayed: ${isDisplayed}`);

                  if (isEnabled && isDisplayed) {
                    console.log(`🔄 Found valid Load More button with selector: ${selector}`);

                    // Get current page content to verify new content loads
                    const beforeContent = await driver.getPageSource();

                    await loadMoreButton.click();
                    console.log(`✅ Clicked Load More button - waiting for new content to load...`);
                    await delay(3000); // Wait for new content to load

                    // Verify new content actually loaded
                    const afterContent = await driver.getPageSource();
                    if (afterContent.length > beforeContent.length) {
                      console.log(`✅ New content loaded successfully!`);
                      await delay(2000); // Additional wait for content to stabilize
                      return true;
                    } else {
                      console.log(`⚠️ No new content detected after clicking Load More`);
                    }
                  }
                } catch (e) {
                  console.log(`⚠️ Error checking Load More button: ${e.message}`);
                }
              }
            } catch (e) {
              console.log(`⚠️ Load More selector failed: ${selector} - ${e.message}`);
            }
          }

          console.log(`❌ No Load More button found`);
          return false;
        } catch (error) {
          console.log(`❌ Error looking for Load More button: ${error.message}`);
          return false;
        }
      };

      // ✅ ENHANCED: Function to check for and click Next button (pagination style)
      const goToNextPage = async () => {
        try {
          console.log(`🔍 Looking for Next button on current page...`);
          const currentUrl = await driver.getCurrentUrl();
          console.log(`📍 Current URL: ${currentUrl}`);

          // Wait a moment for page to fully load
          await delay(1000);

          // Multiple selectors for "Next" button on Google (fixed selectors)
          const nextSelectors = [
            'a[aria-label="Next page"]',
            'a[id="pnnext"]',
            'a[aria-label="Next"]',
            'span[style*="left:0"] a', // Next button in pagination
            'td.b a[href*="start="]' // Pagination links
          ];

          console.log(`🔍 Trying ${nextSelectors.length} different Next button selectors...`);

          // Try each selector to find Next button
          for (const selector of nextSelectors) {
            try {
              console.log(`🔍 Trying Next button selector: ${selector}`);
              const nextButtons = await driver.findElements(By.css(selector));
              console.log(`🔍 Found ${nextButtons.length} elements with selector: ${selector}`);

              for (let nextButton of nextButtons) {
                try {
                  const isEnabled = await nextButton.isEnabled();
                  const isDisplayed = await nextButton.isDisplayed();
                  const text = await nextButton.getText();
                  const href = await nextButton.getAttribute('href');

                  console.log(`🔍 Found button - Text: "${text}", Href: "${href}", Enabled: ${isEnabled}, Displayed: ${isDisplayed}`);

                  if (isEnabled && isDisplayed) {
                    // Additional check for "Next" text or arrow
                    if (text.toLowerCase().includes('next') || text.includes('›') || text.includes('→') ||
                        selector.includes('pnnext') || (href && href.includes('start='))) {
                      console.log(`🔄 Found valid Next button with selector: ${selector}`);

                      // Store current URL to verify navigation
                      const beforeClickUrl = await driver.getCurrentUrl();
                      console.log(`📍 Before click URL: ${beforeClickUrl}`);

                      await nextButton.click();
                      console.log(`✅ Clicked Next button - waiting for new page to load...`);
                      await delay(4000); // Increased wait time for page load

                      // Verify we actually navigated to a new page
                      const afterClickUrl = await driver.getCurrentUrl();
                      console.log(`📍 After click URL: ${afterClickUrl}`);

                      if (afterClickUrl !== beforeClickUrl) {
                        console.log(`✅ Successfully navigated to new page!`);

                        // Wait for search results to load
                        await delay(2000);
                        return true;
                      } else {
                        console.log(`⚠️ URL didn't change after clicking Next button - trying next option`);
                      }
                    } else {
                      console.log(`⚠️ Button doesn't match Next criteria - Text: "${text}", Href: "${href}"`);
                    }
                  } else {
                    console.log(`⚠️ Button not enabled or displayed - Enabled: ${isEnabled}, Displayed: ${isDisplayed}`);
                  }
                } catch (e) {
                  console.log(`⚠️ Error checking button: ${e.message}`);
                }
              }
            } catch (e) {
              console.log(`⚠️ Selector failed: ${selector} - ${e.message}`);
            }
          }

          // Enhanced fallback: Look for any pagination link with higher start parameter
          console.log(`🔄 Trying pagination fallback...`);
          try {
            const paginationLinks = await driver.findElements(By.css('a[href*="start="]'));
            console.log(`🔍 Found ${paginationLinks.length} pagination links`);

            const currentStart = parseInt(new URL(currentUrl).searchParams.get('start') || '0');
            console.log(`📍 Current start parameter: ${currentStart}`);

            let bestNextLink = null;
            let bestNextStart = currentStart;

            for (let link of paginationLinks) {
              try {
                const href = await link.getAttribute('href');
                const nextStart = parseInt(new URL(href, 'https://google.com').searchParams.get('start') || '0');

                // Find the next sequential page (not just any higher number)
                if (nextStart > currentStart && (bestNextLink === null || nextStart < bestNextStart)) {
                  bestNextLink = link;
                  bestNextStart = nextStart;
                }
              } catch (e) {
                console.log(`⚠️ Error processing pagination link: ${e.message}`);
              }
            }

            if (bestNextLink) {
              console.log(`🔄 Found best pagination link: start=${bestNextStart}`);
              await bestNextLink.click();
              console.log(`✅ Clicked pagination link - waiting for new page to load...`);
              await delay(4000);

              // Verify navigation
              const afterClickUrl = await driver.getCurrentUrl();
              if (afterClickUrl !== currentUrl) {
                console.log(`✅ Successfully navigated via pagination: ${afterClickUrl}`);
                await delay(2000);
                return true;
              }
            }
          } catch (e) {
            console.log(`⚠️ Pagination fallback failed: ${e.message}`);
          }

          console.log(`❌ No Next button found - reached end of results`);
          return false;
        } catch (error) {
          console.log(`❌ Error navigating to next page: ${error.message}`);
          return false;
        }
      };

      // Helper function to normalize phone numbers for comparison
      const normalizePhone = (phone) => {
        if (!phone || phone === 'Phone not available') return null;
        // Remove all non-digits and normalize
        return phone.replace(/\D/g, '').replace(/^1/, ''); // Remove country code 1 if present
      };

      // Helper function to check if lead is duplicate
      const isDuplicateLead = (newLead, existingLeads) => {
        const newPhone = normalizePhone(newLead.phone);
        if (!newPhone) return false;

        return existingLeads.some(existingLead => {
          const existingPhone = normalizePhone(existingLead.phone);
          return existingPhone && existingPhone === newPhone;
        });
      };

      // ✅ FIXED: Main pagination-aware scraping loop
      let currentPage = 1;
      let totalScrapedCount = 0;
      let duplicateCount = 0;
      let rejectedCount = 0;
      let allProcessedUrls = new Set(); // Track all URLs we've processed across pages
      const maxPagesToCheck = 20; // Increased safety limit
      let consecutiveEmptyPages = 0; // Track empty pages to avoid infinite loops

      console.log(`🎯 Starting pagination-aware scraping to find ${count} valid leads (with both phone & email)`);

      // ✅ Test the updated URL name extraction function (now used for ALL leads)
      console.log(`🧪 Testing updated URL name extraction (ALL leads will use URL-extracted names):`);
      console.log(`   "https://www.pizzahub-house.com" → "${extractNameFromURL('https://www.pizzahub-house.com')}"`);
      console.log(`   "https://abc-cleaning.net" → "${extractNameFromURL('https://abc-cleaning.net')}"`);
      console.log(`   "https://app.greenhouse-foods.com" → "${extractNameFromURL('https://app.greenhouse-foods.com')}"`);
      console.log(`   "https://portal.joe-plumbing.co.uk" → "${extractNameFromURL('https://portal.joe-plumbing.co.uk')}"`);
      console.log(`   "https://get.smith-auto.com" → "${extractNameFromURL('https://get.smith-auto.com')}"`);
      console.log(`🧪 Updated URL extraction test complete - ALL leads will have clean URL-based names\n`);

      while (leads.length < count && currentPage <= maxPagesToCheck) {
        console.log(`\n📄 === PAGE ${currentPage} === (Found: ${leads.length}/${count} leads)`);
        console.log(`🎯 Target: ${count} valid leads (with phone + email)`);
        console.log(`📊 Progress: ${leads.length} valid leads found so far`);
        console.log(`🔄 Pagination Methods: Next Button → Load More → Infinite Scroll → Alternative Search`);

        // Send progress update when starting a new page
        if (progressCallback && currentPage > 1) {
          const progressPercent = Math.min(Math.round((leads.length / count) * 100), 95); // Cap at 95% until complete
          progressCallback({
            message: `Searching page ${currentPage}... Found ${leads.length} leads so far`,
            percent: progressPercent,
            leadsFound: leads.length
          });
        }

        // Extract URLs from current page
        const currentPageUrls = await extractUrlsFromCurrentPage();

        if (currentPageUrls.length === 0) {
          console.log(`❌ No URLs found on page ${currentPage}`);
          consecutiveEmptyPages++;

          if (currentPage === 1) {
            console.log("❌ No URLs found on first page. This might indicate:");
            console.log("   - CAPTCHA wasn't solved correctly");
            console.log("   - Search results page didn't load properly");
            console.log("   - Google changed their page structure");

            // Take a screenshot for debugging
            try {
              const screenshot = await driver.takeScreenshot();
              const fs = await import('fs');
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              fs.writeFileSync(`debug-screenshot-${timestamp}.png`, screenshot, 'base64');
              console.log(`📸 Screenshot saved as debug-screenshot-${timestamp}.png`);
            } catch (e) {
              console.log("⚠️ Could not take screenshot");
            }
            return [];
          }

          // If we've had 2 consecutive empty pages, try to continue to next page anyway
          if (consecutiveEmptyPages >= 2) {
            console.log(`⚠️ ${consecutiveEmptyPages} consecutive empty pages - may have reached end`);
            break;
          }
        } else {
          consecutiveEmptyPages = 0; // Reset counter when we find URLs
        }

        // Filter out URLs we've already processed
        const newUrls = currentPageUrls.filter(url => !allProcessedUrls.has(url));
        console.log(`🔗 Found ${currentPageUrls.length} URLs on page ${currentPage}, ${newUrls.length} are new`);

        // Process each URL on current page (only if we have new URLs or it's the first page)
        if (newUrls.length > 0 || currentPage === 1) {
          for (let i = 0; i < newUrls.length && leads.length < count; i++) {
            const url = newUrls[i];
            allProcessedUrls.add(url); // Mark as processed
            totalScrapedCount++;

            console.log(`🌐 Scraping ${totalScrapedCount}: ${url} (Page ${currentPage}, URL ${i+1}/${newUrls.length}) - Found: ${leads.length}/${count}`);

            const lead = await scrapeWebsite(driver, url, category);
            if (lead) {
              // ✅ Lead already validated in scrapeWebsite() - only returns if has both phone & email
              // Check if this lead is a duplicate based on phone number
              if (isDuplicateLead(lead, leads)) {
                duplicateCount++;
                console.log(`🔄 DUPLICATE LEAD SKIPPED: ${lead.name} | ${lead.phone} (Duplicate #${duplicateCount})`);
              } else {
                leads.push(lead);
                console.log(`✅ VALID LEAD ADDED: ${lead.name} | ${lead.phone} | ${lead.email} (${leads.length}/${count})`);

                // Send live progress update when a new lead is found
                if (progressCallback) {
                  const progressPercent = Math.min(Math.round((leads.length / count) * 100), 100);
                  progressCallback({
                    message: `Found ${leads.length} leads so far... (Page ${currentPage})`,
                    percent: progressPercent,
                    leadsFound: leads.length
                  });
                }
              }
            } else {
              rejectedCount++;
              console.log(`❌ LEAD REJECTED: Missing phone or email (Rejected #${rejectedCount})`);
            }

            // Check if we've reached our target
            if (leads.length >= count) {
              console.log(`🎯 TARGET REACHED: ${leads.length} valid leads found (all have phone & email)`);

              // Send final progress update when target is reached
              if (progressCallback) {
                progressCallback({
                  message: `Target reached! Found ${leads.length} qualified leads`,
                  percent: 100,
                  leadsFound: leads.length
                });
              }
              break;
            }
          }
        }

        // ✅ COMPREHENSIVE: Try all three pagination methods if we haven't reached target
        if (leads.length < count) {
          console.log(`\n🔄 Still need ${count - leads.length} more leads. Trying all pagination methods...`);
          console.log(`📊 Current progress: ${leads.length}/${count} leads, ${totalScrapedCount} sites scraped, ${duplicateCount} duplicates, ${rejectedCount} rejected`);

          let paginationSuccessful = false;

          try {
            // Method 1: Try traditional "Next" button pagination first
            console.log(`\n🔄 Method 1: Trying Next button pagination...`);
            const hasNextPage = await goToNextPage();

            if (hasNextPage) {
              currentPage++;
              console.log(`✅ Next button pagination successful - moved to page ${currentPage}`);
              consecutiveEmptyPages = 0;
              paginationSuccessful = true;
            } else {
              console.log(`❌ Next button pagination failed`);

              // Method 2: Try "Load More" button if Next button failed
              console.log(`\n🔄 Method 2: Trying Load More button...`);
              const hasLoadMore = await loadMoreResults();

              if (hasLoadMore) {
                console.log(`✅ Load More successful - new content loaded`);
                consecutiveEmptyPages = 0;
                paginationSuccessful = true;
                // Don't increment currentPage for Load More since it's same page with more content
              } else {
                console.log(`❌ Load More failed`);

                // Method 3: Try infinite scroll if both previous methods failed
                console.log(`\n🔄 Method 3: Trying infinite scroll...`);
                const hasInfiniteScroll = await tryInfiniteScroll();

                if (hasInfiniteScroll) {
                  console.log(`✅ Infinite scroll successful - new content loaded`);
                  consecutiveEmptyPages = 0;
                  paginationSuccessful = true;
                  // Don't increment currentPage for infinite scroll since it's same page with more content
                } else {
                  console.log(`❌ Infinite scroll failed`);
                }
              }
            }

            if (paginationSuccessful) {
              continue; // ✅ CRITICAL: Continue the loop to process new content
            } else {
              console.log(`❌ All three pagination methods failed. Trying final fallback...`);
              console.log(`🔍 Final attempt: Checking for alternative pagination options...`);

              // Final attempt: Try to find any other pagination/load more elements
              try {
                let foundAlternativePagination = false;

                // Try to find numbered pagination links
                console.log(`🔍 Searching for numbered pagination links...`);
                const allLinks = await driver.findElements(By.css('a'));

                for (let link of allLinks) {
                  try {
                    const text = await link.getText();
                    const href = await link.getAttribute('href');

                    if ((text.match(/^\d+$/) || text.includes('More') || text.includes('Next')) &&
                        href && href.includes('start=')) {
                      console.log(`🔍 Found potential pagination: "${text}" -> ${href}`);
                      await link.click();
                      await delay(3000);
                      currentPage++;
                      foundAlternativePagination = true;
                      console.log(`✅ Alternative pagination successful - moved to page ${currentPage}`);
                      break;
                    }
                  } catch (e) {
                    // Continue checking other links
                  }
                }

                // If no pagination links found, try to find any clickable elements with pagination-related text
                if (!foundAlternativePagination) {
                  console.log(`🔍 Searching for any clickable pagination elements...`);
                  const allClickableElements = await driver.findElements(By.css('button, a, span[role="button"], div[role="button"]'));

                  for (let element of allClickableElements) {
                    try {
                      const text = await element.getText();
                      const ariaLabel = await element.getAttribute('aria-label');
                      const className = await element.getAttribute('class');

                      // Check for pagination-related text or attributes
                      const paginationKeywords = ['next', 'more', 'load', 'show', 'continue', 'additional'];
                      const textToCheck = `${text} ${ariaLabel} ${className}`.toLowerCase();

                      if (paginationKeywords.some(keyword => textToCheck.includes(keyword))) {
                        const isEnabled = await element.isEnabled();
                        const isDisplayed = await element.isDisplayed();

                        if (isEnabled && isDisplayed) {
                          console.log(`🔍 Found potential pagination element: "${text}" (aria-label: "${ariaLabel}", class: "${className}")`);

                          // Get page content before clicking
                          const beforeContent = await driver.getPageSource();
                          const beforeUrl = await driver.getCurrentUrl();

                          await element.click();
                          await delay(3000);

                          // Check if content changed (either URL or page content)
                          const afterContent = await driver.getPageSource();
                          const afterUrl = await driver.getCurrentUrl();

                          if (afterUrl !== beforeUrl || afterContent.length > beforeContent.length) {
                            if (afterUrl !== beforeUrl) {
                              currentPage++;
                              console.log(`✅ Alternative pagination successful - moved to page ${currentPage}`);
                            } else {
                              console.log(`✅ Alternative load more successful - new content loaded`);
                            }
                            foundAlternativePagination = true;
                            break;
                          } else {
                            console.log(`⚠️ Element clicked but no content change detected`);
                          }
                        }
                      }
                    } catch (e) {
                      // Continue checking other elements
                    }
                  }
                }

                if (!foundAlternativePagination) {
                  console.log(`❌ No alternative pagination found - truly reached end`);
                  break; // Exit the while loop
                } else {
                  continue; // ✅ CRITICAL: Continue the loop to process new content
                }
              } catch (e) {
                console.log(`❌ Alternative pagination search failed: ${e.message}`);
                break; // Exit the while loop
              }
            }
          } catch (paginationError) {
            console.log(`❌ PAGINATION ERROR: ${paginationError.message}`);
            console.log(`🛑 Stopping pagination due to error`);
            break; // Exit the while loop
          }
        } else {
          // Target reached, exit loop
          console.log(`🎯 TARGET REACHED: Exiting pagination loop with ${leads.length}/${count} leads`);
          break;
        }
      }

      // Final summary
      if (leads.length < count) {
        console.log(`\n⚠️ INCOMPLETE: Found ${leads.length}/${count} valid leads after checking ${currentPage} pages`);
        console.log(`💡 Processed ${totalScrapedCount} websites total`);
        console.log(`💡 Found ${duplicateCount} duplicates and ${rejectedCount} leads without phone/email`);
        console.log(`💡 Had ${consecutiveEmptyPages} consecutive empty pages at end`);
        if (currentPage >= maxPagesToCheck) {
          console.log(`💡 Reached maximum page limit (${maxPagesToCheck}) - consider expanding search terms`);
        } else {
          console.log(`💡 Stopped due to no more pagination options available`);
        }
      } else {
        console.log(`\n🎉 SUCCESS: Found all ${leads.length} requested valid leads!`);
      }

      console.log(`\n📊 PAGINATION SCRAPING COMPLETE SUMMARY:`);
      console.log(`   ✅ Valid leads found (with phone & email): ${leads.length}/${count}`);
      console.log(`   � Pages checked: ${currentPage}`);
      console.log(`   �🔄 Duplicates skipped: ${duplicateCount}`);
      console.log(`   ❌ Leads rejected (missing phone/email): ${rejectedCount}`);
      console.log(`   🌐 Total websites scraped: ${totalScrapedCount}`);
      console.log(`   📈 Valid lead rate: ${totalScrapedCount > 0 ? ((leads.length / totalScrapedCount) * 100).toFixed(1) : 0}%`);
      console.log(`   📧 All returned leads have both phone numbers and email addresses`);
      console.log(`   🔗 Unique URLs processed: ${allProcessedUrls.size}`);
      console.log(`   🔄 Comprehensive pagination: Next Button + Load More + Infinite Scroll + Alternative Search`);

      // ✅ FIXED: Only close browser after pagination is complete
      if (driver) {
        try {
          await driver.quit();
          console.log('🛑 Chrome browser closed after pagination complete');
        } catch (e) {
          console.error(`❌ Error closing driver: ${e.message}`);
        }
      }

      return leads;

    } catch (err) {
      console.error(`❌ Scraper Error: ${err.message}`);

      // Close browser on error
      if (driver) {
        try {
          await driver.quit();
          console.log('🛑 Chrome browser closed due to error');
        } catch (e) {
          console.error(`❌ Error closing driver: ${e.message}`);
        }
      }

      return [];
    }

  } catch (mainError) {
    console.error(`❌ MAIN SCRAPER ERROR: ${mainError.message}`);
    return [];
  }
};

// Export function with progress callback support
export const scrapeLeads = async (prompt, maxResults = 50, progressCallback = null) => {
  console.log(`\n🔍 SCRAPER STARTED WITH PROGRESS - Prompt: "${prompt}"`);

  if (progressCallback) {
    progressCallback({
      message: 'Initializing scraper (validating phone & email)...',
      percent: 5,
      leadsFound: 0
    });
  }

  try {
    const { count, category, location } = parsePrompt(prompt);
    console.log(`🎯 Target: ${count} ${category} in ${location} (with phone & email)`);

    if (progressCallback) {
      progressCallback({
        message: `Searching for ${category} in ${location} (phone & email required)...`,
        percent: 10,
        leadsFound: 0
      });
    }

    // Use the existing scrapeLeadsWithSelenium function with progress callback
    const leads = await scrapeLeadsWithSelenium(prompt, progressCallback);

    if (progressCallback) {
      progressCallback({
        message: `Scraping completed! Found ${leads.length} leads with phone & email`,
        percent: 100,
        leadsFound: leads.length
      });
    }

    return { leads, count: leads.length };

  } catch (error) {
    console.error(`❌ SCRAPER WITH PROGRESS ERROR: ${error.message}`);
    if (progressCallback) {
      progressCallback({
        message: 'Scraping failed',
        percent: 0,
        leadsFound: 0
      });
    }
    throw error;
  }
};
