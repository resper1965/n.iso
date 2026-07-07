var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// node_modules/hono/dist/compose.js
var compose = /* @__PURE__ */ __name((middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context.req.routeIndex = i;
      } else {
        handler = i === middleware.length && next || void 0;
      }
      if (handler) {
        try {
          res = await handler(context, () => dispatch(i + 1));
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err;
            res = await onError(err, context);
            isError = true;
          } else {
            throw err;
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context);
        }
      }
      if (res && (context.finalized === false || isError)) {
        context.res = res;
      }
      return context;
    }
    __name(dispatch, "dispatch");
  };
}, "compose");

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/hono/dist/utils/body.js
var parseBody = /* @__PURE__ */ __name(async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const headers = request instanceof HonoRequest ? request.raw.headers : request.headers;
  const contentType = headers.get("Content-Type");
  if (contentType?.startsWith("multipart/form-data") || contentType?.startsWith("application/x-www-form-urlencoded")) {
    return parseFormData(request, { all, dot });
  }
  return {};
}, "parseBody");
async function parseFormData(request, options) {
  const formData = await request.formData();
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
__name(parseFormData, "parseFormData");
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form[key] = value;
    } else {
      handleParsingAllValues(form, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form, key, value);
        delete form[key];
      }
    });
  }
  return form;
}
__name(convertFormDataToBodyData, "convertFormDataToBodyData");
var handleParsingAllValues = /* @__PURE__ */ __name((form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) {
      ;
      form[key].push(value);
    } else {
      form[key] = [form[key], value];
    }
  } else {
    if (!key.endsWith("[]")) {
      form[key] = value;
    } else {
      form[key] = [value];
    }
  }
}, "handleParsingAllValues");
var handleParsingNestedValues = /* @__PURE__ */ __name((form, key, value) => {
  if (/(?:^|\.)__proto__\./.test(key)) {
    return;
  }
  let nestedForm = form;
  const keys = key.split(".");
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) {
      nestedForm[key2] = value;
    } else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
}, "handleParsingNestedValues");

// node_modules/hono/dist/utils/url.js
var splitPath = /* @__PURE__ */ __name((path) => {
  const paths = path.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  return paths;
}, "splitPath");
var splitRoutingPath = /* @__PURE__ */ __name((routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
}, "splitRoutingPath");
var extractGroupsFromPath = /* @__PURE__ */ __name((path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return { groups, path };
}, "extractGroupsFromPath");
var replaceGroupMarks = /* @__PURE__ */ __name((paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) {
      if (paths[j].includes(mark)) {
        paths[j] = paths[j].replace(mark, groups[i][1]);
        break;
      }
    }
  }
  return paths;
}, "replaceGroupMarks");
var patternCache = {};
var getPattern = /* @__PURE__ */ __name((label, next) => {
  if (label === "*") {
    return "*";
  }
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) {
        patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey, match2[1], new RegExp(`^${match2[2]}(?=/${next})`)] : [label, match2[1], new RegExp(`^${match2[2]}$`)];
      } else {
        patternCache[cacheKey] = [label, match2[1], true];
      }
    }
    return patternCache[cacheKey];
  }
  return null;
}, "getPattern");
var tryDecode = /* @__PURE__ */ __name((str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
}, "tryDecode");
var tryDecodeURI = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURI), "tryDecodeURI");
var getPath = /* @__PURE__ */ __name((request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) {
      break;
    }
  }
  return url.slice(start, i);
}, "getPath");
var getPathNoStrict = /* @__PURE__ */ __name((request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
}, "getPathNoStrict");
var mergePath = /* @__PURE__ */ __name((base, sub, ...rest) => {
  if (rest.length) {
    sub = mergePath(sub, ...rest);
  }
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
}, "mergePath");
var checkOptionalParameter = /* @__PURE__ */ __name((path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) {
    return null;
  }
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) {
      basePath += "/" + segment;
    } else if (/\:/.test(segment)) {
      if (/\?/.test(segment)) {
        if (results.length === 0 && basePath === "") {
          results.push("/");
        } else {
          results.push(basePath);
        }
        const optionalSegment = segment.replace("?", "");
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else {
        basePath += "/" + segment;
      }
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
}, "checkOptionalParameter");
var _decodeURI = /* @__PURE__ */ __name((value) => {
  if (!/[%+]/.test(value)) {
    return value;
  }
  if (value.indexOf("+") !== -1) {
    value = value.replace(/\+/g, " ");
  }
  return value.indexOf("%") !== -1 ? tryDecode(value, decodeURIComponent_) : value;
}, "_decodeURI");
var _getQueryParam = /* @__PURE__ */ __name((url, key, multiple) => {
  let encoded;
  if (!multiple && key && !/[%+]/.test(key)) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) {
      return void 0;
    }
    if (!url.startsWith(key, keyIndex2 + 1)) {
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) {
      return void 0;
    }
  }
  const results = {};
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
      valueIndex = -1;
    }
    let name = url.slice(
      keyIndex + 1,
      valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
    );
    if (encoded) {
      name = _decodeURI(name);
    }
    keyIndex = nextKeyIndex;
    if (name === "") {
      continue;
    }
    let value;
    if (valueIndex === -1) {
      value = "";
    } else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) {
        value = _decodeURI(value);
      }
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) {
        results[name] = [];
      }
      ;
      results[name].push(value);
    } else {
      results[name] ??= value;
    }
  }
  return key ? results[key] : results;
}, "_getQueryParam");
var getQueryParam = _getQueryParam;
var getQueryParams = /* @__PURE__ */ __name((url, key) => {
  return _getQueryParam(url, key, true);
}, "getQueryParams");
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var tryDecodeURIComponent = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURIComponent_), "tryDecodeURIComponent");
var HonoRequest = class {
  static {
    __name(this, "HonoRequest");
  }
  /**
   * `.raw` can get the raw Request object.
   *
   * @see {@link https://hono.dev/docs/api/request#raw}
   *
   * @example
   * ```ts
   * // For Cloudflare Workers
   * app.post('/', async (c) => {
   *   const metadata = c.req.raw.cf?.hostMetadata?
   *   ...
   * })
   * ```
   */
  raw;
  #validatedData;
  // Short name of validatedData
  #matchResult;
  routeIndex = 0;
  /**
   * `.path` can get the pathname of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#path}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const pathname = c.req.path // `/about/me`
   * })
   * ```
   */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
    this.#validatedData = {};
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex][1][key];
    const param = this.#getParamValue(paramKey);
    return param && /\%/.test(param) ? tryDecodeURIComponent(param) : param;
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex][1]);
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) {
        decoded[key] = /\%/.test(value) ? tryDecodeURIComponent(value) : value;
      }
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) {
      return this.raw.headers.get(name) ?? void 0;
    }
    const headerData = {};
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = /* @__PURE__ */ __name((key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) {
      return cachedBody;
    }
    const anyCachedKey = Object.keys(bodyCache)[0];
    if (anyCachedKey) {
      return bodyCache[anyCachedKey].then((body) => {
        if (anyCachedKey === "json") {
          body = JSON.stringify(body);
        }
        return new Response(body)[key]();
      });
    }
    return bodyCache[key] = raw2[key]();
  }, "#cachedBody");
  /**
   * `.json()` can parse Request body of type `application/json`
   *
   * @see {@link https://hono.dev/docs/api/request#json}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.json()
   * })
   * ```
   */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
   * `.text()` can parse Request body of type `text/plain`
   *
   * @see {@link https://hono.dev/docs/api/request#text}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.text()
   * })
   * ```
   */
  text() {
    return this.#cachedBody("text");
  }
  /**
   * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
   *
   * @see {@link https://hono.dev/docs/api/request#arraybuffer}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.arrayBuffer()
   * })
   * ```
   */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
   * `.bytes()` parses the request body as a `Uint8Array`.
   *
   * @see {@link https://hono.dev/docs/api/request#bytes}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.bytes()
   * })
   * ```
   */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
   * Parses the request body as a `Blob`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.blob();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#blob
   */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
   * Parses the request body as `FormData`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.formData();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#formdata
   */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
   * Adds validated data to the request.
   *
   * @param target - The target of the validation.
   * @param data - The validated data to add.
   */
  addValidatedData(target, data) {
    this.#validatedData[target] = data;
  }
  valid(target) {
    return this.#validatedData[target];
  }
  /**
   * `.url()` can get the request url strings.
   *
   * @see {@link https://hono.dev/docs/api/request#url}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const url = c.req.url // `http://localhost:8787/about/me`
   *   ...
   * })
   * ```
   */
  get url() {
    return this.raw.url;
  }
  /**
   * `.method()` can get the method name of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#method}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const method = c.req.method // `GET`
   * })
   * ```
   */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
   * `.matchedRoutes()` can return a matched route in the handler
   *
   * @deprecated
   *
   * Use matchedRoutes helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#matchedroutes}
   *
   * @example
   * ```ts
   * app.use('*', async function logger(c, next) {
   *   await next()
   *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
   *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
   *     console.log(
   *       method,
   *       ' ',
   *       path,
   *       ' '.repeat(Math.max(10 - path.length, 0)),
   *       name,
   *       i === c.req.routeIndex ? '<- respond from here' : ''
   *     )
   *   })
   * })
   * ```
   */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
   * `routePath()` can retrieve the path registered within the handler
   *
   * @deprecated
   *
   * Use routePath helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#routepath}
   *
   * @example
   * ```ts
   * app.get('/posts/:id', (c) => {
   *   return c.json({ path: c.req.routePath })
   * })
   * ```
   */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = /* @__PURE__ */ __name((value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
}, "raw");
var resolveCallback = /* @__PURE__ */ __name(async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) {
      str = str.toString();
    }
    if (str instanceof Promise) {
      str = await str;
    }
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) {
    return Promise.resolve(str);
  }
  if (buffer) {
    buffer[0] += str;
  } else {
    buffer = [str];
  }
  const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context }))).then(
    (res) => Promise.all(
      res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))
    ).then(() => buffer[0])
  );
  if (preserveCallbacks) {
    return raw(await resStr, callbacks);
  } else {
    return resStr;
  }
}, "resolveCallback");

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = /* @__PURE__ */ __name((contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
}, "setDefaultContentType");
var createResponseInstance = /* @__PURE__ */ __name((body, init) => new Response(body, init), "createResponseInstance");
var Context = class {
  static {
    __name(this, "Context");
  }
  #rawRequest;
  #req;
  /**
   * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
   *
   * @see {@link https://hono.dev/docs/api/context#env}
   *
   * @example
   * ```ts
   * // Environment object for Cloudflare Workers
   * app.get('*', async c => {
   *   const counter = c.env.COUNTER
   * })
   * ```
   */
  env = {};
  #var;
  finalized = false;
  /**
   * `.error` can get the error object from the middleware if the Handler throws an error.
   *
   * @see {@link https://hono.dev/docs/api/context#error}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   await next()
   *   if (c.error) {
   *     // do something...
   *   }
   * })
   * ```
   */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
   * Creates an instance of the Context class.
   *
   * @param req - The Request object.
   * @param options - Optional configuration options for the context.
   */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
   * `.req` is the instance of {@link HonoRequest}.
   */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#event}
   * The FetchEvent associated with the current request.
   *
   * @throws Will throw an error if the context does not have a FetchEvent.
   */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no FetchEvent");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#executionctx}
   * The ExecutionContext associated with the current request.
   *
   * @throws Will throw an error if the context does not have an ExecutionContext.
   */
  get executionCtx() {
    if (this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no ExecutionContext");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#res}
   * The Response object for the current request.
   */
  get res() {
    return this.#res ||= createResponseInstance(null, {
      headers: this.#preparedHeaders ??= new Headers()
    });
  }
  /**
   * Sets the Response object for the current request.
   *
   * @param _res - The Response object to set.
   */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") {
          continue;
        }
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) {
            _res.headers.append("set-cookie", cookie);
          }
        } else {
          _res.headers.set(k, v);
        }
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
   * `.render()` can create a response within a layout.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   return c.render('Hello!')
   * })
   * ```
   */
  render = /* @__PURE__ */ __name((...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  }, "render");
  /**
   * Sets the layout for the response.
   *
   * @param layout - The layout to set.
   * @returns The layout function.
   */
  setLayout = /* @__PURE__ */ __name((layout) => this.#layout = layout, "setLayout");
  /**
   * Gets the current layout for the response.
   *
   * @returns The current layout function.
   */
  getLayout = /* @__PURE__ */ __name(() => this.#layout, "getLayout");
  /**
   * `.setRenderer()` can set the layout in the custom middleware.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```tsx
   * app.use('*', async (c, next) => {
   *   c.setRenderer((content) => {
   *     return c.html(
   *       <html>
   *         <body>
   *           <p>{content}</p>
   *         </body>
   *       </html>
   *     )
   *   })
   *   await next()
   * })
   * ```
   */
  setRenderer = /* @__PURE__ */ __name((renderer) => {
    this.#renderer = renderer;
  }, "setRenderer");
  /**
   * `.header()` can set headers.
   *
   * @see {@link https://hono.dev/docs/api/context#header}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  header = /* @__PURE__ */ __name((name, value, options) => {
    if (this.finalized) {
      this.#res = createResponseInstance(this.#res.body, this.#res);
    }
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) {
      headers.delete(name);
    } else if (options?.append) {
      headers.append(name, value);
    } else {
      headers.set(name, value);
    }
  }, "header");
  status = /* @__PURE__ */ __name((status) => {
    this.#status = status;
  }, "status");
  /**
   * `.set()` can set the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   c.set('message', 'Hono is hot!!')
   *   await next()
   * })
   * ```
   */
  set = /* @__PURE__ */ __name((key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  }, "set");
  /**
   * `.get()` can use the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   const message = c.get('message')
   *   return c.text(`The message is "${message}"`)
   * })
   * ```
   */
  get = /* @__PURE__ */ __name((key) => {
    return this.#var ? this.#var.get(key) : void 0;
  }, "get");
  /**
   * `.var` can access the value of a variable.
   *
   * @see {@link https://hono.dev/docs/api/context#var}
   *
   * @example
   * ```ts
   * const result = c.var.client.oneMethod()
   * ```
   */
  // c.var.propName is a read-only
  get var() {
    if (!this.#var) {
      return {};
    }
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    const responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders ?? new Headers();
    if (typeof arg === "object" && "headers" in arg) {
      const argHeaders = arg.headers instanceof Headers ? arg.headers : new Headers(arg.headers);
      for (const [key, value] of argHeaders) {
        if (key.toLowerCase() === "set-cookie") {
          responseHeaders.append(key, value);
        } else {
          responseHeaders.set(key, value);
        }
      }
    }
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        if (typeof v === "string") {
          responseHeaders.set(k, v);
        } else {
          responseHeaders.delete(k);
          for (const v2 of v) {
            responseHeaders.append(k, v2);
          }
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, { status, headers: responseHeaders });
  }
  newResponse = /* @__PURE__ */ __name((...args) => this.#newResponse(...args), "newResponse");
  /**
   * `.body()` can return the HTTP response.
   * You can set headers with `.header()` and set HTTP status code with `.status`.
   * This can also be set in `.text()`, `.json()` and so on.
   *
   * @see {@link https://hono.dev/docs/api/context#body}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *   // Set HTTP status code
   *   c.status(201)
   *
   *   // Return the response body
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  body = /* @__PURE__ */ __name((data, arg, headers) => this.#newResponse(data, arg, headers), "body");
  /**
   * `.text()` can render text as `Content-Type:text/plain`.
   *
   * @see {@link https://hono.dev/docs/api/context#text}
   *
   * @example
   * ```ts
   * app.get('/say', (c) => {
   *   return c.text('Hello!')
   * })
   * ```
   */
  text = /* @__PURE__ */ __name((text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(
      text,
      arg,
      setDefaultContentType(TEXT_PLAIN, headers)
    );
  }, "text");
  /**
   * `.json()` can render JSON as `Content-Type:application/json`.
   *
   * @see {@link https://hono.dev/docs/api/context#json}
   *
   * @example
   * ```ts
   * app.get('/api', (c) => {
   *   return c.json({ message: 'Hello!' })
   * })
   * ```
   */
  json = /* @__PURE__ */ __name((object, arg, headers) => {
    return this.#newResponse(
      JSON.stringify(object),
      arg,
      setDefaultContentType("application/json", headers)
    );
  }, "json");
  html = /* @__PURE__ */ __name((html, arg, headers) => {
    const res = /* @__PURE__ */ __name((html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers)), "res");
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  }, "html");
  /**
   * `.redirect()` can Redirect, default status code is 302.
   *
   * @see {@link https://hono.dev/docs/api/context#redirect}
   *
   * @example
   * ```ts
   * app.get('/redirect', (c) => {
   *   return c.redirect('/')
   * })
   * app.get('/redirect-permanently', (c) => {
   *   return c.redirect('/', 301)
   * })
   * ```
   */
  redirect = /* @__PURE__ */ __name((location, status) => {
    const locationString = String(location);
    this.header(
      "Location",
      // Multibyes should be encoded
      // eslint-disable-next-line no-control-regex
      !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
    );
    return this.newResponse(null, status ?? 302);
  }, "redirect");
  /**
   * `.notFound()` can return the Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/context#notfound}
   *
   * @example
   * ```ts
   * app.get('/notfound', (c) => {
   *   return c.notFound()
   * })
   * ```
   */
  notFound = /* @__PURE__ */ __name(() => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  }, "notFound");
};

