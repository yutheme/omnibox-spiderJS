// ========== 资源站爬虫模板 - 优化版 ==========

const OmniBox = require("omnibox_sdk");
const runner = require("spider_runner");

// ========== 配置（可通过环境变量覆盖） ==========
const SITE_API = process.env.SITE_API;
const DANMU_API = process.env.DANMU_API;
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || "5000", 10);
const REQUEST_RETRIES = parseInt(process.env.REQUEST_RETRIES || "1", 10);
const RETRY_DELAY_MS = parseInt(process.env.RETRY_DELAY_MS || "300", 10);
const DETAIL_BATCH_SIZE = parseInt(process.env.DETAIL_BATCH_SIZE || "20", 10);
const MAX_CONCURRENT_REQUESTS = parseInt(process.env.MAX_CONCURRENT_REQUESTS || "6", 10);
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS || String(1000 * 60 * 5), 10);
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

// ========== 工具函数 ==========

function log(level, msg) {
  const levels = { error: 0, warn: 1, info: 2 };
  if ((levels[level] ?? 2) <= (levels[LOG_LEVEL] ?? 2)) OmniBox.log(level, msg);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(base, params = {}) {
  try {
    const u = new URL(base);
    Object.keys(params).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== "") u.searchParams.append(k, String(v));
    });
    return u.toString();
  } catch (e) {
    const keys = Object.keys(params);
    if (keys.length === 0) return base;
    const q = keys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join("&");
    return base + (base.includes("?") ? "&" : "?") + q;
  }
}

function getFieldValue(item, keys, defaultValue = "") {
  if (!item || typeof item !== "object") return defaultValue;
  for (const key of keys) {
    if (item[key] !== undefined && item[key] !== null) return String(item[key]);
  }
  return defaultValue;
}

function toInt(v) {
  if (typeof v === "number") return Math.floor(v);
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

// ========== 内存缓存（带过期清理） ==========
const cache = new Map();
let cleanupTimer = null;

function cacheSet(key, value, ttl = CACHE_TTL_MS) {
  cache.set(key, { value, expires: Date.now() + ttl });
  startCleanupTimer();
}

function cacheGet(key) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() > e.expires) {
    cache.delete(key);
    return null;
  }
  return e.value;
}

function cacheDel(key) {
  cache.delete(key);
}

function startCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setTimeout(() => {
    const now = Date.now();
    for (const [key, e] of cache.entries()) {
      if (now > e.expires) cache.delete(key);
    }
    cleanupTimer = null;
    if (cache.size > 0) startCleanupTimer();
  }, 60000);
}

// ========== 并发信号量 ==========
let currentConcurrency = 0;
const pendingQueue = [];

function acquire() {
  if (currentConcurrency < MAX_CONCURRENT_REQUESTS) {
    currentConcurrency++;
    return Promise.resolve();
  }
  return new Promise((resolve) => pendingQueue.push(resolve));
}

function release() {
  currentConcurrency = Math.max(0, currentConcurrency - 1);
  if (pendingQueue.length > 0) {
    const next = pendingQueue.shift();
    currentConcurrency++;
    next();
  }
}

// ========== 请求封装（带超时控制） ==========
async function requestWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const { signal } = controller;

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const resp = await OmniBox.request(url, { ...options, signal });
    clearTimeout(timeoutId);
    return resp;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") throw new Error("请求超时");
    throw err;
  }
}

