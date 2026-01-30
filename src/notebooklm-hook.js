// Injected at document_start on notebooklm.google.com
// Purpose: capture batchexecute request bodies (rpcids + f.req) before app grabs fetch

(() => {
  const MAX = 50;
  const store = (entry) => {
    try {
      const list = (window.__NLM_BX_REQS__ ||= []);
      list.push(entry);
      if (list.length > MAX) list.shift();
    } catch (e) {}
  };

  const capture = (kind, url, init, bodyText) => {
    try {
      if (!url || !url.includes('/_/LabsTailwindUi/data/batchexecute')) return;
      const u = new URL(url, location.origin);
      const rpcids = u.searchParams.get('rpcids');
      const sourcePath = u.searchParams.get('source-path');
      store({
        ts: Date.now(),
        kind,
        rpcids,
        sourcePath,
        url: u.toString(),
        method: init?.method || 'GET',
        body: bodyText || null
      });
    } catch (e) {}
  };

  // Patch fetch
  const origFetch = window.fetch;
  window.fetch = function(input, init) {
    try {
      const url = typeof input === 'string' ? input : input?.url;
      let bodyText = null;
      const body = init?.body;
      if (typeof body === 'string') bodyText = body;
      capture('fetch', url, init, bodyText);
    } catch (e) {}
    return origFetch.apply(this, arguments);
  };

  // Patch XHR
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__nlm_method = method;
    this.__nlm_url = url;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(body) {
    try {
      const url = this.__nlm_url;
      let bodyText = null;
      if (typeof body === 'string') bodyText = body;
      capture('xhr', url, { method: this.__nlm_method }, bodyText);
    } catch (e) {}
    return origSend.apply(this, arguments);
  };

  console.log('[NLM Hook] installed');
})();
