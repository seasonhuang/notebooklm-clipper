// Popup Script - 直接导入版本

const elements = {
  connectionStatus: document.getElementById('connection-status'),
  pageTitle: document.getElementById('page-title'),
  charCount: document.getElementById('char-count'),
  contentPreview: document.getElementById('content-preview'),
  notebookSelect: document.getElementById('notebook-select'),
  refreshBtn: document.getElementById('refresh-btn'),
  createNewCheckbox: document.getElementById('create-new-checkbox'),
  newNotebook: document.getElementById('new-notebook'),
  newNotebookName: document.getElementById('new-notebook-name'),
  importBtn: document.getElementById('import-btn'),
  openNlmBtn: document.getElementById('open-nlm-btn'),
  copyBtn: document.getElementById('copy-btn'),
  status: document.getElementById('status'),
  includeImages: document.getElementById('include-images'),
  includeLinks: document.getElementById('include-links'),
  cleanMode: document.getElementById('clean-mode'),
};

let currentContent = null;
let isNotebookLMConnected = false;

// 显示状态消息
function showStatus(message, type = 'loading') {
  elements.status.innerHTML = message;
  elements.status.className = `status ${type}`;
  elements.status.classList.remove('hidden');
  
  if (type !== 'loading') {
    setTimeout(() => {
      elements.status.classList.add('hidden');
    }, 4000);
  }
}

function hideStatus() {
  elements.status.classList.add('hidden');
}

// 更新连接状态
function updateConnectionStatus(isConnected, message = '') {
  isNotebookLMConnected = isConnected;
  const icon = isConnected ? '✅' : '⚠️';
  const text = message || (isConnected ? 'NotebookLM 已连接' : '请先打开 NotebookLM');
  const className = isConnected ? 'status-bar connected' : 'status-bar disconnected';
  
  elements.connectionStatus.className = className;
  elements.connectionStatus.innerHTML = `
    <span class="status-icon">${icon}</span>
    <span class="status-text">${text}</span>
  `;
}

// 发送消息到 background
async function sendMessage(action, data = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, ...data }, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// 提取当前页面内容
async function extractContent() {
  const options = {
    includeImages: elements.includeImages.checked,
    includeLinks: elements.includeLinks.checked,
    cleanMode: elements.cleanMode.checked
  };
  
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs[0]) {
        reject(new Error('无法获取当前标签页'));
        return;
      }
      
      // 先尝试注入脚本
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ['src/content.js']
      }).then(() => {
        // 然后发送消息
        chrome.tabs.sendMessage(tabs[0].id, { action: 'extractContent', options }, response => {
          if (chrome.runtime.lastError) {
            reject(new Error('无法提取内容，请刷新页面重试'));
          } else if (response?.success) {
            resolve(response.data);
          } else {
            reject(new Error(response?.error || '提取失败'));
          }
        });
      }).catch(() => {
        // 脚本可能已存在，直接发送消息
        chrome.tabs.sendMessage(tabs[0].id, { action: 'extractContent', options }, response => {
          if (response?.success) {
            resolve(response.data);
          } else {
            reject(new Error(response?.error || '提取失败'));
          }
        });
      });
    });
  });
}

// 检查 NotebookLM 连接
async function checkConnection() {
  try {
    const response = await sendMessage('checkNotebookLM');
    updateConnectionStatus(response.isOpen);
    return response.isOpen;
  } catch (error) {
    updateConnectionStatus(false, '检查连接失败');
    return false;
  }
}

