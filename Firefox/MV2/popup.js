document.addEventListener('DOMContentLoaded', function () {
    const statusText = document.getElementById('status-text');
    const convertBtn = document.getElementById('convert-btn');

    convertBtn.addEventListener('click', function () {
        statusText.textContent = 'Updating...';

        browser.tabs.query({ active: true, currentWindow: true })
            .then(tabs => {
                const tab = tabs[0];
                if (!tab || !tab.url || (!tab.url.includes('marstoy.com') && !tab.url.includes('marstoy.net'))) {
                    statusText.textContent = 'Not a Marstoy page.';
                    return;
                }
                return browser.tabs.sendMessage(tab.id, { action: 'convert' });
            })
            .then(response => {
                statusText.textContent = response ? response.status : 'Update complete!';
            })
            .catch(() => {
                statusText.textContent = 'Error — try reloading the page.';
            });
    });
});
