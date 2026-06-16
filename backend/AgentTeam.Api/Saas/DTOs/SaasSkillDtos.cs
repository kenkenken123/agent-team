using System;

namespace AgentTeam.Api.Saas.DTOs;

public record CreateSkillRequest(string SkillName, string Description);
public record UpdateSkillRequest(string Description);
public record SkillDto(string SkillName, string Description, DateTime CreatedAt);
