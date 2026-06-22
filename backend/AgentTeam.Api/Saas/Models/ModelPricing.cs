using System;

namespace AgentTeam.Api.Saas.Models;

public class ModelPricing
{
    public int Id { get; set; }

    /// <summary>模型 ID，如 claude-3-7-sonnet-20250219</summary>
    public string ModelId { get; set; } = string.Empty;

    /// <summary>输入价格，单位：人民币 / 百万 Token</summary>
    public decimal InputPricePerMillion { get; set; } = 0;

    /// <summary>输出价格，单位：人民币 / 百万 Token</summary>
    public decimal OutputPricePerMillion { get; set; } = 0;

    /// <summary>输入缓存价格，单位：人民币 / 百万 Token</summary>
    public decimal CacheInputPricePerMillion { get; set; } = 0;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
