# OmniBox SpiderJS

基于 OmniBox SDK 和 Spider Runner 开发的视频资源爬虫框架，支持对接各类资源站 API。

## 快速开始

```bash
npm install
SITE_API="https://your-site.com/api" node 资源模板.js
```

## 配置

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `SITE_API` | - | 目标资源站 API 地址（必填） |
| `DANMU_API` | - | 弹幕服务 API 地址（可选） |
| `REQUEST_TIMEOUT_MS` | `5000` | 请求超时时间（毫秒） |
| `REQUEST_RETRIES` | `1` | 请求重试次数 |
| `RETRY_DELAY_MS` | `300` | 重试延迟基数（毫秒） |
| `DETAIL_BATCH_SIZE` | `20` | 每批详情请求大小 |
| `MAX_CONCURRENT_REQUESTS` | `6` | 最大并发请求数 |
| `CACHE_TTL_MS` | `300000` | 缓存有效期（毫秒） |
| `LOG_LEVEL` | `info` | 日志级别（info/warn/error） |

## 接口

| 接口 | 说明 |
|-----|------|
| `home` | 首页数据（分类 + 视频列表） |
| `category` | 分类视频列表 |
| `search` | 搜索视频 |
| `detail` | 视频详情 |
| `play` | 播放地址（支持弹幕） |

## 特性

- 并发请求 + 信号量限流
- TTL 内存缓存
- 请求失败自动重试
- 支持弹幕集成

## License

MIT
