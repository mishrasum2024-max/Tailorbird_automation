# AI Failure Investigation Context

## Test

Test Case: UNKNOWN_TEST

Test File: Unable to determine

Result Directory:

test-results/TC04_properties-PROPERTY-T-a2f06-ab-Property-Documents-grid--chromium


## Failure Evidence

Error Context:

test-results/TC04_properties-PROPERTY-T-a2f06-ab-Property-Documents-grid--chromium/error-context.md

Screenshots:

- test-results/TC04_properties-PROPERTY-T-a2f06-ab-Property-Documents-grid--chromium/test-failed-1.png

Traces:

- test-results/TC04_properties-PROPERTY-T-a2f06-ab-Property-Documents-grid--chromium/trace.zip

Videos:

None


## Git Information

Branch:

main

Commit:

d1e024fbecdb20d3e99bf59481d1a93fda1e3aa6


### Repository Status

```
M committed_ui_snapshots/TC14_manageVendor.spec.js/tc14-v-directory-page.png
 M committed_ui_snapshots/TC14_manageVendor.spec.js/tc14-v-filter-panel-open.png
 M committed_ui_snapshots/TC14_manageVendor.spec.js/tc14-v-invite-dialog-empty.png
 M committed_ui_snapshots/TC14_manageVendor.spec.js/tc14-v-manage-columns-drawer.png
 M committed_ui_snapshots/TC14_manageVendor.spec.js/tc14-v-vendor-detail-activity.png
 M committed_ui_snapshots/TC14_manageVendor.spec.js/tc14-v-vendor-detail-overview.png
 M data/approverRolesAndUsers.json
 M data/bidData.json
 M data/drawReportingPropertyData.json
 M data/fgaCreatedUsers.json
 M data/multiApproverInvoices.json
 M data/multiYearBudgetPropertyData.json
 M downloads/file_upload-data.csv
 M downloads/property-data.csv
 M downloads/property.json
 M package-lock.json
 M package.json
 M tests/TC01_login.spec.js
 M tests/TC04_properties.spec.js
?? .claude/
?? .mcp.json
?? .playwright-mcp/
?? All_TestCases_Documentation.csv
?? Menu_coverage.xlsx
?? MultiYearBudget_Coverage_Report.md
?? TC03_Test_Coverage_Detailed_Report.md
?? TC03_Test_Coverage_Summary.csv
?? TC03_test_assertions.md
?? TC04_Assertions_Report.md
?? TC05_Project_Test_Coverage.md
?? TC06_Assertion_Coverage.md
?? ai-agent/
?? all-approvals-response.json
?? data/lastCreatedJob.json
?? data/oooChainData.json
?? data/projectData.json
?? data/propertyData.json
?? downloads/budget-data.csv
?? downloads/category-data.csv
?? downloads/drawReportingControlsSnapshot.json
?? downloads/drawReportingExistingPropertySnapshot.json
?? downloads/drawReportingUiSnapshot.json
?? downloads/interior_paint_bid.xlsx
?? downloads/interior_paint_bid_book.xlsx
?? downloads/invoice-data.csv
?? downloads/jobs-export.csv
?? downloads/multi_year_budget_detail-data.csv
?? downloads/myb_invalid_upload_1786436739998.csv
?? downloads/myb_invalid_upload_1786437718213.csv
?? downloads/myb_invalid_upload_1786442437538.csv
?? downloads/myb_invalid_upload_1786444017674.csv
?? downloads/myb_invalid_upload_1786445102503.csv
?? downloads/myb_invalid_upload_1786446262542.csv
?? downloads/myb_invalid_upload_1786514528064.csv
?? downloads/myb_invalid_upload_1786515795681.csv
?? downloads/organization-data.csv
?? downloads/property_exterior_takeoff-data.csv
?? downloads/property_interior_takeoff-data.csv
?? downloads/site-data.csv
?? downloads/table.csv
?? downloads/tc410_valid_new_item_upload_1786436770857.csv
?? downloads/tc410_valid_new_item_upload_1786437747546.csv
?? downloads/tc410_valid_new_item_upload_1786442468078.csv
?? downloads/tc410_valid_new_item_upload_1786444048928.csv
?? downloads/tc410_valid_new_item_upload_1786445130936.csv
?? downloads/tc410_valid_new_item_upload_1786446293616.csv
?? downloads/tc410_valid_new_item_upload_1786514561730.csv
?? downloads/tc410_valid_new_item_upload_1786515836341.csv
?? "files/Misora_Bid_Leveling_Reference_with data(Aggregate Summary).csv"
?? mvb-health-green-check.png
?? mvb-health-positive-variance.png
?? mvb-health-yellow-check.png
?? mvb-health-zero-variance.png
?? mvb-initial-table.png
?? scripts/notion-agent.js
?? scripts/notion-client.js
?? scripts/notion-feature-parser.js
?? scripts/slack-agent-step1.js
?? scripts/slack-agent.js
?? tc10_column_fix_run.log
?? tc10_remaining_run1.log
?? tc168_run.log
?? tc168_run2.log
?? tc205_run.log
?? tc244_run.txt
?? tc244_run1.txt
?? tc244_run2.txt
?? tc273_solo_run.log
?? tc273_solo_run2.log
?? tc273_tc272_run.log
?? tc355_run.log
?? tc360_run1.log
?? tc372_run.log
?? tc372_run2.log
?? tc372_run3.log
?? tc372_run4.log
?? tc372_run5.log
?? tests/multi_approver_happy_path.md
?? tests/retainage_happy_path_pr978.md
?? vendor_headed_run1.log
?? vendor_headed_run2.log
?? vendor_headless_run1.log
?? vendor_headless_run2.log
```


