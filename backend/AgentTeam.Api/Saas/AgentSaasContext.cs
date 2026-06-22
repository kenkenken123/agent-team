using AgentTeam.Api.Saas.Models;
using Microsoft.EntityFrameworkCore;

namespace AgentTeam.Api.Saas;

public class AgentSaasContext : DbContext
{
    public AgentSaasContext(DbContextOptions<AgentSaasContext> options) : base(options)
    {
    }

    public DbSet<SaasUser> Users { get; set; } = null!;
    public DbSet<ModelPricing> ModelPricings { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<SaasUser>(e =>
        {
            e.HasKey(u => u.Id);
            e.HasIndex(u => u.Username).IsUnique();
            e.Property(u => u.Username).IsRequired().HasMaxLength(100);
            e.Property(u => u.PasswordHash).IsRequired();
        });

        modelBuilder.Entity<ModelPricing>(e =>
        {
            e.HasKey(p => p.Id);
            e.HasIndex(p => p.ModelId).IsUnique();
            e.Property(p => p.ModelId).IsRequired().HasMaxLength(200);
            e.Property(p => p.InputPricePerMillion).HasColumnType("TEXT"); // SQLite decimal
            e.Property(p => p.OutputPricePerMillion).HasColumnType("TEXT");
            e.Property(p => p.CacheInputPricePerMillion).HasColumnType("TEXT");
        });
    }
}

