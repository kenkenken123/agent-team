using System;

namespace AgentTeam.Api.Saas.DTOs;

// ── 管理员用户管理 ────────────────────────────────────────────
public record AdminCreateUserRequest(string Username, string Password);
public record AdminUpdateUserRequest(string? Username, string? Password);
public record AdminUserDto(Guid Id, string Username, DateTime CreatedAt);

// ── 模型计费配置 ──────────────────────────────────────────────
public record ModelPricingDto(string ModelId, decimal InputPricePerMillion, decimal OutputPricePerMillion, decimal CacheInputPricePerMillion);
public record SaveModelPricingRequest(List<ModelPricingDto> Items);
