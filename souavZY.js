// @name souavZY
// @author vscode
// @description 刮削：支持，弹幕：支持，嗅探：支持
// @version 1.0.0
// @downloadURL https://github.com/yutheme/omnibox-spiderJS/raw/main/souavZY.js

/**
 * OmniBox 采集站爬虫 - souavZY
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
const SITE_API = process.env.SITE_API || "https://api.souavzy.vip/api.php/provide/vod";
const DANMU_API = process.env.DANMU_API || "http://192.168.0.123:9321/87654321";
// ==================== 配置区域结束 ====================

/**
 * 发送 HTTP 请求到采集站
 */
async function requestSiteAPI(params = {}) {
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
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (response.statusCode !== 200) {
      throw new Error(`HTTP ${response.statusCode}: ${response.body}`);
    }
    return JSON.parse(response.body);
  } catch (error) {
    OmniBox.log("error", `请求采集站失败: ${error.message}`);
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

function formatVideos(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (typeof item !== "object" || item === null) return null;
      const vodId = String(item.vod_id || item.VodID || "");
      let vodPlayFrom = String(item.vod_play_from || item.VodPlayFrom || "");
      if (vodPlayFrom && vodId && vodPlayFrom.includes("$$$")) {
        const lines = vodPlayFrom.split("$$$");
        const processedLines = lines
          .map((line) => { const t = line.trim(); return t ? `${t}-${vodId}` : t; })
          .filter((line) => line);
        vodPlayFrom = processedLines.join("$$$");
      } else if (vodPlayFrom && vodId) {
        vodPlayFrom = `${vodPlayFrom}-${vodId}`;
      }
      return {
        vod_id: vodId,
        vod_name: String(item.vod_name || item.VodName || ""),
        vod_pic: String(item.vod_pic || item.VodPic || ""),
        type_id: String(item.type_id || item.TypeID || ""),
        type_name: String(item.type_name || item.TypeName || ""),
        vod_year: String(item.vod_year || item.VodYear || ""),
        vod_remarks: String(item.vod_remarks || item.VodRemarks || ""),
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
      const content = String(item.vod_content || item.VodContent || "").trim();
      const vodId = String(item.vod_id || item.VodID || "");
      let vodPlayFrom = String(item.vod_play_from || item.VodPlayFrom || "");
      if (vodPlayFrom && vodId && vodPlayFrom.includes("$$$")) {
        const lines = vodPlayFrom.split("$$$");
        const processedLines = lines
          .map((line) => { const t = line.trim(); return t ? `${t}-${vodId}` : t; })
          .filter((line) => line);
        vodPlayFrom = processedLines.join("$$$");
      } else if (vodPlayFrom && vodId) {
        vodPlayFrom = `${vodPlayFrom}-${vodId}`;
      }
      const vodPlayUrl = String(item.vod_play_url || item.VodPlayURL || "");
      const vodPlaySources = convertToPlaySources(vodPlayFrom, vodPlayUrl, vodId);
      return {
        vod_id: vodId,
        vod_name: String(item.vod_name || item.VodName || ""),
        vod_pic: String(item.vod_pic || item.VodPic || ""),
        type_name: String(item.type_name || item.TypeName || ""),
        vod_year: String(item.vod_year || item.VodYear || ""),
        vod_area: String(item.vod_area || item.VodArea || ""),
        vod_remarks: String(item.vod_remarks || item.VodRemarks || ""),
        vod_actor: String(item.vod_actor || item.VodActor || ""),
        vod_director: String(item.vod_director || item.VodDirector || ""),
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
    const typeName = String(cls.type_name || cls.TypeName || "").trim();
    if (!typeId || seen.has(typeId)) continue;
    seen.add(typeId);
    result.push({ type_id: typeId, type_pid: typePid, type_name: typeName });
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
  const batchSize = 20;
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
    return [{ name: danmakuName, url: danmakuURL }];
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

async function home(params) {
  try {
    OmniBox.log("info", "获取首页数据");
    const page = params.page || "1";
    let response = await requestSiteAPI({ ac: "list", pg: page });
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
    OmniBox.log("error", `获取首页数据失败: ${error.message}`);
    return { class: [], list: [] };
  }
}

async function category(params) {
  try {
    const categoryId = params.categoryId;
    const page = params.page || 1;
    if (!categoryId) throw new Error("分类ID不能为空");
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
    OmniBox.log("error", `获取分类数据失败: ${error.message}`);
    return { page: 1, pagecount: 0, total: 0, list: [] };
  }
}

async function detail(params) {
  try {
    const videoId = params.videoId;
    if (!videoId) throw new Error("视频ID不能为空");
    OmniBox.log("info", `获取视频详情: videoId=${videoId}`);
    const response = await requestSiteAPI({ ac: "detail", ids: videoId });
    const videos = formatDetailVideos(response.list || []);
    return { list: videos };
  } catch (error) {
    OmniBox.log("error", `获取视频详情失败: ${error.message}`);
    return { list: [] };
  }
}

async function search(params) {
  try {
    const keyword = params.keyword || params.wd || "";
    const page = params.page || 1;
    if (!keyword) return { page: 1, pagecount: 0, total: 0, list: [] };
    OmniBox.log("info", `搜索视频: keyword=${keyword}, page=${page}`);
    const response = await requestSiteAPI({ ac: "list", wd: keyword, pg: String(page) });
    let videos = formatVideos(response.list || []);
    if (videos.length > 0 && (!videos[0].vod_pic || videos[0].vod_pic === "")) {
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
    OmniBox.log("error", `搜索视频失败: ${error.message}`);
    return { page: 1, pagecount: 0, total: 0, list: [] };
  }
}

async function play(params) {
  try {
    const playId = params.playId;
    const flag = params.flag || "";
    if (!playId) throw new Error("播放地址ID不能为空");
    const videoId = extractVideoIdFromFlag(flag);
    OmniBox.log("info", `获取播放地址: playId=${playId}, flag=${flag}, videoId=${videoId}`);
    let urlsResult = [{ name: "播放", url: playId }];
    let parse = 1;
    if (/\.(m3u8|mp4)$/.test(playId)) parse = 0;
    let playResponse = { urls: urlsResult, flag: flag, header: {}, parse: parse };
    if (DANMU_API && videoId) {
      let fileName = "";
      try {
        const detailResponse = await requestSiteAPI({ ac: "detail", ids: videoId });
        if (detailResponse.list && detailResponse.list.length > 0) {
          const video = detailResponse.list[0];
          const videoName = video.vod_name || video.VodName || "";
          const playURL = video.vod_play_url || video.VodPlayURL || "";
          if (videoName && playURL) {
            const segments = playURL.split("#").filter((s) => s.trim());
            if (segments.length === 1) {
              fileName = videoName;
            } else {
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
                fileName = epNum < 10 ? `${videoName} S01E0${epNum}` : `${videoName} S01E${epNum}`;
              } else {
                fileName = videoName;
              }
            }
          }
        }
      } catch (error) {
        OmniBox.log("warn", `获取详情失败，无法推断集数: ${error.message}`);
      }
      if (!fileName) fileName = inferFileNameFromURL(playId);
      if (fileName) {
        const danmakuList = await matchDanmu(fileName);
        if (danmakuList.length > 0) playResponse.danmaku = danmakuList;
      }
    }
    return playResponse;
  } catch (error) {
    OmniBox.log("error", `获取播放地址失败: ${error.message}`);
    return { urls: [], flag: params.flag || "", header: {} };
  }
}

module.exports = { home, category, search, detail, play };

const runner = require("spider_runner");
runner.run(module.exports);
