chrome.runtime.onInstalled.addListener(() => {
  console.log('KestrelReader Extension installed.');
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type !== 'EXTRACT_TEXT') return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (!activeTab?.id) {
      sendResponse({ text: '', error: 'No active tab found' });
      return;
    }

    const tabId = activeTab.id;

    chrome.scripting.executeScript(
      { target: { tabId }, files: ['extract.js'] },
      () => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
          sendResponse({ text: '', error: chrome.runtime.lastError.message });
          return;
        }

        chrome.scripting.executeScript(
          {
            target: { tabId },
            func: () => {
              const extractor = (window as Window & { __kestrelExtractArticle?: () => string })
                .__kestrelExtractArticle;
              return extractor?.() ?? document.body?.innerText ?? '';
            },
          },
          (results) => {
            if (chrome.runtime.lastError) {
              console.error(chrome.runtime.lastError);
              sendResponse({ text: '', error: chrome.runtime.lastError.message });
              return;
            }

            const text = results?.[0]?.result;
            if (typeof text === 'string' && text.trim().length > 0) {
              sendResponse({ text });
            } else {
              sendResponse({ text: '' });
            }
          },
        );
      },
    );
  });

  return true;
});
