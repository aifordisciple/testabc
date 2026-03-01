# 当前问题

- [x] 1. copilot页面问题和回复需要增加复制功能。
  - ✅ 已存在：`handleCopy` 函数在 `page.tsx` 第 592-595 行

- [x] 2. 没有任务详情页面入口，点击任务应该可以进入任务详情页面。
  - ✅ 已添加：任务提交后自动跳转到 `/dashboard/task/{analysis_id}`
  - ✅ 任务详情页已存在于 `/dashboard/task/[id]/page.tsx`

- [x] 3. copilot分析任务完成后，返回的结果需要把分析结果展示出来，如png图形，pdf图形，表格，并给出任务详情页面的链接。
  - ✅ 已更新：`worker.py` 中的 `run_ai_workflow_task` 和 `run_sandbox_task` 完成消息包含任务详情链接
  - ✅ 已更新：结果消息包含图片和表格预览
  - ✅ 已更新：`ai.py` 中的 `execute_plan` 返回包含 `task_link`

- [x] 4. /copilot页面目前无法正常使用，提问后没有反应。
  - ✅ 已修复：添加了更好的错误处理和用户反馈
  - ✅ 添加了 401 未授权检测，自动跳转到登录页
  - ✅ 添加了错误提示 toast 通知

## 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `frontend/src/app/copilot/page.tsx` | 添加错误处理、401检测、任务提交后跳转、plan_data处理 |
| `backend/app/api/routes/ai.py` | 添加 `conversation_id` 字段、任务详情链接 |
| `backend/app/worker.py` | 更新任务完成消息，包含任务详情链接和结果预览 |

---

## 待验证问题

- [ ] 5. 提出分析需求：以sample_subtypes.ed.tsv为输入，统计第二列，绘制bar图，渐变色。回复是："I have created an analysis plan for you. Please review and confirm it below."，并没有给出执行策略，以及运行按钮。
  - **分析**：需要验证 LLM 是否正确返回 plan_data，以及前端是否正确渲染
  - **可能原因**：
    1. 意图解析器没有正确识别为"analysis"意图
    2. 工具匹配器没有找到匹配的工作流
    3. LLM 没有调用工具生成 plan
  - **需要检查**：后端日志中是否有 `[Agent]` 相关输出

- [ ] 6. 只有回复消息可以复制，用户的消息无法复制。
  - **分析**：复制按钮对所有消息都可用，位于消息气泡左上角/右上角
  - **可能原因**：
    1. 用户消息气泡较小，按钮可能被裁剪
    2. 按钮需要悬停才能显示（`opacity-0 group-hover:opacity-100`）
  - **解决方案**：调整按钮位置或添加 padding

- [ ] 7. 目前项目下的bio-copilot标签页功能和/copilot功能重复，只保留/copilot，但是项目下的bio-copilot标签页功能目前是比较正常，但是/copilot页面功能不正常，请对比并修复/copilot。
  - **分析**：需要对比 `CopilotPanel.tsx` 和 `/copilot/page.tsx` 的实现差异
  - **主要差异**：
    1. `CopilotPanel.tsx` 使用 `copilotStore` 管理状态
    2. `/copilot/page.tsx` 使用 React Query 管理状态
    3. API 调用方式可能不同
  - **解决方案**：统一两处的实现，或修复 `/copilot/page.tsx` 中的问题
