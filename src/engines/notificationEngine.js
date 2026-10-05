export class NotificationEngine {
  static async sendTelegramAlert(chatId, message) {
    if (!chatId) return false;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.warn('[NotificationEngine] No TELEGRAM_BOT_TOKEN provided. Alert suppressed:', message);
      return false;
    }
    
    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message })
      });
      return response.ok;
    } catch (err) {
      console.error('[NotificationEngine] Failed to send Telegram alert:', err.message);
      return false;
    }
  }

  static async notifyFraudAttempt(kamChatId, details) {
    const text = `🚨 Внимание! Зафиксировано нарушение правил (Фрод) 🚨\n\n` +
                 `📍 Локация: ${details.address}\n` +
                 `❌ Причина: ${details.reason}\n` +
                 `🕒 Время: ${new Date().toLocaleString('ru-RU')}`;
    return this.sendTelegramAlert(kamChatId, text);
  }

  static async notifyRouteCompleted(kamChatId, supplierName) {
    const text = `✅ Маршрут завершен\n\n` +
                 `Подрядчик ${supplierName} полностью отчитался по адресной программе.`;
    return this.sendTelegramAlert(kamChatId, text);
  }
}
