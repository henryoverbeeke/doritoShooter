// Development Mode Configuration
// Set IS_DEV_MODE to true when developing locally

const IS_DEV_MODE = process.env.IS_DEV_MODE === 'true' || process.env.NODE_ENV !== 'production';

module.exports = {
  IS_DEV_MODE,
  ENABLE_AI_IN_DEV: IS_DEV_MODE && process.env.ENABLE_AI_IN_DEV !== 'false',
  PORT: process.env.PORT || 8080,
};
