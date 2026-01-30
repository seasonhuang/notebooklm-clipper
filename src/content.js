// Content Script - 提取网页内容

/**
 * 提取网页的主要内容
 */
function extractPageContent(options = {}) {
  const { includeImages = true, includeLinks = true, cleanMode = false } = options;
  
  const title = document.title || '';
  const url = window.location.href;
  const hostname = window.location.hostname;
  
  let content = '';
  let textContent = '';
  
  // 尝试找到主要内容区域
  const mainSelectors = [
    'article',
    '[role="main"]',
    'main',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.content',
    '#content',
    '.post',
    '.article'
  ];
  
  let mainElement = null;
  for (const selector of mainSelectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent.trim().length > 200) {
      mainElement = el;
      break;
    }
  }
  
  // 如果没找到主内容，使用 body
  if (!mainElement) {
    mainElement = document.body;
  }
  
  // 克隆元素以便处理
  const clone = mainElement.cloneNode(true);
  
  // 移除不需要的元素
  const removeSelectors = [
    'script', 'style', 'noscript', 'iframe', 'svg',
    'nav', 'header', 'footer', 'aside',
    '.sidebar', '.nav', '.menu', '.advertisement', '.ad',
    '.comments', '.comment', '.related', '.share',
    '[role="navigation"]', '[role="banner"]', '[role="complementary"]'
  ];
  
  removeSelectors.forEach(selector => {
    clone.querySelectorAll(selector).forEach(el => el.remove());
  });
  
  if (cleanMode) {
    // 简洁模式：只提取纯文本
    textContent = clone.textContent
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
    
    content = `# ${title}\n\n来源: ${url}\n\n---\n\n${textContent}`;
  } else {
    // 完整模式：保留结构
    content = convertToMarkdown(clone, { includeImages, includeLinks });
    content = `# ${title}\n\n来源: ${url}\n\n---\n\n${content}`;
  }
  
  // 特殊处理 X/Twitter
  if (hostname.includes('x.com') || hostname.includes('twitter.com')) {
    content = extractTwitterContent();
  }
  
  return {
    title,
    url,
    hostname,
    content: content.trim(),
    charCount: content.length,
    extractedAt: new Date().toISOString()
  };
}

/**
 * 将 HTML 转换为 Markdown
 */
function convertToMarkdown(element, options = {}) {
  const { includeImages, includeLinks } = options;
  let markdown = '';
  
  function processNode(node, depth = 0) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.replace(/\s+/g, ' ');
      return text;
    }
    
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    
    const tag = node.tagName.toLowerCase();
    let result = '';
    
    switch (tag) {
      case 'h1':
        result = `\n\n# ${getTextContent(node)}\n\n`;
        break;
      case 'h2':
        result = `\n\n## ${getTextContent(node)}\n\n`;
        break;
      case 'h3':
        result = `\n\n### ${getTextContent(node)}\n\n`;
        break;
      case 'h4':
      case 'h5':
      case 'h6':
        result = `\n\n#### ${getTextContent(node)}\n\n`;
        break;
      case 'p':
        result = `\n\n${processChildren(node)}\n\n`;
        break;
      case 'br':
        result = '\n';
        break;
      case 'hr':
        result = '\n\n---\n\n';
        break;
      case 'strong':
      case 'b':
        result = `**${processChildren(node)}**`;
        break;
      case 'em':
      case 'i':
        result = `*${processChildren(node)}*`;
        break;
      case 'code':
        result = `\`${getTextContent(node)}\``;
        break;
      case 'pre':
        result = `\n\n\`\`\`\n${getTextContent(node)}\n\`\`\`\n\n`;
        break;
      case 'blockquote':
        const quoteLines = processChildren(node).split('\n');
        result = '\n\n' + quoteLines.map(line => `> ${line}`).join('\n') + '\n\n';
        break;
      case 'ul':
        result = '\n\n' + Array.from(node.children).map(li => 
          `- ${processChildren(li).trim()}`
        ).join('\n') + '\n\n';
        break;
      case 'ol':
        result = '\n\n' + Array.from(node.children).map((li, i) => 
          `${i + 1}. ${processChildren(li).trim()}`
        ).join('\n') + '\n\n';
        break;
      case 'a':
        if (includeLinks) {
          const href = node.getAttribute('href');
          const text = processChildren(node);
          if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
            const fullUrl = href.startsWith('http') ? href : new URL(href, window.location.origin).href;
            result = `[${text}](${fullUrl})`;
          } else {
            result = text;
          }
        } else {
          result = processChildren(node);
        }
        break;
      case 'img':
        if (includeImages) {
          const alt = node.getAttribute('alt') || '图片';
          const src = node.getAttribute('src');
          result = `\n\n[图片: ${alt}]\n\n`;
        }
        break;
      case 'table':
        result = convertTableToMarkdown(node);
        break;
      case 'div':
      case 'section':
      case 'article':
      case 'span':
      default:
        result = processChildren(node);
        break;
    }
    
    return result;
  }
  
  function processChildren(node) {
    return Array.from(node.childNodes).map(child => processNode(child)).join('');
  }
  
  function getTextContent(node) {
    return node.textContent.replace(/\s+/g, ' ').trim();
  }
  
  markdown = processNode(element);
  
  // 清理多余空行
  markdown = markdown
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
    .trim();
  
  return markdown;
}

