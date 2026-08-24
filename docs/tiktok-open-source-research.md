# TikTok 开源实现调研

**检索日期：**2026-08-24（Pacific/Auckland）

**范围：**仅查阅 GitHub 公开仓库的 README、源码和仓库元数据；没有登录 TikTok，也没有获取、记录或测试 Cookie、令牌、请求头、设备标识或动态签名。

## 结论

在本次样本中，**没有找到一个可验证的、安全的“无需动态签名、仅复用后台会话、直接调用 TikTok 私有写接口”路径**。这是“未在公开样本中发现”，不是对 TikTok 内部实现的绝对否定。

找到的实现分为两类：

- 直接调用私有写接口的项目，明确依赖动态签名、设备注册或外部签名回调，不能作为 Ebb 的实现依据；这会触及 `docs/tiktok-web-contract.md` 已禁止的签名工程。
- 不做签名工程的项目，改为在已登录的真实 TikTok 页面中点击一方 UI，并在页面中验证状态变化。这与 Ebb 当前“窄范围一方页面控件 + 可观察结果”的策略一致，但它不是后台无感直调，也不能保证窗口完全不出现。

因此，用户提出的“与 Douyin 一样、绝不打开新的 TikTok 网页、全程无感”与目前可复核的公开实现证据不兼容。安全可交付的路线仍是保留一方页面交互；若窗口闪现不可接受，则 TikTok 写操作应继续作为发布门槛阻断，而不是引入签名生成或绕过方案。

## 相关项目

| 项目 | 与 unlike / 取消收藏 / unfollow 的关系 | 证据与判断 |
| --- | --- | --- |
| [jackwener/OpenCLI](https://github.com/jackwener/OpenCLI)（未归档；本次检索时仍有近期提交） | 包含 `unlike`、`unsave`、`unfollow` 命令。 | `unlike` 和 `unsave` 源码通过已加载页面的按钮触发操作：[unlike.js](https://github.com/jackwener/OpenCLI/blob/main/clis/tiktok/unlike.js)、[unsave.js](https://github.com/jackwener/OpenCLI/blob/main/clis/tiktok/unsave.js)。`unfollow` 明确采用页面按钮、确认对话框及状态翻转验证：[unfollow.js](https://github.com/jackwener/OpenCLI/blob/main/clis/tiktok/unfollow.js)。其适配器说明明确表示，写操作保留 UI 触发，因为直接私有写接口需要签名工程：[TikTok adapter 文档](https://github.com/jackwener/OpenCLI/blob/main/docs/adapters/browser/tiktok.md)。这是最接近 Ebb 的公开先例，但需要活动页面，不是后台直调。 |
| [go-tiktok/tiktok](https://github.com/go-tiktok/tiktok) | 只读公开内容客户端，不提供本任务所需写操作。 | README 将自身定义为 best-effort 的只读客户端，并说明 TikTok 没有公开 Web API；请求可能需要动态签名，而该库不计算它：[README](https://github.com/go-tiktok/tiktok/blob/main/README.md)。它反证了“未签名后台调用”不能视为稳定契约。 |
| [davidteather/TikTok-Api](https://github.com/davidteather/TikTok-Api) | 通用 Web 会话/读取库，不是删除操作实现。 | 请求代码会在页面上下文生成签名后再发出请求：[tiktok.py](https://github.com/davidteather/TikTok-Api/blob/main/TikTokApi/tiktok.py#L3421-L3538)。这只能佐证 Web 内部请求普遍存在动态签名机制，不能证明每一个写端点的具体要求；但同样没有提供可供 Ebb 采用的未签名写入路线。 |
| [edwinjson/tiktok-api](https://github.com/edwinjson/tiktok-api) | README 声称支持 unlike、unfollow 等。 | README 同时把 Web 签名、移动端签名与设备注册列为能力：[README](https://github.com/edwinjson/tiktok-api/blob/main/README.md)。即使其功能声明真实，也依赖 Ebb 不应采用的签名/设备工程；仓库最后代码推送在 2024 年，不能证明 2026 年 TikTok Web 契约仍可用。 |
| [szdc/tiktok-api](https://github.com/szdc/tiktok-api) | 有 unlike 与 unfollow 方法名。 | 该仓库已归档，且源码使用的是 `aweme` 移动端协议：[实现](https://github.com/szdc/tiktok-api/blob/master/src/index.ts)，README 要求调用方提供设备参数与签名回调：[README](https://github.com/szdc/tiktok-api/blob/master/README.md)。它既不是当前 TikTok Web 后台路径，也不符合 Ebb 的安全边界。 |
| [wklbeta/TikTok-Unfollow-Bot-Android](https://github.com/wklbeta/TikTok-Unfollow-Bot-Android) | 仅实现 Android 端批量 unfollow。 | README 明确通过 Android Debug Bridge 操作已打开的 TikTok App 界面：[README](https://github.com/wklbeta/TikTok-Unfollow-Bot-Android/blob/main/README.md)。这是另一种“前台一方 UI 自动化”，与 Electron Web 后台直调无关。 |

## 对 Ebb 的影响

1. 不能把“可读取列表”推论为“可在 Electron 后台会话无签名写入”。写操作有更严格的风控边界，公开项目也将其与读取实现分开处理。
2. OpenCLI 的做法可作为交互可靠性参考：只点击一方控件，等待明确的 UI 状态变化；登录、验证码、限流或找不到控件都应失败并暂停，而非静默成功或反复重试。
3. 不应复制签名、设备注册、外部签名服务或从浏览器导出认证材料的路线。它们既超出本项目的既有安全限制，也没有提供可长期维护的 Web 契约保证。

## 方法与局限

- “近期/归档”依据为 GitHub 仓库公开元数据在检索日的状态；不等同于对 TikTok 兼容性的现场验证。
- 以上链接证明的是各仓库作者公开实现的行为或限制。对 TikTok 平台能力的结论限于这些样本与 Ebb 已记录的实际 403 结果；没有把第三方项目的声明当作官方 API 文档。
