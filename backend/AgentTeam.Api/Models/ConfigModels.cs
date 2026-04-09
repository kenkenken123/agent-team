using System;

namespace AgentTeam.Api.Models;

/// <summary>
/// 凭据配置模板 (例如：公司账户、个人账户)
/// </summary>
public class CredentialTemplate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    
    /// <summary>
    /// 模板名称 (如：Production, Testing, OpenRouter)
    /// </summary>
    public string Name { get; set; } = string.Empty;

    public string ApiKey { get; set; } = string.Empty;

    public string? BaseUrl { get; set; }

    /// <summary>
    /// 是否为默认模板
    /// </summary>
    public bool IsDefault { get; set; }
}

/// <summary>
/// 模型与模板的映射配置
/// </summary>
public class ModelConfig
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>
    /// 具体的模型标识符 (如：claude-3-5-sonnet-latest)
    /// </summary>
    public string ModelId { get; set; } = string.Empty;

    /// <summary>
    /// 关联的模板 ID
    /// </summary>
    public Guid TemplateId { get; set; }

    public virtual CredentialTemplate? Template { get; set; }
}
