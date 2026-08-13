import { DARK_READER_FIXES, migrateDarkModeSettings, shouldUseDarkMode } from '../src/darkMode';

describe('dark mode', () => {
    test.each([
        ['follow-obsidian', true, true],
        ['follow-obsidian', false, false],
        ['dark', false, true],
        ['light', true, false]
    ] as const)('%s with Obsidian dark=%s resolves to %s', (preference, obsidianIsDark, expected) => {
        expect(shouldUseDarkMode(preference, obsidianIsDark)).toBe(expected);
    });

    test.each([true, false])('migrates legacy dark mode %s to Follow Obsidian', legacyValue => {
        expect(migrateDarkModeSettings({ deafultDarkMode: legacyValue, customDefaultPath: 'PDFs' })).toEqual({
            settings: { darkMode: 'follow-obsidian', customDefaultPath: 'PDFs' },
            migrated: true
        });
    });

    test('preserves a valid appearance preference', () => {
        expect(migrateDarkModeSettings({ darkMode: 'light' })).toEqual({
            settings: { darkMode: 'light' },
            migrated: false
        });
    });

    test('keeps the highlight layer outside the PDF canvas inversion', () => {
        expect(DARK_READER_FIXES.invert).toEqual(['.canvasWrapper > canvas']);
        expect(DARK_READER_FIXES.css).toContain('mix-blend-mode: normal');
        expect(DARK_READER_FIXES.css).toContain('.hypothesis-svg-highlight:not(.is-focused)');
        expect(DARK_READER_FIXES.css).toContain(
            '.hypothesis-highlight:not(.is-transparent):not(.hypothesis-highlight-focused)'
        );
        expect(DARK_READER_FIXES.css).toContain('rgba(180, 120, 0, 0.4)');
    });
});
