// @name 155资源
// @author vscode
// @description 刮削：支持，弹幕：支持，嗅探：支持
// @version 1.1.0
// @downloadURL https://github.com/yutheme/box-sJS/raw/main/155资源.js

/**
 * OmniBox 采集站爬虫 - 155资源
 *
 * 此脚本直接调用采集站接口获取数据
 * 只需要配置采集站的 API 地址即可使用
 *
 * 使用方法：
 * 1. 在 OmniBox 后台创建爬虫源，选择 JavaScript 类型
 * 2. 复制此脚本内容到爬虫源编辑器
 * 3. 保存并测试
 */

const OmniBox = require("omnibox_sdk");

// ==================== 配置区域 ====================
const SITE_API = process.env.SITE_API || "https://155api.com/api.php/provide/vod";
const DANMU_API = process.env.DANMU_API || "http://192.168.0.123:9321/87654321";
// ==================== 配置区域结束 ====================

// ==================== 缓存区域 ====================
const cache = {
  videoDetails: new Map(),
  danmu: new Map()
};
const CACHE_TTL = 5 * 60 * 1000; // 缓存5分钟
// ==================== 缓存区域结束 ====================

/**
 * 统一错误处理函数
 */
function handleError(error, context, defaultResult) {
  const errorMessage = `[${context}] ${error.message}`;
  OmniBox.log("error", errorMessage);
  return defaultResult;
}

/**
 * 发送 HTTP 请求到采集站
 */
async function requestSiteAPI(params = {}, retryCount = 3) {
  if (!SITE_API) {
    throw new Error("请配置采集站 API 地址（SITE_API 环境变量）");
  }
  const url = new URL(SITE_API);
  Object.keys(params).forEach((key) => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== "") {
      url.searchParams.append(key, params[key]);
    }
  });
  OmniBox.log("info", `请求采集站: ${url.toString()}`);
  try {
    const response = await OmniBox.request(url.toString(), {
      method: "GET",
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
        "Accept-Charset": "utf-8"
      },
      timeout: 10000,
    });
    if (response.statusCode !== 200) {
      throw new Error(`HTTP ${response.statusCode}: ${response.body}`);
    }
    if (!response.body) {
      throw new Error("响应体为空");
    }
    try {
      return JSON.parse(response.body);
    } catch (parseError) {
      OmniBox.log("error", `JSON 解析失败: ${parseError.message}, 响应内容: ${response.body.substring(0, 200)}`);
      throw new Error(`JSON 解析失败: ${parseError.message}`);
    }
  } catch (error) {
    OmniBox.log("error", `请求采集站失败: ${error.message}`);
    if (retryCount > 0) {
      OmniBox.log("info", `重试请求 (${3 - retryCount + 1}/3)`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return requestSiteAPI(params, retryCount - 1);
    }
    throw error;
  }
}

function toInt(value) {
  if (typeof value === "number") return Math.floor(value);
  if (typeof value === "string") {
    const num = parseInt(value, 10);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

function normalizePage(page) {
  const p = toInt(page);
  return p < 1 ? 1 : p;
}

function fixEncoding(str) {
  if (typeof str !== "string") return str;
  
  const hasGarbled = /[\x80-\xFF]{2,}/.test(str) && !/[\u4e00-\u9fa5]/.test(str);
  if (!hasGarbled) return str;
  
  try {
    const latin1Buffer = Buffer.from(str, "latin1");
    if (latin1Buffer.toString("utf8") !== str) {
      return latin1Buffer.toString("utf8");
    }
    return str;
  } catch (e) {
    return str;
  }
}

function processPlayFrom(vodPlayFrom, vodId) {
  if (!vodPlayFrom || !vodId) return vodPlayFrom;
  if (vodPlayFrom.includes("$$$")) {
    const lines = vodPlayFrom.split("$$$");
    const processedLines = lines
      .map((line) => { const t = line.trim(); return t ? `${t}-${vodId}` : t; })
      .filter((line) => line);
    return processedLines.join("$$$");
  }
  return `${vodPlayFrom}-${vodId}`;
}

function formatVideos(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (typeof item !== "object" || item === null) return null;
      const vodId = String(item.vod_id || item.VodID || "");
      const vodPlayFrom = processPlayFrom(
        String(item.vod_play_from || item.VodPlayFrom || ""),
        vodId
      );
      return {
        vod_id: vodId,
        vod_name: fixEncoding(String(item.vod_name || item.VodName || "")),
        vod_pic: String(item.vod_pic || item.VodPic || ""),
        type_id: String(item.type_id || item.TypeID || ""),
        type_name: fixEncoding(String(item.type_name || item.TypeName || "")),
        vod_year: String(item.vod_year || item.VodYear || ""),
        vod_remarks: fixEncoding(String(item.vod_remarks || item.VodRemarks || "")),
        vod_time: String(item.vod_time || item.VodTime || ""),
        vod_play_from: vodPlayFrom,
        vod_play_url: String(item.vod_play_url || item.VodPlayURL || ""),
        vod_douban_score: String(item.vod_douban_score || item.VodDoubanScore || ""),
      };
    })
    .filter((item) => item !== null && item.vod_id);
}

