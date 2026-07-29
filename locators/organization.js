module.exports = {
  breadcrumbContainer: '.mantine-Breadcrumbs-root',
  breadcrumbHome: '.mantine-Anchor-root',
  breadcrumbOrg: '.mantine-Breadcrumbs-breadcrumb',
  searchInputPlaceholder:
    'input[placeholder="Search by name or email"], input[placeholder="Search by name or e-mail"]',
  roleDropdown: 'combobox',
  inviteButton: 'button:has-text("Invite users"), button:has-text("Invite user")',
  tableRoot: 'table.rt-TableRootTable',
  tableRow: 'table tbody tr.rt-TableRow',
  tableHeaders: 'table thead th.rt-TableColumnHeaderCell',
  roleMenu: '.rt-SelectContent[data-state="open"]',
  dialogRoot: '[role="dialog"]',
  dialogEmailInput: 'input[placeholder*="company.com"], input[placeholder="Enter an email address"]',
  dialogRoleSelect: '[role="combobox"]',
  dialogInviteBtn: 'button:has-text("Invite")',
  dialogCancelBtn: 'button:has-text("Cancel")',
  modal: '[role="alertdialog"], [role="dialog"]',
  // MCP-verified live (2026-07-29): the Revoke/Resend confirmation modals are Mantine
  // Modals whose title renders as <h2>, not <h1>.
  modalTitle: 'h2',
  modalConfirmBtn: 'button:has-text("Resend"), button:has-text("Revoke")',
  modalCancelBtn: 'button:has-text("Cancel")',
  userActionsBtn: 'button[title="User actions"]',
  firstRowMenuBtn: 'table tbody tr:first-child button[title="User actions"]',
  menuItemRevoke: 'role=menuitem >> text=Revoke invitation',
  menuItemResend: 'role=menuitem >> text=Resend'
};
