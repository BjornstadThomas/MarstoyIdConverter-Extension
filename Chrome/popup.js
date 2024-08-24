document.addEventListener('DOMContentLoaded', function () {
    const statusText = document.getElementById('status-text');
    const convertBtn = document.getElementById('convert-btn');

    convertBtn.addEventListener('click', function () {
        statusText.textContent = 'Updating...';

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.executeScript(tabs[0].id, { file: 'content.js' }, () => {
                statusText.textContent = 'Update complete!';
            });
        });
    });
});