async function requestSiteAPI(params = {}) {
  if (!SITE_API) throw new Error("请配置 SITE_API 环境变量");
  const url = buildUrl(SITE_API, params);

  const cacheable = params.ac === "detail" || params.ac === "list" || params.ac === "class";
  const cacheKey = cacheable ? `${params.ac}:${JSON.stringify(params)}` : null;
  if (cacheable) {
    const cached = cacheGet(cacheKey);
    if (cached) {
      log("info", `cache hit: ${cacheKey}`);
      return cached;
    }
  }

  let attempt = 0;
  let lastErr = null;
  while (attempt <= REQUEST_RETRIES) {
    attempt++;
    await acquire();
    try {
      log("info", `请求: ${url} (尝试 ${attempt})`);
      const resp = await requestWithTimeout(url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          Accept: "application/json, text/javascript, */*; q=0.01",
        },
      }, REQUEST_TIMEOUT_MS);
      release();

      if (!resp || typeof resp.statusCode !== "number") throw new Error("无效 HTTP 响应");
      if (resp.statusCode !== 200) {
        const snippet = typeof resp.body === "string" ? resp.body.substring(0, 512) : "";
        throw new Error(`HTTP ${resp.statusCode}: ${snippet}`);
      }

      let parsed;
      try {
        parsed = JSON.parse(resp.body || "{}");
      } catch (e) {
        log("warn", "响应非 JSON，返回 raw 字段");
        parsed = { raw: resp.body || "" };
      }

      if (cacheable) cacheSet(cacheKey, parsed);
      return parsed;
    } catch (err) {
      release();
      lastErr = err;
      log("warn", `请求失败（第 ${attempt} 次）: ${err.message}`);
      if (attempt > REQUEST_RETRIES) break;
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  log("error", `请求最终失败: ${lastErr ? lastErr.message : "未知错误"}`);
  throw lastErr || new Error("请求失败");
}

// ========== 格式化函数 ==========

function formatPlayFrom(vodPlayFrom, vodId) {
  if (!vodPlayFrom || !vodId) return vodPlayFrom || "";
  return vodPlayFrom.includes("$$$")
    ? vodPlayFrom.split("$$$")
        .map((l) => (l ? `${l.trim()}-${vodId}` : ""))
        .filter(Boolean)
        .join("$$$")
    : `${vodPlayFrom}-${vodId}`;
}

function formatVideos(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const vodId = getFieldValue(item, ["vod_id", "VodID", "id"]);
      if (!vodId) return null;
      return {
        vod_id: vodId,
        vod_name: getFieldValue(item, ["vod_name", "VodName", "name"]),
        vod_pic: getFieldValue(item, ["vod_pic", "VodPic", "pic"]),
        type_id: getFieldValue(item, ["type_id", "TypeID", "tid"]),
        type_name: getFieldValue(item, ["type_name", "TypeName", "type"]),
        vod_year: getFieldValue(item, ["vod_year", "VodYear", "year"]),
        vod_remarks: getFieldValue(item, ["vod_remarks", "VodRemarks", "remarks"]),
        vod_time: getFieldValue(item, ["vod_time", "VodTime", "time"]),
        vod_play_from: formatPlayFrom(getFieldValue(item, ["vod_play_from", "VodPlayFrom", "play_from"]), vodId),
        vod_play_url: getFieldValue(item, ["vod_play_url", "VodPlayURL", "play_url"]),
        vod_douban_score: getFieldValue(item, ["vod_douban_score", "VodDoubanScore", "score"]),
      };
    })
    .filter(Boolean);
}

function convertToPlaySources(vodPlayFrom, vodPlayUrl, vodId) {
  const playSources = [];
  if (!vodPlayFrom || !vodPlayUrl) return playSources;

  const names = vodPlayFrom.split("$$$").map((s) => s.trim()).filter(Boolean);
  const urls = vodPlayUrl.split("$$$").map((s) => s.trim()).filter(Boolean);
  const max = Math.max(names.length, urls.length);

  for (let i = 0; i < max; i++) {
    let name = names[i] || `线路${i + 1}`;
    if (vodId && name.endsWith(`-${vodId}`)) {
      name = name.substring(0, name.length - `-${vodId}`.length);
    }

    const urlStr = urls[i] || "";
    const episodes = [];

    if (urlStr) {
      const segs = urlStr.split("#").map((s) => s.trim()).filter(Boolean);
      for (const seg of segs) {
        const parts = seg.split("$");
        if (parts.length >= 2) {
          const epName = parts[0].trim();
          const playId = parts.slice(1).join("$").trim();
          if (epName && playId) episodes.push({ name: epName, playId });
        } else if (parts.length === 1 && parts[0]) {
          episodes.push({ name: `第${episodes.length + 1}集`, playId: parts[0].trim() });
        }
      }
    }

    if (episodes.length > 0) playSources.push({ name, episodes });
  }

  return playSources;
}

