using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AgentTeam.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddUsePlatformConfigToTask : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "UsePlatformConfig",
                table: "Tasks",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "UsePlatformConfig",
                table: "Tasks");
        }
    }
}
