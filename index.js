const fs = require('fs');
const http = require('http');
const https = require('https');
const zlib = require('zlib');

// Read config from config file with an anonymous function to avoid polluting global namespace
const { saveImages, port, userAgent, cookie } = (() => {
	let config = {};

	try {
		config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
	} catch(e) {}

	// Use default values for missing config options (except for cookie)
	config.saveImages = config.saveImages != null ? config.saveImages : true;
	config.port = config.port || 8080;
	config.userAgent = config.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36";

	// Validate config
	if (typeof config !== 'object') {
		throw new Error('Invalid config');
	} else if (typeof config.saveImages !== 'boolean') {
		throw new Error('Invalid value for saveImages');
	} else if (typeof config.port !== 'number' || isNaN(config.port) || config.port < 1 || config.port > 65535) {
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

// Parse the url and return the id and page (/<illustId>-<page>.<extension>)
const parsePath = (path) => {
	const pathMatch = path.match(/^\/(\d+)(?:-(\d+))?\.(jpe?g|png|gif)$/);
	if (!pathMatch) {
		return null;
	}
	return { illustId: pathMatch[1], page: pathMatch[2] || null };
};

const getJsonFromHtml = (html) => {
	// The json is in the content attribute of the meta tag (name and id below)
	// so we can get it by simply splitting the html
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

	// Just in case we didn't get json data
	try {
		json = JSON.parse(json);
	} catch (e) {
		return null;
	}
	return json;
};

// Request the html page for the given id and return a promise that resolves with the html
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

// Use a function to make the code more readable
const getImageUrl = (json, id, page) => {
	// The website uses the "regular" image urls
	let url = json["illust"][id]["urls"]["regular"];
	// There is only a url for the first page (p0) but we can simply convert it to the url for the page we need.
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

	// Print a message with the http method and url when a request was received
	console.log(`${req.method} ${req.url}`);

	// Not the actual image but the id and page
	let image = parsePath(req.url);
	// Fail if the request is invalid
	if (!image || image.page !== null && image.page < 1) {
		console.error("Bad request");
		res.statusCode = 400;
		res.end();
		return;
	}

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
			// Fail if the requested page doesn't exist
			if (json["illust"][image.illustId]["pageCount"] < image.page) {
				console.error("Requested page does not exist");
				res.statusCode = 404;
				res.end();
				return;
			}
			// Fail if a page was specified in the request but the illustration doesn't have multipage images
			if (json["illust"][image.illustId]["pageCount"] === 1) {
				console.error("Illustration does not have multiple pages");
				res.statusCode = 400;
				res.end();
				return;
			}
		} else {
			// Fail if no page was specified in the request but the illustration has more than one page
			if (json["illust"][image.illustId]["pageCount"] !== 1) {
				console.error("Illustration has more than one page");
				res.statusCode = 400;
				res.end();
				return;
			}
		}

		const imageUrl = getImageUrl(json, image.illustId, image.page || 1);

		const imageReq = https.request(imageUrl, {
			method: 'GET',
			headers: imageRequestHeaders,
		}, (imageRes) => {
			// Fail if the Pixiv rejected our request
			if (imageRes.statusCode !== 200) {
				console.error("Failed to get image");
				res.statusCode = 500;
				res.end();
				return;
			}

			// Use Content-Type and Content-Length we got from Pixiv
			if (imageRes.headers["content-type"]) {
				res.setHeader('Content-Type', imageRes.headers["content-type"]);
			}
			if (imageRes.headers["content-length"]) {
				res.setHeader('Content-Length', imageRes.headers["content-length"]);
			}
			// Let the client cache the image for a year (31536000 seconds / 60 / 60 / 24 = 365 days)
			res.setHeader('Age', '0');
			res.setHeader('Cache-Control', 'public, max-age=31536000');

			// Pipe the image to the client
			imageRes.pipe(res);

			// Check if we should save the images
			if (!saveImages) return;

			// Check if "./store" is a directory
			const dir = './store/';
			const fileName = image.illustId + (image.page ? `-${image.page}` : '') + '.jpg';
			if (fs.existsSync(dir) && !fs.lstatSync(dir).isDirectory()) {
				console.error(`"${dir}" is not a directory! Deleting it...`);
				fs.rmSync(dir);
			}
			if (!fs.existsSync(dir)) {
				console.log(`"${dir}" does not exist, creating...`);
				fs.mkdirSync(dir);
			}

			// Check if file already exists
			if (fs.existsSync(dir + fileName)) return;

			console.log(`Saving to "${dir}${fileName}" ...`);

			// Write the image to the file
			const file = fs.createWriteStream(dir + fileName);
			imageRes.pipe(file);
		}).on('error', (e) => {
			// Something went wrong and we don't know what but it's probably our fault
			console.error(e);
			res.statusCode = 500;
			res.end();
		});
		imageReq.end();
	}).catch((e) => {
		// The request for the html page failed and we got an http error to send to the client
		res.statusCode = e;
		res.end();
	});
});

try {
	server.listen(port, () => {
		console.log(`Server listening on port ${port}`);
	});
} catch (error) {
	console.error(error);
	console.log("Failed to start server - Maybe try another port?");
}
