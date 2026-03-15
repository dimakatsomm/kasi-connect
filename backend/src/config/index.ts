import dotenv from 'dotenv';
dotenv.config();

export interface AppConfig {
  env: string;
  port: number;
  whatsapp: {
    verifyToken: string | undefined;
    accessToken: string | undefined;
    phoneNumberId: string | undefined;
    apiVersion: string;
    readonly apiBaseUrl: string;
  };
  redis: {
    host: string;
    port: number;
    password: string | undefined;
    sessionTtl: number;
  };
  db: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string | undefined;
    pool: {
      min: number;
      max: number;
    };
  };
  kafka: {
    brokers: string[];
    clientId: string;
    groupId: string;
    topics: {
      orderCreated: string;
      orderUpdated: string;
      orderReady: string;
      specialsBroadcast: string;
    };
  };
  obs: {
    endpoint: string | undefined;
    bucket: string;
    accessKey: string | undefined;
    secretKey: string | undefined;
  };
  modelarts: {
    endpoint: string | undefined;
    accessKey: string | undefined;
    secretKey: string | undefined;
    sttModelId: string | undefined;
  };
  session: {
    inactivityTimeoutMs: number;
  };
}

const config: AppConfig = {
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),

  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    apiVersion: process.env.WHATSAPP_API_VERSION ?? 'v18.0',
    get apiBaseUrl(): string {
      return `https://graph.facebook.com/${this.apiVersion}`;
    },
  },

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD ?? undefined,
    sessionTtl: parseInt(process.env.REDIS_SESSION_TTL ?? '1800', 10),
  },

  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    name: process.env.DB_NAME ?? 'kasiconnect',
    user: process.env.DB_USER ?? 'kasiconnect',
    password: process.env.DB_PASSWORD,
    pool: {
      min: parseInt(process.env.DB_POOL_MIN ?? '2', 10),
      max: parseInt(process.env.DB_POOL_MAX ?? '10', 10),
    },
  },

  kafka: {
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID ?? 'kasi-connect',
    groupId: process.env.KAFKA_GROUP_ID ?? 'kasi-connect-group',
    topics: {
      orderCreated: 'order.created',
      orderUpdated: 'order.updated',
      orderReady: 'order.ready',
      specialsBroadcast: 'specials.broadcast',
    },
  },

  obs: {
    endpoint: process.env.OBS_ENDPOINT,
    bucket: process.env.OBS_BUCKET ?? 'kasiconnect-media',
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
    inactivityTimeoutMs:
      parseInt(process.env.SESSION_INACTIVITY_TIMEOUT_MS ?? '1800000', 10),
  },
};

export default config;
