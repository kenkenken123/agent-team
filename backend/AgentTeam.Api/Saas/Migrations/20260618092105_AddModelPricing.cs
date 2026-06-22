using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AgentTeam.Api.Saas.Migrations
{
    /// <inheritdoc />
    public partial class AddModelPricing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ModelPricings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ModelId = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    InputPricePerMillion = table.Column<decimal>(type: "TEXT", nullable: false),
                    OutputPricePerMillion = table.Column<decimal>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ModelPricings", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ModelPricings_ModelId",
                table: "ModelPricings",
                column: "ModelId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ModelPricings");
        }
    }
}
