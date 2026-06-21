import { test, expect } from "@playwright/test";
import translations from "../../../src/locales/translation_en.json" with { type: "json" };
import { characterSetupEn } from "../../characterSetupTestData";
import routes from "@/routes.json" with { type: "json" };

test.describe("new meeting flow", () => {
  test("creates a meeting and starts playback", async ({ page }) => {
    const validFoods = characterSetupEn.characters.slice(3, 6);
    expect(validFoods.length).toBeGreaterThanOrEqual(3);

    await page.goto("/");
    await expect(page).toHaveTitle(new RegExp(translations.council, "i"));

    await page.getByTestId("landing-go").click();

    await expect(page).toHaveURL(new RegExp(`/${routes.newMeeting}$`));
    await expect(page.getByText(new RegExp(translations.theissue, "i"))).toBeVisible();

    await page.getByTestId("topic-button").first().click();
    await page.getByRole("button", { name: new RegExp(translations.next, "i") }).click();

    await expect(page).toHaveURL(new RegExp(`/${routes.newMeeting}$`));
    await expect(page.getByText(new RegExp(translations.selectfoods.title, "i"))).toBeVisible();

    for (const food of validFoods) {
      await page.getByAltText(new RegExp(food.name, "i")).first().click();
    }

    const startButton = page.getByRole("button", { name: new RegExp(translations.start, "i") });
    await expect(startButton).toBeVisible();
    await startButton.click();

    await expect(page).toHaveURL(new RegExp(`/${routes.meeting}/\\d+`));

    await expect(page.getByTestId("audio-indicator")).toHaveAttribute("data-playing", "true", {
      timeout: 60_000,
    });

    const subtitle = page.getByTestId("subtitle-text");
    await expect(subtitle).toBeVisible();
    await expect(subtitle).not.toBeEmpty();

    await expect(page.getByText(translations.error.connection)).not.toBeVisible();
  });
});
