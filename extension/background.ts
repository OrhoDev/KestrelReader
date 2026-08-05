chrome.runtime.onInstalled.addListener(() => {
  console.log('KestrelReader Extension installed.');
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type !== 'EXTRACT_TEXT') return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (!activeTab?.id) {
      sendResponse({ text: '', title: '', author: '', error: 'No active tab found' });
      return;
    }

    const tabId = activeTab.id;

    chrome.scripting.executeScript(
      { target: { tabId }, files: ['extract.js'] },
      () => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
          sendResponse({ text: '', title: '', author: '', error: chrome.runtime.lastError.message });
          return;
        }

        chrome.scripting.executeScript(
          {
            target: { tabId },
            func: () => {
              const extractor = (window as Window & {
                __kestrelExtractArticle?: () => {
                  title: string;
                  author: string;
                  text: string;
                };
              }).__kestrelExtractArticle;
              return extractor?.() ?? {
                title: document.title || 'Web article',
                author: location.hostname,
                text: document.body?.innerText ?? '',
              };
            },
          },
          (results) => {
            if (chrome.runtime.lastError) {
              console.error(chrome.runtime.lastError);
              sendResponse({ text: '', title: '', author: '', error: chrome.runtime.lastError.message });
              return;
            }

            const article = results?.[0]?.result;
            if (article && typeof article.text === 'string' && article.text.trim().length > 0) {
              sendResponse({
                text: article.text,
                title: article.title || activeTab.title || 'Web article',
                author: article.author || activeTab.url ? new URL(activeTab.url!).hostname : 'Web page',
              });
            } else {
              sendResponse({ text: '', title: '', author: '' });
            }
          },
        );
      },
    );
  });

  return true;
});