// 加载笔记本列表
async function loadNotebooks() {
  elements.notebookSelect.innerHTML = '<option value="">加载中...</option>';
  
  try {
    const response = await sendMessage('getNotebooks');
    const notebooks = response.notebooks || [];
    
    elements.notebookSelect.innerHTML = '';
    
    if (notebooks.length === 0) {
      elements.notebookSelect.innerHTML = `
        <option value="">-- 未找到笔记本 --</option>
        <option value="__current__">当前打开的笔记本</option>
      `;
    } else {
      elements.notebookSelect.innerHTML = '<option value="">-- 选择笔记本 --</option>';
      elements.notebookSelect.innerHTML += '<option value="__current__">当前打开的笔记本</option>';
      
      notebooks.forEach(nb => {
        const option = document.createElement('option');
        option.value = nb.id;
        option.textContent = nb.name || nb.id;
        elements.notebookSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error('加载笔记本失败:', error);
    elements.notebookSelect.innerHTML = `
      <option value="">-- 加载失败 --</option>
      <option value="__current__">当前打开的笔记本</option>
    `;
  }
}

// 执行导入
async function doImport() {
  if (!currentContent) {
    showStatus('没有可导入的内容', 'error');
    return;
  }

  const createNew = elements.createNewCheckbox.checked;
  const notebookId = elements.notebookSelect.value;
  const notebookName = elements.newNotebookName.value.trim();

  if (createNew && !notebookName) {
    showStatus('请输入新笔记本名称', 'error');
    return;
  }

  if (!createNew && !notebookId) {
    showStatus('请选择一个笔记本', 'error');
    return;
  }

  try {
    showStatus('⏳ 正在导入，请稍候...<br><small>将自动打开 NotebookLM 并添加内容</small>', 'loading');
    elements.importBtn.disabled = true;

    // 先保存待导入内容
    await sendMessage('setPendingImport', {
      content: currentContent.content,
      title: currentContent.title
    });

    // 执行导入
    const response = await sendMessage('importToNotebook', {
      notebookId: notebookId === '__current__' ? null : notebookId,
      content: currentContent.content,
      title: currentContent.title,
      createNew,
      notebookName
    });

    if (response.success) {
      showStatus('✅ 导入成功！', 'success');
      await sendMessage('clearPendingImport');
    } else {
      throw new Error(response.error || '导入失败');
    }
  } catch (error) {
    console.error('导入失败:', error);
    showStatus(`❌ ${error.message}<br><small>可尝试复制内容后手动粘贴</small>`, 'error');
  } finally {
    elements.importBtn.disabled = false;
  }
}

// 初始化
async function init() {
  // 1. 检查 NotebookLM 连接
  const isConnected = await checkConnection();
  
  // 2. 加载笔记本列表（不再依赖当前是否打开 NotebookLM tab）
  await loadNotebooks();
  if (!isConnected) {
    // 仅提示：导入时会自动打开 NotebookLM
    updateConnectionStatus(false, 'NotebookLM 未打开（导入时会自动打开）');
  }
  
  // 3. 提取当前页面内容
  try {
    showStatus('正在提取网页内容...', 'loading');
    currentContent = await extractContent();
    
    elements.pageTitle.textContent = currentContent.title || '无标题';
    elements.pageTitle.title = currentContent.title; // tooltip
    elements.charCount.textContent = `${currentContent.charCount.toLocaleString()} 字`;
    
    // 预览前500字
    const preview = currentContent.content.substring(0, 500);
    elements.contentPreview.textContent = preview + (currentContent.content.length > 500 ? '...' : '');
    
    hideStatus();
  } catch (error) {
    console.error('提取内容失败:', error);
    elements.pageTitle.textContent = '提取失败';
    elements.contentPreview.textContent = `错误: ${error.message}\n\n请刷新页面后重试。`;
    showStatus('提取内容失败: ' + error.message, 'error');
  }
}

// 事件绑定
elements.importBtn.addEventListener('click', doImport);

elements.openNlmBtn.addEventListener('click', async () => {
  try {
    await sendMessage('openNotebookLM');
    showStatus('正在打开 NotebookLM...', 'loading');
    
    // 延迟后刷新连接状态
    setTimeout(async () => {
      await checkConnection();
      await loadNotebooks();
      hideStatus();
    }, 3000);
  } catch (error) {
    showStatus('打开失败: ' + error.message, 'error');
  }
});

elements.copyBtn.addEventListener('click', async () => {
  if (!currentContent) {
    showStatus('没有可复制的内容', 'error');
    return;
  }
  
  try {
    await navigator.clipboard.writeText(currentContent.content);
    showStatus('✅ 已复制到剪贴板！', 'success');
  } catch (error) {
    const textarea = document.createElement('textarea');
    textarea.value = currentContent.content;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showStatus('✅ 已复制到剪贴板！', 'success');
  }
});

elements.refreshBtn.addEventListener('click', async () => {
  await checkConnection();
  if (isNotebookLMConnected) {
    await loadNotebooks();
    showStatus('已刷新', 'success');
  }
});

elements.createNewCheckbox.addEventListener('change', e => {
  if (e.target.checked) {
    elements.newNotebook.classList.remove('hidden');
    elements.notebookSelect.disabled = true;
  } else {
    elements.newNotebook.classList.add('hidden');
    elements.notebookSelect.disabled = false;
  }
});

// 设置变更时重新提取
[elements.includeImages, elements.includeLinks, elements.cleanMode].forEach(el => {
  el.addEventListener('change', async () => {
    try {
      showStatus('重新提取中...', 'loading');
      currentContent = await extractContent();
      elements.charCount.textContent = `${currentContent.charCount.toLocaleString()} 字`;
      elements.contentPreview.textContent = currentContent.content.substring(0, 500) + 
        (currentContent.content.length > 500 ? '...' : '');
      hideStatus();
    } catch (error) {
      showStatus('提取失败: ' + error.message, 'error');
    }
  });
});

// 启动
init();
