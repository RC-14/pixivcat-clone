const fs = require('fs');
const http = require('http');
const https = require('https');

// Read config from config file with an anonymous function to avoid polluting global namespace
const { saveImages, port } = (() => {
	let config = {};

	try {
		config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
	} catch(e) {}

	// Use default values for missing config options (except for cookie)
	config.saveImages = config.saveImages != null ? config.saveImages : true;
	config.port = config.port || 8080;

	// Validate config
	if (typeof config !== 'object') {
		throw new Error('Invalid config');
	} else if (typeof config.saveImages !== 'boolean') {
		throw new Error('Invalid value for saveImages');
	} else if (typeof config.port !== 'number' || isNaN(config.port) || config.port < 1 || config.port > 65535) {
		throw new Error('Invalid port');
	}

	return config;
})();

const jsonRequestHeaders = {
	"accept": "application/json",
	"cache-control": "max-age=0",
	"pragma": "no-cache",
};
const imageRequestHeaders = {
	"accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*",
	"cache-control": "no-cache",
	"pragma": "no-cache",
	"referer": "https://www.pixiv.net/",
};

// Parse the url and return the id and page (/<illustId>-<page>.<extension>)
const parsePath = (path) => {
	const pathMatch = path.match(/^\/(\d+)(?:-(\d+))?\.(jpe?g|png|gif)$/);
	if (!pathMatch) {
		return null;
	}
	return { illustId: pathMatch[1], page: pathMatch[2] || null };
};

// Request the html page for the given id and return a promise that resolves with the html
const getJson = (id) => new Promise((resolve, reject) => {
	const req = https.request({
		host: 'www.pixiv.net',
		path: `/ajax/illust/${id}?lang=en`,
		method: 'GET',
		headers: jsonRequestHeaders,
	}, (res) => {
		if (res.statusCode !== 200) {
			reject(404);
			return;
		}

		const buffer = [];

		res.on('data', (chunk) => {
			buffer.push(chunk);
		}).on('end', () => {
			const json = buffer.join('');
			
			try {
				const data = JSON.parse(json);

				if (data.error) {
					console.error(`Pixiv error: ${data.message}`);
					reject(404);
					return;
				} else if (data.body == null || typeof data.body !== 'object' || Object.keys(data.body).length === 0) {
					console.error('Empty response from pixiv');
					reject(404);
					return;
				}

				resolve(data.body);
			} catch (error) {
				console.error(error);
				reject(500);
			}
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
const getImageUrl = (json, page) => {
	// The website uses the "regular" image urls
	let url = json["urls"]["regular"];
	// JSON only contains a url for the first page (p0) but we can simply convert it to the url for the page we need.
	url = url.replace("_p0", `_p${page - 1}`);
	return new URL(url);
};

const server = http.createServer((req, res) => {
	const rejectRequest = (code, consoleMessage) => {
		res.writeHead(code);
		res.end();

		if (consoleMessage == null) {
			console.error(http.STATUS_CODES[code]);
		} else {
			console.error(consoleMessage);
		}
	}

	// Set the response type to plain text for errors
	res.setHeader('Content-Type', 'text/plain');

	// Print a message when the reply was sent
	res.on('pipe', () => console.log(`Sent reply for ${req.url}`));

	// Catch favicon requests
	if (req.url === '/favicon.ico') {
		rejectRequest(404);
		return;
	}

	// Print a message with the http method and url when a request was received
	console.log(`${req.method} ${req.url}`);

	// Illustration id and page
	let imageInfo = parsePath(req.url);
	// Fail if the request is invalid
	if (!imageInfo || imageInfo.page !== null && imageInfo.page < 1) {
		rejectRequest(400);
		return;
	}

	const jsonPromise = getJson(imageInfo.illustId);
	jsonPromise.catch(rejectRequest);
	jsonPromise.then((json) => {
		// Check if the provided page is valid
		if (imageInfo.page) {
			// Fail if the requested page doesn't exist
			if (json["pageCount"] < imageInfo.page) {
				rejectRequest(404, "Requested page doesn't exist");
				return;
			}
			// Fail if a page was specified in the request but the illustration doesn't have multipage images
			if (json["pageCount"] === 1) {
				rejectRequest(400, "Illustration doesn't have multiple pages");
				return;
			}
		} else {
			// Fail if no page was specified in the request but the illustration has more than one page
			if (json["pageCount"] !== 1) {
				rejectRequest(400, "Illustration has more than one page");
				return;
			}
		}

		const imageUrl = getImageUrl(json, imageInfo.page || 1);

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

			const dir = './store/';
			const fileName = imageInfo.illustId + (imageInfo.page ? `-${imageInfo.page}` : '') + '.jpg';

			// Make sure "store" is a directory
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
		}).on('error', rejectRequest);
		imageReq.end();
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
