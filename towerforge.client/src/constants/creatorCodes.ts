// ============================================================
//  TowerForge Companion — Creator Codes
//  The Tower's content creators: the code players enter to support
//  them, their in-game player name and ID, and where to find their
//  content. A creator gets 5% of in-app purchases and 8% of webstore
//  purchases made with their code, at no extra cost to the player;
//  a code stays active for 30 days (wiki: Content Creator Page).
//
//  Sources:
//    - Codes, player names and IDs: the creator list the site owner
//      sent on 2026-10-17. darknyxzz's ID has 15 digits, as given.
//    - YouTube: J Plays' "Tower YouTubers" list on the Tower Knowledge
//      Hub (the-tower.notion.site) and a YouTube channel search, checked
//      2026-10-17. Each channel posts The Tower videos and either names
//      the creator code in its video descriptions (300, Bonzo, crowrocks,
//      ebats, flipstar, Zaerdin) or carries the creator's code or name
//      (EthanDX, Greeny, jamn, JGU, JP978, jplays, Kohyal, Rend).
//    - Discord / Twitch / X: the links the creator's own YouTube channel
//      lists (or, for JGU, its description); Discord invites checked to
//      be live.
//  Only add a link that's confirmed — from the creator, or a page that
//  clearly belongs to them. Profile pictures: scripts/fetch-creator-avatars.mjs.
// ============================================================

export type CreatorSite = 'youtube' | 'twitch' | 'kick' | 'tiktok' | 'discord' | 'reddit' | 'x' | 'website';

// Display names, in the order links are shown.
export const CREATOR_SITES: Record<CreatorSite, string> = {
    youtube: 'YouTube',
    twitch: 'Twitch',
    kick: 'Kick',
    tiktok: 'TikTok',
    discord: 'Discord',
    reddit: 'Reddit',
    x: 'X',
    website: 'Website',
};

export interface Creator {
    code: string;       // what players type in Settings or on the webstore
    player: string;     // in-game player name
    playerId: string;
    links: Partial<Record<CreatorSite, string>>;
}

// File name for a creator's picture: "TheDisasterFish" → thedisasterfish.
export const creatorSlug = (code: string): string =>
    code.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const c = (player: string, code: string, playerId: string, links: Creator['links'] = {}): Creator =>
    ({ code, player, playerId, links });

