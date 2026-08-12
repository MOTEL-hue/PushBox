document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['token', 'checkInterval', 'phoneNumber'], (data) => {
    if (data.token) document.getElementById('token').value = data.token;
    if (data.checkInterval !== undefined) document.getElementById('interval').value = data.checkInterval;
    if (data.phoneNumber) document.getElementById('phoneNumber').value = data.phoneNumber;
  });

  document.getElementById('save').addEventListener('click', () => {
    const token = document.getElementById('token').value.trim();
    const interval = document.getElementById('interval').value;
    const phoneNumber = document.getElementById('phoneNumber').value.trim();

    chrome.storage.local.set({ token, checkInterval: Number(interval), phoneNumber }, () => {
      showStatus('ההגדרות נשמרו בהצלחה!', 'status-success');
    });
  });

  // אימות טוקן בלייב מול השרת
  document.getElementById('verifyToken').addEventListener('click', async () => {
    const token = document.getElementById('token').value.trim();
    
    if (!token) {
      showStatus('אנא הזן טוקן כדי לבדוק אותו', 'status-error');
      return;
    }

    showStatus('מאמת טוקן מול המערכת...', 'status-info');
    
    try {
      const url = `https://www.call2all.co.il/ym/api/GetIncomingSms?token=${encodeURIComponent(token)}&limit=1`;
      const res = await fetch(url);
      const result = await res.json();

      if (result && result.responseStatus === 'OK') {
        showStatus('הטוקן תקין ומחובר למערכת! ✓', 'status-success');
      } else {
        showStatus('הטוקן שגוי או שאין הרשאות מתאימות', 'status-error');
      }
    } catch (err) {
      console.error(err);
      showStatus('שגיאה בתקשורת מול השרת', 'status-error');
    }
  });

  document.getElementById('resendNow').addEventListener('click', () => {
    showStatus('שולח התראה על ההודעה האחרונה...', 'status-info');
    chrome.runtime.sendMessage({ action: 'resend-latest-sms' }, (response) => {
      if (chrome.runtime.lastError) {
        showStatus('שגיאה בשליחת ההתראה', 'status-error');
      } else if (response && response.success) {
        showStatus('התראה נשלחה בהצלחה!', 'status-success');
      } else {
        showStatus('לא נמצאה הודעה לשליחה או שהטוקן שגוי', 'status-error');
      }
    });
  });

  // העתקת המייל בקליק
  document.getElementById('copyEmail').addEventListener('click', () => {
    navigator.clipboard.writeText('q9411aa@gmail.com').then(() => {
      showStatus('כתובת המייל הועתקה ללוח!', 'status-success');
    });
  });

  // --- חדש: בדיקת עדכונים לתצוגת הבאנר ---
  chrome.storage.local.get(['updateAvailable', 'updateUrl'], (data) => {
    if (data.updateAvailable) {
      const banner = document.getElementById('updateBanner');
      const updateLink = document.getElementById('updateLink');
      if (banner && updateLink) {
        banner.style.display = 'block'; 
        if (data.updateUrl) {
          updateLink.href = data.updateUrl; 
        }
      }
    }
  });
});

function showStatus(text, className) {
  const status = document.getElementById('status');
  status.textContent = text;
  status.className = className;
  setTimeout(() => {
    status.textContent = '';
    status.className = '';
  }, 3500);
}