function convertToPlaySources(vodPlayFrom, vodPlayUrl, vodId) {
  const playSources = [];
  if (!vodPlayFrom || !vodPlayUrl) return playSources;
  const sourceNames = vodPlayFrom.split("$$$").map((n) => n.trim()).filter((n) => n);
  const sourceUrls = vodPlayUrl.split("$$$").map((u) => u.trim()).filter((u) => u);
  const maxLength = Math.max(sourceNames.length, sourceUrls.length);
  for (let i = 0; i < maxLength; i++) {
    const sourceName = sourceNames[i] || `线路${i + 1}`;
    const sourceUrl = sourceUrls[i] || "";
    let cleanSourceName = sourceName;
    if (vodId && sourceName.endsWith(`-${vodId}`)) {
      cleanSourceName = sourceName.substring(0, sourceName.length - `-${vodId}`.length);
    }
    const episodes = [];
    if (sourceUrl) {
      const episodeSegments = sourceUrl.split("#").map((s) => s.trim()).filter((s) => s);
      for (const segment of episodeSegments) {
        const parts = segment.split("$");
        if (parts.length >= 2) {
          const episodeName = parts[0].trim();
          const playId = parts.slice(1).join("$").trim();
          if (episodeName && playId) episodes.push({ name: episodeName, playId });
        } else if (parts.length === 1 && parts[0]) {
          episodes.push({ name: `第${episodes.length + 1}集`, playId: parts[0].trim() });
        }
      }
    }
    if (episodes.length > 0) playSources.push({ name: cleanSourceName, episodes });
  }
  return playSources;
}

function formatDetailVideos(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (typeof item !== "object" || item === null) return null;
      const content = fixEncoding(String(item.vod_content || item.VodContent || "")).trim();
      const vodId = String(item.vod_id || item.VodID || "");
      const vodPlayFrom = processPlayFrom(
        String(item.vod_play_from || item.VodPlayFrom || ""),
        vodId
      );
      const vodPlayUrl = String(item.vod_play_url || item.VodPlayURL || "");
      const vodPlaySources = convertToPlaySources(vodPlayFrom, vodPlayUrl, vodId);
      return {
        vod_id: vodId,
        vod_name: fixEncoding(String(item.vod_name || item.VodName || "")),
        vod_pic: String(item.vod_pic || item.VodPic || ""),
        type_name: fixEncoding(String(item.type_name || item.TypeName || "")),
        vod_year: String(item.vod_year || item.VodYear || ""),
        vod_area: fixEncoding(String(item.vod_area || item.VodArea || "")),
        vod_remarks: fixEncoding(String(item.vod_remarks || item.VodRemarks || "")),
        vod_actor: fixEncoding(String(item.vod_actor || item.VodActor || "")),
        vod_director: fixEncoding(String(item.vod_director || item.VodDirector || "")),
        vod_content: content,
        vod_play_sources: vodPlaySources.length > 0 ? vodPlaySources : undefined,
        vod_douban_score: String(item.vod_douban_score || item.VodDoubanScore || ""),
      };
    })
    .filter((item) => item !== null && item.vod_id);
}

