import axios from 'axios';
import config from '../config';
import logger from '../config/logger';

/**
 * Transcribe a WhatsApp voice note to text using Huawei ModelArts
 * (or a compatible speech-to-text endpoint).
 *
 * The function accepts an audio Buffer (OGG/OPUS from WhatsApp) and
 * returns the raw transcript string.
 *
 * @param audioBuffer  Raw audio bytes
 * @param mimeType     MIME type, e.g. "audio/ogg; codecs=opus"
 */
export async function transcribeVoiceNote(
  audioBuffer: Buffer,
  mimeType = 'audio/ogg'
): Promise<string> {
  if (!config.modelarts.endpoint || !config.modelarts.accessKey) {
    throw new Error('ModelArts STT not configured');
  }

  const url = `${config.modelarts.endpoint}/v1/speech/recognition`;

  try {
    const response = await axios.post<{ result?: { text?: string } }>(
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

    const transcript = response.data?.result?.text ?? '';
    logger.debug('Voice note transcribed', { length: transcript.length });
    return transcript;
  } catch (err) {
    const errData =
      axios.isAxiosError(err) ? (err.response?.data as unknown) : (err instanceof Error ? err.message : String(err));
    logger.error('Speech-to-text failed', { error: errData });
    throw err;
  }
}
