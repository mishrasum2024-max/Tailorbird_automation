/**
 * End-to-end orchestration: property → budget revision (TC31 path) → project → job (TC37 subset) → TC47_NEW_UI finalize.
 * Calls `ProjectJob.runTc47NewUiContractFinalize` (same path as TC47_NEW_UI).
 */
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { ProjectPage } = require('../pages/projectPage');
const { ProjectJob } = require('../pages/projectJob');
const { BudgetJob } = require('../pages/budgetPage');
const PropertiesHelper = require('../pages/properties');
const { Logger } = require('../utils/logger');

test.use({
    storageState: 'sessionState.json',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
});

const PROPERTY_TYPES = ['Garden Style', 'Mid Rise', 'High Rise', 'Military Housing'];

test.describe('Finalize bid / contract — full UI chain', () => {
    test('TC258 @regression @contract @finalizeBidUi @property @projectAndJob : Property → budget → project → job → contract row finalize', async ({
        page,
    }) => {
        /** Long single journey; default 30s is insufficient. */
        test.setTimeout(900000);

        const projectPage = new ProjectPage(page);
        const projectJob = new ProjectJob(page);
        const budgetJob = new BudgetJob(page);
        const prop = new PropertiesHelper(page);

        const propertyName = `e2e_prop_${Date.now()}`;
        const address = 'Domestic Terminal, College Park, GA 30337, USA';
        const city = 'College Park';
        const state = 'GA';
        const zip = '30337';
        const propertyType = PROPERTY_TYPES[Math.floor(Math.random() * PROPERTY_TYPES.length)];

        await page.goto(process.env.DASHBOARD_URL, { waitUntil: 'load' });
        await expect(page).toHaveURL(process.env.DASHBOARD_URL);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);

        Logger.step('TC258: Create property + persist propertyData (TC14 core)');
        await prop.goToProperties();
        await prop.createProperty(propertyName, address, city, state, zip, propertyType);

        const propertyPayload = { propertyName };
        const propertyDataPath = path.join(__dirname, '../data/propertyData.json');
        const downloadsPropertyPath = path.join(process.cwd(), 'downloads', 'property.json');
        fs.mkdirSync(path.dirname(propertyDataPath), { recursive: true });
        fs.mkdirSync(path.dirname(downloadsPropertyPath), { recursive: true });
        fs.writeFileSync(propertyDataPath, JSON.stringify(propertyPayload, null, 2));
        fs.writeFileSync(downloadsPropertyPath, JSON.stringify(propertyPayload, null, 2));

        Logger.step('TC258: Budget revision + create project (TC31)');
        const budgetDataPath = path.resolve(process.cwd(), 'files', 'budget_data.csv');
        expect(fs.existsSync(budgetDataPath), 'files/budget_data.csv must exist').toBeTruthy();

        await page.waitForTimeout(4000);

        await budgetJob.navigateToBudget();
        await budgetJob.waitForPageLoad();

        const propertySelected = await budgetJob.selectPropertyByName(propertyName);
        expect(propertySelected, `Budget dropdown must list "${propertyName}"`).toBeTruthy();

        await budgetJob.openRevisionEditor();
        await budgetJob.uploadFileInRevision(budgetDataPath);
        await budgetJob.ensureSubmitEnabledAfterUpload();
        await budgetJob.clickSubmitForApproval();
        await page.waitForTimeout(8000); // extra time for backend to index budget categories before navigating away
        await expect(page).toHaveURL(/financials\/budget|budget-revision/i, { timeout: 15000 });

        await page.goto(process.env.DASHBOARD_URL, { waitUntil: 'load' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000);

        await projectPage.navigateToProjects();
        await projectPage.openCreateProjectModal();
        const startDate = await projectPage.getStartDate();
        const endDate = await projectPage.getEndDate();
        const budgetAmount = projectPage.generateRandomBudget(400000, 1000000);

        await projectPage.fillProjectDetails({
            name: 'Automation Test Project',
            description: 'Created via Playwright automation',
            startDate,
            endDate,
            budget: budgetAmount,
        });

        const projectDataPath = path.join(__dirname, '../data/projectData.json');
        const projectData = JSON.parse(fs.readFileSync(projectDataPath, 'utf8'));

        Logger.step('TC258: Add job + contract overview edit + lastCreatedJob (TC37 trimmed)');
        await projectPage.navigateToProjects();
        await projectPage.openProject(projectData.projectName);
        await projectJob.navigateToJobsTab();

        await projectPage.openCreateJobModal();

        const today = new Date();
        const jobEnd = new Date(today);
        jobEnd.setFullYear(today.getFullYear() + 1);
        const randomSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const jobTitle = `Mall in Noida_${randomSuffix}`;
        const estimatedBudget = Math.floor(Math.random() * (10000 - 3000 + 1)) + 3000;

        await projectPage.fillJobForm({
            title: jobTitle,
            jobType: 'Capex',
            financialType: 'Contract',
            vendor: 'Sumit_Corp',
            description: 'Job created via automation',
            estimatedBudget,
            startDate: projectPage.formatDate(today),
            endDate: projectPage.formatDate(jobEnd),
            selectBudgetCategory: true,
        });

        const selectedCategory = projectPage.selectedBudgetCategory;
        if (selectedCategory) {
            expect(selectedCategory.length).toBeGreaterThan(0);
        }

        await projectPage.submitJob();

        await prop.validateJobDetails({
            'Job Name': jobTitle,
            'Job Type': 'Capex',
            'Financial Type': 'Contract',
            Description: 'Job created via automation',
        });

        const contractEstimatedBudget = Math.floor(Math.random() * (10000 - 1000 + 1)) + 1000;
        await projectPage.openContractsTab();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(5000);

        const editContractBtn = page.getByRole('button', { name: /^Edit$/i }).first();
        await expect(editContractBtn).toBeVisible({ timeout: 15000 });
        await editContractBtn.click({ force: true });
        await page.waitForTimeout(2000);

        const editContractDialog = page.getByRole('dialog').filter({ hasText: /Edit Contract Overview/i }).first();
        await expect(editContractDialog).toBeVisible({ timeout: 15000 });

        const estimatedTotalCostInput = editContractDialog
            .getByRole('textbox', { name: /Estimated total cost/i })
            .or(editContractDialog.getByLabel(/Estimated total cost/i))
            .first();
        await expect(estimatedTotalCostInput).toBeVisible({ timeout: 10000 });
        await estimatedTotalCostInput.click({ force: true });
        await estimatedTotalCostInput.press('Control+A');
        await estimatedTotalCostInput.press('Backspace');
        await estimatedTotalCostInput.fill(String(contractEstimatedBudget));
        await estimatedTotalCostInput.press('Tab');

        const saveChangesBtn = editContractDialog.getByRole('button', { name: /Save Changes|Save/i }).first();
        await expect(saveChangesBtn).toBeVisible({ timeout: 10000 });
        await expect(saveChangesBtn).toBeEnabled({ timeout: 10000 });
        await saveChangesBtn.click();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(5000);

        const lastCreatedJobPath = path.join(__dirname, '../data/lastCreatedJob.json');
        fs.writeFileSync(
            lastCreatedJobPath,
            JSON.stringify(
                {
                    jobName: jobTitle,
                    estimatedBudget,
                    contractEstimatedBudget,
                    projectName: projectData.projectName,
                    createdVia: 'TC15_E2E_FinalizeBidUIFlow',
                    createdAt: new Date().toISOString(),
                },
                null,
                2
            )
        );

        Logger.step('TC258: Jobs menu contract grid + finalize (TC47_NEW_UI)');
        await projectJob.runTc47NewUiContractFinalize(projectData);

        Logger.success('TC258: Full chain completed');
    });
});