/**
 * 表格转 Markdown
 */
function convertTableToMarkdown(table) {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) return '';
  
  let markdown = '\n\n';
  
  rows.forEach((row, rowIndex) => {
    const cells = Array.from(row.querySelectorAll('th, td'));
    const cellContents = cells.map(cell => cell.textContent.trim().replace(/\|/g, '\\|'));
    markdown += '| ' + cellContents.join(' | ') + ' |\n';
    
    if (rowIndex === 0) {
      markdown += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
    }
  });
  
  return markdown + '\n\n';
}

/**
 * 特殊处理 Twitter/X 内容
 */
function extractTwitterContent() {
  const tweets = [];
  
  // 尝试多种选择器
  const tweetSelectors = [
    '[data-testid="tweet"]',
    '[data-testid="tweetText"]',
    'article[role="article"]'
  ];
  
  let tweetElements = [];
  for (const selector of tweetSelectors) {
    tweetElements = document.querySelectorAll(selector);
    if (tweetElements.length > 0) break;
  }
  
  tweetElements.forEach((tweet, index) => {
    // 获取用户名
    const userElement = tweet.querySelector('[data-testid="User-Name"]') || 
                       tweet.closest('article')?.querySelector('[data-testid="User-Name"]');
    const userName = userElement?.textContent || '未知用户';
    
    // 获取推文文本
    const textElement = tweet.querySelector('[data-testid="tweetText"]') || tweet;
    const tweetText = textElement?.textContent || '';
    
    // 获取时间
    const timeElement = tweet.querySelector('time');
    const timestamp = timeElement?.getAttribute('datetime') || '';
    
    if (tweetText.trim()) {
      tweets.push({
        user: userName,
        text: tweetText.trim(),
        time: timestamp
      });
    }
  });
  
  if (tweets.length === 0) {
    // 回退到基本提取
    return `# ${document.title}\n\n来源: ${window.location.href}\n\n---\n\n${document.body.innerText.substring(0, 10000)}`;
  }
  
  let content = `# Twitter/X 内容\n\n来源: ${window.location.href}\n\n---\n\n`;
  
  tweets.forEach((tweet, index) => {
    content += `## 推文 ${index + 1}\n\n`;
    content += `**${tweet.user}**\n\n`;
    content += `${tweet.text}\n\n`;
    if (tweet.time) {
      content += `_${new Date(tweet.time).toLocaleString('zh-CN')}_\n\n`;
    }
    content += '---\n\n';
  });
  
  return content;
}

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractContent') {
    try {
      const result = extractPageContent(request.options || {});
      sendResponse({ success: true, data: result });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }
  return true; // 保持消息通道开放
});

// 导出给测试用
if (typeof module !== 'undefined') {
  module.exports = { extractPageContent, convertToMarkdown };
}
