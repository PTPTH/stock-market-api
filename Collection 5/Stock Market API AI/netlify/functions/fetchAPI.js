const fetch = require('node-fetch');

exports.handler = async function (event, context) {
  // Get the API endpoint path from the query string
  const { endpoint } = event.queryStringParameters;
  const API_KEY = process.env.FMP_API_KEY; // Access the API key from environment variables
  const API_BASE_URL = 'https://financialmodelingprep.com/api/v3';

  if (!endpoint) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'API endpoint is required' }),
    };
  }

  try {
    const url = `${API_BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}apikey=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
        return {
            statusCode: response.status,
            body: JSON.stringify(data)
        };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch data from FMP API' }),
    };
  }
};