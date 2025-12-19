class BrowserEmulator {
    constructor() {
        this.tabs = [];
        this.activeTabId = null;
        this.tabCounter = 0;
        this.cloakedMode = false;
        this.urlWatcher = null;
        this.proxyCache = {};
        this.cachedProxyIndex = 0;
        this.urlResponseCache = {};
        
        this.initializeElements();
        this.attachEventListeners();
        this.initializeUV();
        this.createNewTab();
    }

    initializeElements() {
        this.tabBar = document.getElementById('tab-bar');
        this.addressBar = document.getElementById('address-bar');
        this.contentFrame = document.getElementById('content-frame');
        this.statusText = document.getElementById('status-text');
        this.btnBack = document.getElementById('btn-back');
        this.btnForward = document.getElementById('btn-forward');
        this.btnRefresh = document.getElementById('btn-refresh');
        this.btnCloak = document.getElementById('btn-cloak');
        this.btnBlank = document.getElementById('btn-blank');
    }

    initializeUV() {
        if (!window.__uv$config) {
            console.error('UV config not loaded! Make sure uv.config.js is loaded before script.js');
            return;
        }
        console.log('Proxy Config initialized:', window.__uv$config);
    }

    attachEventListeners() {
        this.btnBack.addEventListener('click', () => this.goBack());
        this.btnForward.addEventListener('click', () => this.goForward());
        this.btnRefresh.addEventListener('click', () => this.refreshTab());
        this.btnCloak.addEventListener('click', () => this.toggleCloaker());
        this.btnBlank.addEventListener('click', () => this.openInBlank());
        
        this.addressBar.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.navigateToURL(this.addressBar.value);
            }
        });

        this.contentFrame.addEventListener('load', () => {
            this.updateStatusBar();
            this.startURLWatcher();
        });

        this.contentFrame.addEventListener('error', () => {
            this.statusText.textContent = 'Error loading page';
        });
    }

    createNewTab(url = 'about:blank') {
        const tabId = this.tabCounter++;
        const tab = {
            id: tabId,
            title: 'New Tab',
            displayTitle: 'New Tab',
            url: url,
            originalUrl: url,
            history: [],
            historyIndex: -1,
            favicon: this.getDefaultFavicon()
        };

        this.tabs.push(tab);
        this.setActiveTab(tabId);
        this.renderTabs();
        
        if (url !== 'about:blank') {
            this.loadURLInTab(tabId, url);
        }
    }

    setActiveTab(tabId) {
        this.activeTabId = tabId;
        const tab = this.getTab(tabId);
        
        if (tab.url && tab.url !== 'about:blank') {
            this.addressBar.value = tab.originalUrl;
            this.loadURLInTab(tabId, tab.originalUrl);
        } else {
            this.contentFrame.src = 'about:blank';
            this.addressBar.value = '';
        }
        
        this.renderTabs();
        this.updateStatusBar();
    }

    getTab(tabId) {
        return this.tabs.find(t => t.id === tabId);
    }

    closeTab(tabId) {
        const index = this.tabs.findIndex(t => t.id === tabId);
        if (index > -1) {
            this.tabs.splice(index, 1);
        }

        if (this.activeTabId === tabId) {
            if (this.tabs.length > 0) {
                this.setActiveTab(this.tabs[Math.max(0, index - 1)].id);
            } else {
                this.createNewTab();
            }
        }

        this.renderTabs();
    }

    renderTabs() {
        this.tabBar.innerHTML = '';

        this.tabs.forEach(tab => {
            const tabEl = document.createElement('div');
            tabEl.className = `tab ${tab.id === this.activeTabId ? 'active' : ''}`;
            
            const icon = document.createElement('div');
            icon.className = 'tab-icon';
            icon.style.backgroundImage = `url('${tab.favicon}')`;
            
            const title = document.createElement('span');
            title.className = 'tab-title';
            title.textContent = tab.displayTitle.substring(0, 50);
            
            const closeBtn = document.createElement('div');
            closeBtn.className = 'tab-close';
            closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeTab(tab.id);
            });
            
            tabEl.appendChild(icon);
            tabEl.appendChild(title);
            tabEl.appendChild(closeBtn);
            tabEl.addEventListener('click', () => this.setActiveTab(tab.id));
            
            this.tabBar.appendChild(tabEl);
        });

        const newTabBtn = document.createElement('button');
        newTabBtn.className = 'new-tab-btn';
        newTabBtn.innerHTML = '+';
        newTabBtn.addEventListener('click', () => this.createNewTab());
        this.tabBar.appendChild(newTabBtn);
    }

    navigateToURL(input) {
        if (!input.trim()) return;

        let url = input.trim();
        let originalUrl = url;

        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('about:')) {
            if (url.includes('.') || url.length > 5) {
                url = 'https://' + url;
            } else {
                url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
            }
        }

        const activeTab = this.getTab(this.activeTabId);
        activeTab.originalUrl = originalUrl;
        activeTab.url = url;
        activeTab.title = 'Loading...';
        activeTab.displayTitle = 'Loading...';
        activeTab.history.push(url);
        activeTab.historyIndex = activeTab.history.length - 1;
        
        this.renderTabs();
        this.statusText.textContent = 'Loading...';
        this.loadProxiedContent(url, this.activeTabId);
    }

    loadURLInTab(tabId, url) {
        const tab = this.getTab(tabId);
        if (!tab) return;

        this.addressBar.value = tab.originalUrl;
        this.statusText.textContent = 'Loading...';

        if (url === 'about:blank') {
            this.contentFrame.src = 'about:blank';
            tab.title = 'New Tab';
            tab.displayTitle = 'New Tab';
            return;
        }

        this.loadProxiedContent(url, tabId);
    }

    loadProxiedContent(url, tabId) {
        const tab = this.getTab(tabId);
        if (!tab) return;

        console.log('Loading proxied content for:', url);
        this.statusText.textContent = 'Fetching content...';

        if (this.urlResponseCache[url]) {
            const cached = this.urlResponseCache[url];
            this.loadContentAndRender(cached.content, url, tab, cached.proxyIndex);
            return;
        }

        this.tryProxyServices(url, tabId, 0);
    }

    tryProxyServices(url, tabId, proxyIndex = 0) {
        const tab = this.getTab(tabId);
        if (!tab) return;

        if (proxyIndex === 0) {
            this.tryMultipleProxiesInParallel(url, tabId);
        }
    }

    tryMultipleProxiesInParallel(url, tabId) {
        const tab = this.getTab(tabId);
        if (!tab) return;

        const proxyIndexes = this.cachedProxyIndex > 0 ? [this.cachedProxyIndex, 0, 1, 2] : [0, 1, 2];
        const proxyPromises = proxyIndexes.slice(0, 3).map((idx) => {
            const service = window.__uv$config.proxyServices[idx];
            const config = {
                url: service.url + encodeURIComponent(url),
                type: service.type,
                index: idx
            };

            return this.fetchWithTimeout(config.url, 2500)
                .then(response => this.parseProxyResponse(response, config.type))
                .then(content => {
                    if (content && content.length > 50 && !this.isProxyInterface(content)) {
                        this.cachedProxyIndex = idx;
                        this.urlResponseCache[url] = { content, proxyIndex: idx };
                        return { success: true, content, proxyIndex: idx };
                    }
                    throw new Error('Invalid');
                })
                .catch(err => ({ success: false, error: err.message, proxyIndex: idx }));
        });

        Promise.all(proxyPromises).then(results => {
            const successful = results.find(r => r.success);
            
            if (successful) {
                this.loadContentAndRender(successful.content, url, tab, successful.proxyIndex);
            } else {
                this.trySequentialFallback(url, tabId, 3);
            }
        });
    }

    trySequentialFallback(url, tabId, startIndex) {
        const tab = this.getTab(tabId);
        if (!tab) return;

        if (startIndex >= window.__uv$config.proxyServices.length) {
            this.statusText.textContent = 'All proxies failed';
            this.contentFrame.srcdoc = this.getErrorHTML(url, 'All proxy services are unavailable.');
            return;
        }

        const service = window.__uv$config.proxyServices[startIndex];
        const proxyUrl = service.url + encodeURIComponent(url);

        this.fetchWithTimeout(proxyUrl, 3000)
            .then(response => this.parseProxyResponse(response, service.type))
            .then(content => {
                if (content && content.length > 50 && !this.isProxyInterface(content)) {
                    this.urlResponseCache[url] = { content, proxyIndex: startIndex };
                    this.loadContentAndRender(content, url, tab, startIndex);
                } else {
                    throw new Error('Invalid content');
                }
            })
            .catch(err => {
                console.warn(`✗ Proxy ${startIndex + 1} (${service.name}) failed:`, err.message);
                this.trySequentialFallback(url, tabId, startIndex + 1);
            });
    }

    fetchWithTimeout(url, timeout = 5000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        return fetch(url, {
            method: 'GET',
            headers: {
                'Accept': '*/*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            mode: 'cors',
            credentials: 'omit',
            signal: controller.signal
        }).finally(() => clearTimeout(timeoutId));
    }

    parseProxyResponse(response, type) {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        if (type === 'json') {
            return response.json().then(data => data.contents || data.content || '');
        } else {
            return response.text();
        }
    }

    isProxyInterface(html) {
        return html.includes('textpage.xyz') || 
               html.includes('corsproxy') || 
               html.includes('allorigins') ||
               (html.length < 100 && !html.includes('<html'));
    }

    loadContentAndRender(htmlContent, url, tab, proxyIndex) {
        try {
            htmlContent = this.processHTMLContentFast(htmlContent, url);
            this.contentFrame.srcdoc = htmlContent;

            const pageTitle = new URL(url).hostname || 'Page';
            tab.displayTitle = pageTitle;
            tab.title = pageTitle;
            this.renderTabs();
            this.statusText.textContent = pageTitle;

            console.log('✓ Loaded with proxy:', proxyIndex + 1);
        } catch (error) {
            console.error('Error rendering content:', error);
            this.contentFrame.srcdoc = this.getErrorHTML(url, error.message);
        }
    }

    getErrorHTML(url, errorMsg) {
        const proxyList = window.__uv$config.proxyServices
            .map((p, i) => `<li>${i + 1}. ${p.name} - ${p.url.substring(0, 40)}...</li>`)
            .join('');
        
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Error</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; background: #f0f0f0; }
                    .error-box { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 600px; margin: 20px auto; }
                    h1 { color: #d32f2f; margin-top: 0; }
                    .error-details { background: #f5f5f5; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px; margin: 10px 0; word-break: break-all; }
                    button { background: #4285F4; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px; margin-right: 10px; }
                    button:hover { background: #3367D6; }
                    .proxy-list { background: #f0f0f0; padding: 10px; border-radius: 4px; margin: 10px 0; }
                    code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
                </style>
            </head>
            <body>
                <div class="error-box">
                    <h1>⚠️ Error Loading Page</h1>
                    <p><strong>URL:</strong> <code>${url}</code></p>
                    <div class="error-details">Reason: ${errorMsg}</div>
                    
                    <p><strong>Proxies Tried (${window.__uv$config.proxyServices.length}):</strong></p>
                    <div class="proxy-list">
                        <ol>${proxyList}</ol>
                    </div>
                    
                    <p><strong>What to try:</strong></p>
                    <ul>
                        <li>Refresh the page</li>
                        <li>Try a simpler website (example.com, github.com)</li>
                        <li>Check if the website is online</li>
                        <li>Some sites may block proxy access</li>
                    </ul>
                    <button onclick="location.reload()">🔄 Refresh</button>
                    <button onclick="window.history.back()">← Back</button>
                </div>
            </body>
            </html>
        `;
    }

    processHTMLContentFast(html, baseUrl) {
        try {
            let processed = html;

            processed = processed.replace(/<script[^>]*>[\s\S]*?<\/script>|on\w+\s*=\s*["'][^"']*["']|<meta\s+http-equiv\s*=\s*["']refresh["'][^>]*>/gi, '');

            const hasBody = /<body/i.test(processed);
            const hasHead = /<head/i.test(processed);
            const hasHtml = /<html/i.test(processed);

            if (!hasBody && !hasHtml) {
                processed = `<html><head><base href="${baseUrl}"></head><body>${processed}</body></html>`;
            } else if (!hasHead) {
                processed = processed.replace(/<html[^>]*>/i, `<html><head><base href="${baseUrl}"></head>`);
            } else {
                processed = processed.replace(/<head[^>]*>/i, `<head><base href="${baseUrl}">`);
            }

            const escapedUrl = baseUrl.replace(/"/g, '\\"');
            const proxyScript = `<script>document.addEventListener('click',function(e){const a=e.target.closest('a');if(a){const h=a.getAttribute('href');if(h&&!h.startsWith('javascript:')&&!h.startsWith('#')&&!h.startsWith('mailto:')){e.preventDefault();let u=h;if(!h.startsWith('http')){try{u=new URL(h,"${escapedUrl}").href}catch(r){u="${escapedUrl}"+(h.startsWith('/')?'':'/') + h}}parent.postMessage({type:'navigate',url:u},'*')}}},true);</script>`;

            if (/<\/body>/i.test(processed)) {
                processed = processed.replace(/<\/body>/i, proxyScript + '</body>');
            } else {
                processed += proxyScript;
            }

            return processed;
        } catch (error) {
            console.error('Error processing HTML:', error);
            return html;
        }
    }

    processHTMLContent(html, baseUrl) {
        try {
            const baseUrlObj = new URL(baseUrl);
            const baseDomain = baseUrlObj.origin;

            let processed = this.extractRealContent(html);
            
            if (!processed) {
                processed = html;
            }

            processed = this.fixAllUrls(processed, baseUrl);
            processed = this.stripBlockingElements(processed);
            processed = this.fixLinksForProxy(processed);

            const hasHtmlTag = /<html/i.test(processed);
            const hasHeadTag = /<head/i.test(processed);
            const hasBodyTag = /<body/i.test(processed);

            if (hasHeadTag) {
                processed = processed.replace(/<head[^>]*>/i, `<head><base href="${baseUrl}"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>* { margin: 0; padding: 0; } body { background: white; color: black; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; } img { max-width: 100%; height: auto; }</style>`);
            } else if (hasHtmlTag) {
                processed = processed.replace(/<html[^>]*>/i, `<html><head><base href="${baseUrl}"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>* { margin: 0; padding: 0; } body { background: white; color: black; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; } img { max-width: 100%; height: auto; }</style></head>`);
            } else {
                processed = `<!DOCTYPE html><html><head><base href="${baseUrl}"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>* { margin: 0; padding: 0; } body { background: white; color: black; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; } img { max-width: 100%; height: auto; }</style></head><body>${processed}</body></html>`;
            }

            const proxyScript = `
<script>
(function() {
    const baseUrl = "${baseUrl.replace(/"/g, '\\"')}";
    const baseDomain = "${baseDomain.replace(/"/g, '\\"')}";
    
    document.addEventListener('click', function(e) {
        const link = e.target.closest('a');
        if (link) {
            const href = link.getAttribute('href');
            if (href && !href.startsWith('javascript:') && !href.startsWith('#') && !href.startsWith('mailto:')) {
                e.preventDefault();
                let fullUrl = href;
                if (!href.startsWith('http')) {
                    try {
                        fullUrl = new URL(href, baseUrl).href;
                    } catch(err) {
                        fullUrl = baseUrl + (href.startsWith('/') ? '' : '/') + href;
                    }
                }
                parent.postMessage({ type: 'navigate', url: fullUrl }, '*');
            }
        }
    }, true);

    document.addEventListener('submit', function(e) {
        const form = e.target;
        if (form && form.action) {
            e.preventDefault();
            const formData = new FormData(form);
            let action = form.action;
            if (!action.startsWith('http')) {
                try {
                    action = new URL(action, baseUrl).href;
                } catch(err) {
                    action = baseUrl + (action.startsWith('/') ? '' : '/') + action;
                }
            }
            parent.postMessage({
                type: 'formSubmit',
                action: action,
                data: Object.fromEntries(formData)
            }, '*');
        }
    }, true);
})();
</script>`;

            if (hasBodyTag) {
                processed = processed.replace(/<\/body>/i, proxyScript + '</body>');
            } else {
                processed += proxyScript;
            }

            return processed;
        } catch (error) {
            console.error('Error processing HTML:', error);
            return `<!DOCTYPE html><html><body style="font-family:Arial;padding:20px;"><h1>Error Processing Content</h1><p>${error.message}</p></body></html>`;
        }
    }

    extractRealContent(html) {
        if (!html) return null;

        if (html.includes('textpage.xyz') && html.includes('form')) {
            const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
            if (match && match[1].length > 500) {
                return match[1];
            }
        }

        if (html.includes('<main') || html.includes('id="content"') || html.includes('class="content"')) {
            const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
            if (mainMatch && mainMatch[1].length > 200) {
                return `<div>${mainMatch[1]}</div>`;
            }

            const contentMatch = html.match(/<div[^>]*(?:id|class)=["']content["'][^>]*>([\s\S]*?)<\/div>/i);
            if (contentMatch && contentMatch[1].length > 200) {
                return contentMatch[1];
            }
        }

        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch) {
            const bodyContent = bodyMatch[1];
            if (bodyContent.length > 100 && !bodyContent.includes('404') && !bodyContent.includes('error')) {
                return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>${bodyMatch[0]}</html>`;
            }
        }

        return null;
    }

    fixAllUrls(html, baseUrl) {
        const baseUrlObj = new URL(baseUrl);
        const baseDomain = baseUrlObj.origin;

        let processed = html;

        processed = processed.replace(/href=["']([^"']*?)["']/gi, (match, url) => {
            if (url.startsWith('javascript:') || url.startsWith('data:') || url.startsWith('#')) {
                return match;
            }
            if (!url) return 'href="#"';
            if (url.includes('textpage.xyz') || url.includes('corsproxy') || url.includes('allorigins')) {
                return 'href="#"';
            }
            if (!url.startsWith('http')) {
                try {
                    url = new URL(url, baseUrl).href;
                } catch (e) {
                    url = baseUrl + (url.startsWith('/') ? '' : '/') + url;
                }
            }
            return `href="${url}"`;
        });

        processed = processed.replace(/src=["']([^"']*?)["']/gi, (match, url) => {
            if (!url || url.startsWith('data:') || url.startsWith('blob:')) {
                return match;
            }
            if (url.includes('textpage.xyz') || url.includes('corsproxy') || url.includes('allorigins')) {
                return '';
            }
            if (!url.startsWith('http')) {
                try {
                    url = new URL(url, baseUrl).href;
                } catch (e) {
                    url = baseUrl + (url.startsWith('/') ? '' : '/') + url;
                }
            }
            return `src="${url}"`;
        });

        processed = processed.replace(/srcset=["']([^"']*?)["']/gi, (match, urls) => {
            return 'srcset="' + urls.split(',').map(entry => {
                const [url, size] = entry.trim().split(/\s+/);
                if (!url.startsWith('http') && !url.startsWith('data:')) {
                    try {
                        return new URL(url, baseUrl).href + (size ? ' ' + size : '');
                    } catch (e) {
                        return url + (size ? ' ' + size : '');
                    }
                }
                return url + (size ? ' ' + size : '');
            }).join(', ') + '"';
        });

        return processed;
    }

    stripBlockingElements(html) {
        let processed = html;

        processed = processed.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

        processed = processed.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

        processed = processed.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

        processed = processed.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '<div style="background:#f0f0f0;padding:10px;text-align:center;border:1px solid #ddd;">Embedded content not available in proxy</div>');

        processed = processed.replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '');

        processed = processed.replace(/<embed[^>]*>/gi, '');

        processed = processed.replace(/<meta\s+http-equiv\s*=\s*["']refresh["'][^>]*>/gi, '');

        processed = processed.replace(/window\.location\s*=\s*['"]\s*https?:\/\/[^'"]*['"]/gi, '');

        return processed;
    }

    fixLinksForProxy(html) {
        return html.replace(/<a\s+([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi, (match, before, href, after) => {
            if (href.startsWith('javascript:') || href.startsWith('#')) {
                return match;
            }
            return `<a ${before}href="${href}"${after}>`;
        });
    }

    startURLWatcher() {
        if (this.urlWatcher) {
            clearInterval(this.urlWatcher);
        }
    }

    extractPageTitle() {
        const activeTab = this.getTab(this.activeTabId);
        if (activeTab && activeTab.originalUrl) {
            try {
                activeTab.displayTitle = new URL(activeTab.originalUrl).hostname || 'Page';
                this.renderTabs();
            } catch (urlError) {
                console.log('Could not extract title:', urlError);
            }
        }
    }

    goBack() {
        const activeTab = this.getTab(this.activeTabId);
        if (activeTab && activeTab.history.length > 0 && activeTab.historyIndex > 0) {
            activeTab.historyIndex--;
            this.loadProxiedContent(activeTab.history[activeTab.historyIndex], this.activeTabId);
        }
    }

    goForward() {
        const activeTab = this.getTab(this.activeTabId);
        if (activeTab && activeTab.historyIndex < activeTab.history.length - 1) {
            activeTab.historyIndex++;
            this.loadProxiedContent(activeTab.history[activeTab.historyIndex], this.activeTabId);
        }
    }

    refreshTab() {
        const activeTab = this.getTab(this.activeTabId);
        if (activeTab.url && activeTab.url !== 'about:blank') {
            this.loadProxiedContent(activeTab.url, activeTab.id);
        }
    }

    toggleCloaker() {
        this.cloakedMode = !this.cloakedMode;
        
        if (this.cloakedMode) {
            document.title = 'Google Drive - My Drive';
            const driveIcon = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%234285F4" d="M3 12l6-10h6l-6 10m0 0l6 10h-6l-6-10m12 0l6-10h6l-6 10m0 0l-6 10h6l6-10"/></svg>';
            this.updateFavicon(driveIcon);
            this.btnCloak.style.color = '#4285F4';
            this.statusText.textContent = 'Cloaker Active: Google Drive';
        } else {
            document.title = 'Chrome Browser';
            this.updateFavicon('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="%234285F4"/></svg>');
            this.btnCloak.style.color = '';
            this.statusText.textContent = 'Cloaker Disabled';
        }
    }

    updateFavicon(dataUrl) {
        let link = document.querySelector('link[rel="icon"]');
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.href = dataUrl;
    }

    openInBlank() {
        const activeTab = this.getTab(this.activeTabId);
        if (!activeTab.url || activeTab.url === 'about:blank') {
            this.statusText.textContent = 'No URL to open';
            return;
        }

        const url = activeTab.url;
        const blankWindow = window.open('about:blank', '_blank');
        blankWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Loading...</title>
                <style>
                    body { margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; height: 100vh; background: #f0f0f0; font-family: Arial; }
                    .loader { text-align: center; }
                    .spinner { border: 4px solid #ddd; border-top: 4px solid #4285F4; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 20px; }
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                </style>
            </head>
            <body>
                <div class="loader">
                    <div class="spinner"></div>
                    <p>Loading page...</p>
                </div>
            </body>
            </html>
        `);
        blankWindow.document.close();

        this.tryBlankProxyServices(url, blankWindow, 0);
        this.statusText.textContent = 'Opened in about:blank window';
    }

    tryBlankProxyServices(url, blankWindow, proxyIndex = 0) {
        if (proxyIndex === 0) {
            const proxyPromises = window.__uv$config.proxyServices.slice(0, 3).map((service, idx) => {
                const proxyUrl = service.url + encodeURIComponent(url);
                return this.fetchWithTimeout(proxyUrl, 2500)
                    .then(response => this.parseProxyResponse(response, service.type))
                    .then(content => {
                        if (content && content.length > 50 && !this.isProxyInterface(content)) {
                            return { success: true, content, index: idx };
                        }
                        throw new Error('Invalid');
                    })
                    .catch(() => ({ success: false, index: idx }));
            });

            Promise.all(proxyPromises).then(results => {
                const successful = results.find(r => r.success);
                if (successful) {
                    const processed = this.processHTMLContentFast(successful.content, url);
                    blankWindow.document.open();
                    blankWindow.document.write(processed);
                    blankWindow.document.close();
                } else {
                    this.tryBlankProxyServices(url, blankWindow, 3);
                }
            });
        } else if (proxyIndex >= window.__uv$config.proxyServices.length) {
            blankWindow.document.open();
            blankWindow.document.write(this.getErrorHTML(url, 'All proxies failed'));
            blankWindow.document.close();
        } else {
            const service = window.__uv$config.proxyServices[proxyIndex];
            const proxyUrl = service.url + encodeURIComponent(url);

            this.fetchWithTimeout(proxyUrl, 3000)
                .then(response => this.parseProxyResponse(response, service.type))
                .then(content => {
                    if (content && content.length > 50 && !this.isProxyInterface(content)) {
                        const processed = this.processHTMLContentFast(content, url);
                        blankWindow.document.open();
                        blankWindow.document.write(processed);
                        blankWindow.document.close();
                    } else {
                        throw new Error('Invalid');
                    }
                })
                .catch(() => this.tryBlankProxyServices(url, blankWindow, proxyIndex + 1));
        }
    }

    updateStatusBar() {
        const activeTab = this.getTab(this.activeTabId);
        if (activeTab) {
            this.statusText.textContent = `${activeTab.displayTitle}`;
        }
    }

    getDefaultFavicon() {
        return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="%23E8E8E8" stroke="%23999" stroke-width="1"/><circle cx="12" cy="12" r="8" fill="none" stroke="%234285F4" stroke-width="2"/></svg>';
    }
}

window.addEventListener('message', function(event) {
    if (event.data) {
        if (event.data.type === 'navigate') {
            browserEmulator.navigateToURL(event.data.url);
        } else if (event.data.type === 'formSubmit') {
            console.log('Form submitted:', event.data.action);
            browserEmulator.navigateToURL(event.data.action);
        }
    }
});

const browserEmulator = new BrowserEmulator();
