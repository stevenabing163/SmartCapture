/**
 * 内容解析器
 * 支持两种模式：
 *  1. 规则模式（本地正则匹配）- 无需外部 API，离线可用
 *  2. AI 模式（调用 LLM API）- 更智能的理解和提取
 */

class ContentParser {
  constructor(store) {
    this.store = store;
    try {
      this.settings = store ? (store.getSettings() || {}) : {};
    } catch (e) {
      console.warn('[ContentParser] 获取设置失败，使用默认配置');
      this.settings = {};
    }
  }

  /**
   * 解析内容，提取待办/日历信息
   * @param {string} content - 原始文本
   * @param {string} type - 内容类型: 'text' | 'screenshot' | 'clipboard'
   * @returns {Object} 解析结果
   */
  async parse(content, type = 'text') {
    if (!content || typeof content !== 'string') {
      return { success: false, error: '内容无效' };
    }

    const isImage = type === 'screenshot' && content.startsWith('data:image');

    if (!isImage && content.trim().length < 2) {
      return { success: false, error: '内容过短' };
    }

    // 如果配置了 AI API，优先使用 AI 解析
    if (this.settings.aiApiKey && this.settings.aiEndpoint) {
      try {
        const aiResult = await this._parseWithAI(content, type);
        if (aiResult && aiResult.tasks && aiResult.tasks.length > 0) {
          return aiResult;
        }
      } catch (err) {
        console.warn('[ContentParser] AI 解析失败:', err.message);
        if (isImage) {
          return { success: false, error: `AI 解析失败: ${err.message}` };
        }
      }
    }

    // 回退到规则模式
    if (isImage) {
      if (!this.settings.aiApiKey || !this.settings.aiEndpoint) {
        return { success: false, error: '截图识别需要配置 AI API，请先在设置中配置 AI 服务。' };
      }
      return { success: false, error: '截图识别失败，请检查 AI 配置是否正确、余额是否充足。' };
    }
    return this._parseWithRules(content);
  }

  // ============ AI 解析模式 ============

