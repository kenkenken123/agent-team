using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AgentTeam.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAgentPinningAndLastUsed : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsPinned",
                table: "Agents",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastUsedAt",
                table: "Agents",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsPinned",
                table: "Agents");

            migrationBuilder.DropColumn(
                name: "LastUsedAt",
                table: "Agents");
        }
    }
}
