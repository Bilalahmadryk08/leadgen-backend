import axios from 'axios';

export const fetchApolloLeads = async (searchUrl) => {
  const options = {
    method: 'POST',
    url: 'https://apollo-io-leads-scraper.p.rapidapi.com/ping',
    headers: {
      'content-type': 'application/json',
      'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
      'X-RapidAPI-Host': 'apollo-io-leads-scraper.p.rapidapi.com',
    },
    data: {
      searchUrl: searchUrl || '', // replace with actual search URL if needed
    }
  };

  const response = await axios.request(options);
  return response.data;
};
