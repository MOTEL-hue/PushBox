document.addEventListener('DOMContentLoaded', () => {
  loadHeaderTitle();
  fetchMessages();

  const refreshBtn = document.getElementById('refreshBtn');
  const refreshIcon = document.getElementById('refreshIcon');
  
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      if (refreshIcon) refreshIcon.classList.add('spinning');
      fetchMessages().finally(() => {
        setTimeout(() => {
          if (refreshIcon) refreshIcon.classList.remove('spinning');
        }, 500);
      });
    });
  }

  const resendBtn = document.getElementById('resendBtn');
  if (resendBtn) {
    resendBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'resend-latest-sms' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
        }
      });
    });
  }
});

function loadHeaderTitle() {
  chrome.storage.local.get(['phoneNumber'], (data) => {
    const titleEl = document.getElementById('systemPhone');
    if (titleEl && data.phoneNumber) {
      titleEl.textContent = data.phoneNumber;
    }
  });
}

async function fetchMessages() {
  const listContainer = document.getElementById('messagesList');
  
  return new Promise((resolve) => {
    chrome.storage.local.get(['token'], async (data) => {
      if (!data.token) {
        listContainer.innerHTML = `<div class="error">לא הוגדר טוקן. יש להגדיר טוקן במסך <a href="options.html" target="_blank">ההגדרות</a>.</div>`;
        resolve();
        return;
      }

      try {
        const url = `https://www.call2all.co.il/ym/api/GetIncomingSms?token=${encodeURIComponent(data.token)}&limit=10`;
        const res = await fetch(url);
        const result = await res.json();

        if (result && result.responseStatus === 'OK' && result.rows && result.rows.length > 0) {
          listContainer.innerHTML = '';
          result.rows.forEach(msg => {
            const card = document.createElement('div');
            card.className = 'msg-card';

            const header = document.createElement('div');
            header.className = 'msg-header';
            header.innerHTML = `<span class="msg-source">מאת: ${escapeHtml(msg.source || 'לא ידוע')}</span><span class="msg-date">${escapeHtml(msg.receive_date || '')}</span>`;
            card.appendChild(header);

            const body = document.createElement('div');
            body.className = 'msg-body';
            
            let text = escapeHtml(msg.message || '');
            const codeRegex = /\b(\d{5,8})\b/g;
            let extractedCode = null;
            
            text = text.replace(codeRegex, (match) => {
              extractedCode = match;
              return `<span class="highlight-code">${match}</span>`;
            });

            body.innerHTML = text;
            card.appendChild(body);

            const copyBtn = document.createElement('button');
            if (extractedCode) {
              copyBtn.className = 'btn-copy';
              copyBtn.textContent = `העתק קוד אימות (${extractedCode})`;
              copyBtn.onclick = () => {
                navigator.clipboard.writeText(extractedCode).then(() => {
                  copyBtn.textContent = 'הקוד הועתק בהצלחה! ✓';
                  setTimeout(() => copyBtn.textContent = `העתק קוד אימות (${extractedCode})`, 2000);
                });
              };
            } else {
              copyBtn.className = 'btn-copy secondary';
              copyBtn.textContent = 'העתק הודעה מלאה';
              copyBtn.onclick = () => {
                navigator.clipboard.writeText(msg.message || '').then(() => {
                  copyBtn.textContent = 'ההודעה הועתקה! ✓';
                  setTimeout(() => copyBtn.textContent = 'העתק הודעה מלאה', 2000);
                });
              };
            }
            card.appendChild(copyBtn);

            listContainer.appendChild(card);
          });
        } else {
          listContainer.innerHTML = `<div class="empty">אין הודעות להצגה או שהטוקן שגוי.</div>`;
        }
      } catch (err) {
        console.error(err);
        listContainer.innerHTML = `<div class="error">שגיאה בתקשורת מול שרתי ימות המשיח.</div>`;
      } finally {
        resolve();
      }
    });
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
// --- בלוק חדש: בדיקת עדכונים לתצוגת הבאנר ---
document.addEventListener('DOMContentLoaded', () => {
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