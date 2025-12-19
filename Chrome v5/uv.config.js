window.__uv$config = {
    prefix: '/service/',
    bare: 'https://tomp.app/',
    
    proxyServices: [
        {
            url: 'https://thingproxy.freeboard.io/fetch/',
            type: 'text',
            name: 'ThingProxy'
        },
        {
            url: 'https://api.codetabs.com/v1/proxy?quest=',
            type: 'text',
            name: 'CodeTabs'
        },
        {
            url: 'https://jstor.casa/api/proxy?url=',
            type: 'direct',
            name: 'JSTOR'
        },
        {
            url: 'https://proxy.cors.sh/?url=',
            type: 'text',
            name: 'CORS.SH'
        },
        {
            url: 'https://cloudtxt.top/?url=',
            type: 'direct',
            name: 'CloudTxt'
        },
        {
            url: 'https://api.allorigins.win/get?url=',
            type: 'json',
            name: 'AllOrigins'
        },
        {
            url: 'https://corsproxy.io/?',
            type: 'text',
            name: 'CorsProxy'
        }
    ],
    
    activeProxyIndex: 0,
    
    encodeUrl: function(url) {
        return encodeURIComponent(url);
    },
    
    decodeUrl: function(encoded) {
        return decodeURIComponent(encoded);
    },
    
    getProxyUrl: function(targetUrl) {
        const service = this.proxyServices[this.activeProxyIndex];
        return {
            url: service.url + encodeURIComponent(targetUrl),
            type: service.type
        };
    },
    
    switchProxy: function() {
        this.activeProxyIndex = (this.activeProxyIndex + 1) % this.proxyServices.length;
        console.log('Switched to proxy:', this.proxyServices[this.activeProxyIndex].url);
    }
};
