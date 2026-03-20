// @name 精品资源
// @author vscode
// @description 刮削：支持，弹幕：支持，嗅探：支持
// @version 1.0.0
// @downloadURL https://github.com/yutheme/omnibox-spiderJS/raw/main/精品资源.js

/**
 * OmniBox 采集站爬虫 - 精品资源
 *
 * 此脚本直接调用采集站接口获取数据
 * 只需要配置采集站的 API 地址即可使用
 *
 * 使用方法：
 * 1. 在 OmniBox 后台创建爬虫源，选择 JavaScript 类型
 * 2. 复制此脚本内容到爬虫源编辑器
 * 3. 保存并测试
 */

// 引入公共模块
const common = require("https://github.com/yutheme/omnibox-spiderJS/raw/main/common.js");

// 配置爬虫参数
common.configureSpider({
  SITE_API: "https://www.jingpinx.com/api.php/provide/vod/",
  DANMU_API: "http://192.168.0.123:9321/87654321",
  name: "精品资源",
  author: "vscode",
  version: "1.0.0",
  description: "刮削：支持，弹幕：支持，嗅探：支持",
  downloadURL: "https://github.com/yutheme/omnibox-spiderJS/raw/main/精品资源.js"
});

// 导出接口
module.exports = {
  home: common.home,
  category: common.category,
  search: common.search,
  detail: common.detail,
  play: common.play,
};

// 使用公共 runner 处理标准输入/输出
const runner = require("spider_runner");
runner.run(module.exports);
