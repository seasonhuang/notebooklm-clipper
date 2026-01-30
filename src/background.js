// Background Service Worker

// 存储待导入的内容
let pendingImport = null;

function extractToken(name, html) {
  const re = new RegExp('"' + name + '":"([^"]+)"');
  const m = re.exec(html);
  return m ? m[1] : null;
}

async function getNotebookLmTokens() {
  // 参考 youtube-to-notebooklm：先 GET 主页拿到 bl(cfb2h) + at(SNlM0e)
  const home = await fetch('https://notebooklm.google.com/?pageId=none', {
    redirect: 'error',
    credentials: 'include'
  });
  if (!home.ok) throw new Error('NotebookLM 未授权/未登录');
  const html = await home.text();
  const bl = extractToken('cfb2h', html);
  const at = extractToken('SNlM0e', html);
  if (!bl || !at) throw new Error('无法获取 NotebookLM token（可能未登录）');
  return { bl, at };
}

function parseBatchexecuteText(text) {
  // batchexecute 返回是多行，第四行一般是 JSON payload
  const line = text.split('\n').find(l => l.startsWith('[[')) || text.split('\n')[3];
  if (!line) throw new Error('解析 batchexecute 响应失败（格式变化）');
  return JSON.parse(line);
}

async function callBatchexecute({ rpcid, sourcePath, payload, bl, at }) {
  const url = new URL('https://notebooklm.google.com/_/LabsTailwindUi/data/batchexecute');
  const reqid = (Math.floor(9e5 * Math.random()) + 1e5).toString();

  url.searchParams.set('rpcids', rpcid);
  url.searchParams.set('source-path', sourcePath);
  url.searchParams.set('bl', bl);
  url.searchParams.set('_reqid', reqid);
  url.searchParams.set('rt', 'c');

  const body = new URLSearchParams({
    'f.req': JSON.stringify([[[rpcid, JSON.stringify(payload), null, 'generic']]]),
    at
  }).toString();

  const res = await fetch(url.toString(), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body
  });

  if (!res.ok) throw new Error(`batchexecute(${rpcid}) 失败`);
  const text = await res.text();
  return parseBatchexecuteText(text);
}

async function fetchNotebookList() {
  const { bl, at } = await getNotebookLmTokens();

  const rpcid = 'wXbhsf';
  const payload = [null, 1, null, [2]];
  const resp = await callBatchexecute({ rpcid, sourcePath: '/', payload, bl, at });

  const data = JSON.parse(resp[0][2]);
  const list = (data?.[0] || [])
    .filter(item => {
      if (!item || item.length < 6) return false;
      const flags = item[5];
      return !(Array.isArray(flags) && flags.length > 0 && flags[0] === 3);
    })
    .map(item => {
      const name = (item?.[0] || 'Untitled notebook').trim();
      const sources = item?.[1] ? item[1].length : 0;
      const id = item?.[2];
      const emoji = item?.[3] || '📔';
      return { id, name, sources, emoji };
    })
    .filter(x => x.id);

  return list;
}

async function createNotebookViaRpc(name) {
  const { bl, at } = await getNotebookLmTokens();
  const rpcid = 'CCqFvf';
  const resp = await callBatchexecute({ rpcid, sourcePath: '/', payload: [name], bl, at });
  const text = resp?.[0]?.[2];
  const ids = (text && text.match(/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g)) || [];
  const id = ids[0];
  if (!id) throw new Error('创建笔记本失败（未返回 id）');
  return id;
}

async function addCopiedTextViaRpc({ notebookId, text, title }) {
  const { bl, at } = await getNotebookLmTokens();

  // izAoDd payload 结构（你抓到的）：
  // [
  //   [ [ null, ["<title>", "<text>"], null, 2, null, null, null, null, null, 1 ] ],
  //   "<notebookId>",
  //   [2],
  //   [1, null, null, null, null, null, null, null, null, null, [1]]
  // ]
  // 第一个字符串是来源标题，第二个是内容
  const label = title || '粘贴的文字';
  const sourceItem = [null, [label, text], null, 2, null, null, null, null, null, null, 1];
  const sources = [sourceItem];
  const meta = [1, null, null, null, null, null, null, null, null, null, [1]];
  const payload = [sources, notebookId, [2], meta];

  const rpcid = 'izAoDd';
  await callBatchexecute({ rpcid, sourcePath: `/notebook/${notebookId}`, payload, bl, at });

  return true;
}

// 查找或打开 NotebookLM 标签页
async function getNotebookLMTab() {
  const tabs = await chrome.tabs.query({ url: 'https://notebooklm.google.com/*' });
  if (tabs.length > 0) {
    return tabs[0];
  }
  return null;
}

// 打开 NotebookLM
async function openNotebookLM(notebookId = null) {
  let url = 'https://notebooklm.google.com/';
  if (notebookId) {
    url = `https://notebooklm.google.com/notebook/${notebookId}`;
  }
  
  const existingTab = await getNotebookLMTab();
  if (existingTab) {
    await chrome.tabs.update(existingTab.id, { url, active: true });
    return existingTab;
  } else {
    return await chrome.tabs.create({ url, active: true });
  }
}

// 发送消息到 NotebookLM 标签页
async function sendToNotebookLM(action, data) {
  const tab = await getNotebookLMTab();
  if (!tab) {
    throw new Error('请先打开 NotebookLM 页面');
  }
  
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, { action, ...data }, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.success) {
        resolve(response);
      } else {
        reject(new Error(response?.error || '操作失败'));
      }
    });
  });
}

