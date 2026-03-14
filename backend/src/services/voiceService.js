'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('../config/logger');

/**
 * Transcribe a WhatsApp voice note to text using Huawei ModelArts
 * (or a compatible speech-to-text endpoint).
 *
 * The function accepts an audio Buffer (OGG/OPUS from WhatsApp) and
 * returns the raw transcript string.
 *
 * @param {Buffer} audioBuffer  Raw audio bytes
 * @param {string} mimeType     MIME type, e.g. "audio/ogg; codecs=opus"
 * @returns {Promise<string>}   Transcript text
 */
async function transcribeVoiceNote(audioBuffer, mimeType = 'audio/ogg') {
  if (!config.modelarts.endpoint || !config.modelarts.accessKey) {
    throw new Error('ModelArts STT not configured');
  }

  const url = `${config.modelarts.endpoint}/v1/speech/recognition`;

  try {
    const response = await axios.post(
      url,
      {
        audio: audioBuffer.toString('base64'),
        audio_format: mimeType,
        model_id: config.modelarts.sttModelId,
        language: 'multi-sa', // South African multi-language hint
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': config.modelarts.accessKey,
        },
        timeout: 30000,
      }
    );

    const transcript = response.data?.result?.text || '';
    logger.debug('Voice note transcribed', { length: transcript.length });
    return transcript;
  } catch (err) {
    logger.error('Speech-to-text failed', { error: err.response?.data || err.message });
    throw err;
  }
}

module.exports = { transcribeVoiceNote };
