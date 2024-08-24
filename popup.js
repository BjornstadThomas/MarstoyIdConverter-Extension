document.getElementById('updateTitles').addEventListener('click', () => {
  document.getElementById('status').textContent = 'Status: Updating...';

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.executeScript(tabs[0].id, { file: 'content.js' }, () => {
      document.getElementById('status').textContent = 'Status: Update complete!';
    });
  });
});
