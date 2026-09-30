import crypto from 'node:crypto';

/**
 * Validates Telegram Web App initData string against bot token.
 * Reference: https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
 */
export function validateTelegramInitData(initData, botToken) {
  if (!initData || typeof initData !== 'string') return null;
  if (!botToken) {
    // If bot token is not configured in development, parse unsafe data
    try {
      const params = new URLSearchParams(initData);
      const userStr = params.get('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    params.delete('hash');

    // Sort parameters alphabetically
    const keys = Array.from(params.keys()).sort();
    const dataCheckString = keys.map((key) => `${key}=${params.get(key)}`).join('\n');

    // secret_key = HMAC_SHA256("WebAppData", botToken)
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();

    // calculated_hash = HMAC_SHA256(secret_key, dataCheckString)
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) {
      return null; // Signature verification failed
    }

    const userStr = params.get('user');
    return userStr ? JSON.parse(userStr) : null;
  } catch (err) {
    console.error('Telegram initData validation error:', err);
    return null;
  }
}
