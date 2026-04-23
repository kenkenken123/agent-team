using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AgentTeam.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMarkedForDeletionAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "MarkedForDeletionAt",
                table: "Tasks",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MarkedForDeletionAt",
                table: "Tasks");
        }
    }
}
