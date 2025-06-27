import axios from "axios";

export const fetchLeadsFromApollo = async (prompt, maxResults) => {
  const options = {
    method: "POST",
    url: "https://apollo-io-leads-scraper.p.rapidapi.com/leads",
    headers: {
      "x-rapidapi-key": "0221ca216dmshf6b85c324a3d882p16eb12jsnc8f9e1f91587",
      "x-rapidapi-host": "apollo-io-leads-scraper.p.rapidapi.com",
      "Content-Type": "application/json",
    },
    data: {
      searchUrl: prompt,
    },
  };

  try {
    const response = await axios.request(options);
    return response.data;
  } catch (error) {
    console.error("Apollo API error:", error);
    return [];
  }
};