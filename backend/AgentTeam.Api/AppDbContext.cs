using AgentTeam.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace AgentTeam.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<Agent> Agents { get; set; } = null!;
    public DbSet<AgentGroup> AgentGroups { get; set; } = null!;
    public DbSet<AgentTemplate> AgentTemplates { get; set; } = null!;
    public DbSet<AgentTask> Tasks { get; set; } = null!;
    public DbSet<CommonPath> CommonPaths { get; set; } = null!;
    public DbSet<SystemSetting> SystemSettings { get; set; } = null!;
    public DbSet<IncomingMessage> IncomingMessages { get; set; } = null!;
    public DbSet<CredentialTemplate> CredentialTemplates { get; set; } = null!;
    public DbSet<ModelConfig> ModelConfigs { get; set; } = null!;
    public DbSet<LongTermMemory> Memories { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<AgentTemplate>(e =>
        {
            e.HasKey(t => t.Id);
            e.Property(t => t.Name).IsRequired().HasMaxLength(100);
            e.Property(t => t.SystemPrompt).IsRequired();
            e.HasMany(t => t.Agents).WithOne(a => a.Template).HasForeignKey(a => a.TemplateId);
        });

        modelBuilder.Entity<AgentGroup>(e =>
        {
            e.HasKey(g => g.Id);
            e.Property(g => g.Name).IsRequired().HasMaxLength(100);
            e.HasMany(g => g.Agents).WithOne(a => a.Group).HasForeignKey(a => a.GroupId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Agent>(e =>
        {
            e.HasKey(a => a.Id);
            e.Property(a => a.Name).IsRequired().HasMaxLength(100);
            e.Property(a => a.WorkingDirectory).IsRequired(false);
            e.Property(a => a.AllowedModels).HasDefaultValue("claude-3-7-sonnet-20250219");
            e.HasMany(a => a.Tasks).WithOne(t => t.Agent).HasForeignKey(t => t.AgentId);
        });

        modelBuilder.Entity<CommonPath>(e =>
        {
            e.HasKey(p => p.Id);
            e.Property(p => p.Path).IsRequired();
            e.Property(p => p.Name).IsRequired().HasMaxLength(100);
        });

        modelBuilder.Entity<AgentTask>(e =>
        {
            e.HasKey(t => t.Id);
            e.Property(t => t.Status).HasConversion<string>();
        });

        modelBuilder.Entity<SystemSetting>(e =>
        {
            e.HasKey(s => s.Key);
            e.Property(s => s.Value).IsRequired();
        });

        modelBuilder.Entity<IncomingMessage>(e =>
        {
            e.HasKey(m => m.Id);
            e.Property(m => m.Status).HasConversion<string>();
        });

        modelBuilder.Entity<CredentialTemplate>(e =>
        {
            e.HasKey(t => t.Id);
            e.Property(t => t.Name).IsRequired().HasMaxLength(100);
        });

        modelBuilder.Entity<ModelConfig>(e =>
        {
            e.HasKey(c => c.Id);
            e.Property(c => c.ModelId).IsRequired().HasMaxLength(100);
            e.HasOne(c => c.Template).WithMany().HasForeignKey(c => c.TemplateId);
        });
    }
}