function formatDetailVideos(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const vodId = getFieldValue(item, ["vod_id", "VodID", "id"]);
      if (!vodId) return null;

      const vodPlayFrom = getFieldValue(item, ["vod_play_from", "VodPlayFrom", "play_from"]);
      const vodPlayUrl = getFieldValue(item, ["vod_play_url", "VodPlayURL", "play_url"]);
      const vodPlaySources = convertToPlaySources(vodPlayFrom, vodPlayUrl, vodId);

      return {
        vod_id: vodId,
        vod_name: getFieldValue(item, ["vod_name", "VodName", "name"]),
        vod_pic: getFieldValue(item, ["vod_pic", "VodPic", "pic"]),
        type_name: getFieldValue(item, ["type_name", "TypeName", "type"]),
        vod_year: getFieldValue(item, ["vod_year", "VodYear", "year"]),
        vod_area: getFieldValue(item, ["vod_area", "VodArea", "area"]),
        vod_remarks: getFieldValue(item, ["vod_remarks", "VodRemarks", "remarks"]),
        vod_actor: getFieldValue(item, ["vod_actor", "VodActor", "actor"]),
        vod_director: getFieldValue(item, ["vod_director", "VodDirector", "director"]),
        vod_content: getFieldValue(item, ["vod_content", "VodContent", "content"]).trim(),
        vod_play_sources: vodPlaySources.length > 0 ? vodPlaySources : undefined,
        vod_douban_score: getFieldValue(item, ["vod_douban_score", "VodDoubanScore", "score"]),
      };
    })
    .filter(Boolean);
}

function formatClasses(classes) {
  if (!Array.isArray(classes)) return [];
  const seen = new Set();
  const out = [];
  for (const c of classes) {
    if (!c || typeof c !== "object") continue;
    const id = getFieldValue(c, ["type_id", "TypeID", "id"]);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      type_id: id,
      type_pid: getFieldValue(c, ["type_pid", "TypePID", "pid"]),
      type_name: getFieldValue(c, ["type_name", "TypeName", "name"]).trim(),
    });
  }
  return out;
}

function extractDigits(str) {
  if (typeof str !== "string") return "";
  return str.replace(/\D/g, "");
}

function extractVideoIdFromFlag(flag) {
  if (!flag) return "";
  if (flag.includes("-")) {
    const parts = flag.split("-");
    const last = parts[parts.length - 1];
    if (/^\d+$/.test(last)) return last;
  }
  if (/^\d+$/.test(flag)) return flag;
  return "";
}

function inferFileNameFromURL(url) {
  try {
    const u = new URL(url);
    let base = u.pathname.split("/").pop() || "";
    const dot = base.lastIndexOf(".");
    if (dot > 0) base = base.substring(0, dot);
    base = base.replace(/[_-]/g, " ").replace(/\./g, " ").trim();
    return base || url;
  } catch (e) {
    return url;
  }
}

