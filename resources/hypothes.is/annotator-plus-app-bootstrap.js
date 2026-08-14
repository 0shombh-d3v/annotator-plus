window.hypothesisConfig = () => ({
  apiUrl: 'https://hypothes.is/api/',
  assetRoot: 'https://cdn.hypothes.is/hypothesis/',
  authDomain: 'partner.org',
  oauthClientId: 'annotator-plus',
  rpcAllowedOrigins: ['app://obsidian.md'],
  websocketUrl: 'wss://h-websocket.hypothes.is/ws'
});

const script = document.createElement('script');
script.src = 'https://cdn.hypothes.is/hypothesis/build/boot.js';
document.head.append(script);
