console.log("=== Yemot Background Worker Loaded Successfully ===");

const ALARM_NAME = 'checkYemotSmsAlarm';

chrome.runtime.onInstalled.addListener(() => {
  initAlarmAndStorage();
  checkForUpdates();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarmExists();
  checkForUpdates();
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
    // שימו לב: בדיקת עדכונים הוסרה מכאן כדי למנוע חסימה מה-API של גיטהאב עקב בדיקות מרובות. 
    // הבדיקה תרוץ כעת רק בפתיחת דפדפן, קליק על הפופ-אפ, או בדף ההגדרות כפי שביקשתם.
  }
});

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

function showSmsNotification(latestMsg) {
  const codeMatch = latestMsg.message.match(/\b\d{5,8}\b/);
  const codeText = codeMatch ? codeMatch[0] : null;
  const systemName = latestMsg.source || 'מערכת';

  let notifTitle = '';
  let notifMessage = '';

  if (codeText) {
    notifTitle = `התקבל קוד חדש מ ${systemName}`;
    notifMessage = `${latestMsg.message}\n \n \n code is ${codeText}`;
  } else {
    notifTitle = `התקבל SMS חדש מ ${systemName}`;
    notifMessage = latestMsg.message;
  }

  const notifId = 'yemot_sms_alert_' + Date.now();

  chrome.notifications.create(notifId, {
    type: 'basic',
    iconUrl: 'icon128.png',
    title: notifTitle,
    message: notifMessage,
    priority: 2,
    requireInteraction: false
  });

  setTimeout(() => {
    chrome.notifications.clear(notifId);
  }, 15000); 
}

async function checkForNewSms() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['token', 'lastMessageId', 'unreadCount', 'smsFilters'], async (data) => {
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
          latestMsg.message = latestMsg.message.replace(/(\r?\n){2,}/g, '\n');

          const filters = data.smsFilters || [];
          let isFiltered = false;
          for (let f of filters) {
            if (f.type === 'sender' && latestMsg.source === f.value) isFiltered = true;
            if (f.type === 'contains' && latestMsg.message.includes(f.value)) isFiltered = true;
            if (f.type === 'not_contains' && !latestMsg.message.includes(f.value)) isFiltered = true;
          }

          const msgId = `${latestMsg.receive_date}_${latestMsg.source}`;

          if (!data.lastMessageId) {
            chrome.storage.local.set({ lastMessageId: msgId, lastMessageText: latestMsg.message });
            resolve(true);
            return;
          }

          if (msgId !== data.lastMessageId) {
            chrome.storage.local.set({ 
              lastMessageId: msgId, 
              lastMessageText: latestMsg.message,
            });

            if (!isFiltered) {
              const newCount = (data.unreadCount || 0) + 1;
              chrome.storage.local.set({ unreadCount: newCount });
              chrome.action.setBadgeText({ text: String(newCount) });
              chrome.action.setBadgeBackgroundColor({ color: '#6b21a8' });
              
              showSmsNotification(latestMsg);
            }
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
          latestMsg.message = latestMsg.message.replace(/(\r?\n){2,}/g, '\n');
          const msgId = `${latestMsg.receive_date}_${latestMsg.source}`;
          chrome.storage.local.set({ 
            lastMessageId: msgId, 
            lastMessageText: latestMsg.message 
          });

          showSmsNotification(latestMsg);
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

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (!notificationId.startsWith('yemot_sms_alert')) {
    chrome.notifications.clear(notificationId);
    return;
  }

  chrome.notifications.clear(notificationId);

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
            title: 'הקוד הועתק בהצלחה!',
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

async function checkForUpdates() {
  try {
    const response = await fetch('https://api.github.com/repos/Tzadikvtovlo/PushBox/releases/latest');
    if (!response.ok) return;
    const data = await response.json();
    
    const localVersion = chrome.runtime.getManifest().version;
    const remoteVersion = data.tag_name ? data.tag_name.replace(/^v/i, '').trim() : localVersion;

    if (isNewerVersion(localVersion, remoteVersion)) {
      chrome.storage.local.set({ updateAvailable: true });
      chrome.action.setBadgeText({ text: "!" });
      chrome.action.setBadgeBackgroundColor({ color: '#6b21a8' });
    } else {
      chrome.storage.local.set({ updateAvailable: false });
      chrome.action.setBadgeText({ text: "" });
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
