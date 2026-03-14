'use strict';

// Set test environment variables before any modules are loaded
process.env.NODE_ENV = 'test';
process.env.WHATSAPP_VERIFY_TOKEN = 'test_verify_token';
process.env.WHATSAPP_ACCESS_TOKEN = 'test_access_token';
process.env.WHATSAPP_PHONE_NUMBER_ID = 'test_phone_number_id';
process.env.REDIS_HOST = 'localhost';
process.env.DB_HOST = 'localhost';