function formatClasses(classes) {
  if (!Array.isArray(classes)) return [];
  const seen = new Set();
  const result = [];
  for (const cls of classes) {
    if (typeof cls !== "object" || cls === null) continue;
    const typeId = String(cls.type_id || cls.TypeID || "");
    const typePid = String(cls.type_pid || cls.TypePID || "");
    const originalTypeName = String(cls.type_name || cls.TypeName || "");
    const fixedTypeName = fixEncoding(originalTypeName).trim();
    
    // 添加调试日志
    if (originalTypeName !== fixedTypeName) {
      OmniBox.log("info", `修复分类名称编码: 原始='${originalTypeName}', 修复后='${fixedTypeName}'`);
    }
    
    if (!typeId || seen.has(typeId)) continue;
    seen.add(typeId);
    result.push({ type_id: typeId, type_pid: typePid, type_name: fixedTypeName });
  }
  return result;
}

async function enrichVideosWithDetails(videos) {
  if (!Array.isArray(videos) || videos.length === 0) return videos;
  const videoIDs = [];
  const videoMap = new Map();
  for (const video of videos) {
    if (!video.vod_pic || video.vod_pic === "<nil>" || !video.vod_year || video.vod_year === "<nil>" || !video.vod_douban_score || video.vod_douban_score === "<nil>") {
      videoIDs.push(video.vod_id);
      videoMap.set(video.vod_id, video);
    }
  }
  if (videoIDs.length === 0) return videos;
  const batchSize = Math.min(20, videoIDs.length);
  for (let i = 0; i < videoIDs.length; i += batchSize) {
    const end = Math.min(i + batchSize, videoIDs.length);
    const batchIDs = videoIDs.slice(i, end);
    try {
      const response = await requestSiteAPI({ ac: "detail", ids: batchIDs.join(",") });
      if (Array.isArray(response.list)) {
        for (const item of response.list) {
          if (typeof item !== "object" || item === null) continue;
          const vodId = String(item.vod_id || item.VodID || "");
          const originalVod = videoMap.get(vodId);
          if (originalVod) {
            const pic = String(item.vod_pic || item.VodPic || "");
            if (pic && pic !== "<nil>") originalVod.vod_pic = pic;
            const year = String(item.vod_year || item.VodYear || "");
            if (year && year !== "<nil>") originalVod.vod_year = year;
            const score = String(item.vod_douban_score || item.VodDoubanScore || "");
            if (score && score !== "<nil>") originalVod.vod_douban_score = score;
            const en = String(item.vod_en || item.VodEn || "");
            if (en && en !== "<nil>") originalVod.vod_en = en;
            const time = String(item.vod_time || item.VodTime || "");
            if (time && time !== "<nil>") originalVod.vod_time = time;
            const playFrom = String(item.vod_play_from || item.VodPlayFrom || "");
            if (playFrom && playFrom !== "<nil>") originalVod.vod_play_from = playFrom;
          }
        }
      }
    } catch (error) {
      OmniBox.log("warn", `批量获取详情失败: ${error.message}`);
    }
  }
  return videos;
}

async function matchDanmu(fileName) {
  if (!DANMU_API || !fileName) return [];
  
  if (cache.danmu.has(fileName)) {
    const cached = cache.danmu.get(fileName);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      OmniBox.log("info", `使用缓存的弹幕数据: ${fileName}`);
      return cached.data;
    } else {
      cache.danmu.delete(fileName);
    }
  }
  
  try {
    OmniBox.log("info", `匹配弹幕: fileName=${fileName}`);
    const matchUrl = `${DANMU_API}/api/v2/match`;
    const response = await OmniBox.request(matchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      body: JSON.stringify({ fileName: fileName }),
    });
    if (response.statusCode !== 200) {
      OmniBox.log("warn", `弹幕匹配失败: HTTP ${response.statusCode}`);
      return [];
    }
    const matchData = JSON.parse(response.body);
    if (!matchData.isMatched) {
      OmniBox.log("info", "弹幕未匹配到");
      return [];
    }
    const matches = matchData.matches || [];
    if (matches.length === 0) return [];
    const firstMatch = matches[0];
    const episodeId = firstMatch.episodeId;
    if (!episodeId) return [];
    const animeTitle = firstMatch.animeTitle || "";
    const episodeTitle = firstMatch.episodeTitle || "";
    let danmakuName = "弹幕";
    if (animeTitle && episodeTitle) danmakuName = `${animeTitle} - ${episodeTitle}`;
    else if (animeTitle) danmakuName = animeTitle;
    else if (episodeTitle) danmakuName = episodeTitle;
    const danmakuURL = `${DANMU_API}/api/v2/comment/${episodeId}?format=xml`;
    OmniBox.log("info", `弹幕匹配成功: ${danmakuName} (episodeId: ${episodeId})`);
    const result = [{ name: danmakuName, url: danmakuURL }];
    cache.danmu.set(fileName, { data: result, timestamp: Date.now() });
    return result;
  } catch (error) {
    OmniBox.log("warn", `弹幕匹配失败: ${error.message}`);
    return [];
  }
}

