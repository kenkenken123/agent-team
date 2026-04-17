using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AgentTeam.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAgentGroups : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "GroupId",
                table: "Agents",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AgentGroups",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "TEXT", nullable: true),
                    Color = table.Column<string>(type: "TEXT", nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AgentGroups", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Agents_GroupId",
                table: "Agents",
                column: "GroupId");

            migrationBuilder.AddForeignKey(
                name: "FK_Agents_AgentGroups_GroupId",
                table: "Agents",
                column: "GroupId",
                principalTable: "AgentGroups",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Agents_AgentGroups_GroupId",
                table: "Agents");

            migrationBuilder.DropTable(
                name: "AgentGroups");

            migrationBuilder.DropIndex(
                name: "IX_Agents_GroupId",
                table: "Agents");

            migrationBuilder.DropColumn(
                name: "GroupId",
                table: "Agents");
        }
    }
}
