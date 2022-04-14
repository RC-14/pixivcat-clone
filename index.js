// Simple http server that serves images from pixiv.net
// Listens on standard port 8080 or port specified in the environment variable PORT
// Images should be requested using one of the following paths:
// For illustrations with a single image: /<illustID>.jpg
// For illustrations with multiple images: /<illustID>-<page>.jpg

const fs = require('fs');
const http = require('http');
const https = require('https');
const zlib = require('zlib');

// Read config from pixivcat-clone.config with an anonymous function to avoid polluting global namespace
const { port, userAgent, cookie } = (() => {
    let config = JSON.parse(fs.readFileSync('config.json', 'utf8')) || {};

    // Use default values for missing config options (except for cookie)
    config.port = config.port || 8080;
    config.userAgent = config.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36";

    // Validate config
    if (typeof config !== 'object') {
        throw new Error('Invalid config');
    } else if (undefined && typeof config.port !== 'number' || config.port < 1 || config.port > 65535) {
        throw new Error('Invalid port');
    } else if (typeof config.userAgent !== 'string') {
        throw new Error('Invalid userAgent');
    } else if (typeof config.cookie !== 'string' || !config.cookie) {
        console.warn('No or invalid cookie, ignoring...');
        config.cookies = null;
    }

    return config;
})();

const htmlRequestHeaders = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
    "accept-encoding": "gzip, deflate, br",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "max-age=0",
    "cookie": cookie || "",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "sec-gpc": "1",
    "upgrade-insecure-requests": "1",
    "user-agent": userAgent,
};
const imageRequestHeaders = {
    "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "accept-encoding": "gzip, deflate, br",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    "dnt": "1",
    "pragma": "no-cache",
    "referer": "https://www.pixiv.net/",
    "sec-fetch-dest": "image",
    "sec-fetch-mode": "no-cors",
    "sec-fetch-site": "cross-site",
    "sec-gpc": "1",
    "user-agent": userAgent,
};

const parsePath = (path) => {
    const pathMatch = path.match(/^\/(\d+)(?:-(\d+))?\.(jpe?g|png|gif)$/);
    if (!pathMatch) {
        return null;
    }
    return { illustId: pathMatch[1], page: pathMatch[2] || null };
};

const getJsonFromHtml = (html) => {
    let json = html.split(`<meta name="preload-data" id="meta-preload-data" content='`);
    if (json.length < 2) {
        return null;
    }
    json = json[1];

    json = json.split(`'>`);
    if (json.length < 2) {
        return null;
    }
    json = json[0];

    try {
        json = JSON.parse(json);
    } catch (e) {
        return null;
    }
    return json;
};

const getHtml = (id) => new Promise((resolve, reject) => {
    const req = https.request({
        host: 'www.pixiv.net',
        path: `/en/artworks/${id}`,
        method: 'GET',
        headers: htmlRequestHeaders,
    }, (res) => {
        if (res.statusCode !== 200) {
            reject(404);
            return;
        }

        let buffer = [];

        // Respnose is gzipped
        let gunzip = zlib.createGunzip();
        res.pipe(gunzip);

        gunzip.on('data', (chunk) => {
            buffer.push(chunk.toString());
        }).on('end', () => {
            resolve(buffer.join(''));
        }).on('error', (e) => {
            console.error(e);
            reject(500);
        });
    }).on('error', (e) => {
        console.error(e);
        reject(500);
    });
    req.end();
});

const getImageUrl = (json, id, page) => {
    let url = json["illust"][id]["urls"]["regular"];
    url = url.replace("_p0", `_p${page - 1}`);
    return new URL(url);
};

const server = http.createServer((req, res) => {
    // Set the response type to plain text for errors
    res.setHeader('Content-Type', 'text/plain');

    // Print a message when the reply was sent
    res.on('pipe', () => console.log(`Sent reply for ${req.url}`));

    // Catch favicon requests
    if (req.url === '/favicon.ico') {
        res.writeHead(404);
        res.end();
        return;
    }

    console.log(`${req.method} ${req.url}`);

    let image = parsePath(req.url);
    if (!image || image.page !== null && image.page < 1) {
        console.error("Bad request");
        res.statusCode = 400;
        res.end();
        return;
    }

    // Request the html page
    getHtml(image.illustId).then((html) => {
        const json = getJsonFromHtml(html);

        // Fail if json is invalid
        if (!json) {
            console.error("Failed to get JSON from HTML");
            res.statusCode = 500;
            res.end();
            return;
        }

        if (image.page) {
            // Fail if the page doesn't exist
            if (json["illust"][image.illustId]["pageCount"] < image.page) {
                console.error("Requested page does not exist");
                res.statusCode = 404;
                res.end();
                return;
            }
            // Fail if pageCount is 1
            if (json["illust"][image.illustId]["pageCount"] === 1) {
                console.error("Illustration does not have multiple pages");
                res.statusCode = 400;
                res.end();
                return;
            }
        } else {
            // Fail if pageCount is not 1
            if (json["illust"][image.illustId]["pageCount"] !== 1) {
                console.error("Illustration has more than one page");
                res.statusCode = 400;
                res.end();
                return;
            }
        }

        const imageUrl = getImageUrl(json, image.illustId, image.page)

        // Request the image
        const imageReq = https.request(imageUrl, {
            method: 'GET',
            headers: imageRequestHeaders,
        }, (imageRes) => {
            if (imageRes.statusCode !== 200) {
                console.error("Failed to get image");
                res.statusCode = 500;
                res.end();
                return;
            }

            // Set response headers
            res.setHeader('Content-Type', imageRes.headers['content-type']);
            res.setHeader('Content-Length', imageRes.headers['content-length']);
            res.setHeader('Age', '0');
            res.setHeader('Cache-Control', 'public, max-age=31536000');

            // Send the image
            imageRes.pipe(res);
        }).on('error', (e) => {
            console.error(e);
            res.statusCode = 500;
            res.end();
        });
        imageReq.end();
    }).catch((e) => {
        res.statusCode = e;
        res.end();
    });
});

server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
