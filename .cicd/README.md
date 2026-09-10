# XmaxSDK React Native CI/CD

参考 iOS `.cicd` 的本地发版流程，RN 使用 npm tarball 分发源码、JS 和类型声明。入口是 Bash 脚本，共用 `pipeline.mjs`；运行不依赖 iOS SDK 仓库。本目录可提交到 Git，构建与打包产物放入已忽略的 `artifacts/`，命令日志输出到终端。

## 环境

- Node / npm、JDK 17、Android SDK / NDK、Xcode、Ruby / CocoaPods 按 `docs/engineering-baseline.md` 配置。
- 在仓库根目录执行 `bundle install`；设置 `ANDROID_HOME`、`JAVA_HOME`。构建使用当前 PATH 中的 Node。
- 显式选择稳定版 Xcode，例如 `export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`。
- npm 发布账号需拥有 `@xmax` 的发布权限，并完成 npm 登录及双重验证。脚本不存储 token。
- 原生检查构建 iPhoneOS Debug/Release（无签名）及 Android Debug/Release，不运行设备。当前厂商缺少 arm64 模拟器切片，流程不声称支持该模拟器。

## 日常检查

```bash
./.cicd/ci-check.sh

# 只跑 JS / 类型 / lint / 格式 / 测试和 tarball 内容检查
./.cicd/ci-check.sh --js-only

# 复用本机已安装依赖；仅供开发自检
./.cicd/ci-check.sh --js-only --skip-install
```

默认 `npm ci` 会重建本仓库 node_modules 并应用已登记的开发补丁。检查不修改分支；tarball 和构建输出位于 `artifacts/ci-<时间戳>/`。JS 检查成功不等于原生、独立宿主或真机验收成功。合并及发布入口不接受跳过安装或原生检查的选项。

## 准备版本

先提交开发改动，在干净且尚未存在对应标签的 `feature/*` 分支运行：

```bash
./.cicd/ci-prepare.sh 0.1.0-beta.0
```

同步根 `package.json`、`package-lock.json`、`XmaxSDKInfo`、HTTP / RTC 的 `sdk_version`，并运行 `pod install --no-repo-update` 更新 XLab Pod 锁文件。Podspec 本身从 package.json 读取版本，不需要重复写版本号。XLab App 的商店版本独立于 SDK，不自动改动。

准备操作会留下供审核的工作区改动；若 CocoaPods 安装失败，已完成的版本修改会保留，修复环境后重新执行 Pod 安装并检查差异。脚本不自动删除 `private: true`，不提交、不推送。

检查差异后按项目约定提交并推送 feature 分支。

## 验证与合并

```bash
# 完整检查和 fast-forward 条件预检，不推送
./.cicd/ci-merge.sh

# 完整检查通过后，原子推送 develop、main，并同步本地同名分支
./.cicd/ci-merge.sh --push
```

要求 feature 已推送，本地 develop/main 与远端一致，两个目标均可 fast-forward，且没有被其他 worktree 检出。若远端不支持原子推送或分支保护拒绝，脚本报错，不回退成两次独立推送。检查结束会再次核对分支状态。

开发补丁仍可用于上述仓库构建，因此合并成功不是 npm 发布许可。

## npm 发布

当前包仍为 private，RTC / COS / blob-util 依赖修复仅存在于仓库开发流程。正式发布前必须完成受维护厂商修订包或已修复上游版本的替换、依赖及锁文件更新、SDK 授权文件和安装文档。发布脚本会拒绝当前 private 配置、缺少 LICENSE / LICENSE.md、UNLICENSED 元数据以及仍精确依赖已登记补丁版本的情况；静态检查不能代替依赖审核。

准备 `.cicd/release-notes/<version>.md`，随版本提交。设备、最低系统、RTC / 云端、后台释放等验收结果应在实现文档或 Release Notes 中明确记录，构建脚本不代填验收结论。

合并后创建不带 `v` 的标签：

```bash
git switch main
git tag -a 0.1.0-beta.0 -m "release: XmaxSDK RN 0.1.0-beta.0"
git push origin 0.1.0-beta.0

# 完整发布验证，保留产物，不上传 npm
./.cicd/cd-npm-release.sh 0.1.0-beta.0 --tag beta

# 完整验证通过后上传本次验证的同一个 tarball
./.cicd/cd-npm-release.sh 0.1.0-beta.0 --tag beta --publish
```

CD 要求本地 main、origin/main、本地与远端版本标签指向同一提交。它从该提交创建临时本地 clone，在隔离源码中按锁安装、检查并打包，再在另一临时目录构造 npm 消费端。默认预发布使用 `beta`，正式版使用 `latest`；不允许预发布版本写入 `latest`。

消费端复用标签内 XLab 的公开 API 调用和原生配置，保留 workspace 目录布局，但根包换成普通工具包，SDK 从 `.tgz` 安装。不会复制 SDK 源码、node_modules 或开发补丁，移除 TypeScript 指向 SDK 源码的路径别名。执行独立 `npm install --package-lock-only`、`npm ci`、类型检查、iOS Debug/Release 与 Android Debug/R8 Release。若未来厂商修订包要求修改 XLab 依赖或配置，应在发版前提交这些改动。

消费端先按 Gemfile.lock 冻结安装 Ruby 依赖到临时目录，再沿用提交中的 Podfile.lock，以 `--deployment` 安装；npm 消费端重新解析依赖并保存解析后的锁文件，用于审阅消费者实际获取的依赖版本。它验证常规安装路径，不代表所有依赖版本范围均已兼容。

产物保存在 `artifacts/release-<版本>-<时间戳>/`：

- npm `.tgz` 和 `pack.json` 文件清单。
- 消费端 npm / Pod 锁文件。
- `release.json`：提交、版本、dist-tag、registry、SHA-256 和验证范围。
- `release-notes.md`。

只有带 `--publish` 的命令会在全部检查通过后运行 npm publish；目标固定为 npm 官方 registry，使用 `--access public` 和 `--ignore-scripts` 发布已验证 tarball。Release Notes 留作发版记录，npm 不单独接收该文件。脚本不创建 GitHub Release，也不自动切换下一开发分支；发布结束后按团队节奏创建下一 feature 分支。

公开 npm 包中的源码可被下载；授权条款按项目实际发布政策填写。已发布的相同版本不能覆盖，后续发布需增加版本号。

## 流程自身检查

```bash
node --test .cicd/pipeline.test.mjs
for script in .cicd/*.sh; do bash -n "$script" || exit; done
```

测试覆盖版本格式、版本字段歧义、打包遗漏/泄漏和发布拒绝条件；隔离 Git fixture 确认 private 包在联网和发布之前被拒绝。不会向真实 registry 发布或推送真实项目分支。
