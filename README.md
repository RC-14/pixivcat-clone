# Pixiv.cat clone

## Requirements

You need to have [Node.js](https://nodejs.org/) installed.

An account is __NOT__ required, even if the image is age restricted.

## Usage

```sh
# Assuming that you're at the root of the project
npm start
```

Images from pixiv illustrations can be accessed by their ID and page number.

Illustrations with only one page: `http://localhost:8080/<illustration_id>.[png|jpg|gif]`

Illustrations with multiple pages: `http://localhost:8080/<illustration_id>-<page_number>.[png|jpg|gif]`

__Regardless of the extension in your request you will probably get a jpg because that's the format Pixiv uses. (as far as I can tell)__

The illustration ID can be found in the URL of the illustration page.
`https://www.pixiv.net/artworks/<illustration_id>`

The page number can simply be counted from 1 or read from the page number indicator.

![Arrow pointing at page number indicator](https://user-images.githubusercontent.com/61058098/163426735-dfe5928c-a5f5-4d1a-bea3-029b71606eac.png)

Link to the illustration in the image: [https://www.pixiv.net/artworks/97571297](https://www.pixiv.net/artworks/97571297)

Images are also saved to the `store` directory within the working directory. (will be created if  it doesn't exist)

## Configuration

__This is optional:__ There are default values that will be used if nothing is specified.

Configuration is done via a `config.json` file in the working directory.

- `port`: The port the http server will listen on - default `8080` *(Number)*
- `saveImages`: Whether to save the downloaded images or not - default `true` *(Boolean)*