function inferFileNameFromURL(url) {
  try {
    const urlObj = new URL(url);
    let base = urlObj.pathname.split("/").pop() || "";
    const dotIndex = base.lastIndexOf(".");
    if (dotIndex > 0) base = base.substring(0, dotIndex);
    base = base.replace(/[_-]/g, " ").replace(/\./g, " ").trim();
    return base || url;
  } catch (error) {
    return url;
  }
}

function extractDigits(str) {
  if (typeof str !== "string") return "";
  return str.replace(/\D/g, "");
}

function extractVideoIdFromFlag(flag) {
  if (!flag) return "";
  if (flag.includes("-")) {
    const parts = flag.split("-");
    const videoId = parts[parts.length - 1];
    if (/^\d+$/.test(videoId)) return videoId;
  }
  if (/^\d+$/.test(flag)) return flag;
  return "";
}

async function inferFileNameFromDetail(videoId, playId) {
  try {
    const detailResponse = await requestSiteAPI({ ac: "detail", ids: videoId });
    if (!detailResponse.list || detailResponse.list.length === 0) return "";
    
    const video = detailResponse.list[0];
    const videoName = video.vod_name || video.VodName || "";
    const playURL = video.vod_play_url || video.VodPlayURL || "";
    
    if (!videoName || !playURL) return "";
    
    const segments = playURL.split("#").filter((s) => s.trim());
    if (segments.length === 1) {
      return videoName;
    }
    
    let epNum = 0;
    for (let idx = 0; idx < segments.length; idx++) {
      const seg = segments[idx];
      const parts = seg.split("$");
      if (parts.length >= 2) {
        const epLabel = parts[0].trim();
        const epURL = parts[1].trim();
        if (epURL === playId || epURL.includes(playId) || playId.includes(epURL)) {
          const digits = extractDigits(epLabel);
          epNum = digits ? parseInt(digits, 10) : idx + 1;
          break;
        }
      }
    }
    
    if (epNum > 0) {
      return epNum < 10 ? `${videoName} S01E0${epNum}` : `${videoName} S01E${epNum}`;
    }
    return videoName;
  } catch (error) {
    OmniBox.log("warn", `获取详情失败，无法推断集数: ${error.message}`);
    return "";
  }
}

async function home(params) {
  try {
    OmniBox.log("info", "获取首页数据");
    const page = normalizePage(params?.page);
    let response = await requestSiteAPI({ ac: "list", pg: String(page) });
    if (!response.class || (Array.isArray(response.class) && response.class.length === 0)) {
      try {
        const classResponse = await requestSiteAPI({ ac: "class" });
        if (classResponse.class) response.class = classResponse.class;
      } catch (error) {
        OmniBox.log("warn", `获取分类失败: ${error.message}`);
      }
    }
    const classes = formatClasses(response.class || []);
    let videos = formatVideos(response.list || []);
    videos = await enrichVideosWithDetails(videos);
    return { class: classes, list: videos };
  } catch (error) {
    return handleError(error, "获取首页数据", { class: [], list: [] });
  }
}

