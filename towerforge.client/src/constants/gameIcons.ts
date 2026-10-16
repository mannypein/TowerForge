// ============================================================
//  TowerForge Companion — Game Icons
//  Icons from the game, resized to 128px, looked up by name:
//  "Golden Bot" → assets/bots/golden-bot.png. Drop a new PNG named
//  after the bot / module into the folder and it's picked up. Missing
//  icons return null (the UI falls back to a drawn badge).
// ============================================================

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function byName(files: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
        Object.entries(files).map(([path, url]) => [path.split('/').pop()!.replace(/\.png$/, ''), url]),
    );
}

const BOT_ICONS = byName(import.meta.glob('../assets/bots/*.png', { eager: true, import: 'default' }) as Record<string, string>);
const MODULE_ICONS = byName(import.meta.glob('../assets/modules/*.png', { eager: true, import: 'default' }) as Record<string, string>);

export const botIcon = (name: string): string | null => BOT_ICONS[slug(name)] ?? null;
export const moduleIcon = (name: string): string | null => MODULE_ICONS[slug(name)] ?? null;