// ========== 批量详情补全 ==========
async function enrichVideosWithDetails(videos) {
  if (!Array.isArray(videos) || videos.length === 0) return videos;

  const need = [];
  const map = new Map();
  for (const v of videos) {
    if (!v.vod_pic || v.vod_pic === "<nil>" || !v.vod_year || v.vod_year === "<nil>" || !v.vod_douban_score || v.vod_douban_score === "<nil>") {
      need.push(v.vod_id);
      map.set(v.vod_id, v);
    }
  }

  if (need.length === 0) return videos;

  const tasks = [];
  for (let i = 0; i < need.length; i += DETAIL_BATCH_SIZE) {
    const batch = need.slice(i, i + DETAIL_BATCH_SIZE);
    tasks.push(requestSiteAPI({ ac: "detail", ids: batch.join(",") }));
  }

  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === "fulfilled" && Array.isArray(r.value.list)) {
      for (const item of r.value.list) {
        const id = getFieldValue(item, ["vod_id", "VodID", "id"]);
        const orig = map.get(id);
        if (!orig) continue;

        const pic = getFieldValue(item, ["vod_pic", "VodPic", "pic"]);
        if (pic && pic !== "<nil>") orig.vod_pic = pic;

        const year = getFieldValue(item, ["vod_year", "VodYear", "year"]);
        if (year && year !== "<nil>") orig.vod_year = year;

        const score = getFieldValue(item, ["vod_douban_score", "VodDoubanScore", "score"]);
        if (score && score !== "<nil>") orig.vod_douban_score = score;
      }
    } else {
      log("warn", `批量详情补全部分失败: ${r.status === "rejected" ? (r.reason?.message || "未知错误") : "无数据"}`);
    }
  }

  return videos;
}

