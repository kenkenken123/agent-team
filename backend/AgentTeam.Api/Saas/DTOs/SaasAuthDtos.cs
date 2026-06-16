using System;

namespace AgentTeam.Api.Saas.DTOs;

public record RegisterRequest(string Username, string Password);
public record LoginRequest(string Username, string Password);
public record AuthResponse(string Token, UserDto User);
public record UserDto(Guid Id, string Username, DateTime CreatedAt);
