// NotebookLM 页面注入脚本 - 模拟用户操作实现直接导入

class NotebookLMInjector {
  constructor() {
    this.notebooks = [];
    this._logs = [];
    this.init();
  }

  log(...args) {
    const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    const entry = {
      ts: new Date().toISOString(),
      url: location.href,
      msg
    };
    this._logs.push(entry);
    if (this._logs.length > 200) this._logs.shift();
    console.log('[Clipper]', ...args);
  }

  init() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true;
    });

    // 页面加载后提取笔记本列表
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => this.extractNotebooks(), 2000);
      });
    } else {
      setTimeout(() => this.extractNotebooks(), 2000);
    }
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'getNotebooks':
          const notebooks = await this.extractNotebooks();
          sendResponse({ success: true, notebooks });
          break;

        case 'selectNotebook':
          const selectResult = await this.selectNotebook(request.notebookId);
          sendResponse(selectResult);
          break;

        case 'addSource':
          const addResult = await this.addSource(request.content, request.title);
          sendResponse(addResult);
          break;

        case 'addCopiedText':
          const pasted = await this.addCopiedText(request.content, request.title);
          sendResponse(pasted);
          break;

        case 'createAndAdd':
          const createResult = await this.createNotebookAndAddSource(
            request.notebookName,
            request.content,
            request.title
          );
          sendResponse(createResult);
          break;

        case 'dumpLogs':
          sendResponse({ success: true, logs: this._logs });
          break;

        case 'dumpBatchexecute':
          // return captured batchexecute requests from hook (page world)
          sendResponse({ success: true, data: window.__NLM_BX_REQS__ || [] });
          break;

        default:
          sendResponse({ success: false, error: '未知操作' });
      }
    } catch (error) {
      console.error('NotebookLM 注入脚本错误:', error);
      this.log('ERROR', error?.message || String(error));
      sendResponse({ success: false, error: error.message });
    }
  }

  // 等待元素出现
  async waitForElement(selector, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const element = document.querySelector(selector);
      if (element && element.offsetParent !== null) {
        return element;
      }
      await new Promise(r => setTimeout(r, 200));
    }
    return null;
  }

  // 等待多个可能的选择器
  async waitForAnyElement(selectors, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.offsetParent !== null) {
          return element;
        }
      }
      await new Promise(r => setTimeout(r, 200));
    }
    return null;
  }

  // 模拟点击
  click(element) {
    if (!element) return false;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.click();
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return true;
  }

  // 模拟输入
  async typeText(element, text) {
    if (!element) return false;
    element.focus();
    
    // 清空现有内容
    element.value = '';
    element.textContent = '';
    
    // 逐字符输入（更真实）
    for (const char of text) {
      element.value += char;
      element.textContent += char;
      element.dispatchEvent(new InputEvent('input', { bubbles: true, data: char }));
      await new Promise(r => setTimeout(r, 10));
    }
    
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // 提取笔记本列表
  async extractNotebooks() {
    try {
      this.log('开始提取笔记本列表...');
      await new Promise(r => setTimeout(r, 800));

      // 0) 如果当前就在某个 notebook 页面，至少返回当前 notebook
      const currentMatch = location.href.match(/\/notebook\/([^/?#]+)/);
      if (currentMatch) {
        const id = currentMatch[1];
        const name = this.cleanNotebookName((document.title || '当前笔记本').replace(/-\s*NotebookLM\s*$/i, '').trim());
        const current = [{ id, name: name || '当前笔记本', href: location.href }];
        this.notebooks = current;
        this.log('检测到当前 notebook 页面，返回当前 notebook:', { id, name });
        return current;
      }

      const notebooks = [];

      // 1) NotebookLM 的列表卡片：button.primary-action-button
      // 关键：aria-labelledby 形如 "project-<uuid>-title project-<uuid>-emoji"
      // 对应的标题元素 id="project-<uuid>-title"，uuid 就是 notebookId
      const collectFromDom = () => {
        const btns = Array.from(document.querySelectorAll('button.primary-action-button'));
        this.log('扫描 button.primary-action-button 数量:', btns.length);
        for (const btn of btns) {
          const lbl = btn.getAttribute('aria-labelledby') || '';
          const m = lbl.match(/project-([a-f0-9\-]{16,})-title/i);
          const id = m ? m[1] : null;
          if (!id) continue;
          const titleEl = document.getElementById(`project-${id}-title`);
          const emojiEl = document.getElementById(`project-${id}-emoji`);
          const title = this.cleanNotebookName((titleEl?.textContent || '').trim());
          const emoji = (emojiEl?.textContent || '').trim();
          const name = (title ? (emoji ? `${title} ${emoji}` : title) : `Notebook ${id.slice(0, 6)}`).trim();
          notebooks.push({
            id,
            name,
            href: `https://notebooklm.google.com/notebook/${id}`,
            element: btn
          });
        }
      };

      // 为了拿全量：尝试滚动加载更多（最多 6 次）
      const scroller = document.scrollingElement || document.documentElement;
      let lastCount = -1;
      for (let i = 0; i < 6; i++) {
        collectFromDom();
        const uniqueSoFar = notebooks.filter((n, idx, arr) => arr.findIndex(x => x.id === n.id) === idx);
        if (uniqueSoFar.length === lastCount) {
          this.log('滚动后数量未增加，停止滚动');
          break;
        }
        lastCount = uniqueSoFar.length;
        // 滚动到底
        scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'instant' });
        await new Promise(r => setTimeout(r, 800));
      }

      // 2) 兜底：如果以后 NotebookLM 改掉 class，再尝试抓所有 button 上的 aria-labelledby=project-xxx-title
      if (notebooks.length === 0) {
        const anyBtns = Array.from(document.querySelectorAll('button[aria-labelledby*="project-"]'));
        this.log('兜底扫描 button[aria-labelledby*="project-"] 数量:', anyBtns.length);
        for (const btn of anyBtns) {
          const lbl = btn.getAttribute('aria-labelledby') || '';
          const m = lbl.match(/project-([a-f0-9\-]{16,})-title/i);
          const id = m ? m[1] : null;
          if (!id) continue;
          const titleEl = document.getElementById(`project-${id}-title`);
          const title = this.cleanNotebookName((titleEl?.textContent || '').trim());
          notebooks.push({ id, name: title || `Notebook ${id.slice(0,6)}`, href: `https://notebooklm.google.com/notebook/${id}`, element: btn });
        }
      }

      // 去重（按 id）
      const unique = notebooks.filter((n, i, arr) => arr.findIndex(x => x.id === n.id) === i);

      this.notebooks = unique;
      this.log('提取完成，notebooks 数量:', unique.length, '示例:', unique.slice(0, 5).map(n => ({ id: n.id, name: n.name })));
      return unique;
    } catch (error) {
      this.log('提取笔记本失败:', error?.message || String(error));
      return [];
    }
  }

  // 清理笔记本名称
  cleanNotebookName(name) {
    return name
      .replace(/\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/gi, '')
      .replace(/\d+\s+sources?/gi, '')
      .replace(/Most recent|arrow_drop_down|See all|chevron_right|more_vert/gi, '')
      .replace(/^public/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // 选择/打开某个笔记本
  async selectNotebook(notebookId) {
    try {
      console.log(`[Clipper] 选择笔记本: ${notebookId}`);
      
      // 方法1: 直接导航
      if (notebookId.startsWith('http')) {
        window.location.href = notebookId;
      } else {
        window.location.href = `https://notebooklm.google.com/notebook/${notebookId}`;
      }
      
      await new Promise(r => setTimeout(r, 3000));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 添加来源到当前笔记本（旧逻辑：弹窗里“网站/文档”等，保留作兜底）
  async addSource(content, title) {
    try {
      this.log(`添加来源(legacy): ${title}`);
      
      // 1. 找到 "添加来源" 按钮
      const addSourceBtnSelectors = [
        'button[aria-label*="Add source"]',
        'button[aria-label*="添加来源"]',
        'button[aria-label*="Add"]',
        '[data-testid*="add-source"]',
        'button:has(span:contains("Add"))',
        '.add-source-button',
        '[class*="add"][class*="source"]'
      ];

      let addBtn = await this.waitForAnyElement(addSourceBtnSelectors, 5000);
      
      // 备用方案：找包含 "+" 或 "Add" 文字的按钮
      if (!addBtn) {
        const buttons = document.querySelectorAll('button, [role="button"]');
        for (const btn of buttons) {
          const text = btn.textContent?.toLowerCase() || '';
          const label = btn.getAttribute('aria-label')?.toLowerCase() || '';
          if (text.includes('add') || text.includes('source') || 
              label.includes('add') || label.includes('source') ||
              text === '+') {
            addBtn = btn;
            break;
          }
        }
      }

      if (!addBtn) {
        throw new Error('找不到"添加来源"按钮');
      }

      console.log('[Clipper] 点击添加来源按钮');
      this.click(addBtn);
      await new Promise(r => setTimeout(r, 1500));

      // 2. 找到 "粘贴文本" 选项
      const pasteTextSelectors = [
        'button[aria-label*="Paste text"]',
        'button[aria-label*="粘贴文本"]',
        'button[aria-label*="Copied text"]',
        '[data-testid*="paste"]',
        '[data-testid*="text"]'
      ];

      let pasteBtn = await this.waitForAnyElement(pasteTextSelectors, 5000);
      
      if (!pasteBtn) {
        const items = document.querySelectorAll('[role="menuitem"], [role="option"], button, [role="button"]');
        for (const item of items) {
          const text = item.textContent?.toLowerCase() || '';
          if (text.includes('paste') || text.includes('text') || 
              text.includes('粘贴') || text.includes('文本') ||
              text.includes('copied')) {
            pasteBtn = item;
            break;
          }
        }
      }

      if (!pasteBtn) {
        // 可能直接是一个文本输入框
        console.log('[Clipper] 尝试直接查找文本输入区域');
      } else {
        console.log('[Clipper] 点击粘贴文本选项');
        this.click(pasteBtn);
        await new Promise(r => setTimeout(r, 1000));
      }

      // 3. 找到文本输入区域
      const textInputSelectors = [
        'textarea',
        '[contenteditable="true"]',
        'input[type="text"]',
        '[role="textbox"]',
        '.text-input',
        '[class*="input"]'
      ];

      const textInput = await this.waitForAnyElement(textInputSelectors, 5000);

      if (!textInput) {
        throw new Error('找不到文本输入区域');
      }

      console.log('[Clipper] 输入内容');
      
      // 输入内容
      if (textInput.tagName === 'TEXTAREA' || textInput.tagName === 'INPUT') {
        textInput.focus();
        textInput.value = content;
        textInput.dispatchEvent(new Event('input', { bubbles: true }));
        textInput.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // contenteditable
        textInput.focus();
        textInput.innerHTML = content.replace(/\n/g, '<br>');
        textInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }

      await new Promise(r => setTimeout(r, 500));

      // 4. 找到标题输入框（如果有）
      const titleInputSelectors = [
        'input[placeholder*="title"]',
        'input[placeholder*="name"]',
        'input[placeholder*="标题"]',
        'input[aria-label*="title"]',
        'input[aria-label*="name"]'
      ];

      const titleInput = await this.waitForAnyElement(titleInputSelectors, 2000);
      if (titleInput) {
        console.log('[Clipper] 输入标题');
        titleInput.focus();
        titleInput.value = title;
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      await new Promise(r => setTimeout(r, 500));

      // 5. 点击确认/保存/插入按钮
      const confirmBtnSelectors = [
        'button[type="submit"]',
        'button[aria-label*="Insert"]',
        'button[aria-label*="Save"]',
        'button[aria-label*="Add"]',
        'button[aria-label*="确定"]',
        'button[aria-label*="插入"]',
        'button[aria-label*="保存"]'
      ];

      let confirmBtn = await this.waitForAnyElement(confirmBtnSelectors, 3000);
      
      if (!confirmBtn) {
        const buttons = document.querySelectorAll('button, [role="button"]');
        for (const btn of buttons) {
          const text = btn.textContent?.toLowerCase() || '';
          if (text.includes('insert') || text.includes('save') || 
              text.includes('add') || text.includes('ok') ||
              text.includes('插入') || text.includes('保存') ||
              text.includes('确定') || text.includes('添加')) {
            confirmBtn = btn;
            break;
          }
        }
      }

      if (confirmBtn) {
        console.log('[Clipper] 点击确认按钮');
        this.click(confirmBtn);
        await new Promise(r => setTimeout(r, 2000));
      }

      return { success: true, message: '来源添加成功！' };
    } catch (error) {
      console.error('[Clipper] 添加来源失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 更稳定：走「添加来源」→「复制的文字」→ 粘贴 →「插入」
  async addCopiedText(content, title) {
    try {
      this.log(`addCopiedText: ${title}`);

      // 1) 点击左侧「添加来源」按钮
      const addBtn = await this.waitForAnyElement([
        'button[aria-label="添加来源"]',
        'button[aria-label*="Add source"]'
      ], 6000);
      if (!addBtn) throw new Error('找不到「添加来源」按钮');
      this.click(addBtn);
      await new Promise(r => setTimeout(r, 800));

      // 2) 先定位“选择来源类型”的 dialog（包含：网站/云端硬盘/复制的文字）
      const findChooserDialog = () => {
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog'));
        for (const d of dialogs) {
          const txt = (d.textContent || '');
          if (txt.includes('网站') && txt.includes('云端硬盘') && txt.includes('复制的文字')) return d;
        }
        return null;
      };

      const waitFor = async (fn, timeout = 6000) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
          const v = fn();
          if (v) return v;
          await new Promise(r => setTimeout(r, 200));
        }
        return null;
      };

      const chooserDialog = await waitFor(findChooserDialog, 6000);
      if (!chooserDialog) throw new Error('未找到「添加来源」选择器弹窗');

      // 3) 在 chooserDialog 内点击「复制的文字」
      let copied = chooserDialog.querySelector('button[aria-label="复制的文字"]');
      if (!copied) {
        const btns = Array.from(chooserDialog.querySelectorAll('button'));
        copied = btns.find(b => (b.textContent || '').includes('复制的文字'));
      }
      if (!copied) throw new Error('找不到「复制的文字」入口');
      this.click(copied);
      await new Promise(r => setTimeout(r, 600));

      // 3) 找到「粘贴复制的文字」弹窗里的输入框（避免误选到“在网络中搜索新来源”）
      const findPasteDialog = () => {
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog'));
        for (const d of dialogs) {
          const txt = (d.textContent || '');
          if (txt.includes('粘贴复制的文字') || (txt.includes('粘贴') && txt.includes('文字') && txt.includes('插入'))) return d;
        }
        return null;
      };

      const dialog = await waitFor(findPasteDialog, 8000);
      if (!dialog) throw new Error('未找到「粘贴复制的文字」弹窗');
      this.log('找到粘贴弹窗');

      // 优先匹配 aria-label=粘贴的文字 的 textarea
      let textbox = dialog.querySelector('textarea[aria-label="粘贴的文字"]') ||
                    dialog.querySelector('[role="textbox"][aria-label="粘贴的文字"]');

      if (!textbox) {
        // 兜底：在 dialog 内找 textarea（但要排除“在网络中搜索新来源”）
        const candidates = Array.from(dialog.querySelectorAll('textarea, [role="textbox"]'));
        textbox = candidates.find(el => {
          const aria = el.getAttribute('aria-label') || '';
          return !aria.includes('搜索') && !aria.includes('search');
        }) || candidates[0];
      }

      if (!textbox) throw new Error('找不到「粘贴的文字」输入框');
      this.log('选择输入框 aria-label=', textbox.getAttribute('aria-label'));

      // 4) 设置值 + 触发 input（Angular/Material 必要）
      const setValue = (el, value) => {
        el.focus();
        const proto = Object.getPrototypeOf(el);
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) desc.set.call(el, value);
        else el.value = value;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };

      setValue(textbox, content);
      await new Promise(r => setTimeout(r, 200));

      // 5) 点击「插入」（必须在弹窗里找，避免误点页面其他按钮）
      let insertBtn = Array.from(dialog.querySelectorAll('button')).find(b => (b.textContent || '').trim() === '插入');
      if (!insertBtn) insertBtn = dialog.querySelector('button[type="submit"]');
      if (!insertBtn) throw new Error('找不到「插入」按钮');

      // 若仍 disabled，等一下再点
      for (let i = 0; i < 20 && (insertBtn.disabled || insertBtn.getAttribute('aria-disabled') === 'true'); i++) {
        await new Promise(r => setTimeout(r, 200));
      }
      this.log('插入按钮 disabled=', insertBtn.disabled);
      this.click(insertBtn);
      await new Promise(r => setTimeout(r, 1200));

      return { success: true, message: '已通过「复制的文字」导入' };
    } catch (e) {
      this.log('addCopiedText failed:', e?.message || String(e));
      return { success: false, error: e?.message || String(e) };
    }
  }

  // 创建新笔记本并添加来源
  async createNotebookAndAddSource(notebookName, content, title) {
    try {
      console.log(`[Clipper] 创建新笔记本: ${notebookName}`);

      // 1. 找到创建按钮
      const createBtnSelectors = [
        'button[aria-label*="Create"]',
        'button[aria-label*="New"]',
        'button[aria-label*="创建"]',
        'button[aria-label*="新建"]',
        '[data-testid*="create"]',
        '[data-testid*="new"]'
      ];

      let createBtn = await this.waitForAnyElement(createBtnSelectors, 5000);
      
      if (!createBtn) {
        const buttons = document.querySelectorAll('button, [role="button"]');
        for (const btn of buttons) {
          const text = btn.textContent?.toLowerCase() || '';
          const label = btn.getAttribute('aria-label')?.toLowerCase() || '';
          if (text.includes('create') || text.includes('new') ||
              label.includes('create') || label.includes('new') ||
              text.includes('创建') || text.includes('新建') ||
              text === '+') {
            createBtn = btn;
            break;
          }
        }
      }

      if (!createBtn) {
        throw new Error('找不到"创建笔记本"按钮');
      }

      console.log('[Clipper] 点击创建按钮');
      this.click(createBtn);
      await new Promise(r => setTimeout(r, 2000));

      // 2. 输入笔记本名称（如果有输入框）
      const nameInputSelectors = [
        'input[placeholder*="name"]',
        'input[placeholder*="title"]',
        'input[placeholder*="名称"]',
        'input[aria-label*="name"]',
        'input[type="text"]',
        'textarea'
      ];

      const nameInput = await this.waitForAnyElement(nameInputSelectors, 3000);
      if (nameInput) {
        console.log('[Clipper] 输入笔记本名称');
        await this.typeText(nameInput, notebookName);
        await new Promise(r => setTimeout(r, 500));

        // 点击确认创建
        const confirmBtn = document.querySelector('button[type="submit"]') ||
          [...document.querySelectorAll('button')].find(b => 
            b.textContent?.toLowerCase().includes('create') ||
            b.textContent?.toLowerCase().includes('ok') ||
            b.textContent?.includes('创建') ||
            b.textContent?.includes('确定')
          );
        
        if (confirmBtn) {
          this.click(confirmBtn);
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      // 3. 等待进入新笔记本页面
      await new Promise(r => setTimeout(r, 2000));

      // 4. 添加来源
      return await this.addSource(content, title);

    } catch (error) {
      console.error('[Clipper] 创建笔记本失败:', error);
      return { success: false, error: error.message };
    }
  }
}

// 初始化
new NotebookLMInjector();
console.log('[Clipper] NotebookLM 注入脚本已加载');
