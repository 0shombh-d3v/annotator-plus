const { workerSrc, targetBase64 } = document.currentScript?.dataset ?? {};

if (!workerSrc || !targetBase64) throw new Error('Bundled PDF configuration is unavailable');

const offlineFetch = window.fetch;
window.fetch = (input, init) => offlineFetch(input instanceof URL ? input.href : input, init);

if (!Map.prototype.getOrInsertComputed) {
  Map.prototype.getOrInsertComputed = function (key, callback) {
    if (!this.has(key)) this.set(key, callback(key));
    return this.get(key);
  };
  Map.prototype.getOrInsert = function (key, value) {
    if (!this.has(key)) this.set(key, value);
    return this.get(key);
  };
}

parent.document.addEventListener('webviewerloaded', () => {
  const options = window.PDFViewerApplicationOptions;
  let target = '';
  try {
    target = decodeURIComponent(escape(atob(targetBase64)));
  } catch {}
  options.set('disablePreferences', true);
  options.set('defaultUrl', target);
  options.set('workerSrc', workerSrc);
  options.set('enableScripting', false);
  options.set('enableAltTextModelDownload', false);
  options.set('enableGuessAltText', false);
  options.set('enableWebGPU', false);
}, { once: true });

document.addEventListener('DOMContentLoaded', async () => {
  await window.PDFViewerApplication.initializedPromise;
  const script = document.createElement('script');
  script.src = 'https://cdn.hypothes.is/hypothesis/build/boot.js';
  document.head.append(script);
}, { once: true });

window.hypothesisConfig = () => ({
  appType: 'via',
  openSidebar: true,
  showHighlights: 'always',
  assetRoot: 'https://cdn.hypothes.is/hypothesis/',
  sidebarAppUrl: 'app://obsidian.md/annotator-plus/sidebar.html',
  notebookAppUrl: 'app://obsidian.md/annotator-plus/sidebar.html',
  profileAppUrl: 'app://obsidian.md/annotator-plus/sidebar.html',
  services: [{
    apiUrl: 'https://hypothes.is/api/',
    authority: 'partner.org',
    groups: ['__world__'],
    allowFlagging: false,
    allowLeavingGroups: false,
    enableShareLinks: false,
    enableShareImportExportPanel: false,
    enableAccountMenu: false,
    enableHelpPanel: false
  }]
});
