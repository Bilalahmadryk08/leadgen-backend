// File: backend/src/services/providers/apify.js
import axios from 'axios';

export const fetchLeadsFromApify = async (prompt, maxResults) => {
  console.log(`\n🔄 APIFY PROVIDER STARTED:`);
  console.log(`   📝 Prompt: "${prompt}"`);
  console.log(`   📊 Max Results: ${maxResults}`);

  try {
    // Use the correct Google Maps scraper actor ID from Apify Store
    const actorId = 'compass/crawler-google-places'; // Official Google Maps Scraper
    const token = process.env.APIFY_TOKEN;

    // Check if token exists
    if (!token) {
      console.error(`❌ APIFY_TOKEN not found in environment variables`);
      throw new Error('APIFY_TOKEN is required but not set in environment variables');
    }

    console.log(`🔑 Token found: ${token.substring(0, 10)}...`);
    console.log(`🎯 Actor ID: ${actorId}`);

    const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`;
    console.log(`🌐 API URL: ${url}`);

    const input = {
      searchStringsArray: [prompt],
      maxCrawledPlacesPerSearch: maxResults || 50,
      includeHistogram: false,
      includeOpeningHours: true,
      includeReviews: false,
      includeImages: false,
      exportPlaceUrls: false,
      additionalInfo: true,
      maxReviews: 0,
      maxImages: 0,
      language: 'en',
      onlyDataFromSearchPage: false,
      maxAutomaticZoomOut: 2
    };

    console.log(`📦 Request payload:`, JSON.stringify(input, null, 2));
    console.log(`🚀 Sending request to Apify...`);

    const response = await axios.post(url, { input }, {
      timeout: 60000, // 60 second timeout
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log(`✅ Apify API response received:`);
    console.log(`   📊 Status: ${response.status}`);
    console.log(`   📋 Data type: ${typeof response.data}`);
    console.log(`   📏 Data length: ${Array.isArray(response.data) ? response.data.length : 'Not an array'}`);

    // Process and normalize the data
    let rawData = response.data;
    if (!Array.isArray(rawData)) {
      console.log(`⚠️ Response data is not an array, attempting to extract...`);
      // Sometimes Apify returns data wrapped in an object
      if (rawData && rawData.items) {
        rawData = rawData.items;
      } else if (rawData && rawData.results) {
        rawData = rawData.results;
      } else {
        console.log(`❌ Cannot extract array from response data`);
        rawData = [];
      }
    }

    // Transform Apify data to our lead format
    const leads = rawData.map(item => ({
      name: item.title || item.name || 'Business Name Not Available',
      phone: item.phone || item.phoneNumber || 'Phone not available',
      email: item.email || 'Email not available',
      website: item.website || item.url || 'Website not available',
      address: item.address || item.location || 'Address not available',
      source: 'apify'
    }));

    console.log(`🎯 Processed ${leads.length} leads from Apify`);
    if (leads.length > 0) {
      console.log(`📋 Sample lead:`, JSON.stringify(leads[0], null, 2));
    }

    return leads;

  } catch (error) {
    console.error(`❌ APIFY ERROR:`, {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    });

    // Handle specific Apify API errors
    if (error.response) {
      const { status, data } = error.response;

      if (status === 400) {
        console.error(`🚨 Bad Request (400): Invalid input parameters`);
        console.error(`   📋 Error details:`, data);
        throw new Error(`Apify API Error: Invalid request parameters - ${data?.error || 'Bad Request'}`);
      } else if (status === 401) {
        console.error(`🚨 Unauthorized (401): Invalid or missing API token`);
        throw new Error('Apify API Error: Invalid or missing API token');
      } else if (status === 404) {
        console.error(`🚨 Not Found (404): Actor not found or not accessible`);
        throw new Error('Apify API Error: Actor not found or not accessible');
      } else if (status >= 500) {
        console.error(`🚨 Server Error (${status}): Apify service unavailable`);
        throw new Error(`Apify API Error: Service temporarily unavailable (${status})`);
      } else {
        console.error(`🚨 HTTP Error (${status}): ${error.response.statusText}`);
        throw new Error(`Apify API Error: ${status} - ${error.response.statusText}`);
      }
    } else if (error.code === 'ECONNABORTED') {
      console.error(`🚨 Timeout: Request took too long`);
      throw new Error('Apify API Error: Request timeout - try again later');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.error(`🚨 Network Error: Cannot reach Apify API`);
      throw new Error('Apify API Error: Network connection failed');
    } else {
      console.error(`🚨 Unknown Error:`, error.message);
      throw new Error(`Apify API Error: ${error.message}`);
    }
  }
};
