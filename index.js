// Simple http server that serves images from pixiv.net
// Listens on standard port 8080 or port specified in the environment variable PORT
// Images should be requested using one of the following paths:
// For illustrations with a single image: /<illustID>.jpg
// For illustrations with multiple images: /<illustID>-<page>.jpg

const fs = require('fs');
const http = require('http');
const https = require('https');

// Read config from pixivcat-clone.config with an anonymous function to avoid polluting global namespace
const {port, userAgent, cookies} = (()=>{
    // ONLY CONFIGURE FROM CONFIG FILE!
    // DO NOT CONFIGURE DIRECTLY IN CODE!
    let config = JSON.parse(fs.readFileSync('pixivcat-clone.config', 'utf8')) || {
        port: 8080, // Default http port
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36", // A Windows 10, Chrome 100 user agent
        cookies: "", // Default to empty string (no cookies) because I don't want to share my account
    };

    // Validate config
    if (typeof config !== 'object') {
        throw new Error('Invalid config');
    } else if (typeof config.Port !== 'number' || config.Port < 1 || config.Port > 65535) {
        throw new Error('Invalid config.Port');
    } else if (typeof config.UserAgent !== 'string' || !config.UserAgent) {
        throw new Error('Invalid config.UserAgent');
    } else if (typeof config.Cookies !== 'string' || !config.Cookies) {
        console.warn('No or invalid config.Cookies');
        config.cookies = null;
    }

    return config;
})();

const pathExpression = /^\/(\d+)(?:-(\d+))?\.jpg$/;

const parsePath = (path) => {
    const pathMatch = path.match(pathExpression);
    if (!pathMatch) {
        return null;
    }
    return { illustId: pathMatch[1], page: pathMatch[2] };
};

const server = http.createServer((req, res) => {
    let image = parsePath(req.url);
    if (!image) {
        res.statusCode = 404;
        res.end();
        return;
    }
});

server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});