export const CREATORS: Creator[] = [
    c('1410c', '1410c', '322BA26372C2A288'),
    c('spadace50', '250', '77D417A14B704EE4'),
    c('spartontyler', '300', '40283260A0DE5178', { youtube: 'https://www.youtube.com/@SpartanTheTower' }),
    c('av8er', 'AV8er', 'F3BE4A63BCD60AC3'),
    c('bilinz', 'bilinz', '990A6EEA63FA8AD6'),
    c('bonzo.samm', 'Bonzo', 'BB696E5B4936CA8A', { youtube: 'https://www.youtube.com/@BonzosTower' }),
    c('Crowbarzero', 'crowrocks', 'CBB75D5FE540266E', {
        youtube: 'https://www.youtube.com/@crowbarzero',
        discord: 'https://discord.gg/Fzryrc7',
    }),
    c('cruoton', 'cruoton', 'B7217B63CE2DDF80'),
    c('coreytae', 'CTK', '51C1CB681E0A58B2'),
    c('idadarknezzi', 'darknyxzz', '23EB3A7EA332398'),
    c('Duck 🦆', 'duckirons', '977C5917940B511A'),
    c('ebats', 'ebats', '74C98C2D65825E6A', { youtube: 'https://www.youtube.com/@ebatstower' }),
    c('quietfanta', 'EconSquirrel', '2FB4DB043F9F7B37'),
    c('ethandx', 'EthanDX', '2BD4ADBB9A560204', {
        youtube: 'https://www.youtube.com/@EthanDX',
        discord: 'https://discord.gg/CcDrzPJT3n',
    }),
    c('mrflipstar', 'flipstar', '188EAC641A3EBC7A', { youtube: 'https://www.youtube.com/@MrFlipstar' }),
    c('Greeny', 'Greeny', 'CE2B716E1DEB338C', { youtube: 'https://www.youtube.com/@GreenyTower' }),
    c('h3llxspawnerx', 'H3ll', '7DA5D423F1CF6B75'),
    c('icequasars', 'IceQuasars', 'D9C208F3AC83DA84'),
    c('IceTae', 'icetae', 'B0640853C95F89F2'),
    c('iver_frog', 'Iver', '31B1B27F7AA2FDDD'),
    c('jaido_92', 'Jaido', '91413B0758BC4AE7'),
    c('jamn4evr', 'jamn', '5327C8E2D857695B', { youtube: 'https://www.youtube.com/@jamn4evr' }),
    c('tmrxjd', 'jdevo', '26AD84D6B32DC87B'),
    c('_taggz', 'JGU', '184C7DE105306865', {
        youtube: 'https://www.youtube.com/@taggzJGU',
        discord: 'https://discord.gg/FHejXjWa9Z',
    }),
    c('beyond882001', 'JP978', '8F9EC4F8D06525FC', { youtube: 'https://www.youtube.com/@Jp978gaming' }),
    c('JPlays', 'jplays', 'A714DA83E2F3826A', {
        youtube: 'https://www.youtube.com/@JPlays1',
        twitch: 'https://www.twitch.tv/jplaysone',
        discord: 'https://discord.gg/RxpkyCDTYe',
        website: 'https://the-tower.notion.site',
    }),
    c('kohyal', 'Kohyal', 'B489726B4AD50A72', { youtube: 'https://www.youtube.com/@KohyalStudios' }),
    c('Milamber33', 'Milamber33', '4A98A60A5D9E4E25'),
    c('minionek247', 'minion', 'C5BA98964102874D'),
    c('NanaSeiYuri', 'NanaSeiYuri', 'A0710535553C4FA8'),
    c('kryntos', 'NERD', 'DFD247A4D7729ECF'),
    c('tequilaman007', 'Panda', '55DFD12DDC7BA40B'),
    c('pandu.eth', 'pandu', 'C934EE0BE5BF437B'),
    c('brunos833', 'Professor', '6F319C6C87BF70CA'),
    c('clarotus', 'RacingTower', '7F75E73AE5949CC4'),
    c('dizzyloki', 'Rend', 'AA5E111FDBC3B157', { youtube: 'https://www.youtube.com/@dizzy-project-rend' }),
    c('ronmv', 'ronmv', 'EF06EE8B000DC9EE'),
    c('bisse123', 'SCRIPTLORD', 'B54B2EAF779842C2'),
    c('matteweon', 'sheetlord', 'B9BDCA52E3D8005A'),
    c('Actualize', 'Shion', 'A028C858FDE79076'),
    c('Shuckle', 'shuck', 'F5F0C35DEF5D37A1'),
    c('Skye', 'skye', '3AF60D885181322C'),
    c('thesleek', 'Sleek', '28A79BF856E46363'),
    c('thedisasterfish', 'TheDisasterFish', 'C249A98DEA598A8D'),
    c('VCMomo', 'VCMomo', 'A8E0B1E6AE9CB991'),
    c('zaerdin', 'Zaerdin', '58F51AFB93920119', {
        youtube: 'https://www.youtube.com/@ZaerdinGaming',
        discord: 'https://discord.gg/TCcb5EFRgs',
        x: 'https://x.com/Zaerdin',
    }),
    c('zanny37', 'zanny', '901D5FE2204AD58D'),
    c('insomnia115', 'Zeus', '2F89EA7FCEC47530'),
];

// The official webstore, where a code also counts (8% there).
export const WEBSTORE_URL = 'https://store.techtreegames.com/thetower/';
