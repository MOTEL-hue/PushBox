document.addEventListener('DOMContentLoaded', () => {
  // טעינת נתונים קיימים
  chrome.storage.local.get(['token', 'phoneNumber', 'interval'], (data) => {
    if (data.token) document.getElementById('token').value = data.token;
    if (data.phoneNumber) document.getElementById('phoneNumber').value = data.phoneNumber;
    if (data.interval) document.getElementById('interval').value = data.interval;
  });

  // מנגנון בדיקת עדכונים
  const versionBox = document.getElementById('versionBox');
  const manifest = chrome.runtime.getManifest();
  const currentVersion = manifest.version;
  versionBox.textContent = `v${currentVersion}`;
  versionBox.style.direction = 'ltr'; // הגדרה ראשונית כמספר

  // פונקציה חכמה להשוואת מספרי גרסאות מתמטית
  function isNewerVersion(latest, current) {
    const lParts = latest.split('.').map(Number);
    const cParts = current.split('.').map(Number);
    const len = Math.max(lParts.length, cParts.length);
    
    for (let i = 0; i < len; i++) {
      const l = lParts[i] || 0; 
      const c = cParts[i] || 0;
      if (l > c) return true;
      if (l < c) return false;
    }
    return false; 
  }

  async function checkForUpdates(isManual = false) {
    if (isManual) {
      versionBox.textContent = 'בודק...';
      versionBox.style.direction = 'rtl'; // שינוי דינמי לעברית
      versionBox.style.pointerEvents = 'none';
    }
    try {
      const res = await fetch('https://api.github.com/repos/Tzadikvtovlo/PushBox/releases/latest');
      if (!res.ok) throw new Error('Network error');
      const data = await res.json();
      
      const latestVersion = data.tag_name ? data.tag_name.replace(/^v/i, '').trim() : currentVersion;

      if (isNewerVersion(latestVersion, currentVersion)) {
        versionBox.textContent = 'עדכון זמין!';
        versionBox.style.direction = 'rtl'; // שינוי לעברית
        versionBox.classList.add('update');
        versionBox.onclick = () => window.open('https://github.com/Tzadikvtovlo/PushBox/releases', '_blank');
        versionBox.style.pointerEvents = 'auto';
      } else {
        if (isManual) {
          versionBox.textContent = 'מעודכן!';
          versionBox.style.direction = 'rtl'; // שינוי לעברית
          setTimeout(() => { 
            versionBox.textContent = `v${currentVersion}`; 
            versionBox.style.direction = 'ltr'; // חזרה למספר
          }, 2000);
        } else {
          versionBox.textContent = `v${currentVersion}`;
          versionBox.style.direction = 'ltr'; // חזרה למספר
        }
        versionBox.classList.remove('update');
        versionBox.onclick = () => checkForUpdates(true);
        versionBox.style.pointerEvents = 'auto';
      }
    } catch (e) {
      if (isManual) {
        versionBox.textContent = 'שגיאה בבדיקה!';
        versionBox.style.direction = 'rtl'; // שינוי לעברית
        setTimeout(() => { 
          versionBox.textContent = `v${currentVersion}`; 
          versionBox.style.direction = 'ltr'; // חזרה למספר
        }, 2000);
      }
      versionBox.onclick = () => checkForUpdates(true);
      versionBox.style.pointerEvents = 'auto';
    }
  }

  // הפעלת בדיקה ראשונית בעת עליית הדף
  checkForUpdates();

  // פונקציה כללית לשינוי כפתור לסטטוס הצלחה/שגיאה
  function showBtnFeedback(btnId, message, type = 'success') {
    const btn = document.getElementById(btnId);
    
    if (!btn.dataset.originalHtml) {
      btn.dataset.originalHtml = btn.innerHTML;
    }
    
    const originalHtml = btn.dataset.originalHtml;
    
    btn.innerHTML = `<span style="font-weight: bold;">${message}</span>`;
    
    if (type === 'success') {
      btn.style.backgroundColor = '#e9d5ff'; 
      btn.style.color = '#1e3a8a';
      btn.style.borderColor = '#c084fc';
    } else {
      btn.style.backgroundColor = '#f3e8ff'; 
      btn.style.color = '#581c87'; 
      btn.style.borderColor = '#d8b4fe';
    }
    
    btn.style.pointerEvents = 'none';

    setTimeout(() => {
      btn.innerHTML = originalHtml;
      btn.style.backgroundColor = '';
      btn.style.color = '';
      btn.style.borderColor = '';
      btn.style.pointerEvents = 'auto';
    }, 2000);
  }

  // ניהול מסננים
  document.getElementById('manageFilters').addEventListener('click', () => {
    chrome.tabs.create({ url: 'filters.html' });
  });

  // אימות טוקן
  document.getElementById('verifyToken').addEventListener('click', async () => {
    const token = document.getElementById('token').value.trim();
    if (!token) {
      showBtnFeedback('verifyToken', 'הזן טוקן!', 'error');
      return;
    }

    showBtnFeedback('verifyToken', 'מאמת...', 'success');
    
    try {
      const res = await fetch(`https://www.call2all.co.il/ym/api/GetSession?token=${encodeURIComponent(token)}`);
      const json = await res.json();
      
      if (json.responseStatus === 'OK') {
         showBtnFeedback('verifyToken', 'אומת בהצלחה!', 'success');
      } else {
         showBtnFeedback('verifyToken', 'טוקן שגוי!', 'error');
      }
    } catch (e) {
      showBtnFeedback('verifyToken', 'שגיאת רשת!', 'error');
    }
  });

  // שמירה
  document.getElementById('save').addEventListener('click', () => {
    const token = document.getElementById('token').value.trim();
    const interval = document.getElementById('interval').value;
    
    chrome.storage.local.set({ token: token, interval: interval }, () => {
       showBtnFeedback('save', 'נשמר בהצלחה!', 'success');
       chrome.runtime.sendMessage({ action: 'update-interval' });
    });
  });

  // שליחה מחדש
  document.getElementById('resendNow').addEventListener('click', () => {
     chrome.runtime.sendMessage({ action: 'resend-latest-sms' });
     showBtnFeedback('resendNow', 'נשלח בהצלחה!', 'success');
  });

  // העתקת אימייל
  document.getElementById('copyEmail').addEventListener('click', (e) => {
     navigator.clipboard.writeText(e.target.innerText);
     const originalText = e.target.innerText;
     e.target.innerText = "הועתק!";
     setTimeout(() => e.target.innerText = originalText, 1500);
  });
});
