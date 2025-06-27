// seleniumScraper.js
import { Builder, By } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import 'chromedriver';

const delay = (ms) => new Promise(res => setTimeout(res, ms));

const parsePrompt = (prompt) => {
  const patterns = [
    /generate\s+(\d+)\s+leads\s+of\s+(.+?)\s+in\s+(.+)/i,
    /generate\s+(\d+)\s+(.+?)\s+leads\s+in\s+(.+)/i,
    /(\d+)\s+leads\s+of\s+(.+?)\s+in\s+(.+)/i,
    /(\d+)\s+(.+?)\s+leads\s+in\s+(.+)/i,
    /find\s+(\d+)\s+(.+?)\s+in\s+(.+)/i,
    /(.+?)\s+in\s+(.+)/i
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (match) {
      let count, category, location;
      if (match.length === 4) {
        count = parseInt(match[1]);
        category = match[2].trim();
        location = match[3].trim();
      } else if (match.length === 3) {
        count = 50;
        category = match[1].trim();
        location = match[2].trim();
      }
      return { count, category, location };
    }
  }
  throw new Error('❌ Invalid prompt. Use: "generate 50 leads of restaurants in California"');
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

    // Only return lead if we have meaningful contact information
    if (phones.length > 0 || emails.length > 0) {
      const lead = {
        name: name,
        phone: phones.length > 0 ? phones[0] : 'Phone not available',
        email: emails.length > 0 ? emails[0] : 'Email not available',
        website: url,
        address: address,
        source: 'selenium_scraper'
      };

      console.log(`   ✅ CONTACT FOUND: ${lead.name} | ${lead.phone} | ${lead.email} | ${lead.address.substring(0, 30)}...`);
      return lead;
    }

    console.log(`   ⚠️ No contact info found on: ${url}`);
    return null;

  } catch (e) {
    console.log(`   ❌ Error scraping ${url}: ${e.message}`);
    return null;
  }
};

