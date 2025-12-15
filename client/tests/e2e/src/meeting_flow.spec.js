import { test, expect } from '@playwright/test';
import translations from '../../../public/locales/en/translation.json' with { type: 'json' };
import foodsData from '../../../src/prompts/foods_en.json' with { type: 'json' };
import routes from '../../../src/routes.json' with { type: 'json' };

test('Full Meeting Flow', async ({ page }) => {
    // 1. Go to Landing Page
    await page.goto('/');
    await expect(page).toHaveTitle(new RegExp(translations.council, 'i'));

    // 2. Click Continue (Let's Go!)
    // Using loose matching for the button text based on translation
    await page.getByRole('button', { name: new RegExp(translations.go, 'i') }).click({ force: true });

    // 3. Select Topic
    await expect(page).toHaveURL(new RegExp(routes.topics));
    // Wait for page to be ready - "THE ISSUE" equivalent
    await expect(page.getByText(new RegExp(translations.theissue, 'i'))).toBeVisible();

    // Select a topic - we use the data-testid added to the buttons
    await page.getByTestId('topic-button').first().click({ force: true });


    // Click Next
    await page.getByRole('button', { name: new RegExp(translations.next, 'i') }).click({ force: true });

    // 4. Select Foods
    await expect(page).toHaveURL(new RegExp(routes.foods));
    // Wait for "THE FOODS" title equivalent
    await expect(page.getByText(new RegExp(translations.selectfoods.title, 'i'))).toBeVisible();

    // Dynamically select foods from foods_en.json
    // We need 2 foods.
    // User requested to filter out the first 3 items to be safe against ID changes/special characters at start.
    // We assume the list has enough items.
    const validFoods = foodsData.foods.slice(3);
    const food1 = validFoods[0];
    const food2 = validFoods[1];

    // Select Food 1
    const food1Img = page.getByAltText(new RegExp(food1.name, 'i'), { exact: false });
    // Use first() in case multiple images match (e.g. in descriptions) although AltText usually unique per img.
    // To be safe:
    await food1Img.first().click({ force: true });

    // Select Food 2
    const food2Img = page.getByAltText(new RegExp(food2.name, 'i'), { exact: false });
    await food2Img.first().click({ force: true });

    // Click Start
    const startButton = page.getByRole('button', { name: new RegExp(translations.start, 'i') });
    await expect(startButton).toBeVisible();
    await startButton.click({ force: true });

    // 5. Meeting
    await expect(page).toHaveURL(new RegExp(routes.meeting));

    // Verify Text Output
    // Verify Audio is playing
    await expect(page.getByTestId('audio-indicator')).toHaveAttribute('data-playing', 'true', { timeout: 60000 });

    // Verify Subtitle is displayed
    const subtitle = page.getByTestId('subtitle-text');
    await expect(subtitle).toBeVisible();
    await expect(subtitle).not.toBeEmpty();

    // Ensure no connection error (using translation for error title)
    await expect(page.getByText(translations.error.connection)).not.toBeVisible();
});
