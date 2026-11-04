# Coverage: review

Docs: `4.usage/5.saving-and-access.md`. Journeys: `journeys/review.mjs`.

| Source | Documented behaviour | Journey | Check / Not driven |
| --- | --- | --- | --- |
| dms-builder/docs/4.usage/5.saving-and-access.md:30 | the change list opens from the status: edits under This page, On save steps, Put this one back, Discard all… | the-change-list-names-the-edits-and-what-save-checks | sections and order of the three steps; revert; discard writes nothing |
| dms-builder/docs/4.usage/5.saving-and-access.md:38 | a stale save writes nothing and offers three actions | a-save-after-an-outside-change-is-refused-with-three-ways-out | banner text and buttons; Keep my version then Save writes the draft; the outside change stays |
| dms-builder/docs/4.usage/5.saving-and-access.md:38 | Copy my draft copies JSON; Reload the page drops the draft | - | Not driven: the clipboard and the reload are not asserted |
| dms-builder/docs/4.usage/5.saving-and-access.md:9 | the draft is kept on the device and offered back with Review and Discard | an-unsaved-draft-is-kept-on-the-device-and-offered-back | the count returns after a reload; Review and Discard shown |
| dms-builder/docs/4.usage/5.saving-and-access.md:9 | seven-day keep and the changed-page confirmation (Put them back) | - | Not driven: the clock cannot be moved |
| dms-builder/docs/4.usage/5.saving-and-access.md:50 | View as hides blocks for a role and exits | view-as-previews-the-page-the-way-a-role-sees-it | Page hidden for; Exit preview |
| dms-builder/docs/4.usage/5.saving-and-access.md:46 | the change list warns about lost access; the inspector says who sees a block | the-layers-tab-lists-every-block-and-selecting-opens-its-settings (editor) | Only the owner sees it; Not driven: the warnings |
