/**
 * @param {import('@playwright/test').Page} page
 */
function loginElementStrategies(page) {
  return {
    emailInput: [
      { name: 'css:input[name=email],input[type=email]', locator: page.locator('input[name="email"], input[type="email"]') },
      { name: 'role:textbox[name=Email]', locator: page.getByRole('textbox', { name: 'Email' }) },
      { name: 'placeholder:Your email address', locator: page.getByPlaceholder('Your email address') },
      { name: 'css:input[autocomplete=email]', locator: page.locator('input[autocomplete="email"]') },
    ],
    passwordInput: [
      { name: 'css:input[name=password],input[type=password]', locator: page.locator('input[name="password"], input[type="password"]') },
      { name: 'label:Password', locator: page.getByLabel('Password') },
      { name: 'placeholder:Your password', locator: page.getByPlaceholder('Your password') },
      { name: 'css:input[autocomplete=current-password]', locator: page.locator('input[autocomplete="current-password"]') },
    ],
    continueButton: [
      { name: 'css:button[type=submit]:has-text(Continue)', locator: page.locator('button[type="submit"]:has-text("Continue")') },
      { name: 'role:button[name=Continue]', locator: page.getByRole('button', { name: 'Continue' }) },
      { name: 'css:[data-hak-cta]', locator: page.locator('[data-hak-cta]') },
      { name: 'css:.ak-PrimaryButton', locator: page.locator('.ak-PrimaryButton') },
    ],
    signInButton: [
      { name: 'css:button[name=intent]:has-text(Sign in)', locator: page.locator('button[name="intent"]:has-text("Sign in")') },
      { name: 'role:button[name=Sign in]', locator: page.getByRole('button', { name: 'Sign in' }) },
      { name: 'css:[data-hak-cta]', locator: page.locator('[data-hak-cta]') },
      { name: 'css:.ak-PrimaryButton', locator: page.locator('.ak-PrimaryButton') },
    ],
    organizationSelect: [
      { name: 'scoped:.ak-OrgSelection>role:button[name=QA Automations Org_2026]', locator: page.locator('.ak-OrgSelection').getByRole('button', { name: 'QA Automations Org_2026' }) },
      { name: 'role:button[name=QA Automations Org_2026]', locator: page.getByRole('button', { name: 'QA Automations Org_2026' }) },
      { name: 'css:button[value=org_01KT25WVGR8WYABP3EVYSZZ7QG]', locator: page.locator('button[value="org_01KT25WVGR8WYABP3EVYSZZ7QG"]') },
    ],
    errorMessage: [
      { name: 'css:.error,.form-error,[role=alert]', locator: page.locator('.error, .form-error, [role="alert"]') },
      { name: 'role:alert', locator: page.getByRole('alert') },
     
      { name: 'css:.ak-ErrorMessage', locator: page.locator('.ak-ErrorMessage') },
      { name: 'css:[data-invalid=true] .ak-ErrorMessage', locator: page.locator('[data-invalid="true"] .ak-ErrorMessage') },
    ],
  };
}

module.exports = { loginElementStrategies };
