// locators.js
const locators = {
    appShellNavbar: '.mantine-AppShell-navbar',
    mainNavbarHeaderToggle:
        '.mantine-AppShell-navbar button[aria-label="Pin sidebar"], .mantine-AppShell-navbar button[aria-label="Unpin sidebar"]',
    leftPanelLabels: 'nav a.mantine-NavLink-root .mantine-NavLink-label, nav a.mantine-NavLink-root',
    leftPanelItem: (label) => `nav a.mantine-NavLink-root:has-text("${label}"), nav a:has-text("${label}")`,
    collapseContainer: 'xpath=following-sibling::div[contains(@class,"mantine-NavLink-collapse")][1]',
    subOptions: 'a.mantine-NavLink-root',
    firstLeftPanelToggle: 'nav a.mantine-NavLink-root',
    profileButton: 'button[aria-label="Profile"]',
    profileMenuOptions: 'div.mantine-Menu-dropdown button[role="menuitem"] div.mantine-Menu-itemLabel'
};

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} parentLocator
 * @param {string} label
 */
function collapseContainerStrategies(page, parentLocator, label) {
    return [
        { name: 'xpath:following-sibling(original)', locator: parentLocator.locator(locators.collapseContainer) },
        { name: 'css:a[hasText]+div.mantine-NavLink-collapse', locator: page.locator(`nav a.mantine-NavLink-root:has-text("${label}") + div.mantine-NavLink-collapse`) },
        { name: 'css:a[hasText]~div.mantine-NavLink-collapse[first]', locator: page.locator(`nav a.mantine-NavLink-root:has-text("${label}") ~ div.mantine-NavLink-collapse`).first() },
    ];
}

/**
 * @param {import('@playwright/test').Page} page
 */
function profileTriggerStrategies(page) {
    return [
        { name: 'css:[class*=Avatar-root](original)', locator: page.locator('nav').locator('[class*="Avatar-root"]').first() },
        { name: 'css:nav div[aria-haspopup=menu]>>[class*=Avatar-root]', locator: page.locator('nav div[aria-haspopup="menu"] [class*="Avatar-root"]').first() },
    ];
}

module.exports = { ...locators, collapseContainerStrategies, profileTriggerStrategies };
