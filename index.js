// Simple http server that serves images from pixiv.net
// Listens on standard port 8080 or port specified in the environment variable PORT
// Images should be requested using one of the following paths:
// For illustrations with a single image: /<illustID>.jpg
// For illustrations with multiple images: /<illustID>-<page>.jpg

const fs = require('fs');
const http = require('http');
const https = require('https');

const port = process.env.PORT || 8080;
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

