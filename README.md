# Answer cost

Two amounts under every answer in the DeepSeek Harness Web GUI:

```
用量 15.1M tok   18:34   约 ¥0.0142 · 累计约 ¥0.0285
```

- **`约 ¥0.0142`** — what that answer cost: your question, the model's thinking, its reply.
- **`累计约 ¥0.0285`** — what this conversation has cost so far.

Both sit on the answer's own action row, next to its usage and time, and appear once the turn
finishes — never while it is still running. Hover either amount for its own breakdown.

## Install

```bash
dsh plugin --profile <profile> add dsh-answer-cost
# or straight from the repository
dsh plugin --profile <profile> add github:ltrsqks/dsh-answer-cost
```

Refresh the page (`Ctrl+F5`) after installing. Requires DSH `>=0.2.2-rc.3 <0.3.0`.

## Priced the way the bill is

**1. Per-turn real usage.** Each finished turn publishes its own provider-reported accounting:
uncached input, cache reads, cache writes, output. Cache writes are charged at the miss rate
(they are prompt tokens that were processed), and reasoning tokens are already inside output, so
nothing is charged twice. The conversation total is the sum of those per-turn amounts, not one
figure multiplied by a single rate.

**2. Accurate model routing.** The provider/model recorded in that turn's own log decides the
rate. A `deepseek-v4-pro` answer is never billed at flash prices; a turn that retried across
models is priced at its most expensive route (the log carries no per-route split, so understating
it would be worse). The rate row actually used is printed in the tooltip.

**3. Current official prices, with the peak/off-peak calendar.** The table below is DeepSeek's
current list price (CNY per million tokens). Peak is 09:00–12:00 and 14:00–18:00 Beijing time on
working days; every other hour, every weekend, and statutory holidays are off-peak, at exactly
half the peak price. Each turn is priced with the period **of its own end time**, so a
conversation that spans 09:00 mixes both rates the way the bill does.

| Model | Cache hit | Cache miss input | Output |
|---|---|---|---|
| `deepseek-flash` (also `deepseek-v4-flash`, `deepseek-v4-flash-vision-exp`) | 0.02 / 0.04 | 1 / 2 | 4 / 8 |
| `deepseek-v4-pro` | 0.15 / 0.30 | 4.5 / 9.0 | 13.5 / 27.0 |

## Hover breakdown

- On the turn amount: this turn's cost, tokens, model, the rate row and period applied, and the
  reminder that it is an estimate.
- On the total: the conversation total, its priced turn count, why the total can mix two periods,
  the loaded-window caveat, and the same reminder.

The visible amounts are hidden from assistive technology; the complete breakdown is repeated as
hidden text, so a screen reader reads it once.

## Limits

- **Loaded window only.** Turns whose start has paged out of the Chat transcript are not counted,
  so a very long conversation reads slightly low. The tooltip states the priced turn count.
- **Estimates, not a bill.** Usage is provider-reported, but prices are list prices and the period
  is judged from the turn's end time.
- **Holidays are data.** The statutory-holiday list covers 2026; add each new year as the State
  Council publishes it, or holidays in an unlisted year are priced at the peak rate.
- **Tooltip-only breakdown.** Touch and keyboard-only users see the amounts but not the breakdown
  (screen readers do get it). The amounts themselves need no interaction.

## Change prices

The price table, peak hours, weekend/holiday rules and the holiday list are constants at the top of
`client.js` (`PRICES`, `PEAK_HOURS`, `HOLIDAYS`, `WEEKEND_IDLE_FROM_MS`, `HOLIDAY_IDLE_FROM_MS`).
Edit them when DeepSeek reprices, then reload the page — the client bundle is read from disk on
load, so no app restart is needed.

The plugin makes no model request, writes no session event, adds no tool or prompt section, and has
no settings. Turning it off removes both amounts; nothing else changes.

## License

MIT

---

# 中文说明

