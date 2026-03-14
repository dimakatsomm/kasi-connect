'use strict';

require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,

  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v18.0',
    get apiBaseUrl() {
      return `https://graph.facebook.com/${this.apiVersion}`;
    },
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    sessionTtl: parseInt(process.env.REDIS_SESSION_TTL, 10) || 1800,
  },

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    name: process.env.DB_NAME || 'kasiconnect',
    user: process.env.DB_USER || 'kasiconnect',
    password: process.env.DB_PASSWORD,
    pool: {
      min: parseInt(process.env.DB_POOL_MIN, 10) || 2,
      max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
    },
  },

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'kasi-connect',
    groupId: process.env.KAFKA_GROUP_ID || 'kasi-connect-group',
    topics: {
      orderCreated: 'order.created',
      orderUpdated: 'order.updated',
      orderReady: 'order.ready',
      specialsBroadcast: 'specials.broadcast',
    },
  },

  obs: {
    endpoint: process.env.OBS_ENDPOINT,
    bucket: process.env.OBS_BUCKET || 'kasiconnect-media',
    accessKey: process.env.OBS_ACCESS_KEY,
    secretKey: process.env.OBS_SECRET_KEY,
  },

  modelarts: {
    endpoint: process.env.MODELARTS_ENDPOINT,
    accessKey: process.env.MODELARTS_ACCESS_KEY,
    secretKey: process.env.MODELARTS_SECRET_KEY,
    sttModelId: process.env.STT_MODEL_ID,
  },

  session: {
    inactivityTimeoutMs: parseInt(process.env.SESSION_INACTIVITY_TIMEOUT_MS, 10) || 1800000,
  },
};
