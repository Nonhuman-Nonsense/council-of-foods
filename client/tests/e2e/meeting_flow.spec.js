import { test, expect } from '@playwright/test';

test('Full Meeting Flow', async ({ page }) => {
    // 1. Go to Landing Page
    await page.goto('/');
    await expect(page).toHaveTitle(/Council/i);

    // 2. Click Continue (Let's Go!)
    // Using partial match for "Let's go"
    await page.getByRole('button', { name: /Let's go/i }).click({ force: true });

    // 3. Select Topic
    await expect(page).toHaveURL(/\/topics/);
    // Wait for page to be ready
    await expect(page.getByText(/THE ISSUE/i)).toBeVisible();

    // Select "Biodiversity Loss" or any other known topic
    // Using force: true to bypass potential overlay issues
    await page.getByRole('button', { name: /Biodiversity Loss/i }).click({ force: true });

    // Click Next
    await page.getByRole('button', { name: /Next/i }).click({ force: true });

    // 4. Select Foods
    await expect(page).toHaveURL(/\/foods/);
    // Wait for "The Foods" title
    await expect(page.getByText(/THE FOODS/i)).toBeVisible();

    // Select Potato and Tomato (Standard foods)
    const potatoImg = page.getByAltText(/Potato/i);
    const tomatoImg = page.getByAltText(/Tomato/i);

    await potatoImg.click({ force: true });
    await tomatoImg.click({ force: true });

    // Click Start
    const startButton = page.getByRole('button', { name: /Start/i });
    await expect(startButton).toBeVisible();
    await startButton.click({ force: true });

    // 5. Meeting
    await expect(page).toHaveURL(/\/meeting\//);

    // Verify Text Output
    // Verify Audio is playing (checked via our data-playing attribute)
    await expect(page.getByTestId('audio-indicator')).toHaveAttribute('data-playing', 'true', { timeout: 60000 });

    // Verify Subtitle is displayed (checked via data-testid) and has some length
    const subtitle = page.getByTestId('subtitle-text');
    await expect(subtitle).toBeVisible();
    await expect(subtitle).not.toBeEmpty();

    // Ensure no connection error
    await expect(page.getByText('Connection Error')).not.toBeVisible();
});
