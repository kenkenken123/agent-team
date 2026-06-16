using AgentTeam.Api.Data;
using AgentTeam.Api.Models;
using AgentTeam.Api.Saas;
using AgentTeam.Api.Saas.Controllers;
using AgentTeam.Api.Saas.DTOs;
using AgentTeam.Api.Saas.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using Xunit;

namespace AgentTeam.Tests;

public class SaasAuthControllerTests : IDisposable
{
    private readonly AgentSaasContext _db;
    private readonly AppDbContext _appDb;
    private readonly JwtService _jwtService;
    private readonly SaasAuthController _controller;
    private readonly List<Guid> _createdUserIds = [];

    public SaasAuthControllerTests()
    {
        var options = new DbContextOptionsBuilder<AgentSaasContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        _db = new AgentSaasContext(options);

        var appDbOptions = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        _appDb = new AppDbContext(appDbOptions);

        // 播种默认 Agent 模板
        _appDb.AgentTemplates.Add(new AgentTemplate
        {
            Id = Guid.NewGuid(),
            Name = "测试模板",
            SystemPrompt = "System Prompt",
            IsEnabled = true
        });
        _appDb.SaveChanges();

        var inMemorySettings = new Dictionary<string, string?>
        {
            { "Jwt:Secret", "AntigravitySuperSecretSaaSKey2026!#$@" },
            { "Jwt:Issuer", "AgentTeamSaas" },
            { "Jwt:Audience", "AgentTeamSaasUsers" }
        };
        IConfiguration configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(inMemorySettings)
            .Build();
        _jwtService = new JwtService(configuration);

        _controller = new SaasAuthController(_db, _jwtService, _appDb);
    }

    [Fact]
    public async Task Register_ShouldCreateUser_And_ReturnToken()
    {
        var req = new RegisterRequest("testuser", "securepassword123");

        var result = await _controller.Register(req);

        var okResult = Assert.IsType<OkObjectResult>(result);
        var authResponse = Assert.IsType<AuthResponse>(okResult.Value);
        Assert.NotNull(authResponse.Token);
        Assert.Equal("testuser", authResponse.User.Username);

        _createdUserIds.Add(authResponse.User.Id);

        var userInDb = await _db.Users.FindAsync(authResponse.User.Id);
        Assert.NotNull(userInDb);
        Assert.Equal("testuser", userInDb.Username);
        Assert.True(BCrypt.Net.BCrypt.Verify("securepassword123", userInDb.PasswordHash));
    }

    [Fact]
    public async Task Register_WithDuplicateUsername_ShouldReturnBadRequest()
    {
        var req1 = new RegisterRequest("dupuser", "password123");
        var res1 = await _controller.Register(req1);
        var okResult = Assert.IsType<OkObjectResult>(res1);
        var authResponse = Assert.IsType<AuthResponse>(okResult.Value);
        _createdUserIds.Add(authResponse.User.Id);

        var req2 = new RegisterRequest("dupuser", "differentpassword");

        var result = await _controller.Register(req2);

        var badResult = Assert.IsType<BadRequestObjectResult>(result);
        Assert.NotNull(badResult.Value);
    }

    [Fact]
    public async Task Login_WithCorrectCredentials_ShouldReturnToken()
    {
        var regReq = new RegisterRequest("loginuser", "correctpassword");
        var regResult = await _controller.Register(regReq);
        var regOk = Assert.IsType<OkObjectResult>(regResult);
        var regAuth = Assert.IsType<AuthResponse>(regOk.Value);
        _createdUserIds.Add(regAuth.User.Id);

        var loginReq = new LoginRequest("loginuser", "correctpassword");

        var result = await _controller.Login(loginReq);

        var okResult = Assert.IsType<OkObjectResult>(result);
        var authResponse = Assert.IsType<AuthResponse>(okResult.Value);
        Assert.NotNull(authResponse.Token);
        Assert.Equal("loginuser", authResponse.User.Username);
    }

    [Fact]
    public async Task Login_WithIncorrectCredentials_ShouldReturnBadRequest()
    {
        var regReq = new RegisterRequest("wrongpassuser", "correctpassword");
        var regResult = await _controller.Register(regReq);
        var regOk = Assert.IsType<OkObjectResult>(regResult);
        var regAuth = Assert.IsType<AuthResponse>(regOk.Value);
        _createdUserIds.Add(regAuth.User.Id);

        var loginReq = new LoginRequest("wrongpassuser", "wrongpassword");

        var result = await _controller.Login(loginReq);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    public void Dispose()
    {
        _db.Dispose();
        _appDb.Dispose();

        foreach (var userId in _createdUserIds)
        {
            try
            {
                var dir = SaasPathHelper.GetUserRoot(userId);
                if (Directory.Exists(dir))
                {
                    Directory.Delete(dir, true);
                }
            }
            catch
            {
            }
        }
    }
}