export const scrapeLeadsWithSelenium = async (prompt) => {
  console.log(`\n🔍 SCRAPER STARTED - Prompt: "${prompt}"`);

  try {
    const { count, category, location } = parsePrompt(prompt);
    console.log(`🎯 Target: ${count} ${category} in ${location}`);

    console.log(`🚀 Setting up Chrome options...`);
    const options = new chrome.Options();
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    // Do NOT add --headless so CAPTCHA can be solved manually

    console.log(`🚀 Building Chrome driver...`);
    const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
    console.log(`✅ Chrome driver created successfully`);

    const leads = [];

    try {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${category} ${location} contact phone number`)}`;
      console.log(`🔍 Searching: ${searchUrl}`);
      await driver.get(searchUrl);

      // Auto-detect CAPTCHA completion
      console.log("🛑 Checking for CAPTCHA and waiting for search results...");

      let captchaResolved = false;
      let attempts = 0;
      const maxAttempts = 60; // Wait up to 60 seconds (60 * 1 second intervals)

      while (!captchaResolved && attempts < maxAttempts) {
        attempts++;

        try {
          // Check if we're still on a CAPTCHA page or if search results are loaded
          const currentUrl = await driver.getCurrentUrl();

          console.log(`⏳ Attempt ${attempts}/${maxAttempts} - Current URL: ${currentUrl.substring(0, 100)}...`);

          // Check for CAPTCHA indicators
          const captchaElements = await driver.findElements(By.css([
            '[id*="captcha"]',
            '[class*="captcha"]',
            '[id*="recaptcha"]',
            '[class*="recaptcha"]',
            'iframe[src*="recaptcha"]'
          ].join(', ')));

          // Check for search result indicators
          const searchResultElements = await driver.findElements(By.css([
            'div[data-ved]', // Google search result containers
            'div.g', // Google result divs
            'h3', // Result titles
            '#search' // Search results container
          ].join(', ')));

          // If we have search results and no visible CAPTCHA, we're good to go
          if (searchResultElements.length > 0 && captchaElements.length === 0) {
            console.log("✅ Search results detected - CAPTCHA appears to be resolved!");
            captchaResolved = true;
            break;
          }

          // If we still see CAPTCHA elements, keep waiting
          if (captchaElements.length > 0) {
            console.log("🔄 CAPTCHA still present, please solve it...");
          } else if (searchResultElements.length === 0) {
            console.log("🔄 Waiting for search results to appear...");
          }

        } catch (e) {
          console.log(`⚠️ Error checking page state: ${e.message}`);
        }

        await delay(1000); // Wait 1 second before next check
      }

      if (!captchaResolved) {
        console.log("❌ Timeout waiting for CAPTCHA resolution or search results");
        console.log("💡 Please ensure CAPTCHA is solved and search results are visible");
        return [];
      }

      // Additional wait for page to fully stabilize
      console.log("⏳ Waiting for search results to fully load...");
      await delay(2000);

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
            urls.push(href);
            console.log(`🔗 Added URL: ${href}`);
          }
        } catch (e) {
          console.log(`⚠️ Error getting href: ${e.message}`);
        }
      }

      const uniqueUrls = [...new Set(urls)];
      console.log(`🔗 Found ${uniqueUrls.length} unique URLs to scrape`);

      if (uniqueUrls.length === 0) {
        console.log("❌ No URLs found to scrape. This might indicate:");
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

      const maxUrlsToCheck = Math.min(uniqueUrls.length, 100); // Increased to 100 to find more unique leads
      console.log(`🎯 Will check up to ${maxUrlsToCheck} URLs to find ${count} unique leads`);

      let urlIndex = 0;
      let scrapedCount = 0;
      let duplicateCount = 0;

      while (leads.length < count && urlIndex < maxUrlsToCheck) {
        const url = uniqueUrls[urlIndex];
        scrapedCount++;
        console.log(`🌐 Scraping ${scrapedCount}/${maxUrlsToCheck}: ${url}`);

        const lead = await scrapeWebsite(driver, url, category);
        if (lead) {
          // Check if this lead is a duplicate based on phone number
          if (isDuplicateLead(lead, leads)) {
            duplicateCount++;
            console.log(`🔄 DUPLICATE LEAD SKIPPED: ${lead.name} | ${lead.phone} (Duplicate #${duplicateCount})`);
          } else {
            leads.push(lead);
            console.log(`✅ UNIQUE LEAD FOUND: ${lead.name} | ${lead.phone} | ${lead.email} (${leads.length}/${count})`);
          }
        }

        urlIndex++;

        // If we've reached our target, break
        if (leads.length >= count) {
          console.log(`🎯 Target reached: ${leads.length} unique leads found`);
          break;
        }
      }

      // If we still need more leads and have exhausted current URLs, try to get more URLs
      if (leads.length < count && urlIndex >= maxUrlsToCheck) {
        console.log(`⚠️ Need ${count - leads.length} more leads but exhausted current URLs`);
        console.log(`💡 Found ${duplicateCount} duplicates - consider expanding search or trying different keywords`);
      }

      console.log(`\n📊 SCRAPING COMPLETE SUMMARY:`);
      console.log(`   ✅ Unique leads found: ${leads.length}/${count}`);
      console.log(`   🔄 Duplicates skipped: ${duplicateCount}`);
      console.log(`   🌐 Total websites scraped: ${scrapedCount}`);
      console.log(`   📈 Success rate: ${((leads.length / scrapedCount) * 100).toFixed(1)}%`);

      return leads;

    } catch (err) {
      console.error(`❌ Scraper Error: ${err.message}`);
      return [];
    } finally {
      if (driver) {
        try {
          await driver.quit();
          console.log('🛑 Chrome browser closed');
        } catch (e) {
          console.error(`❌ Error closing driver: ${e.message}`);
        }
      }
    }

  } catch (mainError) {
    console.error(`❌ MAIN SCRAPER ERROR: ${mainError.message}`);
    return [];
  }
};
