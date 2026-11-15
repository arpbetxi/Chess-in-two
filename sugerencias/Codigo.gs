/**
 * Buzón de sugerencias de "In 2 Chess"
 * ---------------------------------------------
 * Este script se pega en una hoja de cálculo de Google (Extensiones → Apps Script).
 * Cada sugerencia enviada desde el juego:
 *   1. se guarda como una fila nueva en la pestaña "Sugerencias";
 *   2. te llega por correo con el asunto "[Ajedrez con cartas] Nueva sugerencia".
 *
 * No guarda ningún dato personal de quien la envía (ni nombre, ni correo, ni IP).
 * Las instrucciones de instalación están en sugerencias/LEEME.md.
 */

const SHEET_NAME = 'Sugerencias';
const EMAIL_SUBJECT = '[Ajedrez con cartas] Nueva sugerencia';
const MAX_LENGTH = 1500;

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // Campo trampa: los humanos no lo ven; si viene relleno, es un bot de spam
    if (data.website) return reply({ ok: true });

    const text = String(data.text || '').trim().slice(0, MAX_LENGTH);
    if (text.length < 3) return reply({ ok: false, error: 'La sugerencia está vacía.' });

    const category = String(data.category || 'Otro').slice(0, 40);
    const mode = String(data.mode || '').slice(0, 40);

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['Fecha', 'Categoría', 'Sugerencia', 'Modo de juego', 'Revisada']);
        sheet.setFrozenRows(1);
      }
      sheet.appendRow([new Date(), category, text, mode, false]);
    } finally {
      lock.releaseLock();
    }

    const owner = Session.getEffectiveUser().getEmail();
    MailApp.sendEmail(owner, EMAIL_SUBJECT,
      'Categoría: ' + category + '\n' +
      (mode ? 'Modo de juego: ' + mode + '\n' : '') +
      '\n' + text + '\n\n' +
      '— Enviada de forma anónima desde el buzón del juego.');

    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

// Para comprobar en el navegador que el script está publicado
function doGet() {
  return reply({ ok: true, info: 'Buzón de sugerencias activo' });
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Ejecútala una vez desde el editor (elige "autorizar" y pulsa Ejecutar) para conceder
 * los permisos que necesita el buzón: editar esta hoja de cálculo y enviarte correos.
 * Al autorizar, marca todas las casillas ("Seleccionar todo").
 */
function autorizar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const quota = MailApp.getRemainingDailyQuota();
  Logger.log('Permisos correctos. Hoja: ' + ss.getName() + '. Correos disponibles hoy: ' + quota);
}
