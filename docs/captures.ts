/**
 * The screenshots of the builder docs, taken on the Helio demo. The onboarding
 * runs first and creates the administrator every other scene signs in as. Each
 * scene opens a Helio page, then the builder from the page header. No scene
 * saves, so the demo's sources stay as they are. A scene that leaves an unsaved
 * draft works on a page no later scene opens, because the builder keeps drafts
 * in the browser and every scene shares one browser session. No scene signs out.
 */
const OPEN_BUILDER = [
  {
    action: "click",
    selector: 'button[aria-label="Builder — edit this page"]',
  },
  { action: "wait", selector: "[data-path]" },
];

export default [
  {
    id: "onboarding",
    route: "/onboarding?token=helio-capture-setup-token",
    setup: true,
    steps: [
      { action: "fill", selector: 'input[name="name"]', value: "Helio" },
      {
        action: "click",
        selector: 'button:has-text("Continue to administrator")',
      },
      { action: "wait", selector: 'input[name="firstName"]' },
      { action: "fill", selector: 'input[name="firstName"]', value: "Sophie" },
      { action: "fill", selector: 'input[name="lastName"]', value: "Lambert" },
      {
        action: "fill",
        selector: 'input[name="email"]',
        value: "sophie.lambert@helio.be",
      },
      {
        action: "fill",
        selector: 'input[name="password"]',
        value: "HelioDocs2026!",
      },
      {
        action: "click",
        selector: 'button:has-text("Create administrator account")',
      },
      { action: "wait", selector: 'button:has-text("Open the dashboard")' },
      { action: "click", selector: 'button:has-text("Open the dashboard")' },
    ],
  },
  {
    id: "editor-selected",
    route: "/helio/dashboard",
    steps: [
      ...OPEN_BUILDER,
      {
        action: "click",
        selector: '[data-path]:has-text("Revenue invoiced") >> nth=-1',
      },
      { action: "wait", selector: 'text="Card heading."' },
    ],
    output: "packages/dms-builder/docs/images/captures/editor-selected.webp",
  },
  {
    id: "interface-editor-selected",
    route: "/helio/dashboard",
    steps: [
      ...OPEN_BUILDER,
      {
        action: "click",
        selector: '[data-path]:has-text("Revenue invoiced") >> nth=-1',
      },
      { action: "wait", selector: 'text="Card heading."' },
    ],
    output:
      "packages/interface-dms-builder/docs/images/captures/editor-selected.webp",
  },
  {
    id: "editor-layers",
    route: "/helio/dashboard",
    steps: [
      ...OPEN_BUILDER,
      { action: "click", selector: '[role="tab"]:has-text("Layers")' },
    ],
    output: "packages/dms-builder/docs/images/captures/editor-layers.webp",
  },
  {
    id: "editor-pages",
    route: "/helio/dashboard",
    steps: [
      ...OPEN_BUILDER,
      { action: "click", selector: '[role="tab"]:has-text("Pages")' },
      { action: "wait", selector: 'button[aria-label="Delete Invoices"]' },
    ],
    output: "packages/dms-builder/docs/images/captures/editor-pages.webp",
  },
  {
    id: "editor-delete-page",
    route: "/helio/invoices",
    steps: [
      ...OPEN_BUILDER,
      { action: "click", selector: '[role="tab"]:has-text("Pages")' },
      { action: "click", selector: 'button[aria-label="Delete Invoices"]' },
      { action: "wait", selector: 'button:has-text("Delete the page")' },
    ],
    crop: '[role="alertdialog"], [role="dialog"]',
    output: "packages/dms-builder/docs/images/captures/editor-delete-page.webp",
  },
  {
    id: "editor-table",
    route: "/helio/dashboard",
    steps: [
      ...OPEN_BUILDER,
      { action: "click", selector: 'button[aria-label="Tables"]' },
      { action: "click", selector: 'button:has-text("helio/sites")' },
      { action: "wait", selector: 'button:has-text("Add field")' },
    ],
    output: "packages/dms-builder/docs/images/captures/editor-table.webp",
  },
  {
    id: "editor-delete-table",
    route: "/helio/dashboard",
    steps: [
      ...OPEN_BUILDER,
      { action: "click", selector: 'button[aria-label="Tables"]' },
      { action: "click", selector: 'button:has-text("helio/sites")' },
      { action: "click", selector: '[role="tab"]:has-text("Settings")' },
      {
        action: "wait",
        selector: 'button:has-text("Delete the table and its rows")',
      },
    ],
    output:
      "packages/dms-builder/docs/images/captures/editor-delete-table.webp",
  },
  {
    id: "editor-data",
    route: "/helio/monitoring",
    steps: [
      ...OPEN_BUILDER,
      { action: "click", selector: 'button[aria-label="Data"]' },
      { action: "click", selector: 'button[aria-label="New data source"]' },
      {
        action: "fill",
        selector: 'input[placeholder="inStockCount"]',
        value: "ticketCount",
      },
      { action: "click", selector: 'button:has-text("Pick a table")' },
      {
        action: "click",
        selector: '[role="option"]:has-text("helio/tickets")',
      },
      { action: "click", selector: 'button:has-text("Add the source")' },
      { action: "wait", selector: 'text="Read it now"' },
    ],
    output: "packages/dms-builder/docs/images/captures/editor-data.webp",
  },
  {
    id: "editor-changes",
    route: "/helio/invoices",
    steps: [
      ...OPEN_BUILDER,
      { action: "click", selector: 'button[aria-label="Edit page metadata"]' },
      {
        action: "fill",
        selector: "textarea >> nth=0",
        value:
          "Every invoice sent to a Helio customer, with its payments and reminders.",
      },
      { action: "click", selector: 'button:has-text("unsaved change")' },
      { action: "wait", selector: 'button:has-text("Save 1 change")' },
    ],
    output: "packages/dms-builder/docs/images/captures/editor-changes.webp",
  },
];
