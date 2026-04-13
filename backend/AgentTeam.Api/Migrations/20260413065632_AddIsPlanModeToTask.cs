using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AgentTeam.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddIsPlanModeToTask : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsPlanMode",
                table: "Tasks",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsPlanMode",
                table: "Tasks");
        }
    }
}