// node_modules/hono/dist/router.js
var METHOD_NAME_ALL = "ALL";
var METHOD_NAME_ALL_LOWERCASE = "all";
var METHODS = ["get", "post", "put", "delete", "options", "patch"];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
  static {
    __name(this, "UnsupportedPathError");
  }
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/hono-base.js
var notFoundHandler = /* @__PURE__ */ __name((c) => {
  return c.text("404 Not Found", 404);
}, "notFoundHandler");
var errorHandler = /* @__PURE__ */ __name((err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
}, "errorHandler");
var Hono = class _Hono {
  static {
    __name(this, "_Hono");
  }
  get;
  post;
  put;
  delete;
  options;
  patch;
  all;
  on;
  use;
  /*
    This class is like an abstract class and does not have a router.
    To use it, inherit the class and implement router in the constructor.
  */
  router;
  getPath;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1, ...args) => {
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.#addRoute(method, this.#path, args1);
        }
        args.forEach((handler) => {
          this.#addRoute(method, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          handlers.map((handler) => {
            this.#addRoute(m.toUpperCase(), this.#path, handler);
          });
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") {
        this.#path = arg1;
      } else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute(METHOD_NAME_ALL, this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new _Hono({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  errorHandler = errorHandler;
  /**
   * `.route()` allows grouping other Hono instance in routes.
   *
   * @see {@link https://hono.dev/docs/api/routing#grouping}
   *
   * @param {string} path - base Path
   * @param {Hono} app - other Hono instance
   * @returns {Hono} routed Hono instance
   *
   * @example
   * ```ts
   * const app = new Hono()
   * const app2 = new Hono()
   *
   * app2.get("/user", (c) => c.text("user"))
   * app.route("/api", app2) // GET /api/user
   * ```
   */
  route(path, app2) {
    const subApp = this.basePath(path);
    app2.routes.map((r) => {
      let handler;
      if (app2.errorHandler === errorHandler) {
        handler = r.handler;
      } else {
        handler = /* @__PURE__ */ __name(async (c, next) => (await compose([], app2.errorHandler)(c, () => r.handler(c, next))).res, "handler");
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler, r.basePath);
    });
    return this;
  }
  /**
   * `.basePath()` allows base paths to be specified.
   *
   * @see {@link https://hono.dev/docs/api/routing#base-path}
   *
   * @param {string} path - base Path
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * const api = new Hono().basePath('/api')
   * ```
   */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
   * `.onError()` handles an error and returns a customized Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#error-handling}
   *
   * @param {ErrorHandler} handler - request Handler for error
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.onError((err, c) => {
   *   console.error(`${err}`)
   *   return c.text('Custom Error Message', 500)
   * })
   * ```
   */
  onError = /* @__PURE__ */ __name((handler) => {
    this.errorHandler = handler;
    return this;
  }, "onError");
  /**
   * `.notFound()` allows you to customize a Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#not-found}
   *
   * @param {NotFoundHandler} handler - request handler for not-found
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.notFound((c) => {
   *   return c.text('Custom 404 Message', 404)
   * })
   * ```
   */
  notFound = /* @__PURE__ */ __name((handler) => {
    this.#notFoundHandler = handler;
    return this;
  }, "notFound");
  /**
   * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
   *
   * @see {@link https://hono.dev/docs/api/hono#mount}
   *
   * @param {string} path - base Path
   * @param {Function} applicationHandler - other Request Handler
   * @param {MountOptions} [options] - options of `.mount()`
   * @returns {Hono} mounted Hono instance
   *
   * @example
   * ```ts
   * import { Router as IttyRouter } from 'itty-router'
   * import { Hono } from 'hono'
   * // Create itty-router application
   * const ittyRouter = IttyRouter()
   * // GET /itty-router/hello
   * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
   *
   * const app = new Hono()
   * app.mount('/itty-router', ittyRouter.handle)
   * ```
   *
   * @example
   * ```ts
   * const app = new Hono()
   * // Send the request to another application without modification.
   * app.mount('/app', anotherApp, {
   *   replaceRequest: (req) => req,
   * })
   * ```
   */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") {
        optionHandler = options;
      } else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) {
          replaceRequest = /* @__PURE__ */ __name((request) => request, "replaceRequest");
        } else {
          replaceRequest = options.replaceRequest;
        }
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler = /* @__PURE__ */ __name(async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) {
        return res;
      }
      await next();
    }, "handler");
    this.#addRoute(METHOD_NAME_ALL, mergePath(path, "*"), handler);
    return this;
  }
  #addRoute(method, path, handler, baseRoutePath) {
    method = method.toUpperCase();
    path = mergePath(this._basePath, path);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path,
      method,
      handler
    };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) {
      return this.errorHandler(err, c);
    }
    throw err;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") {
      return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    }
    const path = this.getPath(request, { env });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then(
        (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
      ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) {
          throw new Error(
            "Context is not finalized. Did you forget to return a Response object or `await next()`?"
          );
        }
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
   * `.fetch()` will be entry point of your app.
   *
   * @see {@link https://hono.dev/docs/api/hono#fetch}
   *
   * @param {Request} request - request Object of request
   * @param {Env} Env - env Object
   * @param {ExecutionContext} - context of execution
   * @returns {Response | Promise<Response>} response of request
   *
   */
  fetch = /* @__PURE__ */ __name((request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  }, "fetch");
  /**
   * `.request()` is a useful method for testing.
   * You can pass a URL or pathname to send a GET request.
   * app will return a Response object.
   * ```ts
   * test('GET /hello is ok', async () => {
   *   const res = await app.request('/hello')
   *   expect(res.status).toBe(200)
   * })
   * ```
   * @see https://hono.dev/docs/api/hono#request
   */
  request = /* @__PURE__ */ __name((input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) {
      return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    }
    input = input.toString();
    return this.fetch(
      new Request(
        /^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`,
        requestInit
      ),
      Env,
      executionCtx
    );
  }, "request");
  /**
   * `.fire()` automatically adds a global fetch event listener.
   * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
   * @deprecated
   * Use `fire` from `hono/service-worker` instead.
   * ```ts
   * import { Hono } from 'hono'
   * import { fire } from 'hono/service-worker'
   *
   * const app = new Hono()
   * // ...
   * fire(app)
   * ```
   * @see https://hono.dev/docs/api/hono#fire
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
   * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
   */
  fire = /* @__PURE__ */ __name(() => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  }, "fire");
};

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = /* @__PURE__ */ __name(((method2, path2) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path2];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path2.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  }), "match2");
  this.match = match2;
  return match2(method, path);
}
__name(match, "match");

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = ".*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
__name(compareKey, "compareKey");
var Node = class _Node {
  static {
    __name(this, "_Node");
  }
  #index;
  #varIndex;
  #children = /* @__PURE__ */ Object.create(null);
  insert(tokens, index, paramMap, context, pathErrorCheckOnly) {
    if (tokens.length === 0) {
      if (this.#index !== void 0) {
        throw PATH_ERROR;
      }
      if (pathErrorCheckOnly) {
        return;
      }
      this.#index = index;
      return;
    }
    const [token, ...restTokens] = tokens;
    const pattern = token === "*" ? restTokens.length === 0 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
    let node;
    if (pattern) {
      const name = pattern[1];
      let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
      if (name && pattern[2]) {
        if (regexpStr === ".*") {
          throw PATH_ERROR;
        }
        regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
        if (/\((?!\?:)/.test(regexpStr)) {
          throw PATH_ERROR;
        }
      }
      node = this.#children[regexpStr];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[regexpStr] = new _Node();
        if (name !== "") {
          node.#varIndex = context.varIndex++;
        }
      }
      if (!pathErrorCheckOnly && name !== "") {
        paramMap.push([name, node.#varIndex]);
      }
    } else {
      node = this.#children[token];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[token] = new _Node();
      }
    }
    node.insert(restTokens, index, paramMap, context, pathErrorCheckOnly);
  }
  buildRegExpStr() {
    const childKeys = Object.keys(this.#children).sort(compareKey);
    const strList = childKeys.map((k) => {
      const c = this.#children[k];
      return (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + c.buildRegExpStr();
    });
    if (typeof this.#index === "number") {
      strList.unshift(`#${this.#index}`);
    }
    if (strList.length === 0) {
      return "";
    }
    if (strList.length === 1) {
      return strList[0];
    }
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  static {
    __name(this, "Trie");
  }
  #context = { varIndex: 0 };
  #root = new Node();
  insert(path, index, pathErrorCheckOnly) {
    const paramAssoc = [];
    const groups = [];
    for (let i = 0; ; ) {
      let replaced = false;
      path = path.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) {
        break;
      }
    }
    const tokens = path.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) {
        if (tokens[j].indexOf(mark) !== -1) {
          tokens[j] = tokens[j].replace(mark, groups[i][1]);
          break;
        }
      }
    }
    this.#root.insert(tokens, index, paramAssoc, this.#context, pathErrorCheckOnly);
    return paramAssoc;
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") {
      return [/^$/, [], []];
    }
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
var nullMatcher = [/^$/, [], /* @__PURE__ */ Object.create(null)];
var wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(
    path === "*" ? "" : `^${path.replace(
      /\/\*$|([.\\+*[^\]$()])/g,
      (_, metaChar) => metaChar ? `\\${metaChar}` : "(?:|/.*)"
    )}$`
  );
}
__name(buildWildcardRegExp, "buildWildcardRegExp");
function clearWildcardRegExpCache() {
  wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
}
__name(clearWildcardRegExpCache, "clearWildcardRegExpCache");
function buildMatcherFromPreprocessedRoutes(routes) {
  const trie = new Trie();
  const handlerData = [];
  if (routes.length === 0) {
    return nullMatcher;
  }
  const routesWithStaticPathFlag = routes.map(
    (route) => [!/\*|\/:/.test(route[0]), ...route]
  ).sort(
    ([isStaticA, pathA], [isStaticB, pathB]) => isStaticA ? 1 : isStaticB ? -1 : pathA.length - pathB.length
  );
  const staticMap = /* @__PURE__ */ Object.create(null);
  for (let i = 0, j = -1, len = routesWithStaticPathFlag.length; i < len; i++) {
    const [pathErrorCheckOnly, path, handlers] = routesWithStaticPathFlag[i];
    if (pathErrorCheckOnly) {
      staticMap[path] = [handlers.map(([h]) => [h, /* @__PURE__ */ Object.create(null)]), emptyParam];
    } else {
      j++;
    }
    let paramAssoc;
    try {
      paramAssoc = trie.insert(path, j, pathErrorCheckOnly);
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
    if (pathErrorCheckOnly) {
      continue;
    }
    handlerData[j] = handlers.map(([h, paramCount]) => {
      const paramIndexMap = /* @__PURE__ */ Object.create(null);
      paramCount -= 1;
      for (; paramCount >= 0; paramCount--) {
        const [key, value] = paramAssoc[paramCount];
        paramIndexMap[key] = value;
      }
      return [h, paramIndexMap];
    });
  }
  const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
  for (let i = 0, len = handlerData.length; i < len; i++) {
    for (let j = 0, len2 = handlerData[i].length; j < len2; j++) {
      const map = handlerData[i][j]?.[1];
      if (!map) {
        continue;
      }
      const keys = Object.keys(map);
      for (let k = 0, len3 = keys.length; k < len3; k++) {
        map[keys[k]] = paramReplacementMap[map[keys[k]]];
      }
    }
  }
  const handlerMap = [];
  for (const i in indexReplacementMap) {
    handlerMap[i] = handlerData[indexReplacementMap[i]];
  }
  return [regexp, handlerMap, staticMap];
}
__name(buildMatcherFromPreprocessedRoutes, "buildMatcherFromPreprocessedRoutes");
function findMiddleware(middleware, path) {
  if (!middleware) {
    return void 0;
  }
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path)) {
      return [...middleware[k]];
    }
  }
  return void 0;
}
__name(findMiddleware, "findMiddleware");
var RegExpRouter = class {
  static {
    __name(this, "RegExpRouter");
  }
  name = "RegExpRouter";
  #middleware;
  #routes;
  constructor() {
    this.#middleware = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
    this.#routes = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
  }
  add(method, path, handler) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware || !routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    if (!middleware[method]) {
      ;
      [middleware, routes].forEach((handlerMap) => {
        handlerMap[method] = /* @__PURE__ */ Object.create(null);
        Object.keys(handlerMap[METHOD_NAME_ALL]).forEach((p) => {
          handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
        });
      });
    }
    if (path === "/*") {
      path = "*";
    }
    const paramCount = (path.match(/\/:/g) || []).length;
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      if (method === METHOD_NAME_ALL) {
        Object.keys(middleware).forEach((m) => {
          middleware[m][path] ||= findMiddleware(middleware[m], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
        });
      } else {
        middleware[method][path] ||= findMiddleware(middleware[method], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
      }
      Object.keys(middleware).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(middleware[m]).forEach((p) => {
            re.test(p) && middleware[m][p].push([handler, paramCount]);
          });
        }
      });
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(routes[m]).forEach(
            (p) => re.test(p) && routes[m][p].push([handler, paramCount])
          );
        }
      });
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (let i = 0, len = paths.length; i < len; i++) {
      const path2 = paths[i];
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          routes[m][path2] ||= [
            ...findMiddleware(middleware[m], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || []
          ];
          routes[m][path2].push([handler, paramCount - len + i + 1]);
        }
      });
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = /* @__PURE__ */ Object.create(null);
    Object.keys(this.#routes).concat(Object.keys(this.#middleware)).forEach((method) => {
      matchers[method] ||= this.#buildMatcher(method);
    });
    this.#middleware = this.#routes = void 0;
    clearWildcardRegExpCache();
    return matchers;
  }
  #buildMatcher(method) {
    const routes = [];
    let hasOwnRoute = method === METHOD_NAME_ALL;
    [this.#middleware, this.#routes].forEach((r) => {
      const ownRoute = r[method] ? Object.keys(r[method]).map((path) => [path, r[method][path]]) : [];
      if (ownRoute.length !== 0) {
        hasOwnRoute ||= true;
        routes.push(...ownRoute);
      } else if (method !== METHOD_NAME_ALL) {
        routes.push(
          ...Object.keys(r[METHOD_NAME_ALL]).map((path) => [path, r[METHOD_NAME_ALL][path]])
        );
      }
    });
    if (!hasOwnRoute) {
      return null;
    } else {
      return buildMatcherFromPreprocessedRoutes(routes);
    }
  }
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  static {
    __name(this, "SmartRouter");
  }
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler) {
    if (!this.#routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    this.#routes.push([method, path, handler]);
  }
  match(method, path) {
    if (!this.#routes) {
      throw new Error("Fatal error");
    }
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
          router.add(...routes[i2]);
        }
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) {
          continue;
        }
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) {
      throw new Error("Fatal error");
    }
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) {
      throw new Error("No active router has been determined yet.");
    }
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = /* @__PURE__ */ Object.create(null);
var hasChildren = /* @__PURE__ */ __name((children) => {
  for (const _ in children) {
    return true;
  }
  return false;
}, "hasChildren");
var Node2 = class _Node2 {
  static {
    __name(this, "_Node");
  }
  #methods;
  #children;
  #patterns;
  #order = 0;
  #params = emptyParams;
  constructor(method, handler, children) {
    this.#children = children || /* @__PURE__ */ Object.create(null);
    this.#methods = [];
    if (method && handler) {
      const m = /* @__PURE__ */ Object.create(null);
      m[method] = { handler, possibleKeys: [], score: 0 };
      this.#methods = [m];
    }
    this.#patterns = [];
  }
  insert(method, path, handler) {
    this.#order = ++this.#order;
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = [];
    for (let i = 0, len = parts.length; i < len; i++) {
      const p = parts[i];
      const nextP = parts[i + 1];
      const pattern = getPattern(p, nextP);
      const key = Array.isArray(pattern) ? pattern[0] : p;
      if (key in curNode.#children) {
        curNode = curNode.#children[key];
        if (pattern) {
          possibleKeys.push(pattern[1]);
        }
        continue;
      }
      curNode.#children[key] = new _Node2();
      if (pattern) {
        curNode.#patterns.push(pattern);
        possibleKeys.push(pattern[1]);
      }
      curNode = curNode.#children[key];
    }
    curNode.#methods.push({
      [method]: {
        handler,
        possibleKeys: possibleKeys.filter((v, i, a) => a.indexOf(v) === i),
        score: this.#order
      }
    });
    return curNode;
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m[METHOD_NAME_ALL];
      const processedSet = {};
      if (handlerSet !== void 0) {
        handlerSet.params = /* @__PURE__ */ Object.create(null);
        handlerSets.push(handlerSet);
        if (nodeParams !== emptyParams || params && params !== emptyParams) {
          for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
            const key = handlerSet.possibleKeys[i2];
            const processed = processedSet[handlerSet.score];
            handlerSet.params[key] = params?.[key] && !processed ? params[key] : nodeParams[key] ?? params?.[key];
            processedSet[handlerSet.score] = true;
          }
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    const curNode = this;
    let curNodes = [curNode];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) {
              this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            }
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else {
            tempNodes.push(nextNode);
          }
        }
        for (let k = 0, len3 = node.#patterns.length; k < len3; k++) {
          const pattern = node.#patterns[k];
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (pattern === "*") {
            const astNode = node.#children["*"];
            if (astNode) {
              this.#pushHandlerSets(handlerSets, astNode, method, node.#params);
              astNode.#params = params;
              tempNodes.push(astNode);
            }
            continue;
          }
          const [key, name, matcher] = pattern;
          if (!part && !(matcher instanceof RegExp)) {
            continue;
          }
          const child = node.#children[key];
          if (matcher instanceof RegExp) {
            if (partOffsets === null) {
              partOffsets = new Array(len);
              let offset = path[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path.substring(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (hasChildren(child.#children)) {
                child.#params = params;
                const componentCount = m[0].match(/\//)?.length ?? 0;
                const targetCurNodes = curNodesQueue[componentCount] ||= [];
                targetCurNodes.push(child);
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  params,
                  node.#params
                );
              }
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets.length > 1) {
      handlerSets.sort((a, b) => {
        return a.score - b.score;
      });
    }
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  static {
    __name(this, "TrieRouter");
  }
  name = "TrieRouter";
  #node;
  constructor() {
    this.#node = new Node2();
  }
  add(method, path, handler) {
    const results = checkOptionalParameter(path);
    if (results) {
      for (let i = 0, len = results.length; i < len; i++) {
        this.#node.insert(method, results[i], handler);
      }
      return;
    }
    this.#node.insert(method, path, handler);
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// node_modules/hono/dist/hono.js
var Hono2 = class extends Hono {
  static {
    __name(this, "Hono");
  }
  /**
   * Creates an instance of the Hono class.
   *
   * @param options - Optional configuration options for the Hono instance.
   */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()]
    });
  }
};

// node_modules/hono/dist/middleware/cors/index.js
var cors = /* @__PURE__ */ __name((options) => {
  const opts = {
    origin: "*",
    allowMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH"],
    allowHeaders: [],
    exposeHeaders: [],
    ...options
  };
  const findAllowOrigin = ((optsOrigin) => {
    if (typeof optsOrigin === "string") {
      if (optsOrigin === "*") {
        return () => optsOrigin;
      } else {
        return (origin) => optsOrigin === origin ? origin : null;
      }
    } else if (typeof optsOrigin === "function") {
      return optsOrigin;
    } else {
      return (origin) => optsOrigin.includes(origin) ? origin : null;
    }
  })(opts.origin);
  const findAllowMethods = ((optsAllowMethods) => {
    if (typeof optsAllowMethods === "function") {
      return optsAllowMethods;
    } else if (Array.isArray(optsAllowMethods)) {
      return () => optsAllowMethods;
    } else {
      return () => [];
    }
  })(opts.allowMethods);
  return /* @__PURE__ */ __name(async function cors2(c, next) {
    function set(key, value) {
      c.res.headers.set(key, value);
    }
    __name(set, "set");
    const allowOrigin = await findAllowOrigin(c.req.header("origin") || "", c);
    if (allowOrigin) {
      set("Access-Control-Allow-Origin", allowOrigin);
    }
    if (opts.credentials) {
      set("Access-Control-Allow-Credentials", "true");
    }
    if (opts.exposeHeaders?.length) {
      set("Access-Control-Expose-Headers", opts.exposeHeaders.join(","));
    }
    if (c.req.method === "OPTIONS") {
      if (opts.origin !== "*") {
        set("Vary", "Origin");
      }
      if (opts.maxAge != null) {
        set("Access-Control-Max-Age", opts.maxAge.toString());
      }
      const allowMethods = await findAllowMethods(c.req.header("origin") || "", c);
      if (allowMethods.length) {
        set("Access-Control-Allow-Methods", allowMethods.join(","));
      }
      let headers = opts.allowHeaders;
      if (!headers?.length) {
        const requestHeaders = c.req.header("Access-Control-Request-Headers");
        if (requestHeaders) {
          headers = requestHeaders.split(/\s*,\s*/);
        }
      }
      if (headers?.length) {
        set("Access-Control-Allow-Headers", headers.join(","));
        c.res.headers.append("Vary", "Access-Control-Request-Headers");
      }
      c.res.headers.delete("Content-Length");
      c.res.headers.delete("Content-Type");
      return new Response(null, {
        headers: c.res.headers,
        status: 204,
        statusText: "No Content"
      });
    }
    await next();
    if (opts.origin !== "*") {
      c.header("Vary", "Origin", { append: true });
    }
  }, "cors2");
}, "cors");

// node_modules/hono/dist/middleware/secure-headers/secure-headers.js
var HEADERS_MAP = {
  crossOriginEmbedderPolicy: ["Cross-Origin-Embedder-Policy", "require-corp"],
  crossOriginResourcePolicy: ["Cross-Origin-Resource-Policy", "same-origin"],
  crossOriginOpenerPolicy: ["Cross-Origin-Opener-Policy", "same-origin"],
  originAgentCluster: ["Origin-Agent-Cluster", "?1"],
  referrerPolicy: ["Referrer-Policy", "no-referrer"],
  strictTransportSecurity: ["Strict-Transport-Security", "max-age=15552000; includeSubDomains"],
  xContentTypeOptions: ["X-Content-Type-Options", "nosniff"],
  xDnsPrefetchControl: ["X-DNS-Prefetch-Control", "off"],
  xDownloadOptions: ["X-Download-Options", "noopen"],
  xFrameOptions: ["X-Frame-Options", "SAMEORIGIN"],
  xPermittedCrossDomainPolicies: ["X-Permitted-Cross-Domain-Policies", "none"],
  xXssProtection: ["X-XSS-Protection", "0"]
};
var DEFAULT_OPTIONS = {
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: true,
  crossOriginOpenerPolicy: true,
  originAgentCluster: true,
  referrerPolicy: true,
  strictTransportSecurity: true,
  xContentTypeOptions: true,
  xDnsPrefetchControl: true,
  xDownloadOptions: true,
  xFrameOptions: true,
  xPermittedCrossDomainPolicies: true,
  xXssProtection: true,
  removePoweredBy: true,
  permissionsPolicy: {}
};
var secureHeaders = /* @__PURE__ */ __name((customOptions) => {
  const options = { ...DEFAULT_OPTIONS, ...customOptions };
  const headersToSet = getFilteredHeaders(options);
  const callbacks = [];
  if (options.contentSecurityPolicy) {
    const [callback, value] = getCSPDirectives(options.contentSecurityPolicy);
    if (callback) {
      callbacks.push(callback);
    }
    headersToSet.push(["Content-Security-Policy", value]);
  }
  if (options.contentSecurityPolicyReportOnly) {
    const [callback, value] = getCSPDirectives(options.contentSecurityPolicyReportOnly);
    if (callback) {
      callbacks.push(callback);
    }
    headersToSet.push(["Content-Security-Policy-Report-Only", value]);
  }
  if (options.permissionsPolicy && Object.keys(options.permissionsPolicy).length > 0) {
    headersToSet.push([
      "Permissions-Policy",
      getPermissionsPolicyDirectives(options.permissionsPolicy)
    ]);
  }
  if (options.reportingEndpoints) {
    headersToSet.push(["Reporting-Endpoints", getReportingEndpoints(options.reportingEndpoints)]);
  }
  if (options.reportTo) {
    headersToSet.push(["Report-To", getReportToOptions(options.reportTo)]);
  }
  return /* @__PURE__ */ __name(async function secureHeaders2(ctx, next) {
    const headersToSetForReq = callbacks.length === 0 ? headersToSet : callbacks.reduce((acc, cb) => cb(ctx, acc), headersToSet);
    await next();
    setHeaders(ctx, headersToSetForReq);
    if (options?.removePoweredBy) {
      ctx.res.headers.delete("X-Powered-By");
    }
  }, "secureHeaders2");
}, "secureHeaders");
function getFilteredHeaders(options) {
  return Object.entries(HEADERS_MAP).filter(([key]) => options[key]).map(([key, defaultValue]) => {
    const overrideValue = options[key];
    return typeof overrideValue === "string" ? [defaultValue[0], overrideValue] : defaultValue;
  });
}
__name(getFilteredHeaders, "getFilteredHeaders");
function getCSPDirectives(contentSecurityPolicy) {
  const callbacks = [];
  const resultValues = [];
  for (const [directive, value] of Object.entries(contentSecurityPolicy)) {
    const valueArray = Array.isArray(value) ? value : [value];
    valueArray.forEach((value2, i) => {
      if (typeof value2 === "function") {
        const index = i * 2 + 2 + resultValues.length;
        callbacks.push((ctx, values) => {
          values[index] = value2(ctx, directive);
        });
      }
    });
    resultValues.push(
      directive.replace(
        /[A-Z]+(?![a-z])|[A-Z]/g,
        (match2, offset) => offset ? "-" + match2.toLowerCase() : match2.toLowerCase()
      ),
      ...valueArray.flatMap((value2) => [" ", value2]),
      "; "
    );
  }
  resultValues.pop();
  return callbacks.length === 0 ? [void 0, resultValues.join("")] : [
    (ctx, headersToSet) => headersToSet.map((values) => {
      if (values[0] === "Content-Security-Policy" || values[0] === "Content-Security-Policy-Report-Only") {
        const clone = values[1].slice();
        callbacks.forEach((cb) => {
          cb(ctx, clone);
        });
        return [values[0], clone.join("")];
      } else {
        return values;
      }
    }),
    resultValues
  ];
}
__name(getCSPDirectives, "getCSPDirectives");
function getPermissionsPolicyDirectives(policy) {
  return Object.entries(policy).map(([directive, value]) => {
    const kebabDirective = camelToKebab(directive);
    if (typeof value === "boolean") {
      return `${kebabDirective}=${value ? "*" : "none"}`;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return `${kebabDirective}=()`;
      }
      if (value.length === 1 && (value[0] === "*" || value[0] === "none")) {
        return `${kebabDirective}=${value[0]}`;
      }
      const allowlist = value.map((item) => ["self", "src"].includes(item) ? item : `"${item}"`);
      return `${kebabDirective}=(${allowlist.join(" ")})`;
    }
    return "";
  }).filter(Boolean).join(", ");
}
__name(getPermissionsPolicyDirectives, "getPermissionsPolicyDirectives");
function camelToKebab(str) {
  return str.replace(/([a-z\d])([A-Z])/g, "$1-$2").toLowerCase();
}
__name(camelToKebab, "camelToKebab");
function getReportingEndpoints(reportingEndpoints = []) {
  return reportingEndpoints.map((endpoint) => `${endpoint.name}="${endpoint.url}"`).join(", ");
}
__name(getReportingEndpoints, "getReportingEndpoints");
function getReportToOptions(reportTo = []) {
  return reportTo.map((option) => JSON.stringify(option)).join(", ");
}
__name(getReportToOptions, "getReportToOptions");
function setHeaders(ctx, headersToSet) {
  headersToSet.forEach(([header, value]) => {
    ctx.res.headers.set(header, value);
  });
}
__name(setHeaders, "setHeaders");

// node_modules/hono/dist/utils/compress.js
var COMPRESSIBLE_CONTENT_TYPE_REGEX = /^\s*(?:text\/(?!event-stream(?:[;\s]|$))[^;\s]+|application\/(?:javascript|json|xml|xml-dtd|ecmascript|dart|msgpack|postscript|rtf|tar|toml|vnd\.dart|vnd\.ms-fontobject|vnd\.ms-opentype|vnd\.msgpack|wasm|x-httpd-php|x-javascript|x-msgpack|x-ns-proxy-autoconfig|x-sh|x-tar|x-virtualbox-hdd|x-virtualbox-ova|x-virtualbox-ovf|x-virtualbox-vbox|x-virtualbox-vdi|x-virtualbox-vhd|x-virtualbox-vmdk|x-www-form-urlencoded)|font\/(?:otf|ttf)|image\/(?:bmp|vnd\.adobe\.photoshop|vnd\.microsoft\.icon|vnd\.ms-dds|x-icon|x-ms-bmp)|message\/rfc822|model\/gltf-binary|x-shader\/x-fragment|x-shader\/x-vertex|[^;\s]+?\+(?:json|text|xml|yaml|msgpack))(?:[;\s]|$)/i;

// node_modules/hono/dist/utils/mime.js
var getMimeType = /* @__PURE__ */ __name((filename, mimes = baseMimes) => {
  const regexp = /\.([a-zA-Z0-9]+?)$/;
  const match2 = filename.match(regexp);
  if (!match2) {
    return;
  }
  return mimes[match2[1].toLowerCase()];
}, "getMimeType");
var _baseMimes = {
  aac: "audio/aac",
  avi: "video/x-msvideo",
  avif: "image/avif",
  av1: "video/av1",
  bin: "application/octet-stream",
  bmp: "image/bmp",
  css: "text/css; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  eot: "application/vnd.ms-fontobject",
  epub: "application/epub+zip",
  gif: "image/gif",
  gz: "application/gzip",
  htm: "text/html; charset=utf-8",
  html: "text/html; charset=utf-8",
  ico: "image/x-icon",
  ics: "text/calendar; charset=utf-8",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript; charset=utf-8",
  json: "application/json",
  jsonld: "application/ld+json",
  map: "application/json",
  mid: "audio/x-midi",
  midi: "audio/x-midi",
  mjs: "text/javascript; charset=utf-8",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  mpeg: "video/mpeg",
  oga: "audio/ogg",
  ogv: "video/ogg",
  ogx: "application/ogg",
  opus: "audio/opus",
  otf: "font/otf",
  pdf: "application/pdf",
  png: "image/png",
  rtf: "application/rtf",
  svg: "image/svg+xml; charset=utf-8",
  tif: "image/tiff",
  tiff: "image/tiff",
  ts: "video/mp2t",
  ttf: "font/ttf",
  txt: "text/plain; charset=utf-8",
  wasm: "application/wasm",
  webm: "video/webm",
  weba: "audio/webm",
  webmanifest: "application/manifest+json",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
  xhtml: "application/xhtml+xml; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  zip: "application/zip",
  "3gp": "video/3gpp",
  "3g2": "video/3gpp2",
  gltf: "model/gltf+json",
  glb: "model/gltf-binary"
};
var baseMimes = _baseMimes;

// node_modules/hono/dist/middleware/serve-static/path.js
var defaultJoin = /* @__PURE__ */ __name((...paths) => {
  let result = paths.filter((p) => p !== "").join("/");
  result = result.replace(/(?<=\/)\/+/g, "");
  const segments = result.split("/");
  const resolved = [];
  for (const segment of segments) {
    if (segment === ".." && resolved.length > 0 && resolved.at(-1) !== "..") {
      resolved.pop();
    } else if (segment !== ".") {
      resolved.push(segment);
    }
  }
  return resolved.join("/") || ".";
}, "defaultJoin");

// node_modules/hono/dist/middleware/serve-static/index.js
var ENCODINGS = {
  br: ".br",
  zstd: ".zst",
  gzip: ".gz"
};
var ENCODINGS_ORDERED_KEYS = Object.keys(ENCODINGS);
var DEFAULT_DOCUMENT = "index.html";
var serveStatic = /* @__PURE__ */ __name((options) => {
  const root = options.root ?? "./";
  const optionPath = options.path;
  const join = options.join ?? defaultJoin;
  return async (c, next) => {
    if (c.finalized) {
      return next();
    }
    let filename;
    if (options.path) {
      filename = options.path;
    } else {
      try {
        filename = tryDecodeURI(c.req.path);
        if (/(?:^|[\/\\])\.{1,2}(?:$|[\/\\])|[\/\\]{2,}|\\/.test(filename)) {
          throw new Error();
        }
      } catch {
        await options.onNotFound?.(c.req.path, c);
        return next();
      }
    }
    let path = join(
      root,
      !optionPath && options.rewriteRequestPath ? options.rewriteRequestPath(filename) : filename
    );
    if (options.isDir && await options.isDir(path)) {
      path = join(path, DEFAULT_DOCUMENT);
    }
    const getContent = options.getContent;
    let content = await getContent(path, c);
    if (content instanceof Response) {
      return c.newResponse(content.body, content);
    }
    if (content) {
      const mimeType = options.mimes && getMimeType(path, options.mimes) || getMimeType(path);
      c.header("Content-Type", mimeType || "application/octet-stream");
      if (options.precompressed && (!mimeType || COMPRESSIBLE_CONTENT_TYPE_REGEX.test(mimeType))) {
        const acceptEncodingSet = new Set(
          c.req.header("Accept-Encoding")?.split(",").map((encoding) => encoding.trim())
        );
        for (const encoding of ENCODINGS_ORDERED_KEYS) {
          if (!acceptEncodingSet.has(encoding)) {
            continue;
          }
          const compressedContent = await getContent(path + ENCODINGS[encoding], c);
          if (compressedContent) {
            content = compressedContent;
            c.header("Content-Encoding", encoding);
            c.header("Vary", "Accept-Encoding", { append: true });
            break;
          }
        }
      }
      await options.onFound?.(path, c);
      return c.body(content);
    }
    await options.onNotFound?.(path, c);
    await next();
    return;
  };
}, "serveStatic");

// node_modules/hono/dist/adapter/cloudflare-workers/utils.js
var getContentFromKVAsset = /* @__PURE__ */ __name(async (path, options) => {
  let ASSET_MANIFEST;
  if (options && options.manifest) {
    if (typeof options.manifest === "string") {
      ASSET_MANIFEST = JSON.parse(options.manifest);
    } else {
      ASSET_MANIFEST = options.manifest;
    }
  } else {
    if (typeof __STATIC_CONTENT_MANIFEST === "string") {
      ASSET_MANIFEST = JSON.parse(__STATIC_CONTENT_MANIFEST);
    } else {
      ASSET_MANIFEST = __STATIC_CONTENT_MANIFEST;
    }
  }
  let ASSET_NAMESPACE;
  if (options && options.namespace) {
    ASSET_NAMESPACE = options.namespace;
  } else {
    ASSET_NAMESPACE = __STATIC_CONTENT;
  }
  const key = ASSET_MANIFEST[path];
  if (!key) {
    return null;
  }
  const content = await ASSET_NAMESPACE.get(key, { type: "stream" });
  if (!content) {
    return null;
  }
  return content;
}, "getContentFromKVAsset");

// node_modules/hono/dist/adapter/cloudflare-workers/serve-static.js
var serveStatic2 = /* @__PURE__ */ __name((options = {}) => {
  return /* @__PURE__ */ __name(async function serveStatic22(c, next) {
    const getContent = /* @__PURE__ */ __name(async (path) => {
      return getContentFromKVAsset(path, {
        manifest: options.manifest,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        namespace: options.namespace ? options.namespace : c.env ? c.env.__STATIC_CONTENT : void 0
      });
    }, "getContent");
    return serveStatic({
      ...options,
      getContent
    })(c, next);
  }, "serveStatic2");
}, "serveStatic");

// node_modules/hono/dist/adapter/cloudflare-workers/serve-static-module.js
var module = /* @__PURE__ */ __name((options) => {
  return serveStatic2(options);
}, "module");

// node_modules/hono/dist/helper/websocket/index.js
var WSContext = class {
  static {
    __name(this, "WSContext");
  }
  #init;
  constructor(init) {
    this.#init = init;
    this.raw = init.raw;
    this.url = init.url ? new URL(init.url) : null;
    this.protocol = init.protocol ?? null;
  }
  send(source, options) {
    this.#init.send(source, options ?? {});
  }
  raw;
  binaryType = "arraybuffer";
  get readyState() {
    return this.#init.readyState;
  }
  url;
  protocol;
  close(code, reason) {
    this.#init.close(code, reason);
  }
};
var defineWebSocketHelper = /* @__PURE__ */ __name((handler) => {
  return ((...args) => {
    if (typeof args[0] === "function") {
      const [createEvents, options] = args;
      return /* @__PURE__ */ __name(async function upgradeWebSocket2(c, next) {
        const events = await createEvents(c);
        const result = await handler(c, events, options);
        if (result) {
          return result;
        }
        await next();
      }, "upgradeWebSocket");
    } else {
      const [c, events, options] = args;
      return (async () => {
        const upgraded = await handler(c, events, options);
        if (!upgraded) {
          throw new Error("Failed to upgrade WebSocket");
        }
        return upgraded;
      })();
    }
  });
}, "defineWebSocketHelper");

// node_modules/hono/dist/adapter/cloudflare-workers/websocket.js
var upgradeWebSocket = defineWebSocketHelper(async (c, events) => {
  const upgradeHeader = c.req.header("Upgrade");
  if (upgradeHeader !== "websocket") {
    return;
  }
  const webSocketPair = new WebSocketPair();
  const client = webSocketPair[0];
  const server = webSocketPair[1];
  const wsContext = new WSContext({
    close: /* @__PURE__ */ __name((code, reason) => server.close(code, reason), "close"),
    get protocol() {
      return server.protocol;
    },
    raw: server,
    get readyState() {
      return server.readyState;
    },
    url: server.url ? new URL(server.url) : null,
    send: /* @__PURE__ */ __name((source) => server.send(source), "send")
  });
  if (events.onClose) {
    server.addEventListener("close", (evt) => events.onClose?.(evt, wsContext));
  }
  if (events.onMessage) {
    server.addEventListener("message", (evt) => events.onMessage?.(evt, wsContext));
  }
  if (events.onError) {
    server.addEventListener("error", (evt) => events.onError?.(evt, wsContext));
  }
  server.accept?.();
  return new Response(null, {
    status: 101,
    // @ts-expect-error - webSocket is not typed
    webSocket: client
  });
});

// src/services/pricing.ts
var FINANCIAL_MODEL = {
  custoMedioPD: {
    1: 280,
    2: 320,
    3: 380,
    4: 450
  },
  overheadPct: 0.22,
  margemAlvo: 0.2,
  tributos: {
    iss: 0.05,
    pis: 0.0165,
    cofins: 0.076,
    irpj: 0.04,
    csll: 0.0225
  },
  bufferRisco: {
    1: 0.05,
    2: 0.08,
    3: 0.12,
    4: 0.18
  },
  comissaoPct: 0
};
var SCORE_MAP = {
  motivador: {
    "Exig\xEAncia Contratual/B2B": 1,
    "Regula\xE7\xE3o de Setor (Bacen, ANS, etc)": 2,
    "Auditoria e Seguran\xE7a Interna": 3,
    "Vantagem Competitiva": 1
  },
  infraestrutura: {
    "Nuvem P\xFAblica 100% (AWS/Azure/GCP)": 1,
    "H\xEDbrido (Nuvem + On-premise/Legacy)": 3,
    "Data Center Local (On-Premise)": 4
  },
  arquitetura: {
    "Microsservi\xE7os / Cloud Native": 1,
    "Monolitos (VMs/Containers grandes)": 4,
    "Sistemas de Terceiros (SaaS)": 2
  },
  criptografia: {
    "Criptografia Central (KMS) e TLS": 0,
    "Apenas criptografia em tr\xE2nsito": 2,
    "Sem criptografia formal": 4
  },
  repositorio: {
    "Git Moderno (GitHub/GitLab)": 0,
    "Reposit\xF3rios Legados (SVN/Subversion)": 3,
    "Sem versionamento formal": 5
  },
  deploy: {
    "CI/CD Automatizado": 0,
    "Deploy Misto ou Manual (FTP/SSH)": 3
  },
  seguranca_codigo: {
    "Review Rigoroso + Automa\xE7\xE3o (SAST)": 0,
    "Apenas Review Humano Ad-hoc": 2,
    "Sem valida\xE7\xE3o formal": 4
  },
  recursos_humanos: {
    "Treinamento Cont\xEDnuo e Background Check": 0,
    "Treinamento pontual (1x ao ano)": 2,
    "A\xE7\xF5es pontuais sem processo cont\xEDnuo": 4
  },
  gestao_identidade: {
    "SSO e MFA Centralizado": 0,
    "MFA ativo sem SSO": 1,
    "Senhas isoladas / Sem pol\xEDtica estrita": 4
  },
  continuidade: {
    "Backups Imut\xE1veis Testados + Vendor Risk": 0,
    "Backups regulares sem testes formais": 2,
    "Processos de Backup/Terceiros Informais": 5
  },
  iam_platform: {
    "Azure AD / Microsoft Entra ID": 0,
    "Google Workspace / Okta": 0,
    "Active Directory local (On-Premise)": 2,
    "Sem plataforma centralizada": 4
  }
};
var SCORE_BONUS = {
  controles_sem_nenhum: 4,
  controles_poucos: 2,
  vulnerabilidades_ativas: 3
};
var SCORE_MAX = (() => {
  const base = Object.values(SCORE_MAP).reduce((acc, map) => acc + Math.max(...Object.values(map)), 0);
  return base + SCORE_BONUS.controles_sem_nenhum + SCORE_BONUS.vulnerabilidades_ativas;
})();
var TIERS = [
  {
    tier: 1,
    name: "Foundation",
    scoreMin: 0,
    scoreMax: 12,
    precoMercado: 25e3,
    duracao: "3 meses",
    semanasTotal: 10,
    pdNess: 45,
    pdCliente: 30,
    perfil: "Empresa com infra moderna, boas pr\xE1ticas parciais. Foco nas Cl\xE1usulas 4, 5 e 6 e Controles Cr\xEDticos do Anexo A.",
    entregas: [
      "Diagn\xF3stico de Gaps e Declara\xE7\xE3o de Escopo (Cl\xE1usula 4.3)",
      "Pol\xEDtica de Seguran\xE7a da Informa\xE7\xE3o e Diretrizes de Lideran\xE7a (Cl\xE1usula 5.2)",
      "Planejamento e Gest\xE3o de Riscos (Cl\xE1usula 6.1)",
      "SoA Lite \u2014 Implementa\xE7\xE3o de 20 controles cr\xEDticos do Anexo A (Temas 5 e 8)",
      "Programa de Conscientiza\xE7\xE3o B\xE1sica (Cl\xE1usula 7.3)",
      "Suporte \xE0 Auditoria de Certifica\xE7\xE3o (Est\xE1gios 1 e 2)"
    ]
  },
  {
    tier: 2,
    name: "Standard",
    scoreMin: 13,
    scoreMax: 24,
    precoMercado: 55e3,
    duracao: "4 meses",
    semanasTotal: 18,
    pdNess: 90,
    pdCliente: 60,
    perfil: "Ambiente h\xEDbrido ou legado parcial. Implementa\xE7\xE3o completa do SGSI (Cl\xE1usulas 4-10) e SoA ampliado.",
    entregas: [
      "Tudo do Tier Foundation, mais:",
      "An\xE1lise de Contexto e Partes Interessadas (Cl\xE1usula 4.1 e 4.2)",
      "SoA Standard \u2014 Implementa\xE7\xE3o de 50+ controles do Anexo A (Temas 5, 6 e 8)",
      "Gest\xE3o de Ativos e Classifica\xE7\xE3o de Informa\xE7\xE3o (A.5.9, A.5.12)",
      "SSDLC Assessment \u2014 Seguran\xE7a no Ciclo de Vida (A.8.25)",
      "BCP/DRP \u2014 Continuidade de Neg\xF3cios e Prontid\xE3o de TIC (A.5.29, A.5.30)",
      "Auditoria Interna Completa (Cl\xE1usula 9.2)"
    ]
  },
  {
    tier: 3,
    name: "Enterprise",
    scoreMin: 25,
    scoreMax: 40,
    precoMercado: 95e3,
    duracao: "6 meses",
    semanasTotal: 28,
    pdNess: 160,
    pdCliente: 100,
    perfil: "Legado complexo ou regula\xE7\xE3o setorial. Full Compliance ISO 27001:2022 (93 controles) + Advanced Security.",
    entregas: [
      "Tudo do Tier Standard, mais:",
      "Full SoA \u2014 Implementa\xE7\xE3o e evid\xEAncia dos 93 controles do Anexo A (Temas 5, 6, 7 e 8)",
      "Threat Modeling (STRIDE) e An\xE1lise de Arquitetura de Seguran\xE7a",
      "Pentest de Aplica\xE7\xE3o (Black-box) com reteste inclu\xEDdo",
      "Programa de Secure Coding para Desenvolvedores (A.6.3)",
      "Seguran\xE7a em Nuvem e Gerenciamento de Vulnerabilidades (A.5.23, A.8.8)",
      "Apoio \xE0 An\xE1lise Cr\xEDtica pela Dire\xE7\xE3o (Cl\xE1usula 9.3)"
    ]
  },
  {
    tier: 4,
    name: "Critical Legacy",
    scoreMin: 41,
    scoreMax: Infinity,
    precoMercado: 18e4,
    duracao: "9\u201312 meses",
    semanasTotal: 48,
    pdNess: 300,
    pdCliente: 180,
    perfil: "Vulnerabilidades ativas, sem controles b\xE1sicos, > 400 pessoas, escopo cr\xEDtico multi-entidade.",
    entregas: [
      "Proposta individualizada obrigat\xF3ria ap\xF3s discovery qualificado.",
      "Tudo do Tier 3, mais:",
      "Red Team Exercise (full scope)",
      "Incident Response Retainer \u2014 6 meses",
      "Remediation Management de vulnerabilidades cr\xEDticas",
      "Suporte a subsidi\xE1rias e fornecedores cr\xEDticos"
    ]
  }
];
var SCOPE_MULTIPLIERS = [
  { maxPessoas: 49, fator: 1, label: "< 50 pessoas" },
  { maxPessoas: 150, fator: 1.4, label: "50 \u2013 150 pessoas" },
  { maxPessoas: 400, fator: 1.9, label: "151 \u2013 400 pessoas" },
  { maxPessoas: Infinity, fator: 2.5, label: "> 400 pessoas" }
];
var PHASE_BREAKDOWN = {
  1: [
    { fase: "F1", nome: "Diagn\xF3stico e Escopo", semanas: 2, pdNess: 10, pdCliente: 7, pct: 22 },
    { fase: "F2", nome: "Funda\xE7\xE3o Documental", semanas: 2, pdNess: 7, pdCliente: 5, pct: 15 },
    { fase: "F3", nome: "Gest\xE3o de Riscos", semanas: 2, pdNess: 11, pdCliente: 7, pct: 25 },
    { fase: "F4", nome: "Implementa\xE7\xE3o de Controles", semanas: 3, pdNess: 11, pdCliente: 7, pct: 25 },
    { fase: "F5", nome: "Suporte \xE0 Certifica\xE7\xE3o", semanas: 1, pdNess: 6, pdCliente: 4, pct: 13 }
  ],
  2: [
    { fase: "F1", nome: "Diagn\xF3stico e Escopo", semanas: 2, pdNess: 10, pdCliente: 7, pct: 11 },
    { fase: "F2", nome: "Funda\xE7\xE3o Documental", semanas: 2, pdNess: 7, pdCliente: 5, pct: 8 },
    { fase: "F3", nome: "Gest\xE3o de Riscos", semanas: 3, pdNess: 15, pdCliente: 10, pct: 17 },
    { fase: "F4", nome: "Implementa\xE7\xE3o de Controles", semanas: 5, pdNess: 34, pdCliente: 22, pct: 38 },
    { fase: "F5", nome: "Conscientiza\xE7\xE3o e Cultura", semanas: 2, pdNess: 9, pdCliente: 6, pct: 10 },
    { fase: "F6", nome: "Auditoria Interna", semanas: 2, pdNess: 11, pdCliente: 7, pct: 12 },
    { fase: "F7", nome: "Suporte \xE0 Certifica\xE7\xE3o", semanas: 2, pdNess: 4, pdCliente: 3, pct: 4 }
  ],
  3: [
    { fase: "F1", nome: "Diagn\xF3stico e Escopo", semanas: 3, pdNess: 13, pdCliente: 8, pct: 8 },
    { fase: "F2", nome: "Funda\xE7\xE3o Documental", semanas: 2, pdNess: 8, pdCliente: 5, pct: 5 },
    { fase: "F3", nome: "Gest\xE3o de Riscos + Threat Modeling", semanas: 3, pdNess: 21, pdCliente: 13, pct: 13 },
    { fase: "F4", nome: "Implementa\xE7\xE3o de Controles (SoA)", semanas: 8, pdNess: 64, pdCliente: 40, pct: 40 },
    { fase: "F5", nome: "Pentest + AppSec", semanas: 3, pdNess: 18, pdCliente: 10, pct: 11 },
    { fase: "F6", nome: "Conscientiza\xE7\xE3o + Secure Coding", semanas: 3, pdNess: 13, pdCliente: 8, pct: 8 },
    { fase: "F7", nome: "Auditoria Interna", semanas: 3, pdNess: 16, pdCliente: 10, pct: 10 },
    { fase: "F8", nome: "Suporte \xE0 Cert. + DPO", semanas: 3, pdNess: 7, pdCliente: 6, pct: 5 }
  ],
  4: [
    { fase: "F1", nome: "Diagn\xF3stico Aprofundado", semanas: 4, pdNess: 24, pdCliente: 14, pct: 8 },
    { fase: "F2", nome: "Funda\xE7\xE3o Documental", semanas: 2, pdNess: 12, pdCliente: 7, pct: 4 },
    { fase: "F3", nome: "Gest\xE3o de Riscos + IR Assessment", semanas: 4, pdNess: 36, pdCliente: 22, pct: 12 },
    { fase: "F4", nome: "Implementa\xE7\xE3o de Controles", semanas: 16, pdNess: 114, pdCliente: 68, pct: 38 },
    { fase: "F5", nome: "Red Team + Pentest Avan\xE7ado", semanas: 4, pdNess: 36, pdCliente: 18, pct: 12 },
    { fase: "F6", nome: "Conscientiza\xE7\xE3o + Secure Coding", semanas: 3, pdNess: 24, pdCliente: 14, pct: 8 },
    { fase: "F7", nome: "Auditoria Interna", semanas: 4, pdNess: 36, pdCliente: 22, pct: 12 },
    { fase: "F8", nome: "Suporte \xE0 Cert. + DPO + Retainer", semanas: 6, pdNess: 18, pdCliente: 15, pct: 6 }
  ]
};
var GAPS = [
  {
    field: "gestao_identidade",
    trigger: /* @__PURE__ */ __name((v) => v?.includes("Senhas isoladas"), "trigger"),
    gap: {
      controles: "A.5.15, A.5.16, A.5.17, A.8.5",
      titulo: "Aus\xEAncia de Controle Centralizado de Identidade (IAM)",
      impacto: "Cr\xEDtico",
      risco: "Credential stuffing, acesso indevido p\xF3s-desligamento, impossibilidade de auditoria de acessos.",
      acao: "Implantar SSO + MFA antes do kick-off do ISMS."
    }
  },
  {
    field: "controles_implementados",
    trigger: /* @__PURE__ */ __name((v) => !v?.toLowerCase().includes("consentimento"), "trigger"),
    gap: {
      controles: "A.1.2.4, A.1.3.5 (ISO 27701)",
      titulo: "Fragilidade na Gest\xE3o de Consentimento (LGPD)",
      impacto: "Cr\xEDtico / Legal",
      risco: "Tratamento de dados sem base legal v\xE1lida, multas da ANPD.",
      acao: "Implementar fluxo de coleta e revoga\xE7\xE3o de consentimento granular."
    }
  },
  {
    field: "vulnerabilidades_conhecidas",
    trigger: /* @__PURE__ */ __name((v) => !!v && v.length > 0, "trigger"),
    gap: {
      controles: "A.8.8, A.1.2.6 (ISO 27701)",
      titulo: "Tratamento de Riscos e DPIA Pendentes",
      impacto: "Alto",
      risco: "Vulnerabilidades conhecidas n\xE3o mitigadas aumentam o risco de vazamento de DP.",
      acao: "Realizar Avalia\xE7\xE3o de Impacto de Privacidade (DPIA) para os sistemas cr\xEDticos."
    }
  }
];
function calcTotalTributos() {
  return Object.values(FINANCIAL_MODEL.tributos).reduce((acc, v) => acc + v, 0);
}
__name(calcTotalTributos, "calcTotalTributos");
function calcScore(answers) {
  let score = 0;
  for (const [field, pts] of Object.entries(SCORE_MAP)) {
    const val = answers[field];
    score += pts[val] || 0;
  }
  const controles = answers.controles_implementados ? answers.controles_implementados.split(", ").filter(Boolean).length : 0;
  if (controles === 0) score += SCORE_BONUS.controles_sem_nenhum;
  else if (controles <= 2) score += SCORE_BONUS.controles_poucos;
  if (answers.vulnerabilidades_conhecidas?.trim()) {
    score += SCORE_BONUS.vulnerabilidades_ativas;
  }
  return score;
}
__name(calcScore, "calcScore");
function extractPeopleCount(escopoText) {
  if (!escopoText) return null;
  const isoPatterns = /\b(27001|2022|27701|9001|27002|19011|27005|31000)\b/g;
  const cleanedText = escopoText.replace(isoPatterns, "");
  const matches = cleanedText.match(/\b(\d+)\b/g);
  if (!matches) return null;
  const nums = matches.map(Number).filter((n) => n > 0 && n < 1e4);
  if (nums.length === 0) return null;
  return Math.min(...nums);
}
__name(extractPeopleCount, "extractPeopleCount");
function getScopeInfo(escopoText, headcount) {
  const parsed = headcount ? parseInt(String(headcount), 10) : null;
  const count = parsed && !isNaN(parsed) && parsed > 0 ? parsed : extractPeopleCount(escopoText);
  for (const s of SCOPE_MULTIPLIERS) {
    if (!count || count <= s.maxPessoas) {
      return { fator: s.fator, label: s.label, count };
    }
  }
  return { fator: 1, label: "N\xE3o informado", count: null };
}
__name(getScopeInfo, "getScopeInfo");
function getTier(score) {
  return TIERS.find((t) => score >= t.scoreMin && score <= t.scoreMax) || TIERS[TIERS.length - 1];
}
__name(getTier, "getTier");
function calcPrecoMinimo(tierNum, pdNess) {
  const fm = FINANCIAL_MODEL;
  const totalTrib = calcTotalTributos();
  const taxa = fm.custoMedioPD[tierNum];
  const buffer = fm.bufferRisco[tierNum] ?? 0.08;
  const custoDireto = pdNess * taxa;
  const custoTotal = custoDireto * (1 + fm.overheadPct);
  const recLiqMin = custoTotal / (1 - fm.margemAlvo);
  const precoMinBruto = recLiqMin / (1 - totalTrib);
  const precoComBuffer = precoMinBruto * (1 + buffer);
  const precoFinal = precoComBuffer * (1 + fm.comissaoPct);
  return Math.ceil(precoFinal / 1e3) * 1e3;
}
__name(calcPrecoMinimo, "calcPrecoMinimo");
function calcEconomics(precoFinal, tierNum, pdNess) {
  const fm = FINANCIAL_MODEL;
  const totalTrib = calcTotalTributos();
  const taxa = fm.custoMedioPD[tierNum];
  const custoDireto = pdNess * taxa;
  const overhead = custoDireto * fm.overheadPct;
  const custoTotal = custoDireto + overhead;
  const valorTributos = precoFinal * totalTrib;
  const receitaLiquida = precoFinal - valorTributos;
  const margemOp = receitaLiquida - custoTotal;
  const margemPct = margemOp / precoFinal;
  return {
    custoDireto,
    overhead,
    custoTotal,
    valorTributos,
    totalTributosPct: totalTrib,
    receitaLiquida,
    margemOp,
    margemPct,
    taxaBlendada: taxa,
    viavel: margemPct >= fm.margemAlvo
  };
}
__name(calcEconomics, "calcEconomics");
function calculatePricing(answers) {
  const score = calcScore(answers);
  const tier = getTier(score);
  const scopeInfo = getScopeInfo(answers.escopo, answers.headcount);
  const isTech = !!(answers.stack && answers.stack.length > 0);
  const precoMin = calcPrecoMinimo(tier.tier, tier.pdNess);
  const precoBruto = Math.max(tier.precoMercado, precoMin) * scopeInfo.fator;
  const precoFinal = Math.ceil(precoBruto / 1e3) * 1e3;
  const eco = calcEconomics(precoFinal, tier.tier, tier.pdNess);
  const phases = PHASE_BREAKDOWN[tier.tier] || PHASE_BREAKDOWN[2];
  const fases = phases.map((f) => ({ ...f, valorFase: Math.round(precoFinal * f.pct / 100) }));
  const gaps = GAPS.filter((rule) => rule.trigger(answers[rule.field])).map((rule) => rule.gap);
  return {
    score,
    scoreMax: SCORE_MAX,
    tier,
    scopeInfo,
    precoFinal,
    eco,
    fases,
    gaps,
    isTech,
    geradoEm: (/* @__PURE__ */ new Date()).toISOString()
  };
}
__name(calculatePricing, "calculatePricing");

// src/index.ts
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
__name(genId, "genId");
function genToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}
__name(genToken, "genToken");
var BLOCK_QUESTIONS = {
  1: [
    {
      key: "sector",
      type: "select",
      question: "Setor ou tipo de neg\xF3cio?",
      options: ["Fintech", "Healthtech", "Edtech", "Legaltech", "Insurtech", "Govtech", "Agritech", "Logistics/Supply Chain", "E-commerce/Marketplace", "Ind\xFAstria/Manufatura", "Servi\xE7os Financeiros", "Telecomunica\xE7\xF5es", "Energia", "Varejo", "Outro"]
    },
    {
      key: "company_type",
      type: "select",
      question: "Est\xE1gio da empresa?",
      options: ["Startup (< 3 anos)", "Scale-up (crescimento acelerado)", "Empresa madura", "Grupo econ\xF4mico / Holding", "Software house / F\xE1brica de software", "Consultoria de tecnologia"]
    },
    {
      key: "countries",
      type: "multi",
      question: "Pa\xEDses de opera\xE7\xE3o?",
      options: ["Brasil", "EUA", "Uni\xE3o Europeia", "Am\xE9rica Latina", "\xC1sia", "Global"]
    },
    {
      key: "headcount",
      type: "select",
      question: "Quantidade de colaboradores?",
      options: ["1\u201325", "26\u201350", "51\u2013100", "101\u2013250", "251\u2013500", "501\u20131000", "1000+"]
    },
    {
      key: "tech_people",
      type: "select",
      question: "Pessoas em tecnologia/engenharia/produto/DevOps?",
      options: ["1\u201310", "11\u201325", "26\u201350", "51\u2013100", "101\u2013200", "200+"]
    },
    {
      key: "security_people",
      type: "select",
      question: "Pessoas em seguran\xE7a/compliance/jur\xEDdico/privacidade?",
      options: ["Nenhuma dedicada", "1\u20133", "4\u201310", "11\u201320", "20+"]
    },
    { key: "dpo_appointed", type: "yesno", question: "DPO/Encarregado formalmente nomeado?" },
    {
      key: "existing_certs",
      type: "multi",
      question: "Certifica\xE7\xF5es ou frameworks j\xE1 implementados?",
      options: ["Nenhum", "ISO 27001", "ISO 9001", "SOC 2", "PCI DSS", "NIST CSF", "CIS Controls", "LGPD (programa estruturado)", "GDPR", "ISO 27701", "CMMI", "Outro"]
    },
    {
      key: "target_standard",
      type: "select",
      question: "Quais normas deseja certificar?",
      options: ["ISO 27001 apenas", "ISO 27701 apenas", "ISO 27001 + ISO 27701 (integrada)"]
    },
    {
      key: "demand_type",
      type: "multi",
      question: "Tipo de demanda?",
      options: ["Certifica\xE7\xE3o completa", "Gap assessment / diagn\xF3stico", "Implementa\xE7\xE3o do SGSI", "Implementa\xE7\xE3o do SGPI", "Auditoria interna", "Suporte ao auditor externo", "Treinamento"]
    },
    {
      key: "deadline",
      type: "select",
      question: "Prazo desejado para certifica\xE7\xE3o?",
      options: ["3 meses (urgente)", "6 meses", "9 meses", "12 meses", "Sem prazo definido", "Imposto por contrato/cliente"]
    },
    {
      key: "certification_body",
      type: "select",
      question: "Certificadora j\xE1 escolhida?",
      options: ["N\xE3o", "BSI", "Bureau Veritas", "DNV", "SGS", "T\xDCV", "LRQA", "ABNT", "Outra"]
    },
    {
      key: "cb_27701",
      type: "select",
      question: "Certificadora est\xE1 apta a auditar ISO 27701?",
      options: ["Sim, confirmado", "N\xE3o sabemos", "N\xE3o se aplica", "Precisa verificar"]
    },
    {
      key: "budget",
      type: "select",
      question: "Or\xE7amento estimado para o programa?",
      options: ["At\xE9 R$ 50 mil", "R$ 50\u2013100 mil", "R$ 100\u2013200 mil", "R$ 200\u2013500 mil", "Acima de R$ 500 mil", "N\xE3o definido"]
    },
    {
      key: "proposal_deadline",
      type: "select",
      question: "Prazo para envio da proposta?",
      options: ["Esta semana", "Pr\xF3ximas 2 semanas", "30 dias", "Sem urg\xEAncia"]
    }
  ],
  2: [
    {
      key: "scope_type",
      type: "select",
      question: "Escopo da certifica\xE7\xE3o?",
      options: ["Empresa inteira", "Produto / plataforma espec\xEDfica", "Unidade de neg\xF3cio", "Processo espec\xEDfico"]
    },
    {
      key: "org_units",
      type: "multi",
      question: "Unidades organizacionais inclu\xEDdas?",
      options: ["Engenharia", "Produto", "DevOps/SRE", "Seguran\xE7a", "Jur\xEDdico", "RH", "Suporte/CS", "Comercial", "Marketing", "Financeiro", "Todas"]
    },
    { key: "cloud_in_scope", type: "yesno", question: "Infraestrutura cloud est\xE1 no escopo?" },
    { key: "support_scope", type: "yesno", question: "Suporte ao cliente est\xE1 no escopo?" },
    { key: "dev_scope", type: "yesno", question: "Desenvolvimento de software est\xE1 no escopo?" },
    {
      key: "personal_data",
      type: "select",
      question: "Volume de dados pessoais tratados?",
      options: ["M\xEDnimo (apenas colaboradores)", "Moderado (clientes B2B)", "Alto (clientes B2C, milhares)", "Muito alto (milh\xF5es de titulares)", "Dados sens\xEDveis (sa\xFAde, biometria, etc.)"]
    },
    {
      key: "data_role",
      type: "select",
      question: "Papel no tratamento de dados?",
      options: ["Controlador", "Operador", "Controlador + Operador", "Controlador conjunto", "Ainda n\xE3o mapeado"]
    },
    {
      key: "remote_work",
      type: "select",
      question: "Modelo de trabalho?",
      options: ["100% remoto", "H\xEDbrido", "100% presencial"]
    }
  ],
  3: [
    {
      key: "cloud_provider",
      type: "multi",
      question: "Cloud provider(s)?",
      options: ["AWS", "Google Cloud", "Azure", "Oracle Cloud", "Cloudflare", "DigitalOcean", "On-premises", "H\xEDbrido", "Outro"]
    },
    {
      key: "databases",
      type: "multi",
      question: "Bancos de dados?",
      options: ["PostgreSQL", "MySQL", "MongoDB", "Redis", "DynamoDB", "SQL Server", "Elasticsearch", "Outro"]
    },
    {
      key: "environments",
      type: "select",
      question: "Ambientes segregados?",
      options: ["Apenas produ\xE7\xE3o", "Dev + Prod", "Dev + Staging + Prod", "Dev + QA + Staging + Prod"]
    },
    {
      key: "cicd",
      type: "select",
      question: "Maturidade do CI/CD?",
      options: ["Inexistente", "Manual / ad-hoc", "Pipeline b\xE1sico (build + test)", "Pipeline completo (build + test + scan + deploy)", "GitOps / deploy automatizado"]
    },
    {
      key: "code_repo",
      type: "select",
      question: "Reposit\xF3rio de c\xF3digo?",
      options: ["GitHub", "GitLab", "Bitbucket", "Azure DevOps", "Outro"]
    },
    {
      key: "containers",
      type: "select",
      question: "Uso de containers?",
      options: ["N\xE3o utiliza", "Docker apenas", "Docker + Kubernetes", "Docker + ECS/Fargate", "Serverless (sem containers)"]
    },
    {
      key: "iam",
      type: "select",
      question: "Gest\xE3o de identidade e acesso (IAM)?",
      options: ["Sem IAM centralizado", "IAM do cloud provider", "IdP dedicado (Okta, Auth0, Azure AD)", "SSO implementado", "SSO + MFA obrigat\xF3rio"]
    },
    {
      key: "logging",
      type: "select",
      question: "Logs e monitoramento?",
      options: ["Sem monitoramento", "Logs b\xE1sicos (stdout)", "Ferramenta de logs (CloudWatch, Datadog, etc.)", "SIEM implementado", "Observabilidade completa (logs + m\xE9tricas + traces)"]
    },
    {
      key: "backup",
      type: "select",
      question: "Backup implementado?",
      options: ["Sem backup", "Backup manual / ocasional", "Backup autom\xE1tico sem teste de restore", "Backup autom\xE1tico com teste de restore", "Backup + DR documentado e testado"]
    },
    {
      key: "mfa",
      type: "select",
      question: "MFA habilitado?",
      options: ["N\xE3o", "Apenas para admins", "Para todos os acessos ao cloud", "Para todos os sistemas (cloud + SaaS + VPN)"]
    }
  ],
  4: [
    {
      key: "sdlc",
      type: "select",
      question: "Maturidade do SDLC?",
      options: ["Sem processo formal", "Processo informal / ad-hoc", "SDLC documentado sem seguran\xE7a", "Secure SDLC implementado", "Secure SDLC + Privacy by Design"]
    },
    {
      key: "code_review",
      type: "select",
      question: "Code review?",
      options: ["N\xE3o existe", "Opcional / informal", "Obrigat\xF3rio (1 reviewer)", "Obrigat\xF3rio (2+ reviewers)", "Obrigat\xF3rio + checklist de seguran\xE7a"]
    },
    { key: "branch_protection", type: "yesno", question: "Branch protection configurado na main/master?" },
    {
      key: "sast_sca",
      type: "multi",
      question: "Ferramentas de seguran\xE7a no pipeline?",
      options: ["Nenhuma", "SAST (an\xE1lise est\xE1tica)", "SCA (depend\xEAncias)", "DAST (din\xE2mico)", "Secret scanning", "Container scanning", "IaC scanning"]
    },
    {
      key: "pentest",
      type: "select",
      question: "Pentest realizado?",
      options: ["Nunca", "Uma vez (h\xE1 mais de 1 ano)", "Anualmente", "A cada release / trimestral", "Bug bounty ativo"]
    },
    {
      key: "vuln_mgmt",
      type: "select",
      question: "Gest\xE3o de vulnerabilidades?",
      options: ["Inexistente", "Ad-hoc / reativo", "Processo definido sem SLA", "Processo com SLA por severidade", "Processo + m\xE9tricas + dashboard"]
    },
    {
      key: "test_data",
      type: "select",
      question: "Dados em ambientes de teste?",
      options: ["Dados reais de produ\xE7\xE3o", "Dados reais parcialmente mascarados", "Dados sint\xE9ticos", "Dados reais, mas n\xE3o sei se tem DP"]
    },
    {
      key: "prod_access",
      type: "select",
      question: "Acesso de desenvolvedores \xE0 produ\xE7\xE3o?",
      options: ["Acesso direto livre", "Acesso direto com aprova\xE7\xE3o", "Acesso via bastion/jump server", "Sem acesso direto (apenas pipeline)"]
    }
  ],
  5: [
    {
      key: "personal_data_types",
      type: "multi",
      question: "Tipos de dados pessoais tratados?",
      options: ["Nome", "Email", "Telefone", "CPF/CNPJ", "Endere\xE7o", "Dados financeiros", "Dados de sa\xFAde", "Biometria", "Geolocaliza\xE7\xE3o", "Dados de menores", "Dados de navega\xE7\xE3o/cookies", "Logs com IP"]
    },
    { key: "sensitive_data", type: "yesno", question: "Trata dados pessoais sens\xEDveis (sa\xFAde, biometria, ra\xE7a, religi\xE3o, opini\xE3o pol\xEDtica)?" },
    {
      key: "data_subjects",
      type: "multi",
      question: "Categorias de titulares?",
      options: ["Colaboradores", "Clientes PF", "Clientes PJ (representantes)", "Usu\xE1rios de plataforma", "Candidatos (RH)", "Visitantes do site", "Pacientes", "Alunos", "Crian\xE7as/adolescentes"]
    },
    {
      key: "legal_bases",
      type: "select",
      question: "Bases legais mapeadas por opera\xE7\xE3o de tratamento?",
      options: ["N\xE3o mapeadas", "Parcialmente mapeadas", "Totalmente mapeadas", "Mapeadas e documentadas no RoPA"]
    },
    {
      key: "ropa",
      type: "select",
      question: "RoPA (Registro de Opera\xE7\xF5es de Tratamento)?",
      options: ["Inexistente", "Em constru\xE7\xE3o", "Parcial", "Completo e atualizado"]
    },
    {
      key: "dpia",
      type: "select",
      question: "DPIA/RIPD (Relat\xF3rio de Impacto)?",
      options: ["Nunca realizado", "Realizado uma vez", "Realizado para opera\xE7\xF5es de alto risco", "Processo recorrente documentado"]
    },
    {
      key: "dsr_channel",
      type: "select",
      question: "Canal de direitos dos titulares?",
      options: ["Inexistente", "Email gen\xE9rico", "Formul\xE1rio web dedicado", "Plataforma de gest\xE3o de DSR", "Canal + SLA + m\xE9tricas"]
    },
    {
      key: "retention",
      type: "select",
      question: "Pol\xEDtica de reten\xE7\xE3o e descarte?",
      options: ["Inexistente", "Informal / n\xE3o documentada", "Documentada mas n\xE3o aplicada", "Documentada e aplicada", "Automatizada com jobs de exclus\xE3o"]
    },
    {
      key: "intl_transfers",
      type: "select",
      question: "Transfer\xEAncias internacionais de dados?",
      options: ["N\xE3o h\xE1", "Sim, para cloud US", "Sim, para m\xFAltiplos pa\xEDses", "Sim, com cl\xE1usulas contratuais", "N\xE3o sei / n\xE3o mapeado"]
    },
    {
      key: "sub_processors",
      type: "select",
      question: "Subprocessadores mapeados?",
      options: ["N\xE3o mapeados", "Lista parcial", "Lista completa sem DPA", "Lista completa com DPA", "Gest\xE3o ativa (avalia\xE7\xE3o + DPA + monitoramento)"]
    }
  ],
  6: [
    {
      key: "commitment",
      type: "select",
      question: "Comprometimento da alta dire\xE7\xE3o com Seguran\xE7a da Informa\xE7\xE3o?",
      options: ["Dire\xE7\xE3o formalmente comprometida com SI", "Comprometimento verbal, sem formaliza\xE7\xE3o", "Sem comprometimento expl\xEDcito"]
    },
    {
      key: "isms_policy",
      type: "select",
      question: "Pol\xEDtica de Seguran\xE7a da Informa\xE7\xE3o (ISP) existente?",
      options: ["Existe e est\xE1 atualizada", "Existe mas desatualizada", "Inexistente"]
    },
    {
      key: "si_objectives",
      type: "select",
      question: "Objetivos de seguran\xE7a da informa\xE7\xE3o definidos?",
      options: ["Definidos e mensur\xE1veis", "Definidos informalmente", "N\xE3o existem"]
    },
    {
      key: "management_review",
      type: "select",
      question: "An\xE1lise cr\xEDtica pela dire\xE7\xE3o realizada?",
      options: ["Realizada periodicamente", "Realizada ad-hoc", "Nunca realizada"]
    },
    {
      key: "risk_owner",
      type: "select",
      question: "Propriet\xE1rios de risco atribu\xEDdos?",
      options: ["Atribu\xEDdos formalmente", "Parcialmente atribu\xEDdos", "Sem respons\xE1veis"]
    },
    {
      key: "competence_records",
      type: "select",
      question: "Registros de compet\xEAncia do time de SI?",
      options: ["Registros formais de compet\xEAncia", "Registros parciais", "Sem registros"]
    },
    {
      key: "internal_comm",
      type: "select",
      question: "Comunica\xE7\xE3o interna sobre SI?",
      options: ["Canais formais definidos", "Comunica\xE7\xE3o informal", "Sem processo"]
    },
    {
      key: "documented_info",
      type: "select",
      question: "Controle de informa\xE7\xE3o documentada?",
      options: ["Controle de documentos formal", "Vers\xE3o informal (Google Drive, etc)", "Sem controle"]
    }
  ],
  7: [
    {
      key: "supplier_count",
      type: "select",
      question: "Quantidade de fornecedores de TI/cloud?",
      options: ["0\u201310", "11\u201350", "51\u2013200", "200+"]
    },
    {
      key: "supplier_eval",
      type: "select",
      question: "Avalia\xE7\xE3o de seguran\xE7a de fornecedores?",
      options: ["Avalia\xE7\xE3o formal de seguran\xE7a", "Checklist b\xE1sico", "Sem avalia\xE7\xE3o"]
    },
    {
      key: "dpa_contracts",
      type: "select",
      question: "Contratos com cl\xE1usulas de prote\xE7\xE3o de dados (DPA)?",
      options: ["DPA com todos", "DPA com principais", "Sem DPA"]
    },
    {
      key: "sla_monitoring",
      type: "select",
      question: "SLAs de seguran\xE7a com fornecedores?",
      options: ["SLAs definidos e monitorados", "SLAs definidos sem monitoramento", "Sem SLAs"]
    },
    { key: "sub_audit", type: "yesno", question: "Direito de auditoria em contratos com fornecedores?" },
    {
      key: "offboarding",
      type: "select",
      question: "Processo de desligamento de fornecedores (offboarding)?",
      options: ["Processo formal de desligamento", "Informal", "Sem processo"]
    },
    {
      key: "cloud_shared",
      type: "select",
      question: "Modelo de responsabilidade compartilhada com cloud providers?",
      options: ["Modelo de responsabilidade compartilhada documentado", "Conhecido mas n\xE3o documentado", "N\xE3o mapeado"]
    },
    {
      key: "critical_suppliers",
      type: "multi",
      question: "Fornecedores cr\xEDticos de TI?",
      options: ["AWS", "Azure", "Google Cloud", "Salesforce", "ServiceNow", "GitHub", "Slack", "Atlassian"]
    }
  ],
  8: [
    {
      key: "doc_repo",
      type: "select",
      question: "Reposit\xF3rio de documentos de SI?",
      options: ["Reposit\xF3rio centralizado (Confluence, SharePoint)", "Google Drive / pasta de rede", "Documentos espalhados", "Sem reposit\xF3rio"]
    },
    {
      key: "doc_version",
      type: "select",
      question: "Controle de vers\xE3o de documentos?",
      options: ["Versionamento autom\xE1tico", "Versionamento manual", "Sem controle de vers\xE3o"]
    },
    {
      key: "doc_approval",
      type: "select",
      question: "Processo de aprova\xE7\xE3o de documentos?",
      options: ["Workflow formal de aprova\xE7\xE3o", "Aprova\xE7\xE3o por email", "Sem processo de aprova\xE7\xE3o"]
    },
    {
      key: "doc_review_cycle",
      type: "select",
      question: "Ciclo de revis\xE3o de pol\xEDticas e procedimentos?",
      options: ["Revis\xE3o anual programada", "Revis\xE3o ad-hoc", "Sem revis\xE3o"]
    },
    {
      key: "existing_policies",
      type: "multi",
      question: "Pol\xEDticas/procedimentos j\xE1 existentes?",
      options: ["Pol\xEDtica de SI", "Pol\xEDtica de Privacidade", "Pol\xEDtica de Acesso", "Pol\xEDtica de Backup", "Plano de Continuidade", "Plano de Incidentes", "Nenhuma"]
    },
    { key: "templates_used", type: "yesno", question: "Utiliza templates padronizados para documentos?" },
    {
      key: "classification",
      type: "select",
      question: "Classifica\xE7\xE3o da informa\xE7\xE3o implementada?",
      options: ["Esquema de classifica\xE7\xE3o implementado", "Classifica\xE7\xE3o informal", "Sem classifica\xE7\xE3o"]
    },
    {
      key: "awareness_docs",
      type: "select",
      question: "Documenta\xE7\xE3o de treinamento e conscientiza\xE7\xE3o?",
      options: ["Material de conscientiza\xE7\xE3o formal", "Treinamentos pontuais", "Sem material"]
    }
  ],
  9: [
    {
      key: "timeline_expectation",
      type: "select",
      question: "Cronograma desejado para certifica\xE7\xE3o?",
      options: ["3 meses (urgente)", "6 meses (padr\xE3o)", "9\u201312 meses (confort\xE1vel)", "Sem prazo definido"]
    },
    {
      key: "budget_range",
      type: "select",
      question: "Faixa de investimento prevista?",
      options: ["At\xE9 R$ 30k", "R$ 30k \u2013 R$ 60k", "R$ 60k \u2013 R$ 100k", "R$ 100k \u2013 R$ 200k", "Acima de R$ 200k", "N\xE3o definido"]
    },
    {
      key: "internal_team",
      type: "select",
      question: "Equipe interna dispon\xEDvel para o projeto?",
      options: ["Time dedicado de SI (3+ pessoas)", "Time parcial (1-2 pessoas)", "Sem time dedicado"]
    },
    {
      key: "sponsor",
      type: "select",
      question: "Sponsor executivo do projeto?",
      options: ["C-Level (CEO/CTO/CISO)", "Ger\xEAncia de TI", "Sem sponsor definido"]
    },
    {
      key: "blockers",
      type: "multi",
      question: "Principais bloqueadores ou riscos do projeto?",
      options: ["Or\xE7amento", "Prioridade da diretoria", "Falta de pessoas", "Legado tecnol\xF3gico", "Cultura organizacional", "Compliance regulat\xF3rio (prazo)", "Nenhum"]
    },
    { key: "prev_attempts", type: "yesno", question: "Houve tentativas anteriores de certifica\xE7\xE3o?" },
    {
      key: "certifier",
      type: "select",
      question: "Certificadora j\xE1 foi escolhida?",
      options: ["J\xE1 escolhida", "Em avalia\xE7\xE3o", "Sem decis\xE3o"]
    },
    { key: "parallel_projects", type: "yesno", question: "H\xE1 outros projetos de compliance em paralelo (SOC 2, PCI, etc)?" }
  ],
  10: [
    {
      key: "endpoints_count",
      type: "select",
      question: "Quantidade de APIs/endpoints expostos?",
      options: ["1\u201310", "11\u201350", "51\u2013200", "200+"]
    },
    {
      key: "users_count",
      type: "select",
      question: "Quantidade de usu\xE1rios da plataforma?",
      options: ["< 1.000", "1.000 \u2013 10.000", "10.000 \u2013 100.000", "100.000+"]
    },
    {
      key: "data_volume",
      type: "select",
      question: "Volume de dados armazenados?",
      options: ["< 100 GB", "100 GB \u2013 1 TB", "1 TB \u2013 10 TB", "> 10 TB"]
    },
    {
      key: "transactions_daily",
      type: "select",
      question: "Transa\xE7\xF5es di\xE1rias?",
      options: ["< 1.000", "1.000 \u2013 100.000", "100.000 \u2013 1M", "> 1M"]
    },
    {
      key: "locations",
      type: "select",
      question: "Localiza\xE7\xF5es f\xEDsicas?",
      options: ["1 escrit\xF3rio", "2\u20135 localiza\xE7\xF5es", "6+ localiza\xE7\xF5es", "Full remote"]
    },
    {
      key: "devices_managed",
      type: "select",
      question: "Dispositivos gerenciados (MDM/endpoint)?",
      options: ["< 50", "50 \u2013 200", "200 \u2013 1.000", "1.000+"]
    },
    {
      key: "third_party_integrations",
      type: "select",
      question: "Integra\xE7\xF5es com terceiros?",
      options: ["< 5", "5 \u2013 20", "20 \u2013 50", "50+"]
    },
    {
      key: "databases_count",
      type: "select",
      question: "Quantidade de bancos de dados?",
      options: ["1\u20133", "4\u201310", "11\u201350", "50+"]
    },
    {
      key: "microservices",
      type: "select",
      question: "Quantidade de microsservi\xE7os?",
      options: ["< 5", "5 \u2013 20", "20 \u2013 50", "50+", "Monolito"]
    },
    {
      key: "uptime_sla",
      type: "select",
      question: "SLA de disponibilidade?",
      options: ["99.9%+ (mission critical)", "99.5% \u2013 99.9%", "< 99.5%", "Sem SLA definido"]
    }
  ]
};
var PHASE_TITLES = [
  "Mobiliza\xE7\xE3o e Mandato",
  "Entrevista Executiva",
  "Entrevistas por Trilha",
  "Defini\xE7\xE3o de Escopo",
  "Gap Assessment",
  "Governan\xE7a e Pap\xE9is",
  "Contexto e Partes Interessadas",
  "Invent\xE1rio de Ativos e Dados",
  "Mapeamento de Processos",
  "Riscos de Seguran\xE7a",
  "Riscos de Privacidade",
  "Tratamento de Riscos",
  "SoA do SGSI",
  "SoA do SGPI",
  "Arquitetura Documental",
  "Controles Organizacionais",
  "Controles de Pessoas",
  "Controles F\xEDsicos",
  "Controles Tecnol\xF3gicos",
  "Desenvolvimento Seguro",
  "Cloud, DevOps e SRE",
  "Programa de Privacidade",
  "Privacy by Design",
  "Direitos dos Titulares",
  "Consentimento e Bases Legais",
  "Reten\xE7\xE3o e Descarte",
  "Transfer\xEAncias e Compartilhamento",
  "Fornecedores e Operadores",
  "Incidentes",
  "Treinamento",
  "Monitoramento e M\xE9tricas",
  "Auditoria Interna",
  "N\xE3o Conformidades",
  "An\xE1lise Cr\xEDtica",
  "Readiness Review",
  "Prepara\xE7\xE3o Stage 1",
  "Corre\xE7\xF5es P\xF3s-Stage 1",
  "Prepara\xE7\xE3o Stage 2",
  "Atendimento ao Auditor",
  "P\xF3s-Auditoria",
  "Manuten\xE7\xE3o e Supervis\xE3o"
];
var PHASE_CHECKLISTS = {
  0: [
    // Mobilização e Mandato
    { id: "p0_1", text: "Definir sponsor executivo", category: "task" },
    { id: "p0_2", text: "Nomear equipe do projeto", category: "task" },
    { id: "p0_3", text: "Kick-off meeting realizado", category: "evidence" },
    { id: "p0_4", text: "Cronograma aprovado", category: "document" },
    { id: "p0_5", text: "Carta de mandato assinada", category: "document" },
    { id: "p0_6", text: "Definir canais de comunica\xE7\xE3o", category: "task" },
    { id: "p0_7", text: "Avaliar recursos necess\xE1rios", category: "task" }
  ],
  1: [
    // Entrevista Executiva
    { id: "p1_1", text: "Agendar entrevista com C-Level", category: "task" },
    { id: "p1_2", text: "Conduzir entrevista executiva", category: "task" },
    { id: "p1_3", text: "Documentar respostas e expectativas", category: "document" },
    { id: "p1_4", text: "Registrar gaps identificados", category: "evidence" }
  ],
  2: [
    // Entrevistas por Trilha
    { id: "p2_1", text: "Agendar entrevistas por trilha (TI, RH, Jur\xEDdico)", category: "task" },
    { id: "p2_2", text: "Conduzir entrevistas com cada \xE1rea", category: "task" },
    { id: "p2_3", text: "Documentar achados por trilha", category: "document" },
    { id: "p2_4", text: "Consolidar relat\xF3rio de entrevistas", category: "document" }
  ],
  3: [
    // Definição de Escopo
    { id: "p3_1", text: "Declara\xE7\xE3o de escopo documentada (Cl 4.3)", category: "document" },
    { id: "p3_2", text: "Unidades organizacionais definidas", category: "document" },
    { id: "p3_3", text: "Processos inclu\xEDdos listados", category: "document" },
    { id: "p3_4", text: "Exclus\xF5es justificadas", category: "document" },
    { id: "p3_5", text: "Limites geogr\xE1ficos definidos", category: "document" },
    { id: "p3_6", text: "Escopo aprovado pela dire\xE7\xE3o", category: "evidence" }
  ],
  4: [
    // Gap Assessment
    { id: "p4_1", text: "Question\xE1rio de gap enviado", category: "task" },
    { id: "p4_2", text: "Entrevistas realizadas", category: "evidence" },
    { id: "p4_3", text: "Gaps por controle documentados", category: "document" },
    { id: "p4_4", text: "Relat\xF3rio de gap assessment gerado", category: "document" },
    { id: "p4_5", text: "Plano de tratamento definido", category: "document" },
    { id: "p4_6", text: "Gap assessment aprovado", category: "evidence" },
    { id: "p4_7", text: "Quick wins identificados", category: "task" }
  ],
  5: [
    // Governança e Papéis
    { id: "p5_1", text: "Definir estrutura de governan\xE7a", category: "task" },
    { id: "p5_2", text: "Nomear pap\xE9is e responsabilidades", category: "document" },
    { id: "p5_3", text: "Documentar organograma de SI", category: "document" },
    { id: "p5_4", text: "Aprovar estrutura de governan\xE7a", category: "evidence" }
  ],
  6: [
    // Contexto e Partes Interessadas
    { id: "p6_1", text: "An\xE1lise de contexto interno e externo (Cl 4.1)", category: "document" },
    { id: "p6_2", text: "Identificar partes interessadas (Cl 4.2)", category: "document" },
    { id: "p6_3", text: "Documentar requisitos das partes interessadas", category: "document" },
    { id: "p6_4", text: "Aprovar an\xE1lise de contexto", category: "evidence" }
  ],
  7: [
    // Inventário de Ativos e Dados
    { id: "p7_1", text: "Invent\xE1rio de ativos de informa\xE7\xE3o", category: "document" },
    { id: "p7_2", text: "Classifica\xE7\xE3o de ativos por criticidade", category: "document" },
    { id: "p7_3", text: "Propriet\xE1rios de ativos atribu\xEDdos", category: "task" },
    { id: "p7_4", text: "Mapeamento de dados pessoais (RoPA)", category: "document" },
    { id: "p7_5", text: "Invent\xE1rio revisado e aprovado", category: "evidence" }
  ],
  8: [
    // Mapeamento de Processos
    { id: "p8_1", text: "Processos de neg\xF3cio mapeados", category: "document" },
    { id: "p8_2", text: "Fluxos de dados documentados", category: "document" },
    { id: "p8_3", text: "Depend\xEAncias entre processos identificadas", category: "document" },
    { id: "p8_4", text: "Processos cr\xEDticos priorizados", category: "task" }
  ],
  9: [
    // Riscos de Segurança
    { id: "p9_1", text: "Metodologia de risco definida (Cl 6.1)", category: "document" },
    { id: "p9_2", text: "Ativos de informa\xE7\xE3o inventariados", category: "document" },
    { id: "p9_3", text: "Amea\xE7as e vulnerabilidades identificadas", category: "document" },
    { id: "p9_4", text: "Matriz de risco (impacto \xD7 probabilidade)", category: "document" },
    { id: "p9_5", text: "Crit\xE9rios de aceita\xE7\xE3o definidos", category: "document" },
    { id: "p9_6", text: "Propriet\xE1rios de risco atribu\xEDdos", category: "task" },
    { id: "p9_7", text: "Plano de tratamento de riscos (Cl 6.1.3)", category: "document" },
    { id: "p9_8", text: "Risco residual aceito formalmente", category: "evidence" }
  ],
  10: [
    // Riscos de Privacidade
    { id: "p10_1", text: "DPIA/RIPD para opera\xE7\xF5es de alto risco", category: "document" },
    { id: "p10_2", text: "Riscos de privacidade identificados", category: "document" },
    { id: "p10_3", text: "Medidas mitigat\xF3rias definidas", category: "document" },
    { id: "p10_4", text: "DPIA aprovado pelo DPO", category: "evidence" }
  ],
  11: [
    // Tratamento de Riscos
    { id: "p11_1", text: "Plano de tratamento de riscos elaborado", category: "document" },
    { id: "p11_2", text: "Controles selecionados por risco", category: "document" },
    { id: "p11_3", text: "Respons\xE1veis por implementa\xE7\xE3o definidos", category: "task" },
    { id: "p11_4", text: "Cronograma de implementa\xE7\xE3o aprovado", category: "evidence" }
  ],
  12: [
    // SoA do SGSI
    { id: "p12_1", text: "SoA draft gerado com 93 controles", category: "document" },
    { id: "p12_2", text: "Justificativa de inclus\xE3o/exclus\xE3o por controle", category: "document" },
    { id: "p12_3", text: "Status de implementa\xE7\xE3o por controle", category: "document" },
    { id: "p12_4", text: "Evid\xEAncias vinculadas por controle", category: "evidence" },
    { id: "p12_5", text: "SoA revisado pela dire\xE7\xE3o", category: "task" },
    { id: "p12_6", text: "SoA aprovado formalmente", category: "evidence" }
  ],
  13: [
    // SoA do SGPI
    { id: "p13_1", text: "SoA de privacidade elaborado (ISO 27701)", category: "document" },
    { id: "p13_2", text: "Controles de privacidade mapeados", category: "document" },
    { id: "p13_3", text: "Evid\xEAncias de conformidade vinculadas", category: "evidence" },
    { id: "p13_4", text: "SoA do SGPI aprovado", category: "evidence" }
  ],
  14: [
    // Arquitetura Documental
    { id: "p14_1", text: "Estrutura de pastas definida", category: "task" },
    { id: "p14_2", text: "Nomenclatura padr\xE3o de documentos", category: "document" },
    { id: "p14_3", text: "Template de pol\xEDtica aprovado", category: "document" },
    { id: "p14_4", text: "Template de procedimento aprovado", category: "document" },
    { id: "p14_5", text: "Controle de vers\xE3o implementado", category: "task" },
    { id: "p14_6", text: "Workflow de aprova\xE7\xE3o definido", category: "task" },
    { id: "p14_7", text: "Lista mestra de documentos", category: "document" }
  ],
  15: [
    // Controles Organizacionais
    { id: "p15_1", text: "Pol\xEDticas organizacionais redigidas (Tema 5)", category: "document" },
    { id: "p15_2", text: "Procedimentos de gest\xE3o de ativos", category: "document" },
    { id: "p15_3", text: "Controles de acesso implementados", category: "evidence" },
    { id: "p15_4", text: "Pol\xEDticas aprovadas pela dire\xE7\xE3o", category: "evidence" }
  ],
  16: [
    // Controles de Pessoas
    { id: "p16_1", text: "Pol\xEDtica de seguran\xE7a para RH redigida", category: "document" },
    { id: "p16_2", text: "Background check implementado", category: "task" },
    { id: "p16_3", text: "Termos de confidencialidade assinados", category: "evidence" },
    { id: "p16_4", text: "Processo de desligamento seguro documentado", category: "document" }
  ],
  17: [
    // Controles Físicos
    { id: "p17_1", text: "Per\xEDmetros de seguran\xE7a definidos", category: "document" },
    { id: "p17_2", text: "Controles de acesso f\xEDsico implementados", category: "evidence" },
    { id: "p17_3", text: "Prote\xE7\xE3o de equipamentos documentada", category: "document" },
    { id: "p17_4", text: "Descarte seguro de m\xEDdias", category: "task" }
  ],
  18: [
    // Controles Tecnológicos
    { id: "p18_1", text: "Controles tecnol\xF3gicos do Tema 8 implementados", category: "evidence" },
    { id: "p18_2", text: "Gest\xE3o de vulnerabilidades operacional", category: "evidence" },
    { id: "p18_3", text: "Logs e monitoramento configurados", category: "evidence" },
    { id: "p18_4", text: "Criptografia em tr\xE2nsito e repouso", category: "evidence" },
    { id: "p18_5", text: "Prote\xE7\xE3o contra malware ativa", category: "evidence" }
  ],
  19: [
    // Desenvolvimento Seguro
    { id: "p19_1", text: "Pol\xEDtica de desenvolvimento seguro (A.8.25)", category: "document" },
    { id: "p19_2", text: "SSDLC implementado no pipeline", category: "evidence" },
    { id: "p19_3", text: "Code review obrigat\xF3rio configurado", category: "evidence" },
    { id: "p19_4", text: "Ferramentas SAST/SCA integradas", category: "evidence" }
  ],
  20: [
    // Cloud, DevOps e SRE
    { id: "p20_1", text: "Seguran\xE7a cloud provider documentada (A.5.23)", category: "document" },
    { id: "p20_2", text: "IAM e least privilege configurados", category: "evidence" },
    { id: "p20_3", text: "Pipeline CI/CD seguro", category: "evidence" },
    { id: "p20_4", text: "Monitoramento e alertas operacionais", category: "evidence" }
  ],
  21: [
    // Programa de Privacidade
    { id: "p21_1", text: "Programa de privacidade documentado", category: "document" },
    { id: "p21_2", text: "DPO/Encarregado nomeado", category: "evidence" },
    { id: "p21_3", text: "Bases legais mapeadas por opera\xE7\xE3o", category: "document" },
    { id: "p21_4", text: "RoPA completo e atualizado", category: "document" }
  ],
  22: [
    // Privacy by Design
    { id: "p22_1", text: "Metodologia de Privacy by Design definida", category: "document" },
    { id: "p22_2", text: "Checklist PbD para novos projetos", category: "document" },
    { id: "p22_3", text: "Minimiza\xE7\xE3o de dados implementada", category: "evidence" },
    { id: "p22_4", text: "Privacy by Default configurado", category: "evidence" }
  ],
  23: [
    // Direitos dos Titulares
    { id: "p23_1", text: "Canal de atendimento a titulares implementado", category: "evidence" },
    { id: "p23_2", text: "Procedimento de DSR documentado", category: "document" },
    { id: "p23_3", text: "SLA de resposta definido", category: "document" },
    { id: "p23_4", text: "Teste de exerc\xEDcio de direitos realizado", category: "evidence" }
  ],
  24: [
    // Consentimento e Bases Legais
    { id: "p24_1", text: "Fluxo de consentimento implementado", category: "evidence" },
    { id: "p24_2", text: "Mecanismo de revoga\xE7\xE3o funcional", category: "evidence" },
    { id: "p24_3", text: "Bases legais documentadas por opera\xE7\xE3o", category: "document" },
    { id: "p24_4", text: "Cookie banner/consent manager configurado", category: "evidence" }
  ],
  25: [
    // Retenção e Descarte
    { id: "p25_1", text: "Pol\xEDtica de reten\xE7\xE3o documentada", category: "document" },
    { id: "p25_2", text: "Tabela de temporalidade por tipo de dado", category: "document" },
    { id: "p25_3", text: "Procedimento de descarte seguro", category: "document" },
    { id: "p25_4", text: "Jobs de exclus\xE3o automatizados ou planejados", category: "evidence" }
  ],
  26: [
    // Transferências e Compartilhamento
    { id: "p26_1", text: "Transfer\xEAncias internacionais mapeadas", category: "document" },
    { id: "p26_2", text: "Cl\xE1usulas contratuais padr\xE3o (SCCs)", category: "document" },
    { id: "p26_3", text: "Avalia\xE7\xE3o de adequa\xE7\xE3o de pa\xEDs receptor", category: "document" },
    { id: "p26_4", text: "Compartilhamentos de dados documentados", category: "document" }
  ],
  27: [
    // Fornecedores e Operadores
    { id: "p27_1", text: "Lista de subprocessadores atualizada", category: "document" },
    { id: "p27_2", text: "DPAs assinados com fornecedores", category: "evidence" },
    { id: "p27_3", text: "Avalia\xE7\xE3o de seguran\xE7a de fornecedores", category: "document" },
    { id: "p27_4", text: "Monitoramento cont\xEDnuo de terceiros", category: "task" }
  ],
  28: [
    // Incidentes
    { id: "p28_1", text: "Procedimento de resposta a incidentes (A.5.24)", category: "document" },
    { id: "p28_2", text: "Classifica\xE7\xE3o de severidade definida", category: "document" },
    { id: "p28_3", text: "Canais de reporte definidos", category: "task" },
    { id: "p28_4", text: "Time de resposta nomeado (CSIRT)", category: "task" },
    { id: "p28_5", text: "Template de registro de incidente", category: "document" },
    { id: "p28_6", text: "Processo de notifica\xE7\xE3o \xE0 ANPD (72h)", category: "document" },
    { id: "p28_7", text: "Li\xE7\xF5es aprendidas documentadas", category: "document" },
    { id: "p28_8", text: "Simula\xE7\xE3o de incidente realizada", category: "evidence" }
  ],
  29: [
    // Treinamento
    { id: "p29_1", text: "Programa de conscientiza\xE7\xE3o definido", category: "document" },
    { id: "p29_2", text: "Material de treinamento elaborado", category: "document" },
    { id: "p29_3", text: "Treinamento inicial realizado", category: "evidence" },
    { id: "p29_4", text: "Registros de presen\xE7a/conclus\xE3o", category: "evidence" }
  ],
  30: [
    // Monitoramento e Métricas
    { id: "p30_1", text: "KPIs de seguran\xE7a definidos", category: "document" },
    { id: "p30_2", text: "Dashboard de m\xE9tricas implementado", category: "evidence" },
    { id: "p30_3", text: "Processo de monitoramento cont\xEDnuo", category: "document" },
    { id: "p30_4", text: "Relat\xF3rio peri\xF3dico de m\xE9tricas", category: "document" }
  ],
  31: [
    // Auditoria Interna
    { id: "p31_1", text: "Programa de auditoria interna (Cl 9.2)", category: "document" },
    { id: "p31_2", text: "Crit\xE9rios e escopo definidos", category: "document" },
    { id: "p31_3", text: "Auditor interno qualificado/independente", category: "evidence" },
    { id: "p31_4", text: "Checklist de auditoria preparado", category: "document" },
    { id: "p31_5", text: "Auditoria interna executada", category: "evidence" },
    { id: "p31_6", text: "Relat\xF3rio de auditoria gerado", category: "document" },
    { id: "p31_7", text: "N\xE3o conformidades registradas", category: "document" },
    { id: "p31_8", text: "Plano de a\xE7\xE3o corretiva aprovado", category: "evidence" }
  ],
  32: [
    // Não Conformidades
    { id: "p32_1", text: "N\xE3o conformidades identificadas e registradas", category: "document" },
    { id: "p32_2", text: "An\xE1lise de causa raiz realizada", category: "document" },
    { id: "p32_3", text: "A\xE7\xF5es corretivas definidas", category: "document" },
    { id: "p32_4", text: "Verifica\xE7\xE3o de efic\xE1cia das corre\xE7\xF5es", category: "evidence" }
  ],
  33: [
    // Análise Crítica
    { id: "p33_1", text: "Pauta da an\xE1lise cr\xEDtica preparada (Cl 9.3)", category: "document" },
    { id: "p33_2", text: "An\xE1lise cr\xEDtica pela dire\xE7\xE3o realizada", category: "evidence" },
    { id: "p33_3", text: "Ata de reuni\xE3o documentada", category: "document" },
    { id: "p33_4", text: "Decis\xF5es e a\xE7\xF5es registradas", category: "document" }
  ],
  34: [
    // Readiness Review
    { id: "p34_1", text: "Todas as pol\xEDticas aprovadas", category: "evidence" },
    { id: "p34_2", text: "SoA finalizado com evid\xEAncias", category: "evidence" },
    { id: "p34_3", text: "Risk treatment plan implementado", category: "evidence" },
    { id: "p34_4", text: "Auditoria interna conclu\xEDda", category: "evidence" },
    { id: "p34_5", text: "An\xE1lise cr\xEDtica pela dire\xE7\xE3o realizada", category: "evidence" },
    { id: "p34_6", text: "N\xE3o conformidades corrigidas", category: "evidence" },
    { id: "p34_7", text: "Simula\xE7\xE3o de Stage 1 realizada", category: "evidence" },
    { id: "p34_8", text: "Readiness score \u2265 80%", category: "evidence" }
  ],
  35: [
    // Preparação Stage 1
    { id: "p35_1", text: "Documenta\xE7\xE3o Stage 1 empacotada", category: "document" },
    { id: "p35_2", text: "SoA + pol\xEDtica SGSI + escopo enviados", category: "document" },
    { id: "p35_3", text: "Agenda com certificadora confirmada", category: "task" },
    { id: "p35_4", text: "Time de acompanhamento definido", category: "task" },
    { id: "p35_5", text: "FAQ de auditoria preparado", category: "document" }
  ],
  36: [
    // Correções Pós-Stage 1
    { id: "p36_1", text: "Achados do Stage 1 documentados", category: "document" },
    { id: "p36_2", text: "Plano de corre\xE7\xE3o elaborado", category: "document" },
    { id: "p36_3", text: "Corre\xE7\xF5es implementadas", category: "evidence" },
    { id: "p36_4", text: "Evid\xEAncias de corre\xE7\xE3o coletadas", category: "evidence" }
  ],
  37: [
    // Preparação Stage 2
    { id: "p37_1", text: "Evid\xEAncias de implementa\xE7\xE3o organizadas", category: "evidence" },
    { id: "p37_2", text: "Entrevistados informados e preparados", category: "task" },
    { id: "p37_3", text: "Sala de auditoria/logistics definidos", category: "task" },
    { id: "p37_4", text: "N\xE3o conformidades Stage 1 corrigidas", category: "evidence" },
    { id: "p37_5", text: "Evid\xEAncias de efic\xE1cia operacional", category: "evidence" },
    { id: "p37_6", text: "Logs de auditoria dispon\xEDveis", category: "evidence" }
  ],
  38: [
    // Atendimento ao Auditor
    { id: "p38_1", text: "Acompanhar auditor durante Stage 2", category: "task" },
    { id: "p38_2", text: "Evid\xEAncias solicitadas fornecidas", category: "evidence" },
    { id: "p38_3", text: "Registro de observa\xE7\xF5es do auditor", category: "document" },
    { id: "p38_4", text: "Encerramento formal da auditoria", category: "evidence" }
  ],
  39: [
    // Pós-Auditoria
    { id: "p39_1", text: "Relat\xF3rio de auditoria recebido e analisado", category: "document" },
    { id: "p39_2", text: "N\xE3o conformidades menores corrigidas", category: "evidence" },
    { id: "p39_3", text: "Certificado recebido", category: "evidence" },
    { id: "p39_4", text: "Comunica\xE7\xE3o interna sobre certifica\xE7\xE3o", category: "task" }
  ],
  40: [
    // Manutenção e Supervisão
    { id: "p40_1", text: "Plano de manuten\xE7\xE3o do SGSI definido", category: "document" },
    { id: "p40_2", text: "Cronograma de auditorias de supervis\xE3o", category: "document" },
    { id: "p40_3", text: "Processo de melhoria cont\xEDnua ativo", category: "task" },
    { id: "p40_4", text: "Indicadores de desempenho monitorados", category: "evidence" }
  ]
};
var INTERVIEW_TRACKS = {
  executiva: [
    { key: "exec_vision", question: "Qual a vis\xE3o estrat\xE9gica para seguran\xE7a da informa\xE7\xE3o e privacidade?" },
    { key: "exec_risk_appetite", question: "Qual o apetite de risco da organiza\xE7\xE3o?" },
    { key: "exec_budget", question: "Qual o or\xE7amento dispon\xEDvel para o programa?" },
    { key: "exec_sponsor", question: "Quem \xE9 o sponsor executivo do projeto?" },
    { key: "exec_timeline", question: "Expectativa de prazo para certifica\xE7\xE3o?" }
  ],
  tecnologia: [
    { key: "tech_infra", question: "Descreva a infraestrutura atual (cloud, on-prem, h\xEDbrida)." },
    { key: "tech_access", question: "Como funciona o controle de acesso e IAM?" },
    { key: "tech_monitoring", question: "Quais ferramentas de monitoramento e logging est\xE3o em uso?" },
    { key: "tech_backup", question: "Como funcionam os processos de backup e disaster recovery?" },
    { key: "tech_vulnerabilities", question: "Existe gest\xE3o de vulnerabilidades e patching?" }
  ],
  juridico: [
    { key: "legal_contracts", question: "Como est\xE3o estruturados os contratos com terceiros (DPA, NDA)?" },
    { key: "legal_bases", question: "As bases legais para tratamento de dados est\xE3o mapeadas?" },
    { key: "legal_dsr", question: "Existe processo para atendimento a direitos dos titulares?" },
    { key: "legal_incidents", question: "Qual o procedimento em caso de incidente de dados?" },
    { key: "legal_transfers", question: "Existem transfer\xEAncias internacionais de dados?" }
  ],
  rh: [
    { key: "hr_onboarding", question: "Como funciona o onboarding de seguran\xE7a para novos colaboradores?" },
    { key: "hr_training", question: "Existem treinamentos recorrentes de seguran\xE7a e privacidade?" },
    { key: "hr_offboarding", question: "Como \xE9 o processo de offboarding e revoga\xE7\xE3o de acessos?" },
    { key: "hr_policies", question: "Quais pol\xEDticas de RH cobrem seguran\xE7a da informa\xE7\xE3o?" }
  ],
  operacoes: [
    { key: "ops_processes", question: "Quais processos operacionais tratam dados pessoais?" },
    { key: "ops_suppliers", question: "Como \xE9 feita a gest\xE3o de fornecedores e operadores?" },
    { key: "ops_physical", question: "Quais controles f\xEDsicos existem (CCTV, controle de acesso)?" },
    { key: "ops_continuity", question: "Existe plano de continuidade de neg\xF3cios?" }
  ]
};
var app = new Hono2();
app.use("*", secureHeaders());
app.use("*", cors({
  origin: /* @__PURE__ */ __name((origin) => {
    if (origin && (origin.endsWith("ness.workers.dev") || origin.startsWith("http://localhost"))) {
      return origin;
    }
    return null;
  }, "origin")
}));
app.use("/api/v1/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith("/api/v1/auth/login") || path.startsWith("/api/v1/auth/setup") || path.startsWith("/api/v1/auditor/")) {
    return next();
  }
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized: Missing or invalid token" }, 401);
  }
  const token = authHeader.split(" ")[1];
  const userJson = await c.env.SESSIONS.get(token);
  if (!userJson) {
    return c.json({ error: "Unauthorized: Invalid or expired token" }, 401);
  }
  c.set("user", JSON.parse(userJson));
  await next();
});
async function hashPassword(password) {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hashPassword, "hashPassword");
async function logAudit(db, action, actor, details, justification = "", ip = "") {
  await db.prepare(
    `INSERT INTO audit_logs (id, action, actor, details, justification, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  ).bind(genId(), action, actor, details, justification, ip).run();
}
__name(logAudit, "logAudit");
async function seedPhases(db, projectId) {
  const stmt = db.prepare(
    `INSERT INTO project_phases (id, project_id, phase_number, title, status, notes, created_at)
     VALUES (?, ?, ?, ?, 'pending', '', datetime('now'))`
  );
  const batch = PHASE_TITLES.map(
    (title, i) => stmt.bind(genId(), projectId, i, title)
  );
  await db.batch(batch);
}
__name(seedPhases, "seedPhases");
app.get("/health", (c) => c.json({ status: "ok" }));
app.post("/api/v1/auth/setup", async (c) => {
  try {
    const { setup_key, email, password, name } = await c.req.json();
    if (setup_key !== c.env.SETUP_KEY) {
      return c.json({ error: "Invalid setup key" }, 403);
    }
    const id = genId();
    const hash = await hashPassword(password);
    await c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, 'consultant')
       ON CONFLICT(email) DO NOTHING`
    ).bind(id, email, hash, name).run();
    return c.json({ ok: true, message: "Seed user created or already exists" }, 201);
  } catch (e) {
    return c.json({ error: "Setup failed", detail: e.message }, 500);
  }
});
app.post("/api/v1/auth/login", async (c) => {
  try {
    const { email, password } = await c.req.json();
    const hash = await hashPassword(password);
    const user = await c.env.DB.prepare(
      "SELECT id, email, name, role, client_project_id FROM users WHERE email = ? AND password_hash = ?"
    ).bind(email, hash).first();
    if (!user) {
      return c.json({ error: "Invalid credentials" }, 401);
    }
    const token = genToken();
    await c.env.SESSIONS.put(token, JSON.stringify(user), { expirationTtl: 86400 });
    return c.json({ token, user });
  } catch (e) {
    return c.json({ error: "Login failed", detail: e.message }, 500);
  }
});
app.post("/api/v1/auth/logout", async (c) => {
  const token = c.req.header("Authorization")?.split(" ")[1];
  if (token) await c.env.SESSIONS.delete(token);
  return c.json({ ok: true });
});
app.get("/api/v1/auth/me", (c) => {
  return c.json({ user: c.get("user") });
});
app.post("/api/v1/auth/change-password", async (c) => {
  try {
    const { oldPassword, newPassword } = await c.req.json();
    const user = c.get("user");
    if (!oldPassword || !newPassword) return c.json({ error: "Senhas obrigat\xF3rias" }, 400);
    const oldHash = await hashPassword(oldPassword);
    const dbUser = await c.env.DB.prepare("SELECT id FROM users WHERE email = ? AND password_hash = ?").bind(user.email, oldHash).first();
    if (!dbUser) return c.json({ error: "Senha atual incorreta" }, 401);
    const newHash = await hashPassword(newPassword);
    await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE email = ?").bind(newHash, user.email).run();
    await logAudit(c.env.DB, "auth.password_changed", user.email, "Senha alterada com sucesso");
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: "Falha ao alterar senha", detail: e.message }, 500);
  }
});
app.post("/api/v1/leads", async (c) => {
  try {
    const body = await c.req.json();
    if (!body.company_name) return c.json({ error: "company_name \xE9 obrigat\xF3rio" }, 400);
    const id = genId();
    await c.env.DB.prepare(
      `INSERT INTO leads (id, company_name, contact_name, contact_email, source, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'New', datetime('now'))`
    ).bind(id, body.company_name, body.contact_name || null, body.contact_email || null, body.source || null).run();
    await logAudit(c.env.DB, "lead.created", c.get("user")?.email ?? "system", `Lead ${id} criado para ${body.company_name}`);
    return c.json({ id, ...body, status: "New" }, 201);
  } catch (e) {
    return c.json({ error: "Falha ao criar lead", detail: e.message }, 500);
  }
});
app.get("/api/v1/leads", async (c) => {
  try {
    const { results } = await c.env.DB.prepare("SELECT * FROM leads ORDER BY created_at DESC").all();
    return c.json(results);
  } catch (e) {
    return c.json({ error: "Falha ao listar leads", detail: e.message }, 500);
  }
});
app.get("/api/v1/leads/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const lead = await c.env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(id).first();
    if (!lead) return c.json({ error: "Lead n\xE3o encontrado" }, 404);
    const { results: assessments } = await c.env.DB.prepare("SELECT id, status, complexity, created_at FROM assessments WHERE lead_id = ?").bind(id).all();
    const { results: proposals } = await c.env.DB.prepare("SELECT id, status, total_price, created_at FROM proposals WHERE lead_id = ?").bind(id).all();
    return c.json({ ...lead, assessments, proposals });
  } catch (e) {
    return c.json({ error: "Falha ao buscar lead", detail: e.message }, 500);
  }
});
app.put("/api/v1/leads/:id/status", async (c) => {
  try {
    const id = c.req.param("id");
    const { status } = await c.req.json();
    await c.env.DB.prepare('UPDATE leads SET status = ?, updated_at = datetime("now") WHERE id = ?').bind(status, id).run();
    return c.json({ ok: true, status });
  } catch (e) {
    return c.json({ error: "Falha ao atualizar lead", detail: e.message }, 500);
  }
});
app.post("/api/v1/proposals", async (c) => {
  try {
    const body = await c.req.json();
    if (!body.lead_id || !body.assessment_id) return c.json({ error: "lead_id e assessment_id obrigat\xF3rios" }, 400);
    const id = genId();
    await c.env.DB.prepare(
      `INSERT INTO proposals (id, lead_id, assessment_id, status, total_price, content_html, created_at)
       VALUES (?, ?, ?, 'Draft', ?, ?, datetime('now'))`
    ).bind(id, body.lead_id, body.assessment_id, body.total_price, body.content_html).run();
    await c.env.DB.prepare("UPDATE leads SET status = ? WHERE id = ?").bind("Proposal", body.lead_id).run();
    return c.json({ id, status: "Draft" }, 201);
  } catch (e) {
    return c.json({ error: "Falha ao gerar proposta", detail: e.message }, 500);
  }
});
app.get("/api/v1/proposals/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const proposal = await c.env.DB.prepare("SELECT * FROM proposals WHERE id = ?").bind(id).first();
    if (!proposal) return c.json({ error: "Proposta n\xE3o encontrada" }, 404);
    return c.json(proposal);
  } catch (e) {
    return c.json({ error: "Falha ao buscar proposta", detail: e.message }, 500);
  }
});
app.post("/api/v1/proposals/:id/sign", async (c) => {
  try {
    const id = c.req.param("id");
    const proposal = await c.env.DB.prepare("SELECT * FROM proposals WHERE id = ?").bind(id).first();
    if (!proposal) return c.json({ error: "Proposta n\xE3o encontrada" }, 404);
    if (proposal.status === "Signed") return c.json({ error: "Proposta j\xE1 assinada" }, 400);
    await c.env.DB.prepare(
      "UPDATE proposals SET status = 'Signed', approved_at = datetime('now') WHERE id = ?"
    ).bind(id).run();
    const contractId = genId();
    await c.env.DB.prepare(
      `INSERT INTO contracts (id, proposal_id, lead_id, status, signed_at, created_at)
       VALUES (?, ?, ?, 'Signed', datetime('now'), datetime('now'))`
    ).bind(contractId, id, proposal.lead_id).run();
    if (proposal.lead_id) {
      await c.env.DB.prepare("UPDATE leads SET status = 'Won', updated_at = datetime('now') WHERE id = ?").bind(proposal.lead_id).run();
    }
    await logAudit(c.env.DB, "proposal.signed", c.get("user")?.email ?? "system", `Proposta ${id} assinada. Contrato ${contractId} criado.`);
    const projectId = genId();
    const leadData = await c.env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(proposal.lead_id).first();
    await c.env.DB.prepare(
      `INSERT INTO projects (id, client_name, sector, scope, standards, org_role, status, assessment_id, created_at)
       VALUES (?, ?, '', '', 'ISO 27001:2022', 'Controlador', 'Active', ?, datetime('now'))`
    ).bind(projectId, leadData?.company_name || "Cliente", proposal.assessment_id || "").run();
    for (let i = 0; i <= 40; i++) {
      const phaseId = genId();
      const status = i === 0 ? "in_progress" : "pending";
      await c.env.DB.prepare(
        `INSERT INTO project_phases (id, project_id, phase_number, title, status, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`
      ).bind(phaseId, projectId, i, PHASE_TITLES[i], status).run();
    }
    await logAudit(c.env.DB, "project.created", c.get("user")?.email ?? "system", `Projeto ${projectId} criado automaticamente com 41 fases a partir da proposta ${id}.`);
    return c.json({ ok: true, contract_id: contractId, project_id: projectId, proposal_status: "Signed", lead_status: "Won" });
  } catch (e) {
    return c.json({ error: "Falha ao assinar proposta", detail: e.message }, 500);
  }
});
app.post("/api/v1/projects/:id/auditor-token", async (c) => {
  try {
    const projectId = c.req.param("id");
    const body = await c.req.json().catch(() => ({ days: 7 }));
    const days = Math.min(body.days || 7, 30);
    const project = await c.env.DB.prepare("SELECT id, client_name FROM projects WHERE id = ?").bind(projectId).first();
    if (!project) return c.json({ error: "Projeto n\xE3o encontrado" }, 404);
    const token = genId() + genId();
    const id = genId();
    const expiresAt = new Date(Date.now() + days * 864e5).toISOString();
    await c.env.DB.prepare(
      `INSERT INTO auditor_tokens (id, project_id, token, expires_at, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).bind(id, projectId, token, expiresAt, c.get("user")?.email ?? "system").run();
    await logAudit(
      c.env.DB,
      "auditor.token_created",
      c.get("user")?.email ?? "system",
      `Token de auditor criado para projeto ${projectId}, expira em ${days} dias`
    );
    return c.json({
      token,
      url: `/auditor.html?token=${token}`,
      expires_at: expiresAt,
      days
    }, 201);
  } catch (e) {
    return c.json({ error: "Falha ao gerar token", detail: e.message }, 500);
  }
});
app.get("/api/v1/auditor/:token/project", async (c) => {
  try {
    const token = c.req.param("token");
    const tokenRow = await c.env.DB.prepare(
      "SELECT * FROM auditor_tokens WHERE token = ?"
    ).bind(token).first();
    if (!tokenRow) return c.json({ error: "Token inv\xE1lido" }, 401);
    if (new Date(tokenRow.expires_at) < /* @__PURE__ */ new Date()) {
      return c.json({ error: "Token expirado" }, 401);
    }
    const projectId = tokenRow.project_id;
    const project = await c.env.DB.prepare("SELECT id, client_name, sector, scope, standards, org_role, status, created_at FROM projects WHERE id = ?").bind(projectId).first();
    if (!project) return c.json({ error: "Projeto n\xE3o encontrado" }, 404);
    const { results: phases } = await c.env.DB.prepare(
      "SELECT phase_number, title, status, notes, completed_at FROM project_phases WHERE project_id = ? ORDER BY phase_number"
    ).bind(projectId).all();
    const { results: controls } = await c.env.DB.prepare(
      "SELECT id, standard, title, status, owner FROM compliance_controls ORDER BY id"
    ).all();
    const { results: evidence } = await c.env.DB.prepare(
      "SELECT id, control_id, file_name, file_type, file_size, uploaded_by, created_at FROM evidence WHERE project_id = ?"
    ).bind(projectId).all();
    return c.json({
      project,
      phases,
      controls,
      evidence,
      token_expires_at: tokenRow.expires_at
    });
  } catch (e) {
    return c.json({ error: "Falha ao carregar dados do auditor", detail: e.message }, 500);
  }
});
app.post("/api/v1/assessments", async (c) => {
  try {
    const body = await c.req.json();
    if (!body.client_name) {
      return c.json({ error: "client_name \xE9 obrigat\xF3rio" }, 400);
    }
    const id = genId();
    await c.env.DB.prepare(
      `INSERT INTO assessments (id, lead_id, client_name, status, complexity, created_at)
       VALUES (?, ?, ?, 'in_progress', 'unknown', datetime('now'))`
    ).bind(id, body.lead_id || null, body.client_name).run();
    if (body.lead_id) {
      await c.env.DB.prepare("UPDATE leads SET status = ? WHERE id = ?").bind("Assessment", body.lead_id).run();
    }
    await logAudit(c.env.DB, "assessment.created", c.get("user")?.email ?? "system", `Assessment ${id} criado para ${body.client_name}`);
    return c.json({ id, client_name: body.client_name, lead_id: body.lead_id, status: "in_progress" }, 201);
  } catch (e) {
    return c.json({ error: "Falha ao criar assessment", detail: e.message }, 500);
  }
});
app.get("/api/v1/assessments", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM assessments ORDER BY created_at DESC"
    ).all();
    return c.json(results);
  } catch (e) {
    return c.json({ error: "Falha ao listar assessments", detail: e.message }, 500);
  }
});
app.get("/api/v1/assessments/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const assessment = await c.env.DB.prepare(
      "SELECT * FROM assessments WHERE id = ?"
    ).bind(id).first();
    if (!assessment) {
      return c.json({ error: "Assessment n\xE3o encontrado" }, 404);
    }
    const progress = await c.env.DB.prepare(
      "SELECT COUNT(DISTINCT block) as answered_blocks FROM assessment_answers WHERE assessment_id = ?"
    ).bind(id).first();
    return c.json({
      ...assessment,
      answered_blocks: progress?.answered_blocks ?? 0,
      total_blocks: 10
    });
  } catch (e) {
    return c.json({ error: "Falha ao buscar assessment", detail: e.message }, 500);
  }
});
app.get("/api/v1/assessments/:id/block/:num", async (c) => {
  try {
    const id = c.req.param("id");
    const num = parseInt(c.req.param("num"), 10);
    const assessment = await c.env.DB.prepare(
      "SELECT id FROM assessments WHERE id = ?"
    ).bind(id).first();
    if (!assessment) {
      return c.json({ error: "Assessment n\xE3o encontrado" }, 404);
    }
    if (num < 1 || num > 10) {
      return c.json({ error: "Bloco deve ser entre 1 e 10" }, 400);
    }
    const questions = BLOCK_QUESTIONS[num];
    const { results: existing } = await c.env.DB.prepare(
      "SELECT question_key, answer, notes FROM assessment_answers WHERE assessment_id = ? AND block = ?"
    ).bind(id, num).all();
    const answersMap = new Map(
      (existing ?? []).map((r) => [r.question_key, { answer: r.answer, notes: r.notes }])
    );
    const questionsWithAnswers = questions.map((q) => ({
      ...q,
      answer: answersMap.get(q.key)?.answer ?? null,
      notes: answersMap.get(q.key)?.notes ?? null
    }));
    return c.json({ block: num, questions: questionsWithAnswers });
  } catch (e) {
    return c.json({ error: "Falha ao buscar bloco", detail: e.message }, 500);
  }
});
function mapAnswerToScore(field, value) {
  if (!value) return value;
  const maps = {
    infraestrutura: {
      "AWS": "Nuvem P\xFAblica 100% (AWS/Azure/GCP)",
      "Azure": "Nuvem P\xFAblica 100% (AWS/Azure/GCP)",
      "Google Cloud": "Nuvem P\xFAblica 100% (AWS/Azure/GCP)",
      "Multi-cloud": "Nuvem P\xFAblica 100% (AWS/Azure/GCP)",
      "Oracle Cloud": "Nuvem P\xFAblica 100% (AWS/Azure/GCP)",
      "Cloudflare": "Nuvem P\xFAblica 100% (AWS/Azure/GCP)",
      "DigitalOcean": "Nuvem P\xFAblica 100% (AWS/Azure/GCP)",
      "H\xEDbrido": "H\xEDbrido (Nuvem + On-premise/Legacy)",
      "H\xEDbrido (cloud + on-premise)": "H\xEDbrido (Nuvem + On-premise/Legacy)",
      "Data center pr\xF3prio": "Data Center Local (On-Premise)",
      "On-premises": "Data Center Local (On-Premise)"
    },
    arquitetura: {
      "1 (produ\xE7\xE3o)": "Monolitos (VMs/Containers grandes)",
      "Apenas produ\xE7\xE3o": "Monolitos (VMs/Containers grandes)",
      "2 (staging + prod)": "Monolitos (VMs/Containers grandes)",
      "Dev + Prod": "Monolitos (VMs/Containers grandes)",
      "3 (dev + staging + prod)": "Microsservi\xE7os / Cloud Native",
      "Dev + Staging + Prod": "Microsservi\xE7os / Cloud Native",
      "4+ ambientes": "Microsservi\xE7os / Cloud Native",
      "Dev + QA + Staging + Prod": "Microsservi\xE7os / Cloud Native"
    },
    repositorio: {
      "GitHub": "Git Moderno (GitHub/GitLab)",
      "GitLab": "Git Moderno (GitHub/GitLab)",
      "Bitbucket": "Git Moderno (GitHub/GitLab)",
      "Azure DevOps": "Git Moderno (GitHub/GitLab)",
      "Sem versionamento": "Sem versionamento formal",
      "Outro": "Reposit\xF3rios Legados (SVN/Subversion)"
    },
    deploy: {
      "GitHub Actions": "CI/CD Automatizado",
      "GitLab CI": "CI/CD Automatizado",
      "Jenkins": "CI/CD Automatizado",
      "Pipeline b\xE1sico (build + test)": "CI/CD Automatizado",
      "Pipeline completo (build + test + scan + deploy)": "CI/CD Automatizado",
      "GitOps / deploy automatizado": "CI/CD Automatizado",
      "Sem CI/CD": "Deploy Misto ou Manual (FTP/SSH)",
      "Manual (FTP/SSH/SCP)": "Deploy Misto ou Manual (FTP/SSH)",
      "Inexistente": "Deploy Misto ou Manual (FTP/SSH)",
      "Manual / ad-hoc": "Deploy Misto ou Manual (FTP/SSH)"
    },
    seguranca_codigo: {
      "Sim, SAST (Semgrep, SonarQube)": "Review Rigoroso + Automa\xE7\xE3o (SAST)",
      "SAST (an\xE1lise est\xE1tica)": "Review Rigoroso + Automa\xE7\xE3o (SAST)",
      "Sim, SCA (Snyk, Dependabot)": "Review Rigoroso + Automa\xE7\xE3o (SAST)",
      "SCA (depend\xEAncias)": "Review Rigoroso + Automa\xE7\xE3o (SAST)",
      "DAST (din\xE2mico)": "Review Rigoroso + Automa\xE7\xE3o (SAST)",
      "Secret scanning": "Review Rigoroso + Automa\xE7\xE3o (SAST)",
      "Container scanning": "Review Rigoroso + Automa\xE7\xE3o (SAST)",
      "IaC scanning": "Review Rigoroso + Automa\xE7\xE3o (SAST)",
      "N\xE3o": "Sem valida\xE7\xE3o formal",
      "Nenhuma": "Sem valida\xE7\xE3o formal"
    },
    gestao_identidade: {
      "SSO corporativo (Azure AD, Okta, Google)": "SSO e MFA Centralizado",
      "SSO implementado": "SSO e MFA Centralizado",
      "SSO + MFA obrigat\xF3rio": "SSO e MFA Centralizado",
      "IdP dedicado (Okta, Auth0, Azure AD)": "SSO e MFA Centralizado",
      "MFA sem SSO": "MFA ativo sem SSO",
      "IAM do cloud provider": "MFA ativo sem SSO",
      "Senhas individuais sem pol\xEDtica": "Senhas isoladas / Sem pol\xEDtica estrita",
      "Sem IAM centralizado": "Senhas isoladas / Sem pol\xEDtica estrita"
    },
    continuidade: {
      "Backups automatizados e testados": "Backups Imut\xE1veis Testados + Vendor Risk",
      "Backup autom\xE1tico com teste de restore": "Backups Imut\xE1veis Testados + Vendor Risk",
      "Backup + DR documentado e testado": "Backups Imut\xE1veis Testados + Vendor Risk",
      "Backups autom\xE1ticos sem teste formal": "Backups regulares sem testes formais",
      "Backup autom\xE1tico sem teste de restore": "Backups regulares sem testes formais",
      "Backups manuais": "Processos de Backup/Terceiros Informais",
      "Backup manual / ocasional": "Processos de Backup/Terceiros Informais",
      "Sem backup formal": "Processos de Backup/Terceiros Informais",
      "Sem backup": "Processos de Backup/Terceiros Informais"
    },
    motivador: {
      "Certifica\xE7\xE3o completa": "Exig\xEAncia Contratual/B2B",
      "Gap assessment apenas": "Auditoria e Seguran\xE7a Interna",
      "Implementa\xE7\xE3o e certifica\xE7\xE3o": "Exig\xEAncia Contratual/B2B",
      "Auditoria interna": "Auditoria e Seguran\xE7a Interna"
    }
  };
  const fieldMap = maps[field];
  if (!fieldMap) return value;
  if (value.includes(",")) {
    const parts = value.split(",").map((p) => p.trim());
    for (const part of parts) {
      if (fieldMap[part]) return fieldMap[part];
    }
  }
  return fieldMap[value] || value;
}
__name(mapAnswerToScore, "mapAnswerToScore");
function buildPricingAnswers(ansMap) {
  return {
    motivador: mapAnswerToScore("motivador", ansMap["demand_type"] || ""),
    escopo: ansMap["scope_type"] || "",
    headcount: ansMap["headcount"] || "",
    infraestrutura: mapAnswerToScore("infraestrutura", ansMap["cloud_provider"] || ""),
    arquitetura: mapAnswerToScore("arquitetura", ansMap["environments"] || ""),
    repositorio: mapAnswerToScore("repositorio", ansMap["code_repo"] || ""),
    deploy: mapAnswerToScore("deploy", ansMap["cicd"] || ""),
    seguranca_codigo: mapAnswerToScore("seguranca_codigo", ansMap["sast_sca"] || ""),
    gestao_identidade: mapAnswerToScore("gestao_identidade", ansMap["iam"] || ""),
    continuidade: mapAnswerToScore("continuidade", ansMap["backup"] || ""),
    controles_implementados: ansMap["existing_certs"] || ""
  };
}
__name(buildPricingAnswers, "buildPricingAnswers");
app.get("/api/v1/assessments/:id/pricing", async (c) => {
  try {
    const id = c.req.param("id");
    const { results: answers } = await c.env.DB.prepare(
      "SELECT question_key, answer FROM assessment_answers WHERE assessment_id = ?"
    ).bind(id).all();
    if (!answers || answers.length === 0) {
      return c.json({ error: "Sem respostas para precificar" }, 400);
    }
    const ansMap = {};
    for (const a of answers) {
      ansMap[a.question_key] = a.answer;
    }
    const pricingAnswers = buildPricingAnswers(ansMap);
    const pricing = calculatePricing(pricingAnswers);
    return c.json(pricing);
  } catch (e) {
    return c.json({ error: "Falha na precifica\xE7\xE3o", detail: e.message }, 500);
  }
});
app.post("/api/v1/assessments/:id/generate-proposal", async (c) => {
  try {
    const id = c.req.param("id");
    const user = c.get("user");
    const assessment = await c.env.DB.prepare("SELECT * FROM assessments WHERE id = ?").bind(id).first();
    if (!assessment) return c.json({ error: "Assessment n\xE3o encontrado" }, 404);
    const { results: answers } = await c.env.DB.prepare(
      "SELECT question_key, answer FROM assessment_answers WHERE assessment_id = ?"
    ).bind(id).all();
    const ansMap = {};
    for (const a of answers || []) ansMap[a.question_key] = a.answer;
    const pricingAnswers = buildPricingAnswers(ansMap);
    const pricing = calculatePricing(pricingAnswers);
    const clientName = assessment.client_name || "Cliente";
    const now = (/* @__PURE__ */ new Date()).toLocaleDateString("pt-BR");
    const fasesHtml = pricing.fases.map((f) => `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #1e293b">${f.fase}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #1e293b">${f.nome}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #1e293b;text-align:center">${f.semanas} sem</td>
        <td style="padding:12px 16px;border-bottom:1px solid #1e293b;text-align:center">${f.pdNess} PD</td>
        <td style="padding:12px 16px;border-bottom:1px solid #1e293b;text-align:right;font-weight:600">R$ ${(f.valorFase || 0).toLocaleString("pt-BR")}</td>
      </tr>
    `).join("");
    const gapsHtml = pricing.gaps.length ? `
      <div style="margin-top:2rem;padding:1.5rem;background:rgba(248,81,73,0.08);border:1px solid rgba(248,81,73,0.2);border-radius:12px">
        <h3 style="color:#f85149;margin:0 0 1rem 0;font-size:1rem">Gaps Identificados</h3>
        ${pricing.gaps.map((g) => `
          <div style="margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid rgba(248,81,73,0.1)">
            <div style="font-weight:600;color:#f5f5f7">${g.titulo}</div>
            <div style="font-size:0.85rem;color:#a0a0b0;margin-top:0.25rem">Controles: ${g.controles} | Impacto: ${g.impacto}</div>
            <div style="font-size:0.85rem;color:#a0a0b0">A\xE7\xE3o: ${g.acao}</div>
          </div>
        `).join("")}
      </div>
    ` : "";
    const contentHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proposta Comercial \u2014 ${clientName} | ness.</title>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Inter',sans-serif; background:#070b14; color:#f5f5f7; }
    .page { max-width:900px; margin:0 auto; padding:3rem 2rem; }
    h1 { font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.5rem; }
    h2 { font-family:'Montserrat',sans-serif; font-weight:500; font-size:1.1rem; color:#00ade8; margin:2.5rem 0 1rem 0; text-transform:uppercase; letter-spacing:0.1em; }
    table { width:100%; border-collapse:collapse; margin:1rem 0; }
    th { padding:12px 16px; text-align:left; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.1em; color:#a0a0b0; border-bottom:2px solid #1e293b; }
    .total-row td { font-weight:700; font-size:1.1rem; border-top:2px solid #00ade8; padding-top:1rem; }
    .badge { display:inline-block; padding:4px 12px; border-radius:20px; font-size:0.75rem; font-weight:600; }
    .badge-tier { background:rgba(0,173,232,0.15); color:#00ade8; }
    .signature-line { border-top:1px solid #334155; margin-top:3rem; padding-top:1rem; }
    @media print {
      body { background:white; color:#0f172a; }
      .page { padding:1rem; }
      table th, table td { border-bottom-color:#e2e8f0 !important; }
      .no-print { display:none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3rem">
      <div>
        <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.8rem;color:#00ade8">ness.</div>
        <div style="font-size:0.85rem;color:#a0a0b0;margin-top:0.25rem">Consultoria em Seguran\xE7a & Privacidade</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:0.85rem;color:#a0a0b0">Data: ${now}</div>
        <div style="font-size:0.85rem;color:#a0a0b0">Validade: 30 dias</div>
      </div>
    </div>

    <h1>proposta comercial</h1>
    <p style="color:#a0a0b0;margin-top:0.5rem">Programa de Certifica\xE7\xE3o ISO 27001:2022 para <strong style="color:#f5f5f7">${clientName}</strong></p>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin:2rem 0">
      <div style="padding:1.25rem;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px">
        <div style="font-size:0.7rem;color:#a0a0b0;text-transform:uppercase;letter-spacing:0.1em">Tier</div>
        <div style="font-size:1.3rem;font-weight:600;margin-top:0.25rem">${pricing.tier.name} <span class="badge badge-tier">${pricing.tier.tier}</span></div>
      </div>
      <div style="padding:1.25rem;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px">
        <div style="font-size:0.7rem;color:#a0a0b0;text-transform:uppercase;letter-spacing:0.1em">Dura\xE7\xE3o</div>
        <div style="font-size:1.3rem;font-weight:600;margin-top:0.25rem">${pricing.tier.duracao}</div>
      </div>
      <div style="padding:1.25rem;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px">
        <div style="font-size:0.7rem;color:#a0a0b0;text-transform:uppercase;letter-spacing:0.1em">Score Complexidade</div>
        <div style="font-size:1.3rem;font-weight:600;margin-top:0.25rem">${pricing.score}/${pricing.scoreMax}</div>
      </div>
    </div>

    <h2>escopo e entregas</h2>
    <ul style="list-style:none;padding:0">
      ${pricing.tier.entregas.map((e) => `<li style="padding:0.5rem 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.9rem">\u2713 ${e}</li>`).join("")}
    </ul>

    <h2>cronograma e investimento</h2>
    <table>
      <thead><tr><th>Fase</th><th>Atividade</th><th style="text-align:center">Dura\xE7\xE3o</th><th style="text-align:center">Esfor\xE7o</th><th style="text-align:right">Valor</th></tr></thead>
      <tbody>
        ${fasesHtml}
        <tr class="total-row">
          <td colspan="4" style="padding:12px 16px">Total do Investimento</td>
          <td style="padding:12px 16px;text-align:right;color:#00ade8">R$ ${pricing.precoFinal.toLocaleString("pt-BR")}</td>
        </tr>
      </tbody>
    </table>
    ${pricing.scopeInfo.fator > 1 ? `<p style="font-size:0.8rem;color:#a0a0b0;margin-top:0.5rem">Multiplicador de escopo aplicado: x${pricing.scopeInfo.fator} (${pricing.scopeInfo.label})</p>` : ""}

    ${gapsHtml}

    <h2>condi\xE7\xF5es comerciais</h2>
    <ul style="list-style:none;padding:0;font-size:0.9rem;color:#a0a0b0">
      <li style="padding:0.4rem 0">\u2022 Pagamento: 40% no kick-off, 30% na entrega documental, 30% ap\xF3s auditoria.</li>
      <li style="padding:0.4rem 0">\u2022 Inclui suporte remoto durante os Est\xE1gios 1 e 2 da auditoria de certifica\xE7\xE3o.</li>
      <li style="padding:0.4rem 0">\u2022 Custos da certificadora (taxa de auditoria) n\xE3o inclusos nesta proposta.</li>
      <li style="padding:0.4rem 0">\u2022 Proposta v\xE1lida por 30 dias a partir da data de emiss\xE3o.</li>
    </ul>

    <div class="signature-line">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:3rem;margin-top:2rem">
        <div>
          <div style="font-size:0.8rem;color:#a0a0b0;margin-bottom:3rem">Pela ness.</div>
          <div style="border-top:1px solid #334155;padding-top:0.5rem;font-size:0.85rem">Assinatura</div>
        </div>
        <div>
          <div style="font-size:0.8rem;color:#a0a0b0;margin-bottom:3rem">Pelo ${clientName}</div>
          <div style="border-top:1px solid #334155;padding-top:0.5rem;font-size:0.85rem">Assinatura</div>
        </div>
      </div>
    </div>

    <div class="no-print" style="margin-top:2rem;text-align:center">
      <button onclick="window.print()" style="padding:12px 32px;background:#00ade8;color:#fff;border:none;border-radius:10px;font-size:1rem;font-weight:600;cursor:pointer">Imprimir / Salvar PDF</button>
    </div>
  </div>
</body>
</html>`;
    const leadId = assessment.lead_id;
    const proposalId = genId();
    await c.env.DB.prepare(
      `INSERT INTO proposals (id, lead_id, assessment_id, content_html, total_price, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'Draft', datetime('now'))`
    ).bind(proposalId, leadId, id, contentHtml, pricing.precoFinal).run();
    await logAudit(c.env.DB, "proposal.generated", user?.email ?? "system", `Proposta ${proposalId} gerada automaticamente do assessment ${id}. Tier: ${pricing.tier.name}, Pre\xE7o: R$ ${pricing.precoFinal}`);
    return c.json({ ok: true, proposal_id: proposalId, tier: pricing.tier.name, preco: pricing.precoFinal });
  } catch (e) {
    return c.json({ error: "Falha ao gerar proposta", detail: e.message }, 500);
  }
});
app.post("/api/v1/assessments/:id/block/:num", async (c) => {
  try {
    const id = c.req.param("id");
    const num = parseInt(c.req.param("num"), 10);
    const assessment = await c.env.DB.prepare(
      "SELECT id, status FROM assessments WHERE id = ?"
    ).bind(id).first();
    if (!assessment) {
      return c.json({ error: "Assessment n\xE3o encontrado" }, 404);
    }
    if (num < 1 || num > 10) {
      return c.json({ error: "Bloco deve ser entre 1 e 10" }, 400);
    }
    const body = await c.req.json();
    if (!body.answers || !Array.isArray(body.answers)) {
      return c.json({ error: "answers (array) \xE9 obrigat\xF3rio" }, 400);
    }
    await c.env.DB.prepare(
      "DELETE FROM assessment_answers WHERE assessment_id = ? AND block = ?"
    ).bind(id, num).run();
    const stmt = c.env.DB.prepare(
      `INSERT INTO assessment_answers
         (id, assessment_id, block, question_key, question, answer, complexity_impact, gap_detected, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    );
    const batch = body.answers.map(
      (a) => stmt.bind(
        genId(),
        id,
        num,
        a.question_key,
        a.question,
        a.answer,
        a.complexity_impact ?? null,
        a.gap_detected ?? 0,
        a.notes ?? null
      )
    );
    await c.env.DB.batch(batch);
    await logAudit(
      c.env.DB,
      "assessment.block_saved",
      c.get("user")?.email ?? "system",
      `Bloco ${num} salvo para assessment ${id} (${body.answers.length} respostas)`
    );
    return c.json({ ok: true, block: num, saved: body.answers.length });
  } catch (e) {
    return c.json({ error: "Falha ao salvar respostas", detail: e.message }, 500);
  }
});
app.post("/api/v1/assessments/:id/convert", async (c) => {
  try {
    const id = c.req.param("id");
    const assessment = await c.env.DB.prepare(
      "SELECT * FROM assessments WHERE id = ?"
    ).bind(id).first();
    if (!assessment) {
      return c.json({ error: "Assessment n\xE3o encontrado" }, 404);
    }
    if (assessment.converted_project_id) {
      return c.json({ error: "Assessment j\xE1 foi convertido", project_id: assessment.converted_project_id }, 409);
    }
    const { results: answers } = await c.env.DB.prepare(
      "SELECT question_key, answer FROM assessment_answers WHERE assessment_id = ?"
    ).bind(id).all();
    const answerMap = new Map((answers ?? []).map((a) => [a.question_key, a.answer]));
    const projectId = genId();
    const sector = answerMap.get("sector") ?? "";
    const scope = answerMap.get("scope_type") ?? "";
    const standards = answerMap.get("target_standard") ?? "ISO 27001";
    const orgRole = answerMap.get("data_role") ?? "";
    await c.env.DB.prepare(
      `INSERT INTO projects (id, client_name, sector, scope, standards, org_role, status, assessment_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, datetime('now'))`
    ).bind(projectId, assessment.client_name, sector, scope, standards, orgRole, id).run();
    await seedPhases(c.env.DB, projectId);
    await c.env.DB.prepare(
      `UPDATE assessments SET status = 'converted', converted_project_id = ?, completed_at = datetime('now') WHERE id = ?`
    ).bind(projectId, id).run();
    await logAudit(
      c.env.DB,
      "assessment.converted",
      c.get("user")?.email ?? "system",
      `Assessment ${id} convertido em projeto ${projectId}`
    );
    return c.json({ ok: true, project_id: projectId }, 201);
  } catch (e) {
    return c.json({ error: "Falha ao converter assessment", detail: e.message }, 500);
  }
});
app.post("/api/v1/projects", async (c) => {
  try {
    const body = await c.req.json();
    if (!body.client_name) {
      return c.json({ error: "client_name \xE9 obrigat\xF3rio" }, 400);
    }
    const id = genId();
    await c.env.DB.prepare(
      `INSERT INTO projects (id, client_name, sector, scope, standards, org_role, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', datetime('now'))`
    ).bind(
      id,
      body.client_name,
      body.sector ?? "",
      body.scope ?? "",
      body.standards ?? "ISO 27001",
      body.org_role ?? ""
    ).run();
    await seedPhases(c.env.DB, id);
    await logAudit(c.env.DB, "project.created", c.get("user")?.email ?? "system", `Projeto ${id} criado para ${body.client_name}`);
    return c.json({ id, client_name: body.client_name, status: "active" }, 201);
  } catch (e) {
    return c.json({ error: "Falha ao criar projeto", detail: e.message }, 500);
  }
});
app.get("/api/v1/projects", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM projects ORDER BY created_at DESC"
    ).all();
    return c.json(results);
  } catch (e) {
    return c.json({ error: "Falha ao listar projetos", detail: e.message }, 500);
  }
});
app.get("/api/v1/projects/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const project = await c.env.DB.prepare(
      "SELECT * FROM projects WHERE id = ?"
    ).bind(id).first();
    if (!project) {
      return c.json({ error: "Projeto n\xE3o encontrado" }, 404);
    }
    return c.json(project);
  } catch (e) {
    return c.json({ error: "Falha ao buscar projeto", detail: e.message }, 500);
  }
});
app.get("/api/v1/projects/:id/phases", async (c) => {
  try {
    const id = c.req.param("id");
    const project = await c.env.DB.prepare(
      "SELECT id FROM projects WHERE id = ?"
    ).bind(id).first();
    if (!project) {
      return c.json({ error: "Projeto n\xE3o encontrado" }, 404);
    }
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM project_phases WHERE project_id = ? ORDER BY phase_number ASC"
    ).bind(id).all();
    return c.json(results);
  } catch (e) {
    return c.json({ error: "Falha ao buscar fases", detail: e.message }, 500);
  }
});
app.put("/api/v1/projects/:id/phases/:num", async (c) => {
  try {
    const projectId = c.req.param("id");
    const phaseNum = parseInt(c.req.param("num"), 10);
    const body = await c.req.json();
    if (!body.status) {
      return c.json({ error: "status \xE9 obrigat\xF3rio" }, 400);
    }
    const validStatuses = ["pending", "in_progress", "completed", "blocked", "skipped"];
    if (!validStatuses.includes(body.status)) {
      return c.json({ error: `status inv\xE1lido. Use: ${validStatuses.join(", ")}` }, 400);
    }
    const phase = await c.env.DB.prepare(
      "SELECT id FROM project_phases WHERE project_id = ? AND phase_number = ?"
    ).bind(projectId, phaseNum).first();
    if (!phase) {
      return c.json({ error: "Fase n\xE3o encontrada" }, 404);
    }
    const completedAt = body.status === "completed" ? "datetime('now')" : "NULL";
    await c.env.DB.prepare(
      `UPDATE project_phases
       SET status = ?, notes = ?, completed_at = ${body.status === "completed" ? "datetime('now')" : "NULL"}
       WHERE project_id = ? AND phase_number = ?`
    ).bind(body.status, body.notes ?? "", projectId, phaseNum).run();
    await logAudit(
      c.env.DB,
      "phase.updated",
      c.get("user")?.email ?? "system",
      `Fase ${phaseNum} do projeto ${projectId} atualizada para ${body.status}`
    );
    return c.json({ ok: true, phase_number: phaseNum, status: body.status });
  } catch (e) {
    return c.json({ error: "Falha ao atualizar fase", detail: e.message }, 500);
  }
});
app.get("/api/v1/projects/:id/interviews/:track", async (c) => {
  try {
    const projectId = c.req.param("id");
    const track = c.req.param("track");
    const project = await c.env.DB.prepare(
      "SELECT id FROM projects WHERE id = ?"
    ).bind(projectId).first();
    if (!project) {
      return c.json({ error: "Projeto n\xE3o encontrado" }, 404);
    }
    const questions = INTERVIEW_TRACKS[track];
    if (!questions) {
      const available = Object.keys(INTERVIEW_TRACKS);
      return c.json({ error: `Trilha n\xE3o encontrada. Dispon\xEDveis: ${available.join(", ")}` }, 404);
    }
    const { results: existing } = await c.env.DB.prepare(
      "SELECT question, answer, interviewee, gap_detected FROM project_interviews WHERE project_id = ? AND track = ?"
    ).bind(projectId, track).all();
    const answeredMap = new Map(
      (existing ?? []).map((r) => [r.question, { answer: r.answer, interviewee: r.interviewee, gap_detected: r.gap_detected }])
    );
    const questionsWithAnswers = questions.map((q) => ({
      ...q,
      answer: answeredMap.get(q.question)?.answer ?? null,
      interviewee: answeredMap.get(q.question)?.interviewee ?? null,
      gap_detected: answeredMap.get(q.question)?.gap_detected ?? null
    }));
    return c.json({ track, questions: questionsWithAnswers });
  } catch (e) {
    return c.json({ error: "Falha ao buscar entrevistas", detail: e.message }, 500);
  }
});
app.post("/api/v1/projects/:id/interviews", async (c) => {
  try {
    const projectId = c.req.param("id");
    const project = await c.env.DB.prepare(
      "SELECT id FROM projects WHERE id = ?"
    ).bind(projectId).first();
    if (!project) {
      return c.json({ error: "Projeto n\xE3o encontrado" }, 404);
    }
    const body = await c.req.json();
    if (!body.track || !body.question || !body.answer) {
      return c.json({ error: "track, question e answer s\xE3o obrigat\xF3rios" }, 400);
    }
    const id = genId();
    await c.env.DB.prepare(
      `INSERT INTO project_interviews (id, project_id, track, question, answer, interviewee, gap_detected, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(id, projectId, body.track, body.question, body.answer, body.interviewee ?? "", body.gap_detected ?? 0).run();
    await logAudit(
      c.env.DB,
      "interview.saved",
      c.get("user")?.email ?? "system",
      `Entrevista salva: trilha ${body.track}, projeto ${projectId}`
    );
    return c.json({ ok: true, id }, 201);
  } catch (e) {
    return c.json({ error: "Falha ao salvar entrevista", detail: e.message }, 500);
  }
});
app.get("/api/v1/controls", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM compliance_controls ORDER BY id ASC"
    ).all();
    return c.json(results);
  } catch (e) {
    return c.json({ error: "Falha ao buscar controles", detail: e.message }, 500);
  }
});
app.get("/api/v1/dashboard", async (c) => {
  try {
    const totalAssessments = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM assessments"
    ).first();
    const totalProjects = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM projects"
    ).first();
    const activeProjects = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM projects WHERE status = 'active'"
    ).first();
    const completedPhases = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM project_phases WHERE status = 'completed'"
    ).first();
    const totalPhases = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM project_phases"
    ).first();
    const totalControls = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM compliance_controls"
    ).first();
    const implementedControls = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM compliance_controls WHERE status = 'implemented'"
    ).first();
    return c.json({
      assessments: totalAssessments?.count ?? 0,
      projects: totalProjects?.count ?? 0,
      active_projects: activeProjects?.count ?? 0,
      completed_phases: completedPhases?.count ?? 0,
      total_phases: totalPhases?.count ?? 0,
      phase_progress: totalPhases?.count ? Math.round((completedPhases?.count ?? 0) / totalPhases.count * 100 * 10) / 10 : 0,
      total_controls: totalControls?.count ?? 0,
      implemented_controls: implementedControls?.count ?? 0,
      control_readiness: totalControls?.count ? Math.round((implementedControls?.count ?? 0) / totalControls.count * 100 * 10) / 10 : 0
    });
  } catch (e) {
    return c.json({ error: "Falha ao gerar dashboard", detail: e.message }, 500);
  }
});
app.get("/api/v1/phases/config", (c) => {
  return c.json(PHASE_CHECKLISTS);
});
app.get("/*", module({ root: "./" }));
var index_default = app;
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