  async _parseWithAI(content, type) {
    const isImage = type === 'screenshot' && content.startsWith('data:image');
    const prompt = this._buildPrompt(content, type);

    let messages;
    if (isImage) {
      messages = [
        {
          role: 'system',
          content: '你是一个待办事项提取助手。从用户提供的截图中识别文字内容，并提取待办事项和日历事件。以 JSON 格式返回结果。',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: content } },
          ],
        },
      ];
    } else {
      messages = [
        {
          role: 'system',
          content: '你是一个待办事项提取助手。从用户输入的文本中提取待办事项和日历事件。以 JSON 格式返回结果。',
        },
        { role: 'user', content: prompt },
      ];
    }

    try {
      const response = await fetch(this.settings.aiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.settings.aiApiKey}`,
        },
        body: JSON.stringify({
          model: this.settings.aiModel || 'gpt-4o-mini',
          messages,
          temperature: 0.3,
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try {
          const errData = await response.json();
          if (errData.error) {
            errMsg = errData.error.message || errData.error;
          } else {
            errMsg = JSON.stringify(errData).slice(0, 200);
          }
        } catch (_) {
          const text = await response.text();
          errMsg = text.slice(0, 200);
        }
        // 翻译常见API错误
        const errMap = {
          'insufficient balance': 'API 余额不足，请充值后重试',
          'invalid api key': 'API 密钥无效，请检查密钥是否正确',
          'unauthorized': '认证失败，请检查 API 密钥',
          'rate limit': '请求过于频繁，请稍后再试',
          'model not found': '模型不存在，请检查模型名称',
          'context length': '输入内容过长，请截断后重试',
          'content policy': '内容违反安全策略',
          'server error': '服务器错误，请稍后重试',
          'timeout': '请求超时，请检查网络连接',
        };
        const lowerMsg = errMsg.toLowerCase();
        for (const [key, cnMsg] of Object.entries(errMap)) {
          if (lowerMsg.includes(key)) {
            throw new Error(`${cnMsg}（${errMsg}）`);
          }
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      const aiContent = data.choices?.[0]?.message?.content;

      if (!aiContent) {
        throw new Error('AI 返回为空，请检查模型是否支持视觉功能');
      }

      // 尝试解析 JSON
      const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/) ||
                        aiContent.match(/\{[\s\S]*\}/);

      const parsed = jsonMatch ? JSON.parse(jsonMatch[1] || jsonMatch[0]) : JSON.parse(aiContent);

      return {
        success: true,
        source: 'ai',
        tasks: this._normalizeTasks(parsed, content),
        raw: parsed,
      };
    } catch (err) {
      throw new Error(err.message);
    }
  }

  _buildPrompt(content, type) {
    if (type === 'screenshot' && content.startsWith('data:image')) {
      return `请从这张截图中识别所有文字内容，并提取其中的待办事项和日历事件。

【提取规则】：
1. 先完整识别截图中的所有文字
2. 识别所有明确的待办任务（如"明天交报告"、"周五前完成XX"）
3. 识别所有日历事件（如"3月15日开会"、"下午3点面试"）
4. 提取时间信息（相对时间如"明天"、"下周一"需转换为具体日期）
5. 提取地点信息（如果有的话）
6. 区分任务类型：'todo'（待办）或 'event'（日历事件）
7. 每个任务包含：title（标题）、type（todo/event）、dueDate（截止日期，ISO格式）、location（地点，可选）、priority（优先级 1-3）

请以严格的 JSON 格式返回：
{
  "tasks": [
    {
      "title": "任务标题",
      "type": "todo",
      "dueDate": "2024-01-15T18:00:00",
      "location": "地点（可选）",
      "priority": 2,
      "rawText": "原始文本片段"
    }
  ]
}`;
    }

    return `请从以下${type === 'screenshot' ? '截图中的' : ''}文本中提取待办事项和日历事件：

【文本内容】：
${content}

【提取规则】：
1. 识别所有明确的待办任务（如"明天交报告"、"周五前完成XX"）
2. 识别所有日历事件（如"3月15日开会"、"下午3点面试"）
3. 提取时间信息（相对时间如"明天"、"下周一"需转换为具体日期）
4. 提取地点信息（如果有的话）
5. 区分任务类型：'todo'（待办）或 'event'（日历事件）
6. 每个任务包含：title（标题）、type（todo/event）、dueDate（截止日期，ISO格式）、location（地点，可选）、priority（优先级 1-3）

请以严格的 JSON 格式返回：
{
  "tasks": [
    {
      "title": "任务标题",
      "type": "todo",
      "dueDate": "2024-01-15T18:00:00",
      "location": "地点（可选）",
      "priority": 2,
      "rawText": "原始文本片段"
    }
  ]
}`;
  }

  // ============ 规则解析模式（本地正则） ============

  _parseWithRules(content) {
    const tasks = [];
    const lines = content.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 0);

    for (const line of lines) {
      const task = this._extractFromLine(line);
      if (task) {
        tasks.push(task);
      }
    }

    // 如果整段文本没有明确的任务行，尝试整体解析
    if (tasks.length === 0 && content.length > 10) {
      const task = this._extractFromText(content);
      if (task) tasks.push(task);
    }

    return {
      success: tasks.length > 0,
      source: 'rules',
      tasks,
    };
  }

  _extractFromLine(line) {
    let title = line;
    let dueDate = null;
    let location = null;
    let type = 'todo';
    let priority = 2;

    // 时间关键词匹配
    const timePatterns = [
      // 明确日期: 2024-01-15, 1月15日, 15号
      { regex: /(\d{4})[年\-\/.](\d{1,2})[月\-\/.](\d{1,2})[日号]?/, weight: 1 },
      { regex: /(\d{1,2})[月\-\/.](\d{1,2})[日号]/, weight: 1, year: new Date().getFullYear() },
      // 相对日期
      { regex: /(明天|后天|大后天)/, weight: 2, offsetMap: { '明天': 1, '后天': 2, '大后天': 3 } },
      { regex: /(下周[一二三四五六日天])/, weight: 2 },
      { regex: /(本周[一二三四五六日天])/, weight: 2 },
      { regex: /(下周一|下周二|下周三|下周四|下周五|下周六|下周日|下周天)/, weight: 2 },
      // 时间点
      { regex: /(\d{1,2})[点时:：](\d{1,2})?分?/, weight: 1 },
    ];

    for (const pattern of timePatterns) {
      const match = line.match(pattern.regex);
      if (match) {
        dueDate = this._resolveDate(match, pattern);
        if (dueDate) {
          title = line.replace(match[0], '').trim() || line;
          break;
        }
      }
    }

    // 地点匹配
    const locationMatch = line.match(/(?:在|去|到|于)([^，。,;\s]+?(?:市|区|路|街|号|大厦|公司|学校|医院|银行|广场|中心))/);
    if (locationMatch) {
      location = locationMatch[1];
    }

    // 优先级关键词
    if (/紧急|重要|立即| ASAP|urgent/i.test(line)) {
      priority = 3;
    } else if (/尽量|有空|可选|optional/i.test(line)) {
      priority = 1;
    }

    // 类型判断
    if (/开会|会议|面试|约会|聚餐|生日|派对|演出|展览|活动/.test(line)) {
      type = 'event';
    }

    // 任务关键词过滤
    const taskIndicators = /^(记得|别忘了|需要|必须|要|得|应该|务必|记得去|一定|别忘了|提醒我|请|帮我)/;
    if (taskIndicators.test(line) || dueDate) {
      return {
        title,
        type,
        dueDate,
        location,
        priority,
        rawText: line,
      };
    }

    return null;
  }

  _extractFromText(text) {
    // 从整段文本中提取最重要的一个任务
    const sentences = text.split(/[。.!！?？\n]/).filter(s => s.trim().length > 5);
    for (const sentence of sentences) {
      const task = this._extractFromLine(sentence.trim());
      if (task && task.dueDate) {
        return task;
      }
    }
    // 返回第一段作为任务
    if (sentences.length > 0) {
      return {
        title: sentences[0].trim().substring(0, 100),
        type: 'todo',
        dueDate: null,
        location: null,
        priority: 2,
        rawText: text,
      };
    }
    return null;
  }

  _resolveDate(match, pattern) {
    const now = new Date();
    let date = null;

    if (pattern.weight === 1 && match.length >= 3) {
      // 明确日期
      const year = match[1] || pattern.year || now.getFullYear();
      const month = match[2];
      const day = match[3];
      date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    } else if (pattern.weight === 2) {
      // 相对日期
      const keyword = match[0];
      const offsetMap = {
        '明天': 1, '后天': 2, '大后天': 3,
        '下周一': 8, '下周二': 9, '下周三': 10, '下周四': 11, '下周五': 12, '下周六': 13, '下周日': 14, '下周天': 14,
      };

      // 中文星期映射
      const cnDayMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };

      if (offsetMap[keyword]) {
        date = new Date(now.getTime() + offsetMap[keyword] * 86400000);
      } else if (/下周[一二三四五六日天]/.test(keyword)) {
        const dayChar = keyword.charAt(2);
        const targetDay = cnDayMap[dayChar];
        const currentDay = now.getDay();
        let diff = targetDay - currentDay + 7;
        if (diff <= 0) diff += 7;
        date = new Date(now.getTime() + diff * 86400000);
      } else if (/本周[一二三四五六日天]/.test(keyword)) {
        const dayChar = keyword.charAt(2);
        const targetDay = cnDayMap[dayChar];
        const currentDay = now.getDay();
        let diff = targetDay - currentDay;
        if (diff <= 0) diff += 7;
        date = new Date(now.getTime() + diff * 86400000);
      }
    }

    // 检查是否有时间匹配
    const timeMatch = match.input.match(/(\d{1,2})[点时:：](\d{1,2})?分?/);
    if (timeMatch && date) {
      date.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2] || '0'), 0, 0);
    }

    return date ? date.toISOString() : null;
  }

  async testConnection() {
    if (!this.settings.aiApiKey || !this.settings.aiEndpoint) {
      return { success: false, error: '请先配置 API 密钥和端点' };
    }
    try {
      const response = await fetch(this.settings.aiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.settings.aiApiKey}`,
        },
        body: JSON.stringify({
          model: this.settings.aiModel || 'deepseek-chat',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 10,
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `连接失败 (HTTP ${response.status}): ${errText.slice(0, 200)}` };
      }
      const data = await response.json();
      return { success: true, model: data.model || this.settings.aiModel };
    } catch (err) {
      return { success: false, error: `网络错误: ${err.message}` };
    }
  }

  _normalizeTasks(parsed, rawContent) {
    if (!parsed || !parsed.tasks) return [];

    return parsed.tasks.map((t, i) => ({
      id: `ai-${Date.now()}-${i}`,
      title: t.title || '未命名任务',
      type: t.type === 'event' ? 'event' : 'todo',
      dueDate: t.dueDate || null,
      location: t.location || null,
      priority: Math.max(1, Math.min(3, t.priority || 2)),
      source: 'ai',
      rawText: t.rawText || rawContent,
      completed: false,
      createdAt: new Date().toISOString(),
    }));
  }
}

module.exports = ContentParser;