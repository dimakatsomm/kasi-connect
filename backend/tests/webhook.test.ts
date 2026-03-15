import request from 'supertest';
import app from '../src/app';

// Mock the message handler so we don't need live Redis/DB in webhook tests
jest.mock('../src/services/messageHandler', () => ({
  handleMessage: jest.fn().mockResolvedValue(undefined),
}));

describe('Webhook Route', () => {
  const VERIFY_TOKEN = 'test_verify_token';

  describe('GET /webhook — verification', () => {
    test('returns challenge on valid verify token', async () => {
      const res = await request(app)
        .get('/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': VERIFY_TOKEN,
          'hub.challenge': 'test_challenge_123',
        });

      expect(res.status).toBe(200);
      expect(res.text).toBe('test_challenge_123');
    });

    test('returns 403 on wrong verify token', async () => {
      const res = await request(app)
        .get('/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong_token',
          'hub.challenge': 'test_challenge_123',
        });

      expect(res.status).toBe(403);
    });

    test('returns 403 when mode is not subscribe', async () => {
      const res = await request(app)
        .get('/webhook')
        .query({
          'hub.mode': 'unsubscribe',
          'hub.verify_token': VERIFY_TOKEN,
          'hub.challenge': 'test_challenge_123',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /webhook — inbound messages', () => {
    const validPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                messages: [
                  {
                    from: '27821234567',
                    type: 'text',
                    text: { body: 'ngifuna pap and wors' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    test('responds 200 immediately', async () => {
      const res = await request(app)
        .post('/webhook')
        .send(validPayload)
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(200);
    });

    test('ignores non-whatsapp_business_account objects', async () => {
      const res = await request(app)
        .post('/webhook')
        .send({ object: 'page', entry: [] })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(200);
    });

    test('handles malformed payload gracefully', async () => {
      const res = await request(app)
        .post('/webhook')
        .send({ object: 'whatsapp_business_account' })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(200);
    });
  });
});

describe('Health check', () => {
  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