### Recent Commits

```
d1e024f | sumitmishra1712 | 2026-08-19 11:54:55 +0530 | fixes to test ai agent
eaf83cd | sumitmishra1712 | 2026-08-18 22:58:24 +0530 |  final push
0f4f6b7 | sumitmishra1712 | 2026-08-18 18:08:17 +0530 | fixes
a7d9af0 | sumitmishra1712 | 2026-08-18 11:10:25 +0530 | full regression run
a4a8e0e | sumitmishra1712 | 2026-08-14 17:15:21 +0530 |  final fixes
```


### Most Recent Commit Changes

```
.github/workflows/playwright.yml | 14 +++++++++++---
 1 file changed, 11 insertions(+), 3 deletions(-)
```


## Playwright Error Context

```text
# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - region "Notifications alt+T"
  - generic [ref=e4]:
    - navigation [ref=e5]:
      - generic [ref=e7]:
        - generic [ref=e8]:
          - img "Tailorbird Logo" [ref=e9]
          - button "Unpin sidebar" [ref=e10] [cursor=pointer]:
            - img [ref=e11]
        - generic [ref=e16]:
          - generic [ref=e17] [cursor=pointer]:
            - img [ref=e19]
            - generic [ref=e23]: Properties
          - generic [ref=e24] [cursor=pointer]:
            - img [ref=e26]
            - generic [ref=e29]: Approvals
          - generic [ref=e30] [cursor=pointer]:
            - generic [ref=e31]: Construction Management
            - img [ref=e33]
          - generic [ref=e36]:
            - generic [ref=e37] [cursor=pointer]:
              - img [ref=e39]
              - generic [ref=e42]: Projects
            - generic [ref=e43] [cursor=pointer]:
              - img [ref=e45]
              - generic [ref=e48]: Jobs (Contracts & POs)
            - generic [ref=e49] [cursor=pointer]:
              - img [ref=e51]
              - generic [ref=e54]: Bids
            - generic [ref=e55] [cursor=pointer]:
              - img [ref=e57]
              - generic [ref=e60]: Change Orders
            - generic [ref=e61] [cursor=pointer]:
              - img [ref=e63]
              - generic [ref=e66]: Invoices
          - generic [ref=e67] [cursor=pointer]:
            - img [ref=e69]
            - generic [ref=e72]: More
            - img [ref=e74]
      - link "Get Help" [ref=e77] [cursor=pointer]:
        - /url: "#"
        - img [ref=e78]
        - paragraph [ref=e81]: Get Help
      - generic [ref=e82]:
        - separator [ref=e83]
        - generic [ref=e84] [cursor=pointer]:
          - generic [ref=e86]: S
          - generic [ref=e87]:
            - paragraph [ref=e88]: Sumit Harsh
            - paragraph [ref=e89]: summit.harsha@tailorbird.us
    - main [ref=e91]:
      - generic [ref=e92]:
        - generic [ref=e96]:
          - link "Home" [ref=e97] [cursor=pointer]:
            - /url: /
            - paragraph [ref=e98]: Home
          - generic [ref=e99]: /
          - link "Properties" [ref=e100] [cursor=pointer]:
            - /url: /properties
            - paragraph [ref=e101]: Properties
          - generic [ref=e102]: /
          - button "Test Property 1_Cottages on Elm" [ref=e104] [cursor=pointer]:
            - generic [ref=e105]:
              - paragraph [ref=e107]: Test Property 1_Cottages on Elm
              - img [ref=e109]
        - generic [ref=e112]:
          - generic [ref=e113]:
            - tablist [ref=e114]:
              - tab "Overview" [selected] [ref=e115] [cursor=pointer]:
                - img [ref=e117]
                - generic [ref=e120]: Overview
              - tab "Asset Viewer" [ref=e121] [cursor=pointer]:
                - img [ref=e123]
                - generic [ref=e126]: Asset Viewer
              - tab "Takeoffs" [ref=e127] [cursor=pointer]:
                - img [ref=e129]
                - generic [ref=e133]: Takeoffs
              - tab "Locations" [ref=e134] [cursor=pointer]:
                - img [ref=e136]
                - generic [ref=e138]: Locations
            - button "CM Fee Configuration" [ref=e141] [cursor=pointer]:
              - generic [ref=e142]:
                - img [ref=e144]
                - generic [ref=e147]: CM Fee Configuration
          - tabpanel "Overview" [ref=e150]:
            - generic [ref=e152]:
              - generic [ref=e157]:
                - generic [ref=e158]:
                  - paragraph [ref=e159]: Ownership Group
                  - paragraph [ref=e160]: QA Automations Org_2026
                - generic [ref=e161]:
                  - paragraph [ref=e162]: Property Name
                  - paragraph [ref=e163]: Test Property 1_Cottages on Elm
                - generic [ref=e164]:
                  - paragraph [ref=e165]: Property Type
                  - paragraph [ref=e166]: Garden Style
                - generic [ref=e167]:
                  - paragraph [ref=e168]: Address
                  - paragraph [ref=e169]: 1000a Elm Street
                - generic [ref=e170]:
                  - paragraph [ref=e171]: City
                  - paragraph [ref=e172]: Fayetteville
                - generic [ref=e173]:
                  - paragraph [ref=e174]: State
                  - paragraph [ref=e175]: NC
                - generic [ref=e176]:
                  - paragraph [ref=e177]: Zip Code
                  - paragraph [ref=e178]: "28303"
                - generic [ref=e179]:
                  - paragraph [ref=e180]: Unit Count
                  - paragraph [ref=e181]: "274"
                - generic [ref=e182]:
                  - paragraph [ref=e183]: Projects
                  - paragraph [ref=e184]:
                    - button "2" [ref=e185] [cursor=pointer]
                - generic [ref=e186]:
                  - paragraph [ref=e187]: Jobs
                  - paragraph [ref=e188]:
                    - button "2" [ref=e189] [cursor=pointer]
                - button "Edit" [ref=e191] [cursor=pointer]:
                  - generic [ref=e192]:
                    - img [ref=e194]
                    - generic [ref=e197]: Edit
              - generic [ref=e198]:
                - generic [ref=e199]:
                  - paragraph [ref=e200]: Property Documents
                  - button "Upload Files" [ref=e202] [cursor=pointer]:
                    - generic [ref=e203]:
                      - img [ref=e205]
                      - generic [ref=e208]: Upload Files
                - paragraph [ref=e209]: Files and images related to this property
                - generic [ref=e212]:
                  - generic [ref=e214]:
                    - generic [ref=e218]:
                      - img [ref=e220]
                      - textbox "Search..." [ref=e223]
                    - generic [ref=e226]:
                      - button "View" [ref=e228] [cursor=pointer]:
                        - generic [ref=e229]:
                          - img [ref=e231]
                          - generic [ref=e233]: View
                          - img [ref=e235]
                      - button "Table" [ref=e237] [cursor=pointer]:
                        - generic [ref=e238]:
                          - img [ref=e240]
                          - generic [ref=e242]: Table
                          - img [ref=e244]
                      - button "Export" [ref=e246] [cursor=pointer]:
                        - generic [ref=e247]:
                          - img [ref=e249]
                          - generic [ref=e252]: Export
                  - treegrid [ref=e257]:
                    - generic [ref=e259]:
                      - generic [ref=e261]:
                        - generic [ref=e264]:
                          - columnheader "Cover" [ref=e265] [cursor=pointer]:
                            - generic [ref=e267]:
                              - generic [ref=e268]: Cover
                              - img [ref=e270]
                              - generic:
                                - button:
                                  - img
                                - button:
                                  - img
                                - button:
                                  - img
                          - columnheader "File Name" [ref=e273] [cursor=pointer]:
                            - generic [ref=e275]:
                              - generic [ref=e276]: File Name
                              - img [ref=e278]
                              - generic:
                                - button:
                                  - img
                                - button:
                                  - img
                                - button:
                                  - img
                        - row "budget_data.csv" [ref=e285]:
                          - gridcell [ref=e286]:
                            - img [ref=e291] [cursor=pointer]
                          - gridcell "budget_data.csv" [ref=e294]:
                            - generic "budget_data.csv" [ref=e296]
                      - generic [ref=e299]:
                        - generic [ref=e302]:
                          - columnheader "Property" [ref=e303] [cursor=pointer]:
                            - generic [ref=e305]:
                              - generic [ref=e306]: Property
                              - generic:
                                - button:
                                  - img
                                - button:
                                  - img
                                - button:
                                  - img
                          - columnheader "Description" [ref=e308] [cursor=pointer]:
                            - generic [ref=e310]:
                              - generic [ref=e311]: Description
                              - generic:
                                - button:
                                  - img
                                - button:
                                  - img
                                - button:
                                  - img
                          - columnheader "Type" [ref=e313] [cursor=pointer]:
                            - generic [ref=e315]:
                              - generic [ref=e316]: Type
                              - generic:
                                - button:
                                  - img
                                - button:
                                  - img
                                - button:
                                  - img
                          - columnheader "Size" [ref=e318] [cursor=pointer]:
                            - generic [ref=e320]:
                              - generic [ref=e321]: Size
                              - generic:
                                - button:
                                  - img
                                - button:
                                  - img
                                - button:
                                  - img
                          - columnheader "Source" [ref=e323] [cursor=pointer]:
                            - generic [ref=e325]:
                              - generic [ref=e326]: Source
                              - generic:
                                - button:
                                  - img
                                - button:
                                  - img
                                - button:
                                  - img
                          - columnheader "Tags" [ref=e328] [cursor=pointer]:
                            - generic [ref=e330]:
                              - generic [ref=e331]: Tags
                              - generic:
                                - button:
                                  - img
                                - button:
                                  - img
                                - button:
                                  - img
                          - columnheader "Uploaded Date" [ref=e333] [cursor=pointer]:
                            - generic [ref=e335]:
                              - generic [ref=e336]: Uploaded Date
                              - generic:
                                - button:
                                  - img
                                - button:
                                  - img
                                - button:
                                  - img
                          - columnheader "Random Name" [ref=e338] [cursor=pointer]:
                            - generic [ref=e340]:
                              - generic [ref=e341]: Random Name
                              - generic:
                                - button:
                                  - img
                                - button:
                                  - img
                                - button:
                                  - img
                          - columnheader "User1786937880806" [ref=e343] [cursor=pointer]:
                            - generic [ref=e345]:
                              - generic [ref=e346]: User1786937880806
                              - generic:
                                - button:
                                  - img
                                - button:
                                  - img
                                - button:
                                  - img
                        - row "Test Property 1_Cottages on Elm — — 1.1 KB local — 06/02/2026 — —" [ref=e352]:
                          - gridcell "Test Property 1_Cottages on Elm" [ref=e353]:
                            - generic [ref=e355]: Test Property 1_Cottages on Elm
                          - gridcell "—" [ref=e356]:
                            - generic [ref=e358]: —
                          - gridcell "—" [ref=e359]:
                            - generic [ref=e360]: —
                          - gridcell "1.1 KB" [ref=e361]:
                            - generic "1.1 KB" [ref=e363]
                          - gridcell "local" [ref=e364]:
                            - generic "local" [ref=e366]
                          - gridcell "—" [ref=e367]:
                            - generic [ref=e369]: —
                          - gridcell "06/02/2026" [ref=e370]:
                            - generic [ref=e371]: 06/02/2026
                          - gridcell "—" [ref=e372]:
                            - generic [ref=e373]: —
                          - gridcell "—" [ref=e374]:
                            - generic [ref=e376]: —
                      - generic [ref=e379]:
                        - columnheader "Actions" [ref=e383]:
                          - generic [ref=e386]: Actions
                        - row "Download File Delete File" [ref=e392]:
                          - gridcell "Download File Delete File" [ref=e393]:
                            - generic [ref=e396]:
                              - button "Download File" [ref=e397] [cursor=pointer]:
                                - img [ref=e399]
                              - button "Delete File" [ref=e403] [cursor=pointer]:
                                - img [ref=e406]
                - generic:
                  - generic:
                    - generic:
                      - img
  - alert [ref=e414]: Tailorbird | Properties | Test Property 1_Cottages on Elm
```
```


## Failed Test Source

```javascript
Test source could not be automatically identified.
```


---

IMPORTANT:

This file contains investigation evidence only.

No root-cause classification has been performed.

Claude must analyze this evidence and verify the suspected root cause using Playwright MCP before any self-healing change is attempted.
