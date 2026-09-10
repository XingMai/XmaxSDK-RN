# Git 提交与分支约定

参考 iOS XmaxSDK 当前分支布局和近期提交历史，RN 仓库采用以下约定。

## 分支

- `main`：稳定基线，后续接收经过验收的版本。
- `develop`：日常开发的集成分支。
- `feature/<开发者>-v<版本号>`：从 `develop` 创建的版本开发分支；当前为 `feature/yueting-v1.0.0`。

功能完成并通过检查后合入 `develop`，版本验收后再合入 `main`。初始化时，三个分支指向同一个基础工程提交，默认在 `feature/yueting-v1.0.0` 上继续工作。

分支中的版本号表示开发目标，不自动修改 npm 包版本；当前 SDK 包版本为 `1.0.0`。版本调整需同步 npm 清单与锁文件、SDK 公开版本信息、运行时上报版本和 CocoaPods 锁文件。

## 提交

提交标题采用 Conventional Commits，使用简洁的英文动词短语：

```text
<type>: <description>
```

常用类型为 `feat`、`fix`、`refactor`、`docs`、`test`、`build`、`ci`、`chore`。例如：

```text
feat: bootstrap React Native SDK and XLab example
fix: handle realtime session cancellation
docs: document device debugging workflow
```

一次提交围绕一个完整目的；复杂变更在正文说明行为变化和验证结果。依赖变更同时提交 lock 文件，公开 API 变更同时更新契约文档。

提交前按变更范围执行必要检查。基础工程检查为 `npm run typecheck`、`npm run lint`、`npm run format:check` 和 `npm run build`；原生或媒体改动还需对应平台验证。未完成的验证必须在记录中明确说明。

不提交依赖目录、构建产物、本地开发配置或密钥。Android 官方模板的 `debug.keystore` 仅用于开发调试，可以随示例提交；发布签名材料不得提交。
