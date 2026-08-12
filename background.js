console.log("=== Yemot Background Worker Loaded Successfully ===");

const ALARM_NAME = 'checkYemotSmsAlarm';

chrome.runtime.onInstalled.addListener(() => {
  initAlarmAndStorage();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarmExists();
});

function initAlarmAndStorage() {
  chrome.storage.local.get(['checkInterval'], (data) => {
    const interval = data.checkInterval !== undefined ? data.checkInterval : 1;
    chrome.storage.local.set({ checkInterval: interval }, () => {
      setupAlarm(interval);
    });
  });
}

function ensureAlarmExists() {
  chrome.alarms.get(ALARM_NAME, (alarm) => {
    if (!alarm) {
      chrome.storage.local.get(['checkInterval'], (data) => {
        const interval = data.checkInterval !== undefined ? data.checkInterval : 1;
        setupAlarm(interval);
      });
    }
  });
}

function setupAlarm(intervalMinutes) {
  chrome.alarms.clear(ALARM_NAME, () => {
    if (intervalMinutes > 0) {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: Number(intervalMinutes) });
    }
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.checkInterval) {
    setupAlarm(changes.checkInterval.newValue);
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkForNewSms();
  }
});

// האזנה לקריאות מהפופ-אפ ומההגדרות
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'check-now') {
    checkForNewSms().then((hasToken) => {
      sendResponse({ success: hasToken });
    }).catch((err) => {
      console.error(err);
      sendResponse({ success: false });
    });
    return true;
  }

  if (request.action === 'resend-latest-sms') {
    resendLatestSmsNotification().then((success) => {
      sendResponse({ success: success });
    }).catch((err) => {
      console.error(err);
      sendResponse({ success: false });
    });
    return true;
  }
});

async function checkForNewSms() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['token', 'lastMessageId'], async (data) => {
      if (!data.token) {
        resolve(false);
        return;
      }

      try {
        const url = `https://www.call2all.co.il/ym/api/GetIncomingSms?token=${encodeURIComponent(data.token)}&limit=1`;
        const res = await fetch(url);
        const result = await res.json();

        if (result && result.responseStatus === 'OK' && result.rows && result.rows.length > 0) {
          const latestMsg = result.rows[0];
          const msgId = `${latestMsg.receive_date}_${latestMsg.source}`;

          if (!data.lastMessageId) {
            chrome.storage.local.set({ lastMessageId: msgId, lastMessageText: latestMsg.message });
            resolve(true);
            return;
          }

          if (msgId !== data.lastMessageId) {
            chrome.storage.local.set({ 
              lastMessageId: msgId, 
              lastMessageText: latestMsg.message 
            });

            const codeMatch = latestMsg.message.match(/\b\d{5,8}\b/);
            const codeText = codeMatch ? `קוד אימות: ${codeMatch[0]}` : '';

            chrome.notifications.create('yemot_sms_alert', {
              type: 'basic',
              iconUrl: 'icon48.png',
              title: `הודעת SMS חדשה (${latestMsg.source || 'מערכת'})`,
              message: `${latestMsg.message}\n${codeText}\n[לחץ כאן להעתקת הקוד]`,
              priority: 2
            });
          }
        }
        resolve(true);
      } catch (error) {
        console.error('Error during background SMS fetch:', error);
        reject(error);
      }
    });
  });
}

// שליחה מחדש של התראת דחיפה להודעה האחרונה במערכת
async function resendLatestSmsNotification() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['token'], async (data) => {
      if (!data.token) {
        resolve(false);
        return;
      }

      try {
        const url = `https://www.call2all.co.il/ym/api/GetIncomingSms?token=${encodeURIComponent(data.token)}&limit=1`;
        const res = await fetch(url);
        const result = await res.json();

        if (result && result.responseStatus === 'OK' && result.rows && result.rows.length > 0) {
          const latestMsg = result.rows[0];
          const msgId = `${latestMsg.receive_date}_${latestMsg.source}`;

          chrome.storage.local.set({ 
            lastMessageId: msgId, 
            lastMessageText: latestMsg.message 
          });

          const codeMatch = latestMsg.message.match(/\b\d{5,8}\b/);
          const codeText = codeMatch ? `קוד אימות: ${codeMatch[0]}` : '';

          chrome.notifications.create('yemot_sms_alert', {
            type: 'basic',
            iconUrl: 'icon48.png',
            title: `הודעת SMS אחרונה (${latestMsg.source || 'מערכת'})`,
            message: `${latestMsg.message}\n${codeText}\n[לחץ כאן להעתקת הקוד]`,
            priority: 2
          });
          resolve(true);
        } else {
          resolve(false);
        }
      } catch (error) {
        console.error('Error during resend SMS notification:', error);
        reject(error);
      }
    });
  });
}