每条回答的操作行里两处金额：

```
用量 15.1M tok   18:34   约 ¥0.0142 · 累计约 ¥0.0285
```

- **`约 ¥0.0142`**：这一轮（你提问 → 模型思索 → 作答）的花费。
- **`累计约 ¥0.0285`**：本次对话到目前为止的总花费。

两个数字都出现在回答下方那一行，与该回答的「用量」「时间」排在一起；**一轮结束**（模型答完）
后出现，正在跑的一轮不显示。鼠标停在哪个金额上，就显示哪个的明细。

## 安装

```bash
dsh plugin --profile <profile> add dsh-answer-cost
# 或直接从仓库装
dsh plugin --profile <profile> add github:ltrsqks/dsh-answer-cost
```

装完按 `Ctrl+F5` 刷新页面。需要 DSH `>=0.2.2-rc.3 <0.3.0`。

## 按账单口径计价

**一、逐轮真实用量**：每轮结束时会带上该轮提供方上报的真实用量——未命中输入、缓存读、缓存写、
输出。缓存写按未命中价计（它确实被模型处理过），推理 token 已包含在输出里，不重复计费。
累计是各轮金额之和，不是拿一个总额乘单价。

**二、模型路由准确**：价格取自该轮日志里记录的 provider/model。`deepseek-v4-pro` 的回答绝不会
按 flash 价算；一轮若跨模型重试，按其中较贵的一档计价（日志没有按模型拆分 token，低估比高估更糟）。
明细里会写明实际用了哪一行价目。

**三、跟随官方现价与峰谷日历**：上表是 DeepSeek 现行价目（人民币 / 百万 tokens）。工作日的
北京时间 09:00–12:00、14:00–18:00 为高峰，其余时段、周末、法定节假日全天为闲时，闲时价恰为
高峰价的一半。**每轮按自己结束时刻**的档位计价，所以跨过 9 点的一次对话会像账单一样混用两档。

| 模型 | 缓存命中 | 未命中输入 | 输出 |
|---|---|---|---|
| `deepseek-flash`（含 `deepseek-v4-flash`、`deepseek-v4-flash-vision-exp`） | 0.02 / 0.04 | 1 / 2 | 4 / 8 |
| `deepseek-v4-pro` | 0.15 / 0.30 | 4.5 / 9.0 | 13.5 / 27.0 |

## 悬停能看到什么

- 停在本轮金额上：本轮花费、token、模型、适用单价与档位、「不是账单」的说明。
- 停在累计上：累计金额、已计价轮数、为什么累计可能混用两档价、只统计已加载轮次的说明、同样的提示。

可见金额对辅助技术隐藏，完整明细另有一份视觉隐藏文本，屏幕阅读器只读一遍。

## 限制

- **只统计已加载窗口**：最早几轮被翻出窗口后不再计入，超长会话读数会略低；明细里的轮数就是实际
  计入的轮数。
- **是估算，不是账单**：用量由提供方上报，但价格是价目表、档位按该轮结束时刻判定。
- **节假日是数据**：法定节假日清单目前覆盖 2026 年；每年国务院公布新安排后需要补进来，否则未列出
  年份的节假日会按高峰价计。
- **明细靠悬停**：触屏与纯键盘用户看得到金额、看不到明细（屏幕阅读器能读到）。金额本身不需要交互。

## 改价目

价目表、峰谷时段、周末/节假日规则与节假日清单都是 `client.js` 顶部的常量（`PRICES`、
`PEAK_HOURS`、`HOLIDAYS`、`WEEKEND_IDLE_FROM_MS`、`HOLIDAY_IDLE_FROM_MS`）。DeepSeek 调价时
改那里，然后刷新页面即可（客户端代码按需从磁盘读，不用重启应用）。

插件不发起模型请求、不写入会话事件、不新增工具或提示词、没有配置项；关掉即消失，其它行为不变。

## 许可

MIT
