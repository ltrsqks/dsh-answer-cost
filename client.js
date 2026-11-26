/**
 * Client half of the answer-cost bundle.
 *
 * Adds one money reading to every finalized answer's action row: what that
 * answer cost, priced from the Turn's own provider-reported accounting
 * (`turn-tail.tokenUsage`), with the conversation total in the same tooltip.
 * The reading mounts through the `conversation.chat.assistant-actions` slot, so
 * it appears under an answer exactly when that answer is finalized — after the
 * model finished thinking and replied — and never for a running Turn.
 *
 * Nothing is requested from the Host, no session event is written, and no model
 * call is made: the amount is a pure function of the Chat timeline.
 *
 * The rates are DeepSeek's published per-million-token list prices, split into
 * the idle and peak halves of the official pricing calendar. Every Turn is
 * priced with the period its own end time falls into.
 */

window.__ModuleLoader__.load({
  id: 'dsh-answer-cost',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'sessionCost'

    /**
     * Official DeepSeek list prices, CNY per million tokens, `[idle, peak]`.
     * Peak is 09:00–12:00 and 14:00–18:00 on Beijing working days; every other
     * hour, all weekends, and statutory holidays are idle, and the peak price is
     * exactly twice the idle one. Update this table when DeepSeek reprices;
     * every model below is matched by substring after the longest key wins, and
     * an unrecognized model is priced with the default row.
     */
    const PEAK_HOURS = [[9, 12], [14, 18]]
    const FLASH_PRICE = { hit: [0.02, 0.04], miss: [1, 2], out: [4, 8] }
    const PRO_PRICE = { hit: [0.15, 0.3], miss: [4.5, 9], out: [13.5, 27] }
    const PRICES = {
      'deepseek-flash': FLASH_PRICE,
      // Retired ids still served by the same Flash model and billed as Flash.
      'deepseek-v4-flash': FLASH_PRICE,
      'deepseek-v4-flash-vision-exp': FLASH_PRICE,
      'deepseek-v4-pro': PRO_PRICE,
    }
    /** Row used for a model id this table does not know. */
    const DEFAULT_ROW = 'deepseek-flash'
    /** Longest key first, so a short id can never shadow a longer one. */
    const PRICE_KEYS = Object.keys(PRICES).sort((left, right) => right.length - left.length)

    /** Beijing is UTC+8 with no daylight saving, so a fixed offset is exact. */
    const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000
    /** Beijing 2026-08-23 00:00: weekends became idle all day. */
    const WEEKEND_IDLE_FROM_MS = Date.UTC(2026, 7, 22, 16, 0, 0)
    /** Beijing 2026-09-19 00:00: statutory holidays became idle all day. */
    const HOLIDAY_IDLE_FROM_MS = Date.UTC(2026, 8, 18, 16, 0, 0)
    /**
     * Statutory holidays that are idle all day (official 2026 calendar).
     * Make-up working days all fall on a weekend, which the weekend rule
     * already prices as idle. Add each new year once the State Council
     * publishes it: an unlisted year prices its holidays at the peak rate.
     */
    const HOLIDAYS = {
      '2026-01-01': 1, '2026-01-02': 1, '2026-01-03': 1,
      '2026-02-15': 1, '2026-02-16': 1, '2026-02-17': 1, '2026-02-18': 1, '2026-02-19': 1,
      '2026-02-20': 1, '2026-02-21': 1, '2026-02-22': 1, '2026-02-23': 1,
      '2026-04-04': 1, '2026-04-05': 1, '2026-04-06': 1,
      '2026-05-01': 1, '2026-05-02': 1, '2026-05-03': 1, '2026-05-04': 1, '2026-05-05': 1,
      '2026-06-19': 1, '2026-06-20': 1, '2026-06-21': 1,
      '2026-09-25': 1, '2026-09-26': 1, '2026-09-27': 1,
      '2026-10-01': 1, '2026-10-02': 1, '2026-10-03': 1, '2026-10-04': 1,
      '2026-10-05': 1, '2026-10-06': 1, '2026-10-07': 1,
    }

    const DICTS = {
      en: {
        'row.compact': '≈ {cost}',
        'row.title': 'This answer cost about {cost}',
        'row.turn': 'This answer used {tokens} tokens ({model} · {period} price)',
        'row.rates': 'Rate per million tokens ({row}, {period}): input {miss} · cache hit {hit} · output {out}',
        'row.total': 'Conversation total about {cost} ({turns} priced turns)',
        'row.totalCompact': 'total ≈ {cost}',
        'row.mixed': 'Each turn uses the peak or off-peak rate of the moment it ended.',
        'row.window': 'Only turns still loaded are counted, so loading earlier turns raises the total.',
        'row.note': 'Estimated from DeepSeek list prices, not a bill.',
        'period.peak': 'peak',
        'period.idle': 'off-peak',
        'model.unknown': 'unknown model',
      },
      zh: {
        'row.compact': '约 {cost}',
        'row.title': '本轮花费约 {cost}',
        'row.turn': '本轮 {tokens} tokens（{model} · {period}价）',
        'row.rates': '单价（{row}，每百万 tokens，{period}价）：未命中输入 {miss} · 缓存命中 {hit} · 输出 {out}',
        'row.total': '本次对话累计约 {cost}（已计价 {turns} 轮）',
        'row.totalCompact': '累计约 {cost}',
        'row.mixed': '各轮按自己结束时刻的高峰或闲时价计价。',
        'row.window': '只统计已加载的轮次，加载更早的轮次后累计会变大。',
        'row.note': '按 DeepSeek 官方定价估算，不是账单。',
        'period.peak': '高峰',
        'period.idle': '闲时',
        'model.unknown': '未知模型',
      },
      ja: {
        'row.compact': '約 {cost}',
        'row.title': 'この回答の費用は約 {cost}',
        'row.turn': 'この回答 {tokens} tokens（{model} · {period}料金）',
        'row.rates': '単価（{row}、100万 tokens、{period}料金）：入力 {miss} · キャッシュヒット {hit} · 出力 {out}',
        'row.total': 'この会話の累計は約 {cost}（{turns} ターン集計）',
        'row.totalCompact': '累計 約{cost}',
        'row.mixed': '各ターンは終了時刻のピーク／オフピーク料金で計算しています。',
        'row.window': '読み込み済みのターンだけを集計しているため、以前のターンを読み込むと累計は増えます。',
        'row.note': 'DeepSeek の公式価格による概算で、請求額ではありません。',
        'period.peak': 'ピーク',
        'period.idle': 'オフピーク',
        'model.unknown': '不明なモデル',
      },
      es: {
        'row.compact': '≈ {cost}',
        'row.title': 'Esta respuesta costó unos {cost}',
        'row.turn': 'Esta respuesta usó {tokens} tokens ({model} · precio {period})',
        'row.rates': 'Precio por millón de tokens ({row}, {period}): entrada {miss} · acierto de caché {hit} · salida {out}',
        'row.total': 'Total del chat: unos {cost} ({turns} turnos contados)',
        'row.totalCompact': 'total ≈ {cost}',
        'row.mixed': 'Cada turno usa el precio de punta o valle del momento en que terminó.',
        'row.window': 'Solo se cuentan los turnos cargados; cargar turnos anteriores aumenta el total.',
        'row.note': 'Estimado con los precios de lista de DeepSeek; no es una factura.',
        'period.peak': 'punta',
        'period.idle': 'valle',
        'model.unknown': 'modelo desconocido',
      },
      fr: {
        'row.compact': '≈ {cost}',
        'row.title': 'Cette réponse a coûté environ {cost}',
        'row.turn': 'Cette réponse a utilisé {tokens} tokens ({model} · tarif {period})',
        'row.rates': 'Tarif par million de tokens ({row}, {period}) : entrée {miss} · cache {hit} · sortie {out}',
        'row.total': 'Total de la conversation : environ {cost} ({turns} tours comptés)',
        'row.totalCompact': 'total ≈ {cost}',
        'row.mixed': "Chaque tour utilise le tarif de pointe ou de creux du moment où il s'est terminé.",
        'row.window': "Seuls les tours chargés sont comptés ; charger des tours plus anciens augmente le total.",
        'row.note': "Estimation d'après les tarifs publics de DeepSeek, pas une facture.",
        'period.peak': 'pointe',
        'period.idle': 'creux',
        'model.unknown': 'modèle inconnu',
      },
      de: {
        'row.compact': '≈ {cost}',
        'row.title': 'Diese Antwort kostete etwa {cost}',
        'row.turn': 'Diese Antwort: {tokens} tokens ({model} · {period}tarif)',
        'row.rates': 'Preis pro Million tokens ({row}, {period}tarif): Eingabe {miss} · Cache-Treffer {hit} · Ausgabe {out}',
        'row.total': 'Chat gesamt: etwa {cost} ({turns} gezählte Runden)',
        'row.totalCompact': 'gesamt ≈ {cost}',
        'row.mixed': 'Jede Runde wird mit dem Haupt- oder Nebenzeittarif ihres Endzeitpunkts berechnet.',
        'row.window': 'Nur geladene Runden zählen; ältere Runden erhöhen die Summe.',
        'row.note': 'Schätzung nach den DeepSeek-Listenpreisen, keine Rechnung.',
        'period.peak': 'Hauptzeit',
        'period.idle': 'Nebenzeit',
        'model.unknown': 'unbekanntes Modell',
      },
      ru: {
        'row.compact': '≈ {cost}',
        'row.title': 'Этот ответ стоил около {cost}',
        'row.turn': 'Этот ответ: {tokens} tokens ({model} · тариф {period})',
        'row.rates': 'Тариф за миллион tokens ({row}, {period}): ввод {miss} · попадание в кэш {hit} · вывод {out}',
        'row.total': 'Итого за чат: около {cost} (учтено ходов: {turns})',
        'row.totalCompact': 'итого ≈ {cost}',
        'row.mixed': 'Каждый ход считается по тарифу пик или вне пика на момент его завершения.',
        'row.window': 'Учтены только загруженные ходы; загрузка более ранних увеличит сумму.',
        'row.note': 'Оценка по официальным тарифам DeepSeek, а не счёт.',
        'period.peak': 'пик',
        'period.idle': 'вне пика',
        'model.unknown': 'неизвестная модель',
      },
      pt: {
        'row.compact': '≈ {cost}',
        'row.title': 'Esta resposta custou cerca de {cost}',
        'row.turn': 'Esta resposta usou {tokens} tokens ({model} · preço {period})',
        'row.rates': 'Preço por milhão de tokens ({row}, {period}): entrada {miss} · acerto de cache {hit} · saída {out}',
        'row.total': 'Total do chat: cerca de {cost} ({turns} turnos contados)',
        'row.totalCompact': 'total ≈ {cost}',
        'row.mixed': 'Cada turno usa o preço de pico ou fora de pico do momento em que terminou.',
        'row.window': 'Apenas os turnos carregados são contados; carregar turnos anteriores aumenta o total.',
        'row.note': 'Estimativa pelos preços de tabela da DeepSeek; não é uma fatura.',
        'period.peak': 'pico',
        'period.idle': 'fora de pico',
        'model.unknown': 'modelo desconhecido',
      },
    }

    /** The bound seat of this plugin's dictionaries, used when the slot omits its own. */
    let boundTranslate = null

    /**
     * Resolve the translate seat for one render.
     *
     * The slot's own seat is preferred, because the slot layer re-renders its
     * entries when the locale changes. It is bound to this plugin's namespace
     * through the registration's `locale` option; should that binding ever
     * miss, the fallback seat still serves our dictionaries instead of leaking
     * raw keys into the action row.
     * @param props - slot props, which may carry the owning locale seat.
     * @returns a translate function usable for this render.
     */
    function seatOf(props) {
      const fallback = typeof boundTranslate === 'function' ? boundTranslate : key => key
      if (typeof props.t !== 'function') return fallback
      const slotSeat = props.t
      return (key, params) => {
        let value
        try {
          value = slotSeat(key, params)
        } catch {
          value = undefined
        }
        return typeof value === 'string' && value !== key ? value : fallback(key, params)
      }
    }

    /** Replace `{name}` placeholders in one dictionary entry. */
    function fill(template, params) {
      return String(template).replace(/\{(\w+)\}/g, (whole, name) =>
        (Object.hasOwn(params, name) ? String(params[name]) : whole))
    }

    /** A usable non-negative count, or 0. */
    function count(value) {
      return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
    }

    /**
     * Exact token count with comma grouping.
     * @param value - non-negative token count.
     * @returns grouped integer string.
     */
    function grouped(value) {
      return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }

    /**
     * Trim a fixed-point string to at least `least` and at most `most` decimals,
     * never leaving a trailing dot.
     * @param text - fixed-point text.
     * @param least - fewest fraction digits to keep.
     * @param most - most fraction digits to keep, after dropping trailing zeros.
     * @returns the trimmed text.
     */
    function trim(text, least, most) {
      const [whole, raw = ''] = text.split('.')
      const kept = raw.slice(0, most).replace(/0+$/, '')
      if (kept === '' && least === 0) return whole
      return `${whole}.${kept.padEnd(least, '0')}`
    }

    /**
     * Money amount in CNY with enough decimals to stay readable at cent scale:
     * one turn commonly costs a fraction of a cent.
     * @param value - non-negative amount in CNY.
     * @returns display string such as `¥0.0142` or `¥1.24`.
     */
    function money(value) {
      const amount = Number.isFinite(value) && value > 0 ? value : 0
      if (amount > 0 && amount < 0.000005) return '<¥0.00001'
      let text
      if (amount >= 1) text = amount.toFixed(2)
      else if (amount >= 0.1) text = amount.toFixed(3)
      else if (amount >= 0.01) text = amount.toFixed(4)
      else text = amount.toFixed(5)
      return `¥${trim(text, 2, 5)}`
    }

    /**
     * One list price in CNY per million tokens, as printed in the rate line.
     * @param value - published price.
     * @returns compact price text such as `0.04`, `1`, or `13.50`.
     */
    function rate(value) {
      const amount = Number.isFinite(value) && value > 0 ? value : 0
      if (amount === 0) return '0'
      if (amount >= 1) return trim(amount.toFixed(2), 0, 3)
      return trim(amount.toFixed(3), 2, 3)
    }

    /**
     * Whether one instant falls in DeepSeek's peak pricing window: a Beijing
     * working day (not a weekend from 2026-08-23 on, not a statutory holiday
     * from 2026-09-19 on) inside 09:00–12:00 or 14:00–18:00.
     * @param at - epoch milliseconds of the Turn's end.
     * @returns true when the peak price applies.
     */
    function isPeak(at) {
      if (!Number.isFinite(at)) return false
      const beijing = new Date(at + BEIJING_OFFSET_MS)
      if (at >= WEEKEND_IDLE_FROM_MS) {
        const day = beijing.getUTCDay()
        if (day === 0 || day === 6) return false
      }
      if (at >= HOLIDAY_IDLE_FROM_MS) {
        const dayKey = beijing.toISOString().slice(0, 10)
        if (Object.hasOwn(HOLIDAYS, dayKey)) return false
      }
      const hour = beijing.getUTCHours()
      for (const [start, end] of PEAK_HOURS) {
        if (hour >= start && hour < end) return true
      }
      return false
    }

    /**
     * List price row of one model id, matched by substring with the longest key
     * winning so an older short id cannot shadow a longer one.
     * @param model - provider-reported model id, possibly empty.
     * @returns the row's `key` and its idle/peak rate `rates`.
     */
    function rateRowFor(model) {
      const id = typeof model === 'string' ? model.toLowerCase() : ''
      for (const key of PRICE_KEYS) {
        if (id.includes(key)) return { key, rates: PRICES[key] }
      }
      return { key: DEFAULT_ROW, rates: PRICES[DEFAULT_ROW] }
    }

    /**
     * Price one Turn's reported usage with the period its end time falls into.
     *
     * `uncachedInputTokens` is prompt input that missed the cache and
     * `cacheReadTokens` is the cached share; a route that reports cache writes
     * pays the miss rate for them, as the prompt was processed. Output already
     * contains reasoning tokens, so it is priced once. A Turn that billed more
     * than one route has no per-route split in the log, so it is priced with the
     * most expensive of its routes rather than understated.
     * @param usage - the Turn's `tokenUsage` record.
     * @param at - epoch milliseconds of the Turn's end, or null when absent.
     * @returns the amount in CNY plus the routes and period used.
     */
    function costOfTurn(usage, at) {
      const routes = Array.isArray(usage.routes) ? usage.routes : []
      const models = []
      for (const route of routes) {
        const model = route !== null && typeof route === 'object' ? route.model : undefined
        if (typeof model === 'string' && model !== '') models.push(model)
      }
      const peak = at === null ? false : isPeak(at)
      const slot = peak ? 1 : 0
      let row = rateRowFor(models.length > 0 ? models[0] : '')
      for (const model of models) {
        const candidate = rateRowFor(model)
        if (candidate.rates.miss[slot] > row.rates.miss[slot]) row = candidate
      }
      const input = count(usage.uncachedInputTokens)
      const cacheRead = count(usage.cacheReadTokens)
      const cacheWrite = count(usage.cacheWriteTokens)
      const output = count(usage.outputTokens)
      const amount = (input / 1e6) * row.rates.miss[slot]
        + (cacheRead / 1e6) * row.rates.hit[slot]
        + (cacheWrite / 1e6) * row.rates.miss[slot]
        + (output / 1e6) * row.rates.out[slot]
      const reported = count(usage.totalTokens)
      return {
        amount,
        peak,
        row: row.key,
        models,
        tokens: reported > 0 ? reported : input + cacheRead + cacheWrite + output,
      }
    }

    /** The `turn-tail` payload of one Turn, or undefined. */
    function tailOf(turn) {
      const data = turn === undefined || turn === null ? undefined : turn.data
      if (data === undefined || data === null || typeof data.get !== 'function') return undefined
      return data.get('turn-tail')
    }

    /** Durable message id a Turn's closing answer belongs to, when it has one. */
    function messageIdOf(tail) {
      const closing = tail === undefined || tail === null ? undefined : tail.closing
      const finalNode = closing === undefined || closing === null ? undefined : closing.finalNode
      const id = finalNode === undefined || finalNode === null ? undefined : finalNode.messageId
      return typeof id === 'string' ? id : undefined
    }

    /**
     * Locate the answer's own Turn and fold the conversation total in one pass.
     *
     * A Turn publishes its `turn-tail` row on `turn/end`, so only finished
     * Turns contribute. Turns whose start is no longer inside the loaded window
     * are not counted, and a Turn whose accounting the window cannot prove
     * contributes neither amount nor count.
     * @param timeline - Chat snapshot timeline, or anything else before the view registers.
     * @param messageId - the finalized answer this row belongs to.
     * @returns this answer's priced Turn plus the loaded conversation total, or
     * null when this answer's Turn is not priced in the loaded window.
     */
    function locate(timeline, messageId) {
      const turns = timeline === undefined || timeline === null ? undefined : timeline.turns
      if (turns === undefined || turns === null || typeof turns.values !== 'function') return null
      if (typeof messageId !== 'string' || messageId === '') return null
      let total = 0
      let tokens = 0
      let finished = 0
      let own = null
      for (const turn of turns.values()) {
        const tail = tailOf(turn)
        if (tail === undefined || tail === null) continue
        const usage = tail.tokenUsage
        if (usage === undefined || usage === null) continue
        const priced = costOfTurn(usage, typeof tail.time === 'number' ? tail.time : null)
        total += priced.amount
        tokens += priced.tokens
        finished += 1
        if (messageIdOf(tail) === messageId) own = priced
      }
      if (own === null) return null
      return { own, total, tokens, finished }
    }

    /**
     * The reading wears the row's information-pill geometry (the shipped usage
     * and clock pills): 28px line box, secondary-minus-one text, tabular
     * numerals, tertiary label color. `order` seats it after the row's metadata
     * cluster when the owner renders the slot inside the action flex row; a
     * host that renders the entries elsewhere simply ignores it.
     */
    const ROW_STYLE = {
      order: 2,
      display: 'inline-flex',
      alignItems: 'center',
      boxSizing: 'border-box',
      gap: 6,
      minWidth: 0,
      height: 'calc(28px + var(--dsh-content-font-delta, 0px))',
      padding: '6px 8px',
      borderRadius: 'var(--dsw-radius-sm, 4px)',
      color: 'var(--dsw-alias-label-tertiary)',
      fontFamily: 'inherit',
      fontSize: 'calc(var(--dsh-content-font-size-secondary, 13px) - 1px)',
      fontVariantNumeric: 'tabular-nums',
      lineHeight: 'calc(24px + var(--dsh-content-font-delta, 0px))',
      whiteSpace: 'nowrap',
    }

    /** The visible amounts shrink instead of hard-clipping in a narrow row. */
    const LABEL_STYLE = {
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }

    /** The separator between the two amounts follows the host's own dot convention. */
    const SEPARATOR_STYLE = {
      flex: 'none',
      color: 'var(--dsw-alias-label-tertiary)',
    }

    /** Full reading for assistive technology without adding visible chrome. */
    const SCREEN_READER_ONLY = {
      position: 'absolute',
      width: '1px',
      height: '1px',
      margin: '-1px',
      padding: 0,
      border: 0,
      overflow: 'hidden',
      clipPath: 'inset(50%)',
      whiteSpace: 'nowrap',
    }

    /**
     * The reading: this answer's short amount, then the conversation total
     * beside it. Each amount carries its own breakdown as the native tooltip,
     * and both breakdowns are repeated as hidden text for assistive technology.
     * The visible amounts are hidden from assistive technology so nothing is
     * read twice.
     * @param props - visible labels and the two breakdowns.
     */
    function Reading({ label, lines, totalLabel, totalLines }) {
      return h('span', {
        style: ROW_STYLE,
        'data-answer-cost': '',
      },
      h('span', { style: LABEL_STYLE, title: lines.join('\n'), 'aria-hidden': true }, label),
      h('span', { style: SEPARATOR_STYLE, 'aria-hidden': true }, '·'),
      h('span', { style: LABEL_STYLE, title: totalLines.join('\n'), 'aria-hidden': true }, totalLabel),
      h('span', { style: SCREEN_READER_ONLY }, `${lines.join(' ')} ${totalLines.join(' ')}`))
    }

    /** Selector into the Chat snapshot; the timeline reference is stable between updates. */
    function selectTimeline(state) {
      return state === undefined || state === null ? undefined : state.timeline
    }

    /** The per-answer reading; the outer entry guarantees the Chat hook. */
    function CostReading(props) {
      const t = seatOf(props)
      const timeline = props.useChat(selectTimeline)
      const found = locate(timeline, props.messageId)
      if (found === null) return null

      const own = found.own
      const period = t(own.peak ? 'period.peak' : 'period.idle')
      const rates = PRICES[own.row]
      const slot = own.peak ? 1 : 0
      // This answer's own lines describe one row and period; the conversation
      // total beside it can mix both periods, so its own lines explain that and
      // are never meant to multiply out with the rate row above.
      const lines = [
        fill(t('row.title'), { cost: money(own.amount) }),
        fill(t('row.turn'), {
          tokens: grouped(own.tokens),
          model: own.models.length > 0 ? own.models.join(' + ') : t('model.unknown'),
          period,
        }),
        fill(t('row.rates'), {
          row: own.row,
          period,
          miss: `¥${rate(rates.miss[slot])}`,
          hit: `¥${rate(rates.hit[slot])}`,
          out: `¥${rate(rates.out[slot])}`,
        }),
        t('row.note'),
      ]
      const totalLines = [
        fill(t('row.total'), { cost: money(found.total), turns: String(found.finished) }),
        t('row.mixed'),
        t('row.window'),
        t('row.note'),
      ]
      return h(Reading, {
        label: fill(t('row.compact'), { cost: money(own.amount) }),
        lines,
        totalLabel: fill(t('row.totalCompact'), { cost: money(found.total) }),
        totalLines,
      })
    }

    /** Action-row entry; the hook-bearing body renders only when the slot provides Chat. */
    function SessionCostAction(props) {
      if (typeof props.useChat !== 'function') return null
      return h(CostReading, props)
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        boundTranslate = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, DICTS), 'answer-cost: dictionaries')
        ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
          name: 'conversation.chat.assistant-actions',
          id: 'answer-cost',
          order: 100,
          locale: NS,
        }, SessionCostAction))
      },
    }
  },
})
