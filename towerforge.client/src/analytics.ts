// ============================================================
//  TowerForge Companion — Analytics
//  Cookieless visit and event counts with Umami, self-hosted on
//  the TowerForge server (towerforge.net/analytics). The tracker
//  tag in index.html only reports from towerforge.net, so local
//  dev and previews send nothing. No personal data is sent.
//
//  Tabs aren't separate URLs, so switching to a tab is reported as
//  a page view of "/<tab>" — the dashboard's Pages list then shows
//  which tabs people use.
// ============================================================

type Props = Record<string, unknown>;

interface Umami {
    track(payload?: (props: Props) => Props): void;
    track(event: string, data?: Record<string, string | number>): void;
}

const umami = (): Umami | undefined => (window as unknown as { umami?: Umami }).umami;

export function trackTabView(tab: string): void {
    umami()?.track(props => ({ ...props, url: `/${tab}`, title: `TowerForge — ${tab}` }));
}

export function trackEvent(name: string, data?: Record<string, string | number>): void {
    umami()?.track(name, data);
}