// ========== 弹幕匹配 ==========
async function matchDanmu(fileName) {
  if (!DANMU_API || !fileName) return [];

  const cacheKey = `danmu:match:${fileName}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    log("info", `匹配弹幕: ${fileName}`);
    const matchUrl = `${DANMU_API}/api/v2/match`;
    const resp = await OmniBox.request(matchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
      body: JSON.stringify({ fileName }),
    });

    if (resp.statusCode !== 200) return [];

    const data = JSON.parse(resp.body || "{}");
    if (!data.isMatched || !data.matches?.length) return [];

    const first = data.matches[0];
    if (!first.episodeId) return [];

    const name = (first.animeTitle && first.episodeTitle) ? `${first.animeTitle} - ${first.episodeTitle}` : (first.animeTitle || first.episodeTitle || "弹幕");
    const out = [{ name, url: `${DANMU_API}/api/v2/comment/${first.episodeId}?format=xml` }];

    cacheSet(cacheKey, out, 1000 * 60 * 60);
    return out;
  } catch (e) {
    log("warn", `弹幕匹配失败: ${e.message}`);
    return [];
  }
}

// ========== 接口实现 ==========

async function home(params) {
  try {
    log("info", "获取首页数据");
    const page = params.page || "1";
    let resp = await requestSiteAPI({ ac: "list", pg: page });

    if (!resp.class || (Array.isArray(resp.class) && resp.class.length === 0)) {
      try {
        const c = await requestSiteAPI({ ac: "class" });
        if (c.class) resp.class = c.class;
      } catch (e) {
        log("warn", `获取分类失败: ${e.message}`);
      }
    }

    const classes = formatClasses(resp.class || []);
    let videos = formatVideos(resp.list || []);
    videos = await enrichVideosWithDetails(videos);

    return { class: classes, list: videos };
  } catch (e) {
    log("error", `home 失败: ${e.message}`);
    return { class: [], list: [] };
  }
}

async function category(params) {
  try {
    const categoryId = params.categoryId;
    const page = params.page || 1;
    if (!categoryId) throw new Error("分类ID不能为空");

    log("info", `获取分类: ${categoryId} 页 ${page}`);
    const resp = await requestSiteAPI({ ac: "videolist", t: categoryId, pg: String(page) });
    const videos = formatVideos(resp.list || []);

    return { page: toInt(resp.page), pagecount: toInt(resp.pagecount), total: toInt(resp.total), list: videos };
  } catch (e) {
    log("error", `category 失败: ${e.message}`);
    return { page: 1, pagecount: 0, total: 0, list: [] };
  }
}

async function detail(params) {
  try {
    const videoId = params.videoId;
    if (!videoId) throw new Error("视频ID不能为空");

    log("info", `获取详情: ${videoId}`);
    const resp = await requestSiteAPI({ ac: "detail", ids: videoId });
    const videos = formatDetailVideos(resp.list || []);

    return { list: videos };
  } catch (e) {
    log("error", `detail 失败: ${e.message}`);
    return { list: [] };
  }
}

async function search(params) {
  try {
    const keyword = params.keyword || params.wd || "";
    const page = params.page || 1;
    if (!keyword) return { page: 1, pagecount: 0, total: 0, list: [] };

    log("info", `搜索: ${keyword} 页 ${page}`);
    const resp = await requestSiteAPI({ ac: "list", wd: keyword, pg: String(page) });
    let videos = formatVideos(resp.list || []);

    if (videos.length > 0 && (!videos[0].vod_pic || videos[0].vod_pic === "")) {
      try {
        const ids = videos.map((v) => v.vod_id).join(",");
        const d = await requestSiteAPI({ ac: "detail", ids });
        videos = formatVideos(d.list || []);
      } catch (e) {
        log("warn", `补全搜索结果失败: ${e.message}`);
      }
    }

    return { page: toInt(resp.page), pagecount: toInt(resp.pagecount), total: toInt(resp.total), list: videos };
  } catch (e) {
    log("error", `search 失败: ${e.message}`);
    return { page: 1, pagecount: 0, total: 0, list: [] };
  }
}

async function play(params) {
  try {
    const playId = params.playId;
    const flag = params.flag || "";
    if (!playId) throw new Error("播放地址ID不能为空");

    const videoId = extractVideoIdFromFlag(flag);
    log("info", `play: playId=${playId} flag=${flag} videoId=${videoId}`);

    const urls = [{ name: "播放", url: playId }];
    let parse = /\.(m3u8|mp4)$/.test(playId) ? 0 : 1;
    const result = { urls, flag, header: {}, parse };

    if (DANMU_API && videoId) {
      let fileName = "";
      try {
        const d = await requestSiteAPI({ ac: "detail", ids: videoId });
        if (d.list?.length > 0) {
          const v = d.list[0];
          const videoName = getFieldValue(v, ["vod_name", "VodName"]);
          const playURL = getFieldValue(v, ["vod_play_url", "VodPlayURL"]);

          if (videoName && playURL) {
            const segments = playURL.split("#").filter(Boolean);
            if (segments.length === 1) {
              fileName = videoName;
            } else {
              let epNum = 0;
              for (let idx = 0; idx < segments.length; idx++) {
                const seg = segments[idx];
                const parts = seg.split("$");
                if (parts.length >= 2) {
                  const label = parts[0].trim();
                  const epURL = parts[1].trim();
                  if (epURL === playId || epURL.includes(playId) || playId.includes(epURL)) {
                    const digits = extractDigits(label);
                    epNum = digits ? parseInt(digits, 10) : idx + 1;
                    break;
                  }
                }
              }
              if (epNum > 0) {
                fileName = epNum < 10 ? `${videoName} S01E0${epNum}` : `${videoName} S01E${epNum}`;
              } else {
                fileName = videoName;
              }
            }
          }
        }
      } catch (e) {
        log("warn", `获取详情失败，无法推断文件名: ${e.message}`);
      }

      if (!fileName) fileName = inferFileNameFromURL(playId);

      if (fileName) {
        const danmakuList = await matchDanmu(fileName);
        if (danmakuList.length > 0) result.danmaku = danmakuList;
      }
    }

    return result;
  } catch (e) {
    log("error", `play 失败: ${e.message}`);
    return { urls: [], flag: params.flag || "", header: {} };
  }
}

module.exports = { home, category, search, detail, play };
runner.run(module.exports);