async function category(params) {
  const defaultResult = { page: 1, pagecount: 0, total: 0, list: [] };
  try {
    const categoryId = params?.categoryId;
    if (!categoryId || typeof categoryId !== 'string' || categoryId.trim() === '') {
      throw new Error("分类ID不能为空或无效");
    }
    const page = normalizePage(params?.page);
    OmniBox.log("info", `获取分类数据: categoryId=${categoryId}, page=${page}`);
    const response = await requestSiteAPI({ ac: "videolist", t: categoryId, pg: String(page) });
    const videos = formatVideos(response.list || []);
    return {
      page: toInt(response.page),
      pagecount: toInt(response.pagecount),
      total: toInt(response.total),
      list: videos,
    };
  } catch (error) {
    return handleError(error, "获取分类数据", defaultResult);
  }
}

async function detail(params) {
  const defaultResult = { list: [] };
  try {
    const videoId = params?.videoId;
    if (!videoId || typeof videoId !== 'string' || videoId.trim() === '') {
      throw new Error("视频ID不能为空或无效");
    }
    OmniBox.log("info", `获取视频详情: videoId=${videoId}`);
    const response = await requestSiteAPI({ ac: "detail", ids: videoId });
    const videos = formatDetailVideos(response.list || []);
    return { list: videos };
  } catch (error) {
    return handleError(error, "获取视频详情", defaultResult);
  }
}

async function search(params) {
  const defaultResult = { page: 1, pagecount: 0, total: 0, list: [] };
  try {
    const keyword = params?.keyword || params?.wd || "";
    const page = normalizePage(params?.page);
    if (!keyword) return defaultResult;
    OmniBox.log("info", `搜索视频: keyword=${keyword}, page=${page}`);
    const response = await requestSiteAPI({ ac: "list", wd: keyword, pg: String(page) });
    let videos = formatVideos(response.list || []);
    const needsDetail = videos.length > 0 && (!videos[0].vod_pic || videos[0].vod_pic === "");
    if (needsDetail) {
      try {
        const videoIDs = videos.map((v) => v.vod_id);
        const detailResponse = await requestSiteAPI({ ac: "detail", ids: videoIDs.join(",") });
        videos = formatVideos(detailResponse.list || []);
      } catch (error) {
        OmniBox.log("warn", `获取搜索结果详情失败: ${error.message}`);
      }
    }
    return {
      page: toInt(response.page),
      pagecount: toInt(response.pagecount),
      total: toInt(response.total),
      list: videos,
    };
  } catch (error) {
    return handleError(error, "搜索视频", defaultResult);
  }
}

async function play(params) {
  const defaultResult = { urls: [], flag: "", header: {} };
  try {
    const playId = params?.playId;
    if (!playId || typeof playId !== 'string' || playId.trim() === '') {
      throw new Error("播放地址ID不能为空或无效");
    }
    const flag = params?.flag || "";
    
    let processedPlayId = playId;
    try {
      processedPlayId = decodeURIComponent(playId);
    } catch (e) {
      processedPlayId = playId;
    }
    
    const videoId = extractVideoIdFromFlag(flag);
    OmniBox.log("info", `获取播放地址: playId=${processedPlayId}, flag=${flag}, videoId=${videoId}`);
    
    const parse = /\.(m3u8|mp4|flv|avi|wmv|mov|mkv|webm)$/i.test(processedPlayId) ? 0 : 1;
    let playResponse = { 
      urls: [{ name: "播放", url: processedPlayId }], 
      flag: flag, 
      header: {}, 
      parse: parse 
    };
    
    if (DANMU_API && videoId) {
      let fileName = await inferFileNameFromDetail(videoId, processedPlayId);
      if (!fileName) fileName = inferFileNameFromURL(processedPlayId);
      
      if (fileName) {
        const danmakuList = await matchDanmu(fileName);
        if (danmakuList.length > 0) playResponse.danmaku = danmakuList;
      }
    }
    
    return playResponse;
  } catch (error) {
    return handleError(error, "获取播放地址", { ...defaultResult, flag: params?.flag || "" });
  }
}

module.exports = { home, category, search, detail, play };

if (require.main === module) {
  const runner = require("spider_runner");
  runner.run(module.exports);
}
