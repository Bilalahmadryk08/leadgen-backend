const { Builder, By } = require('selenium-webdriver');
require('chromedriver');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const runSeleniumForPrompt = async (prompt) => {
  let driver = await new Builder().forBrowser('chrome').build();
  let leads = [];

  try {
    const searchQuery = encodeURIComponent(prompt);
    const url = `https://www.google.com/search?q=${searchQuery}`;

    await driver.get(url);
    await delay(3000);

    const results = await driver.findElements(By.css('div'));
    for (let r of results) {
      const text = await r.getText();
      const phoneMatch = text.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
      const emailMatch = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
      const websiteMatch = text.match(/https?:\/\/[^\s]+/);

      if (phoneMatch) {
        leads.push({
          name: text.slice(0, 40),
          phone: phoneMatch[0],
          email: emailMatch ? emailMatch[0] : '',
          website: websiteMatch ? websiteMatch[0] : '',
        });
      }
    }

    // Deduplicate leads based on phone number
    const seen = new Set();
    leads = leads.filter((lead) => {
      if (seen.has(lead.phone)) return false;
      seen.add(lead.phone);
      return true;
    });

  } finally {
    await driver.quit();
  }

  return leads;
};
