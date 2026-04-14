// wechat-service/src/config.ts
// 服务配置，支持环境变量覆盖

export const config = {
  /** agent-team 后端 API 地址 */
  backendUrl: process.env.BACKEND_URL ?? 'http://127.0.0.1:5501',

  /** 本服务监听端口（供后端管理 API 调用） */
  servicePort: parseInt(process.env.WECHAT_SERVICE_PORT ?? '5600'),

  /** 本地凭证存储目录（bot_token / context_token 持久化） */
  storageDir: process.env.WECHAT_STORAGE_DIR ?? './.wechatbot-data',

  /** 日志级别 */
  logLevel: (process.env.WECHAT_LOG_LEVEL ?? 'info') as 'debug' | 'info' | 'warn' | 'error' | 'silent',

  /**
   * Agent 路由规则配置
   * 留空代表：所有消息都使用自动路由（交由后端 MessageIngestionService 决定）
   * 格式：{ userId: agentId } 或 { prefix: agentId }
   */
  agentRoutes: {} as Record<string, string>,

  /**
   * 频率限制
   * 每个用户每分钟最多发多少条消息
   */
  rateLimit: {
    maxMessages: parseInt(process.env.RATE_LIMIT_MAX ?? '20'),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000'),
  },

  /**
   * 默认 AgentId（可选）
   * 如果路由找不到匹配，使用此 Agent
   * 若为空，则走 MessageIngestionService 自动路由
   */
  defaultAgentId: process.env.DEFAULT_AGENT_ID ?? '',
} as const;
