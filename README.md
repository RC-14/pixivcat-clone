# Pixiv.cat clone

## Usage

Start the server:

```bash
npm start
```

Images from pixiv illustrations can now be accessed by their ID and page number.

Illustrations with only one page: `http://localhost:8080/<illustration_id>.[png|jpg|gif]`

Illustrations with multiple pages: `http://localhost:8080/<illustration_id>-<page_number>.[png|jpg|gif]`

The illustration ID can be found in the URL of the illustration page.
`https://www.pixiv.net/artworks/<illustration_id>`

The page number can simply be counted from 1 or read from the page number indicator.

## Configuration

__This is optional:__ There are default values that will be used if nothing is specified.

Configuration is done via a `config.json` file in the working directory.

- `port`: The port the http server will listen on. *(Number)*
- `userAgent`: The user agent of your browser. *(String)*
- `cookie`: The cookie that your browser sends to [pixiv.net](https://www.pixiv.net/). *(String)*

The cookie is only neccessary if you want to get images that are not accessible without an account (e.g. *R-18* rated illustrations).