// יצירת מסמך Offscreen והעברת הטקסט להעתקה (ללא שינוי הלוגיקה)
async function copyTextToClipboard(text) {
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['CLIPBOARD'],
        justification: 'Copy verification code to clipboard from notification click'
      });
    }

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'copy-to-clipboard',
        text: text
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Runtime error:', chrome.runtime.lastError.message);
          resolve(false);
        } else {
          resolve(response && response.success);
        }
      });
    });
  } catch (err) {
    console.error('Error in copyTextToClipboard:', err);
    return false;
  }
}

// האזנה ללחיצה על התראות הדחיפה
chrome.notifications.onClicked.addListener(async (notificationId) => {
  // אם הלחיצה היא על התראת אישור/שגיאה - מעלימים אותה ללא העתקה מחדש
  if (notificationId !== 'yemot_sms_alert') {
    chrome.notifications.clear(notificationId);
    return;
  }

  // סגירת התראת ה-SMS הראשית
  chrome.notifications.clear('yemot_sms_alert');

  chrome.storage.local.get(['lastMessageText'], async (data) => {
    if (data.lastMessageText) {
      const codeMatch = data.lastMessageText.match(/\b\d{5,8}\b/);
      if (codeMatch) {
        const code = codeMatch[0];
        const success = await copyTextToClipboard(code);

        if (success) {
          chrome.notifications.create('copy_success_' + Date.now(), {
            type: 'basic',
            iconUrl: 'icon48.png',
            title: 'הקוד הועתק בהצלחה! ✓',
            message: `קוד האימות (${code}) נמצא כעת בלוח ההדבקה.`,
            priority: 2
          });
        } else {
          chrome.notifications.create('copy_error_' + Date.now(), {
            type: 'basic',
            iconUrl: 'icon48.png',
            title: 'שגיאה בהעתקת הקוד',
            message: 'לא ניתן היה לגשת ללוח ההדבקה אוטומטית.',
            priority: 1
          });
        }
      } else {
        chrome.notifications.create('no_code_' + Date.now(), {
          type: 'basic',
          iconUrl: 'icon48.png',
          title: 'לא נמצא קוד',
          message: 'לא נמצאה סדרת ספרות באורך 5-8 בהודעה האחרונה.',
          priority: 1
        });
      }
    }
  });
});

ensureAlarmExists();
// ==========================================
// --- בלוק חדש: מערכת בדיקת עדכונים מול גיטאהב ---
// ==========================================

const GITHUB_MANIFEST_URL = 'https://raw.githubusercontent.com/Tzadikvtovlo/PushBox/main/manifest.json';
const GITHUB_DOWNLOAD_URL = 'https://github.com/Tzadikvtovlo/PushBox/releases';

async function checkForUpdates() {
  try {
    const response = await fetch(`${GITHUB_MANIFEST_URL}?t=${Date.now()}`);
    const remoteData = await response.json();
    
    const localVersion = chrome.runtime.getManifest().version;
    const remoteVersion = remoteData.version;

    if (isNewerVersion(localVersion, remoteVersion)) {
      chrome.storage.local.set({ 
        updateAvailable: true, 
        updateUrl: GITHUB_DOWNLOAD_URL 
      });
    } else {
      chrome.storage.local.set({ updateAvailable: false });
    }
  } catch (error) {
    console.error("PushBox Update Check Error:", error);
  }
}

function isNewerVersion(local, remote) {
  const localParts = local.split('.');
  const remoteParts = remote.split('.');
  for (let i = 0; i < Math.max(localParts.length, remoteParts.length); i++) {
    const l = parseInt(localParts[i]) || 0;
    const r = parseInt(remoteParts[i]) || 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}

chrome.runtime.onStartup.addListener(checkForUpdates);
chrome.runtime.onInstalled.addListener(checkForUpdates);