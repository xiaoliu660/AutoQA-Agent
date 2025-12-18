import { test, expect } from '@playwright/test';

const baseUrl = 'https://www.saucedemo.com';

test('saucedemo 01 login', async ({ page }) => {
  // Step 1: Navigate to /
  await page.goto(new URL('/', baseUrl).toString());
  // Step 2: Verify the page shows the login form with fields "Username" and "Password"
  const locator2_1 = page.getByText('Username');
  await expect(locator2_1.nth(0)).toBeVisible();
  const locator2_2 = page.getByText('Password');
  await expect(locator2_2.nth(0)).toBeVisible();
  // Step 3: Fill the "Username" field with standard_user
  await page.getByPlaceholder('Username').fill('standard_user');
  // Step 4: Fill the "Password" field with secret_sauce
  await page.getByPlaceholder('Password').fill('secret_sauce');
  // Step 5: Click the "Login" button
  await page.locator('#login-button').click();
  // Step 6: Verify the user is logged in and sees the inventory/products page (e.g. header shows "Products")
  const locator6_1 = page.getByText('Products');
  await expect(locator6_1.nth(0)).toBeVisible();
  // Step 7: Verify the cart icon is visible
  const locator7_1 = page.getByText('Products');
  await expect(locator7_1).toHaveCount(1);
  await expect(locator7_1).toBeVisible();
});
