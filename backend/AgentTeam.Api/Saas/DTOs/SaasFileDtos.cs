using System;

namespace AgentTeam.Api.Saas.DTOs;

public record SaasFileEntry(string Name, string Type, long? Size, DateTime LastModified, string RelativePath);
public record MkdirRequest(string ParentPath, string Name);
public record DeleteFileRequest(string RelativePath);
public record WriteFileRequest(string RelativePath, string Content);
