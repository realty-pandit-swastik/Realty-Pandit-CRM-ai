document.getElementById('open').addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
    if (tabs[0]) await chrome.tabs.update(tabs[0].id, { active: true });
    else await chrome.tabs.create({ url: 'https://web.whatsapp.com/' });
    window.close();
});