// 消息处理
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender)
    .then(sendResponse)
    .catch(error => sendResponse({ success: false, error: error.message }));
  return true;
});

async function handleMessage(request, sender) {
  switch (request.action) {
    case 'checkNotebookLM': {
      const tab = await getNotebookLMTab();
      return { 
        success: true, 
        isOpen: !!tab,
        tabId: tab?.id,
        url: tab?.url
      };
    }

    case 'openNotebookLM': {
      const tab = await openNotebookLM(request.notebookId);
      return { success: true, tabId: tab.id };
    }

    case 'getNotebooks': {
      // 优先：直接调用 NotebookLM 的 batchexecute RPC 拉取列表（不依赖当前打开的 tab）
      try {
        const notebooks = await fetchNotebookList();
        await chrome.storage.local.set({ notebooksCache: { ts: Date.now(), notebooks } });
        return { success: true, notebooks };
      } catch (error) {
        // 兜底：返回缓存
        const cached = await chrome.storage.local.get('notebooksCache');
        if (cached?.notebooksCache?.notebooks?.length) {
          return { success: true, notebooks: cached.notebooksCache.notebooks, warning: error.message };
        }
        // 再兜底：如果用户正好打开了 NotebookLM，就从 DOM 抓（老逻辑）
        try {
          const response = await sendToNotebookLM('getNotebooks');
          return { success: true, notebooks: response.notebooks || [], warning: 'fallback-dom' };
        } catch (e) {
          return { success: false, error: error.message, notebooks: [] };
        }
      }
    }

    case 'setPendingImport': {
      pendingImport = {
        content: request.content,
        title: request.title,
        timestamp: Date.now()
      };
      await chrome.storage.local.set({ pendingImport });
      return { success: true };
    }

    case 'getPendingImport': {
      const stored = await chrome.storage.local.get('pendingImport');
      return { success: true, data: stored.pendingImport || pendingImport };
    }

    case 'clearPendingImport': {
      pendingImport = null;
      await chrome.storage.local.remove('pendingImport');
      return { success: true };
    }

    case 'dumpNotebookLMLogs': {
      const tab = await getNotebookLMTab();
      if (!tab) throw new Error('请先打开 NotebookLM（用于读取日志）');
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/notebooklm-injector.js'] });
      } catch (e) {}
      const res = await sendToNotebookLM('dumpLogs', {});
      return { success: true, logs: res.logs || [] };
    }

    case 'dumpBatchexecute': {
      const tab = await getNotebookLMTab();
      if (!tab) throw new Error('请先打开 NotebookLM（用于抓请求）');
      // hook 必须 document_start，所以这里只读
      const res = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, { action: 'dumpBatchexecute' }, r => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(r);
        });
      });
      return { success: true, data: res?.data || null };
    }

    case 'importToNotebook': {
      const { notebookId, content, title, createNew, notebookName } = request;

      // ✅ 请求层实现：不依赖 DOM，不依赖当前打开的是哪个 notebook tab
      try {
        let targetNotebookId = notebookId;
        if (createNew) {
          targetNotebookId = await createNotebookViaRpc(notebookName);
        }
        if (!targetNotebookId) {
          throw new Error('缺少 notebookId（请选择笔记本或创建新的）');
        }

        // 导入：走 izAoDd
        await addCopiedTextViaRpc({ notebookId: targetNotebookId, text: content, title });

        return {
          success: true,
          notebookId: targetNotebookId,
          url: `https://notebooklm.google.com/notebook/${targetNotebookId}`
        };
      } catch (error) {
        // 兜底：如果用户已经打开了 NotebookLM，我们仍可尝试 DOM 方式
        try {
          const tab = await openNotebookLM(notebookId);
          await new Promise(r => setTimeout(r, 2500));
          try {
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/notebooklm-injector.js'] });
          } catch (e) {}
          await new Promise(r => setTimeout(r, 800));
          if (createNew) {
            return await sendToNotebookLM('createAndAdd', { notebookName, content, title });
          }
          return await sendToNotebookLM('addCopiedText', { content, title });
        } catch (e2) {
          return { success: false, error: error.message };
        }
      }
    }

    default:
      throw new Error(`未知操作: ${request.action}`);
  }
}

// 监听标签页更新，用于在 NotebookLM 加载后执行待处理的导入
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && 
      tab.url?.startsWith('https://notebooklm.google.com/')) {
    
    // 检查是否有待处理的导入
    const stored = await chrome.storage.local.get('pendingImport');
    if (stored.pendingImport && Date.now() - stored.pendingImport.timestamp < 60000) {
      console.log('检测到待处理的导入，执行中...');
      
      // 等待页面完全加载
      await new Promise(r => setTimeout(r, 3000));
      
      // 尝试发送消息
      try {
        const result = await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, {
            action: 'addSource',
            content: stored.pendingImport.content,
            title: stored.pendingImport.title
          }, response => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });
        
        if (result?.success) {
          await chrome.storage.local.remove('pendingImport');
          // 可选：通知用户
          chrome.notifications?.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'NotebookLM Clipper',
            message: '内容已成功导入！'
          });
        }
      } catch (error) {
        console.error('自动导入失败:', error);
      }
    }
  }
});

// 初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('NotebookLM Clipper 已安装');
});
