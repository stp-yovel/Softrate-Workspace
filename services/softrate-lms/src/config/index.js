require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.LMS_PORT || process.env.PORT || 4500),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  mongoUri: process.env.MONGO_URI || '',
  peopleSoftApiUrl: process.env.PEOPLESOFT_API_URL || 'http://127.0.0.1:5001',
  defaultCompanyCode: process.env.DEFAULT_COMPANY_CODE || 'SOFTRATE',
};

module.exports = config;
