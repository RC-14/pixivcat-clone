# Pixiv.cat clone

## Run

```bash
npm start
```

## Configuration

__This is optional:__ There are default values that will be used if nothing is specified.

Configuration is done via a `config.json` file in the working directory.

- `port`: The port the http server will listen on. *(Number)*
- `userAgent`: The user agent of your browser. *(String)*
- `cookie`: The cookie that your browser sends to [pixiv.net](https://www.pixiv.net/). *(String)*

The cookie is only neccessary if you want to get images that are not accessible without an account (e.g. `R-18` rated illustrations).
