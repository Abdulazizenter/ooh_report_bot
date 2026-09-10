# OOH SDIP • Платформа Мониторинга

Комплексная система контроля наружной рекламы (OOH) через Telegram Web App с автоматической проверкой отчетов с помощью ИИ (Gemini).

## Развертывание (Production / GitHub)

Для развертывания платформы на собственном сервере (Vercel, Render, Railway, VPS, Cloud Run) выполните следующие шаги:

### 1. Подготовка Google Service Account (Для доступа к Google Диску и Таблицам)
В режиме разработки (AI Studio) авторизация происходила через браузер. На реальном сервере приложению нужен Сервисный Аккаунт для фоновой работы:
1. Перейдите в [Google Cloud Console](https://console.cloud.google.com/).
2. В разделе **IAM & Admin -> Service Accounts** создайте новый аккаунт.
3. Сгенерируйте и скачайте JSON-ключ (вкладка Keys -> Add Key -> JSON).
4. В скачанном файле найдите `client_email` и `private_key`.
5. Откройте ваш Google Диск, создайте папку для системы и **предоставьте доступ (Share) к этой папке для адреса `client_email`** (с правами Редактора).

### 2. Переменные окружения (.env)
На вашем хостинге укажите следующие переменные окружения:

```env
GEMINI_API_KEY=ваш_ключ_от_gemini_api
GOOGLE_SERVICE_ACCOUNT_EMAIL=email_из_json_файла@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nВАШ\nКЛЮЧ\n-----END PRIVATE KEY-----\n"
```
*(Важно: `GOOGLE_PRIVATE_KEY` должен содержать переносы строк `\n`, если хостинг требует однострочный формат, либо вставьте ключ как есть, если хостинг поддерживает многострочные секреты).*

### 3. Запуск сервера
Приложение представляет собой стандартный Node.js + Express сервер:
```bash
npm install
npm run start
```
Сервер будет запущен на порту 3000 (или на порту, указанном хостингом в `process.env.PORT`).

### 4. Подключение к Telegram
В Telegram-боте (`@BotFather`) установите Web App URL (команда `/setmenubutton`) на адрес вашего нового развернутого сервера (например, `https://ваше-приложение.onrender.com`).
