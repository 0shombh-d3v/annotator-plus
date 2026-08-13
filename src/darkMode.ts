export type DarkModePreference = 'follow-obsidian' | 'dark' | 'light';

export const DARK_READER_FIXES = {
    invert: ['.canvasWrapper > canvas'],
    css: `
        .hypothesis-highlight-layer {
            mix-blend-mode: normal !important;
        }

        .hypothesis-highlights-always-on .hypothesis-svg-highlight:not(.is-focused) {
            fill: rgba(180, 120, 0, 0.4) !important;
        }

        .hypothesis-highlights-always-on
            .hypothesis-highlight:not(.is-transparent):not(.hypothesis-highlight-focused) {
            background-color: rgba(180, 120, 0, 0.4) !important;
        }
    `
};

export function shouldUseDarkMode(preference: DarkModePreference, obsidianIsDark: boolean): boolean {
    if (preference === 'dark') return true;
    if (preference === 'light') return false;
    return obsidianIsDark;
}

export function migrateDarkModeSettings(settings: Record<string, unknown>): {
    settings: Record<string, unknown> & { darkMode: DarkModePreference };
    migrated: boolean;
} {
    const currentSettings = { ...settings };
    delete currentSettings.deafultDarkMode;
    const validPreference = ['follow-obsidian', 'dark', 'light'].includes(currentSettings.darkMode as string);
    const darkMode = validPreference ? (currentSettings.darkMode as DarkModePreference) : 'follow-obsidian';

    return {
        settings: { ...currentSettings, darkMode },
        migrated: 'deafultDarkMode' in settings || !validPreference
    };
}
