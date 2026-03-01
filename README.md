# Лендинг MVP «Подбор кофе под вкус» (Казахстан)

Статический лендинг (HTML/CSS/JS):
- mobile-first
- квиз на 5 вопросов + сбор контакта
- A/B тест заголовка (A/B в localStorage)
- события для GA4 + Я.Метрики
- отправка лида в Google Sheets через Google Apps Script Web App

## Запуск локально
Открой `index.html` двойным кликом или через простой сервер.

Рекомендовано (чтобы fetch/cors работали корректно):
- VSCode → Live Server
или
- `python -m http.server 8080` и открыть http://localhost:8080

## Подключение GA4
В `index.html` замени:
- `G-XXXXXXXXXX` на свой Measurement ID.

## Подключение Яндекс.Метрики
В `index.html` замени:
- `COUNTER_ID` на свой id счётчика.

## Google Sheets интеграция (через Apps Script Web App)
1) Создай Google Sheet (таблица).
2) `Extensions → Apps Script`
3) Вставь код Apps Script (см. ниже).
4) `Deploy → New deployment → Web app`
   - Execute as: Me
   - Who has access: Anyone
5) Скопируй URL Web App вида:
   `https://script.google.com/macros/s/.../exec`
6) В `app.js` замени:
   `SHEETS_WEBAPP_URL`.

### Apps Script код (Code.gs)

```javascript
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Leads") || ss.insertSheet("Leads");

    // header (once)
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "ts","session_id","ab_variant","page_url",
        "utm_source","utm_medium","utm_campaign","utm_content","utm_term",
        "taste_profile","milk","brew_method","avoid","boost",
        "phone","telegram","city",
        "rec_profile","rec_roast","rec_notes","rec_intensity","rec_grindHint","rec_milkText"
      ]);
    }

    var r = data.recommendation || {};
    sheet.appendRow([
      data.ts || "", data.session_id || "", data.ab_variant || "", data.page_url || "",
      data.utm_source || "", data.utm_medium || "", data.utm_campaign || "", data.utm_content || "", data.utm_term || "",
      data.taste_profile || "", data.milk || "", data.brew_method || "", data.avoid || "", data.boost || "",
      data.phone || "", data.telegram || "", data.city || "",
      r.profile || "", r.roast || "", r.notes || "", r.intensity || "", r.grindHint || "", r.milkText || ""
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
