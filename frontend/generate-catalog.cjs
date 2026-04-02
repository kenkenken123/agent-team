const fs = require('fs');
const path = require('path');

const furnitureDir = 'd:/学习/AI/agent-team/pixel-agents-main/webview-ui/public/assets/furniture';
const targetFile = 'd:/学习/AI/agent-team/frontend/public/assets/furniture-catalog.json';

function flattenManifest(group, inherited) {
    let assets = [];
    if (group.type === 'asset' || (!group.type && group.id)) {
        assets.push({
            id: group.id,
            name: group.name || inherited.name,
            label: group.label || group.name || inherited.name,
            category: group.category || inherited.category,
            file: group.file || `${group.id}.png`,
            width: group.width || inherited.width,
            height: group.height || inherited.height,
            footprintW: group.footprintW || inherited.footprintW,
            footprintH: group.footprintH || inherited.footprintH,
            isDesk: group.category === 'desks' || inherited.category === 'desks',
            canPlaceOnWalls: group.canPlaceOnWalls || inherited.canPlaceOnWalls,
            canPlaceOnSurfaces: group.canPlaceOnSurfaces || inherited.canPlaceOnSurfaces,
            backgroundTiles: group.backgroundTiles || inherited.backgroundTiles,
            groupId: inherited.groupId,
            orientation: group.orientation || (inherited.rotationScheme ? (group.id.includes('back') ? 'back' : group.id.includes('left') ? 'left' : group.id.includes('right') ? 'right' : 'front') : undefined)
        });
    } else if (group.type === 'group' || group.members) {
        const groupInherited = {
            ...inherited,
            rotationScheme: group.rotationScheme || inherited.rotationScheme,
            category: group.category || inherited.category
        };
        for (const member of group.members) {
            assets = assets.concat(flattenManifest(member, groupInherited));
        }
    }
    return assets;
}

const folders = fs.readdirSync(furnitureDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

const catalog = [];

for (const folder of folders) {
    const manifestPath = path.join(furnitureDir, folder, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const inherited = {
        groupId: manifest.id,
        name: manifest.name,
        category: manifest.category,
        canPlaceOnWalls: manifest.canPlaceOnWalls,
        canPlaceOnSurfaces: manifest.canPlaceOnSurfaces,
        backgroundTiles: manifest.backgroundTiles,
        width: manifest.width,
        height: manifest.height,
        footprintW: manifest.footprintW,
        footprintH: manifest.footprintH
    };

    if (manifest.type === 'asset') {
        catalog.push(...flattenManifest(manifest, inherited));
    } else {
        catalog.push(...flattenManifest(manifest, inherited));
    }
}

fs.writeFileSync(targetFile, JSON.stringify(catalog, null, 2));
console.log(`Generated catalog with ${catalog.length} entries at ${targetFile}`);
